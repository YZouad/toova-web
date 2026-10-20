"""Cost facts baked into static text, in one place.

Tool descriptions are fixed at import and handed to the model when the client
connects, so they cannot be fetched live.  This module is the ONLY place in the
package allowed to state a price, and every description that needs one imports
it from here.  A literal price written anywhere else is a second copy that will
eventually disagree with this one.

They exist because the agent reads a description before deciding whether an
operation is worth running, and getting that wrong makes it act on false
economics: told something is "free", it will happily loop on it.

**These are a fallback, not the authority.**  ``thrixel_pricing`` reads plans,
caps, fixed prices and top-up packs from the service and is always current;
``thrixel_account_status`` reports what this account actually has.  Prefer
either over anything written here, and never quote a number from here to a user
who is about to pay.

Nothing here gates anything; the service is the only authority on what a call
actually costs.
"""

from __future__ import annotations

# Flat-priced GPU operations.
GPU_OP_CUBES = 40

# Added on top of the flat price when detail / sculpt / texture is called with
# only a `prompt`: the service has to generate the reference image the job runs
# on, and that generation is billed on its own.  Passing reference_image_id
# skips both the generation and this charge.
#
# The agent needs this or its arithmetic is simply wrong.  Told a detail pass
# costs 40, it will plan twelve of them against a 500-cube balance, and the
# eleventh fails on a wallet it was told could cover it - which reads to the
# agent as a service error rather than a budget it mis-added.
#
# An ESTIMATE, and a copy - the service owns the real number.  The debit is
# metered on the generation's actual cost and then halved (image generation is
# subsidised, rounded up), and the authoritative figure ships on
# GET /api/v1/tiers as `ref_image_cubes`, which is what thrixel_pricing
# reports.  This constant only exists so a tool DESCRIPTION can quote a figure
# without a network call; when the two disagree, the endpoint is right.
#
# Re-check this against the endpoint whenever the subsidy moves.  Quoting a
# stale figure would not fail anything, which is the problem: the agent would
# silently reserve the wrong budget and build a smaller game than its balance
# allows.
REF_IMAGE_CUBES = 7

REF_IMAGE_NOTE = (
    f"Cost detail: given only a prompt, a reference image is generated for the "
    f"job and billed separately (about {REF_IMAGE_CUBES} cubes), so the call "
    f"totals roughly {GPU_OP_CUBES + REF_IMAGE_CUBES}. Supplying the image "
    f"yourself, or reusing one with reference_image_id, skips that generation "
    f"and costs {GPU_OP_CUBES}."
)

# A 2D image generated in the Image Hub. Post-charged per image, and the SAME
# price as the reference image a detail / sculpt / texture call generates for
# itself - the service halves the metered cost either way, so making the image
# first is never the more expensive route. That matters because it is what
# makes concept-first art direction affordable: settling a look over a few
# images and then committing to geometry costs a fraction of settling it over
# 40-cube mesh generations, which is what a beta session actually did for want
# of an image tool.
IMAGE_CUBES = REF_IMAGE_CUBES

IMAGE_NOTE = (
    f"Costs about {IMAGE_CUBES} cubes per image, charged after it is generated. "
    f"That is the same price a detail / sculpt / texture call pays to generate "
    f"its own reference image, so making one here first costs nothing extra - "
    f"and reusing its id with reference_image_id then makes those calls cheaper."
)

# Operations that cost nothing.
FREE_OPS = ("reduce_triangles", "rebake")

# Everything else is METERED: priced after the run from actual usage. Observed
# on real submissions this lands anywhere from single digits to >100 cubes for
# one call, so metered is not a synonym for cheap — a complex create can cost
# more than a flat GPU op.
METERED_NOTE = (
    "Cost is metered: charged after the run based on actual model usage, so it "
    "scales with how complex the request is. Typically tens of cubes, and a "
    "complex one can exceed the 40 a GPU operation costs. It is not free.\n\n"
    "What it meters is LANGUAGE MODEL usage - how much work it took to write "
    "the script - NOT the part count or the triangle count of what comes out. "
    "That is why a 12-part object can cost more than a 65-part one: its shapes "
    "were harder to describe in code, not bigger. Without this the numbers look "
    "arbitrary and a careful caller stops trusting the estimate."
)

# Architect spend per asset, measured on completed work and read in cubes.
#
# Published as a RANGE with a typical case, not a single average, and that is
# deliberate. The distribution has a long tail, so any single number is wrong
# for most callers in one direction or the other. A caller sizing an asset list
# needs the typical case AND the worst case; an average hides both.
#
# Re-measure whenever the pipeline changes. The figures these replaced were
# taken once, written into a tool description and never re-checked, and had
# drifted to roughly half the real cost - while the same paragraph told callers
# to size their asset list against their balance. An agent budgeting from it
# planned about twice the assets it could afford and would run out mid-session,
# which is the exact failure this server exists to prevent.
ARCHITECT_COST_NOTE = (
    "Measured on real projects: Plus typically costs 30-45 cubes per asset "
    "(median 34), rising past 75 for a complex multi-part object; Balanced is "
    "about 19. Budget roughly 40 per asset when planning a set, and check "
    "thrixel_account_status as you go - these are metered, not fixed."
)

FLAT_NOTE = f"Costs a flat {GPU_OP_CUBES} cubes."

FREE_NOTE = "Free - costs no cubes."

# One-line summary for server instructions and account output.
COST_SUMMARY = (
    f"detail / sculpt / texture are a flat {GPU_OP_CUBES} cubes each, plus "
    f"about {REF_IMAGE_CUBES} more when they are given only a prompt and have "
    "to generate the reference image; reduce_triangles and rebake are free; "
    "create / edit / autofix are metered on actual model usage (tens of cubes, "
    "sometimes more)"
)
