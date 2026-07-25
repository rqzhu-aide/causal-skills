# Team Lead Report Flow

Load this reference only when the plan includes `report_writer`, the user asks
about report approval/output, or `report_assembly` changed this turn. This file
does not select report routes; it only helps `team_lead` review report handoff
and close out report state.

## Report Handoff Review

Use the decision gate in `team_lead.md` for any question or options below.

When `next_step_plan` contains a `report_writer` entry, review:

- `report_assembly.planned_structure`
- `report_assembly.key_points`
- `report_assembly.draft_notes`
- `report_assembly.wording_constraints`
- `report_assembly.current_format`
- `report_assembly.scope_id`
- `report_assembly.scope_revision`
- `council_chamber.report_writer.current_status`
- `council_chamber.report_writer.summary`
- `council_chamber.report_writer.questions_for_user`
- `council_chamber.report_writer.feedback_to_route`
- the `report_writer` artifact record whose `operation_id` matches the active
  operation, especially its summary

For a team-lead-only question about prior report work, apply `team_lead.md`'s
prior-work rule; do not claim that it belongs to the current operation.

For results-focused drafting, the derived analysis-output flag indicates only
that a historical artifact record exists. Require relevant, available analysis
artifacts that match the report scope; otherwise explain that only a planning
report or bounded claim-boundary wording is available. If the purpose, audience,
or claim boundary is unclear, ask which should shape the scope.

Null or `requested` is a pre-work or legacy marker, not a normal committed
worker handoff. If a planned route observes either, no completed report handoff
exists; explain the boundary using only visible state.

If the report scope status is `ready`, no report output should have been created
for this operation.
Summarize the proposed report scope in the presentation with
only its purpose and intended decision use, audience, evidence basis, format,
main structure, and claim boundary. Present the stored ready default faithfully;
do not invent or negate a consequential scope choice. Use `questions_for_user`
to inform the Decision Gate before output creation.

If the report scope status is `done`, review the operation-matched report-writer
artifact record and `council_chamber.report_writer.summary`. If the artifact is
absent or unavailable, treat this as a missing handoff and do not claim report
output. Otherwise classify it as report output, revised report, or a derivative
communication artifact and summarize it in the presentation. For
derivative communication artifacts, say it is based on existing evidence and
did not create new analysis. Trust `report_writer` to distinguish refinements
that were safe to incorporate from material redesigns that needed another scope
handoff.

If the report scope status is `blocked`, explain the blocker in the presentation
and ask for the smallest useful clarification, scope revision, missing
asset, or fallback choice.
