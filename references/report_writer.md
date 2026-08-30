# Route: report_writer

Use this reference to draft, revise, or structure academic, technical,
reviewer-facing, or decision-facing reports.

`project_summary.analysis_output` and `project_summary.report_output` indicate
only that a historical `completion` artifact exists. The exact evidence basis
for the current report is `report_assembly.analysis_artifact_ids`. A
results-focused scope must bind the relevant, available analysis completion
records there. An intentionally empty binding defines a planning report. Do
not infer report evidence from unrelated historical records. A migration-only
`null` binding means a legacy report had analysis history but did not record
which evidence it intended to use. It is neither planning nor analysis scope;
revise it to an explicit ID list or `[]`, then obtain approval.

Approved report output is HTML by default. Requests for PPT, DOCX, PDF, slides,
email, letter, memo, Markdown, or another form become scope, structure,
audience, or writing-style cues unless a future workflow explicitly supports
that file type; do not manage a separate file-format workflow or promise those
file types.

Use this vocabulary consistently:

- `analysis report`: report grounded in completed causal-consultant analysis
  output.
- `planning report`: report for framing, scope, missing evidence, and next
  decisions when the current scope lacks relevant analysis evidence.
- `report scope`: the proposed report structure, evidence use, audience, and
  limitations that `team_lead` can synthesize for approval or revision.
- `report output`: created or revised HTML report.
- `derivative communication artifact`: slide-style, memo-style, email-style,
  handout, or other communication output derived from existing report evidence;
  not new analysis.
- `finished artifacts`: `completion` items in `artifact_records` and their existing
  output files that can be used, cited, linked, omitted, or disclosed in the
  report scope.

## Assignment And Scope Lifecycle

Use the worker `turn_context`, operation packet, persisted assignment,
`report_assembly`, and available artifact evidence. A newer message does not
change resumed work. A non-null scope reference records approval at `begin`;
never reinterpret approval later. For report output, that authorization is
valid only when `analysis_artifact_ids` is a resolved array. A protocol-0
operation with a `null` binding is repair-only: revise the evidence selection,
return for approval, and create no output. Use the full-state fallback only for
relevant detail omitted from the context. During approved or output-bound work,
recover analysis detail only for IDs already in the frozen binding, and recover
non-analysis material only when the frozen scope already names it. A prior
report is a presentation source, not independent empirical evidence; use it
only when the frozen scope names it and its underlying analysis IDs are bound.
Never use the fallback to discover or adopt another analysis artifact. Submit
one silent `apply` as `report_writer`, updating only `report_assembly` and its
chamber slot, with an artifact only for allowed output below.

Classify the task into one of four report scope states:

- **No ready scope yet**: null, missing, or `current_status: requested`
  prepares report scope feedback and creates no files. Set `ready` when a
  bounded proposal can be presented despite open questions; set `blocked` only
  when missing information prevents a responsible scope. Accepting a team-lead
  report option starts this scope handoff; it is not approval of report output.
- **Ready scope**:
  - A non-null active `scope_ref` that exactly matches the ready
    `report_assembly.scope_id` and `scope_revision` records approval. Recheck
    the live evidence gates and availability of every bound artifact. Never
    substitute an unbound artifact or downgrade a nonempty binding to planning.
    If a bound artifact is unavailable, return `blocked` without output and
    request restoration or scope revision. Otherwise
    incorporate only minor refinements preserved in `intent_summary`, create
    the report, and set status to `done`.
  - With no `scope_ref`, treat the assignment as clarification or revision.
    Material redesign revises `report_assembly`; otherwise keep it `ready` or
    set `blocked`. Create no files.
- **Blocked scope**: if the user provides the missing asset, scope repair,
  omission decision, audience or purpose clarification, or claim-boundary
  revision, update `report_assembly`; set status to `ready` if the report scope
  can now be presented, or keep it `blocked` if it still cannot proceed. Create
  no files in the repair turn.
- **Done report**: any revision request returns to approval-ready scope first.
  Preserve the scope revision for minor refinements; increment it for material
  redesign. Create no revised file until a later turn clearly approves the
  resulting ready scope.

A `ready` report scope contains one complete default. Questions may offer
revisions, but must not leave the purpose, audience, evidence basis, structure,
output, or claim boundary materially undecided. Preserve requested cardinality
and priority. If the scope promises one next evidence step, store one concrete
priority and carry it into the output; changing or adding alternatives requires
a scope revision.

