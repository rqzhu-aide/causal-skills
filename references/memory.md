# Project Memory

Use `<skill-root>/scripts/project.cjs`. `journal.jsonl` is authoritative;
`project.yaml` is a rebuildable JSON-form YAML projection. Never hand-edit either.

```text
node <skill-root>/scripts/project.cjs <command> --project-root <folder>
```

Commands: `init`, `status`, `context`, `history`, `record`. Record requires
`--input <json-file|->`; context accepts it. Init leaves existing v7 intact,
refuses v6. Reads never mutate. Reuse receipt identities; no reread merely for IDs.

## Reading

`context` takes optional `--input`, e.g.
`{"focus_refs":["strategy-a"],"query":"timing","limit":20}`.
Focus IDs must be current. Literal case-insensitive query hits need focused
retrieval for dependencies. Use `status` for broad reassessment/no useful focus;
paging everything repeats roots and can cost more.

Context returns original shapes, understanding/checkpoint, support/opposition,
corrections/dependents and incomplete work, with selection reasons, omissions,
counts and history locators. Same-ID changes expose neighbors without invalidation.
Check omissions and `orphan_run_paths`; missing links/exhausted pages do not
prove sufficiency. Summaries are not full reviews.

For pages, use `coverage.next_cursor` as `cursor`, unchanged focus/query, and
`last_event_id` as `expected_last_event_id`. Limit 1..100, default 20; essential
records can exceed it intact. On `STALE_CONTEXT` restart. Write IDs: context's
`project_id`/`last_event_id`, or status's `project.state_meta`.

`history` returns full events via `--record-id`, `--event-id`, `--type` or `--query`,
with `--cursor`/`--limit` and `next_cursor`. Use it for earlier answers/full reviews,
not a default whole-journal read.

## Record Contract

Request: `event_id`, `expected_project_id`, `expected_last_event_id`,
`type`, `payload`. Internal IDs match `[a-z][a-z0-9_-]{0,79}`.
Use a new event ID and reuse that exact request on an uncertain retry.

| Type | Payload |
|---|---|
| `checkpoint` | `checkpoint`, optional `changes` |
| `memory_updated` | `changes` |
| `review_completed` | `review`, optional `checkpoint`, `changes` |
| `correction` | `corrects_refs` (committed IDs), `reason`, `changes` |

Combine related changes. Collections upsert by ID; **same-ID records replace
completely**, so retain optional fields, references and qualifiers. Omission
leaves other records unchanged; empty arrays do not delete. Only understanding
merges partial fields. References identify existing/same-event records; paths,
URLs and `chat:turn-2` are source locators, not IDs.

### Changes

All listed record fields are required unless marked optional.

| Collection | Record |
|---|---|
| `project_understanding` | Partial strings: `objective`, `intended_use`, `audience`, `causal_target`, `current_claim_boundary`; `materials` source-locator array |
| `questions` | `question_id`, `statement`, `status`: `open`/`answered`/`retired`; `reason` required when closed, optional otherwise; optional `basis_refs` |
| `evidence` | `evidence_id`, `kind`: `user_statement`/`file`/`literature`/`computed`, `source_ref`, `summary`; optional `limitations`, `source_sha256`, `source_excerpt`, `supersedes`, `legacy`, `run_id` |
| `assumptions` | `assumption_id`, `statement`, `status`: `active`/`revised`/`retired`; optional `basis_refs`, `supersedes` |
| `decisions` | `decision_id`, `kind`: `target`/`investigation`/`design`/`execution`/`reporting`/`boundary`, `statement`, `status`: `current`/`superseded`/`withdrawn`; optional `basis_refs`, `user_contribution_refs`, `supersedes` |
| `candidate_routes` | `strategy_id`, `target`, `approach`, `status`, `reason`; optional `design_id`, `additional_design_ids`, `support_ids`, `data_requirements`, `claim_boundary`, `evidence_for`, `evidence_against`, `unmet_requirements`, `reopen_or_promote_when`, `last_review_id` |
| `consultation` | Current/next checkpoint or `null` |

