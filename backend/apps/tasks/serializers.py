from rest_framework import serializers

from .models import Task, Holiday


class TaskSerializer(serializers.ModelSerializer):
    farm_name = serializers.CharField(source="farm.name", read_only=True)
    assigned_to_name = serializers.CharField(source="assigned_to.full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True)

    reminder_status = serializers.CharField(source="reminder_delivery.status", read_only=True, default=None)

    class Meta:
        model = Task
        fields = (
            "id", "farm", "farm_name", "title", "description", "priority", "status", "due_date",
            "event_kind", "start_time", "end_time", "location", "whatsapp_remind_at", "reminder_status", "assigned_to", "assigned_to_name", "created_by", "created_by_name", "created_at", "updated_at",
        )
        read_only_fields = ("id", "created_by", "created_at", "updated_at")

    def validate(self, attrs):
        organization = getattr(getattr(self.context.get("request"), "user", None), "organization", None)
        farm = attrs.get("farm", getattr(self.instance, "farm", None))
        assigned_to = attrs.get("assigned_to", getattr(self.instance, "assigned_to", None))
        if not organization:
            raise serializers.ValidationError({"organization": "Usuário não possui organização vinculada."})
        if farm and farm.organization_id != organization.id:
            raise serializers.ValidationError({"farm": "A propriedade pertence a outra organização."})
        if assigned_to and assigned_to.organization_id != organization.id:
            raise serializers.ValidationError({"assigned_to": "O responsável pertence a outra organização."})
        from datetime import datetime, time
        from django.utils import timezone
        value = lambda field: attrs.get(field, getattr(self.instance, field, None))
        day, start, end, reminder = (value(field) for field in ("due_date", "start_time", "end_time", "whatsapp_remind_at"))
        if (value("event_kind") in ("event", "appointment") or start or end) and not day:
            raise serializers.ValidationError({"due_date":"Informe a data do evento."})
        if end and (not start or end <= start):
            raise serializers.ValidationError({"end_time":"O fim deve ser posterior ao início no mesmo dia."})
        if reminder:
            if not day:
                raise serializers.ValidationError({"due_date":"Informe a data para agendar o lembrete."})
            event_at = timezone.make_aware(datetime.combine(day, start or time(23,59,59)))
            changed = self.instance is None or any(field in attrs and attrs[field] != getattr(self.instance,field) for field in ("due_date","start_time","whatsapp_remind_at"))
            if reminder > event_at or changed and reminder <= timezone.now():
                raise serializers.ValidationError({"whatsapp_remind_at":"Agende o lembrete no futuro e até o início do evento (ou fim do dia, se não houver horário)."})
            user = self.context["request"].user
            if changed and self.instance and self.instance.created_by_id != user.pk:
                raise serializers.ValidationError({"whatsapp_remind_at":"Apenas o criador pode configurar seu lembrete de WhatsApp."})
            if changed:
                from apps.notifications.tasks import _whatsapp_phone
                if not user.receive_system_alerts or not user.phone_is_whatsapp or not _whatsapp_phone(user.phone):
                    raise serializers.ValidationError({"whatsapp_remind_at":"Cadastre um WhatsApp válido e autorize os alertas no seu perfil."})
        return attrs

    def update(self, instance, validated_data):
        import uuid
        relevant = {"title", "description", "due_date", "start_time", "end_time", "location", "whatsapp_remind_at", "status", "farm", "event_kind"}
        if any(field in validated_data and validated_data[field] != getattr(instance,field) for field in relevant):
            validated_data.update(reminder_version=uuid.uuid4(), reminder_delivery=None)
        return super().update(instance, validated_data)


class HolidaySerializer(serializers.ModelSerializer):
    class Meta:
        model = Holiday
        fields = ("id", "name", "date", "source", "created_at")
        read_only_fields = ("id", "source", "created_at")

    def validate(self, attrs):
        from .models import Holiday
        if Holiday.objects.filter(organization=self.context["request"].user.organization, date=attrs["date"], name=attrs["name"]).exists():
            raise serializers.ValidationError("Este feriado já está cadastrado nesta data.")
        return attrs


class HolidayYearQuery(serializers.Serializer):
    year = serializers.IntegerField(min_value=1900, max_value=2199)


class HolidayImportInput(HolidayYearQuery):
    dates = serializers.ListField(child=serializers.DateField(), allow_empty=False, max_length=100)

    def validate(self, attrs):
        if any(day.year != attrs["year"] for day in attrs["dates"]):
            raise serializers.ValidationError("As datas devem pertencer ao ano selecionado.")
        return attrs
