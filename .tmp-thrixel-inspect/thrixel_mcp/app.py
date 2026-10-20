"""Shared server instance and client accessor.

Lives apart from ``server.py`` so tool modules can import ``mcp`` without a
circular import back through the entry point.
"""

from __future__ import annotations

from typing import Any, Callable, TypeVar

from mcp.server.mcpserver import MCPServer

from . import __version__
from .client import ThrixelClient
from .config import Config, load_config

_CallableT = TypeVar("_CallableT", bound=Callable[..., Any])

INSTRUCTIONS = """\
Thrixel turns text and images into editable, game-ready 3D assets (GLB).

Start with thrixel_start_project, named after what is being built. It is free,
and everything generated afterwards is filed under it automatically, so one
game's assets stay findable as a set instead of joining one flat list. Reopen
an earlier game with thrixel_list_projects then
thrixel_start_project(project_id=...).

Typical pipeline for a game prop:
  thrixel_create_model  -> a rough, editable, multi-part mesh
  thrixel_detail_model  -> high-resolution geometry + PBR texture
  thrixel_reduce_triangles  -> cut the triangle count to a game budget (free)

Use thrixel_sculpt_model instead of create_model for organic, single-piece
subjects (creatures, characters, plants) or when starting from a photo.

Every job tool waits for completion by default, saves the GLB to disk, and
returns the file path plus a rendered thumbnail. Look at the thumbnail: if the
result is wrong, fix it with thrixel_edit_model or regenerate, rather than
carrying a bad asset forward. 

Cost and limits worth knowing before a big batch:
  - detail / sculpt / texture: a flat per-run price.
  - reduce_triangles / rebake: free.
  - create / edit / autofix: METERED on actual model usage, charged after the
    run. Usually tens of cubes, and a complex one can cost more than a flat
    operation. These are not free.
  - Concurrent jobs are capped per plan. Submitting past the cap returns an
    error naming your limit. Run batches in waves.
  - To reduce triangles on a model you already have, always use
    thrixel_reduce_triangles, never a second detail pass. It is free and faster.

For the actual numbers - plans, caps, fixed prices, top-up packs - call
thrixel_pricing, and thrixel_account_status for this account's balance and cap.
They read from the service, so they are current; anything quoted from memory
eventually is not.
"""


mcp: MCPServer = MCPServer(
    name="thrixel",
    title="Thrixel 3D",
    version=__version__,
    instructions=INSTRUCTIONS,
)


# ── Parameter descriptions ──────────────────────────────────────────────
#
# Google-style ``Args:`` blocks are what this codebase uses to document
# parameters, and none of it reaches the model on its own. The SDK builds each
# tool's input schema from the type annotations alone, so every parameter would
# otherwise ship with a bare {"type", "title"} and no description at all.
#
# That is not a cosmetic gap for this product. The tool descriptions are not
# documentation ABOUT the product, they are the entire interface to it, so
# anything written only in an ``Args:`` block is invisible to the one reader
# that matters - the decimation_target floor, the dest sandbox rule, what
# ``exclude`` does not do.
#
# Rather than convert 80 signatures to Annotated[..., Field(description=...)]
# and rely on everyone remembering it forever, the docstring stays the source of
# truth and is copied into the schema at registration. A tool added later
# inherits this by using the decorator, the same way it inherits everything
# else here.

_ARGS_HEADINGS = ("Args:", "Arguments:", "Parameters:")


def _docstring_params(doc: str | None) -> dict[str, str]:
    """Parse a Google-style ``Args:`` block into {name: description}.

    Continuation lines are joined, so a wrapped multi-line explanation arrives
    as one sentence rather than being truncated at the first newline.
    """
    if not doc:
        return {}
    lines = doc.expandtabs().splitlines()
    start = next((i for i, ln in enumerate(lines)
                  if ln.strip() in _ARGS_HEADINGS), None)
    if start is None:
        return {}

    body = lines[start + 1:]
    # The FIRST entry's indent defines the block, not the minimum across it:
    # a following section (Returns:, Raises:) sits at a SHALLOWER indent, so
    # taking the minimum would set the bar below every parameter line and
    # parse nothing at all.
    first = next((ln for ln in body if ln.strip()), None)
    if first is None:
        return {}
    base = len(first) - len(first.lstrip())

    out: dict[str, str] = {}
    current: str | None = None
    for raw in body:
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip())
        stripped = raw.strip()
        # A shallower line is a new section (Returns:, Raises:) and ends it.
        if indent < base:
            break
        if indent == base and ":" in stripped:
            name, _, rest = stripped.partition(":")
            name = name.split("(")[0].strip()
            if name.isidentifier():
                current = name
                out[current] = rest.strip()
                continue
        if current:
            out[current] = f"{out[current]} {stripped}".strip()
    return out


