from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.billing.models import Plan, PlanSegment, Subscription, SubscriptionItem
from apps.organizations.models import Organization
from apps.veterinary.access import SEGMENT_CODE
from apps.veterinary.models import VeterinaryAlert, VeterinaryAnimal, VeterinaryClient, VeterinaryProcedure

User = get_user_model()
PASSWORD = "Password-8472"


def contract(organization, status="active"):
    # Organizations get a subscription automatically; reuse it when present.
    subscription = Subscription.objects.filter(organization=organization).first()
    if subscription is None:
        plan = Plan.objects.create(code=f"plan-{organization.slug}", name="Plano")
        subscription = Subscription.objects.create(organization=organization, plan=plan, started_at=timezone.now())
    subscription.status = status
    subscription.save(update_fields=["status"])
    segment = PlanSegment.objects.get(code=SEGMENT_CODE)
    tier = segment.tiers.first()
    SubscriptionItem.objects.create(subscription=subscription, tier=tier, segment_code=SEGMENT_CODE, segment_name=segment.name, segment_subtitle=segment.subtitle, tier_label=tier.label)


class VeterinaryBase(APITestCase):
    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Vet A", slug="vet-a")
        contract(self.org)
        self.admin = User.objects.create_user(role="admin", email="vet-admin@example.com", password=PASSWORD, full_name="Admin", organization=self.org)
        self.client.force_authenticate(self.admin)
        self.farm = self.client.post("/api/v1/veterinary/clients/", {"name": "Manuel", "farm_name": "Boa Vista", "phone": "73999990000"}).data

    def register(self, **data):
        payload = {"client": self.farm["id"], "date": self.today.isoformat(), "animal": "101", "category": "vaca_solteira", **data}
        return self.client.post("/api/v1/veterinary/procedures/", payload, format="json")

    def animal(self, identifier="101"):
        rows = self.client.get("/api/v1/veterinary/animals/").data
        return next(r for r in rows if r["identifier"] == identifier)


class AccessTests(VeterinaryBase):
    def test_requires_contracted_segment(self):
        other = Organization.objects.create(name="Sem contrato", slug="vet-none")
        user = User.objects.create_user(role="admin", email="vet-none@example.com", password=PASSWORD, full_name="X", organization=other)
        self.client.force_authenticate(user)
        self.assertEqual(self.client.get("/api/v1/veterinary/workspace/").status_code, 403)
        self.assertFalse(self.client.get("/api/v1/auth/me/").data["access"]["veterinary"])

    def test_suspended_subscription_blocks_area(self):
        self.org.subscription.status = "suspended"
        self.org.subscription.save()
        self.assertEqual(self.client.get("/api/v1/veterinary/workspace/").status_code, 403)

    def test_roles(self):
        for role, expected in (("manager", 200), ("veterinarian", 200), ("operator", 403), ("feeder", 403)):
            user = User.objects.create_user(role=role, email=f"vet-{role}@example.com", password=PASSWORD, full_name=role, organization=self.org)
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get("/api/v1/veterinary/workspace/").status_code, expected, role)

    def test_veterinarian_stays_in_the_area(self):
        vet = User.objects.create_user(role="veterinarian", email="vet-role@example.com", password=PASSWORD, full_name="Vet", organization=self.org)
        self.client.force_authenticate(vet)
        self.assertEqual(self.client.get("/api/v1/auth/me/").data["access"]["veterinary"], True)
        self.assertEqual(self.client.get("/api/v1/livestock/animals/").status_code, 403)
        self.assertEqual(self.client.get("/api/v1/finance/transactions/").status_code, 403)
        self.assertEqual(self.client.post("/api/v1/veterinary/wipe/").status_code, 403)

    def test_tenant_isolation(self):
        other = Organization.objects.create(name="Vet B", slug="vet-b")
        contract(other)
        foreign = VeterinaryClient.objects.create(organization=other, name="Outro")
        self.assertNotIn(str(foreign.id), [c["id"] for c in self.client.get("/api/v1/veterinary/clients/").data])
        response = self.register(client=str(foreign.id))
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.delete(f"/api/v1/veterinary/clients/{foreign.id}/").status_code, 404)


