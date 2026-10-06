"""Connexion facultative : identités pseudonymisées et preuves temporaires."""
import hashlib,hmac,secrets,time,os,re,uuid,smtplib
from urllib.parse import urlencode
import httpx
from fastapi import APIRouter,Request,HTTPException,Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel,Field,field_validator
from sqlalchemy import select,delete
from .db import Session,User,Identity,AuthChallenge,TermsAcceptance
from .security import rate,issue,password_hash
from .contact import send_mail,mail_ready
from .community import TERMS_VERSION
router=APIRouter()
def digest(value):return hashlib.sha256(value.encode()).hexdigest()
def identity_key(provider,subject):
    key=os.getenv('IDENTITY_SECRET','')
    if len(key)<32:raise HTTPException(503,'Connexion non configurée.')
    return hmac.new(key.encode(),(provider+':'+subject).encode(),hashlib.sha256).hexdigest()
def gc(s):s.execute(delete(AuthChallenge).where(AuthChallenge.expires<int(time.time())))
def account(s,key):
    ident=s.get(Identity,key)
    if ident:return s.get(User,ident.user_id)
    u=User(id=uuid.uuid4().hex,username='Parent-'+secrets.token_hex(5),password=password_hash(secrets.token_urlsafe(40)),created=__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),role='member')
    s.add(u);s.flush();s.add(Identity(key=key,user_id=u.id));return u

def enabled(provider):
    return len(os.getenv('IDENTITY_SECRET',''))>=32 and (mail_ready() if provider=='email' else bool(os.getenv(provider.upper()+'_CLIENT_ID') and os.getenv(provider.upper()+'_CLIENT_SECRET') and os.getenv('PUBLIC_API_URL','').startswith('https://') and (provider!='facebook' or os.getenv('FACEBOOK_GRAPH_VERSION'))))
@router.get('/v1/auth/options')
def options():return {k:enabled(k) for k in ('email','google','facebook')}
class EmailStart(BaseModel):
    email:str=Field(max_length=254)
    terms:str=Field(max_length=20)
    @field_validator('email')
    @classmethod
    def valid(cls,v):
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',v):raise ValueError('E-mail invalide')
        return v.strip().lower()
@router.post('/v1/auth/email/start')
def email_start(data:EmailStart,request:Request):
    rate('email-ip:'+request.client.host,5,3600)
    if not enabled('email'):raise HTTPException(503,'La connexion par e-mail n’est pas encore configurée.')
    if data.terms!=TERMS_VERSION:raise HTTPException(422,'Acceptez les conditions actuelles.')
    key=identity_key('email',data.email);rate('email:'+key,3,3600)
    raw=secrets.token_urlsafe(32);code=f'{secrets.randbelow(100000000):08d}'
    try:send_mail(data.email,'Votre code Cailloute',f'Votre code de connexion : {code}\nValable 10 minutes. Ne le communiquez à personne. Si vous n’avez rien demandé, ignorez ce message.')
    except (OSError,smtplib.SMTPException):raise HTTPException(503,'Envoi du code indisponible.')
    with Session.begin() as s:
        gc(s);s.add(AuthChallenge(id=digest(raw),expires=int(time.time())+600,data={'identity':key,'code':digest(raw+code),'attempts':0,'kind':'email'}))
    return {'challenge':raw}
class EmailVerify(BaseModel):
    challenge:str=Field(min_length=32,max_length=100)
    code:str=Field(pattern=r'^\d{8}$')
@router.post('/v1/auth/email/verify')
def email_verify(data:EmailVerify,request:Request):
    rate('verify:'+request.client.host,20,600)
    result=None
    with Session.begin() as s:
        c=s.scalar(select(AuthChallenge).where(AuthChallenge.id==digest(data.challenge)).with_for_update())
        if c and c.expires>=time.time() and c.data.get('kind')=='email' and c.data.get('attempts',0)<5:
            if hmac.compare_digest(c.data['code'],digest(data.challenge+data.code)):
                u=account(s,c.data['identity']);s.merge(TermsAcceptance(user_id=u.id,version=TERMS_VERSION));result=issue(s,u);s.delete(c)
            else:c.data={**c.data,'attempts':c.data.get('attempts',0)+1}
    if not result:raise HTTPException(401,'Code invalide ou expiré.')
    return result

class OAuthStart(BaseModel):
    provider:str=Field(pattern='^(google|facebook)$')
    challenge:str=Field(pattern=r'^[a-f0-9]{64}$')
    terms:str=Field(max_length=20)
