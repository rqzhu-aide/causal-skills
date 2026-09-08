# Design: custom_identification

Use with [design_worker](../design_worker.md) when the selected identifying
argument is outside the nine standard families. This is an honest place for
source-supported work, not a validity label or an exemption from a frozen plan.
Use feasibility or execution for the same bounded target and one specialist.

## Establish the Argument

Inspect a primary methods source for the actual setup. Connect the requested
quantity to its identifying argument, estimator and uncertainty calculation.
Explain what observed variables and study processes support the argument,
which assumptions remain untestable, and which plausible violations change the
claim. A named method, precedent, fitted model or available package is not proof
that this study meets its conditions. If the source cannot be inspected, retain
a proposal or conditional assessment rather than inventing methodological detail.

Retain the user's population, intervention, outcome and target. An additional
standard guide may help check timing, assignment or dependence within the same
argument. Record its role in `additional_design_ids`; merely joining two
checklists does not establish coherent identification. A different substantive
target returns to the lead for direction.

## Example: Proximal Identification

Proximal inference uses proxy restrictions and a bridge argument, not ordinary
exchangeability given the measured covariates. Distinguish treatment-inducing
and outcome-inducing proxy roles, their timing, exclusions, relevance, and the
bridge/existence/completeness conditions needed by the selected setup. Explain
their applicability instead of asking the user to certify completeness.

In the linear illustration, substituting the raw outcome proxy for its
conditional expectation can change the identifying regression. Inspect the
actual estimating equation and inference procedure, not just a library label.
The [primary introduction](https://arxiv.org/html/2009.10982v1), particularly
Sections 1 and 3, separates the linear illustration from general identification
conditions. Negative-control falsification alone does not implement proximal
identification or automatically correct hidden confounding.

## Implement and Check Proportionately

For execution, the analysis plan needs `identification_basis` with a specific
`argument`, nonempty `assumptions`, and inspected `source_refs`. Put substantial
derivations and implementation notes in referenced run files, not a second
memory store. A no-output feasibility finding uses review/evidence fields.

Check a consequential feature against an analytic calculation, published
example, transparent verified implementation or simulation with known truth.
Preserve the check's target and uncertainty convention. Distinguish point
estimator agreement from variance agreement and repeated-sampling coverage.
Account for fitted nuisance functions, sample splitting, weights and dependence
where the chosen argument requires them. Report what remains unchecked.

Lack of an off-the-shelf package can justify a bounded implementation proposal,
not a claim that the science is impossible. Conversely, do not execute a target
estimate when a missing defining assumption, unsupported target, rank/support
failure or estimator mismatch leaves the promised result unjustified. Return
the precise limit and a useful alternative or attainable next contribution.

Saved computations follow [runs](../runs.md), including pre-result plans,
immutable snapshots, actual execution evidence, diagnostics and claim boundaries.
The handoff identifies this run and distinguishes verified implementation facts,
adopted assumptions, unresolved issues and the resulting recommendation.
