from .base import *  # noqa: F401, F403

DEBUG = True
ALLOWED_HOSTS = ["*"]

# Django Debug Toolbar (optional, install separately)
INSTALLED_APPS += ["django_extensions"]  # noqa: F405

# Faster password hashing in tests/dev
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'https://retrace-epileptic-varsity.ngrok-free.dev',
]

# Allow all CORS in dev
CORS_ALLOW_ALL_ORIGINS = True

# E-mail output to console
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Disable caching in dev
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.dummy.DummyCache",
    }
}
