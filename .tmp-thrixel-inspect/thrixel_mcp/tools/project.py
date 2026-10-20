"""Projects - group everything one game generates under one name."""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context

from datetime import datetime, timezone

from .. import project as active_project
from ..app import get_client, tool
from ..errors import ThrixelError


def _created(entry: dict[str, Any]) -> str:
    """The project's creation date, or "" when the API did not send one."""
    raw = entry.get("created_at")
    if not isinstance(raw, str) or not raw:
        return ""
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.strftime("%Y-%m-%d")


@tool(
    title="Start or resume a project",
    description=(
        "Create a Thrixel project and make it the destination for everything "
        "generated afterwards, or reopen an existing one. Free.\n\n"
        "CALL THIS FIRST, before generating anything, and name it after the "
        "game. Every model, edit, detail pass and texture pass from then on is "
        "filed under it automatically - you do not pass project_id anywhere. "
        "Without it, assets from every game the user has ever built land in one "
        "flat list, and there is no way to sort them out afterwards.\n\n"
        "Pass `name` to create a new project. Pass `project_id` instead to "
        "resume one that already exists - use thrixel_list_projects to find it. "
        "Resuming is the right move when the user returns to a game they "
        "started earlier, so the new assets join the old ones.\n\n"
        "Pass BOTH `project_id` and `name` to RENAME a project and resume it in "
        "the same call. Games get renamed mid-development; do this rather than "
        "creating a second project, which would split one game's assets across "
        "two folders. Only the label changes - every asset stays where it is.\n\n"
        "The project is visible in the Thrixel web app, so the user can browse "
        "and edit that game's assets as a set."
    ),
)
async def thrixel_start_project(
    ctx: Context,
    name: str | None = None,
    description: str | None = None,
    project_id: str | None = None,
) -> Any:
    """Create or activate the project new submissions are filed under.

    Args:
        name: Name for a NEW project, or the new name when renaming an
            existing one (pass `project_id` too). Use the game's name.
        description: Optional note stored with the project. Updates the note
            when passed alongside `project_id`.
        project_id: Activate this EXISTING project instead of creating one.
            Pass `name` as well to rename it in the same call.
    """
    # name + project_id used to be refused as a conflict. It is not one: the
    # API has always been able to rename a project (PATCH /projects/{id}), and
    # this tool was the only thing standing in the way (F1..F16 review, F6).
    # The tool had been modelled around two intents, "create" and "resume", and
    # rename is a third that nobody enumerated - so a user whose game changed
    # name was left choosing between a wrong label and a split asset set.
    if not project_id and not name:
        raise ThrixelError("Pass a name to create a project, or a project_id to resume one.")

    client = get_client()

    if project_id:
        # Read it back rather than trusting the id. Activating a project that
        # does not exist would attach a bad id to every later submission, and
        # each one would fail on its own with nothing pointing at the cause.
        try:
            found = await client.get_json(f"/projects/{project_id}")
        except ThrixelError as exc:
            raise ThrixelError(
                f"Could not open project {project_id}: {exc.message} "
                "Use thrixel_list_projects to see the projects on this account."
            ) from None
        resolved_name = found.get("name") or project_id
        renamed_from: str | None = None
        if name and name != resolved_name:
            # Metadata only - nothing about the stored assets moves.
            updated = await client.patch_json(
                f"/projects/{project_id}", {"name": name, "description": description},
            )
            renamed_from, resolved_name = resolved_name, updated.get("name") or name
        elif description:
            await client.patch_json(f"/projects/{project_id}", {"description": description})

        active_project.set_active(project_id, resolved_name)
        count = found.get("submission_count")
        tail = f" It already holds {count} asset{'s' if count != 1 else ''}." if count else ""
        if renamed_from:
            return (
                f'Renamed "{renamed_from}" to "{resolved_name}" and resumed it.{tail}\n'
                "Every asset stayed where it was; only the label changed.\n"
                "Everything generated from now on is filed under it."
            )
        return (
            f'Resumed project "{resolved_name}".{tail}\n'
            "Everything generated from now on is filed under it."
        )

    created = await client.post_json(
        "/projects", {"name": name, "description": description}
    )
    new_id = created.get("id")
    if not new_id:
        raise ThrixelError(f"Thrixel created the project but returned no id: {created}")
    active_project.set_active(new_id, created.get("name") or name or new_id)
    return (
        f'Created project "{created.get("name") or name}" (id {new_id}).\n'
        "Everything generated from now on is filed under it automatically. "
        "You do not need to pass project_id on any tool."
    )


