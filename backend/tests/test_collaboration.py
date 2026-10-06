import base64,io,uuid
from PIL import Image
from cailloute.db import Session,Place,SourceRecord,Review,Change,Token,public_place
from cailloute.geo import distance,can_merge,tri
from cailloute.import_data import osm_record

def account(c,name):
    r=c.post('/v1/auth/register',json={'username':name,'password':'test-cailloute-only-123'})
    assert r.status_code==200,r.text
    headers={'Authorization':'Bearer '+r.json()['token']}
    assert c.post('/v1/me/terms',headers=headers,json={'version':'2026-09-16.2','adult':True}).status_code==200
    return headers,r.json()['user']['id']
def operation(c,h,kind,place_id='test-place',payload=None,**extra):
    if kind=='photo.add':payload={**(payload or {}),'privacy_reviewed':True,'rights_accepted':True}
    op={'id':str(uuid.uuid4()),'kind':kind,'place_id':place_id,'payload':payload or {},**extra}
    return c.post('/v1/operations',headers=h,json=op),op
def place(c,h):
    p={'name':'Square test','category':'playground','lat':45.7578,'lon':4.832,'changing_table':None,'shade':True}
    r,_=operation(c,h,'place.create',payload=p);assert r.status_code==200,r.text
    return p

def test_auth_and_private_favorites(client):
    h,_=account(client,'parent-one');place(client,h)
    assert client.post('/v1/operations',json={'id':str(uuid.uuid4()),'kind':'review.save','place_id':'test-place','payload':{'stars':5}}).status_code==401
    r,_=operation(client,h,'favorite.set',payload={'value':True});assert r.status_code==200
    h2,_=account(client,'parent-two')
    assert client.get('/v1/me',headers=h).json()['favorites']==['test-place']
    assert client.get('/v1/me',headers=h2).json()['favorites']==[]

def test_idempotent_queue_and_revision(client):
    h,_=account(client,'parent-one');place(client,h)
    r,op=operation(client,h,'review.save',payload={'stars':4,'text':'Accessible'})
    again=client.post('/v1/operations',headers=h,json=op)
    assert r.json()==again.json()
    detail=client.get('/v1/places/test-place').json();assert detail['review_count']==1 and detail['rating']==4
    sync=client.get('/v1/sync?limit=1').json();assert sync['has_more']
    later=client.get('/v1/sync?cursor='+str(sync['cursor'])).json()
    assert later['changes'][-1]['place']['rating']==4
    assert client.get('/v1/sync?cursor='+str(later['cursor'])).json()['changes']==[]

def test_conflict_preserves_current_version(client):
    h,_=account(client,'parent-one');p=place(client,h)
    r,_=operation(client,h,'place.edit',payload={**p,'name':'Premier'},base_version=1);assert r.status_code==200
    r,_=operation(client,h,'place.edit',payload={**p,'name':'Concurrent'},base_version=1)
    assert r.status_code==409
    assert r.json()['detail']['proposed']['name']=='Concurrent'
    assert client.get('/v1/places/test-place').json()['name']=='Premier'

def test_rating_votes_and_sorting(client):
    h,u=account(client,'parent-one');place(client,h);h2,_=account(client,'parent-two')
    operation(client,h,'review.save',payload={'stars':5,'text':'Premier'})
    operation(client,h2,'review.save',payload={'stars':3,'text':'Second'})
    d=client.get('/v1/places/test-place?sort=recent').json();assert d['rating']==4 and d['reviews'][0]['text']=='Second'
    first=next(r for r in d['reviews'] if r['user_id']==u)
    assert operation(client,h,'review.vote',payload={'review_id':first['id'],'value':True})[0].status_code==422
    for _ in range(2): assert operation(client,h2,'review.vote',payload={'review_id':first['id'],'value':True})[0].status_code==200
    d=client.get('/v1/places/test-place?sort=relevant').json();assert d['reviews'][0]['text']=='Premier' and d['reviews'][0]['votes']==1
    operation(client,h,'review.save',payload={'stars':1,'text':'Révisé'})
    assert client.get('/v1/places/test-place').json()['rating']==2

