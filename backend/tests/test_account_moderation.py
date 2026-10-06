from datetime import datetime, timedelta, timezone
from cailloute.db import Session, User, AccountDecision
from test_collaboration import account, operation, place

def scenario(client):
    author, author_id = account(client, 'author')
    reporter, reporter_id = account(client, 'reporter')
    editor, editor_id = account(client, 'editor')
    with Session.begin() as s:s.get(User,editor_id).role='admin'
    place(client,author)
    assert operation(client,author,'review.save',payload={'stars':4,'text':'Avis test pour la modération'})[0].status_code==200
    review=client.get('/v1/places/test-place').json()['reviews'][0]
    return author, author_id, reporter, editor, review

def report_user(client,reporter,review):
    r,op=operation(client,reporter,'report.create',payload={'review_id':review['id'],'scope':'author','category':'harassment','reason':'Comportement répété à examiner'})
    assert r.status_code==200,r.text
    return op['id'].replace('-','')

def test_private_blocks_are_reversible_do_not_suspend_and_require_login(client):
    author, ident, reporter, editor, review=scenario(client)
    assert client.post('/v1/me/blocks',json={'blocked_id':ident,'value':True}).status_code==401
    for _ in range(2):assert client.post('/v1/me/blocks',headers=reporter,json={'blocked_id':ident,'value':True}).status_code==200
    assert client.get('/v1/me/blocks',headers=reporter).json()['users']==[{'id':ident,'username':'author'}]
    assert client.get('/v1/me/blocks',headers=editor).json()['users']==[]
    assert client.get('/v1/me/moderation',headers=author).json()['can_contribute']
    assert len(client.get('/v1/places/test-place').json()['reviews'])==1
    assert client.post('/v1/me/blocks',headers=reporter,json={'blocked_id':ident,'value':False}).status_code==200
    assert client.get('/v1/me/blocks',headers=reporter).json()['users']==[]

def test_only_editor_can_suspend_and_restriction_expires(client):
    author,ident,reporter,editor,review=scenario(client);rid=report_user(client,reporter,review)
    decision={'action':'suspend_7','reason':'Harcèlement confirmé après examen','review_updated':review['updated']}
    url='/v1/user-reports/'+rid+'/decision'
    assert client.get('/v1/user-reports',headers=reporter).status_code==403
    assert client.post(url,headers=reporter,json=decision).status_code==403
    assert client.post(url,headers=editor,json=decision).status_code==200
    assert client.post(url,headers=editor,json=decision).status_code==200
    assert operation(client,author,'review.save',payload={'stars':3,'text':'Tentative de publication'})[0].status_code==403
    assert client.get('/v1/places/test-place').status_code==200
    state=client.get('/v1/me/moderation',headers=author).json()
    assert not state['can_contribute'] and state['action']=='suspend_7' and state['reason']==decision['reason']
    assert len(state['decisions'])==1
    with Session.begin() as s:s.get(AccountDecision,state['decision_id']).until=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()
    assert client.get('/v1/me/moderation',headers=author).json()['can_contribute']
    assert operation(client,author,'review.save',payload={'stars':3,'text':'Reprise des publications'})[0].status_code==200

def test_user_reports_never_automatically_suspend_and_reject_changes_nothing(client):
    author,ident,reporter,editor,review=scenario(client)
    for i in range(3):
        member,_=account(client,'reporter-'+str(i));report_user(client,member,review)
    assert client.get('/v1/me/moderation',headers=author).json()['can_contribute']
    assert len(client.get('/v1/places/test-place').json()['reviews'])==1
    reports=client.get('/v1/user-reports',headers=editor).json()['reports']
    assert len(reports)==3 and client.get('/v1/review-reports',headers=editor).json()['reports']==[]
    assert client.post('/v1/user-reports/'+reports[0]['id']+'/decision',headers=editor,json={'action':'dismiss','reason':'Pas d’abus établi','review_updated':review['updated']}).status_code==200
    assert client.get('/v1/me/moderation',headers=author).json()['decisions']==[]

def test_ban_appeal_and_restoration_are_authorized_and_visible(client):
    author,ident,reporter,editor,review=scenario(client);rid=report_user(client,reporter,review)
    assert client.post('/v1/user-reports/'+rid+'/decision',headers=editor,json={'action':'ban','reason':'Abus graves confirmés','review_updated':review['updated']}).status_code==200
    state=client.get('/v1/me/moderation',headers=author).json()
    appeal={'decision_id':state['decision_id'],'message':'Je souhaite contester cette décision et fournir des éléments.'}
    assert client.post('/v1/me/appeals',headers=reporter,json=appeal).status_code==404
    assert client.post('/v1/me/appeals',headers=author,json=appeal).status_code==200
    assert client.post('/v1/me/appeals',headers=author,json=appeal).json()['already_sent']
    pending=client.get('/v1/moderation/appeals',headers=editor).json()['appeals'];assert len(pending)==1
    response={'restore':True,'response':'Après examen, les contributions sont rétablies.'}
    path='/v1/moderation/appeals/'+pending[0]['id']+'/decision'
    assert client.post(path,headers=author,json=response).status_code==403
    assert client.post(path,headers=editor,json=response).status_code==200
    assert client.get('/v1/me/moderation',headers=author).json()['can_contribute']
    assert client.get('/v1/me/moderation',headers=author).json()['appeals'][0]['response']==response['response']

def test_forged_author_report_and_stale_decision_rejected(client):
    author,ident,reporter,editor,review=scenario(client)
    assert operation(client,reporter,'report.create',payload={'scope':'author','review_id':'nonexistent','reason':'Un motif suffisamment long'})[0].status_code==404
    assert operation(client,author,'report.create',payload={'scope':'author','review_id':review['id'],'reason':'Signalement de soi-même'})[0].status_code==422
    rid=report_user(client,reporter,review)
    assert operation(client,author,'review.save',payload={'stars':5,'text':'Avis corrigé avant examen'})[0].status_code==200
    assert client.post('/v1/user-reports/'+rid+'/decision',headers=editor,json={'action':'warning','reason':'Avertissement motivé','review_updated':review['updated']}).status_code==409
