from django.test import SimpleTestCase

from apps.crops.views import _consolidate_shared_equipments


class SharedEquipmentCostTestCase(SimpleTestCase):
    def test_charges_identical_shared_equipment_only_once(self):
        equipment = [{"equipment": "Costal", "total_price": 10}]
        applications = [
            {"item": "A", "equipments": equipment},
            {"item": "B", "equipments": equipment},
            {"item": "C", "equipments": equipment},
        ]

        result = _consolidate_shared_equipments(applications)

        self.assertEqual(result[0]["equipments"], equipment)
        self.assertEqual(result[1]["equipments"], [])
        self.assertEqual(result[2]["equipments"], [])

    def test_preserves_different_per_item_equipments(self):
        applications = [
            {"item": "A", "equipments": [{"equipment": "Costal", "total_price": 10}]},
            {"item": "B", "equipments": [{"equipment": "Trator", "total_price": 50}]},
        ]

        self.assertEqual(_consolidate_shared_equipments(applications), applications)
