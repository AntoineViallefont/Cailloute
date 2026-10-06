import base64, hashlib, io, json, os, re, secrets, time, uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal
import httpx
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import FastAPI, Depends, HTTPException, Query, Request, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel, Field, ConfigDict, StrictBool, ValidationError, field_validator
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select, delete, func, text
from sqlalchemy.exc import IntegrityError
from .db import *
from .geo import in_scope, distance, CENTER, LABELS
from .security import current_user, password_hash, password_ok, issue, rate

PRODUCTION = os.getenv('ENVIRONMENT') == 'production'
BUCKET = os.getenv('PHOTO_BUCKET', '')
if PRODUCTION and not BUCKET: raise RuntimeError('Configurer PHOTO_BUCKET pour les photos persistantes.')
@asynccontextmanager
async def lifespan(app):
    init(); yield
app=FastAPI(title='Cailloute',version='0.1.22',lifespan=lifespan)
app.add_middleware(GZipMiddleware,minimum_size=1000)
app.add_middleware(CORSMiddleware,allow_origins=os.getenv('CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173,http://127.0.0.1:5187,http://localhost:5187,https://localhost,http://localhost').split(','),allow_methods=['GET','POST','DELETE'],allow_headers=['Authorization','Content-Type'])

@app.middleware('http')
async def security_headers(request, call_next):
    if int(request.headers.get('content-length','0') or 0)>4_000_000: return Response('Fichier trop volumineux',status_code=413)
    response=await call_next(request)
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='no-referrer'
    response.headers['Cache-Control']='no-store'
    return response

def write_lock(s):
    # Le verrou global garantit que le curseur ne saute pas une transaction non validée.
    if engine.dialect.name=='postgresql': s.execute(text('SELECT pg_advisory_xact_lock(76231001)'))
    else: s.execute(text('BEGIN IMMEDIATE'))

class Credentials(BaseModel):
    username: str=Field(min_length=3,max_length=40,pattern=r'^[\w. -]+$')
    password: str=Field(min_length=10,max_length=128)

@app.exception_handler(RequestValidationError)
@app.exception_handler(ValidationError)
async def invalid_payload(request, exc):
    return JSONResponse(status_code=422,content={'detail':'Vérifiez les champs saisis (nom, coordonnées et équipements).'})

@app.get('/health')
def health():
    with Session() as s: return {'status':'ok','app':'Cailloute','places':s.scalar(select(func.count(Place.id)).where(Place.data['redirect'].as_string().is_(None))),'version':'0.1.19'}

@app.post('/v1/auth/register')
def register(c: Credentials, request: Request):
    if PRODUCTION:raise HTTPException(403,'Créez votre compte avec un e-mail vérifié, Google ou Facebook.')
    rate('auth:'+request.client.host,10,60)
    with Session.begin() as s:
        username=c.username.strip().lower()
        if len(username)<3: raise HTTPException(422,'Pseudonyme trop court.')
        if s.scalar(select(User).where(User.username==username)): raise HTTPException(409,'Ce pseudonyme est déjà utilisé.')
        u=User(id=uuid.uuid4().hex,username=username,password=password_hash(c.password),created=now(),role='member'); s.add(u); s.flush()
        return issue(s,u)

@app.post('/v1/auth/login')
def login(c: Credentials, request: Request):
    rate('auth:'+request.client.host,10,60)
    with Session.begin() as s:
        u=s.scalar(select(User).where(User.username==c.username.strip().lower()))
        valid=password_ok(c.password,u.password) if u else password_ok(c.password,password_hash(secrets.token_hex(16)))
        if not u or not valid: raise HTTPException(401,'Pseudonyme ou mot de passe incorrect.')
        return issue(s,u)

@app.get('/v1/me')
def me(u=Depends(current_user)):
    with Session() as s:
        return {'id':u.id,'username':u.username,'role':u.role,'moderation':account_status(s,u),'terms_version':(s.get(TermsAcceptance,u.id).version if s.get(TermsAcceptance,u.id) else ''),'favorites':list(s.scalars(select(Favorite.place_id).where(Favorite.user_id==u.id)))}

