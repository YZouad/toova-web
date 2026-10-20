"""Thrixel MCP server — text and images to editable, game-ready 3D assets."""

from importlib.metadata import PackageNotFoundError, version as _version

try:
    # Single source of truth is pyproject.toml; reading it back at runtime
    # keeps the version the server reports over MCP from drifting away from
    # the version that was actually released.
    __version__ = _version("thrixel-mcp")
except PackageNotFoundError:  # running from a source tree, not installed
    __version__ = "0+unknown"

__all__ = ["__version__"]
