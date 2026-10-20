"""Fetching a finished model in a specific file format."""

from __future__ import annotations

import asyncio
import json

from ..app import get_client, get_config, tool
from ..errors import ThrixelError
from ..files import human_size, save_asset, slugify
from ..jobs import resolve_name

# Extensions the API actually produces.  OBJ ships as a zip because a bare .obj
# is useless without its .mtl and texture files.
_EXTENSIONS = {
    "glb": ".glb",
    "fbx": ".fbx",
    "obj": ".obj.zip",
    "stl": ".stl",
    "usdz": ".usdz",
}

# Mirrors backend GLB_VARIANT_SUFFIX. Only used to name a conversion job.
_VARIANT_SUFFIX = {
    (False, False): "",
    (True, False): "-webp",
    (False, True): "-draco",
    (True, True): "-web",
}

_CONVERT_POLL_S = 3.0
_CONVERT_MAX_S = 300.0


def _queued_job_id(content: bytes) -> str | None:
    """Read the job id out of a 202 body, if that is what we were handed.

    ``/download`` answers a not-yet-built variant with 202 and a JSON body
    describing the job it just queued, and ``get_bytes`` hands that back
    verbatim. Reusing that id is not merely cheaper than posting our own
    ``/convert``: the two endpoints do not agree on the vocabulary. ``/convert``
    accepts ``glb-web`` only, so asking it for the webp-without-draco build -
    which is exactly what a three.js user is told to ask for - is a request it
    cannot express, whereas the job already queued for us is for the right
    variant by construction.
    """
    # Sniff a bounded prefix rather than lstrip()ing the whole body: this is
    # handed multi-megabyte GLBs on the happy path.
    if not content[:64].lstrip().startswith(b"{"):
        return None
    try:
        return json.loads(content).get("job_id")
    except (ValueError, AttributeError):
        return None


async def _await_conversion(submission_id: str, fmt: str, job_id: str | None = None) -> None:
    """Wait for an on-demand conversion to finish, queueing one if needed.

    Non-GLB formats and the compressed GLB variants are produced lazily: the
    first request queues a job and returns 202, and the file only exists once
    that job completes.
    """
    client = get_client()
    if job_id:
        status = "pending"
    else:
        # The field is submission_id; entity_id is what the job row calls it
        # internally, and posting that name is a 422 the agent cannot act on.
        job = await client.post_json(
            "/convert", {"submission_id": submission_id, "format": fmt}
        )
        job_id = job.get("job_id")
        status = job.get("status")

    loop = asyncio.get_running_loop()
    started = loop.time()

    while status not in ("completed", "failed"):
        if loop.time() - started > _CONVERT_MAX_S:
            raise ThrixelError(
                f"Converting to {fmt.upper()} took longer than "
                f"{_CONVERT_MAX_S:.0f}s. Retry, or download format='glb'."
            )
        await asyncio.sleep(_CONVERT_POLL_S)
        job = await client.get_json(f"/convert/{job_id}")
        status = job.get("status")

    if status == "failed":
        raise ThrixelError(
            f"Converting to {fmt.upper()} failed: {job.get('error') or 'no detail given'}. "
            "GLB is always available as a fallback."
        )


