"""
Shared utility functions.
"""
import re


def normalize_string(value: str) -> str:
    """Strip and collapse whitespace."""
    return re.sub(r"\s+", " ", value.strip())


def mask_sensitive(value: str, visible: int = 4) -> str:
    """Mask all but the last N characters of a string."""
    if len(value) <= visible:
        return "*" * len(value)
    return "*" * (len(value) - visible) + value[-visible:]
