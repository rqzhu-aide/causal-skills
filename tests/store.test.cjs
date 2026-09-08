"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const store = require("../scripts/lib/store.cjs");
const files = require("../scripts/lib/files.cjs");
const cli = path.resolve(__dirname, "../scripts/project.cjs");

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-v7-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  store.init(root, { project_id: "project-test", event_id: "event-init", project_understanding: { objective: "Clinic adoption" } });
  return root;
}
function request(event = "event-note", previous = "event-init") {
  return { event_id: event, expected_project_id: "project-test", expected_last_event_id: previous,
    type: "memory_updated", payload: { changes: { questions: [{ question_id: "question-assignment",
      statement: "How was adoption assigned?", status: "open" }] } } };
}
function rejectsCode(fn, code) { assert.throws(fn, error => error.code === code); }

test("journal is authoritative and status is a nonmutating reconstruction", t => {
  const root = project(t);
  const saved = fs.readFileSync(path.join(root, "project.yaml"));
  store.record(root, request());
  fs.writeFileSync(path.join(root, "project.yaml"), saved);
  const result = store.status(root);
  assert.equal(result.projection_current, false);
  assert.equal(result.project.questions[0].statement, "How was adoption assigned?");
  assert.deepEqual(fs.readFileSync(path.join(root, "project.yaml")), saved);
  store.recover(root);
  assert.equal(store.status(root).projection_current, true);
});
test("wrong project, stale update and reused event content do not mutate history", t => {
  const root = project(t);
  const before = fs.readFileSync(path.join(root, "journal.jsonl"));
  rejectsCode(() => store.record(root, { ...request(), expected_project_id: "another-project" }), "WRONG_PROJECT");
  rejectsCode(() => store.record(root, { ...request(), expected_last_event_id: "unknown-event" }), "STALE_WRITE");
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), before);
  store.record(root, request());
  const committed = fs.readFileSync(path.join(root, "journal.jsonl"));
  assert.equal(store.record(root, request()).replayed, true);
  const conflicting = request(); conflicting.payload.changes.questions[0].statement = "Different question";
  rejectsCode(() => store.record(root, conflicting), "EVENT_CONFLICT");
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), committed);
});
test("malformed mutation requests fail without creating or changing project files", t => {
  const root = project(t);
  const before = fs.readFileSync(path.join(root, "journal.jsonl"));
  for (const value of [null, false, [], "invalid"]) rejectsCode(() => store.record(root, value), "INVALID_INPUT");
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), before);
});
test("failure before append leaves history intact; failure after append preserves commitment", t => {
  const root = project(t);
  const before = fs.readFileSync(path.join(root, "journal.jsonl"));
  assert.throws(() => store.record(root, request(), { hooks: { beforeAppend() { throw Error("injected"); } } }), /injected/);
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), before);
  const result = store.record(root, request(), { hooks: { afterAppend() { throw Error("projection interrupted"); } } });
  assert.equal(result.committed, true);
  assert.equal(result.projection_written, false);
  assert.equal(store.status(root).project.state_meta.last_event_id, "event-note");
  assert.equal(store.record(root, request()).replayed, true);
  assert.equal(store.history(root).total, 2);
  assert.equal(store.status(root).projection_current, true);
});
test("trailing partial journal bytes are preserved by explicit recovery", t => {
  const root = project(t);
  const committed = fs.readFileSync(path.join(root, "journal.jsonl"));
  const partial = Buffer.from('{"incomplete":');
  fs.appendFileSync(path.join(root, "journal.jsonl"), partial);
  rejectsCode(() => store.status(root), "INCOMPLETE_JOURNAL");
  rejectsCode(() => store.record(root, request()), "INCOMPLETE_JOURNAL");
  const recovery = store.recover(root, { repair_tail: true });
  assert.deepEqual(fs.readFileSync(path.join(root, recovery.preserved_tail)), partial);
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), committed);
  assert.equal(store.status(root).project.state_meta.last_event_id, "event-init");
});
test("interior corruption cannot be silently repaired from the projection", t => {
  const root = project(t);
  const journal = path.join(root, "journal.jsonl");
  const corrupt = fs.readFileSync(journal, "utf8").replace("Clinic adoption", "Edited outside the journal");
  fs.writeFileSync(journal, corrupt);
  rejectsCode(() => store.status(root), "CORRUPT_STATE");
  rejectsCode(() => store.recover(root, { repair_tail: true }), "CORRUPT_STATE");
  assert.equal(fs.readFileSync(journal, "utf8"), corrupt);
});
test("history exposes old resolved questions and supports explicit pagination", t => {
  const root = project(t);
  let previous = "event-init";
  for (let i = 0; i < 40; i++) {
    const record = request("event-q-" + i, previous);
    record.payload.changes.questions = [{ question_id: "question-" + i, statement: "Historical fact " + i,
      status: "answered", reason: "Resolution " + i }];
    store.record(root, record);
    previous = record.event_id;
  }
  assert.equal(store.status(root).project.questions.length, 40);
  assert.equal(Object.hasOwn(store.status(root).project, "history_index"), false);
  assert.ok(store.readJournal(root).state.history_index["question-0"]);
  const old = store.history(root, { record_id: "question-0" });
  assert.equal(old.events.length, 1);
  assert.equal(old.events[0].payload.changes.questions[0].reason, "Resolution 0");
  const page = store.history(root, { limit: 10 });
  assert.equal(page.events.length, 10);
  assert.equal(page.next_cursor, 10);
});
test("legacy projects are refused without any generated v7 files", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-v7-legacy-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "project_state.yaml"), "legacy: untouched\n");
  const before = fs.readdirSync(root);
  rejectsCode(() => store.init(root, { project_id: "project-test", event_id: "event-init" }), "LEGACY_PROJECT");
  assert.deepEqual(fs.readdirSync(root), before);
  assert.equal(fs.readFileSync(path.join(root, "project_state.yaml"), "utf8"), "legacy: untouched\n");
});
test("manager paths reject traversal and linked ancestors", t => {
  const root = project(t);
  for (const value of ["../outside", "runs/../../outside", "C:\\outside", "file:stream", "runs/con/file"]) {
    rejectsCode(() => files.safePath(root, value), "UNSAFE_PATH");
  }
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "cc-v7-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  try { fs.symlinkSync(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.diagnostic("Link test unavailable: " + error.code); return; }
    throw error;
  }
  rejectsCode(() => files.writeNew(root, "escape/bad.txt", "bad"), "UNSAFE_PATH");
  assert.deepEqual(fs.readdirSync(outside), []);
});
test("short writer lock rejects another process and never steals a live owner", t => {
  const root = project(t);
  files.withLock(root, () => {
    const child = spawnSync(process.execPath, [cli, "record", "--project-root", root, "--input", "-"],
      { input: JSON.stringify(request()), encoding: "utf8" });
    assert.equal(JSON.parse(child.stdout).code, "PROJECT_LOCKED");
    const owner = JSON.parse(fs.readFileSync(path.join(root, ".consultant-write.lock")));
    rejectsCode(() => files.recoverLock(root, owner.token), "PROJECT_LOCKED");
  });
  assert.equal(store.history(root).total, 1);
});
test("CLI initialization is repeatable and ordinary status does not need hooks", t => {
  const root = project(t);
  const before = fs.readFileSync(path.join(root, "journal.jsonl"));
  const child = spawnSync(process.execPath, [cli, "init", "--project-root", root], { encoding: "utf8" });
  assert.equal(child.status, 0);
  assert.equal(JSON.parse(child.stdout).already_initialized, true);
  assert.deepEqual(fs.readFileSync(path.join(root, "journal.jsonl")), before);
  assert.equal(fs.existsSync(path.join(root, ".codex")), false);
});
test("an abandoned recovery guard is preserved for explicit offline operator recovery", t => {
  const root = project(t);
  const exited = spawnSync(process.execPath, ["-e", "process.exit(0)"], { encoding: "utf8" });
  const guard = path.join(root, ".consultant-recovery.lock");
  const contents = JSON.stringify({ pid: exited.pid, host: os.hostname() });
  fs.writeFileSync(guard, contents);
  rejectsCode(() => store.record(root, request()), "PROJECT_LOCKED");
  rejectsCode(() => files.recoverLock(root, "unknown"), "LOCK_UNVERIFIED");
  assert.equal(fs.readFileSync(guard, "utf8"), contents);
  assert.equal(store.history(root).total, 1);
});
