# Interactive Causal Consultant

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-6.1.0-blue.svg)]()
[![Status](https://img.shields.io/badge/status-active%20development-orange.svg)]()

An interactive causal inference consultant skill for moving from a rough causal
question to a defensible analysis plan, diagnostic workflow, interpretation, and
report.

> I cannot give you a definitive answer, but I can help you explore.

It is designed to feel like working with a careful causal consulting team: it
asks clarifying questions, inspects data reality, compares options, keeps the
user in control of the next step, and avoids jumping straight from a variable
pair to a model.

## How It Works

`causal-consultant` is a routed skill. The top-level `SKILL.md` opens a
versioned `project_state.yaml` through the bundled state controller, selects one
bounded route, and then loads `team_lead` as the final manager. The controller
constructs the current-turn plan, enforces route ownership, records artifacts,
closes each operation atomically, renders the response, and retains one pending
option decision; the route files retain all causal and scientific judgment.

The internal team is:

- **`team_lead`:** the only user-facing voice; owns synthesis, approval framing,
  and response content.
- **`data_audit`:** checks data structure, timing, leakage, dependencies,
  missingness, support, validity, and causal-preparation diagnostics.
- **`domain_expert`:** records durable domain knowledge, measurement
  conventions, common practice, precedent, reporting norms, and domain-specific
  risks.
- **`causal_check`:** checks causal framing, assumptions, claim strength,
  analysis readiness, and design/support route recommendations.
- **`causal_discovery`:** optional graph-hypothesis, variable-neighborhood, and
  discovery-diagnostic sidecar.
- **`report_writer`:** report scope review, approved report work,
  HTML report drafting, manuscript-style writing, reviewer-facing text, and
  safer wording.
- **Design/support references:** focused analysis routes for randomized
  assignment, observational exposure, longitudinal g-methods, DiD, RD, IV,
  synthetic control, interference, descriptive association, heterogeneity, dose
  response, mediation, transportability, non-continuous outcomes, and
  statistical validity.

For a research decision, the consultant keeps one accountable executable
default and, when they are genuinely useful, up to two credible alternatives or
fallbacks. Alternatives may involve different data construction, target,
estimand, identification design, or claim strength. The consultant explains
what each path enables, what it requires, its main risk, and when it would be
preferable. Same-design model or estimator choices remain with the selected
analysis route. Alternatives are advisory until the user adopts one and its
scientific owner prepares or revises the exact scope.

The runtime uses the deterministic schema-6 state protocol and a
provider-neutral phase-capsule transport. When a host actually hands the next
phase to a fresh isolated model invocation, the controller writes one complete
router, worker, or lead capsule to the ephemeral
`.statectl-tmp/phase-context.json`; the orchestrator receives only a compact
reference and starts that invocation without carrying prior model reasoning or
tool transcripts. The next invocation still receives the exact stage-relevant
state, work packet, and references. A host that keeps the phases in one
continuous session uses the same full capsule inline and should not create a
context file merely to read it back. Hosts without capsule support retain the
legacy context interface. Isolated phases must share the project root. Context
transport does not require or guarantee fewer model calls.

This changes only internal context delivery. The user-facing workflow and
durable recovery boundaries remain unchanged: strict YAML validation, supported
migration, revision-checked owner-scoped updates, exact analysis, report, and
discovery scope identities, controller work packets, coverage receipts,
requirement-level evidence locators, explicit deviation records, verified
artifact manifests, causal-basis freshness checks for analysis scopes, and
worker/lead boundary recovery. Exact approved analysis
and report output is reserved atomically with `begin` when its output fields are
known, avoiding a separate `reserve-artifact` command without combining
scientific routing, worker judgment, or team-lead synthesis. Runtime use
requires Node.js 18 or newer. The committed bundle needs no `npm install` or
global packages.

```text
Fresh-invocation host:
User <-> orchestrator
          -> open --context-file -> fresh router invocation
          -> begin [approved-output reservation] --context-file -> fresh worker or lead invocation
          -> apply --context-file when a worker ran -> fresh lead invocation
          -> finish -> recoverable controller-rendered response

Continuous-session host:
User <-> one session
          -> open/begin/apply --context-protocol phase-capsule-v1
          -> consume each returned capsule inline
          -> finish -> recoverable controller-rendered response

project_state.yaml remains the sole durable state; phase-context.json is ephemeral.
```

## What It Helps With

Use it when you want to work interactively on:

- refining a causal question, estimand, comparison, population, or timing
  window;
- deciding whether available data can support a causal claim or only a
  descriptive fallback;
- auditing data for timing, missingness, leakage, support, dependence, and
  validity;
- comparing designs such as experiments, observational adjustment, longitudinal
  methods, DiD, RD, IV, synthetic control, interference, or descriptive
  association;
- exploring target or support goals such as heterogeneity, dose response,
  mediation, transportability, non-continuous outcomes, or statistical validity;
- checking DAG/timing, adjustment, post-treatment variables, claim wording, or
  statistical evidence;
- producing a planning report, analysis report, manuscript-style section,
  reviewer-facing response, or polished HTML report.

## Interaction Style

The skill is intentionally interactive. It usually shows framing, consultant
options, boundaries, and a scoped next step before analysis expands. Broad
requests like "do your best" or "give me a report" are treated as invitations to
recommend the safest next move, not permission to skip the causal consulting
process. If a prior operation was interrupted, the next explicit invocation on
the same project resumes its worker or team-lead boundary before new routing.
Numbered choices are reserved for materially different next operations. One
proposed action, including one exact ready analysis or report scope, uses direct
yes/no approval rather than a menu with filler choices. During approved
output-producing work, the worker aims for one reproducible execution pass and
reuses unchanged verified evidence while rerunning anything affected by changed
data, code, settings, assumptions, or scope.

## Activation

This skill is intentionally interactive and can slow down ordinary one-off
causal or statistical questions. It should be loaded only when you explicitly
want the persistent causal-consultant workflow.

Start using it by asking your agent: `Use the causal-consultant skill to help
me think through this causal question.` Or use the direct command:

```
/causal-consultant
```

## Install

Install the runtime subset into your personal or project-local skill folder:

```text
SKILL.md
LICENSE
assets/
references/
scripts/statectl.cjs
scripts/vendor-licenses/
README.md  (optional)
```

The repository's `project-hooks/`, package/build source, and tests are not part
of the personal skill runtime.

Codex personal install:

```text
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.1.0 into `~/.codex/skills/causal-consultant`.
```

Claude Code personal install:

```text
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.1.0 into `~/.claude/skills/causal-consultant`.
```

Codex or other agent project-local install:

```text
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.1.0 into `.agents/skills/causal-consultant`.
```

Alternative project-local install:

```text
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.1.0 into `.agent/skills/causal-consultant`.
```

### Optional Project Hooks

Project-level hooks are optional stability checks. They are standalone bundles
generated from the same strict parser and validator as `statectl`; they do not
fall back to text-shape checking or require global YAML packages. If you want
them, copy the hook files separately into each project where they should run.

Codex project hook, PowerShell. Navigate to your project working directory, then
run:

```powershell
New-Item -ItemType Directory -Force -Path ".codex" | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.codex/hooks.json" -OutFile ".codex\hooks.json"
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.codex/project_state_stop_check.js" -OutFile ".codex\project_state_stop_check.js"
```

Codex project hook, macOS/Linux shell. Navigate to your project working
directory, then run:

```sh
mkdir -p .codex
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.codex/hooks.json" -o .codex/hooks.json
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.codex/project_state_stop_check.js" -o .codex/project_state_stop_check.js
```

Codex may require you to trust or approve the project hook in Codex settings
before it runs.

Claude Code project hook, PowerShell. Navigate to your project working
directory, then run:

```powershell
New-Item -ItemType Directory -Force -Path ".claude" | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.claude/settings.json" -OutFile ".claude\settings.json"
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.claude/project_state_stop_check.js" -OutFile ".claude\project_state_stop_check.js"
```

Claude Code project hook, macOS/Linux shell. Navigate to your project working
directory, then run:

```sh
mkdir -p .claude
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.claude/settings.json" -o .claude/settings.json
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.1.0/project-hooks/.claude/project_state_stop_check.js" -o .claude/project_state_stop_check.js
```

## License

MIT. See [LICENSE](LICENSE).
