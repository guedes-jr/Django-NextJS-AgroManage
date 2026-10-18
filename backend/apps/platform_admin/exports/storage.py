"""Private export storage, separated from public uploads and support attachments."""
import os
from pathlib import Path
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import FileSystemStorage


class ExportStorage(FileSystemStorage):
    def __init__(self):
        super().__init__(file_permissions_mode=0o600, directory_permissions_mode=0o700)

    @property
    def base_location(self):
        root = Path(settings.ORGANIZATION_EXPORT_ROOT).resolve()
        for public in (settings.MEDIA_ROOT, settings.STATIC_ROOT):
            if public and root.is_relative_to(Path(public).resolve()):
                raise ImproperlyConfigured("ORGANIZATION_EXPORT_ROOT must be outside public roots.")
        return str(root)

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):
        raise ValueError("Exports require an authorized download.")
