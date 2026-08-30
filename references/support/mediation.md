# Support: mediation

Context only. Relevant when the causal target asks how an effect works, whether a mediator explains the effect, whether to adjust for an intermediate variable, or how to describe pathways. The selected design route owns execution, diagnostics, and the controller submission.

## Additional Information

- Useful when total-effect information is not enough and the user needs direct, indirect, interventional, separable, pathway-specific, or descriptive mechanism context.
- Highlights exposure-mediator-outcome timing as information the design should carry into its analysis notes.
- Helps name mediator-outcome confounding and post-treatment adjustment as central claim boundaries.
- Useful lanes include controlled direct effects, natural direct/indirect effects, interventional effects, separable effects, path-specific effects, multiple-mediator summaries, and descriptive pathway evidence.

## Non-Obvious Twists

- First decide whether the mediator is itself an intervention target. If not, causal mediation language may be too strong.
- Adjusting for the mediator changes the estimand; it is not the total effect with "better control."
- Mediator-outcome confounders may be affected by exposure, which can make standard natural effects fragile.
- Interventional or separable effects may be more honest than natural direct and indirect effects in complex settings.
- Mediated proportion can be unstable and scale-dependent, especially when total effects are small or signs differ.
- Product-of-coefficients summaries can hide cross-world or model assumptions; use them as descriptive unless the mediation estimand is explicit.
- Exposure-induced mediator-outcome confounding often points toward longitudinal or interventional-effect framing rather than a standard natural-effect workflow.
- Multiple mediators need ordering, joint intervention meaning, or explicit exploratory pathway wording.
- A mediator role table should separate mediators, baseline confounders, mediator-outcome confounders, colliders, selection variables, and outcome proxies.

## Design Interaction

- The base design must support the exposure-outcome effect before mediation adds value.
- Longitudinal designs may be needed when mediator, confounders, and outcome evolve over time.
- Survival or competing-risk outcomes change the mediation estimand and often need outcome-scale support.

## Package Cues

- R: `mediation`, `regmedint`, `medflex`, `CMAverse`, `intmed`.
- Python: `statsmodels` mediation, `DoWhy`, or custom g-computation/TMLE/DML templates.
- Use package choice only after mediator timing and mediator-outcome confounding are explicit.

## Useful Outputs

- exposure-mediator-outcome timing table
- mediator role map
- mediator/confounder/collider/selection/outcome-proxy role table
- estimand choice note
- sensitivity-to-mediator-confounding summary
- exposure-mediator interaction or multiple-mediator ordering note
- pathway wording that separates mechanism clues from validated pathways

## Boundary Language

Prefer "pathway evidence" or "consistent with mediation" when mediator intervention, timing, and mediator-outcome assumptions are weak. Avoid saying a mediator "explains" the effect without a defensible mediation estimand.
