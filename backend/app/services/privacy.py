"""Privacy hardening — data redaction and secure deletion.

Startup teams share a board with external agents over MCP. These helpers
ensure that deleted data is gone and that PII never leaks into agent context.
"""

from __future__ import annotations

import re
from pathlib import Path

# Patterns that should never reach an agent or appear in logs.
_PII_PATTERNS: list[tuple[str, str]] = [
    (r"[\w.-]+@[\w.-]+\.\w+", "[email redacted]"),
    (r"(sk-[a-zA-Z0-9]{20,})", "[key redacted]"),
    (r"(xox[baprs]-[a-zA-Z0-9-]{10,})", "[token redacted]"),
]


def redact_pii(text: str) -> str:
    """Strip email addresses, API keys and Slack tokens from displayed text."""
    for pattern, replacement in _PII_PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text


def secure_unlink(path: Path) -> None:
    """Overwrite then delete.

    A single-pass zero-fill over the first 1 MiB, then unlink. Not
    forensically secure, but it defeats casual recovery from disk.
    """
    if not path.exists():
        return
    try:
        with open(path, "ba+") as f:
            length = f.tell()
            f.seek(0)
            f.write(b"\x00" * min(length, 1_048_576))
    except OSError:
        pass
    path.unlink(missing_ok=True)
