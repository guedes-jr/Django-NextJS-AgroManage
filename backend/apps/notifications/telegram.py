"""Telegram opt-in and account linking."""
import hashlib
import json
import re
import secrets
from contextlib import closing
from http.client import HTTPException, HTTPSConnection
from datetime import datetime, timedelta, timezone as datetime_timezone

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from .models import TelegramConnection


def bot_username():
    username = settings.TELEGRAM_BOT_USERNAME.lower()
    if settings.TELEGRAM_WEBHOOK_SECRET and re.fullmatch(r"[a-z0-9_]{5,32}", username):
        return username
    return ""


def connection_status(user):
    username = bot_username()
    if not username:
        return {"status": "unavailable"}
    connection = TelegramConnection.objects.filter(user=user, bot_username=username).first()
    if connection and connection.chat_id:
        result = {"status": "connected"}
        if not _phone_matches(connection):
            result["requires_phone_verification"] = True
        return result
    if connection and connection.expires_at and connection.expires_at > timezone.now():
        if connection.pending_chat_id and not _phone_matches(connection):
            return {"status": "awaiting_phone"}
        return {"status": "ready_to_confirm" if connection.pending_chat_id else "awaiting_telegram"}
    return {"status": "disconnected"}


def _digest(code):
    return hashlib.sha256(code.encode()).hexdigest()


@transaction.atomic
def start_connection(user, username):
    connection, _ = TelegramConnection.objects.select_for_update().get_or_create(
        user=user, defaults={"bot_username": username},
    )
    if connection.bot_username == username and connection.chat_id:
        return None
    code = secrets.token_urlsafe(32)
    connection.bot_username = username
    connection.chat_id = None
    connection.verified_phone = ""
    connection.confirmed_at = None
    connection.pending_chat_id = None
    connection.challenge_hash = _digest(code)
    connection.expires_at = timezone.now() + timedelta(minutes=10)
    connection.save()
    return f"https://t.me/{username}?start={code}"


def _private_command(update):
    message = update.get("message") if isinstance(update, dict) else None
    if not isinstance(message, dict):
        return None
    chat, sender, text = message.get("chat"), message.get("from"), message.get("text")
    if not isinstance(chat, dict) or not isinstance(sender, dict):
        return None
    chat_id = chat.get("id")
    if (
        chat.get("type") != "private" or type(chat_id) is not int
        or not 0 < chat_id < 2**52 or sender.get("id") != chat_id or sender.get("is_bot")
    ):
        return None
    return chat_id, text if isinstance(text, str) else "", message


def handle_update(update, username):
    command = _private_command(update)
    if not command:
        return
    chat_id, text, message = command
    message_date = message.get("date")
    if match := re.fullmatch(r"/start ([A-Za-z0-9_-]{43})", text):
        # Consuming the hash in the same update makes webhook retries harmless.
        pending = TelegramConnection.objects.filter(
            bot_username=username, challenge_hash=_digest(match[1]),
            expires_at__gt=timezone.now(), chat_id__isnull=True,
        )
        with transaction.atomic():
            connection = pending.select_for_update().select_related("user").first()
            if connection:
                pending.update(challenge_hash=None, pending_chat_id=chat_id)
        if connection and connection.user.notification_contact("telegram"):
            _request_phone(chat_id)
    elif text == "/telefone":
        if _connections_for_chat(username, chat_id).exists():
            _request_phone(chat_id)
    elif (
        isinstance(contact := message.get("contact"), dict)
        and contact.get("user_id") == chat_id and not message.get("forward_origin")
    ):
        from .tasks import _whatsapp_phone

        phone_number = contact.get("phone_number")
        phone = _whatsapp_phone(phone_number) if isinstance(phone_number, str) else ""
        if phone:
            _connections_for_chat(username, chat_id).update(verified_phone=phone)
    elif text == "/stop" and type(message_date) is int and 0 < message_date <= int(timezone.now().timestamp()):
        # A delayed update from a prior connection must not revoke a new one.
        sent_before = datetime.fromtimestamp(message_date + 1, tz=datetime_timezone.utc)
        TelegramConnection.objects.filter(
            bot_username=username, chat_id=chat_id, confirmed_at__lt=sent_before,
        ).update(chat_id=None, confirmed_at=None, verified_phone="")


def _connections_for_chat(username, chat_id):
    from django.db.models import Q

    return TelegramConnection.objects.filter(bot_username=username).filter(
        Q(chat_id=chat_id) | Q(pending_chat_id=chat_id, expires_at__gt=timezone.now()),
    )


def _phone_matches(connection):
    from .tasks import _whatsapp_phone

    target = connection.user.notification_contact("telegram")
    return not target or connection.verified_phone == _whatsapp_phone(target)


def _request_phone(chat_id):
    token = settings.TELEGRAM_BOT_TOKEN
    if not re.fullmatch(r"[0-9]+:[A-Za-z0-9_-]+", token):
        return
    payload = json.dumps({
        "chat_id": chat_id,
        "text": "Compartilhe seu próprio número para verificar o contato de notificações do AgroManage.",
        "reply_markup": {"keyboard": [[{"text": "Compartilhar meu número", "request_contact": True}]], "one_time_keyboard": True, "resize_keyboard": True},
    })
    try:
        with closing(HTTPSConnection("api.telegram.org", timeout=5)) as connection:
            connection.request("POST", f"/bot{token}/sendMessage", payload, {"Content-Type": "application/json"})
            connection.getresponse()
    except (OSError, HTTPException):
        # The user can request the keyboard again with /telefone.
        return


def confirm_connection(user, username):
    try:
        with transaction.atomic():
            connection = TelegramConnection.objects.select_for_update().filter(
                user=user, bot_username=username,
            ).first()
            if connection and connection.chat_id:
                return True
            now = timezone.now()
            if not connection or not connection.pending_chat_id or not connection.expires_at or connection.expires_at <= now or not _phone_matches(connection):
                return False
            connection.chat_id = connection.pending_chat_id
            connection.confirmed_at = now
            connection.pending_chat_id = None
            connection.expires_at = None
            connection.save(update_fields=["chat_id", "confirmed_at", "pending_chat_id", "expires_at"])
    except IntegrityError:
        return False
    return True
