import os
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import create_engine, event, String, Integer, Text, JSON, ForeignKey, UniqueConstraint, inspect, text
from sqlalchemy.orm import DeclarativeBase, mapped_column, sessionmaker

ROOT = Path(__file__).resolve().parents[2]
from dotenv import load_dotenv
load_dotenv(ROOT / '.env', override=False)
DATA = Path(os.getenv('DATA_DIR', str(ROOT / 'var')))
DATA.mkdir(parents=True, exist_ok=True)
URL = os.getenv('DATABASE_URL', f'sqlite:///{DATA / "cailloute.db"}')
if URL.startswith('postgres://'):
    URL = URL.replace('postgres://', 'postgresql+psycopg://', 1)
elif URL.startswith('postgresql://'):
    URL = URL.replace('postgresql://', 'postgresql+psycopg://', 1)
if os.getenv('ENVIRONMENT') == 'production' and URL.startswith('sqlite'):
    raise RuntimeError('Cloud Run nécessite PostgreSQL persistant : renseigner DATABASE_URL.')
engine = create_engine(URL, **({'connect_args': {'check_same_thread': False, 'timeout': 30}} if URL.startswith('sqlite') else {'pool_pre_ping': True}))
if URL.startswith('sqlite'):
    @event.listens_for(engine, 'connect')
    def pragmas(conn, _):
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA foreign_keys=ON')
Session = sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase): pass

class Place(Base):
    __tablename__ = 'places'
    id = mapped_column(String(100), primary_key=True)
    data = mapped_column(JSON, nullable=False)
    override = mapped_column(JSON, default=dict, nullable=False)
    version = mapped_column(Integer, default=1, nullable=False)

class Change(Base):
    __tablename__ = 'changes'
    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    place_id = mapped_column(String(100), index=True)
    data = mapped_column(JSON, nullable=False)

class SourceRecord(Base):
    __tablename__ = 'source_records'
    key = mapped_column(String(160), primary_key=True)
    place_id = mapped_column(String(100), index=True)
    data = mapped_column(JSON, nullable=False)

class User(Base):
    __tablename__ = 'users'
    id = mapped_column(String(40), primary_key=True)
    username = mapped_column(String(60), unique=True, nullable=False)
    password = mapped_column(Text, nullable=False)
    created = mapped_column(String(40), nullable=False)
    role = mapped_column(String(20), default='member')

class Token(Base):
    __tablename__ = 'tokens'
    hash = mapped_column(String(64), primary_key=True)
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    expires = mapped_column(String(40), nullable=False)

class Review(Base):
    __tablename__ = 'reviews'
    __table_args__ = (UniqueConstraint('place_id', 'user_id'),)
    id = mapped_column(String(40), primary_key=True)
    place_id = mapped_column(String(100), index=True, nullable=False)
    user_id = mapped_column(String(40), nullable=False)
    stars = mapped_column(Integer, nullable=False)
    text = mapped_column(Text, nullable=False)
    created = mapped_column(String(40), nullable=False)
    updated = mapped_column(String(40), nullable=False)

class Vote(Base):
    __tablename__ = 'votes'
    review_id = mapped_column(String(40), primary_key=True)
    user_id = mapped_column(String(40), primary_key=True)

    value = mapped_column(Integer, default=1, server_default="1", nullable=False)

class Favorite(Base):
    __tablename__ = 'favorites'
    user_id = mapped_column(String(40), primary_key=True)
    place_id = mapped_column(String(100), primary_key=True)

class Photo(Base):
    __tablename__ = 'photos'
    id = mapped_column(String(40), primary_key=True)
    place_id = mapped_column(String(100), index=True, nullable=False)
    user_id = mapped_column(String(40), nullable=False)
    caption = mapped_column(String(300), default='')
    created = mapped_column(String(40), nullable=False)

class Receipt(Base):
    __tablename__ = 'receipts'
    id = mapped_column(String(40), primary_key=True)
    user_id = mapped_column(String(40), nullable=False)
    result = mapped_column(JSON, nullable=False)

class Audit(Base):
    __tablename__ = 'audit'
    id = mapped_column(Integer, primary_key=True)
    user_id = mapped_column(String(40))
    place_id = mapped_column(String(100), index=True)
    kind = mapped_column(String(40))
    created = mapped_column(String(40))
    data = mapped_column(JSON)

