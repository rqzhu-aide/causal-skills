# Route: causal_check

Use this route to audit whether the causal question, design, method route, or
conclusion is supported by the current project state.

## Assignment And Ownership

Use the worker `turn_context` and persisted assignment; a newer message does not
change resumed work. Use the full-state fallback only for relevant detail
omitted from the context. Submit one silent `apply` as `causal_check`, updating
only `causal_facts` and `council_chamber.causal_check`.

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

Treat discovery findings only as candidate questions and diagnostics. Establish
variable roles, adjustment validity, method fit, and analysis readiness
independently of those findings, using data facts, domain knowledge, timing, and
causal assumptions.

## Readiness And Method Route Logic

When the task requires causal readiness or a design/support recommendation,
load `references/method_route_catalog.yaml` and use its route IDs exactly. The
controller validates every submitted ID.

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

## Research Strategy Portfolio

When causal readiness or method selection is assessed, maintain
`causal_facts.analysis_options` as compact decision support for the current
research target. It is not a list of parallel executable routes, a prepared
scope, or approval.

Use at most three items: one `preferred` strategy when current evidence can
rank a responsible default, plus no more than two credible `alternative` or
`fallback` strategies when they could materially change the research decision.
Do not force alternatives. A portfolio containing only the preferred strategy
is correct when other paths add no meaningful value. When more than two
nonpreferred paths are credible, retain the two with the greatest current
decision impact and feasible next step; keep omitted candidates out of the
durable portfolio rather than silently implying they were rejected.

Each item contains `role`, `target`, `approach`, optional `design`, optional
`support`, `data_work`, `requirements`, `main_risk`, and `prefer_when`. Use
catalog IDs for `design` and `support`; support requires a design. Together
these fields must say what the path enables, what data, assumptions, or
preparation it requires, its principal validity risk or claim limit, and the
fact or preference that would make it preferable. Put its exact next owner and
one-operation assignment in causal chamber feedback rather than this array.
Keep each scalar or list item within 500 characters, use at most four
`data_work` and four `requirements` items, and keep total decision text within
2,500 characters per strategy.

Consider distinct, scientifically meaningful paths across:

- defensible data restructuring, linkage, restriction, or additional data;
- a different target, population, comparator, follow-up, estimand, or design;
- an explicitly non-causal descriptive fallback; or
- a future-data path that could support a stronger claim.

Same-design model, estimator, uncertainty, preprocessing, and implementation
alternatives stay outside `analysis_options`. When one is decision-relevant,
send it through causal chamber feedback to the selected design worker for scope
preparation or revision. This avoids a causal-review turn when the target and
identification strategy are unchanged.

Ordinary diagnostics, estimator safeguards, and sensitivities required by one
strategy belong in its eventual scope rather than separate options. Never rank
or create strategies from the direction, significance, or desirability of a
target result. A failed analysis may reveal a design or data problem, but it
does not justify outcome-driven target switching or data manipulation.

When one strategy is defensibly preferred, make it consistent with the current
target and `recommended_method_routes`. Other portfolio items remain
non-executable and do not by themselves make the default `not_ready`. Use at
most one primary `design` route and, only when materially useful, one separate
`support` route. Never retain a previous target's route or encode selected
support only in `route_cautions`. Use `statistical-validity` only when unresolved
concerns exceed the selected design's normal diagnostics. Do not recommend
support-only execution or add support by default.

Distinguish rankable alternatives from unresolved ambiguity. If available
evidence cannot responsibly prefer one strategy because a material
discriminator is missing, use no `preferred` item, leave
`recommended_method_routes` empty, keep `analysis_readiness: not_ready`, and
record the smallest fact or decision that would distinguish the candidates.
Do not recommend another `causal_check` turn without naming that discriminator.

`causal_check` alone adds, ranks, selects, and clears `analysis_options`.
Evaluate data- and domain-chamber suggestions before adding them. When assessing
an unselected alternative, preserve the current preferred target, readiness,
and route while updating only that candidate's evidence and discriminator.
An alternative becomes current only after the user explicitly adopts it and
causal review confirms it remains supportable. Then promote it, reconcile all
target-defining facts and routes, and remove incompatible or superseded items.
Clear an item when it is rejected, infeasible, dominated, duplicative, or no
longer decision-relevant. Rebuild or clear the portfolio when the target is
replaced; never append stale options from an earlier target.

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

A blocked portfolio has no `preferred` strategy or executable method
recommendation. It may retain at most two nonpreferred future-data or future-
design paths only as clearly unavailable decision context. Do not label a path
`blocked` if a currently feasible causal or descriptive fallback can
responsibly proceed.

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
- `analysis_options`: one current preferred project-level strategy when
  rankable and up to two credible alternatives or fallbacks, following the
  portfolio rules above.

Use `causal_checked: passing` only when the causal question, treatment/exposure,
comparator, outcome, time zero, target population, estimand, main assumptions,
and claim boundary are clear enough for the requested analysis. Use `limited`
when useful framing or a constrained route is possible but incomplete. Use
`blocked` when the requested claim or execution path is unsupported,
overclaimed, unidentified, or outside the skill boundary and no acceptable
fallback is available.

## Council Chamber Updates

Submit only this route's chamber slot:

- `current_status`: one short handoff disposition.
- `summary`: compact synthesis of claim support, analysis readiness, or main
  causal boundary.
- `questions_for_user`: 0-3 questions or choices that would improve the next
  decision.
- `feedback_to_route`: 0-3 route-facing suggestions, such as useful data,
  domain, discovery, support, or analysis follow-up.

Keep it short, decision-facing, grounded in `causal_facts`, data/domain state,
or current uncertainty, and free of schema labels. When
analysis readiness or method selection was requested, summarize the recommended
design/support direction, why only a non-causal fallback is mature, or why no
method reaches the limited threshold.

When a portfolio choice is actionable, use chamber feedback to name its exact
next owner and one-operation assignment. Use `data_audit` for data construction
or repair, `domain_expert` for construct or population interpretation,
`causal_check` for target, estimand, or design reassessment, and the selected
design worker for same-design scope formulation. Do not reduce a concrete
candidate to generic advice to reopen or revise.

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
