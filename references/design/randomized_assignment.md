# Design: randomized_assignment

Use this file to plan or review a proper randomized-assignment analysis: randomized trials, A/B tests, randomized encouragement, lotteries, holdouts, blocked/stratified/paired experiments, cluster randomization, factorial variants, or randomized rollouts.

Work in this order: verify assignment, define the assignment-based estimand, construct the analysis set, choose an estimator lane, specify required diagnostics, then set the claim boundary. Prefer intention-to-treat unless the assigned contrast is not the analysis being requested; in that case, report the design constraint and let `causal_check` revise the design/support recommendation.

Runtime contract: `references/design_execution_contract.md`, design id
`randomized_assignment`.

## Use When

Use when the project has, or may have:

- random assignment to treatment, control, variant, holdout, encouragement, or rollout timing
- assignment logs, allocation probabilities, blocks, strata, pairs, clusters, arms, or experiment metadata
- a question about ITT, CACE/LATE, compliance, attrition, SRM, baseline balance, randomization inference, CUPED/ANCOVA, or experiment report support
- a need to decide whether an alleged experiment is actually randomized

Do not use merely because two groups are called treatment and control. If groups self-selected or assignment is not auditable, consider an observational design instead.

## Data Contract

Before analysis, build or specify an analysis-ready dataset that preserves original assignment. Minimum facts:

- assignment mechanism: complete, Bernoulli, blocked, stratified, clustered, paired, factorial, lottery, encouragement, holdout, rollout, or unknown
- assignment unit and analysis unit, including clusters, pairs, blocks, repeated measures, or aggregation needs
- eligible/randomized population and time zero
- arms, variants, control definition, allocation probabilities, and assignment source/log
- exposure or treatment receipt, including uptake, crossover, contamination, or noncompliance
- outcome, primary outcome window, exploratory outcome windows, follow-up start/end, missingness, censoring, and attrition
- analysis-set construction, especially post-assignment exclusions, triggered filters, per-protocol restrictions, and outcome availability
- pre-assignment covariates available for balance, ANCOVA, Lin adjustment, or CUPED
- operational integrity: SRM, logging failures, peeking/sequential looks, multiple variants, guardrails, and novelty effects

Represent one row per assignment unit unless repeated follow-up, clusters, or time-to-event outcomes require explicit long, clustered, or survival structure. Keep original assignment, receipt/exposure, post-assignment exclusions, and outcome observation as separate fields.

Facts that usually must be inspected, not merely assumed: assignment log or source, time zero, arm counts/allocation, analysis exclusions, missing outcomes, compliance/exposure by arm, and cluster/block structure. If these cannot be verified, do not estimate a causal effect; recommend audit, repair, or planning-only work.

## Design-Specific Twists

- `direct_fit`: assignment is plausibly randomized, time zero is clear, the analysis set preserves the assigned contrast, and uncertainty can respect assignment/dependence.
- `data_shape_twist`: reshape to assignment unit, original assigned arm, eligible population, cluster/block/pair, time zero, prespecified outcome window, or experiment-flow table before analysis.
- `estimand_twist`: convert a broad treatment-effect request into an assignment-based contrast when appropriate; use CACE/LATE only for noncompliance or encouragement under IV assumptions; flag triggered-user, per-protocol, or receipt-based requests as needing a different target/assumption layer.
- `diagnostic_twist`: prioritize SRM, assignment flow, pre-assignment balance, attrition/missingness, compliance/crossover, cluster/block checks, multiplicity inventory, or randomization inference depending on the decision.
- `implementation_twist`: add ANCOVA, Lin adjustment, or CUPED for precision only with pre-assignment covariates; add cluster-aware/block-aware inference when design requires it; do not use flexible tools to repair broken assignment logic.
- `fallback_twist`: if randomization cannot be verified or post-assignment selection breaks the target, use descriptive arm summaries, design audit, feasibility review, or future-experiment requirements instead of causal effect wording.

## Diagnostics for Approved Execution

Perform the analytic diagnostics relevant to the randomized design and chosen estimator lane:

