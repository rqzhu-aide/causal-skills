# Context Transport

Load this reference only when running isolated model invocations or using
`--context-file`. Continuous sessions using inline `phase-capsule-v1` do not
need it.

## Isolated Invocations

When the host hands phases to fresh isolated model invocations, run router,
worker, and team lead as fresh phases, each still governed by `SKILL.md`. Give
each phase its full capsule, returned references, and the user message for the
current assistant turn. Do not preload prior transcript, model reasoning, or
tool output. Within the assistant turn that begins an operation, its user
message may add worker and lead nuance; persisted intent, packet, and frozen
scope still control the assignment. On a later resumed turn, the newer message
is not execution nuance; handle it only under Turn Protocol step 5.

Each isolated invocation normally executes only its named phase and
`completion_command`, then returns the compact `context_ref` to the
orchestrator, or the controller-rendered response after `finish`. A worker may
call `reserve-artifact` and reload its refreshed capsule when output was not
already reserved at `begin`. Explicit cancellation overrides the named phase
and `completion_command`: do not run or resume worker work; load
`references/team_lead.md` and follow the current-stage cancellation rule. No
isolated phase reroutes or launches another phase. Isolated phases must share
the project root.

## Context Files

Use `--context-file` for `open`, `begin`, `reserve-artifact`, or `apply` only
when the result will be handed to a genuinely fresh model invocation. The
controller writes the full capsule to `.statectl-tmp/phase-context.json` and
returns only its compact `context_ref`; give that reference to the next
invocation. Do not create a context file merely to read it back in the same
session.

The file is consumable only when the same command returned its matching
reference. A fresh receiving invocation resolves `context_ref.path` under the
project root and requires matching protocol and a `context_id` derived from
the capsule content; otherwise regenerate it with `open --context-file` for
that fresh handoff.

If context-file preflight fails, retry that unchanged call with
`--context-protocol phase-capsule-v1`. If a successful `open`, `begin`,
`reserve-artifact`, or `apply` instead has `delivery_warnings`, the command has
already succeeded and any mutation is committed: ignore the stale file, use its
returned full capsule, and never repeat the mutation. A successful `finish`
with a context-file cleanup warning remains closed; emit its
`response_markdown`.
