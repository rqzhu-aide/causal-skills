#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const { version } = require("../package.json");
const store = require("./lib/store.cjs");
const { fail, rootPath, recoverLock } = require("./lib/files.cjs");

function args(argv) {
  const result = { command: argv[0], options: {} };
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--") || Object.hasOwn(result.options, key.slice(2))) fail("INVALID_INPUT", "Invalid or duplicate option: " + key);
    if (key === "--repair-tail") { result.options["repair-tail"] = true; continue; }
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) fail("INVALID_INPUT", "Missing value: " + key);
    result.options[key.slice(2)] = argv[++i];
  }
  return result;
}
function readInput(file) {
  if (!file) fail("INVALID_INPUT", "--input <json-file|-> is required for this operation.");
  try { return JSON.parse(fs.readFileSync(file === "-" ? 0 : file, "utf8")); }
  catch (error) { fail("INVALID_INPUT", "Could not read JSON input: " + error.message); }
}
function main(argv) {
  const { command, options } = args(argv);
  if (!command || command === "help") {
    return { ok: true, version, commands: [
      "init", "status", "context", "record", "history", "recover", "recover-lock",
      "start-run", "write-run-file", "finalize-run", "fail-run", "abandon-run", "verify"
    ], usage: "node scripts/project.cjs <command> --project-root <folder> [--input <json-file|->]",
    guidance: "Read references/memory.md for semantic records; references/runs.md for output-producing work. verify --source-check snapshots checks an archive without original external source paths; default is originals." };
  }
  const allowed = {
    init: ["project-root", "input"], status: ["project-root"], context: ["project-root", "input"], record: ["project-root", "input"],
    history: ["project-root", "event-id", "record-id", "type", "query", "cursor", "limit"],
    recover: ["project-root", "repair-tail"], "recover-lock": ["project-root", "token"],
    "start-run": ["project-root", "input"], "write-run-file": ["project-root", "input"],
    "finalize-run": ["project-root", "input"], "fail-run": ["project-root", "input"],
    "abandon-run": ["project-root", "input"], verify: ["project-root", "source-check"]
  };
  if (!allowed[command] || Object.keys(options).some(k => !allowed[command].includes(k))) fail("INVALID_INPUT", "Unsupported command or option.");
  const root = options["project-root"];
  if (!root) fail("INVALID_INPUT", "--project-root is required.");
  if (command === "init") {
    if (options.input) return store.init(root, readInput(options.input));
    try {
      const existing = store.status(root);
      return { ok: true, already_initialized: true, project_id: existing.project.state_meta.project_id,
        last_event_id: existing.project.state_meta.last_event_id, sequence: existing.project.state_meta.sequence };
    } catch (error) {
      if (error.code !== "NO_PROJECT") throw error;
    }
    return store.init(root, { project_id: "project-" + crypto.randomUUID(), event_id: "event-" + crypto.randomUUID() });
  }
  if (command === "status") return store.status(root);
  if (command === "context") return store.context(root, options.input ? readInput(options.input) : {});
  if (command === "record") return store.record(root, readInput(options.input));
  if (command === "history") return store.history(root, {
    event_id: options["event-id"], record_id: options["record-id"], type: options.type,
    query: options.query, cursor: options.cursor, limit: options.limit
  });
  if (command === "recover") return store.recover(root, { repair_tail: options["repair-tail"] === true });
  if (command === "recover-lock") return { ok: true, ...recoverLock(rootPath(root), options.token) };
  const runs = require("./lib/runs.cjs");
  if (command === "verify") return runs.verify(root, options["source-check"] === undefined ? {} : { source_check: options["source-check"] });
  const operation = { "start-run": "start", "write-run-file": "write",
    "finalize-run": "finalize", "fail-run": "failRun", "abandon-run": "abandon" }[command];
  return runs[operation](root, readInput(options.input));
}

if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + "\n");
    if (result.ok === false) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, code: error.code || "INTERNAL_ERROR",
      message: error.message, ...(error.details === undefined ? {} : { details: error.details }) }) + "\n");
    process.exitCode = 1;
  }
}
module.exports = { main };
