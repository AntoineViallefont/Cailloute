import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select
from .db import AccountAppeal, Session, User, BlockedUser, AccountDecision, Report, Review, Photo, Place, now, public_place
from .security import current_user, rate
from .account_state import account_status

router = APIRouter()
REPORT_REASONS = {'harassment', 'discrimination', 'spam', 'privacy', 'inappropriate', 'vandalism', 'other'}

class BlockInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    blocked_id: str = Field(min_length=1, max_length=40)
    value: StrictBool

@router.get('/v1/me/blocks')
def blocks(u=Depends(current_user)):
    with Session() as s:
        rows = s.execute(select(BlockedUser.blocked_id, User.username).join(User, User.id == BlockedUser.blocked_id).where(BlockedUser.user_id == u.id).order_by(User.username)).all()
        return {'users': [{'id': ident, 'username': name} for ident, name in rows]}

@router.post('/v1/me/blocks')
def block(data: BlockInput, u=Depends(current_user)):
    from .main import write_lock
    if data.blocked_id == u.id: raise HTTPException(422, 'Vous ne pouvez pas vous bloquer vous-même.')
    rate('blocks:' + u.id, 30, 60)
    with Session.begin() as s:
        write_lock(s)
        target = s.get(User, data.blocked_id)
        if not target and data.value: raise HTTPException(404, 'Compte introuvable.')
        row = s.get(BlockedUser, (u.id, data.blocked_id))
        if data.value and not row: s.add(BlockedUser(user_id=u.id, blocked_id=data.blocked_id))
        elif not data.value and row: s.delete(row)
    return {'ok': True}

@router.get('/v1/me/moderation')
def my_moderation(u=Depends(current_user)):
    with Session() as s:
        decisions = s.scalars(select(AccountDecision).where(AccountDecision.user_id == u.id).order_by(AccountDecision.created.desc()).limit(20)).all()
        own_appeals=list(s.scalars(select(AccountAppeal).where(AccountAppeal.user_id==u.id)))
        return {**account_status(s, u), 'appeals':[{'decision_id':a.decision_id,'status':a.status,'response':a.response} for a in own_appeals], 'decisions': [{'id': d.id, 'action': d.action, 'reason': d.reason, 'created': d.created, 'until': d.until} for d in decisions]}

def require_editor(u):
    if u.role != 'admin': raise HTTPException(403, 'Réservé à l’éditeur.')

@router.get('/v1/user-reports')
def user_reports(u=Depends(current_user)):
    require_editor(u)
    with Session() as s:
        reports = []
        for r in s.scalars(select(Report).where(Report.status == 'open').order_by(Report.created)):
            if r.data.get('kind') != 'user.report': continue
            target = s.get(User, r.data.get('target_user_id'))
            if not target: continue
            reporter = s.get(User, r.user_id)
            review = s.get(Review, r.data['review_id']) if r.data.get('review_id') else None
            photo = s.get(Photo, r.data['photo_id']) if r.data.get('photo_id') else None
            place = s.get(Place, r.place_id)
            reports.append({'id': r.id, 'created': r.created, 'reason': r.data.get('reason', ''), 'category': r.data.get('category', 'other'), 'reporter': reporter.username if reporter else 'Compte supprimé', 'user': {'id': target.id, 'username': target.username}, 'status': account_status(s, target), 'place_name': public_place(place).get('name', '') if place else '', 'review': {'text': review.text, 'updated': review.updated} if review else None, 'photo_url': '/v1/photos/' + photo.id if photo else None})
        return {'reports': reports}

