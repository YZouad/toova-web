"""2D images — the Image Hub, which the tool surface did not admit existed.

The finding this closes is not "a feature is missing", it is that the server
was WRONG about the product. Asked for a concept sheet, an agent searched these
tools, found that every one of them returns a GLB, and told its user twice in
writing that "Thrixel has no 2D image tool" - while that account's Image Hub
held ten images the session had generated and paid for as a side effect of its
mesh jobs. An agent's only model of a service is its tool list, so "absent from
the list" and "does not exist" are the same sentence from inside it.

It also inverts the intended workflow. Concept-first is how art direction
normally works: agree the 2D, then commit to geometry. With no image tool the
only way to iterate on a look was to generate meshes at 40-47 cubes each, and
that is exactly what the beta session did - two full sculpt boards spent
settling a style question a few images would have answered.
"""

from __future__ import annotations

import asyncio
from typing import Any

from mcp.server.mcpserver import Image

from .. import project as active_project
from ..app import get_client, image_tool, tool
from ..errors import ThrixelError
from ..files import shrink_thumbnail
from ..pricing import IMAGE_NOTE

# The three shapes the service accepts, named the way a person asks for them.
_ASPECT_TO_SIZE = {
    "1:1": "1024x1024",
    "3:2": "1536x1024",
    "2:3": "1024x1536",
}

_MAX_BATCH = 4

# Generation runs on a CPU worker and takes roughly half a minute per image.
_POLL_INTERVAL_S = 3.0
_POLL_TIMEOUT_S = 300.0


async def _fetch_image(image_id: str) -> Image | None:
    """The rendered PNG as MCP image content, or None if it cannot be read."""
    client = get_client()
    fetched = await client.try_get_bytes(f"/imagehub/{image_id}/file")
    if fetched is None:
        return None
    data, fmt = shrink_thumbnail(fetched[0])
    return Image(data=data, format=fmt)


async def _await_images(wanted: set[str]) -> dict[str, dict[str, Any]]:
    """Poll until every requested image is terminal, or the timeout expires.

    Generation is queued server-side, so returning the queued rows would hand
    the agent ids it cannot look at yet - and the whole point of this tool is
    that the agent gets to SEE the result before committing 40 cubes to it.
    """
    client = get_client()
    seen: dict[str, dict[str, Any]] = {}
    waited = 0.0

    while waited < _POLL_TIMEOUT_S:
        rows = await client.get_json("/imagehub", limit=50)
        for row in rows if isinstance(rows, list) else []:
            if row.get("id") in wanted:
                seen[row["id"]] = row
        if seen and all(
            seen.get(i, {}).get("status") in ("completed", "failed") for i in wanted
        ):
            return seen
        await asyncio.sleep(_POLL_INTERVAL_S)
        waited += _POLL_INTERVAL_S

    return seen