Minor refinements include shorter or longer length, reviewer-facing tone,
cautious wording, emphasizing or omitting a small section, adding a brief
limitation or heterogeneity paragraph, or changing report style without
changing the evidence base.

Material redesign includes a different report purpose, an audience with a
different decision context, a different primary artifact or evidence base, a
different causal claim boundary, or a different structure that makes the
previous scope misleading. It increments the report scope revision. Minor
refinements preserve the current scope identity and revision. A new independent
report scope receives a new identity; the controller generates all IDs and
revision values.

Record blocked or completed work in `report_assembly`,
`council_chamber.report_writer.current_status`, and relevant report notes.

## Report Templates

For approved report output, the controller returns the matching Markdown
template and `assets/report_html_layout_template.html` (the required final
HTML shell) with the output-authorized context. It returns
`assets/report_template_planning.md` only when
`analysis_artifact_ids` is intentionally empty, and
`assets/report_template_analysis.md` when that binding is nonempty. Do not
override this choice from global artifact history. A missing bound artifact is
a blocked analysis-report boundary, not a planning-template fallback. Do not
load either report template for a migration-only `null` binding. Resolve it
through scope revision first. Do not load template files during scope
preparation; use the section logic below.

Planning-report sections: Front Summary; Planning Boundary And Recommendation;
Causal Question And Decision Context; Candidate Estimand Or Target Sketch;
Causal Structure And Assumptions; Data, Measurement, And Provenance Needed
Next; Candidate Method Paths; Potential Figures Or Displays; Alternatives,
Pitfalls, And Parked Ideas; Recommended Path From Planning To Analysis;
Evidence Basis And Open Questions.

Analysis-report sections: At A Glance; Main Answer And Evidence Status;
Original Question And Refined Causal Question; Causal Estimand And Target;
Data Reality And Provenance; Method Rationale, Alternatives, And Pitfalls;
Results, Figures, And Tables; Diagnostics, Sensitivity, And Robustness; Causal
Boundary And What Not To Claim; Interpretation And Next Decisions; Evidence
Sources And Limitations; Appendix Notes.

Use the Markdown templates as section logic, not output targets or fixed
prose. Omit sections irrelevant to the approved scope, but preserve the causal
boundary, evidence status, limitations, and next-decision logic. Build the
approved report directly in the HTML shell, including required figures,
tables, callouts, audience-facing evidence sources, and limitations when
supported by state and artifacts.

## Causal Report Writing Logic

Use the report-relevant project, data, domain, causal, discovery, analysis,
artifact, and assembly evidence supplied in the worker context. Exclude any
artifact reported unavailable and never infer a replacement from nearby output
files. Use the full-state fallback if a requested report claim depends on
relevant historical detail omitted from the projection.

For analysis reports, organize around the refined causal target, data reality,
design/method fit, artifact-backed results, diagnostics, claim boundary, and
decision implication. Every table or figure should answer a report question and
carry its main limitation.

For planning reports, organize around the decision context, missing
causal/data/domain facts, candidate targets or designs, evidence needed before
analysis, unsupported paths, and the next user decision.

Calibrate wording to evidence status:

- Use causal language only when `causal_facts` and completed artifacts support
  it.
- Use qualified language such as "consistent with" or "suggests" for limited
  designs or incomplete diagnostics.
- Use "association", "difference", "pattern", or "descriptive" when causal
  identification is not supported.
- Use "exploratory" or "hypothesis-generating" for screens, subgroups,
  discovery findings, or unvalidated contrasts.

Make missing diagnostics, omitted analyses, weak support, and parked items
visible. Treat route IDs, operation IDs, state-field names, and filesystem paths
as internal provenance; include them only when the approved scope explicitly
requests technical reproducibility detail. Avoid invented results, decorative
figures, tables without interpretation, hidden omissions, and claims beyond
`artifact_records` or route-owned state.

Preserve the approved scope. For each report claim, the narrowest applicable
boundary in relevant route-owned state, the bound scope, or the available
artifact supporting that claim governs. Report and derivative communication
output must not strengthen it. Keep prose concise and consistent: separate
assumptions, methods, results, limitations, and interpretations, use consistent
terms, and write clearly and directly.

## Report Scope And Handoff

Before doing report-writing work, decide whether this turn should prepare scope
feedback, block, or create output. For requests that are not simply an analysis
report or planning report, follow the user's requested scope as writing style,
structure, or audience guidance while preserving the causal boundary.

When scope feedback is needed:

