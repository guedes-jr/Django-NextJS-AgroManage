import getpass
import os
import sys

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.platform_admin.models import PlatformStaffProfile

User = get_user_model()


class Command(BaseCommand):
    help = "Cria ou atualiza um membro interno da equipe da plataforma."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--name", required=True)
        parser.add_argument(
            "--role",
            choices=[value for value, _label in PlatformStaffProfile.Role.choices],
            default=PlatformStaffProfile.Role.OWNER,
        )
        parser.add_argument(
            "--password-env",
            default="PLATFORM_STAFF_PASSWORD",
            help="Nome da variável de ambiente que contém a senha inicial.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        email = User.objects.normalize_email(options["email"])
        password = os.environ.get(options["password_env"])

        if not password and sys.stdin.isatty():
            password = getpass.getpass("Senha inicial: ")
            confirmation = getpass.getpass("Confirme a senha: ")
            if password != confirmation:
                raise CommandError("As senhas não conferem.")

        if not password:
            raise CommandError(
                f"Defina {options['password_env']} ou execute o comando em um terminal interativo."
            )

        user = User.objects.filter(email=email).first()
        if user and user.organization_id:
            raise CommandError(
                "O usuário informado pertence a uma organização cliente. "
                "Use uma conta interna separada."
            )

        candidate = user or User(email=email, full_name=options["name"])
        try:
            validate_password(password, user=candidate)
        except ValidationError as exc:
            raise CommandError(" ".join(exc.messages)) from exc

        created = user is None
        if created:
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=options["name"],
                is_staff=True,
            )
        else:
            user.full_name = options["name"]
            user.is_active = True
            user.is_staff = True
            user.set_password(password)
            user.save(
                update_fields=[
                    "full_name",
                    "is_active",
                    "is_staff",
                    "password",
                    "updated_at",
                ]
            )

        profile, profile_created = PlatformStaffProfile.objects.update_or_create(
            user=user,
            defaults={
                "role": options["role"],
                "is_active": True,
                "mfa_required": True,
            },
        )

        operation = "criado" if created and profile_created else "atualizado"
        self.stdout.write(
            self.style.SUCCESS(
                f"Membro da plataforma {operation}: {user.email} ({profile.role}). "
                "MFA permanece obrigatório para o painel da plataforma."
            )
        )
