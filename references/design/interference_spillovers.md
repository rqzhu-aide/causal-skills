# Design: interference_spillovers

Use this file to plan or review an interference or spillover analysis: SUTVA/no-interference violations, peer effects, contagion, contamination, networks, geographic or spatial spillovers, cluster exposure, market effects, treatment saturation, partial interference, exposure mapping, graph cluster randomization, two-stage randomized designs, direct/indirect/total/overall effects, or interference-aware report support.

This design route is the accountable owner for whether analysis execution remains consistent with the interference design. Support routes may add analytic tools, but they must stay inside this design scope.

Work in this order: define units, mechanism, interference restriction, exposure mapping, timing, support, design source, dependence-aware inference, and claim boundary. Do not treat ordinary cluster-robust standard errors as a repair for interference.

Runtime contract: follow `references/design_execution_contract.md` using design
id `interference_spillovers`. Keep any named support route inside this
interference/spillover design scope.

## Use When

Use when the project has, or may have:

- spillovers, peer effects, contagion, contamination, displacement, market equilibrium, shared-resource effects, or direct/indirect exposure
- networks, households, schools, clinics, providers, markets, neighborhoods, geography, contact data, clusters, or treatment saturation
- treatment of one unit plausibly affecting another unit's exposure, outcome, measurement, or participation
- a question about direct, indirect, total, overall, spillover, saturation, exposure-mapping, cluster, network, or spatial effects
- a need to diagnose whether another design route is contaminated by no-interference violations

Do not use merely because observations are clustered; clustering alone is an inference issue. Use this route when treatment or exposure can cross units or when no-interference is substantively doubtful.

## Data Contract

Before analysis, build or specify an exposure-map dataset. Minimum facts:

- treatment unit, outcome unit, cluster/group/network/geographic unit, and whether these units match or cross
- mechanism: direct interaction, contagion, allocational interference, shared resource, geographic exposure, market displacement, contamination, or peer influence
- interference restriction: partial interference, neighborhood interference, graph exposure, spatial radius, market boundary, cluster boundary, saturation, or unknown/limited interference
- own treatment and other-unit exposure mapping using pre-outcome ties, clusters, geography, saturation, distance, lagged exposure, or treated-neighbor share
- timing of own treatment, neighbor treatment, spillover exposure, tie measurement, mediators, and outcomes
- support across own-treatment by spillover-exposure cells, saturation levels, graph distances, or spatial exposure levels
- design source: randomized assignment, two-stage saturation design, cluster design, observational exposure model, DiD/RD/IV/synthetic route, or descriptive basis
- dependence: clustering, network components, spatial correlation, market-level dependence, repeated exposure, or unit-time dependence
- missing ties, boundary units, isolated units, cross-cluster exposure, and measurement quality of the exposure map

Facts that usually must be inspected, not merely assumed: exposure map, timing, support across own/spillover exposure cells, contamination of nominal controls, dependence structure, and whether the design source supports the estimand.

## Design-Specific Twists

- `direct_fit`: units, mechanism, exposure mapping, timing, support, and dependence-aware inference support a direct/spillover estimand.
- `data_shape_twist`: construct network, cluster, market, or geographic exposure map; compute treated-neighbor share; build saturation groups; define lags/radii; or mark contamination of controls.
- `estimand_twist`: convert isolated-unit ATE into direct, indirect, spillover, total, overall, saturation, exposure-response, contamination-audit, or descriptive map target.
- `diagnostic_twist`: prioritize exposure-map support, own-by-spillover exposure cells, timing of ties, homophily/confounding, contamination, sensitivity to radius/tie weights, and dependence-aware inference.
- `implementation_twist`: use two-stage randomized estimators, partial-interference IPW, exposure-mapping estimators, network/spatial robust inference, generalized propensity, AIPW/TMLE-style logic, or randomization inference only when the design supports them.
- `fallback_twist`: if exposure mapping, support, timing, or dependence fails, use contamination audit, descriptive spillover map, or recommendation to repair another design's no-interference assumption.

## Required Diagnostics

Perform the analytic diagnostics relevant to the interference design and chosen estimator lane:

