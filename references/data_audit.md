# Data Audit and Requested Preparation

Use `data_audit` with `review` for inspection, `prepare` only when the user
requests a bounded derived dataset. Focus on the selected uncertainty, not an
exhaustive profile or an automatic repair.

## Inspect Before Transforming

Read named data and documentation. Prioritize facts that change the target,
design or claim: assignment/exposure/observation/analysis units; treatment and
outcome definitions; timing, censoring and follow-up; baseline versus
post-treatment variables, mediators, colliders and leakage; missingness,
attrition, eligibility, duplicates and linkage; repeated measures, clustering,
matched sets and interference; exposure support, sparse strata and imbalance.

Separate file facts, user accounts and assumptions. Names are not verified
measurement definitions. A valid panel does not establish exogeneity or parallel
trends. Do not convert blanks to zero, silently drop duplicates or infer an
unobserved event from a missing record.

Audit diagnostics can inspect distributions, missingness, recurrence and
exposure-only support. No target exposure-outcome contrast, adjusted/subgroup
effect or target model, even under a diagnostic label. Those require a planned
design-worker execution. Do not select a final method or silently change target.

Suggest useful linkage, reconstruction, aggregation, justified restriction or
additional collection with what it enables and its limitations. Finding a
problem is not permission to repair it. Never reshape, recode, impute or select
observations for attractive results.

## Preparation When Requested

This specialist owns the requested construction before design selection; no
second specialist is needed. Inspect schemas and resolve consequential ambiguity
before freezing rules. Load [runs.md](runs.md) and start an `audit` plan with
nonempty `transformations` and `diagnostics`, a preparation-only claim boundary
and the actual inputs. No artificial causal design/effect estimand.

Specify join keys/cardinality, duplicate resolution, unmatched handling,
eligibility, event definitions and temporal boundaries before creating the table.
An audit can establish a key's uniqueness; it cannot decide what an ambiguous
event means without evidence. Preserve originals and use frozen input snapshots.

Save executable code/configuration, the derived dataset and diagnostics for
keys, join cardinality, unmatched records, row/cohort flow, temporal ordering and
output schema as relevant. Preserve actual command/output logs and environment;
code beside a table does not establish execution. Check the resulting rows
against the intended rules, including exclusions and boundary cases. Record
deviations, finalize and link computed evidence to manifested outputs. Failure
stays visible. Preparation establishes construction, not causal validity.

## Reusable Data Understanding and Handoff

In existing evidence summaries/limitations, retain inspected source/version and
documentation; population, row unit, keys/linkage, key meanings/timing,
selection/missingness and unchecked scope. Attribute user accounts and assumptions.
Record known file hashes for reuse; hashes identify bytes, not meaning.
Link open questions and strategy implications via [memory](memory.md).

Example: booking is not attendance. If attendance timing matters, propose
"Are actual attendance events recorded separately?" A usable source could
enable that timeline, not establish offer assignment or select a new target.
The lead selects the question and records its consequence.

No-output reviews need only committed review/source evidence. Audit artifacts
use a run; memory keeps concise interpretation and provenance.
