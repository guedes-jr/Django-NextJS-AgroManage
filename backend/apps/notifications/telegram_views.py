import secrets

from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.response import Response

from common.permissions import IsTenantAccessAllowed

from . import telegram
from .models import TelegramConnection


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsTenantAccessAllowed])
def connection(request):
    if request.method == "DELETE":
        TelegramConnection.objects.filter(user=request.user).delete()
    if request.method != "POST":
        return Response(telegram.connection_status(request.user))
    username = telegram.bot_username()
    if not username:
        return Response({"status": "unavailable"}, status=503)
    link = telegram.start_connection(request.user, username)
    if not link:
        return Response({"status": "connected"})
    response = Response({"status": "awaiting_telegram", "link": link})
    response["Cache-Control"] = "no-store"
    return response


@api_view(["POST"])
@permission_classes([IsTenantAccessAllowed])
def confirm(request):
    username = telegram.bot_username()
    if not username:
        return Response({"status": "unavailable"}, status=503)
    if not telegram.confirm_connection(request.user, username):
        return Response({"detail": "Não foi possível confirmar o vínculo. Verifique o Telegram ou gere um novo link."}, status=409)
    return Response({"status": "connected"})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([])
def webhook(request):
    username = telegram.bot_username()
    secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
    if not username or not secrets.compare_digest(secret.encode(), settings.TELEGRAM_WEBHOOK_SECRET.encode()):
        return Response(status=403)
    telegram.handle_update(request.data, username)
    return Response(status=204)
