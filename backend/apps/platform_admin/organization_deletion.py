"""Permanent deletion of a customer organization (platform owner only).

Guardrails: the organization must already be archived (access and sessions revoked), the
operator types its slug, and organizations with financial history (payments or affiliate
commissions) cannot be deleted — keep them archived so revenue reports stay consistent.

Order: private export packages and recovery rows (PROTECT), the referral attribution and
unpaid invoices are removed; then the organization (cascading every tenant record) and finally
the customer accounts that belonged to it. Platform staff accounts are never touched. The audit
entry keeps the name, slug and counts, because the organization link becomes NULL.
"""
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import ProtectedError
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.billing.models import Invoice, Payment
from apps.organizations.models import Organization
from .models import OrganizationExport, OrganizationRecovery
from .services import record_platform_action


class OrganizationDeletionSerializer(serializers.Serializer):
    confirmation = serializers.CharField(max_length=120)
    reason = serializers.CharField(max_length=1000, trim_whitespace=True)


def deletion_blockers(organization):
    """Reasons that prevent deletion, in Portuguese, for the confirmation screen."""
    from apps.affiliates.models import Commission

    blockers = []
    if organization.status != Organization.Status.ARCHIVED:
        blockers.append("Arquive a organização antes de excluí-la.")
    if Payment.objects.filter(organization=organization).exists():
        blockers.append("Há pagamentos registrados. Mantenha a organização arquivada para preservar o histórico financeiro.")
    if Commission.objects.filter(organization=organization).exists():
        blockers.append("Há comissões de afiliado ligadas a esta organização.")
    if OrganizationRecovery.objects.filter(isolated_organization=organization).exists():
        blockers.append("Esta organização é um ensaio isolado de recuperação; descarte-o pela tela de recuperação.")
    return blockers


def deletion_preview(organization):
    users = get_user_model().objects.filter(organization=organization, platform_staff_profile__isnull=True)
    return {
        "can_delete": not deletion_blockers(organization),
        "blockers": deletion_blockers(organization),
        "confirmation": organization.slug,
        "counts": {
            "users": users.count(),
            "farms": organization.farms.count(),
            "invoices": Invoice.objects.filter(organization=organization).count(),
        },
    }


def _delete_export_files(organization):
    from .exports.storage import ExportStorage

    storage = ExportStorage()
    for name in OrganizationExport.objects.filter(organization=organization).exclude(archive_name="").values_list("archive_name", flat=True):
        try:
            if storage.exists(name):
                storage.delete(name)
        except Exception:  # Missing or already swept package: nothing else to remove.
            pass


def delete_organization(*, request, organization_id, data):
    profile = getattr(request.user, "platform_staff_profile", None)
    if not profile or profile.role != "platform_owner":
        raise PermissionDenied("Somente o proprietário da plataforma exclui organizações.")
    serializer = OrganizationDeletionSerializer(data=data)
    serializer.is_valid(raise_exception=True)
    values = serializer.validated_data
    User = get_user_model()
    with transaction.atomic():
        organization = Organization.objects.select_for_update().get(pk=organization_id)
        if values["confirmation"].strip() != organization.slug:
            raise ValidationError({"confirmation": "Digite exatamente o identificador da organização para confirmar."})
        blockers = deletion_blockers(organization)
        if blockers:
            raise ValidationError({"detail": " ".join(blockers)})
        snapshot = {"id": str(organization.pk), "name": organization.name, "slug": organization.slug, **deletion_preview(organization)["counts"]}
        user_ids = list(User.objects.filter(organization=organization, platform_staff_profile__isnull=True).values_list("pk", flat=True))

        from apps.affiliates.models import ReferralAttribution

        _delete_export_files(organization)
        OrganizationExport.objects.filter(organization=organization).delete()
        OrganizationRecovery.objects.filter(organization=organization).delete()
        ReferralAttribution.objects.filter(organization=organization).delete()
        ReferralAttribution.objects.filter(user_id__in=user_ids).delete()
        Invoice.objects.filter(organization=organization).delete()
        try:
            organization.delete()
            User.objects.filter(pk__in=user_ids).delete()
        except ProtectedError as error:
            models = sorted({obj._meta.verbose_name for obj in error.protected_objects})
            raise ValidationError({"detail": "Há registros protegidos que impedem a exclusão: " + ", ".join(models) + "."})
        record_platform_action(
            request=request, action="organization.deleted", organization=None, object_type="Organization",
            object_id=snapshot["id"], description=f"Organização {snapshot['name']} ({snapshot['slug']}) excluída definitivamente.",
            extra_data={**snapshot, "reason": values["reason"]},
        )
    return snapshot
