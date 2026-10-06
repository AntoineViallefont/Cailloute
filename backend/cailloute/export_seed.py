import json
from .db import ROOT,Session,Place,public_place
def main():
    with Session() as s:
        data=[public_place(p) for p in s.query(Place) if p.data.get('license_verified') and not p.data.get('redirect') and not p.data.get('hidden')]
    path=ROOT/'app/public/seed.json';path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    print(f'{len(data)} lieux à licence confirmée intégrés au paquet Android.')
if __name__=='__main__':main()
