from datetime import date, datetime, timezone as datetime_timezone
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.organizations.models import Organization
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.inventory.serializers import MovimentacaoEstoqueSerializer


class MobileMovementTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Movimentos", slug="mobile-movements")
        self.other = Organization.objects.create(name="Outra", slug="other-movements")
        self.user = get_user_model().objects.create_user(email="movements@example.invalid", password="test", role="manager", organization=self.org)
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Produto 0009", categoria="racao", unidade_medida="kg")
        self.lot = LoteEstoque.objects.create(item=self.item, numero_lote="LOTE-007", quantidade_inicial="10", quantidade_atual="10", data_entrada=date.today())
        self.row = MovimentacaoEstoque.objects.create(item=self.item, lote=self.lot, tipo="ajuste", quantidade="-2.25", responsavel=self.user, destino="Inventário", observacao="Conferência")
        self.client.force_authenticate(self.user)
        self.url = reverse("inventory-movimentacoes-list")
        self.count_url = reverse("inventory-lotes-adjust-stock", args=[self.lot.pk]) + "?view=receipt"

    def test_projection_preserves_signed_quantities_context_and_never_reads_financial_costs(self):
        with patch.object(MovimentacaoEstoqueSerializer, "_movement_unit_cost", side_effect=AssertionError("financial property requested")):
            response = self.client.get(self.url, {"view": "operational"})
        self.assertEqual(response.status_code, 200, response.data)
        row = response.data["results"][0]
        self.assertEqual(row["quantidade"], "-2.25")
        self.assertEqual(row["lote_numero"], "LOTE-007")
        self.assertEqual(row["item_unidade"], "kg")
        self.assertIsNone(row["farm"])
        self.assertIsNone(row["farm_nome"])
        self.assertIsNone(row["cattle_delivery"])
        self.assertIn("timezone", row)
        self.assertNotIn("custo_total", row)
        self.assertNotIn("custo_unitario_movimento", row)
        detail = self.client.get(reverse("inventory-movimentacoes-detail", args=[self.row.pk]), {"view": "operational"})
        self.assertEqual(detail.data["quantidade"], "-2.25")
        legacy = self.client.get(reverse("inventory-movimentacoes-detail", args=[self.row.pk]))
        self.assertIn("custo_total", legacy.data)

    @override_settings(TIME_ZONE="America/Fortaleza")
    def test_operational_filters_use_system_day_and_page_on_server(self):
        MovimentacaoEstoque.objects.filter(pk=self.row.pk).update(data_movimentacao=datetime(2026, 11, 8, 1, 0, tzinfo=datetime_timezone.utc))
        later = MovimentacaoEstoque.objects.create(item=self.item, lote=self.lot, tipo="entrada", quantidade="1", observacao="Outra")
        MovimentacaoEstoque.objects.filter(pk=later.pk).update(data_movimentacao=datetime(2026, 11, 8, 4, 0, tzinfo=datetime_timezone.utc))
        response = self.client.get(self.url, {"view": "operational", "item": str(self.item.pk), "lote": str(self.lot.pk), "search": "LOTE-007", "tipo": "ajuste", "start": "2026-11-07", "end": "2026-11-07"})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["id"] for row in response.data["results"]], [str(self.row.pk)])
        paged = self.client.get(self.url, {"view": "operational", "page_size": 1})
        self.assertEqual(paged.data["count"], 2)
        self.assertIsNotNone(paged.data["next"])
        self.assertEqual(self.client.get(self.url, {"view": "operational", "page_size": 1, "page": 2}).data["results"][0]["id"], str(self.row.pk))

    def test_invalid_filters_cannot_silently_expand_a_query(self):
        for params in [{"item": "bad"}, {"lote": "bad"}, {"tipo": "fake"}, {"start": "2026-01-01"}, {"start": "2026-11-08", "end": "2026-11-07"}, {"start": "2024-01-01", "end": "2026-01-01"}, {"search": "a" * 101}]:
            response = self.client.get(self.url, {"view": "operational", **params})
            self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("10"))

    def test_movement_tenant_isolation_and_missing_lot(self):
        foreign_item = ItemEstoque.objects.create(organization=self.other, nome="Outro", categoria="racao", unidade_medida="kg")
        foreign = MovimentacaoEstoque.objects.create(item=foreign_item, tipo="entrada", quantidade="1")
        own_no_lot = MovimentacaoEstoque.objects.create(item=self.item, tipo="entrada", quantidade="1")
        response = self.client.get(self.url, {"view": "operational"})
        self.assertEqual(response.data["count"], 2)
        rows = {row["id"]: row for row in response.data["results"]}
        self.assertIsNone(rows[str(own_no_lot.pk)]["lote_numero"])
        self.assertNotIn(str(foreign.pk), rows)
        self.assertEqual(self.client.get(reverse("inventory-movimentacoes-detail", args=[foreign.pk]), {"view": "operational"}).status_code, 404)

    def test_projection_queries_are_bounded(self):
        for _ in range(15):
            MovimentacaoEstoque.objects.create(item=self.item, lote=self.lot, tipo="entrada", quantidade="1")
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.url, {"view": "operational", "page_size": 20})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertLessEqual(len(queries), 6)

    def test_count_receipt_is_atomic_signed_and_duplicate_expected_balance_conflicts(self):
        payload = {"quantidade_contada": "7.25", "saldo_esperado": "10", "unidade_esperada": "kg", "motivo": "Contagem física"}
        with patch.object(MovimentacaoEstoqueSerializer, "_movement_unit_cost", side_effect=AssertionError("financial property requested")):
            response = self.client.post(self.count_url, payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(set(response.data), {"id"})
        row = MovimentacaoEstoque.objects.get(pk=response.data["id"])
        self.assertEqual(row.quantidade, Decimal("-2.75"))
        self.assertEqual(row.responsavel, self.user)
        self.assertIn("Contagem física", row.observacao)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("7.25"))
        self.assertEqual(self.client.post(self.count_url, payload, format="json").status_code, 409)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 2)

    def test_count_refuses_changed_unit_under_lock_and_accepts_zero_with_correct_context(self):
        payload = {"quantidade_contada": "0", "saldo_esperado": "10", "unidade_esperada": "unidade", "motivo": "Conferência"}
        self.assertEqual(self.client.post(self.count_url, payload, format="json").status_code, 409)
        self.assertEqual(MovimentacaoEstoque.objects.count(), 1)
        payload["unidade_esperada"] = "kg"
        self.assertEqual(self.client.post(self.count_url, payload, format="json").status_code, 201)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("0"))

    def test_operator_and_feeder_cannot_adjust(self):
        for role in ["operator", "feeder"]:
            self.user.role = role
            self.user.save(update_fields=["role"])
            self.assertEqual(self.client.post(self.count_url, {"quantidade_contada": "1", "saldo_esperado": "10", "motivo": "Negado"}, format="json").status_code, 403)
