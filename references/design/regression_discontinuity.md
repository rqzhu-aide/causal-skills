# Design: regression_discontinuity

Use this file to plan or review a regression discontinuity analysis: sharp or fuzzy RD, regression kink, geographic/border RD, score/rank/date cutoffs, eligibility thresholds, running variables, bandwidth choice, robust bias correction, local randomization, manipulation checks, donut RD, placebo cutoffs, multiple cutoffs, or RD report support.

Work in this order: verify the cutoff rule, define the running variable, check the treatment jump, establish local support, choose the RD lane, specify manipulation/continuity diagnostics, choose estimator settings, then set the local claim boundary. Do not treat an analyst-created split as RD.

Use with [design_worker](../design_worker.md), design ID `regression_discontinuity`.
Feasibility uses the data requirements, assumptions, and planned diagnostics;
new target computation additionally follows the recorded-run instructions there.

## Use When

Use when the project has, or may have:

- a known cutoff, threshold, rank, score, age, date, income, test value, geography/border, or assignment index
- treatment, eligibility, encouragement, receipt probability, intensity, enforcement, or policy status changing at the cutoff
- a question about sharp RD, fuzzy RD, regression kink, local randomization, donut RD, manipulation, bandwidth, robust bias correction, or local threshold effects

Do not use when the threshold is only a post-hoc category or convenience split. If the cutoff is a policy adoption date with broad time trends, consider `synthetic_control_time_series` or `difference_in_differences`.

## Data Contract

Before analysis, build or specify a local cutoff dataset. Minimum facts:

- running variable: score, rank, date, age, income, test value, boundary distance, or assignment index
- cutoff value, units, direction, source, timing, institutional meaning, and whether the rule was known before outcomes
- treatment/eligibility/receipt/intensity jump at the cutoff, including sharp, fuzzy, kink, or encouragement status
- outcome, follow-up timing, and whether outcome measurement is comparable on both sides
- local sample on both sides of the cutoff, with density and outcome support near candidate bandwidths
- manipulation risk: sorting, gaming, retesting, retaking, bunching, heaping, rounding, discretion, or strategic timing
- predetermined covariates available for continuity checks
- missingness, duplicate scores, ties, mass points, discrete running variable, boundary construction, and local composition
- inference needs: bandwidth, polynomial order, kernel, robust bias correction, clustering, discrete score, multiple testing, and small-sample constraints

Facts that usually must be inspected, not merely assumed: cutoff rule, running-variable timing, treatment jump, density near cutoff, local sample counts, covariate continuity, bandwidth sensitivity, and whether the desired claim is local or global.

## Design-Specific Twists

These are possible revisions, not permission to change the user's target.
A changed population, contrast, follow-up, or estimand stays an explicit
alternative until the user adopts it. Base data construction and restriction
on design evidence, not attractive target results.

- `direct_fit`: the cutoff is real, the running variable is pre-treatment, treatment changes at the cutoff, local support exists, and manipulation risk is acceptable.
- `data_shape_twist`: orient the running variable, center at cutoff, restrict local windows, encode treatment jump, build local sample counts, or construct distance-to-boundary.
- `estimand_twist`: consider reframing a broad effect request into local threshold effect, local Wald/fuzzy RD effect, kink effect, border effect, multiple-cutoff effect, or local-randomization estimand.
- `diagnostic_twist`: prioritize density/manipulation, treatment jump, covariate continuity, RD plot, bandwidth sensitivity, donut checks, placebo cutoffs, or boundary/spillover checks.
- `implementation_twist`: use robust bias-corrected local polynomial, fuzzy local IV, local randomization, kink, geographic RD, or multiple-cutoff methods only when design facts fit.
- `fallback_twist`: if the cutoff is artificial, manipulation is severe, support fails, or a date cutoff is trend-driven, use descriptive discontinuity audit, ITS/DiD review, or future-design requirements.

## Design Diagnostics

Perform the analytic diagnostics relevant to the RD design and chosen estimator lane:

