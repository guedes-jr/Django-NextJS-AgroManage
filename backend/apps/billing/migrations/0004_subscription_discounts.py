from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("billing", "0003_invoice_invoiceitem_payment_paymentattempt"),
    ]

    operations = [
        migrations.AddField(
            model_name="subscription",
            name="discount_type",
            field=models.CharField(
                blank=True,
                choices=[("percentage", "Percentual"), ("fixed_amount", "Valor fixo")],
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="subscription",
            name="discount_value",
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),
        ),
        migrations.AddField(
            model_name="subscription",
            name="discount_starts_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="subscription",
            name="discount_ends_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