def test_photos_validation_and_shared_moderation(client):
    h,_=account(client,'parent-one');place(client,h);h2,_=account(client,'parent-two')
    assert operation(client,h,'photo.add',payload={'base64':base64.b64encode(b'not a photo').decode()})[0].status_code==422
    image=Image.new('RGB',(32,32),'blue');out=io.BytesIO();image.save(out,format='JPEG',exif=b'Exif\x00\x00')
    r,_=operation(client,h,'photo.add',payload={'base64':base64.b64encode(out.getvalue()).decode()});assert r.status_code==200,r.text
    photo=client.get('/v1/places/test-place').json()['photos'][0]
    data=client.get(photo['url']);assert data.status_code==200
    assert not Image.open(io.BytesIO(data.content)).getexif()
    assert operation(client,h2,'photo.delete',payload={'photo_id':photo['id']})[0].status_code==200
    assert client.get(photo['url']).status_code==404

def test_scope_and_strict_equipment(client):
    h,_=account(client,'parent-one')
    for change in ({'lat':51.5074,'lon':-0.1278},{'wheelchair':'yes'},{'name':'a'},{'category':'invalid'}):
        r,_=operation(client,h,'place.create',payload={'name':'Test','category':'toilet','lat':45.7578,'lon':4.832,**change})
        assert r.status_code==422,r.text
    place(client,h);d=client.get('/v1/places/test-place').json();assert d['changing_table'] is None

def test_account_deletion_and_token_revocation(client):
    h,_=account(client,'parent-one');place(client,h);operation(client,h,'review.save',payload={'stars':5})
    assert client.delete('/v1/me',headers=h).status_code==200
    assert client.get('/v1/me',headers=h).status_code==401
    assert client.get('/v1/places/test-place').json()['review_count']==0

def test_geo_and_dedup_do_not_merge_neighbors():
    assert distance((45.7578,4.832),(45.7578,4.832))==0
    assert 111190<distance((0,0),(1,0))<111200
    a={'name':'Square des enfants','category':'playground','lat':45.7578,'lon':4.832,'wheelchair':None}
    assert can_merge(a,{**a,'lat':45.75781})
    assert not can_merge(a,{**a,'category':'water'})
    assert not can_merge(a,{**a,'name':'Autre square'})
    assert not can_merge({**a,'category':'transit'},{**a,'category':'transit'})
    assert not can_merge({**a,'wheelchair':True},{**a,'wheelchair':False})
    assert tri(None) is None and tri('limited') is None and tri('no') is False

def test_osm_preserves_private_access_and_unknown_changing():
    row=osm_record({'type':'node','id':1,'lat':45.7578,'lon':4.832,'tags':{'amenity':'toilets','access':'customers','changing_table':'no'}},{'retrieved_at':'2026-09-08'})
    assert row[1]['access']=='customers' and row[1]['changing_table'] is False and row[1]['wheelchair'] is None

def test_snapshot_checkpoint_does_not_lose_concurrent_edits(client):
    h,_=account(client,'parent-one');p=place(client,h)
    snapshot=client.get('/v1/bootstrap?limit=1').json()
    assert snapshot['places'][0]['name']=='Square test'
    operation(client,h,'place.edit',payload={**p,'name':'Nouveau nom'},base_version=1)
    changes=client.get('/v1/sync?cursor='+str(snapshot['revision'])).json()
    assert changes['changes'][0]['place']['name']=='Nouveau nom'

