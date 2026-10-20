"""Progress rendering and smoothing.

Reported progress arrives unevenly: a long quiet stretch while one stage runs,
then several readings inside the same second. Passed straight through, that is a
bar that freezes and then teleports, and neither tells the user anything useful.

This module keeps the service as the source of truth for *where* the job is and
takes responsibility only for *how that is displayed*:

* **Monotonic** - the bar never moves backwards, even if the service re-reports
  a lower number after a reconnect.
* **Eased** - a jump from 10 to 55 walks there over about a second instead of
  teleporting, so the movement reads as progress rather than a glitch.
* **Drift while waiting** - during a long silence the bar creeps forward toward,
  but never past, a bounded ceiling above the last real reading. This says
  "still working" without inventing progress the service never reported.
* **100% only on completion** - drift and easing are both capped below the end,
  so a full bar always means the job actually finished.
* **Deduplicated** - nothing is emitted unless the rendered line changed, which
  collapses a burst of near-simultaneous readings into one update.
"""

from __future__ import annotations

import asyncio
import time
from typing import Protocol

BAR_WIDTH = 20
FILLED, EMPTY = "█", "░"

# How often the ticker re-renders. Fast enough to look animated, slow enough
# that a long job does not spam the client with notifications.
TICK_S = 0.4

# Easing: the most the bar may advance per second when catching up to a real
# reading. 55 percentage points at this rate takes ~1.4s, which reads as motion.
CATCH_UP_PER_S = 40.0

# Drift: while the backend says nothing, creep forward this fast, but never more
# than DRIFT_CEILING points beyond the last real reading. Bounded on purpose -
# an unbounded crawl would eventually show 99% for a job that has actually hung.
DRIFT_PER_S = 0.6
DRIFT_CEILING = 12.0

# Only start drifting after the backend has actually gone quiet this long.
# Without this the bar creeps past a reading the moment it arrives, which is
# both dishonest and makes the number disagree with the backend for no reason.
DRIFT_AFTER_S = 3.0

# Never display this much or more until the job is genuinely done.
MAX_BEFORE_DONE = 97.0


class _Ctx(Protocol):
    async def report_progress(
        self, progress: float, total: float | None = None, message: str | None = None
    ) -> None: ...


def render_bar(pct: float, width: int = BAR_WIDTH) -> str:
    """Return e.g. ``[████████░░░░░░░░░░░░]  42%``."""
    pct = max(0.0, min(100.0, pct))
    filled = int(round(pct / 100.0 * width))
    return f"[{FILLED * filled}{EMPTY * (width - filled)}] {pct:3.0f}%"


def format_line(pct: float, message: str | None = None) -> str:
    bar = render_bar(pct)
    return f"{bar}  {message}" if message else bar


class ProgressReporter:
    """Smooths backend progress readings into an evenly-moving bar.

    Usage::

        async with ProgressReporter(ctx) as p:
            ...
            await p.observe(55, "Processing")   # a real backend reading
            ...
            await p.finish("Complete")
    """

    def __init__(self, ctx: _Ctx | None, *, total: float = 100.0):
        self._ctx = ctx
        self._total = total
        self._target = 0.0        # latest real reading (monotonic)
        self._shown = 0.0         # what the user currently sees
        self._message: str | None = None
        self._last_real_at = time.monotonic()
        self._last_advance_at = time.monotonic()
        self._last_line: str | None = None
        self._ticker: asyncio.Task[None] | None = None
        self._seen_any = False
        self._done = False

    # ── lifecycle ───────────────────────────────────────────────────────

    async def __aenter__(self) -> "ProgressReporter":
        if self._ctx is not None:
            self._ticker = asyncio.create_task(self._tick_loop())
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.close()

    async def close(self) -> None:
        if self._ticker is not None:
            self._ticker.cancel()
            try:
                await self._ticker
            except (asyncio.CancelledError, Exception):
                pass
            self._ticker = None

    # ── input ───────────────────────────────────────────────────────────

    async def observe(self, progress: float | None, message: str | None = None) -> None:
        """Record a real backend reading."""
        if message:
            self._message = message
        if progress is not None:
            # Monotonic: a reconnect that re-reports an earlier percentage must
            # not drag the bar backwards.
            self._target = max(self._target, float(progress))
            if not self._seen_any:
                # Nothing to ease *from* on the first reading, and showing 0%
                # when the backend already said 30% is simply wrong.
                self._shown = min(self._target, MAX_BEFORE_DONE)
                self._seen_any = True
        self._last_real_at = time.monotonic()
        self._step()
        await self._emit()

    async def finish(self, message: str | None = "Complete") -> None:
        """Jump to 100% - the only place that is allowed to."""
        self._done = True
        self._target = 100.0
        self._shown = 100.0
        if message:
            self._message = message
        await self._emit(force=True)
        await self.close()

    # ── output ──────────────────────────────────────────────────────────

    def _step(self) -> None:
        """Advance by however long it has been since the last advance.

        Driven by wall clock rather than tick count so the bar behaves the same
        whether the ticker is running or ``observe`` is being called directly.
        """
        now = time.monotonic()
        self._advance(now - self._last_advance_at)
        self._last_advance_at = now

    def _advance(self, elapsed: float) -> None:
        """Move ``_shown`` toward ``_target``, or drift if there is no news."""
        if self._done:
            self._shown = 100.0
            return

        ceiling = min(self._target, MAX_BEFORE_DONE)

        if self._shown < ceiling:
            # Catching up to a real reading.
            self._shown = min(ceiling, self._shown + CATCH_UP_PER_S * elapsed)
            return

        # Caught up. Drift only once the backend has genuinely gone quiet, so
        # the displayed number stays equal to the last reading while updates
        # are still flowing.
        if time.monotonic() - self._last_real_at < DRIFT_AFTER_S:
            return
        drift_cap = min(self._target + DRIFT_CEILING, MAX_BEFORE_DONE)
        if self._shown < drift_cap:
            self._shown = min(drift_cap, self._shown + DRIFT_PER_S * elapsed)

    async def _emit(self, force: bool = False) -> None:
        if self._ctx is None:
            return
        line = format_line(self._shown, self._message)
        if not force and line == self._last_line:
            return          # collapses bursts that render identically
        self._last_line = line
        try:
            await self._ctx.report_progress(self._shown, self._total, line)
        except Exception:
            # A client that cannot take notifications must not break the job.
            pass

    async def _tick_loop(self) -> None:
        try:
            while not self._done:
                await asyncio.sleep(TICK_S)
                self._step()
                await self._emit()
        except asyncio.CancelledError:
            raise


def summarize(pct: float, message: str | None = None) -> str:
    """One-line bar for inclusion in a tool's final text output."""
    return format_line(pct, message)
