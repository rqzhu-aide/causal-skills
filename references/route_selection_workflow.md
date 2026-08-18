# Route Selection Workflow

## Purpose

Choose the current operation's route, optional support, and compact
self-contained `intent_summary`. Route selection is mandatory before every new
operation, including team-lead-only work. It chooses who works, not that
worker's internal lane, handoff status, scientific conclusion, or final answer.

Use the controller's router `turn_context`, the current user message, and any
unchanged routing references already available. The context's
`previous_response_cue` contains only the prior options, boundary, and next-step
blocks needed for continuity; `pending_decision` remains authoritative for a
numbered choice. Use the full-state fallback only when the present routing
decision genuinely depends on omitted detail.

Keep routing silent. Do not inspect project materials, analyze, draft, or create
output before `begin` commits the assignment.

## Conditional Routing References

After identifying an analysis or report intention, ensure its routing reference
is available before selecting the final route:

- `references/analysis_routing_workflow.md` for analysis, scope approval or
  revision, design/support selection, or recent analysis-execution feedback.
- `references/report_routing_workflow.md` for report requests, approval,
  reviewer-facing writing, limitations wording, report output, or recent
  report-writer feedback.

Do not load either file for unrelated work. Only `causal_check` loads
`references/method_route_catalog.yaml` when method recommendation is needed.

## Assignment Contract

Submit exactly one controller-allowed assignment through `begin`: team lead
alone, one core route followed by team lead, or one analysis design with
optional support followed by team lead. The controller constructs the plan and
rejects mixed or unknown routes.

When a matching pending numbered choice exists, submit its unmodified
`selection: {decision_id, option_number}`. The controller retrieves the stored
assignment; do not reconstruct it.

For analysis or report execution, include the exact current ready `scope_ref`.
For unchanged execution or review of a discovery contract, include its exact
reference only when both identity and contract exist. A discovery reference
binds work but is not approval. A materially new or revised discovery exercise
begins unbound. Existing-material review without output also remains unbound
and cannot alter the current sidecar; review that creates output follows the
new-or-revised exercise rule. Replacement of an occupied discovery sidecar must
be clear from the request or selected option. If the message cannot distinguish
unchanged from new or revised discovery work, route only team lead.

Write `intent_summary` as a resumable assignment naming the requested action
and only the essential target, material identifier or path, and output
constraint. For discovery, say whether the assignment scopes, revises, reviews,
or runs the exercise. Do not store transcript, scope cards, approval prose,
route findings, mode flags, or detailed payloads there.

## Conversation Binding

Infer intention from the current message, pending decision, previous response
cue, and current router context, not from keywords alone.

A choice binds only when the message unambiguously identifies one option. A
bare number additionally requires that menu in the immediately preceding
response. Without a matching pending decision, use normal routing. A generic
confirmation binds only when the preceding next step asked one explicit yes/no
question about an action, approval, or clarification.

Analysis or report execution requires one uniquely identified ready scope whose
identity and revision remain current. If it was already noncurrent before this
message, route only team lead. If this message materially changes the scope,
route its owner for revision without a scope reference.

Apply these priorities in order:

1. Outside-project, outside-causal, meta, setup, synthesis, thanks, no-action,
   unclear, or multiply interpretable input routes only team lead.
2. An unambiguous pending choice or direct answer routes its stored or matching
   in-scope work, subject to current scope and gate requirements.
3. A revision or added request based on the previous headings routes the owning
   member normally.
4. New project information or a new in-scope request routes the member best
   able to make one meaningful durable update.
5. If no member can make such an update, route only team lead.

For several simultaneous in-scope requests, choose one bounded assignment that
matches the dominant current intention. Later work is neither promised nor
queued.

## Route Choice

- Honor a clear user preference that remains inside causal, data, discovery,
  or report boundaries.
- When relevant core review is missing or stale, choose the reviewer most
  directly connected to the request. For a discovery run, a known missing
  review takes precedence only when it could materially change execution or
  interpretation; discovery handles blockers first found during its own work.
- If the intended target, claim boundary, output, or authorization remains
  materially ambiguous, route only team lead. Technical choices inside a clear
  route assignment belong to that worker.
- Prefer a missing check over improving a limited check, and choose the missing
  check most directly connected to the current request.
- After data audit changes analysis-relevant facts, route causal check only when
  readiness or the design/support recommendation is now missing or stale.

Use the core routes as follows:

- `data_audit`: inspect actual data, paths, schemas, variables, sample rows, or
  concrete dataset descriptions; evaluate timing, leakage, missingness,
  dependence, support, validity, or feasible restructuring. A dictionary used
  only to interpret constructs, measures, endpoints, labels, or coding may
  instead belong to domain expert.
- `domain_expert`: interpret domain, setting, population, constructs,
  measurement, endpoints, integration, field practice, precedents, reporting
  norms, or standard outcomes.
- `causal_check`: establish or refresh the causal target, claim boundary,
  analysis readiness, or design/support recommendation. When those are current
  and identify one eligible design, use the analysis routing workflow for scope
  work.
- `causal_discovery`: handle sufficiently identified graph structure, variable
  neighborhoods, discovery artifacts, graph-informed feature work, local
  screening, time-series graph exploration, or discovery-output review. A
  direct run must identify the target, inputs, variable set, output form, and
  output authorization; its worker chooses unfixed method and diagnostic
  details. Route scope-only discovery when requested. Use team lead when user
  input is needed to identify or authorize the work.
- `report_writer`: use the report routing workflow.

For analysis begin eligibility and exact approval binding, use
`references/analysis_routing_workflow.md`.
