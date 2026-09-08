"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("../scripts/lib/store.cjs");
const runs = require("../scripts/lib/runs.cjs");
const { canonical, sha256 } = require("../scripts/lib/files.cjs");

function project(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "cc-v7-transactions-"));
  t.after(() => {
    const relative = path.relative(base, root);
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith("..") && relative.startsWith("cc-v7-transactions-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  store.init(root, { project_id: "project-test", event_id: "event-init" });
  return root;
}
function state(root) { return store.status(root).project; }
function identities(root, event_id) {
  const current = state(root);
  return { event_id, expected_project_id: current.state_meta.project_id, expected_last_event_id: current.state_meta.last_event_id };
}
function question(root, question_id = "question-known") {
  return store.record(root, { ...identities(root, "event-question"), type: "memory_updated",
    payload: { changes: { questions: [{ question_id, statement: "Which rows are in scope?", status: "open" }] } } });
}
function startRequest(root, event_id = "event-start", run_id = "run-main") {
  return { ...identities(root, event_id), run_id, plan: { kind: "audit", objective: "Exercise run bookkeeping",
    claim_boundary: "Synthetic bookkeeping fixture only.", inputs: [], question: "Is the fixture complete?", diagnostics: [] } };
}
function finalRequest(root, event_id = "event-finish") {
  const { event_id: ignored, ...identity } = identities(root, "unused");
  runs.write(root, { ...identity, run_id: "run-main", path: "result.txt", content: "Fixture complete.\n" });
  return { ...identities(root, event_id), run_id: "run-main", code_paths: [], output_paths: ["result.txt"], diagnostic_paths: [],
    environment: { authoring: "Node regression fixture" }, deviations: [] };
}
function journal(root) { return fs.readFileSync(path.join(root, "journal.jsonl")); }
function rejectCode(action, code) { assert.throws(action, error => error.code === code); }
function legacyRequestHash(request) {
  const { expected_last_event_id, ...payload } = request;
  return sha256(canonical(payload));
}

test("a start event ID owned by another history record rejects before creating run files", t => {
  const root = project(t);
  question(root);
  const before = journal(root);
  const request = startRequest(root, "question-known");
  rejectCode(() => runs.start(root, request), "DUPLICATE_ID");
  assert.deepEqual(journal(root), before);
  assert.equal(fs.existsSync(path.join(root, "runs")), false);
  assert.equal(runs.start(root, { ...request, event_id: "event-start" }).committed, true);
  assert.deepEqual(store.status(root).orphan_run_paths, []);
  assert.equal(runs.finalize(root, finalRequest(root)).committed, true);
  assert.equal(runs.verify(root).ok, true);
});

test("a finalize event ID owned by a question leaves no manifest and accepts a corrected retry", t => {
  const root = project(t);
  question(root);
  runs.start(root, startRequest(root));
  const request = finalRequest(root, "question-known");
  const before = journal(root);
  rejectCode(() => runs.finalize(root, request), "DUPLICATE_ID");
  assert.deepEqual(journal(root), before);
  assert.equal(fs.existsSync(path.join(root, "runs", "run-main", "manifest.json")), false);
  assert.equal(state(root).runs[0].status, "in_progress");
  const corrected = { ...request, event_id: "event-finish" };
  assert.equal(runs.finalize(root, corrected).committed, true);
  assert.equal(runs.finalize(root, corrected).replayed, true);
  assert.equal(runs.verify(root).ok, true);
});

test("a finalize event ID equal to its run ID rejects before writing a manifest", t => {
  const root = project(t);
  runs.start(root, startRequest(root));
  const request = finalRequest(root, "run-main");
  const before = journal(root);
  rejectCode(() => runs.finalize(root, request), "DUPLICATE_ID");
  assert.deepEqual(journal(root), before);
  assert.equal(fs.existsSync(path.join(root, "runs", "run-main", "manifest.json")), false);
  assert.equal(runs.finalize(root, { ...request, event_id: "event-finish" }).committed, true);
  assert.equal(runs.verify(root).ok, true);
});

test("a new run ID owned by a question rejects before file creation and allows a corrected run ID", t => {
  const root = project(t);
  question(root);
  const request = startRequest(root, "event-start", "question-known");
  const before = journal(root);
  rejectCode(() => runs.start(root, request), "DUPLICATE_ID");
  assert.deepEqual(journal(root), before);
  assert.equal(fs.existsSync(path.join(root, "runs")), false);
  assert.equal(runs.start(root, { ...request, run_id: "run-main" }).committed, true);
  assert.deepEqual(store.status(root).orphan_run_paths, []);
});

test("a new run and its start event cannot share an ID even when it is not in history", t => {
  const root = project(t);
  const request = startRequest(root, "event-start", "event-start");
  const before = journal(root);
  rejectCode(() => runs.start(root, request), "DUPLICATE_ID");
  assert.deepEqual(journal(root), before);
  assert.equal(fs.existsSync(path.join(root, "runs")), false);
  assert.equal(runs.start(root, { ...request, run_id: "run-main" }).committed, true);
  assert.deepEqual(store.status(root).orphan_run_paths, []);
});

for (const [firstName, secondName, expectedStatus, expectedType] of [
  ["failRun", "abandon", "failed", "run_failed"],
  ["abandon", "failRun", "abandoned", "run_abandoned"]
]) {
  test(firstName + " replay cannot be mistaken for " + secondName + " with identical request JSON", t => {
    const root = project(t);
    const start = startRequest(root);
    assert.equal(runs.start(root, start).replayed, false);
    assert.equal(runs.start(root, start).replayed, true);
    const request = { ...identities(root, "event-terminal"), run_id: "run-main", reason: "Fixture execution stopped." };
    const result = runs[firstName](root, request);
    assert.equal(result.committed, true);
    const before = journal(root);
    assert.equal(runs[firstName](root, request).replayed, true);
    rejectCode(() => runs[secondName](root, request), "EVENT_CONFLICT");
    // Trusted operation identity is set by the helper, not an options override.
    rejectCode(() => runs[secondName](root, request, { eventType: expectedType }), "EVENT_CONFLICT");
    assert.deepEqual(journal(root), before);
    assert.equal(state(root).runs[0].status, expectedStatus);
    assert.equal(store.history(root, { event_id: request.event_id }).events[0].request_sha256, legacyRequestHash(request));
    assert.equal(runs.verify(root).ok, true);
  });
}

test("rc.1 journal envelopes and request hashes remain readable and replayable without rewriting history", t => {
  const root = project(t);
  const init = { project_id: "project-test", event_id: "event-init" };
  const note = { event_id: "event-note", expected_project_id: "project-test", expected_last_event_id: "event-init",
    type: "memory_updated", payload: { changes: { project_understanding: { objective: "A legacy rc.1 project" } } } };
  const stamp = "2026-09-03T00:00:00.000Z";
  function envelope(request, type, payload, sequence, previous_event_id) {
    const event = { schema_version: 7, project_id: "project-test", event_id: request.event_id, sequence,
      previous_event_id, timestamp: stamp, type, payload, request_sha256: legacyRequestHash(request) };
    return { ...event, sha256: sha256(canonical(event)) };
  }
  const legacy = [envelope(init, "init", { project_understanding: {} }, 1, null),
    envelope(note, "memory_updated", note.payload, 2, "event-init")];
  fs.writeFileSync(path.join(root, "journal.jsonl"), legacy.map(canonical).join("\n") + "\n");
  const before = journal(root);
  assert.equal(state(root).project_understanding.objective, "A legacy rc.1 project");
  assert.equal(store.init(root, init, { eventType: "run_abandoned" }).replayed, true);
  assert.equal(store.record(root, { ...note, expected_last_event_id: "event-note" }, { eventType: "run_failed" }).replayed, true);
  assert.deepEqual(journal(root), before);
  assert.equal(store.status(root).projection_current, true);
});

test("transaction operation contract rejects missing or mismatched producer types without a journal append", t => {
  const root = project(t);
  const request = { ...identities(root, "event-note"), type: "memory_updated", payload: { changes: {} } };
  const before = journal(root);
  let invoked = false;
  rejectCode(() => store.transact(root, request, () => { invoked = true; }), "INVALID_INPUT");
  assert.equal(invoked, false);
  rejectCode(() => store.transact(root, request, () => ({ type: "run_failed", payload: {} }), { eventType: "memory_updated" }), "INVALID_EVENT");
  assert.deepEqual(journal(root), before);
});
