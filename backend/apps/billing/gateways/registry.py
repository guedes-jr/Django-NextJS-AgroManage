from .base import BasePaymentGateway, PaymentGatewayError
from .gerencianet import GerencianetGateway


class PaymentGatewayRegistry:
    def __init__(self):
        self._gateways: dict[str, type[BasePaymentGateway]] = {}

    def register(self, gateway_class: type[BasePaymentGateway]):
        self._gateways[gateway_class.provider_code] = gateway_class
        return gateway_class

    def get_class(self, provider):
        try:
            return self._gateways[provider]
        except KeyError as exc:
            raise PaymentGatewayError(f'Gateway "{provider}" não registrado.') from exc

    def create(self, configuration):
        return self.get_class(configuration.provider)(configuration)

    def catalog(self):
        return [{"provider": code, "display_name": cls.display_name, "credential_fields": cls.credential_fields, "supported_methods": cls.supported_methods} for code, cls in self._gateways.items()]


gateway_registry = PaymentGatewayRegistry()
gateway_registry.register(GerencianetGateway)


def get_default_gateway():
    from ..models import PaymentGatewayConfiguration

    configuration = PaymentGatewayConfiguration.objects.filter(is_default=True, is_enabled=True).first()
    if not configuration:
        raise PaymentGatewayError("Nenhum gateway de pagamento padrão está habilitado.")
    return gateway_registry.create(configuration)
