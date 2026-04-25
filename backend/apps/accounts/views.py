"""
Accounts app views — auth, user management.
"""
from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()

from .serializers import (
    LoginSerializer,
    UserSerializer,
    UserCreateSerializer,
    ChangePasswordSerializer,
)


@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """Authenticate user and return JWT tokens."""
    serializer = LoginSerializer(data=request.data)
    if not serializer.is_valid():
        print(f"[AUTH] Login failed for {request.data.get('email')}: {serializer.errors}")
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    user = serializer.validated_data["user"]

    refresh = RefreshToken.for_user(user)

    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": UserSerializer(user).data,
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def register_view(request):
    """Register a new user."""
    # Map frontend 'name' to 'full_name' for the serializer
    data = request.data.copy()
    if "name" in data and "full_name" not in data:
        data["full_name"] = data.pop("name")

    serializer = UserCreateSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    refresh = RefreshToken.for_user(user)

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


from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser, FormParser

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
        
        for key in ['full_name', 'email', 'phone', 'avatar']:
            if key in request.data:
                value = request.data[key]
                if hasattr(value, 'name'):
                    data[key] = value
                elif key == 'avatar' and (value is None or str(value) == ''):
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
    request.user.save()
    return Response({"detail": "Senha alterada com sucesso."})


class UserViewSet(viewsets.ModelViewSet):
    """User CRUD (admin only)."""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == "create":
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        if not self.request.user.is_staff:
            return User.objects.filter(id=self.request.user.id)
        return User.objects.all()