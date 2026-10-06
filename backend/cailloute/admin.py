"""Outils locaux d'administration ; nécessite l'accès au serveur et à sa base."""
import argparse,json,uuid
from getpass import getpass
from sqlalchemy import select,delete
from .db import *
from .main import write_lock,remove_photo
from .security import password_hash

def main():
    parser=argparse.ArgumentParser(description='Administration Cailloute')
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('reports')
    grant=sub.add_parser('grant-admin');grant.add_argument('username')
    history=sub.add_parser('history');history.add_argument('place_id')
    reset=sub.add_parser('reset-password');reset.add_argument('username')
    resolve=sub.add_parser('resolve');resolve.add_argument('report_id');resolve.add_argument('--action',choices=['dismiss','hide-place','delete-review','delete-photo'],required=True)
    restore=sub.add_parser('restore-place');restore.add_argument('place_id')
    unmerge=sub.add_parser('undo-merge');unmerge.add_argument('audit_id',type=int)
    args=parser.parse_args();init()
    with Session.begin() as s:
        if args.command in ('reports','history'):
            rows=s.scalars(select(Report).where(Report.status=='open')) if args.command=='reports' else s.scalars(select(Audit).where(Audit.place_id==args.place_id).order_by(Audit.id.desc()))
            for r in rows:print(json.dumps({c.name:getattr(r,c.name) for c in r.__table__.columns},ensure_ascii=False))
            return
        write_lock(s)
        if args.command=='grant-admin':
            u=s.scalar(select(User).where(User.username==args.username.lower()))
            if not u:raise SystemExit('Compte introuvable')
            u.role='admin';print('Compte administrateur activé. Se reconnecter dans l’application.');return
        if args.command=='reset-password':
            u=s.scalar(select(User).where(User.username==args.username.lower()))
            if not u:raise SystemExit('Compte introuvable')
            password=getpass('Nouveau mot de passe (10 caractères minimum) : ')
            if len(password)<10 or password!=getpass('Confirmer : '):raise SystemExit('Mot de passe trop court ou confirmation différente')
            u.password=password_hash(password);s.execute(delete(Token).where(Token.user_id==u.id));print('Mot de passe remplacé, sessions révoquées.');return
        if args.command=='undo-merge':
            audit=s.get(Audit,args.audit_id)
            if not audit or audit.kind!='place.merge':raise SystemExit('Fusion de lieux introuvable ; seules les fusions place.merge sont réversibles ici.')
            d=audit.data;source=s.get(Place,d['from']);target=s.get(Place,audit.place_id)
            if not source or not target or source.data.get('redirect')!=target.id:raise SystemExit('Fusion déjà annulée ou modifiée.')
            if target.override or s.query(Review).filter_by(place_id=target.id).first() or s.query(Photo).filter_by(place_id=target.id).first():raise SystemExit('Des enrichissements existent depuis la fusion : répartition manuelle nécessaire.')
            for key in d['source_keys']:
                r=s.get(SourceRecord,key)
                if not r or r.place_id!=target.id:raise SystemExit('Sources modifiées depuis la fusion.')
                r.place_id=source.id
            source.data=d['before_source'];source.version+=1;target.data=d['before_target'];target.version+=1;emit(s,source);emit(s,target)
            s.add(Audit(user_id='admin',place_id=target.id,kind='place.unmerge',created=now(),data={'audit_id':audit.id}));print('Fusion annulée.');return
        if args.command=='restore-place':
            p=s.get(Place,args.place_id)
            if not p:raise SystemExit('Lieu introuvable')
            p.data={**p.data,'hidden':False};p.override={**p.override,'deleted':False};p.version+=1;emit(s,p);print('Lieu rétabli.');return
        report=s.get(Report,args.report_id)
        if not report:raise SystemExit('Signalement introuvable')
        p=s.get(Place,report.place_id)
        if args.action=='hide-place':
            p.data={**p.data,'hidden':True};p.version+=1;emit(s,p)
        elif args.action=='delete-review':
            r=s.get(Review,report.data.get('review_id',''))
            if not r or r.place_id!=p.id:raise SystemExit('Avis ciblé introuvable')
            s.execute(delete(Vote).where(Vote.review_id==r.id));s.delete(r);update_rating(s,p)
        elif args.action=='delete-photo':
            photo=s.get(Photo,report.data.get('photo_id',''))
            if not photo or photo.place_id!=p.id:raise SystemExit('Photo ciblée introuvable')
            remove_photo(photo.id);s.delete(photo)
        report.status='resolved';s.add(Audit(user_id='admin',place_id=report.place_id,kind='moderation',created=now(),data={'report_id':report.id,'action':args.action}));print('Signalement traité.')
if __name__=='__main__':main()