Strategy status: `possible`, `conditional`, `preferred`,
`unsupported_with_current_evidence`, `not_relevant`. Distinct targets,
populations/data routes keep distinct IDs; routine diagnostics do not.

Lists: `limitations`, `data_requirements`, `unmet_requirements` are strings;
`*_refs`, `evidence_for`/`evidence_against` are IDs. Design/support lists use
catalog IDs, not project IDs. Nonempty `additional_design_ids` needs a primary
`design_id`, is unique and excludes that primary and `custom_identification`.
`supersedes` is one same-kind ID; `last_review_id` is one review ID.
`claim_boundary` and `reopen_or_promote_when` are strings.

Attribute qualified user accounts; `source_excerpt` optionally preserves exact
wording, not verification. Small non-target inspections use `file` evidence.
New `computed` evidence requires a completed `run_id` and project-relative
manifested output as `source_ref`; load [runs](runs.md) only for artifacts.
Legacy source evidence uses `legacy: {source_project, source_version, verification}`:
`legacy_unverified` or `reviewed_summary`, never new v7 computations.

### Checkpoint and Review

Checkpoint requires `checkpoint_id`, `status`, `primary_uncertainty`,
`why_it_matters`. Status is `assessing`, `awaiting_user`,
`ready_for_specialist` or `specialist_complete`, a resumption hint not permission.
Optional string arrays: `ways_user_can_help`,
`consultant_led_options_if_unknown`. Optional ID arrays:
`strategy_ids_it_could_change`, `user_contribution_refs`,
`related_unresolved_question_refs`. Optional `selected_assignment`.

Review requires `review_id`, `summary`, `assignment`,
`question_addressed`, `selection_basis`, `work_performed`, `findings`.

- Assignment: `specialist_id`, `operation`. Data audit uses `review`/`prepare`;
  domain `review`; causal check `readiness`/`design_elicitation`; discovery
  `discovery`; design worker `feasibility`/`execution`; report writer
  `reporting`. Design worker also needs `design_id`. Optional
  `additional_design_ids` (design worker only), `support_ids`, `strategy_ids`.
- Selection basis: `checkpoint_id`, nonempty `user_contribution_refs` pointing
  to user-statement evidence. This explains selection, not scientific validity.
- `work_performed`/`findings`: nonempty string arrays. Optional string arrays:
  `limitations`, `noise_or_invalid_information`, `remaining_uncertainty`;
  optional string `suggested_next_uncertainty`; optional ID arrays
  `evidence_refs`, `route_changes`, `assumptions_added_or_revised`.

For a direct request, selection checkpoint, user evidence and completed review
can share one event. `payload.checkpoint` is the selection checkpoint; put a
new question's checkpoint in `changes.consultation`, not the completed review's
selection basis. `consultation: null` clears the checkpoint, not open questions.

## Shared Question Handoff

When useful, the specialist proposes answerable wording, consequence and source
in `remaining_uncertainty` or `suggested_next_uncertainty`. Save material
unresolved proposals as questions with `statement`, `reason`, `basis_refs`.
The lead owns priority/wording and checkpoint `related_unresolved_question_refs`.

On focus change and before concluding, account for relevant open questions:
ask; defer while open with reason and return condition; or close with resolution
and provenance/reason, including unavailable or declined. Do not accidentally
bury user-resolvable issues as limitations; provisional limitations are honest.
Retirement does not establish an assumption.
Use loaded state or expand to status/history when focused context cannot cover
relevant older open questions.

Preserve answer source/qualifiers; update strategies or explain no change.
Corrections require inspecting affected conclusions and recording known
implications together, preserving unaffected facts/history.

## Recovery

Commit before calling work saved; distinguish performed from committed work on
failure. On `STALE_WRITE` read/reconcile, never blindly change the predecessor.
On `PROJECT_LOCKED` retry; do not delete locks. `recover-lock --token` requires
a verifiably dead same-host owner; report unverifiable recovery needs.

`projection_written: false` still committed. Status reconstructs; `recover`
rewrites only the projection. `recover --repair-tail` preserves then removes
uncommitted trailing bytes, not interior corruption. Never repeat a specialist
to recreate a snapshot.
