"""Submit -> wait -> download, the cycle every generation tool shares.

Waiting happens *inside the server*.  When the agent drives the API directly it
has to write its own poll loop, and over a long unattended run that loop is
where things quietly go wrong: it forgets to poll, gives up early, and moves on
leaving the step half-done.  Doing it here makes one tool call equal one
finished asset.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx
from mcp.server.mcpserver import Context, Image

from . import project
from .app import get_client, get_config
from .client import ThrixelClient
from .errors import ThrixelError
from .files import check_dest, human_size, save_asset, shrink_thumbnail, slugify
from .progress import ProgressReporter

TERMINAL = {"completed", "failed"}

# error_code -> what the agent should DO about it. Keyed on the backend's
# stable codes (see its /info schema), never on the prose, which we reserve
# the right to reword. Codes with no entry get no advice - a wrong next step
# is worse than none.
_FAILURE_NEXT_STEP = {
    "CONTENT_BLOCKED": (
        "Do NOT resubmit this prompt unchanged - it will be blocked again. "
        "Rewrite the subject in your own words: a recognisable character from "
        "a film, game or franchise is the usual cause, and so is a distinctive "
        "combination of that character's colours and silhouette. Describe the "
        "generic object instead, or change the palette."
    ),
    "INVALID_IMAGE": (
        "The input image could not be used. Check it is a readable PNG/JPEG "
        "with the subject visible, then submit again."
    ),
    "LLM_RATE_LIMITED": "Transient - wait a minute and submit again.",
    "LLM_OVERLOADED": "Transient - wait a minute and submit again.",
    "LLM_CONNECTION_ERROR": "Transient - wait a minute and submit again.",
    "LLM_SERVER_ERROR": "Transient - wait a minute and submit again.",
    "CANCELLED_BY_USER": (
        "This job was cancelled on purpose. Do NOT resubmit it unless the user "
        "asks - resubmitting would pay for something they chose to stop."
    ),
    "TASK_LOST": "Infrastructure hiccup, not your input - submit the same job again.",
    "NEVER_DISPATCHED": "Infrastructure hiccup, not your input - submit the same job again.",
}

# Poll cadence for the fallback path.  Tight at first because CPU jobs finish
# in ~25s, then relaxed - a GPU job that has been queued 2 minutes will not
# finish in the next 2 seconds, and hammering /info buys nothing.
_POLL_RAMP = ((30.0, 2.0), (120.0, 5.0))
_POLL_SLOW_S = 10.0

# Phase -> the filename suffix the API itself uses for downloads, so files
# land with names that match what the web app shows.
_PHASE_LABEL = {1: "rough", 2: "fixed", 3: "edited", 4: "detailed", 5: "uploaded"}


@dataclass
class JobResult:
    submission_id: str
    status: str
    info: dict[str, Any] = field(default_factory=dict)
    error: str | None = None
    # The project this submission was actually filed under, which is not always
    # the active one - an explicit project_id wins. Recorded at submit time so
    # deliver() can report it instead of inferring it.
    project_id: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "completed"


def _poll_interval(elapsed: float) -> float:
    for threshold, interval in _POLL_RAMP:
        if elapsed < threshold:
            return interval
    return _POLL_SLOW_S


async def _wait_via_stream(
    client: ThrixelClient,
    submission_id: str,
    ctx: Context | None,
    timeout_s: float,
) -> str | None:
    """Follow the SSE progress stream. Returns the terminal status, or None.

    None means "could not follow the stream" - the caller should fall back to
    polling.  The endpoint emits a heartbeat every 30s, so a long queue wait
    will not be mistaken for a dead connection.
    """
    url = f"{client.config.api_base}/api/v1/{submission_id}/stream"

    try:
        async with ProgressReporter(ctx) as bar:
            async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_s, read=90.0)) as raw:
                async with raw.stream("GET", url) as response:
                    if response.status_code != 200:
                        return None
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            event = json.loads(line[5:].strip())
                        except json.JSONDecodeError:
                            continue

                        status = event.get("status")
                        if status in TERMINAL:
                            if status == "completed":
                                await bar.finish()
                            return status

                        await bar.observe(
                            event.get("progress"),
                            event.get("progress_message") or None,
                        )
    except Exception:
        return None
    return None


async def _wait_via_polling(
    client: ThrixelClient,
    submission_id: str,
    ctx: Context | None,
    timeout_s: float,
) -> str:
    """Poll /info until terminal or timeout. Authoritative but progress-free."""
    loop = asyncio.get_running_loop()
    started = loop.time()

    # No progress field on /info, so the only signal available is elapsed time.
    # The reporter still smooths and caps it, and still refuses to show 100%
    # until the job genuinely completes.
    async with ProgressReporter(ctx) as bar:
        while True:
            info = await client.get_json(f"/{submission_id}/info")
            status = info.get("status", "unknown")
            if status in TERMINAL:
                if status == "completed":
                    await bar.finish()
                return status

            elapsed = loop.time() - started
            if elapsed > timeout_s:
                return "timeout"

            await bar.observe(min(90.0, elapsed / timeout_s * 100), status)
            await asyncio.sleep(_poll_interval(elapsed))


async def submit_and_wait(
    path: str,
    payload: dict[str, Any],
    *,
    ctx: Context | None = None,
    wait: bool = True,
    timeout_s: float | None = None,
    dest: str | None = None,
) -> JobResult:
    """POST a submission and, unless told otherwise, wait for it to finish."""
    client = get_client()
    limit = timeout_s or get_config().timeout_s

    # Validate the write destination BEFORE anything is queued or charged.
    # Same argument as the project_id defaulting below: this is the single
    # path every submission takes, so a tool added later inherits the check
    # without knowing about it - which is the actual fix for F1. The check
    # living in the write path meant a bad dest was only discovered after
    # ~120s of GPU work had been done and billed.
    try:
        check_dest(get_config(), dest)
    except ValueError as exc:
        raise ThrixelError(f"{exc} Nothing was submitted, so nothing was charged.") from exc

    # File under the session's project unless the caller named one. This lives
    # here rather than in each tool because it is the single path every
    # submission takes, so a tool added later inherits it without knowing about
    # it. A falsy value covers both "key absent" and the explicit None the
    # tools pass when the argument was omitted.
    if not payload.get("project_id"):
        default_project = project.active_id()
        if default_project:
            payload = {**payload, "project_id": default_project}
    filed_under = payload.get("project_id")

    created = await client.post_json(path, payload)
    submission_id = created.get("submission_id")
    if not submission_id:
        raise ThrixelError(f"Thrixel accepted the request but returned no submission_id: {created}")

    if not wait:
        return JobResult(
            submission_id=submission_id,
            status=created.get("status", "queued"),
            project_id=filed_under,
        )

    status = await _wait_via_stream(client, submission_id, ctx, limit)
    if status is None:
        status = await _wait_via_polling(client, submission_id, ctx, limit)

    # /info is the source of truth: the stream can close on a race and we would
    # rather re-read than report a stale status.
    info: dict[str, Any] = {}
    try:
        info = await client.get_json(f"/{submission_id}/info")
        status = info.get("status", status)
    except ThrixelError:
        pass

    error = None
    if status == "failed":
        error = info.get("error_message") or "Thrixel reported the job as failed."
        # A retry is only worth suggesting when retrying could work. The
        # distinction matters most for CONTENT_BLOCKED: an agent told just
        # "failed" resubmits the same prompt (observed in production, the same
        # blocked prompt twice five minutes apart), which cannot ever succeed
        # and burns the user's cubes. The backend's own code is the authority
        # on which kind of failure this was; an unknown code says nothing
        # rather than guessing.
        code = info.get("error_code")
        hint = _FAILURE_NEXT_STEP.get(code or "")
        if hint:
            error = f"{error} {hint}"
    elif status == "timeout":
        error = (
            f"Still running after {limit:.0f}s. The job was not cancelled - "
            f"check it later with thrixel_job_status('{submission_id}')."
        )

    return JobResult(
        submission_id=submission_id,
        status=status,
        info=info,
        error=error,
        project_id=filed_under,
    )


# ── result delivery ─────────────────────────────────────────────────────


def _metadata_blob(text: str | None) -> dict[str, Any] | None:
    """Return the parsed blob when `task` holds machine metadata, else None.

    Derived jobs (filter, remesh, rebake, detailer) store their parameters as
    JSON in `task` rather than a human label.  Mirrors how the service itself
    detects that blob — using the raw field as a name produces both an
    unreadable label and an unusable filename.
    """
    if not text or not text.strip().startswith("{"):
        return None
    try:
        parsed = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def job_metadata(info: dict[str, Any]) -> dict[str, Any]:
    """Machine metadata a derived job recorded on itself, or {}.

    Filter / remesh / detailer submissions store their parameters and outcome
    as JSON in ``task``; this is how a tool learns what the backend actually
    did, as opposed to what was asked of it.
    """
    payload = info.get("input") or {}
    return _metadata_blob(payload.get("task")) or {}


def display_name(info: dict[str, Any], fallback: str) -> str:
    """Best human label for a submission, without extra requests."""
    nickname = info.get("nickname")
    if nickname:
        return str(nickname)

    payload = info.get("input") or {}
    task = payload.get("task")
    blob = _metadata_blob(task)
    if blob is not None:
        # Derived jobs carry the originating prompt alongside their params.
        parent_task = blob.get("parent_task")
        if parent_task:
            return str(parent_task)
        task = None

    for value in (task, payload.get("modification_request")):
        if value:
            return str(value)
    return fallback


async def resolve_name(
    client: ThrixelClient, info: dict[str, Any], fallback: str, *, max_hops: int = 4
) -> str:
    """Like display_name, but walks up the chain when the row has no label.

    A remesh of a detail of an edit carries no prompt of its own, so the name
    that makes sense on disk is the one from the asset it descends from.
    """
    resolved = display_name(info, "")
    if resolved:
        return resolved

    parent_id = info.get("parent_submission_id")
    for _ in range(max_hops):
        if not parent_id:
            break
        try:
            parent = await client.get_json(f"/{parent_id}/info")
        except ThrixelError:
            break
        resolved = display_name(parent, "")
        if resolved:
            return resolved
        parent_id = parent.get("parent_submission_id")

    return fallback


async def download_glb(
    submission_id: str,
    *,
    stem: str,
    phase: int | None = None,
    dest: str | None = None,
) -> tuple[Path, int]:
    """Fetch the finished GLB and write it into the output directory."""
    client = get_client()
    content, _ = await client.get_bytes(f"/{submission_id}/download", format="glb")
    label = _PHASE_LABEL.get(phase or 0)
    full_stem = f"{stem}-{label}" if label else stem
    path = save_asset(get_config(), content, stem=full_stem, suffix=".glb", dest=dest)
    return path, len(content)


# Report the heaviest part only when the split is lopsided enough to be news.
# On a two-part model "the bigger one is bigger" is not information; at a third
# of the budget in one decorative label it very much is.
_HEAVY_PART_SHARE = 0.15
_HEAVY_PART_MIN_PARTS = 3


async def mesh_scene(submission_id: str) -> tuple[dict[str, int], dict[str, Any] | None]:
    """(leaf mesh name -> triangles, world bounds) from ONE scene-graph read.

    Both facts come out of the same response, and that response is not cheap on
    the server - it fetches and parses the GLB. Asking twice for two halves of
    one payload would double that for nothing.
    """
    client = get_client()
    try:
        tree = await client.get_json(f"/{submission_id}/hierarchy")
    except ThrixelError:
        return {}, None

    # Count ONLY leaf meshes. Container nodes can carry an AGGREGATE face
    # count for everything beneath them - the "Scene" root reports the whole
    # model's total - so summing every node that has `faces` counts the model
    # twice. That made every tool report roughly double the real triangle
    # budget, which is the number an agent sizes a game asset against.
    parts: dict[str, int] = {}

    def walk(node: dict[str, Any]) -> None:
        if node.get("type") == "Mesh" and node.get("faces"):
            # Duplicate names are possible in a GLB; accumulate rather than
            # overwrite so the total stays right either way.
            name = str(node.get("name") or "(unnamed)")
            parts[name] = parts.get(name, 0) + int(node["faces"])
        for child in node.get("children", []) or []:
            walk(child)

    walk(tree)
    return parts, tree.get("bounds")


def describe_origin_shift(
    before: dict[str, Any] | None,
    after: dict[str, Any] | None,
) -> str | None:
    """One line when an operation moved the model relative to its origin.

    The origin is the CONTRACT for anything that gets spawned, parented or
    socketed, and it is derived from the model's lowest geometry - so deleting
    a part at the bottom translates the whole asset and nothing says so. A beta
    project measured a 0.385 shift in Z from one edit that removed a drone's
    landing gear; the drone did not become asymmetric, it moved. An integrator
    who had computed an offset against the previous version now has a wrong
    number, with no error and nothing suggesting a re-measure.
    """
    if not before or not after:
        return None
    try:
        b, a = before["center"], after["center"]
        delta = [a[i] - b[i] for i in range(3)]
    except (KeyError, IndexError, TypeError):
        return None

    # Below this it is rounding, not a move.
    if max(abs(d) for d in delta) < 0.005:
        return None

    axes = ", ".join(
        f"{name}{d:+.4f}" for name, d in zip("XYZ", delta) if abs(d) >= 0.0005
    )
    return (
        f"ORIGIN MOVED: the model shifted {axes} relative to its origin. "
        f"The export anchors on the model's lowest geometry, so changing what "
        f"is lowest moves everything. Re-measure any offset, socket or spawn "
        f"point you derived from the previous version."
    )


async def mesh_parts(submission_id: str) -> dict[str, int]:
    """Leaf mesh name -> triangle count. See ``mesh_scene``."""
    parts, _ = await mesh_scene(submission_id)
    return parts


def summarize_parts(parts: dict[str, int]) -> list[str]:
    """The triangle-budget lines for a job result.

    Two lines, because they answer different questions. The total decides
    whether the asset can ship; the heaviest part decides whether the total is
    going where you think. A beta drone reported "6,020 triangles across 65
    mesh parts", which reads healthy - 1,972 of them were in a battery-bay
    label nobody asked for, 6mm across and invisible in play. Same measurement,
    and only one of the two readings shows the problem.
    """
    faces = sum(parts.values())
    if not faces:
        return []

    lines = [
        f"{faces:,} triangles across {len(parts)} mesh part"
        f"{'s' if len(parts) != 1 else ''}"
    ]

    ranked = sorted(parts.items(), key=lambda kv: kv[1], reverse=True)
    top_name, top_faces = ranked[0]
    if len(parts) >= _HEAVY_PART_MIN_PARTS and top_faces / faces >= _HEAVY_PART_SHARE:
        heaviest = ", ".join(
            f"{n} {f:,} ({f / faces:.0%})" for n, f in ranked[:3]
        )
        lines.append(f"heaviest: {heaviest}")
    return lines


def expects_parts_to_survive(info: dict[str, Any]) -> bool:
    """Was this operation supposed to keep the source model's parts?

    Without this the warning fires on a deliberate choice. A detail pass with
    preserve_parts=False returns ONE merged mesh by design, so every input part
    is legitimately absent; shouting "77 parts lost" at the caller who asked
    for exactly that teaches them to ignore the line, and the line only exists
    for the case where it is true.

    The backend records the RESOLVED value on the submission (omitted means
    "server decides": on at adherence 9, off below it), so this reads what
    actually ran rather than what was passed.
    """
    operation = info.get("operation")
    if operation == "remesh":
        # Remesh re-topologises an existing result; it has no merge mode.
        return True
    if operation == "detailer":
        return job_metadata(info).get("preserve_parts") is True
    return False


def describe_part_loss(
    before: dict[str, int],
    after: dict[str, int],
    *,
    source_id: str | None = None,
) -> str | None:
    """One line naming the parts an operation deleted, or None if it kept them.

    This is the whole point of the round trip. A detail pass rebuilds geometry
    and can drop an input part entirely; on a measured beta asset 78 parts went
    in, 28 came out, and the 54 that vanished included two of the four
    propellers - on a model built with create_model specifically BECAUSE the
    propellers had to move. Nothing said so. The returned thumbnail was a
    single three-quarter view that did not show it, the step is irreversible,
    and the loss was only found by hand-parsing the GLB.

    Named, not counted: "54 dropped" sends the agent back to the GLB, which is
    the situation this exists to end.
    """
    if not before or not after:
        return None
    lost = [n for n in before if n not in after]
    if not lost:
        return None

    shown = ", ".join(sorted(lost)[:8])
    tail = f", and {len(lost) - 8} more" if len(lost) > 8 else ""
    where = f" ({source_id})" if source_id else ""
    return (
        f"PARTS LOST: {len(before)} in, {len(after)} out, {len(lost)} dropped - "
        f"{shown}{tail}. This result cannot be edited, so the parts cannot be "
        f"put back into it; they are still in the source model{where}."
    )


async def fetch_thumbnails(submission_id: str) -> list[Image]:
    """Front and back preview, whichever of the two exist.

    Two views rather than one because three separate reported defects were
    invisible ONLY from the front: garbage baked onto the inward face of a
    single-sided cloak, seams torn open between adjacent roof meshes, and a
    propeller deleted outright. In each case the agent inspected the returned
    thumbnail exactly as the docs instruct, approved the asset, and the user
    found the damage later. A back view is not extra polish here, it is the
    difference between an approval that means something and one that does not.

    The back view only exists for models rendered since it shipped, so its
    absence is normal and never an error.
    """
    shots: list[Image] = []
    for fmt in ("thumbnail", "thumbnail_back"):
        picture = await _fetch_view(submission_id, fmt)
        if picture is not None:
            shots.append(picture)
    return shots


async def _fetch_view(submission_id: str, fmt: str) -> Image | None:
    client = get_client()
    fetched = await client.try_get_bytes(f"/{submission_id}/download", format=fmt)
    if fetched is None:
        return None
    data, image_format = shrink_thumbnail(fetched[0])
    return Image(data=data, format=image_format)


async def mesh_summary(submission_id: str) -> str | None:
    """One line of triangle budget info, or None if unavailable.

    Kept for callers that want only the headline; ``summarize_parts`` is the
    fuller form used by ``deliver``.
    """
    lines = summarize_parts(await mesh_parts(submission_id))
    return lines[0] if lines else None


async def deliver(
    result: JobResult,
    *,
    verb: str,
    fallback_name: str,
    next_step: str,
    dest: str | None = None,
) -> list[Any]:
    """Turn a finished job into the tool's return value.

    Always returns text first, then the thumbnail, so a client that renders
    only the first block still shows something useful.
    """
    if not result.ok:
        raise ThrixelError(
            result.error or f"Job {result.submission_id} ended as '{result.status}'."
        )

    info = result.info
    name = await resolve_name(get_client(), info, fallback_name)
    phase = info.get("phase")
    stem = slugify(name, fallback_name)

    try:
        path, size = await download_glb(
            result.submission_id, stem=stem, phase=phase, dest=dest
        )
    except Exception as exc:
        # The job SUCCEEDED; only the local delivery failed. From the client
        # side an errored tool call is indistinguishable from a job that never
        # ran, and an agent that cannot tell those apart resubmits - paying a
        # second time for a model it already owns. So say which one this is,
        # and name the command that retrieves it.
        raise ThrixelError(
            f"The model was generated successfully and you have already been "
            f"charged for it - only writing it to disk failed ({exc}). "
            f"Do NOT resubmit. Retrieve it with "
            f"thrixel_download(submission_id='{result.submission_id}')."
        ) from exc

    lines = [
        f'{verb} "{name}"',
        f"Saved: {path} ({human_size(size)})",
        f"submission_id: {result.submission_id}",
    ]
    parts, bounds = await mesh_scene(result.submission_id)
    lines.extend(summarize_parts(parts))

    # Compare against the source model when the operation could have deleted a
    # part. Costs one extra scene-graph read, and only on the operations that
    # rebuild geometry. Worth it: the loss is silent, the single returned
    # thumbnail does not show it, and the step cannot be undone - so the
    # alternative to this line is the agent shipping a broken asset it approved
    # in good faith.
    parent_id = info.get("parent_submission_id")
    if parent_id and (parts or bounds):
        checking_parts = bool(parts) and expects_parts_to_survive(info)
        # An edit or an auto-fix can silently re-origin the whole model; a
        # detail pass can silently delete parts. Both need the parent's scene
        # graph, so fetch it once and answer whichever question applies.
        checking_origin = info.get("operation") in ("edit", "autofix")
        if checking_parts or checking_origin:
            before_parts, before_bounds = await mesh_scene(parent_id)
            if checking_parts:
                loss = describe_part_loss(before_parts, parts, source_id=parent_id)
                if loss:
                    lines.append(loss)
            if checking_origin:
                moved = describe_origin_shift(before_bounds, bounds)
                if moved:
                    lines.append(moved)

    # Say where it landed. A silent default is the thing that makes a wrong one
    # expensive: the agent has no way to notice until the user opens the web app.
    filed = project.describe(result.project_id)
    if filed:
        lines.append(f"Filed under project: {filed}")
    if next_step:
        lines.append("")
        lines.append(next_step)

    blocks: list[Any] = ["\n".join(lines)]
    blocks.extend(await fetch_thumbnails(result.submission_id))
    return blocks
