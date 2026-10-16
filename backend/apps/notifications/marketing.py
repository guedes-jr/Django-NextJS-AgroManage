"""Saved organization queries and consent-aware campaign outbox."""

import hashlib
import logging
import re

from django.core import signing
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.organizations.models import Organization

from .categories import category_policy
from .models import MarketingCampaign, MarketingRecipient, NotificationDelivery
from .services import NotificationService
from .tasks import _whatsapp_phone

logger = logging.getLogger(__name__)


def enqueue_campaign_outbox():
    from .tasks import process_marketing_outbox

    try:
        process_marketing_outbox.delay()
    except Exception:
        logger.exception("Não foi possível iniciar o processamento das comunicações; a fila persistida será retomada pelo agendamento.")


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


def eligible_user_filter(filters, category="marketing"):
    allowed = Q(
        role__in=filters["roles"],
        is_active=True,
        receive_system_alerts=True,
    ) & ~Q(platform_staff_profile__is_active=True)
    if category == "marketing":
        allowed &= Q(notification_preference__marketing_alerts=True)
    return allowed


def audience_eligibility(campaign, orgs):
    active = Q(is_active=True)
    matching_role = active & Q(role__in=campaign.audience.filters["roles"])
    organization_user = matching_role & ~Q(platform_staff_profile__is_active=True)
    notifications_allowed = organization_user & Q(receive_system_alerts=True)
    users = User.objects.filter(organization__in=orgs)
    return users.aggregate(
        total_users=Count("pk"),
        inactive_users=Count("pk", filter=~active),
        roles_excluded=Count("pk", filter=active & ~Q(role__in=campaign.audience.filters["roles"])),
        platform_staff_excluded=Count("pk", filter=matching_role & Q(platform_staff_profile__is_active=True)),
        notifications_disabled=Count("pk", filter=organization_user & Q(receive_system_alerts=False)),
        marketing_not_authorized=Count("pk", filter=notifications_allowed & ~Q(notification_preference__marketing_alerts=True) if campaign.category == "marketing" else Q(pk__in=[])),
        eligible_users=Count("pk", filter=eligible_user_filter(campaign.audience.filters, campaign.category)),
    )


def resolve(campaign):
    filters = campaign.audience.filters
    orgs = organizations(filters)
    users = (
        User.objects.filter(organization__in=orgs)
        .filter(eligible_user_filter(filters, campaign.category))
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
    eligibility = audience_eligibility(campaign, orgs)
    sample = list(orgs.order_by("name").values("id", "name")[:30])
    eligible_counts = dict(
        User.objects.filter(organization_id__in=[row["id"] for row in sample])
        .filter(eligible_user_filter(campaign.audience.filters, campaign.category))
        .values("organization_id")
        .annotate(total=Count("pk"))
        .values_list("organization_id", "total")
    )
    for organization in sample:
        organization["eligible_users"] = eligible_counts.get(organization["id"], 0)
    policy = category_policy(campaign.category)
    blockers = []
    if not policy.enabled:
        blockers.append(f"Ative a categoria {policy.get_category_display()} em Notificações.")
    if campaign.send_in_app and not policy.in_app_enabled:
        blockers.append("Ative o canal No sistema em Notificações ou desmarque esse canal.")
    if campaign.send_whatsapp and not policy.whatsapp_enabled:
        blockers.append("Ative o canal WhatsApp em Notificações ou desmarque esse canal.")
    if not recipients:
        if not eligibility["total_users"]:
            blockers.append("As organizações da consulta não possuem usuários cadastrados.")
        else:
            blockers.append("Nenhum destinatário elegível. Confira abaixo os motivos de exclusão dos usuários.")
        if eligibility["marketing_not_authorized"]:
            blockers.append(
                f'{eligibility["marketing_not_authorized"]} usuários ainda não autorizaram propagandas em Notificações > Preferências.'
            )
        if eligibility["roles_excluded"]:
            blockers.append(
                f'{eligibility["roles_excluded"]} usuários possuem cargos fora dos selecionados. Revise os cargos na etapa Organizações.'
            )
        if eligibility["notifications_disabled"]:
            blockers.append(
                f'{eligibility["notifications_disabled"]} usuários desativaram o recebimento de notificações.'
            )
    fingerprint = hashlib.sha256(
        repr(
            (
                campaign.updated_at.isoformat(),
                str(campaign.category),
                campaign.audience.updated_at.isoformat(),
                recipients,
                policy.enabled,
                policy.in_app_enabled,
                policy.whatsapp_enabled,
            )
        ).encode()
    ).hexdigest()
    return {
        "blockers": blockers,
        "eligibility": eligibility,
        "organizations": orgs.count(),
        "recipients": len(recipients),
        "in_app": sum(r[2] for r in recipients),
        "whatsapp": sum(r[3] for r in recipients),
        "sample": sample,
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
        policy = category_policy(campaign.category)
        if (
            not policy.enabled
            or (campaign.send_in_app and not policy.in_app_enabled)
            or (campaign.send_whatsapp and not policy.whatsapp_enabled)
        ):
            raise ValidationError(
                f"Ative a categoria {policy.get_category_display()} e os canais escolhidos em Notificações."
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
        transaction.on_commit(enqueue_campaign_outbox)
        return campaign


def prepare_user_campaigns(user, batch_size=20):
    campaign_ids = list(
        MarketingRecipient.objects.filter(
            user_id=user.pk,
            in_app=True,
            prepared_at__isnull=True,
            campaign__status__in=["queued", "processing"],
        ).order_by("campaign__queued_at", "campaign_id").values_list("campaign_id", flat=True)[:batch_size]
    )
    for campaign_id in campaign_ids:
        prepare_campaign(campaign_id, batch_size=1, user_id=user.pk)


def prepare_campaign(campaign_id, batch_size=50, user_id=None):
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
        recipients = campaign.recipients.select_for_update(of=("self",)).filter(prepared_at__isnull=True)
        if user_id is not None:
            recipients = recipients.filter(user_id=user_id, in_app=True)
        rows = list(recipients.select_related("user", "organization")[:batch_size])
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
                    notif_type=campaign.category,
                    category=campaign.category,
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
