"""Each segment (Suinocultura, Gado de corte, Pecuária leiteira) has its own stock, feed and finance."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import FinancialCategory, Transaction
from apps.inventory.choices import cattle_segments, item_in_segments, segment_items_q
from apps.inventory.models import FormulaIngrediente, FormulaRacao, ItemEstoque, LoteEstoque
from apps.livestock.models import AnimalBatch, Species
from apps.organizations.models import Organization


class SegmentoTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Segmentos", slug="segmentos")
        self.user = get_user_model().objects.create_user(email="seg@example.invalid", password="Password-8472",
                                                         role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")

    def item(self, name, **kwargs):
        return ItemEstoque.objects.create(organization=self.org, nome=name, categoria="racao", unidade_medida="kg", **kwargs)

    def test_segment_sets_species_and_legacy_swine_gets_its_segment(self):
        self.assertEqual(self.item("Corte", segmento="gado-de-corte").especie_animal, "bovino")
        self.assertEqual(self.item("Suíno antigo", especie_animal="suino").segmento, "suinos")

    def test_items_of_one_segment_are_not_offered_to_another(self):
        beef = self.item("Ração corte", segmento="gado-de-corte")
        dairy = self.item("Ração leite", segmento="pecuaria-leiteira")
        swine = self.item("Ração suíno", segmento="suinos")
        general = self.item("Sal mineral")
        self.assertTrue(item_in_segments(beef, cattle_segments("beef")))
        self.assertFalse(item_in_segments(dairy, cattle_segments("beef")))
        self.assertFalse(item_in_segments(swine, cattle_segments("dairy")))
        self.assertTrue(item_in_segments(general, cattle_segments("dairy")))
        offered = set(ItemEstoque.objects.filter(segment_items_q("pecuaria-leiteira")).values_list("nome", flat=True))
        self.assertEqual(offered, {"Ração leite", "Sal mineral"})

    def test_produced_feed_belongs_to_the_formula_segment(self):
        corn = self.item("Milho")
        LoteEstoque.objects.create(item=corn, numero_lote="M1", data_entrada=date.today(), quantidade_inicial=Decimal("100"),
                                   quantidade_atual=Decimal("100"), custo_unitario=Decimal("1"))
        final = self.item("Ração suínos crescimento")
        formula = FormulaRacao.objects.create(organization=self.org, nome="Crescimento", segmento="suinos", item_final=final)
        FormulaIngrediente.objects.create(formula=formula, item=corn, percentual=Decimal("100"))
        response = self.client.post("/api/v1/inventory/producoes/produzir/", {
            "formula_id": str(formula.id), "quantidade_teorica": "10", "quantidade_real": "10",
        }, format="json")
        self.assertIn(response.status_code, (200, 201), response.data)
        final.refresh_from_db()
        self.assertEqual((final.segmento, final.especie_animal), ("suinos", "suino"))

    def test_finance_entry_follows_the_lot_purpose(self):
        cattle, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        lot = AnimalBatch.objects.create(farm=self.farm, species=cattle, batch_code="L1", name="L1", quantity=5,
                                         entry_date=date.today(), cattle_purpose="dairy")
        category = FinancialCategory.objects.create(organization=self.org, name="Despesa", category_type="expense")
        entry = Transaction.objects.create(organization=self.org, category=category, description="x", amount=Decimal("10"),
                                           due_date=date.today(), animal_batch=lot)
        self.assertEqual(entry.segmento, "pecuaria-leiteira")
        lot.cattle_purpose = "beef"
        lot.save()
        entry.save()
        self.assertEqual(entry.segmento, "gado-de-corte")
