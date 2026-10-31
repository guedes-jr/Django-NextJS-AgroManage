from datetime import timedelta
from decimal import Decimal
from uuid import uuid4
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.accounts.tokens import issue_tokens_for_user
from apps.farms.models import Farm
from apps.inventory.models import ItemEstoque, LoteEstoque, MovimentacaoEstoque, FormulaRacao, ConsumoRacao
from apps.livestock.models import AnimalBatch, Species, HistoricoEvento
from apps.organizations.models import Organization


class CattleFeedingFixture:
    url = "/api/v1/livestock/cattle/daily-feeding/"

    def setUp(self):
        self.today = timezone.localdate()
        self.org = Organization.objects.create(name="Tratos", slug="daily-feed")
        self.farm = Farm.objects.create(organization=self.org, name="Fazenda")
        self.species, _ = Species.objects.get_or_create(code="bovinos", defaults={"name": "Bovinos"})
        self.user = get_user_model().objects.create_user(email="feeder@example.invalid", password="test", role="feeder", organization=self.org)
        self.user.allowed_livestock.add(self.species)
        self.batch = AnimalBatch.objects.create(farm=self.farm, species=self.species, batch_code="B1", quantity=10, entry_date=self.today)
        self.item = ItemEstoque.objects.create(organization=self.org, nome="Ração", categoria="racao", especie_animal="bovino", unidade_medida="kg")
        self.lot = LoteEstoque.objects.create(item=self.item, numero_lote="F1", quantidade_inicial=100, quantidade_atual=100, custo_unitario=2, data_entrada=self.today)
        self.formula = FormulaRacao.objects.create(organization=self.org, nome="Fórmula bovina", especie_animal="bovino", item_final=self.item)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {issue_tokens_for_user(self.user).access_token}")

    def values(self, **changes):
        return dict(dict(batch=str(self.batch.pk), item=str(self.item.pk), formula=str(self.formula.pk), date=str(self.today), quantity_kg="5", request_key=str(uuid4())), **changes)

