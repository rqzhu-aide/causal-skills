# Team Lead Analysis Flow

Load this reference only when the plan includes `analysis_execution.<design_id>`,
the user asks about an analysis scope, approval/execution, or analysis output
changed this turn.
This file does not select analysis routes; it only helps `team_lead` review
analysis handoff and close out analysis state.

Use the Decision Gate in `team_lead.md` for any question or options below.

## Analysis Handoff Review

When `next_step_plan` contains an `analysis_execution.<design_id>` entry, parse
`<design_id>` from the route id and review:

- the active `analysis_execution.<design_id>` entry: optional `support`
- `council_chamber.analysis_execution.<design_id>.current_status`
- `council_chamber.analysis_execution.<design_id>.scope_id`
- `council_chamber.analysis_execution.<design_id>.scope_revision`
- `council_chamber.analysis_execution.<design_id>.support`
- `council_chamber.analysis_execution.<design_id>.execution_contract`
- `council_chamber.analysis_execution.<design_id>.summary`
- `council_chamber.analysis_execution.<design_id>.questions_for_user`
- `council_chamber.analysis_execution.<design_id>.feedback_to_route`
- any `analysis_execution` artifact record whose `operation_id` matches the
  active operation

Only a committed `analysis_execution.<design_id>` worker handoff establishes
that the current operation prepared or revised an analysis scope. Allow
necessary design details within that handoff, but do not offer approval for a
distinct target or separately reportable result beyond the persisted assignment.
In a team-lead-only or core-route operation, an existing analysis handoff is prior
work, not work completed this round. A missing handoff or null or `requested`
status means no completed scope handoff exists; state that boundary and do not
offer approval or execution.

If the analysis scope status is `ready`, no output should have been created for
this operation. Before offering approval, check that its target, design,
support, and claim boundary still match the current causal review and Analysis
Begin Eligibility in `analysis_routing_workflow.md`. If the scope no longer
matches, describe it only as an earlier plan needing revision; do not offer it
for approval or execution or revise it automatically. If eligibility fails for
another reason, state that the analysis is not currently runnable, name the
failed prerequisite, and do not revise the scope automatically. Otherwise,
treat `execution_contract` as the authoritative minimum work definition when
present; chamber prose cannot replace it. Before presenting it, reconcile any
displayed analysis-population counts to the stated total and make its support
explanation agree with the authoritative contract. Summarize the proposed scope
in the presentation with only the target or
estimand, design and support, required inputs, estimation strategy or model
family, main diagnostics, main output, and claim boundary. Translate design and
support into plain user-facing method language. Do not expose route IDs, state
field names or values, scope IDs or revisions, or controller mechanics unless
the user asks. Present the stored ready default faithfully; do not invent or
negate a consequential scope choice.

If the analysis scope status is `blocked` with operation-matched
`infeasibility_evidence`, explain what the approved scope could not produce and
why the plan needs revision; do not claim completed analysis output. Otherwise
explain the blocker. Ask for the smallest useful clarification, data detail,
design revision, or fallback choice.

If the analysis scope status is `done`, use the available operation-matched
`completion` artifact record and summarize the output briefly. Before saying
the scope ran exactly, unchanged, or with every requirement completed, check
the artifact evidence against the contract's named method, support rule,
population counts, limitations, and material supplemental work. If the artifact
is absent or unavailable, treat this as a missing handoff and do not claim
output. When
several next moves are useful, prioritize analysis-facing choices: next
contrast, diagnostic, sensitivity check, heterogeneity question, claim wording,
or missing data/domain interpretation. Do not default to report, formatting, or
deliverable-production choices unless the user explicitly asked for that
deliverable or report work is already pending.