@tool(
    title="Download a 3D model",
    description=(
        "Save a finished model to disk in a specific format.\n\n"
        "dest is RELATIVE to the output directory, always. Give it a directory "
        "('public/models') and the filename is derived from the model; give it "
        "a path ending in the format's extension ('public/models/keep.glb') and "
        "that exact file is written - use this when a script needs to know "
        "where the asset landed. Absolute paths are refused.\n\n"
        "Most tools already save a GLB automatically, so you only need this to "
        "get a different format, or to re-save a model from an earlier session. "
        "Every format is available on every plan at no extra cost. GLB is the "
        "right choice for web and Three.js and is served directly; FBX, OBJ, "
        "STL and USDZ are converted on demand, so the first request for one "
        "takes longer.\n\n"
        "BUILDING A THREE.JS OR BROWSER GAME: pass textures='webp'. Same model - "
        "same parts, same triangle count, same bounds - with WebP textures "
        "instead of PNG. Measured: a texture-heavy model goes 18.3MB -> 0.95MB, "
        "a geometry-heavy one 7.0MB -> 6.3MB. Browsers decode WebP natively, so "
        "there is nothing to install and nothing to wire up. Use it for every "
        "asset headed to a web page.\n\n"
        "draco=True additionally compresses the GEOMETRY, which only pays off on "
        "models that are mostly geometry (6.3MB -> 1.2MB on the example above; "
        "about 4% on a texture-heavy one). It needs a Draco decoder on the other "
        "end: three.js requires DRACOLoader to be set up explicitly. A reader "
        "WITHOUT one does not error, it loads every vertex at the origin, so the "
        "failure surfaces later as an empty scene. Leave it off unless you know "
        "the consumer decodes Draco, and never use it for a model going into "
        "Unity, Unreal, a modelling tool, or back into another pipeline."
    ),
)
async def thrixel_download(
    submission_id: str,
    format: str = "glb",
    dest: str | None = None,
    textures: str = "png",
    draco: bool = False,
) -> str:
    """Download a completed model.

    Args:
        submission_id: The model to download.
        format: One of glb, fbx, obj, stl, usdz.
        dest: Where to save, relative to the output directory. A directory
            ("public/models") derives the filename from the model; a path
            ending in the format's extension writes exactly that file.
            Absolute paths are refused.
        textures: GLB only. "png" (default) or "webp". Use webp for the browser.
        draco: GLB only. Geometry compression. Only for consumers that decode it.
    """
    fmt = format.lower().strip()
    if fmt not in _EXTENSIONS:
        raise ValueError(
            f"Unsupported format {format!r}. Choose one of: {', '.join(_EXTENSIONS)}."
        )

    tex = textures.lower().strip()
    if tex not in ("png", "webp"):
        raise ValueError(f"textures must be 'png' or 'webp', not {textures!r}.")
    web_variant = tex == "webp" or draco
    if web_variant and fmt != "glb":
        raise ValueError(
            "textures and draco only apply to GLB - WebP and Draco are glTF "
            f"extensions and have no meaning in {fmt.upper()}."
        )
    # Two knobs, not one flag: they compress different halves of the file and the
    # right answer differs per model, which the tool description explains.
    variant = {"textures": tex, "draco": "true" if draco else "false"} if web_variant else {}
    # The convert API addresses variants by name; the download API by knobs.
    convert_fmt = f"glb{_VARIANT_SUFFIX[(tex == 'webp', draco)]}" if web_variant else fmt

    client = get_client()
    info = await client.get_json(f"/{submission_id}/info")
    if info.get("status") != "completed":
        raise ThrixelError(
            f"{submission_id} is '{info.get('status')}', not completed - "
            "there is nothing to download yet."
        )

    name = await resolve_name(client, info, "model")
    stem = slugify(name, "model")

    try:
        content, _ = await client.get_bytes(
            f"/{submission_id}/download", format=fmt, **variant
        )
    except ThrixelError as exc:
        # A missing non-GLB file means it has not been converted yet, not that
        # it is unavailable.  403 is a real tier gate and must surface as-is.
        if (fmt == "glb" and not web_variant) or exc.status != 404:
            raise
        if web_variant:
            # GLB variants are queued by the download endpoint itself, which
            # answers 202 rather than 404 - so a 404 here is not "not built
            # yet". Posting to /convert would fail anyway: it only names the
            # webp+draco build, so a webp-only request has no spelling there.
            raise ThrixelError(
                f"{submission_id} has no {tex} GLB and one cannot be built. "
                "Download it with textures='png'."
            ) from exc
        await _await_conversion(submission_id, convert_fmt)
        content, _ = await client.get_bytes(
            f"/{submission_id}/download", format=fmt, **variant
        )

    # A queued conversion answers 202 with a JSON body, and get_bytes returns
    # the body of any non-error response verbatim - so without this check the
    # agent saves a .glb containing {"job_id": ...} and only finds out when
    # something downstream fails to parse it. Every GLB starts with "glTF";
    # scoped to GLB because no other format here has a magic we can assert
    # (an .obj.zip starts with "PK", a .usdz likewise, an .stl with anything).
    if fmt == "glb" and not content.startswith(b"glTF"):
        await _await_conversion(
            submission_id, convert_fmt, job_id=_queued_job_id(content)
        )
        content, _ = await client.get_bytes(
            f"/{submission_id}/download", format=fmt, **variant
        )
        if not content.startswith(b"glTF"):
            raise ThrixelError(
                f"{submission_id} did not return a GLB after conversion "
                "finished. Retry, or download with textures='png'."
            )

    path = save_asset(
        get_config(), content, stem=stem, suffix=_EXTENSIONS[fmt], dest=dest
    )
    return f"Saved: {path} ({human_size(len(content))})"