class UserDecision(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    action: Literal['dismiss', 'warning', 'suspend_7', 'suspend_30', 'ban']
    reason: str = Field(min_length=5, max_length=1500)
    review_updated: str | None = Field(default=None, max_length=80)

@router.post('/v1/user-reports/{ident}/decision')
def decide_user(ident: str, data: UserDecision, u=Depends(current_user)):
    from .main import write_lock
    require_editor(u)
    with Session.begin() as s:
        write_lock(s)
        r = s.get(Report, ident)
        if not r or r.data.get('kind') != 'user.report': raise HTTPException(404, 'Signalement introuvable.')
        status = 'rejected' if data.action == 'dismiss' else data.action
        if r.status != 'open':
            if r.status == status: return {'ok': True}
            raise HTTPException(409, 'Ce signalement a déjà été traité.')
        target = s.get(User, r.data.get('target_user_id'))
        if not target: raise HTTPException(404, 'Compte introuvable.')
        if target.id == u.id or target.role == 'admin': raise HTTPException(422, 'Ce compte ne peut pas être sanctionné ici.')
        review = s.get(Review, r.data['review_id']) if r.data.get('review_id') else None
        if review and review.updated != data.review_updated: raise HTTPException(409, 'L’avis a changé. Actualisez avant de décider.')
        current = account_status(s, target)
        if data.action != 'dismiss' and not current['can_contribute']:
            severity = {'warning': 0, 'suspend_7': 1, 'suspend_30': 2, 'ban': 3}
            if severity[data.action] <= severity.get(current['action'], 3): raise HTTPException(409, 'Une sanction au moins aussi forte est déjà active. Utilisez Lever la suspension pour la retirer.')
        if data.action != 'dismiss':
            until = (datetime.now(timezone.utc) + timedelta(days=7 if data.action == 'suspend_7' else 30)).isoformat() if data.action.startswith('suspend_') else None
            s.add(AccountDecision(id=uuid.uuid4().hex, user_id=target.id, editor_id=u.id, report_id=r.id, action=data.action, reason=data.reason.strip(), created=now(), until=until))
        r.status = status
        r.data = {**r.data, 'decision_reason': data.reason.strip()}
    return {'ok': True}

@router.get('/v1/moderation/accounts')
def restricted_accounts(u=Depends(current_user)):
    require_editor(u)
    with Session() as s:
        ids = set(s.scalars(select(AccountDecision.user_id)))
        result = []
        for ident in ids:
            target = s.get(User, ident)
            if target:
                status = account_status(s, target)
                if not status['can_contribute']: result.append({'id': target.id, 'username': target.username, **status})
        return {'users': result}

class RestoreInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    decision_id: str = Field(min_length=1, max_length=40)
    reason: str = Field(min_length=5, max_length=1500)

@router.post('/v1/moderation/accounts/{ident}/restore')
def restore(ident: str, data: RestoreInput, u=Depends(current_user)):
    from .main import write_lock
    require_editor(u)
    with Session.begin() as s:
        write_lock(s)
        target = s.get(User, ident)
        if not target: raise HTTPException(404, 'Compte introuvable.')
        status = account_status(s, target)
        if status['decision_id'] != data.decision_id: raise HTTPException(409, 'La décision a changé. Actualisez la liste.')
        s.add(AccountDecision(id=uuid.uuid4().hex, user_id=ident, editor_id=u.id, action='restore', reason=data.reason.strip(), created=now()))
    return {'ok': True}

class AppealInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    decision_id: str = Field(min_length=1, max_length=40)
    message: str = Field(min_length=10, max_length=2000)

@router.post('/v1/me/appeals')
def appeal(data: AppealInput, u=Depends(current_user)):
    from .main import write_lock
    with Session.begin() as s:
        write_lock(s)
        decision = s.get(AccountDecision, data.decision_id)
        if not decision or decision.user_id != u.id: raise HTTPException(404, 'Décision introuvable.')
        existing = s.scalar(select(AccountAppeal).where(AccountAppeal.decision_id == decision.id))
        if existing: return {'ok': True, 'already_sent': True}
        s.add(AccountAppeal(id=uuid.uuid4().hex, user_id=u.id, decision_id=decision.id, message=data.message, created=now(), status='open', response=''))
    return {'ok': True}

@router.get('/v1/moderation/appeals')
def appeals(u=Depends(current_user)):
    require_editor(u)
    with Session() as s:
        result=[]
        for a in s.scalars(select(AccountAppeal).where(AccountAppeal.status=='open').order_by(AccountAppeal.created)):
            target=s.get(User,a.user_id);decision=s.get(AccountDecision,a.decision_id)
            if target and decision:result.append({'id':a.id,'username':target.username,'message':a.message,'reason':decision.reason,'action':decision.action,'current':account_status(s,target)})
        return {'appeals':result}

class AppealDecision(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    restore: StrictBool
    response: str = Field(min_length=5,max_length=2000)

@router.post('/v1/moderation/appeals/{ident}/decision')
def decide_appeal(ident:str,data:AppealDecision,u=Depends(current_user)):
    from .main import write_lock
    require_editor(u)
    with Session.begin() as s:
        write_lock(s)
        a=s.get(AccountAppeal,ident)
        if not a:raise HTTPException(404,'Contestation introuvable.')
        if a.status!='open':raise HTTPException(409,'Cette contestation a déjà été traitée.')
        target=s.get(User,a.user_id)
        if data.restore:
            if account_status(s,target)['decision_id']!=a.decision_id:raise HTTPException(409,'Une autre décision existe. Actualisez et examinez les suspensions actives.')
            s.add(AccountDecision(id=uuid.uuid4().hex,user_id=target.id,editor_id=u.id,action='restore',reason=data.response,created=now()))
        a.status='accepted' if data.restore else 'rejected';a.response=data.response
    return {'ok':True}
