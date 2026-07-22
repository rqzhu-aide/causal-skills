# Planning Report Template

Use when the current report scope lacks relevant, available analysis artifacts.

This report is for planning, framing, and decision support. It must not describe completed analysis results, estimates, diagnostics, or empirical findings that do not exist inside the causal-consultant workflow.

Use this file as section scaffolding. `references/report_writer.md` owns what
state to read, how to choose causal wording, how to use artifacts, and where the
claim boundary belongs.

## Writing Logic

Move through this argument:

`decision context -> unresolved causal/data bottleneck -> candidate target/design -> missing evidence -> recommended next move -> boundary`

Before drafting, identify the missing link. Do not write around it. Make the missing link visible and turn it into the next decision for the user.

Use claim-first section openings. Each section should start with the message it contributes to the planning decision, then explain the evidence or uncertainty behind that message.

## From State To Report Prose

Use the source-reading and wording rules in `references/report_writer.md`.
Treat `project_state.yaml`, `artifact_records`, route-owned summaries, and
`council_chamber` feedback as source notes, not as final prose.

When state entries are brief, expand them into manuscript-style paragraphs that explain:

- what the state note means
- why it matters for the causal planning decision
- what boundary or next action follows

Do not merely restate YAML bullets or expose route IDs, operation IDs, state-field names, or filesystem paths. Include technical provenance only when the approved scope explicitly requests it. If a state note is too thin to support a report sentence, name the missing detail as a limitation or open question instead of padding.

## Title

[Concrete project object] + [causal decision or planning task] + [current boundary]

## Front Summary

Write a short opening paragraph that moves from broad context to the exact planning bottleneck:

- decision context
- user's causal question or decision problem
- exact unresolved issue
- current planning conclusion
- reason analysis is not ready yet
- next user decision

Keep the summary concrete. If there is no data, say so early.

## Planning Boundary And Recommendation

State what can be said now and what cannot yet be claimed.

Use this movement:

- what is already clear
- what is plausible but not checked
- what cannot be claimed yet
- the recommended next move

Avoid broad promises. End the section with a bounded recommendation.

## Causal Question And Decision Context

Translate the original user question into a refined causal question.

Include the target population, exposure or intervention, comparison, outcome, timing, and decision context when known. If any piece is missing, name it plainly.

Explain why the missing or uncertain pieces matter for the analysis decision.

## Candidate Estimand Or Target Sketch

State the candidate target in plain language first.

If useful, include a compact formula or target notation. Define every symbol. Explain what the target would mean if the required data and assumptions were available.

Do not let notation substitute for interpretation. The reader should understand the comparison and claim boundary without the formula.

## Causal Structure And Assumptions

Summarize the current causal story as a working hypothesis, not as a validated graph.

Cover:

- likely treatment or exposure timing
- outcome timing
- candidate confounders or design features
- variables that should not be adjusted for
- assumptions that need review by `causal_check`

Name the assumption or timing issue that most affects whether analysis can proceed.

## Data, Measurement, And Provenance Needed Next

State the minimum data facts needed before analysis can be authorized.

Cover structure, timing, missingness, support or overlap, measurement validity, dependencies, and leakage risks when relevant.

Explain how each missing data fact changes the possible claim, not just that it is missing.

## Candidate Method Paths

Describe the most plausible analysis paths without choosing a final method prematurely.

For each path, explain:

- what it would estimate or clarify
- why it might work for this causal question
- what data facts it requires
- what diagnostics would be needed
- what could make it invalid or limited

Use the pattern: challenge, proposed route, required evidence, boundary.

## Potential Figures Or Displays

Suggest only displays that would help the user decide what to do next.

For each proposed figure or table, state:

- the question it would answer
- the evidence or data it would require
- the likely display type
- how it would affect the planning decision
- what limitation would still remain

Do not propose figures as decoration. A planning display should clarify the causal question, data readiness, method choice, or claim boundary.

## Alternatives, Pitfalls, And Parked Ideas

Name ideas that are tempting but not currently justified.

Include causal overclaims, unsupported subgroup claims, timing problems, measurement problems, positivity or support problems, and methods that require stronger data than the project currently has.

Park ideas respectfully. Do not make them sound wrong if they are merely not ready.

## Recommended Path From Planning To Analysis

Give the concrete next step that would move the project toward analysis readiness.

End with one recommended choice and the approval or information needed from the user.

The close should not introduce a new method, claim, or source. It should convert the planning bottleneck into an action.

## Evidence Basis And Open Questions

Summarize the planning basis in terms meaningful to its audience:

- known facts and their sources
- assumptions that still need confirmation
- available evidence and its main limitations
- open questions that block analysis
- the evidence or review needed next

Keep internal identifiers, state fields, manifests, and filesystem locations in the project record unless the approved scope calls for a technical reproducibility appendix.

## Paragraph Quality Check

Before finalizing, check:

- each section has one explicit message
- the first sentence of each paragraph states its job
- missing evidence is tied to a decision consequence
- terminology is consistent across exposure, treatment, outcome, target, design, and claim boundary
- the report does not imply completed empirical results
