import importlib.util
import unittest
import io
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
def module(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

catalog=module('catalog','enrich-open-catalog.py')
apply=module('apply','apply-open-enrichment.py')


class OpenEnrichmentTests(unittest.TestCase):
    def test_standard_commons_size(self):
        info={"url":"https://upload.wikimedia.org/wikipedia/commons/2/2a/Photo.jpg","width":3000}
        self.assertEqual(catalog.standard_thumbnail(info),'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Photo.jpg/960px-Photo.jpg')
        self.assertEqual(catalog.standard_thumbnail({**info,"width":500}),info["url"])
        self.assertEqual(catalog.standard_thumbnail({**info,"thumburl":"https://upload.wikimedia.org/already.jpg"}),'https://upload.wikimedia.org/already.jpg')

    def test_strict_name_and_position_match(self):
        element={"lat":45,"lon":4,"tags":{"name":"Musée du parc","tourism":"museum"}}
        place={"name":"Musée du parc","lat":45,"lon":4,"category":"child_activity","activity_type":"Musée"}
        self.assertEqual(catalog.strict_place_match(element,[place]),place)
        self.assertIsNone(catalog.strict_place_match(element,[place,{**place,"id":"another"}]))
        self.assertIsNone(catalog.strict_place_match(element,[{**place,"activity_type":"Parc"}]))
        self.assertIsNone(catalog.strict_place_match(element,[{**place,"lat":45.01}]))
        self.assertIsNone(catalog.strict_place_match(element,[{**place,"name":"Musée du bois"}]))

    def test_large_export_streaming(self):
        data={"type":"FeatureCollection","features":[{"properties":{"osm_id":"node/1"},"geometry":{"coordinates":[3,45]}} for _ in range(4000)]}
        rows=list(catalog.geojson_features(io.StringIO(json.dumps(data))))
        self.assertEqual(len(rows),4000)
        self.assertEqual(rows[0]["properties"]["osm_id"],"node/1")
        with self.assertRaises(ValueError):list(catalog.geojson_features(io.StringIO('{"features":[{"broken":')))

    def test_generic_description_only(self):
        row={"baseVersion":1,"expected":{"description":catalog.TOURISM_PLACEHOLDER},"patch":{"description":"Description publique du parc."}}
        self.assertEqual(apply.accepted_patch(row,{"version":1,"description":catalog.TOURISM_PLACEHOLDER}),row["patch"])
        self.assertEqual(apply.accepted_patch(row,{"version":1,"description":"Texte corrigé"}),{})
        self.assertEqual(catalog.public_description('Contacter Paul au 06 12 34 56 78.'),'')
        self.assertEqual(catalog.public_description('Contact : paul@example.org.'),'')

    def test_explicit_osm_values(self):
        self.assertEqual(catalog.osm_patch({'category':'playground','free':False,'wheelchair':False},{'fee':'no','wheelchair':'yes','opening_hours':'Mo-Fr 09:00-18:00','min_age':'3','max_age':'8'}),{'hours':'Mo-Fr 09:00-18:00','age':'3–8 ans'})
        self.assertEqual(catalog.osm_patch({}, {'wheelchair':'limited','fee':'unknown','organic':'only'}),{'organic':True})

    def test_age_never_invented(self):
        self.assertEqual(catalog.osm_patch({'category':'playground'},{'min_age':'enfant'}),{})
        self.assertEqual(catalog.osm_patch({'category':'playground'},{'min_age':'8','max_age':'3'}),{})
        self.assertEqual(catalog.osm_patch({'category':'food_shop'},{'min_age':'3','max_age':'8'}),{})

    def test_coordinates_and_category_required(self):
        entity={'descriptions':{'fr':{'value':'gare ferroviaire française'}},'claims':{'P625':[{'mainsnak':{'datavalue':{'value':{'latitude':45,'longitude':4,'globe':'http://www.wikidata.org/entity/Q2'}}}}]}}
        self.assertTrue(catalog.linked_entity({'category':'transit','lat':45,'lon':4},entity))
        self.assertFalse(catalog.linked_entity({'category':'transit','lat':46,'lon':4},entity))
        self.assertFalse(catalog.linked_entity({'category':'playground','lat':45,'lon':4},entity))
        self.assertFalse(catalog.linked_entity({'category':'transit','lat':45,'lon':4},{'claims':{}}))
        entity['descriptions']['fr']['value']='chaîne de supermarchés française'
        self.assertFalse(catalog.linked_entity({'category':'food_shop','lat':45,'lon':4},entity))

    def test_licenses_must_match(self):
        info={'descriptionurl':'https://commons.wikimedia.org/wiki/File:Image.jpg','thumburl':'https://upload.wikimedia.org/example.jpg','extmetadata':{'Artist':{'value':'<a>Auteur</a>'},'LicenseShortName':{'value':'CC BY-SA 4.0'},'LicenseUrl':{'value':'https://creativecommons.org/licenses/by-sa/4.0/'}}}
        self.assertEqual(catalog.licensed_photo(info)['author'],'Auteur')
        info['extmetadata']['LicenseShortName']['value']='CC BY-NC 4.0'
        self.assertIsNone(catalog.licensed_photo(info))
        info['extmetadata']['LicenseShortName']['value']='CC BY-SA 4.0'
        info['extmetadata']['LicenseUrl']['value']='https://creativecommons.org/licenses/by/4.0/'
        self.assertIsNone(catalog.licensed_photo(info))

    def test_existing_contributions_survive(self):
        row={'baseVersion':1,'expected':{'website':None,'wheelchair':None},'patch':{'website':'https://example.org/','wheelchair':True}}
        self.assertEqual(apply.accepted_patch(row,{'version':1,'website':'https://corrected.example/','wheelchair':False}),{})
        self.assertEqual(apply.accepted_patch(row,{'version':2}),{})
        self.assertEqual(apply.accepted_patch(row,{'version':1,'community':True}),{})
        self.assertEqual(apply.accepted_patch(row,{'version':1}),row['patch'])

    def test_missing_or_unapproved_plan_refused(self):
        for plan in [{},{'schema':1,'approved':False,'approvedAt':'2026-10-03','candidates':[]}]:
            with self.assertRaises(ValueError):apply.build_approved(plan,{})

    def test_unknown_fields_refused(self):
        with self.assertRaises(ValueError):apply.accepted_patch({'baseVersion':1,'expected':{'name':''},'patch':{'name':'Autre lieu'}},{'version':1})

    def test_private_or_executable_links_refused(self):
        for url in ['javascript:alert(1)','data:text/html,content','http://192.168.1.1','http://localhost','http://user:password@example.org']:
            self.assertEqual(catalog.safe_website(url),'')
        self.assertEqual(catalog.safe_website('www.example.org'),'https://www.example.org')

if __name__=='__main__':unittest.main()
