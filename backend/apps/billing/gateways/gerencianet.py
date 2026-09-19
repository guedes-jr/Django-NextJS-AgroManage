import hashlib
import json
import re
import tempfile
import base64
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from contextlib import contextmanager
from decimal import Decimal

from django.core.cache import cache

from .base import BasePaymentGateway, GatewayChargeRequest, GatewayResult, PaymentGatewayError


class GerencianetGateway(BasePaymentGateway):
    provider_code = "gerencianet"
    display_name = "Gerencianet / Efí"
    credential_fields = ("client_id", "client_secret", "certificate_pem", "private_key_pem", "webhook_secret")
    supported_methods = ("pix",)
    base_urls = {"sandbox": "https://pix-h.api.efipay.com.br", "production": "https://pix.api.efipay.com.br"}

    @property
    def base_url(self):
        return self.base_urls[self.configuration.environment]

    @contextmanager
    def _certificate_files(self):
        certificate = self.credentials.get("certificate_pem", "").replace("\\n", "\n")
        private_key = self.credentials.get("private_key_pem", "").replace("\\n", "\n")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".pem") as cert_file, tempfile.NamedTemporaryFile(mode="w", suffix=".key") as key_file:
            cert_file.write(certificate); key_file.write(private_key); cert_file.flush(); key_file.flush()
            yield cert_file.name, key_file.name

    def _token(self):
        self.validate_configuration()
        cache_key = f"billing:gateway-token:{self.configuration.id}:{self.configuration.environment}"
        cached = cache.get(cache_key)
        if cached:
            return cached
        with self._certificate_files() as certificate:
            try:
                basic = base64.b64encode(f'{self.credentials["client_id"]}:{self.credentials["client_secret"]}'.encode()).decode()
                body = self._urlopen("POST", "/oauth/token", {"grant_type": "client_credentials"}, certificate, {"Authorization": f"Basic {basic}"})
            except (HTTPError, URLError, OSError, ValueError) as exc:
                raise PaymentGatewayError(f"Falha na autenticação Efí: {exc}") from exc
        token = body.get("access_token")
        if not token:
            raise PaymentGatewayError("A Efí não retornou um token de acesso.")
        cache.set(cache_key, token, max(int(body.get("expires_in", 3600)) - 60, 60))
        return token

    def _request(self, method, path, *, payload=None):
        with self._certificate_files() as certificate:
            try:
                return self._urlopen(method, path, payload, certificate, {"Authorization": f"Bearer {self._token()}"})
            except (HTTPError, URLError, OSError, ValueError) as exc:
                detail = exc.read().decode(errors="replace") if isinstance(exc, HTTPError) else str(exc)
                raise PaymentGatewayError(f"Falha na API Efí: {detail}") from exc

    def _urlopen(self, method, path, payload, certificate, headers):
        context = ssl.create_default_context()
        context.load_cert_chain(certfile=certificate[0], keyfile=certificate[1])
        data = json.dumps(payload).encode() if payload is not None else None
        request = Request(f"{self.base_url}{path}", data=data, method=method, headers={"Content-Type": "application/json", "Accept-Encoding": "identity", **headers})
        with urlopen(request, context=context, timeout=30) as response:
            content = response.read()
        return json.loads(content) if content else {}

    @staticmethod
    def _txid(value):
        clean = re.sub(r"[^a-zA-Z0-9]", "", value or "")
        return clean if 26 <= len(clean) <= 35 else hashlib.sha256((value or "quote").encode()).hexdigest()[:35]

    @staticmethod
    def _status(value):
        return {"ATIVA": "pending", "CONCLUIDA": "succeeded", "REMOVIDA_PELO_USUARIO_RECEBEDOR": "cancelled", "REMOVIDA_PELO_PSP": "cancelled"}.get(value, "pending")

    def create_charge(self, request: GatewayChargeRequest) -> GatewayResult:
        if request.payment_method != "pix":
            raise PaymentGatewayError("O adaptador Efí atual aceita somente PIX.")
        pix_key = self.configuration.settings.get("pix_key")
        if not pix_key:
            raise PaymentGatewayError("Configure a chave PIX do recebedor.")
        txid = self._txid(request.idempotency_key or request.reference)
        payload = {"calendario": {"expiracao": int(request.metadata.get("expiration_seconds", 3600))}, "valor": {"original": f"{request.amount:.2f}"}, "chave": pix_key, "solicitacaoPagador": str(request.metadata.get("description", request.reference))[:140]}
        document = re.sub(r"\D", "", str(request.customer.get("document", ""))); name = str(request.customer.get("name", "")).strip()
        if name and len(document) in (11, 14):
            payload["devedor"] = {"nome": name, "cpf" if len(document) == 11 else "cnpj": document}
        body = self._request("PUT", f"/v2/cob/{txid}", payload=payload)
        return GatewayResult(external_id=body.get("txid", txid), status=self._status(body.get("status")), raw=body)

    def get_charge(self, external_id: str) -> GatewayResult:
        body = self._request("GET", f"/v2/cob/{external_id}")
        return GatewayResult(external_id=body.get("txid", external_id), status=self._status(body.get("status")), raw=body)

    def refund(self, external_id: str, amount: Decimal | None = None) -> GatewayResult:
        if amount is None:
            raise PaymentGatewayError("Informe o valor da devolução PIX.")
        refund_id = hashlib.sha256(f"{external_id}:{amount:.2f}".encode()).hexdigest()[:35]
        body = self._request("PUT", f"/v2/pix/{external_id}/devolucao/{refund_id}", payload={"valor": f"{amount:.2f}"})
        return GatewayResult(external_id=body.get("id", refund_id), status="refunded" if body.get("status") == "DEVOLVIDO" else "pending", raw=body)

    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> GatewayResult:
        try:
            body = json.loads(payload); pix = body.get("pix", [])[0]
        except (json.JSONDecodeError, IndexError, KeyError, TypeError) as exc:
            raise PaymentGatewayError("Webhook PIX inválido.") from exc
        return GatewayResult(external_id=pix.get("txid") or pix.get("endToEndId", ""), status="succeeded", raw=body)
