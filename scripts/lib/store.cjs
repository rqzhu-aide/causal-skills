"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const {
  fail, canonical, sha256, rootPath, safePath, ensureDirectory, readFile,
  writeNew, atomicWrite, assertNotLegacy, withLock
} = require("./files.cjs");
const { emptyState, validateSemantic, applyEvent, createReplayBuilder } = require("./model.cjs");

const TYPES = new Set(["init", "checkpoint", "memory_updated", "review_completed", "correction",
  "run_started", "run_finalized", "run_failed", "run_abandoned"]);
const ID = /^[a-z][a-z0-9_-]{0,79}$/;
function id(value, label) {
  if (typeof value !== "string" || !ID.test(value)) fail("INVALID_INPUT", label + " must be a lowercase project-local ID.");
}
function parseJSON(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail("CORRUPT_STATE", label + " is not valid JSON."); }
}
function payloadHash(request) {
  const copy = { ...request };
  delete copy.expected_last_event_id;
  return sha256(canonical(copy));
}
function readJournal(root, allowTail = false) {
  assertNotLegacy(root);
  let bytes;
  try { bytes = readFile(root, "journal.jsonl"); }
  catch (error) {
    if (error.code === "ENOENT") fail("NO_PROJECT", "No v7 journal exists. Initialize a new v7 project explicitly.");
    throw error;
  }
  const end = bytes.lastIndexOf(10) + 1;
  const tail = bytes.subarray(end);
  if (tail.length && !allowTail) fail("INCOMPLETE_JOURNAL", "Uncommitted trailing bytes need explicit recovery.", { trailing_bytes: tail.length });
  const lines = bytes.subarray(0, end).toString("utf8").split("\n");
  lines.pop();
  if (!lines.length) fail("CORRUPT_STATE", "The journal has no committed initialization event.");
  const events = [];
  const seen = new Set();
  let state, replay;
  for (let index = 0; index < lines.length; index++) {
    const event = parseJSON(Buffer.from(lines[index]), "Journal record " + (index + 1));
    if (!event || typeof event !== "object" || Array.isArray(event)) fail("CORRUPT_STATE", "Invalid journal envelope.");
    const { sha256: hash, ...unsigned } = event;
    if (hash !== sha256(canonical(unsigned))) fail("CORRUPT_STATE", "Journal content hash mismatch at record " + (index + 1));
    if (event.schema_version !== 7 || event.sequence !== index + 1 || !TYPES.has(event.type) ||
        !ID.test(event.event_id) || seen.has(event.event_id) || typeof event.timestamp !== "string" ||
        !/^[a-f0-9]{64}$/.test(event.request_sha256 || "")) {
      fail("CORRUPT_STATE", "Invalid journal identity, sequence, or event type.");
    }
    if (index === 0) {
      if (event.type !== "init" || event.previous_event_id !== null || !ID.test(event.project_id)) {
        fail("CORRUPT_STATE", "The first event must initialize one project.");
      }
      state = emptyState(event.project_id, event.timestamp);
      replay = createReplayBuilder(event.project_id, event.timestamp);
    } else if (event.type === "init" || event.project_id !== state.state_meta.project_id ||
        event.previous_event_id !== events[index - 1].event_id) {
      fail("CORRUPT_STATE", "Journal predecessor or project identity mismatch.");
    }
    try {
      state = replay.apply(event);
    } catch (error) {
      fail("CORRUPT_STATE", "Invalid committed event " + event.event_id + ": " + error.message);
    }
    seen.add(event.event_id);
    events.push(event);
  }
  let projection = null;
  try { projection = parseJSON(readFile(root, "project.yaml"), "Projection"); }
  catch (error) {
    if (!["ENOENT", "CORRUPT_STATE"].includes(error.code)) throw error;
  }
  return { root, state, events, tail, committed_bytes: bytes.subarray(0, end),
    projection_current: projection !== null && canonical(projection) === canonical(state) };
}

