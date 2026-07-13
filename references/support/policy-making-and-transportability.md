# Support: policy-making-and-transportability

Context only. Relevant when the target concerns action choice, prioritization, treatment rules, policy value, deployment, external validity, or applying results to a different population, site, time, or setting. The selected design route owns execution, diagnostics, and the controller submission.

## Additional Information

- Useful when effect estimates need decision, deployment, or source-target context.
- Policy-making context adds information about what action could be taken, for whom, and under what constraints.
- Transportability context adds information about what can be said for a target population, site, time, or setting.
- Both require the final claim to name decision context, target population, implementation setting, and limits of use.
- Useful lanes include existing-rule evaluation, shallow/interpretable treatment rules, policy trees, uplift/ranking, budgeted allocation, trial-to-target generalization, source-to-target transport, dynamic regimes, and applicability memos.

## Non-Obvious Twists

- A CATE estimate is not a policy. A policy needs an action set, decision-time information set, cost/harm model, and feasibility constraints.
- Rule features must be observable at decision time and available in the intended deployment setting.
- Budgeted allocation can favor stable moderate effects over unstable high predicted effects.
- A learned rule should be compared against treat-all, treat-none, and current/default practice before it is framed as useful.
- A rule should be labeled exploratory, cross-fitted, externally validated, or deployment-ready; those are different evidence states.
- Dynamic policies require decision-time rows, histories available before each action, feasible actions at each stage, candidate regimes, and sequential support.
- SMART, Q-learning, A-learning, WOLS, `DynTxRegime`, `DTRreg`, `polle`, and off-policy evaluation are dynamic-regime tools only when the decision schedule and validation basis are explicit.
- Transport starts after internal validity. External validity cannot rescue a biased source estimate.
- Source-target differences matter through effect modifiers, treatment versions, outcome versions, care context, and implementation context, not demographics alone.
- Transport checks should name treatment, comparator, outcome, follow-up, delivery, adherence, measurement, and context compatibility across source and target.
- "Real world" is not a target population; the target must be named.
- Published aggregate source effects may be impossible to transport numerically without effect-modifier-stratified results or target data.
- Calendar time can be a transport modifier when practice, diagnostics, risk, or competing treatments change.
- No target data usually means an applicability memo or source-bound report, not a transported estimate.

## Design Interaction

- Randomized and observational designs can support policy learning only inside their identification limits.
- Longitudinal designs are needed for repeated decisions or dynamic regimes.
- Transported effects may be local, complier-specific, cutoff-specific, horizon-specific, or source-bound depending on the selected design.

## Package Cues

- Policy: R `policytree`, `grf`, `evalITR`, `personalized`, `DynTxRegime`, `DTRreg`, `polle`, `tmle3mopttx`; Python `econml.policy`, `CausalML`, `scikit-uplift`, custom off-policy evaluation.
- Transport: R `generalize`, `TransportHealth`, `WeightIt`, `cobalt`, `survey`, `SuperLearner`, `marginaleffects`, `causaleffect`; Python `DoWhy`, custom sklearn/statsmodels weighting or standardization, hierarchical/meta-analysis tools.

## Useful Outputs

- action-set and decision-time feature audit
- policy value or regret summary
- uplift, Qini/AUUC, PAPE/AUPEC, budget, or value-curve summary when the design supports it
- policy threshold or budget sensitivity
- dynamic-regime timeline, history-set, adherence, and sequential-positivity note
- source-target contrast table
- source-target version compatibility table
- effect-modifier overlap and transportability note

## Other Considerations

- Flag `statistical-validity` follow-up only when unresolved rule stability,
  source-target support, value estimation, or nuisance-model concerns exceed the
  selected design's normal diagnostics.
- Consider `heterogeneous-effects` when policy or transport depends on effect modifiers, subgroup benefit, equity/safety strata, or site/time variation.
- Consider `non-continuous-outcomes` when the decision depends on risk, rate, survival, RMST, competing events, utility, or categorical outcomes.
- Consider `dose-response` if the decision is about dose choice, exposure intensity, dose cap, threshold, or feasible shift.
- Consider `mediation` if the policy is justified by a mechanism, pathway, or intervention component rather than the total effect alone.

## Boundary Language

Use "decision support" rather than "deployment rule" unless the policy has validated decision-time features, support, uncertainty, and harm constraints. Use "transported under measured effect-modifier assumptions" rather than broad generalizability when target support is limited.
