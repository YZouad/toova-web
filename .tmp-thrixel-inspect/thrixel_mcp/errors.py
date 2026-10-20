"""HTTP failures -> text an agent can act on.

The agent never sees a status code; it sees a sentence telling it what to do
next.  This is the difference between an agent retrying sensibly and an agent
silently abandoning a step, which is the failure mode this server exists to fix.
"""

from __future__ import annotations

import httpx

from .config import API_KEYS_HINT
from .pricing import COST_SUMMARY


class ThrixelError(RuntimeError):
    """A failure already phrased for the agent.

    Attributes:
        message: Agent-facing text. Says what happened AND what to do next.
        retryable: True when simply waiting and retrying could succeed.
        status: Originating HTTP status, when there was one.
    """

    def __init__(self, message: str, *, retryable: bool = False, status: int | None = None):
        super().__init__(message)
        self.message = message
        self.retryable = retryable
        self.status = status


def _detail(response: httpx.Response) -> str:
    """Pull FastAPI's `detail` out of a response body.

    Our backend writes genuinely actionable detail strings ("You have 2 jobs
    already running..."), so preferring them over anything we could invent is
    usually right.
    """
    try:
        payload = response.json()
    except Exception:
        return (response.text or "").strip()[:400]

    if isinstance(payload, dict):
        detail = payload.get("detail")
        if isinstance(detail, str):
            return detail
        if isinstance(detail, list):
            # Pydantic validation errors: [{loc: [...], msg: "..."}, ...]
            parts = []
            for item in detail:
                if not isinstance(item, dict):
                    continue
                loc = ".".join(str(x) for x in item.get("loc", []) if x != "body")
                msg = item.get("msg", "invalid")
                parts.append(f"{loc}: {msg}" if loc else msg)
            if parts:
                return "; ".join(parts)
        # A structured rejection: the backend's guards answer with
        # {code, verdict, message} and the message is written FOR the person
        # who has to act on it. str() on the dict would hand the agent a
        # Python repr of our internals and bury the one sentence that says
        # what to change.
        if isinstance(detail, dict):
            message = detail.get("message") or detail.get("msg")
            if message:
                return str(message)
        if detail is not None:
            return str(detail)
    return (response.text or "").strip()[:400]


def translate(response: httpx.Response) -> ThrixelError:
    """Map a non-2xx response onto a ThrixelError."""
    status = response.status_code
    detail = _detail(response)

    if status == 401 or (status == 403 and "api key" in detail.lower()):
        return ThrixelError(
            "Thrixel rejected the API key - invalid or revoked. Usually stale: "
            "signing in again on any machine revokes the previous key.\n\n"
            "Tell the user to run this in their own terminal, and say plainly "
            "that generation is blocked until they do:\n"
            "    uvx thrixel-mcp@latest login\n"
            "It re-authenticates on its own; --force is not needed. Do NOT run "
            "it yourself - it blocks until a human clicks Approve.\n\n"
            "If THRIXEL_API_KEY is set in the MCP client config it wins over "
            "anything login stores, so it must be removed or updated instead. "
            "A valid key starts with 'sk-thrixel-'.",
            status=status,
        )

    if status == 402:
        return ThrixelError(
            f"{detail} Out of cubes, so no further generation will run. "
            f"Costs: {COST_SUMMARY}. "
            "This is not a reason to abandon the build. FINISH IT with the "
            "assets that already exist: assembling, wiring up and publishing "
            "a game all cost nothing, and a delivered vertical slice is worth "
            "more to the user than a half-built one plus an apology. "
            "thrixel_reduce_triangles and rebakes are free too. "
            "Deliver first, then say which assets are still unbuilt. If they "
            "want to carry on from there, thrixel_pricing lists the top-up "
            "packs and thrixel_upgrade_plan returns a checkout link - both "
            "free to call, neither charges anything.",
            status=status,
        )

    if status == 403:
        return ThrixelError(
            f"Thrixel refused this request: {detail}",
            status=status,
        )

    if status == 404:
        return ThrixelError(
            f"{detail} Check the submission_id - it must be one returned by an "
            "earlier Thrixel tool call.",
            status=status,
        )

    if status == 409:
        return ThrixelError(
            f"{detail} This is temporary; retry in a few seconds.",
            retryable=True,
            status=status,
        )

    if status == 429:
        return ThrixelError(
            f"{detail} Call thrixel_account_status to see your limit, or wait "
            "for a running job to finish before submitting more.",
            retryable=True,
            status=status,
        )

    if status in (400, 422):
        return ThrixelError(
            f"Thrixel rejected the request: {detail}",
            status=status,
        )

    if status >= 500:
        return ThrixelError(
            f"Thrixel returned a server error ({status}). {detail} "
            "This is usually transient - retry shortly.",
            retryable=True,
            status=status,
        )

    return ThrixelError(f"Thrixel request failed ({status}). {detail}", status=status)


def translate_transport(exc: Exception, api_base: str) -> ThrixelError:
    """Map a connection-level failure (no response at all)."""
    if isinstance(exc, httpx.TimeoutException):
        return ThrixelError(
            f"Request to {api_base} timed out. Retry, or raise THRIXEL_TIMEOUT_S "
            "if this happens on long generation jobs.",
            retryable=True,
        )
    return ThrixelError(
        f"Could not reach Thrixel at {api_base} ({type(exc).__name__}). "
        "Check the network and THRIXEL_API_BASE.",
        retryable=True,
    )
