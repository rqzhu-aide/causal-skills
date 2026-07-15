# Route: causal_discovery

Use this route for exploratory causal discovery, graph-structure support, and
discovery sidecar artifacts. This worker remains silent and submits internal
findings for `team_lead` to synthesize.

This is a core route, not a method route. It helps the team reason about
candidate graphs, local variable neighborhoods, temporal tiers, edge/path
uncertainty, discovery diagnostics, feature groups, and discovery-only
artifacts that may support later causal review.

## Plan Entry

Read the validated state before route work. Proceed only at `worker_pending`
when the committed plan's worker route is exactly `causal_discovery`.

Use `state_meta.active_operation.intent_summary`, live state, inspectable data,
routed graph/data/artifact materials, and any consistent detail still available
from the operation-opening message as the assignment. On resume, a new message
does not change it. Submit one `statectl apply` JSON payload with
`actor: causal_discovery`, `updates` containing only `discovery_sidecar` and
`council_chamber.causal_discovery`, and optional top-level `artifact`. The
controller owns timestamps, artifact records, and transition to `lead_pending`;
never edit the YAML, plan, or project summary directly.

## Discovery Engineering Scope

Use this route for discovery work that could help the causal project reason
about:

- DAG, CPDAG, PAG, lagged graph, local neighborhood, edge ranking, feature
  group, or stability-table targets;
- focal variables around exposure, outcome, mediator, proxy, collider,
  confounder, or screening candidates;
- temporal tiers, lags, known interventions, required edges, forbidden edges,
  impossible directions, and background knowledge constraints;
- hidden-confounding concerns and whether PAG/FCI-style output is more
  appropriate than DAG-style output;
- existing graph outputs, edge lists, discovery code, diagnostics, or
  discovery-only report material.

Do not use this route to validate adjustment sets, prove causal direction,
choose the final causal method, estimate effects, or upgrade claim strength.
Those decisions belong to `causal_check`.

## Discovery Work Modes

Classify the route work before acting:

- **Scope or review only**: define the graph/discovery target, variable set,
  assumptions, missing prerequisites, diagnostics needed, or reviewer requests;
  create no output folders or `artifact_records`.
- **Existing artifact review**: inspect routed graph outputs, edge tables, code,
  diagnostics, or report material; record inspected paths in
  `discovery_sidecar.artifact_refs`; create a new artifact only if a useful
  review note, table, or diagnostic output is produced.
- **Bounded discovery run**: run discovery, local screening, graph diagnostics,
  stability checks, or feature/neighborhood construction only when actual data
  or routed artifacts exist and the scope is clear enough.
- **Blocked**: stop with sidecar and chamber feedback when the variable set,
  timing, graph target, data access, package/tool availability, or diagnostic
  requirements are too unclear for responsible discovery work.

If a missing data, domain, or causal review would materially change discovery
interpretation, write a reviewer request instead of running or overinterpreting
the discovery result.

## Method And Diagnostic Logic

Use discovery packages as hypothesis tools, not authorities. Choose method lanes
from the graph target, data structure, and assumptions:

- PC, stable-PC, GES, or score search for IID settings where causal sufficiency
  is plausible enough for CPDAG/DAG exploration.
- FCI, RFCI, GFCI, or PAG-style outputs when latent confounding is plausible.
- LiNGAM or DirectLiNGAM only when non-Gaussian linear assumptions are plausible.
- PCMCI, PCMCI+, LPCMCI, VAR-LiNGAM, or Granger-style screens for lagged or
  time-series structure after stationarity, sampling interval, and lag choices
  are explicit.
- Local discovery, screening, and stability selection for high-dimensional
  variable sets or feature/neighborhood outputs.
- Existing-artifact review when graph outputs, code, diagnostics, variable
  lists, or report material are routed.

Optimization or neural DAG learners may be screening or benchmark tools only.
They need explicit tuning, regularization, stability checks, and strong caveats.
Verify package availability and current APIs before running code.

