#!/usr/bin/env node
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { StateError, validateProject } = require("./core.cjs");

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function readInput() {
  try {
    const text = fs.readFileSync(0, "utf8").trim();
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    return {};
  }
}

function firstPath(values) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return value ? value.trim() : null;
}

function nearestStateRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, "project_state.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function projectRootFrom(input) {
  const explicit = firstPath([
    input && typeof input.projectRoot === "string" ? input.projectRoot : null,
    process.env.CLAUDE_PROJECT_DIR,
    process.env.CODEX_PROJECT_DIR,
  ]);
  if (explicit) return path.resolve(explicit);

  const cwd = firstPath([
    input && typeof input.cwd === "string" ? input.cwd : null,
    process.env.PWD,
    process.cwd(),
  ]) || process.cwd();
  return nearestStateRoot(cwd) || path.resolve(cwd);
}

try {
  const result = validateProject({ projectRoot: projectRootFrom(readInput()) });
  if (!result.ok && result.code === "MISSING_STATE") {
    emit({
      systemMessage: "project_state.yaml does not exist; causal-consultant persistence is not active.",
      suppressOutput: true,
    });
  } else if (result.active_operation !== null || result.plan.length > 0) {
    emit({
      decision: "block",
      reason: "causal-consultant operation is still active; resume it and finish or cancel before stopping.",
      systemMessage: "project_state.yaml contains an unfinished v5 operation.",
    });
  } else if (result.warnings.length) {
    emit({
      systemMessage: `project_state.yaml is valid, with ${result.warnings.length} unavailable or incomplete artifact reference(s).`,
      suppressOutput: true,
    });
  } else {
    emit({ suppressOutput: true });
  }
} catch (error) {
  emit({
    decision: "block",
    reason: `project_state.yaml validation failed: ${error && error.message ? error.message : String(error)}`,
    systemMessage: error instanceof StateError
      ? `project_state.yaml failed strict validation (${error.code}).`
      : "project_state.yaml validation failed unexpectedly.",
  });
}
