from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from apps.crops.services import _quantity_in_inventory_unit


class OperationUnitConversionTestCase(SimpleTestCase):
    def test_converts_grams_to_inventory_kilograms(self):
        operation = SimpleNamespace(
            quantity=Decimal("700"),
            unit="g",
            item=SimpleNamespace(unidade_medida="kg"),
        )

        self.assertEqual(_quantity_in_inventory_unit(operation), Decimal("0.700"))

    def test_keeps_quantity_when_units_match(self):
        operation = SimpleNamespace(
            quantity=Decimal("25"),
            unit="kg",
            item=SimpleNamespace(unidade_medida="kg"),
        )

        self.assertEqual(_quantity_in_inventory_unit(operation), Decimal("25"))


    def test_stock_movement_uses_the_operation_property(self):
        from unittest.mock import patch
        from apps.crops.services import _create_stock_movement
        farm = SimpleNamespace(pk="production-property")
        operation = SimpleNamespace(quantity=Decimal("3"), unit="kg", item=SimpleNamespace(unidade_medida="kg"), lot=None, plantation=SimpleNamespace(farm=farm))
        request = SimpleNamespace(user=SimpleNamespace(is_authenticated=True))
        with patch("apps.inventory.services.registrar_movimentacao") as record:
            _create_stock_movement(operation, request, "Adubação")
        self.assertIs(record.call_args.kwargs["farm"], farm)
