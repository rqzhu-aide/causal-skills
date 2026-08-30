# Analysis Report Template

Use when the current report scope has a nonempty, fully available
`report_assembly.analysis_artifact_ids` binding.

Use only the analysis artifacts named by that binding; unrelated historical
analysis records are not report evidence.

This report is for results, interpretation, and decision support. Empirical
results and diagnostics must come only from the bound, available analysis
artifacts. Route-owned state may add framing and claim boundaries, but not
additional target results.

Use this file as section scaffolding. `references/report_writer.md` owns what
state to read, how to choose causal wording, how to use artifacts, and where the
claim boundary belongs.

## Writing Logic

Move through this argument:

`causal question -> analysis target -> design/method fit -> decisive evidence -> diagnostics -> interpretation -> boundary`

Before drafting, identify the main evidence ladder. A strong analysis report should not be only a result note; it should show why the result is interpretable, what supports it, and where the claim stops.

Use claim-first section openings. Each section should start with its message, then give the evidence, diagnostic, or limitation that supports that message.

## From State To Report Prose

Use the source-reading and wording rules in `references/report_writer.md`.
Treat `project_state.yaml`, `artifact_records`, route-owned summaries, and
`council_chamber` feedback as source notes, not as final prose.

When source notes are brief, expand them into manuscript-style paragraphs that explain:

- what was found or created
- why it matters for the analysis target
- how strongly the evidence supports interpretation
- what limitation or next action follows

Do not merely restate YAML bullets or expose route IDs, operation IDs, state-field names, or filesystem paths. Include technical provenance only when the approved scope explicitly requests it. If an artifact summary is too thin to support a report sentence, name the missing detail as a limitation rather than inventing context.

## Title

[Concrete project object] + [analysis target] + [main evidence or boundary]

## At A Glance

Open with a compact summary paragraph that moves from the causal question to the strongest supported answer.

Include:

- the causal question
- the evidence status
- the main result or pattern
- the claim boundary
- the most important limitation
- the recommended next decision

If there is a quantitative result, include the most decision-relevant number or comparison. If the result is limited, make the limitation visible in the same paragraph.

## Main Answer And Evidence Status

State the answer the report supports.

Use calibrated language: causal, qualified causal, association-only, descriptive, exploratory, or limited. Explain why that label fits the completed checks and analysis outputs.

Avoid a broad conclusion before the reader sees the evidence basis. Name the decisive evidence and the main unresolved weakness.

## Original Question And Refined Causal Question

Show how the user's original question was translated into the analysis target.

Name the population, treatment or exposure, comparison, outcome, timing, and decision context. Note any user-approved narrowing.

This section should explain why the refined question is more analyzable than the original wording.

## Causal Estimand And Target

State the estimand or analysis target.

Include a compact formula only if it clarifies the report. Define all symbols and translate the formula into plain language.

Explain what the target includes, what it excludes, and what claim would be too strong for this target.

## Data Reality And Provenance

Summarize the data used for the report.

Cover:

- unit of analysis
- sample and inclusion or exclusion logic
- exposure and outcome fields
- timing and repeated measures
- missingness and support
- dependencies, clustering, or leakage concerns
- data audit limitations

Make the data section argumentative: state how the data structure supports or weakens the analysis target.

## Method Rationale, Alternatives, And Pitfalls

Explain why the selected design and support method were appropriate for the available data and question.

Also state what alternatives were considered, why they were not used, and what would be needed to use them later.

Use the pattern: design challenge, selected route, why it works here, what it cannot fix.

## Results, Figures, And Tables

Present the main results.

Start from the core conclusion, then choose the minimum displays that make the conclusion clear and defensible.

For each result, include:

- the display or table location
- the question it answers
- the estimate, contrast, pattern, or diagnostic finding
- the interpretation
- the limitation or caution attached to it

Avoid table-only reporting. Each display needs a short explanation of what it contributes to the causal argument.

Each table or figure should answer one question. If it does not change interpretation, move it to the appendix or omit it.

For figures, keep the hierarchy visible:

- primary evidence gets the clearest or largest display
- validation, controls, robustness, and sensitivity displays should be visually and narratively quieter
- repeated legends should be avoided when a shared legend or direct labels would read better
- colors, labels, and condition names should stay consistent across panels

Each caption or display note should state the question, data source, encoding, main takeaway, and limitation. For quantitative displays, name the sample size or comparison basis when available.

## Diagnostics, Sensitivity, And Robustness

Summarize the diagnostics that affect trust in the result.

Cover the diagnostics required by the selected design, the target, and the data audit. State which diagnostics passed, were limited, were not run, or should be treated as exploratory.

Arrange diagnostics as an evidence ladder: design validity, data support, model or estimator behavior, sensitivity, and remaining failure modes.

## Causal Boundary And What Not To Claim

State the strongest claim the evidence supports.

Then state what should not be claimed, including unsupported causality, mechanism, subgroup, prediction, policy, transportability, or external-validity claims.

This section should protect the report from overstating what the analysis can prove.

## Interpretation And Next Decisions

Explain what the result means for the user's decision.

Separate scientific interpretation, statistical uncertainty, practical relevance, and recommended next work.

Do not restate every result. Select the evidence that changes the decision or interpretation.

## Evidence Sources And Limitations

Describe the evidence used for the report in terms meaningful to its audience:

- the data, analysis, or other source supporting each main claim
- what each source contributes to the report
- important availability, measurement, or interpretation limitations
- material deviations, substitutions, or missing evidence

Keep internal identifiers, state fields, manifests, and filesystem locations in the project record unless the approved scope calls for a technical reproducibility appendix.

## Appendix Notes

Use this section for compact details that should not interrupt the main argument: extra diagnostics, sensitivity notes, source notes, variable role notes, or parked analysis ideas.

## Paragraph Quality Check

Before finalizing, check:

- each section has one explicit message
- each paragraph opens with the point it makes
- evidence supports the paragraph message rather than merely appearing nearby
- result interpretation is separated from claim boundary
- terminology is consistent across question, target, method, diagnostics, and conclusion
- the conclusion names the main evidence, implication, limitation, and next work without introducing new claims
