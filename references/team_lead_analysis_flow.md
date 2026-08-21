# Team Lead Analysis Flow

Use this only for an analysis operation or a lead-only question about analysis
scope, approval, execution, or output. It does not select routes. Apply the
Decision Gate in `team_lead.md`.

## Handoff Review

Use the analysis actor, exact matching design slot, support, contract, handoff,
and operation-matched artifact in the committed lead `turn_context`. Use the
full-state fallback only for relevant historical detail omitted from that
context.

Only a committed analysis worker handoff establishes scope work in the current
operation. In team-lead-only or core-route work, an existing slot is prior work.
A missing handoff or null or `requested` status means no completed scope
handoff exists; state that boundary and do not offer approval or execution.
Do not present approval for a distinct target or separately reportable result
beyond the persisted assignment.

For a current-operation `ready` handoff, no output should exist. The controller
already validated analysis entry before `begin`, and the worker prepared the
scope from that committed context. Do not rerun the full entry gate at closeout.
Instead, ensure the handoff itself records no unresolved target, design,
support, or claim-boundary mismatch. For lead-only discussion of a prior ready
scope, follow the router's current-scope decision; do not revive or offer a
scope that could not be bound as current.

Treat `execution_contract` as the authoritative minimum work definition.
Chamber prose cannot replace it. Reconcile any displayed population counts with
the stated total and make the support explanation agree with the contract.
Present only the target or estimand, design and support, required inputs,
estimation strategy or model family, main diagnostics, main output, and claim
boundary. Translate method language for the user and hide internal IDs and
field names. Present the stored ready default faithfully; do not invent or
negate a consequential choice.

A nonpreferred research strategy or same-design formulation cannot silently
change the stored ready default. It may be summarized as a revision possibility
under the direct yes/no approval rule, but choosing it starts an unbound
preparation or revision operation with its exact owner. It does not execute the
current scope.

For `blocked`, explain the smallest useful clarification, data detail, design
revision, or fallback. Prefer a concrete path already supported by the research
portfolio or owning chamber. State what it would enable, what it requires, its
main risk or claim limit, when it would be preferable, and its next owner.
Operation-matched `infeasibility_evidence` means the
exact approved scope could not produce its promised output and needs revision;
do not call it completed analysis.

For `done`, require an available operation-matched `completion` artifact. If it
is missing or unavailable, treat the closeout as a missing handoff. Otherwise
summarize the result briefly. Before saying the scope ran exactly or every
requirement was completed, compare each load-bearing contract requirement with
its `requirement_evidence` locator in the committed artifact. Check the named
method and shared specifications, support rule, population construction,
diagnostics, outputs, limitations, and claim boundary. Reconcile
`supplemental_work` and every disclosed deviation. A completed ID or chamber
summary alone is not implementation evidence. If a material mismatch remains,
describe the analysis as requiring repair and do not recommend downstream
report use as verified evidence.

When several next actions are useful, prioritize analysis-facing choices such
as the next contrast, diagnostic, sensitivity check, heterogeneity question,
claim wording, or missing data/domain interpretation. Do not default to report
or formatting work unless the user requested that deliverable or report work is
already pending.

Keep routine diagnostics, estimator safeguards, and sensitivities within the
current strategy rather than presenting them as artificial research
alternatives. Offer a new strategy only when it materially changes the target,
identification basis, data requirements, or supported claim.
