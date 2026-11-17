---
name: check
description: Reviews an implementation plan for correctness, missing requirements, edge cases, and unnecessary complexity using a different LLM, then reports only changes that are absolutely necessary. Use only when the user invokes /check.
disable-model-invocation: true
---

# Check a plan

Review the plan without editing it or implementing anything.

## Workflow

1. Identify the plan, its original requirements, relevant repository context, and the model that generated it.
   - Prefer information already present in the conversation.
   - If the plan or original requirements are missing, ask the user to provide them.
   - If the generating model cannot be determined, ask the user which model generated the plan. Do not guess.
2. Launch one foreground `generalPurpose` subagent with an explicit model.
   - Choose a currently available model from a different model family/provider than the model that generated the plan.
   - Never omit the `model` parameter because omission may reuse the parent model.
   - Do not use `resume`; start a fresh reviewer.
3. Give the reviewer the complete plan, original requirements, and only the repository context needed to assess it. Tell it:
   - This is a read-only plan review. Do not edit files, rewrite the plan, implement changes, or perform external mutations.
   - Check correctness, missing requirements, potential edge cases, and unnecessary complexity.
   - Inspect repository files read-only when claims need verification.
   - Report only absolutely necessary changes.
4. Return the review findings to the user. Do not apply them to the plan.

## Admission threshold

Include a finding only when leaving the plan unchanged would cause at least one of:

- Failure to meet an explicit requirement.
- An incorrect, infeasible, or internally contradictory implementation.
- A credible edge case that could cause functional failure, security exposure, data loss, or a broken user workflow.
- Unnecessary complexity that materially increases implementation or operational risk and must be removed or simplified to deliver the requirements safely.

Exclude preferences, polish, speculative future-proofing, optional optimizations, minor wording issues, and merely nicer alternatives. When uncertain whether a change is required, omit it.

## Reviewer prompt

Require the subagent to return this exact structure:

```markdown
## Verdict
[One sentence: either the plan is ready, or N necessary changes were found.]

## Necessary changes
1. **[Short title]** — [Category: correctness | missing requirement | edge case | unnecessary complexity]
   - **Problem:** [Concrete issue, citing the plan section and repository evidence when applicable.]
   - **Required change:** [Smallest change needed; describe it without rewriting the plan.]
   - **Why mandatory:** [Specific failure that occurs if unchanged.]
```

If no finding passes the admission threshold, the reviewer must write:

```markdown
## Verdict
The plan is ready as written.

## Necessary changes
None.
```

Do not add optional suggestions or a revised plan. State which reviewer model was used after the review.
