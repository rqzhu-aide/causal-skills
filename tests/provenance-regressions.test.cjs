"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("../scripts/lib/store.cjs");
const runs = require("../scripts/lib/runs.cjs");
const cli = require("../scripts/project.cjs");
const { sha256 } = require("../scripts/lib/files.cjs");

function fixture(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const owned = fs.mkdtempSync(path.join(base, "causal-v7-provenance-"));
  t.after(() => {
    const relative = path.relative(base, fs.realpathSync.native(owned));
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith("..") && relative.startsWith("causal-v7-provenance-"));
    fs.rmSync(owned, { recursive: true, force: true });
  });
  const root = path.join(owned, "project");
  fs.mkdirSync(root);
  store.init(root, { event_id: "event-init", project_id: "project-test" });
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data/source.txt"), "Original source finding.\n");
  return { owned, root };
}
function identity(root, event_id) {
  const state = store.status(root).project;
  return { event_id, expected_project_id: state.state_meta.project_id, expected_last_event_id: state.state_meta.last_event_id };
}
function evidence(root, extra = {}, event_id = "event-evidence") {
  const record = { evidence_id: "evidence-source", kind: "file", source_ref: "data/source.txt", summary: "Original reviewed finding.", source_sha256: sha256(fs.readFileSync(path.join(root, "data/source.txt"))), ...extra };
  store.record(root, { ...identity(root, event_id), type: "memory_updated", payload: { changes: { evidence: [record] } } });
  return record;
}
function start(root, extra = {}) {
  return runs.start(root, { ...identity(root, "event-start"), run_id: "run-report", plan: {
    kind: "report", objective: "Summarize selected source evidence", claim_boundary: "Source evidence only, not a new causal computation.",
    inputs: [{ source_ref: "data/source.txt", path: "data/source.txt" }], purpose: "Review source findings", evidence_refs: ["evidence-source"], format: "Markdown", ...extra
  } });
}
function finish(root) {
  const { event_id, ...ids } = identity(root, "unused");
  runs.write(root, { ...ids, run_id: "run-report", path: "report.md", content: "A summary of selected source evidence, not new computation.\n" });
  return runs.finalize(root, { ...identity(root, "event-finish"), run_id: "run-report", code_paths: [], output_paths: ["report.md"], diagnostic_paths: [], environment: { authoring: "test fixture" }, deviations: [] });
}
function frozen(root) { return JSON.parse(fs.readFileSync(path.join(root, "runs/run-report/plan.yaml"), "utf8")); }
function treeHash(root) {
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(target);
      else files.push(path.relative(root, target) + "\t" + sha256(fs.readFileSync(target)));
    }
  }
  visit(root);
  return sha256(files.join("\n"));
}
const code = expected => error => error.code === expected;

for (const verification of [null, "reviewed_summary", "legacy_unverified"]) {
  test("a changed known source rejects before files for " + (verification || "ordinary evidence"), t => {
    const { root } = fixture(t);
    evidence(root, verification ? { legacy: { source_project: "old-project", source_version: "6.3.0", verification } } : {});
    fs.writeFileSync(path.join(root, "data/source.txt"), "A changed source finding.\n");
    const journal = fs.readFileSync(path.join(root, "journal.jsonl"));
    assert.throws(() => start(root), code("SOURCE_CHANGED"));
    assert.equal(fs.existsSync(path.join(root, "runs/run-report")), false);
    assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), journal);
    assert.equal(store.status(root).project.runs.length, 0);
  });
}

test("matching source binding stays immutable when current evidence is later corrected", t => {
  const { root } = fixture(t);
  const record = evidence(root);
  start(root); finish(root);
  const before = fs.readFileSync(path.join(root, "runs/run-report/plan.yaml"));
  evidence(root, { summary: "Reviewed wording correction, same source bytes." }, "event-correction");
  assert.deepEqual(fs.readFileSync(path.join(root, "runs/run-report/plan.yaml")), before);
  assert.equal(frozen(root).evidence_bindings[0].summary, record.summary);
  assert.equal(frozen(root).evidence_bindings[0].event_ref, "event-evidence");
  assert.equal(runs.verify(root).ok, true);
});

test("new reviewed evidence permits changed bytes while preserving old history", t => {
  const { root } = fixture(t);
  const old = evidence(root);
  const journalBefore = fs.readFileSync(path.join(root, "journal.jsonl"));
  fs.writeFileSync(path.join(root, "data/source.txt"), "New reviewed source.\n");
  const replacement = evidence(root, { evidence_id: "evidence-new", supersedes: old.evidence_id, summary: "New reviewed finding." }, "event-replacement");
  start(root, { evidence_refs: [replacement.evidence_id] }); finish(root);
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")).subarray(0, journalBefore.length), journalBefore);
  assert.equal(frozen(root).inputs[0].snapshot_sha256, replacement.source_sha256);
  assert.equal(frozen(root).evidence_bindings[0].evidence_id, replacement.evidence_id);
  assert.equal(runs.verify(root).ok, true);
});

