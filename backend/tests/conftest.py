import os, tempfile
from pathlib import Path
import pytest
temporary=tempfile.TemporaryDirectory(prefix='cailloute-tests-')
os.environ['DATABASE_URL']='sqlite:///'+str(Path(temporary.name)/'test.db')
os.environ['DATA_DIR']=temporary.name
from cailloute.db import Base,engine
from cailloute.main import app
from cailloute.security import hits
from fastapi.testclient import TestClient
@pytest.fixture
def client():
    Base.metadata.drop_all(engine);Base.metadata.create_all(engine);hits.clear()
    with TestClient(app) as c: yield c
