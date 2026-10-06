"""Relais SMTP : destinataire et identifiants exclusivement côté serveur."""
import os,re,smtplib,ssl
from email.message import EmailMessage
from fastapi import APIRouter,HTTPException,Request
from pydantic import BaseModel,Field,field_validator
from .security import rate
router=APIRouter()
def mail_ready():return bool(os.getenv('SMTP_HOST') and os.getenv('SMTP_FROM') and os.getenv('CONTACT_TO'))
def send_mail(to,subject,body,reply_to=''):
    msg=EmailMessage();msg['From']=os.environ['SMTP_FROM'];msg['To']=to;msg['Subject']=subject
    if reply_to:msg['Reply-To']=reply_to
    msg.set_content(body)
    host=os.environ['SMTP_HOST'];port=int(os.getenv('SMTP_PORT','465'))
    if port==465:client=smtplib.SMTP_SSL(host,port,timeout=15,context=ssl.create_default_context())
    else:
        client=smtplib.SMTP(host,port,timeout=15);client.starttls(context=ssl.create_default_context())
    with client:
        if os.getenv('SMTP_USER'):client.login(os.environ['SMTP_USER'],os.environ['SMTP_PASSWORD'])
        client.send_message(msg)
class ContactInput(BaseModel):
    email:str=Field('',max_length=254)
    subject:str=Field(min_length=3,max_length=120)
    message:str=Field(min_length=10,max_length=5000)
    website:str=Field('',max_length=500) # Champ piège anti-robot, jamais transmis.
    @field_validator('email')
    @classmethod
    def email_valid(cls,v):
        if v and not re.fullmatch(r'[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+',v):raise ValueError('Adresse invalide')
        return v
    @field_validator('subject')
    @classmethod
    def subject_valid(cls,v):
        if '\n' in v or '\r' in v:raise ValueError('Objet invalide')
        return v
@router.get('/v1/contact/config')
def config():return {'available':mail_ready()}
@router.post('/v1/contact')
def contact(data:ContactInput,request:Request):
    rate('contact:'+request.client.host,3,3600)
    if data.website:return {'ok':True}
    if not mail_ready():raise HTTPException(503,'Le contact sera disponible après configuration du service de messagerie.')
    try:send_mail(os.environ['CONTACT_TO'],'Cailloute · '+data.subject,data.message,data.email)
    except (OSError,smtplib.SMTPException):raise HTTPException(503,'Envoi indisponible. Réessayez plus tard.')
    return {'ok':True}
