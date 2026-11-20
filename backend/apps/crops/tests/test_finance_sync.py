from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.urls import reverse
from rest_framework.test import APITestCase

from apps.crops.finance_sync import resync_organization
from apps.crops.models import Field, PesticideApplication, PesticideApplicationEquipment, PlantingCycle
from apps.farms.models import Farm
from apps.finance.models import FinancialCategory, Transaction
from apps.inventory.models import ItemEstoque, LoteEstoque
from apps.organizations.models import Organization

User = get_user_model()


class CropFinanceSyncTestCase(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Sync Org", slug="sync-org")
        self.user = User.objects.create_user(email="sync@test.com", password="Password-8472", full_name="Sync",
                                             role=User.Role.ADMIN, organization=self.org)
        self.client.force_authenticate(self.user)
        farm = Farm.objects.create(organization=self.org, name="Fazenda", total_area_ha=Decimal("20"))
        field = Field.objects.create(farm=farm, name="Setor 1", area_ha=Decimal("10"))
        self.cycle = PlantingCycle.objects.create(organization=self.org, farm=farm, field=field, name="Milho",
                                                  crop_name="Milho", planting_date=date.today())
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Fungicida", categoria="defensivo",
                                               categorias=["defensivo"], unidade_medida="l")
        LoteEstoque.objects.create(item=self.item, numero_lote="F-1", quantidade_inicial=Decimal("100"),
                                   quantidade_atual=Decimal("100"), custo_unitario=Decimal("50"), data_entrada=date.today())

    def _apply(self):
        response = self.client.post(reverse("crops-pesticides-list"), {
            "plantation": str(self.cycle.id), "item": str(self.item.id), "quantity": "2", "unit": "l",
            "unit_price": "50", "total_price": "100", "application_date": date.today().isoformat(),
            "equipments": [{"equipment": "Pulverizador", "quantity": "1", "unit_price": "80", "total_price": "80"}],
        }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["id"]

    def _mirror(self, application_id):
        return Transaction.objects.get(reference=f"PESTICIDE-{application_id}")

    def test_equipment_counts_everywhere(self):
        application_id = self._apply()
        self.assertEqual(self._mirror(application_id).amount, Decimal("180"))
        self.cycle.refresh_from_db()
        self.assertEqual(self.cycle.investment_total, Decimal("180"))
        crops = self.client.get(reverse("dashboard-summary")).data["segments"]["crops"]
        self.assertIn({"name": "Defensivos", "value": 180.0}, crops["cost_breakdown"])
        dashboard = self.client.get(reverse("crops-plantations-dashboard", args=[self.cycle.id])).data
        self.assertEqual(Decimal(dashboard["investment_total"]), Decimal("180"))
        self.assertEqual(Decimal(dashboard["real_profit"]), Decimal("-180"))

    def test_edit_and_delete_keep_finance_aligned(self):
        application_id = self._apply()
        response = self.client.patch(reverse("crops-pesticides-detail", args=[application_id]),
                                     {"total_price": "300"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self._mirror(application_id).amount, Decimal("380"))
        self.assertEqual(self.client.delete(reverse("crops-pesticides-detail", args=[application_id])).status_code, 204)
        self.assertFalse(Transaction.objects.filter(reference=f"PESTICIDE-{application_id}").exists())

    def test_resync_fixes_old_records(self):
        # Old application: created before the sync, stale mirror without equipment.
        application = PesticideApplication.objects.create(
            plantation=self.cycle, item=self.item, quantity=Decimal("2"), unit_price=Decimal("50"),
            total_price=Decimal("100"), application_date=date.today())
        PesticideApplicationEquipment.objects.create(application=application, equipment="Trator", total_price=Decimal("40"))
        category = FinancialCategory.objects.create(organization=self.org, name="Defensivos", category_type="expense")
        Transaction.objects.create(organization=self.org, category=category, description="old", amount=Decimal("100"),
                                   due_date=date.today(), payment_date=date.today(), status="paid",
                                   planting_cycle=self.cycle, reference=f"PESTICIDE-{application.id}")
        # Orphan mirror of a deleted operation.
        orphan = Transaction.objects.create(organization=self.org, category=category, description="orphan",
                                            amount=Decimal("999"), due_date=date.today(), status="paid",
                                            planting_cycle=self.cycle, reference="PESTICIDE-00000000-0000-0000-0000-000000000000")
        report = resync_organization(self.org, dry_run=True)
        self.assertEqual((report["updated"], report["orphans_cancelled"]), (1, 1))
        self.assertEqual(self._mirror(application.id).amount, Decimal("100"))  # dry run changed nothing

        call_command("sync_crop_finance", organization="sync-org", stdout=open("/dev/null", "w"))
        self.assertEqual(self._mirror(application.id).amount, Decimal("140"))
        orphan.refresh_from_db()
        self.assertEqual(orphan.status, "cancelled")
        self.assertEqual(resync_organization(self.org)["updated"], 0)
