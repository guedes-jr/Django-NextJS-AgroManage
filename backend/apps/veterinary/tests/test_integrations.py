from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque
from apps.livestock.models import Animal, Mating, Pregnancy, Species
from apps.organizations.models import Organization
from apps.veterinary.models import VeterinaryAnimal, VeterinaryProcedure, VeterinaryTeamMember

from .test_veterinary import PASSWORD, VeterinaryBase, contract

User = get_user_model()
FEATURES = "/api/v1/organizations/segment-features/"


class SegmentFeatureBase(VeterinaryBase):
    def turn(self, segment, **values):
        response = self.client.put(FEATURES, {"segments": {segment: values}}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        return response.data["segments"]


class SegmentFeatureTests(SegmentFeatureBase):
    def test_defaults_keep_existing_behaviour_and_new_ones_off(self):
        data = self.client.get(FEATURES).data
        self.assertTrue(data["can_edit"])
        self.assertEqual(data["segments"]["plantacoes"], {"agenda": True, "finance": True})
        self.assertEqual(data["segments"]["bovinos"], {"agenda": True, "whatsapp_alerts": True})
        self.assertFalse(any(data["segments"]["area-veterinario"].values()))
        access = self.client.get("/api/v1/auth/me/").data["access"]
        self.assertEqual(access["segment_features"], data["segments"])

    def test_only_admin_edits_and_unknown_codes_are_refused(self):
        self.assertEqual(self.client.put(FEATURES, {"segments": {"plantacoes": {"nope": True}}}, format="json").status_code, 400)
        manager = User.objects.create_user(role="manager", email="feat-manager@example.com", password=PASSWORD, full_name="M", organization=self.org)
        self.client.force_authenticate(manager)
        self.assertFalse(self.client.get(FEATURES).data["can_edit"])
        self.assertEqual(self.client.put(FEATURES, {"segments": {"plantacoes": {"agenda": False}}}, format="json").status_code, 403)

    def test_veterinary_segment_only_listed_when_contracted(self):
        other = Organization.objects.create(name="Sem vet", slug="feat-novet")
        user = User.objects.create_user(role="admin", email="feat-novet@example.com", password=PASSWORD, full_name="N", organization=other)
        self.client.force_authenticate(user)
        segments = self.client.get(FEATURES).data["segments"]
        self.assertNotIn("area-veterinario", segments)
        self.assertEqual(self.client.put(FEATURES, {"segments": {"area-veterinario": {"finance": True}}}, format="json").status_code, 400)

    def test_settings_are_per_organization(self):
        self.turn("plantacoes", agenda=False)
        other = Organization.objects.create(name="Outra", slug="feat-other")
        user = User.objects.create_user(role="admin", email="feat-other@example.com", password=PASSWORD, full_name="O", organization=other)
        self.client.force_authenticate(user)
        self.assertTrue(self.client.get(FEATURES).data["segments"]["plantacoes"]["agenda"])


class VeterinaryAgendaTests(SegmentFeatureBase):
    def test_alerts_enter_the_agenda_only_when_on_and_vet_may_open_it(self):
        self.register(diagnosis="open", conduct="iatf_protocol", protocol_start=self.today.isoformat())
        start, end = self.today.isoformat(), (self.today + timedelta(days=14)).isoformat()
        agenda = lambda: self.client.get("/api/v1/tasks/agenda/", {"start": start, "end": end})  # noqa: E731
        self.assertFalse([e for e in agenda().data["results"] if e["domain"] == "veterinary"])
        vet = User.objects.create_user(role="veterinarian", email="agenda-vet@example.com", password=PASSWORD, full_name="Vet", organization=self.org)
        self.client.force_authenticate(vet)
        self.assertEqual(agenda().status_code, 403)
        self.client.force_authenticate(self.admin)
        self.turn("area-veterinario", agenda=True)
        events = [e for e in agenda().data["results"] if e["domain"] == "veterinary"]
        self.assertEqual(len(events), 2)
        self.assertEqual(events[0]["source_url"], "/home/veterinario?aba=al")
        self.client.force_authenticate(vet)
        response = agenda()
        self.assertEqual(response.status_code, 200)
        self.assertEqual({e["domain"] for e in response.data["results"]}, {"veterinary"})


class HerdIntegrationTests(SegmentFeatureBase):
    def setUp(self):
        super().setUp()
        self.cattle, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.own_farm = Farm.objects.create(organization=self.org, name="Fazenda própria")
        response = self.client.patch(f"/api/v1/veterinary/clients/{self.farm['id']}/", {"farm": str(self.own_farm.pk), "herd_purpose": "dairy"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["herd_purpose"], "dairy")

    def test_off_by_default(self):
        self.register(diagnosis="pregnant", coverage_method="natural", gestation_days=60)
        self.assertFalse(Animal.objects.filter(farm=self.own_farm).exists())

    def test_creates_identified_animal_and_reproduction_records(self):
        self.turn("area-veterinario", herd_integration=True)
        response = self.register(diagnosis="pregnant", coverage_method="natural", gestation_days=60, bull="Touro X")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["procedure"]["herd_synced"])
        cow = Animal.objects.get(farm=self.own_farm, identifier="101")
        self.assertEqual(cow.data["source"], "veterinary")
        self.assertEqual(cow.cattle_purpose, "dairy")
        self.assertEqual(cow.reproductive_status, "gestante")
        self.assertEqual(VeterinaryAnimal.objects.get(identifier="101").data["herd_animal_id"], str(cow.pk))
        mating = Mating.objects.get(female=cow)
        self.assertEqual((mating.status, mating.mating_type), ("confirmed", "natural"))
        self.assertTrue(Pregnancy.objects.filter(mating=mating).exists())

    def test_links_existing_animal_and_records_insemination_then_negative(self):
        existing = Animal.objects.create(farm=self.own_farm, species=self.cattle, identifier="202")
        self.turn("area-veterinario", herd_integration=True)
        animal = VeterinaryAnimal.objects.create(organization=self.org, client_id=self.farm["id"], identifier="202")
        response = self.client.post(f"/api/v1/veterinary/animals/{animal.pk}/quick/", {"date": self.today.isoformat(), "action": "insemination", "bull": "Sêmen Y"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        existing.refresh_from_db()
        self.assertEqual(existing.reproductive_status, "coberta")
        self.assertEqual(existing.data["veterinary"]["animal_id"], str(animal.pk))
        self.assertNotIn("source", existing.data)
        mating = Mating.objects.get(female=existing)
        self.assertEqual((mating.sire_info, mating.status), ("Sêmen Y", "pending_dg"))
        self.register(animal="202", diagnosis="open", conduct="observe_heat")
        mating.refresh_from_db()
        existing.refresh_from_db()
        self.assertEqual(mating.status, "failed")
        self.assertEqual(existing.reproductive_status, "vazia")
        self.assertEqual(Animal.objects.filter(farm=self.own_farm).count(), 1)

    def test_client_farm_must_belong_to_the_organization(self):
        other = Organization.objects.create(name="Alheia", slug="herd-foreign")
        foreign = Farm.objects.create(organization=other, name="Alheia")
        response = self.client.patch(f"/api/v1/veterinary/clients/{self.farm['id']}/", {"farm": str(foreign.pk)}, format="json")
        self.assertEqual(response.status_code, 400)


class FinanceTests(SegmentFeatureBase):
    def mirror(self, procedure_id):
        return Transaction.objects.filter(organization=self.org, reference=f"VETPROC-{procedure_id}").first()

    def test_mirror_follows_value_and_payment(self):
        before = self.register(diagnosis="open", conduct="observe_heat").data["procedure"]["id"]
        self.assertIsNone(self.mirror(before))
        self.turn("area-veterinario", finance=True)
        old = self.mirror(before)  # turning it on mirrors what was saved while off
        self.assertEqual((old.amount, old.status, old.category.category_type), (Decimal("15.00"), "pending", "revenue"))
        self.assertEqual(old.due_date, self.today + timedelta(days=30))
        procedure = self.register(animal="102", diagnosis="open", conduct="observe_heat").data["procedure"]["id"]
        self.assertEqual(self.client.patch(f"/api/v1/veterinary/procedures/{procedure}/", {"paid": True, "value": "20.00"}, format="json").status_code, 200)
        mirror = self.mirror(procedure)
        self.assertEqual((mirror.amount, mirror.status, mirror.payment_date), (Decimal("20.00"), "paid", self.today))
        self.client.post("/api/v1/veterinary/billing/pay-all/", {"client": self.farm["id"], "month": self.today.isoformat()[:7]}, format="json")
        self.assertEqual(self.mirror(before).status, "paid")
        self.client.patch(f"/api/v1/veterinary/procedures/{procedure}/", {"value": "0"}, format="json")
        self.assertIsNone(self.mirror(procedure))

    def test_wipe_removes_mirrors(self):
        self.turn("area-veterinario", finance=True)
        procedure = self.register(diagnosis="open", conduct="observe_heat").data["procedure"]["id"]
        self.client.post("/api/v1/veterinary/wipe/")
        self.assertIsNone(self.mirror(procedure))


class PricingTests(SegmentFeatureBase):
    def test_client_price_package_and_quantity_discount(self):
        self.assertEqual(self.client.get("/api/v1/veterinary/client-prices/").status_code, 400)  # off
        self.turn("area-veterinario", client_pricing=True)
        response = self.client.post("/api/v1/veterinary/client-prices/", {"client": self.farm["id"], "kind": "ultrasound", "price": "12.00"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.client.patch("/api/v1/veterinary/settings/", {"discount_min_animals": 3, "discount_percent": "10"}, format="json")
        first = self.register(diagnosis="open", conduct="observe_heat").data["procedure"]
        self.assertEqual(Decimal(first["value"]), Decimal("12.00"))
        self.register(animal="102", diagnosis="open", conduct="observe_heat")
        self.register(animal="103", diagnosis="open", conduct="observe_heat")
        values = sorted(VeterinaryProcedure.objects.filter(organization=self.org).values_list("value", flat=True))
        self.assertEqual(values, [Decimal("10.80")] * 3)

    def test_iatf_package_charged_at_insemination(self):
        self.turn("area-veterinario", client_pricing=True)
        self.assertEqual(self.client.patch("/api/v1/veterinary/settings/", {"price_iatf_package": "80"}, format="json").status_code, 200)
        start = (self.today - timedelta(days=10)).isoformat()
        self.register(diagnosis="open", conduct="iatf_protocol", protocol_start=start, date=start)
        self.register(step_done="yes", step_date=(self.today - timedelta(days=2)).isoformat())
        result = self.register(step_done="yes", step_date=self.today.isoformat(), step_bull="Touro").data["procedure"]
        self.assertEqual((result["kind"], Decimal(result["value"]), result["pricing"]["rule"]), ("insemination", Decimal("80.00"), "iatf_package"))


class InputsTeamIndicatorsTests(SegmentFeatureBase):
    def setUp(self):
        super().setUp()
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Sêmen Holandês", categoria="semen", unidade_medida="dose")
        self.lot = LoteEstoque.objects.create(item=self.item, quantidade_inicial=10, quantidade_atual=10, custo_unitario=Decimal("40"), data_entrada=self.today)

    def test_inputs_leave_stock_and_become_area_cost(self):
        lots = self.client.get("/api/v1/veterinary/input-lots/").data
        self.assertEqual([row["id"] for row in lots], [str(self.lot.pk)])
        response = self.register(diagnosis="open", conduct="observe_heat", inputs=[{"lot": str(self.lot.pk), "quantity": "2"}])
        self.assertEqual(response.status_code, 201, response.data)
        self.lot.refresh_from_db()
        self.assertEqual(self.lot.quantidade_atual, Decimal("8"))
        self.assertTrue(MovimentacaoEstoque.objects.filter(lote=self.lot, tipo="consumo", destino="Área do veterinário").exists())
        card = self.client.get("/api/v1/reports/dashboard/").data["segments"]["veterinary"]
        self.assertEqual(Decimal(str(card["cost"])), Decimal("80"))
        too_much = self.register(animal="102", diagnosis="open", conduct="observe_heat", inputs=[{"lot": str(self.lot.pk), "quantity": "50"}])
        self.assertEqual(too_much.status_code, 400)
        self.assertFalse(VeterinaryAnimal.objects.filter(identifier="102").exists())  # rolled back

    def test_team_member_commission_in_billing_and_card(self):
        vet = User.objects.create_user(role="veterinarian", email="team-vet@example.com", password=PASSWORD, full_name="Dra. Ana", organization=self.org)
        self.assertEqual([row["id"] for row in self.client.get("/api/v1/veterinary/team/candidates/").data].count(str(vet.pk)), 1)
        response = self.client.post("/api/v1/veterinary/team/", {"user": str(vet.pk), "commission_percent": "10"}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        procedure = self.register(diagnosis="open", conduct="observe_heat", responsible_user=str(vet.pk)).data["procedure"]
        self.assertEqual(procedure["responsible"], "Dra. Ana")
        billing = self.client.get("/api/v1/veterinary/billing/").data
        row = next(r for r in billing["responsibles"] if r["user"] == str(vet.pk))
        self.assertEqual(Decimal(str(row["commission"])), Decimal("1.50"))
        self.client.force_authenticate(vet)
        self.assertEqual(self.client.patch(f"/api/v1/veterinary/team/{response.data['id']}/", {"commission_percent": "50"}, format="json").status_code, 400)
        self.assertTrue(VeterinaryTeamMember.objects.filter(commission_percent=Decimal("10")).exists())
        outsider = User.objects.create_user(role="admin", email="team-out@example.com", password=PASSWORD, full_name="X", organization=Organization.objects.create(name="X", slug="team-x"))
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.register(animal="103", diagnosis="open", conduct="observe_heat", responsible_user=str(outsider.pk)).status_code, 400)

    def test_indicators_by_bull_and_month(self):
        day = (self.today - timedelta(days=40)).isoformat()
        animal = VeterinaryAnimal.objects.create(organization=self.org, client_id=self.farm["id"], identifier="301")
        quick = self.client.post(f"/api/v1/veterinary/animals/{animal.pk}/quick/", {"date": day, "action": "insemination", "bull": "Touro A"}, format="json")
        self.assertEqual(quick.status_code, 201, quick.data)
        diagnosis = self.register(animal="301", diagnosis="pregnant", confirm_pregnancy=True, coverage_method="artificial")
        self.assertEqual(diagnosis.status_code, 201, diagnosis.data)
        data = self.client.get("/api/v1/veterinary/indicators/").data
        self.assertEqual((data["total"], data["pregnant"], data["rate"]), (1, 1, 100.0))
        self.assertEqual(data["by_bull"][0]["name"], "Touro A")
        self.assertEqual(data["by_month"][0]["name"], day[:7])


class AttachmentPrescriptionTests(SegmentFeatureBase):
    def setUp(self):
        super().setUp()
        self.register(diagnosis="open", conduct="observe_heat")
        self.vet_animal = VeterinaryAnimal.objects.get(identifier="101")

    def test_upload_download_and_tenant_isolation(self):
        upload = SimpleUploadedFile("ultrassom.png", b"\x89PNG\r\n\x1a\nfake", content_type="image/png")
        response = self.client.post("/api/v1/veterinary/attachments/", {"animal": str(self.vet_animal.pk), "file": upload}, format="multipart")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["kind"], "photo")
        self.assertEqual(self.client.get(response.data["url"]).status_code, 200)
        bad = SimpleUploadedFile("x.exe", b"MZ", content_type="application/octet-stream")
        self.assertEqual(self.client.post("/api/v1/veterinary/attachments/", {"animal": str(self.vet_animal.pk), "file": bad}, format="multipart").status_code, 400)
        other = Organization.objects.create(name="Vet C", slug="vet-c-files")
        contract(other)
        outsider = User.objects.create_user(role="admin", email="vet-c-files@example.com", password=PASSWORD, full_name="C", organization=other)
        self.client.force_authenticate(outsider)
        self.assertEqual(self.client.get(response.data["url"]).status_code, 404)

    def test_prescription(self):
        payload = {"client": self.farm["id"], "animal": str(self.vet_animal.pk), "date": self.today.isoformat(),
                   "items": [{"product": "Benzoato de estradiol", "dose": "2 ml", "route": "IM"}], "withdrawal": "Leite: 0 dia"}
        response = self.client.post("/api/v1/veterinary/prescriptions/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["animal_identifier"], "101")
        self.assertEqual(self.client.post("/api/v1/veterinary/prescriptions/", {**payload, "items": []}, format="json").status_code, 400)
        listed = self.client.get("/api/v1/veterinary/prescriptions/", {"animal": str(self.vet_animal.pk)}).data
        self.assertEqual(len(listed), 1)


class WhatsAppSummaryTests(SegmentFeatureBase):
    def test_daily_summary_only_when_on(self):
        from django.utils import timezone

        from apps.accounts.models import User as UserModel
        from apps.notifications.models import Notification
        from apps.veterinary.notifications import collect_veterinary_notifications

        UserModel.objects.filter(pk=self.admin.pk).update(phone="73999990000", phone_is_whatsapp=True, receive_system_alerts=True)
        from apps.notifications.models import NotificationPreference

        NotificationPreference.objects.update_or_create(user=self.admin, defaults={"whatsapp_reproductive_alerts": True})
        self.register(diagnosis="open", conduct="observe_heat", return_days=0)
        noon = timezone.now().replace(hour=12)
        self.assertEqual(collect_veterinary_notifications(noon), 0)
        self.turn("area-veterinario", whatsapp_alerts=True)
        self.assertEqual(collect_veterinary_notifications(noon), 1)
        self.assertEqual(collect_veterinary_notifications(noon), 0)  # once a day
        self.assertTrue(Notification.objects.filter(user=self.admin, event_key__startswith="veterinary.daily:").exists())
