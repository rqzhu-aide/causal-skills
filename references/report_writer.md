# Evidence-Bound Reporting

Use `report_writer` / `reporting` for a durable planning or results report,
revision or derivative communication. The task is synthesis, not new estimation.
A sufficiently specified request can be fulfilled in this turn; no separate
approval ritual is required. Clarify only material ambiguity about purpose,
audience, evidence selection or requested claims.

## Evidence Basis

Name the exact source evidence before writing. A results report uses the selected
available results, diagnostics and their governing assumptions. An intentional
planning report describes targets, evidence gaps, strategies and next decisions;
it does not contain a completed target-analysis conclusion. Historical output
somewhere in the project does not make it evidence for this report.

Verify selected v7 runs and their manifested files. For external or legacy results,
preserve exact source identity and recorded verification limits; never present
them as verified v7 computation. A prior report is a presentation source, not
independent empirical evidence. Identify its underlying results where available.

If a selected result, diagnostic or source is unavailable or has drifted, explain
the specific missing evidence and request restoration or an explicit change of
scope. Never silently substitute a nearby artifact, switch between same-design
analyses, omit a load-bearing diagnostic, or downgrade a results report to planning.
Retrieve relevant history when the current summary omits necessary context.

## Structure and Interpretation

Choose sections that answer the user's report question. A planning report normally
needs the decision context and target sketch, known design facts, assumptions,
needed data/measurement/provenance, candidate paths, limitations and one useful
next decision. Keep future figures or analyses clearly proposed, not observed.

A results report normally needs the main answer and evidence status, original
and refined target, estimand/population, data reality/provenance, method rationale,
results and uncertainty, diagnostics/sensitivities, claim boundary, interpretation
and sources. Preserve meaningful alternatives, omitted analyses and limitations.
An appendix can hold technical detail without hiding a load-bearing condition.
These are coverage cues, not mandatory headings or boilerplate.

Use causal wording only under the assumptions the source actually supports.
Association-only evidence stays "association", "difference" or "pattern";
discovery and unvalidated subgroup screens stay exploratory. Words such as
"suggests" do not rescue an unsupported causal claim. For each claim, the
narrowest applicable boundary in project evidence, source run and report purpose
governs. Audience, format and brevity never widen it.

Check explanations of mechanisms and adjustment against the source evidence
for variable roles and timing. A coefficient's sign change does not establish
why it changed or make the adjusted comparison causal. Keep the original
question's unresolved status distinct from completion of a narrower deliverable;
respect explicit user closure without initiating another investigation.

For a decision-bearing quantitative finding, give the estimate, uncertainty,
population and governing assumptions, then explain the same finding in the
study's units and setting. The plain-language rendering must not change the
population, erase assumptions or turn local evidence into a general claim.
For a consequential qualitative limitation, state its technical condition and
ordinary-language consequence without inventing a numerical effect or certainty.

Every figure or table should answer a report question and explain its limitation.
Avoid decorative plots, invented results, unexplained tables and hidden omissions.
Separate observed findings, assumptions, methods and interpretation. Internal
IDs belong in reproducibility detail, not routine reader-facing prose. Preserve
the requested audience, priority and number of recommendations unless the user
changes them.

## Create and Verify

Load [runs.md](runs.md) before creating output. Record a report plan containing
purpose, audience and requested structure in its purpose/objective, exact
`evidence_refs`, claim boundary, input files and output format. Include the
selected source results and diagnostics as hashed inputs, not just a mutable
path mentioned in prose. Use the exact recorded `source_ref` for each
corresponding input. Known file or legacy hashes must match those snapshots;
review and record a new or corrected evidence version before selecting changed
bytes. A missing hash or input is a verification limitation, not proof of a
match. Keep the report in its own run, outside completed analysis runs. A revision
gets a new run with its parent/source relationship.

Honor a requested format when available tools can produce and validate it.
Otherwise disclose the format limitation; do not silently promise a different
file type. If unspecified, standalone HTML is a practical local default. No
publishing, email delivery or upload is implied by a request for a local report.

Read back the output, compare quantitative claims with exact source values and
check that qualifications, omissions and sources survived drafting. For a visual
format, inspect rendering and fix clipping, unreadable tables and broken assets.
If the rendering tool is unavailable, record that limitation rather than claiming
visual validation. Finalize with output paths, environment, validation evidence
and any deviations. Do not label failed rendering or partial files a completed
validated report.

Return one saved review describing the output, source basis, whether any new
analysis occurred (normally none), inherited claim boundary and important limits.
If a new empirical analysis is needed, return that bounded need to the lead;
do not launch or impersonate a design worker in the reporting turn.
