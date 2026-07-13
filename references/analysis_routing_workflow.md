# Analysis Routing Workflow

Load this reference only for analysis requests, approval or revision of an
analysis scope, method design/support selection, or recent
`analysis_execution` chamber feedback.

## Routing Role

Use this file only after route selection has inferred an in-scope analysis
intention. The router selects a valid `analysis_execution.<design_id>` route
with optional support. The selected design route decides whether the current
turn calls for scope preparation, revision, blocked feedback, or approved
execution.

Do not put scope status, mode, task text, or approval state in
`next_step_plan`.

## Existing Analysis Feedback

Read `council_chamber.analysis_execution` as a mapping of design ids to current
analysis handoffs. For each relevant design slot, review `scope_id`,
`scope_revision`, `current_status`, `support`, `summary`,
`questions_for_user`, and `feedback_to_route`.

Status meanings: `requested` means scope review is unfinished or the slot is
missing; `ready` means reviewed and waiting for user approval; `blocked` means
clarification, repair, or fallback is needed; `done` means analysis output was
created.

Decision rules:

- If the user clearly approves one relevant `ready` slot identified by the
  current message and its preceding team-lead context, route
  `analysis_execution.<design_id>` with that slot's valid `support` and pass its
  exact `{kind: analysis, id: scope_id, revision: scope_revision}` as the
  `begin` `scope_ref`.
- If multiple `ready` slots remain plausible, plan only `team_lead`. Recency may
  order their presentation but never selects one for execution.
- If the user changes the causal target, contrast, data source, model family,
  main output, or claim boundary, do not reference or approve the old scope;
  route the new work normally so the design route can revise it.
- If the relevant slot is missing, unknown, invalid, or method fit changed
  without a clear design/support route, route `causal_check` or `team_lead`
  instead of guessing.
- If no current analysis route can reasonably match the user's intent, plan
  only `team_lead`.

## Route Recommendation Rules

- Core review gate: create `analysis_execution.<design_id>` only when
  `data_facts.data_checked`, `domain_knowledge.domain_checked`, and
  `causal_facts.causal_checked` are each `passing` or `limited`, and
  `causal_facts.analysis_readiness` is `ready` or `limited`.
- If the gate fails, route the missing or stale reviewer instead of analysis:
  `data_audit` for missing, blocked, imagined, or changed data facts;
  `domain_expert` for missing, blocked, or changed construct/domain facts; and
  `causal_check` for missing, blocked, not-ready, or changed causal readiness.
  If the missing ingredient is user information rather than route work, plan
  only `team_lead`.
- If `causal_facts.analysis_readiness` is missing, `not_ready`, or `blocked`,
  plan `causal_check` unless visible state says the blocker is missing user
  information; then plan only `team_lead`.
- For causal design routes, create `analysis_execution.<design_id>` only when
  `recommended_method_routes` includes one loadable item with that design id and
  `category: design`.
- If `support` is non-null, create `analysis_execution.<design_id>` only when
  `recommended_method_routes` includes a loadable item with that support ID and
  `category: support`.
- Treat null IDs, non-loadable IDs, missing category, support-only
  recommendations, or multiple competing design recommendations as malformed;
  plan `causal_check` or `team_lead`.
- If the recommendation has `id: descriptive_association`, create
  `analysis_execution.descriptive_association` only when
  `causal_facts.analysis_readiness: limited` and route cautions or
  `support_status` explicitly say causal claims are not supported.
- If the recommendation is not loadable, plan only `team_lead` for boundary
  synthesis.

Use the analysis `begin` contract in `route_selection_workflow.md`. A persisted
non-null `scope_ref` is the recorded approval result; on resume, do not
reinterpret it from a later message. Before execution, the worker still
rechecks the exact scope/support and live data, domain, and causal gates. If any
gate changed, return a ready or blocked handoff without output.