# Parameters that mean the same thing on every tool that takes them.
#
# These were copy-pasted into eight docstrings, and had already drifted: two
# incompatible wordings of `wait` were live at once. Since every copy is
# reproduced verbatim in the schema the model reads, a drifted copy is not a
# tidiness problem - it is one tool telling the agent something another tool
# denies. Defined once here; a tool that genuinely needs different wording
# still wins by documenting the parameter in its own Args block.
#
# Keep them SHORT. Each one is repeated in full for every tool that takes it,
# so a sentence added here costs its length times eight in the tool list every
# agent loads at startup.
_COMMON_PARAMS: dict[str, str] = {
    "dest": (
        "Where to save, relative to the output directory. A path ending in "
        '.glb is the file to write ("units/keep.glb"); anything else is a '
        'directory ("units"). Absolute paths are refused. Validated at '
        "submission, so a bad path costs nothing."
    ),
    "wait": (
        "Wait for completion (default). Set false to submit and return "
        "immediately with a submission_id to poll via thrixel_job_status. "
        "BATCH PATTERN: running several? Submit them all with wait=false, do "
        "other work, then poll. Stay within your concurrency cap, which "
        "thrixel_account_status reports."
    ),
    "project_id": (
        "Override the active project for this one call. Normally omit it - "
        "thrixel_start_project sets the destination once."
    ),
}


def _describe_params(fn: Callable[..., Any]) -> None:
    """Copy a function's documented Args onto its registered tool schema.

    Anything the docstring does not document falls back to _COMMON_PARAMS, so
    the shared parameters do not have to be restated in every tool.
    """
    registered = mcp._tool_manager._tools.get(getattr(fn, "__name__", ""))
    if registered is None:
        return
    described = _docstring_params(getattr(fn, "__doc__", None))
    props = (registered.parameters or {}).get("properties") or {}
    for name, spec in props.items():
        text = described.get(name) or _COMMON_PARAMS.get(name)
        if text:
            spec["description"] = text


def tool(**kwargs: Any) -> Callable[[_CallableT], _CallableT]:
    """Register a tool, with its Args: block copied into the schema."""
    def decorator(fn: _CallableT) -> _CallableT:
        result = mcp.tool(**kwargs)(fn)
        _describe_params(fn)
        return result
    return decorator


def image_tool(**kwargs: Any) -> Callable[[_CallableT], _CallableT]:
    """Register a tool whose result contains a rendered thumbnail.

    Identical to ``mcp.tool`` except that structured output is switched off.
    It has to be, because the SDK cannot serialize an ``Image``:

    ``convert_result`` builds the reply twice - unstructured content, which
    knows about the ``Image`` helper and converts it to an ``ImageContent``
    block, and structured content, which re-validates the RAW return value
    into a pydantic model and dumps it as JSON. ``Image`` is a plain class,
    not a pydantic model, so that dump raises
    ``PydanticSerializationError: Unable to serialize unknown type`` and the
    exception discards the perfectly good unstructured content with it. The
    whole call fails AFTER the tool body has run, so the job is generated and
    the cubes are spent while the agent is told only that the call errored -
    the worst shape a failure can take.

    Nothing here is hypothetical. The tools survive today purely because they
    are annotated ``-> Any``, which the SDK declines to build a schema for.
    Annotate one honestly as ``-> list[Any]`` - which is exactly what
    ``jobs.deliver`` returns - and it starts crashing immediately. That makes
    the loose annotation load-bearing, and a load-bearing annotation nobody
    knows about is a trap; this decorator is what actually holds the
    invariant, so tightening the annotations later stays safe.

    Structured output costs us nothing to give up: these tools return prose
    for the agent to read plus a picture for it to look at, and neither has a
    machine-readable shape a caller could bind to.

    ``tests/test_image_tools.py`` fails if a thumbnail-returning tool is
    registered with the plain decorator instead.
    """
    return tool(structured_output=False, **kwargs)


_client: ThrixelClient | None = None
_config: Config | None = None


def get_config() -> Config:
    """Return the process-wide config, loading it on first use."""
    global _config
    if _config is None:
        _config = load_config()
    return _config


def get_client() -> ThrixelClient:
    """Return the process-wide HTTP client, creating it on first use.

    One client for the process so connections are pooled across tool calls.
    Safe to build lazily: httpx does not touch the event loop until a request
    is actually issued.
    """
    global _client
    if _client is None:
        _client = ThrixelClient(get_config())
    return _client


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
