from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.organizations.models import Organization

from ..models import Farm, FarmAsset, FarmAssetImplement, FarmStructure

User = get_user_model()


class FarmStructureTestCase(APITestCase):
    def setUp(self):
        self.org_a = Organization.objects.create(name="Estruturas A", slug="structures-a")
        self.org_b = Organization.objects.create(name="Estruturas B", slug="structures-b")
        self.operator = User.objects.create_user(
            email="structures-operator@example.com", password="Password-8472", full_name="Operador",
            organization=self.org_a, role=User.Role.OPERATOR,
        )
        self.other = User.objects.create_user(
            email="structures-other@example.com", password="Password-8472", full_name="Outro",
            organization=self.org_a, role=User.Role.OPERATOR,
        )
        self.farm_a = Farm.objects.create(organization=self.org_a, name="Fazenda A")
        self.farm_b = Farm.objects.create(organization=self.org_b, name="Fazenda B")
        self.other_structure = FarmStructure.objects.create(
            farm=self.farm_a, category=FarmStructure.Category.CORRAL, name="Curral antigo",
            acquisition_value="1000.00", current_value="800.00", created_by=self.other,
        )
        self.foreign_structure = FarmStructure.objects.create(
            farm=self.farm_b, category=FarmStructure.Category.WAREHOUSE, name="Armazém externo",
        )
        self.client.force_authenticate(self.operator)

    def test_list_and_detail_are_scoped_to_organization(self):
        response = self.client.get(reverse("farm-structures-list"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {str(item["id"]) for item in response.data["results"]}
        self.assertIn(str(self.other_structure.id), ids)
        self.assertNotIn(str(self.foreign_structure.id), ids)
        self.assertEqual(
            self.client.get(reverse("farm-structures-detail", args=[self.foreign_structure.id])).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_operator_creates_and_edits_only_own_structure(self):
        create = self.client.post(
            reverse("farm-structures-list"),
            {
                "farm": self.farm_a.id,
                "category": FarmStructure.Category.PIGSTY,
                "name": "Chiqueiro 1",
                "quantity": 2,
                "acquisition_value": "500.00",
                "current_value": "400.00",
            },
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_201_CREATED)
        structure = FarmStructure.objects.get(id=create.data["id"])
        self.assertEqual(structure.created_by, self.operator)
        self.assertEqual(
            self.client.patch(
                reverse("farm-structures-detail", args=[structure.id]), {"name": "Chiqueiro editado"},
                format="json",
            ).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.patch(
                reverse("farm-structures-detail", args=[self.other_structure.id]), {"name": "Negada"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(reverse("farm-structures-detail", args=[structure.id])).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_rejects_foreign_farm_and_returns_summary(self):
        create = self.client.post(
            reverse("farm-structures-list"),
            {"farm": self.farm_b.id, "category": FarmStructure.Category.OTHER, "name": "Externa"},
            format="json",
        )
        self.assertEqual(create.status_code, status.HTTP_400_BAD_REQUEST)

        summary = self.client.get(reverse("farm-structures-summary"), {"farm": self.farm_a.id})
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data["total_items"], 1)
        self.assertEqual(summary.data["acquisition_value"], 1000)
        self.assertEqual(summary.data["current_value"], 800)


class FarmAssetTestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Patrimônio", slug="farm-assets")
        self.other_org = Organization.objects.create(name="Outra", slug="farm-assets-other")
        self.operator = User.objects.create_user(
            email="assets@example.com", password="Password-8472", full_name="Operador",
            organization=self.org, role=User.Role.OPERATOR,
        )
        self.other_user = User.objects.create_user(
            email="assets-other-user@example.com", password="Password-8472", full_name="Outro",
            organization=self.org, role=User.Role.OPERATOR,
        )
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda Patrimônio")
        self.foreign_farm = Farm.objects.create(organization=self.other_org, name="Fazenda Externa")
        self.other_asset = FarmAsset.objects.create(
            farm=self.farm, asset_type=FarmAsset.AssetType.TRUCK, brand="Mercedes", model="1719",
            acquisition_value="100000.00", current_value="80000.00", created_by=self.other_user,
        )
        self.client.force_authenticate(self.operator)

    def test_operator_creates_own_asset_and_implement(self):
        response = self.client.post(
            reverse("farm-assets-list"),
            {
                "farm": self.farm.id, "asset_type": FarmAsset.AssetType.TRACTOR,
                "brand": "John Deere", "model": "6140J", "acquisition_value": "365000.00",
                "current_value": "320000.00",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        asset = FarmAsset.objects.get(id=response.data["id"])
        self.assertEqual(asset.created_by, self.operator)

        implement = self.client.post(
            reverse("farm-asset-implements-list"),
            {"asset": asset.id, "name": "Grade aradora", "quantity": 2, "acquisition_value": "10000.00"},
            format="json",
        )
        self.assertEqual(implement.status_code, status.HTTP_201_CREATED)
        self.assertTrue(FarmAssetImplement.objects.filter(asset=asset, name="Grade aradora").exists())

        summary = self.client.get(reverse("farm-assets-summary"), {"farm": self.farm.id})
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data["total_assets"], 2)
        self.assertEqual(summary.data["implements_value"], 20000)
        self.assertEqual(summary.data["total_invested"], 485000)

    def test_operator_cannot_edit_others_or_use_foreign_farm(self):
        self.assertEqual(
            self.client.patch(
                reverse("farm-assets-detail", args=[self.other_asset.id]), {"model": "Alterado"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                reverse("farm-assets-list"),
                {"farm": self.foreign_farm.id, "asset_type": "tractor", "brand": "X", "model": "Y",
                 "acquisition_value": "1.00", "current_value": "1.00"}, format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                reverse("farm-asset-implements-list"),
                {"asset": self.other_asset.id, "name": "Negado", "quantity": 1, "acquisition_value": "1.00"},
                format="json",
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
