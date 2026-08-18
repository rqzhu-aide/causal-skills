# Design Execution Contract

Use this reference from design routes only. Support routes provide context
inside the selected design scope; the design route owns the worker submission.

## Active Assignment

Use the worker `turn_context`, full operation packet, selected design, and only
the selected support reference. The persisted assignment and scope binding are
authoritative on resume. Use the full-state fallback only for relevant detail
omitted from the context, and reuse any matching completed artifact reported by
the controller.

## Scope Decision

A successful `begin` committed the persisted design assignment and verified any
supplied scope identity. The design route decides whether the assignment
prepares scope, revises scope, blocks, or executes; the controller never
interprets approval.

This scope decision governs every implementation, diagnostic, package, and
output instruction in the selected design and support references. Without an
exact bound ready `scope_ref`, treat those instructions as scope content only;
do not run them or compute target results.

- Execute only when `turn_context.operation.scope_ref` is present and exactly
  matches that ready slot's `scope_id` and `scope_revision`. The model
  made the approval decision before `begin`; the persisted binding carries that
  decision across resume while the controller verifies identity only.
- Missing scope reference, missing slot, `requested`, or a new analysis request:
  prepare scope only.
- A changed causal target, contrast, data source, model family, selected support
  route, main output, or claim boundary is a material scope revision; do not
  execute the old scope.
- A practical refinement that changes none of those elements remains the same
  scope and revision.
- Diagnostics may compute quantities needed to assess the bound target, estimator,
  assumptions, or claim boundary. Adding a separately reportable estimand, policy
  contrast, subgroup or interaction effect, or substantive hypothesis not already
  in that scope requires a revision.
- A repaired `blocked` scope may become `ready`; keep it blocked when the repair
  is insufficient.
- A request after `done` returns to scope feedback; a completed handoff is never
  reused as approval for new output.

A worker never infers approval from generic execution language. Without an
exact bound ready scope reference, prepare, revise, or block only. Block when
analysis cannot responsibly be scoped or executed.

## Scope Identity And Handoff

Store scope feedback only in
`council_chamber.analysis_execution.<that_design_id>`. Set
`scope_transition: new` for a new independent scope, `revise` for a material
change to the existing scope, or `preserve` when its identity and revision stay
valid. The controller assigns `scope_id`, initializes or increments
`scope_revision`, and sets timestamps. Never invent IDs or revision numbers.

Use these analysis scope handoff fields:

- `current_status`: a normal worker handoff is `ready`, `blocked`, or `done`.
  Null or `requested` is a pre-work or legacy marker, not a completed handoff.
- `support`: selected support route ID or `null`.
- `execution_contract`: `{target, input_refs, method_plan,
  execution_requirements, output_type, claim_boundary}`. Use trimmed strings
  and unique nonempty string arrays. New or revised `ready` scopes require a
  complete contract. Every unresolved condition that could invalidate
  identification must appear inside `claim_boundary` as a condition on the
  supported claim until committed evidence resolves it; listing it only as a
  diagnostic, limitation, or future check is insufficient.
- `summary`: compact scope, blocker, or completed-output description.
- `questions_for_user`: 0-3 current questions, choices, or approval points for
  `ready` or `blocked` handoffs. Use `[]` for `done`; team lead derives later
  choices from the completed evidence.
- `feedback_to_route`: 0-2 fit, review, or implementation cautions.

An approval-ready handoff contains one complete default covering design fit,
support role, required inputs, target estimand or contrast, estimation strategy
or model family, diagnostics, main output, and claim boundary.
The structured contract carries these as minimum execution requirements;
additional useful diagnostics or sensitivities are allowed when they do not add
a new target or cross the claim boundary. A migrated ready slot may have a null
contract and run under completion protocol 0; any later revision must add the
structured contract.
`questions_for_user` may offer revisions to that default, but must not leave a
material scope element undecided. Do not store analysis scope in
`discovery_sidecar`, `report_assembly`, pending artifact records, output
folders, or `project_summary`.

Cross-design mentions in a design reference are rerouting cues only. Never put
another design ID in `support`; return it to `causal_check` only when that other
identification frame should become primary.

## Approved Execution

Before reserving output, confirm that the bound scope still fits the live inputs
and current durable evidence. If a mismatch requires a different support route,
preserve the bound scope and return `blocked` without output; a later operation
must revise and reroute it. Other material changes may return a revised `ready`
or `blocked` handoff without output while retaining the planned support. This is
a scope-consistency check, not a repeat of the full begin gate.

When the approved scope remains current, follow
`references/artifact_output_policy.md`: reserve one meaningful output directory,
execute and validate every operation-packet requirement, and submit one silent
owner-scoped `apply`. Requirements are minimum coverage; supplemental work is
allowed only inside the approved target and claim boundary.

For completion, preserve the scope, update only the matching analysis chamber
slot to `done`, and submit a `completion` receipt covering every requirement.
If work on the exact scope instead proves that its promised output cannot be
produced responsibly, preserve the scope, set it `blocked`, and submit
`infeasibility_evidence` covering completed and unmet requirements. A package,
tool, or transient failure is not infeasibility evidence; retry or use the
normal no-artifact blocked handoff.

Put a compact prose record in the artifact `summary`: design, support when used,
target or estimand, main result or infeasibility finding, completed diagnostics,
claim boundary, and material limitations. Put detailed data contracts, settings,
package versions, tables, and diagnostic inventories in the output files or
chamber summary.

Submit as `analysis_execution.<that_design_id>` with the required scope
transition and only its matching chamber slot. The controller owns all
identities, timestamps, artifact append, ownership checks, and stage transition.
A rejected submission must be corrected and retried; do not rerun a
successfully completed matching artifact.
