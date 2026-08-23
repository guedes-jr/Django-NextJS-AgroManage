"""
Django settings base for AgroManage.
Split by environment: base → dev/prod/test.
"""

from datetime import timedelta
from pathlib import Path
from celery.schedules import crontab
import environ

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env(
    DEBUG=(bool, False),
    ALLOWED_HOSTS=(list, ["*"]),
)

# Read .env file if present
environ.Env.read_env(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY", default="change-me-in-production")
DEBUG = env("DEBUG")
ALLOWED_HOSTS = env("ALLOWED_HOSTS")

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_filters",
    "drf_spectacular",
    "celery",
]

LOCAL_APPS = [
    "apps.accounts",
    "apps.organizations",
    "apps.farms",
    "apps.livestock",
    "apps.crops",
    "apps.inventory",
    "apps.finance",
    "apps.reports",
    "apps.tasks",
    "apps.audit",
    "apps.notifications",
    "apps.platform_admin",
    "apps.billing",
    "apps.affiliates",
    "apps.ai_assistant",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

# ---------------------------------------------------------------------------
# Middleware
# ---------------------------------------------------------------------------
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
APPEND_SLASH = True

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("DB_NAME", default="agromanage_db"),
        "USER": env("DB_USER", default="agromanage_user"),
        "PASSWORD": env("DB_PASSWORD", default="agromanage_pass"),
        "HOST": env("DB_HOST", default="127.0.0.1"),
        "PORT": env("DB_PORT", default="5432"),
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static & Media
# ---------------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@agromanage.com")
DEMO_REQUEST_NOTIFICATION_EMAILS = env.list(
    "DEMO_REQUEST_NOTIFICATION_EMAILS",
    default=["contato@agromanage.com"],
)

# ---------------------------------------------------------------------------
# Provedores / Assistente Rural IA (segredos apenas no backend)
# ---------------------------------------------------------------------------
AI_DEFAULT_PROVIDER = env("AI_DEFAULT_PROVIDER", default="openai")
AI_ALLOW_PAID_FALLBACK = env.bool("AI_ALLOW_PAID_FALLBACK", default=False)
OPENAI_API_KEY = env("OPENAI_API_KEY", default="")
OPENAI_AI_MODEL = env("OPENAI_AI_MODEL", default="gpt-5.6-terra")
OPENAI_AI_MAX_OUTPUT_TOKENS = env.int("OPENAI_AI_MAX_OUTPUT_TOKENS", default=1200)
OPENAI_AI_TIMEOUT_SECONDS = env.int("OPENAI_AI_TIMEOUT_SECONDS", default=45)
OPENAI_AI_STORE_RESPONSES = env.bool("OPENAI_AI_STORE_RESPONSES", default=False)
OPENCODE_ZEN_API_KEY = env("OPENCODE_ZEN_API_KEY", default="")
OPENCODE_ZEN_BASE_URL = env("OPENCODE_ZEN_BASE_URL", default="https://opencode.ai/zen/v1")
OPENCODE_ZEN_MODEL = env("OPENCODE_ZEN_MODEL", default="mimo-v2.5-free")
OPENCODE_ZEN_MAX_OUTPUT_TOKENS = env.int("OPENCODE_ZEN_MAX_OUTPUT_TOKENS", default=1200)
OPENCODE_ZEN_TIMEOUT_SECONDS = env.int("OPENCODE_ZEN_TIMEOUT_SECONDS", default=45)

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "common.authentication.ActiveOrganizationJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardResultsPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "common.exceptions.custom_exception_handler",
    "DEFAULT_THROTTLE_RATES": {
        "affiliate_tracking": env("AFFILIATE_TRACKING_RATE", default="60/min"),
    },
}

AFFILIATE_ATTRIBUTION_MAX_AGE_SECONDS = env.int(
    "AFFILIATE_ATTRIBUTION_MAX_AGE_SECONDS",
    default=60 * 60 * 24 * 30,
)

# ---------------------------------------------------------------------------
# JWT
# ---------------------------------------------------------------------------
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=2),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
)
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Celery
# ---------------------------------------------------------------------------
CELERY_BROKER_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
AI_MODEL_SYNC_DAY_OF_WEEK = env("AI_MODEL_SYNC_DAY_OF_WEEK", default="monday")
AI_MODEL_SYNC_HOUR = env.int("AI_MODEL_SYNC_HOUR", default=3)
AI_MODEL_SYNC_MINUTE = env.int("AI_MODEL_SYNC_MINUTE", default=0)
AI_MODEL_CATALOG_STALE_DAYS = env.int("AI_MODEL_CATALOG_STALE_DAYS", default=14)
CELERY_BEAT_SCHEDULE = {
    "sync-opencode-zen-models-weekly": {
        "task": "apps.ai_assistant.tasks.sync_opencode_zen_models_task",
        "schedule": crontab(
            minute=AI_MODEL_SYNC_MINUTE,
            hour=AI_MODEL_SYNC_HOUR,
            day_of_week=AI_MODEL_SYNC_DAY_OF_WEEK,
        ),
    },
}

# ---------------------------------------------------------------------------
# DRF Spectacular (OpenAPI)
# ---------------------------------------------------------------------------
SPECTACULAR_SETTINGS = {
    "TITLE": "AgroManage API",
    "DESCRIPTION": "REST API for the AgroManage platform — livestock, crops, inventory, finance.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {
            "format": "{levelname} {asctime} {module} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "verbose",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": env("DJANGO_LOG_LEVEL", default="INFO"),
            "propagate": False,
        },
    },
}

# ---------------------------------------------------------------------------
# Project Update command
# ---------------------------------------------------------------------------
UPDATE_PROJECT_COMMAND = env("UPDATE_PROJECT_COMMAND", default="/var/www/agromanage/scripts/update_project.sh")
UPDATE_TIMEOUT_SECONDS = env("UPDATE_TIMEOUT_SECONDS", default="600")
DEPLOY_USER = env("DEPLOY_USER", default="deploy")
DEPLOY_PASSWORD = env("DEPLOY_PASSWORD", default="")

# Isolated developer sandbox. Disabled until the external container is validated.
SANDBOX_EXECUTOR_ENABLED = env.bool("SANDBOX_EXECUTOR_ENABLED", default=False)
SANDBOX_EXECUTOR_SOCKET = env("SANDBOX_EXECUTOR_SOCKET", default="/run/agromanage-sandbox/executor.sock")
SANDBOX_EXECUTOR_TOKEN = env("SANDBOX_EXECUTOR_TOKEN", default="")
SANDBOX_EXECUTOR_TIMEOUT = env.int("SANDBOX_EXECUTOR_TIMEOUT", default=7)
