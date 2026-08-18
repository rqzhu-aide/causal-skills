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
may inspect inputs, assess route-owned readiness with input- or
design-feasibility diagnostics, run only their expressly allowed non-target
work, and summarize completed artifacts.

## Runtime Context

Successful stage-entry results from `open`, `begin`, and `apply` provide
validated `turn_context` and `required_references`. Use the context as the
normal state view. Read
`state_path` only when relevant detail or an exact finish-recovery receipt is
genuinely omitted; this is a read-only fallback, not a routine step.

Here, **load** means ensure a reference is available in context. In a continuous
session, reuse an unchanged reference already loaded. Load only missing or
changed files from `required_references` plus conditional references expressly
required by an active routing file. When several are missing, read them in one
tool call when the host permits.

Controller stage, identity, scope, warnings, and next-action fields are
authoritative. Context projections are derived from committed state and are
never another state store.

## Turn Protocol

1. Resolve the project root once and keep it for the turn: use an explicit root
   first, then `CLAUDE_PROJECT_DIR` or `CODEX_PROJECT_DIR`; otherwise use the
   nearest ancestor of the current working directory that contains
   `project_state.yaml`, falling back to the current directory for a new state.
2. Check only the current user message for an explicit fresh-state request such
   as "start fresh", "reset this project", or "save old state and create new".
   Run `statectl open --fresh` only for that request. Vague confirmation such as
   "yes", "ok", or "go ahead" is never reset authorization. Only `--fresh` may
   archive and replace an active operation.
3. Normally start with `statectl open`. One fast path is allowed in a continuous
   session: after the immediately preceding successful `finish` for the same
   project root, an unambiguous selection or direct continuation of that exact
   response may call `begin` with the returned project ID and revision, without
   rereading state or unchanged references. Do not use this path for reset,
   cancellation, a new topic, ambiguous wording, uncertain session continuity,
   or any missing prior result. A rejected fast-path `begin` changes nothing;
   run `open` once and follow its committed stage.
4. On successful `open`, follow `turn_context.stage` before considering the new
   request:
   - explicit cancellation of the persisted operation: load team lead and use
     `finish --cancel`; preserve durable state and unrecorded files;
   - `worker_pending`: resume the persisted worker from its route boundary;
   - `lead_pending`: skip the worker and finish through team lead;
   - idle: perform normal route selection.

   On error, load team lead only in preflight-failure mode and explain the
   recovery boundary; never repair or bypass state manually. For
   `LEGACY_ACTIVE_PLAN`, an explicit choice to abandon only the transient plan
   may use `open --discard-legacy-plan`, preserving durable v4.5 evidence.
5. At an active stage, persisted intent, route, and scope binding remain the
   assignment. A newer message may authorize cancellation and may be
   acknowledged by team lead, but it does not replace, expand, or queue the
   active operation. At `worker_pending`, an analysis or report `scope_ref`
   records exact approval; a discovery reference binds a contract but is not
   approval evidence.
6. For an idle operation, load the controller-required routing references. Infer
   one dominant intention and call `statectl begin` with one allowed assignment.
   Do not load or run the worker before `begin` succeeds. Once this skill is
   explicitly active, synthesis, clarification, thanks, and no-state-change
   replies also use a team-lead operation rather than answering directly.
7. At `worker_pending`, load the returned worker references. The worker performs
   only its persisted assignment, submits one owner-scoped update through
   `statectl apply`, and remains silent. An analysis worker uses its selected
   design reference, the shared design contract, and only its selected support
   reference. If relevant route work requires detail omitted from
   `turn_context`, use the full-state fallback before deciding or acting.
8. When the worker will create durable output, load
   `references/artifact_output_policy.md`, reserve before writing, validate the
   returned temporary output, and submit the required artifact receipt through
   `apply`. Reuse the current operation packet when the controller reports its
   contract unchanged; do not reread or reinterpret the same requirements.
9. At `lead_pending`, load the returned lead references. Team lead uses the
   committed lead context, submits its semantic summary and presentation
   through `statectl finish`, and emits only the controller-rendered response.
   Do not reread the full YAML unless the current answer needs relevant detail
   omitted from the lead context.
10. Each assistant turn handles at most one operation. Once `begin` succeeds,
    that operation consumes the turn. After `finish` succeeds, emit the rendered
    response and stop; do not open or begin again until a new user message. The
    sole no-operation exception is a read-only preflight-failure response.

For an ordinary `reserve-artifact`, `apply`, or `finish` rejection, correct and
retry the same stage, or cancel only after explicit authorization. On project,
revision, operation, stage, or unusable-input errors, run `open` once and
follow committed state.
Retry only while project, revision, operation, and stage still match. If an
uncertain `finish` is followed by an idle `open` at the next revision with a
matching response receipt, use the read-only fallback to verify its operation
and revision, emit that `response_markdown` exactly, and stop. Never replay an
older receipt on a later turn.

A rejected ordinary `begin` may be corrected or rerouted only before any
`begin` succeeds. It never authorizes bypassing controller validation.

## Controller Calls

Pass mutation JSON by file or stdin, never as shell-escaped YAML:

```text
node <skill-root>/scripts/statectl.cjs <command> --project-root <root> --input <json-file|->
```

Use the expected project ID and revision from the current result. `begin` uses
an exact pending `selection` or normal `route`, compact `intent_summary`,
optional `support`, and any required scope reference. Later calls use these
compact envelopes:

- `reserve-artifact`: active `operation_id`, `kind`, `slug`, and file
  `extension` or route-required `discovery_scope` when applicable;
- `apply`: active `operation_id`, exact `actor`, owner-scoped `updates`, and any
  route-required `scope_transition`, `discovery_scope`, or `artifact`;
- `finish`: active `operation_id`, team lead `presentation`, and optional
  `updates: {project_summary: ...}`.

Use `finish --cancel` only after explicit cancellation.

Patch maps merge recursively, supplied arrays replace complete arrays, `null`
is explicit, and omitted fields stay unchanged. When evidence supersedes
route-owned content, replace every affected field and explicitly clear obsolete
values. The controller owns identities, timestamps, artifact records, aggregate
flags, plan transitions, pending decisions, and response rendering.

Use `statectl validate` only for read-only diagnostics. Keep routing, reference
loading, controller calls, and route work silent unless a real blocker or
permission issue prevents completion.
