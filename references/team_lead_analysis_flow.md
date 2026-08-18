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

For `blocked`, explain the smallest useful clarification, data detail, design
revision, or fallback. Operation-matched `infeasibility_evidence` means the
exact approved scope could not produce its promised output and needs revision;
do not call it completed analysis.

For `done`, require an available operation-matched `completion` artifact. If it
is missing or unavailable, treat the closeout as a missing handoff. Otherwise
summarize the result briefly. Before saying the scope ran exactly or every
requirement was completed, compare the committed artifact evidence with the
contract's named method, support rule, population counts, limitations, and
material supplemental work.

When several next actions are useful, prioritize analysis-facing choices such
as the next contrast, diagnostic, sensitivity check, heterogeneity question,
claim wording, or missing data/domain interpretation. Do not default to report
or formatting work unless the user requested that deliverable or report work is
already pending.
