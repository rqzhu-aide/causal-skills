# Causal Readiness and Design Elicitation

Use `causal_check` with operation `design_elicitation` or `readiness`. Review
what the study can support, not how persuasively a causal sentence can be written.
A user's preferred estimator is a question to investigate, not validity evidence.

## Design Elicitation

Interpret available user accounts, protocols, allocation rules, eligibility
records, rollout decisions and collection logs when they can resolve the main
uncertainty. Establish who could receive treatment, who decided, on what
information, at what time, and why some units received a different exposure.
Separate assignment, actual receipt, exposure measurement and outcome observation.
Ask what changed in recruitment, recording, eligibility or follow-up around the
intervention. Distinguish actual practice from the written protocol.

Produce a coherent, source-labelled account of the assignment and collection
process, including contradictions and gaps. Explain which designs that account
supports or undermines. When one missing fact remains decisive, identify it
precisely and say how the user or a document could resolve it. Ordinary asking
for that fact is lead work, not a reason to invoke an empty specialist review.

## Readiness

Check the question, population, intervention/exposure, comparator, outcome,
time zero, follow-up and estimand against the actual evidence. In particular:

- order covariates, treatment, mediators, outcomes, selection and censoring;
- identify the assignment or exposure process and the comparison it supports;
- assess confounding, measurement, missingness, support, leakage, interference,
  clustering, selection and transport assumptions where they affect the target;
- distinguish evidence for an assumption from an assumption merely adopted;
- identify diagnostics, sensitivity, falsification or negative controls that
  could materially weaken or qualify the conclusion.

For design or support selection, load [method-catalog.md](method-catalog.md).
Do not load all design playbooks. The catalog identifies a scientific frame;
its presence does not establish that required data or assumptions are satisfied.
Routine empty audit/domain status fields are not blockers. Inspect the evidence
actually needed for this review, and do not treat imagined data as available.

Discovery output remains candidate structure. Establish variable roles,
adjustment validity and identification independently from timing, assignment,
domain knowledge and defensible assumptions. A fitted graph is not an adjustment
certificate. Diagnostic success cannot prove untestable identification assumptions.

Interpret corrections precisely. Self-selected attendance does not refute
randomized offers or their ITT target. An explicit correction that no offer was
randomized does remove that randomization argument. Inspect the affected
cohort, evidence and current recommendations; update their known implications
together while keeping historical reviews intact. Do not treat semantic
correction as altered artifact bytes or automatically invalidate other targets.

## Strategies and the Next Discriminator

Maintain project-specific candidates through [memory](memory.md). Recommend a
default only when evidence can rank a responsible route for the current target.
Useful alternatives may involve different data construction, linkage, collection,
population, comparator, follow-up, estimand, identification frame, or an explicitly
non-causal fallback. Do not force alternatives when one path is adequate.

For each material change, record its supporting/opposing evidence, unmet
requirements, claim boundary, reason, and what could reopen or promote it.
Keep unsupported and historical strategies discoverable. Two strategies sharing
a design remain distinct if their populations, targets or required data differ.
Routine estimator or uncertainty variants belong inside one strategy.

An alternative target does not replace the user's current target. ATT, overlap,
complier, cutoff-local and future-data targets may be valuable, but their changed
interpretation must be visible and adopted before execution. Never rank or create
strategies from the significance, direction or desirability of target results.
Result-driven recoding, exclusions or target switching do not repair a design.

If evidence cannot rank the routes, say so and name the smallest fact or user
decision that would discriminate them. Recommend an actionable next investigation,
with its required material, rather than another generic causal review. A missing
assignment log cannot be supplied by invoking a different specialist. If no
attainable review would change advice, give the supported conditional or limited
recommendation and stop. Residual assumptions need not be repeatedly sent back
to the user as factual questions. Apply the shared question disposition in memory.

## Claim and Work Boundary

State whether the evidence supports a causal claim under named assumptions,
a narrower qualified causal claim, association-only analysis, or planning only.
An explicit descriptive fallback can be useful but is never a causal design or
a silent substitute for requested estimation. Unresolved identification conditions
must be named as conditions on the claim or concrete checks needed before it,
not buried in a generic limitations list.

This review may inspect inputs, existing results and input/design-feasibility
diagnostics. Do not compute a new target outcome contrast, fitted target result,
subgroup effect or exposure-outcome association. Calling it a diagnostic does
not change that boundary. Existing results can be discussed without recomputation
or extension. A requested new estimate goes to one design worker in a later turn.

Commit one meaningful review with evidence, assumptions and strategy changes.
Return the decisive uncertainty and practical next direction to the lead. Do not
start another specialist or perform final report production inside this review.