- Assignment integrity: sample-ratio mismatch, allocation-probability check, arm-count check, and logging/dropout audit for assigned units.
- Analysis-flow diagnostic: eligible -> assigned -> exposed/received -> analyzed -> outcome-observed counts by arm, with reasons for exclusion after assignment.
- Baseline balance: standardized differences or balance summaries using pre-assignment variables only; use as a failure/leakage screen, not as proof of randomization.
- Missingness and attrition: missing outcome, censoring, attrition, and measurement-failure rates by assigned arm; assess whether the target or weighting/censoring plan changes.
- Compliance and exposure: uptake, crossover, noncompliance, encouragement receipt, and contamination by assignment arm; if estimating CACE/LATE, include first-stage strength and IV-assumption checks.
- Cluster/block diagnostics: cluster sizes, block/strata counts, paired structure, ICC or dependence summaries, and whether uncertainty respects the assignment unit.
- Estimator uncertainty: compare the proposed standard errors or randomization/permutation inference to the actual assignment design; flag few-cluster, small-sample, or constrained-randomization limits.
- Multiplicity/sequential diagnostics: inventory outcomes, variants, subgroups, windows, guardrails, interim looks, and exploratory analyses; label or adjust claims accordingly.
- Precision-adjustment diagnostics: for ANCOVA, Lin adjustment, or CUPED, verify covariates are pre-assignment, predictive, non-leaky, and that adjusted and unadjusted ITT estimates are both visible.
- Support-route diagnostics: if a support file is also active, run only the randomized-design diagnostics needed by that support task, such as subgroup arm counts, event/censoring by arm, compliance by arm, or cluster support.

## Boundaries

Block or weaken causal wording when:

- randomization cannot be verified, assignment probabilities are unknown, or assignment happened after relevant outcomes/preconditions
- SRM, logging failure, rerandomization, peeking, broken allocation, or unexplained exclusions threaten assignment integrity
- post-assignment filtering, triggered analysis, per-protocol restriction, selected follow-up, missing outcomes, attrition, or censoring drives the contrast
- treatment receipt is analyzed as randomized when only assignment was randomized
- interference, spillovers, contamination, or cluster dependence is material and not represented
- uncertainty ignores assignment unit, clusters, blocks, pairs, repeated measures, sequential looks, or multiplicity
- subgroup, outcome-window, ML-selected, guardrail, or target-population findings are reported as confirmatory without prespecification or validation

Never rescue these failures by calling the contrast an A/B test. Name the fallback, required repair, or weaker claim.

## Packages

- Simple individual ITT: difference in means, OLS, or GLM with design-matched robust uncertainty; R `estimatr`, `lm`, `sandwich`, `lmtest`; Python `statsmodels`.
- Pre-assignment precision adjustment: ANCOVA, Lin adjustment, or CUPED; keep unadjusted and adjusted ITT visible; use R `estimatr`, `fixest`, or Python `statsmodels`.
- Blocked, stratified, paired, or unequal-probability assignment: include design terms or design-based inference; R `randomizr`, `estimatr`, `ri2`; custom Python randomization code when needed.
- Cluster assignment or cluster dependence: cluster-level summaries, cluster-robust inference, or randomization inference; R `clubSandwich`, `estimatr`, `fixest`; Python `statsmodels` cluster covariance. Few clusters require caution.
- Small or constrained experiments: randomization/permutation inference if the assignment mechanism is known; R `ri2`, `randomizationInference`; Python `scipy.stats.permutation_test` or custom resampling.
- Online A/B tests: SRM checks, exposure/triggering audit, guardrail inventory, CUPED/ANCOVA when eligible; use custom R/Python diagnostics plus regression tooling.
- Noncompliance or encouragement: report ITT first; use CACE/LATE only after IV assumptions are explicit; R `estimatr::iv_robust` or IV packages; Python IV tooling.

Key literature anchors: Neyman randomization, Fisher randomization tests, Rubin/Holland potential outcomes, CONSORT flow/reporting, ICH E9(R1) estimands, Lin covariate adjustment, CUPED for online experiments, trustworthy online controlled experiments, and LATE/CACE for encouragement/noncompliance.

## Rerouting Cues

- Return to `causal_check` for `interference_spillovers` when spillovers become
  the primary identification problem; it is another design, not a support.

`causal_check` owns support-route selection. If a different support becomes
central to the bound work, flag it in chamber feedback rather than loading the
catalog or switching routes.


## Execution Record

In the artifact `summary`, emphasize the assignment mechanism,
assignment-based estimand, integrity and inference diagnostics, compliance when
relevant, and the resulting claim boundary.
