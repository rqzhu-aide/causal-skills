# Method Selection Cues

This is a compact scientific map for causal readiness, not a list to execute.
Choose one primary frame from the actual source of identification. Supports
address conditional questions inside that frame; they are not stand-alone
specialists. Additional design guides may support the same coherent argument;
record `additional_design_ids`, not another worker. Load a guide only when it changes
the selected review. The design worker's links locate the full playbooks.

| Design ID | Evidence that makes it a candidate | Decisive checks |
|---|---|---|
| `randomized_assignment` | Documented, auditable random assignment, lottery, experiment or randomized rollout | Assignment unit/probabilities, allocation integrity, time zero, analysis set, attrition, compliance, contamination and outcome window |
| `single_time_observational` | Baseline/point-treatment observational contrast with a credible measured-confounding story | Target-trial alignment, eligibility, exposure/comparator versions, pretreatment confounders, time zero, follow-up, positivity and selection |
| `longitudinal_gmethods` | Treatment and confounders evolve, with prior treatment affecting later confounding or actions | Histories and node order, sustained/dynamic regimes, censoring, treatment-confounder feedback and support over histories |
| `difference_in_differences` | Treated and comparison units observed over time, identifying through untreated potential trends | Adoption dates/cohorts, comparison credibility, pre-periods, anticipation, composition, measurement stability, staggered timing and inference level |
| `regression_discontinuity` | Treatment or eligibility changes at a real running-variable cutoff | Cutoff rule, timing, sharp/fuzzy jump, manipulation, local support, continuity and acceptance of a local target |
| `instrumental_variables` | A plausible instrument moves treatment with defensible independence and exclusion | Relevance, alternative outcome pathways, monotonicity/complier target, weak instruments and measurement compatibility |
| `synthetic_control_time_series` | One/few treated aggregate units, untreated donors or a credible time-series counterfactual | Intervention timing, donor contamination, pre-fit, sufficient pre-periods, measurement stability, concurrent shocks and inference |
| `interference_spillovers` | Treatment of one unit can affect another unit's outcome | Mechanism, exposure map, timing, own/spillover support, network or cluster boundaries and direct/spillover contrast |
| `descriptive_association` | Identification is unsupported but a requested descriptive answer is useful | Explicit non-causal purpose, observed population/variables, scale, missingness, dependence, multiplicity and uncertainty |
| `custom_identification` | A source-supported identifying argument outside these families, such as proximal identification | Target, distinct assumptions, source-to-estimator agreement, appropriate uncertainty and an independent implementation check |

Repeated outcomes alone do not imply longitudinal g-methods. Clustering alone
does not imply interference. A quasi-random label is not documented randomization.
An analyst-created threshold is not RD. Predicting treatment does not make a
variable a valid instrument. Package names and model complexity do not choose
the identification frame.

Hybrid distinctions:

- Randomized saturation: interference can be primary for a spillover target,
  with randomized-assignment guidance for the same allocation/exposure argument.
- Randomized encouragement: assignment-based ITT belongs to randomized
  assignment; receipt effects or CACE/LATE require IV assumptions and the IV frame.
- Fuzzy cutoff: keep local-IV assumptions within RD when the cutoff is the
  identifying source; use IV when the instrument is the primary frame.
- Synthetic DiD: donor-weighted one/few treated-unit work belongs to synthetic
  control; group-time or multi-cohort identification belongs to DiD.

| Support ID | Load when it materially changes the selected review |
|---|---|
| `heterogeneous-effects` | Baseline effect modifiers, subgroup/CATE targets, subgroup support, honest validation and exploratory versus prespecified claims |
| `dose-response` | Dose/intensity/duration/history interventions, supported dose ranges, feasible shifts, and extrapolation |
| `mediation` | Mechanism targets, mediator ordering, mediator-outcome confounding, direct/indirect-effect assumptions and post-treatment adjustment |
| `policy-making-and-transportability` | Decision rules, policy value, decision-time features, utility/constraints, or a named target population and source-target compatibility |
| `non-continuous-outcomes` | Binary/count/ordinal/survival or competing-risk scale, follow-up, censoring and estimand interpretation |
| `statistical-validity` | Unresolved balance, support, weights, sensitivity, nuisance/fold integrity or inference concerns beyond the design's routine diagnostics |

Prefer the specific support that answers the real question. An empty support
list is normal; statistical validity is not an automatic companion. If a support
would introduce a different target rather than clarify the selected one, return
that choice to the lead. The existence of a support cannot rescue an unsupported
primary design.