class ProcedureRulesTests(VeterinaryBase):
    def test_pregnant_requires_method_and_computes_calving(self):
        self.assertEqual(self.register(diagnosis="pregnant", gestation_days=60).status_code, 400)
        response = self.register(diagnosis="pregnant", gestation_days=60, coverage_method="natural", bull="Aroeira")
        self.assertEqual(response.status_code, 201, response.data)
        coverage = self.today - timedelta(days=60)
        self.assertEqual(response.data["procedure"]["calving_date"], (coverage + timedelta(days=283)).isoformat())
        self.assertEqual(response.data["alerts"][0]["kind"], "calving")
        self.assertEqual(response.data["alerts"][0]["date"], coverage + timedelta(days=283 - 7))
        self.assertTrue(response.data["animal_created"])
        row = self.animal()
        self.assertEqual(row["status"], "pregnant")
        self.assertEqual(Decimal(response.data["procedure"]["value"]), Decimal("15"))

    def test_open_requires_conduct(self):
        self.assertEqual(self.register(diagnosis="open").status_code, 400)

    def test_iatf_protocol_full_cycle(self):
        start = self.today - timedelta(days=10)
        created = self.register(diagnosis="open", conduct="iatf_protocol", cycling="cycling", management_days=10, protocol_start=start.isoformat())
        self.assertEqual([(a["kind"], a["day"]) for a in created.data["alerts"]], [("removal", 8), ("inseminate", 10)])
        row = self.animal()
        self.assertEqual(row["status"], "protocol")
        self.assertEqual((row["next"]["code"], row["next"]["day"]), ("alert_removal", 8))
        self.assertEqual(row["deadline"], "late")

        removal = self.register(step_done="yes", step_date=(start + timedelta(days=8)).isoformat())
        self.assertEqual(removal.data["branch"], "protocol_step")
        row = self.animal()
        self.assertEqual((row["next"]["code"], row["next"]["day"]), ("alert_inseminate", 10))
        self.assertEqual(row["deadline"], "today")

        insemination = self.register(step_done="yes", step_date=self.today.isoformat(), step_bull="Nelore Aroeira")
        self.assertEqual(insemination.data["branch"], "iatf_insemination")
        self.assertEqual(insemination.data["procedure"]["kind"], "insemination")
        self.assertEqual(Decimal(insemination.data["procedure"]["value"]), Decimal("35"))
        self.assertEqual(insemination.data["alerts"][0]["date"], self.today + timedelta(days=30))
        self.assertEqual(self.animal()["status"], "inseminated")

        self.assertEqual(self.register(diagnosis="pregnant", coverage_method="artificial").status_code, 400)
        confirmed = self.register(diagnosis="pregnant", coverage_method="artificial", confirm_pregnancy=True)
        self.assertEqual(confirmed.status_code, 201, confirmed.data)
        self.assertEqual(confirmed.data["procedure"]["coverage_date"], self.today.isoformat())
        self.assertEqual(confirmed.data["procedure"]["bull"], "Nelore Aroeira")
        self.assertEqual(confirmed.data["procedure"]["origin_kind"], "insemination")
        self.assertEqual(self.animal()["status"], "pregnant")

        report = self.client.get("/api/v1/veterinary/report/").data
        self.assertEqual(report["stats"]["rate"], 100.0)
        insemination_row = next(r for r in report["rows"] if r["report_kind"] == "insemination")
        self.assertEqual(insemination_row["report_result"], "pregnant")

    def test_eleven_day_protocol_and_not_done_insemination(self):
        start = self.today - timedelta(days=12)
        self.register(diagnosis="open", conduct="iatf_protocol", management_days=11, protocol_start=start.isoformat())
        alerts = list(VeterinaryAlert.objects.filter(done=False).values_list("kind", "day"))
        self.assertEqual(sorted(alerts), [("inseminate", 11), ("removal", 9)])
        self.register(step_done="yes", step_date=(start + timedelta(days=9)).isoformat())
        skipped = self.register(step_done="no", notes="Sem sêmen")
        self.assertEqual(skipped.data["branch"], "iatf_insemination")
        self.assertTrue(skipped.data["procedure"]["not_done"])
        lookup = self.client.get("/api/v1/veterinary/animals/lookup/", {"client": self.farm["id"], "q": "101"}).data
        self.assertEqual(lookup["status"], "protocol")
        self.assertEqual(lookup["not_inseminated_date"], start + timedelta(days=11))

    def test_heat_and_induction_alerts(self):
        self.register(diagnosis="open", conduct="observe_heat")
        self.assertEqual(VeterinaryAlert.objects.get(done=False).date, self.today + timedelta(days=21))
        self.register(animal="102", diagnosis="open", conduct="induction", return_days=7)
        induction = VeterinaryAlert.objects.get(done=False, kind="induction_review")
        self.assertEqual(induction.date, self.today + timedelta(days=7))

    def test_new_client_from_the_form(self):
        response = self.register(client=None, new_client_name="Antônio", diagnosis="open", conduct="discard", discard_reason="age")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(VeterinaryClient.objects.filter(organization=self.org, name="Antônio").exists())

    def test_quick_launch_ultrasound_after_insemination(self):
        animal_id = None
        self.register(diagnosis="open", conduct="observe_heat")
        animal_id = self.animal()["id"]
        insemination = self.client.post(f"/api/v1/veterinary/animals/{animal_id}/quick/", {"date": self.today.isoformat(), "action": "insemination", "bull": "Girolando"}, format="json")
        self.assertEqual(insemination.status_code, 201, insemination.data)
        result = self.client.post(f"/api/v1/veterinary/animals/{animal_id}/quick/", {"date": self.today.isoformat(), "diagnosis": "pregnant"}, format="json")
        self.assertEqual(result.status_code, 201, result.data)
        self.assertEqual(result.data["procedure"]["coverage_method"], "artificial")
        self.assertEqual(self.animal()["status"], "pregnant")