def test_activity_validation_and_read_revision(client):
    h,_=account(client,'parent-one')
    payload={'name':'Bébé gym','category':'child_activity','lat':45.7578,'lon':4.832,'activity_type':'Bébé gym','website':'https://example.org/atelier','description':'Atelier parent enfant'}
    assert operation(client,h,'place.create',payload=payload)[0].status_code==200
    created=client.get('/v1/places/test-place').json()
    assert created['information_validated'] and created['validated_at']
    assert operation(client,h,'place.validate',payload={'value':True},base_version=1)[0].status_code==200
    valid=client.get('/v1/places/test-place').json()
    assert valid['information_validated'] and valid['validated_at']
    assert operation(client,h,'place.validate',payload={'value':False},base_version=1)[0].status_code==409
    assert operation(client,h,'place.edit',payload={**payload,'description':'Nouvelle précision'},base_version=2)[0].status_code==200
    changed=client.get('/v1/places/test-place').json()
    assert changed['information_validated'] and changed['validated_at']>=valid['validated_at']
    assert operation(client,h,'place.edit',payload={**payload,'website':'javascript:alert(1)'},base_version=3)[0].status_code==422

def test_photo_compression_target():
    from cailloute.main import photo_bytes
    image=Image.effect_noise((1600,1200),100).convert('RGB')
    raw=io.BytesIO();image.save(raw,format='JPEG',quality=92)
    result=photo_bytes(base64.b64encode(raw.getvalue()).decode())
    assert len(result)<=40_000
    with Image.open(io.BytesIO(result)) as decoded:
        assert decoded.format == 'WEBP'
        assert max(decoded.size) <= 960
        assert abs(decoded.width/decoded.height - 1600/1200)<.005
        assert not decoded.getexif()

def test_contributor_deletion_is_immediate_permanent_and_idempotent(client):
    from cailloute.db import ExcludedPlace,ContributionStats,Audit,Receipt
    h,uid=account(client,'contributor');place(client,h)
    r,op=operation(client,h,'place.delete')
    assert r.status_code==200,r.text
    assert client.get('/v1/places/test-place').status_code==404
    assert client.post('/v1/operations',headers=h,json=op).status_code==200
    with Session() as s:
        assert s.get(Place,'test-place') is None
        assert s.get(ExcludedPlace,'test-place') is not None
        assert s.get(ContributionStats,uid).added==1
        assert all(row.data=={'id':'test-place','deleted':True} for row in s.query(Change))
        assert not s.query(Audit).all()
    assert operation(client,h,'place.create',payload={'name':'Revient','category':'toilet','lat':45.75,'lon':4.83})[0].status_code==409

def test_admin_has_no_daily_deletion_limit(client):
    from cailloute.db import User
    h,uid=account(client,'contributor')
    with Session.begin() as s:s.get(User,uid).role='admin'
    data={'name':'Lieu test','category':'toilet','lat':45.75,'lon':4.83}
    for i in range(3):assert operation(client,h,'place.create',str(i),data)[0].status_code==200
    for i in range(2):assert operation(client,h,'place.delete',str(i))[0].status_code==200
    assert operation(client,h,'place.delete','2')[0].status_code==200
    assert client.get('/v1/places/2').status_code==404

def test_health_and_mixed_family_shop(client):
    h,_=account(client,'parent-one')
    for kind in ('doctor','pharmacy','emergency'):
        payload={'name':'Santé '+kind,'category':'health','health_type':kind,'lat':45.76,'lon':4.84,'website':'https://example.org'}
        r,_=operation(client,h,'place.create',place_id='health-'+kind,payload=payload)
        assert r.status_code==200,r.text
        assert client.get('/v1/places/health-'+kind).json()['health_type']==kind
    p={'name':'Hypermarché famille','category':'food_shop','lat':45.76,'lon':4.84,'children_clothes':True,'baby_food':True}
    r,_=operation(client,h,'place.create',place_id='family-store',payload=p)
    assert r.status_code==200,r.text
    p['children_clothes']=False
    r,_=operation(client,h,'place.edit',place_id='family-store',payload=p,base_version=1)
    assert r.status_code==200,r.text
    d=client.get('/v1/places/family-store').json()
    assert d['children_clothes'] is False and d['baby_food'] is True


