# Design: synthetic_control_time_series

Use this file to plan or review a synthetic-control or aggregate time-series causal analysis: one or few treated aggregate units, donor pools, intervention dates, synthetic control, augmented SCM, generalized SCM, synthetic DiD, interrupted time series, comparative ITS, Bayesian structural time series, CausalImpact, matrix completion, pre-period fit, placebo inference, or time-series causal diagnostics.

This design route is the accountable owner for whether analysis execution remains consistent with the aggregate counterfactual/time-series design. Support routes may add analytic tools, but they must stay inside this design scope.

Work in this order: define treated unit(s), intervention timing, donor/control pool, outcome scale, pre-period evidence, estimand, inference route, time-series diagnostics, then claim boundary. Do not let a forecast model hide donor contamination, poor pre-fit, or concurrent shocks.

Runtime contract: follow `references/design_execution_contract.md` using design
id `synthetic_control_time_series`. Keep any named support route inside this
synthetic/time-series design scope.

## Use When

Use when the project has, or may have:

- one or few treated aggregate units such as state, country, market, hospital, product, school, firm, cluster, or site
- donor units, control series, or pre-treatment time series that can form a counterfactual
- an intervention, policy, campaign, release, shock, or event with a known date or phase-in
- a question about synthetic control, synthetic DiD, interrupted time series, CausalImpact/BSTS, matrix completion, placebo tests, or aggregate policy report support

Do not use for ordinary individual-level observational contrasts. If many units adopt at different times, consider `difference_in_differences`; if donor contamination is central, consider `interference_spillovers`.

## Data Contract

Before analysis, build or specify an aggregate panel or time-series dataset. Minimum facts:

- treated unit(s), unit definitions, aggregation level, denominators, and whether treatment is unit-level or segment-level
- time index, frequency, pre-period, post-period, intervention date, ramp-up, lag, phase-in, and observation count
- donor/control pool eligibility, untreated status, contamination risk, comparability, and exclusion rules
- outcome scale, denominator, transformation, aggregation, coding, and measurement stability
- intervention meaning, implementation date, concurrent shocks, policy bundles, seasonality, and anticipation
- pre-period outcomes and predictors available before intervention only
- estimand: treated-unit effect over time, average post-period gap, cumulative effect, synthetic DiD ATT, ITS level/slope change, comparative ITS contrast, or forecast gap
- inference route: placebo/permutation, RMSPE ratios, conformal, bootstrap, posterior, randomization-style, or sensitivity
- missingness, unbalanced panels, donor exclusions, sparse series, autocorrelation, nonstationarity, and denominator shifts

Facts that usually must be inspected, not merely assumed: pre-period fit, donor validity, intervention timing, concurrent shocks, outcome measurement stability, post-treatment donor leakage, placebo evidence, and alternative-date sensitivity.

## Design-Specific Twists

- `direct_fit`: treated unit, intervention date, donor/control pool, pre-period fit, and inference route support an aggregate counterfactual.
- `data_shape_twist`: reshape to unit-time panel, create treated/post indicators, define donor pool, construct control series, align denominators, or mark pre/post windows.
- `estimand_twist`: convert a broad policy-effect request into treated-unit gap, cumulative gap, synthetic DiD ATT, ITS level/slope change, comparative ITS contrast, or descriptive forecast audit.
- `diagnostic_twist`: prioritize pre-fit, donor weights, predictor balance, placebo/permutation, leave-one-out, alternative dates, seasonality, autocorrelation, and concurrent-shock review.
- `implementation_twist`: use classic SCM, augmented SCM, generalized SCM, synthetic DiD, matrix completion, BSTS/CausalImpact, comparative ITS, or treated-only ITS only when the data structure fits.
- `fallback_twist`: if donor pool, pre-period, intervention timing, measurement stability, or shocks fail, use descriptive time-series audit, donor feasibility memo, or DiD/ITS caveat.

## Diagnostics for Approved Execution

Perform the analytic diagnostics relevant to the synthetic/time-series design and chosen estimator lane:

