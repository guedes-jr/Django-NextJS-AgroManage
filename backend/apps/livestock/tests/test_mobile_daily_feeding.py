from uuid import uuid4
from decimal import Decimal
from datetime import timedelta
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from apps.inventory.models import ConsumoRacao, MovimentacaoEstoque
from apps.farms.models import Farm
from apps.livestock.models import AnimalBatch, HistoricoEvento
from .cattle_feeding_fixtures import CattleFeedingFixture

class MobileDailyFeedingTests(CattleFeedingFixture, APITestCase):
    def get(self, **params):
        return self.client.get(self.url, dict(view='mobile', production='beef', **params))

    def test_paged_resources_scope_and_prices(self):
        self.batch.cattle_purpose='beef';self.batch.save()
        dairy=AnimalBatch.objects.create(farm=self.farm,species=self.species,batch_code='MILK',quantity=5,entry_date=self.today,cattle_purpose='dairy')
        result=self.get(page_size=1)
        self.assertEqual(result.status_code,200,result.data)
        self.assertEqual(result.data['count'],1)
        self.assertEqual(result.data['results'][0]['id'],str(self.batch.pk))
        self.assertIn('timezone',result.data)
        for kind in ['batches','products','formulas']:
            response=self.get(resource=kind)
            self.assertEqual(response.status_code,200,response.data)
            self.assertNotIn('custo',str(response.data));self.assertNotIn('cost',str(response.data))
        self.assertEqual(self.get(batch=str(dairy.pk)).data['count'],0)
        self.assertEqual(self.get(resource='deliveries').status_code,400)
        self.assertEqual(self.client.get(self.url,{'view':'mobile','production':'invalid'}).status_code,400)
        self.assertEqual(self.get(farm='invalid').status_code,400)

    def test_stable_key_same_payload_actor_and_context(self):
        self.batch.cattle_purpose='beef';self.batch.save()
        values=self.values(production='beef',farm=str(self.farm.pk),request_key=str(uuid4()))
        first=self.client.post(self.url,values,format='json')
        self.assertEqual(first.status_code,201,first.data)
        replay=self.client.post(self.url,values,format='json');self.assertEqual(replay.data,first.data)
        self.assertEqual(ConsumoRacao.objects.count(),1);self.assertEqual(MovimentacaoEstoque.objects.count(),1)
        self.assertEqual(self.client.post(self.url,{**values,'notes':'Outro'},format='json').status_code,400)
        deliveries=self.get(resource='deliveries',batch=str(self.batch.pk))
        self.assertEqual(deliveries.data['results'][0]['id'],first.data['id'])
        self.assertEqual(Decimal(self.get().data['results'][0]['supplied_kg']),Decimal('5.00'))
        actor=get_user_model().objects.create_user(email='other-feeder@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(actor)
        self.assertEqual(self.client.post(self.url,values,format='json').status_code,400)
        self.assertEqual(ConsumoRacao.objects.count(),1)

    def test_reconciliation_replays_original_after_day_rollover_or_formula_change(self):
        values=self.values(production=self.batch.cattle_purpose)
        # A dual batch uses an explicit client context.
        values['production']='beef'
        self.batch.cattle_purpose='dual';self.batch.save()
        first=self.client.post(self.url,values,format='json');self.assertEqual(first.status_code,201,first.data)
        self.formula.ativa=False;self.formula.save()
        from unittest.mock import patch
        with patch('apps.livestock.cattle_feeding.timezone.localdate',return_value=self.today+timedelta(days=1)):
            replay=self.client.post(self.url,values,format='json')
        self.assertEqual(replay.data,first.data)
        self.assertEqual(ConsumoRacao.objects.count(),1)

    def test_wrong_farm_production_and_unknown_product_roll_back(self):
        self.batch.cattle_purpose='dairy';self.batch.save()
        other=Farm.objects.create(organization=self.org,name='Outra')
        for change in [{'production':'beef'},{'production':'dairy','farm':str(other.pk)},{'item':str(uuid4())},{'quantity_kg':'101'}]:
            response=self.client.post(self.url,self.values(**change),format='json')
            self.assertIn(response.status_code,[400,404],response.data)
        self.assertFalse(ConsumoRacao.objects.exists());self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertFalse(HistoricoEvento.objects.filter(tipo_evento='Fornecimento de ração').exists())

    def test_mobile_roles_queries_and_legacy_shape_remain_separate(self):
        legacy=self.client.get(self.url)
        self.assertIn('formulas',legacy.data);self.assertNotIn('count',legacy.data)
        self.user.role='operator';self.user.save()
        self.assertEqual(self.get().status_code,200)
        self.assertEqual(self.client.post(self.url,self.values(),format='json').status_code,403)
        self.user.role='feeder';self.user.operator_read_only=True;self.user.save()
        self.assertEqual(self.get().status_code,200)
        self.assertEqual(self.client.post(self.url,self.values(),format='json').status_code,403)
        self.user.allowed_livestock.clear();self.assertEqual(self.get().status_code,403)

    def test_history_failure_rolls_back_consumption_and_stock(self):
        from unittest.mock import patch
        with patch.object(HistoricoEvento.objects,'create',side_effect=RuntimeError('synthetic audit failure')):
            response=self.client.post(self.url,self.values(),format='json')
        self.assertEqual(response.status_code,500)
        self.assertFalse(ConsumoRacao.objects.exists());self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.lot.refresh_from_db();self.assertEqual(self.lot.quantidade_atual,100)

    def test_options_exclude_wrong_units_inactive_and_foreign_products(self):
        self.item.unidade_medida='saco';self.item.save()
        self.assertEqual(self.get(resource='products').data['count'],0)
        self.assertEqual(self.get(resource='formulas').data['count'],0)
        self.item.unidade_medida='kg';self.item.ativo=False;self.item.save()
        self.assertEqual(self.get(resource='products').data['count'],0)
        self.assertEqual(self.get(resource='formulas').data['count'],0)
