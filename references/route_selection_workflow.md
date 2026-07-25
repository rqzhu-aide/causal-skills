# Route Selection Workflow

## Purpose

Use this compact reference only to choose the current-turn `route`, `support`,
and compact self-contained `intent_summary` for `statectl begin`. Route
selection is mandatory for every new operation.
Do not answer, analyze, draft, inspect project materials, or create outputs
directly from the user request; first commit the plan, then load the planned
route reference. Keep route selection silent unless there is a blocker.

The router chooses who works this turn. It does not decide a member's internal
workflow lane, handoff status, output status, or final answer.

## Inputs

Read these before planning:

1. The current user message.
2. The validated state at the `state_path` returned by `statectl open`,
   including any pending decision and response receipt.
3. The immediately previous user-facing response for a direct question or
   boundary; a matching pending decision is authoritative for the chosen
   option's assignment.
4. `references/route_index.yaml`.

Do not load `references/method_route_catalog.yaml` from the router. Only
`causal_check` loads the detailed method catalog when method recommendation is
needed.

## Conditional Routing References

Load conditional routing references only after the intention check below selects
that branch:

- `references/report_routing_workflow.md`: report requests, report approval,
  reviewer-facing writing, limitations wording, report output, or recent
  report-writer chamber feedback.
- `references/analysis_routing_workflow.md`: analysis requests, approval or
  revision of an analysis scope, method design/support selection, or recent
  analysis-execution chamber feedback.

If neither condition applies, do not load these files.

## Allowed Plan Shapes

Always submit the assignment to `statectl begin` before loading any planned
route reference. The controller constructs and persists `next_step_plan` as
current-turn routing only, not a durable queue or deck.

The examples below show command-specific fields only; every mutation also uses
the expected project ID and revision from the latest controller result.

Team-lead-only:

```json
{"route":"team_lead","intent_summary":"..."}
```

One core route plus team lead:

```json
{"route":"data_audit","intent_summary":"..."}
```

Analysis route plus team lead:

```json
{"route":"analysis_execution.<design_id>","support":null,
 "intent_summary":"..."}
```

Core routes are `data_audit`, `domain_expert`, `causal_check`,
`causal_discovery`, and `report_writer`.

The controller appends `team_lead` and rejects mixed or unknown routes. For
analysis, encode a listed design as `analysis_execution.<design_id>` and use
`support` only for a listed support route or `null`.

When a matching pending decision exists, submit an unmodified choice as
`selection: {decision_id, option_number}`. The controller retrieves its
assignment; do not reconstruct it.

Include `scope_ref` only when routing approval of an existing ready analysis or
report scope. A non-null `scope_ref` accepted by `begin` records that approval
for worker resume; the worker does not re-decide it from a later message. Write
`intent_summary` as a resumable assignment naming the requested action and only
the essential target, material identifier or path, and output constraint needed
to restart the route. Do not store transcript, detailed route payloads, scope
cards, approval prose, mode flags, or route findings there; route-owned state
holds the detail.

## Routing Priority

First infer the user's current intention from the current message, the pending
decision, the previous direct next step and boundary, and the current state.
Route from that inferred intention, not from keywords alone.

A choice binds only when the current message unambiguously identifies one menu
item. A bare number additionally requires that menu in the immediately previous
user-facing response. Without a matching pending decision, use normal routing
instead of `selection`. A generic confirmation binds only when the previous response's
`[? Next Steps]` asked one explicit yes/no question about an action, approval,
or clarification.
A successful selection consumes the decision; any successful normal `begin`
supersedes it.
Analysis or report execution requires one uniquely identified ready scope whose
identity and revision have not changed since presentation. If an approval or
execution request names a noncurrent scope, treat it as stale approval and plan
only `team_lead`; do not route restoration, revision, or execution.

Apply these rules in order:

1. If the intention is outside the current project or causal scope, or needs no
   project-state update, plan only `team_lead`.
2. If the intention is unclear, could refer to multiple pending options, rejects
   them without giving a new in-scope request, or is only meta, setup, boundary,
   synthesis, or no-action, plan only `team_lead`.
3. If the intention selects a pending choice or answers the previous direct
   question, route the matching work only when it remains inside the project
   and causal boundary.
   For analysis or report execution, a matching `current_status: ready` handoff
   must exist.
4. If the intention is to revise or add work based on the previous user-facing
   headings, route the changed or added work normally inside the current project
   and causal boundary.
5. If the intention is new project-scope information or a new in-scope request,
   route the relevant member or work path using the selection rules below.
6. If no route can make a meaningful state update, plan only `team_lead`.

When a message asks for several in-scope things at once, infer the user's
dominant current intention from the prior headings and current wording, then
choose one bounded assignment for this `begin`.

For in-scope work selection after the conversation match:

- If a clear strong preference stays inside causal, data, discovery, or report
  boundaries, route that preference.
- If user-provided information still lacks relevant core review, route the most
  relevant unreviewed or stale core member.
- If the intended action, target, claim boundary, output, or authorization
  remains materially ambiguous, plan only `team_lead`. Otherwise choose the
  most useful valid route; the user need not name it.
- Load the report or analysis routing reference only when the selected branch is
  report or analysis work.

For exploration:

- Plan `data_audit` when actual data, a file path, schema, variables, sample
  rows, a data dictionary, or a concrete dataset description is provided. Also
  plan it for timing, leakage, missingness, dependence, support/positivity, data
  validity, or feasible restructuring questions.
- Plan `causal_check` when the user gives a causal question, claim, exposure,
  intervention, outcome, estimand, assumption, target analysis, or method idea.
- Plan `domain_expert` when the user gives a domain, setting, population,
  construct, measurement, endpoint, integration issue, field-practice question,
  common-practice question, precedent, reporting norm, or standard outcome.
- Plan `causal_discovery` when the request is about graph structure, variable
  neighborhoods, discovery artifacts, graph-informed feature work, local
  screening, time-series graph exploration, or reviewing discovery output.
- Prefer missing checks before improving limited checks.
- If multiple checks are missing, choose the one most directly connected to the
  user's current request.
- After `data_audit` changes analysis-relevant facts, route `causal_check` only
  when causal readiness or the current design/support recommendation is missing
  or stale.

For analysis begin eligibility and approval binding, use
`analysis_routing_workflow.md`.

## Do Not Do During Route Selection

- Do not build the final answer.
- Do not update durable route sections.
- Do not include detailed report scope, report outlines, analysis plans,
  approval prose, or route findings in `intent_summary`.
- Do not load the detailed method catalog.
- Do not exceed the allowed plan shapes.
- Do not load any planned route unless `statectl begin` succeeds.
