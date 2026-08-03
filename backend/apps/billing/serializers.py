from rest_framework import serializers

from .models import Plan


class PublicPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = Plan
        fields = (
            "id",
            "code",
            "name",
            "description",
            "monthly_price",
            "yearly_price",
            "trial_days",
            "max_users",
            "max_farms",
            "max_storage_mb",
            "max_reports_per_month",
        )
        read_only_fields = fields
