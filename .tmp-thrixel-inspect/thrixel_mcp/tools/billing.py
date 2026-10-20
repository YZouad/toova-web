"""Paying for more cubes, without the user hunting for a page.

Everything here returns a URL for a human to open. Nothing moves money: a
checkout session is an invitation to pay, and the account only changes when
the payment processor confirms it separately. So these are safe for an agent
to call, and useless for one to call on its own initiative - a link nobody
was offered is just noise.
"""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context

from ..app import get_client
from ..app import tool
from .. import offers
from ..errors import ThrixelError

# Purchasable plans. "free" is what you already have, and "enterprise" is not
# self-serve, so neither belongs in a checkout call.
_TIERS = ("pro", "studio")


async def _top_up_packs() -> list[dict] | None:
    """The purchasable packs, read from the service every time.

    Deliberately NOT a constant here. The price list already existed in three
    places (service config, web pricing modal, and briefly this file), which
    means a price change silently disagrees with itself until somebody
    notices. A client that ships its own copy is a stale price waiting to
    happen, and this one is quoted to a user right before they pay.

    Returns None when the field is ABSENT, which means the deployment predates
    it, and a list when it is present. Those are different facts: absent means
    "cannot know", empty means "nothing on sale". Collapsing them would tell a
    paying user that top-ups do not exist.
    """
    data = await get_client().get_json("/tiers")
    packs = data.get("top_up_packs")
    if packs is None:
        return None
    return [p for p in packs if isinstance(p.get("usd"), int)]


@tool(
    title="Get an upgrade link",
    description=(
        "Return a checkout link the user can open to subscribe to a paid plan. "
        "On an account that has never subscribed and has run low, this "
        "returns the first month free rather than a full-price link, and "
        "says so. "
        "Free to call, and it does NOT charge anything: it hands back a URL, "
        "and the plan only changes once the user completes payment there.\n\n"
        "Use it when the user has said they want to upgrade, or when "
        "thrixel_account_status shows they are out of cubes and they have "
        "asked how to get more. Do NOT call it unprompted - an unrequested "
        "payment link mid-build reads as a sales interruption.\n\n"
        "The checkout page shows the price, so you do not need to quote one, "
        "and you should not guess at it.\n\n"
        "After they say they have paid, call thrixel_account_status again to "
        "confirm the new plan and balance before relying on it. Payment "
        "confirmation is asynchronous, so it may take a few seconds."
    ),
)
async def thrixel_upgrade_plan(ctx: Context, tier: str = "pro") -> Any:
    """Create a subscription checkout link.

    Args:
        tier: "pro" or "studio". Pro is the usual answer for one game.
    """
    wanted = (tier or "").strip().lower()
    if wanted not in _TIERS:
        raise ThrixelError(f"tier must be one of {', '.join(_TIERS)}, got {tier!r}.")

    client = get_client()

    # A free month, when there is one, instead of a full-price link. Nothing
    # about the outcome differs - both end in a Pro subscription - so handing
    # over the $30 link to somebody the service would have given 30 days to is
    # simply charging them for our own omission.
    #
    # Pro only: the offer is a Pro trial, so an explicit ask for Studio is
    # answered with Studio.
    #
    # This is also the ONE place that asks for the offer's checkout, and
    # deliberately so. Requesting it records that the account reached the
    # payment page, which is only true here: this tool is called because a
    # person said they wanted to pay. See offers.py.
    # --- first-month-free promo: delete from here to the marker below ---
    if wanted == "pro":
        offer = await offers.check(client)
        if offer is not None:
            try:
                started = await client.post_json(
                    "/users/me/offers/first-month-free/checkout", {}
                )
            except ThrixelError:
                started = None       # fall through to the ordinary checkout
            url = (started or {}).get("url")
            if url:
                days = offer.get("trial_days") or 30
                usd = offer.get("usd_after")
                after = f"${usd} monthly" if usd else "the normal monthly price"
                return (
                    f"Pro, with the first {days} days free:\n"
                    f"  {url}\n\n"
                    f"It costs $0 today and {after} after that, and starting it "
                    "takes a card. Tell the user both halves - a trial "
                    "described as simply free is the kind of surprise that "
                    "ends in a chargeback.\n\n"
                    "Give them the link and let them decide. Do not wait for "
                    "them: keep building with the cubes they have, and "
                    "re-check thrixel_account_status once they say it is done."
                )
    # --- end first-month-free promo (see thrixel_mcp/offers.py) ---

    try:
        result = await client.post_json(
            "/users/me/checkout/subscription", {"tier": wanted}
        )
    except ThrixelError as exc:
        # These three are ordinary states, not faults, and each has a different
        # next action. Passing the raw message through would leave the agent
        # guessing which.
        message = exc.message or ""
        if "already have a subscription" in message.lower():
            raise ThrixelError(
                "This account already has a subscription, so it cannot start a "
                "second one. To change plans, use thrixel_billing_portal."
            ) from None
        if "not billed" in message.lower():
            raise ThrixelError(
                "This is an admin account. It is never billed and already has "
                "unlimited cubes, so there is nothing to upgrade."
            ) from None
        raise

    url = result.get("url")
    if not url:
        raise ThrixelError(f"Checkout started but returned no URL: {result}")
    return (
        f"Upgrade link for the {wanted.capitalize()} plan:\n"
        f"  {url}\n\n"
        "Give the user this link and let them decide. Do not wait for them - "
        "keep building with the cubes they have, and re-check "
        "thrixel_account_status once they say it is done."
    )


