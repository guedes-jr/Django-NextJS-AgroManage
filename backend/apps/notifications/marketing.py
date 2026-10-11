"""Saved organization queries and consent-aware campaign outbox."""

import hashlib
import re

from django.core import signing
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.organizations.models import Organization

from .categories import category_policy
from .models import MarketingCampaign, MarketingRecipient, NotificationDelivery
from .services import NotificationService
from .tasks import _whatsapp_phone


def plain_message(campaign):
    text = re.sub(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", r"\1: \2", campaign.body)
    text = text.replace("**", "*").replace("~~", "~")
    if campaign.link_url:
        text += f"\n\n{campaign.link_label or 'Saiba mais'}: {campaign.link_url}"
    return text


def organizations(filters):
    qs = Organization.objects.filter(is_active=True)
    if filters.get("search"):
        qs = qs.filter(name__icontains=filters["search"])
    if filters.get("organizations"):
        qs = qs.filter(pk__in=filters["organizations"])
    if filters.get("plans"):
        qs = qs.filter(
            Q(subscription__plan__code__in=filters["plans"])
            | Q(subscription__isnull=True, plan__in=filters["plans"])
        )
    if filters.get("statuses"):
        qs = qs.filter(subscription__status__in=filters["statuses"])
    if filters.get("state"):
        qs = qs.filter(addresses__state__iexact=filters["state"])
    return qs.distinct()


def resolve(campaign):
    filters = campaign.audience.filters
    orgs = organizations(filters)
    users = (
        User.objects.filter(
            organization__in=orgs,
            role__in=filters["roles"],
            is_active=True,
            receive_system_alerts=True,
            notification_preference__marketing_alerts=True,
        )
        .exclude(platform_staff_profile__is_active=True)
        .order_by("pk")
    )
    recipients, phones = [], set()
    for user in users:
        phone = _whatsapp_phone(user.phone) if user.phone_is_whatsapp else ""
        whatsapp = bool(campaign.send_whatsapp and phone and phone not in phones)
        if whatsapp:
            phones.add(phone)
        if campaign.send_in_app or whatsapp:
            recipients.append(
                (
                    str(user.pk),
                    str(user.organization_id),
                    campaign.send_in_app,
                    whatsapp,
                    phone if whatsapp else "",
                )
            )
    return orgs, recipients


def preview(campaign):
    orgs, recipients = resolve(campaign)
    policy = category_policy("marketing")
    fingerprint = hashlib.sha256(
        repr(
            (
                campaign.updated_at.isoformat(),
                campaign.audience.updated_at.isoformat(),
                recipients,
                policy.enabled,
                policy.in_app_enabled,
                policy.whatsapp_enabled,
            )
        ).encode()
    ).hexdigest()
    return {
        "organizations": orgs.count(),
        "recipients": len(recipients),
        "in_app": sum(r[2] for r in recipients),
        "whatsapp": sum(r[3] for r in recipients),
        "sample": list(orgs.order_by("name").values("id", "name")[:30]),
        "token": signing.dumps(
            {"campaign": str(campaign.pk), "fingerprint": fingerprint},
            salt="marketing-preview",
        ),
    }


def publish(campaign_id, token):
    with transaction.atomic():
        campaign = (
            MarketingCampaign.objects.select_for_update()
            .select_related("audience")
            .get(pk=campaign_id)
        )
        if campaign.status != "draft":
            raise ValidationError("Esta campanha já foi confirmada ou cancelada.")
        # Serialize updates of the saved audience with publication.
        campaign.audience = (
            type(campaign.audience)
            .objects.select_for_update()
            .get(pk=campaign.audience_id)
        )
        policy = category_policy("marketing")
        if (
            not policy.enabled
            or (campaign.send_in_app and not policy.in_app_enabled)
            or (campaign.send_whatsapp and not policy.whatsapp_enabled)
        ):
            raise ValidationError(
                "Ative a categoria Propagandas e os canais escolhidos em Notificações."
            )
        try:
            confirmed = signing.loads(token, salt="marketing-preview", max_age=900)
            current = signing.loads(
                preview(campaign)["token"], salt="marketing-preview"
            )
        except signing.BadSignature:
            raise ValidationError(
                "A prévia expirou. Consulte o público novamente."
            ) from None
        if confirmed != current:
            raise ValidationError(
                "A campanha ou o público mudou. Consulte o público novamente."
            )
        _, recipients = resolve(campaign)
        if not recipients:
            raise ValidationError(
                "Nenhum destinatário elegível para os canais selecionados."
            )
        MarketingRecipient.objects.bulk_create(
            [
                MarketingRecipient(
                    campaign=campaign,
                    user_id=u,
                    organization_id=o,
                    in_app=a,
                    whatsapp=w,
                    whatsapp_phone=phone,
                )
                for u, o, a, w, phone in recipients
            ]
        )
        campaign.audience_filters = campaign.audience.filters
        campaign.status, campaign.queued_at, campaign.recipient_count = (
            "queued",
            timezone.now(),
            len(recipients),
        )
        campaign.save(
            update_fields=[
                "status",
                "queued_at",
                "recipient_count",
                "audience_filters",
                "updated_at",
            ]
        )
        # Beat consumes the durable outbox; a broker outage cannot lose a campaign.
        return campaign


def prepare_campaign(campaign_id, batch_size=50):
    with transaction.atomic():
        campaign = (
            MarketingCampaign.objects.select_for_update()
            .select_related("audience")
            .get(pk=campaign_id)
        )
        if campaign.status not in ("queued", "processing"):
            return 0
        campaign.status = "processing"
        campaign.save(update_fields=["status", "updated_at"])
        rows = list(
            campaign.recipients.select_for_update()
            .filter(prepared_at__isnull=True)
            .select_related("user", "organization")[:batch_size]
        )
        for row in rows:
            user = row.user
            if (
                not user
                or not row.organization
                or not row.organization.is_active
                or user.organization_id != row.organization_id
                or not user.is_active
                or user.role not in campaign.audience_filters["roles"]
            ):
                row.skip_reason = "Usuário ou organização não elegível."
            else:
                notification = NotificationService.create(
                    user,
                    campaign.title,
                    plain_message(campaign),
                    notif_type="marketing",
                    category="marketing",
                    event_key=f"marketing.campaign:{campaign.pk}",
                    campaign=campaign,
                    in_app=row.in_app,
                    schedule=False,
                )
                row.notification = notification
                if not notification:
                    row.skip_reason = (
                        "Preferências, categoria ou limite diário impedem o envio."
                    )
                elif row.whatsapp:
                    NotificationDelivery.objects.get_or_create(
                        notification=notification, channel="whatsapp_web"
                    )
            row.prepared_at = timezone.now()
            row.save(update_fields=["notification", "prepared_at", "skip_reason"])
        if not campaign.recipients.filter(prepared_at__isnull=True).exists():
            campaign.status = "completed"
            campaign.save(update_fields=["status", "updated_at"])
        return len(rows)
