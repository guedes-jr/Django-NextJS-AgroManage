from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.inventory.models import ConsumoRacao, ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.livestock.models import (
    Animal, AnimalBatch, Birth, ClinicalRecord, HeatRecord, HistoricoEvento,
    Litter, LitterMedication, Mating, Pregnancy, Species,
)
from apps.organizations.models import Organization

User = get_user_model()


class LivestockTenantIsolationTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Rebanho A", slug="livestock-a-isolation")
        self.org_b = Organization.objects.create(name="Rebanho B", slug="livestock-b-isolation")
        self.user_a = User.objects.create_user(
            email="livestock-a@example.com", password="Password-8472", full_name="Rebanho A", organization=self.org_a
        )
        self.farm_a = Farm.objects.create(organization=self.org_a, name="Fazenda A")
        self.farm_b = Farm.objects.create(organization=self.org_b, name="Fazenda B")
        self.species = Species.objects.create(code="bovinos-isolation", name="Bovinos Isolamento")
        self.animal_a = Animal.objects.create(
            farm=self.farm_a, species=self.species, identifier="A-001", gender=Animal.Gender.FEMALE
        )
        self.animal_b = Animal.objects.create(
            farm=self.farm_b, species=self.species, identifier="B-001", gender=Animal.Gender.FEMALE
        )
        self.vaccine_b = ItemEstoque.objects.create(
            organization=self.org_b, nome="Vacina B", categoria="vacina", unidade_medida="dose"
        )
        self.clinical_b = ClinicalRecord.objects.create(
            farm=self.farm_b,
            animal=self.animal_b,
            record_type="consultation",
            record_date=date.today(),
            clinical_notes="Registro externo",
        )
        self.client.force_authenticate(self.user_a)

    def test_clinical_list_and_detail_hide_foreign_tenant(self):
        response = self.client.get(reverse("clinicalrecord-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.clinical_b.id), {str(item["id"]) for item in response.data["results"]})
        detail = self.client.get(reverse("clinicalrecord-detail", args=[self.clinical_b.id]))
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_clinical_record_with_foreign_farm_and_animal(self):
        response = self.client.post(
            reverse("clinicalrecord-list"),
            {
                "farm": self.farm_b.id,
                "animal": self.animal_b.id,
                "record_type": "consultation",
                "record_date": date.today().isoformat(),
                "clinical_notes": "Tentativa externa",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_foreign_vaccine_item(self):
        response = self.client.post(
            reverse("vaccination-list"),
            {
                "farm": self.farm_a.id,
                "species": self.species.id,
                "animal": self.animal_a.id,
                "vaccine_name": "Vacina externa",
                "vaccine_item_id": self.vaccine_b.id,
                "application_date": date.today().isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accepts_combined_medicine_vaccine_item_with_uuid(self):
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Vacina reprodutiva",
            categoria="medicamento_vacina",
            categorias=["medicamento_vacina"],
            unidade_medida="dose",
        )
        LoteEstoque.objects.create(
            item=vaccine,
            numero_lote="VAC-001",
            quantidade_inicial="10.00",
            quantidade_atual="10.00",
            data_entrada=date.today(),
        )

        response = self.client.post(
            reverse("vaccination-list"),
            {
                "farm": self.farm_a.id,
                "species": self.species.id,
                "animal": self.animal_a.id,
                "vaccine_item_id": vaccine.id,
                "vaccine_name": vaccine.nome,
                "application_date": date.today().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(str(response.data["vaccine_item"]), str(vaccine.id))
        self.assertEqual(response.data["species_code"], self.species.code)
        self.assertEqual(response.data["animal_identifier"], self.animal_a.identifier)
        self.assertEqual(response.data["dose_type_display"], "Dose Única")
        self.assertEqual(response.data["inventory_cost"], "0.00")

        list_response = self.client.get(
            reverse("vaccination-list"), {"species": self.species.code}
        )
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["results"][0]["animal_identifier"], self.animal_a.identifier)
        vaccine.lotes.get().refresh_from_db()
        self.assertEqual(vaccine.estoque_atual, 9)
        self.assertTrue(
            HistoricoEvento.objects.filter(
                matriz=self.animal_a,
                tipo_evento="Vacinação",
                metadata__vacina=vaccine.nome,
            ).exists()
        )
        from apps.livestock.views import build_animal_history
        self.assertTrue(
            any(event["type"] == "vaccination" for event in build_animal_history(self.animal_a))
        )

    def test_vaccination_deducts_applied_ml_from_inventory(self):
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Vacina líquida",
            categoria="vacina",
            unidade_medida="ml",
        )
        stock_batch = LoteEstoque.objects.create(
            item=vaccine,
            numero_lote="VAC-ML-001",
            quantidade_inicial=Decimal("100.00"),
            quantidade_atual=Decimal("100.00"),
            custo_unitario=Decimal("2.00"),
            data_entrada=date.today(),
        )

        response = self.client.post(
            reverse("vaccination-list"),
            {
                "farm": self.farm_a.id,
                "species": self.species.id,
                "animal": self.animal_a.id,
                "vaccine_item_id": vaccine.id,
                "vaccine_name": vaccine.nome,
                "application_date": date.today().isoformat(),
                "dosage_ml": "2.50",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["inventory_cost"], "5.00")
        stock_batch.refresh_from_db()
        self.assertEqual(stock_batch.quantidade_atual, 97.5)
        self.assertEqual(stock_batch.movimentacoes.get(tipo="consumo").quantidade, 2.5)

    def test_animal_vaccination_action_updates_sheet_inventory_and_report(self):
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Literguarde",
            categoria="vacina",
            unidade_medida="ml",
        )
        stock_batch = LoteEstoque.objects.create(
            item=vaccine,
            numero_lote="LITER-001",
            quantidade_inicial=Decimal("50.00"),
            quantidade_atual=Decimal("50.00"),
            custo_unitario=Decimal("3.00"),
            data_entrada=date.today(),
        )

        response = self.client.post(
            reverse("animal-register-vaccination", args=[self.animal_a.identifier.lower()]),
            {
                "vaccine_item_id": str(vaccine.id),
                "application_date": date.today().isoformat(),
                "dose_type": "unica",
                "dosage_ml": "2.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        stock_batch.refresh_from_db()
        self.assertEqual(stock_batch.quantidade_atual, Decimal("48.00"))
        self.assertTrue(self.animal_a.vaccinations.filter(
            vaccine_item=vaccine, dosage_ml=Decimal("2.00")
        ).exists())
        self.assertTrue(HistoricoEvento.objects.filter(
            matriz=self.animal_a, tipo_evento="Vacinação", metadata__vacina=vaccine.nome
        ).exists())

        report = self.client.get(
            reverse("vaccination-list"), {"species": self.species.code}
        )
        item = next(row for row in report.data["results"] if row["vaccine_name"] == vaccine.nome)
        self.assertEqual(item["dosage_ml"], "2.00")
        self.assertEqual(item["inventory_cost"], "6.00")

    def test_species_summary_aggregates_only_authenticated_organization(self):
        AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="A-LOTE",
            quantity=10,
            entry_date=date.today(),
            status=AnimalBatch.Status.ACTIVE,
            category=AnimalBatch.Category.MATRIZ,
        )
        AnimalBatch.objects.create(
            farm=self.farm_b,
            species=self.species,
            batch_code="B-LOTE",
            quantity=99,
            entry_date=date.today(),
            status=AnimalBatch.Status.ACTIVE,
            category=AnimalBatch.Category.MATRIZ,
        )
        self.animal_a.category = AnimalBatch.Category.MATRIZ
        self.animal_a.save(update_fields=["category"])

        response = self.client.get(reverse("species_summary"), {"species": self.species.code})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_animals"], 11)
        self.assertEqual(response.data["active_females"], 11)

    def test_batch_mortality_reduces_quantity_and_records_history(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="CRECHE-01",
            quantity=10,
            entry_date=date.today(),
            phase=AnimalBatch.Phase.CRECHE,
        )

        response = self.client.post(
            reverse("animalbatch-registrar-mortalidade", args=[batch.id]),
            {
                "quantidade": 2,
                "data": date.today().isoformat(),
                "causa": "DOENCA",
                "observacao": "Ocorrência confirmada pelo responsável.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        batch.refresh_from_db()
        self.assertEqual(batch.quantity, 8)
        history = HistoricoEvento.objects.get(lote=batch, tipo_evento="Mortalidade de Lote")
        self.assertEqual(history.metadata["quantidade_mortes"], 2)
        self.assertEqual(history.metadata["quantidade_atual"], 8)

    def test_batch_mortality_rejects_quantity_above_available(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="CRESC-01",
            quantity=3,
            entry_date=date.today(),
            phase=AnimalBatch.Phase.CRESCIMENTO,
        )

        response = self.client.post(
            reverse("animalbatch-registrar-mortalidade", args=[batch.id]),
            {"quantidade": 4, "causa": "DESCONHECIDA"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        batch.refresh_from_db()
        self.assertEqual(batch.quantity, 3)

    def test_reproduction_dashboard_alerts_upcoming_predicted_heat(self):
        predicted_date = date.today() + timedelta(days=15)
        HeatRecord.objects.create(
            animal=self.animal_a,
            heat_number=2,
            heat_date=predicted_date,
            is_predicted=True,
        )
        HeatRecord.objects.create(
            animal=self.animal_b,
            heat_number=2,
            heat_date=predicted_date,
            is_predicted=True,
        )

        response = self.client.get(
            reverse("reproduction_dashboard"), {"species": self.species.code}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        heat_alerts = [alert for alert in response.data["alerts"] if "2º cio" in alert["text"]]
        self.assertEqual(len(heat_alerts), 1)
        self.assertIn("1 novilha", heat_alerts[0]["text"])
        self.assertEqual(heat_alerts[0]["time"], "Em 15 dias")

        marras_response = self.client.get(
            reverse("marras"), {"species": self.species.code}
        )
        self.assertEqual(marras_response.status_code, status.HTTP_200_OK)
        tab_alerts = [
            alert for alert in marras_response.data["alerts"] if "2º cio" in alert["text"]
        ]
        self.assertEqual(len(tab_alerts), 1)
        self.assertIn("1 novilha", tab_alerts[0]["text"])

    def test_reproduction_alerts_include_scheduled_diagnosis_and_vaccine(self):
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Parvovirose",
            categoria="vacina",
            unidade_medida="dose",
        )
        self.animal_a.reproductive_status = Animal.ReproductiveStatus.COBERTA
        self.animal_a.save(update_fields=["reproductive_status"])
        mating = Mating.objects.create(
            female=self.animal_a,
            mating_date=date.today(),
            status=Mating.Status.PENDING_DG,
            reproductive_vaccine_item=vaccine,
            reproductive_vaccine_days=70,
            reproductive_vaccine_due_date=date.today() + timedelta(days=70),
        )

        dashboard_response = self.client.get(
            reverse("reproduction_dashboard"), {"species": self.species.code}
        )
        self.assertEqual(dashboard_response.status_code, status.HTTP_200_OK)
        alert_texts = [alert["text"] for alert in dashboard_response.data["alerts"]]
        self.assertTrue(any("Diagnóstico de prenhez" in text for text in alert_texts))
        self.assertTrue(any("Vacina Parvovirose" in text for text in alert_texts))

        gestation_response = self.client.get(
            reverse("gestacoes"), {"species": self.species.code}
        )
        self.assertEqual(gestation_response.status_code, status.HTTP_200_OK)
        gestation_alerts = gestation_response.data["alerts"]
        self.assertTrue(any(alert["time"] == "Em 21 dias" for alert in gestation_alerts))
        self.assertTrue(any(alert["time"] == "Em 70 dias" for alert in gestation_alerts))
        self.assertEqual(
            Mating.objects.get(id=mating.id).reproductive_vaccine_due_date,
            date.today() + timedelta(days=70),
        )

    def test_user_can_acknowledge_generated_operational_alert(self):
        self.animal_a.reproductive_status = Animal.ReproductiveStatus.COBERTA
        self.animal_a.save(update_fields=["reproductive_status"])
        Mating.objects.create(
            female=self.animal_a,
            mating_date=date.today() - timedelta(days=22),
            status=Mating.Status.PENDING_DG,
        )

        dashboard = self.client.get(
            reverse("reproduction_dashboard"), {"species": self.species.code}
        )
        alert = next(
            item for item in dashboard.data["alerts"]
            if "Diagnóstico de prenhez" in item["text"]
        )
        response = self.client.post(
            reverse("acknowledge_operational_alert"),
            {"alert_key": alert["alert_key"], "alert_text": alert["text"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        refreshed = self.client.get(
            reverse("reproduction_dashboard"), {"species": self.species.code}
        )
        self.assertNotIn(alert["alert_key"], {
            item["alert_key"] for item in refreshed.data["alerts"]
        })

    def test_swine_birth_schedules_piglet_iron_alert_for_third_day(self):
        swine = Species.objects.create(code="suinos", name="Suínos")
        sow = Animal.objects.create(
            farm=self.farm_a,
            species=swine,
            identifier="026",
            gender=Animal.Gender.FEMALE,
            category=AnimalBatch.Category.MATRIZ,
        )
        mating = Mating.objects.create(
            female=sow,
            mating_date=date.today() - timedelta(days=114),
            status=Mating.Status.CONFIRMED,
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=sow,
            start_date=mating.mating_date,
            expected_birth_date=date.today(),
            status=Pregnancy.Status.COMPLETED,
        )
        Birth.objects.create(
            pregnancy=pregnancy,
            female=sow,
            birth_date=date.today(),
            live_born=10,
        )

        response = self.client.get(
            reverse("reproduction_dashboard"), {"species": "suinos"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        alert = next(
            item for item in response.data["alerts"]
            if item["text"] == "Leitegada da matriz 026: aplicar ferro."
        )
        self.assertEqual(alert["time"], "Em 3 dias")
        self.assertEqual(alert["type"], "info")
        self.assertEqual(len(alert["alert_key"]), 64)

    def test_maternity_mortality_creates_batch_and_reduces_live_piglets(self):
        mating = Mating.objects.create(
            female=self.animal_a,
            mating_date=date.today() - timedelta(days=114),
            status=Mating.Status.CONFIRMED,
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=self.animal_a,
            start_date=mating.mating_date,
            expected_birth_date=date.today(),
            status=Pregnancy.Status.COMPLETED,
        )
        birth = Birth.objects.create(
            pregnancy=pregnancy,
            female=self.animal_a,
            birth_date=date.today(),
            live_born=10,
        )

        response = self.client.post(
            reverse("birth-registrar-mortalidade", args=[birth.id]),
            {
                "data": date.today().isoformat(),
                "quantidade": 1,
                "causa": "ESMAGAMENTO",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["mortality"], 1)
        self.assertEqual(response.data["live_piglets"], 9)
        self.assertEqual(response.data["batch_quantity"], 9)
        birth.refresh_from_db()
        self.assertEqual(birth.mortality, 1)
        self.assertIsNotNone(birth.batch_id)
        birth.batch.refresh_from_db()
        self.assertEqual(birth.batch.quantity, 9)
        self.assertTrue(
            HistoricoEvento.objects.filter(
                matriz=self.animal_a,
                tipo_evento="Mortalidade Maternidade",
            ).exists()
        )

    def test_weaning_days_and_next_heat_appear_in_sheet_and_alerts(self):
        swine = Species.objects.create(code="suinos", name="Suínos ficha reprodutiva")
        sow = Animal.objects.create(
            farm=self.farm_a,
            species=swine,
            identifier="TN-026",
            gender=Animal.Gender.FEMALE,
            category=AnimalBatch.Category.MATRIZ,
        )
        mating = Mating.objects.create(
            female=sow,
            mating_date=date.today() - timedelta(days=135),
            status=Mating.Status.CONFIRMED,
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=sow,
            start_date=mating.mating_date,
            expected_birth_date=date.today() - timedelta(days=21),
            status=Pregnancy.Status.COMPLETED,
        )
        birth = Birth.objects.create(
            pregnancy=pregnancy,
            female=sow,
            birth_date=date.today() - timedelta(days=21),
            live_born=10,
        )
        next_heat = date.today() + timedelta(days=7)
        Litter.objects.create(
            birth=birth,
            weaning_date=date.today(),
            weaned_quantity=10,
            next_mating_notice_days=7,
            next_mating_notice_date=next_heat,
        )

        sheet = self.client.get(reverse("animal-detail", args=[sow.id]))
        self.assertEqual(sheet.status_code, status.HTTP_200_OK)
        cycle = sheet.data["reproductive_cycles"][0]
        self.assertEqual(cycle["lactation_days"], 21)
        self.assertEqual(cycle["heat_return_date"], next_heat.isoformat())

        dashboard = self.client.get(
            reverse("reproduction_dashboard"), {"species": "suinos"}
        )
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK)
        heat_alert = next(
            alert for alert in dashboard.data["alerts"]
            if "Próximo cio da matriz TN-026" in alert["text"]
        )
        self.assertEqual(heat_alert["time"], "Em 7 dias")
        self.assertEqual(len(heat_alert["alert_key"]), 64)
    def test_confirmed_pregnancy_expected_birth_is_shown_in_alerts(self):
        mating = Mating.objects.create(
            female=self.animal_a,
            mating_date=date.today(),
            status=Mating.Status.CONFIRMED,
        )
        Pregnancy.objects.create(
            mating=mating,
            female=self.animal_a,
            start_date=date.today(),
            expected_birth_date=date.today() + timedelta(days=114),
            status=Pregnancy.Status.ONGOING,
        )

        for endpoint in ("reproduction_dashboard", "gestacoes"):
            response = self.client.get(reverse(endpoint), {"species": self.species.code})
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            birth_alert = next(
                alert for alert in response.data["alerts"]
                if "Parto da matriz" in alert["text"]
            )
            self.assertIn(self.animal_a.identifier, birth_alert["text"])
            self.assertEqual(birth_alert["time"], "Em 114 dias")

        summary_response = self.client.get(
            reverse("species_summary"), {"species": self.species.code}
        )
        self.assertEqual(summary_response.status_code, status.HTTP_200_OK)
        self.assertEqual(summary_response.data["active_alerts"], 1)

    def test_maternity_batch_feed_consumption_appears_in_swine_summary(self):
        swine = Species.objects.create(code="suinos", name="Suínos para alimentação")
        maternity_batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=swine,
            batch_code="MAT-TN-026-1",
            quantity=10,
            entry_date=date.today(),
            status=AnimalBatch.Status.ACTIVE,
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.GESTACAO_MATERNIDADE,
        )
        feed = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Ração maternidade",
            categoria="racao",
            unidade_medida="kg",
        )
        ConsumoRacao.objects.create(
            organization=self.org_a,
            farm=self.farm_a,
            lote_animal=maternity_batch,
            categoria_destino="lotes",
            fase_destino="maternidade",
            item_estoque=feed,
            data_inicio=date.today(),
            data_fim=date.today(),
            quantidade=Decimal("12.50"),
            custo_unitario=Decimal("2.00"),
            custo_total=Decimal("25.00"),
            usuario=self.user_a,
        )

        summary = self.client.get(reverse("species_summary"), {"species": "suinos"})
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data["feed_consumed_month"], 12.5)
        self.assertEqual(summary.data["feed_cost_month"], 25.0)

        for alias in ("suino", "suinos"):
            consumptions = self.client.get(
                reverse("inventory-consumos-list"), {"especie": alias}
            )
            self.assertEqual(consumptions.status_code, status.HTTP_200_OK)
            self.assertEqual(len(consumptions.data["results"]), 1)

    def test_semen_consumption_value_appears_in_swine_summary(self):
        semen = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Sêmen suíno convencional",
            categoria="semen",
            unidade_medida="dose",
        )
        lot = LoteEstoque.objects.create(
            item=semen,
            numero_lote="SEMEN-TN-026",
            quantidade_inicial=Decimal("10.00"),
            quantidade_atual=Decimal("8.00"),
            custo_unitario=Decimal("25.00"),
            data_entrada=date.today(),
        )
        MovimentacaoEstoque.objects.create(
            item=semen,
            lote=lot,
            tipo="consumo",
            quantidade=Decimal("2.00"),
            responsavel=self.user_a,
        )

        summary = self.client.get(reverse("species_summary"), {"species": "suinos"})

        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data["semen_doses_month"], 2.0)
        self.assertEqual(summary.data["semen_cost_month"], 50.0)

    def test_birth_accepts_scheduled_combined_category_vaccine_uuid(self):
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Vacina reprodutiva combinada",
            categoria="medicamento_vacina",
            categorias=["medicamento_vacina"],
            unidade_medida="dose",
        )
        mating = Mating.objects.create(
            female=self.animal_a,
            mating_date=date(2026, 1, 1),
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=self.animal_a,
            start_date=date(2026, 1, 1),
            expected_birth_date=date(2026, 4, 25),
        )

        response = self.client.post(
            reverse("birth-list"),
            {
                "pregnancy": pregnancy.id,
                "female": self.animal_a.id,
                "birth_date": "2026-04-25",
                "live_born": 10,
                "stillborn": 1,
                "mummified": 0,
                "expected_weaning_days": 21,
                "reproductive_vaccine_item": vaccine.id,
                "reproductive_vaccine_days": 70,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(str(response.data["reproductive_vaccine_item"]), str(vaccine.id))
        self.assertEqual(response.data["reproductive_vaccine_due_date"], "2026-07-04")

        maternity_response = self.client.get(
            reverse("maternidades"), {"species": self.species.code}
        )
        self.assertEqual(maternity_response.status_code, status.HTTP_200_OK)
        vaccine_alert = next(
            alert for alert in maternity_response.data["alerts"]
            if "Vacina reprodutiva combinada" in alert["text"]
        )
        self.assertIn(self.animal_a.identifier, vaccine_alert["text"])

    def test_litter_medicine_and_vaccine_applications_consume_inventory(self):
        mating = Mating.objects.create(female=self.animal_a, mating_date=date.today())
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=self.animal_a,
            start_date=date.today(),
            expected_birth_date=date.today(),
        )
        birth = Birth.objects.create(
            pregnancy=pregnancy,
            female=self.animal_a,
            birth_date=date.today(),
            live_born=10,
        )

        cases = (
            ("APLICACAO_MEDICAMENTO", "medicamento", "Ferrodex"),
            ("APLICACAO_VACINA", "vacina", "Vacina leitões"),
        )
        for index, (procedure_type, category, name) in enumerate(cases):
            item = ItemEstoque.objects.create(
                organization=self.org_a,
                nome=name,
                categoria=category,
                unidade_medida="ml",
            )
            lot = LoteEstoque.objects.create(
                item=item,
                numero_lote=f"MAT-{index}",
                quantidade_inicial=Decimal("100.00"),
                quantidade_atual=Decimal("100.00"),
                data_entrada=date.today(),
            )

            response = self.client.post(
                reverse("birth-registrar-procedimento", args=[birth.id]),
                {
                    "tipo": procedure_type,
                    "inventory_item": item.id,
                    "animal_count": 10,
                    "dose_per_animal": "2",
                    "data": date.today().isoformat(),
                },
                format="json",
            )

            self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
            lot.refresh_from_db()
            self.assertEqual(lot.quantidade_atual, Decimal("80.00"))
            application = LitterMedication.objects.get(
                birth=birth, inventory_item=item
            )
            self.assertEqual(application.animal_count, 10)
            self.assertEqual(application.inventory_quantity, Decimal("20.00"))

    def test_litter_accepts_multiple_medications_in_one_transaction(self):
        mating = Mating.objects.create(female=self.animal_a, mating_date=date.today())
        pregnancy = Pregnancy.objects.create(
            mating=mating, female=self.animal_a, start_date=date.today(),
            expected_birth_date=date.today(),
        )
        birth = Birth.objects.create(
            pregnancy=pregnancy, female=self.animal_a,
            birth_date=date.today(), live_born=10,
        )
        items = []
        lots = []
        for index, name in enumerate(("Ferrodex", "Antibiótico")):
            item = ItemEstoque.objects.create(
                organization=self.org_a, nome=name,
                categoria="medicamento", unidade_medida="ml",
            )
            lot = LoteEstoque.objects.create(
                item=item, numero_lote=f"MULTI-{index}",
                quantidade_inicial=Decimal("100.00"),
                quantidade_atual=Decimal("100.00"), data_entrada=date.today(),
            )
            items.append(item)
            lots.append(lot)

        response = self.client.post(
            reverse("birth-registrar-procedimento", args=[birth.id]),
            {
                "tipo": "APLICACAO_MEDICAMENTO",
                "animal_count": 10,
                "applications": [
                    {"inventory_item": items[0].id, "dose_per_animal": "2"},
                    {"inventory_item": items[1].id, "dose_per_animal": "0.5"},
                ],
                "data": date.today().isoformat(),
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data["applications"]), 2)
        for lot, expected in zip(lots, (Decimal("80.00"), Decimal("95.00"))):
            lot.refresh_from_db()
            self.assertEqual(lot.quantidade_atual, expected)
        self.assertEqual(LitterMedication.objects.filter(birth=birth).count(), 2)

    def test_batch_history_includes_current_feed_consumption(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="MAT-01-2",
            quantity=10,
            entry_date=date.today(),
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.CRECHE,
        )
        feed = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Pré-máster",
            categoria="racao",
            unidade_medida="kg",
        )
        ConsumoRacao.objects.create(
            organization=self.org_a,
            farm=self.farm_a,
            lote_animal=batch,
            categoria_destino="lotes",
            fase_destino="maternidade",
            item_estoque=feed,
            data_inicio=date.today(),
            data_fim=date.today(),
            quantidade="1.00",
            custo_unitario="10.00",
            custo_total="10.00",
        )

        response = self.client.get(reverse("animalbatch-history", args=[batch.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        feed_event = next(event for event in response.data if event["type"] == "feed")
        self.assertEqual(feed_event["title"], "Pré-máster")
        self.assertEqual(feed_event["total_kg"], 1.0)
        self.assertEqual(feed_event["cost"], 10.0)
        self.assertEqual(feed_event["avg_per_animal"], 0.1)

    def test_batch_weight_updates_average_and_history(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="PESO-LOTE-01",
            quantity=10,
            entry_date=date.today() - timedelta(days=7),
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.CRECHE,
            avg_weight_kg=Decimal("6.00"),
        )

        response = self.client.post(
            reverse("animalbatch-register-weight", args=[batch.id]),
            {"weight_kg": "8.50", "weighing_date": date.today().isoformat()},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        batch.refresh_from_db()
        self.assertEqual(batch.avg_weight_kg, Decimal("8.500"))
        history = self.client.get(reverse("animalbatch-history", args=[batch.id]))
        weight = next(item for item in history.data if item["type"] == "weight")
        self.assertEqual(weight["weight_kg"], 8.5)

    def test_nursery_shows_growth_date_at_seventy_days_and_alerts(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="MAT-TN-0104-2",
            quantity=12,
            entry_date=date.today() - timedelta(days=48),
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.CRECHE,
            origin=AnimalBatch.Origin.BORN,
        )
        mating = Mating.objects.create(
            female=self.animal_a,
            mating_date=date.today() - timedelta(days=183),
        )
        pregnancy = Pregnancy.objects.create(
            mating=mating,
            female=self.animal_a,
            start_date=mating.mating_date,
            expected_birth_date=date.today() - timedelta(days=69),
        )
        birth_date = date.today() - timedelta(days=69)
        Birth.objects.create(
            pregnancy=pregnancy,
            female=self.animal_a,
            birth_date=birth_date,
            live_born=12,
            batch=batch,
        )

        response = self.client.get(reverse("creches"), {"species": self.species.code})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(item for item in response.data["rows"] if item["lote"] == batch.batch_code)
        self.assertEqual(row["prev_crescimento"], (birth_date + timedelta(days=70)).isoformat())
        alert = next(
            item for item in response.data["alerts"]
            if batch.batch_code in item["text"] and "crescimento" in item["text"]
        )
        self.assertEqual(alert["time"], "Em 1 dia")
        self.assertEqual(len(alert["alert_key"]), 64)

    def test_batch_history_includes_litter_vaccinations(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="MAT-VAC-026",
            quantity=9,
            entry_date=date.today(),
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.GESTACAO_MATERNIDADE,
        )
        mating = Mating.objects.create(female=self.animal_a, mating_date=date.today())
        pregnancy = Pregnancy.objects.create(
            mating=mating, female=self.animal_a, start_date=date.today(),
            expected_birth_date=date.today(),
        )
        birth = Birth.objects.create(
            pregnancy=pregnancy, female=self.animal_a,
            birth_date=date.today(), live_born=9, batch=batch,
        )
        vaccine = ItemEstoque.objects.create(
            organization=self.org_a,
            nome="Vacina pós-parto",
            categoria="vacina",
            unidade_medida="ml",
        )
        LitterMedication.objects.create(
            birth=birth,
            batch=batch,
            inventory_item=vaccine,
            medicamento=vaccine.nome,
            dosagem="2 ml/animal",
            animal_count=9,
            inventory_quantity=Decimal("18.00"),
            data_aplicacao=date.today(),
            responsavel="Produtor",
        )

        response = self.client.get(reverse("animalbatch-history", args=[batch.id]))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        vaccination = next(item for item in response.data if item["type"] == "vaccine")
        self.assertEqual(vaccination["name"], "Vacina pós-parto")
        self.assertEqual(vaccination["dosage"], "2 ml/animal")
        self.assertEqual(vaccination["animal_count"], 9)
        self.assertEqual(vaccination["responsible"], "Produtor")

    def test_maternity_technical_batch_is_only_listed_when_explicitly_requested(self):
        batch = AnimalBatch.objects.create(
            farm=self.farm_a,
            species=self.species,
            batch_code="MAT-TECNICO-01",
            quantity=12,
            entry_date=date.today(),
            category=AnimalBatch.Category.LEITAO,
            phase=AnimalBatch.Phase.GESTACAO_MATERNIDADE,
            origin=AnimalBatch.Origin.BORN,
        )

        regular_response = self.client.get(reverse("animalbatch-list"))
        feeding_response = self.client.get(
            reverse("animalbatch-list"), {"include_maternity": "true"}
        )

        regular_ids = {str(item["id"]) for item in regular_response.data["results"]}
        feeding_ids = {str(item["id"]) for item in feeding_response.data["results"]}
        self.assertNotIn(str(batch.id), regular_ids)
        self.assertIn(str(batch.id), feeding_ids)
