"""Housekeeping on assets that already exist — naming and filing.

Both operations have been available on the REST API since projects shipped
(``PATCH /{id}/nickname``, ``PATCH /{id}/project``). Neither was reachable
through this server, and the gap was not neutral: a beta account ended up with
twenty medieval assets filed under a project named for a different game, and
the agent driving it reported that assets "can enter a project and can never
leave it" - because from inside the tool surface, absent and impossible are
the same statement.
"""

from __future__ import annotations

from .. import project as active_project
from ..app import get_client, tool
from ..errors import ThrixelError


@tool(
    title="Rename an asset",
    description=(
        "Give an existing model a short, human name. Free.\n\n"
        "Use it when a listing is unreadable: an asset generated from a long "
        "prompt is labelled with that prompt, and a derived one (a detail pass, "
        "a triangle reduction) inherits whatever its parent had. A one or two "
        "word name is what makes thrixel_list_assets scannable in a later "
        "session.\n\n"
        "The name is a label only. Nothing about the model changes, and every "
        "submission_id stays valid."
    ),
)
async def thrixel_rename_asset(submission_id: str, name: str | None = None) -> str:
    """Set or clear a model's display label.

    Args:
        submission_id: The model to rename.
        name: The new label, up to 255 characters. Pass nothing to clear it and
            fall back to the generated label.
    """
    client = get_client()
    payload = await client.patch_json(
        f"/{submission_id}/nickname", {"nickname": name or None}
    )
    applied = payload.get("nickname")
    if not applied:
        return f"Cleared the name on {submission_id}; it falls back to its generated label."
    return f'Renamed {submission_id} to "{applied}".'


@tool(
    title="Move an asset to another project",
    description=(
        "Refile an existing model under a different project. Free, and nothing "
        "about the model changes.\n\n"
        "Use it when assets landed in the wrong place - generated before "
        "thrixel_start_project was called, or filed under the project that "
        "happened to be active rather than the one they belong to. Omit "
        "project_id to move it into the project this session is working in.\n\n"
        "Both the asset and the destination project must belong to this account."
    ),
)
async def thrixel_move_asset(submission_id: str, project_id: str | None = None) -> str:
    """File a model under a different project.

    Args:
        submission_id: The model to move.
        project_id: Destination project. Omit to use the project this session
            is working in, which is the usual case after noticing a misfile.
            Pass "none" to remove it from every project instead.
    """
    client = get_client()

    if isinstance(project_id, str) and project_id.strip().lower() == "none":
        await client.patch_json(f"/{submission_id}/project", {"project_id": None})
        return f"Removed {submission_id} from its project. It is now unfiled."

    target = project_id or active_project.active_id()
    if not target:
        raise ThrixelError(
            "No destination project. Pass project_id, or call "
            "thrixel_start_project first so this session has one."
        )

    # Read the project back before writing. A bad id would otherwise be
    # accepted here and only surface as a 404 the caller cannot tell apart
    # from a missing asset - and the same check is what lets us name the
    # destination in the result instead of echoing a UUID.
    try:
        found = await client.get_json(f"/projects/{target}")
    except ThrixelError as exc:
        # Deliberately NOT interpolating exc.message. The shared 404 handler
        # ends with "Check the submission_id", which is the right advice when
        # the missing thing is a submission and flatly wrong here - the
        # submission is fine, the project is not, and an agent handed both
        # sentences at once cannot tell which one to act on.
        detail = "" if exc.status == 404 else f" ({exc.message})"
        raise ThrixelError(
            f"There is no project {target} on this account{detail}. Nothing was "
            "moved. Use thrixel_list_projects to see the projects that exist."
        ) from None

    await client.patch_json(f"/{submission_id}/project", {"project_id": target})
    name = found.get("name") or target
    return (
        f'Moved {submission_id} into "{name}".\n'
        "The model itself is unchanged and its submission_id still works."
    )


@tool(
    title="Cancel a running job",
    description=(
        "Stop a job that has not finished yet. Free.\n\n"
        "Use it when you no longer want a result: a wrong prompt spotted after "
        "submitting, a batch that turned out too large, a queued job you have "
        "decided against. There was previously no way to abandon a submitted "
        "job at all, which left waiting or resubmitting as the only options - "
        "and resubmitting a job that has not actually died pays for it twice.\n\n"
        "A job still waiting for a worker is pulled off the queue. One a worker "
        "has already started may finish its work, but its result is discarded "
        "either way. Cancelling something that already completed or failed "
        "changes nothing and is not an error."
    ),
)
async def thrixel_cancel_job(submission_id: str) -> str:
    """Stop an unfinished job.

    Args:
        submission_id: The job to cancel.
    """
    client = get_client()
    result = await client.post_json(f"/{submission_id}/cancel", {})
    if not result.get("cancelled"):
        return (
            f"Nothing to cancel: {submission_id} is already "
            f"{result.get('status', 'finished')}."
        )
    return (
        f"Cancelled {submission_id}.\n"
        "If a worker had already started it, that work may still finish, but "
        "the result is discarded. Do not resubmit unless you want it after all."
    )
