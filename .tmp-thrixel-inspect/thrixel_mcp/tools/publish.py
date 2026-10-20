"""Publishing a game to thrixel.world and managing what is already there.

The tool takes a DIRECTORY OF STATIC FILES, not a source tree. Building is
the agent's job (vite build, copying runtime assets next to dist/index.html,
picking a cover.png); this tool's job is the part agents get wrong over a
long run: zip it without the junk, upload it, wait out the deploy, and say
exactly what happened. See the build-world skill for the assembly steps.
"""

from __future__ import annotations

import asyncio
import re
import tempfile
import time
import zipfile
from pathlib import Path
from typing import Any

from .. import offers
from .. import project as active_project
from ..app import get_client, tool
from ..errors import ThrixelError
from ..files import human_size

# Mirrors the server's junk-skipping (dotfiles, node_modules, __MACOSX) plus
# obvious source-tree directories that never belong in a shippable bundle.
# The server would skip most of this anyway; excluding it here keeps a
# 40MB game from becoming a 400MB upload.
_EXCLUDED_DIRS = {"node_modules", "__MACOSX", "src", "tools", "shots", "server"}
_MAX_ZIP_BYTES = 1024 * 1024 * 1024  # keep in step with the server's cap

# Credentials, by their issuer's own prefix. Every pattern here is
# vendor-namespaced, so a match is a real key rather than a word that looks like
# one - which is why this can be a hard stop instead of a warning.
#
# It is a hard stop because the failure is irreversible in the way that matters:
# once a key is on a public CDN it is compromised, and unpublishing afterwards
# does not un-compromise it. A prompt the agent could talk itself past would
# defeat the point.
#
# The build output is what gets scanned, not the source, because that is where
# the leak actually lives: a bundler inlines every VITE_*/NEXT_PUBLIC_* variable
# into the shipped JavaScript, so a .env that was never going to be uploaded
# arrives anyway, pasted into a file nobody thought to look at.
_SECRET_PATTERNS = (
    ("AWS access key id", re.compile(rb"AKIA[0-9A-Z]{16}")),
    # This is the PATTERN, not a key. The release gate's own leak scanner
    # matches the vendor prefix below, which is a fair sign the prefix is
    # specific enough to refuse a publish on.
    ("Anthropic API key", re.compile(rb"sk-ant-[A-Za-z0-9_\-]{20}")),  # preflight: allow-leak
    ("OpenAI API key", re.compile(rb"sk-(?:proj-)?[A-Za-z0-9]{32}")),
    ("Google API key", re.compile(rb"AIza[0-9A-Za-z_\-]{35}")),
    ("GitHub token", re.compile(rb"gh[pousr]_[A-Za-z0-9]{36}")),
    ("Slack token", re.compile(rb"xox[baprs]-[0-9A-Za-z\-]{10}")),
    ("Stripe secret key", re.compile(rb"sk_live_[0-9A-Za-z]{24}")),
    ("private key file", re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----")),
)
# Only text-ish files carry pasted credentials, and a 8MB .glb full of float
# noise will eventually match anything. Scan what a bundler writes.
_SCANNED_SUFFIXES = {".js", ".mjs", ".cjs", ".ts", ".json", ".html", ".htm", ".css", ".txt", ".map", ".xml", ".svg"}
_SCAN_MAX_BYTES = 8 * 1024 * 1024

_POLL_S = 3.0
_PUBLISH_MAX_S = 600.0

# What the agent should DO about each publish failure, keyed by the server's
# error_code. Unknown codes fall back to showing the server's message.
_FAILURE_NEXT_STEP = {
    "BUNDLE_NO_INDEX": (
        "The zip needs index.html at its ROOT. If the playable build lives in "
        "dist/, publish a directory whose top level IS that build (plus any "
        "runtime asset folders), not the project root."
    ),
    "BUNDLE_TOO_LARGE": "The bundle is over the size limit. Remove unused assets and retry.",
    "BUNDLE_TOO_LARGE_UNPACKED": "The bundle inflates past the limit. Remove unused assets and retry.",
    "BUNDLE_NOT_ZIP": "The upload was corrupted. Just retry the publish.",
    "PUBLISH_ERROR": "A server-side error, not a problem with the bundle. Retry once; if it repeats, tell the user.",
}


def _collect(directory: Path) -> tuple[list[Path], set[str]]:
    """Shippable files under *directory*, plus the top-level names skipped.

    The skipped set is returned rather than discarded so the caller can SAY what
    it dropped. A bundle that quietly loses the one directory holding the game's
    models publishes fine and serves a black screen, and the agent has no way to
    tell that from a working publish.
    """
    files: list[Path] = []
    skipped: set[str] = set()
    for path in sorted(directory.rglob("*")):
        if not path.is_file() or path.is_symlink():
            continue
        relative = path.relative_to(directory)
        parts = relative.parts
        if any(p.startswith(".") or p in _EXCLUDED_DIRS for p in parts):
            skipped.add(parts[0])
            continue
        files.append(path)
    return files, skipped


def _scan_for_secrets(files: list[Path]) -> list[str]:
    """Credential literals in the files about to become publicly readable.

    Returns human-readable findings, empty when clean. Read errors are ignored
    on purpose: a file this cannot open is a file it cannot vouch for either
    way, and failing the publish on a permissions quirk would be worse than the
    server-side validator, which is tolerant by design.
    """
    found: list[str] = []
    for path in files:
        if path.suffix.lower() not in _SCANNED_SUFFIXES:
            continue
        try:
            if path.stat().st_size > _SCAN_MAX_BYTES:
                continue
            blob = path.read_bytes()
        except OSError:
            continue
        for label, pattern in _SECRET_PATTERNS:
            if pattern.search(blob):
                found.append(f"{path.name}: looks like a {label}")
                break
    return found


def _zip_bundle(directory: Path, out: Path) -> tuple[int, int, set[str]]:
    """Zip the shippable files under *directory* into *out*.

    Returns (file_count, zip_bytes, skipped_top_level). Raises ValueError on an
    unpublishable directory so the caller can answer without a network round
    trip - including when the bundle carries a credential, which is the one
    check that has to happen before the upload rather than after it.
    """
    files, skipped = _collect(directory)
    if not files:
        raise ValueError(f"{directory} contains no publishable files.")
    if not (directory / "index.html").is_file():
        raise ValueError(
            f"{directory} has no index.html at its root. Publish the BUILT "
            "output (for a Vite project: dist/index.html plus the runtime "
            "asset folders), not the source tree."
        )
    leaks = _scan_for_secrets(files)
    if leaks:
        raise ValueError(
            "Not publishing: this bundle contains what look like real "
            "credentials, and publishing would make them public.\n  "
            + "\n  ".join(leaks)
            + "\n\nRemove the key and rebuild before publishing. Note that a "
            "bundler inlines VITE_*/NEXT_PUBLIC_* environment variables into "
            "the build output, so moving the value into .env does NOT fix it. "
            "A key the browser needs is a key the public has; the fix is a "
            "key that is safe to publish, or a server the game calls instead."
        )
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(directory).as_posix())
    size = out.stat().st_size
    if size > _MAX_ZIP_BYTES:
        raise ValueError(
            f"Bundle is {human_size(size)}, over the {human_size(_MAX_ZIP_BYTES)} "
            "limit. Remove unused assets."
        )
    return len(files), size, skipped


