# Interactive Causal Consultant

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-6.0.0-blue.svg)]()
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

Version 6.0.0 keeps the deterministic schema-5 state protocol and adds exact
controller-derived turn contexts for more efficient routing, worker handoff,
and lead closeout. The controller returns exact stage-relevant state and
reference paths, so normal work does not repeatedly reload the complete project
record. Durable state and recovery boundaries remain unchanged: strict YAML
validation, migration from recognized v4.5 and versioned schema-2/3/4 states,
revision-checked owner-scoped updates, exact analysis, report, and discovery
scope identities, controller work cards, coverage receipts, verified artifact
manifests, and automatic recovery at worker/lead boundaries. It also enforces
analysis-entry eligibility in `statectl begin`, aligns route and team-lead
status semantics, and gives each user choice one legal next operation with
durable numbered selection. Normal delivery emits the controller-rendered
decision contract verbatim after closeout. Runtime use requires Node.js 18 or
newer. The committed bundle needs no `npm install` or global packages.

```text
User <-> causal-consultant router
          -> statectl open -> router context
          -> statectl begin -> worker context + selected route reference
          -> statectl apply -> committed lead context
          -> team_lead -> statectl finish -> recoverable rendered response
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
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.0.0 into `~/.codex/skills/causal-consultant`.
```

Claude Code personal install:

```text
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.0.0 into `~/.claude/skills/causal-consultant`.
```

Codex or other agent project-local install:

```text
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.0.0 into `.agents/skills/causal-consultant`.
```

Alternative project-local install:

```text
Copy the folder from https://github.com/rqzhu-aide/causal-consultant/tree/v6.0.0 into `.agent/skills/causal-consultant`.
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
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.codex/hooks.json" -OutFile ".codex\hooks.json"
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.codex/project_state_stop_check.js" -OutFile ".codex\project_state_stop_check.js"
```

Codex project hook, macOS/Linux shell. Navigate to your project working
directory, then run:

```sh
mkdir -p .codex
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.codex/hooks.json" -o .codex/hooks.json
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.codex/project_state_stop_check.js" -o .codex/project_state_stop_check.js
```

Codex may require you to trust or approve the project hook in Codex settings
before it runs.

Claude Code project hook, PowerShell. Navigate to your project working
directory, then run:

```powershell
New-Item -ItemType Directory -Force -Path ".claude" | Out-Null
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.claude/settings.json" -OutFile ".claude\settings.json"
Invoke-WebRequest "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.claude/project_state_stop_check.js" -OutFile ".claude\project_state_stop_check.js"
```

Claude Code project hook, macOS/Linux shell. Navigate to your project working
directory, then run:

```sh
mkdir -p .claude
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.claude/settings.json" -o .claude/settings.json
curl -L "https://raw.githubusercontent.com/rqzhu-aide/causal-consultant/v6.0.0/project-hooks/.claude/project_state_stop_check.js" -o .claude/project_state_stop_check.js
```

## License

MIT. See [LICENSE](LICENSE).
