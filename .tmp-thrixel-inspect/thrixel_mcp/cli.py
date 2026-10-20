"""``thrixel-mcp login`` and friends - device-authorization sign-in.

The point of this command is that nobody copies a secret. It asks the backend
for a pair of codes, opens a browser at the approval page, waits, and writes the
key it gets back to ``~/.thrixel/credentials.json``. The human clicks Approve
once; that is the entire manual step.

Protocol is RFC 8628. Deliberately synchronous
and ``httpx.Client``-based: the package's own ``ThrixelClient`` is async and
freezes the auth header at construction, which is exactly wrong for a flow whose
premise is not having a key yet.

OUTPUT GOES TO STDERR. Under ``uvx thrixel-mcp`` stdout is the JSON-RPC channel;
these subcommands never serve, but keeping the discipline means a stray print
can never corrupt a session, and it matches the existing precedent in
``server.py``.
"""

from __future__ import annotations

import argparse
import os
import platform
import sys
import time
import webbrowser
from typing import Optional

import httpx

from . import __version__, credentials
from .config import DEFAULT_API_BASE, _clean_base

# Generous: the human may be signing up from scratch, on a phone, on hotel wifi.
# The backend expires the code at 600s and tells us so; this is only the ceiling
# on our own patience.
_MAX_WAIT_S = 900.0
_HTTP_TIMEOUT_S = 30.0


def _say(*lines: str) -> None:
    # flush explicitly. The sign-in link is printed and THEN the process blocks
    # for up to ten minutes waiting for approval, so anything that holds the
    # link in a buffer deadlocks the flow outright: nobody can approve a URL
    # they cannot see. Python's stderr is line-buffered anyway, but this path
    # fails silently when it goes wrong, which is worth one extra syscall.
    for line in lines:
        print(line, file=sys.stderr, flush=True)


def _quiet_http_logging() -> None:
    """Stop httpx narrating every request into the middle of the CLI output.

    ``server.py`` sets the root level to INFO at import for the server's sake,
    and httpx logs one INFO line per request. Useful in an MCP server log,
    noise in a sign-in prompt a human is reading.
    """
    import logging

    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)


def _client_name() -> str:
    """Name this machine, for the approval screen and the resulting key.

    Shown to the human as "what am I authorizing", so a hostname beats a UUID.
    Falls back to the platform when there is no useful hostname (containers
    often report a hex string, which is still better than nothing).
    """
    host = (platform.node() or "").strip()
    return host or platform.system() or "unknown device"


def _api_base(explicit: Optional[str]) -> str:
    import os
    return _clean_base(explicit or os.environ.get("THRIXEL_API_BASE") or DEFAULT_API_BASE)


def _rfc_error(response: httpx.Response) -> tuple[str, str]:
    """Pull the RFC 8628 ``error`` token and human sentence out of a 400."""
    try:
        detail = response.json().get("detail")
    except ValueError:
        return "", response.text[:200]
    if isinstance(detail, dict):
        return str(detail.get("error") or ""), str(detail.get("detail") or "")
    return "", str(detail or "")[:200]


def _poll_until_approved(
    http: httpx.Client, base: str, device_code: str, interval: int, deadline: float
) -> dict:
    """Poll for the key. Returns the success payload or raises SystemExit."""
    wait = float(interval)
    while True:
        if time.monotonic() > deadline:
            _say("", "Timed out waiting for approval. Run the command again when you are ready.")
            raise SystemExit(1)

        time.sleep(wait)
        response = http.post(f"{base}/api/v1/cli/device/poll", json={"device_code": device_code})
        if response.status_code == 200:
            return response.json()

        error, message = _rfc_error(response)
        if error == "authorization_pending":
            continue
        if error == "slow_down":
            # The server sets the pace; back off rather than arguing with it.
            wait += 2.0
            continue
        if error == "access_denied":
            _say("", "Sign-in was denied in the browser.")
            raise SystemExit(1)
        if error == "expired_token":
            _say("", "That sign-in request expired. Run the command again to get a new code.")
            raise SystemExit(1)

        _say("", f"Sign-in failed: {message or response.text[:200]}")
        raise SystemExit(1)


