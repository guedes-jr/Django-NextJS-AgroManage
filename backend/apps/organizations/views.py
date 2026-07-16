from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
import os
import subprocess
from django.conf import settings
from django.utils import timezone
from .models import OrganizationAddress, OrganizationContact
from .serializers import (
    OrganizationSerializer, 
    OrganizationAddressSerializer, 
    OrganizationContactSerializer
)
from common.permissions import IsPlatformAdmin

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
@permission_classes([IsPlatformAdmin])
def update_project_view(request):
    """Trigger the update_project command in the background."""
    command = getattr(settings, "UPDATE_PROJECT_COMMAND", "/home/deploy/bin/update_project")

    # Determine log folder and file path
    logs_dir = settings.BASE_DIR.parent / "logs"
    if not logs_dir.exists():
        logs_dir = settings.BASE_DIR / "logs"

    try:
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / "update_project.log"
        # Overwrite file to clear past execution logs
        log_file = open(log_path, "w")
        log_file.write(f"--- Update triggered by user {request.user.email} at {timezone.now()} ---\n")
        log_file.flush()
    except Exception:
        # Fallback to devnull if we can't write to log file
        log_file = open(os.devnull, "w")

    # Pass the password as an environment variable to the subprocess
    env_vars = os.environ.copy()
    deploy_user = getattr(settings, "DEPLOY_USER", "deploy")
    deploy_password = getattr(settings, "DEPLOY_PASSWORD", "")
    update_timeout_seconds = getattr(settings, "UPDATE_TIMEOUT_SECONDS", "600")
    if update_timeout_seconds:
        env_vars["UPDATE_TIMEOUT_SECONDS"] = str(update_timeout_seconds)
    if deploy_user:
        env_vars["DEPLOY_USER"] = deploy_user
    if deploy_password:
        env_vars["DEPLOY_PASSWORD"] = deploy_password

    try:
        # Start the process in a new session (detached)
        proc = subprocess.Popen(
            [command],
            stdout=log_file,
            stderr=log_file,
            env=env_vars,
            start_new_session=True
        )

        # Write PID to file
        pid_path = logs_dir / "update_project.pid"
        try:
            pid_path.write_text(str(proc.pid))
        except Exception:
            pass

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


@api_view(["GET"])
@permission_classes([IsPlatformAdmin])
def update_logs_view(request):
    """Retrieve the current update logs, calculate progress, and check status."""
    # Determine log folder
    logs_dir = settings.BASE_DIR.parent / "logs"
    if not logs_dir.exists():
        logs_dir = settings.BASE_DIR / "logs"

    log_path = logs_dir / "update_project.log"
    pid_path = logs_dir / "update_project.pid"

    # Read log content
    log_content = ""
    if log_path.exists():
        try:
            log_content = log_path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            log_content = f"Erro ao ler arquivo de log: {str(e)}"

    # Determine status by checking if process is running
    status_str = "idle"
    pid = None
    if pid_path.exists():
        try:
            pid = int(pid_path.read_text().strip())
        except Exception:
            pass

    is_running = False
    if pid is not None:
        try:
            # Check if process exists on Linux
            os.kill(pid, 0)
            is_running = True
            status_str = "running"
        except OSError:
            # Process is not running anymore
            is_running = False

    # Calculate progress and adjust status if process finished
    progress = 0
    if log_content:
        # If it finished successfully
        if "Atualização concluída com sucesso!" in log_content:
            progress = 100
            status_str = "success"
        # If there's an error marker
        elif "[ERRO]" in log_content:
            status_str = "failed"
            progress = calculate_progress_pct(log_content)
        elif is_running:
            status_str = "running"
            progress = calculate_progress_pct(log_content)
        else:
            # Not running and not success or error marker -> likely crashed/terminated unexpectedly
            status_str = "failed"
            progress = calculate_progress_pct(log_content)
    else:
        if is_running:
            status_str = "running"
            progress = 5

    return Response({
        "status": status_str,
        "progress": progress,
        "logs": log_content
    })


def calculate_progress_pct(log_content):
    markers = [
        ("[DEPLOY] Atualização concluída com sucesso!", 100),
        ("[DEPLOY] Testando frontend local...", 98),
        ("[DEPLOY] Testando backend local...", 96),
        ("[DEPLOY] Verificando status do frontend...", 94),
        ("[DEPLOY] Verificando status do backend...", 92),
        ("[DEPLOY] Reiniciando serviços...", 90),
        ("[DEPLOY] Gerando build do Next.js...", 75),
        ("[DEPLOY] Instalando dependências do frontend...", 60),
        ("[DEPLOY] Coletando arquivos estáticos...", 55),
        ("[DEPLOY] Aplicando migrations...", 45),
        ("[DEPLOY] Checando configuração Django...", 40),
        ("[DEPLOY] Garantindo Gunicorn instalado...", 35),
        ("[DEPLOY] Instalando dependências do backend...", 30),
        ("[DEPLOY] Limpando arquivos não rastreados...", 25),
        ("[DEPLOY] Atualizando código para", 20),
        ("[DEPLOY] Buscando atualizações", 15),
        ("[DEPLOY] Salvando commit atual", 10),
        ("[DEPLOY] Verificando repositório Git...", 5),
    ]
    for marker, pct in markers:
        if marker in log_content:
            return pct
    return 0



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
