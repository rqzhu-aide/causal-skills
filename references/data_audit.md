# Route: data_audit

Use this route to audit whether the project has well-defined, valid data inputs
for causal framing, analysis planning, or execution. This worker remains silent
and submits internal findings for `team_lead` to synthesize.

## Plan Entry

Read the validated state before route work. Proceed only at `worker_pending`
when the committed plan's worker route is exactly `data_audit`.

Use `state_meta.active_operation.intent_summary`, live state, inspectable files,
and any consistent detail still available from the operation-opening message as
the assignment. On resume, a new message does not change it. Submit one
`statectl apply` JSON payload with `actor: data_audit`, `updates` containing only
`data_facts` and `council_chamber.data_audit`, and optional top-level
`artifact`. The controller owns timestamps, artifact records, and transition to
`lead_pending`; never edit the YAML, plan, or project summary directly.

## Causal Data Audit Scope

Audit data facts that could change the causal target, analysis route, claim
boundary, or execution feasibility:

- data source existence, inspectability, grain, and unit of observation;
- exposure/treatment/intervention definition, timing, and support;
- outcome definition, outcome timing, censoring, and event/support counts;
- baseline covariates, post-treatment variables, mediators, colliders, and
  variables measured after the outcome;
- inclusion/exclusion criteria, selection, attrition, missingness, and missing
  data patterns that could change the estimand;
- repeated measures, clustering, household/site/provider dependence, panels,
  matched sets, or network/spillover structure;
- leakage risks from post-outcome variables, post-treatment variables,
  preprocessing before splitting, duplicate subjects, or outcome-informed
  feature construction;
- support/positivity problems, sparse strata, unsupported subgroups, or extreme
  treatment/exposure imbalance.

When actual data are available and fuller inspection is useful, summarize only
decision-relevant findings in YAML and put full inventories, missingness tables,
support diagnostics, profiling output, or reshape notes in audit artifacts.

## Data Facts Updates

Submit durable data context only under `updates.data_facts`. Keep it compact and
causal-analysis oriented; it is live decision memory, not a data dictionary.

Supported fields:

- `data_checked`: `passing`, `limited`, `imagined`, or `blocked`; leave
  `not_checked` only if no data audit work occurred.
- `data_sources`: data files, tables, or user-provided descriptions reviewed.
- `audit_scope`: compact description of what was checked.
- `unit_of_observation`: analysis grain and any mismatch with assignment,
  exposure, or outcome grain.
- `variables`: key variable groups, causal roles, timing-critical fields, and
  blockers only.
- `structure_notes`, `timing_notes`, `dependency_notes`, `leakage_risks`,
  `missingness_notes`, `support_notes`, `validity_questions`: compact bullets
  that affect claim support or analysis routing.
- `exploratory_runs`, `artifact_refs`: only when actual audit output was
  created.

Use `data_checked: passing` only when source, unit, exposure/treatment, outcome,
timing, key variables, and major leakage/missingness/support blockers are
resolved or explicitly bounded for the requested analysis. Use `limited` when
some useful planning or bounded review is possible but important data facts are
missing. Use `imagined` only when no actual data or verified data description is
available and the route records a hypothetical structure for planning; never
treat `imagined` as analysis-ready. Use `blocked` when data structure, timing,
leakage, missingness, support, or unavailable files prevent valid execution.

## Council Chamber Updates

Submit chamber feedback only under `updates.council_chamber.data_audit`.

Set:

- `current_status`: one short sentence on what the audit could verify.
- `summary`: compact synthesis of data support, blockers, or usable facts.
- `questions_for_user`: 0-3 questions or choices that would improve the next
  decision.
- `feedback_to_route`: 0-3 route-facing suggestions, such as useful domain,
  causal, discovery, or analysis follow-up.

Keep chamber feedback short, decision-facing, grounded in `data_facts` or
current uncertainty, and free of schema labels. Use it for data support,
blockers, reshaping needs, timing concerns, leakage risks, support limitations,
or immediately useful member follow-up. Recommend another member, such as
`domain_expert` or `causal_check`, only when the current state gives that member
something concrete to inspect, clarify, or decide. If the missing ingredient is
user-provided material, name that material need plainly.

## Audit Outputs

`data_audit` may create a durable audit artifact only when actual data or
inspectable files exist and a useful audit output is created.

Use artifacts for exhaustive detail: full column inventories, profiling tables,
missingness tables, support diagnostics, reshape notes, scripts, notebooks, or
generated audit reports. `data_facts` should hold only compact interpretation
and artifact references.

When any script, notebook, table, figure, or exploratory audit output is
created, follow `references/artifact_output_policy.md`: reserve first, write and
validate temporary output, atomically publish it with its completion manifest,
then include the completed artifact and compact `data_facts` references in
`statectl apply`.

Do not reserve or submit an artifact for an audit that created no durable
output.

## Boundaries

This route audits data readiness and may run bounded profiling or audit code
when inspectable data exist. It does not choose the final causal method,
validate a causal claim, or execute the approved causal analysis.

Do not let generic profiling crowd out causal-data risks: unit, timing, leakage,
support, missingness, dependencies, and variable roles are the priority.
