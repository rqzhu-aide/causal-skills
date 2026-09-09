# Design Worker

Use `design_worker` with a required `design_id` and operation `feasibility` or
`execution`. The same specialist owns design fit, estimator choice, diagnostics
and interpretation for this bounded review. Necessary fit checks and requested
execution may happen together; do not impose a separate feasibility turn when
the request and evidence are already sufficient.

Use the assessed study basis to justify the selected target, comparison and
variable roles; a successful fit does not establish them. An explicitly
descriptive assignment may execute without resolving the original causal
question, but cannot close it or supply causal adjustment claims. If a material
study-process gap prevents the requested causal work, return that need to the
lead for causal assessment; do not silently substitute an associational target
or perform a second specialist review.

## Load the Selected Science

Choose and read the primary guide for the selected target's identifying argument.
Load only additional guides needed for that same argument and record them in
`additional_design_ids`. For example, a randomized saturation spillover review
can combine interference and randomization guidance within this one specialist.
Multiple guides do not authorize another estimand or independent investigation.

- [randomized_assignment](design/randomized_assignment.md)
- [single_time_observational](design/single_time_observational.md)
- [longitudinal_gmethods](design/longitudinal_gmethods.md)
- [difference_in_differences](design/difference_in_differences.md)
- [regression_discontinuity](design/regression_discontinuity.md)
- [instrumental_variables](design/instrumental_variables.md)
- [synthetic_control_time_series](design/synthetic_control_time_series.md)
- [interference_spillovers](design/interference_spillovers.md)
- [descriptive_association](design/descriptive_association.md)
- [custom_identification](design/custom_identification.md)

Load a support only if it changes this review, and record its ID in the
assignment: [heterogeneous-effects](support/heterogeneous-effects.md),
[dose-response](support/dose-response.md), [mediation](support/mediation.md),
[policy-making-and-transportability](support/policy-making-and-transportability.md),
[non-continuous-outcomes](support/non-continuous-outcomes.md), or
[statistical-validity](support/statistical-validity.md). Supports are not extra
specialists. Routine design diagnostics need no statistical-validity add-on.

## Reuse Audit Findings

Before reusing findings, check source version, population and definitions;
reassess affected changes or gaps, not automatically repeat the audit.
For a reused file version, pass its known audit hash as the matching input's
`sha256`. A fresh snapshot alone does not validate old findings.

## Feasibility

Assess data requirements, identification, estimand/scale, dependence and
diagnostics before software. Check installed tools and current official package
documentation as needed. Distinguish documented, locally tested and proposed
functionality. Do not infer permission for installation, uploads or paid services.

For a custom or combined argument, connect target, assumptions, source-supported
estimator and uncertainty calculation. A no-output feasibility review records
that reasoning and inspected sources in the ordinary handoff; no empty run is
needed. Do not force an unfamiliar argument into the nearest familiar design.

Give a complete default or concrete infeasibility reason: inputs, estimator,
uncertainty, diagnostics and claim boundary. Compare formulations only when
consequential. Software familiarity, fit and prediction do not establish design
validity. Synthetic API smoke tests are not study estimates or evidence of them.

Feasibility can inspect structure and input diagnostics. It cannot compute the
requested target result, a raw exposure-outcome contrast or a refined subgroup
effect. Those require execution, even when called preliminary or diagnostic.

## Execution

Load [runs.md](runs.md). Freeze its analysis plan before target computation,
using actual inputs and target definitions. Save seeds, folds, transformations
and model settings in code/configuration. Make unresolved identification
conditions checkable requirements or explicit conditions on the claim.

Freeze `additional_design_ids` and, for custom/composed analyses,
`identification_basis` in the plan. Check that this execution's assignment and
plan describe the same primary/additional guides; identify the newly executed
run in the handoff. Earlier runs cited as evidence may have different scopes.

For unfamiliar, combined or substantially modified implementations, inspect the
methods source as well as software documentation and use a proportionate
independent check: a solvable case, published example, simpler verified
implementation or suitable simulation. Check the estimator and uncertainty,
not just a successful API call. Save what the check establishes and what it
cannot; one simulated realization does not establish interval coverage. The
same specialist owns this check, without an automatic second review.

Use immutable input snapshots, saved code/configuration and a contained run.
Keep originals read-only. Choose estimation and sensitivity specifications from
the design and evidence, not attractive results. Preserve analysis-set flow,
target changes caused by trimming or matching, missingness handling, dependence,
and the relevant diagnostic outputs. Prefer one reproducible pass; targeted
corrections address demonstrated errors, not open-ended searches for significance.

Design diagnostics are cues, not a checklist or new estimand authorization.
Include needed checks and explain consequential omissions. A separately
reportable contrast, subgroup, policy or outcome needs a visible decision and
its own plan; diagnostics cannot silently change the target.

Finalize only when code, inputs, outputs, environment, diagnostics, deviations
and claim boundary are traceable. Preserve actual execution evidence; saved
code alone does not prove execution. Failed work stays failed/incomplete with its
reason. Package failure does not establish scientific infeasibility.
Retain invalidating diagnostics and weaken the claim, not force an estimate.
Check the explanation as well as the estimate: an adjusted sign change does not
establish confounding or mediation, and adjustment does not establish causal
comparability. Attribute variable roles to evidence or explicit assumptions.
Completed runs are immutable; material post-result changes need a new run
with a visible reason and timing.

## Handoff

Use the shared [memory](memory.md) review to connect the work to the selected
uncertainty and strategy. Distinguish findings, assumptions and limitations;
identify what the review ruled out and what remains possible. Computed study
evidence must point to the completed run and its manifested output.

A changed target or primary identifying frame returns to the lead, not another
execution/specialist this turn. Alternative targets require adoption. Tuning
cannot justify result-driven restrictions, recoding or evidence omission.
