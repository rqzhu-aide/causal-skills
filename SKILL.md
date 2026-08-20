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

## Phase Context

For `open`, `begin`, `reserve-artifact`, and `apply`, prefer context protocol
`phase-capsule-v1`. Each full `phase_capsule` contains the phase-specific
`turn_context`, `operation_packet`, `required_references`, and
`completion_command`.
References to `turn_context` elsewhere in this skill mean its capsule field; the
legacy standalone field has the same meaning in compatibility mode.

When the host supports isolated model invocations, run router, worker, and team
lead as fresh phases, each still governed by this `SKILL.md`. Give each phase
its full capsule, returned references, and the user message for the current
assistant turn. Do not preload prior transcript, model reasoning, or tool
output. Within the assistant turn that begins an operation, its user message may
add worker and lead nuance; persisted intent, packet, and frozen scope still
control the assignment. On a later resumed turn, the newer message is not
execution nuance; handle it only under Turn Protocol step 5.

Each isolated invocation normally executes only its named phase and
`completion_command`, then returns the compact `context_ref` to the
orchestrator, or the controller-rendered response after `finish`. A worker may
first call `reserve-artifact` and reload its refreshed capsule. Explicit
cancellation overrides the named phase and `completion_command`: do not run or
resume worker work; load `references/team_lead.md` and follow the current-stage
cancellation rule.
No isolated phase reroutes or launches another phase.

If isolated invocations are unavailable, use the same full capsules in one
session. If the protocol is unavailable, use the standalone `turn_context`;
workflow, gates, and ownership do not change. `open` is the recovery and resume
boundary. A receiving phase resolves `context_ref.path` under the project root
and requires matching protocol and a `context_id` derived from the capsule
content; otherwise regenerate it with `open --context-file`.

Read `<project-root>/project_state.yaml` only when relevant detail or an exact
finish-recovery receipt is genuinely omitted; this is a read-only fallback,
not a routine step. If an `operation_packet_ref` is returned but its matching
full packet is unavailable, run `open` once to recover it.

Here, **load** means ensure a returned reference is available in the current
phase. Reuse an unchanged reference only within the same invocation. Load only
`required_references`, conditional references expressly required by a loaded
active reference, and `references/team_lead.md` when explicit cancellation
overrides the capsule. When several are missing, read them in one tool call when
the host permits.

Controller stage, identity, scope, warnings, and next-action fields are
authoritative. Capsules are derived from committed state and are never another
state store.

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
   session after the immediately preceding successful `finish` for the same
   project root: an unambiguous selection or direct continuation of that exact
   response may call `begin` with the returned project ID and revision, without
   rereading state or unchanged references. In capsule mode, use
   `--context-file` so `begin` writes the full next-phase capsule. Do not
   use this path for reset, cancellation, a new topic, ambiguous wording,
   uncertain session continuity, or any missing prior result. A rejected
   fast-path `begin` changes nothing; run `open` once and follow its committed
   stage.
4. On successful `open`, follow the active `turn_context.stage` before
   considering the new request:
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
   assignment. A newer message is not execution nuance: it may authorize
   cancellation or be acknowledged by team lead after closeout, but it cannot
   replace, expand, or queue the active operation. At `worker_pending`, an
   analysis or report `scope_ref` records exact approval; a discovery reference
   binds a contract but is not approval evidence.
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
   committed lead phase context, submits its semantic summary and presentation
   through `statectl finish`, and emits only the controller-rendered response.
   Do not reread the full YAML unless the current answer needs relevant detail
   omitted from the lead context.
10. Each assistant turn handles at most one operation. Once `begin` succeeds,
    that operation consumes the turn. After `finish` succeeds, emit the rendered
    response and stop; do not open or begin again until a new user message. The
    sole no-operation exception is a read-only preflight-failure response.

For an ordinary `reserve-artifact`, `apply`, or `finish` rejection, correct and
retry the same stage, or cancel only after explicit authorization. On project,
revision, operation, stage, context, or unusable-input errors, run `open` once
and follow committed state.
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

For `open`, `begin`, `reserve-artifact`, or `apply` that hands work to a
fresh phase, prefer `--context-file`. The controller writes the full capsule to
`.statectl-tmp/phase-context.json` and returns only its compact `context_ref`;
give that reference to the next invocation. The file is consumable only when
the same command returned its matching reference.

If context-file preflight fails, retry that unchanged call with
`--context-protocol phase-capsule-v1`. If a successful `open`, `begin`,
`reserve-artifact`, or `apply` instead has `delivery_warnings`, the command
has already succeeded and any mutation is committed: ignore the stale file, use
its returned full capsule, and never repeat the mutation. Use the inline
protocol whenever file delivery or fresh invocations are unavailable. A
successful `finish` with a context-file cleanup warning remains closed; emit
its `response_markdown`.

Use the expected project ID and revision from the current result. `begin` uses
an exact pending `selection` or normal `route`, compact `intent_summary`,
optional `support`, and any required scope reference. When an artifact-capable
assignment already authorizes output and its kind, slug, and, for a file,
extension are known, `begin` may add `artifact_reservation` with those
fields and reserve atomically. Otherwise let the worker call
`reserve-artifact`. A new or revised discovery run must use that later call so
its contract is frozen with the reservation. Later calls use these compact
envelopes:

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
