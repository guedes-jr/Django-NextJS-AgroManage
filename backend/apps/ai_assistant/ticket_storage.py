"""Ticket attachments live outside public MEDIA_ROOT and have no public URLs."""
import os
import uuid
from pathlib import Path
from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.core.exceptions import ImproperlyConfigured
from django.utils.deconstruct import deconstructible


@deconstructible
class SupportAttachmentStorage(FileSystemStorage):
    def __init__(self):
        super().__init__(base_url=None, file_permissions_mode=0o600, directory_permissions_mode=0o700)

    @property
    def base_location(self):
        root = Path(settings.SUPPORT_ATTACHMENT_ROOT).resolve()
        for public in (settings.MEDIA_ROOT, settings.STATIC_ROOT):
            if public and root.is_relative_to(Path(public).resolve()):
                raise ImproperlyConfigured("SUPPORT_ATTACHMENT_ROOT must be outside public storage roots.")
        return str(root)

    @property
    def location(self):
        return os.path.abspath(self.base_location)

    def url(self, name):
        raise ValueError("Support attachments require an authorized download.")


def support_attachment_path(instance, filename):
    return f"support-private/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"
