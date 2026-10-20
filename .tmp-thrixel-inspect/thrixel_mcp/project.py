"""The active project, for the life of one server process.

Everything a game generates belongs together, and the API has always accepted a
``project_id`` on every submission. The problem was never the API, it was who
had to remember: an agent building a whole game makes roughly thirty generation
calls across eight tools, and one that has to thread an id through all of them
will eventually miss one. A missed one is invisible - the asset generates fine
and simply lands unfiled, which nobody notices until they open the web app and
find one flat pile.

So the decision is made once and applied at the single point every submission
passes through. This is the only state the server keeps, and it is kept
deliberately narrow:

* **Process-scoped, never written to disk.** It describes what this session is
  building, not anything about the account. A project quietly restored from a
  file and attached to next week's different game would be worse than having no
  default at all.
* **An explicit ``project_id`` on a call always wins.** The default fills a gap;
  it never overrides an intent the caller actually expressed.
* **Nothing here decides anything.** The service still owns what a project is,
  who may write to it, and whether the id is real. This module holds a value.

A direct API caller can do everything this enables by passing ``project_id``
themselves, which is the line this must not cross.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ActiveProject:
    """The project new submissions are filed under by default."""

    project_id: str
    name: str


_active: ActiveProject | None = None


def set_active(project_id: str, name: str) -> ActiveProject:
    """Make ``project_id`` the default for subsequent submissions."""
    global _active
    _active = ActiveProject(project_id=project_id, name=name)
    return _active


def clear() -> None:
    """Stop filing new submissions under any project."""
    global _active
    _active = None


def active() -> ActiveProject | None:
    return _active


def active_id() -> str | None:
    return _active.project_id if _active else None


def describe(project_id: str | None) -> str | None:
    """Render ``project_id`` for a tool result, naming it when we can.

    Takes the id the submission actually carried rather than reading the
    active project directly: a caller that passed a different project
    explicitly must not be told their asset went somewhere else.
    """
    if not project_id:
        return None
    if _active and _active.project_id == project_id:
        return _active.name
    return project_id
