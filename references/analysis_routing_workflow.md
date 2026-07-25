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

Scope status meanings: `requested` means scope review is unfinished or the slot
is missing; `ready` means reviewed and waiting for user approval; `blocked`
means clarification, repair, or fallback is needed; `done` means analysis
output was created.

Decision rules:

- If the user clearly approves one relevant `ready` slot identified by the
  current message and its preceding team-lead context, route
  `analysis_execution.<design_id>` with that slot's valid `support` and pass its
  exact `{kind: analysis, id: scope_id, revision: scope_revision}` as the
  `begin` `scope_ref`.
- If multiple `ready` slots remain plausible, plan only `team_lead`. Recency may
  order their presentation but never selects one for execution.
- If the user changes the causal target, contrast, data source, model family,
  main output, or claim boundary, the old scope is no longer current. Route the
  current eligible design to revise it; otherwise route the owner of the missing
  or stale eligibility state.
- Later committed data or domain findings make the causal review and any ready
  analysis scope stale only when they could change the target, design, support,
  or claim boundary. In that case route `causal_check` without a `scope_ref`;
  otherwise keep the review and scope current.
- A support-only change does not make the current design stale. When that design
  remains eligible, route it with the current support selection to revise the
  scope.
- A missing analysis slot is not unresolved method fit. If begin eligibility
  and the current design recommendation identify an eligible route, route that
  `analysis_execution` design without `scope_ref` and carry its current optional
  support. Route `causal_check` only when the design, or a materially required
  support choice, is missing, stale, or not unique; use `team_lead` only when
  user input must resolve the ambiguity.
- If no current analysis route can reasonably match the user's intent, plan
  only `team_lead`.

## Analysis Begin Eligibility

Call `statectl begin` for `analysis_execution.<design_id>` only when:

- `data_facts.data_checked`, `domain_knowledge.domain_checked`, and
  `causal_facts.causal_checked` are each `passing` or `limited`, and
  `causal_facts.analysis_readiness` is `ready` or `limited`;
- the current design recommendation matches `<design_id>`; and
- any non-null selected support matches the current support recommendation.

The controller enforces these structured requirements. The router uses
`descriptive_association` only with `analysis_readiness: limited` and an explicit
no-causal-claim boundary; the controller enforces the readiness value but does
not interpret prose.

If eligibility fails, route only the owner of the missing or stale state:
`data_audit`, `domain_expert`, or `causal_check`. Use only `team_lead` when the
missing input must come from the user or no valid route can be selected. Do not
prepare or execute analysis under that operation.

A non-null `scope_ref` supplied to `begin` records approval and remains
authoritative during worker resume; `begin` verifies it against the current
ready scope. After `begin` succeeds, the design route follows
`design_execution_contract.md` and does not repeat the entry gate.
