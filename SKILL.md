---
name: causal-consultant
description: Explicit-use interactive causal consulting team. Use only when the user explicitly asks to use causal-consultant, the causal consultant skill/team, or an interactive persistent causal-consultant workflow for project intake, data audit, domain expertise, causal discovery, causal checking, report writing, methods/results interpretation, reviewer-response support, or project state tracking.
---

# Causal Consultant Router

This file is only the turn router. Scientific work belongs to the selected route;
manager synthesis and the only user-facing response belong to
`references/team_lead.md`. Resolve this skill's directory and use
`<skill-root>/scripts/statectl.cjs` for every state operation; never edit
`project_state.yaml` directly.

Only `analysis_execution` may prepare or revise an analysis scope. A target
result is any new quantity, comparison, model-fit result, or test intended as
an answer to an `analysis_execution` target or a refinement of it. Only an
`analysis_execution` operation bound to an exact ready scope may compute one.
Calling a result a diagnostic does not change this classification. Other routes
may inspect inputs, assess route-owned readiness with input- or design-feasibility
diagnostics, run only their expressly allowed non-target
work, and summarize completed artifacts.

## Turn Protocol

1. Resolve the project root once and keep it for the turn: use an explicit root
   first, then `CLAUDE_PROJECT_DIR` or `CODEX_PROJECT_DIR`; otherwise use the
   nearest ancestor of the current working directory that contains
   `project_state.yaml`, falling back to the current directory for a new state.
2. Check only the current user message for an explicit fresh-state request such
   as "start fresh", "reset this project", or "save old state and create new".
   Run `node <skill-root>/scripts/statectl.cjs open --project-root <root> --fresh`
   only for that explicit request; vague confirmation such as "yes", "ok", or
   "go ahead" is never a reset. Only explicit `--fresh` may archive and replace
   an active operation; otherwise omit `--fresh`.
3. On successful `open`, read its structured result, including any
   `operation_packet`, and then read the validated state at the returned
   `state_path`. On a controller error, load team lead
   only in preflight-failure mode to explain the exact recovery boundary; do
   not repair, replace, or bypass rejected state manually.
   For `LEGACY_ACTIVE_PLAN`, an explicit user choice to abandon only the old
   transient plan may be carried out with `open --discard-legacy-plan`; this
   archives the original and preserves its durable v4.5 evidence. Use
   `--fresh` instead only when the user explicitly wants a new project.
4. Resume before routing; `open.mode` and the persisted active stage take
   precedence over the result code:
   - explicit cancellation of the persisted operation: load team lead only and
     use `finish --cancel`; preserve durable state and unrecorded files.
   - `worker_pending`: load only the persisted worker assignment and run it from
     the route boundary.
   - `lead_pending`: load `references/team_lead.md` and finish the persisted
     operation.
   - idle: route, including after creation, migration, or reset.
   Apart from explicit fresh reset, materially new input neither replaces nor
   queues active work. Finish it first; new work is outside its assignment.
   Persisted `intent_summary`, route, and `scope_ref` remain authoritative;
   do not expand them on resume. At `worker_pending`, only a non-null `scope_ref`
   for analysis or report work records exact scope approval. A discovery
   `scope_ref` binds an exact discovery contract and is never approval
   evidence. At `lead_pending`, a `scope_ref` identifies the resulting scope
   handoff; use the planned route's authoritative state and required evidence
   for closeout.
5. For a new operation, read `references/route_index.yaml` and
   `references/route_selection_workflow.md`. Infer one dominant intention and
   prepare exactly one allowed assignment. Call `statectl begin` with a JSON
   payload; the controller constructs and commits `next_step_plan`. Do not load
   a worker until `begin` succeeds.
   After this skill is explicitly activated, even synthesis, clarification,
   thanks, or no-state-change replies use a team-lead operation; never answer
   directly because no durable update appears necessary.
6. If the plan has a non-`team_lead` route, load that route reference. For
   `analysis_execution.<design_id>`, load the matching design reference and its
   optional support reference; there is no separate analysis-execution route
   file. The worker submits one owner-scoped JSON update through `statectl apply`
   and never speaks to the user.
7. If the worker will create durable output, follow
   `references/artifact_output_policy.md`: reserve the location before writing,
   write and validate only the returned temporary path, then submit the artifact
   payload required by the `operation_packet`. The controller publishes
   and records it.
8. At `lead_pending`, load `references/team_lead.md` exactly once. Team lead
   submits its semantic summary and structured presentation through
   `statectl finish`, which derives aggregates, stores options, and renders.
9. Each assistant turn handles at most one operation, whether newly begun or
   resumed. A rejected `begin` may be corrected or rerouted only before any
   `begin` succeeds. Once one succeeds, that operation consumes the turn. After
   `finish` succeeds, follow `references/team_lead.md`'s Final Delivery rule
   and stop. Do not run `open` or `begin` again until a new user message.
   The sole exception is a read-only preflight-failure response when no
   operation can be opened. An ordinary validation rejection from
   `reserve-artifact`, `apply`, or `finish` leaves the operation at its persisted
   stage; correct and retry
   it, or cancel only after an explicit user request. On any project, revision,
   operation, or stage mismatch, or when mutation JSON is missing or unusable,
   run `open` once and follow the persisted stage. Retry the same mutation only
   when project, revision, operation, and stage are unchanged. If this follows
   `finish` and the project is now idle at the next revision, treat it as
   committed, emit `response_receipt.response_markdown` exactly, and stop. This
   receipt recovery applies only to finish uncertainty in the same logical
   turn; on a later user turn, route normally and do not automatically replay
   an earlier receipt.

## Controller Inputs

Run input-bearing mutations (`begin`, `reserve-artifact`, `apply`, and
`finish`) as:

```text
node <skill-root>/scripts/statectl.cjs <command> --project-root <root> --input <json-file|->
```

Every input includes `expected_project_id` and `expected_revision` from the
latest successful controller result. Command-specific fields are:

- `begin`: either `selection: {decision_id, option_number}` for the pending
  decision, or a normal `route`, `intent_summary`, optional `support`, and
  optional exact analysis, report, or discovery `scope_ref`.
- `reserve-artifact`: `operation_id`, `kind` (`file` or `directory`), `slug`,
  and `extension` when `kind` is `file`; omit `extension` for a directory. An
  unbound discovery run also supplies
  `discovery_scope: {transition, contract}` as defined by
  `references/causal_discovery.md`.
- `apply`: `operation_id`, `actor`, owner-scoped `updates`, and optional
  `artifact` as defined by `references/artifact_output_policy.md`. Analysis and
  report workers must also supply `scope_transition` (`new`, `revise`, or
  `preserve`). An unbound
  discovery scope-only or blocked handoff may instead supply
  `discovery_scope` only when no artifact is reserved; it never accompanies
  `artifact`. Other workers omit both fields.
- `finish`: `operation_id`, optional semantic
  `updates: {project_summary: {...}}`, and `team_lead.md`'s structured
  `presentation`; add `--cancel` only after explicit cancellation and omit updates.

Patch maps merge recursively; each supplied array replaces the complete array,
`null` is explicit, and omitted fields remain unchanged.
When current evidence supersedes route-owned content, replace affected arrays
and clear obsolete values with `null` or `[]` instead of omitting them.

Use `node <skill-root>/scripts/statectl.cjs validate --project-root <root>` for
read-only validation. Keep routing, reference loading, controller calls, and
route work silent unless a real blocker or permission issue prevents completion.
