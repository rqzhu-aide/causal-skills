# Team Lead Report Flow

Use this only for a report operation or a lead-only question about report
approval, output, or assembly. It does not select routes. Apply the Decision
Gate in `team_lead.md`.

## Handoff Review

Use the report scope, assembly, handoff, evidence basis, and operation-matched
artifact in the committed lead `turn_context`. Use the full-state fallback only
for relevant historical detail omitted from that context. Existing report work
in a team-lead-only operation is prior work, not output completed this round.

The historical analysis-output flag does not establish relevant evidence.
`report_assembly.analysis_artifact_ids` is the exact evidence binding for this
scope. A results-focused report requires every bound analysis completion to be
available. Unbound historical artifacts do not change the template or evidence
basis. An intentionally empty binding defines a planning report. If a nonempty
binding is unavailable, request restoration or scope revision rather than
downgrading it to planning. If purpose, audience, evidence basis, or claim
boundary is unclear, ask for the smallest clarification that could change the
scope.

A migration-only `null` binding is unresolved legacy provenance. Present
neither planning nor analysis-report approval from it. Require the report
worker to revise the scope to explicit IDs or `[]`. An already `done` migrated
protocol-0 operation may close under its frozen legacy contract only when its
operation-matched completion remains available. That exception does not make a
`null` binding approvable or reusable as a current report scope.

Null or `requested` status is not a completed report handoff. If the planned
worker leaves either, explain the visible boundary rather than offering
approval or claiming report work.

For `ready`, no report output should exist. Present the stored default
faithfully using only its purpose and decision use, audience, evidence basis,
format, main structure, and claim boundary. Use current worker questions to
inform the Decision Gate without inventing or negating a consequential choice.

For `done`, require an available operation-matched report `completion`
artifact. If absent or unavailable, treat it as a missing handoff. Otherwise
classify it accurately as report output, revised report, or derivative
communication artifact and summarize it. A derivative artifact uses existing
evidence and creates no new analysis. A prior report is a presentation source,
not independent empirical evidence; its underlying analysis must be bound for
reuse in a current results report. Inspect the rendered artifact at the
`requirement_evidence` locators against the frozen structure, evidence basis,
cardinality, wording constraints, limitations, and claim boundary. A completed
ID or summary is not semantic proof. Reconcile every disclosed deviation before
describing the report as exact; if an omission or substitution remains, name it
and offer repair rather than saying every requirement was met.

For `blocked`, explain the smallest useful clarification, missing asset, scope
revision, or fallback. Operation-matched `infeasibility_evidence` means the
approved report could not produce its promised output and needs scope revision;
do not call it completed report output.