@tool(
    title="Plans and prices",
    description=(
        "The live catalogue: every plan with its monthly cubes and concurrent "
        "job cap, what the fixed-price operations cost, and the cube packs on "
        "sale. Free to call, needs no account, buys nothing.\n\n"
        "**Call this instead of quoting any number from memory.** Plans, caps "
        "and prices all change, and these come from the service, so they are "
        "current by construction. A remembered price shown to somebody about "
        "to pay is the worst kind of wrong.\n\n"
        "Use it when planning a batch against a budget, when explaining what "
        "an upgrade buys, or before offering top-ups. For what THIS account "
        "has right now (balance, plan, jobs in flight) use "
        "thrixel_account_status instead - this tool describes the catalogue, "
        "not the account."
    ),
)
async def thrixel_pricing(ctx: Context) -> Any:
    """Report plans, fixed operation costs and top-up packs, live."""
    data = await get_client().get_json("/tiers")

    lines: list[str] = []

    tiers = data.get("tiers") or []
    if tiers:
        lines.append("Plans:")
        for tier in tiers:
            # enterprise is not self-serve, so it is noise in an agent's plan.
            if tier.get("name") == "enterprise":
                continue
            monthly = tier.get("monthly_cubes")
            cap = tier.get("concurrent_job_cap")
            bits = []
            if isinstance(monthly, int):
                bits.append(f"{monthly:,} cubes/month")
            if isinstance(cap, int):
                bits.append(f"{cap} concurrent jobs")
            if tier.get("can_topup"):
                bits.append("can buy top-ups")
            lines.append(f"  {str(tier.get('name', '?')).capitalize():<8} {', '.join(bits)}")
        lines.append("")

    flat = data.get("flat_op_cubes") or {}
    if flat:
        paid = sorted((k for k, v in flat.items() if v), key=lambda k: flat[k])
        free = sorted(k for k, v in flat.items() if not v)
        if paid:
            grouped: dict[int, list[str]] = {}
            for name in paid:
                grouped.setdefault(flat[name], []).append(name)
            for cost, names in sorted(grouped.items()):
                lines.append(f"Fixed price: {', '.join(names)} - {cost} cubes each")
        if free:
            lines.append(f"Free: {', '.join(free)}")
        # Absent on a deployment predating the field, which is NOT the same as
        # zero - see the graceful-degradation rule in the server instructions.
        # Saying nothing is right there: the old behaviour genuinely had no
        # separate charge, so an omitted field and a real 0 mean the same thing
        # to the caller, and inventing a number would be worse than either.
        ref_img = data.get("ref_image_cubes")
        if isinstance(ref_img, int) and ref_img > 0:
            lines.append(
                f"Reference image: {ref_img} cubes, added to the fixed price "
                "when detail / sculpt / texture is called with only a prompt "
                "and has to generate one. Passing an image or a "
                "reference_image_id avoids it."
            )
        lines.append(
            "Everything else is metered on actual usage and charged after the "
            "run, so it varies with the request."
        )
        lines.append("")

    packs = data.get("top_up_packs")
    if packs is None:
        lines.append(
            "Top-up packs: not reported by this Thrixel deployment. Top-ups "
            "still work, and the checkout page shows what each costs."
        )
    elif not packs:
        lines.append("Top-up packs: none on sale right now.")
    else:
        lines.append("Cube packs (top-ups, paid plans only):")
        for pack in packs:
            cubes = pack.get("cubes")
            cubes_text = f"{cubes:,} cubes" if isinstance(cubes, int) else "cubes"
            lines.append(f"  ${pack['usd']:<4} -> {cubes_text}")
        lines.append("")
        lines.append("Pass the dollar amount to thrixel_buy_cubes for a checkout link.")

    return "\n".join(lines).rstrip()


