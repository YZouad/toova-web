"""Writing generated assets to the user's project directory.

The reason a *local* MCP server is worth building at all: it can put the GLB
where the game code expects it, instead of handing the agent a URL and hoping
it downloads the file correctly.
"""

from __future__ import annotations

import base64
import io
import re
from pathlib import Path

from PIL import Image as PILImage

from .config import Config

# Thumbnails go into the model's context, so they are downscaled hard.  512px
# is enough to judge "is this the right object, is it broken" - which is all
# the agent needs - without spending thousands of tokens per job.
THUMBNAIL_MAX_PX = 512

_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def slugify(text: str | None, fallback: str = "model") -> str:
    """Turn a prompt or display name into a filesystem-safe stem."""
    if not text:
        return fallback
    slug = _SLUG_STRIP.sub("-", text.strip().lower()).strip("-")
    if not slug:
        return fallback
    # Long prompts make unusable filenames; cut on a word boundary.
    if len(slug) > 48:
        slug = slug[:48].rsplit("-", 1)[0] or slug[:48]
    return slug


def ensure_output_dir(config: Config) -> Path:
    config.output_dir.mkdir(parents=True, exist_ok=True)
    return config.output_dir


# Extensions that make a `dest` name a FILE rather than a directory. Anything
# else is still read as a directory, so every existing caller keeps working.
_FILE_SUFFIXES = {".glb", ".fbx", ".stl", ".usdz", ".zip", ".obj", ".png", ".jpg", ".jpeg"}


def check_dest(config: Config, dest: str | None) -> None:
    """Reject an unusable ``dest`` WITHOUT touching the filesystem.

    Split out of :func:`resolve_dest` so it can run at submission time rather
    than in the write path. Validating only on write means an unusable ``dest``
    is discovered AFTER the job has been generated and charged: minutes of
    waiting and a real cube balance spent, for zero files on disk. The check is
    a pure string comparison against the output root and costs nothing, so
    there is no reason for it to happen anywhere but first.

    Creating directories is deliberately NOT done here - a validation call
    should not leave anything behind on disk when the job it precedes never
    runs.
    """
    if not dest:
        return
    base = ensure_output_dir(config).resolve()
    _confine(base, dest)


def _confine(base: Path, dest: str) -> Path:
    """The sandbox rule, in one place: *dest* must land inside *base*.

    A tool argument is model-controlled text, so an absolute path or a
    ``../..`` is a live possibility rather than a hypothetical one.
    """
    candidate = (base / dest).resolve()
    if candidate != base and base not in candidate.parents:
        raise ValueError(
            f"Refusing to write outside {base}. 'dest' must be a relative "
            "path inside the output directory - absolute paths are refused, "
            "including ones that point back inside it."
        )
    return candidate


def resolve_dest(config: Config, dest: str | None) -> Path:
    """Resolve a caller-supplied destination DIRECTORY, creating it."""
    base = ensure_output_dir(config).resolve()
    if not dest:
        return base
    candidate = _confine(base, dest)
    candidate.mkdir(parents=True, exist_ok=True)
    return candidate


def dest_file(config: Config, dest: str | None) -> Path | None:
    """The explicit file path *dest* names, or None if it names a directory.

    ``dest="raw/keep.glb"`` names a FILE. It must not be read as a directory
    to drop an auto-named file inside: "destination" plus a path ending in a
    file extension has one reasonable reading, and that is not it.

    Getting this wrong is worse for agents than for people. The written path
    becomes unpredictable, so a script cannot know where its own asset landed
    without re-listing, and an auto-name derived from the prompt head means a
    set of assets sharing a style prefix all collide on one name.
    """
    if not dest:
        return None
    base = ensure_output_dir(config).resolve()
    candidate = _confine(base, dest)
    if candidate.suffix.lower() not in _FILE_SUFFIXES:
        return None
    candidate.parent.mkdir(parents=True, exist_ok=True)
    return candidate


def unique_path(directory: Path, stem: str, suffix: str) -> Path:
    """Return a free path, appending -2, -3 ... rather than overwriting.

    A game project generates many variants of the same prompt; silently
    clobbering the previous one would lose work the agent may still reference.
    """
    candidate = directory / f"{stem}{suffix}"
    if not candidate.exists():
        return candidate
    for n in range(2, 1000):
        candidate = directory / f"{stem}-{n}{suffix}"
        if not candidate.exists():
            return candidate
    raise RuntimeError(f"Could not find a free filename for {stem}{suffix}")