@app.post('/v1/auth/logout')
def logout(u=Depends(current_user),authorization:str=Header()):
    with Session.begin() as s: s.execute(delete(Token).where(Token.hash==hashlib.sha256(authorization[7:].encode()).hexdigest()))
    return {'ok':True}

def visible(data): return not data.get('hidden') and not data.get('deleted') and (not PRODUCTION or data.get('license_verified',False) or data.get('community',False))
@app.get('/v1/bootstrap')
def bootstrap(after:str=Query('',max_length=100),limit:int=Query(1000,ge=1,le=1500)):
    with Session() as s:
        revision=s.scalar(select(func.max(Change.id))) or 0
        rows=s.scalars(select(Place).where(Place.id>after).order_by(Place.id).limit(limit+1)).all()
        page=rows[:limit]
        return {'revision':revision,'after':page[-1].id if page else after,'has_more':len(rows)>limit,'places':[public_place(p) for p in page if visible(public_place(p))]}

@app.get('/v1/sync')
def sync(cursor:int=Query(0,ge=0),limit:int=Query(500,ge=1,le=1500)):
    with Session() as s:
        rows=s.scalars(select(Change).where(Change.id>cursor).order_by(Change.id).limit(limit+1)).all()
        page=rows[:limit]
        return {'cursor':page[-1].id if page else cursor,'has_more':len(rows)>limit,'changes':[{'revision':r.id,'place':r.data if visible(r.data) else {'id':r.place_id,'deleted':True}} for r in page],'server_time':now()}

@app.get('/v1/places/{ident}')
def detail(ident:str,sort:Literal['recent','relevant']='relevant'):
    with Session() as s:
        p=s.get(Place,ident)
        if p and p.data.get('redirect'): p=s.get(Place,p.data['redirect'])
        if not p or not visible(public_place(p)): raise HTTPException(404,'Lieu introuvable.')
        reviews=[r for r in s.scalars(select(Review).where(Review.place_id==p.id)) if not content_hidden(s,'review',r.id)]
        users={u.id:u.username for u in s.scalars(select(User).where(User.id.in_([r.user_id for r in reviews])))} if reviews else {}
        votes={r.id:list(s.scalars(select(Vote.user_id).where(Vote.review_id==r.id,Vote.value==1))) for r in reviews}
        downvotes={r.id:list(s.scalars(select(Vote.user_id).where(Vote.review_id==r.id,Vote.value==-1))) for r in reviews}
        rr=[{'id':r.id,'user_id':r.user_id,'author':users.get(r.user_id,'Compte supprimé'),'stars':r.stars,'text':r.text,'created':r.created,'updated':r.updated,'votes':len(votes[r.id]),'voters':votes[r.id],'downvotes':len(downvotes[r.id]),'downvoters':downvotes[r.id]} for r in reviews]
        rr.sort(key=lambda x:(x['votes']-x['downvotes'] if sort=='relevant' else 0,x['created']),reverse=True)
        photos=[x for x in s.scalars(select(Photo).where(Photo.place_id==p.id).order_by(Photo.created.desc())) if not content_hidden(s,'photo',x.id)]
        photo_authors={u.id:u.username for u in s.scalars(select(User).where(User.id.in_([x.user_id for x in photos])))} if photos else {}
        return {**public_place(p),'reviews':rr,'photos':[{'id':x.id,'url':f'/v1/photos/{x.id}','caption':x.caption,'user_id':x.user_id,'author':photo_authors.get(x.user_id,'Compte supprimé'),'created':x.created} for x in photos]}

class PlaceInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    name:str=Field(min_length=2,max_length=160)
    category:Literal['other','playground','toilet','water','baby_shop','food_shop','health','child_activity','transit','changing_table']
    lat:float=Field(ge=-90,le=90,allow_inf_nan=False)
    lon:float=Field(ge=-180,le=180,allow_inf_nan=False)
    address:str=Field('',max_length=300)
    city:str=Field('',max_length=100)
    hours:str=Field('',max_length=300)
    description:str=Field('',max_length=2000)
    age:str=Field('',max_length=80)
    website:str=Field('',max_length=1000)
    activity_type:str=Field('',max_length=100)
    health_type:Literal['','doctor','pharmacy','emergency']=''
    pediatric:StrictBool|None=None
    organic:StrictBool|None=None
    toilet_public:StrictBool|None=None
    baby_food:StrictBool|None=None
    children_clothes:StrictBool|None=None

    @field_validator('website')
    @classmethod
    def valid_website(cls, value):
        from urllib.parse import urlsplit
        value=value.strip()
        if value:
            if any(c.isspace() for c in value):raise ValueError('Lien web invalide')
            if not re.match(r'^https?://',value,re.I):
                if re.match(r'^[a-z][a-z0-9+.-]*:',value,re.I):raise ValueError('Lien web invalide')
                value='https://'+value
            u=urlsplit(value)
            if u.scheme not in ('http','https') or not u.hostname or '.' not in u.hostname or u.username or u.password:
                raise ValueError('Lien web invalide')
        return value

    access:Literal['public','private','customers','permissive','unknown']='unknown'
    wheelchair:StrictBool|None=None
    changing_table:StrictBool|None=None
    toilets_available:StrictBool|None=None
    transit_modes:list[Literal["metro","tram","bus","train","ferry","cable"]]=Field(default_factory=list,max_length=6)
    transit_lines:list[str]=Field(default_factory=list,max_length=80)
    drinking_water:StrictBool|None=None
    free:StrictBool|None=None
    fenced:StrictBool|None=None
    elevator:StrictBool|None=None
    shade:StrictBool|None=None
    shelter:StrictBool|None=None
    bench:StrictBool|None=None
    condition:Literal["unknown","open","temporary_closed","unavailable"]="unknown"

