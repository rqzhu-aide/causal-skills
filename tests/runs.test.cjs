"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const store = require("../scripts/lib/store.cjs");
const runs = require("../scripts/lib/runs.cjs");
const { sha256 } = require("../scripts/lib/files.cjs");

function project(t) {
  const temporaryBase = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryBase, "causal-v7-runs-"));
  t.after(() => {
    const relative = path.relative(temporaryBase, root);
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith("..") && relative.startsWith("causal-v7-runs-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  store.init(root, { event_id: "event-init", project_id: "project-test", project_understanding: { objective: "Synthetic run validation", current_claim_boundary: "Descriptive only." } });
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data", "sample.csv"), "value\n10\n12\n");
  return root;
}
function current(root) { return store.status(root).project; }
function identities(root, event_id) {
  const state = current(root);
  return { event_id, expected_project_id: state.state_meta.project_id, expected_last_event_id: state.state_meta.last_event_id };
}
function plan(kind = "analysis") {
  const common = { kind, objective: "Compute a synthetic descriptive summary", claim_boundary: "Sample mean only; no causal interpretation.", inputs: [{ source_ref: "data/sample.csv", path: "data/sample.csv" }] };
  if (kind === "analysis") return { ...common, target: "Observed sample rows", population: "Two synthetic rows", treatment: "None", comparator: "None", outcome: "value", timing: "One observation period", estimand: "Sample arithmetic mean", design_id: "descriptive_association", estimator: "Arithmetic mean", exclusions: [], diagnostics: ["Count rows and missing values."] };
  if (kind === "discovery") return { ...common, variables: ["value"], method: "Synthetic graph fixture", diagnostics: ["Record a bounded fixture diagnostic."] };
  if (kind === "audit") return { ...common, question: "Are values complete?", diagnostics: ["Count rows and missing values."] };
  throw new Error("Unknown fixture plan kind");
}
function start(root, run_id = "run-main", extra = {}) {
  return runs.start(root, { ...identities(root, "event-start-" + run_id), run_id, plan: plan(), ...extra });
}
function write(root, run_id, filePath, content) {
  const { event_id, ...identity } = identities(root, "unused");
  return runs.write(root, { ...identity, run_id, path: filePath, content });
}
const SCRIPT = [
  "const fs = require('node:fs');",
  "const rows = fs.readFileSync('inputs/0001.csv', 'utf8').trim().split(/\\r?\\n/).slice(1).map(Number);",
  "fs.mkdirSync('results', {recursive:true});",
  "fs.writeFileSync('results/mean.json', JSON.stringify({mean:rows.reduce((a,b)=>a+b,0)/rows.length,n:rows.length}));",
  "fs.writeFileSync('results/diagnostics.json', JSON.stringify({missing:rows.filter(v=>!Number.isFinite(v)).length}));",
  "console.log('computed '+rows.length+' rows');"
].join("\n");
function compute(root, run_id = "run-main") {
  write(root, run_id, "code/mean.cjs", SCRIPT);
  const result = spawnSync(process.execPath, ["code/mean.cjs"], { cwd: path.join(root, "runs", run_id), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  write(root, run_id, "execution.txt", result.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "runs", run_id, "results", "mean.json"), "utf8")), { mean: 11, n: 2 });
}
function finalRequest(root, run_id = "run-main") {
  return {
    ...identities(root, "event-finish-" + run_id), run_id,
    code_paths: ["code/mean.cjs"], output_paths: ["results/mean.json"], diagnostic_paths: ["results/diagnostics.json"],
    environment: { runtime: "node", version: process.version, command: "node code/mean.cjs", execution_log: "execution.txt" }, deviations: []
  };
}
function complete(root, run_id = "run-main") { start(root, run_id); compute(root, run_id); return runs.finalize(root, finalRequest(root, run_id)); }
function hasCode(code) { return error => error.code === code; }
function runFile(root, filename, run_id = "run-main") { return path.join(root, "runs", run_id, filename); }
function registerComputed(root) {
  const record = { evidence_id: "evidence-result", kind: "computed", run_id: "run-main", source_ref: "runs/run-main/results/mean.json", summary: "The synthetic sample mean is 11, with two rows." };
  store.record(root, { ...identities(root, "event-result"), type: "memory_updated", payload: { changes: { evidence: [record] } } });
  return record;
}
function reportStart(root, run_id = "run-report") {
  return runs.start(root, { ...identities(root, "event-start-" + run_id), run_id, plan: { kind: "report", objective: "Summarize the saved synthetic result", claim_boundary: "Descriptive only", inputs: [], purpose: "Planning illustration", evidence_refs: ["evidence-result"], format: "Markdown" } });
}
function reportFinalize(root, run_id = "run-report") {
  write(root, run_id, "report.md", "The synthetic sample mean is 11. This is descriptive only.\n");
  return runs.finalize(root, { ...identities(root, "event-finish-" + run_id), run_id, code_paths: [], output_paths: ["report.md"], diagnostic_paths: [], environment: { authoring: "synthetic test fixture" }, deviations: [] });
}

test("start freezes a hashed plan and input snapshot before any target computation", t => {
  const root = project(t);
  const original = fs.readFileSync(path.join(root, "data", "sample.csv"));
  const result = start(root);
  assert.equal(result.committed, true);
  assert.equal(current(root).runs[0].status, "in_progress");
  const frozen = JSON.parse(fs.readFileSync(runFile(root, "plan.yaml"), "utf8"));
  assert.equal(frozen.inputs[0].snapshot_ref, "runs/run-main/inputs/0001.csv");
  assert.deepEqual(fs.readFileSync(path.join(root, frozen.inputs[0].snapshot_ref)), original);
  assert.equal(frozen.inputs[0].source_sha256, sha256(original));
  assert.deepEqual(fs.readFileSync(path.join(root, "data", "sample.csv")), original);
  assert.equal(runs.verify(root).issues.some(issue => issue.code === "INCOMPLETE_RUN"), true);
});

test("fresh store initialization produces a replay-stable current projection", t => {
  const root = project(t);
  const saved = JSON.parse(fs.readFileSync(path.join(root, "project.yaml"), "utf8"));
  const status = store.status(root);
  assert.equal(status.projection_current, true);
  assert.deepEqual(store.readJournal(root).state, saved);
  assert.equal(runs.verify(root).ok, true);
});

test("an actual tiny analysis executes from snapshots and finalizes all provenance files", t => {
  const root = project(t);
  const original = fs.readFileSync(path.join(root, "data", "sample.csv"));
  complete(root);
  const state = current(root);
  assert.equal(state.runs[0].status, "completed");
  const manifest = JSON.parse(fs.readFileSync(runFile(root, "manifest.json"), "utf8"));
  assert.ok(manifest.files.some(file => file.path === "plan.yaml"));
  assert.ok(manifest.files.some(file => file.path === "inputs/0001.csv"));
  assert.ok(manifest.files.some(file => file.path === "code/mean.cjs"));
  assert.ok(manifest.files.some(file => file.path === "execution.txt"));
  assert.equal(manifest.environment.command, "node code/mean.cjs");
  assert.deepEqual(fs.readFileSync(path.join(root, "data", "sample.csv")), original);
  assert.equal(runs.verify(root).ok, true);
});
test("finalization rejects filename-case mismatch before freezing an unusable manifest", t => {
  const root = project(t);
  start(root);
  compute(root);
  const request = finalRequest(root);
  request.output_paths = ["results/MEAN.json"];
  assert.throws(() => runs.finalize(root, request), error => ["INVALID_INPUT", "ENOENT"].includes(error.code));
  assert.equal(fs.existsSync(runFile(root, "manifest.json")), false);
  assert.equal(current(root).runs[0].status, "in_progress");
  runs.finalize(root, finalRequest(root));
  registerComputed(root);
  assert.equal(runs.verify(root).ok, true);
});

test("all supported run kinds validate their own plan shape without analysis fields on reports", t => {
  const root = project(t);
  for (const kind of ["audit", "analysis", "discovery"]) {
    runs.start(root, { ...identities(root, "event-" + kind), run_id: "run-" + kind, plan: plan(kind) });
  }
  store.record(root, { ...identities(root, "event-source"), type: "memory_updated", payload: { changes: { evidence: [{ evidence_id: "evidence-result", kind: "file", source_ref: "data/sample.csv", summary: "Synthetic source." }] } } });
  reportStart(root);
  reportFinalize(root);
  assert.equal(current(root).runs.find(run => run.kind === "report").status, "completed");
});

test("managed files are new-path only and identical content is an idempotent retry", t => {
  const root = project(t); start(root);
  assert.equal(write(root, "run-main", "code/check.cjs", "console.log(1)\n").replayed, false);
  assert.equal(write(root, "run-main", "code/check.cjs", "console.log(1)\n").replayed, true);
  assert.throws(() => write(root, "run-main", "code/check.cjs", "console.log(2)\n"), hasCode("FILE_EXISTS"));
  assert.equal(fs.readFileSync(runFile(root, "code/check.cjs"), "utf8"), "console.log(1)\n");
  write(root, "run-main", "code/check-v2.cjs", "console.log(2)\n");
  assert.ok(fs.existsSync(runFile(root, "code/check-v2.cjs")));
});

test("plans, manifests, snapshots and escaped paths cannot be managed writes", t => {
  const root = project(t); start(root);
  for (const filePath of ["plan.yaml", "PLAN.YAML", "manifest.json", "Inputs/new.csv", "inputs/0001.csv"]) {
    assert.throws(() => write(root, "run-main", filePath, "bad"), hasCode("RUN_IMMUTABLE"));
  }
  for (const filePath of ["../outside.txt", "../../outside.txt", "C:/outside.txt", "/outside.txt", "results/../other.txt"]) {
    assert.throws(() => write(root, "run-main", filePath, "bad"), hasCode("UNSAFE_PATH"));
  }
});

test("completed run is immutable and a child has a new identity and frozen plan", t => {
  const root = project(t); complete(root);
  const oldManifest = fs.readFileSync(runFile(root, "manifest.json"));
  assert.throws(() => write(root, "run-main", "extra.txt", "not allowed"), hasCode("RUN_IMMUTABLE"));
  assert.throws(() => runs.finalize(root, { ...finalRequest(root), event_id: "event-second-final" }), hasCode("RUN_IMMUTABLE"));
  start(root, "run-child", { parent_run_id: "run-main" });
  assert.equal(current(root).runs.find(run => run.run_id === "run-child").parent_run_id, "run-main");
  assert.deepEqual(fs.readFileSync(runFile(root, "manifest.json")), oldManifest);
});

test("start and finalize remain idempotent after projection delivery failure", t => {
  const root = project(t);
  const startRequest = { ...identities(root, "event-start"), run_id: "run-main", plan: plan() };
  const failedDelivery = { hooks: { beforeProjection() { throw new Error("injected projection failure"); } } };
  assert.equal(runs.start(root, startRequest, failedDelivery).projection_written, false);
  assert.equal(runs.start(root, startRequest).replayed, true);
  compute(root);
  const finishRequest = finalRequest(root);
  assert.equal(runs.finalize(root, finishRequest, failedDelivery).projection_written, false);
  assert.equal(current(root).runs[0].status, "completed");
  assert.equal(runs.finalize(root, finishRequest).replayed, true);
  assert.equal(store.history(root, { type: "run_finalized" }).total, 1);
  assert.equal(runs.verify(root).ok, true);
});

test("files written before a failed start append remain reported orphans, never adopted", t => {
  const root = project(t);
  const request = { ...identities(root, "event-start"), run_id: "run-main", plan: plan() };
  assert.throws(() => runs.start(root, request, { hooks: { beforeAppend() { throw new Error("stop before append"); } } }));
  assert.equal(current(root).runs.length, 0);
  assert.equal(runs.verify(root).issues.some(issue => issue.code === "ORPHAN_RUN"), true);
  assert.throws(() => runs.start(root, request), hasCode("ORPHAN_RUN"));
});

test("a manifest written before a failed completion append is not completion evidence", t => {
  const root = project(t); start(root); compute(root);
  const request = finalRequest(root);
  assert.throws(() => runs.finalize(root, request, { hooks: { beforeAppend() { throw new Error("stop before append"); } } }));
  assert.equal(current(root).runs[0].status, "in_progress");
  assert.equal(runs.verify(root).issues.some(issue => issue.code === "UNCOMMITTED_MANIFEST"), true);
  assert.throws(() => runs.finalize(root, request), hasCode("ORPHAN_MANIFEST"));
});

test("source, snapshot and plan drift prevent completion without silently changing history", t => {
  for (const [filePath, code] of [["data/sample.csv", "SOURCE_CHANGED"], ["runs/run-main/inputs/0001.csv", "INPUT_CHANGED"], ["runs/run-main/plan.yaml", "PLAN_CHANGED"]]) {
    const root = project(t); start(root); compute(root);
    fs.appendFileSync(path.join(root, filePath), "changed\n");
    assert.throws(() => runs.finalize(root, finalRequest(root)), hasCode(code));
    assert.equal(current(root).runs[0].status, "in_progress");
    assert.equal(runs.verify(root).issues.some(issue => issue.code === code), true);
  }
});

test("verification detects changed, missing and unmanifested completed output", t => {
  for (const mutate of [
    root => fs.appendFileSync(runFile(root, "results/mean.json"), "changed"),
    root => fs.unlinkSync(runFile(root, "results/mean.json")),
    root => fs.writeFileSync(runFile(root, "extra.txt"), "unexpected")
  ]) {
    const root = project(t); complete(root); mutate(root);
    assert.equal(runs.verify(root).issues.some(issue => issue.code === "ARTIFACT_CHANGED"), true);
  }
});

test("verification checks immutable manifest, journal, and projection independently", t => {
  const root = project(t); complete(root);
  fs.appendFileSync(runFile(root, "manifest.json"), " ");
  assert.equal(runs.verify(root).issues.some(issue => issue.code === "MANIFEST_CHANGED"), true);
  fs.writeFileSync(path.join(root, "project.yaml"), "{}");
  assert.equal(runs.verify(root).issues.some(issue => issue.code === "STALE_PROJECTION"), true);
  fs.appendFileSync(path.join(root, "journal.jsonl"), "{\"partial\":");
  assert.equal(runs.verify(root).issues[0].code, "INCOMPLETE_JOURNAL");
});

test("failed and abandoned runs remain visible but never become completed outputs", t => {
  const root = project(t);
  start(root, "run-failed");
  runs.failRun(root, { ...identities(root, "event-failed"), run_id: "run-failed", reason: "Synthetic command failed before producing output." });
  start(root, "run-abandoned");
  runs.abandon(root, { ...identities(root, "event-abandoned"), run_id: "run-abandoned", reason: "The output is no longer requested." });
  assert.deepEqual(current(root).runs.map(run => run.status), ["failed", "abandoned"]);
  assert.throws(() => write(root, "run-failed", "output.txt", "not completed"), hasCode("RUN_IMMUTABLE"));
  assert.equal(runs.verify(root).ok, true);
});

test("wrong identities, invalid parents and unknown fields reject before generated files", t => {
  const root = project(t);
  const request = { ...identities(root, "event-start"), run_id: "run-main", plan: plan() };
  assert.throws(() => runs.start(root, { ...request, expected_project_id: "project-other" }), hasCode("WRONG_PROJECT"));
  assert.throws(() => runs.start(root, { ...request, expected_last_event_id: null }), hasCode("STALE_WRITE"));
  assert.throws(() => runs.start(root, { ...request, parent_run_id: "run-missing" }), hasCode("UNKNOWN_RUN"));
  assert.throws(() => runs.start(root, { ...request, approved: true }), hasCode("INVALID_INPUT"));
  assert.throws(() => runs.start(root, { ...request, plan: { ...request.plan, approved: true } }), hasCode("INVALID_INPUT"));
  assert.equal(fs.existsSync(path.join(root, "runs", "run-main")), false);
});

test("external inputs are snapshotted read-only with caller hash verification", t => {
  const root = project(t);
  const outside = path.join(root, "external-source.csv");
  fs.writeFileSync(outside, "value\n10\n12\n");
  const original = fs.readFileSync(outside);
  const configured = plan(); configured.inputs = [{ source_ref: "research source", path: outside, sha256: sha256(original) }];
  start(root, "run-main", { plan: configured });
  compute(root); runs.finalize(root, finalRequest(root));
  assert.deepEqual(fs.readFileSync(outside), original);
  const bad = plan(); bad.inputs[0].sha256 = "0".repeat(64);
  assert.throws(() => start(root, "run-bad", { plan: bad }), hasCode("INPUT_CHANGED"));
});

test("linked generated ancestors and linked completed files are rejected", t => {
  const root = project(t); start(root);
  const target = path.join(root, "data");
  const linked = runFile(root, "linked");
  try { fs.symlinkSync(target, linked, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES"].includes(error.code)) return t.skip("Creating links is not available on this host."); throw error; }
  assert.throws(() => write(root, "run-main", "linked/escape.txt", "blocked"), hasCode("UNSAFE_PATH"));
  assert.equal(runs.verify(root).issues.some(issue => issue.code === "UNSAFE_PATH"), true);
  assert.equal(fs.existsSync(path.join(target, "escape.txt")), false);
});

test("legacy workspace refusal leaves every original byte untouched", t => {
  const root = project(t);
  fs.writeFileSync(path.join(root, "project_state.yaml"), "legacy: true\n");
  const before = fs.readFileSync(path.join(root, "project_state.yaml"));
  const request = { event_id: "event-start", expected_project_id: "project-test", expected_last_event_id: "event-init", run_id: "run-main", plan: plan() };
  assert.throws(() => runs.start(root, request), hasCode("LEGACY_PROJECT"));
  assert.deepEqual(fs.readFileSync(path.join(root, "project_state.yaml")), before);
  assert.equal(fs.existsSync(path.join(root, "runs")), false);
});

test("computed evidence requires a completed manifested output and untampered plan", t => {
  const root = project(t); start(root); compute(root);
  const evidence = { evidence_id: "evidence-result", kind: "computed", run_id: "run-main", source_ref: "runs/run-main/results/mean.json", summary: "Synthetic mean." };
  assert.throws(() => runs.assertComputedEvidence(root, current(root), evidence), hasCode("INCOMPLETE_RUN"));
  runs.finalize(root, finalRequest(root));
  assert.doesNotThrow(() => runs.assertComputedEvidence(root, current(root), evidence));
  assert.throws(() => runs.assertComputedEvidence(root, current(root), { ...evidence, source_ref: "runs/run-main/code/mean.cjs" }), hasCode("UNKNOWN_REFERENCE"));
  fs.appendFileSync(runFile(root, "plan.yaml"), " ");
  assert.throws(() => runs.assertComputedEvidence(root, current(root), evidence), hasCode("PLAN_CHANGED"));
});

test("report freezes evidence and completed-run identities without requiring treatment fields", t => {
  const root = project(t); complete(root); registerComputed(root); reportStart(root); reportFinalize(root);
  const frozen = JSON.parse(fs.readFileSync(runFile(root, "plan.yaml", "run-report"), "utf8"));
  assert.equal(frozen.evidence_bindings[0].run_id, "run-main");
  assert.equal(frozen.evidence_bindings[0].event_ref, "event-result");
  assert.equal(frozen.evidence_bindings[0].manifest_sha256, current(root).runs[0].manifest_sha256);
  assert.equal(Object.hasOwn(frozen, "treatment"), false);
  assert.equal(runs.verify(root).ok, true);
});

test("report finalization and verification recheck frozen source artifacts, not current evidence text", t => {
  const root = project(t); complete(root); registerComputed(root); reportStart(root);
  fs.appendFileSync(runFile(root, "results/mean.json"), "changed");
  assert.throws(() => reportFinalize(root), hasCode("SOURCE_CHANGED"));
  assert.equal(runs.verify(root).issues.some(issue => issue.run_id === "run-report" && issue.code === "SOURCE_CHANGED"), true);
});

test("report verification retains bound version even if a later evidence update changes the current summary", t => {
  const root = project(t); complete(root); registerComputed(root); reportStart(root); reportFinalize(root);
  store.record(root, { ...identities(root, "event-later-source"), type: "memory_updated", payload: { changes: { evidence: [{ evidence_id: "evidence-result", kind: "file", source_ref: "unrelated/new.csv", summary: "A later corrected source interpretation." }] } } });
  const frozen = JSON.parse(fs.readFileSync(runFile(root, "plan.yaml", "run-report"), "utf8"));
  assert.equal(frozen.evidence_bindings[0].source_ref, "runs/run-main/results/mean.json");
  assert.equal(runs.verify(root).ok, true);
});

test("a report bound to a missing or changed source manifest cannot finalize", t => {
  const root = project(t); complete(root); registerComputed(root); reportStart(root);
  fs.appendFileSync(runFile(root, "manifest.json"), " ");
  assert.throws(() => reportFinalize(root), hasCode("SOURCE_CHANGED"));
});
