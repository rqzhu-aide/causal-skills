# Design: single_time_observational

Use this file to plan or review a point-treatment observational analysis: baseline or one-time exposure, treated-versus-untreated comparisons, target-trial emulation, active-comparator designs, measured-confounding adjustment, matching, weighting, standardization, ATE/ATT/overlap targets, or observational report support.

Work in this order: emulate the target trial, align time zero, define exposure and comparator, build the analysis set, audit covariate timing and support, choose an estimator lane, specify required diagnostics, then set the claim boundary. Do not let a flexible model compensate for bad timing, missing confounding, or positivity failure.

Use with [design_worker](../design_worker.md), design ID `single_time_observational`.
Feasibility uses the data requirements, assumptions, and planned diagnostics;
new target computation additionally follows the recorded-run instructions there.

## Use When

Use when the project has, or may have:

- baseline or one-time exposure/treatment chosen outside random assignment
- an observational cohort, registry, claims, EHR, survey, app, product, or administrative dataset
- a treated-versus-untreated, exposed-versus-unexposed, usual-care, active-comparator, or threshold contrast
- a need for target-trial emulation, adjustment-set review, propensity scores, matching, weighting, standardization, sensitivity analysis, or measured-confounding claim boundaries

Do not use when the exposure changes repeatedly over time in a way that creates treatment-confounder feedback; consider `longitudinal_gmethods`. Do not use when policy timing, cutoffs, instruments, donor pools, or interference are the source of identification.

## Data Contract

Before analysis, build or specify a target-trial-style dataset. Minimum facts:

- eligibility criteria at time zero, without post-exposure or outcome-informed exclusions
- time zero aligning eligibility, exposure assignment/start, baseline covariates, and follow-up start
- exposure strategy or meaningful exposure definition, including versions, dose category, initiation, threshold, or policy rule
- comparator strategy: untreated, lower exposure, usual care, active comparator, or alternative strategy
- target population and whether the estimand is ATE, ATT, ATC, overlap, matched-sample, restricted-support, or descriptive
- outcome definition, follow-up window, latency, censoring, competing events, and measurement timing
- pre-exposure confounders, risk factors, stratifiers, and variables that must not be adjusted for
- missingness, selection, complete-case rules, censoring, loss to follow-up, and analysis-set flow
- site/provider/time/source variables that may encode confounding, measurement, or support differences
- support/positivity evidence for each exposure option across key covariate regions

Represent one row per eligible unit at time zero unless the outcome support requires survival, repeated outcomes, clusters, or longitudinal histories. Keep exposure, comparator, baseline covariates, post-exposure variables, censoring, and outcomes as separate roles.

Facts that usually must be inspected, not merely assumed: time zero, exposure timing, baseline covariate timing, analysis exclusions, outcome window, missing outcomes, support/overlap, and whether key confounders exist.

## Design-Specific Twists

These are possible revisions, not permission to change the user's target.
A changed population, contrast, follow-up, or estimand stays an explicit
alternative until the user adopts it. Base data construction and restriction
on design evidence, not attractive target results.

- `direct_fit`: a target-trial emulation is coherent, time zero is clear, confounders are measured before exposure, and support exists for the requested target population.
- `data_shape_twist`: reshape to one row per eligible unit, create time-zero fields, separate post-exposure variables, build analysis-set flow, restrict to common support, or encode active-comparator versions.
- `estimand_twist`: consider reframing a generic ATE request into ATT, overlap, restricted-support, active-comparator, or descriptive target when support or treatment choice demands it.
- `diagnostic_twist`: prioritize timing/role maps, support/positivity, baseline balance, missingness/selection, negative controls, sensitivity analysis, or target-population shift.
- `implementation_twist`: use regression adjustment, standardization, g-computation, matching, weighting, trimming, AIPW, TMLE, DML, or sensitivity methods only after the design facts are coherent.
- `fallback_twist`: if time zero, confounding, exposure meaning, or support fails, use descriptive association, design audit, sensitivity memo, or future-data plan instead of causal effect wording.

