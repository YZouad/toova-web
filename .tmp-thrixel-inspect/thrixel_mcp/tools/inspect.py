"""Reading back what exists — scene graph, job status, asset list."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ..app import get_client, image_tool, tool
from ..errors import ThrixelError
from ..jobs import display_name, fetch_thumbnails

# How many scene-graph lines to return before paging. Raised from 60 after a
# beta project's 65-part quadcopter was cut at exactly the four propellers and
# their group - the only parts that move, and the entire reason the asset was
# built with create_model rather than sculpt_model. The tool's one job is
# reporting node names, and it could not supply the names that mattered.
# 250 short lines is not a large payload; a model with more than that is
# genuinely worth paging through.
_MAX_NODES = 250

# Operations that run on the shared GPU lane. Their queue wait is a property of
# the whole fleet, not of the caller's concurrency slots, which is why an
# account reporting "room for 4 more" can still sit behind a long queue.
_GPU_OPERATIONS = {"detailer", "sculptor", "texture", "remesh", "rebake"}


class _Node:
    """One scene-graph entry, flattened out of the hierarchy."""

    __slots__ = ("depth", "name", "kind", "faces")

    def __init__(self, depth: int, name: str, kind: str, faces: int) -> None:
        self.depth = depth
        self.name = name
        self.kind = kind
        self.faces = faces

    def render(self, *, indent: bool) -> str:
        detail = f" - {self.faces:,} tris" if self.faces else ""
        pad = "  " * self.depth if indent else ""
        return f"{pad}{self.name} ({self.kind}){detail}"


def _flatten(node: dict[str, Any], depth: int, out: list[_Node]) -> None:
    """Collect EVERY node, unbounded.

    Truncation is a rendering decision now, not a collection one: cutting
    during the walk means the caller cannot know what it lost, and what it
    loses is whichever group happens to sort last rather than the least
    important thing.
    """
    out.append(_Node(depth, str(node.get("name", "?")), str(node.get("type", "?")),
                     int(node.get("faces") or 0)))
    for child in node.get("children") or []:
        _flatten(child, depth + 1, out)


def _parse_ts(value: Any) -> datetime | None:
    """Parse an API timestamp, tolerating a trailing Z and a missing zone."""
    if not isinstance(value, str) or not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _humanize(seconds: float) -> str:
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m {seconds % 60}s"
    return f"{seconds // 3600}h {(seconds % 3600) // 60}m"


def _elapsed(info: dict[str, Any]) -> str | None:
    """How long this submission has existed, as text."""
    created = _parse_ts(info.get("created_at"))
    if created is None:
        return None
    return _humanize((datetime.now(timezone.utc) - created).total_seconds())


@image_tool(
    title="Inspect a 3D model",
    description=(
        "Show what a model actually contains: its part names, per-part triangle "
        "counts, world bounds, and a rendered thumbnail.\n\n"
        "Call this before any operation that targets specific parts - "
        "thrixel_edit_model, thrixel_retexture_model and thrixel_reduce_triangles "
        "all take exact node names, and guessing them fails. Also use it to "
        "check a triangle budget before shipping an asset.\n\n"
        "Long models are paged rather than silently cut: if the scene graph does "
        "not fit, the listing switches to heaviest-first so what falls off the "
        "end is the least significant, and says how many were omitted. Use "
        "offset to page through the rest.\n\n"
        "Reports the exported up-axis, which is always y. If a pivot listing "
        "elsewhere looks Z-up, that is Thrixel's internal working space, not "
        "the file."
    ),
)
async def thrixel_inspect_model(
    submission_id: str,
    limit: int | None = None,
    offset: int = 0,
) -> Any:
    """List a model's scene graph and show its thumbnail.

    Args:
        submission_id: The model to inspect.
        limit: How many nodes to list, 1-1000. Omit for the default of 250,
            which fits almost every model in one call.
        offset: Skip this many nodes. Use it to page through a model whose
            listing did not fit; the response says how many there are.
    """
    client = get_client()
    info = await client.get_json(f"/{submission_id}/info")

    lines = [
        f'{display_name(info, "(unnamed)")}',
        f"status: {info.get('status')}  phase: {info.get('phase')}",
    ]

    if info.get("status") != "completed":
        lines.append("")
        lines.append("Not finished yet - the scene graph is only available once complete.")
        return "\n".join(lines)

    try:
        tree = await client.get_json(f"/{submission_id}/hierarchy")
    except ThrixelError as exc:
        lines.append(f"Could not read the scene graph: {exc.message}")
        return "\n".join(lines)

    nodes: list[_Node] = []
    _flatten(tree, 0, nodes)

    # Container nodes carry an aggregate count for everything beneath them, so
    # only leaves may be summed - see jobs.mesh_summary for the full argument.
    leaves = [n for n in nodes if n.kind == "Mesh" and n.faces]
    total = sum(n.faces for n in leaves)

    lines.append(f"total: {total:,} triangles across {len(leaves)} mesh parts")
    # Stated, not implied. A guarantee nobody prints gets replaced by a guess:
    # a beta project read Z-up pivot origins out of a group_parts listing,
    # concluded the GLBs were Z-up, wrote that into a source comment, and
    # carried the wrong belief for the project's entire life - with a
    # never-executed 'z' correction branch to prove it was never true.
    lines.append("up-axis: y (every Thrixel GLB is Y-up - no need to detect it)")

    # The origin is the contract for anything spawned, parented or socketed,
    # and until now nothing reported it - a beta project budgeted engine-side
    # work to derive it and re-measured it by hand for want of this line.
    if bounds := (tree.get("bounds") or None):
        mn, mx, size = bounds.get("min"), bounds.get("max"), bounds.get("size")
        if mn and mx and size:
            fmt = lambda v: ", ".join(f"{x:g}" for x in v)  # noqa: E731
            lines.append(f"bounds: min ({fmt(mn)})  max ({fmt(mx)})  size ({fmt(size)})")
            if not bounds.get("exact", True):
                lines.append(
                    "  (a part is rotated off-axis, so these are a conservative "
                    "outer bound - never smaller than the model, possibly a "
                    "little larger)"
                )

    cap = _MAX_NODES if limit is None else max(1, min(int(limit), 1000))
    start = max(0, int(offset))

    # Hierarchy while it fits, heaviest-first once it does not. Depth-first
    # order is the readable one, but it is also the order that decides the cut
    # by accident of position rather than by importance.
    paged = nodes[start:start + cap]
    hierarchical = start == 0 and len(nodes) <= cap
    if not hierarchical:
        ranked = sorted(nodes, key=lambda n: n.faces, reverse=True)
        paged = ranked[start:start + cap]

    lines.append("")
    lines.extend(n.render(indent=hierarchical) for n in paged)

    if not hierarchical:
        shown_to = start + len(paged)
        lines.append("")
        lines.append(
            f"Showing {start + 1}-{shown_to} of {len(nodes)} nodes, heaviest first "
            f"(the hierarchy does not fit, so indentation is dropped)."
        )
        if shown_to < len(nodes):
            lines.append(
                f"Call again with offset={shown_to} for the next {len(nodes) - shown_to}."
            )

    blocks: list[Any] = ["\n".join(lines)]
    blocks.extend(await fetch_thumbnails(submission_id))
    return blocks


@tool(
    title="Check a Thrixel job",
    description=(
        "Check whether a job has finished, and how long it has been running. "
        "Only needed for jobs submitted with wait=false - every other tool "
        "already waits and returns the finished asset.\n\n"
        "A job can sit at queued for a long time while your own concurrency "
        "cap still reports free slots: detail, sculpt, texture and rebake all "
        "share one GPU lane across the whole service, so your slots say nothing "
        "about how many jobs are ahead of yours. Waiting is normal. Resubmitting "
        "is not - it pays twice for the same asset."
    ),
)
async def thrixel_job_status(submission_id: str) -> str:
    """Report the current status of a submission.

    Args:
        submission_id: The job to check.
    """
    client = get_client()
    info = await client.get_json(f"/{submission_id}/info")
    status = info.get("status", "unknown")
    operation = info.get("operation")

    header = f"status: {status}"
    # Only while it is still pending. On a finished job the age of the row is
    # noise ("submitted 147h ago" on an asset from last week); while it is
    # queued it is the single number the caller is actually asking for.
    if status not in ("completed", "failed"):
        elapsed = _elapsed(info)
        if elapsed:
            header = f"{header}  (waiting {elapsed})"

    lines = [
        f'{display_name(info, "(unnamed)")}',
        header,
    ]
    if status == "failed":
        lines.append(info.get("error_message") or "No error detail was recorded.")
    elif status == "completed":
        lines.append(
            f"Done. Fetch it with thrixel_download('{submission_id}') or "
            f"inspect it with thrixel_inspect_model('{submission_id}')."
        )
    elif status == "processing":
        lines.append("Running now - a worker has picked it up. Check again shortly.")
    else:
        # Queued. Say what queued MEANS, because the alternative reading is
        # "wedged", and an agent that believes a paid job is wedged resubmits.
        lines.append("Waiting for a worker - not started yet.")
        if operation in _GPU_OPERATIONS:
            # Fetch the real number, and only here: this is the one moment the
            # answer changes what the caller should do, and it is exactly the
            # moment the per-account figure misleads them.
            ahead = None
            try:
                usage = await client.get_json("/usage")
                ahead = usage.get("gpu_lane_depth")
            except ThrixelError:
                pass
            if isinstance(ahead, int):
                lines.append(
                    f"{ahead} GPU job(s) queued or running across the whole "
                    f"service right now, including this one."
                )
            lines.append(
                "Detail, sculpt, texture, rebake and remesh all share one GPU "
                "lane, so a wait here is queue depth and not a stuck job - your "
                "own free concurrency slots say nothing about it. Do NOT "
                "resubmit; you would be charged twice for one asset."
            )
    return "\n".join(lines)


@tool(
    title="List Thrixel models",
    description=(
        "List models already in this Thrixel account, newest first. Use it to "
        "find and reuse an existing asset instead of generating a duplicate, or "
        "to recover a submission_id from an earlier session.\n\n"
        "Each row is: submission_id, what made it, status, date, name. A derived "
        "asset (a detail pass, an edit, a triangle reduction) also names the "
        "model it came from, so a chain can be walked back to its blockout.\n\n"
        "Names are short by design. Pass verbose=true to also print each asset's "
        "full prompt, which is far larger and rarely what you need."
    ),
)
async def thrixel_list_assets(
    limit: int = 20,
    search: str | None = None,
    verbose: bool = False,
) -> str:
    """List recent submissions.

    Args:
        limit: How many to return, 1-100.
        search: Optional text to match against model names.
        verbose: Also print each asset's full generation prompt. Off by
            default - a prompt can run to several hundred words, and twenty of
            them costs more context than the whole listing is worth.
    """
    client = get_client()
    limit = max(1, min(int(limit), 100))

    if search:
        payload = await client.get_json("/submissions/search", q=search, limit=limit)
    else:
        payload = await client.get_json("/submissions", limit=limit)

    items = payload.get("submissions") or []
    if not items:
        return "No models found." if not search else f"No models matching {search!r}."

    lines = []
    for item in items:
        # display_name is the SERVER's resolved label: it unpacks the JSON
        # parameter blob that derived rows store in `task`, walks the parent
        # chain when a row has no label of its own, and truncates. Deriving our
        # own from `nickname or slug or task` is what put raw 400-word prompts
        # and raw `{"mode": "filter_group", ...}` dicts in this column.
        name = item.get("display_name") or item.get("nickname") or item.get("slug")
        operation = item.get("operation") or f"phase {item.get('phase')}"
        created = _parse_ts(item.get("created_at"))
        when = created.strftime("%Y-%m-%d") if created else "unknown date"

        row = (
            f"{item.get('submission_id')}  {operation}  "
            f"{item.get('status')}  {when}  {name or '(unnamed)'}"
        )
        parent = item.get("parent_submission_id")
        if parent:
            row = f"{row}  (from {parent})"
        lines.append(row)

        if verbose and (prompt := item.get("prompt")):
            lines.append(f"    prompt: {prompt}")

    return "\n".join(lines)
