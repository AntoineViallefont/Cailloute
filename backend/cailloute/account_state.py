from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from .db import AccountDecision

def account_status(s, u):
    latest = s.scalar(select(AccountDecision).where(AccountDecision.user_id == u.id).order_by(AccountDecision.created.desc(), AccountDecision.id.desc()))
    result = {'can_contribute': u.role != 'suspended', 'action': 'ban' if u.role == 'suspended' else None, 'reason': '', 'until': None, 'decision_id': None}
    if latest:
        active = latest.action == 'ban' or (latest.action in ('suspend_7', 'suspend_30') and datetime.fromisoformat(latest.until) > datetime.now(timezone.utc))
        result.update(can_contribute=not active and u.role != 'suspended', action=latest.action, reason=latest.reason, until=latest.until, decision_id=latest.id)
    return result

def require_contribution_access(s, u):
    status = account_status(s, u)
    if not status['can_contribute']:
        raise HTTPException(403, 'Contributions suspendues. Consultez la décision dans Profil ; la consultation et la contestation restent accessibles.')