## Design Diagnostics

Perform the analytic diagnostics relevant to the observational design and chosen estimator lane:

- Target-trial table: eligibility, time zero, exposure, comparator, outcome, follow-up, estimand, target population, analysis set.
- Variable role and timing map: exposure, baseline confounders, risk factors, mediators, colliders, post-exposure variables, censoring, outcomes, selection variables.
- Analysis-flow diagnostic: eligible -> exposed/comparator -> analysis set -> outcome observed, with exclusion and missingness reasons.
- Exposure/comparator support: counts and positivity by key covariates, sites, providers, time periods, clusters, and domain groups.
- Missingness/selection/censoring: profile by exposure and outcome status; assess whether complete-case or censoring choices change the target.
- Balance and overlap: before/after adjustment, matching, weighting, trimming, or restriction; include SMDs, distributions, weight tails, and effective sample size when relevant.
- Sensitivity and falsification: unmeasured-confounding sensitivity or credible negative controls. A proximal proposal changes identification; use [custom_identification](custom_identification.md), not ordinary measured-confounder adjustment.
- Estimator benchmark: compare primary estimator against simpler adjusted, weighted, or standardized estimates during planned execution.
- Support-route diagnostics: if a support file is active, run only the observational diagnostics needed by that support task, such as subgroup overlap, dose support, mediator timing, outcome scale, or statistical-validity checks.

## Boundaries

Block or weaken causal wording when:

- time zero is undefined or eligibility, exposure, covariates, and follow-up are misaligned
- exposure follows symptoms, prognosis, early outcome risk, or decisions driven by impending outcome
- key confounders are missing, post-exposure, outcome-derived, or badly measured
- positivity fails, matching discards the target, weights explode, or sparse cells force extrapolation
- selection, censoring, complete-case restriction, missing outcomes, or loss to follow-up differs by exposure and changes the target
- exposure/comparator versions are vague, mixed, or not interpretable as the claimed strategy
- post-treatment adjustment, per-protocol restriction, or selected subgroups are used without explicit estimand boundaries
- estimator choice, trimming, subgrouping, or reporting was chosen after seeing preferred outcomes without exploratory labeling

Never rescue these failures by adding more covariates, a richer propensity model, or machine learning. Name the fallback, repair, or weaker claim.

## Packages

- Transparent first pass: regression adjustment, standardization, or g-computation; R `fixest`, `marginaleffects`, `stdReg`, `survey`; Python `statsmodels`, `zepid`, custom sklearn/statsmodels workflows.
- Matching and weighting: R `MatchIt`, `WeightIt`, `cobalt`, `optmatch`, `designmatch`, `CBPS`, `ebal`; Python `causalml`, `DoWhy`, `zepid`, custom propensity/balance code.
- Doubly robust and targeted learning: R `AIPW`, `tmle`, `drtmle`, `tmle3`, `sl3`, `SuperLearner`; Python `zepid`, `EconML`, `DoubleML`, custom AIPW/TMLE templates.
- Sensitivity and falsification: R `sensemakr`, `EValue`, `tipr`, `rbounds`, `causalsens`; distinguish negative-control calibration from a separate proximal identifying argument.
- High-dimensional nuisance support: R/Python `DoubleML`; Python `EconML`; R `hdm`, `grf`; nuisance learners such as `glmnet`, `ranger`, `xgboost`, `lightgbm`, `SuperLearner`, `sl3`, or sklearn tools.

Key literature anchors: target-trial emulation, Rubin/Holland potential outcomes, exchangeability/positivity/consistency, Hernan and Robins causal inference framework, propensity-score design, overlap weights, doubly robust estimation, targeted learning, and sensitivity analysis for unmeasured confounding.

## Changes to Discuss with the Lead

A material change of identification frame or target returns to the lead;
do not execute another design in this turn. A relevant support guide stays
inside this same review and does not add a specialist.

## Execution Record

In the saved review and run summary, emphasize the target-trial slots,
time zero, estimand and target population, support and adjustment diagnostics,
and the measured-confounding claim boundary.