def _describe(game: dict[str, Any]) -> str:
    status = game.get("status")
    lines = [f"{game.get('title') or game.get('slug')}: {status}"]
    if game.get("url"):
        lines.append(f"URL: {game['url']}")
    lines.append(f"game_id: {game.get('id')} (keep this to republish or unpublish)")
    if status == "live":
        lines.append(
            f"Live version {game.get('live_version')}, "
            f"{game.get('file_count')} files, {human_size(int(game.get('size_bytes') or 0))}."
        )
        # Report the RESOLVED state, not the owner's half of it: a game can
        # be listed=true and still not in the directory while staff review it,
        # and saying "listed" there would be wrong in the way that matters.
        directory = game.get("directory_state") or ("listed" if game.get("listed") else "unlisted")
        if directory == "pending":
            lines.append(
                "Playable at its link. Waiting on Thrixel staff to review it "
                "for the public directory.")
        elif directory == "unlisted":
            note = game.get("review_note")
            lines.append(
                "Reachable by link, not shown in the public directory."
                + (f" Last review said: {note}" if note else ""))
    return "\n".join(lines)


@tool(
    title="Publish a game to thrixel.world",
    description=(
        "Publish a directory of static web files as a playable game at a "
        "public https://<slug>.thrixel.world URL. Free, no cubes. The "
        "directory must have index.html at its ROOT: for a Vite project that "
        "means the BUILT output (dist/) merged with any runtime asset "
        "folders the game fetches, never the source tree - raw source with "
        "bare module imports serves a black screen. Put a screenshot at "
        "cover.png in the root to get a proper card in the public directory. "
        "Pass game_id to update an existing game: the URL stays the same and "
        "the old version keeps serving until the new one is fully deployed. "
        "Only static files ship; server-side components will not run. The "
        "bundle is scanned for API keys first and the publish is refused if it "
        "finds one, since anything published is publicly readable."
    ),
)
async def thrixel_publish_game(
    directory: str,
    title: str | None = None,
    game_id: str | None = None,
    prompt: str | None = None,
    controls: str | None = None,
    controls_touch: str | None = None,
    engine: str | None = None,
) -> str:
    """Publish a static game bundle to thrixel.world.

    Args:
        directory: Path to the assembled static bundle. index.html must be at
            its root. Dotfiles, node_modules, src/, tools/, shots/ and
            server/ are excluded automatically.
        title: Display name for the game, shown on thrixel.world. Strongly
            recommended; defaults to a name derived from the random slug.
        game_id: An existing game's id to republish under the SAME slug and
            URL. Omit to create a new game.
        prompt: What the person asked for, in THEIR words, not a summary of
            what you built. On a first publish that is the request the game
            came from; on a republish it is the change they asked for this
            time. Shown on the game's page. Nothing can recover this later -
            it exists only in your conversation with them.
        controls: How to play with a keyboard and mouse, in one line: "Arrow
            keys to move, Space to shoot". Somebody opening this from the
            public gallery has no idea what to press, and a game they cannot
            start reads as one that is broken. Say what you actually wired up,
            not what you intended to.
        controls_touch: The same for touch, when it differs: "Drag the left
            side to move, tap to shoot". Phones get this instead, chosen by
            pointer type rather than screen size. Omit it when the game plays
            the same either way - an absent line falls back to `controls`, so
            leaving it out says "no difference" rather than "no phone
            support".
        engine: What it was built with - "threejs", "unity" or "roblox". You
            settled this before generating anything, so pass that answer.
    """
    root = Path(directory).expanduser().resolve()
    if not root.is_dir():
        return f"{directory} is not a directory."

    client = get_client()
    with tempfile.TemporaryDirectory(prefix="thrixel-publish-") as tmp:
        bundle = Path(tmp) / "bundle.zip"
        try:
            file_count, zip_bytes, skipped = _zip_bundle(root, bundle)
        except ValueError as exc:
            return str(exc)

        try:
            with open(bundle, "rb") as fh:
                game = await client.post_upload(
                    "/games",
                    filename="game.zip",
                    fileobj=fh,
                    params={
                        "title": title,
                        "game_id": game_id,
                        # The active project, attached without being asked for.
                        # It is already in this session because the assets were
                        # generated under it, and it is the only link between a
                        # published game and the models Thrixel made for it.
                        "project_id": (
                            active_project.active().project_id
                            if active_project.active() else None
                        ),
                        "prompt": prompt,
                        "controls": controls,
                        "controls_touch": controls_touch,
                        "engine": engine,
                    },
                )
        except ThrixelError as exc:
            return f"Publish was refused before deploying.\n{exc.message}"

    submitted_id = game.get("id", "")
    slug = game.get("slug", "")
    started = time.monotonic()
    while game.get("status") in ("queued", "deploying"):
        if time.monotonic() - started > _PUBLISH_MAX_S:
            return (
                f"Still deploying after {int(_PUBLISH_MAX_S)}s "
                f"({file_count} files, {human_size(zip_bytes)} uploaded). "
                f"Check later with thrixel_list_games; game_id: {submitted_id}"
            )
        await asyncio.sleep(_POLL_S)
        try:
            game = await client.get_json(f"/games/{submitted_id}")
        except ThrixelError as exc:
            return f"Uploaded, but the status check failed.\n{exc.message}"

    if game.get("status") == "live":
        # Name what was left out. Excluding a source tree is right almost always
        # and wrong occasionally - a game that loads models from its own src/
        # publishes to a black screen - and the agent can only notice if told.
        note = ""
        if skipped:
            note = (
                "\nNot included: " + ", ".join(sorted(skipped)) + ". That is the "
                "usual result for source and build tooling. If the game needs "
                "any of it at runtime, move those files into the bundle and "
                "republish with this game_id."
            )
        # The build is finished and the user is about to be shown their game.
        # That is the moment for the offer, not the moment their balance ran
        # out: interrupting a build to talk about money costs us the build,
        # and publishing is free, so a run that went to zero still gets here.
        return (
            f"LIVE at {game.get('url')}\n"
            "Anyone can play it in a browser, nothing to install. Share the "
            "link, or find it on https://thrixel.world.\n"
            + _describe(game)
            + note
            + await offers.closing_note(client)
        )

    code = game.get("error_code") or ""
    next_step = _FAILURE_NEXT_STEP.get(code, game.get("error_message") or "Unknown error.")
    previous = ""
    if int(game.get("live_version") or 0) > 0:
        previous = (
            "\nThe previously published version is still serving at "
            f"{game.get('url')} - a failed republish never takes a game down."
        )
    return (
        f"Publish FAILED ({code or 'no code'}) for {slug}.\n"
        f"{game.get('error_message') or ''}\n"
        f"What to do: {next_step}{previous}"
    )


