"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const files = require("../scripts/lib/files.cjs");
const store = require("../scripts/lib/store.cjs");

function aliasedProject(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const owned = fs.mkdtempSync(path.join(base, "cc-v7-path-alias-"));
  t.after(() => {
    const relative = path.relative(base, fs.realpathSync.native(owned));
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith("..") && relative.startsWith("cc-v7-path-alias-"));
    fs.rmSync(owned, { recursive: true, force: true });
  });
  const storage = path.join(owned, "storage");
  const alias = path.join(owned, "alias");
  const root = path.join(storage, "project");
  store.init(root, { project_id: "project-alias", event_id: "event-init" });
  try { fs.symlinkSync(storage, alias, process.platform === "win32" ? "junction" : "dir"); }
  catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error;
    t.skip("This host cannot create a directory alias: " + error.code);
    return null;
  }
  return { root: fs.realpathSync.native(root), alias: path.join(alias, "project"), owned };
}

test("journal reads accept a project reached through an aliased ancestor", t => {
  const project = aliasedProject(t);
  if (!project) return;
  const before = fs.readFileSync(path.join(project.root, "journal.jsonl"));
  assert.deepEqual(files.readFile(project.alias, "journal.jsonl"), before);
  assert.equal(store.readJournal(project.alias).events.length, 1);
  assert.equal(store.status(project.alias).project.state_meta.project_id, "project-alias");
  assert.deepEqual(fs.readFileSync(path.join(project.root, "journal.jsonl")), before);
});

test("writer locks through a project alias are inspected and released correctly", t => {
  const project = aliasedProject(t);
  if (!project) return;
  files.withLock(project.alias, () => {
    assert.equal(JSON.parse(files.readFile(project.alias, ".consultant-write.lock")).pid, process.pid);
    assert.throws(() => files.withLock(project.alias, () => assert.fail("lock entered twice")),
      error => error.code === "PROJECT_LOCKED");
  });
  assert.equal(fs.existsSync(path.join(project.root, ".consultant-write.lock")), false);
  const guard = path.join(project.root, ".consultant-recovery.lock");
  fs.writeFileSync(guard, "preserve this guard");
  assert.throws(() => files.recoverLock(project.alias, "unknown"), error => error.code === "LOCK_UNVERIFIED");
  assert.equal(fs.readFileSync(guard, "utf8"), "preserve this guard");
});

test("an aliased project still rejects traversal and linked manager children", t => {
  const project = aliasedProject(t);
  if (!project) return;
  assert.throws(() => files.safePath(project.alias, "../outside"), error => error.code === "UNSAFE_PATH");
  const outside = path.join(project.owned, "outside");
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(project.root, "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => files.writeNew(project.alias, "escape/changed.txt", "should not be written"),
    error => error.code === "UNSAFE_PATH");
  assert.deepEqual(fs.readdirSync(outside), []);
});
