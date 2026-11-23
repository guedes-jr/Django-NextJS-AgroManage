"""Reprodução › Reprodutores: semen collection takes the diluent out of stock and puts the doses in."""
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from apps.farms.models import Farm
from apps.finance.models import Transaction
from apps.inventory.models import ItemEstoque, LoteEstoque
from apps.livestock.models import Animal, SemenCollection, Species
from apps.organizations.models import Organization


class SemenCollectionTests(APITestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Granja", slug="semen")
        self.user = get_user_model().objects.create_user(email="semen@example.invalid", password="Password-8472",
                                                         full_name="Ana Técnica", role="admin", organization=self.org)
        self.client.force_authenticate(self.user)
        farm = Farm.objects.create(organization=self.org, name="Granja")
        species, _ = Species.objects.get_or_create(code="suinos", defaults={"name": "Suínos"})
        self.boar = Animal.objects.create(farm=farm, species=species, identifier="C-01", gender="M", category="Cachaço")
        Animal.objects.create(farm=farm, species=species, identifier="M-01", gender="F", category="Matriz")
        self.water = ItemEstoque.objects.create(organization=self.org, nome="Água destilada", categoria="outro", unidade_medida="l")
        self.bts = ItemEstoque.objects.create(organization=self.org, nome="Diluente (BTS)", categoria="outro", unidade_medida="kg")
        self.water_lot = LoteEstoque.objects.create(item=self.water, numero_lote="A1", quantidade_inicial=10, quantidade_atual=10,
                                                    custo_unitario=Decimal("2"), data_entrada=date.today())
        self.bts_lot = LoteEstoque.objects.create(item=self.bts, numero_lote="B1", quantidade_inicial=1, quantidade_atual=1,
                                                  custo_unitario=Decimal("200"), data_entrada=date.today())
        self.payload = {
            "animal": str(self.boar.pk), "collection_date": date.today().isoformat(), "volume_ml": "250",
            "responsible": str(self.user.pk), "diluted": True, "doses_produced": 10, "notes": "",
            "components": [{"item": str(self.water.pk), "quantity": "500", "unit": "ml"},
                           {"item": str(self.bts.pk), "quantity": "100", "unit": "g"}],
        }

    def post(self, **changes):
        return self.client.post("/api/v1/livestock/semen-collections/", {**self.payload, **changes}, format="json")

    def test_collection_consumes_diluent_and_stocks_the_doses(self):
        transactions_before = Transaction.objects.count()
        response = self.post()
        self.assertEqual(response.status_code, 201, response.data)
        self.water_lot.refresh_from_db(); self.bts_lot.refresh_from_db()
        self.assertEqual((self.water_lot.quantidade_atual, self.bts_lot.quantidade_atual), (Decimal("9.5"), Decimal("0.9")))
        self.assertEqual(Decimal(response.data["total_cost"]), Decimal("21.00"))  # 0,5 L × 2 + 0,1 kg × 200
        self.assertEqual(response.data["cost_per_dose"], "2.10")
        self.assertEqual(response.data["responsible_name"], "Ana Técnica")
        semen_lot = LoteEstoque.objects.get(pk=response.data["stock_lot"])
        self.assertEqual((semen_lot.item.categoria, semen_lot.item.unidade_medida, semen_lot.quantidade_atual, semen_lot.custo_unitario),
                         ("semen", "dose", Decimal("10"), Decimal("2.10")))
        self.assertEqual(Transaction.objects.count(), transactions_before)  # diluent purchase is already the expense

        listing = self.client.get("/api/v1/livestock/reprodutores/?species=suinos").data
        self.assertEqual([row["identifier"] for row in listing["rows"]], ["C-01"])
        self.assertEqual((listing["rows"][0]["coletas"], listing["rows"][0]["doses_estoque"]), (1, Decimal("10")))
        self.assertIn({"id": str(self.user.pk), "name": "Ana Técnica"}, listing["responsibles"])
        self.assertEqual(listing["kpis"]["doses_mes"], 10)

    def test_invalid_collections_change_nothing(self):
        for changes in (
            {"components": [{"item": str(self.bts.pk), "quantity": "5", "unit": "kg"}]},  # only 1 kg in stock
            {"components": [{"item": str(self.water.pk), "quantity": "1", "unit": "kg"}]},  # liters item, kg informed
            {"components": []},  # diluted without composition
            {"collection_date": (date.today() + timedelta(days=1)).isoformat()},
            {"animal": str(Animal.objects.get(identifier="M-01").pk)},
        ):
            self.assertEqual(self.post(**changes).status_code, 400, changes)
        self.assertFalse(SemenCollection.objects.exists())
        self.bts_lot.refresh_from_db()
        self.assertEqual(self.bts_lot.quantidade_atual, Decimal("1"))

    def test_undiluted_collection_needs_no_components(self):
        response = self.post(diluted=False, components=[])
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Decimal(response.data["total_cost"]), Decimal("0"))

    def test_report_lists_every_male_with_reproductive_results(self):
        from apps.livestock.models import Birth, Mating, Pregnancy
        female = Animal.objects.get(identifier="M-01")
        for status in ("confirmed", "failed"):
            mating = Mating.objects.create(female=female, sire=self.boar, mating_date=date.today(), status=status)
        confirmed = Mating.objects.get(status="confirmed")
        pregnancy = Pregnancy.objects.create(mating=confirmed, female=female, start_date=date.today(), expected_birth_date=date.today())
        Birth.objects.create(pregnancy=pregnancy, female=female, birth_date=date.today(), live_born=12)
        self.assertEqual(self.post().status_code, 201)
        Animal.objects.create(farm=self.boar.farm, species=self.boar.species, identifier="C-02", gender="M", category="Cachaço", status="dead")

        active = self.client.get("/api/v1/livestock/reprodutores/?species=suinos").data["rows"]
        self.assertEqual([row["identifier"] for row in active], ["C-01"])
        rows = {row["identifier"]: row for row in self.client.get("/api/v1/livestock/reprodutores/?species=suinos&include_inactive=1").data["rows"]}
        self.assertEqual(set(rows), {"C-01", "C-02"})
        boar = rows["C-01"]
        self.assertEqual((boar["coberturas"], boar["prenhezes"], boar["partos"], boar["nascidos_vivos"], boar["doses_produzidas"]), (2, 1, 1, 12, 10))
        self.assertEqual(Decimal(boar["custo_coletas"]), Decimal("21.00"))
        self.assertEqual(rows["C-02"]["status"], "dead")

    def test_sale_uses_collection_lot_and_creates_one_pending_receivable(self):
        from uuid import uuid4

        from apps.inventory.models import MovimentacaoEstoque

        collection = self.post(diluted=False, components=[])
        self.assertEqual(collection.status_code, 201, collection.data)
        lot = LoteEstoque.objects.get(pk=collection.data["stock_lot"])
        url = "/api/v1/livestock/semen-sales/"
        self.assertEqual([row["collection"] for row in self.client.get(url).data["lots"]], [str(collection.data["id"])])
        command = {
            "request_key": str(uuid4()), "collection": str(collection.data["id"]), "expected_balance": 10,
            "quantity": 4, "price": "20.50", "buyer": "Comprador",
            "date": date.today().isoformat(), "due_date": date.today().isoformat(),
        }
        sold = self.client.post(url, command, format="json")
        self.assertEqual(sold.status_code, 201, sold.data)
        self.assertEqual((sold.data["amount"], sold.data["remaining"]), ("82.00", 6))
        replay = self.client.post(url, command, format="json")
        self.assertEqual((replay.status_code, replay.data), (200, sold.data))
        self.assertEqual(self.client.post(url, command | {"request_key": str(uuid4())}, format="json").status_code, 409)
        self.assertEqual(self.client.post(url, command | {"buyer": "Outro"}, format="json").status_code, 409)
        lot.refresh_from_db()
        self.assertEqual(lot.quantidade_atual, 6)
        movement = MovimentacaoEstoque.objects.get(lote=lot, tipo="venda")
        self.assertEqual(movement.quantidade, 4)
        self.assertEqual(self.client.delete(f"/api/v1/inventory/movimentacoes/{movement.pk}/").status_code, 400)
        title = Transaction.objects.get(reference=sold.data["reference"])
        self.assertEqual((title.amount, title.status, title.segmento), (Decimal("82.00"), "pending", "suinos"))
        reject = self.client.patch(f"/api/v1/finance/transactions/{title.pk}/", {"notes": "Outro"}, format="json")
        self.assertEqual(reject.status_code, 400, reject.data)
        self.assertEqual(self.client.post(url, command, format="json").data, sold.data)

        outsider = Organization.objects.create(name="Outra granja", slug="semen-outsider")
        manager = get_user_model().objects.create_user(email="semen-other@example.invalid", password="Password-8472",
                                                        role="manager", organization=outsider)
        self.client.force_authenticate(manager)
        self.assertEqual(self.client.get(url).data["lots"], [])
        self.assertEqual(self.client.post(url, command, format="json").status_code, 404)