@tool(
    title="Get a cube top-up link",
    description=(
        "Return a checkout link for a one-time cube top-up. Free to call and "
        "charges nothing by itself.\n\n"
        "Top-ups require an existing paid plan. A free-tier user has to "
        "subscribe first, so use thrixel_upgrade_plan for them instead.\n\n"
        "Call thrixel_pricing first to see the real pack sizes rather "
        "than guessing one. Only call this once the user has picked."
    ),
)
async def thrixel_buy_cubes(ctx: Context, usd: int = 10) -> Any:
    """Create a top-up checkout link.

    Args:
        usd: Pack price in US dollars, taken from thrixel_pricing.
    """
    packs = await _top_up_packs()
    # Checked against the live list rather than a constant, so a pack we add or
    # retire needs no release here. When the list is unavailable (older
    # deployment, or a failed side call) send it anyway and let the service
    # judge - refusing on our own guess would block a sale over a side call.
    sold = [p["usd"] for p in packs] if packs else []
    if sold and usd not in sold:
        raise ThrixelError(
            f"${usd} is not a pack on sale. Available: "
            f"{', '.join('$' + str(p) for p in sold)}."
        )

    try:
        result = await get_client().post_json("/users/me/checkout/topup", {"usd": usd})
    except ThrixelError as exc:
        if "subscribe" in (exc.message or "").lower():
            raise ThrixelError(
                "Top-ups are for paid plans only. This account is on the free "
                "tier, so it needs thrixel_upgrade_plan first."
            ) from None
        raise

    url = result.get("url")
    if not url:
        raise ThrixelError(f"Top-up started but returned no URL: {result}")
    return f"Top-up link (${usd}):\n  {url}\n\nThe cubes land once the payment completes."


@tool(
    title="Get a billing portal link",
    description=(
        "Return a link to the billing portal, where an existing subscriber can "
        "change plan, update a card, see invoices or cancel. Free to call.\n\n"
        "This is the right tool for someone who ALREADY subscribes. Use "
        "thrixel_upgrade_plan for a first subscription instead."
    ),
)
async def thrixel_billing_portal(ctx: Context) -> Any:
    """Create a billing portal link for an existing subscriber."""
    result = await get_client().post_json("/users/me/billing-portal", {})
    url = result.get("url")
    if not url:
        raise ThrixelError(f"Portal request returned no URL: {result}")
    return f"Billing portal:\n  {url}"
