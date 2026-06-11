from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
import os
import subprocess
from django.conf import settings
from django.utils import timezone
from .models import Organization, OrganizationAddress, OrganizationContact
from .serializers import (
    OrganizationSerializer, 
    OrganizationAddressSerializer, 
    OrganizationContactSerializer
)

@api_view(["GET", "PUT", "PATCH"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def my_organization_view(request):
    """Get or update current user's organization."""
    org = getattr(request.user, "organization", None)
    
    if not org:
        return Response(
            {"detail": "Usuário não vinculado a uma organização."},
            status=status.HTTP_404_NOT_FOUND
        )

    if request.method == "GET":
        return Response(OrganizationSerializer(org).data)

    # Permission check: Only Owners or Admins can edit organization data
    if request.user.role not in ["owner", "admin"]:
        return Response(
            {"detail": "Apenas administradores podem editar dados da organização."},
            status=status.HTTP_403_FORBIDDEN
        )

    serializer = OrganizationSerializer(org, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def update_project_view(request):
    """Trigger the update_project command in the background."""
    # Permission check: Only Owners or Admins of the organization can trigger project update
    if request.user.role not in ["owner", "admin"]:
        return Response(
            {"detail": "Apenas administradores podem atualizar o projeto."},
            status=status.HTTP_403_FORBIDDEN
        )

    command = getattr(settings, "UPDATE_PROJECT_COMMAND", "/bin/update_project")

    # Determine log folder and file path
    logs_dir = settings.BASE_DIR.parent / "logs"
    if not logs_dir.exists():
        logs_dir = settings.BASE_DIR / "logs"

    try:
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / "update_project.log"
        log_file = open(log_path, "a")
        log_file.write(f"\n--- Update triggered by user {request.user.email} at {timezone.now()} ---\n")
        log_file.flush()
    except Exception:
        # Fallback to devnull if we can't write to log file
        log_file = open(os.devnull, "w")

    # Pass the password as an environment variable to the subprocess
    env_vars = os.environ.copy()
    deploy_password = getattr(settings, "DEPLOY_PASSWORD", "")
    if deploy_password:
        env_vars["DEPLOY_PASSWORD"] = deploy_password

    try:
        # Start the process in a new session (detached)
        subprocess.Popen(
            [command],
            stdout=log_file,
            stderr=log_file,
            env=env_vars,
            start_new_session=True
        )
        return Response(
            {
                "detail": "Atualização do projeto iniciada com sucesso em segundo plano. O sistema pode ficar temporariamente indisponível durante a reinicialização dos serviços."
            },
            status=status.HTTP_200_OK
        )
    except Exception as e:
        return Response(
            {"detail": f"Falha ao iniciar o comando de atualização: {str(e)}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )



class OrganizationBaseViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        org = getattr(self.request.user, "organization", None)
        if not org:
            return self.queryset.none()
        return self.queryset.filter(organization=org)

    def perform_create(self, serializer):
        org = getattr(self.request.user, "organization", None)
        serializer.save(organization=org)

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method not in ['GET'] and request.user.role not in ["owner", "admin"]:
            self.permission_denied(request, message="Apenas administradores podem editar.")


class OrganizationAddressViewSet(OrganizationBaseViewSet):
    queryset = OrganizationAddress.objects.all()
    serializer_class = OrganizationAddressSerializer


class OrganizationContactViewSet(OrganizationBaseViewSet):
    queryset = OrganizationContact.objects.all()
    serializer_class = OrganizationContactSerializer

