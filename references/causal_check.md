# Route: causal_check

Use this route to audit whether the causal question, design, method route, or
conclusion is supported by the current project state. This worker remains silent
and submits internal findings for `team_lead` to synthesize.

## Plan Entry

Read the validated state before route work. Proceed only at `worker_pending`
when the committed plan's worker route is exactly `causal_check`.

Use `state_meta.active_operation.intent_summary`, live state, and any consistent
detail still available from the operation-opening message as the assignment. On
resume, a new message does not change it. Submit one `statectl apply` JSON
payload with `actor: causal_check` and `updates` containing only `causal_facts`
and `council_chamber.causal_check`. The controller owns timestamps and
transition to `lead_pending`; never edit the YAML, plan, project summary, or
artifact records directly.

## Causal Statistical Audit Scope

Audit what the current design and data can support, not how confidently the
result can be written. A polished causal sentence is still inappropriate if the
design does not support it.

Focus on causal ingredients that could change the claim or analysis route:

- causal question, exposure/treatment, comparator, outcome, target population,
  time zero, follow-up, and estimand;
- whether treatment/exposure, covariates, mediators, outcomes, censoring, and
  repeated measures are ordered correctly;
- design-data fit: assignment or exposure process, confounding, selection,
  measurement, missingness, support/positivity, interference, clustering,
  leakage, and transportability;
- whether assumptions are plausible enough for the intended claim;
- whether sensitivity, falsification, negative-control, robustness, or
  diagnostic checks would change interpretation;
- whether the honest wording is causal, qualified causal, association-only,
  descriptive, predictive, or exploratory.

Keep causal state compact. Store only decision-relevant assumptions, threats,
claim boundaries, and route implications.

## Readiness And Method Route Logic

When the task requires causal readiness or a design/support recommendation,
load `references/method_route_catalog.yaml` and use route IDs exactly as written
in `route_index.yaml`.

Do not recommend a method route merely because the user named it. Treat the
latest explicit user target as current; intended use or a preferred alternative
must not silently narrow or replace its population, contrast, or estimand. If a
material target element is unspecified, record it as unresolved. Match the route
to that target, data structure, timing, estimand, identifying assumptions, and
likely diagnostics.

Use two readiness layers:

- `causal_checked`: core causal-review status, `passing`, `limited`, or
  `blocked`.
- `analysis_readiness`: analysis-route readiness status, `ready`, `limited`,
  `not_ready`, or `blocked`.

When the assignment assesses an alternative without changing the current
target, preserve the current target-specific causal facts, readiness, and
`recommended_method_routes`; record the alternative's feasibility, limitations,
and decision discriminators in chamber feedback. An alternative becomes current
only when the user explicitly adopts it. Whenever the current target or method
decision changes, keep its target-defining facts, readiness, support status,
checks, and route recommendations mutually consistent; replace superseded
values rather than carrying them forward.

Use at most one primary `design` item and, only when materially useful, one
separate `support` item. Never retain a previous target's route or encode
selected support only in `route_cautions`. Use `statistical-validity` only when
unresolved concerns exceed the selected design's normal diagnostics. Do not
recommend support-only execution or add support by default.

If more than one design remains plausible, leave `recommended_method_routes`
empty, keep `analysis_readiness: not_ready`, and record the smallest fact or
decision that would distinguish them. Do not recommend another `causal_check`
turn without naming that missing discriminator.

`recommended_method_routes` identifies the design eligible for later scope
review by `analysis_execution`; it is not a prepared scope, approval, or proof
of sufficiency. Use `route_cautions` for non-obvious project-specific issues
that could make the route wrong, narrower, or require special handling.

Set `analysis_readiness: ready` or `limited`, and write mature
`recommended_method_routes`, only when `data_facts.data_checked` and
`domain_knowledge.domain_checked` and the resulting `causal_checked` status are
each `passing` or `limited`. If a review is missing, blocked, or stale, or the
data are imagined, record likely concerns and needed checks, but keep analysis
readiness `not_ready` or `blocked` and avoid mature method-route recommendations.

Use `analysis_readiness: ready` only when a loadable causal design route is
recommended. Use `limited` when a bounded causal route or explicit non-causal
fallback is mature enough for scope review. Use `not_ready` when data, domain,
or causal clarification could repair the path. Use `blocked` when no acceptable
causal or non-causal fallback should proceed.

Use `descriptive_association` only as an explicit non-causal fallback when
causal identification is not supportable but association summaries are still
useful. Pair it with no-causal-claim wording and `analysis_readiness: limited`.

Do not write null, non-loadable, or support-only items into
`recommended_method_routes`. If no route is mature enough for scope review,
leave the list empty and explain the maturity issue in `support_status`,
`recommended_checks`, and chamber feedback.

## Causal Facts Updates

Submit supported `causal_facts` fields when supported by the request:

- `causal_checked`: `passing`, `limited`, or `blocked`; leave `not_checked`
  only if no causal check work occurred.
- `analysis_readiness`: `ready`, `limited`, `not_ready`, or `blocked` when the
  task requires causal readiness or design/support selection.
- `causal_question`, `exposure_or_intervention`, `outcome`, `estimand`.
- `assumptions`: compact bullets for assumptions that most affect the current
  claim or analysis path.
- `threats`: compact bullets for validity threats, not a full limitations
  narrative.
- `support_status`: concise claim/readiness boundary.
- `recommended_checks`: checks that would change the claim or route.
- `recommended_method_routes`: concise route items with `id`, `category`,
  and `route_cautions`.

Use `causal_checked: passing` only when the causal question, treatment/exposure,
comparator, outcome, time zero, target population, estimand, main assumptions,
and claim boundary are clear enough for the requested analysis. Use `limited`
when useful framing or a constrained route is possible but incomplete. Use
`blocked` when the requested claim or execution path is unsupported,
overclaimed, unidentified, or outside the skill boundary and no acceptable
fallback is available.

## Council Chamber Updates

Submit chamber feedback only under `updates.council_chamber.causal_check`.

Set:

- `current_status`: one short handoff disposition.
- `summary`: compact synthesis of claim support, analysis readiness, or main
  causal boundary.
- `questions_for_user`: 0-3 questions or choices that would improve the next
  decision.
- `feedback_to_route`: 0-3 route-facing suggestions, such as useful data,
  domain, discovery, support, or analysis follow-up.

Keep chamber feedback short, decision-facing, grounded in `causal_facts`,
data/domain state, or current uncertainty, and free of schema labels. When
analysis readiness or method selection was requested, summarize the recommended
design/support direction, why only a non-causal fallback is mature, or why no
method reaches the limited threshold.

Recommend another member, such as `data_audit` or `domain_expert`, only when the
current state gives that member something concrete to inspect, clarify, or
decide. If the missing ingredient is user-provided material, name that material
need plainly instead of implying a teammate can already review it.

## Boundaries

This route may inspect inputs, completed evidence, and input- or
design-feasibility diagnostics. It must not compute a target result: any new
quantity, comparison, model-fit result, or test intended as an answer to an
`analysis_execution` target or a refinement of it, including a raw or adjusted
association or a subgroup or interaction contrast. Existing approved artifact
results may be cited without recomputation or extension. Store identification,
support, readiness, and claim boundaries in `causal_facts`, not target-analysis
results. This route does not choose final report wording, prepare analysis
scopes, or create outputs.

Do not create output folders or `artifact_records` entries from `causal_check`
work. Do not let team-review suggestions crowd out a critical causal boundary,
blocked claim, or method-readiness judgment.
