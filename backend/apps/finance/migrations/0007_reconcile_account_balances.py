from decimal import Decimal
from django.db import migrations
from django.db.models import Sum, Case, When, F, DecimalField


def reconcile(apps, schema_editor):
    Account = apps.get_model("finance", "BankAccount")
    Transaction = apps.get_model("finance", "Transaction")
    alias = schema_editor.connection.alias
    signed = Case(When(category__category_type="revenue", then=F("amount")), default=-F("amount"), output_field=DecimalField(max_digits=20, decimal_places=2))
    totals = {row["bank_account_id"]: row["total"] for row in Transaction.objects.using(alias).filter(status="paid", bank_account__isnull=False, bank_account__organization_id=F("organization_id")).values("bank_account_id").annotate(total=Sum(signed))}
    for account in Account.objects.using(alias).all().iterator():
        Account.objects.using(alias).filter(pk=account.pk).update(current_balance=account.initial_balance + (totals.get(account.pk) or Decimal(0)))


class Migration(migrations.Migration):
    dependencies = [("finance", "0006_paymentevent_transaction_series_count_and_more")]
    operations = [migrations.RunPython(reconcile, migrations.RunPython.noop)]
