# Support: dose-response

Context only. Relevant when treatment or exposure is continuous, ordinal, multi-level, cumulative, duration-based, intensity-based, threshold-based, or naturally framed as an exposure-response curve. The selected design worker owns this review and its diagnostics.

## Additional Information

- Useful when a binary treatment contrast is not enough because dose, level, duration, intensity, cumulative exposure, stochastic shift, or modified treatment policy matters.
- Highlights intervention meaning and support across the dose range as information the design should carry into its analysis notes.
- Helps mark extrapolation, sparse tails, measurement scale, and exposure timing as claim boundaries.
- Useful lanes include fixed supported contrasts, ordinal or multi-level contrasts, smooth supported curves, generalized propensity-score weighting, feasible stochastic shifts/MTPs, and longitudinal dose strategies.

## Non-Obvious Twists

- Define the real intervention before modeling the curve. "Increase dose by one unit" may not be feasible or meaningful.
- Supported dose range matters more than curve smoothness. A beautiful curve outside support is still extrapolation.
- Stochastic shifts or modified treatment policies may be more realistic than setting everyone to a fixed dose.
- Current dose, cumulative dose, duration, adherence, timing window, and exposure history can answer different questions.
- Dose construction may need cumulative, average, peak, lag/window, duration, transformed, binned, or feasible-shift versions before modeling is meaningful.
- Binning a continuous dose can create artificial thresholds; if bins are used, their domain meaning and stability should be explicit.
- Generalized propensity score or dose-weighting workflows need balance across the dose distribution, not just a fitted dose model.
- Thresholds should be treated as hypotheses with stability checks, not narratives discovered after fitting a flexible curve.
- Measurement error or domain normalization can dominate apparent dose-response shape.
- Heaping, bounds, outliers, and sparse tails can matter more than the chosen smoother.

## Design Interaction

- Baseline observational designs need dose-specific exchangeability and positivity.
- Longitudinal designs may be needed for time-varying dose, cumulative exposure, adherence, or dynamic dose policies.
- Randomized dose designs still need compliance and actual received dose separated from assigned dose.

## Package Cues

- R: `CausalGPS`, `WeightIt`, `cobalt`, `lmtp`, `tmle3shift`, `gfoRmula`, `mgcv`.
- Python: `EconML`, `DoubleML`, `statsmodels`, custom spline/GAM or standardization workflows.
- Use package choice only after the dose intervention and support range are explicit.

## Useful Outputs

- dose support plot with sparse tails marked
- intervention-definition note
- exposure-response curve with support shading
- heaping, bounds, outlier, and measurement-quality note
- threshold or window sensitivity summary
- alternative dose-scale comparison

## Boundary Language

Record "within the observed support range" as a wording constraint when appropriate. Avoid implying effects for unsupported dose levels, impossible interventions, or post-hoc thresholds.
