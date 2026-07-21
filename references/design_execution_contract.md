# Design Execution Contract

Use this reference from design routes only. Support routes provide context
inside the selected design scope; the design route owns the worker submission.
The worker remains silent and never edits `project_state.yaml` directly.

## Active Assignment

Proceed only when `state_meta.active_operation.stage` is `worker_pending` and
the committed plan contains exactly the matching design assignment:

```yaml
- id: analysis_execution.<that_design_id>
  support: optional_support
```

Use the persisted `intent_summary`, route, `scope_ref`, live state, selected
design, and optional support as the authoritative assignment. Consistent detail
from the operation-opening message may refine the initial pass, but is not
required for resume. A resumed worker does not reinterpret a newer message; it
restarts from this route boundary and reuses any matching completed artifact
reported by the controller.

## Scope Decision

A successful `begin` committed the persisted design assignment and verified any
supplied scope identity. The design route decides whether the assignment
prepares scope, revises scope, blocks, or executes; the controller never
interprets approval.

- Execute only when `state_meta.active_operation.scope_ref` is present and
  exactly matches that ready slot's `scope_id` and `scope_revision`. The model
  made the approval decision before `begin`; the persisted binding carries that
  decision across resume while the controller verifies identity only.
- Missing scope reference, missing slot, `requested`, or a new analysis request:
  prepare scope only.
- A changed causal target, contrast, data source, model family, selected support
  route, main output, or claim boundary is a material scope revision; do not
  execute the old scope.
- A practical refinement that changes none of those elements remains the same
  scope and revision.
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
- `summary`: compact scope, blocker, or completed-output description.
- `questions_for_user`: 0-3 choices or approval points for team lead; use none
  when no consequential decision remains.
- `feedback_to_route`: 0-2 fit, review, or implementation cautions.

An approval-ready handoff contains one complete default covering design fit,
support role, required inputs, target estimand or contrast, estimation strategy
or model family, diagnostics, main output, and claim boundary.
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

When the approved scope remains current:

Before marking the handoff `done`, reconcile every required target, design or
support choice, model or estimation strategy, diagnostic, main output, and
claim boundary against the bound scope. If a required item is missing or
materially substituted, repair it or return `ready` or `blocked` without an
artifact; never submit `done`.

1. Call `statectl reserve-artifact` for one meaningful directory directly under
   `output/`.
2. Follow `references/artifact_output_policy.md` to write temporary output,
   then validate it against the bound scope.
3. Submit one `statectl apply` JSON payload with
   `actor: analysis_execution.<that_design_id>`, `scope_transition: preserve`,
   updates only for the matching chamber slot, `current_status: done`, and the
   completed `artifact: {summary}`. Include the selected design, optional
   support, main result, limitations, and useful next analysis in that summary.

Put a compact prose record in the artifact `summary`: design, support when used,
target or estimand, main result, diagnostics completed or missing, claim
boundary, and material limitations. Put detailed data contracts, settings,
package versions, tables, and diagnostic inventories in the output files or
chamber summary.

`statectl apply` owns timestamps, IDs, artifact append, revision checks, route
ownership validation, and transition to `lead_pending`. It rejects changes to
`project_summary`, `next_step_plan`, another route's state, or the artifact list
itself. A rejected submission must be corrected and retried; do not rerun a
successfully completed matching artifact.
