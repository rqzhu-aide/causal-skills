# Route: report_writer

Use this reference to draft, revise, or structure academic, technical,
reviewer-facing, or decision-facing reports.

This worker remains silent and submits internal findings or revised text for
`team_lead` to synthesize.

`project_summary.analysis_output` and `project_summary.report_output` indicate
only that a historical artifact record exists. Results-focused report work also
requires relevant, available analysis artifacts that match the current report
scope. Without them, use this route only for planning report scope or
claim-boundary language; do not draft results, invent results, or describe
completed methods.

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
- `finished artifacts`: completed items in `artifact_records` and their existing
  output files that can be used, cited, linked, omitted, or disclosed in the
  report scope.

## Plan Entry

Read the validated state before route work. Proceed only at `worker_pending`
when the committed plan's worker route is exactly `report_writer`.

Use the self-contained `state_meta.active_operation.intent_summary`, its
`scope_ref`, `report_assembly`, `artifact_records`, and live state as the
assignment. On resume, a new message does not change it. A non-null `scope_ref`
is the approval result recorded at `begin`; do not reinterpret approval from a
later message. Submit one `statectl apply` JSON payload with
`actor: report_writer`, `updates` containing only `report_assembly` and
`council_chamber.report_writer`, and optional top-level `artifact`. The
controller owns timestamps, scope identity, artifact append, and transition to
`lead_pending`; never edit state directly.

Classify the task into one of four report scope states:

- **No ready scope yet**: null, missing, or `current_status: requested`
  prepares report scope feedback and creates no files. Set `ready` when a
  bounded proposal can be presented despite open questions; set `blocked` only
  when missing information prevents a responsible scope. Accepting a team-lead
  report option starts this scope handoff; it is not approval of report output.
- **Ready scope**:
  - A non-null active `scope_ref` that exactly matches the ready
    `report_assembly.scope_id` and `scope_revision` records approval. Recheck
    the live evidence gates and artifact availability. If either no longer
    supports the bound scope, return `blocked` without output. Otherwise
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
output, or claim boundary materially undecided.

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

Use the bundled templates when preparing a report scope or carrying out an
approved report output:

- `assets/report_template_planning.md` as structural guidance when the current
  report scope lacks relevant, available analysis artifacts.
- `assets/report_template_analysis.md` as structural guidance when the current
  report scope is grounded in relevant, available analysis artifacts.
- `assets/report_html_layout_template.html` as the required final HTML shell for
  approved report output.

Use the Markdown templates as section logic, not output targets or fixed prose.
Omit sections that are irrelevant to the approved scope, but preserve the causal
boundary, evidence status, limitations, and next-decision logic. Build the
approved report directly in the HTML shell, including required figures, tables,
callouts, audience-facing evidence sources, and limitations when supported by
state and artifacts.

## Causal Report Writing Logic

Before preparing scope or output, read the report-relevant parts of the full
project record, especially `project_summary`, `data_facts`, `domain_knowledge`,
`causal_facts`, `discovery_sidecar`, `council_chamber.causal_discovery`,
`artifact_records`, and `report_assembly`.
Exclude any artifact that the controller reports as unavailable; do not infer a
replacement from nearby output files.

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
- Use `assets/report_template_planning.md` when the current scope lacks
  relevant, available analysis artifacts; otherwise use
  `assets/report_template_analysis.md`.
- Inspect `artifact_records`, `project_summary`, `report_assembly`,
  `discovery_sidecar`, `council_chamber.causal_discovery`, route-owned
  summaries, and available files explicitly referenced by artifact records or
  the persisted assignment before proposing the report scope.
- Write a compact `report_assembly.planned_structure` list that names the
  envisioned sections and what each section would do. Keep each entry short and
  approval-oriented, not drafted prose.
- Submit the route-owned scope and chamber fields described below, including a
  compact inventory of finished artifacts the report would use, omit, or
  disclose and 0-3 questions for `team_lead`.
- Set `scope_transition: new` for a new independent scope, `revise` for a
  material change, or `preserve` when identity and revision remain valid. The
  controller assigns `scope_id` and initializes, increments, or preserves
  `scope_revision` accordingly.
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
- `draft_notes`

In report scope setup, keep in `draft_notes` a compact internal
finished-artifact inventory: what artifacts exist, what each contributes to the
proposed report, and which expected report pieces are missing, omitted, or only
suitable as limitations. Translate that provenance into audience-facing
evidence descriptions rather than copying it into the rendered report.

Submit chamber feedback only under `updates.council_chamber.report_writer`.

Set:

- `current_status`: report scope status only.
- `summary`: one compact description of the report scope, produced output, or
  blocker.
- `questions_for_user`: 0-3 questions, choices, or approval points for
  `team_lead` to surface.
- `feedback_to_route`: 0-2 handoffs when another member should review something
  before report output.

Normal worker handoffs use `ready`, `blocked`, or `done`. Null or `requested`
is a pre-work or legacy marker; when observed, prepare and submit a completed
scope handoff rather than passing that marker to team lead. Put any blocker
reason in `summary`.

Report writer is a handoff route, not a consulting-opinion route.

Do not update global output status or artifact records directly. Submit report
scope, output facts, and optional completed artifact through `apply`; team lead
handles closeout synthesis through `finish`.

## Report Outputs

When report text, a draft, HTML, or another report artifact is actually
created:

Before marking the handoff `done`, reconcile the rendered output with every
bound-scope commitment, including purpose and audience, evidence basis,
required structure or content, output format, and claim boundary. Repair any
missing or materially substituted item, or return `ready` or `blocked` without
an artifact; never submit `done`.

1. Reserve, write, and validate one meaningful temporary report file or
   directory through `references/artifact_output_policy.md`; pooled reports
   never live inside an analysis artifact folder.
2. Set `report_assembly.current_format` to `html` and add one compact draft note
   stating output kind, source basis, whether new analysis was performed,
   inherited causal boundary, limitations, and reserved output location.
3. Submit `scope_transition: preserve`, `current_status: done`, report state,
   and the completed artifact summary through `statectl apply`. Use `report`,
   `revised report`, or `derivative communication artifact` accurately. Use
   "conversion" only for a literal format conversion that does not change
   content.

Do not reserve or submit an artifact for purely verbal report-scope setup.

An analysis-specific note or analysis report may live in an analysis artifact
folder only when it is part of the analysis output and recorded as
`route: analysis_execution`. A pooled report produced by `report_writer` should
be recorded as `route: report_writer` and saved outside analysis-specific
artifact folders.
