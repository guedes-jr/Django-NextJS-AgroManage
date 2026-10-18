from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import OperatorRecordOwnership
from apps.audit.models import AuditLog
from apps.farms.models import Farm
from apps.livestock.models import Animal, AnimalBatch, Species, WeightRecord
from apps.notifications.models import Notification
from apps.organizations.models import Organization
from apps.tasks.models import Task

User = get_user_model()


class OperatorAccessTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Escopo", slug="operator-scope")
        self.other_org = Organization.objects.create(
            name="Outra", slug="operator-other"
        )
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")
        self.other_farm = Farm.objects.create(organization=self.other_org, name="Outra")
        self.pigs, _ = Species.objects.get_or_create(
            code="suinos", defaults={"name": "Suínos"}
        )
        self.cattle, _ = Species.objects.get_or_create(
            code="bovinos", defaults={"name": "Bovinos"}
        )
        self.admin = User.objects.create_user(
            email="admin@scope.test",
            full_name="Admin",
            organization=self.org,
            role="admin",
            organization_responsible=True,
        )
        self.operator = User.objects.create_user(
            email="operator@scope.test",
            full_name="Operador",
            organization=self.org,
            role="operator",
        )
        self.operator.allowed_livestock.add(self.pigs)
        self.pig = Animal.objects.create(
            farm=self.farm, species=self.pigs, identifier="PIG1", gender="F"
        )
        self.cow = Animal.objects.create(
            farm=self.farm, species=self.cattle, identifier="COW1", gender="F"
        )
        self.other_pig = Animal.objects.create(
            farm=self.other_farm, species=self.pigs, identifier="OTHER1", gender="F"
        )
        self.batch = AnimalBatch.objects.create(
            farm=self.farm,
            species=self.pigs,
            batch_code="PIG-BATCH",
            quantity=10,
            entry_date=timezone.localdate(),
            purchase_value=900,
        )
        self.client.force_authenticate(self.operator)

    def test_navbar_search_filters_animals_and_preserves_scope(self):
        response = self.client.get("/api/v1/livestock/animals/", {"search": "pig"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data["results"]], [str(self.pig.pk)])
        for term in ("COW1", "OTHER1", "missing"):
            response = self.client.get("/api/v1/livestock/animals/", {"search": term})
            self.assertEqual(response.data["results"], [])

    def test_navbar_search_filters_batches_by_code_and_name(self):
        self.batch.name = "Lote Primavera"
        self.batch.save(update_fields=["name"])
        AnimalBatch.objects.create(
            farm=self.other_farm, species=self.pigs, batch_code="PIG-OTHER",
            quantity=1, entry_date=timezone.localdate(),
        )
        AnimalBatch.objects.create(
            farm=self.farm, species=self.cattle, batch_code="PIG-CATTLE",
            quantity=1, entry_date=timezone.localdate(),
        )
        for term in ("pig", "primavera"):
            response = self.client.get("/api/v1/livestock/batches/", {"search": term})
            self.assertEqual(response.status_code, 200)
            self.assertEqual([row["id"] for row in response.data["results"]], [str(self.batch.pk)])
        response = self.client.get("/api/v1/livestock/batches/", {"search": "missing"})
        self.assertEqual(response.data["results"], [])

    def test_only_three_role_choices_and_options_from_species_catalog(self):
        response = self.client.get("/api/v1/auth/operator-options/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            {role["value"] for role in response.data["roles"]},
            {"admin", "manager", "operator"},
        )
        self.assertTrue(
            any(item["id"] == self.pigs.pk for item in response.data["species"])
        )

    def test_general_dashboard_contains_no_financial_fields_and_only_assigned_tasks(
        self,
    ):
        Task.objects.create(
            organization=self.org, title="Minha tarefa", assigned_to=self.operator
        )
        Task.objects.create(
            organization=self.org, title="Outra tarefa", assigned_to=self.admin
        )
        response = self.client.get("/api/v1/reports/dashboard/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["mode"], "operational")
        self.assertNotIn("kpis", response.data)
        self.assertNotIn("charts", response.data)
        self.assertNotIn("recent_activities", response.data)
        self.assertEqual(
            [row["code"] for row in response.data["operational"]["herds"]], ["suinos"]
        )
        self.assertIsNone(response.data["operational"]["plantations"])
        self.assertEqual(
            [row["title"] for row in response.data["tasks"]], ["Minha tarefa"]
        )

    def test_list_and_detail_hide_other_species_and_other_tenants(self):
        response = self.client.get("/api/v1/livestock/animals/")
        self.assertEqual(response.status_code, 200)
        rows = (
            response.data["results"]
            if isinstance(response.data, dict)
            else response.data
        )
        self.assertEqual({str(row["id"]) for row in rows}, {str(self.pig.pk)})
        for animal in (self.cow, self.other_pig):
            self.assertEqual(
                self.client.get(f"/api/v1/livestock/animals/{animal.pk}/").status_code,
                404,
            )
        self.assertEqual(
            self.client.get(
                "/api/v1/livestock/dashboard/species-summary/", {"species": "bovinos"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/livestock/dashboard/reproduction/", {"species": "bovinos"}
            ).status_code,
            403,
        )

    def test_financial_reports_sales_and_administration_are_denied(self):
        for path in (
            "/api/v1/finance/transactions/",
            "/api/v1/auth/members/",
            "/api/v1/reports/configs/",
            f"/api/v1/livestock/batches/{self.batch.pk}/financial-details/",
            "/api/v1/livestock/batches/sales/",
        ):
            self.assertIn(self.client.get(path).status_code, (403, 404), path)
        self.assertEqual(
            self.client.post(
                f"/api/v1/livestock/batches/{self.batch.pk}/register-sale/",
                {},
                format="json",
            ).status_code,
            403,
        )

    def test_new_species_requires_explicit_authorization(self):
        new = Species.objects.create(code="new-scope", name="Novo rebanho")
        Animal.objects.create(
            farm=self.farm, species=new, identifier="NEW1", gender="F"
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/livestock/dashboard/species-summary/", {"species": new.code}
            ).status_code,
            403,
        )

    def test_crop_access_can_be_granted_and_removed_immediately(self):
        self.assertEqual(self.client.get("/api/v1/crops/plantations/").status_code, 403)
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/api/v1/auth/members/{self.operator.pk}/",
            {"can_operate_crops": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            AuditLog.objects.filter(
                model_name="User", object_id=str(self.operator.pk)
            ).exists()
        )
        self.operator.refresh_from_db()
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.client.get("/api/v1/crops/plantations/").status_code, 200)

    def test_self_profile_cannot_elevate_role_or_change_scope(self):
        self.client.patch(
            "/api/v1/auth/me/",
            {
                "role": "admin",
                "can_operate_crops": True,
                "allowed_livestock": [str(self.cattle.pk)],
            },
            format="json",
        )
        self.operator.refresh_from_db()
        self.assertEqual(self.operator.role, "operator")
        self.assertFalse(self.operator.can_operate_crops)
        self.assertEqual(
            list(self.operator.allowed_livestock.values_list("code", flat=True)),
            ["suinos"],
        )

    def test_only_admin_can_change_permissions_and_responsible_is_protected(self):
        manager = User.objects.create_user(
            email="manager@scope.test",
            full_name="Gerente",
            organization=self.org,
            role="manager",
        )
        self.client.force_authenticate(manager)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/auth/members/{self.operator.pk}/",
                {"can_operate_crops": True},
                format="json",
            ).status_code,
            403,
        )
        second = User.objects.create_user(
            email="admin2@scope.test",
            full_name="Admin2",
            organization=self.org,
            role="admin",
        )
        self.client.force_authenticate(second)
        self.assertEqual(
            self.client.delete(f"/api/v1/auth/members/{self.admin.pk}/").status_code,
            400,
        )
        self.assertEqual(
            self.client.patch(
                f"/api/v1/auth/members/{self.admin.pk}/",
                {"role": "operator"},
                format="json",
            ).status_code,
            400,
        )

    def test_animal_weight_action_tracks_ownership_for_corrections(self):
        response = self.client.post(
            f"/api/v1/livestock/animals/{self.pig.pk}/register-weight/",
            {"weight_kg": "90", "weighing_date": str(timezone.localdate())},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        record = WeightRecord.objects.get(animal=self.pig)
        self.assertTrue(
            OperatorRecordOwnership.objects.filter(
                user=self.operator,
                organization=self.org,
                model_label=record._meta.label_lower,
                object_id=record.pk,
            ).exists()
        )
        response = self.client.patch(
            f"/api/v1/livestock/weights/{record.pk}/",
            {"weight_kg": "91"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_operator_can_create_and_correct_own_weight_but_not_others(self):
        payload = {
            "farm": str(self.farm.pk),
            "species": str(self.pigs.pk),
            "animal": str(self.pig.pk),
            "weight_kg": "90",
            "weighing_date": str(timezone.localdate()),
        }
        response = self.client.post(
            "/api/v1/livestock/weights/", payload, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        pk = response.data["id"]
        self.assertTrue(
            OperatorRecordOwnership.objects.filter(
                user=self.operator, object_id=pk
            ).exists()
        )
        self.assertEqual(
            self.client.patch(
                f"/api/v1/livestock/weights/{pk}/", {"weight_kg": "91"}, format="json"
            ).status_code,
            200,
        )
        other = WeightRecord.objects.create(
            farm=self.farm,
            species=self.pigs,
            animal=self.pig,
            weight_kg=80,
            weighing_date=timezone.localdate(),
        )
        self.assertEqual(
            self.client.patch(
                f"/api/v1/livestock/weights/{other.pk}/",
                {"weight_kg": "92"},
                format="json",
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.delete(f"/api/v1/livestock/weights/{pk}/").status_code, 403
        )

    def test_related_object_cannot_cross_species_or_tenant(self):
        payload = {
            "farm": str(self.farm.pk),
            "species": str(self.pigs.pk),
            "animal": str(self.cow.pk),
            "weight_kg": "90",
            "weighing_date": str(timezone.localdate()),
        }
        self.assertEqual(
            self.client.post(
                "/api/v1/livestock/weights/", payload, format="json"
            ).status_code,
            403,
        )
        payload["animal"] = str(self.other_pig.pk)
        self.assertEqual(
            self.client.post(
                "/api/v1/livestock/weights/", payload, format="json"
            ).status_code,
            403,
        )

    def test_read_only_migrated_operator_cannot_write(self):
        self.operator.operator_read_only = True
        self.operator.save()
        self.assertEqual(
            self.client.post(
                "/api/v1/livestock/weights/", {}, format="json"
            ).status_code,
            403,
        )
        self.assertEqual(self.client.get("/api/v1/livestock/animals/").status_code, 200)

    def test_financial_values_are_removed_from_operational_responses(self):
        response = self.client.get(f"/api/v1/livestock/batches/{self.batch.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("purchase_value", response.data)
        self.assertNotIn("sale_value", response.data)
        response = self.client.get("/api/v1/organizations/me/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["subscription"])

    def test_notification_history_hides_financial_categories(self):
        Notification.objects.create(
            user=self.operator,
            title="Financeiro",
            message="Saldo",
            category="finance",
            type="finance",
        )
        Notification.objects.create(
            user=self.operator, title="Sistema", message="Aviso", category="system"
        )
        response = self.client.get("/api/v1/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(
            self.client.get("/api/v1/notifications/unread-count/").data["unread_count"],
            1,
        )

    def test_real_jwt_blocks_explicit_permission_endpoints(self):
        self.client.force_authenticate(None)
        token = RefreshToken.for_user(self.operator).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        for path in (
            "/api/v1/auth/users/",
            "/api/v1/inventory/fornecedores/",
            "/api/v1/reports/dashboard/crops/",
        ):
            self.assertIn(self.client.get(path).status_code, (403, 404))

    def test_existing_jwt_loses_herd_access_immediately(self):
        self.client.force_authenticate(None)
        token = RefreshToken.for_user(self.operator).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.assertEqual(self.client.get("/api/v1/livestock/animals/").status_code, 200)
        self.operator.allowed_livestock.clear()
        self.assertEqual(self.client.get("/api/v1/livestock/animals/").status_code, 403)

    def test_read_only_operator_can_update_personal_preferences(self):
        self.operator.operator_read_only = True
        self.operator.save(update_fields=["operator_read_only"])
        response = self.client.patch(
            "/api/v1/auth/preferences/", {"theme": "dark"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_cycle_notifications_follow_both_species_and_tenant(self):
        from apps.livestock.models import Mating
        from apps.notifications.operator_scope import event_allowed

        for animal, visible in [
            (self.pig, True),
            (self.cow, False),
            (self.other_pig, False),
        ]:
            mating = Mating.objects.create(
                female=animal, mating_date=timezone.localdate()
            )
            event = f"livestock.reproductive_vaccine.mating:{mating.pk}"
            Notification.objects.create(
                user=self.operator,
                title=animal.identifier,
                message="Ciclo",
                category="animal_cycle",
                type="animal",
                event_key=event,
            )
            self.assertEqual(
                event_allowed(self.operator, "animal_cycle", event), visible
            )
        response = self.client.get("/api/v1/notifications/")
        self.assertEqual(
            [row["title"] for row in response.data["results"]], [self.pig.identifier]
        )

    def test_migration_preserves_operators_and_restricts_former_viewers(self):
        from importlib import import_module

        from django.apps import apps

        # A legacy owner needs a tenant without an existing responsible user;
        # the current schema enforces uniqueness after the later backfill.
        migration_org = Organization.objects.create(name="Migração de cargos", slug="migration-roles")
        former_owner = User.objects.create_user(
            email="owner@migration.test", organization=migration_org, role="owner"
        )
        former_viewer = User.objects.create_user(
            email="viewer@migration.test", organization=self.org, role="viewer"
        )
        migrate = import_module(
            "apps.accounts.migrations.0008_three_roles_and_operator_scope"
        )
        migrate.migrate_access(apps, None)
        former_owner.refresh_from_db()
        former_viewer.refresh_from_db()
        self.operator.refresh_from_db()
        self.assertEqual(former_owner.role, "admin")
        self.assertTrue(former_owner.organization_responsible)
        self.assertEqual(former_viewer.role, "operator")
        self.assertTrue(former_viewer.operator_read_only)
        self.assertFalse(former_viewer.can_operate_crops)
        self.assertFalse(former_viewer.allowed_livestock.exists())
        self.assertTrue(self.operator.can_operate_crops)
        self.assertEqual(
            set(self.operator.allowed_livestock.values_list("pk", flat=True)),
            set(Species.objects.values_list("pk", flat=True)),
        )
        new_species = Species.objects.create(code="migration-new", name="Novo")
        self.assertFalse(
            self.operator.allowed_livestock.filter(pk=new_species.pk).exists()
        )

    def test_operator_feed_respects_stock_scope_and_hides_cost(self):
        from apps.inventory.models import ItemEstoque, LoteEstoque

        feed = ItemEstoque.objects.create(
            organization=self.org, nome="Ração", categoria="racao", unidade_medida="kg"
        )
        stock = LoteEstoque.objects.create(
            item=feed,
            numero_lote="OP-FEED",
            quantidade_inicial=100,
            quantidade_atual=100,
            custo_unitario=3,
            data_entrada=timezone.localdate(),
        )
        self.batch.phase = "creche"
        self.batch.save(update_fields=["phase"])
        payload = {
            "lote_animal": str(self.batch.pk),
            "item_estoque": str(feed.pk),
            "categoria_destino": "lotes",
            "fase_destino": "creche",
            "data_inicio": str(timezone.localdate()),
            "data_fim": str(timezone.localdate()),
            "quantidade": 5,
        }
        response = self.client.post(
            "/api/v1/inventory/consumos/", payload, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn("custo_total", response.data)
        stock.refresh_from_db()
        self.assertEqual(stock.quantidade_atual, 95)
        self.assertEqual(
            self.client.patch(
                f"/api/v1/inventory/consumos/{response.data['id']}/",
                {"quantidade": 6},
                format="json",
            ).status_code,
            403,
        )
        foreign = AnimalBatch.objects.create(
            farm=self.other_farm,
            species=self.pigs,
            batch_code="FOREIGN-FEED",
            phase="creche",
            quantity=5,
            entry_date=timezone.localdate(),
        )
        payload["lote_animal"] = str(foreign.pk)
        self.assertEqual(
            self.client.post(
                "/api/v1/inventory/consumos/", payload, format="json"
            ).status_code,
            403,
        )
        stock.refresh_from_db()
        self.assertEqual(stock.quantidade_atual, 95)

    def test_operator_crop_bulk_preserves_stock_and_rejects_nested_prices(self):
        from apps.crops.models import Field, PlantingCycle
        from apps.inventory.models import ItemEstoque, LoteEstoque

        self.operator.can_operate_crops = True
        self.operator.save(update_fields=["can_operate_crops"])
        field = Field.objects.create(farm=self.farm, name="Talhão", area_ha=5)
        crop = PlantingCycle.objects.create(
            organization=self.org,
            farm=self.farm,
            field=field,
            crop_name="Milho",
            name="Safra",
            planting_date=timezone.localdate(),
        )
        item = ItemEstoque.objects.create(
            organization=self.org,
            nome="Fertilizante",
            categoria="fertirrigacao",
            unidade_medida="kg",
        )
        stock = LoteEstoque.objects.create(
            item=item,
            numero_lote="OP-CROP",
            quantidade_inicial=100,
            quantidade_atual=100,
            custo_unitario=2,
            data_entrada=timezone.localdate(),
        )
        payload = [
            {
                "plantation": str(crop.pk),
                "item": str(item.pk),
                "lot": str(stock.pk),
                "quantity": 3,
                "unit": "kg",
                "application_date": str(timezone.localdate()),
            }
        ]
        response = self.client.post(
            "/api/v1/crops/fertigations/bulk-create/", payload, format="json"
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn("total_price", response.data[0])
        stock.refresh_from_db()
        self.assertEqual(stock.quantidade_atual, 97)
        self.assertTrue(
            OperatorRecordOwnership.objects.filter(
                user=self.operator, object_id=response.data[0]["id"]
            ).exists()
        )
        payload[0]["unit_price"] = 999
        self.assertEqual(
            self.client.post(
                "/api/v1/crops/fertigations/bulk-create/", payload, format="json"
            ).status_code,
            403,
        )
        stock.refresh_from_db()
        self.assertEqual(stock.quantidade_atual, 97)
