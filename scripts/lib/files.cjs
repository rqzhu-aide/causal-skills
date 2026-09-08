"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

class ProjectError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
function fail(code, message, details) { throw new ProjectError(code, message, details); }
function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
  }
  const result = JSON.stringify(value);
  if (result === undefined) fail("INVALID_INPUT", "Values must be JSON serializable.");
  return result;
}
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");

function rootPath(value, create = false) {
  if (typeof value !== "string" || !value.trim()) fail("INVALID_INPUT", "An explicit project root is required.");
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) {
    if (!create) fail("NO_PROJECT", "Project directory does not exist.");
    fs.mkdirSync(resolved, { recursive: true });
  }
  if (!fs.statSync(resolved).isDirectory()) fail("UNSAFE_PATH", "Project root must be a directory.");
  return fs.realpathSync.native(resolved);
}

// All manager-owned paths are relative. Reject links even when they point inward.
function safePath(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) ||
      path.win32.isAbsolute(relative) || relative.includes("\0")) {
    fail("UNSAFE_PATH", "A nonempty relative project path is required.");
  }
  const parts = relative.replace(/\\/g, "/").split("/");
  if (parts.some(s => !s || s === "." || s === ".." || /[:<>|?*]/.test(s) ||
      /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) {
    fail("UNSAFE_PATH", "Unsafe path component: " + relative);
  }
  const target = path.resolve(root, ...parts);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) fail("UNSAFE_PATH", relative);
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) {
      fail("UNSAFE_PATH", "Linked manager path is not allowed: " + relative);
    }
    if (i < parts.length - 1 && !stat.isDirectory()) fail("UNSAFE_PATH", "Parent is not a directory: " + relative);
    const real = fs.realpathSync.native(current);
    const inside = path.relative(root, real);
    if (inside.startsWith(".." + path.sep) || path.isAbsolute(inside)) fail("UNSAFE_PATH", "Path escapes the project.");
  }
  return target;
}

function ensureDirectory(root, relative) {
  const target = safePath(root, relative);
  fs.mkdirSync(target, { recursive: true });
  safePath(root, relative);
  if (!fs.statSync(target).isDirectory()) fail("UNSAFE_PATH", "Expected a directory.");
  return target;
}
function readFile(root, relative) {
  const target = safePath(root, relative);
  if (!fs.statSync(target).isFile()) fail("UNSAFE_PATH", "Expected a regular file: " + relative);
  return fs.readFileSync(target);
}
function writeNew(root, relative, contents) {
  const target = safePath(root, relative);
  const fd = fs.openSync(target, "wx", 0o600);
  try { fs.writeFileSync(fd, contents); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  return target;
}
function atomicWrite(root, relative, contents) {
  const target = safePath(root, relative);
  const dir = path.posix.dirname(relative.replace(/\\/g, "/"));
  const tmp = (dir === "." ? "" : dir + "/") + ".tmp-" + crypto.randomUUID();
  writeNew(root, tmp, contents);
  try {
    safePath(root, relative);
    fs.renameSync(safePath(root, tmp), target);
  } finally {
    const temporary = safePath(root, tmp);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function assertNotLegacy(root) {
  if (fs.existsSync(path.join(root, "project_state.yaml"))) {
    fail("LEGACY_PROJECT", "This is a v6 project. Preserve it and initialize v7 in a new folder.");
  }
}
function readLock(root, name = ".consultant-write.lock") {
  try { return JSON.parse(readFile(root, name).toString("utf8")); }
  catch (error) {
    if (error.code === "ENOENT") return null;
    if (error.code === "UNSAFE_PATH") throw error;
    fail("LOCK_UNVERIFIED", "The writer lock cannot be verified; no lock was removed.");
  }
}
function withLock(root, callback) {
  assertNotLegacy(root);
  const recovery = safePath(root, ".consultant-recovery.lock");
  if (fs.existsSync(recovery)) fail("PROJECT_LOCKED", "Validated lock recovery is in progress.");
  const owner = { token: crypto.randomUUID(), pid: process.pid, host: os.hostname(), created_at: new Date().toISOString() };
  try { writeNew(root, ".consultant-write.lock", JSON.stringify(owner)); }
  catch (error) {
    if (error.code === "EEXIST") fail("PROJECT_LOCKED", "Another process holds the short writer lock.", readLock(root));
    throw error;
  }
  try {
    if (fs.existsSync(recovery)) fail("PROJECT_LOCKED", "Validated lock recovery is in progress.");
    return callback();
  } finally {
    const actual = readLock(root);
    if (actual && actual.token === owner.token) fs.unlinkSync(safePath(root, ".consultant-write.lock"));
  }
}
function recoverLock(root, token) {
  assertNotLegacy(root);
  const guard = ".consultant-recovery.lock";
  try { writeNew(root, guard, JSON.stringify({ pid: process.pid, host: os.hostname() })); }
  catch (error) {
    if (error.code === "EEXIST") fail("LOCK_UNVERIFIED", "Another lock recovery exists; no files were removed.");
    throw error;
  }
  try {
    const lock = readLock(root);
    if (!lock) return { recovered: false };
    if (!token || lock.token !== token || lock.host !== os.hostname() || !Number.isSafeInteger(lock.pid) || lock.pid <= 0) {
      fail("LOCK_UNVERIFIED", "Recovery needs the exact token of a same-host, identifiable dead owner.");
    }
    try {
      process.kill(lock.pid, 0);
      fail("PROJECT_LOCKED", "The lock owner is still alive.");
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
    if (readLock(root).token !== token) fail("LOCK_UNVERIFIED", "The lock changed during inspection.");
    fs.unlinkSync(safePath(root, ".consultant-write.lock"));
    return { recovered: true, previous_owner: lock };
  } finally { fs.unlinkSync(safePath(root, guard)); }
}

module.exports = {
  ProjectError, fail, canonical, sha256, rootPath, safePath, ensureDirectory,
  readFile, writeNew, atomicWrite, assertNotLegacy, withLock, recoverLock
};
