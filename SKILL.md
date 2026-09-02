---
name: causal-consultant
description: Explicit-use interactive causal consulting team. Use only when the user explicitly asks to use causal-consultant, the causal consultant skill/team, or an interactive persistent causal-consultant workflow for project intake, data audit, domain expertise, causal discovery, causal checking, report writing, methods/results interpretation, reviewer-response support, or project state tracking.
---

# Causal Consultant Router

This file is only the turn router. Scientific work belongs to the selected
route; manager synthesis and the only user-facing response belong to
`references/team_lead.md`. Resolve this skill's directory and use
`<skill-root>/scripts/statectl.cjs` for every state operation; never edit
`project_state.yaml` directly. Runtime use requires Node.js 18 or newer.

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
`phase-capsule-v1` (`--context-protocol phase-capsule-v1`) and consume the
returned capsule inline. Each full `phase_capsule` contains the phase-specific
`turn_context`, `operation_packet`, `required_references`, and
`completion_command`. References to `turn_context` elsewhere in this skill mean
its capsule field; the legacy standalone field has the same meaning in
compatibility mode, and workflow, gates, and ownership do not change with the
transport.

When the host hands phases to fresh isolated model invocations, or any call
uses `--context-file`, load `references/context_transport.md` and follow it.
In short: file mode writes the capsule to `.statectl-tmp/phase-context.json`
and returns a compact `context_ref` for the next fresh invocation; never
create a context file merely to read it back in a continuous session; a
successful result with `delivery_warnings` has already committed, so use its
returned capsule and never repeat the mutation. `open` is the recovery and
resume boundary.

Read `<project-root>/project_state.yaml` only when relevant detail or an exact
finish-recovery receipt is genuinely omitted; this is a read-only fallback,
not a routine step. If an `operation_packet_ref` is returned but its matching
full packet is unavailable, run `open` once to recover it.

Here, **load** means ensure a returned reference is available in the current
phase. Reuse already loaded, unchanged references within the same invocation;
a fresh invocation loads its returned references anew. Load only
`required_references`, conditional references expressly required by a loaded
active reference, and `references/team_lead.md` when explicit cancellation
overrides the capsule. When several are missing, read them in one tool call
when the host permits.

Controller stage, identity, scope, warnings, and next-action fields are
authoritative. Capsules are derived from committed state and are never another
state store.

## Turn Protocol

1. Resolve the project root once and keep it for the turn. Use an explicit root
   first. In Claude Code, then use `CLAUDE_PROJECT_DIR`; otherwise use the
   nearest ancestor of the current working directory that contains
   `project_state.yaml`, falling back to the current directory for a new state.
   In Codex, prefer that nearest state-bearing ancestor. If none exists, use
   `CODEX_PROJECT_DIR` only when it contains the current working directory;
   otherwise use the current directory. This keeps a stale main checkout from
   overriding an active worktree.
2. Check only the current user message for an explicit fresh-state request such
   as "start fresh", "reset this project", or "save old state and create new".
   Run `statectl open --fresh` only for that request. Vague confirmation such as
   "yes", "ok", or "go ahead" is never reset authorization. Only `--fresh` may
   archive and replace an active operation.
3. Normally start with `statectl open`. One fast path is allowed in a continuous
   session after the immediately preceding successful `finish` for the same
   project root: an unambiguous selection or direct continuation of that exact
   response may call `begin` with the returned pending selection or
   `direct_assignment`, project ID, and revision, without rereading state or
   unchanged references. Do not use this path for reset, cancellation, a new
   topic, ambiguous wording, uncertain session continuity, or any missing prior
   result. A rejected fast-path `begin` changes nothing; run `open` once and
   follow its committed stage.
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
   `statectl apply`, and remains silent. If relevant route work requires detail
   omitted from `turn_context`, use the full-state fallback before deciding or
   acting.
