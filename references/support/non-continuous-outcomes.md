# Support: non-continuous-outcomes

Context only. Relevant when the outcome is binary, ordinal, categorical, count, zero-inflated, time-to-event, recurrent event, competing risk, bounded, or otherwise not well represented by a simple continuous mean. The selected design worker owns this review and its diagnostics.

## Additional Information

- Useful when a generic mean difference is not enough and the outcome scale needs explicit context: risk, odds, rate, count, category shift, cumulative incidence, RMST, fixed-horizon survival, or utility.
- Highlights event definition, follow-up, censoring, competing events, event counts, and scale choice as information the design should carry into its analysis notes.
- Helps align estimator choice and report wording with the outcome scale.
- Survival-specific support may require time zero, delayed entry, left truncation, interval censoring, start/stop rows, recurrent episodes, and horizon choice.

## Non-Obvious Twists

- Risk difference, risk ratio, odds ratio, hazard ratio, RMST difference, and cumulative incidence answer different questions.
- Hazards often carry poor causal interpretation; fixed-horizon risk or RMST may be clearer for decisions.
- Time zero is part of the design. Misaligned time zero can create immortal time or eligibility bias.
- Competing risks require deciding whether the competing event prevents, replaces, delays, or reclassifies the event of interest.
- Censoring can be part of the causal process, not just a technical nuisance.
- Counts and recurrent events need exposure time, event dependence, and overdispersion considered before model choice.
- Recurrent-event analyses need gap-time versus total-time convention, episode construction, event dependence, and cluster/robust variance review.
- Ordinal and bounded outcomes need a scale that matches the decision, not just a convenient regression family.
- Rare binary outcomes can create separation, unstable odds ratios, and misleading relative effects; absolute risks may be more useful.
- Grouping, collapsing, or thresholding can help communication, but it also creates a new estimand and may hide clinically meaningful variation.
- Survival prediction metrics, C-index, variable importance, and risk scores are not causal evidence without design support.

## Design Interaction

- Randomized designs still need event definitions, follow-up windows, and attrition/censoring checks.
- Observational and longitudinal designs may need censoring, treatment switching, or recurrent-event handling as part of identification.
- Heterogeneity, policy, and transport claims inherit the chosen outcome scale.

## Package Cues

- Survival and competing risks: R `survival`, `survRM2`, `adjustedCurves`, `cmprsk`, `riskRegression`, `pec`, `flexsurv`, `rstpm2`, `randomForestSRC`, `ranger`, `grf`; Python `lifelines`, `scikit-survival`, `statsmodels` duration, `pycox`, `xgbse`.
- Binary/ordinal/count: R `glm`, `ordinal`, `MASS`, `glmmTMB`, `brms`, `geepack`; Python `statsmodels`, `scikit-learn`, `lifelines` when time matters.

## Useful Outputs

- outcome-scale decision note
- event/censoring/follow-up table
- delayed-entry, left-truncation, interval-censoring, recurrent-event, or start/stop-row construction note when relevant
- fixed-horizon risk, RMST, CIF, rate, or category-shift summary
- at-risk or denominator table
- censoring KM/IPCW distribution, truncation, and support note when censoring is modeled
- outcome-scale boundary wording

## Boundary Language

Name the scale. Avoid translating odds, hazards, rates, or model coefficients into generic "risk" or "effect" language unless the transformation is explicit and supported.
