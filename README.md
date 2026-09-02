# Interactive Causal Consultant

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-6.3.0-blue.svg)]()

An interactive causal-inference consultant skill for Claude Code, Codex, and
compatible agents. It takes a rough causal question to a defensible analysis
plan, executes only after your explicit approval, and writes the report.

> I cannot give you a definitive answer, but I can help you explore.

## Why

Causal analyses rarely fail at the modeling step. They fail earlier: an
unclear estimand, data that cannot support the claim, a design that does not
match how treatment actually happened, or a result quietly rescued after the
fact. Agents make this worse when they jump straight from a variable pair to a
regression.

This skill makes an agent work like a careful causal consulting team instead.
It asks what you actually want to know, inspects the data you actually have,
surfaces the hidden context that steers the design choice, proposes analysis
plans with their requirements and risks, and computes target results only
after you approve one exact plan. Everything it learns and produces is kept in
a durable, auditable project state, so the work survives interruptions and
later sessions.

## How It Works

Each user turn is one bounded operation:

```text
you ──▶ router ──▶ one specialist ──▶ team lead ──▶ one reply
              │
              └─ statectl, the bundled state controller: validates
                 project_state.yaml, gates assignments, freezes approved
                 scopes, records artifacts, renders the reply
```

The specialists: `data_audit` (data reality: timing, leakage, missingness,
support), `domain_expert` (constructs, measurement, field practice),
`causal_check` (estimand, assumptions, claim boundary, method recommendation),
`causal_discovery` (optional graph-hypothesis sidecar), `analysis_execution`
(nine design routes from randomized assignment to synthetic control, plus six
support routes), and `report_writer` (planning and analysis reports as HTML).
`team_lead` closes every operation and is the only voice you hear.

Two rules give the workflow its rigor. First, analysis executes only when data,
domain, and causal review all pass or establish explicit limited boundaries,
and you approve one exact written scope with a direct yes or no;
recommendations arrive as one preferred strategy plus at most two real
alternatives, each with requirements and risks, and an analysis plan goes stale
automatically when the facts under it change. Second, every durable
output is reserved, validated, and receipted under `output/`, and
`project_state.yaml` is the single versioned, strictly validated record of the
project, so interrupted work resumes at its exact boundary. State mutations are
serialized per project so simultaneous agents cannot overwrite one another.

## Install

Copy this runtime subset from
https://github.com/rqzhu-aide/causal-consultant/tree/v6.3.0 into a skill
folder:

```text
SKILL.md
LICENSE
agents/
assets/
references/
scripts/statectl.cjs
scripts/vendor-licenses/
```

For Claude Code, use the personal skill folder
`~/.claude/skills/causal-consultant`. For Codex, use the personal folder
`$HOME/.agents/skills/causal-consultant` or the repository-local folder
`$REPO_ROOT/.agents/skills/causal-consultant`.
Requires Node.js 18+; the committed bundle needs no `npm install`. The
repository's `project-hooks/`, build source, and tests are not part of the
runtime.

Optional per-project stop hook (checks persistent state from subdirectories).
Either hook blocks one stop when an operation is unfinished so the session can
resume it; when the host re-invokes it with `stop_hook_active` for the same
stop, it yields with a notice instead of looping. From a clone or extracted
release checkout, run the matching installer with the project that should
receive the hook (all platforms):

```text
node scripts/install-claude-hook.cjs --project-root "/path/to/your/project"
node scripts/install-codex-hook.cjs  --project-root "/path/to/your/project"
```

The installer copies the hook bundle, merges only the causal-consultant `Stop`
handler into an existing `.claude/settings.json` or `.codex/hooks.json`
(permissions, environment settings, and unrelated hooks are preserved), and
creates timestamped backups before changing existing files. Repeating the
command is safe. Codex may ask you to review and trust the project hook before
it runs; use `/hooks` to inspect its status.

## Use

The skill activates only when you ask for it explicitly. It is deliberately
too thorough for one-off statistics questions:

```text
Use the causal-consultant skill to help me think through this causal question.
```

In Codex, invoke `$causal-consultant`, or open `/skills` and select it. In
Claude Code, invoke `/causal-consultant`.

Then work conversationally. Describe your question and data; the team audits
what you have, asks the few questions that actually change the design, and
proposes what to do next. When an analysis or report plan is ready, you get
its complete scope, including the target, method, diagnostics, and claim
boundary, for a direct yes/no approval. No target analysis result is computed
until you approve the exact scope. Results, diagnostics, and reports land under
`output/`, the project memory lives in `project_state.yaml` next to your data,
and a new session on the same folder picks up exactly where you left off. Say
"start fresh" to archive the state and begin a new project.

## License

MIT. See [LICENSE](LICENSE).
