"""Read models and session metadata for the platform WhatsApp panel."""
import re

from common.wppconnect import wpp_request
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone

from apps.notifications.models import NotificationDelivery
from apps.notifications.tasks import _whatsapp_phone


def connected_account():
    data, detail = wpp_request("host-device")
    if detail:
        return {"account": None, "detail": detail}
    profile = data.get("response")
    if not isinstance(profile, dict):
        return {"account": None, "detail": "O serviço não disponibilizou os dados da conta."}
    number = profile.get("phoneNumber") or profile.get("id") or ""
    if isinstance(number, dict):
        number = number.get("user") or number.get("_serialized") or ""
    phone = str(number).split("@")[0].split(":")[0]
    name = profile.get("pushname") or profile.get("name") or ""
    return {"account": {"name": name if isinstance(name, str) else "", "phone": phone if phone.isdigit() else ""}, "detail": ""}


def alert_overview():
    users = get_user_model().objects.filter(
        is_active=True, organization__isnull=False, phone_is_whatsapp=True, receive_system_alerts=True,
        notification_preference__whatsapp_reproductive_alerts=True,
        notification_preference__animal_alerts=True,
    )
    opted_in = users.count()
    eligible = 0
    invalid_phone = 0
    for user in users.prefetch_related("allowed_livestock").iterator(chunk_size=100):
        phone,role=user.phone,user.role
        if not _whatsapp_phone(phone):
            invalid_phone += 1
        elif role in ("admin", "manager") or (role == "operator" and user.allowed_livestock.exists()):
            # Scheduled reproductive events use create_for_organization's default roles.
            eligible += 1
    deliveries = NotificationDelivery.objects.filter(channel=NotificationDelivery.Channel.WHATSAPP_WEB)
    counts = {value: 0 for value in NotificationDelivery.Status.values}
    counts.update({row["status"]: row["total"] for row in deliveries.values("status").annotate(total=Count("id"))})
    return {
        "checked_at": timezone.now().isoformat(),
        "opted_in_users": opted_in, "eligible_users": eligible,
        "invalid_phone_users": invalid_phone,
        "alert_types": ["Vacinas e aplicação de ferro", "Cio e cobertura", "Diagnóstico de prenhez", "Parto e desmame", "Transferências e pesos", "Estoque baixo"],
        "counts": counts,
    }


def alert_deliveries(status=""):
    queryset = NotificationDelivery.objects.filter(
        channel=NotificationDelivery.Channel.WHATSAPP_WEB,
    ).select_related("notification__user__organization").order_by("-created_at", "-id")
    return queryset.filter(status=status) if status else queryset


def delivery_row(delivery):
    notification = delivery.notification
    user = notification.user
    return {
        "id": str(delivery.id), "title": notification.title,
        "recipient": user.full_name, "phone": user.phone,
        "organization": user.organization.name if user.organization else "",
        "status": delivery.status, "attempts": delivery.attempts,
        "last_error": delivery.last_error, "created_at": delivery.created_at,
        "delivered_at": delivery.delivered_at, "updated_at": delivery.updated_at,
    }


# These are suspected only after persistent observation, never from QR waiting.
PREPARING_STATES = {"INITIALIZING", "STARTING", "CONNECTING", "SYNCING", "qrReadSuccess"}
SESSION_NAME = re.compile(r"^[A-Za-z0-9_-]{1,100}$")


def session_names():
    from common.wppconnect import wpp_session_names

    names, detail = wpp_session_names()
    valid = {name for name in names if isinstance(name, str) and SESSION_NAME.fullmatch(name)}
    if settings.WPP_CONNECT_SESSION and SESSION_NAME.fullmatch(settings.WPP_CONNECT_SESSION):
        valid.add(settings.WPP_CONNECT_SESSION)
    # The session inventory is small and requests are bounded independently of input.
    return sorted(valid), detail


