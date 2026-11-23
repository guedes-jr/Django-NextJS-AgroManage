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
