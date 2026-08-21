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


# Allowed base directories for MDB files
MDB_ALLOWED_DIRS = [
    os.path.abspath("data"),
    os.path.abspath("."),  # Project root
]


def validate_mdb_path(path: str) -> str:
    """Validate MDB file path is within allowed directories."""
    if not path:
        raise ValueError("MDB path cannot be empty")

    abs_path = os.path.abspath(path)

    # Must end with .mdb
    if not abs_path.lower().endswith('.mdb'):
        raise ValueError(f"File must be a .mdb file: {path}")

    # Check against allowed directories
    allowed = False
    for allowed_dir in MDB_ALLOWED_DIRS:
        if abs_path.startswith(allowed_dir + os.sep) or abs_path == allowed_dir:
            allowed = True
            break

    if not allowed:
        raise ValueError(f"MDB path must be within allowed directories: {path}")

    return abs_path
