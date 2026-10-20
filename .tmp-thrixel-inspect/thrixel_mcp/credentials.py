"""On-disk credentials written by ``thrixel-mcp login``.

WHY A FILE AT ALL
    Without one, the API key has to be pasted into an MCP client's `env` block,
    which means a human copying a secret by hand and an agent holding it in
    context.  With one, ``claude mcp add --scope user thrixel -- uvx thrixel-mcp@latest`` needs no
    env at all: login writes the key, the server reads it.

WHY A PLAIN 0600 FILE AND NOT THE OS KEYRING
    The keyring is the textbook answer, and it is the wrong one here.  It needs
    an extra dependency and a live desktop session; our users run agents over
    SSH and inside containers, where every keyring backend fails.  A 0600 file
    in a 0700 directory is what `~/.aws/credentials`, `~/.npmrc`,
    `~/.docker/config.json` and gh's own fallback do, and it works everywhere.

THE KEY DOES NOT EXPIRE, BUT IT DOES GET REVOKED
    Thrixel API keys have no expiry -- they are valid until revoked.  So this
    file is written once and normally keeps working; there is no re-login
    treadmill.  Revocation is per key from the dashboard, and login names each
    key after the machine it was minted on so the right one is obvious.

    Revocation is NOT rare, though, and this file cannot tell.  Signing in again
    revokes the existing key of the same name, so a second login on any machine
    with the same hostname silently kills the first and the dead key sits here
    looking healthy.  Never treat this file as proof of being signed in; ask
    the server (see cli._stored_key_is_live).

    Because it never expires, the file IS the credential.  Hence 0600, hence the
    key is never echoed back in any output.
"""

from __future__ import annotations

import json
import os
import stat
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

CONFIG_DIR_ENV = "THRIXEL_CONFIG_DIR"
DEFAULT_CONFIG_DIR = "~/.thrixel"
CREDENTIALS_FILENAME = "credentials.json"


@dataclass(frozen=True)
class Credentials:
    api_key: str
    api_base: str
    email: Optional[str] = None
    key_name: Optional[str] = None
    created_at: Optional[str] = None


def config_dir() -> Path:
    return Path(os.environ.get(CONFIG_DIR_ENV) or DEFAULT_CONFIG_DIR).expanduser()


def credentials_path() -> Path:
    return config_dir() / CREDENTIALS_FILENAME


def load() -> Optional[Credentials]:
    """Read stored credentials, or None if there are none to read.

    Never raises. A corrupt or unreadable file reads as "not logged in", which
    routes the caller to the login instructions instead of a stack trace.
    """
    path = credentials_path()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(data, dict):
        return None

    api_key = str(data.get("api_key") or "").strip()
    api_base = str(data.get("api_base") or "").strip().rstrip("/")
    if not api_key or not api_base:
        # api_base is required, not optional. A key minted against a local
        # backend must never be replayed at production, so the pair travels
        # together or not at all.
        return None

    return Credentials(
        api_key=api_key,
        api_base=api_base,
        email=data.get("email") or None,
        key_name=data.get("key_name") or None,
        created_at=data.get("created_at") or None,
    )


def save(
    *,
    api_key: str,
    api_base: str,
    email: Optional[str] = None,
    key_name: Optional[str] = None,
) -> Path:
    """Write credentials with owner-only permissions. Returns the path."""
    directory = config_dir()
    # Only set the mode on a directory WE create. Chmod-ing one that already
    # existed would be a side effect outside our remit: THRIXEL_CONFIG_DIR can
    # point anywhere, and silently turning someone's existing directory into
    # 0700 is not ours to do. The file's own 0600 is what protects the key;
    # the directory mode is defence in depth on top of it.
    existed = directory.exists()
    directory.mkdir(parents=True, exist_ok=True)
    if not existed:
        os.chmod(directory, stat.S_IRWXU)

    payload = {
        "api_key": api_key,
        "api_base": api_base.rstrip("/"),
        "email": email,
        "key_name": key_name,
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    path = directory / CREDENTIALS_FILENAME
    # Open with 0600 rather than writing first and chmod-ing after: the latter
    # leaves a window where the key is world-readable. O_TRUNC covers the
    # overwrite-on-re-login case. ``fdopen`` takes ownership of the fd and
    # closes it, including when the body raises.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, indent=2)
        fh.write("\n")
    # O_CREAT does not change the mode of a file that already existed, so a
    # re-login onto a loosely-permissioned file still ends up at 0600.
    os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    return path


def clear() -> bool:
    """Delete stored credentials. Returns True if a file was actually removed."""
    try:
        credentials_path().unlink()
        return True
    except OSError:
        return False
