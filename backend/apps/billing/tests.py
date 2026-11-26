from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import Mock, patch
from decimal import Decimal

from .models import PaymentGatewayConfiguration, Plan, PlanSegment, PlanTier
from .gateways import gateway_registry
from .gateways.base import GatewayChargeRequest


class PublicPlansAPITestCase(APITestCase):
    def test_lists_only_active_public_plans_without_internal_fields(self):
        Plan.objects.create(code="private-plan", name="Privado", is_public=False)
        Plan.objects.create(code="inactive-plan", name="Inativo", is_active=False)

        response = self.client.get(reverse("public-plans"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = {item["code"] for item in response.data}
        self.assertNotIn("private-plan", codes)
        self.assertNotIn("inactive-plan", codes)
        self.assertNotIn("subscriptions_count", response.data[0])


class PublicPlanSegmentsAPITestCase(APITestCase):
    def setUp(self):
        self.segment = PlanSegment.objects.create(
            code="horticultura",
            name="Horticultura",
            subtitle="Gestão de cultivos",
            description="Controle da produção.",
            sort_order=1,
        )
        PlanTier.objects.create(
            segment=self.segment,
            label="Até 5 hectares",
            minimum_quantity=1,
            maximum_quantity=5,
            monthly_price="49.90",
            sort_order=1,
        )
        PlanTier.objects.create(
            segment=self.segment,
            label="Faixa oculta",
            monthly_price="99.90",
            is_active=False,
            sort_order=2,
        )

    def test_lists_public_segments_with_only_active_tiers(self):
        response = self.client.get(reverse("public-plan-segments"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        segment = next(item for item in response.data if item["code"] == "horticultura")
        self.assertEqual(segment["tiers"][0]["label"], "Até 5 hectares")
        self.assertEqual(segment["tiers"][0]["monthly_price"], "49.90")
        self.assertEqual(len(segment["tiers"]), 1)

    def test_hides_inactive_and_private_segments(self):
        PlanSegment.objects.create(code="private", name="Privado", subtitle="Interno", description="-", is_public=False)
        PlanSegment.objects.create(code="inactive", name="Inativo", subtitle="Interno", description="-", is_active=False)

        response = self.client.get(reverse("public-plan-segments"))

        codes = {item["code"] for item in response.data}
        self.assertNotIn("private", codes)
        self.assertNotIn("inactive", codes)


class SubscriptionQuoteAPITestCase(APITestCase):
    def setUp(self):
        self.segment = PlanSegment.objects.create(
            code="quote-crops",
            name="Cultivos",
            subtitle="Produção",
            description="Controle de cultivos.",
            annual_discount_percent="15.00",
        )
        self.tier = PlanTier.objects.create(
            segment=self.segment,
            label="Até 10 hectares",
            monthly_price="100.00",
        )

    def test_creates_yearly_quote_with_server_calculated_discount(self):
        response = self.client.post(reverse("public-subscription-quotes"), {
            "tier_ids": [str(self.tier.id)],
            "billing_cycle": "yearly",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["monthly_subtotal"], "100.00")
        self.assertEqual(response.data["monthly_discount"], "15.00")
        self.assertEqual(response.data["monthly_total"], "85.00")
        self.assertEqual(response.data["billing_total"], "1020.00")
        self.assertFalse(response.data["requires_contact"])

        detail = self.client.get(reverse("public-subscription-quote-detail", args=[response.data["public_token"]]))
        self.assertEqual(detail.status_code, status.HTTP_200_OK)
        self.assertEqual(detail.data["items"][0]["tier_label"], "Até 10 hectares")

    def test_rejects_two_tiers_from_the_same_segment(self):
        second_tier = PlanTier.objects.create(segment=self.segment, label="11 a 20 hectares", monthly_price="150.00")

        response = self.client.post(reverse("public-subscription-quotes"), {
            "tier_ids": [str(self.tier.id), str(second_tier.id)],
            "billing_cycle": "monthly",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_marks_custom_price_as_requiring_contact(self):
        custom_segment = PlanSegment.objects.create(code="custom", name="Personalizado", subtitle="Grande porte", description="Sob consulta.")
        custom_tier = PlanTier.objects.create(segment=custom_segment, label="Acima do limite", requires_quote=True)

        response = self.client.post(reverse("public-subscription-quotes"), {
            "tier_ids": [str(custom_tier.id)],
            "billing_cycle": "monthly",
        }, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["requires_contact"])
        self.assertIsNone(response.data["items"][0]["monthly_price"])


class PaymentGatewayArchitectureTestCase(APITestCase):
    def test_credentials_are_encrypted_and_gateway_is_created_from_registry(self):
        configuration, _ = PaymentGatewayConfiguration.objects.update_or_create(
            provider="gerencianet",
            defaults={"display_name": "Gerencianet / Efí", "environment": "sandbox"},
        )
        configuration.set_credentials({"client_id": "client", "client_secret": "secret", "certificate_pem": "certificate", "private_key_pem": "key", "webhook_secret": "webhook"})
        configuration.save()

        self.assertNotIn("secret", configuration.encrypted_credentials)
        self.assertEqual(configuration.get_credentials()["client_id"], "client")
        gateway = gateway_registry.create(configuration)
        self.assertEqual(gateway.provider_code, "gerencianet")
        self.assertIn("pix", gateway.supported_methods)

    @patch("apps.billing.gateways.gerencianet.GerencianetGateway._urlopen")
    def test_gerencianet_creates_idempotent_pix_charge(self, urlopen):
        configuration, _ = PaymentGatewayConfiguration.objects.update_or_create(
            provider="gerencianet",
            defaults={"display_name": "Gerencianet / Efí", "environment": "sandbox", "settings": {"pix_key": "pix@example.com"}},
        )
        configuration.set_credentials({"client_id": "client", "client_secret": "secret", "certificate_pem": "certificate", "private_key_pem": "key", "webhook_secret": "webhook"})
        configuration.save()
        urlopen.side_effect = [{"access_token": "access", "expires_in": 3600}, {"txid": "12345678901234567890123456", "status": "ATIVA", "pixCopiaECola": "000201"}]

        result = gateway_registry.create(configuration).create_charge(GatewayChargeRequest(
            reference="quote-1", amount=Decimal("85.00"), currency="BRL",
            customer={"name": "Cliente", "document": "12345678901"}, payment_method="pix",
            idempotency_key="12345678901234567890123456",
        ))

        self.assertEqual(result.status, "pending")
        args = urlopen.call_args_list[1].args
        self.assertEqual(args[1], "/v2/cob/12345678901234567890123456")
        self.assertEqual(args[2]["valor"]["original"], "85.00")
        self.assertEqual(args[2]["chave"], "pix@example.com")

    def test_gerencianet_parses_pix_webhook(self):
        configuration = PaymentGatewayConfiguration.objects.get(provider="gerencianet")
        result = gateway_registry.create(configuration).parse_webhook(
            b'{"pix":[{"txid":"charge-123","endToEndId":"E123","valor":"85.00"}]}', {}
        )
        self.assertEqual(result.external_id, "charge-123")
        self.assertEqual(result.status, "succeeded")


class AsaasGatewayTestCase(APITestCase):
    def setUp(self):
        self.configuration = PaymentGatewayConfiguration.objects.get(provider="asaas")
        self.configuration.set_credentials({"api_key": "$aact_test", "webhook_token": "hook-token"})
        self.configuration.save()
        self.gateway = gateway_registry.create(self.configuration)

    def charge(self, method="boleto"):
        return self.gateway.create_charge(GatewayChargeRequest(
            reference="invoice-1", amount=Decimal("120.5"), currency="BRL", payment_method=method,
            customer={"name": "Fazenda Teste", "document": "12.345.678/0001-90", "email": "f@example.com", "external_reference": "org-1"},
        ))

    def test_registered_with_methods_and_seeded(self):
        self.assertEqual(self.gateway.provider_code, "asaas")
        self.assertEqual(set(self.gateway.supported_methods), {"pix", "boleto", "credit_card"})
        self.assertEqual(self.gateway.base_url, "https://api-sandbox.asaas.com/v3")

    @patch("apps.billing.gateways.asaas.AsaasGateway._urlopen")
    def test_creates_customer_and_boleto_charge(self, urlopen):
        urlopen.side_effect = [
            {"data": []},  # no charge with this externalReference yet
            {"data": []}, {"data": []},  # customer not found by reference nor document
            {"id": "cus_1"},
            {"id": "pay_1", "status": "PENDING", "billingType": "BOLETO", "invoiceUrl": "https://asaas/i/pay_1"},
        ]
        result = self.charge()
        self.assertEqual((result.external_id, result.status), ("pay_1", "pending"))
        customer = urlopen.call_args_list[3].args
        self.assertEqual((customer[0], customer[1]), ("POST", "/customers"))
        self.assertEqual(customer[2]["cpfCnpj"], "12345678000190")
        method, path, payload = urlopen.call_args_list[4].args
        self.assertEqual((method, path), ("POST", "/payments"))
        self.assertEqual((payload["customer"], payload["billingType"], payload["value"], payload["externalReference"]), ("cus_1", "BOLETO", 120.5, "invoice-1"))

    @patch("apps.billing.gateways.asaas.AsaasGateway._urlopen")
    def test_existing_charge_is_reused_and_pix_returns_qr_code(self, urlopen):
        urlopen.side_effect = [
            {"data": [{"id": "pay_2", "status": "PENDING", "billingType": "PIX"}]},
            {"encodedImage": "iVBOR", "payload": "000201"},
        ]
        result = self.charge("pix")
        self.assertEqual(result.external_id, "pay_2")
        self.assertEqual(result.raw["pix_qr_code"]["payload"], "000201")
        self.assertEqual(urlopen.call_count, 2)

    @patch("apps.billing.gateways.asaas.AsaasGateway._urlopen")
    def test_refund_and_status_mapping(self, urlopen):
        urlopen.side_effect = [{"id": "pay_3", "status": "REFUNDED"}, {"id": "pay_3", "status": "RECEIVED"}]
        self.assertEqual(self.gateway.refund("pay_3", Decimal("10")).status, "refunded")
        self.assertEqual(urlopen.call_args_list[0].args[2], {"value": 10.0})
        self.assertEqual(self.gateway.get_charge("pay_3").status, "succeeded")

    def test_rejects_unsupported_currency_and_missing_credentials(self):
        from .gateways.base import PaymentGatewayError
        with self.assertRaises(PaymentGatewayError):
            self.gateway.create_charge(GatewayChargeRequest(reference="x", amount=Decimal("1"), currency="USD", customer={}, payment_method="pix"))
        self.configuration.set_credentials({})
        self.configuration.save()
        with self.assertRaises(PaymentGatewayError):
            gateway_registry.create(self.configuration).get_charge("pay_1")

    def test_webhook_requires_token(self):
        from .gateways.base import PaymentGatewayError
        body = b'{"event":"PAYMENT_RECEIVED","payment":{"id":"pay_4","status":"RECEIVED"}}'
        result = self.gateway.parse_webhook(body, {"Asaas-Access-Token": "hook-token"})
        self.assertEqual((result.external_id, result.status), ("pay_4", "succeeded"))
        with self.assertRaises(PaymentGatewayError):
            self.gateway.parse_webhook(body, {"Asaas-Access-Token": "wrong"})
        with self.assertRaises(PaymentGatewayError):
            self.gateway.parse_webhook(body, {})
