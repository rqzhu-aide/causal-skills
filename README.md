# Causal Consultant v7

Version: **7.0.4**, the active candidate at this repository's root.
The consultant and `interactive-test-cc` use the same release number. This
version aligns release metadata with the four-persona testing package; the
consultation behavior and project format remain those of 7.0.2.
The September 7 folder reorganization moved the actual pre-v7 working files,
including uncommitted edits, to the sibling `causal-consultant-v6` archive.
Existing consultation projects are unchanged. This layout promotion is not a
new installation or a claim that release qualification is complete.

## What Changes for the User

The lead helps identify the uncertainty that most affects a causal study and
explains how you can help resolve it. Your answer, choice, or instruction informs
one specialist review. The lead returns with findings and a useful next step.
Clear requests proceed without another approval question; a settled summary
does not trigger another investigation.

All nine original design families and six scientific supports remain, with a
new custom-identification path. One design worker can combine relevant guides
for a single identifying argument. Requested data preparation belongs to the
data auditor and does not require choosing a causal design first.

Start with [SKILL.md](SKILL.md). The skill is explicit-use, not an implicit
replacement for ordinary statistical discussion. Its metadata retains
`allow_implicit_invocation: false`.

This revision requires an investigated basis before settling an underspecified
causal question. The lead chooses checks by what different answers could change,
including whether an accessible fact could reveal a stronger design. Descriptive
deliverables can be completed while the original causal question remains open;
explicit user narrowing and ready-to-execute work retain direct paths.
Answers keep their qualifications and must inform advice. Existing memory,
run integrity and the one-specialist-per-turn limit are unchanged. New behavioral
fixtures test investigation and appropriate stopping; their existence is not
evidence of a completed live comparison.

## Use the Skill

Use this repository root as the skill root. For a standalone distribution copy
`package.json` itself plus the runtime files it lists; exclude `architecture/`, tests and
Git/development metadata from the consultant's installed instruction package.
Invoke the skill explicitly and select a **new consultation folder**. Do
not install both versions under the same name without deliberately choosing
which one is active. No global setup, hooks, accounts, or package downloads are
required for the memory helpers. Analysis dependencies depend on the actual
study and are selected separately.

Node.js 18.18 or newer is required. From this directory:

```text
node scripts/validate.cjs
npm test
node scripts/project.cjs help
node scripts/project.cjs init --project-root <new-consultation-folder>
node scripts/project.cjs context --project-root <consultation-folder>
node scripts/project.cjs status --project-root <consultation-folder>
node scripts/project.cjs verify --project-root <consultation-folder>
```

Keep active test files directly in `tests/` as `*.test.cjs`; nested fixture and
historical copies are not discovered. Node test options are forwarded, for
example `npm test -- --test-name-pattern="version"`.

[Memory](references/memory.md) documents focused reads, records, history and recovery.
[Runs](references/runs.md) documents pre-result plans, saved artifacts, and
verification. These are conditional instructions, not a questionnaire for you.

## Auditability and Containment

Each consultation has one authoritative `journal.jsonl` and a rebuildable
`project.yaml`. Both use JSON serialization; JSON is a valid YAML subset.
Relevant current facts and all older records remain available. A review is saved
once; the projection contains its short index rather than a second full handoff.
Use focused context for a known question or strategy, and complete status
directly for broad reassessment. Context exposes omissions and history locators;
it cannot infer missing scientific links or decide which conclusions are valid.
Paging through everything can cost more than one complete read.

The context command, preparation operation, custom/composed plans and optional
evidence excerpts are included in 7.0.0, having been introduced in rc.3. Earlier
v7 journals remain readable without rewriting them; older helpers need not
accept records using the newer features.
Same-ID updates still replace the complete record, including optional fields.

Saved outputs live in `runs/<run-id>/`. A run retains its frozen plan, file input
snapshots, code or configuration, outputs, and hashed manifest. A changed result
belongs in a new run. A small audit without saved outputs needs a review record,
not a run directory. Target estimation always needs a planned run.

Managed writes reject path escapes and linked destinations. Short writer locks,
stable event identities, and explicit recovery handle cooperating processes and
interrupted writes. `verify` reports changed files and unfinished work.
By default it also checks original source paths. An explicit read-only
`verify --source-check snapshots` checks a moved or offline archive's recorded
local contents without requiring those original paths. Its result labels the
limited source check; it does not weaken finalization or update old plans.

These guarantees do **not** sandbox arbitrary code or prove that saved code was
executed. Host tool permissions still govern execution. Retain the actual command
and execution evidence when computing results. Hashes detect changes relative to
the recorded history, not a malicious rewrite of that entire history. Local
durability is not an off-device backup. Very large file snapshots and histories
have not been performance-qualified.

If a process crashes while recovering a lock, its `.consultant-recovery.lock`
guard can remain. Automatic recovery intentionally refuses an unverifiable
guard. For offline operator recovery, first stop all helpers for that project;
check the exact guard is a regular file inside the resolved project folder,
its recorded host is this machine, and its recorded PID is definitely no longer
alive. Only then remove that exact guard, leaving the writer lock and project
history intact, and retry `recover-lock` for the original writer if needed.
If ownership or inactivity cannot be established, leave both locks in place.
This rare recovery path is manual, not an automatic resumption guarantee.

## Existing v6 Projects

Continue them with v6, or start a new v7 folder and carry over explicitly reviewed
source summaries. The helper refuses a folder containing `project_state.yaml`.
No automatic conversion, deletion, or import of legacy claims as verified v7
results occurs. Legacy evidence keeps its source version and verification label.
The preserved local v6 controller is in the sibling `causal-consultant-v6`
directory, not in this repository. Archives are filesystem snapshots; this
repository retains its Git history and remotes. They are not separate remote
backups, and their uncommitted v6 edits are not included in a future v7 commit.

## Verification Status

This publication includes the skill runtime and deterministic engineering tests.
Developer design and historical smoke traces are retained separately in the
local development workspace and its evidence branch. Passing unit tests is not
evidence that every consulting trajectory or scientific method has been
model-evaluated.

Full behavioral qualification still requires fresh complete interaction and scientific
trajectory comparisons, including full objective-level resource accounting.
Earlier rc.3 testing used a separate, versioned sequential capture protocol with the installed
Codex transport; targeted question-chain observations do not qualify the full
scientific suite. Independent numerical fixtures check reference algebra, not
the consultant's ability to reproduce it. The generic validator uses the existing
user-wide Python 3.14.7 and PyYAML 6.0.3; no installation was needed.
Use shared machine-wide or user-wide runtimes and packages; no project-local
environment is required. No installation or reconfiguration is part of this
revision.
Host hooks are optional future integration, not required runtime.
