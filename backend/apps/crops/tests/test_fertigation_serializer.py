from django.test import SimpleTestCase
from rest_framework import serializers

from apps.crops.serializers import RoundedMoneyField


class FertigationMoneyFieldTestCase(SimpleTestCase):
    def test_rounds_browser_floating_point_artifact(self):
        field = RoundedMoneyField(max_digits=16, decimal_places=2)

        self.assertEqual(field.run_validation("15.000000000000002"), 15)

    def test_still_rejects_value_above_database_limit(self):
        field = RoundedMoneyField(max_digits=16, decimal_places=2)

        with self.assertRaises(serializers.ValidationError):
            field.run_validation("100000000000000.00")
