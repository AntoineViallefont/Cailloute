from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field,StrictBool
from sqlalchemy import select,delete
from .db import *
from .security import current_user
TERMS_VERSION='2026-09-16.2'
router=APIRouter()
def credit(s,user_id,place_id,kind):
    if s.get(ContributionCredit,(user_id,place_id,kind)):return
    if kind=='edited' and s.get(ContributionCredit,(user_id,place_id,'added')):return
    stats=s.get(ContributionStats,user_id)
    if not stats:stats=ContributionStats(user_id=user_id,added=0,edited=0);s.add(stats)
    setattr(stats,kind,getattr(stats,kind)+1)
    s.add(ContributionCredit(user_id=user_id,place_id=place_id,kind=kind))

@router.get('/v1/me/rewards')
def rewards(u=Depends(current_user)):
    with Session() as s:
        stats=s.get(ContributionStats,u.id)
        return {'added':stats.added if stats else 0,'edited':stats.edited if stats else 0}

class TermsInput(BaseModel):
    version:str=Field(max_length=20)
    adult:StrictBool
@router.post('/v1/me/terms')
def terms(data:TermsInput,u=Depends(current_user)):
    if data.version!=TERMS_VERSION or not data.adult:raise HTTPException(422,'Acceptez les conditions actuelles et confirmez être majeur.')
    with Session.begin() as s:s.merge(TermsAcceptance(user_id=u.id,version=data.version))
    return {'ok':True}

def require_terms(s,u):
    acceptance=s.get(TermsAcceptance,u.id)
    if not acceptance or acceptance.version!=TERMS_VERSION:raise HTTPException(428,'Acceptez les conditions dans Profil avant de publier.')

def erase_place(s,p,remove_photo):
    """Efface les contenus ; l'exclusion ne contient qu'un identifiant technique."""
    ident=p.id
    # Les redirections et sources liées à une fusion sont également exclues.
    redirects={r.id:r.data.get('redirect') for r in s.scalars(select(Place)) if r.data.get('redirect')}
    selected={ident}
    while True:
        linked={key for key,target in redirects.items() if target in selected}
        if linked<=selected:break
        selected|=linked
    ids=list(selected)
    import hashlib
    for source in s.scalars(select(SourceRecord).where(SourceRecord.place_id.in_(ids))):s.merge(ExcludedPlace(id='source:'+hashlib.sha256(source.key.encode()).hexdigest()))
    for photo in s.scalars(select(Photo).where(Photo.place_id.in_(ids))):remove_photo(photo.id)
    review_ids=select(Review.id).where(Review.place_id.in_(ids))
    s.execute(delete(Vote).where(Vote.review_id.in_(review_ids)))
    for table in (Review,Photo,Favorite,SourceRecord,Audit,ContributionCredit):
        s.execute(delete(table).where(table.place_id.in_(ids)))
    # Effacement de tous les anciens instantanés ; le curseur reste monotone.
    for row in s.scalars(select(Change).where(Change.place_id.in_(ids))):row.data={'id':row.place_id,'deleted':True}
    for report in s.scalars(select(Report)):
        if report.place_id in ids or any(i in ids for i in report.data.get('place_ids',[])):s.delete(report)
    for receipt in s.scalars(select(Receipt)):
        if receipt.result.get('place_id') in ids:receipt.result={'ok':True,'operation_id':receipt.id,'deleted':True}
    for row_id in ids:
        s.merge(ExcludedPlace(id=row_id))
        row=s.get(Place,row_id)
        if row:s.delete(row)
        s.add(Change(place_id=row_id,data={'id':row_id,'deleted':True}))

def limits_for(s,u):
    from datetime import datetime,timezone
    stats=s.get(ContributionStats,u.id)
    score=(stats.added*10+stats.edited*3) if stats else 0
    age=(datetime.now(timezone.utc)-datetime.fromisoformat(u.created)).total_seconds()/86400
    regular=age>=7 and score>=30
    return {'added':15 if regular else 5,'edited':30 if regular else 10,'deleted':5 if regular else 2}

def consume_limit(s,u,kind,count=1):
    from datetime import datetime
    from zoneinfo import ZoneInfo
    day=datetime.now(ZoneInfo('Europe/Paris')).date().isoformat()
    # Compteurs journaliers sans identifiant de lieu, rétention de 8 jours.
    cutoff=(datetime.now(ZoneInfo('Europe/Paris')).date()-__import__('datetime').timedelta(days=8)).isoformat()
    s.execute(delete(DailyActivity).where(DailyActivity.day<cutoff))
    row=s.get(DailyActivity,(u.id,day,kind));used=row.count if row else 0
    if u.role != 'admin' and used+count>limits_for(s,u)[kind]:raise HTTPException(429,'Limite quotidienne atteinte. Réessayez demain (heure de Paris).')
    if row:row.count+=count
    else:s.add(DailyActivity(user_id=u.id,day=day,kind=kind,count=count))

@router.get('/v1/me/limits')
def limits(u=Depends(current_user)):
    with Session() as s:return limits_for(s,u)

def automatic_report_guard(s,p,u,data):
    """Trois comptes établis distincts déclenchent un masquage, sans vote anonyme."""
    from datetime import datetime,timedelta,timezone
    if not data.get('photo_id') and not data.get('review_id'):target='place'
    else:target='photo' if data.get('photo_id') else 'review'
    ident=data.get(target+'_id',p.id)
    if target=='photo':row=s.get(Photo,ident)
    elif target=='review':row=s.get(Review,ident)
    else:row=p
    if not row or (target!='place' and row.place_id!=p.id):raise HTTPException(404,'Contenu introuvable.')
    if target!='place' and row.user_id==u.id:raise HTTPException(422,'Supprimez directement votre propre contenu.')
    consume_limit(s,u,'edited')
    # Les avis restent visibles jusqu’à la décision explicite de l’éditeur.
    if target=='review':return
    s.flush()
    cutoff=(datetime.now(timezone.utc)-timedelta(days=7)).isoformat()
    voters=set()
    for report in s.scalars(select(Report).where(Report.place_id==p.id,Report.created>=cutoff,Report.status=='open')):
        if report.data.get('kind')=='user.report':continue
        matches=(not report.data.get('review_id') and not report.data.get('photo_id')) if target=='place' else report.data.get(target+'_id')==ident
        author=s.get(User,report.user_id)
        if matches and author and limits_for(s,author)['deleted']==5:voters.add(author.id)
    if len(voters)>=3:
        if target=='place':p.override={**p.override,'hidden':True};p.version+=1;emit(s,p)
        else:
            cache_key='moderation:'+target+':'+ident
            s.merge(Cache(key=cache_key,data={'hidden':True},expires=0))
    return len(voters)

def content_hidden(s,kind,ident):
    if kind=='review':return False
    return s.get(Cache,'moderation:'+kind+':'+ident) is not None
