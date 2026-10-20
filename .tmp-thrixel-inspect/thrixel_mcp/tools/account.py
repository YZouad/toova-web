"""Account and quota inspection."""

from __future__ import annotations

from typing import Any

from .. import offers
from ..app import get_client, get_config, tool
from ..config import API_KEYS_HINT
from ..errors import ThrixelError
from ..pricing import COST_SUMMARY, GPU_OP_CUBES, REF_IMAGE_CUBES


@tool(
    title="Check Thrixel account",
    description=(
        "Check the Thrixel API key, the cube balance, and how many jobs are "
        "running. Call this before submitting a large batch so you can size it "
        "to the budget and the concurrency cap, and after a 'jobs already "
        "running' or 'out of cubes' error.\n\n"
        f"Costs: {COST_SUMMARY}. Concurrency is capped per plan; an admin "
        "account is unlimited."
    ),
)
async def thrixel_account_status() -> str:
    """Report key validity, plan, cube balance and in-flight jobs."""
    client = get_client()
    config = get_config()

    try:
        identity = await client.get_json("/validate")
    except ThrixelError as exc:
        return f"Could not validate the API key.\n{exc.message}"

    if not identity.get("valid"):
        where = (
            "THRIXEL_API_KEY in the MCP client config"
            if config.key_source == "env"
            else "the stored credential"
        )
        return (
            f"NOT SIGNED IN: {where} is not valid or has been revoked, so every "
            "generation call will fail until it is replaced. Say so to the user "
            "now rather than continuing quietly.\n"
            f"{API_KEYS_HINT}"
        )

    lines = [f"Connected to {config.api_base}"]
    lines.append(f"Key: {identity.get('name') or '(unnamed)'} ({identity.get('role') or 'user'})")

    try:
        usage: dict[str, Any] = await client.get_json("/usage")
    except ThrixelError as exc:
        lines.append(f"Could not read quota: {exc.message}")
        return "\n".join(lines)

    unlimited = bool(usage.get("is_unlimited"))
    plan = usage.get("plan")
    if plan:
        lines.append(f"Plan: {plan}")

    # Absent vs null are different answers, and conflating them would be a lie:
    # a Thrixel deployment older than these fields omits them entirely, and
    # reading that as null ("unlimited") would tell the agent it has infinite
    # budget. Only an explicit null means ungated.
    if "cubes_balance" not in usage or "concurrent_job_cap" not in usage:
        lines.append(
            "Cubes and concurrency cap: not reported by this Thrixel deployment "
            "(it predates those fields). Submitting past your limit will still "
            "fail with a message naming it."
        )
    elif unlimited:
        lines.append("Cubes: unlimited (admin account)")
        lines.append("Concurrency: unlimited (admin account)")
    else:
        balance = usage.get("cubes_balance")
        if balance is None:
            lines.append("Cubes: unlimited")
        else:
            lines.append(f"Cubes: {balance}")
            affordable = balance // GPU_OP_CUBES
            # Two numbers, because one of them is always wrong. A prompt-only
            # call also pays for the reference image it makes, so quoting the
            # flat price alone overstates what the balance covers - and an
            # agent that plans against the overstatement discovers the shortfall
            # as a 402 partway through a build.
            with_image = balance // (GPU_OP_CUBES + REF_IMAGE_CUBES)
            lines.append(
                f"  -> covers {affordable} more GPU operation"
                f"{'' if affordable == 1 else 's'} "
                f"(detail / sculpt / texture, {GPU_OP_CUBES} each), or "
                f"{with_image} if each one has to generate its reference image "
                f"from a prompt (+{REF_IMAGE_CUBES})."
            )
            if affordable == 0:
                lines.append(
                    "  -> not enough for a GPU operation. thrixel_reduce_triangles "
                    "and rebakes are still free."
                )
            # Say what to DO, not just what the number is. An agent mid-build
            # will keep submitting until a 402 stops it, which strands a
            # half-finished game. The user needs the choice before that.
            if balance <= 0:
                lines.append(
                    "  -> OUT OF CUBES. Finish and deliver what is already "
                    "built before mentioning money - a half-shipped game helps "
                    "nobody. Then tell the user which assets are still "
                    "unbuilt, and offer thrixel_upgrade_plan for a checkout "
                    "link (it charges nothing by itself)."
                )

        cap = usage.get("concurrent_job_cap")
        in_flight = usage.get("concurrent_in_flight") or 0
        if cap is None:
            lines.append(f"Concurrency: {in_flight} running, no cap")
        else:
            lines.append(f"Concurrency: {in_flight} of {cap} running")
            if in_flight >= cap:
                lines.append(
                    "  -> at the cap. Wait for one to finish before submitting more."
                )
            else:
                lines.append(f"  -> room for {cap - in_flight} more right now.")

    # Outside every branch above, deliberately. The GPU lane is shared by the
    # whole service, so its depth is just as true for an unlimited account as a
    # free one - an admin key waits in the same queue. "Room for 4 more" was
    # read as "nothing is ahead of you" and never meant that: two identical
    # sculpts nine seconds apart finished 58s and 2,315s later with four slots
    # free throughout. The cap governs what you may SUBMIT; this governs how
    # long it WAITS.
    lane = usage.get("gpu_lane_depth")
    if isinstance(lane, int):
        lines.append(f"GPU lane: {lane} job(s) queued or running service-wide")
        if lane > 3:
            lines.append(
                "  -> the shared GPU lane is busy, so detail / sculpt / texture "
                "will queue regardless of your free slots."
            )

    # Names of what is in flight, so the agent can tell whether the work it
    # cares about is already running rather than submitting a duplicate.
    try:
        active = await client.get_json("/submissions/active")
    except ThrixelError:
        # The balance above was read fine, so the offer is still worth saying;
        # only the in-flight list is missing.
        return "\n".join(lines) + await offers.planning_note(client)

    running = active.get("active") or []
    if running:
        lines.append("")
        lines.append("Running now:")
        for item in running[:10]:
            label = item.get("display_name") or item.get("task") or "(unnamed)"
            lines.append(
                f"  - {label} - {item.get('status')} {item.get('progress', 0)}% "
                f"[{item.get('submission_id')}]"
            )
        if len(running) > 10:
            lines.append(f"  ... and {len(running) - 10} more")

    return "\n".join(lines) + await offers.planning_note(client)
