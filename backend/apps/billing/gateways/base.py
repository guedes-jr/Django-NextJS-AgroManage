from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class GatewayChargeRequest:
    reference: str
    amount: Decimal
    currency: str
    customer: dict[str, Any]
    payment_method: str
    metadata: dict[str, Any] = field(default_factory=dict)
    idempotency_key: str = ""


@dataclass(frozen=True)
class GatewayResult:
    external_id: str
    status: str
    raw: dict[str, Any] = field(default_factory=dict)


class PaymentGatewayError(Exception):
    pass


class BasePaymentGateway(ABC):
    provider_code = "base"
    display_name = "Gateway base"
    credential_fields: tuple[str, ...] = ()
    supported_methods: tuple[str, ...] = ()
    # Non-secret settings required before the gateway can become the default (e.g. receiver PIX key).
    settings_fields: tuple[str, ...] = ()

    def __init__(self, configuration):
        self.configuration = configuration
        self.credentials = configuration.get_credentials()

    def validate_configuration(self):
        missing = [field for field in self.credential_fields if not self.credentials.get(field)]
        if missing:
            raise PaymentGatewayError(f"Credenciais ausentes: {', '.join(missing)}")

    @abstractmethod
    def create_charge(self, request: GatewayChargeRequest) -> GatewayResult:
        raise NotImplementedError

    @abstractmethod
    def get_charge(self, external_id: str) -> GatewayResult:
        raise NotImplementedError

    @abstractmethod
    def refund(self, external_id: str, amount: Decimal | None = None) -> GatewayResult:
        raise NotImplementedError

    def payment_options(self, external_id: str, method: str, *, due_date=None) -> dict[str, Any]:
        """How to pay an existing charge with ``method`` (pix, boleto, credit_card): links and codes
        shown on the payment page. ``due_date`` renews an expired charge (segunda via)."""
        raise PaymentGatewayError("Este gateway não oferece esta forma de pagamento.")

    @abstractmethod
    def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> GatewayResult:
        raise NotImplementedError
