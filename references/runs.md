# Contained work with durable files

Read this only when saving audit artifacts, running analysis or discovery, or
writing a durable report. A no-output inspection can record file evidence and
its limitations without a run. The helper protects managed paths and records
provenance; it is not a process sandbox or a scientific readiness judge.

## Start before target computation

Use `start-run` with a new run ID, the current project/event identities, and a
plan. Keep the user's target and claim boundary explicit. The helper snapshots
local file inputs, records their original identities and hashes, freezes the
plan, and commits the start before returning the run path. Compute from the
returned input snapshots, not a moving external source.

All plans contain `kind`, `objective`, `claim_boundary`, and `inputs`. Each
input has `source_ref` and a local file `path`, with an optional expected
`sha256`. Relative input paths are relative to the selected project root;
absolute external inputs are read-only. Their contents are copied into the run.

| Kind | Additional fields |
|---|---|
| `audit` | `question`, `diagnostics` |
| `analysis` | `target`, `population`, `treatment`, `comparator`, `outcome`, `timing`, `estimand`, `design_id`, `estimator`, `exclusions`, `diagnostics` |
| `discovery` | `variables`, `method`, `diagnostics` |
| `report` | `purpose`, `evidence_refs`, `format` |

With helpers `7.0.0-rc.3` or newer, an analysis may add
`additional_design_ids`: distinct standard design IDs, excluding its primary
`design_id` and `custom_identification`. Custom or composed analysis requires
`identification_basis: {argument, assumptions, source_refs}`: nonempty text,
a nonempty string array and a nonempty source-locator array respectively.
The worker checks these guides against the assignment for this execution.

Requested preparation is an `audit` plan with nonempty `transformations` and
`diagnostics` string arrays. Freeze join, eligibility and timing rules before
producing the derived table. Use a preparation-only claim boundary, with no
causal design or artificial effect estimand. Finalization needs saved executable
code/configuration, a derived output, diagnostics and environment/execution
evidence. An ordinary audit without `transformations` is unchanged.

Diagnostics, exclusions, variables, and evidence references are lists. Other
scientific fields are text. A report cites known evidence IDs; its plan freezes
their recorded source identities, including completed-run manifest identities
when applicable. Give each corresponding input the evidence's exact
`source_ref`. For file or legacy evidence with a recorded hash, every report
input with that reference must match it. To use changed bytes, first review and
record new or corrected evidence; do not pair an old finding with a new file
version. An absent hash or corresponding input remains a recorded evidence
limitation, not newly verified source bytes. Report prose must not turn legacy
or external findings into verified new computations. A descriptive analysis uses
`descriptive_association` and does not claim causal identification.

Start input example:

```json
{
  "event_id": "event-audit-start",
  "expected_project_id": "project-study",
  "expected_last_event_id": "event-checkpoint",
  "run_id": "run-audit-1",
  "plan": {
    "kind": "audit",
    "objective": "Inspect panel coverage and timing",
    "claim_boundary": "Data structure only; no effect estimate",
    "inputs": [{"source_ref": "data/panel.csv", "path": "data/panel.csv"}],
    "question": "Does each district have usable pre-policy observations?",
    "diagnostics": ["Check identifier uniqueness and observation coverage"]
  }
}
```

## Work inside the run

Save code, configuration, diagnostics, and outputs beneath the returned
`runs/<run_id>/` path. `write-run-file` accepts the current project/event
identities, `run_id`, a run-relative `path`, and text `content`. Frozen plans,
input snapshots, and manifests are not editable through this helper. Do not
send an `event_id` for a managed file write. Existing identical bytes are a safe
retry; changed content requires a new filename, preserving the earlier file.
Do not overwrite a completed run. Put revisions in a new run, normally with
`parent_run_id` pointing to the earlier run.

The host's execution tools must keep generated files inside the run and avoid
modifying source inputs. Saving code beside an output does not prove that the
code produced it. Preserve actual commands, execution output, runtime versions,
and failures as evidence when computing; do not describe an unexecuted script
as reproduced analysis.

Give rerun instructions that use the saved code and input snapshots in a fresh
contained run or output directory. If the code writes relative to its own
directory, copy it and its required inputs into that fresh directory first.
Preserve the completed run; a command that tries to recreate its existing
outputs is not a usable rerun instruction. A rerun saved as a new computation
needs its own plan and run.

## Finalize and report honestly

`finalize-run` takes the current event/project identities, `run_id`,
`code_paths`, `output_paths`, `diagnostic_paths`, an `environment` object, and
`deviations`. These paths are relative to the run. Include executable code or
configuration for computations, the reported outputs, and required diagnostics.
Each deviation states `description`, `reason`, and `timing` as `pre_result` or
`post_result`. Never disguise a post-result choice as a prespecified decision.

Finalization verifies the frozen plan and snapshots, checks source drift,
inventories the run, writes the immutable manifest, and commits completion.
Missing files or drift are errors, not reasons to silently replace the plan.
Use `fail-run` or `abandon-run` with a reason when work cannot or should not
finish. A started run remains visibly incomplete until a terminal event commits.

Record a saved new computation as evidence with `kind: "computed"`, its
completed `run_id`, and `source_ref: "runs/<run_id>/<manifested-output>"`.
The reference must identify a manifested output or diagnostic with matching
content.

`verify` is read-only. It reports missing or altered content, unexpected files,
linked paths, incomplete runs, orphan directories, and a stale projection. It
does not fix content or infer completion from files. The default
`verify --source-check originals` also checks original external source paths.
For an offline or relocated archive, explicitly use
`verify --source-check snapshots`: it checks the journal, frozen plans, input
snapshots, manifested artifacts and bound evidence, but not the original
external paths. The response labels this choice in `source_check`; snapshot
verification does not establish that original sources are still available or
unchanged. Keep existing plans and hashes intact when moving an archive.
Finalization still checks original sources; this read-only option cannot bypass
completion checks.

A committed event followed by failed projection replacement is still committed:
retry the same event ID
or recover the projection without repeating the computation. If files exist
without the intended commit, inspect the orphan attempt and start with a new
run ID; do not adopt arbitrary existing files as a completed run.
