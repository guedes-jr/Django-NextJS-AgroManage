"""Explicit opt-in PostgreSQL tests against a private disposable local cluster."""
import os
from django.core.exceptions import ImproperlyConfigured
from .test import *  # noqa: F401,F403

_socket = os.environ.get('AGROMANAGE_TEST_PG_SOCKET', '')
if not _socket.startswith('/private/tmp/agromanage-phase3-pg.'):
    raise ImproperlyConfigured('Use an isolated /private/tmp/agromanage-phase3-pg.* socket for PostgreSQL tests.')
DATABASES = {'default': {
    'ENGINE': 'django.db.backends.postgresql',
    'NAME': 'postgres',
    'USER': 'phase3_validator',
    'PASSWORD': '',
    'HOST': _socket,
    'PORT': '55473',
    'CONN_MAX_AGE': 0,
    'TEST': {'NAME': 'test_agromanage_phase3'},
}}
