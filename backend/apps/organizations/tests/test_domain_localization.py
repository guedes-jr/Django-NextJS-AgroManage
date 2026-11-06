from types import SimpleNamespace

from django.test import SimpleTestCase
from django.utils import translation
from rest_framework.exceptions import ValidationError

from apps.accounts.serializers import UserPreferencesSerializer
from apps.finance.serializers import FinancialCategorySerializer


class DomainLocalizationTests(SimpleTestCase):
    def test_validation_uses_the_requested_language_and_preserves_allowed_values(self):
        serializer = UserPreferencesSerializer()
        for language, message in [
            ("pt-br", "Unidade padrão inválida."),
            ("en", "Invalid default unit."),
            ("es", "Unidad predeterminada inválida."),
            ("pt-pt", "Unidade padrão inválida."),
        ]:
            with self.subTest(language=language), translation.override(language):
                with self.assertRaisesMessage(ValidationError, message):
                    serializer.validate_default_unit("invalid")
                self.assertEqual(serializer.validate_default_unit("kg"), "kg")
                self.assertEqual(serializer.validate_default_unit("head"), "head")

    def test_translated_validation_keeps_tenant_isolation(self):
        organization = SimpleNamespace(id="current-organization")
        serializer = FinancialCategorySerializer(context={
            "request": SimpleNamespace(user=SimpleNamespace(organization=organization)),
        })
        own_parent = SimpleNamespace(organization_id=organization.id)
        foreign_parent = SimpleNamespace(organization_id="other-organization")
        for language, message in [
            ("en", "The parent category does not belong to your organization."),
            ("es", "La categoría principal no pertenece a su organización."),
        ]:
            with self.subTest(language=language), translation.override(language):
                self.assertIs(serializer.validate_parent(own_parent), own_parent)
                with self.assertRaisesMessage(ValidationError, message):
                    serializer.validate_parent(foreign_parent)

    def test_permission_messages_are_resolved_for_each_request_language(self):
        from common.permissions import OrganizationRolePermission
        from common.authentication import MaintenanceMode

        for language, role_message, maintenance_message in [
            ("en", "Your role does not allow this operation.", "The platform is temporarily under maintenance."),
            ("es", "Su rol no permite realizar esta operación.", "La plataforma está temporalmente en mantenimiento."),
        ]:
            with self.subTest(language=language), translation.override(language):
                self.assertEqual(str(OrganizationRolePermission.message), role_message)
                self.assertEqual(str(MaintenanceMode.default_detail), maintenance_message)

    def test_organization_status_messages_do_not_change_the_stored_status(self):
        from apps.organizations.models import Organization

        organization = Organization(status=Organization.Status.SUSPENDED, is_active=False)
        with translation.override("en"):
            self.assertEqual(organization.access_denied_message, "The organization is suspended. Contact support.")
        with translation.override("es"):
            self.assertEqual(organization.access_denied_message, "La organización está suspendida. Contacte con soporte.")
        self.assertEqual(organization.status, Organization.Status.SUSPENDED)
        self.assertFalse(organization.is_active)
