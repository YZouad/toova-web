"""Collapse a model's part hierarchy into engine-ready meshes."""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context

from ..app import image_tool
from ..jobs import deliver, job_metadata, submit_and_wait


@image_tool(
    title="Group a model's parts for a game engine",
    description=(
        "Join a model's many separate mesh nodes into the few an engine "
        "actually needs to move independently. FREE.\n\n"
        "RUN THIS BEFORE IMPORTING A MULTI-PART MODEL INTO A GAME. Models "
        "from thrixel_create_model come back as 99 to 342 separate mesh "
        "nodes, because each named part is its own node. Every engine gives "
        "each node its own object and its own draw call, so a dozen "
        "unmodified models is thousands of draw calls before any scenery "
        "exists and the frame rate collapses. This welds everything that "
        "does not move into one mesh.\n\n"
        "DOES NOT APPLY to a model that is already a single mesh - there is "
        "nothing to weld together, and submitting one is rejected. "
        "thrixel_sculpt_model and thrixel_detail_model both return exactly "
        "one mesh, so skip this step for their output and import it "
        "directly. To fit such a model to a triangle budget use "
        "thrixel_reduce_triangles, which is the tool for that on any model. "
        "thrixel_inspect_model lists the nodes if you are unsure.\n\n"
        "Name the parts that must still move in `keep_groups`: wheels, "
        "sails, turrets, doors, propellers. Each becomes its own mesh with "
        "its origin at its own geometric centre, so the engine can rotate it "
        "in place instead of orbiting the model root. The result reports each "
        "group's origin, which is what you position and animate against.\n\n"
        "Call thrixel_inspect_model first and use the part names it lists, "
        "verbatim. Do NOT invent names from convention (ArmL, Head_Group, "
        "Leg_FL): every model names its parts differently, and guessed names "
        "are the single most common reason this operation fails. Names are "
        "validated against the model's real node list when you submit, so a "
        "bad name fails instantly and the error lists the real names with "
        "per-group suggestions: correct from THAT list, do not guess again. "
        "Near-miss spellings of real names do match (word order and L/R/"
        "front/back abbreviations are understood), but only inspection "
        "guarantees the parts you care about exist at all. A group that "
        "matches nothing FAILS the job on purpose: silently welding a moving "
        "part into the body gives you a model that looks perfect and simply "
        "never animates.\n\n"
        "Material slots survive the join as submeshes, so per-surface names "
        "(Paint, Glass, Chrome, Rubber) stay addressable afterwards.\n\n"
        "Measured on a real 15-asset project, nodes before -> after: windmill "
        "48 -> 2, bakery 30 -> 1, keep 60+ -> 3, catapult 60 -> 6, swordsman "
        "28 -> 8. That is 10-40x fewer draw calls, for free.\n\n"
        "Pivot origins and sizes in the result are Y-up, matching the exported "
        "GLB, so a pivot is usable as an engine position with no axis "
        "conversion. Every Thrixel GLB is Y-up; never detect it per asset."
    ),
)
async def thrixel_group_parts(
    submission_id: str,
    ctx: Context,
    keep_groups: list[dict] | None = None,
    merged_name: str = "Body",
    exclude: list[str] | None = None,
    target_triangles: int | None = None,
    smooth_angle: float | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Join a model's part hierarchy into engine-ready meshes.

    Args:
        submission_id: The model to group. Any completed multi-part model
            works. A model that is already one mesh - sculpt and detail
            results are - has nothing to group and is rejected.
        keep_groups: Parts that must stay separately movable, as
            [{"name": "FL", "aliases": ["fl", "frontleft"]}, ...]. The name
            becomes the mesh object's name. Aliases are matched against
            tokens of the part's name path, so "fl" matches "FL_spoke0".
            For wheels named FL / FR / RL / RR you can omit aliases and the
            usual corner spellings are used automatically. Omit the whole
            argument to weld the model into a single mesh, which is the right
            choice for scenery and static props.
        merged_name: Name of the single mesh everything else joins into.
        exclude: Extra name tokens that must never be pulled into a KEEP GROUP.
            This does NOT delete anything and does not hide anything: an
            excluded node is welded into the merged body mesh and stays
            visible exactly where it was. The name is about the grouping pass,
            not about the model. To remove a part you do not want, delete it
            in your engine after import - this tool has no delete.
            Structural parts nested under a moving group (wheel arches,
            suspension) are already excluded, so you rarely need this.
        target_triangles: Optional budget applied to the merged mesh ONLY.
            Kept groups are left alone, since decimating a wheel to hit a
            whole-model budget wrecks it. This does not make the tool usable
            on a single-mesh model: use thrixel_reduce_triangles for that.
        smooth_angle: Smooth-by-angle threshold in degrees, default 38.
            Keeps creases above it sharp and blends below, so curved panels
            do not read as faceted while hard edges stay crisp. 0 disables.
    """
    result = await submit_and_wait(
        "/filter/group",
        {
            "parent_submission_id": submission_id,
            "keep_groups": keep_groups or None,
            "merged_name": merged_name,
            "exclude": exclude or None,
            "target_tri_count": target_triangles,
            "smooth_angle": smooth_angle,
        },
        ctx=ctx,
        wait=wait,
        dest=dest,
    )
    if not wait:
        return f"Submitted. submission_id: {result.submission_id}"

    # The origins are the point of the whole operation for anything that
    # animates, and they are not recoverable from the GLB without re-parsing
    # it. Surface them rather than making the agent go looking.
    meta = job_metadata(result.info)
    note_parts = []
    objects = meta.get("mesh_objects")
    if isinstance(objects, int):
        note_parts.append(f"{objects} mesh object{'s' if objects != 1 else ''} now.")
    origins = meta.get("group_origins") or {}
    if origins:
        listed = ", ".join(
            f"{name} at ({o[0]}, {o[1]}, {o[2]})"
            for name, o in origins.items()
            if isinstance(o, list) and len(o) == 3
        )
        if listed:
            note_parts.append(f"Pivot origins: {listed}.")
    note_parts.append("Import this into the engine, not the ungrouped version.")

    return await deliver(
        result,
        verb="Grouped",
        fallback_name="grouped",
        next_step=" ".join(note_parts),
        dest=dest,
    )
