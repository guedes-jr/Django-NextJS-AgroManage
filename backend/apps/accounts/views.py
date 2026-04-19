"""
Accounts app views — auth, user management.
"""
from django.contrib.auth import get_user_model
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
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
    serializer.is_valid(raise_exception=True)
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
    email = request.data.get("email")
    password = request.data.get("password")
    name = request.data.get("name")

    if not all([email, password, name]):
        return Response(
            {"detail": "Email, senha e nome são obrigatórios."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if User.objects.filter(email=email).exists():
        return Response(
            {"detail": "Email já cadastrado."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=name.split()[0] if name else "",
        last_name=" ".join(name.split()[1:]) if len(name.split()) > 1 else "",
    )

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


@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
def me_view(request):
    """Get or update current user profile."""
    if request.method == "GET":
        return Response(UserSerializer(request.user).data)

    if request.method in ["PUT", "PATCH"]:
        serializer = UserSerializer(
            request.user,
            data=request.data,
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