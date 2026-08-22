"""Input validation utilities for SQL identifiers."""

import os
import re

_IDENTIFIER_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')


def validate_identifier(name: str) -> str:
    """Validate that *name* is a safe SQL identifier (table or column name).

    Only alphanumeric characters and underscores are allowed, and the name
    must start with a letter or underscore.  This prevents SQL injection
    through f-string interpolation of identifiers.

    Raises:
        ValueError: if *name* is empty or contains illegal characters.
    """
    if not name:
        raise ValueError("Identifier must not be empty")
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(
            f"Invalid SQL identifier: {name!r}. "
            "Only letters, digits and underscores are allowed, "
            "and the name must start with a letter or underscore."
        )
    return name


def validate_mdb_path(path: str) -> str:
    """Validate MDB file path."""
    if not path:
        raise ValueError("MDB path cannot be empty")

    abs_path = os.path.abspath(path)

    # Must end with .mdb
    if not abs_path.lower().endswith('.mdb'):
        raise ValueError(f"File must be a .mdb file: {path}")

    return abs_path
