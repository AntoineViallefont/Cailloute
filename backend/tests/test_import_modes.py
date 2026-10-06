from cailloute.import_data import tcl_modes, osm_modes, osm_record, feature_record

M={'url':'https://example.com','license':'ODbL 1.0','retrieved_at':'2026-09-09'}
def test_transport_classification():
    assert tcl_modes(['A','C','T3','RX','C1','TB11','T36']) == ['metro','tram','bus']
    assert tcl_modes(['F1','F2','NAVI1','']) == []
    assert osm_modes({'railway':'station','train':'yes'}) == []
    assert osm_modes({'railway':'subway_entrance'}) == ['metro']

def test_tcl_preserves_negative_accessibility():
    record=feature_record('arrets_tcl',{'geometry':{'type':'Point','coordinates':[4.832,45.7578]},'properties':{'id':1,'nom':'Croix-Paquet','pmr':False,'desserte':'C:A,C:R'}},M)
    assert record[1]['transit_modes'] == ['metro']
    assert record[1]['wheelchair'] is False
    assert record[1]['transit_lines'] == ['C']

def test_changing_table_does_not_imply_toilets():
    entry={'type':'node','id':1,'lat':45.7578,'lon':4.832,'tags':{'changing_table':'yes'}}
    assert osm_record(entry,M)[1]['category'] == 'toilet'
    assert osm_record(entry,M)[1]['toilets_available'] is None
    entry['tags']['amenity']='toilets'
    assert osm_record(entry,M)[1]['toilets_available'] is True
