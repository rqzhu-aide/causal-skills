---
name: causal-consultant
description: Explicit-use interactive causal consulting team. Use only when the user explicitly asks to use causal-consultant, the causal consultant skill/team, or an interactive persistent causal-consultant workflow for project intake, data audit, domain expertise, causal discovery, causal checking, report writing, methods/results interpretation, reviewer-response support, or project state tracking.
---

# Causal Consultant Router

This file is only the turn router. Scientific work belongs to the selected route;
manager synthesis and the only user-facing response belong to
`references/team_lead.md`. Resolve this skill's own directory and use
`<skill-root>/scripts/statectl.cjs` for every
`project_state.yaml` operation. Never edit that file directly.

## Turn Protocol

1. Resolve the project root once and keep it for the turn: use an explicit root
   first, then `CLAUDE_PROJECT_DIR` or `CODEX_PROJECT_DIR`; otherwise use the
   nearest ancestor of the current working directory that contains
   `project_state.yaml`, falling back to the current directory for a new state.
2. Check only the current user message for an explicit fresh-state request such
   as "start fresh", "reset this project", or "save old state and create new".
   Run `node <skill-root>/scripts/statectl.cjs open --project-root <root> --fresh`
   only for that explicit request; vague confirmation such as "yes", "ok", or
   "go ahead" is never a reset. Otherwise run the same command without
   `--fresh`.
3. Read the structured result and the validated state. On a controller error,
   load team lead only in preflight-failure mode to explain the exact recovery
   boundary; do not repair, replace, or bypass rejected state manually.
   For `LEGACY_ACTIVE_PLAN`, an explicit user choice to abandon only the old
   transient plan may be carried out with `open --discard-legacy-plan`; this
   archives the original and preserves its durable v4.5 evidence. Use
   `--fresh` instead only when the user explicitly wants a new project.
4. Resume before routing:
   - explicit cancellation of the persisted operation: load team lead only and
     use `finish --cancel`; preserve durable state and unrecorded files.
   - `worker_pending`: load only the persisted worker assignment and run it from
     the route boundary.
   - `lead_pending`: load `references/team_lead.md` and finish the persisted
     operation.
   - idle, created, migrated, or reset: continue to route selection.
   A materially new message does not replace or queue an active operation.
   Finish the persisted operation first; team lead acknowledges the new request
   as the next operation. During resume, the persisted self-contained
   `intent_summary`, route, and `scope_ref` are authoritative; do not expand
   them from the new message. A non-null `scope_ref` records the approval result
   selected at `begin`; the worker does not reinterpret approval, but still
   rechecks the live gates relevant to its route.
5. For a new operation, read `references/route_index.yaml` and
   `references/route_selection_workflow.md`. Infer one dominant intention and
   prepare exactly one allowed assignment. Call `statectl begin` with a JSON
   payload; the controller constructs and commits `next_step_plan`. Do not load
   a worker until `begin` succeeds.
6. If the plan has a non-`team_lead` route, load that route reference. For
   `analysis_execution.<design_id>`, load the matching design reference and its
   optional support reference; there is no separate analysis-execution route
   file. The worker submits one owner-scoped JSON update through `statectl apply`
   and never speaks to the user.
7. If the worker will create durable output, follow
   `references/artifact_output_policy.md`: reserve the location before writing,
   complete and validate the output plus manifest, then include the completion
   in `statectl apply`.
8. Load `references/team_lead.md` exactly once after the operation reaches
   `lead_pending`. Team lead submits only its semantic `project_summary` update
   through `statectl finish`; normal finish derives aggregate flags.
9. Produce the normal user-facing answer only after `finish` succeeds. The sole
   exception is a read-only preflight-failure response when no operation can be
   opened. A rejected mutation leaves the operation resumable; reload state,
   correct the payload, and retry instead of claiming completion.

## Controller Inputs

Run mutating commands as:

```text
node <skill-root>/scripts/statectl.cjs <command> --project-root <root> --input <json-file|->
```

Every input includes `expected_project_id` and `expected_revision` from the
latest successful controller result. Command-specific fields are:

- `begin`: `route`, optional `support`, compact self-contained `intent_summary`,
  and optional exact `scope_ref`.
- `reserve-artifact`: `operation_id`, `kind` (`file` or `directory`), `slug`,
  and optional file `extension`.
- `apply`: `operation_id`, `actor`, owner-scoped `updates`, optional
  `scope_transition` (`new`, `revise`, or `preserve`), and optional completed
  `artifact: {summary}`.
- `finish`: `operation_id` and optional team-lead-owned semantic
  `updates: {project_summary: {...}}`; add `--cancel` only after explicit user
  cancellation.

Patch maps merge recursively; each supplied array replaces the complete array,
`null` is explicit, and omitted fields remain unchanged.
When current evidence supersedes route-owned content, replace affected arrays
and clear obsolete values with `null` or `[]` instead of omitting them.

Use `node <skill-root>/scripts/statectl.cjs validate --project-root <root>` for
read-only validation. Keep routing, reference loading, controller calls, and
route work silent unless a real blocker or permission issue prevents
completion.