def _stored_key_is_live(base: str, api_key: str) -> Optional[bool]:
    """Ask the server whether the stored key still works.

    True = accepted, False = rejected, None = could not tell (network/server).

    A stored credential is NOT evidence of being signed in: the device flow
    revokes any existing key of the same name when it mints one, so a second
    login on any machine with the same hostname silently kills the first.
    Trusting the file alone reports "Already signed in" for a key the server
    has been rejecting for days.

    None stays distinct from False - "cannot reach the server" must not mean
    "your key is dead", or a flaky network forces a needless browser trip.
    """
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT_S, follow_redirects=True) as http:
            response = http.get(
                f"{base}/api/v1/validate", headers={"Authorization": f"Bearer {api_key}"}
            )
    except httpx.HTTPError:
        return None
    if response.status_code in (401, 403):
        return False
    if response.status_code != 200:
        return None
    try:
        return bool(response.json().get("valid"))
    except ValueError:
        return None


def _account_summary(http: httpx.Client, base: str, api_key: str) -> Optional[str]:
    """One line describing the account, for confirmation after sign-in.

    Best-effort: a summary that fails to load must not fail a sign-in that
    already succeeded.
    """
    try:
        response = http.get(
            f"{base}/api/v1/usage", headers={"Authorization": f"Bearer {api_key}"}
        )
        if response.status_code != 200:
            return None
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None

    parts = []
    plan = data.get("plan")
    if plan:
        parts.append(str(plan).capitalize())
    if data.get("is_unlimited"):
        parts.append("unlimited")
    else:
        balance = data.get("cubes_balance")
        if isinstance(balance, int):
            parts.append(f"{balance:,} cubes")
        cap = data.get("concurrent_job_cap")
        if isinstance(cap, int):
            parts.append(f"{cap} concurrent jobs")
    return "  ".join(f"{p}" for p in parts) if parts else None


def cmd_login(args: argparse.Namespace) -> int:
    base = _api_base(args.api_base)

    existing = credentials.load()
    if existing and not args.force:
        live = _stored_key_is_live(existing.api_base, existing.api_key)
        if live:
            _say(
                f"Already signed in ({existing.email or 'stored credentials'}) against {existing.api_base}.",
                "Use --force to sign in again, or 'thrixel-mcp logout' to remove the stored key.",
                "To switch to a DIFFERENT account, sign out on the website first - approval runs",
                "as whoever the browser is already signed in as.",
            )
            return 0
        if live is None:
            _say(
                f"Could not reach {existing.api_base} to check the stored key, so leaving it alone.",
                "If you know it is dead, run 'thrixel-mcp login --force'.",
            )
            return 0
        # Rejected. The user asked to log in, so log in - requiring --force
        # here was a dead end: the command the 401 sends you to answered
        # "Already signed in" and exited 0.
        _say(
            f"The stored key for {existing.email or 'this account'} is no longer accepted"
            " - it has been revoked.",
            "Signing in again now.",
            "",
        )

    if args.force and existing:
        # The trap this warns about: --force re-runs the flow, but approval
        # happens in a browser that is probably still signed in as the previous
        # account. Without signing out there, --force silently mints another key
        # for the SAME account and revokes the one it just replaced - it looks
        # like a failed account switch with no error anywhere.
        _say(
            f"Replacing the stored key for {existing.email or 'the current account'}.",
            "Switching accounts? Sign out at https://thrixel.com/create first, or the browser",
            "will approve this as the account it is already signed in as.",
        )

    with httpx.Client(timeout=_HTTP_TIMEOUT_S, follow_redirects=True) as http:
        try:
            response = http.post(
                f"{base}/api/v1/cli/device/start", json={"client_name": _client_name()}
            )
        except httpx.HTTPError as exc:
            _say(f"Could not reach Thrixel at {base} ({type(exc).__name__}).")
            return 1
        if response.status_code != 200:
            _say(f"Could not start sign-in: {response.text[:200]}")
            return 1

        start = response.json()
        user_code = start["user_code"]
        complete_url = start["verification_uri_complete"]
        interval = int(start.get("interval") or 5)

        _say(
            "",
            "  Open this link to finish signing in:",
            f"      {complete_url}",
            "",
            f"  Confirm the page shows this code:  {user_code}",
            "",
        )
        # Returns False on a headless box with no browser, which is fine: the
        # URL is already printed, and that is the path most agent users take.
        try:
            webbrowser.open(complete_url)
        except Exception:
            pass

        _say("  Waiting for approval...")
        deadline = time.monotonic() + _MAX_WAIT_S
        result = _poll_until_approved(http, base, start["device_code"], interval, deadline)

        api_key = result["api_key"]
        summary = _account_summary(http, base, api_key)

    email = result.get("email")
    path = credentials.save(
        api_key=api_key, api_base=base, email=email, key_name=result.get("key_name")
    )

    _say("", f"  Signed in as {email}." if email else "  Signed in.")
    # load_config prefers THRIXEL_API_KEY over the file, so a stale one makes
    # this sign-in change nothing while still looking like it worked.
    if os.environ.get("THRIXEL_API_KEY", "").strip():
        _say(
            "",
            "  WARNING: THRIXEL_API_KEY is set in this environment and takes",
            "  priority over the key just saved, so this sign-in will have no",
            "  effect until you remove it from your MCP client config.",
        )
    if summary:
        _say(f"    {summary}")
    _say(
        f"    Key '{result.get('key_name') or 'Thrixel CLI'}' saved to {path}",
        "",
        "  Register the server with your agent:",
        "",
        "      claude mcp add --scope user thrixel -- uvx thrixel-mcp@latest",
        "",
        "  No env vars needed - the key is read from the file above.",
        "",
    )
    return 0