- Full-window trend plot: treated and donor/control series over pre/post periods with intervention date, lag, and ramp-up marked.
- Timing table: intervention date, implementation phases, lag assumptions, pre/post windows, denominator definitions, and concurrent events.
- Donor/control audit: eligible units/series, exclusions, contamination, structural comparability, and post-treatment leakage.
- Pre-period fit: visual fit, RMSPE/MSPE, predictor balance, residuals, seasonality, and pre-period length adequacy.
- Weights and balance: donor weights, time weights, predictor balance, and extrapolation/model-dependence notes.
- Effect-over-time: treated-versus-synthetic plot, gap plot, cumulative gap, or forecast counterfactual with uncertainty route.
- Placebo/inference: in-space placebo, in-time placebo, RMSPE ratios, conformal intervals, posterior checks, permutation distribution, or bootstrap route.
- Sensitivity: leave-one-donor-out, donor-pool changes, alternative intervention dates, lag/ramp-up windows, pre-period windows, outcome transformations, and denominator changes.
- Time-series diagnostics: autocorrelation, nonstationarity, seasonality, residuals, break dates, and forecast diagnostics for ITS/BSTS/CausalImpact.
- Support-route diagnostics: if a support file is active, run only the synthetic/time-series diagnostics needed by that support task, such as subgroup/site support, non-continuous outcome scale, transport constraints, or statistical-validity checks.

## Boundaries

Block or weaken causal wording when:

- intervention timing, ramp-up, lag, or exposure onset is vague
- donor pool or control series is contaminated, indirectly treated, selected post hoc, or structurally incomparable
- pre-period fit is poor or too short to assess the counterfactual
- outcome definitions, denominators, measurement systems, aggregation, or coding shift around the intervention
- concurrent shocks, policy bundles, seasonality, or reporting changes dominate the intervention date
- donor weights use post-treatment information or treatment-affected predictors
- placebo/permutation evidence is weak, unavailable, or overinterpreted with a tiny donor pool
- treated-only ITS ignores autocorrelation, seasonality, trends, or alternative break dates
- CausalImpact/BSTS controls are affected by intervention or selected after seeing post-period results
- matrix completion/generalized SCM lacks enough panel support or hides model assumptions
- the user wants individual-level or broadly transported claims from aggregate treated-unit evidence

Never rescue these failures by adding more donors, more predictors, or a richer forecast model. Name the fallback, repair, or weaker aggregate claim.

## Packages

Choose the estimator lane before choosing software. Package lanes are reference cues, not execution permission. Verify current docs before running code.

- Classic SCM: R `Synth`, `tidysynth`; Stata `synth_runner`; Python `pysyncon`.
- Augmented SCM: R `augsynth`; useful when donor structure is credible but pre-fit is imperfect.
- Generalized SCM/matrix completion: R `gsynth`, `fect`; useful for multiple treated units/time periods with latent-factor assumptions.
- Synthetic DiD: R `synthdid`; Stata `SDID`; return to `causal_check` for
  `difference_in_differences` when group-time identification is primary.
- BSTS/CausalImpact/comparative ITS: R `CausalImpact`, `bsts`; Python CausalImpact-style ports; Python `statsmodels` for segmented regression/SARIMAX/autocorrelation diagnostics.
- Time-series benchmarks: R `forecast`, `bsts`, `strucchange`; Python `statsmodels`; use as diagnostics or forecast support, not automatic causal identification.

Key literature anchors: synthetic control, augmented SCM, generalized SCM, synthetic DiD, interrupted time series, comparative ITS, Bayesian structural time series, placebo/permutation inference, conformal inference, and matrix completion for counterfactual panels.

## Support And Rerouting Connections

- Use `statistical-validity` only when unresolved pre-fit, placebo/sensitivity,
  uncertainty, reproducibility, or model-dependence concerns exceed the
  synthetic/time-series diagnostics above.
- Return to `causal_check` for `difference_in_differences` when group-time or
  multi-cohort identification becomes primary.
- Return to `causal_check` for `interference_spillovers` when spillovers become
  the primary estimand; otherwise retain donor contamination as a design threat.
- Use `non-continuous-outcomes` when the outcome is a rate, count, event, survival, competing-risk, categorical, or denominator-sensitive measure.
- Use `policy-making-and-transportability` when aggregate results are being generalized, deployed, or applied to another target population/site/time.
- Use `heterogeneous-effects` when several treated units or sites allow credible effect variation analysis.

## Execution Record

Follow the shared completion-summary and artifact rules in
`references/design_execution_contract.md`. Emphasize treated and donor units,
intervention timing and estimand, pre-fit/placebo and time-series diagnostics,
concurrent shocks, and the aggregate claim boundary.