def observed_session(name, snapshot=None):
    from django.db import transaction

    from .models import WhatsAppSessionObservation

    data, detail = snapshot if snapshot is not None else wpp_request("status-session", session_name=name)
    state = str(data.get("status") or "CLOSED")[:50] if data else "unavailable"
    now = timezone.now()
    with transaction.atomic():
        observation, _ = WhatsAppSessionObservation.objects.get_or_create(
            name=name, defaults={"status": state, "state_since": now, "observed_at": now},
        )
        observation = WhatsAppSessionObservation.objects.select_for_update().get(pk=observation.pk)
        if observation.status != state:
            observation.state_since = now
        observation.status = state
        observation.observed_at = now
        # Preserve the last failure until a successful lifecycle operation.
        if detail:
            observation.last_error = detail[:500]
        observation.save()
    elapsed = max(0, int((now - observation.state_since).total_seconds()))
    suspected = state in PREPARING_STATES and elapsed >= 120
    return {
        "name": name, "status": state, "state_since": observation.state_since,
        "observed_at": now, "elapsed_seconds": elapsed,
        "suspected_stuck": suspected, "last_error": observation.last_error,
        "detail": detail or "", "configured_session": name == settings.WPP_CONNECT_SESSION,
        "can_close": state not in ("CLOSED", "unavailable"),
        "can_reconnect": state not in PREPARING_STATES and state != "QRCODE" and state != "unavailable",
    }


def operate_session(name, operation):
    from .models import WhatsAppSessionObservation

    state, detail = wpp_request("status-session", session_name=name)
    if detail:
        return None, detail, False
    current = state.get("status")
    if current in PREPARING_STATES or current in ("QRCODE", "notLogged"):
        detail = "O cliente desta sessão ainda não está pronto para encerramento. Use Reiniciar WPPConnect para recuperar, confirmando a interrupção de todas as sessões."
        WhatsAppSessionObservation.objects.filter(name=name).update(last_error=detail)
        return None, detail, True
    if current not in (None, "CLOSED"):
        _, detail = wpp_request("close-session", method="POST", payload={}, session_name=name)
        if detail:
            WhatsAppSessionObservation.objects.filter(name=name).update(last_error=detail[:500])
            return None, detail, True
    if operation == "reconnect":
        result, detail = wpp_request("start-session", method="POST", payload={"waitQrCode": False}, session_name=name)
        if detail:
            WhatsAppSessionObservation.objects.filter(name=name).update(last_error=detail[:500])
            return None, detail, False
    else:
        result = {"status": "CLOSED"}
    now = timezone.now()
    WhatsAppSessionObservation.objects.update_or_create(name=name, defaults={
        "status": "STARTING" if operation == "reconnect" else "CLOSED",
        "state_since": now, "observed_at": now, "last_error": "",
    })
    # Management responses never expose QR payloads or upstream diagnostics.
    return {"status": result.get("status"), "detail": "Reconexão solicitada." if operation == "reconnect" else "Sessão encerrada; pareamento preservado."}, None, False


def recovery_enabled():
    from urllib.parse import urlsplit

    if not settings.WPP_CONNECT_RECOVERY_ENABLED:
        return False
    try:
        url = urlsplit(settings.WPP_CONNECT_URL)
        return url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1") and url.port == 21465 and not url.path.strip("/")
    except ValueError:
        return False


def restart_service():
    import subprocess

    from django.db import transaction

    from .models import WhatsAppSessionObservation

    if not recovery_enabled():
        return False, "A recuperação do serviço não está habilitada para este servidor WPPConnect."
    now = timezone.now()
    with transaction.atomic():
        row, created = WhatsAppSessionObservation.objects.get_or_create(name="@service", defaults={"status": "READY", "observed_at": now, "state_since": now})
        row = WhatsAppSessionObservation.objects.select_for_update().get(pk=row.pk)
        if not created and (now - row.state_since).total_seconds() < 60:
            return False, "Aguarde 60 segundos entre tentativas de reinicialização."
        row.status = "RESTARTING"
        row.state_since = now
        row.observed_at = now
        row.save()
    try:
        subprocess.run(["sudo", "-n", "/usr/local/sbin/agromanage-wppconnect-control", "restart"], check=True, timeout=35, capture_output=True)
    except (OSError, subprocess.SubprocessError):
        WhatsAppSessionObservation.objects.filter(name="@service").update(status="FAILED")
        return False, "Não foi possível reiniciar o WPPConnect. Verifique a instalação e a permissão do controle de recuperação no servidor."
    WhatsAppSessionObservation.objects.filter(name="@service").update(status="READY")
    WhatsAppSessionObservation.objects.exclude(name="@service").update(status="unavailable", state_since=timezone.now(), last_error="")
    return True, "WPPConnect reiniciado. As sessões serão consultadas novamente; o pareamento foi preservado."
