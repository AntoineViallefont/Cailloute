import uuid,hashlib
from datetime import datetime,timedelta,timezone
from cailloute.db import Session,User,ContributionStats,AuthChallenge,Identity,TermsAcceptance,DailyActivity
from cailloute.france import in_france
from cailloute.main import PlaceInput
from test_collaboration import account,operation,place

def test_france_corse_not_neighbours():
    for p in [(48.8566,2.3522),(41.9192,8.7386),(42.6973,9.4509),(48.39,-4.486),(43.6047,1.4442)]:assert in_france(*p)
    for p in [(51.507,-.127),(-21.1,55.5),(46.2044,6.1432),(41.9,12.5),(float('nan'),4)]:assert not in_france(*p)

def test_website_normalization_and_unsafe_schemes():
    import pytest
    data={'name':'Test','category':'toilet','lat':45.75,'lon':4.83}
    assert PlaceInput(**data,website='exemple.fr/lieu').website=='https://exemple.fr/lieu'
    for url in ['javascript:alert(1)','ftp://x.fr','https://u:p@x.fr','pas un site']:
        with pytest.raises(ValueError):PlaceInput(**data,website=url)

def test_terms_required_for_public_contributions(client):
    r=client.post('/v1/auth/register',json={'username':'sans-accord','password':'test-cailloute-only-123'})
    h={'Authorization':'Bearer '+r.json()['token']}
    assert operation(client,h,'place.create',payload={'name':'Square','category':'toilet','lat':45.75,'lon':4.83})[0].status_code==428

def test_quotas_and_credit_not_farmed(client):
    h,uid=account(client,'parent');data=place(client,h)
    for i in range(10):
        version=client.get('/v1/places/test-place').json()['version']
        assert operation(client,h,'place.edit',payload={**data,'name':f'Square {i}'},base_version=version)[0].status_code==200
    assert operation(client,h,'place.edit',payload=data,base_version=11)[0].status_code==429
    assert client.get('/v1/me/rewards',headers=h).json()=={'added':1,'edited':0}
    with Session.begin() as s:
        s.get(User,uid).created=(datetime.now(timezone.utc)-timedelta(days=8)).isoformat()
        s.get(ContributionStats,uid).added=3
    assert client.get('/v1/me/limits',headers=h).json()=={'added':15,'edited':30,'deleted':5}

def test_photo_rights_cannot_be_bypassed(client):
    h,_=account(client,'parent');place(client,h)
    r=client.post('/v1/operations',headers=h,json={'id':str(uuid.uuid4()),'kind':'photo.add','place_id':'test-place','payload':{'base64':'abcd'}})
    assert r.status_code==422

def test_contact_keeps_recipient_private_and_uses_server_config(client,monkeypatch):
    import cailloute.contact as contact
    monkeypatch.setenv('SMTP_HOST','smtp.example.test');monkeypatch.setenv('SMTP_FROM','sender@example.test');monkeypatch.setenv('CONTACT_TO','private@example.test')
    sent=[];monkeypatch.setattr(contact,'send_mail',lambda *args:sent.append(args))
    assert 'private@example.test' not in client.get('/v1/contact/config').text
    r=client.post('/v1/contact',json={'subject':'Question','message':'Bonjour, un problème de lieu.','email':'reply@example.test'})
    assert r.status_code==200 and sent[0][0]=='private@example.test'
    assert client.post('/v1/contact',json={'subject':'A\r\nB','message':'Bonjour à tous !'}).status_code==422

def test_email_code_is_hashed_one_use_and_account_deleted(client,monkeypatch):
    import cailloute.accounts as a,re
    monkeypatch.setenv('IDENTITY_SECRET','x'*40);monkeypatch.setattr(a,'mail_ready',lambda:True)
    messages=[];monkeypatch.setattr(a,'send_mail',lambda *args:messages.append(args))
    r=client.post('/v1/auth/email/start',json={'email':'test@example.fr','terms':'2026-09-16.2'});assert r.status_code==200,r.text
    challenge=r.json()['challenge'];code=re.search(r'\d{8}',messages[0][2])[0]
    with Session() as s:
        row=s.get(AuthChallenge,hashlib.sha256(challenge.encode()).hexdigest());assert 'test@example.fr' not in str(row.data) and code not in str(row.data)
    r=client.post('/v1/auth/email/verify',json={'challenge':challenge,'code':code});assert r.status_code==200,r.text
    assert client.post('/v1/auth/email/verify',json={'challenge':challenge,'code':code}).status_code==401
    assert client.delete('/v1/me',headers={'Authorization':'Bearer '+r.json()['token']}).status_code==200
    with Session() as s:assert not s.query(Identity).count() and not s.query(TermsAcceptance).count()

