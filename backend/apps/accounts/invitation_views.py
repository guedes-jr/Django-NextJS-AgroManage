from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import SimpleRateThrottle

from .invitations import accept_invitation, inspect_invitation


class InvitationThrottle(SimpleRateThrottle):
    scope = "organization_invitation"
    rate = "30/min"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class InvitationTokenSerializer(serializers.Serializer):
    token = serializers.CharField(min_length=43, max_length=43, trim_whitespace=False)


class InvitationAcceptanceSerializer(InvitationTokenSerializer):
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    password_confirmation = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError({"password_confirmation": "As senhas não coincidem."})
        return attrs


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([InvitationThrottle])
def invitation_inspect(request):
    serializer = InvitationTokenSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    invitation = inspect_invitation(serializer.validated_data["token"])
    return Response({"organization_name": invitation.organization.name, "full_name": invitation.user.full_name, "email": invitation.email, "expires_at": invitation.expires_at})


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([InvitationThrottle])
def invitation_accept(request):
    serializer = InvitationAcceptanceSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    accept_invitation(token=serializer.validated_data["token"], password=serializer.validated_data["password"], request=request)
    return Response({"detail": "Senha definida e acesso ativado. Entre com seu e-mail e senha."})