- Unit map: treatment unit, outcome unit, cluster/network/geography/market unit, and boundaries.
- Mechanism statement: why spillover, contagion, displacement, contamination, shared resources, or peer influence is plausible.
- Exposure-map diagnostic: own treatment plus other-unit exposure, treated-neighbor share, saturation, distance/radius, lag, tie weight, or market exposure.
- Support table: own-treatment by spillover-exposure cells, saturation levels, clusters, graph components, isolated units, boundary units, and outcome support.
- Timing audit: own treatment, other-unit treatment, tie/network/geography measurement, exposure map, mediators, and outcomes.
- Missingness and measurement: missing ties, incomplete contacts, boundary crossings, location uncertainty, cluster membership changes, and cross-cluster exposure.
- Contamination diagnostic: nominal controls affected by treatment in trials, DiD, RD, IV, or synthetic-control comparisons.
- Confounding/homophily review: shared environment, selection into ties, simultaneous outcomes, common shocks, and baseline covariate imbalance by exposure-map level.
- Sensitivity: exposure definition, tie weights, radius, lags, cluster boundaries, saturation thresholds, graph distance, and alternative maps.
- Dependence-aware inference: cluster/network/spatial/HAC/resampling/randomization route matched to the exposure structure.
- Support-route diagnostics: if a support file is active, run only the interference diagnostics needed by that support task, such as spillover heterogeneity, policy saturation, dose-response exposure mapping, or statistical-validity checks.

## Boundaries

Block or weaken causal wording when:

- cross-unit exposure cannot be measured or the map is invented after seeing outcomes
- ties, clusters, geography, markets, or contacts are missing, endogenous, post-treatment, or incomplete
- own treatment and spillover exposure are collinear or unsupported
- outcomes, contagion, or network changes define exposure timing
- treatment changes network, cluster membership, location, market, or observation process without a design that handles it
- spillovers contaminate controls in DiD, RD, synthetic control, IV, or trials without exposure-aware repair
- observational peer effects ignore homophily, shared environments, selection into ties, common shocks, or simultaneous outcomes
- uncertainty treats networked, spatial, clustered, market, or repeated observations as independent
- the user wants an isolated-unit ATE in a setting where isolated exposure is incoherent

Never rescue these failures by "controlling for peers" or by ordinary cluster-robust standard errors alone. Name the fallback, repair, or weaker contamination finding.

## Packages

Choose the estimator lane before choosing software. Package lanes are reference cues, not execution permission. Verify current docs before running code.

- Partial interference and clustered spillovers: R `inferference`, `interferenceCI`, `clusteredinterference`.
- Network or spatial exposure construction: R `igraph`, `tidygraph`, `sf`; Python `networkx`, `geopandas`, `shapely`.
- Spatial/spatiotemporal causal support: R/GitHub `SpatialEffect`, R `geocausal`; use only when assumptions match the data.
- IV/noncompliance plus spillovers: R `latenetwork`; return to `causal_check`
  for `instrumental_variables` when the instrument is primary.
- Dependence-aware inference: Python `networkinference`, network HAC/spatial HAC/custom resampling; R custom randomization/permutation or spatial robust workflows.
- Flexible nuisance after exposure map is fixed: R `grf`, `SuperLearner`, `xgboost`; Python `DoubleML`, `EconML`, sklearn/xgboost; do not let ML define the estimand.
- Regression analogs and diagnostics: R `fixest`, `lme4`, `mgcv`; Python `statsmodels`; useful only after exposure map and confounding story are explicit.

Key literature anchors: SUTVA/no-interference violations, partial interference, two-stage randomized designs, exposure mapping, direct/indirect/total/overall effects, network interference, spatial spillovers, spillover-robust experimental design, and peer-effect homophily cautions.

## Support And Rerouting Connections

- Use `statistical-validity` only when unresolved exposure-map support,
  dependence-aware inference, map sensitivity, or reproducibility concerns
  exceed the interference diagnostics above.
- Use `policy-making-and-transportability` when treatment saturation, allocation, spillover policy value, market decisions, or deployment constraints matter.
- Use `dose-response` when spillover exposure is a treated-neighbor share, radius-weighted dose, saturation level, intensity, or exposure-response curve.
- Use `heterogeneous-effects` when spillovers vary by subgroup, network position, geography, site, cohort, or baseline risk.
- Return to `causal_check` for `instrumental_variables` when an instrument and
  noncompliance become the primary identification frame.
- Return to `causal_check` for `difference_in_differences`,
  `regression_discontinuity`, or `synthetic_control_time_series` when
  interference is only a threat to that primary comparison design.
- Use `non-continuous-outcomes` for contagion, infection, event, count, survival, recurrent-event, or competing-risk spillover outcomes.

## Execution Record

Follow the shared summary and exact-manifest rules in
`references/design_execution_contract.md`. Emphasize units and exposure mapping,
the direct/spillover estimand, support and dependence diagnostics,
confounding/homophily limits, and the interference claim boundary.