@router.post('/v1/auth/oauth/start')
def oauth_start(data:OAuthStart,request:Request):
    rate('oauth:'+request.client.host,10,600)
    p=data.provider
    if not enabled(p):raise HTTPException(503,'Cette connexion n’est pas encore configurée.')
    if data.terms!=TERMS_VERSION:raise HTTPException(422,'Acceptez les conditions actuelles.')
    state=secrets.token_urlsafe(32);raw=secrets.token_urlsafe(32)
    redirect=os.environ['PUBLIC_API_URL'].rstrip('/')+'/v1/auth/oauth/callback'
    with Session.begin() as s:
        gc(s);s.add(AuthChallenge(id=digest(raw),expires=int(time.time())+600,data={'kind':'oauth','provider':p,'state':digest(state),'challenge':data.challenge,'redirect':redirect,'used':False}))
        s.add(AuthChallenge(id=digest(state),expires=int(time.time())+600,data={'flow':digest(raw)}))
    params={'client_id':os.environ[p.upper()+'_CLIENT_ID'],'redirect_uri':redirect,'response_type':'code','state':state,'scope':'openid' if p=='google' else 'public_profile'}
    endpoint='https://accounts.google.com/o/oauth2/v2/auth' if p=='google' else 'https://www.facebook.com/'+os.environ['FACEBOOK_GRAPH_VERSION']+'/dialog/oauth'
    return {'flow':raw,'url':endpoint+'?'+urlencode(params)}
@router.get('/v1/auth/oauth/callback',response_class=HTMLResponse)
def oauth_callback(state:str='',code:str='',error:str=''):
    if len(state)>100 or len(code)>4096:raise HTTPException(400,'Réponse invalide.')
    with Session.begin() as s:
        lookup=s.scalar(select(AuthChallenge).where(AuthChallenge.id==digest(state)).with_for_update())
        flow=s.get(AuthChallenge,lookup.data.get('flow')) if lookup else None
        if not flow or flow.expires<time.time() or flow.data.get('used'):raise HTTPException(400,'Connexion expirée.')
        data=flow.data;flow.data={**data,'used':True};s.delete(lookup)
    if error or not code:return HTMLResponse('<html lang="fr"><p>Connexion annulée. Revenez dans Cailloute.</p></html>')
    p=data['provider'];prefix='https://graph.facebook.com/'+os.getenv('FACEBOOK_GRAPH_VERSION','')
    try:
        with httpx.Client(timeout=20) as client:
            payload={'client_id':os.environ[p.upper()+'_CLIENT_ID'],'client_secret':os.environ[p.upper()+'_CLIENT_SECRET'],'redirect_uri':data['redirect'],'code':code,'grant_type':'authorization_code'}
            token=client.post('https://oauth2.googleapis.com/token' if p=='google' else prefix+'/oauth/access_token',data=payload);token.raise_for_status();access=token.json()['access_token']
            profile=client.get('https://openidconnect.googleapis.com/v1/userinfo' if p=='google' else prefix+'/me',params={} if p=='google' else {'fields':'id','appsecret_proof':hmac.new(os.environ['FACEBOOK_CLIENT_SECRET'].encode(),access.encode(),hashlib.sha256).hexdigest()},headers={'Authorization':'Bearer '+access});profile.raise_for_status();subject=profile.json()['sub' if p=='google' else 'id']
        with Session.begin() as s:
            row=s.get(AuthChallenge,flow.id)
            if not row or row.expires<time.time():raise HTTPException(400,'Connexion expirée.')
            row.data={**row.data,'identity':identity_key(p,str(subject))}
    except (httpx.HTTPError,KeyError,ValueError):raise HTTPException(401,'Connexion refusée. Réessayez depuis Cailloute.')
    return HTMLResponse('<!doctype html><html lang="fr"><meta name="viewport" content="width=device-width"><title>Cailloute</title><body><h1>Connexion confirmée</h1><p>Revenez dans Cailloute pour terminer.</p></body></html>')
class OAuthFinish(BaseModel):
    flow:str=Field(min_length=32,max_length=100)
    verifier:str=Field(min_length=43,max_length=128)
@router.post('/v1/auth/oauth/finish')
def oauth_finish(data:OAuthFinish,request:Request):
    rate('oauth-poll:'+request.client.host,150,600)
    with Session.begin() as s:
        row=s.scalar(select(AuthChallenge).where(AuthChallenge.id==digest(data.flow)).with_for_update())
        if not row or row.expires<time.time() or row.data.get('kind')!='oauth' or not hmac.compare_digest(row.data['challenge'],digest(data.verifier)):raise HTTPException(401,'Connexion expirée ou invalide.')
        if not row.data.get('identity'):return {'pending':True}
        u=account(s,row.data['identity']);s.merge(TermsAcceptance(user_id=u.id,version=TERMS_VERSION));result=issue(s,u);s.delete(row);return result
