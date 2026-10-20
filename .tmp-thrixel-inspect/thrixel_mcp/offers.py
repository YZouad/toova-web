"""The first-month-free offer, as the CLI sees it.

One place asks whether an account may take the offer; four surfaces read the
answer. Four copies of the question is four places for them to disagree.

The RULE is deliberately not restated here. "Ran low and has never
subscribed" is the server's to define - it also checks the plan, whether the
account is active, and Stripe for a subscription we may not know about - and
this module only asks. A local re-implementation would be a second answer to
a question that already has one.

Two links, and the difference matters
-------------------------------------
Asking for the Stripe checkout RECORDS that the account reached the payment
page. That record is only worth having if it means what it says, so it is
made in exactly one place: ``thrixel_upgrade_plan``, which is called because
a person said they wanted to pay.

Everywhere else - the end of a build, an account check, an out-of-cubes stop -
the offer is mentioned unprompted, so it points at the pricing page instead.
Generating a checkout link nobody asked for would mark every one of those
accounts as having reached the payment page without a single one of them
having seen it.
Switching it off, and taking it out
-----------------------------------
**To stop it:** set ``TRIAL_OFFER_ENABLED=0`` on the API. The endpoint then answers
``reason="offer_disabled"``, which maps to NEVER here, and every surface below goes
quiet on the next call. No MCP release, no deploy of this package, nothing to revert.
That is the intended way to end the campaign.

**To delete it for good:** remove this module. Every caller reaches it through
``from .. import offers``, never by copying its strings, so deleting the file turns
each site into an ImportError and the test suite hands you the complete list. As of
writing that is three one-line concatenations (``tools/publish.py`` LIVE branch,
``tools/account.py`` x2) and one clearly fenced block in ``tools/billing.py``.

Two things deliberately do NOT belong to the promo and should survive it: the 402 text
in ``errors.py`` telling an agent to finish and deliver rather than abandon the build,
and ``config.PRICING_URL``. Both are right whether or not a free month exists.

The matching prose in ``build-world/skills/build-world/SKILL.md`` has no import to
break, so it has to be removed by hand; that file names this module so a grep finds it.
"""

from __future__ import annotations

from typing import Any

from .config import PRICING_URL
from .errors import ThrixelError

_PATH = "/users/me/offers/first-month-free"

# The server's way of saying "everything else about this account passed; it
# simply has not run low yet". Free plan, active, never subscribed - all
# already checked, all true. It is the difference between "no offer" and "no
# offer YET", and the two want opposite behaviour from a build:
#
#   no offer      -> the free plan really is all this account gets, so say so
#                    before spending it.
#   no offer yet  -> a free month is waiting on the other side of the balance
#                    running down, so building is the right thing to do and
#                    interrupting to sell an upgrade is not.
#
# Without this distinction the second case is invisible. A new account starts
# at the full signup grant, far above the low line, so at the START of a build
# it is never "eligible" - and a check for eligibility alone would stop every
# first-time user to ask them for money on the one path where waiting pays.
_NOT_LOW_YET = "balance_above_threshold"

NOW = "now"
LATER = "later"
NEVER = "never"


async def _fetch(client: Any) -> dict[str, Any] | None:
    """The raw endpoint answer, or None if it could not be had.

    Never raises. Signed out, payments down, and a Thrixel deployment old
    enough not to have the endpoint all mean the same thing to a caller: say
    nothing. A promo lookup must never be the reason a published game fails to
    report its URL.
    """
    try:
        data = await client.get_json(_PATH)
    except ThrixelError:
        return None
    except Exception:  # noqa: BLE001 - a side call, never fatal to its caller
        return None
    return data if isinstance(data, dict) else None


async def when(client: Any) -> str:
    """NOW, LATER or NEVER. Never raises; NEVER is the safe unknown."""
    data = await _fetch(client)
    if data is None:
        return NEVER
    if data.get("eligible"):
        return NOW
    return LATER if data.get("reason") == _NOT_LOW_YET else NEVER