test("every input using a selected source identity must match the known version", t => {
  const { root } = fixture(t); evidence(root);
  fs.writeFileSync(path.join(root, "data/other.txt"), "Other source version.\n");
  assert.throws(() => start(root, { inputs: [
    { source_ref: "data/source.txt", path: "data/source.txt" },
    { source_ref: "data/source.txt", path: "data/other.txt" }
  ] }), code("SOURCE_CHANGED"));
  assert.equal(fs.existsSync(path.join(root, "runs/run-report")), false);
});

test("unhashed or unsnapshotted evidence retains its explicit provenance limitation", t => {
  for (const mode of ["unhashed", "unsnapshotted"]) {
    const { root } = fixture(t);
    const record = { evidence_id: "evidence-source", kind: "file", source_ref: "data/source.txt", summary: "Recorded source summary.", limitations: ["Source bytes were not verified against this report input."] };
    if (mode === "unsnapshotted") record.source_sha256 = "a".repeat(64);
    store.record(root, { ...identity(root, "event-evidence"), type: "memory_updated", payload: { changes: { evidence: [record] } } });
    start(root, mode === "unsnapshotted" ? { inputs: [] } : {}); finish(root);
    assert.deepEqual(frozen(root).evidence_bindings[0].limitations, record.limitations);
    assert.equal(runs.verify(root).ok, true);
    // A green integrity check is not a claim that every evidence source was snapshotted.
    if (mode === "unhashed") assert.equal(frozen(root).evidence_bindings[0].source_sha256, undefined);
    else assert.equal(frozen(root).inputs.length, 0);
  }
});

test("copied archive verifies read-only from snapshots without rebasing original identities", t => {
  const { owned, root } = fixture(t); evidence(root); start(root); finish(root);
  const copy = path.join(owned, "archive");
  fs.cpSync(root, copy, { recursive: true });
  // Remove only this test's original source, keeping its project and archive intact.
  fs.unlinkSync(path.join(root, "data/source.txt"));
  const before = treeHash(copy);
  const strict = runs.verify(copy);
  assert.equal(strict.ok, false);
  assert.equal(strict.source_check, "originals");
  assert.equal(runs.verify(copy, { source_check: "snapshots" }).ok, true);
  assert.equal(runs.verify(copy, { source_check: "snapshots" }).source_check, "snapshots");
  assert.equal(frozen(copy).inputs[0].source_path, path.join(root, "data/source.txt"));
  assert.equal(treeHash(copy), before);
});

test("changed original fails default checking but archive checking uses frozen bytes", t => {
  const { root } = fixture(t); evidence(root); start(root); finish(root);
  fs.appendFileSync(path.join(root, "data/source.txt"), "A subsequent external revision.\n");
  assert.equal(runs.verify(root).issues.some(issue => issue.code === "SOURCE_CHANGED"), true);
  assert.equal(runs.verify(root, { source_check: "snapshots" }).ok, true);
});

test("snapshot-only verification still rejects modified plans, snapshots, manifests and outputs", t => {
  for (const [file, expected] of [["plan.yaml", "PLAN_CHANGED"], ["inputs/0001.txt", "INPUT_CHANGED"], ["manifest.json", "MANIFEST_CHANGED"], ["report.md", "ARTIFACT_CHANGED"]]) {
    const { root } = fixture(t); evidence(root); start(root); finish(root);
    fs.appendFileSync(path.join(root, "runs/run-report", file), "changed");
    const result = runs.verify(root, { source_check: "snapshots" });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some(issue => issue.code === expected), JSON.stringify(result));
  }
});

test("archive checking cannot finalize drifted work or hide incomplete runs", t => {
  const { root } = fixture(t); evidence(root); start(root);
  assert.ok(runs.verify(root, { source_check: "snapshots" }).issues.some(issue => issue.code === "INCOMPLETE_RUN"));
  fs.appendFileSync(path.join(root, "data/source.txt"), "Source drift.\n");
  assert.throws(() => finish(root), code("SOURCE_CHANGED"));
  assert.equal(fs.existsSync(path.join(root, "runs/run-report/manifest.json")), false);
  assert.throws(() => cli.main(["finalize-run", "--project-root", root, "--source-check", "snapshots"]), code("INVALID_INPUT"));
});

test("CLI and API label and validate verification mode without accepting extra options", t => {
  const { root } = fixture(t); evidence(root); start(root); finish(root);
  for (const mode of ["originals", "snapshots"]) {
    const result = cli.main(["verify", "--project-root", root, "--source-check", mode]);
    assert.equal(result.ok, true);
    assert.equal(result.source_check, mode);
  }
  assert.throws(() => cli.main(["verify", "--project-root", root, "--source-check", "snapshot"]), code("INVALID_INPUT"));
  assert.throws(() => runs.verify(root, { source_check: "snapshot" }), code("INVALID_INPUT"));
  assert.throws(() => runs.verify(root, { ignore_sources: true }), code("INVALID_INPUT"));
  assert.throws(() => runs.verify(root, null), code("INVALID_INPUT"));
});