class Operation(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:uuid.UUID
    kind:Literal['place.create','place.edit','place.validate','place.delete','review.save','review.delete','review.vote','photo.add','photo.delete','favorite.set','report.create']
    place_id:str=Field(max_length=100)
    base_version:int|None=None
    payload:dict=Field(default_factory=dict)

def required_text(d,key,max_length):
    v=d.get(key,'')
    if not isinstance(v,str) or len(v)>max_length: raise HTTPException(422,f'Champ {key} invalide.')
    return v.strip()

def photo_bytes(encoded):
    try:
        raw=base64.b64decode(encoded,validate=True)
        if len(raw)>2_500_000: raise ValueError()
        Image.MAX_IMAGE_PIXELS=20_000_000
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in ('JPEG','PNG','WEBP') or image.width*image.height>20_000_000: raise ValueError()
            image=ImageOps.exif_transpose(image).convert('RGB'); image.thumbnail((960,960))
            # Réencoder sans EXIF : WebP sous 40 000 octets.
            for _ in range(12):
                for quality in range(92,44,-4):
                    out=io.BytesIO(); image.save(out,format='WEBP',quality=quality,method=6)
                    if out.tell()<=40_000: return out.getvalue()
                image=image.resize((max(1,round(image.width*.8)),max(1,round(image.height*.8))),Image.Resampling.LANCZOS)
            raise ValueError('Compression impossible')
    except Exception as e: raise HTTPException(422,'Photo invalide ou trop volumineuse (JPEG, PNG, WebP).') from e

def store_photo(ident,data):
    if BUCKET:
        from google.cloud import storage
        storage.Client().bucket(BUCKET).blob(ident+'.webp').upload_from_string(data,content_type='image/webp')
    else:
        (DATA/'photos').mkdir(exist_ok=True); (DATA/'photos'/f'{ident}.webp').write_bytes(data)
def remove_photo(ident):
    if BUCKET:
        from google.cloud import storage
        from google.api_core.exceptions import NotFound
        bucket=storage.Client().bucket(BUCKET)
        for extension in ('webp','jpg'):
            try: bucket.blob(ident+'.'+extension).delete()
            except NotFound: pass
    else:
        for extension in ('webp','jpg'): (DATA/'photos'/f'{ident}.{extension}').unlink(missing_ok=True)

@app.get('/v1/photos/{ident}')
def get_photo(ident:str):
    with Session() as s:
        photo=s.get(Photo,ident)
        if not re.fullmatch('[a-f0-9]{32}',ident) or not photo or content_hidden(s,'photo',ident): raise HTTPException(404)
        p=s.get(Place,photo.place_id)
        if not p or not visible(public_place(p)): raise HTTPException(404)
    if BUCKET:
        from google.cloud import storage
        from google.api_core.exceptions import NotFound
        bucket=storage.Client().bucket(BUCKET)
        try: data=bucket.blob(ident+'.webp').download_as_bytes()
        except NotFound:
            try: old=bucket.blob(ident+'.jpg').download_as_bytes()
            except NotFound: raise HTTPException(404)
            data=photo_bytes(base64.b64encode(old).decode())
            store_photo(ident,data)
    else:
        path=DATA/'photos'/f'{ident}.webp'
        if not path.exists():
            previous=DATA/'photos'/f'{ident}.jpg'
            if not previous.exists(): raise HTTPException(404)
            data=photo_bytes(base64.b64encode(previous.read_bytes()).decode())
            store_photo(ident,data)
        else: data=path.read_bytes()
    return Response(data,media_type='image/webp')

@app.post('/v1/operations')
def operation(op:Operation,u=Depends(current_user)):
    rate('write:'+u.id,90,60)
    with Session.begin() as s:
        write_lock(s)
        previous=s.get(Receipt,str(op.id))
        if previous:
            if previous.user_id!=u.id: raise HTTPException(409,'Identifiant d’opération déjà utilisé.')
            return previous.result
        if op.kind not in ('favorite.set','report.create'):
            require_contribution_access(s,u)
            require_terms(s,u)
        p=s.get(Place,op.place_id)
        if p and p.data.get('redirect'): p=s.get(Place,p.data['redirect'])
        d=op.payload; kind=op.kind
        if kind=='place.create':
            if p or s.get(ExcludedPlace,op.place_id): raise HTTPException(409,'Ce lieu existe déjà ou a été supprimé.')
            consume_limit(s,u,'added')
            data=PlaceInput.model_validate(d).model_dump()
            if not in_scope(data['lat'],data['lon']): raise HTTPException(422,'Choisissez un lieu en France métropolitaine ou en Corse.')
            p=Place(id=op.place_id,version=1,override={},data={**data,'community':True,'license_verified':True,'sources':[],'rating':None,'review_count':0,'information_validated':True,'validated_at':now(),'verified_at':now(),'created_by':u.id,'condition_observed_at':now() if data.get('condition')!='unknown' else None})
            s.add(p); emit(s,p); credit(s,u.id,p.id,'added')
        else:
            if not p or not visible(public_place(p)): raise HTTPException(404,'Lieu introuvable.')
            if kind=='place.edit':
                consume_limit(s,u,'edited')
                data=PlaceInput.model_validate(d).model_dump()
                if not in_scope(data['lat'],data['lon']): raise HTTPException(422,'Lieu hors périmètre.')
                if op.base_version!=p.version:
                    # Le client conserve la proposition dans sa file et propose une comparaison.
                    raise HTTPException(409,{'message':'Lieu modifié depuis votre lecture. Comparez votre proposition à la version actuelle.','current':public_place(p),'proposed':data})
                credit(s,u.id,p.id,'edited')
                p.override={**p.override,**data,'information_validated':True,'validated_at':now(),'validation_changed_at':now(),'verified_at':now(),'verified_by':u.username,'condition_observed_at':now() if data.get('condition')!=public_place(p).get('condition','unknown') else public_place(p).get('condition_observed_at')}; p.version+=1; emit(s,p)
            elif kind=='place.delete':
                ids=d.get('place_ids',[p.id])
                if not isinstance(ids,list) or not ids or len(ids)>100 or not all(isinstance(i,str) for i in ids) or p.id not in ids:
                    raise HTTPException(422,'Liste de lieux invalide.')
                ids=list(dict.fromkeys(ids))
                targets=[s.get(Place,i) for i in ids]
                if any(not target or not visible(public_place(target)) for target in targets): raise HTTPException(404,'Lieu introuvable.')
                consume_limit(s,u,'deleted',len(ids))
                result={'ok':True,'deleted':True,'operation_id':str(op.id)}
                for target in targets: erase_place(s,target,remove_photo)
                s.add(Receipt(id=str(op.id),user_id=u.id,result=result))
                return result
            elif kind=='place.validate':
                if type(d.get('value'))!=bool: raise HTTPException(422,'Validation invalide.')
                if op.base_version!=p.version: raise HTTPException(409,'La fiche a changé. Relisez-la avant de valider.')
                stamp=now()
                change={'information_validated':d['value'],'validation_changed_at':stamp}
                if d['value']: change['validated_at']=stamp
                consume_limit(s,u,'edited')
                p.override={**p.override,**change}; p.version+=1; emit(s,p)
            elif kind=='review.save':
                stars=d.get('stars')
                if type(stars)!=int or not 1<=stars<=5: raise HTTPException(422,'La note doit être comprise entre 1 et 5.')
                comment=required_text(d,'text',3000)
                r=s.scalar(select(Review).where(Review.place_id==p.id,Review.user_id==u.id))
                if r: r.stars=stars; r.text=comment; r.updated=now()
                else: s.add(Review(id=uuid.uuid4().hex,place_id=p.id,user_id=u.id,stars=stars,text=comment,created=now(),updated=now()))
                update_rating(s,p)
            elif kind in ('review.delete','review.vote'):
                r=s.get(Review,d.get('review_id',''))
                if not r or r.place_id!=p.id: raise HTTPException(404,'Avis introuvable.')
                if kind=='review.delete':
                    if r.user_id!=u.id and u.role!='admin': raise HTTPException(403)
                    s.execute(delete(Vote).where(Vote.review_id==r.id)); s.delete(r); update_rating(s,p)
                else:
                    if r.user_id==u.id: raise HTTPException(422,'Vous ne pouvez pas voter pour votre propre avis.')
                    value=d.get('value')
                    # Anciennes files hors ligne : true=utile, false=retirer le vote.
                    if type(value)==bool: value=int(value)
                    if type(value)!=int or value not in (-1,0,1): raise HTTPException(422,'Vote invalide.')
                    v=s.get(Vote,(r.id,u.id))
                    if value==0:
                        if v: s.delete(v)
                    elif v: v.value=value
                    else: s.add(Vote(review_id=r.id,user_id=u.id,value=value))
            elif kind=='photo.add':
                if d.get('privacy_reviewed') is not True or d.get('rights_accepted') is not True:raise HTTPException(422,'Confirmez les droits et la vérification du masquage de la photo.')
                caption=required_text(d,'caption',300); encoded=required_text(d,'base64',3_500_000)
                ident=op.id.hex; store_photo(ident,photo_bytes(encoded))
                s.add(Photo(id=ident,place_id=p.id,user_id=u.id,caption=caption,created=now())); update_photo_count(s,p)
            elif kind=='photo.delete':
                photo=s.get(Photo,d.get('photo_id',''))
                if not photo or photo.place_id!=p.id: raise HTTPException(404)
                consume_limit(s,u,'deleted')
                remove_photo(photo.id); s.delete(photo); update_photo_count(s,p)
            elif kind=='favorite.set':
                if type(d.get('value'))!=bool: raise HTTPException(422,'Favori invalide.')
                f=s.get(Favorite,(u.id,p.id))
                if d['value'] and not f: s.add(Favorite(user_id=u.id,place_id=p.id))
                elif not d['value'] and f: s.delete(f)
            elif kind=='report.create':
                reason=required_text(d,'reason',1500)
                if len(reason)<5: raise HTTPException(422,'Précisez le motif du signalement.')
                category=d.get('category','other')
                if category not in REPORT_REASONS:raise HTTPException(422,'Motif de signalement invalide.')
                if d.get('review_id') and d.get('photo_id'):raise HTTPException(422,'Sélectionnez un seul contenu.')
                if d.get('scope','content') not in ('content','author'):raise HTTPException(422,'Type de signalement invalide.')
                details={'reason':reason,'category':category,'review_id':d.get('review_id'),'photo_id':d.get('photo_id')}
                if d.get('scope')=='author':
                    target=s.get(Review,d['review_id']) if d.get('review_id') else s.get(Photo,d['photo_id']) if d.get('photo_id') else None
                    if not target or target.place_id!=p.id:raise HTTPException(404,'Contenu introuvable.')
                    if target.user_id==u.id:raise HTTPException(422,'Vous ne pouvez pas vous signaler vous-même.')
                    if not s.get(User,target.user_id):raise HTTPException(404,'Compte introuvable.')
                    consume_limit(s,u,'edited')
                    details.update(kind='user.report',target_user_id=target.user_id)
                s.add(Report(id=op.id.hex,user_id=u.id,place_id=p.id,data=details,created=now(),status='open'))
                if d.get('scope')!='author':automatic_report_guard(s,p,u,d)
        result={'ok':True,'place_id':p.id,'version':p.version,'operation_id':str(op.id)}
        s.add(Receipt(id=str(op.id),user_id=u.id,result=result)); return result

@app.delete('/v1/me')
def delete_account(u=Depends(current_user)):
    with Session.begin() as s:
        write_lock(s)
        reviews=s.scalars(select(Review).where(Review.user_id==u.id)).all(); affected={r.place_id for r in reviews}
        for r in reviews: s.execute(delete(Vote).where(Vote.review_id==r.id)); s.delete(r)
        photos=s.scalars(select(Photo).where(Photo.user_id==u.id)).all(); photo_places={p.place_id for p in photos}
        for photo in photos: remove_photo(photo.id); s.delete(photo)
        for ident in photo_places:
            parent=s.get(Place,ident)
            if parent: update_photo_count(s,parent)
        s.execute(delete(Vote).where(Vote.user_id==u.id)); s.execute(delete(Favorite).where(Favorite.user_id==u.id)); s.execute(delete(Receipt).where(Receipt.user_id==u.id))
        for p in s.scalars(select(Place)):
            changed=False
            if p.override.get('verified_by')==u.username:
                p.override={**p.override,'verified_by':'Compte supprimé'};changed=True
            if p.data.get('created_by')==u.id:
                p.data={**p.data,'created_by':'deleted'};changed=True
            if changed:p.version+=1;emit(s,p)
        for change in s.scalars(select(Change)):
            d=change.data
            if d.get('verified_by')==u.username or d.get('created_by')==u.id:
                change.data={**d,**({'verified_by':'Compte supprimé'} if d.get('verified_by')==u.username else {}),**({'created_by':'deleted'} if d.get('created_by')==u.id else {})}
        for a in s.scalars(select(Audit).where(Audit.user_id==u.id)): a.user_id='deleted'
        for r in s.scalars(select(Report).where(Report.user_id==u.id)): r.user_id='deleted'
        for ident in affected:
            p=s.get(Place,ident)
            if p: update_rating(s,p)
        identity_keys=set(s.scalars(select(Identity.key).where(Identity.user_id==u.id)))
        for challenge in s.scalars(select(AuthChallenge)):
            if challenge.data.get('identity') in identity_keys:s.delete(challenge)
        s.execute(delete(BlockedUser).where(BlockedUser.blocked_id==u.id))
        s.delete(s.get(User,u.id))
    return {'ok':True}

@app.get('/v1/geocode')
def geocode(q:str=Query(min_length=3,max_length=200)):
    with httpx.Client(timeout=15,follow_redirects=True) as c:
        try:
            r=c.get('https://data.geopf.fr/geocodage/search',params={'q':q,'limit':15,'lon':CENTER[1],'lat':CENTER[0]}); r.raise_for_status()
            results=[]
            for f in r.json().get('features',[]):
                lon,lat=f['geometry']['coordinates'][:2]
                if in_scope(lat,lon): results.append({'label':f['properties']['label'],'lat':lat,'lon':lon})
            return {'results':results[:8],'attribution':'BAN / IGN — Licence Ouverte'}
        except (httpx.HTTPError,ValueError,KeyError): raise HTTPException(503,'Recherche indisponible. Réessayez plus tard.')

@app.get('/v1/weather')
def weather(lat:float,lon:float):
    if not in_scope(lat,lon): raise HTTPException(422,'Hors périmètre.')
    lat=round(lat,2); lon=round(lon,2); key=f'weather:{lat}:{lon}'
    with Session() as s:
        cached=s.get(Cache,key)
        if cached and cached.expires>time.time(): return cached.data
    result={'temperature':None,'wind':None,'uv':None,'aqi':None,'code':None,'time':now(),'sources':'Open-Meteo · CAMS ENSEMBLE','errors':[]}
    with httpx.Client(timeout=15) as client:
        try:
            r=client.get(os.getenv('WEATHER_API','https://api.open-meteo.com/v1/forecast'),params={'latitude':lat,'longitude':lon,'current':'temperature_2m,weather_code,wind_speed_10m','hourly':'uv_index','forecast_days':1,'timezone':'UTC'});r.raise_for_status(); j=r.json(); current=j['current']; hour=datetime.now(timezone.utc).hour
            result.update(temperature=current.get('temperature_2m'),wind=current.get('wind_speed_10m'),code=current.get('weather_code'),uv=j.get('hourly',{}).get('uv_index',[None]*24)[hour],weather_time=current.get('time'))
        except (httpx.HTTPError,ValueError,KeyError,IndexError): result['errors'].append('Météo indisponible')
        try:
            r=client.get(os.getenv('AIR_API','https://air-quality-api.open-meteo.com/v1/air-quality'),params={'latitude':lat,'longitude':lon,'current':'european_aqi','timezone':'UTC'});r.raise_for_status(); j=r.json(); result.update(aqi=j['current'].get('european_aqi'),air_time=j['current'].get('time'))
        except (httpx.HTTPError,ValueError,KeyError): result['errors'].append('Qualité de l’air indisponible')
    with Session.begin() as s:
        s.merge(Cache(key=key,data=result,expires=int(time.time())+(900 if not result['errors'] else 60)))
    return result

@app.get('/v1/sources')
def sources():
    path=ROOT/'donnees/rapport_import.json'
    with Session() as s:
        cached=s.get(Cache,'import-report')
        report=cached.data if cached else (json.loads(path.read_text()) if path.exists() else {})
    return {'report':report,'attributions':['© contributeurs OpenStreetMap · ODbL 1.0','Métropole de Lyon · communes · SYTRAL','Fond de carte et vues aériennes : © IGN','Météo : Open-Meteo · qualité de l’air : CAMS ENSEMBLE'],'private_apps':'Mapikids : source OSM intégrée. ICI Toilettes et Toilet Finder : aucune base privée importée, réutilisation à convenir avec leurs éditeurs.'}


@app.get('/v1/deletion-requests')
def deletion_requests(u=Depends(current_user)):
    if u.role!='admin': raise HTTPException(403,'Réservé à l’administrateur.')
    with Session() as s:
        result=[]
        for report in s.scalars(select(Report).where(Report.status=='open').order_by(Report.created)):
            if report.data.get('kind')!='place.delete': continue
            places=[s.get(Place,i) for i in report.data.get('place_ids',[report.place_id])]
            author=s.get(User,report.user_id)
            result.append({'id':report.id,'author':author.username if author else 'Compte supprimé','created':report.created,'reason':report.data.get('reason',''),'places':[public_place(p) for p in places if p]})
        return {'requests':result}

class DeletionDecision(BaseModel):
    model_config=ConfigDict(extra='forbid')
    approve:StrictBool

@app.post('/v1/deletion-requests/{ident}/decision')
def decide_deletion(ident:str,decision:DeletionDecision,u=Depends(current_user)):
    if u.role!='admin': raise HTTPException(403,'Réservé à l’administrateur.')
    with Session.begin() as s:
        write_lock(s)
        report=s.get(Report,ident)
        if not report or report.data.get('kind')!='place.delete': raise HTTPException(404,'Demande introuvable.')
        status='approved' if decision.approve else 'rejected'
        if report.status!='open':
            if report.status==status: return {'ok':True,'status':status}
            raise HTTPException(409,'Cette demande a déjà été traitée.')
        for place_id in report.data.get('place_ids',[report.place_id]):
            p=s.get(Place,place_id)
            if not p: continue
            s.add(Audit(user_id=u.id,place_id=p.id,kind='place.delete.decision',created=now(),data={'report_id':ident,'approve':decision.approve,'before':p.override}))
            if decision.approve:
                erase_place(s,p,remove_photo)
        report.status=status
        return {'ok':True,'status':status}

@app.get('/v1/review-reports')
def review_reports(u=Depends(current_user)):
    if u.role!='admin': raise HTTPException(403,'Réservé à l’éditeur.')
    with Session() as s:
        reports=[]
        for report in s.scalars(select(Report).where(Report.status=='open').order_by(Report.created)):
            review=s.get(Review,report.data.get('review_id')) if report.data.get('review_id') else None
            if report.data.get('kind')=='user.report' or not review or review.place_id!=report.place_id:continue
            author=s.get(User,review.user_id);reporter=s.get(User,report.user_id);p=s.get(Place,review.place_id)
            reports.append({'id':report.id,'created':report.created,'reason':report.data.get('reason',''),'reporter':reporter.username if reporter else 'Compte supprimé','place_name':public_place(p).get('name','Lieu') if p else 'Lieu supprimé','review':{'id':review.id,'text':review.text,'stars':review.stars,'updated':review.updated,'author':author.username if author else 'Compte supprimé'}})
        return {'reports':reports}

class ReviewDecision(BaseModel):
    model_config=ConfigDict(extra='forbid')
    approve:StrictBool
    review_updated:str=Field(max_length=80)

@app.post('/v1/review-reports/{ident}/decision')
def decide_review(ident:str,decision:ReviewDecision,u=Depends(current_user)):
    if u.role!='admin':raise HTTPException(403,'Réservé à l’éditeur.')
    with Session.begin() as s:
        write_lock(s)
        report=s.get(Report,ident)
        if not report or not report.data.get('review_id') or report.data.get('kind')=='user.report':raise HTTPException(404,'Signalement introuvable.')
        status='approved' if decision.approve else 'rejected'
        if report.status!='open':
            if report.status==status:return {'ok':True,'status':status}
            raise HTTPException(409,'Ce signalement a déjà été traité.')
        review=s.get(Review,report.data['review_id'])
        if review and review.updated!=decision.review_updated:raise HTTPException(409,'Cet avis a été modifié. Actualisez avant de décider.')
        if decision.approve and review:
            if review.place_id!=report.place_id:raise HTTPException(409,'Le lieu de cet avis a changé. Actualisez avant de décider.')
            s.execute(delete(Vote).where(Vote.review_id==review.id))
            s.execute(delete(Cache).where(Cache.key=='moderation:review:'+review.id))
            for related in s.scalars(select(Report).where(Report.status=='open',Report.place_id==report.place_id)):
                if related.data.get('review_id')==review.id and related.data.get('kind')!='user.report':related.status='approved'
            p=s.get(Place,review.place_id)
            s.delete(review)
            if p:update_rating(s,p)
        report.status=status
        s.add(Audit(user_id=u.id,place_id=report.place_id,kind='review.moderation',created=now(),data={'report_id':ident,'approve':decision.approve}))
        return {'ok':True,'status':status}

from .account_state import account_status, require_contribution_access
from .moderation import router as moderation_router, REPORT_REASONS
app.include_router(moderation_router)
from .contact import router as contact_router
app.include_router(contact_router)
from .accounts import router as accounts_router
from .community import router as community_router, credit, erase_place, require_terms, consume_limit, automatic_report_guard, content_hidden
app.include_router(accounts_router)
app.include_router(community_router)
