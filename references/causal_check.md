# Route: causal_check

Use this route to audit whether the causal question, design, method route, or
conclusion is supported by the current project state.

## Assignment And Ownership

<!-- partial:worker-resume -->
Use the worker `turn_context` and its persisted assignment; a newer message
does not change resumed work. Use the full-state fallback only for relevant
detail omitted from the context.
<!-- /partial:worker-resume -->

Submit one silent `apply` as `causal_check`, updating only `causal_facts` and
`council_chamber.causal_check`.

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
research target: at most one `preferred` strategy when evidence can rank a
responsible default, plus up to two credible `alternative` or `fallback`
strategies that could materially change the research decision. It is not a
list of parallel executable routes, a prepared scope, or approval. Do not
force alternatives; a preferred-only portfolio is correct when other paths add
no meaningful value. When more than two nonpreferred paths are credible, keep
the two with the greatest decision impact and feasible next step, and leave
omitted candidates out of the durable portfolio rather than implying they were
rejected.

Each item carries `role`, `target`, `approach`, optional catalog `design` and
`support` (support requires a design), `data_work`, `requirements`,
`main_risk`, and `prefer_when` -- together: what the path enables, what it
requires, its main validity risk or claim limit, and when it is preferable.
The controller enforces counts, shapes, length caps, and preferred-route
mirroring. Put the exact next owner and one-operation assignment in causal
chamber feedback, not in this array.

Consider paths across: defensible data restructuring, linkage, restriction, or
additional data; a different target, population, comparator, follow-up,
estimand, or design; an explicitly non-causal descriptive fallback; or a
future-data path supporting a stronger claim.

Same-design model, estimator, uncertainty, preprocessing, and implementation
alternatives stay outside `analysis_options`: when decision-relevant, send
them through causal chamber feedback to the selected design worker for scope
preparation or revision. Routine diagnostics and safeguards belong in a
strategy's eventual scope, not separate options. Never rank or create
strategies from the direction, significance, or desirability of a target
result; a failed analysis may reveal a design or data problem, but it does not
justify outcome-driven target switching or data manipulation.

A preferred strategy must match the current target and
`recommended_method_routes`: one design route, at most one materially useful
support route, never a previous target's route, never support-only execution
or support added by default, and never selected support encoded only in
`route_cautions`. Nonpreferred portfolio items remain non-executable and do
not by themselves make the default `not_ready`.

Distinguish rankable alternatives from unresolved ambiguity: if a material
discriminator is missing, use no `preferred` item, leave
`recommended_method_routes` empty, keep `analysis_readiness: not_ready`, and
record the smallest fact or decision that would distinguish the candidates,
rather than recommending another `causal_check` turn without naming it.

`causal_check` alone adds, ranks, selects, and clears `analysis_options`.
Evaluate data- and domain-chamber suggestions before adopting them. When
assessing an unselected alternative, preserve the current preferred target,
readiness, and route, updating only that candidate's evidence and
discriminator. An alternative becomes current only after the user explicitly
adopts it and causal review confirms it is supportable: then promote it,
reconcile all target-defining facts and routes, and remove incompatible items.
Clear items that are rejected, infeasible, dominated, duplicative, or no
longer decision-relevant; rebuild or clear the portfolio when the target is
replaced rather than appending stale options.

`recommended_method_routes` identifies the design eligible for later scope
review by `analysis_execution`; it is not a prepared scope, approval, or proof
of sufficiency. Use `route_cautions` for non-obvious project-specific issues
that could make the route wrong or narrower. Use `statistical-validity` only
when unresolved concerns exceed the selected design's normal diagnostics.

Set `analysis_readiness: ready` or `limited`, with mature
`recommended_method_routes`, only when `data_facts.data_checked`,
`domain_knowledge.domain_checked`, and the resulting `causal_checked` are each
`passing` or `limited`; otherwise record likely concerns and needed checks but
keep readiness `not_ready` or `blocked` with no mature recommendations, and
never treat imagined data as ready. Use `ready` only when a loadable causal
design route is recommended; `limited` when a bounded causal route or explicit
non-causal fallback is mature enough for scope review; `not_ready` when data,
domain, or causal clarification could repair the path; `blocked` when no
acceptable causal or non-causal fallback should proceed. A blocked portfolio
has no `preferred` strategy or executable recommendation, though it may keep
at most two nonpreferred future paths as clearly unavailable context. Do not
label a path `blocked` if a feasible causal or descriptive fallback can
responsibly proceed.

Use `descriptive_association` only as an explicit non-causal fallback when
identification is not supportable but association summaries still help; pair
it with no-causal-claim wording and `analysis_readiness: limited`. Never write
null, non-loadable, or support-only items into `recommended_method_routes`;
with no mature route, leave the list empty and explain the maturity issue in
`support_status`, `recommended_checks`, and chamber feedback.

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
- `analysis_options`: following the portfolio rules above.

Use `causal_checked: passing` only when the causal question, treatment/exposure,
comparator, outcome, time zero, target population, estimand, main assumptions,
and claim boundary are clear enough for the requested analysis. Use `limited`
when useful framing or a constrained route is possible but incomplete. Use
`blocked` when the requested claim or execution path is unsupported,
overclaimed, unidentified, or outside the skill boundary and no acceptable
fallback is available.

## Council Chamber Updates

<!-- partial:chamber-slot -->
Submit only this route's chamber slot:

- `current_status`: one short handoff disposition.
- `summary`: compact synthesis of this route's finding, blocker, or
  uncertainty.
- `questions_for_user`: 0-3 questions or choices that would improve the next
  decision.
- `feedback_to_route`: 0-3 route-facing suggestions for useful member
  follow-up.

Keep it short, decision-facing, grounded in route-owned state or current
uncertainty, and free of schema labels.
<!-- /partial:chamber-slot -->

When analysis readiness or method selection was requested, summarize the
recommended design/support direction, why only a non-causal fallback is
mature, or why no method reaches the limited threshold.

When a portfolio choice is actionable, name its exact next owner and
one-operation assignment: `data_audit` for data construction or repair,
`domain_expert` for construct or population interpretation, `causal_check` for
target, estimand, or design reassessment, and the selected design worker for
same-design scope formulation. Do not reduce a concrete candidate to generic
advice to reopen or revise.

<!-- partial:teammate-concrete -->
Recommend another member only when the current state gives that member
something concrete to inspect, clarify, or decide. If the missing ingredient
is user-provided material, name that material need plainly rather than
implying a teammate can already review it.
<!-- /partial:teammate-concrete -->

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
