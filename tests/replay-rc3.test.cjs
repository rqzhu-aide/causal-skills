"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const model = require("../scripts/lib/model.cjs");
const store = require("../scripts/lib/store.cjs");
const { canonical, sha256 } = require("../scripts/lib/files.cjs");
const fixture = require("./fixtures/state-examples.json");
const TIME = "2026-09-07T00:00:00.000Z";

function temp(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "cc-v7-replay-"));
  t.after(() => {
    const relative = path.relative(base, root);
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith("..") && relative.startsWith("cc-v7-replay-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}
function stream() {
  let state = model.emptyState(fixture.init.project_id, TIME);
  const events = [];
  function append(type, payload, event_id) {
    const event = { schema_version: 7, project_id: fixture.init.project_id, event_id,
      sequence: events.length + 1, previous_event_id: state.state_meta.last_event_id,
      timestamp: TIME, type, payload: structuredClone(payload),
      request_sha256: sha256(canonical({ event_id, type, payload })) };
    event.sha256 = sha256(canonical(event));
    state = model.applyEvent(state, event);
    events.push(event);
  }
  append("init", { project_understanding: fixture.init.project_understanding }, fixture.init.event_id);
  for (const example of fixture.records) append(example.request.type, example.request.payload, example.request.event_id);
  append("run_started", { run: { run_id: "run-replay", kind: "audit", status: "in_progress" } }, "event-run-start");
  append("run_finalized", { run: { run_id: "run-replay", kind: "audit", status: "completed" } }, "event-run-complete");
  return { events, state };
}
function errorOutcome(action) {
  try { action(); return null; } catch (error) { return { code: error.code, message: error.message }; }
}
function journal(root, events, tail = "") {
  const text = events.map(canonical).join("\n") + "\n" + tail;
  fs.writeFileSync(path.join(root, "journal.jsonl"), text);
  return Buffer.from(text);
}
function rehash(event) {
  const { sha256: old, ...unsigned } = event;
  return { ...unsigned, sha256: sha256(canonical(unsigned)) };
}

test("private replay and public copy reduction agree at every event without changing source payloads", () => {
  const { events, state: expected } = stream();
  const before = canonical(events);
  const builder = model.createReplayBuilder(fixture.init.project_id, TIME);
  let publicState = model.emptyState(fixture.init.project_id, TIME);
  let replayed;
  for (const event of events) {
    const old = structuredClone(publicState);
    const next = model.applyEvent(publicState, event);
    assert.deepEqual(publicState, old, "Public reduction must preserve the preceding snapshot.");
    replayed = builder.apply(event);
    assert.deepEqual(replayed, next);
    publicState = next;
  }
  assert.deepEqual(replayed, expected);
  assert.equal(canonical(events), before, "Replay must not mutate hash-covered event payloads.");
  replayed.questions[0].statement = "Mutation of a returned in-memory result";
  assert.equal(canonical(events), before, "State records must not alias source events.");
  assert.notEqual(publicState.questions[0].statement, replayed.questions[0].statement);
});

test("private replay preserves complete-record replacement rather than introducing field-level merges", () => {
  const { events } = stream();
  const builder = model.createReplayBuilder(fixture.init.project_id, TIME);
  let state;
  for (const event of events) state = builder.apply(event);
  const question = state.questions[0];
  const replacement = { question_id: question.question_id, statement: question.statement, status: "open" };
  const event = { schema_version: 7, project_id: fixture.init.project_id, event_id: "event-replace-question",
    sequence: events.length + 1, previous_event_id: state.state_meta.last_event_id, timestamp: TIME,
    type: "memory_updated", payload: { changes: { questions: [replacement] } } };
  const next = builder.apply(event);
  assert.deepEqual(next.questions.find(row => row.question_id === question.question_id), replacement);
});

test("private replay rejects malformed next events with the public reducer's code and message", () => {
  const { events, state } = stream();
  const valid = { schema_version: 7, project_id: fixture.init.project_id, event_id: "event-next",
    sequence: events.length + 1, previous_event_id: state.state_meta.last_event_id, timestamp: TIME,
    type: "memory_updated", payload: { changes: {} } };
  const malformed = [
    { ...valid, sequence: 1 },
    { ...valid, previous_event_id: "event-missing" },
    { ...valid, project_id: "project-other" },
    { ...valid, schema_version: 8 },
    { ...valid, event_id: events[0].event_id },
    { ...valid, timestamp: "" },
    { ...valid, surprise: true },
    { ...valid, type: "init", payload: { project_understanding: {} } },
    { ...valid, payload: { changes: { questions: [{ question_id: "question-new", statement: "A question?", status: "answered" }] } } },
    { ...valid, payload: { changes: { assumptions: [{ assumption_id: "assumption-new", statement: "An assumption", status: "active", basis_refs: ["unknown-evidence"] }] } } },
    { ...valid, type: "run_finalized", payload: { run: { run_id: "run-unknown", status: "completed" } } },
    { ...valid, type: "run_started", payload: { run: { run_id: "run-replay", status: "in_progress" } } },
    { ...valid, type: "run_failed", payload: { run: { run_id: "run-replay", status: "completed" } } }
  ];
  for (const event of malformed) {
    const builder = model.createReplayBuilder(fixture.init.project_id, TIME);
    for (const prior of events) builder.apply(prior);
    const original = structuredClone(state);
    const expected = errorOutcome(() => model.applyEvent(state, event));
    assert.ok(expected, "The malformed fixture must be rejected.");
    assert.deepEqual(errorOutcome(() => builder.apply(event)), expected);
    assert.deepEqual(state, original, "Public error handling must preserve the prior snapshot.");
  }
});

test("journal replay retains byte identity, ignores stale projection content, and reports incomplete tails", t => {
  const root = temp(t);
  const { events, state } = stream();
  const bytes = journal(root, events);
  fs.writeFileSync(path.join(root, "project.yaml"), "{}");
  const loaded = store.readJournal(root);
  assert.deepEqual(loaded.state, state);
  assert.equal(loaded.projection_current, false);
  assert.deepEqual(loaded.committed_bytes, bytes);
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), bytes);
  const tail = '{"partial":';
  journal(root, events, tail);
  assert.equal(errorOutcome(() => store.readJournal(root)).code, "INCOMPLETE_JOURNAL");
  const recovering = store.readJournal(root, true);
  assert.deepEqual(recovering.state, state);
  assert.equal(recovering.tail.toString(), tail);
  assert.deepEqual(recovering.committed_bytes, bytes);
});

test("replay optimization cannot accept hash-valid malformed interior events or repair them from projection", t => {
  const root = temp(t);
  const { events, state } = stream();
  fs.writeFileSync(path.join(root, "project.yaml"), JSON.stringify(state));
  for (const change of [
    event => ({ ...event, previous_event_id: "event-missing" }),
    event => ({ ...event, payload: { changes: { questions: [{ question_id: "question-broken", statement: "A missing resolution", status: "answered" }] } } }),
    event => ({ ...event, payload: { changes: { assumptions: [{ assumption_id: "assumption-broken", statement: "Missing reference", status: "active", basis_refs: ["unknown-evidence"] }] } } })
  ]) {
    const altered = structuredClone(events);
    altered[2] = rehash({ ...change(altered[2]), type: "memory_updated" });
    const before = journal(root, altered);
    assert.equal(errorOutcome(() => store.readJournal(root)).code, "CORRUPT_STATE");
    assert.equal(errorOutcome(() => store.recover(root, { repair_tail: true })).code, "CORRUPT_STATE");
    assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), before);
  }
  const altered = structuredClone(events);
  altered[2].timestamp = "changed without rehashing";
  journal(root, altered);
  assert.equal(errorOutcome(() => store.readJournal(root)).code, "CORRUPT_STATE");
});
