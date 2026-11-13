from uuid import uuid4
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.farms.models import Farm
from apps.livestock.models import MilkTank, MilkTankMovement, MilkTankQuality, CattleMilkDailyTotal, Species


class MobileTankWriteTests(APITestCase):
    base = '/api/v1/livestock/cattle/'

    def setUp(self):
        self.day = str(timezone.localdate())
        self.org = Organization.objects.create(name='Leite', slug='mobile-writes')
        self.farm = Farm.objects.create(organization=self.org, name='Leite')
        self.user = get_user_model().objects.create_user(email='writes@example.invalid', password='test', role='admin', organization=self.org)
        self.client.force_authenticate(self.user)
        self.tank = MilkTank.objects.create(farm=self.farm, name='T1', capacity_liters=500)
        CattleMilkDailyTotal.objects.create(farm=self.farm, date=self.day, liters=1000)
        self.query = f'?view=mobile&farm={self.farm.pk}&tank={self.tank.pk}'

    def move(self, **changes):
        data = dict(tank=str(self.tank.pk), kind='production', date=self.day, liters='100.00', request_key=str(uuid4()))
        data.update(changes)
        return data, self.client.post(self.base+'milk-tank-movements/'+self.query, data, format='json')

    def test_movement_receipt_scope_projection_and_idempotency(self):
        data, first = self.move()
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data['farm'], str(self.farm.pk))
        self.assertFalse({'amount','unit_price','receivable','request_key'} & set(first.data))
        again=self.client.post(self.base+'milk-tank-movements/'+self.query,data,format='json')
        self.assertEqual(again.data['id'],first.data['id'])
        self.assertEqual(self.client.post(self.base+'milk-tank-movements/'+self.query,{**data,'liters':'101.00'},format='json').status_code,409)
        receipt=self.client.get(self.base+'milk-tank-movements/receipt/'+self.query+'&request_key='+data['request_key'])
        self.assertEqual(receipt.data,first.data)
        self.assertEqual(MilkTankMovement.objects.count(),1)
        self.assertEqual(self.client.get(self.base+'milk-tank-movements/receipt/'+self.query+'&request_key='+str(uuid4())).status_code,404)

    def test_financial_fields_and_foreign_scope_rejected(self):
        for field,value in [('unit_price','1'),('generate_receivable',True),('amount','1'),('receivable',str(uuid4())),('due_date',self.day)]:
            _,response=self.move(**{field:value})
            self.assertEqual(response.status_code,400,response.data)
        other=Organization.objects.create(name='Outra',slug='mobile-writes-other')
        farm=Farm.objects.create(organization=other,name='Outra')
        tank=MilkTank.objects.create(farm=farm,name='T2',capacity_liters=100)
        _,response=self.move(tank=str(tank.pk))
        self.assertEqual(response.status_code,400)
        data,_=self.move()
        self.assertEqual(self.client.get(self.base+'milk-tank-movements/receipt/',{'view':'mobile','tank':str(self.tank.pk),'farm':str(farm.pk),'request_key':data['request_key']}).status_code,404)

    def test_ledger_rollback_and_cancel_permissions(self):
        _,response=self.move(liters='501.00')
        self.assertEqual(response.status_code,400)
        self.assertEqual(MilkTankMovement.objects.count(),0)
        _,response=self.move()
        url=self.base+f"milk-tank-movements/{response.data['id']}/cancel/"+self.query
        self.assertEqual(self.client.post(url,{'reason':''}).status_code,400)
        base=self.base+f"milk-tank-movements/{response.data['id']}/cancel/"
        self.assertEqual(self.client.post(base+'?view=mobile',{'reason':'Correção'}).status_code,400)
        self.assertEqual(self.client.post(base+f'?view=mobile&farm={self.farm.pk}&tank={uuid4()}',{'reason':'Correção'}).status_code,400)
        self.assertIsNone(MilkTankMovement.objects.get(pk=response.data['id']).cancelled_at)
        self.user.role='operator';self.user.save(update_fields=['role'])
        species,_=Species.objects.get_or_create(code='bovinos',defaults={'name':'Bovinos'})
        self.user.allowed_livestock.set([species])
        self.assertEqual(self.client.post(url,{'reason':'Conferência'}).status_code,403)
        self.user.role='admin';self.user.save(update_fields=['role'])
        response=self.client.post(url,{'reason':'Conferência'})
        self.assertEqual(response.status_code,200,response.data)
        self.assertTrue(response.data['cancelled_at'])
        self.assertNotIn('amount',response.data)

    def test_financial_cancel_remains_web_only(self):
        self.move()
        data=dict(tank=str(self.tank.pk),kind='collection',date=self.day,liters='20.00',buyer='Laticínio',unit_price='2',generate_receivable=True,request_key=str(uuid4()))
        response=self.client.post(self.base+'milk-tank-movements/',data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        url=self.base+f"milk-tank-movements/{response.data['id']}/cancel/"
        self.assertEqual(self.client.post(url+self.query,{'reason':'Correção'}).status_code,403)
        movement=MilkTankMovement.objects.get(pk=response.data['id'])
        self.assertIsNone(movement.cancelled_at)
        self.assertEqual(movement.receivable.status,'pending')
        self.assertEqual(self.client.post(url,{'reason':'Correção'}).status_code,200)
        priced=MilkTankMovement.objects.create(tank=self.tank,kind='collection',date=self.day,liters=10,amount=10,buyer='Valor manual',request_key=uuid4(),created_by=self.user)
        priced_url=self.base+f'milk-tank-movements/{priced.pk}/cancel/'+self.query
        self.assertEqual(self.client.post(priced_url,{'reason':'Correção'}).status_code,403)
        priced.refresh_from_db()
        self.assertIsNone(priced.cancelled_at)

    def test_quality_zero_null_and_key_receipt(self):
        url=self.base+'milk-tank-quality/'+self.query
        data=dict(tank=str(self.tank.pk),date=self.day,request_key=str(uuid4()),fat_percent='0.00',protein_percent=None,antibiotics='not_tested')
        response=self.client.post(url,data,format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['fat_percent'],'0.00')
        self.assertIsNone(response.data['protein_percent'])
        self.assertEqual(self.client.post(url,data,format='json').data['id'],response.data['id'])
        self.assertEqual(self.client.post(url,{**data,'fat_percent':'1.00'},format='json').status_code,409)
        self.assertEqual(self.client.get(self.base+'milk-tank-quality/receipt/'+self.query+'&request_key='+data['request_key']).data,response.data)
        self.assertEqual(MilkTankQuality.objects.count(),1)
        self.assertEqual(self.client.post(url,{**data,'request_key':str(uuid4()),'fat_percent':None},format='json').status_code,400)
