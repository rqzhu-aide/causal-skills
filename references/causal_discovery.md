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
from the operation-opening message as the assignment. A non-null
`active_operation.discovery_scope` is the exact frozen work definition. On
resume, neither a new message nor technical convenience changes it.

Submit one `statectl apply` JSON payload with `actor: causal_discovery`,
`updates` containing `council_chamber.causal_discovery` and, when allowed
below, `discovery_sidecar`. Add an optional completed `artifact` or no-output
`discovery_scope` when applicable. Never submit both together. The controller
owns scope identity, the stored execution contract, timestamps, artifact
records, and transition to `lead_pending`; never edit those fields or the YAML
directly.

## Mechanical Discovery Contract

A discovery contract is a reproducible work definition, not an analysis scope,
causal-validity gate, or approval requirement. It contains exactly:

- `target`: a nonempty graph, neighborhood, ranking, or stability target;
- `input_refs`: a nonempty array of unique data or artifact inputs;
- `variables`: a nonempty array of unique variables;
- `method_plan`: a nonempty exact named method or method sequence;
- `constraints`: a unique string array, which may be empty;
- `diagnostic_requirements`: a unique string array, which may be empty;
- `output_type`: a nonempty promised discovery output;
- `claim_boundary`: the literal `candidate_only`.

All strings are trimmed and nonempty. Use `new` for an independent target,
input, or output exercise; use `revise` only when materially updating the
same exercise.

Use the existing controller boundaries:

- To scope or materially revise work without output, submit
  `discovery_scope: {transition: new | revise, contract: {...}}` through
  `apply` without reserving output.
- For a direct new or revised run, submit that same object through
  `reserve-artifact`; reservation freezes it before any output work.
- To run or review the current contract, begin with its exact discovery
  `scope_ref`; the controller copies and freezes the contract.
- Existing-material review with no new output may remain unbound. Review that
  creates output follows the `new` or `revise` rule. Do not replace an occupied
  sidecar unless the request or selected option clearly authorized replacement.
- If a resumed legacy reservation has no frozen discovery scope, preserve its
  files and sidecar and return a chamber-only `blocked` handoff.

A clear request to run discovery is sufficient authorization. No separate
approval, `ready` status, causal review, or analysis eligibility is required.
If a frozen target, input, variable, method plan, constraint, diagnostic,
output, or boundary cannot be followed, return `blocked` without an artifact;
never substitute a different run. A reserved run ends only as
`artifact_created` with its artifact or `blocked` without one. The controller
checks identity and exact contract equality, not scientific adequacy.

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
Questions about adjustment validity, causal-direction support, method fit, and
claim strength belong to `causal_check`. Target effect estimation belongs to an
approval-bound `analysis_execution` operation.

## Discovery Work Modes

Classify the route work before acting:

- **Scope only**: define and persist a complete contract; create no output.
- **Existing artifact review**: inspect routed output and remain unbound unless
  the operation creates a new artifact under an authorized new or revised
  contract. Record the path in the sidecar when that sidecar can be updated;
  otherwise identify the material in the chamber handoff.
- **Bounded discovery run**: execute only the frozen contract against actual
  data or routed artifacts, including its required diagnostics.
- **Blocked**: stop without output when the requested contract cannot be
  stated or followed, including unavailable packages or inputs.

If route work reveals a missing data, domain, or causal review that would
materially change interpretation, write a reviewer request instead of running
or overinterpreting the discovery result.

## Method And Diagnostic Logic

Use discovery packages as hypothesis tools, not authorities. Choose a method lane
only while forming a new or revised contract. Once frozen, follow the declared
method plan or block. Base a new lane on the graph target, data structure, and
assumptions:

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

- `status`: `scoped` for a persisted contract without output;
  `artifact_created` when this operation published output;
  `reviewed` for existing-material review without new output; or `blocked` when
  the requested lane could not complete.
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

Create discovery artifacts only when the current request authorizes output, actual
data or routed artifacts exist, and the controller has frozen a contract.
Otherwise return scoped, reviewed, or blocked state without new output.

Valid discovery artifacts include graph objects, edge tables, local-neighborhood
tables, stability tables, graph plots, diagnostic figures, source scripts,
notebooks, and technical notes.

When output is created, follow `references/artifact_output_policy.md`. The
controller binds its manifest to the frozen contract and adds the final location
to `discovery_sidecar.artifact_refs`; identify inspected historical paths
separately when relevant.

Do not reserve or submit an artifact for verbal discovery framing or for
inspecting existing files without creating new durable output.

## Boundaries

The Discovery Engineering Scope boundary above controls every discovery handoff
and artifact.

If discovery output could affect adjustment, timing logic, estimand, method
choice, claim feasibility, or report wording, write a reviewer request instead
of adopting the implication directly. Use cautious language such as "suggests a
graph hypothesis", "is compatible with", "raises a candidate edge", "appears
unstable", or "needs reviewer validation".