@image_tool(
    title="Generate a 2D image",
    description=(
        "Generate one or more 2D images from a text description: concept art, "
        "a character line-up, a colour study, a mood board, a reference sheet. "
        f"{IMAGE_NOTE}\n\n"
        "USE THIS BEFORE COMMITTING TO GEOMETRY. Settling a look costs a few "
        "cubes an image here against 40 or more per 3D generation, so agree the "
        "2D first and only then build the mesh. That is the normal way to "
        "direct art and it is much the cheaper order.\n\n"
        "The result carries an image_id. Pass that id as reference_image_id to "
        "thrixel_sculpt_model, thrixel_create_model, thrixel_detail_model or "
        "thrixel_retexture_model and the job runs against this exact image: no "
        "second charge for a generated reference, and every asset driven by the "
        "same image reads as one set.\n\n"
        "Images are saved to the account's Image Hub and visible in the web app. "
        "Waits for generation and returns the pictures, so look at them before "
        "building anything."
    ),
)
async def thrixel_generate_image(
    prompt: str,
    n: int = 1,
    aspect_ratio: str = "1:1",
    project_id: str | None = None,
) -> Any:
    """Generate 2D images and return them.

    Args:
        prompt: What the image should show. Describe the picture, not the
            request: "three medieval peasant characters side by side, flat
            colours, plain background" rather than "make me some concepts".
        n: How many to generate, 1-4. Several at once is the cheap way to
            compare directions before choosing one.
        aspect_ratio: "1:1" (default), "3:2" landscape, or "2:3" portrait.
    """
    size = _ASPECT_TO_SIZE.get(aspect_ratio.strip())
    if size is None:
        raise ThrixelError(
            f"aspect_ratio must be one of {', '.join(_ASPECT_TO_SIZE)}, "
            f"got {aspect_ratio!r}."
        )
    count = max(1, min(int(n), _MAX_BATCH))

    client = get_client()
    created = await client.post_json("/imagehub", {
        "prompt": prompt,
        "n": count,
        "size": size,
        "quality": "medium",
        "project_id": project_id or active_project.active_id(),
    })
    rows = created if isinstance(created, list) else []
    ids = [r.get("id") for r in rows if r.get("id")]
    if not ids:
        raise ThrixelError(f"Thrixel accepted the request but returned no images: {created}")

    finished = await _await_images(set(ids))

    lines: list[str] = []
    blocks: list[Any] = []
    ready: list[str] = []
    for image_id in ids:
        row = finished.get(image_id, {})
        status = row.get("status", "queued")
        if status == "completed":
            ready.append(image_id)
            lines.append(f"image_id: {image_id}")
        elif status == "failed":
            lines.append(f"image_id: {image_id} - FAILED: "
                         f"{row.get('error_message') or 'no detail recorded'}")
        else:
            lines.append(
                f"image_id: {image_id} - still generating. "
                f"Check thrixel_list_images shortly."
            )

    if ready:
        lines.append("")
        lines.append(
            "To build from one of these, pass its image_id as "
            "reference_image_id - the image is not re-charged."
        )

    header = [f'Generated {len(ready)} of {count} image(s) for "{prompt[:60]}"']
    if filed := active_project.describe(project_id or active_project.active_id()):
        header.append(f"Filed under project: {filed}")

    blocks.append("\n".join(header + [""] + lines))
    for image_id in ready:
        picture = await _fetch_image(image_id)
        if picture is not None:
            blocks.append(picture)
    return blocks


@tool(
    title="List images",
    description=(
        "List the 2D images in this account's Image Hub, newest first, with "
        "the id needed to reuse one. Free.\n\n"
        "Use it to find an image generated earlier - by thrixel_generate_image, "
        "by the web app, or automatically as the reference behind a previous "
        "detail, sculpt or texture job - and reuse it instead of paying to "
        "generate another. Reusing one image across a set is also what keeps "
        "the set visually consistent.\n\n"
        "Pass show_usage to see which models each image has already driven."
    ),
)
async def thrixel_list_images(
    limit: int = 20,
    project_id: str | None = None,
    show_usage: bool = False,
) -> str:
    """List Image Hub images.

    Args:
        limit: How many to return, 1-100, newest first.
        project_id: Only images filed under this project. Omit for all of them.
        show_usage: Also look up which submissions each image was used as the
            reference for. Costs one extra request per image, so it is off by
            default.
    """
    client = get_client()
    limit = max(1, min(int(limit), 100))
    rows = await client.get_json(
        "/imagehub", limit=limit, project_id=project_id or None
    )
    rows = rows if isinstance(rows, list) else []
    if not rows:
        return (
            "No images yet. Generate one with thrixel_generate_image, which is "
            "the cheap way to settle a look before building geometry."
        )

    lines = []
    for row in rows:
        image_id = row.get("id", "?")
        prompt = (row.get("prompt") or "(no prompt)").strip().replace("\n", " ")
        if len(prompt) > 70:
            prompt = prompt[:69] + "…"
        created = (row.get("created_at") or "")[:10]
        status = row.get("status", "?")
        made_for = row.get("created_for") or "imagehub"
        lines.append(f"{image_id}  {status}  {created}  [{made_for}]  {prompt}")

        if show_usage and status == "completed":
            try:
                usages = await client.get_json(f"/imagehub/{image_id}/usages")
            except ThrixelError:
                usages = []
            for use in usages if isinstance(usages, list) else []:
                label = use.get("label") or use.get("operation") or "submission"
                lines.append(f"    used in: {use.get('submission_id')}  {label}")

    lines.append("")
    lines.append(
        "Reuse any of these by passing its id as reference_image_id on "
        "thrixel_sculpt_model, thrixel_create_model, thrixel_detail_model or "
        "thrixel_retexture_model. A reused image is not re-charged."
    )
    return "\n".join(lines)