Every substantive discovery result should state what was checked and what
remains unchecked:

- sensitivity to test, score, alpha, seed, tuning, regularization, lag choice,
  preprocessing, missingness handling, and variable set;
- bootstrap, subsample, perturbation, or multi-method edge/orientation stability
  when feasible;
- consistency with temporal tiers, required edges, forbidden edges, and
  domain-impossible directions;
- output type: DAG, CPDAG, PAG, lagged graph, edge ranking, local neighborhood,
  feature group, or stability table;
- latent-confounding, selection, non-IID, missingness, measurement-error,
  high-dimensional, and nonstationarity limits;
- post-discovery inference risk when graph discovery and effect estimation use
  the same data.

If diagnostics are missing, label the finding as `candidate_only` or
`diagnostics_needed` in `discovery_sidecar.findings`, `diagnostics`, or
`limitations`.

## Discovery Sidecar Updates

Submit supported `discovery_sidecar` fields when supported by the request:

- `status`: `not_started`, `scoped`, `artifact_created`, `reviewed`, or
  `blocked`.
- `goal`: discovery purpose or graph question.
- `scope`: compact graph target, focal variables, data/artifact inputs,
  assumptions, and limits.
- `method_summary`: method lane, package/tool, important settings, and whether
  work was scoped, reviewed, or run.
- `findings`: candidate structures, useful outputs, negative findings, or
  discovery implications.
- `diagnostics`: diagnostics completed or still needed.
- `limitations`: assumptions, instability, missing facts, package limits,
  post-discovery inference cautions, or overinterpretation risks.
- `artifact_refs`: paths to created or inspected discovery artifacts.
- `reviewer_requests`: compact requests for `data_audit`, `domain_expert`,
  `causal_check`, or `report_writer` to inspect discovery implications.

## Council Chamber Updates

Submit chamber feedback only under
`updates.council_chamber.causal_discovery`.

Set:

- `current_status`: one short handoff disposition.
- `summary`: compact synthesis of what was scoped, reviewed, created, or
  blocked.
- `questions_for_user`: 0-3 questions or choices that would improve the next
  decision.
- `feedback_to_route`: 0-3 route-facing suggestions, such as useful data,
  domain, causal, report, or analysis follow-up.

Keep chamber feedback short, decision-facing, grounded in `discovery_sidecar`
or current uncertainty, and free of schema labels. Focus on exploratory limits,
diagnostics, created or inspected discovery outputs, and which reviewer should
inspect implications before they affect adjustment, methods, claims, or report
wording.

## Discovery Artifacts

Create discovery artifacts only when the current request clearly authorizes
bounded discovery work with actual data or routed artifacts. Otherwise write
scoped findings, limitations, reviewer requests, and chamber feedback only.

Valid discovery artifacts include graph objects, edge tables, local-neighborhood
tables, stability tables, graph plots, diagnostic figures, source scripts,
notebooks, manifests, and technical notes.

When a graph object, table, figure, script, notebook, or technical note is
created, follow `references/artifact_output_policy.md`: reserve first, write and
validate temporary output, atomically publish it with its completion manifest,
then include the completed artifact and compact `discovery_sidecar` references
in `statectl apply`.

Do not reserve or submit an artifact for verbal discovery framing or for
inspecting existing files without creating new durable output.

## Boundaries

Discovery output is exploratory candidate evidence. It may suggest graph
hypotheses, feature groups, local neighborhoods, edge uncertainty, diagnostic
needs, and reviewer requests, but it cannot prove causal direction, validate
adjustment, select the final causal method, estimate effects, open a validity
gate, or strengthen report wording.

If discovery output could affect adjustment, timing logic, estimand, method
choice, claim feasibility, or report wording, write a reviewer request instead
of adopting the implication directly. Use cautious language such as "suggests a
graph hypothesis", "is compatible with", "raises a candidate edge", "appears
unstable", or "needs reviewer validation".