class BillingTests(VeterinaryBase):
    def test_month_billing_pay_all_and_value(self):
        self.register(diagnosis="open", conduct="discard")
        self.register(animal="102", diagnosis="open", conduct="discard")
        month = self.today.strftime("%Y-%m")
        data = self.client.get("/api/v1/veterinary/billing/", {"month": month, "client": self.farm["id"]}).data
        self.assertEqual((data["count"], Decimal(data["total"]), Decimal(data["receivable"])), (2, Decimal("30"), Decimal("30")))
        first = data["detail"][0]["id"]
        self.assertEqual(self.client.patch(f"/api/v1/veterinary/procedures/{first}/", {"value": "20"}, format="json").status_code, 200)
        self.client.post("/api/v1/veterinary/billing/pay-all/", {"client": self.farm["id"], "month": month}, format="json")
        data = self.client.get("/api/v1/veterinary/billing/", {"month": month}).data
        self.assertEqual((Decimal(data["total"]), Decimal(data["received"]), Decimal(data["receivable"])), (Decimal("35"), Decimal("35"), Decimal("0")))

    def test_price_table_applies_to_new_procedures_only(self):
        self.register(diagnosis="open", conduct="discard")
        self.client.patch("/api/v1/veterinary/settings/", {"price_ultrasound": "18.50"}, format="json")
        self.register(animal="102", diagnosis="open", conduct="discard")
        values = sorted(VeterinaryProcedure.objects.values_list("value", flat=True))
        self.assertEqual(values, [Decimal("15"), Decimal("18.50")])

    def test_client_with_procedures_cannot_be_deleted_and_wipe(self):
        self.register(diagnosis="open", conduct="discard")
        self.assertEqual(self.client.delete(f"/api/v1/veterinary/clients/{self.farm['id']}/").status_code, 400)
        wiped = self.client.post("/api/v1/veterinary/wipe/")
        self.assertEqual(wiped.data, {"clients": 1, "animals": 1})
        self.assertFalse(VeterinaryAnimal.objects.filter(organization=self.org).exists())
