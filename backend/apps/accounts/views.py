"""
Accounts app views — auth, user management.
"""
from django.contrib.auth import get_user_model
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.utils.text import slugify
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, authentication_classes, permission_classes, parser_classes
from rest_framework.permissions import AllowAny
from common.permissions import IsTenantAccessAllowed as IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from apps.organizations.models import Organization

from .serializers import (
    LoginSerializer,
    UserSerializer,
    UserCreateSerializer,
    ChangePasswordSerializer,
    UserPreferencesSerializer,
    OrganizationMemberSerializer,
    CreateMemberSerializer,
)
from .tokens import issue_tokens_for_user
from .google_oauth import (
    GoogleOAuthConfigurationError,
    GoogleOAuthError,
    verify_google_credential,
)

User = get_user_model()

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def members_view(request):
    """List all members of the user's organization."""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response([])
    
    members = User.objects.filter(organization=org).select_related("notification_preference").prefetch_related("allowed_livestock").order_by("full_name")
    return Response(OrganizationMemberSerializer(members, many=True).data)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def member_detail_view(request, pk):
    """Update or remove a member from the organization."""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response({"detail": "Você não pertence a uma organização."}, status=403)
    if request.user.role != 'admin':
        return Response({'detail': 'Somente administradores podem gerenciar usuários.'}, status=403)
    with transaction.atomic():
        Organization.objects.select_for_update().get(pk=org.pk)
        try:
            member = User.objects.select_for_update().get(pk=pk, organization=org)
        except User.DoesNotExist:
            return Response(status=404)
        before = {'role': member.role, 'can_operate_crops': member.can_operate_crops, 'allowed_livestock': list(member.allowed_livestock.values_list('code', flat=True)), 'operator_read_only': member.operator_read_only, 'is_active': member.is_active}
        if request.method == 'DELETE':
            changes = {'is_active': False}
            serializer = OrganizationMemberSerializer(member, data=changes, partial=True)
        else:
            serializer = OrganizationMemberSerializer(member, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changes = serializer.validated_data
        new_role = changes.get('role', member.role)
        removing_admin = member.role == 'admin' and (new_role != 'admin' or changes.get('is_active') is False)
        if member.pk == request.user.pk and (new_role != member.role or changes.get('is_active') is False):
            return Response({'detail': 'Você não pode remover ou rebaixar seu próprio acesso.'}, status=400)
        if member.organization_responsible and removing_admin:
            return Response({'detail': 'O responsável pela organização deve permanecer administrador ativo.'}, status=400)
        if removing_admin and not User.objects.filter(organization=org, role='admin', is_active=True).exclude(pk=member.pk).exists():
            return Response({'detail': 'A organização precisa manter um administrador ativo.'}, status=400)
        serializer.save()
        from apps.audit.services import record_client_action
        from apps.audit.models import AuditLog
        record_client_action(request=request, action=AuditLog.Action.UPDATE, model_name='User', object_id=member.pk, description='Permissões de usuário atualizadas.', extra_data={'before': before, 'after': {'role': member.role, 'can_operate_crops': member.can_operate_crops, 'allowed_livestock': list(member.allowed_livestock.values_list('code', flat=True)), 'operator_read_only': member.operator_read_only, 'is_active': member.is_active}})
        return Response(status=204) if request.method == 'DELETE' else Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_member_view(request):
    """Create a new member in the organization."""
    org = getattr(request.user, "organization", None)
    if not org:
        return Response(
            {"detail": "Você não pertence a uma organização."},
            status=status.HTTP_400_BAD_REQUEST
        )

    if request.user.role != "admin":
        return Response(
            {"detail": "Permissão negada."},
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = CreateMemberSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    if User.objects.filter(email=data["email"]).exists():
        return Response(
            {"detail": "Já existe um usuário com este email."},
            status=status.HTTP_400_BAD_REQUEST
        )

    with transaction.atomic():
        user = serializer.save(organization=org, force_password_change=True)
        from apps.audit.services import record_client_action
        from apps.audit.models import AuditLog
        record_client_action(request=request, action=AuditLog.Action.CREATE, model_name='User', object_id=user.pk, description='Usuário da organização criado.', extra_data={'role': user.role, 'can_operate_crops': user.can_operate_crops, 'allowed_livestock': list(user.allowed_livestock.values_list('code', flat=True)), 'operator_read_only': user.operator_read_only})

    return Response(
        OrganizationMemberSerializer(user).data,
        status=status.HTTP_201_CREATED
    )


def _ensure_user_organization(user):
    """Auto-provision an organization for users without tenant binding."""
    from common.authentication import is_active_platform_staff

    if is_active_platform_staff(user):
        return None

    try:
        if user.affiliate_profile.portal_access_only:
            return None
    except (AttributeError, ObjectDoesNotExist):
        pass

    if getattr(user, "organization", None):
        return user.organization

    base_name = f"Organização de {user.full_name or user.email}"
    base_slug = slugify(user.full_name or user.email.split("@")[0] or "organizacao")
    slug = base_slug or "organizacao"
    suffix = 1

    while Organization.objects.filter(slug=slug).exists():
        suffix += 1
        slug = f"{base_slug}-{suffix}" if base_slug else f"organizacao-{suffix}"

    organization = Organization.objects.create(name=base_name[:255], slug=slug[:100])
    user.organization = organization
    user.role = User.Role.ADMIN
    user.organization_responsible = True
    user.save(update_fields=["organization", "role", "organization_responsible", "updated_at"])
    return organization


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """Authenticate user and return JWT tokens."""
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        print(f"[AUTH] Login failed for {request.data.get('email')}: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    user = serializer.validated_data["user"]
    from apps.platform_admin.operational import active_maintenance_window
    from common.authentication import is_active_platform_staff
    window = active_maintenance_window()
    if window and not is_active_platform_staff(user):
        return Response({"detail": window.message, "code": "maintenance_mode"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    _ensure_user_organization(user)

    refresh = issue_tokens_for_user(user)

    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def google_login_view(request):
    """Authenticate a verified Google identity and return application JWTs."""
    try:
        identity = verify_google_credential(str(request.data.get("credential") or ""))
    except GoogleOAuthConfigurationError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except GoogleOAuthError as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

    from apps.platform_admin.operational import active_maintenance_window
    from common.authentication import is_active_platform_staff

    with transaction.atomic():
        user = User.objects.select_for_update().filter(email__iexact=identity["email"]).first()
        if user is None:
            user = User.objects.create_user(
                email=identity["email"],
                password=None,
                full_name=identity["name"],
                role=User.Role.ADMIN,
            )

        if not user.is_active:
            return Response({"detail": "Usuário inativo."}, status=status.HTTP_403_FORBIDDEN)
        if (
            user.organization
            and not user.organization.is_active
            and not is_active_platform_staff(user)
        ):
            return Response(
                {"detail": "Organização suspensa. Entre em contato com o suporte."},
                status=status.HTTP_403_FORBIDDEN,
            )

        window = active_maintenance_window()
        if window and not is_active_platform_staff(user):
            return Response(
                {"detail": window.message, "code": "maintenance_mode"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        _ensure_user_organization(user)

    refresh = issue_tokens_for_user(user)
    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@authentication_classes([])
def register_view(request):
    """Register a new user."""
    # Map frontend 'name' to 'full_name' for the serializer
    data = request.data.copy()
    if "name" in data and "full_name" not in data:
        data["full_name"] = data.pop("name")

    serializer = UserCreateSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    referral_token = serializer.validated_data.get("referral_token", "")
    with transaction.atomic():
        user = serializer.save()
        organization = _ensure_user_organization(user)
        if referral_token and organization:
            from apps.affiliates.services import bind_attribution_to_customer

            bind_attribution_to_customer(
                token=referral_token,
                user=user,
                organization=organization,
            )

    refresh = issue_tokens_for_user(user)

    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def password_recovery_view(request):
    """Send password recovery email."""
    email = request.data.get("email")

    if not email:
        return Response(
            {"detail": "Email é obrigatório."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {"detail": "Se o email existir, você receberá instruções para redefinir sua senha."}
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    """Blacklist refresh token on logout."""
    try:
        refresh_token = request.data.get("refresh")
        if refresh_token:
            token = RefreshToken(refresh_token)
            token.blacklist()
        return Response({"detail": "Logout realizado com sucesso."})
    except Exception:
        return Response({"detail": "Logout realizado."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def refresh_token_view(request):
    """Refresh access token."""
    try:
        refresh_token = request.data.get("refresh")
        token = RefreshToken(refresh_token)
        return Response({"access": str(token.access_token)})
    except Exception:
        return Response(
            {"detail": "Token inválido ou expirado."},
            status=status.HTTP_401_UNAUTHORIZED,
        )


@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def me_view(request):
    """Get or update current user profile."""
    import logging
    logger = logging.getLogger(__name__)
    from django.core.files.storage import default_storage
    
    if request.method == "GET":
        return Response(UserSerializer(request.user).data)

    if request.method in ["PUT", "PATCH"]:
        user = request.user
        old_avatar = user.avatar if user.avatar else None
        
        data = {}
        
        for key in ['full_name', 'email', 'phone', 'avatar', 'phone_is_whatsapp', 'receive_system_alerts', 'whatsapp_reproductive_alerts']:
            if key in request.data:
                value = request.data[key]
                if hasattr(value, 'name'):
                    data[key] = value
                elif key in ('avatar', 'phone') and (value is None or str(value) == ''):
                    data[key] = ''
                elif value is not None and str(value) != '':
                    data[key] = str(value)
        
        logger.warning(f"[DEBUG] Parsed data: {data}")
        
        if 'avatar' in data and data['avatar'] is not None:
            if hasattr(data['avatar'], 'name') and data['avatar'].name == '':
                if old_avatar:
                    try:
                        default_storage.delete(old_avatar.path)
                    except Exception:
                        pass
                user.avatar = None
                user.save()
                data['avatar'] = None
        
        logger.warning(f"[DEBUG] Final data for serializer: {data}")
        
        serializer = UserSerializer(
            user,
            data=data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        
        return Response(UserSerializer(request.user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    """Change user password."""
    serializer = ChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    if not request.user.check_password(serializer.validated_data["old_password"]):
        return Response(
            {"old_password": "Senha atual incorreta."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    request.user.set_password(serializer.validated_data["new_password"])
    request.user.force_password_change = False
    request.user.save()
    return Response({"detail": "Senha alterada com sucesso."})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def preferences_view(request):
    """Get or update current user's interface and system preferences."""
    if request.method == "GET":
        return Response(UserPreferencesSerializer(request.user).data)

    serializer = UserPreferencesSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def force_change_password_view(request):
    """Force change user password (only when flag is true)."""
    if not request.user.force_password_change:
        return Response(
            {"detail": "Você não precisa forçar a troca de senha."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    new_password = request.data.get("new_password")
    new_password_confirm = request.data.get("new_password_confirm")

    if not new_password or new_password != new_password_confirm:
        return Response(
            {"detail": "As senhas não conferem ou estão vazias."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_password) < 8:
        return Response(
            {"detail": "A senha deve ter pelo menos 8 caracteres."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    request.user.set_password(new_password)
    request.user.force_password_change = False
    request.user.save()
    return Response({"detail": "Senha atualizada com sucesso."})


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only tenant user directory; mutations use the member endpoints."""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        organization = getattr(self.request.user, "organization", None)
        if not organization:
            return User.objects.filter(id=self.request.user.id)
        return User.objects.filter(organization=organization).select_related("notification_preference").prefetch_related("allowed_livestock")


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def operator_options(request):
    from apps.livestock.models import Species
    return Response({'roles': [{'value': value, 'label': label} for value, label in User.Role.choices], 'species': list(Species.objects.order_by('name').values('id', 'code', 'name'))})
