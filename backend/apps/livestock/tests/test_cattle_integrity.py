from datetime import timedelta
from uuid import uuid4
from django.urls import reverse
from rest_framework.test import APITestCase
from .cattle_feeding_fixtures import CattleFeedingFixture
from apps.inventory.models import LoteEstoque, MovimentacaoEstoque, ConsumoRacao
from apps.livestock.models import CattleTroughReading, HistoricoEvento
from apps.audit.models import AuditLog


class CattleIntegrityTests(CattleFeedingFixture, APITestCase):
    def test_expired_food_never_changes_stock(self):
        self.lot.data_validade = self.today-timedelta(days=1); self.lot.save()
        self.assertEqual(self.client.post(self.url, self.values(), format="json").status_code, 400)
        self.assertFalse(ConsumoRacao.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.lot.refresh_from_db(); self.assertEqual(self.lot.quantidade_atual, 100)

    def test_eligible_lots_skip_expired_and_allow_today_and_undated(self):
        self.lot.data_validade = self.today-timedelta(days=1); self.lot.save()
        dated = LoteEstoque.objects.create(item=self.item, numero_lote="TODAY", quantidade_inicial=3, quantidade_atual=3, custo_unitario=2, data_entrada=self.today, data_validade=self.today)
        undated = LoteEstoque.objects.create(item=self.item, numero_lote="UNDATED", quantidade_inicial=10, quantidade_atual=10, custo_unitario=2, data_entrada=self.today)
        response = self.client.post(self.url, self.values(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        dated.refresh_from_db(); undated.refresh_from_db(); self.lot.refresh_from_db()
        self.assertEqual(dated.quantidade_atual, 0)
        self.assertEqual(undated.quantidade_atual, 8)
        self.assertEqual(self.lot.quantidade_atual, 100)

    def test_direct_feed_endpoint_also_blocks_expired_stock(self):
        self.user.role = "admin"; self.user.save(update_fields=["role"])
        self.lot.data_validade = self.today-timedelta(days=1); self.lot.save()
        response = self.client.post(reverse("cattle-feed-list"), {"lote_animal": str(self.batch.pk), "item_estoque": str(self.item.pk), "data_inicio": str(self.today), "data_fim": str(self.today), "quantidade": "5"}, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(ConsumoRacao.objects.exists())

    def reading(self, **changes):
        values = dict(dict(batch=str(self.batch.pk), date=str(self.today), session="morning", score=0, request_key=str(uuid4())), **changes)
        return self.client.post(reverse("cattle-trough-reading-list"), values, format="json")

    def test_reading_is_independent_from_plans_and_feed(self):
        self.user.role = "admin"; self.user.save(update_fields=["role"])
        key = str(uuid4())
        for _ in range(2):
            response = self.reading(request_key=key, formula=str(self.formula.pk), remaining_kg="0")
            self.assertEqual(response.status_code, 201, response.data)
        row = CattleTroughReading.objects.get()
        self.assertIsNone(row.plan_id)
        self.assertIsNone(row.plan_version)
        self.assertIsNone(row.kg_per_head_day)
        self.assertEqual(row.formula, self.formula)
        self.assertEqual(row.head_count, 10)
        self.assertFalse(ConsumoRacao.objects.exists())
        self.assertFalse(MovimentacaoEstoque.objects.exists())
        self.assertEqual(self.reading(request_key=key, score=1).status_code, 400)
        history_count, audits = HistoricoEvento.objects.count(), AuditLog.objects.count()
        for _ in range(2):
            self.assertEqual(self.client.get(reverse("cattle-trough-reading-list")).data["count"], 1)
        self.assertEqual(HistoricoEvento.objects.count(), history_count)
        self.assertEqual(AuditLog.objects.count(), audits)

    def test_reading_values_and_permissions(self):
        self.assertEqual(self.reading().status_code, 403)
        self.user.role = "admin"; self.user.save(update_fields=["role"])
        for values in ({"score": 5}, {"score": -1}, {"remaining_kg": "-1"}, {"date": str(self.today-timedelta(days=1))}):
            self.assertEqual(self.reading(**values).status_code, 400)
        self.assertEqual(self.reading().status_code, 201)

    def test_reading_formula_is_tenant_scoped_and_keeps_original_name(self):
        from apps.organizations.models import Organization
        from apps.inventory.models import FormulaRacao
        self.user.role = "admin"; self.user.save(update_fields=["role"])
        other = Organization.objects.create(name="Outra", slug="reading-formula-other")
        foreign = FormulaRacao.objects.create(organization=other, nome="Outra", especie_animal="bovino")
        self.assertEqual(self.reading(formula=str(foreign.pk)).status_code, 404)
        response = self.reading(formula=str(self.formula.pk))
        self.assertEqual(response.status_code, 201, response.data)
        self.formula.nome = "Nova descrição"; self.formula.save()
        self.assertEqual(self.client.get(reverse("cattle-trough-reading-list")).data["results"][0]["formula_name"], "Fórmula bovina")

    def test_migration_preserves_legacy_reading_targets_and_snapshots(self):
        from importlib import import_module
        from types import SimpleNamespace
        from django.apps import apps
        from django.db import connection
        from apps.livestock.models import CattleFeedPlan
        plan = CattleFeedPlan.objects.create(batch=self.batch, item=self.item, kg_per_head_day=1, start_date=self.today)
        row = CattleTroughReading.objects.create(plan=plan, date=self.today, session="morning", score=2, plan_version=1, head_count=10, kg_per_head_day=1, request_key=uuid4())
        migration = import_module("apps.livestock.migrations.0040_cattletroughreading_batch_and_more")
        migration.preserve_reading_targets(apps, SimpleNamespace(connection=connection))
        row.refresh_from_db()
        self.assertEqual(row.batch, self.batch)
        self.assertEqual(row.plan, plan)
        self.assertEqual(row.plan_version, 1)
        self.assertEqual(row.kg_per_head_day, 1)

    def test_manual_headcount_adjustment_was_removed(self):
        self.user.role = "admin"; self.user.save(update_fields=["role"])
        response = self.client.post(f"/api/v1/livestock/cattle/batches/{self.batch.pk}/herd-movements/", {"quantity": 20}, format="json")
        self.assertEqual(response.status_code, 404)
        self.batch.refresh_from_db(); self.assertEqual(self.batch.quantity, 10)
        self.assertFalse(self.batch.historicos.filter(tipo_evento="Ajuste de efetivo").exists())