async def check(client: Any) -> dict[str, Any] | None:
    """The offer when this account may take it right now, otherwise None."""
    data = await _fetch(client)
    if data is None or not data.get("eligible"):
        return None
    return data


def _wording(offer: dict[str, Any]) -> str:
    """The sentence the user should hear, with live numbers.

    Interpolated from the endpoint rather than written down, so even a sloppy
    relay quotes the price the service will actually charge.
    """
    days = offer.get("trial_days") or 30
    usd = offer.get("usd_after")
    price = f"then ${usd} monthly" if usd else "then the normal monthly price"
    return (
        f"  The first {days} days of Pro are free. It costs $0 now, {price}, "
        f"and starting it takes a card.\n"
        f"  {PRICING_URL}"
    )


def line(offer: dict[str, Any]) -> str:
    """For a run that is ENDING, beside the thing that was just built.

    Written for the agent to relay rather than to print verbatim, and phrased
    so it states a fact and stops. An offer repeated every turn stops reading
    as an offer.
    """
    days = offer.get("trial_days") or 30
    return (
        f"\n\nThis account can start Pro free for {days} days. Say so once, in "
        "your closing message, alongside what you just built:\n\n"
        + _wording(offer) + "\n\n"
        "State it and move on. Let them decide, do not wait for a reply, and "
        "do not raise it again later in the session."
    )


def line_before_work(offer: dict[str, Any]) -> str:
    """For a check made BEFORE or DURING a build, where nothing is finished.

    The closing wording is wrong here and says so out loud: "alongside what
    you just built" read at the start of a fresh session points at nothing.
    That session is a real case, not a corner - somebody who ran their balance
    down building one game and came back for a second one starts here, already
    low and already qualifying, with an empty balance and no work to hang the
    offer on.

    The judgement this asks for is deliberately about the BALANCE, not about
    where in the session the agent happens to be: an account that cannot fund
    what was asked for should hear this before the work starts, because a
    build that stops two assets in has wasted their time to tell them
    something we knew at the outset.
    """
    days = offer.get("trial_days") or 30
    return (
        f"\n\nThis account can start Pro free for {days} days, and it is "
        "available right now.\n\n"
        "Judge it on the balance above. If that balance will NOT carry what "
        "the user asked for, tell them BEFORE building rather than after: "
        "starting work you cannot finish spends their time to deliver news "
        "you already had. If it will carry the work, build first and mention "
        "this with the finished result instead.\n\n"
        + _wording(offer) + "\n\n"
        "Either way say it once. Do not also pitch a paid upgrade or a "
        "top-up: this is cheaper for them than both, and offering three "
        "things at once is how none of them gets chosen."
    )


LATER_NOTE = (
    "\n\nThis account has never subscribed, so a free month of Pro unlocks for "
    "it once the balance runs low. Do not stop the build to ask about "
    "upgrading: spending the balance down is what unlocks the offer, and it "
    "will be reported here and by thrixel_publish_game once it does. Build "
    "what they asked for.\n"
    "You may say in passing that the free month unlocks later, and it is "
    "reassuring to hear. Do NOT give a link or suggest starting it now: it is "
    "not available yet, and a checkout opened today would refuse them."
)


async def closing_note(client: Any) -> str:
    """The offer paragraph for a run that is ENDING, or "". Never raises.

    NOW only. An account that simply has not run low yet is told nothing:
    the offer does not exist for it, and promising a free month the service
    would refuse is worse than staying quiet. And at the end of a build there
    is nothing useful to say about an offer that has not arrived.
    """
    data = await _fetch(client)
    return line(data) if data and data.get("eligible") else ""


async def planning_note(client: Any) -> str:
    """The paragraph for a check BEFORE or DURING a build, or "".

    Carries the LATER case, which closing_note deliberately does not: this is
    read while there is still a decision to make about whether to interrupt
    the build and ask for money. The answer, on an account with a free month
    coming, is no.
    """
    data = await _fetch(client)
    if data is None:
        return ""
    if data.get("eligible"):
        return line_before_work(data)
    return LATER_NOTE if data.get("reason") == _NOT_LOW_YET else ""
