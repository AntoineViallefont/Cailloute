"""Reprise des seules ressources qui ont échoué, puis reconstruction de l’index."""
import importlib.util,json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor,as_completed
spec=importlib.util.spec_from_file_location('national',Path(__file__).with_name('import-national-transit.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
report=json.loads((m.DIR/'rapport.json').read_text());catalog=json.loads((m.DIR/'catalogue.json').read_text());by_id={r['datagouv_id']:(d,r) for d in catalog for r in d.get('resources',[])}
failed=[x for x in report['resources'] if x['status']=='failed'];results={x['resourceId']:x for x in report['resources']}
with ThreadPoolExecutor(max_workers=3) as pool:
 futures=[]
 for old in failed:
  d,r=by_id[old['resourceId']];r={**r,'url':r.get('original_url') or r['url']};futures.append(pool.submit(m.fetch,d,r))
 for f in as_completed(futures):
  result=f.result();results[result['resourceId']]=result;print(result['dataset'],result['status'],result.get('error',''),flush=True)
m.assemble(list(results.values()),report['skipped'])