8. When the worker will create durable output, follow
   `references/artifact_output_policy.md` (returned when output is already
   authorized; otherwise load it before reserving). Use the reservation
   returned by `begin` when present; otherwise reserve before writing. Validate
   the returned temporary output and submit the required artifact receipt
   through `apply`.
9. At `lead_pending`, load the returned lead references. Team lead uses the
   committed lead phase context, acts on every `turn_context.directives` item,
   submits its semantic summary and presentation through `statectl finish`, and
   emits only the controller-rendered response.
10. Each assistant turn handles at most one operation. Once `begin` succeeds,
    that operation consumes the turn. After `finish` succeeds, emit the rendered
    response and stop; do not open or begin again until a new user message. The
    sole no-operation exception is a read-only preflight-failure response.

For an ordinary `reserve-artifact`, `apply`, or `finish` rejection, correct and
retry the same stage, or cancel only after explicit authorization; retry only
while project, revision, operation, and stage still match. On project,
revision, operation, stage, context, or unusable-input errors, run `open` once
and follow committed state. A rejected ordinary `begin` may be corrected or
rerouted only before any `begin` succeeds; it never authorizes bypassing
controller validation. If an uncertain `finish` is followed by an idle `open`
at the next revision with a matching response receipt, use the read-only
fallback to verify its operation and revision, emit that `response_markdown`
exactly, and stop. Never replay an older receipt on a later turn.

## Controller Calls

```text
node <skill-root>/scripts/statectl.cjs <command> --project-root <root> --input <json-file|->
```

Pass mutation JSON by file or stdin, never as shell-escaped YAML. Every
mutation payload carries the expected identity from the current result. The
envelopes, in compact form:

```json
{"expected_project_id": "<uuid>", "expected_revision": 7,
 "route": "data_audit", "intent_summary": "Audit outcome timing in trial.csv."}
```

`begin` uses either that flat assignment with `route`, compact
`intent_summary`, optional `support`, and the exact ready `scope_ref` for
approved execution, or an exact pending
`selection: {decision_id, option_number}`. When an
artifact-capable assignment already authorizes output and its kind, slug, and,
for a file, extension are known, include
`artifact_reservation: {kind, slug, extension?}` and reserve atomically; this
is the default for exact approved analysis and report execution. Omit it when
output is not authorized or those fields are not yet known, and let the worker
call `reserve-artifact` (active `operation_id`, `kind`, `slug`, file
`extension`, or route-required `discovery_scope`). A new or revised discovery
run must use that worker-stage call so its contract is frozen with the
reservation.

```json
{"expected_project_id": "<uuid>", "expected_revision": 8,
 "operation_id": "<uuid>", "actor": "data_audit",
 "updates": {"data_facts": {}, "council_chamber": {"data_audit": {}}}}
```

`apply` is owner-scoped: the exact `actor`, only route-owned `updates`, and any
route-required `scope_transition`, `discovery_scope`, or `artifact`.

```json
{"expected_project_id": "<uuid>", "expected_revision": 9,
 "operation_id": "<uuid>", "presentation": {},
 "updates": {"project_summary": {}},
 "question_actions": []}
```

`finish` uses the team lead `presentation`, optional
`updates: {project_summary: ...}`, and optional controller-owned
`question_actions`. A record action supplies `action: "record"`,
`question_id` (`null` for a new question), canonical `source_text`, and boolean
`surface`; later surface and retire actions use the controller-generated
`question_id`, and retirement supplies `resolution: {kind, note}`. Use
`finish --cancel` only after explicit cancellation and omit question actions.

Patch maps merge recursively, supplied arrays replace complete arrays, `null`
is explicit, and omitted fields stay unchanged. When evidence supersedes
route-owned content, replace every affected field and explicitly clear obsolete
values. The controller owns identities, timestamps, artifact records, aggregate
flags, plan transitions, pending decisions, and response rendering.

Use `statectl validate` only for read-only diagnostics. Keep routing, reference
loading, controller calls, and route work silent unless a real blocker or
permission issue prevents completion.