- Cutoff-rule audit: threshold source, direction, units, timing, eligibility meaning, and treatment assignment logic.
- Running-variable diagnostic: histogram/density near cutoff, mass points, heaping, rounding, missingness, duplicate values, and manipulation test.
- Treatment-jump diagnostic: treatment, eligibility, receipt, intensity, or slope change by running-variable bins.
- Local support: sample counts, outcome availability, and covariate support by candidate bandwidth/window.
- RD plot: binned outcome means, cutoff marked, local fits, local sample context, and support shading where useful.
- Predetermined covariate continuity: table or plots for pre-cutoff variables only.
- Estimator sensitivity: bandwidth, kernel, polynomial order, robust bias correction, clustering, and small-sample sensitivity.
- Donut/placebo diagnostics: donut RD, placebo cutoffs, placebo outcomes, unaffected subgroups, or alternative windows.
- Local randomization: window selection, covariate balance, and randomization-style inference when used.
- Geographic/date-cutoff checks: boundary map, distance construction, sorting/spillovers, seasonality, shocks, or time-series trend diagnostics.
- Support-route diagnostics: if a support file is active, run only the RD diagnostics needed by that support task, such as local subgroup support, local outcome scale, fuzzy-IV assumptions, or statistical-validity checks.

## Boundaries

Block or weaken causal wording when:

- the threshold is analyst-created rather than assignment/exposure rule based
- treatment, eligibility, receipt probability, or intensity does not change at the cutoff
- the running variable is post-treatment, affected by treatment, or partly defined by the outcome
- local support on either side is absent, sparse, or driven by exclusions
- units can precisely manipulate, sort, retest, time, or game the running variable
- heaping, rounding, bunching, duplicate scores, or discretion makes threshold status ambiguous
- the cutoff coincides with another policy, reporting, seasonal, geographic, or measurement change
- geographic or border RD ignores sorting, spillovers, distance construction, or boundary comparability
- date cutoffs are driven by time trends, shocks, or seasonality
- high-order global polynomials, arbitrary bandwidths, or post-hoc donut/cutoff choices chase results
- the user wants a global ATE but only local threshold evidence exists

Never rescue these failures with covariates, flexible models, or polished plots. Name the fallback, repair, or weaker local claim.

## Packages

- Standard RD: R/Stata/Python `rdrobust`, `rdbwselect`, `rdplot` for sharp, fuzzy, kink, bandwidth selection, and robust bias-corrected inference.
- Manipulation/density: R/Stata `rddensity`; use as one diagnostic, not proof of validity.
- Local randomization: R/Stata `rdlocrand` for window selection and randomization inference.
- Multiple cutoffs/scores: R/Stata `rdmulti`.
- Power/planning: R/Stata `rdpower`.
- Custom/benchmark regression: R `fixest`, `ivreg`; Python `statsmodels`, `CausalPy`; keep production inference aligned with RD assumptions.
- Geographic/border RD: R `sf`, `spdep`; Python `geopandas`, `shapely`, `libpysal`; identification still depends on boundary comparability and spillovers.

Key literature anchors: continuity-based RD, local polynomial RD, robust bias correction, McCrary/density testing, local randomization, fuzzy RD as local IV, regression kink, geographic RD, and local external validity.

## Changes to Discuss with the Lead

- Keep fuzzy local-IV assumptions inside this RD review. Flag to the lead a
  possible switch to `instrumental_variables` only when the instrument rather than the cutoff
  becomes the primary identification frame.
- Flag to the lead a possible switch to `interference_spillovers` when spillovers become
  the primary estimand; otherwise retain them as RD contamination diagnostics.

A material change of identification frame or target returns to the lead;
do not execute another design in this turn. A relevant support guide stays
inside this same review and does not add a specialist.

## Execution Record

In the saved review and run summary, emphasize the cutoff and running
variable, treatment jump, local estimand, manipulation/support and bandwidth
diagnostics, and the local claim boundary.