class Report(Base):
    __tablename__ = 'reports'
    id = mapped_column(String(40), primary_key=True)
    user_id = mapped_column(String(40))
    place_id = mapped_column(String(100))
    data = mapped_column(JSON)
    status = mapped_column(String(20), default='open')
    created = mapped_column(String(40))

class Cache(Base):
    __tablename__ = 'cache'
    key = mapped_column(String(200), primary_key=True)
    data = mapped_column(JSON)
    expires = mapped_column(Integer)

def now(): return datetime.now(timezone.utc).isoformat()
def init():
    Base.metadata.create_all(engine)
    # Les votes des versions précédentes sont tous des votes positifs.
    with engine.begin() as connection:
        if 'value' not in {column['name'] for column in inspect(connection).get_columns('votes')}:
            connection.execute(text('ALTER TABLE votes ADD COLUMN value INTEGER NOT NULL DEFAULT 1'))
    # Reprendre les compteurs existants une seule fois, sans afficher d'historique.
    with Session.begin() as s:
        for user in s.query(User):
            if s.get(ContributionStats,user.id):continue
            added={p.id for p in s.query(Place) if p.data.get('created_by')==user.id}
            edited={a.place_id for a in s.query(Audit).filter_by(user_id=user.id,kind='place.edit')} - added
            s.add(ContributionStats(user_id=user.id,added=len(added),edited=len(edited)))
            for kind,ids in [('added',added),('edited',edited)]:
                for place_id in ids:s.add(ContributionCredit(user_id=user.id,place_id=place_id,kind=kind))

def public_place(p): return {**p.data, **(p.override or {}), 'id': p.id, 'version': p.version}
def emit(s, p):
    s.add(Change(place_id=p.id, data=public_place(p)))
def update_rating(s, p):
    s.flush()
    reviews = s.query(Review).filter_by(place_id=p.id).all()
    p.data = {**p.data, 'rating': round(sum(r.stars for r in reviews) / len(reviews), 2) if reviews else None, 'review_count': len(reviews)}
    p.version += 1
    emit(s, p)

def update_photo_count(s, p):
    s.flush()
    count = s.query(Photo).filter_by(place_id=p.id).count()
    p.data = {**p.data, 'photo_count': count}
    p.version += 1
    emit(s, p)

class ContributionStats(Base):
    __tablename__ = 'contribution_stats'
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    added = mapped_column(Integer, default=0, nullable=False)
    edited = mapped_column(Integer, default=0, nullable=False)

class ContributionCredit(Base):
    __tablename__ = 'contribution_credits'
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    place_id = mapped_column(String(100), primary_key=True)
    kind = mapped_column(String(20), primary_key=True)

class ExcludedPlace(Base):
    __tablename__ = 'excluded_places'
    id = mapped_column(String(100), primary_key=True)

class Identity(Base):
    __tablename__ = 'identities'
    key = mapped_column(String(64), primary_key=True)
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), nullable=False)

class AuthChallenge(Base):
    __tablename__ = 'auth_challenges'
    id = mapped_column(String(64), primary_key=True)
    data = mapped_column(JSON, nullable=False)
    expires = mapped_column(Integer, nullable=False)

class TermsAcceptance(Base):
    __tablename__ = 'terms_acceptances'
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    version = mapped_column(String(20), nullable=False)

class BlockedUser(Base):
    __tablename__ = 'blocked_users'
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    blocked_id = mapped_column(String(40), primary_key=True)

class DailyActivity(Base):
    __tablename__ = 'daily_activity'
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    day = mapped_column(String(10), primary_key=True)
    kind = mapped_column(String(20), primary_key=True)
    count = mapped_column(Integer, default=0, nullable=False)

class AccountDecision(Base):
    __tablename__ = 'account_decisions'
    id = mapped_column(String(40), primary_key=True)
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True, nullable=False)
    editor_id = mapped_column(String(40), nullable=False)
    report_id = mapped_column(String(40), unique=True, nullable=True)
    action = mapped_column(String(20), nullable=False)
    reason = mapped_column(String(1500), nullable=False)
    created = mapped_column(String(40), nullable=False)
    until = mapped_column(String(40), nullable=True)

class AccountAppeal(Base):
    __tablename__ = 'account_appeals'
    id = mapped_column(String(40), primary_key=True)
    user_id = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True, nullable=False)
    decision_id = mapped_column(String(40), unique=True, nullable=False)
    message = mapped_column(String(2000), nullable=False)
    created = mapped_column(String(40), nullable=False)
    status = mapped_column(String(20), default='open', nullable=False)
    response = mapped_column(String(2000), default='', nullable=False)
