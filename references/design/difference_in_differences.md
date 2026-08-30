# Design: difference_in_differences

Use this file to plan or review a difference-in-differences or event-study analysis: policy timing, treated and comparison units, pre/post data, panels, repeated cross-sections, staggered adoption, group-time ATT, TWFE benchmarks, synthetic DiD, DR-DiD, anticipation, spillovers, or DiD report support.

Work in this order: define unit-time structure, treatment timing, comparison group, pre-period evidence, estimand, timing hazards, composition/support, inference level, then claim boundary. Do not let fixed effects or a modern estimator substitute for a credible comparison.

Runtime contract: `references/design_execution_contract.md`, design id
`difference_in_differences`.

## Use When

Use when the project has, or may have:

- treatment, policy, rollout, adoption, or exposure timing that varies across units or groups
- pre-treatment and post-treatment outcome data for treated and comparison units
- panel data, repeated cross-sections, aggregate unit-time data, or cohort/time cells
- a question about pre-trends, event-study plots, staggered adoption, group-time ATT, TWFE cautions, DR-DiD, synthetic DiD, or policy-timing report support

Do not use when the main identification source is a threshold, instrument, donor-pool counterfactual with one treated unit, or network spillover unless DiD is only a supporting benchmark.

## Data Contract

Before analysis, build or specify unit-time or group-time data. Minimum facts:

- unit id, group id, calendar time, frequency, repeated-cross-section cell, and panel balance/composition
- treatment/adoption date, first-treated cohort, treatment path, absorbing/reversible status, intensity, phase-in, and persistence
- comparison group: never-treated, not-yet-treated, later-treated, selected controls, donor pool, or synthetic comparison
- pre-period length, outcome history, seasonality, shocks, and measurement stability
- outcome definition, denominator, transformation, aggregation, and coding over time
- estimand: two-group/two-period ATT, group-time ATT, event-time effect, cohort-specific effect, aggregate ATT, repeated-cross-section ATT, synthetic aggregate contrast, or descriptive trend comparison
- anticipation, lagged effects, delayed adoption, concurrent policies, policy bundles, spillovers, and window choices
- population composition, entry/exit, migration, missingness, outcome measurement, and cohort sizes
- inference level: unit, cluster, policy jurisdiction, market, site, serial correlation, and small-cluster constraints

Facts that usually must be inspected, not merely assumed: treatment timing, comparison group, pre-period outcomes, cohort sizes, raw trends, composition changes, contamination/spillovers, and cluster count.

## Design-Specific Twists

- `direct_fit`: treatment timing, comparison group, pre-period evidence, and inference level support a credible DiD/event-study estimand.
- `data_shape_twist`: reshape to unit-time or cohort-time, create treatment cohort/event time, build repeated-cross-section cells, encode exposure windows, or mark panel composition changes.
- `estimand_twist`: convert a generic pre/post request into two-period ATT, group-time ATT, event-time effects, aggregate ATT, repeated-cross-section ATT, synthetic DiD, or descriptive trend comparison.
- `diagnostic_twist`: prioritize raw trends, pre-period diagnostics, treatment timing maps, composition/missingness checks, comparison sensitivity, TWFE decomposition, clustering, or parallel-trend sensitivity.
- `implementation_twist`: use modern staggered-adoption estimators, DR-DiD, synthetic DiD, imputation, interaction-weighted event studies, or HonestDiD only when their comparison and estimand match the data.
- `fallback_twist`: if comparison credibility fails, use descriptive trend audit, interrupted-time-series warning, synthetic-control review, or future-design requirements.

## Diagnostics for Approved Execution

Perform the analytic diagnostics relevant to the DiD design and chosen estimator lane:

- Treatment-timing map: adoption table, cohort map, treatment heatmap, event-time construction, and exposure persistence.
- Unit-time audit: unique unit-time rows, panel balance, repeated-cross-section cell counts, cohort sizes, missing time periods.
- Raw trends: outcome trends by treated/comparison group, cohort, calendar time, and key strata.
- Pre-period evidence: event-time leads, placebo timing, low-power/pretest caveat, and visual trend comparability.
- Composition and measurement: entry/exit, migration, attrition, missingness, denominator shifts, coding changes, and outcome measurement stability by group/time.
- Timing hazards: anticipation, spillovers, contamination, concurrent shocks, seasonality, policy bundles, and lagged effects.
- Comparison sensitivity: never-treated versus not-yet-treated, donor pool, excluded cohorts, window choices, covariate set, and aggregation weights.
- TWFE diagnostics: label TWFE as benchmark when appropriate; use decomposition or negative-weight discussion if staggered adoption is present.
- Inference: cluster level, serial correlation, small-cluster sensitivity, randomization/placebo uncertainty, and aggregate policy variation.
- Support-route diagnostics: if a support file is active, run only the DiD diagnostics needed by that support task, such as event-count support, subgroup trend support, dose/intensity timing, or statistical-validity checks.

## Boundaries

Block or weaken causal wording when:

- no credible comparison group exists
- treatment timing, first-treated cohort, event time, or exposure onset is ambiguous
- pre-period history is too short, noisy, selected, or incomparable
- controls anticipate treatment, are contaminated, or receive spillovers
- concurrent shocks, policy bundles, seasonality, or measurement changes move with treatment timing
- changing composition, entry/exit, migration, missingness, or outcome coding defines the apparent effect
- covariates are post-treatment or affected by anticipation
- naive TWFE mixes incompatible comparisons, negative weights, or contaminated leads/lags in staggered adoption
- uncertainty ignores clustering, serial correlation, few clusters, or aggregate policy variation

Never rescue these failures by adding fixed effects, covariates, or a newer estimator. Name the fallback, repair, or weaker claim.

## Packages

- Modern staggered DiD: R `did`, `fixest::sunab`, `didimputation`, `did2s`, `did_multiplegt`, `DIDmultiplegtDYN`; Stata `csdid`, `eventstudyinteract`, `did_imputation`.
- Two-group/two-period or conditional DiD: R `DRDID`, `did`; Python `moderndid`, `diff-diff`, custom `statsmodels`/`linearmodels` benchmarks.
- Event-study and FE benchmarks: R `fixest`, `lfe`; Python `statsmodels`, `linearmodels`; keep TWFE labeled when not primary.
- Sensitivity to parallel-trend violations: R/Stata `HonestDiD`; custom sensitivity after event-study estimates.
- Synthetic DiD or weak comparison group: R `synthdid`, `augsynth`; return to
  `causal_check` for `synthetic_control_time_series` if donor-weighted
  identification becomes primary.
- DML/orthogonal DiD: R/Python `DoubleML`; use only when conditional parallel trends and nuisance roles are explicit.
- TWFE diagnostics: R `bacondecomp`, decomposition helpers, or manual comparison/weight diagnostics.

Key literature anchors: canonical DiD, parallel trends, Callaway-Sant'Anna group-time ATT, Sun-Abraham interaction-weighted event studies, Borusyak-Jaravel-Spiess imputation, Gardner did2s, de Chaisemartin-D'Haultfoeuille estimators, DR-DiD, synthetic DiD, and HonestDiD sensitivity.

## Rerouting Cues

- Return to `causal_check` for `interference_spillovers` when spillovers become
  the primary estimand; otherwise record control contamination as a DiD threat.

`causal_check` owns support-route selection. If a different support becomes
central to the bound work, flag it in chamber feedback rather than loading the
catalog or switching routes.


## Execution Record

In the artifact `summary`, emphasize treatment cohorts and
comparison units, the DiD/event-time estimand, pre-period and timing diagnostics,
inference level, and the parallel-trends claim boundary.
