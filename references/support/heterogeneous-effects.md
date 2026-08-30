# Support: heterogeneous-effects

Context only. Relevant when the causal target asks whether effects differ across baseline groups, strata, sites, cohorts, risk levels, time periods, or effect modifiers. The selected design route owns execution, diagnostics, and the controller submission.

## Additional Information

- Useful when the analysis needs context beyond one average effect: subgroup effects, GATE, CATE, site/time variation, or modifier-specific contrasts.
- Highlights modifier timing and subgroup support as information the design should carry into its analysis notes.
- Helps separate prespecified heterogeneity, exploratory discovery, equity/safety checks, and policy-relevant variation.
- Useful lanes include prespecified subgroup contrasts, GATE summaries, model-based CATE exploration, honest trees, causal forests, grouped DR/BLP summaries, and policy-relevant modifier evidence.

## Non-Obvious Twists

- A modifier should usually be baseline or otherwise justified as part of a history-defined target. Post-treatment modifiers often change the question.
- Site/time heterogeneity can reflect implementation, measurement, or calendar changes rather than biological or behavioral moderation.
- Raw individual CATE maps are often less reportable than grouped CATE, best-linear-projection summaries, calibrated strata, or prespecified subgroup contrasts.
- Shrinkage can stabilize sparse subgroup estimates, but it does not repair missing support.
- Many sparse groups may need pooling, partial pooling, or hierarchical/shrinkage summaries before subgroup claims are useful.
- Discovery and estimation should be separated when subgroups are learned from data; use held-out, honest, or cross-fitted summaries when possible.
- Imbalanced treatment groups may make X-learner, R-learner, or grouped DR summaries more informative than naive subgroup regressions, but only after design support is checked.
- If the user asks who should receive treatment, heterogeneous effects are evidence for policy making, not a policy by themselves.

## Design Interaction

- Randomized designs still need subgroup support, multiplicity discipline, and assignment integrity within relevant groups.
- Observational designs need exchangeability and positivity to remain credible within modifier regions.
- IV, RD, DiD, survival, longitudinal, synthetic-control, or interference designs produce design-specific heterogeneity; do not generalize local, complier, cutoff, group-time, or horizon-specific effects.

## Package Cues

- R: `grf`, `causalTree`, `DoubleML`, `bartCause`, `marginaleffects`, `emmeans`.
- Python: `EconML`, `CausalML`, `metalearners`, `DoubleML`.
- Prefer simple interactions or stratified contrasts when the modifier set is small and prespecified.

## Useful Outputs

- modifier timing table
- subgroup support and event-count table
- grouped-effect plot or forest plot
- CATE/GATE calibration, BLP, rank-validation, or uplift-curve note
- fold stability, honest-split, or grouped-CATE validation note
- confirmatory versus exploratory wording

## Boundary Language

Use "evidence of effect variation" or "exploratory heterogeneity pattern" unless subgroup definitions, support, validation, and multiplicity control justify stronger wording. Never describe CATE as an observed individual treatment effect.
