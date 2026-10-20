"""Configuration, from the environment or from stored credentials.

An MCP client launches us as a subprocess, so env vars are the only channel it
has for configuration.  But requiring the API key there means a human pastes a
secret into a config file by hand, which is the step ``thrixel-mcp login``
exists to delete.  So the key resolves from the environment FIRST and falls back
to ``~/.thrixel/credentials.json``, letting the registration command carry no
secret at all:

    claude mcp add --scope user thrixel -- uvx thrixel-mcp@latest
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from . import credentials

DEFAULT_API_BASE = "https://api.thrixel.com"
DEFAULT_OUTPUT_DIR = "./thrixel_assets"

# How to get a key, single-sourced so the startup error, the auth-failure
# message, and the README cannot drift apart.  Login leads because it is one
# command with nothing to copy; the dashboard stays as the manual fallback, with
# the exact button label because "Account -> API keys" was too vague to act on.
API_KEYS_URL = "https://thrixel.com/create/#settings/api-keys"
# Opens the plan picker directly. Used wherever the offer is mentioned
# unprompted, in place of a Stripe link nobody asked for.
PRICING_URL = "https://thrixel.com/create/#upgrade"
API_KEYS_HINT = (
    "Run 'uvx thrixel-mcp@latest login' to sign in and store a key. The same "
    "command also repairs a revoked key, on its own. "
    f"Alternatively create one at {API_KEYS_URL} and click 'Create new secret key'."
)

# Ceiling for a single in-server wait.  Longest job we've measured is the
# autofix / remesh pair at ~175s wall (143s of that queue time), so 600s leaves
# generous headroom for a cold GPU worker without hanging a client forever.
DEFAULT_TIMEOUT_S = 600.0


class ConfigError(RuntimeError):
    """Raised when the server cannot start with the given environment."""


@dataclass(frozen=True)
class Config:
    api_key: str
    api_base: str
    output_dir: Path
    timeout_s: float
    # "env" (THRIXEL_API_KEY) or "file" (stored by login). The remedy for a
    # rejected key differs between the two - see the 401 in errors.py.
    key_source: str = "file"

    @property
    def is_local(self) -> bool:
        """True when pointed at a dev backend rather than production."""
        return "localhost" in self.api_base or "127.0.0.1" in self.api_base


def _clean_base(raw: str) -> str:
    return raw.strip().rstrip("/")


def load_config() -> Config:
    """Read config from the environment, falling back to stored credentials.

    Raises:
        ConfigError: if no API key can be found in either place.
    """
    api_key = os.environ.get("THRIXEL_API_KEY", "").strip()
    env_base = os.environ.get("THRIXEL_API_BASE")

    if api_key:
        key_source = "env"
        api_base = _clean_base(env_base or DEFAULT_API_BASE)
    else:
        key_source = "file"
        stored = credentials.load()
        if stored is None:
            raise ConfigError(f"No Thrixel API key found. {API_KEYS_HINT}")
        api_key = stored.api_key
        # The stored key belongs to the backend it was minted against, so the
        # pair travels together. An explicit THRIXEL_API_BASE still wins, which
        # is what lets a dev point a stored prod key at a local backend on
        # purpose; the accident this prevents is doing so silently.
        api_base = _clean_base(env_base or stored.api_base)

    raw_timeout = os.environ.get("THRIXEL_TIMEOUT_S")
    try:
        timeout_s = float(raw_timeout) if raw_timeout else DEFAULT_TIMEOUT_S
    except ValueError:
        raise ConfigError(
            f"THRIXEL_TIMEOUT_S must be a number, got {raw_timeout!r}."
        ) from None
    if timeout_s <= 0:
        raise ConfigError("THRIXEL_TIMEOUT_S must be greater than 0.")

    output_dir = Path(
        os.environ.get("THRIXEL_OUTPUT_DIR") or DEFAULT_OUTPUT_DIR
    ).expanduser()

    return Config(
        api_key=api_key,
        api_base=api_base,
        output_dir=output_dir,
        key_source=key_source,
        timeout_s=timeout_s,
    )