def test_minimal_unclassified_photo_place(client):
    h,_=account(client,'parent-photos')
    payload={'name':'Lieu à classer','category':'other','lat':45.75833333,'lon':4.83222222}
    r,_=operation(client,h,'place.create',place_id='photo-place',payload=payload)
    assert r.status_code==200,r.text
    detail=client.get('/v1/places/photo-place').json()
    assert detail['category']=='other'
    assert detail['name']=='Lieu à classer'
    assert detail['free'] is None
    assert detail['lat']==payload['lat'] and detail['lon']==payload['lon']


def test_review_vote_switch_remove_and_legacy(client):
    author,_=account(client,'vote-author'); place(client,author)
    reader,reader_id=account(client,'vote-reader')
    operation(client,author,'review.save',payload={'stars':4,'text':'Avis à évaluer'})
    review_id=client.get('/v1/places/test-place').json()['reviews'][0]['id']
    def vote(value):
        return operation(client,reader,'review.vote',payload={'review_id':review_id,'value':value})[0]
    def review():
        return client.get('/v1/places/test-place').json()['reviews'][0]
    assert vote(True).status_code==200  # Compatibilité avec les contributions déjà en attente.
    assert review()['votes']==1
    assert vote(-1).status_code==200
    assert review()['votes']==0 and review()['downvotes']==1
    assert review()['downvoters']==[reader_id] and review()['voters']==[]
    assert vote(-1).status_code==200 and review()['downvotes']==1
    assert vote(1).status_code==200
    assert review()['votes']==1 and review()['downvotes']==0
    assert vote(0).status_code==200
    assert review()['votes']==0 and review()['downvotes']==0
    assert vote(1).status_code==200 and vote(False).status_code==200
    assert review()['votes']==0
    for invalid in (2, '1', None, 1.5):
        assert vote(invalid).status_code==422
    assert operation(client,author,'review.vote',payload={'review_id':review_id,'value':-1})[0].status_code==422


def test_legacy_vote_migration(tmp_path, monkeypatch):
    from sqlalchemy import create_engine, text
    import cailloute.db as database
    legacy=create_engine('sqlite:///'+str(tmp_path/'legacy.db'))
    with legacy.begin() as connection:
        connection.execute(text('CREATE TABLE votes (review_id VARCHAR(40), user_id VARCHAR(40), PRIMARY KEY (review_id,user_id))'))
        connection.execute(text("INSERT INTO votes VALUES ('review','reader')"))
    monkeypatch.setattr(database,'engine',legacy)
    database.init(); database.init()  # Réexécutable sans modifier les votes existants.
    with legacy.connect() as connection:
        assert connection.execute(text('SELECT value FROM votes')).scalar()==1
    legacy.dispose()

def test_pediatric_health_field(client):
    h,_=account(client,'parent-pediatric')
    payload={'name':'Pédiatre test','category':'health','health_type':'doctor','pediatric':True,'lat':45.7578,'lon':4.832}
    assert operation(client,h,'place.create',payload=payload)[0].status_code==200
    assert client.get('/v1/places/test-place').json()['pediatric'] is True
    assert operation(client,h,'place.edit',payload={**payload,'health_type':'emergency','pediatric':None},base_version=1)[0].status_code==200
    assert client.get('/v1/places/test-place').json()['pediatric'] is None
    assert operation(client,h,'place.edit',payload={**payload,'pediatric':'yes'},base_version=2)[0].status_code==422

def test_photo_counts_follow_add_delete_and_account_removal(client):
    h,_=account(client,'photo-parent');place(client,h)
    image=Image.new('RGB',(16,16),'green');out=io.BytesIO();image.save(out,format='JPEG')
    payload={'base64':base64.b64encode(out.getvalue()).decode()}
    assert operation(client,h,'photo.add',payload=payload)[0].status_code==200
    detail=client.get('/v1/places/test-place').json()
    assert detail['photo_count']==1
    assert operation(client,h,'photo.delete',payload={'photo_id':detail['photos'][0]['id']})[0].status_code==200
    assert client.get('/v1/places/test-place').json()['photo_count']==0
    assert operation(client,h,'photo.add',payload=payload)[0].status_code==200
    assert client.delete('/v1/me',headers=h).status_code==200
    assert client.get('/v1/places/test-place').json()['photo_count']==0