function receipt(event, extra = {}) {
  return { ok: true, project_id: event.project_id, last_event_id: event.event_id,
    sequence: event.sequence, committed: true, ...extra };
}
function writeProjection(root, state, hooks = {}) {
  if (hooks.beforeProjection) hooks.beforeProjection();
  atomicWrite(root, "project.yaml", JSON.stringify(state, null, 2) + "\n");
}
function append(root, event) {
  const target = safePath(root, "journal.jsonl");
  const flags = fs.existsSync(target)
    ? fs.constants.O_WRONLY | fs.constants.O_APPEND | (fs.constants.O_NOFOLLOW || 0)
    : fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL;
  const fd = fs.openSync(target, flags, 0o600);
  try {
    const bytes = Buffer.from(canonical(event) + "\n");
    let written = 0;
    while (written < bytes.length) written += fs.writeSync(fd, bytes, written, bytes.length - written);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
}

// Producer runs inside the short writer lock. It performs only bookkeeping/file
// checks, never model reasoning or target computation. Public record cannot emit runs.
function transact(projectRoot, request, producer, options = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("INVALID_INPUT", "A mutation request must be an object.");
  if (!TYPES.has(options.eventType)) fail("INVALID_INPUT", "A transaction requires its expected event type.");
  const root = rootPath(projectRoot, options.initializing === true);
  assertNotLegacy(root);
  id(request.event_id, "event_id");
  const fingerprint = payloadHash(request);
  return withLock(root, () => {
    let loaded;
    if (options.initializing && !fs.existsSync(safePath(root, "journal.jsonl"))) {
      if (fs.existsSync(safePath(root, "project.yaml"))) fail("ORPHAN_PROJECTION", "A projection exists without its authoritative journal.");
      id(request.project_id, "project_id");
      loaded = { root, state: emptyState(request.project_id, new Date().toISOString()), events: [] };
    } else {
      loaded = readJournal(root);
    }
    const prior = loaded.events.find(e => e.event_id === request.event_id);
    if (prior) {
      // Keep the original request hash format so rc.1 events remain replayable.
      if (prior.type !== options.eventType || prior.request_sha256 !== fingerprint) {
        fail("EVENT_CONFLICT", "This event ID was committed for a different operation or content.");
      }
      let projectionWritten = true;
      try { writeProjection(root, loaded.state, options.hooks); }
      catch { projectionWritten = false; }
      return receipt(prior, { replayed: true, projection_written: projectionWritten,
        current_last_event_id: loaded.state.state_meta.last_event_id });
    }
    if (options.initializing && loaded.events.length) fail("ALREADY_INITIALIZED", "This project is already initialized; no files were replaced.");
    if (!options.initializing) {
      if (request.expected_project_id !== loaded.state.state_meta.project_id) fail("WRONG_PROJECT", "The request belongs to a different project.");
      if (request.expected_last_event_id !== loaded.state.state_meta.last_event_id) {
        fail("STALE_WRITE", "Project history changed. Read current state before revising the request.", {
          current_last_event_id: loaded.state.state_meta.last_event_id
        });
      }
    }
    if (Object.hasOwn(loaded.state.history_index, request.event_id)) {
      fail("DUPLICATE_ID", "Event identity is already present: " + request.event_id);
    }
    const prepared = producer(loaded);
    if (!prepared || !TYPES.has(prepared.type)) fail("INVALID_INPUT", "Unknown event type.");
    if (prepared.type !== options.eventType) fail("INVALID_EVENT", "Produced event does not match the requested operation.");
    const event = {
      schema_version: 7, project_id: loaded.state.state_meta.project_id,
      event_id: request.event_id, sequence: loaded.events.length + 1,
      previous_event_id: loaded.events.length ? loaded.events.at(-1).event_id : null,
      timestamp: new Date().toISOString(), type: prepared.type, payload: prepared.payload,
      request_sha256: fingerprint
    };
    event.sha256 = sha256(canonical(event));
    const next = applyEvent(loaded.state, event);
    if (options.hooks && options.hooks.beforeAppend) options.hooks.beforeAppend();
    try { append(root, event); }
    catch (error) {
      fail("COMMIT_UNCERTAIN", "Journal write did not finish normally. Inspect history before retrying this event.", {
        event_id: event.event_id, cause: error.message
      });
    }
    try {
      if (options.hooks && options.hooks.afterAppend) options.hooks.afterAppend();
      writeProjection(root, next, options.hooks);
      return receipt(event, { replayed: false, projection_written: true, ...(prepared.result || {}) });
    } catch (error) {
      return receipt(event, { replayed: false, projection_written: false, ...(prepared.result || {}),
        warning: "The event committed, but projection delivery failed. Do not repeat the work; status reconstructs from the journal.",
        projection_error: error.message });
    }
  });
}
function init(projectRoot, request, options = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("INVALID_INPUT", "Initialization needs an object.");
  const allowed = ["project_id", "event_id", "project_understanding"];
  if (Object.keys(request).some(k => !allowed.includes(k))) fail("INVALID_INPUT", "Unknown initialization field.");
  return transact(projectRoot, request, ({ state }) => {
    const changes = { project_understanding: request.project_understanding || {} };
    validateSemantic(state, { event_id: request.event_id, expected_project_id: request.project_id,
      expected_last_event_id: null, type: "memory_updated", payload: { changes } });
    return { type: "init", payload: { project_understanding: changes.project_understanding } };
  }, { ...options, initializing: true, eventType: "init" });
}
function record(projectRoot, request, options = {}) {
  return transact(projectRoot, request, ({ root, state }) => {
    validateSemantic(state, request);
    for (const evidence of request.payload.changes?.evidence || []) {
      if (evidence.kind === "computed") require("./runs.cjs").assertComputedEvidence(root, state, evidence);
    }
    return { type: request.type, payload: request.payload };
  }, { ...options, eventType: request?.type });
}
function orphanRuns(root, state) {
  const directory = safePath(root, "runs");
  if (!fs.existsSync(directory)) return [];
  if (!fs.statSync(directory).isDirectory()) fail("UNSAFE_PATH", "runs must be a directory.");
  const known = new Set(state.runs.map(r => r.run_id));
  return fs.readdirSync(directory).filter(name => !known.has(name));
}
function status(projectRoot) {
  const loaded = readJournal(rootPath(projectRoot));
  const { history_index, ...context } = loaded.state;
  return { ok: true, project: context, projection_current: loaded.projection_current,
    orphan_run_paths: orphanRuns(loaded.root, loaded.state),
    incomplete_run_ids: loaded.state.runs.filter(r => r.status === "in_progress").map(r => r.run_id) };
}
function context(projectRoot, request = {}) {
  const loaded = readJournal(rootPath(projectRoot));
  const selected = require("./context.cjs").selectContext(loaded, request);
  return { ok: true, project_id: loaded.state.state_meta.project_id,
    last_event_id: loaded.state.state_meta.last_event_id, sequence: loaded.state.state_meta.sequence,
    projection_current: loaded.projection_current, orphan_run_paths: orphanRuns(loaded.root, loaded.state), ...selected };
}
function history(projectRoot, options = {}) {
  const { events } = readJournal(rootPath(projectRoot));
  const cursor = Number(options.cursor || 0);
  const limit = Number(options.limit || 10);
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    fail("INVALID_INPUT", "History needs a nonnegative cursor and a limit from 1 to 100.");
  }
  const chosen = events.filter(e => {
    if (options.event_id && e.event_id !== options.event_id) return false;
    if (options.type && e.type !== options.type) return false;
    if (options.record_id && !canonical(e.payload).includes(JSON.stringify(options.record_id))) return false;
    if (options.query && !canonical(e).toLowerCase().includes(String(options.query).toLowerCase())) return false;
    return true;
  });
  const page = chosen.slice(cursor, cursor + limit);
  return { ok: true, events: page, total: chosen.length,
    next_cursor: cursor + page.length < chosen.length ? cursor + page.length : null };
}
function recover(projectRoot, options = {}) {
  const root = rootPath(projectRoot);
  return withLock(root, () => {
    const loaded = readJournal(root, options.repair_tail === true);
    let preservedTail;
    if (loaded.tail.length) {
      if (!options.repair_tail) fail("INCOMPLETE_JOURNAL", "Explicit trailing-byte repair is required.");
      ensureDirectory(root, "recovery");
      preservedTail = "recovery/journal-tail-" + crypto.randomUUID() + ".bin";
      writeNew(root, preservedTail, loaded.tail);
      atomicWrite(root, "journal.jsonl", loaded.committed_bytes);
    }
    writeProjection(root, loaded.state);
    return { ok: true, project_id: loaded.state.state_meta.project_id,
      last_event_id: loaded.state.state_meta.last_event_id,
      projection_written: true, ...(preservedTail ? { preserved_tail: preservedTail } : {}) };
  });
}

module.exports = { id, parseJSON, readJournal, transact, init, record, status, context, history, recover, orphanRuns };
