import os
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.dev")
django.setup()

from apps.accounts.models import User
from apps.organizations.models import Organization

org = Organization.objects.first()
if not org:
    org = Organization.objects.create(name="Test Org")

user = User.objects.create_user(
    email="test_org_user2@test.com",
    password="password123",
    full_name="Test Org User",
    organization=org
)

print("Created user: {}, Organization ID: {}".format(user.email, user.organization_id))

user.delete()