def save_asset(
    config: Config,
    content: bytes,
    *,
    stem: str,
    suffix: str,
    dest: str | None = None,
) -> Path:
    """Write bytes to the output directory and return the path used.

    An explicit file path in *dest* wins over the derived name: the caller
    asked for that exact path and a script downstream is going to look for it
    there. Only the auto-named case gets uniquified, because only it can
    collide by accident.
    """
    explicit = dest_file(config, dest)
    if explicit is not None:
        explicit.write_bytes(content)
        return explicit
    directory = resolve_dest(config, dest)
    path = unique_path(directory, stem, suffix)
    path.write_bytes(content)
    return path


def shrink_thumbnail(content: bytes) -> tuple[bytes, str]:
    """Downscale a rendered thumbnail for return as MCP image content.

    Returns (png_bytes, "png").  Falls back to the original bytes if the image
    cannot be decoded - a broken thumbnail should never fail a job that
    actually succeeded.
    """
    try:
        with PILImage.open(io.BytesIO(content)) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX))
            out = io.BytesIO()
            img.save(out, format="PNG", optimize=True)
            return out.getvalue(), "png"
    except Exception:
        return content, "png"


# ── Reading images IN ──────────────────────────────────────────────────
#
# The mirror of everything above. Writing assets out is why a local server is
# worth running; reading the user's own reference images in is that same
# argument pointed the other way.
#
# An agent working in a repo does not hold a data URI. It holds a path, because
# it just wrote the file or the user just pointed at one. A path must therefore
# be resolved HERE, because it does not fail cleanly further down: send one
# where base64 is expected and b64decode, which defaults to validate=False,
# silently drops every character outside its alphabet - a Windows path loses
# its ':', '-' and '.' and the survivors decode into noise rather than an
# error. The API rejects a path outright now and says what to send instead, but
# an agent should never have to see that error: reading the file is precisely
# what a local server is placed to do.

# Matches the API's own ceiling for an inline image.
MAX_IMAGE_BYTES = 12 * 1024 * 1024

_PASSTHROUGH_PREFIXES = ("data:", "http://", "https://")


def to_image_reference(value: str) -> str:
    """Normalise one image argument into something the API accepts.

    A ``data:`` URI or an http(s) URL passes through untouched. Anything else
    is treated as a path on this machine, read, and returned as a data URI.

    Raises ThrixelError rather than ValueError because the text goes straight
    back to the agent, and "no image file at <path>" is actionable where a
    traceback is not.
    """
    from .errors import ThrixelError

    if not isinstance(value, str) or not value.strip():
        raise ThrixelError("An image argument was empty.")

    candidate = value.strip()
    if candidate.lower().startswith(_PASSTHROUGH_PREFIXES):
        return candidate

    path = Path(candidate).expanduser()
    try:
        resolved = path.resolve()
    except OSError as exc:  # pragma: no cover - platform dependent
        raise ThrixelError(f"Could not resolve the image path {candidate!r}: {exc}") from exc

    if not resolved.exists():
        raise ThrixelError(
            f"No image file at {resolved}. Pass a path to a file on this machine, "
            f"an http(s) URL, or a data: URI."
        )
    if not resolved.is_file():
        raise ThrixelError(f"{resolved} is a directory, not an image file.")

    size = resolved.stat().st_size
    if size > MAX_IMAGE_BYTES:
        raise ThrixelError(
            f"{resolved.name} is {human_size(size)}, over the "
            f"{MAX_IMAGE_BYTES // 1024 // 1024} MB limit. Downscale it first."
        )

    raw = resolved.read_bytes()

    # Decode it rather than trusting the extension. A .png that is really a
    # text file would otherwise reach a GPU worker before anyone noticed,
    # which is the exact latency this function exists to remove.
    try:
        with PILImage.open(io.BytesIO(raw)) as probe:
            fmt = (probe.format or "PNG").lower()
            probe.verify()
    except Exception as exc:
        raise ThrixelError(
            f"{resolved.name} is not a readable image ({type(exc).__name__}). "
            f"Check the file, or pass a different one."
        ) from exc

    mime = "jpeg" if fmt in ("jpg", "jpeg") else fmt
    return f"data:image/{mime};base64,{base64.b64encode(raw).decode('ascii')}"


def to_image_references(values: list[str] | None) -> list[str] | None:
    """:func:`to_image_reference` over a list, preserving None."""
    if values is None:
        return None
    return [to_image_reference(v) for v in values]


def human_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"
    if num_bytes < 1024 * 1024:
        return f"{num_bytes / 1024:.0f} KB"
    return f"{num_bytes / (1024 * 1024):.1f} MB"