- Do not draft final report text, completed results prose, or finalized wording.
- Do not reserve an output location or submit an artifact.
- Prepare an approval-ready report scope for `team_lead`.
- Follow the matching section list in Report Templates above (planning versus
  analysis) for the envisioned structure; do not load the template files.
- Inspect the context's relevant route summaries and only available files
  explicitly referenced by artifacts or the persisted assignment.
- Write a compact `report_assembly.planned_structure` list that names the
  envisioned sections and what each section would do. Keep each entry short and
  approval-oriented, not drafted prose.
- Submit the route-owned scope and chamber fields described below, including a
  compact inventory of finished artifacts the report would use, omit, or
  disclose and 0-3 questions for `team_lead`.
- Use `scope_transition: new` for an independent scope, `revise` for a material
  change, or `preserve` when identity and revision remain valid.
- Set `council_chamber.report_writer.current_status` to `ready` when the scope is
  approval-ready; otherwise set it to `blocked` and summarize the blocker.

## State And Chamber Updates

Submit supported fields under `report_assembly`:

- `current_format`: set to `html` when this operation completes the current
  report scope; set to `null` for a `ready` or `blocked` handoff. Historical
  report records remain in `artifact_records` and the derived output flag.
- `report_goal`
- `target_section`
- `audience`
- `planned_structure`
- `key_points`
- `wording_constraints`
- `analysis_artifact_ids`: the sorted IDs of the analysis `completion`
  records approved for this report, or `[]` for an intentional planning
  report. Changing this evidence set is material and requires `new` or
  `revise`, followed by approval. Never submit `null`; it is a
  controller-owned legacy migration marker.
- `draft_notes`

In report scope setup, keep in `draft_notes` a compact internal
finished-artifact inventory: what artifacts exist, what each contributes to the
proposed report, and which expected report pieces are missing, omitted, or only
suitable as limitations. This inventory explains selection decisions but does
not bind evidence. Bind every selected analysis completion explicitly in
`analysis_artifact_ids`. Translate that provenance into audience-facing
evidence descriptions rather than copying it into the rendered report.

Submit only this route's chamber slot:

- `current_status`: report scope status only.
- `summary`: one compact description of the report scope, produced output, or
  blocker.
- `questions_for_user`: 0-3 current questions, choices, or approval points for
  `ready` or `blocked` handoffs. Use `[]` for `done`; team lead derives later
  choices from the completed evidence.
- `feedback_to_route`: 0-2 handoffs when another member should review something
  before report output.

Normal worker handoffs use `ready`, `blocked`, or `done`. Null or `requested`
is a pre-work or legacy marker; when observed, prepare and submit a completed
scope handoff rather than passing that marker to team lead. Put any blocker
reason in `summary`.

Report writer is a handoff route, not a consulting-opinion route. The
controller derives global output status and owns artifact records; team lead
owns closeout synthesis.

## Report Outputs

When report text, a draft, HTML, or another report artifact is actually
created:

Treat the operation packet requirements as minimum coverage. Validate the
rendered output against them, its evidence basis, and claim boundary;
supplemental writing is allowed within the bound report scope.

1. Reserve, write, and validate one meaningful temporary report file or
   directory through `references/artifact_output_policy.md`; pooled reports
   never live inside an analysis artifact folder.
2. For completion, set `report_assembly.current_format` to `html` and add one compact draft note
   stating output kind, source basis, whether new analysis was performed,
   inherited causal boundary, limitations, and reserved output location.
3. Submit `scope_transition: preserve`, `current_status: done`, report state,
   and a `completion` artifact receipt through `statectl apply`. Use `report`,
   `revised report`, or `derivative communication artifact` accurately. Use
   "conversion" only for a literal format conversion that does not change
   content.
4. If execution demonstrates that the exact bound report cannot produce its
   promised output, keep `current_format: null` and submit
   `scope_transition: preserve`, `current_status: blocked`, and an
   `infeasibility_evidence` artifact receipt. This preserves the evidence but
   does not count it as a completed report. A rendering, tool, or transient
   execution failure alone is not infeasibility evidence; retry it or use the
   normal no-artifact blocked handoff.

Do not reserve or submit an artifact for purely verbal report-scope setup.

An analysis-specific note or analysis report may live in an analysis artifact
folder only when it is part of the analysis output and recorded as
`route: analysis_execution`. A pooled report produced by `report_writer` should
be recorded as `route: report_writer` and saved outside analysis-specific
artifact folders.
