"""Asaas adapter (API v3): PIX, boleto and card charges paid on the Asaas invoice page.

Authentication is the account API key in the ``access_token`` header. Asaas charges belong to an
Asaas customer, so ``create_charge`` reuses the customer found by ``externalReference`` (our
organization/customer reference) or CPF/CNPJ, creating it when missing. Asaas has no idempotency
header: a charge already created with the same ``externalReference`` is returned instead of a new
one. Webhooks are authenticated by the token configured in the Asaas panel, sent back in the
``asaas-access-token`` header.
"""
import hmac
import json
import re
from datetime import timedelta
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from django.utils import timezone

from .base import BasePaymentGateway, GatewayChargeRequest, GatewayResult, PaymentGatewayError


class AsaasGateway(BasePaymentGateway):
    provider_code = "asaas"
    display_name = "Asaas"
    credential_fields = ("api_key", "webhook_token")
    # "any": the customer picks PIX, boleto or card on the Asaas invoice page.
    supported_methods = ("any", "pix", "boleto", "credit_card")
    base_urls = {"sandbox": "https://api-sandbox.asaas.com/v3", "production": "https://api.asaas.com/v3"}
    billing_types = {"any": "UNDEFINED", "pix": "PIX", "boleto": "BOLETO", "credit_card": "CREDIT_CARD"}
    statuses = {
        "PENDING": "pending", "AWAITING_RISK_ANALYSIS": "pending", "OVERDUE": "pending",
        "RECEIVED": "succeeded", "CONFIRMED": "succeeded", "RECEIVED_IN_CASH": "succeeded",
        "REFUNDED": "refunded", "REFUND_REQUESTED": "refunded", "REFUND_IN_PROGRESS": "refunded",
        "CHARGEBACK_REQUESTED": "failed", "CHARGEBACK_DISPUTE": "failed", "AWAITING_CHARGEBACK_REVERSAL": "failed",
        "DUNNING_REQUESTED": "pending", "DUNNING_RECEIVED": "succeeded", "DELETED": "cancelled",
    }

    @property
    def base_url(self):
        return self.base_urls[self.configuration.environment]

    def _urlopen(self, method, path, payload=None):
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {
            "Content-Type": "application/json", "Accept": "application/json",
            "access_token": self.credentials["api_key"], "User-Agent": "AgroManage-Billing",
        }
        request = Request(f"{self.base_url}{path}", data=data, method=method, headers=headers)
        with urlopen(request, timeout=30) as response:
            content = response.read()
        return json.loads(content) if content else {}

    def _request(self, method, path, *, payload=None):
        self.validate_configuration()
        try:
            return self._urlopen(method, path, payload)
        except HTTPError as exc:
            raise PaymentGatewayError(f"Falha na API Asaas: {self._error_detail(exc)}") from exc
        except (URLError, OSError, ValueError) as exc:
            raise PaymentGatewayError(f"Falha na API Asaas: {exc}") from exc

    @staticmethod
    def _error_detail(exc):
        raw = exc.read().decode(errors="replace")
        try:
            errors = json.loads(raw).get("errors") or []
            return "; ".join(str(item.get("description") or item.get("code")) for item in errors) or raw
        except (ValueError, AttributeError):
            return raw or str(exc)

    def _status(self, value):
        return self.statuses.get(str(value or "").upper(), "pending")

    def _customer_id(self, customer, reference):
        if customer.get("asaas_id"):
            return customer["asaas_id"]
        document = re.sub(r"\D", "", str(customer.get("document", "")))
        external = str(customer.get("external_reference") or customer.get("id") or "")
        for query in ({"externalReference": external} if external else None, {"cpfCnpj": document} if document else None):
            if query:
                found = self._request("GET", f"/customers?{urlencode({**query, 'limit': 1})}").get("data") or []
                if found:
                    return found[0]["id"]
        name = str(customer.get("name", "")).strip()
        if not name:
            raise PaymentGatewayError("Informe o nome do pagador para criar o cliente no Asaas.")
        payload = {"name": name[:255], "externalReference": external or reference, "notificationDisabled": True}
        if len(document) in (11, 14):
            payload["cpfCnpj"] = document
        if customer.get("email"):
            payload["email"] = str(customer["email"])
        return self._request("POST", "/customers", payload=payload)["id"]

    def _result(self, body):
        raw = dict(body)
        if body.get("billingType") == "PIX" and body.get("id") and self._status(body.get("status")) == "pending":
            # QR code for the checkout screen (image in base64 and copy-and-paste code).
            raw["pix_qr_code"] = self._request("GET", f"/payments/{quote(body['id'])}/pixQrCode")
        return GatewayResult(external_id=body.get("id", ""), status=self._status(body.get("status")), raw=raw)

    def create_charge(self, request: GatewayChargeRequest) -> GatewayResult:
        billing_type = self.billing_types.get(request.payment_method)
        if not billing_type:
            raise PaymentGatewayError("O Asaas aceita PIX, boleto, cartão de crédito ou escolha do cliente.")
        if request.currency.upper() != "BRL":
            raise PaymentGatewayError("O Asaas cobra somente em reais (BRL).")
        reference = (request.idempotency_key or request.reference)[:100]
        existing = self._request("GET", f"/payments?{urlencode({'externalReference': reference, 'limit': 1})}").get("data") or []
        existing = [row for row in existing if row.get("status") != "DELETED" and not row.get("deleted")]
        if existing:
            return self._result(existing[0])
        due_date = request.metadata.get("due_date") or (timezone.localdate() + timedelta(days=int(request.metadata.get("due_in_days", 3))))
        payload = {
            "customer": self._customer_id(request.customer, reference), "billingType": billing_type,
            "value": float(Decimal(request.amount).quantize(Decimal("0.01"))), "dueDate": str(due_date),
            "description": str(request.metadata.get("description", request.reference))[:500], "externalReference": reference,
        }
        return self._result(self._request("POST", "/payments", payload=payload))

    def get_charge(self, external_id: str) -> GatewayResult:
        body = self._request("GET", f"/payments/{quote(external_id)}")
        return GatewayResult(external_id=body.get("id", external_id), status=self._status(body.get("status")), raw=body)

    def refund(self, external_id: str, amount: Decimal | None = None) -> GatewayResult:
        payload = {"value": float(Decimal(amount).quantize(Decimal("0.01")))} if amount is not None else {}
        body = self._request("POST", f"/payments/{quote(external_id)}/refund", payload=payload)
        status = self._status(body.get("status"))
        return GatewayResult(external_id=body.get("id", external_id), status="refunded" if status in {"refunded", "succeeded"} else status, raw=body)

    def payment_options(self, external_id, method, *, due_date=None):
        if method not in {"pix", "boleto", "credit_card"}:
            raise PaymentGatewayError("Forma de pagamento inválida.")
        path = f"/payments/{quote(external_id)}"
        body = self._request("GET", path)
        update = {}
        if body.get("billingType") not in {"UNDEFINED", self.billing_types[method]}:
            update["billingType"] = "UNDEFINED"  # Customer may pick any method on the same charge.
        if due_date and str(body.get("dueDate") or "") < str(due_date):
            update["dueDate"] = str(due_date)  # Segunda via: same charge, renewed due date.
        if update:
            body = self._request("POST", path, payload=update)
        if method == "credit_card":
            # Card data is typed only on the Asaas page (never in our system).
            return {"method": method, "payment_url": body.get("invoiceUrl", "")}
        if method == "boleto":
            line = self._request("GET", f"{path}/identificationField")
            return {"method": method, "bank_slip_url": body.get("bankSlipUrl", ""), "digitable_line": line.get("identificationField", ""),
                    "due_date": body.get("dueDate", ""), "payment_url": body.get("invoiceUrl", "")}
        pix = self._request("GET", f"{path}/pixQrCode")
        return {"method": method, "pix_copy_paste": pix.get("payload", ""), "pix_qr_image": pix.get("encodedImage", ""),
                "expires_at": pix.get("expirationDate", ""), "payment_url": body.get("invoiceUrl", "")}

    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> GatewayResult:
        expected = self.credentials.get("webhook_token", "")
        received = next((value for key, value in (headers or {}).items() if key.lower() in {"asaas-access-token", "http_asaas_access_token"}), "")
        if not expected or not hmac.compare_digest(str(received), expected):
            raise PaymentGatewayError("Webhook Asaas sem token válido.")
        try:
            body = json.loads(payload)
            payment = body["payment"]
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise PaymentGatewayError("Webhook Asaas inválido.") from exc
        return GatewayResult(external_id=payment.get("id", ""), status=self._status(payment.get("status")), raw=body)
