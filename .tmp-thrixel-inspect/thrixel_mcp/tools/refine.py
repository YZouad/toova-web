"""Refinement of an existing model — natural-language edits and auto-fix."""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context

from ..app import image_tool
from ..jobs import deliver, submit_and_wait
from ..pricing import METERED_NOTE

_NEXT = (
    "Check the thumbnail. Edit again to keep iterating, or "
    "thrixel_detail_model when the shape is right."
)


@image_tool(
    title="Edit a 3D model",
    description=(
        "Change an existing model with a natural-language instruction, keeping "
        "everything you did not ask to change. Use this to iterate rather than "
        "regenerating from scratch: it is faster, it preserves the parts of the "
        "asset that were already correct, and it is normally much CHEAPER than "
        "making the model again - a measured edit that deleted two parts, added "
        "four new ones and restyled the body still cost well under half a "
        "regenerate.\n\n"
        "That is the workflow to plan around: iterate hard and cheaply here "
        "while the model is still a blockout, then run thrixel_detail_model "
        "ONCE at the end. Detailing is terminal, so an edit is only possible "
        "before it.\n\n"
        "Works on Architect, Auto-fix and Edit results, and NOT on a detailed "
        "one - that is refused outright.\n\n"
        "Say what the result should BE ('the roof is corrugated metal, rusted "
        "at the edges'), not just what to do ('make it rusty').\n\n"
        "To change only some parts, pass their exact node names in "
        "focus_on_node_names - get those from thrixel_inspect_model. Naming "
        "new parts in the instruction works too: they come back under the "
        "names you used.\n\n"
        "Bounds note: an edit can move the model's origin, because the origin "
        "is derived from the model's lowest geometry. Deleting or adding "
        "something at the bottom shifts the whole asset relative to it. "
        "Re-check any offset you computed against the previous version.\n\n"
        f"{METERED_NOTE}"
    ),
)
async def thrixel_edit_model(
    submission_id: str,
    change: str,
    ctx: Context,
    focus_on_node_names: list[str] | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Apply a natural-language modification to an existing model.

    Args:
        submission_id: The model to edit, from an earlier Thrixel tool call.
        change: What should be different about the result.
        focus_on_node_names: Exact node names to scope the edit to. Empty or
            omitted edits the whole model.
    """
    result = await submit_and_wait(
        "/edit/submit",
        {
            "parent_submission_id": submission_id,
            "modification_request": change,
            "focus_on_node_names": focus_on_node_names or None,
            "project_id": project_id,
        },
        ctx=ctx,
        wait=wait,
        dest=dest,
    )
    if not wait:
        return f"Submitted. submission_id: {result.submission_id}"
    return await deliver(
        result, verb="Edited", fallback_name=change, next_step=_NEXT, dest=dest
    )


@image_tool(
    title="Auto-fix a 3D model",
    description=(
        "Run an automatic refinement pass on a model: the system critiques its "
        "own output and repairs what it finds, with no instruction from you.\n\n"
        "Use it when a generated model is roughly right but sloppy, and you "
        "cannot articulate what is wrong. If you CAN say what is wrong, "
        "thrixel_edit_model is more direct and usually better.\n\n"
        "This is one of the slower operations - expect a few minutes."
    ),
)
async def thrixel_autofix_model(
    submission_id: str,
    ctx: Context,
    max_iters: int | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Run an automatic critique-and-repair pass.

    Args:
        submission_id: The model to refine.
        max_iters: Number of critic-fix rounds, 1-3. Higher is more thorough,
            slower and more expensive. Omit for the server default.
    """
    result = await submit_and_wait(
        "/autofix/submit",
        {
            "parent_submission_id": submission_id,
            "max_iters": max_iters,
            "project_id": project_id,
        },
        ctx=ctx,
        wait=wait,
        dest=dest,
    )
    if not wait:
        return f"Submitted. submission_id: {result.submission_id}"
    return await deliver(
        result, verb="Auto-fixed", fallback_name="auto-fix", next_step=_NEXT, dest=dest
    )