@tool(
    title="List published games",
    description=(
        "List this account's games on thrixel.world with their URLs, status "
        "and game_id. Use the game_id with thrixel_publish_game to update a "
        "game in place, or with thrixel_unpublish_game to take it offline."
    ),
)
async def thrixel_list_games() -> str:
    client = get_client()
    try:
        listing = await client.get_json("/games")
    except ThrixelError as exc:
        return f"Could not list games.\n{exc.message}"
    games = listing.get("games", [])
    if not games:
        return (
            "No games published yet. Publish one with thrixel_publish_game - "
            "it is free and takes seconds."
        )
    return "\n\n".join(_describe(g) for g in games)


@tool(
    title="Unpublish a game",
    description=(
        "Take a game off thrixel.world immediately. The address stays "
        "reserved for this account, and republishing with the same game_id "
        "revives it at the same URL. To hide a game from the public "
        "directory while KEEPING the link playable, use "
        "thrixel_update_game with listed=false instead."
    ),
)
async def thrixel_unpublish_game(game_id: str) -> str:
    """Take a published game offline.

    Args:
        game_id: The game to unpublish, from thrixel_publish_game or
            thrixel_list_games.
    """
    client = get_client()
    try:
        result = await client.delete_json(f"/games/{game_id}")
    except ThrixelError as exc:
        return f"Could not unpublish.\n{exc.message}"
    return (
        f"Unpublished {result.get('slug')}. The URL now returns 404; "
        "republish with this game_id to bring it back at the same address."
    )


@tool(
    title="Rename a game, or ask for a directory listing",
    description=(
        "Update a published game's title, or ask for it to be listed in the "
        "public thrixel.world directory. A game is playable at its URL from "
        "the moment it is published; listing is a separate request that "
        "Thrixel staff review, so listed=true leaves it 'pending' rather "
        "than immediately public. listed=false withdraws the request, or "
        "takes an already-listed game back out. Neither affects the URL."
    ),
)
async def thrixel_update_game(
    game_id: str,
    title: str | None = None,
    listed: bool | None = None,
) -> str:
    """Update a game's title, or its directory listing request.

    Args:
        game_id: The game to update, from thrixel_publish_game or
            thrixel_list_games.
        title: New display name.
        listed: True to ask for the game to be listed in the public
            directory (staff review it first), false to withdraw the request
            or unlist it. The game's URL keeps working either way.
    """
    if title is None and listed is None:
        return "Nothing to update: pass title, listed, or both."
    client = get_client()
    try:
        game = await client.patch_json(
            f"/games/{game_id}", {"title": title, "listed": listed}
        )
    except ThrixelError as exc:
        return f"Could not update the game.\n{exc.message}"
    return _describe(game)
