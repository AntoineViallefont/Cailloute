from datetime import datetime, timedelta, timezone
from cailloute.db import Session, User, Review, Report, ContributionStats
from test_collaboration import account, operation, place

def setup_review(client):
    author, author_id = account(client, 'author')
    editor, editor_id = account(client, 'editor')
    reporter, reporter_id = account(client, 'reporter')
    with Session.begin() as s: s.get(User, editor_id).role = 'admin'
    place(client, author)
    assert operation(client, author, 'review.save', payload={'stars': 2, 'text': 'Avis à examiner'})[0].status_code == 200
    review = client.get('/v1/places/test-place').json()['reviews'][0]
    result, op = operation(client, reporter, 'report.create', payload={'review_id': review['id'], 'reason': 'Propos abusifs dans cet avis'})
    assert result.status_code == 200
    report = client.get('/v1/review-reports', headers=editor).json()['reports'][0]
    return author, editor, reporter, review, report

def test_only_editor_can_read_and_decide_reports(client):
    author, editor, reporter, review, report = setup_review(client)
    assert client.get('/v1/review-reports').status_code == 401
    assert client.get('/v1/review-reports', headers=reporter).status_code == 403
    decision = {'approve': True, 'review_updated': review['updated']}
    assert client.post('/v1/review-reports/'+report['id']+'/decision', headers=reporter, json=decision).status_code == 403
    assert report['review']['text'] == 'Avis à examiner'
    assert report['reporter'] == 'reporter'
    assert len(client.get('/v1/places/test-place').json()['reviews']) == 1

def test_reject_keeps_review_and_approve_deletes_it_and_votes(client):
    author, editor, reporter, review, report = setup_review(client)
    path = '/v1/review-reports/'+report['id']+'/decision'
    rejected = {'approve': False, 'review_updated': review['updated']}
    assert client.post(path, headers=editor, json=rejected).status_code == 200
    assert client.post(path, headers=editor, json=rejected).status_code == 200
    assert len(client.get('/v1/places/test-place').json()['reviews']) == 1
    assert client.get('/v1/review-reports', headers=editor).json()['reports'] == []
    assert operation(client, reporter, 'review.vote', payload={'review_id': review['id'], 'value': -1})[0].status_code == 200
    assert operation(client, reporter, 'report.create', payload={'review_id': review['id'], 'reason': 'Autre signalement motivé'})[0].status_code == 200
    report = client.get('/v1/review-reports', headers=editor).json()['reports'][0]
    assert client.post('/v1/review-reports/'+report['id']+'/decision', headers=editor, json={'approve': True, 'review_updated': review['updated']}).status_code == 200
    detail = client.get('/v1/places/test-place').json()
    assert detail['reviews'] == [] and detail['review_count'] == 0 and detail['rating'] is None
    assert client.get('/v1/review-reports', headers=editor).json()['reports'] == []

def test_changed_review_requires_fresh_editor_review(client):
    author, editor, reporter, review, report = setup_review(client)
    assert operation(client, author, 'review.save', payload={'stars': 5, 'text': 'Commentaire corrigé'})[0].status_code == 200
    result = client.post('/v1/review-reports/'+report['id']+'/decision', headers=editor, json={'approve': True, 'review_updated': review['updated']})
    assert result.status_code == 409
    assert client.get('/v1/places/test-place').json()['reviews'][0]['text'] == 'Commentaire corrigé'

def test_three_established_reporters_do_not_hide_review(client):
    author, editor, reporter, review, report = setup_review(client)
    for i in range(3):
        h, uid = account(client, 'established-'+str(i))
        with Session.begin() as s:
            s.get(User, uid).created = (datetime.now(timezone.utc)-timedelta(days=8)).isoformat()
            s.add(ContributionStats(user_id=uid, added=3, edited=0))
        assert operation(client, h, 'report.create', payload={'review_id': review['id'], 'reason': 'Signalement à examiner'})[0].status_code == 200
    assert len(client.get('/v1/places/test-place').json()['reviews']) == 1
    assert len(client.get('/v1/review-reports', headers=editor).json()['reports']) == 4

def test_member_can_remove_another_members_photo_with_quota(client):
    import base64, io
    from PIL import Image
    author, _ = account(client, 'author')
    member, _ = account(client, 'member')
    place(client, author)
    out = io.BytesIO(); Image.new('RGB', (10, 10), 'green').save(out, format='JPEG')
    photo = {'base64': base64.b64encode(out.getvalue()).decode(), 'caption': 'Aire de jeux'}
    for i in range(3): assert operation(client, author, 'photo.add', payload=photo)[0].status_code == 200
    photos = client.get('/v1/places/test-place').json()['photos']
    for i, item in enumerate(photos):
        assert operation(client, member, 'photo.delete', payload={'photo_id': item['id']})[0].status_code == (200 if i<2 else 429)
    assert client.get('/v1/places/test-place').json()['photo_count'] == 1
