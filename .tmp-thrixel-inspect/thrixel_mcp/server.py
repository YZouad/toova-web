"""Entry point — validates the environment, registers tools, serves on stdio."""

from __future__ import annotations

import logging
import os
import sys

from .config import ConfigError, load_config

# stderr, never stdout: stdout is the JSON-RPC channel and anything written
# there corrupts the protocol stream.  MCP clients surface stderr in their
# server logs, which is where you look when a tool call misbehaves.
logging.basicConfig(
    level=os.environ.get("THRIXEL_LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    stream=sys.stderr,
)
logger = logging.getLogger("thrixel-mcp")


def main() -> None:
    """Console-script entry point (``thrixel-mcp``).

    No arguments means serve on stdio, which is how every MCP client launches
    us. A subcommand (``login`` / ``logout`` / ``status``) runs and exits.

    Dispatch happens BEFORE ``load_config()`` on purpose: that call is fatal
    when no API key exists, and ``login`` is the command whose whole job is to
    create one. Checking config first would make it impossible to run.
    """
    from .cli import dispatch

    exit_code = dispatch(sys.argv[1:])
    if exit_code is not None:
        raise SystemExit(exit_code)

    # Serve even with no credentials, and do NOT let a missing key be fatal.
    #
    # An MCP client loads its servers once, at session start. Exiting here meant
    # a user who had not logged in yet got no thrixel tools for that entire
    # session, and after `thrixel-mcp login` they still had to restart the client
    # to pick them up. For an agent mid-build that means writing a handoff note
    # and starting over. Staying up removes the restart completely: get_config()
    # resolves lazily on the first tool call and does not cache a failure, so the
    # next call after login succeeds in the same session.
    #
    # A tool called before login still fails, but with the actionable ConfigError
    # ("run thrixel-mcp login") rather than the tool not existing at all.
    try:
        target = load_config().api_base
    except ConfigError as exc:
        target = "no credentials yet - run 'thrixel-mcp login'"
        logger.warning("thrixel-mcp starting without credentials: %s", exc)

    from .app import mcp
    from . import tools  # noqa: F401 — import registers every tool

    logger.info("thrixel-mcp serving on stdio against %s", target)
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
