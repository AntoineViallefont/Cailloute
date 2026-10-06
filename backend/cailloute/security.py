import hashlib, hmac, secrets, time, threading
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Header
from sqlalchemy import select
from .db import Session, User, Token, TermsAcceptance

def password_hash(value):
    salt = secrets.token_bytes(16)
    return salt.hex() + ':' + hashlib.scrypt(value.encode(), salt=salt, n=16384, r=8, p=1).hex()
def password_ok(value, stored):
    salt, expected = stored.split(':')
    actual = hashlib.scrypt(value.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return hmac.compare_digest(actual, expected)
def issue(s, user):
    from .account_state import account_status
    raw = secrets.token_urlsafe(40)
    s.add(Token(hash=hashlib.sha256(raw.encode()).hexdigest(), user_id=user.id, expires=(datetime.now(timezone.utc)+timedelta(days=30)).isoformat()))
    return {'token': raw, 'user': {'id': user.id, 'username': user.username, 'role': user.role, 'moderation': account_status(s,user), 'terms_version': (s.get(TermsAcceptance,user.id).version if s.get(TermsAcceptance,user.id) else '')}}
def current_user(authorization: str = Header(default='')):
    if not authorization.startswith('Bearer '): raise HTTPException(401, 'Connectez-vous pour contribuer.')
    with Session() as s:
        token = s.get(Token, hashlib.sha256(authorization[7:].encode()).hexdigest())
        if not token or datetime.fromisoformat(token.expires) <= datetime.now(timezone.utc):
            raise HTTPException(401, 'Session expirée. Reconnectez-vous.')
        u = s.get(User, token.user_id)
        if not u: raise HTTPException(401, 'Compte indisponible.')
        return u

# Limitation locale, complétée par Cloud Armor / limites Cloud Run en production.
hits = defaultdict(deque)
lock = threading.Lock()
def rate(key, maximum=30, seconds=60):
    with lock:
        q = hits[key]; t = time.monotonic()
        while q and q[0] < t-seconds: q.popleft()
        if len(q) >= maximum: raise HTTPException(429, 'Trop de demandes. Réessayez dans une minute.')
        q.append(t)
        if len(hits) > 10000:
            for k in list(hits):
                if not hits[k] or hits[k][-1] < t-seconds: del hits[k]
