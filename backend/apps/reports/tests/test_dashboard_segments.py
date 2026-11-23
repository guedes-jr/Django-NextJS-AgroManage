from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.inventory.models import ConsumoRacao, ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.finance.models import FinancialCategory, Transaction
from apps.farms.models import Farm
from apps.livestock.models import AnimalBatch, Species
from apps.organizations.models import Organization

User = get_user_model()


class DashboardSegmentTestCase(APITestCase):
    def setUp(self):
        self.organization = Organization.objects.create(
            name="Dashboard Agrícola", slug="dashboard-agricola"
        )
        self.user = User.objects.create_user(role="admin",
            email="dashboard-agricola@example.com",
            password="Password-8472",
            full_name="Dashboard Agrícola",
            organization=self.organization,
        )
        self.client.force_authenticate(self.user)
        self.farm = Farm.objects.create(
            organization=self.organization,
            name="Fazenda Dashboard",
        )

    def test_livestock_cards_follow_segments_not_herds(self):
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        cards = response.data["segments"]["livestock_by_species"]
        self.assertEqual([card["code"] for card in cards], ["suinos", "gado-de-corte", "pecuaria-leiteira"])
        self.assertEqual([card["cost"] for card in cards], [0.0, 0.0, 0.0])

    def test_beef_and_dairy_cards_keep_their_own_values(self):
        cattle, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        expense = FinancialCategory.objects.create(organization=self.organization, name="Compra de Animais", category_type="expense")
        revenue = FinancialCategory.objects.create(organization=self.organization, name="Venda de leite", category_type="revenue")
        lots = {}
        for code, purpose, amount in (("CORTE-1", "beef", "7000"), ("LEITE-1", "dairy", "3000"), ("SEM-1", "unknown", "900")):
            lots[purpose] = AnimalBatch.objects.create(farm=self.farm, species=cattle, batch_code=code, name=code,
                                                       quantity=10, entry_date=date.today(), cattle_purpose=purpose)
            Transaction.objects.create(organization=self.organization, category=expense, description=code, amount=Decimal(amount),
                                       due_date=date.today(), payment_date=date.today(), status="paid", animal_batch=lots[purpose])
        Transaction.objects.create(organization=self.organization, category=revenue, description="Leite", amount=Decimal("1200"),
                                   due_date=date.today(), payment_date=date.today(), status="paid", reference="SALE-MILK-TANK-1")

        cards = {card["code"]: card for card in self.client.get(reverse("dashboard-summary")).data["segments"]["livestock_by_species"]}
        self.assertEqual((cards["gado-de-corte"]["cost"], cards["gado-de-corte"]["revenue"]), (7000.0, 0.0))
        self.assertEqual((cards["pecuaria-leiteira"]["cost"], cards["pecuaria-leiteira"]["revenue"]), (3000.0, 1200.0))
        # The unclassified lot is in no card and is flagged to be fixed.
        self.assertEqual(cards["gado-de-corte"]["unclassified"], 1)

    def test_agricultural_stock_purchase_is_general_expense_not_crop_cost(self):
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Abamex",
            categoria="fertirrigacao",
            categorias=["fertirrigacao", "defensivo"],
            unidade_medida="l",
        )
        LoteEstoque.objects.create(
            item=item,
            numero_lote="AGR-001",
            quantidade_inicial=Decimal("5.00"),
            quantidade_atual=Decimal("5.00"),
            custo_unitario=Decimal("95.00"),
            data_entrada=date.today(),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 475.0)
        # Inputs only become crop cost when used in an operation.
        self.assertEqual(response.data["segments"]["crops"]["cost"], 0.0)
        self.assertEqual(response.data["segments"]["crops"]["cost_breakdown"], [])

    def test_animal_inventory_purchase_is_not_classified_as_crop_cost(self):
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Medicamento bovino",
            categoria="medicamento",
            categorias=["medicamento"],
            especie_animal="bovino",
            unidade_medida="unidade",
        )
        LoteEstoque.objects.create(
            item=item,
            numero_lote="VET-001",
            quantidade_inicial=Decimal("2.00"),
            quantidade_atual=Decimal("2.00"),
            custo_unitario=Decimal("50.00"),
            data_entrada=date.today(),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 100.0)
        self.assertEqual(response.data["segments"]["crops"]["cost"], 0.0)

    def test_legacy_agricultural_expense_without_cycle_is_not_crop_cost(self):
        category = FinancialCategory.objects.create(
            organization=self.organization,
            name="Compra de Insumos",
            category_type=FinancialCategory.CategoryType.EXPENSE,
        )
        Transaction.objects.create(
            organization=self.organization,
            category=category,
            description="Compra agrícola antiga",
            amount=Decimal("570.00"),
            due_date=date.today(),
            payment_date=date.today(),
            status=Transaction.Status.PAID,
            reference="NF-LEGADA-001",
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 570.0)
        self.assertEqual(response.data["segments"]["crops"]["cost"], 0.0)

    def test_swine_batch_purchase_appears_in_swine_segment(self):
        swine = Species.objects.create(name="Suínos", code="suinos")
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=swine,
            batch_code="SU-001",
            quantity=20,
            entry_date=date.today(),
            origin=AnimalBatch.Origin.PURCHASED,
            purchase_value=Decimal("1500.00"),
        )

        transaction = Transaction.objects.get(reference=f"PURCHASE-BATCH-{batch.id}")
        self.assertEqual(transaction.animal_batch_id, batch.id)
        self.assertEqual(transaction.species_id, swine.id)

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertEqual(swine_segment["code"], "suinos")
        self.assertEqual(swine_segment["cost"], 1500.0)
        self.assertEqual(
            swine_segment["cost_breakdown"],
            [{"name": "Compra de Animais", "value": 1500.0}],
        )

    def test_matrix_registration_updates_top_dashboard_cost_card(self):
        response = self.client.post(
            reverse("animalbatch-bulk-create-batches"),
            [{
                "batch_code": "MATRIZ-CADASTRO", "category": "Matriz",
                "quantity": 1, "gender": "F", "origin": "purchased",
                "purchase_value": "2800.00", "entry_date": date.today().isoformat(),
                "species_code_input": "suinos", "status": "active",
            }], format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 2800.0)
        self.assertEqual(response.data["segments"]["livestock"]["cost"], 2800.0)
        self.assertEqual(response.data["segments"]["livestock_by_species"][0]["cost"], 2800.0)

    def test_breeding_purchases_without_transactions_are_counted_once_in_period(self):
        swine = Species.objects.create(name="Suínos", code="suinos")
        for category, amount in [(AnimalBatch.Category.MATRIZ, "2000"),
                                 (AnimalBatch.Category.REPRODUTOR, "3000")]:
            batch = AnimalBatch.objects.create(
                farm=self.farm, species=swine, batch_code=category,
                category=category, quantity=1, entry_date=date.today(),
                origin=AnimalBatch.Origin.PURCHASED, purchase_value=Decimal(amount),
            )
            Transaction.objects.filter(reference=f"PURCHASE-BATCH-{batch.id}").delete()
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.data["kpis"]["month_expense"], 5000.0)
        self.assertEqual(response.data["segments"]["livestock_by_species"][0]["cost"], 5000.0)
        self.assertEqual(response.data["charts"]["revenue_vs_expense"][-1]["despesa"], 5000.0)
        response = self.client.get(reverse("dashboard-summary"), {"period": "month", "period_value": "2020-01"})
        self.assertEqual(response.data["kpis"]["month_expense"], 0.0)

    def test_breeding_purchase_added_later_updates_finance_without_duplicates(self):
        swine = Species.objects.create(name="Suínos", code="suinos")
        batch = AnimalBatch.objects.create(
            farm=self.farm, species=swine, batch_code="MATRIZ-EDIT",
            category=AnimalBatch.Category.MATRIZ, quantity=2,
            entry_date=date.today(), origin=AnimalBatch.Origin.PURCHASED,
        )
        batch.purchase_value = Decimal("4000")
        batch.save()
        batch.purchase_value = Decimal("4500")
        batch.save()
        purchase = Transaction.objects.get(reference=f"PURCHASE-BATCH-{batch.id}")
        self.assertEqual(purchase.amount, Decimal("4500"))
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.data["kpis"]["month_expense"], 4500.0)
        self.assertEqual(response.data["segments"]["livestock_by_species"][0]["cost"], 4500.0)
        purchase.status = Transaction.Status.CANCELLED
        purchase.save()
        batch.save()
        purchase.refresh_from_db()
        self.assertEqual(purchase.status, Transaction.Status.CANCELLED)
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.data["kpis"]["month_expense"], 0.0)

    def test_swine_inventory_purchase_is_general_expense_not_production_cost(self):
        Species.objects.create(name="Suínos", code="suinos")
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Vacina reprodutiva",
            categoria="vacina",
            categorias=["vacina"],
            especie_animal="suino",
            unidade_medida="ml",
        )
        LoteEstoque.objects.create(
            item=item,
            numero_lote="VAC-SU-001",
            quantidade_inicial=Decimal("50.00"),
            quantidade_atual=Decimal("50.00"),
            custo_unitario=Decimal("3.00"),
            data_entrada=date.today(),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertEqual(response.data["kpis"]["month_expense"], 150.0)
        self.assertEqual(swine_segment["cost"], 0.0)
        self.assertEqual(swine_segment["cost_breakdown"], [])

    def test_used_vaccine_value_appears_in_swine_dashboard(self):
        Species.objects.create(name="Suínos", code="suinos")
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Literguard",
            categoria="vacina",
            categorias=["vacina"],
            especie_animal="suino",
            unidade_medida="ml",
        )
        lot = LoteEstoque.objects.create(
            item=item,
            numero_lote="LITER-001",
            quantidade_inicial=Decimal("50.00"),
            quantidade_atual=Decimal("48.00"),
            custo_unitario=Decimal("3.00"),
            data_entrada=date.today(),
        )
        MovimentacaoEstoque.objects.create(
            item=item,
            lote=lot,
            tipo="consumo",
            quantidade=Decimal("2.00"),
            responsavel=self.user,
        )
        from apps.livestock.models import VaccinationRecord
        VaccinationRecord.objects.create(
            farm=self.farm,
            species=Species.objects.get(code="suinos"),
            vaccine_name="Literguard",
            vaccine_item=item,
            application_date=date.today(),
            inventory_cost_snapshot=Decimal("6.00"),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertEqual(response.data["kpis"]["month_expense"], 150.0)
        self.assertEqual(swine_segment["cost"], 6.0)
        self.assertIn(
            {"name": "Tratamento/Vacina: Literguard", "value": 6.0},
            swine_segment["cost_breakdown"],
        )

    def test_used_semen_value_and_doses_appear_in_swine_dashboard(self):
        Species.objects.create(name="Suínos", code="suinos")
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="AgroGen Convencional",
            categoria="semen",
            categorias=["semen"],
            especie_animal="suino",
            unidade_medida="dose",
        )
        lot = LoteEstoque.objects.create(
            item=item,
            numero_lote="SEM-SU-001",
            quantidade_inicial=Decimal("10.00"),
            quantidade_atual=Decimal("8.00"),
            custo_unitario=Decimal("25.00"),
            data_entrada=date.today(),
        )
        MovimentacaoEstoque.objects.create(
            item=item,
            lote=lot,
            tipo="consumo",
            quantidade=Decimal("2.00"),
            responsavel=self.user,
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertEqual(response.data["kpis"]["month_expense"], 250.0)
        self.assertEqual(swine_segment["cost"], 50.0)
        self.assertIn(
            {"name": "Sêmen: AgroGen Convencional — 2 doses", "value": 50.0},
            swine_segment["cost_breakdown"],
        )

    def test_used_semen_in_secondary_category_appears_in_swine_dashboard(self):
        Species.objects.create(name="Suínos", code="suinos")
        item = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Dose genética multiuso",
            categoria="material",
            categorias=["material", "semen"],
            especie_animal="suino",
            unidade_medida="dose",
        )
        lot = LoteEstoque.objects.create(
            item=item,
            numero_lote="SEM-MULTI-001",
            quantidade_inicial=Decimal("5.00"),
            quantidade_atual=Decimal("4.00"),
            custo_unitario=Decimal("30.00"),
            data_entrada=date.today(),
        )
        MovimentacaoEstoque.objects.create(
            item=item,
            lote=lot,
            tipo="consumo",
            quantidade=Decimal("1.00"),
            responsavel=self.user,
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertIn(
            {"name": "Sêmen: Dose genética multiuso — 1 dose", "value": 30.0},
            swine_segment["cost_breakdown"],
        )

    def test_animal_sale_appears_as_revenue_before_settlement(self):
        swine = Species.objects.create(name="Suínos", code="suinos")
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=swine,
            batch_code="SU-VENDA",
            quantity=10,
            entry_date=date.today(),
            exit_date=date.today(),
            phase="engorda",
            status=AnimalBatch.Status.SOLD,
            sale_value=Decimal("2500.00"),
        )
        revenue = Transaction.objects.get(reference=f"SALE-BATCH-{batch.id}")
        self.assertEqual(revenue.status, Transaction.Status.PENDING)

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_revenue"], 2500.0)
        self.assertEqual(response.data["segments"]["livestock"]["revenue"], 2500.0)
        self.assertEqual(
            response.data["segments"]["livestock_by_species"][0]["revenue"], 2500.0
        )

    def test_finishing_batch_purchase_appears_in_dashboard(self):
        swine = Species.objects.create(name="Suínos", code="suinos")
        AnimalBatch.objects.create(
            farm=self.farm,
            species=swine,
            batch_code="SU-ENGORDA",
            quantity=30,
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.ENGORDA,
            entry_date=date.today(),
            origin=AnimalBatch.Origin.PURCHASED,
            purchase_value=Decimal("3200.00"),
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 3200.0)
        self.assertEqual(response.data["segments"]["livestock"]["cost"], 3200.0)
        self.assertEqual(
            response.data["segments"]["livestock_by_species"][0]["cost"], 3200.0
        )

    def test_feed_purchase_and_consumption_are_not_double_counted(self):
        swine = Species.objects.create(name="Suínos", code="suinos")
        batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=swine,
            batch_code="SU-FEED-001",
            quantity=10,
            entry_date=date.today(),
        )
        feed = ItemEstoque.objects.create(
            organization=self.organization,
            nome="Ração crescimento",
            categoria="racao",
            categorias=["racao"],
            especie_animal="suino",
            unidade_medida="kg",
        )
        LoteEstoque.objects.create(
            item=feed,
            numero_lote="RACAO-001",
            quantidade_inicial=Decimal("1000.00"),
            quantidade_atual=Decimal("900.00"),
            custo_unitario=Decimal("9.00"),
            data_entrada=date.today(),
        )
        ConsumoRacao.objects.create(
            organization=self.organization,
            farm=self.farm,
            lote_animal=batch,
            item_estoque=feed,
            data_inicio=date.today(),
            data_fim=date.today(),
            quantidade=Decimal("100.00"),
            custo_unitario=Decimal("9.00"),
            custo_total=Decimal("900.00"),
            usuario=self.user,
        )

        response = self.client.get(reverse("dashboard-summary"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["kpis"]["month_expense"], 9000.0)
        swine_segment = response.data["segments"]["livestock_by_species"][0]
        self.assertEqual(swine_segment["cost"], 900.0)
        self.assertEqual(
            swine_segment["cost_breakdown"],
            [{"name": "Ração crescimento", "value": 900.0}],
        )

    def test_expense_card_sums_current_inventory_crop_cost_and_swine_cost(self):
        from apps.crops.models import Field, PlantingCycle

        today = date.today()
        field = Field.objects.create(farm=self.farm, name="Talhão", area_ha=1)
        crop = PlantingCycle.objects.create(organization=self.organization, farm=self.farm, field=field,
                                            name="Milho", crop_name="Milho", planting_date=today)
        swine, _ = Species.objects.get_or_create(code="suinos", defaults={"name": "Suínos"})
        cattle, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        category = FinancialCategory.objects.create(
            organization=self.organization, name="Despesa de teste", category_type="expense",
        )
        for amount, scope in [(30, {"planting_cycle": crop}), (40, {"species": swine}), (90, {"species": cattle})]:
            Transaction.objects.create(organization=self.organization, farm=self.farm, category=category,
                                       amount=amount, due_date=today, **scope)

        item = ItemEstoque.objects.create(organization=self.organization, nome="Insumo", unidade_medida="kg")
        lot = LoteEstoque(item=item, numero_lote="EST-01", quantidade_inicial=20, quantidade_atual=10,
                          custo_unitario=2, data_entrada=today)
        lot._skip_finance_transaction = True
        lot.save()
        response = self.client.get(reverse("dashboard-summary"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["kpis"]["dashboard_expense"], 90.0)
        self.assertEqual(response.data["kpis"]["month_expense"], 160.0)