@tool(
    title="List projects",
    description=(
        "List the projects on this account, newest first, with how many assets "
        "each holds. Free.\n\n"
        "Use it to find the project_id for a game the user started earlier, "
        "then pass that id to thrixel_start_project to resume it."
    ),
)
async def thrixel_list_projects(ctx: Context, include_archived: bool = False) -> Any:
    """List projects and show which one is currently active.

    Args:
        include_archived: Include archived projects (default false).
    """
    client = get_client()
    # get_json takes query params as kwargs, and drops the None.
    data = await client.get_json(
        "/projects", include_archived="true" if include_archived else None
    )

    projects = data.get("projects") if isinstance(data, dict) else data
    if not projects:
        return (
            "No projects yet. Call thrixel_start_project with the game's name "
            "before generating anything."
        )

    current = active_project.active()
    lines = []
    for entry in projects:
        pid = entry.get("id", "")
        marker = "  * " if current and current.project_id == pid else "    "
        count = entry.get("submission_count")
        suffix = f" - {count} asset{'s' if count != 1 else ''}" if count is not None else ""
        # Started-on, so two similarly named projects can be told apart without
        # opening both. The API has always sent it; nothing here read it.
        if started := _created(entry):
            suffix = f"{suffix}, started {started}"
        archived = " [archived]" if entry.get("is_archived") else ""
        lines.append(f"{marker}{entry.get('name', 'unnamed')}{archived}{suffix}\n      {pid}")

    header = f"Active project: {current.name}" if current else "No active project."
    return header + "\n\n" + "\n".join(lines)


# Source files are the project's TEXT channel: rules that hold across every
# asset. They pair with the style reference on thrixel_create_model, which is
# the PICTURE channel. Keeping them straight is the whole point of documenting
# both here - text carries constraints ("under 5k triangles", "never a ground
# plane"), a picture carries appearance, and asking either to do the other's
# job is where a set starts drifting.
@tool(
    title="Add a style guide to the project",
    description=(
        "Attach a text file to the active project. Its contents are given to "
        "EVERY generation in that project from then on, so it is where "
        "constants live: art direction, polycount budgets, naming conventions, "
        "in-world names, real-world sizes. Free.\n\n"
        "Write this once, early, instead of repeating the same clauses in "
        "thirty prompts - a rule repeated by hand is a rule that eventually "
        "gets typed differently, and the set drifts.\n\n"
        "USE IT FOR RULES, NOT FOR LOOKS. This is text, so it is good at "
        "things you can state: 'every asset under 5000 triangles', 'flat "
        "colours, no gradients', 'never add a ground plane', 'a door is 2.1m "
        "tall'. To make assets share an APPEARANCE, pass "
        "style_reference_submission_id to thrixel_create_model instead - a "
        "finished model shows a palette and a finish far better than a "
        "paragraph describes them. The two combine; they do not substitute.\n\n"
        "Limits: .md / .markdown / .txt / .text, 64 KB per file, 256 KB per "
        "project. Uploading the same filename replaces the previous version. "
        "Applies only to generations made AFTER the upload; it does not "
        "retroactively change existing assets.\n\n"
        "The contents are read by the model, so put project rules in it and "
        "nothing else - no keys, no private notes."
    ),
)
async def thrixel_add_project_source(
    ctx: Context,
    filename: str,
    content: str,
    project_id: str | None = None,
) -> Any:
    """Attach a text style guide to a project.

    Args:
        filename: Name to store it under, including the extension, e.g.
            "style.md". Re-using a name replaces that file.
        content: The file's text. Passed inline - this tool does not read from
            disk.
    """
    target = project_id or (active_project.active().project_id if active_project.active() else None)
    if not target:
        raise ThrixelError(
            "No active project. Call thrixel_start_project first, or pass project_id."
        )
    if not (content or "").strip():
        raise ThrixelError("content is empty - there is nothing to attach.")

    client = get_client()
    row = await client.post_file(
        f"/projects/{target}/sources", filename=filename, content=content,
    )
    size = row.get("size_bytes")
    # `is_applied` is the server telling us whether this file will actually
    # reach a generation. Reporting the row as stored when it is not applied
    # would leave the agent believing a style guide is in force when it is
    # inert - the one thing this tool must not get wrong.
    if row.get("is_applied") is False:
        return (
            f'Stored "{filename}" ({size} bytes) but it is NOT being applied yet '
            "(it is still being screened, or was flagged). Generations will "
            "ignore it until that resolves - check the Sources tab in the web app."
        )
    return (
        f'Attached "{filename}" ({size} bytes) to the project. '
        "Every generation from now on is given its contents."
    )


@tool(
    title="List the project's style guides",
    description=(
        "List the text files attached to the active project, with how much of "
        "the 256 KB budget is used. Free.\n\n"
        "Use it to check what rules are already in force before adding more, "
        "and to confirm a file is actually being applied."
    ),
)
async def thrixel_list_project_sources(ctx: Context, project_id: str | None = None) -> Any:
    """List a project's attached source files.

    Args:
    """
    target = project_id or (active_project.active().project_id if active_project.active() else None)
    if not target:
        raise ThrixelError(
            "No active project. Call thrixel_start_project first, or pass project_id."
        )

    data = await client_sources(target)
    rows = data.get("sources") or []
    if not rows:
        return (
            "No style guides on this project. thrixel_add_project_source "
            "attaches one; its contents then apply to every generation here."
        )
    total = data.get("total_bytes") or 0
    lines = []
    for r in rows:
        flag = "" if r.get("is_applied", True) else "   [NOT APPLIED]"
        lines.append(f"    {r.get('filename')}  {r.get('size_bytes')} bytes{flag}")
    return (
        f"{len(rows)} file(s), {total} of 262144 bytes used:\n" + "\n".join(lines)
    )


async def client_sources(project_id: str) -> dict:
    return await get_client().get_json(f"/projects/{project_id}/sources")
