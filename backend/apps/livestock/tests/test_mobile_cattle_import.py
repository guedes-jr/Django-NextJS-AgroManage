from unittest.mock import patch
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase
from apps.livestock.tests import test_cattle_improvements as fixture
from apps.livestock.models import Animal, Breed, Species, HistoricoEvento
from apps.tasks.models import Task

class MobileCattleImportTests(APITestCase):
    base=fixture.CattleImprovementTests.base
    animal=fixture.CattleImprovementTests.animal
    batch=fixture.CattleImprovementTests.batch
    import_row=fixture.CattleImprovementTests.import_row
    post=fixture.CattleImprovementTests.post
    setUp=fixture.CattleImprovementTests.setUp
    def csv(self,identifier='NEW'):return f'identifier;gender;category;entry_date;breed_name_input;initial_weight_kg;cattle_purpose\n{identifier};F;Vaca;{self.today};Raça nova;450.50;dairy'
    def preview(self,content=None,**changes):return self.client.post(self.base+'import-preview/?view=mobile',{'farm':str(self.farm.pk),'production':'dairy','csv':content or self.csv(),**changes},format='json')
    def test_valid_preview_is_strictly_readonly(self):
        before=[m.objects.count() for m in [Animal,Breed,Species,HistoricoEvento,Task]]
        with CaptureQueriesContext(connection) as queries:r=self.preview()
        self.assertEqual(r.status_code,200,r.data);self.assertEqual((r.data['total'],r.data['valid'],r.data['invalid']),(1,1,0));self.assertTrue(r.data['preview_only'])
        self.assertEqual(before,[m.objects.count() for m in [Animal,Breed,Species,HistoricoEvento,Task]])
        self.assertFalse(any(q['sql'].lstrip().upper().startswith(('INSERT','UPDATE','DELETE')) for q in queries))
        self.assertNotIn('purchase_value',' '.join(q['sql'] for q in queries))
        self.assertEqual(self.client.post(self.base+'import-confirm/?view=mobile',{'farm':str(self.farm.pk),'rows':[self.import_row()]},format='json').status_code,400)
    def test_bom_comma_quotes_crlf_multiline_and_physical_lines(self):
        text='\ufeffidentifier,gender,category,notes\r\nQ1,F,Vaca,"a,b\r\ncom ""aspas"""\r\n\r\nQ2,F,Vaca,ok'
        r=self.preview(text);self.assertEqual(r.status_code,200,r.data);self.assertEqual([row['line'] for row in r.data['rows']],[2,5]);self.assertEqual(r.data['rows'][0]['data']['notes'],'a,b\r\ncom "aspas"')
        self.assertEqual(r.data['purposes']['unknown'],2)
    def test_row_validation_duplicates_dates_gender_and_weights(self):
        content=f'identifier;gender;category;birth_date;entry_date;initial_weight_kg\nC1;F;Vaca;;;\nX;F;Vaca;;;\nX;F;Vaca;;;\nBAD;M;Vaca;;;\nFUT;F;Vaca;2999-01-01;;0'
        r=self.preview(content);self.assertEqual(r.status_code,200,r.data);self.assertEqual(r.data['valid'],1)
        self.assertIn('identifier',r.data['rows'][0]['errors']);self.assertIn('identifier',r.data['rows'][2]['errors']);self.assertFalse(r.data['rows'][3]['valid']);self.assertFalse(r.data['rows'][4]['valid'])
    def test_header_shape_unknown_columns_and_malformed_csv(self):
        for content in ['identifier;identifier\nx;x','identifier;purchase_value\nx;100','identifier;farm_id\nx;abc','name\nX','identifier;gender\nX','identifier\n"unterminated','identifier\n\n']:
            self.assertEqual(self.preview(content).status_code,400)
        self.assertEqual(self.preview('identifier\nX',rows=[]).status_code,400)
    def test_limits_and_constant_queries(self):
        with CaptureQueriesContext(connection) as one:self.preview()
        text='identifier;gender;category\n'+'\n'.join(f'NEW-{i};F;Vaca' for i in range(500))
        with CaptureQueriesContext(connection) as many:r=self.preview(text)
        self.assertEqual(r.status_code,200,r.data);self.assertEqual(r.data['valid'],500);self.assertEqual(len(one),len(many))
        self.assertEqual(self.preview(text+'\nOVER;F;Vaca').status_code,400)
        self.assertEqual(self.preview('x'*200001).status_code,400)
    def test_tenant_permissions_and_route_purpose_is_not_an_override(self):
        r=self.preview(self.csv('NEW'),production='beef');self.assertEqual(r.data['rows'][0]['data']['cattle_purpose'],'dairy')
        self.assertEqual(self.preview(farm=str(self.foreign.pk)).status_code,404)
        self.user.role='operator';self.user.allowed_livestock.add(self.species);self.user.save();self.assertEqual(self.preview().status_code,403)
        self.user.role='feeder';self.user.save();self.assertEqual(self.preview().status_code,403)
        self.client.force_authenticate(None);self.assertIn(self.preview().status_code,[401,403])
