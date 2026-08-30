# Support: statistical-validity

Context only. Relevant when the selected design needs additional information about statistical credibility: balance, support, weighting, sensitivity, falsification, uncertainty, nuisance models, AIPW, TMLE, one-step estimators, double/debiased machine learning, orthogonal scores, cross-fitting, or high-dimensional adjustment. The selected design route owns execution, diagnostics, and the controller submission.

## Additional Information

- Useful after the design, estimand, timing, target population, and comparison are mostly settled.
- Helps the design notes explain whether implementation is fully supported,
  qualified, descriptive only, or not runnable.
- Covers statistical validity inside the design: support/positivity, balance, robustness, sensitivity, nuisance roles, model stability, fold integrity, uncertainty, and benchmark comparisons.
- Clarifies that stronger estimation machinery can improve implementation
  discipline under measured assumptions; it does not replace the selected
  identification design.
- Useful lanes include measured-covariate balance, matching/weighting, negative-control falsification, empirical calibration, proximal identification, AIPW, TMLE, one-step estimators, longitudinal/sequential DR, DML, orthogonal forests, and post-double-selection.

## Non-Obvious Twists

- Statistical checks should answer a design question, not decorate the analysis.
- Matching, weighting, DR, TMLE, and DML do not repair hidden confounding, invalid covariates, bad timing, positivity failure, or the wrong estimand.
- Balance diagnostics should not rely on p-values or propensity-model AUC alone; use standardized differences, distributional checks, support, weight tails, effective sample size, and domain-critical interactions.
- Matching, trimming, calipers, and retained samples can silently change the estimand or target population.
- Matching/weighting may shift the target to ATT, ATC, ATO/overlap, matched-sample, survey-calibrated, or restricted common-support effects.
- Exact, coarsened, cardinality, or design matching can be better than flexible scores when domain comparability is the key credibility issue.
- Cross-fitting is only useful if folds respect people, clusters, households, sites, time blocks, and preprocessing boundaries.
- Nuisance models need role labels: outcome, treatment, censoring, missingness, sampling, longitudinal transition, density, instrument, or transport nuisance.
- Influence-curve tails, probability truncation, rare events, and fold instability can dominate inference even when point estimates look reasonable.
- Negative controls need a credible null or shared-bias story. A failed negative control is not automatically a calibrated correction.
- Negative-control work should distinguish falsification, empirical calibration, bias adjustment, and proximal identification.
- Proximal identification is not routine robustness. Use it only after
  `causal_check` accepts the treatment/outcome proxy roles, bridge assumptions,
  and completeness conditions; otherwise keep negative controls in a
  falsification or sensitivity role.
- DR/TMLE work should distinguish AIPW, TMLE, one-step, censoring/missingness/sampling-aware DR, and longitudinal/sequential DR.
- DML work should distinguish PLR, IRM, PLIV/IIVM, R-/DR-learners, orthogonal forests, sparse/post-double-selection, and nuisance-only plugins.
- Flexible learners should be benchmarked against simpler adjusted, weighted, AIPW/TMLE, post-lasso, or design-specific estimators.

## Design Interaction

- The selected design decides which statistical validity checks are required.
- Observational designs need measured exchangeability, feature timing, support, and sensitivity review before DR/DML matters.
- Randomized designs may use precision adjustment, DR/TMLE/DML, missingness/censoring support, or heterogeneity tools, but not to repair assignment problems.
- IV-DML still needs instrument assumptions, first-stage support, exclusion, and monotonicity/complier boundaries.
- Longitudinal, survival, transport, missingness, and censoring settings need node ordering and nuisance roles made explicit.
- If statistical checks reveal target/design mismatch, the result should return to causal_check rather than forcing execution.

## Package Cues

- Balance and weighting: R `WeightIt`, `cobalt`, `MatchIt`, `optmatch`, `ebal`, `survey`; Python `causalml`, `zepid`, `DoWhy`, custom sklearn/statsmodels weighting.
- Sensitivity and falsification: R `sensemakr`, `EValue`, `tipr`, `rbounds`, `causalsens`; negative-control and placebo workflows often need custom code.
- DR/TMLE: R `AIPW`, `tmle`, `drtmle`, `tmle3`, `sl3`, `SuperLearner`, `ltmle`, `lmtp`; Python `zepid`, `EconML`, `DoubleML`, `DoWhy`, custom AIPW/TMLE templates.
- DML/orthogonal ML: R/Python `DoubleML`; Python `EconML`; R `grf`, `hdm`; nuisance learners such as `glmnet`, `ranger`, `xgboost`, `lightgbm`, `SuperLearner`, `sl3`, or sklearn tools.
- Negative controls/proximal: R `EmpiricalCalibration`, `EvidenceSynthesis`, and custom proximal bridge workflows; Python support is often custom or DoWhy-assisted.

## Useful Outputs

- balance/overlap table and plot
- weight distribution, truncation, and effective sample size
- retained/discarded-unit flow, matched-set, survey/combined-weight, variance-ratio, or eCDF balance note
- sensitivity, tipping-point, negative-control, or falsification table
- negative-control lane note: falsification, empirical calibration, bias adjustment, or proximal identification
- nuisance-role and timing table
- fold/group/time split plan with seed and tuning boundary
- nuisance calibration or residualization summary
- influence-curve or orthogonal-score stability summary
- PLR/IRM/PLIV/IIVM, AIPW/TMLE/one-step, or post-double-selection target note
- benchmark comparison against simpler estimators
- statistical validity decision: supports execution, limits claim, or blocks analysis

## Diagnostics for Approved Execution

Select the diagnostics that answer the active design question; do not run every item by default.

- Support/positivity: overlap by treatment, exposure, instrument, censoring, sampling, dose, subgroup, or target population; mark empty strata, probability tails, common-support restrictions, and effective sample size.
- Balance/distribution: standardized differences, variance ratios, eCDF differences, nonlinear terms, interactions, missingness indicators, and domain-critical variables before/after matching, weighting, trimming, or restriction.
- Matching/weighting: retained and discarded units, matched-set sizes, replacement, subclass sizes, calipers, coarsening, truncation, stabilized weights, survey weights, cluster weights, and target-population shift.
- Nuisance/fold integrity: feature timing, leakage, preprocessing boundaries, imputation boundaries, group/time/site folds, tuning separation, seed records, and repeated-split stability.
- Nuisance quality: calibration, residual checks, probability range, bounded outcome range, censoring/missingness/sampling model behavior, and learner convergence or error summaries.
- Robustness/sensitivity: simple-estimator benchmarks, covariate-set sensitivity, learner-library sensitivity, fold sensitivity, truncation sensitivity, placebo or negative-control checks, tipping-point or E-value summaries when appropriate.
- Inference stability: influence-curve or orthogonal-score tails, outlier influence, standard-error decomposition, cluster/robust/bootstrap variance route, repeated cross-fitting variation, and multiplicity handling.
- Reproducibility: estimand label, diagnostic choices, package versions, seeds, folds, preprocessing recipe, code path, artifact folder, and reason any expected diagnostic was skipped.

## Boundary Language

Use "statistical validity checks support the planned design" or "DR/DML estimate under the selected design assumptions." Avoid "diagnostics prove causality," "ML adjusted away confounding," "black-box causal proof," or "valid inference" unless the score, splitting, uncertainty route, and design assumptions justify it.