def cmd_logout(_args: argparse.Namespace) -> int:
    if credentials.clear():
        _say(
            f"Removed {credentials.credentials_path()}.",
            "The key still EXISTS on your account and would keep working if copied elsewhere.",
            "Revoke it at https://thrixel.com/create/#settings/api-keys if you want it dead.",
            "To sign in as a different account, sign out on the website too, then run",
            "'thrixel-mcp login'.",
        )
    else:
        _say("No stored credentials to remove.")
    return 0


def cmd_status(_args: argparse.Namespace) -> int:
    import os

    # Lead with the version. "Which one am I running?" is the first question in
    # any support thread, and nothing could answer it from a shell before this.
    _say(f"thrixel-mcp {__version__}")

    env_key = os.environ.get("THRIXEL_API_KEY", "").strip()
    if env_key:
        _say(f"Using THRIXEL_API_KEY from the environment (overrides any stored key).")
        return 0

    stored = credentials.load()
    if stored is None:
        _say("Not signed in. Run 'thrixel-mcp login'.")
        return 1

    _say(
        f"Signed in against {stored.api_base}.",
        f"  key:  {stored.key_name or 'unnamed'}",
        f"  file: {credentials.credentials_path()}",
        f"  since: {stored.created_at or 'unknown'}",
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="thrixel-mcp",
        description="Thrixel MCP server. Run with no arguments to serve on stdio.",
    )
    # The one thing here that prints to stdout, deliberately. It is a value to
    # be read or piped, not a message, and `--version` exits long before we
    # would serve, so the JSON-RPC channel is never in play.
    parser.add_argument(
        "--version",
        action="version",
        version=f"thrixel-mcp {__version__}",
        help="Print the installed version and exit.",
    )
    sub = parser.add_subparsers(dest="command")

    login = sub.add_parser("login", help="Sign in and store an API key.")
    login.add_argument("--api-base", default=None, help="Backend to sign in against.")
    login.add_argument(
        "--force", action="store_true", help="Sign in again even if credentials exist."
    )
    login.set_defaults(func=cmd_login)

    logout = sub.add_parser("logout", help="Remove stored credentials.")
    logout.set_defaults(func=cmd_logout)

    status = sub.add_parser("status", help="Show which credentials would be used.")
    status.set_defaults(func=cmd_status)

    return parser


def dispatch(argv: list[str]) -> Optional[int]:
    """Run a subcommand if one was given.

    Returns the exit code, or None when there is no subcommand and the caller
    should fall through to serving on stdio.
    """
    if not argv:
        return None
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help(sys.stderr)
        return 2
    _quiet_http_logging()
    try:
        return args.func(args)
    except KeyboardInterrupt:
        _say("", "Cancelled.")
        return 130
