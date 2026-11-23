"""
The mobile app (VT01 · Lançar atendimento) builds its payloads in
``mobile/src/features/veterinary/launchContracts.ts``. ``mobile_payloads.json`` was generated
from that code; this test proves the server accepts each shape and picks the expected branch.
Dates in the fixture are relative to 2026-11-22 and are shifted to today.
"""
import json
import re
from datetime import date, timedelta
from pathlib import Path

from apps.veterinary.models import VeterinaryClient, VeterinaryProcedure

from .test_veterinary import VeterinaryBase

FIXTURE = json.loads((Path(__file__).parent / "mobile_payloads.json").read_text(encoding="utf-8"))
BASE_DAY = date(2026, 11, 22)
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class MobileLaunchContractTests(VeterinaryBase):
    def payload(self, name, shift_days=0):
        delta = (self.today - BASE_DAY) + timedelta(days=shift_days)
        data = {}
        for key, value in FIXTURE[name].items():
            if isinstance(value, str) and ISO.match(value):
                value = (date.fromisoformat(value) + delta).isoformat()
            data[key] = self.farm["id"] if value == "CLIENT" else value
        return data

    def post(self, data):
        response = self.client.post("/api/v1/veterinary/procedures/", data, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def test_protocol_cycle_built_by_the_app(self):
        # IATF protocol started ten days ago, so the removal (D8) is pending.
        self.assertEqual(self.post(self.payload("protocol", -10))["branch"], "diagnosis")
        lookup = self.client.get("/api/v1/veterinary/animals/lookup/", {"client": self.farm["id"], "q": "101"}).data
        self.assertEqual((lookup["status"], lookup["pending_step"]["kind"]), ("protocol", "removal"))
        self.assertEqual(self.post(self.payload("step_removal"))["branch"], "protocol_step")
        result = self.post(self.payload("iatf_done"))
        self.assertEqual((result["branch"], result["procedure"]["kind"], result["alerts"][0]["kind"]), ("iatf_insemination", "insemination", "ultrasound"))
        pregnant = self.post(self.payload("confirm_pregnancy"))
        self.assertEqual((pregnant["branch"], pregnant["procedure"]["result"]), ("diagnosis", "pregnant"))

    def test_open_pregnant_and_new_client_built_by_the_app(self):
        heat = self.post(self.payload("heat"))
        self.assertEqual(heat["alerts"][0]["kind"], "observe_heat")
        pregnant = self.post(self.payload("pregnant_new"))
        self.assertTrue(pregnant["animal_created"])
        self.assertEqual(VeterinaryProcedure.objects.get(pk=pregnant["procedure"]["id"]).gestation_days, 60)
        created = self.post(self.payload("discard_new_client"))
        self.assertTrue(VeterinaryClient.objects.filter(organization=self.org, name="Antônio", pk=created["client"]["id"]).exists())

    def test_mobile_client_directory_and_billing_project_only_needed_fields(self):
        base = "/api/v1/veterinary/"
        self.post(self.payload("protocol"))
        directory = self.client.get(base + "clients/", {"view": "mobile"})
        self.assertEqual(directory.status_code, 200)
        row = next(row for row in directory.json() if row["id"] == str(self.farm["id"]))
        self.assertEqual(set(row), {"id", "name", "farm_name", "phone", "updated_at", "farm", "herd_purpose"})

        month = self.today.isoformat()[:7]
        billing = self.client.get(base + "billing/", {"view": "mobile", "month": month, "client": self.farm["id"]})
        self.assertEqual(billing.status_code, 200, billing.data)
        result = billing.json()
        self.assertEqual(result["month"], month)
        self.assertRegex(result["total"], r"^\d+\.\d{2}$")
        self.assertRegex(result["receivable"], r"^\d+\.\d{2}$")
        self.assertTrue(result["detail"])
        self.assertEqual(set(result["detail"][0]), {"id", "date", "identifier", "kind", "value", "paid", "updated_at"})
        self.assertRegex(result["detail"][0]["value"], r"^\d+\.\d{2}$")
        self.assertNotIn("responsibles", result)

    def test_client_upsert_replays_without_creating_duplicate_and_rejects_stale_edit(self):
        from uuid import uuid4

        url = "/api/v1/veterinary/clients/mobile-save/"
        body = {"id": str(uuid4()), "version": None, "name": "Novo", "farm_name": "Fazenda", "phone": ""}
        saved = self.client.post(url, body, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(self.client.post(url, body, format="json").json(), saved.json())
        self.assertEqual(VeterinaryClient.objects.filter(pk=body["id"]).count(), 1)
        updated = self.client.post(url, body | {"version": saved.json()["updated_at"], "phone": "123"}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        stale = self.client.post(url, body | {"version": saved.json()["updated_at"], "phone": "456"}, format="json")
        self.assertEqual(stale.status_code, 409, stale.data)
        self.assertEqual(VeterinaryClient.objects.get(pk=body["id"]).phone, "123")

    def test_mobile_settlement_pays_only_reviewed_charges_and_can_repeat(self):
        base = "/api/v1/veterinary/"
        self.post(self.payload("protocol"))
        query = {"view": "mobile", "month": self.today.isoformat()[:7], "client": self.farm["id"]}
        review = self.client.get(base + "billing/", query).json()["detail"]
        self.post(self.payload("heat") | {"animal": "998"})
        command = {
            "client": self.farm["id"], "month": query["month"],
            "charges": [{"id": row["id"], "value": row["value"], "version": row["updated_at"]} for row in review],
        }
        url = base + "billing/pay-all/?view=mobile"
        bad = self.client.post(url, command | {"charges": [command["charges"][0] | {"value": "9999.99"}]}, format="json")
        self.assertEqual(bad.status_code, 409)
        from unittest.mock import patch

        with patch("apps.veterinary.mobile_accounts.integrations.sync_finance") as sync:
            response = self.client.post(url, command, format="json")
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(self.client.post(url, command, format="json").json(), response.json())
            self.assertEqual(sync.call_count, len(review))
        self.assertEqual(VeterinaryProcedure.objects.filter(organization=self.org, paid=True).count(), len(review))
        self.assertTrue(VeterinaryProcedure.objects.filter(organization=self.org, paid=False).exists())

    def test_mobile_report_filters_rows_and_only_returns_consultation_fields(self):
        self.post(self.payload("heat"))
        url = "/api/v1/veterinary/report/"
        params = {"view": "mobile", "client": self.farm["id"], "procedure": "observe_heat"}
        result = self.client.get(url, params)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertTrue(result.data["rows"])
        self.assertNotIn("paid", result.data["rows"][0])
        self.assertNotIn("value", result.data["rows"][0])
        grouped = self.client.get(url, params | {"mode": "animal"})
        self.assertEqual(grouped.status_code, 200, grouped.data)
        self.assertEqual(grouped.data["rows"], [])
        self.assertEqual(grouped.data["animals"][0]["count"], 1)

    def test_mobile_client_link_uses_web_scope_and_delete_protection(self):
        from apps.farms.models import Farm
        from apps.organizations.models import Organization

        farm = Farm.objects.create(organization=self.org, name="Vínculo")
        other = Organization.objects.create(name="Outra", slug="vet-mobile-outra")
        foreign = Farm.objects.create(organization=other, name="Outra fazenda")
        base = "/api/v1/veterinary/clients/"
        client = VeterinaryClient.objects.get(pk=self.farm["id"])
        original = {
            "id": str(client.pk), "version": client.updated_at.isoformat(), "name": client.name,
            "farm_name": client.farm_name, "phone": client.phone, "herd_purpose": "dairy",
        }
        rejected = self.client.post(base + "mobile-save/", original | {"farm": str(foreign.pk)}, format="json")
        self.assertEqual(rejected.status_code, 400, rejected.data)
        command = original | {"farm": str(farm.pk)}
        saved = self.client.post(base + "mobile-save/", command, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(saved.json()["farm"], str(farm.pk))
        self.assertEqual(saved.json()["herd_purpose"], "dairy")
        self.assertEqual(self.client.post(base + "mobile-save/", command, format="json").json(), saved.json())

        empty = VeterinaryClient.objects.create(organization=self.org, name="Sem atendimentos")
        self.assertEqual(self.client.delete(f"{base}{empty.pk}/").status_code, 204)
        self.post(self.payload("heat"))
        self.assertEqual(self.client.delete(f"{base}{client.pk}/").status_code, 400)
        self.assertTrue(VeterinaryClient.objects.filter(pk=client.pk).exists())
