from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core import signing
from rest_framework.test import APITestCase
from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, FormulaRacao, FormulaIngrediente, ProducaoRacao, MovimentacaoEstoque
from apps.inventory import mobile_feed as feed
from apps.finance.models import Transaction

class MobileFeedTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name='Ração', slug='mobile-feed')
        self.other = Organization.objects.create(name='Outra', slug='mobile-feed-other')
        self.user = get_user_model().objects.create_user(email='feed@example.invalid', password='test', role='manager', organization=self.org)
        self.client.force_authenticate(self.user)
        self.a = self.item('Milho')
        self.b = self.item('Soja')
        self.final = self.item('Mistura', categoria='racao')
        self.today = timezone.localdate()
        self.la = self.lot(self.a, 'A', '100')
        self.lb = self.lot(self.b, 'B', '100')
        self.formula = FormulaRacao.objects.create(organization=self.org, nome='Fórmula', item_final=self.final, especie_animal='bovino')
        FormulaIngrediente.objects.create(formula=self.formula, item=self.a, percentual='70')
        FormulaIngrediente.objects.create(formula=self.formula, item=self.b, percentual='30')
        self.base='/api/v1/inventory/'

    def item(self, name, **kwargs):
        return ItemEstoque.objects.create(organization=self.org, nome=name, unidade_medida='kg', **kwargs)

    def lot(self, item, number, quantity, **kwargs):
        obj=LoteEstoque(item=item, numero_lote=number, data_entrada=timezone.localdate(), quantidade_inicial=quantity, quantidade_atual=quantity, custo_unitario='2', **kwargs)
        obj._skip_finance_transaction=True
        obj.save()
        return obj

    def values(self, **kwargs):
        return dict(dict(formula=str(self.formula.pk), quantidade_teorica='10.01', quantidade_real='9.50'), **kwargs)

    def preview(self, **kwargs):
        response=self.client.post(self.base+'producoes/mobile-preview/', self.values(**kwargs), format='json')
        self.assertEqual(response.status_code,200,response.data)
        return response.data

    def confirm(self, review):
        return self.client.post(self.base+'producoes/mobile-confirm/', {'preview_token':review['preview_token']}, format='json')

    def test_operational_reads_are_scoped_paginated_and_cost_free(self):
        foreign=FormulaRacao.objects.create(organization=self.other,nome='Oculta')
        response=self.client.get(self.base+'formulas/mobile/?search=Fórmula')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['count'],1)
        self.assertNotIn('custo',str(response.data))
        self.assertEqual(self.client.get(self.base+f'formulas/{foreign.pk}/mobile/').status_code,404)
        with self.assertNumQueries(3):
            # Count, formula/product join and ingredient/product join; independent of ingredients
            self.client.get(self.base+'formulas/mobile/')

    def test_review_is_read_only_precise_and_hides_cost_even_in_token(self):
        review=self.preview()
        self.assertEqual(sum(Decimal(row['quantidade']) for row in review['ingredientes']),Decimal('10.01'))
        self.assertFalse(ProducaoRacao.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertNotIn('custo',str(review))
        decoded=signing.loads(review['preview_token'],salt=feed.SALT)
        self.assertEqual(set(decoded),{'user','org','command','digest'})

    def test_confirm_exact_balances_receipt_and_no_payable(self):
        result=self.confirm(self.preview())
        self.assertEqual(result.status_code,201,result.data)
        production=ProducaoRacao.objects.get(pk=result.data['id'])
        self.assertEqual(production.responsavel,self.user)
        self.assertEqual(production.custo_total,Decimal('20.02'))
        self.assertEqual(LoteEstoque.objects.get(pk=result.data['lote']).quantidade_atual,Decimal('9.50'))
        self.assertEqual(MovimentacaoEstoque.objects.count(),3)
        self.assertFalse(Transaction.objects.exists())
        self.assertEqual(sum(MovimentacaoEstoque.objects.filter(tipo='consumo').values_list('quantidade',flat=True)),Decimal('10.01'))
        self.assertEqual(self.client.get(self.base+f'producoes/{production.pk}/mobile/').status_code,200)
        self.assertNotIn('custo',str(self.client.get(self.base+'producoes/mobile/').data))

    def test_changed_balance_formula_and_replay_conflict(self):
        review=self.preview()
        self.la.quantidade_atual=Decimal('99');self.la.save()
        self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview()
        self.formula.nome='Outra';self.formula.save()
        self.assertEqual(self.confirm(review).status_code,409)
        review=self.preview()
        self.assertEqual(self.confirm(review).status_code,201)
        self.assertEqual(self.confirm(review).status_code,409)
        self.assertEqual(ProducaoRacao.objects.count(),1)

    def test_expired_lots_excluded_and_fifo(self):
        self.la.data_validade=self.today-timedelta(days=1);self.la.save()
        self.assertEqual(self.client.post(self.base+'producoes/mobile-preview/',self.values(),format='json').status_code,400)
        a1=self.lot(self.a,'FIRST','2');a1.data_entrada=self.today-timedelta(days=2);a1.save()
        a2=self.lot(self.a,'SECOND','50')
        review=self.preview()
        ingredient=next(row for row in review['ingredientes'] if row['item']==str(self.a.pk))
        self.assertEqual([row['id'] for row in ingredient['lotes']],[str(a1.pk),str(a2.pk)])
        self.assertEqual(self.confirm(review).status_code,201)
        self.la.refresh_from_db();self.assertEqual(self.la.quantidade_atual,Decimal('100'))

    def test_invalid_and_foreign_productions(self):
        foreign=FormulaRacao.objects.create(organization=self.other,nome='Outra')
        for changes in [{'quantidade_teorica':'0'},{'quantidade_real':'0'},{'quantidade_real':'1.001'},{'quantidade_teorica':'NaN'},{'quantidade_teorica':'1000'},{'quantidade_teorica':'.01'},{'formula':str(foreign.pk)},{'farm':'injected'}]:
            self.assertIn(self.client.post(self.base+'producoes/mobile-preview/',self.values(**changes),format='json').status_code,(400,404))
        self.assertFalse(ProducaoRacao.objects.exists())

    def test_tampered_expired_foreign_and_password_review(self):
        review=self.preview()
        self.assertEqual(self.confirm({'preview_token':review['preview_token']+'x'}).status_code,409)
        with patch('django.core.signing.time.time',return_value=timezone.now().timestamp()+1000):
            self.assertEqual(self.confirm(review).status_code,409)
        actor=get_user_model().objects.create_user(email='feed2@example.invalid',password='test',role='manager',organization=self.org)
        self.client.force_authenticate(actor);self.assertEqual(self.confirm(review).status_code,403)
        self.user.force_password_change=True;self.user.save()
        self.client.force_authenticate(self.user);self.assertEqual(self.confirm(review).status_code,403)

    def test_formula_write_validation_atomic_and_concurrent(self):
        values={'nome':'Nova','descricao':'Teste','especie_animal':'bovino','item_final':str(self.final.pk),'ingredientes':[{'item':str(self.a.pk),'percentual':'70'},{'item':str(self.b.pk),'percentual':'30'}]}
        url=self.base+'formulas/mobile-save/'
        response=self.client.post(url,values,format='json');self.assertEqual(response.status_code,201,response.data)
        pk=response.data['id'];obj=FormulaRacao.objects.get(pk=pk)
        values.update(id=pk,expected_updated_at=obj.updated_at.isoformat(),nome='Editada')
        self.assertEqual(self.client.post(url,values,format='json').status_code,200)
        self.assertEqual(self.client.post(url,values,format='json').status_code,409)
        before=FormulaRacao.objects.count()
        values.pop('id');values.pop('expected_updated_at')
        for ingredients in [[],[{'item':str(self.a.pk),'percentual':'99'}],[{'item':str(self.a.pk),'percentual':'50'},{'item':str(self.a.pk),'percentual':'50'}],[{'item':str(self.final.pk),'percentual':'100'}]]:
            self.assertEqual(self.client.post(url,{**values,'ingredientes':ingredients},format='json').status_code,400)
        foreign=ItemEstoque.objects.create(organization=self.other,nome='Oculto',unidade_medida='kg')
        self.assertEqual(self.client.post(url,{**values,'item_final':str(foreign.pk)},format='json').status_code,400)
        self.assertEqual(FormulaRacao.objects.count(),before)

    def test_failure_rolls_back_all_stock_and_production(self):
        review=self.preview()
        with patch.object(MovimentacaoEstoque.objects,'create',side_effect=RuntimeError('synthetic rollback')):
            self.assertEqual(self.confirm(review).status_code, 500)
        self.assertFalse(ProducaoRacao.objects.exists())
        self.la.refresh_from_db();self.assertEqual(self.la.quantidade_atual,Decimal('100'))
        self.assertFalse(MovimentacaoEstoque.objects.exists())

    def test_restricted_roles_cannot_read_or_write_new_flow(self):
        for role in ['operator','feeder']:
            self.user.role=role;self.user.save();self.client.force_authenticate(self.user)
            self.assertEqual(self.client.get(self.base+'formulas/mobile/').status_code,403)
            self.assertEqual(self.client.get(self.base+'producoes/mobile/').status_code,403)
            self.assertEqual(self.client.post(self.base+'producoes/mobile-preview/',self.values(),format='json').status_code,403)

    def test_inactive_units_final_category_and_stock_overflow_are_rejected(self):
        url=self.base+'producoes/mobile-preview/'
        for target,field,value in [(self.a,'unidade_medida','saco'),(self.a,'ativo',False),(self.final,'categoria','outro'),(self.final,'unidade_medida','g'),(self.formula,'ativa',False)]:
            original=getattr(target,field);setattr(target,field,value);target.save()
            self.assertEqual(self.client.post(url,self.values(),format='json').status_code,400)
            setattr(target,field,original);target.save()
        self.lot(self.final,'FULL','99999999.99')
        self.assertEqual(self.client.post(url,self.values(),format='json').status_code,400)
        self.assertFalse(ProducaoRacao.objects.exists())

    def test_unknown_lot_cost_reuses_existing_weighted_average_semantics(self):
        self.la.custo_unitario=None;self.la.save()
        self.lot(self.a,'KNOWN','100')
        # Average active product cost = 1/kg. Unknown-cost lot is first in FIFO.
        self.la.data_entrada=self.today-timedelta(days=1);self.la.save()
        result=self.confirm(self.preview(quantidade_teorica='10.00',quantidade_real='10.00'))
        self.assertEqual(result.status_code,201,result.data)
        self.assertEqual(ProducaoRacao.objects.get(pk=result.data['id']).custo_total,Decimal('13.00'))

    def test_formula_edit_rolls_back_scalar_and_ingredient_replacement(self):
        values={'id':str(self.formula.pk),'expected_updated_at':self.formula.updated_at.isoformat(),'nome':'Editada','item_final':str(self.final.pk),'ingredientes':[{'item':str(self.a.pk),'percentual':'100'}]}
        with patch.object(FormulaIngrediente.objects,'bulk_create',side_effect=RuntimeError('synthetic storage failure')):
            result=self.client.post(self.base+'formulas/mobile-save/',values,format='json')
        self.assertEqual(result.status_code,500)
        self.formula.refresh_from_db();self.assertEqual(self.formula.nome,'Fórmula')
        self.assertEqual(self.formula.ingredientes.count(),2)
