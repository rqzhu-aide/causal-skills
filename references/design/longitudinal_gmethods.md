# Design: longitudinal_gmethods

Use this file to plan or review a longitudinal causal analysis: repeated treatment or exposure histories, time-varying confounding, sustained strategies, dynamic regimes, cumulative exposure, marginal structural models, treatment/censoring weights, sequential g-formula, longitudinal TMLE, LMTP, or sequential causal-validity checks.

This design route is the accountable owner for whether analysis execution remains consistent with the longitudinal study design. Support routes may add analytic tools, but they must stay inside this design scope.

Work in this order: construct the time grid, order histories, define the strategy, verify time-varying confounding and censoring, audit support over histories, choose an estimator lane, run required diagnostics, then set the claim boundary. Do not collapse a longitudinal problem into a baseline contrast unless the target truly permits it.

Runtime contract: follow `references/design_execution_contract.md` using design
id `longitudinal_gmethods`. Keep any named support route inside this
longitudinal-design scope.

## Use When

Use when the project has, or may have:

- repeated treatment, exposure, dose, adherence, switching, or policy decisions over time
- time-varying covariates affected by earlier treatment and predictive of later treatment or outcome
- censoring, dropout, artificial censoring, competing events, or outcome timing that depends on treatment history
- sustained, dynamic, stochastic, modified, cumulative, threshold, stop/start, or grace-period strategies
- a need for MSM/IPW, sequential g-formula, longitudinal TMLE, LMTP, sequential regression, or dynamic-regime support

Do not use merely because there are repeated outcome measurements if exposure is fixed at baseline and no time-varying treatment-confounder feedback matters. Do not use when the problem is primarily a policy rollout panel, cutoff, donor-pool time series, or network interference design.

## Data Contract

Before analysis, build or specify a long-format history dataset. Minimum facts:

- id, time index, visit/interval definition, baseline, follow-up end, lags, grace periods, and outcome assessment times
- treatment/exposure at each time, including dose, receipt, adherence, switching, or action availability
- time-varying covariates measured before later treatment decisions
- censoring, missingness, dropout, administrative end, artificial censoring, competing events, and eligibility at each time
- outcome timing and whether outcomes are point outcomes, repeated outcomes, event-time outcomes, or cumulative outcomes
- intervention strategy: static, sustained, dynamic, stochastic, modified treatment policy, cumulative, threshold, or stop/start
- support across treatment, censoring, and covariate histories for each candidate strategy
- consistency and treatment-version mapping from observed histories to the named strategy
- clustering, sites, repeated episodes, delayed entry, or multiple records per unit

Represent one row per person-time or unit-time interval unless an estimator requires a different validated structure. Preserve the ordering of treatment, covariates, censoring, and outcomes at every time point.

Facts that usually must be inspected, not merely assumed: time ordering, history availability, support over strategies, censoring representation, weight tails, and whether the strategy can be written without future or outcome-derived information.

## Design-Specific Twists

- `direct_fit`: the time grid, histories, strategy, support, censoring, and outcome timing are coherent enough for a g-method target.
- `data_shape_twist`: reshape to long format, construct lags/grace periods, encode eligibility/censoring, define regimes, preserve histories, or restrict unsupported histories.
- `estimand_twist`: convert a static effect request into sustained strategy, dynamic regime, cumulative exposure, stochastic shift, LMTP, or simpler baseline target when appropriate.
- `diagnostic_twist`: prioritize history timing, strategy adherence/support, positivity over histories, treatment/censoring weights, balance over time, and sensitivity to grid/lag/truncation choices.
- `implementation_twist`: use MSM/IPW, sequential g-formula, longitudinal TMLE, LMTP, sequential regression, or structural nested models only after the sequential data contract is clear.
- `fallback_twist`: if histories, time ordering, support, or censoring cannot sustain g-methods, use trajectory audit, descriptive history summaries, simpler point-treatment target, or future-data plan.

## Required Diagnostics

Perform the analytic diagnostics relevant to the longitudinal design and chosen estimator lane:

- Long-format input audit: id, time, treatment, covariates, eligibility, censoring, adherence, and outcome fields at each interval.
- Time-grid diagnostic: baseline, lags, grace periods, interval widths, follow-up end, and outcome timing.
- History-ordering map: treatment, covariates, censoring, adherence, competing events, and outcomes ordered without future leakage.
- Strategy table: candidate strategies, decision rules, action availability, adherence definitions, and support counts over time.
- Positivity over histories: treatment and censoring support by key histories, sites, strata, and time periods.
- Weight diagnostics: treatment/censoring weight distributions, truncation, effective sample size, influential histories, and balance over time when MSM/IPW is used.
- Censoring/missingness diagnostics: dropout, artificial censoring, competing events, administrative end, and outcome availability by history.
- Sensitivity: time grid, lag, grace period, strategy variant, truncation, censoring assumption, model class, learner set, and support restriction.
- Estimator benchmark: compare MSM/IPW, g-formula, sequential regression, LMTP, or longitudinal TMLE outputs to simpler descriptive/history summaries when execution is approved.
- Support-route diagnostics: if a support file is active, run only the longitudinal diagnostics needed by that support task, such as dose histories, event/censoring support, dynamic-policy histories, or statistical-validity checks.

## Boundaries

Block or weaken causal wording when:

- treatment, confounder, censoring, eligibility, adherence, or outcome histories are missing, misordered, or recorded too coarsely
- the strategy uses future information, outcome-derived variables, post-outcome variables, or an infeasible rule
- support collapses for always/never, sustained, dynamic, grace-period, or modified-policy strategies
- treatment/censoring weights are unstable, unbounded, or undiagnosed
- censoring, competing events, adherence, loss to follow-up, or missingness dominate and are not handled
- summaries collapse away treatment-confounder feedback needed for identification
- time grid, truncation, learner set, strategy, or subgroup was chosen after seeing preferred results without exploratory labeling

Never rescue these failures with a generic mixed model or recurrent-outcome regression. Name the fallback, required repair, or simpler target.

## Packages

Choose the estimator lane before choosing software. Package lanes are reference cues, not execution permission. Verify current docs before running code.

- MSM/IPW: R `ipw`, `WeightIt`, `cobalt`, `survey`, `geepack`, `fixest`; Python custom `statsmodels`/sklearn weighting workflows.
- Parametric g-formula: R `gfoRmula`; custom R/Python simulation and standardization workflows when model structure is transparent.
- Longitudinal TMLE/sequential DR: R `ltmle`, `tmle3`, `sl3`, `SuperLearner`; use only when node ordering and nuisance roles are explicit.
- LMTP/stochastic interventions: R `lmtp`, `tmle3shift`; useful when feasible shifts or modified treatment policies are more realistic than fixed interventions.
- Dynamic regimes and learned policies: R `DynTxRegime`, `DTRreg`, `polle`, `tmle3mopttx`; connect to `policy-making-and-transportability` when the target is policy learning.
- Survival/time-to-event histories: R `survival`, `riskRegression`, `ltmle`, `lmtp`; Python `lifelines`, `scikit-survival`, custom discrete-time models when needed.
- High-dimensional nuisance support: R/Python `DoubleML`, Python `EconML`, R `SuperLearner`, `sl3`, `glmnet`, `ranger`, `xgboost`, `lightgbm`; keep time ordering and folds intact.

Key literature anchors: Robins g-methods, marginal structural models, sequential exchangeability, positivity over histories, parametric g-formula, longitudinal TMLE, modified treatment policies, stochastic interventions, and dynamic treatment regimes.

## Connections With Supports

- Use `statistical-validity` only when unresolved weight, history-positivity,
  censoring, cross-fitting, or reproducibility concerns exceed the longitudinal
  diagnostics above.
- Use `dose-response` for cumulative dose, duration, intensity, shifting dose, exposure windows, or modified treatment policies.
- Use `policy-making-and-transportability` for dynamic regimes, learned policies, sequential decisions, value functions, or deployment.
- Use `non-continuous-outcomes` for survival, recurrent events, competing risks, censoring-sensitive outcomes, binary risk, or count outcomes.
- Use `heterogeneous-effects` when strategy effects may differ by baseline history, risk, site, cohort, or time.
- Use `mediation` only when mediator/confounder ordering is explicit and the pathway target can be written sequentially.

## Execution Record

Follow the shared completion-summary and artifact rules in
`references/design_execution_contract.md`. Emphasize the time grid, treatment
history and strategy, sequential estimand, positivity/censoring diagnostics,
and the sequential-assumption boundary.
