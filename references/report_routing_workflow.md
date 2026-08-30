# Report Routing Workflow

Load this reference only after route selection has inferred an in-scope report
intention.

## Role

Use this file as a routing checklist, not as a report planner or writer. It only
decides whether the current report intention should route `report_writer`.
`report_writer.md` owns scope feedback, revision, blocking, output creation, and
claim-safe HTML report creation.

Do not put report scope, report-writer handoff details, or output decisions in
`next_step_plan`.

## Route Report Writer When

Route `report_writer` when any of these match the inferred intention:

- The user clearly continues or approves the current ready report scope
  identified by the message and its preceding team-lead context. For clear
  approval, pass the exact report `scope_id` and `scope_revision` in the `begin`
  `scope_ref` with `kind: report`. A migration-only `null`
  `analysis_artifact_ids` binding is not approvable. Route `report_writer`
  without `scope_ref` so it can select evidence explicitly, revise the scope,
  and return for approval.
- The user asks for a new report, outline, report revision, reviewer-facing
  response, safer wording, limitations language, claim-boundary wording, or a
  changed report scope.
- The user asks for a report that depends on missing analysis output; report
  writer should prepare planning/limitations scope or blocked feedback, not
  force analysis routing.
- The user asks for PPT, DOCX, PDF, slides, email, letter, memo, or another
  non-HTML form; report writer should handle this as report style or structure
  guidance inside the HTML-default report workflow, not promise that file type.

If no report route can reasonably match the inferred intention, plan only
`team_lead`.

Use the core-route `begin` contract in `route_selection_workflow.md`.
