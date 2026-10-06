"""Simulation prudente, Android uniquement. Aucun appel réseau, aucun service payant."""
import json, math, statistics
from pathlib import Path
GIB=2**30
QUOTAS={'reads_daily':50000,'writes_daily':20000,'firestore_egress_month_bytes':10*GIB,'firestore_storage_bytes':GIB,'hosting_egress_day_bytes':360000000}
SAFETY=0.20
# 40 000 octets WebP -> 53 336 octets base64 + 1 000 octets document/protocole.
PHOTO_BYTES=4*math.ceil(40000/3)+1000
scenarios=[]
for label,new_photos,other_bytes,target in [('léger',3,20000,800),('courant',9,50000,500),('intensif',18,50000,250)]:
 daily_bytes=new_photos*PHOTO_BYTES+other_bytes
 by_reads=math.floor(QUOTAS['reads_daily']*(1-SAFETY)/50)
 by_egress=math.floor(QUOTAS['firestore_egress_month_bytes']*(1-SAFETY)/(30*daily_bytes))
 scenarios.append({'usage':label,'new_photos_per_active_per_day':new_photos,'cached_photos_network_bytes':0,'assumed_average_reads_per_active_per_day':50,'other_document_bytes_per_active_per_day':other_bytes,'maximum_estimated_active_per_day':min(by_reads,by_egress),'recommended_active_per_day':target,'reads_per_day_at_target':target*50,'firestore_egress_GiB_per_month_at_target':round(target*30*daily_bytes/GIB,3)})
result={'platform':'Android','version':'0.1.42','billing_enabled':False,'quotas':QUOTAS,'sources':['https://firebase.google.com/docs/firestore/quotas','https://firebase.google.com/pricing'],'days_per_month':30,'safety_margin':SAFETY,'maximum_photo_bytes':40000,'estimated_firestore_bytes_per_new_photo':PHOTO_BYTES,'catalog_firebase_reads_per_search':0,'catalog_hosting_bytes_per_search':0,'assumptions':['Catalogue embarqué dans l’APK ; application distribuée par App Distribution, pas Hosting.','Nouvelle photo = téléchargement absent du cache, même si prise antérieurement.','50 lectures moyennes incluent un scénario prudent avec contributions et règles. Ce n’est pas un plafond garanti sur les actions explicites.','Aucun trafic d’autres projets/utilisateurs, aucun abus, un appareil par actif.','Le trafic mensuel et le stockage global peuvent saturer avant le quota de lectures.','Les quotas restent globaux ; marge de 20 %. Estimation, pas mesure de charge réelle.'],'scenarios':scenarios,'server_storage_caps':{'registered_members':5000,'shared_place_records':3000,'shared_photos':10000},'production_counters_read_2026_10_02':{'members':1,'places':29,'previews':30},'growth_example':{'daily_active':500,'contributing_fraction':0.05,'photos_per_contributor_per_day':2,'new_photos_per_day':50,'days_to_photo_cap_from_30':math.floor((10000-30)/50)},'remaining_constraints':['La modération et les ajouts consomment des lectures/écritures supplémentaires.','Les signalements, avis, index et comptes prennent aussi de la place : 10 000 photos ne garantissent pas à eux seuls de rester sous 1 GiB.','Les limites de quota suspendent les services ; facturation désactivée => pas de dépassement facturé.','Les fonds de carte et la météo utilisent leurs fournisseurs, hors Firebase.']}
sizes=[p.stat().st_size for p in Path('app/public/transit-france').rglob('*.json')]
if sizes:
 mean=round(statistics.mean(sizes))
 result['transit_hosting']={'files':len(sizes),'meanRawBytes':mean,'medianRawBytes':round(statistics.median(sizes)),'p95RawBytes':sorted(sizes)[int(.95*len(sizes))],'maxRawBytes':max(sizes),'assumed_new_route_files_per_active_per_day':2,'example_500_actives_hosting_MB_per_day':round(mean*2*500/1000000,2),'note':'Estimation en taille brute moyenne, sans réduction de compression ; tracés déjà enregistrés = aucun appel. Les trajets lourds/usage intensif peuvent consommer davantage.'}
path=Path('livraison/SIMULATION-GRATUIT-0.1.42.json');path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for row in scenarios:print(f"{row['usage']}: cible {row['recommended_active_per_day']}/jour, {row['firestore_egress_GiB_per_month_at_target']} GiB/mois, borne estimée {row['maximum_estimated_active_per_day']}/jour")
