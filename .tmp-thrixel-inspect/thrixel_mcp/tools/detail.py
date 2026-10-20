"""High-resolution detailing, retexturing, and triangle reduction."""

from __future__ import annotations

from typing import Any

from mcp.server.mcpserver import Context

from ..app import get_client, image_tool
from ..errors import ThrixelError
from ..pricing import GPU_OP_CUBES, REF_IMAGE_NOTE
from ..jobs import deliver, job_metadata, submit_and_wait

_DETAIL_NEXT = (
    "Next: thrixel_reduce_triangles to bring it down to a game budget (free), "
    "or thrixel_retexture_model to restyle it without regenerating geometry.\n"
    "Note that this result is final - it cannot be edited. If the SHAPE is "
    "wrong, go back to the source model, fix it with thrixel_edit_model, and "
    "detail that instead."
)


@image_tool(
    title="Detail and texture a 3D model",
    description=(
        "Turn a rough model into a high-resolution mesh with a PBR texture. "
        f"Costs {GPU_OP_CUBES} cubes and runs on a GPU - expect a couple of "
        "minutes.\n\n"
        "TERMINAL: the result cannot be edited afterwards. thrixel_edit_model "
        "refuses a detailed model outright. So get the shape right FIRST with "
        "edit_model, which is cheap, and detail once at the end. The natural "
        "order - detail it, look at it, fix the worst thing - does not work "
        "here, and you only find that out after paying.\n\n"
        "It regenerates geometry, so it is NOT the way to reduce triangle "
        "count: use thrixel_reduce_triangles for that, which is free and "
        "faster.\n\n"
        "BEST ON organic and sculptural subjects: creatures, characters, "
        "cloth, plants, rock, worn or hand-made surfaces. It is a poor fit for "
        "precision hard-surface geometry - a clean cylinder, torus or wheel is "
        "re-approximated rather than refined, so it comes back measurably less "
        "round while carrying many times the triangles.\n\n"
        "IF THE SHAPE IS ALREADY RIGHT, USE thrixel_retexture_model INSTEAD. "
        "It gives an existing mesh a new look for the same price and never "
        "touches geometry, so every part, name and proportion survives intact. "
        "Detailing is for when you want the SHAPE itself to gain detail, and it "
        "is the only one of the two that can damage what you already have. "
        "There is no reason to risk geometry you are happy with.\n\n"
        "THE ASSET'S PROPORTIONS MATTER: something whose bounding box is far "
        "from a cube - a building, a roof, a floor plane, anything long and "
        "thin - comes back noticeably worse, because the object fills only a "
        "small part of the working volume. For buildings, prefer "
        "thrixel_retexture_model.\n\n"
        "WHAT IT CAN COST YOU, all worth knowing before the cubes are spent:\n"
        "- It INVENTS form wherever the blockout is vague, so anything you do "
        "not name comes back as plausible noise. Hands, faces, buckles and "
        "straps are where that shows. Describe every feature you care about, "
        "not just the style.\n"
        "- Thin geometry (blades, sails, propellers, thin rods) may not "
        "survive, even with preserve_parts. Check the part list afterwards.\n"
        "- Named materials do not survive: the result carries one baked "
        "texture atlas, not the separate material slots create_model returned. "
        "Parts kept by preserve_parts can still be tinted individually.\n\n"
        "A reference image drives the look. Give a `prompt` describing the "
        "desired appearance and one is generated for you, or reuse an existing "
        f"one with reference_image_id. {REF_IMAGE_NOTE}"
    ),
)
async def thrixel_detail_model(
    submission_id: str,
    ctx: Context,
    prompt: str | None = None,
    adherence_level: int | None = None,
    texture_size: int | None = None,
    decimation_target: int | None = None,
    seed: int | None = None,
    reference_image_id: str | None = None,
    preserve_parts: bool | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Run a high-resolution detail and texture pass.

    Args:
        submission_id: The model to detail.
        prompt: What the finished object should look like - materials, wear,
            palette (e.g. "weathered bronze with green patina"). Describe the
            object, not the instruction.
        adherence_level: How closely the result adheres to the source geometry,
            0-12, default 9. Use 9 (or omit) when the existing proportions and
            silhouette must survive - the normal choice for detailing an
            Architect blockout. Lower values let the detailer reinterpret the
            form to match the reference image more freely, which is what you
            want when the image's look matters more than the blockout. Above 9
            binds tighter still, and at 12 the output geometry IS the source
            mesh, so the pass effectively only adds texture. Below 9 the parts
            are merged by default, since holding the part split through a
            reshaped silhouette causes artifacts; pass preserve_parts=True to
            override that.
            FOR PRECISION HARD-SURFACE MODELS, AND ANY MODEL WHOSE THIN PARTS
            MUST SURVIVE, USE 12. The default of 9 is not enough. Measured on
            the same 78-part quadcopter, same seed, same reference image: at 9,
            28 parts came back and one of the four propellers was gone with two
            more reduced to slivers; at 12, 35 parts came back and all four
            propellers survived at full size. 12 still drops very small
            decorative sub-parts, so it improves the odds rather than
            guaranteeing anything. If you need a guarantee, do not detail at
            all: thrixel_retexture_model leaves geometry untouched.
        texture_size: 2048 (default) or 4096.
        decimation_target: Maximum triangle count for the output, 10000-250000.
        seed: Omit for a random result each run. Pin it only to reproduce a
            previous result exactly.
        reference_image_id: Reuse an already-generated reference image instead
            of making a new one. Reusing one image across several assets is how
            you keep a set visually consistent - and it is not re-charged.
        preserve_parts: Keep the source model's separate parts. Omit to let the
            server choose: on at adherence_level 9, off below it. Set false for
            a single merged mesh. Best effort, not a guarantee - parts that are
            thin or small relative to the whole model can still be merged away
            or lost entirely, so verify the ones you need survived. Raising
            adherence_level to 12 markedly improves how many survive; see that
            parameter.
    """
    result = await submit_and_wait(
        "/detailer/submit",
        {
            "parent_submission_id": submission_id,
            "prompt": prompt,
            "adherence_level": adherence_level,
            "texture_size": texture_size,
            "decimation_target": decimation_target,
            "seed": seed,
            "reference_image_id": reference_image_id,
            "preserve_parts": preserve_parts,
            "project_id": project_id,
        },
        ctx=ctx,
        wait=wait,
        dest=dest,
    )
    if not wait:
        return f"Submitted. submission_id: {result.submission_id}"
    return await deliver(
        result,
        verb="Detailed",
        fallback_name=prompt or "detailed",
        next_step=_DETAIL_NEXT,
        dest=dest,
    )


@image_tool(
    title="Retexture a 3D model",
    description=(
        "Generate fresh textures for a model without touching its geometry. "
        f"Costs {GPU_OP_CUBES} cubes.\n\n"
        "USE THIS, NOT thrixel_detail_model, WHENEVER THE SHAPE IS ALREADY "
        "RIGHT. Geometry is untouched here, so every part, every name and "
        "every proportion survives exactly. That guarantee is the reason to "
        "pick it: detailing rebuilds the mesh and can lose thin parts, round "
        "off precise shapes and collapse named materials. This is the right "
        "call for precision hard-surface work and for buildings.\n\n"
        "This is the cheap way to restyle: to make a whole set of assets "
        "cyberpunk, retexture each one against the same reference image rather "
        "than regenerating them. Pass the same reference_image_id every time to "
        "keep the set consistent AND to avoid paying for a new reference image "
        "on every asset.\n\n"
        f"{REF_IMAGE_NOTE}\n\n"
        "Works on any completed model, not just detailed ones. To restyle only "
        "some parts, name them in apply_to_node_names."
    ),
)
async def thrixel_retexture_model(
    submission_id: str,
    ctx: Context,
    prompt: str | None = None,
    reference_image_id: str | None = None,
    apply_to_node_names: list[str] | None = None,
    texture_size: int | None = None,
    seed: int | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Regenerate materials on an existing mesh.

    Args:
        submission_id: The model to retexture.
        prompt: The look you want (e.g. "rusted corrugated steel").
        reference_image_id: Reuse a previously generated reference image. Use
            the same id across assets for a consistent style pass.
        apply_to_node_names: Exact node names to restrict texturing to. Empty
            or omitted textures the whole mesh. Get names from
            thrixel_inspect_model.
        texture_size: 2048 (default) or 4096.
        seed: Omit for a random result. Pin to reproduce a previous texture.
    """
    result = await submit_and_wait(
        "/texture/generate",
        {
            "parent_submission_id": submission_id,
            "prompt": prompt,
            "reference_image_id": reference_image_id,
            "apply_to_node_names": apply_to_node_names or None,
            "texture_size": texture_size,
            "seed": seed,
            "project_id": project_id,
        },
        ctx=ctx,
        wait=wait,
        dest=dest,
    )
    if not wait:
        return f"Submitted. submission_id: {result.submission_id}"
    return await deliver(
        result,
        verb="Retextured",
        fallback_name=prompt or "retexture",
        next_step="Check the thumbnail; retexture again with a different prompt if the look is off.",
        dest=dest,
    )


@image_tool(
    title="Reduce a model's triangle count",
    description=(
        "Cut a model down to a triangle budget. FREE and fast - always use "
        "this to lighten an asset instead of re-running thrixel_detail_model "
        "at a lower target, which costs cubes, takes minutes, and gives you a "
        "different model rather than a lighter version of the same one.\n\n"
        "Keeps the existing texture. Works on any completed model: detailed "
        "and sculpted models are rebuilt with cleaner topology, other models "
        "are decimated in place. The right endpoint is chosen for you.\n\n"
        "How low you can go depends on the model, not on a fixed number. A "
        "dense single-piece mesh from detail or sculpt (often 100k+ triangles) "
        "reduces enormously - hero prop 20k-50k, background prop 2k-10k. A "
        "multi-part model from create_model is different: it is already light, "
        "and each part needs a handful of triangles to stay a solid shape, so "
        "its floor is roughly the part count times ten. Check the current count "
        "with thrixel_inspect_model first. Targets below the floor are clamped "
        "and the result says so, rather than shredding the parts to hit a "
        "number."
    ),
)
async def thrixel_reduce_triangles(
    submission_id: str,
    target_triangles: int,
    ctx: Context,
    focus_on_node_names: list[str] | None = None,
    project_id: str | None = None,
    dest: str | None = None,
    wait: bool = True,
) -> Any:
    """Re-decimate a model to a new triangle budget.

    Args:
        submission_id: The model to lighten.
        target_triangles: The budget to hit. Whole-model, unless
            focus_on_node_names is set.
        focus_on_node_names: Apply the budget only to these parts, leaving the
            rest untouched. Only supported on part-preserving detailer results.
    """
    # Route on the source model's phase.  Remesh needs a GPU result (phase 4);
    # anything else - an Architect blockout, an edit - has to go through the
    # decimate filter.  Sending the wrong one is a 400 the agent cannot easily
    # diagnose, so resolve it here rather than making the caller guess.
    client = get_client()
    try:
        info = await client.get_json(f"/{submission_id}/info")
    except ThrixelError as exc:
        raise ThrixelError(f"Could not read {submission_id}: {exc.message}") from None

    if info.get("phase") == 4:
        path = "/detailer/remesh"
        payload = {
            "parent_submission_id": submission_id,
            "decimation_target": target_triangles,
            "focus_on_node_names": focus_on_node_names or None,
            "project_id": project_id,
        }
    else:
        path = "/filter/decimate"
        payload = {
            "parent_submission_id": submission_id,
            "target_tri_count": target_triangles,
            "focus_on_node_names": focus_on_node_names or None,
            "project_id": project_id,
        }

    result = await submit_and_wait(path, payload, ctx=ctx, wait=wait, dest=dest)
    if not wait:
        return f"Submitted. submission_id: {result.submission_id}"

    # The backend clamps a target it cannot reach without destroying parts.
    # Saying nothing would leave the agent believing the budget was met.
    note = ""
    meta = job_metadata(result.info)
    if meta.get("target_was_clamped"):
        # Deliberately does not quote achievable_min_tri_count: that is an
        # estimate from the pre-export plan and can land above the count the
        # exported GLB actually holds, which would read as a contradiction.
        # The delivered number is the one the caller can verify.
        effective = meta.get("effective_tri_count")
        delivered = f"{effective:,}" if isinstance(effective, int) else "the result above"
        note = (
            f"Note: {target_triangles:,} triangles was not reachable for this "
            f"model, so it came out at {delivered} instead. Every part needs "
            f"enough geometry to stay a solid shape, which puts a floor on a "
            f"model with many parts. Going lower means removing or merging "
            f"parts, not decimating further."
        )

    return await deliver(
        result,
        verb="Reduced",
        fallback_name="reduced",
        next_step=note,
        dest=dest,
    )