def test_email_attempt_limit_persists(client,monkeypatch):
    import cailloute.accounts as a,re
    monkeypatch.setenv('IDENTITY_SECRET','x'*40);monkeypatch.setattr(a,'mail_ready',lambda:True)
    messages=[];monkeypatch.setattr(a,'send_mail',lambda *args:messages.append(args))
    challenge=client.post('/v1/auth/email/start',json={'email':'test@example.fr','terms':'2026-09-16.2'}).json()['challenge']
    code=re.search(r'\d{8}',messages[0][2])[0];wrong='00000000' if code!='00000000' else '11111111'
    for i in range(5):assert client.post('/v1/auth/email/verify',json={'challenge':challenge,'code':wrong}).status_code==401
    assert client.post('/v1/auth/email/verify',json={'challenge':challenge,'code':code}).status_code==401

def test_oauth_one_use_and_secret_challenge(client,monkeypatch):
    import cailloute.accounts as a
    from urllib.parse import urlparse,parse_qs
    monkeypatch.setenv('IDENTITY_SECRET','x'*40);monkeypatch.setenv('PUBLIC_API_URL','https://api.example.test');monkeypatch.setenv('GOOGLE_CLIENT_ID','client');monkeypatch.setenv('GOOGLE_CLIENT_SECRET','secret')
    verifier='z'*64;challenge=hashlib.sha256(verifier.encode()).hexdigest()
    result=client.post('/v1/auth/oauth/start',json={'provider':'google','challenge':challenge,'terms':'2026-09-16.2'}).json()
    state=parse_qs(urlparse(result['url']).query)['state'][0]
    assert client.post('/v1/auth/oauth/finish',json={'flow':result['flow'],'verifier':'x'*64}).status_code==401
    assert client.post('/v1/auth/oauth/finish',json={'flow':result['flow'],'verifier':verifier}).json()=={'pending':True}
    class Response:
        def __init__(self,data):self.data=data
        def raise_for_status(self):pass
        def json(self):return self.data
    class HTTP:
        def __init__(self,**kw):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def post(self,*args,**kw):return Response({'access_token':'provider-secret'})
        def get(self,*args,**kw):return Response({'sub':'google-id','name':'Not stored','email':'not-stored@example.fr'})
    monkeypatch.setattr(a.httpx,'Client',HTTP)
    assert client.get('/v1/auth/oauth/callback',params={'state':state,'code':'valid'}).status_code==200
    done=client.post('/v1/auth/oauth/finish',json={'flow':result['flow'],'verifier':verifier});assert done.status_code==200,done.text
    assert 'Not stored' not in done.text and 'not-stored@example.fr' not in done.text
    assert client.post('/v1/auth/oauth/finish',json={'flow':result['flow'],'verifier':verifier}).status_code==401
    assert client.get('/v1/auth/oauth/callback',params={'state':state,'code':'valid'}).status_code==400

def test_three_established_reporters_hide_content(client):
    h,_=account(client,'author');place(client,h)
    for i in range(3):
        reporter,uid=account(client,'reporter-'+str(i))
        with Session.begin() as s:
            s.get(User,uid).created=(datetime.now(timezone.utc)-timedelta(days=8)).isoformat()
            s.add(ContributionStats(user_id=uid,added=3,edited=0))
        r,_=operation(client,reporter,'report.create',payload={'reason':'Ce lieu présente un problème à vérifier.'});assert r.status_code==200,r.text
        assert client.get('/v1/places/test-place').status_code==(404 if i==2 else 200)

def test_deletion_erases_redirect_chain_and_source_snapshots(client):
    from cailloute.db import Place,SourceRecord,Change,ExcludedPlace,Audit
    h,_=account(client,'parent');place(client,h)
    with Session.begin() as s:
        s.add(Place(id='alias1',data={'redirect':'test-place','name':'Ancien lieu secret'},override={},version=1))
        s.add(Place(id='alias2',data={'redirect':'alias1','name':'Autre ancienne fiche'},override={},version=1))
        s.add(SourceRecord(key='osm:node/1234',place_id='alias2',data={'name':'Ne doit pas rester'}))
        s.add(Change(place_id='alias2',data={'name':'Ancienne donnée'}))
    assert operation(client,h,'place.delete')[0].status_code==200
    with Session() as s:
        assert s.query(Place).count()==0 and s.query(SourceRecord).count()==0
        assert s.get(ExcludedPlace,'alias2')
        assert s.get(ExcludedPlace,'source:'+hashlib.sha256(b'osm:node/1234').hexdigest())
        assert all(set(c.data)<=set(('id','deleted')) for c in s.query(Change))
