# Design Execution Contract

Use this reference from design routes only. The design route is the
accountable owner for keeping analysis execution consistent with its study
design. Support routes provide context inside the selected design scope and
may add analytic tools, but they must stay inside that scope; the design route
owns the worker submission.

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

## Research Strategy Context

Treat the current preferred `causal_facts.analysis_options` item and matching
`recommended_method_routes` as the default identification strategy. Other
portfolio items are decision context, not parallel scopes or authorization.
This route does not update, promote, or clear the portfolio.

During scope preparation, consider materially different formulations inside
the selected design, including model, estimator, uncertainty, preprocessing,
and implementation choices. Put routine diagnostics and safeguards inside the
default scope. Surface no more than two credible formulation alternatives, and
only when the choice could change the answer or claim. In chamber feedback,
state what each would enable, what it requires, its main validity risk or claim
limit, when it would be preferable, and the exact next analysis operation. Do
not force an alternative when the complete default is adequate.

A requested change to target, estimand, identification design, data
construction, or domain interpretation returns to its owning core route. A
same-design formulation may return here as scope preparation or revision. Name
the concrete path and owner instead of returning generic advice to revise.
`causal_check` owns catalog-based support-route selection. If a different
support becomes central to the bound work, flag it in chamber feedback rather
than loading the catalog or switching routes. Cues for scientific
issues discovered during design work:

- effect variation by subgroup, site, or modifier -> `heterogeneous-effects`;
  requires modifier timing and subgroup support; main risk: multiplicity and
  unsupported subgroups.
- continuous, cumulative, duration, or intensity exposure -> `dose-response`;
  requires support across the dose range; main risk: extrapolation beyond
  support.
- mechanism, pathway, or mediator-adjustment question -> `mediation`; requires
  mediator timing and mediator-outcome confounding control; main risk: fragile
  cross-world assumptions.
- binary, count, survival, or competing-risk outcome scale ->
  `non-continuous-outcomes`; requires event counts, follow-up, and censoring
  handling; main risk: scale-dependent conclusions.
- decision rule, targeting, deployment, or transport use ->
  `policy-making-and-transportability`; requires decision-time features and a
  named target population; main risk: local evidence overgeneralized.
- unresolved balance, overlap, weights, nuisance, or inference concerns beyond
  the design's required diagnostics -> `statistical-validity`; requires
  design-matched diagnostics; main risk: estimation machinery mistaken for
  identification.

## Scope Identity And Handoff

Store scope feedback only in
`council_chamber.analysis_execution.<that_design_id>`. Set
`scope_transition: new` for a new independent scope, `revise` for a material
change to the existing scope, or `preserve` when its identity and revision stay
valid. The controller assigns `scope_id`, initializes or increments
`scope_revision`, records a controller-owned `causal_basis_hash`, and sets
timestamps. Never submit or invent IDs, hashes, or revision numbers. The
matching `scope_snapshot` reports `basis_current`; a false value requires scope
revision before approval or execution.

Use these analysis scope handoff fields:

- `current_status`: a normal worker handoff is `ready`, `blocked`, or `done`.
  Null or `requested` is a pre-work or legacy marker, not a completed handoff.
- `support`: selected support route ID or `null`.
- `execution_contract`: `{target, input_refs, method_plan,
  execution_requirements, output_type, claim_boundary}`. Use trimmed strings
  and unique nonempty string arrays. New or revised `ready` scopes require a
  complete contract. Every unresolved condition that could invalidate
  identification must become either a checkable item in
  `execution_requirements` that can resolve it or an explicit condition on the supported claim inside
  `claim_boundary`. Listing it only as a diagnostic, limitation, or future
  check is insufficient.
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
contract and causal basis. Preserve it as prior scope context, but revise it
before new approval or execution. A pre-migration operation already bound to
that scope may still resume under its legacy completion protocol.
Specifications in `method_plan` govern every applicable execution requirement.
A shorter local requirement cannot silently omit or weaken them. Resolve any
conflict or exception explicitly before marking the scope `ready`.
`questions_for_user` may offer revisions to that default, but must not leave a
material scope element undecided. Do not store analysis scope in
`discovery_sidecar`, `report_assembly`, pending artifact records, output
folders, or `project_summary`.

Cross-design mentions in a design reference are rerouting cues only. Never put
another design ID in `support`; return it to `causal_check` only when that other
identification frame should become primary.

## Approved Execution

Before writing to an existing begin-time reservation, or before reserving late,
confirm that the bound scope still fits the live inputs and current durable
evidence. If a mismatch requires a different support route,
preserve the bound scope and return `blocked` without output; a later operation
must revise and reroute it. Other material changes may return a revised `ready`
or `blocked` handoff without output while retaining the planned support. This is
a scope-consistency check, not a repeat of the full begin gate.

When the approved scope remains current, follow
`references/artifact_output_policy.md`: reserve one meaningful output directory,
execute and validate every operation-packet requirement, and submit one silent
owner-scoped `apply`. Choose the estimator lane before choosing software;
package lanes in the design and support references are cues, not execution
permission, so verify current docs before running code. Requirements are minimum coverage; supplemental work is
allowed only inside the approved target and claim boundary.

Prefer one reproducible execution pass that produces the contracted analysis,
diagnostics, and outputs together. Use a targeted correction or rerun only when
validation exposes a concrete error or unmet requirement; do not fragment the
scope into repeated exploratory passes or repeat completed core review.

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
