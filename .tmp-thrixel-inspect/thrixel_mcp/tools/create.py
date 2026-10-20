"""Root generation — Architect (editable parts) and Sculptor (single mesh)."""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context

from ..app import image_tool
from ..pricing import ARCHITECT_COST_NOTE, GPU_OP_CUBES, REF_IMAGE_NOTE
from ..errors import ThrixelError
from ..files import to_image_reference, to_image_references
from ..jobs import deliver, submit_and_wait

# The quality tiers this tool offers. The API accepts other values; these are
# the two worth exposing to an agent, which chooses without a human in the loop.
# A cheaper tier saves least on exactly the complex assets a player looks at, so
# offering it trades visible quality for very little.
_QUALITY_MODELS = {
    "balanced": "architect-balanced",
    "plus": "architect-plus",
}

_ARCHITECT_NEXT = (
    "Next: thrixel_detail_model for high-resolution geometry and PBR texture, "
    "thrixel_edit_model to change something, or use the GLB as-is if a blockout "
    "is what you wanted."
)

_SCULPTOR_NEXT = (
    "Next: thrixel_reduce_triangles to hit a triangle budget (free), or "
    "thrixel_retexture_model to restyle it. A detail pass is optional here - "
    "Sculptor output is already dense and textured."
)


@image_tool(
    title="Create a 3D model",
    description=(
        "Create a 3D model from a text description, optionally guided by "
        "reference images. This is the default way to make a game prop, "
        "vehicle, building, weapon or piece of furniture.\n\n"
        "Output is a rough but EDITABLE multi-part mesh: parts are separate, "
        "named nodes you can transform, animate or retexture individually. "
        "Each part's origin sits at that part's own centre, so a part can be "
        "rotated or animated directly with no re-pivoting: right for a rotor, "
        "a wheel or a turret. A hinge is the exception - a door or lid wants "
        "its pivot on its edge, which you set in your engine.\n\n"
        "CHOOSE BY ASKING: does any part of this asset have to move on its own? "
        "Wheels, sails, turrets, doors, lids, limbs, propellers. If yes, use "
        "this tool - it is the ONLY one that produces separate parts, and a "
        "merged mesh can never be un-merged afterwards. Follow with "
        "thrixel_detail_model if it also has to look finished; the hierarchy "
        "survives that pass at the default adherence_level of 9.\n\n"
        "If nothing needs to move and the subject is organic, "
        "thrixel_sculpt_model gives a better result for fewer cubes.\n\n"
        "Waits for the job to finish, saves the GLB, and returns the file path "
        "plus a rendered thumbnail. Look at the thumbnail before building on "
        "the result.\n\n"
        "Describe the object itself, not the request: 'a weathered wooden "
        "market stall with a striped awning' works, 'make me a stall' does not.\n\n"
        "REPEATED SURFACE FEATURES are broken into separate meshes by default. "
        "Ask for cooling slots, roof shingles, tyre tread, rivets or scales and "
        "you get one mesh per element, which multiplies the part count and, on "
        "anything that must be watertight, leaves seams that tear open during "
        "thrixel_detail_model. To prevent it, say so in the prompt: \"the tread "
        "is cut into the tyre's own continuous surface as ONE mesh, not "
        "separate blocks or lugs\". That single clause is also the fix for the "
        "torn seams.\n\n"
        "SCALE IS NORMALISED: every asset arrives in roughly the same bounding "
        "box, so a castle keep and a peasant import the same size. Set the "
        "relative scale yourself on import - a castle is not going to look "
        "like a castle until you do.\n\n"
        "TRIANGLE BUDGET: humanoids land around 3-5k triangles, props higher. "
        "That is right for a hero asset and wrong for a unit drawn 200x a "
        "frame, so if this has a budget, plan the free thrixel_reduce_triangles "
        "step in rather than shipping the raw output - 200 characters at 5k is "
        "1M triangles of characters alone.\n\n"
        "Cost is METERED on real usage and charged after the run, so it varies "
        "with the object and with `quality`. Use 'plus' - the default - unless "
        "the user asks otherwise; a regenerated asset costs far more than the "
        "gap between the tiers. " + ARCHITECT_COST_NOTE
    ),
)
async def thrixel_create_model(
    prompt: str,
    ctx: Context,
    quality: str | None = None,
    images: list[str] | None = None,
    reference_image_id: str | None = None,
    style_reference_submission_id: str | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Generate an editable multi-part model with the Architect pipeline.

    Args:
        prompt: What the object IS. Describe shape, material, style, era.
        quality: "balanced" or "plus". Both produce the same kind of editable
            multi-part mesh; "plus" handles complex shapes and part hierarchies
            more reliably and costs slightly more cubes.
            **Use "plus", which is the default when you omit this.** The
            difference in cubes is far less than the cost of regenerating one
            asset that came out wrong. Only pass "balanced" if the user asks
            for it. See the tool description for measured per-asset cost.
            Size the asset list to the game rather than to the balance; check
            it with thrixel_account_status so you know how far you will get.
        images: Up to 6 reference images showing different views of the SAME
            object. Each may be a path to a file on this machine (read and
            encoded for you), an http(s) URL, or a data: URI. A local path is
            the normal case - pass the file, do not encode it yourself.
        reference_image_id: An image already in this account, used as an extra
            reference view. Generate one with thrixel_generate_image, agree the
            look in 2D, then build from it - much cheaper than iterating on
            meshes. Combines with `images`; get ids from thrixel_list_images.
        style_reference_submission_id: A previously created submission whose
            look (palette, materials, detail level) this one should match.
            Use it to keep a whole set of assets stylistically consistent.
    """
    # Omitting quality means Plus, explicitly. Sending no tier at all is not the
    # same thing: the request would then run on the service default rather than
    # the tier this tool's description promises. Always naming the tier keeps the
    # description true and keeps the reported spend matched to what ran.
    model = _QUALITY_MODELS["plus"]
    if quality is not None:
        model = _QUALITY_MODELS.get(quality.strip().lower())
        if model is None:
            # Caught here rather than sent on: an unknown `model` is a backend
            # 400 that reads like a server problem, and a silently-dropped one
            # would bill at the default tier without saying so.
            raise ThrixelError(
                f"quality must be one of {', '.join(_QUALITY_MODELS)}, got {quality!r}."
            )

    result = await submit_and_wait(
        "/architect/submit",
        {
            "task": prompt,
            "model": model,
            "images": to_image_references(images),
            "reference_image_id": reference_image_id,
            "style_reference_submission_id": style_reference_submission_id,
            "project_id": project_id,
        },
        ctx=ctx,
        wait=wait,
        dest=dest,
    )
    if not wait:
        return (
            f"Submitted. submission_id: {result.submission_id}\n"
            f"Poll it with thrixel_job_status('{result.submission_id}')."
        )
    return await deliver(
        result, verb="Created", fallback_name=prompt, next_step=_ARCHITECT_NEXT, dest=dest
    )


@image_tool(
    title="Sculpt a 3D model",
    description=(
        "Create a dense, organic 3D model from a text description and/or a "
        f"single reference image. Costs {GPU_OP_CUBES} cubes.\n\n"
        f"{REF_IMAGE_NOTE}\n\n"
        "Use this for creatures, characters, plants, rocks, food, cloth - "
        "anything sculpted rather than assembled - and whenever you are "
        "starting from a photo.\n\n"
        "The output is ONE high-density textured mesh with NO separate parts, "
        "and that is permanent: nothing on it can be animated or moved "
        "independently later. So if any piece of the asset has to move on its "
        "own, use thrixel_create_model instead, even for an organic subject.\n\n"
        "For a STATIC organic asset this beats thrixel_create_model followed by "
        "thrixel_detail_model on both looks and price: that chain is metered "
        f"Architect cost and then a flat {GPU_OP_CUBES}, roughly 1.5x this "
        "tool.\n\n"
        "To make a whole set share one look, pass the same "
        "style_reference_submission_id to every call - a finished model carries "
        "a palette and a finish far better than repeating adjectives does. For "
        "rules rather than looks (polycount, naming, sizes), use "
        "thrixel_add_project_source instead; the two combine.\n\n"
        "Waits for the job to finish, saves the GLB, and returns the file path "
        "plus a rendered thumbnail."
    ),
)
async def thrixel_sculpt_model(
    ctx: Context,
    prompt: str | None = None,
    image: str | None = None,
    reference_image_id: str | None = None,
    style_reference_submission_id: str | None = None,
    texture_size: int | None = None,
    decimation_target: int | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Generate a dense organic mesh with the Sculptor pipeline.

    Args:
        prompt: Text description of the object. Required unless image is given.
        image: A single reference image: a path to a file on this machine
            (read and encoded for you), an http(s) URL, or a data: URI. A
            local path is the normal case - pass the file, do not encode it
            yourself. When both are supplied the image drives the shape and
            the prompt guides style.
        reference_image_id: Reuse an image already in this account instead of
            generating a new one from your prompt. This is how you avoid paying
            the reference-image charge a second time, and how a whole set is
            kept visually consistent: generate one image, then pass its id to
            every sculpt in the set. Get ids from thrixel_list_images.
        style_reference_submission_id: A finished submission whose look
            (palette, materials, wear, finish) this one should match. Pass the
            same id across a set and they read as one family. With `prompt` it
            steers the image generated from your text; with `image` it restyles
            YOUR image into that look, so the result is no longer the picture
            you passed in. It contributes appearance only - the subject always
            comes from your prompt or your image.
        texture_size: Output texture resolution: 1024, 2048 (default) or 4096.
        decimation_target: Maximum triangle count for the output mesh,
            10000-250000. Set this when the asset has a game budget; otherwise
            leave it to the server. Below 10000 the request is rejected, so ask
            for 10000 and cut further with thrixel_reduce_triangles, which is
            free.
    """
    if not prompt and not image and not reference_image_id:
        raise ValueError("Provide a prompt, an image, or a reference_image_id.")

    result = await submit_and_wait(
        "/sculptor/submit",
        {
            "task": prompt,
            "images": [to_image_reference(image)] if image else None,
            "reference_image_id": reference_image_id,
            "style_reference_submission_id": style_reference_submission_id,
            "texture_size": texture_size,
            "decimation_target": decimation_target,
            "project_id": project_id,
        },
        ctx=ctx,
        wait=wait,
        dest=dest,
    )
    if not wait:
        return (
            f"Submitted. submission_id: {result.submission_id}\n"
            f"Poll it with thrixel_job_status('{result.submission_id}')."
        )
    return await deliver(
        result,
        verb="Sculpted",
        fallback_name=prompt or "sculpt",
        next_step=_SCULPTOR_NEXT,
        dest=dest,
    )
