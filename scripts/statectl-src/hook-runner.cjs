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

function pathContains(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function canonicalDirectory(candidate) {
  try {
    const resolved = fs.realpathSync.native(path.resolve(candidate));
    return fs.statSync(resolved).isDirectory() ? resolved : null;
  } catch (_error) {
    return null;
  }
}

function installedCodexProjectRoot(input, runtimeFile) {
  if (typeof runtimeFile !== "string" || !runtimeFile.trim()) return undefined;
  const resolvedFile = path.resolve(runtimeFile);
  const resolvedDirectory = path.dirname(resolvedFile);
  if (path.basename(resolvedDirectory) !== ".codex") return undefined;
  try {
    const fileStatus = fs.lstatSync(resolvedFile);
    const directoryStatus = fs.lstatSync(resolvedDirectory);
    if (!fileStatus.isFile() || fileStatus.isSymbolicLink() || directoryStatus.isSymbolicLink()) return null;
  } catch (_error) {
    return null;
  }
  const canonicalFile = fs.realpathSync.native(resolvedFile);
  const canonicalRuntimeDirectory = path.dirname(canonicalFile);
  if (path.basename(canonicalRuntimeDirectory) !== ".codex") return null;
  const projectRoot = canonicalDirectory(path.dirname(canonicalRuntimeDirectory));
  if (projectRoot === null) return null;

  const workingDirectories = [process.cwd()];
  if (input && typeof input.cwd === "string" && input.cwd.trim()) {
    workingDirectories.push(input.cwd.trim());
  }
  for (const workingDirectory of workingDirectories) {
    const canonicalWorkingDirectory = canonicalDirectory(workingDirectory);
    if (canonicalWorkingDirectory === null || !pathContains(projectRoot, canonicalWorkingDirectory)) {
      return null;
    }
  }
  return projectRoot;
}

function claudeProjectRoot(input) {
  const explicit = firstPath([
    input && typeof input.projectRoot === "string" ? input.projectRoot : null,
    process.env.CLAUDE_PROJECT_DIR,
  ]);
  if (explicit) return path.resolve(explicit);

  const cwd = firstPath([
    input && typeof input.cwd === "string" ? input.cwd : null,
    process.env.PWD,
    process.cwd(),
  ]) || process.cwd();
  return nearestStateRoot(cwd) || path.resolve(cwd);
}

function codexProjectRoot(input, runtimeFile) {
  const installedRoot = installedCodexProjectRoot(input, runtimeFile);
  if (installedRoot !== undefined) return installedRoot;

  const explicit = firstPath([
    input && typeof input.projectRoot === "string" ? input.projectRoot : null,
  ]);
  if (explicit) return path.resolve(explicit);

  const cwd = firstPath([
    input && typeof input.cwd === "string" ? input.cwd : null,
    process.cwd(),
    process.env.PWD,
  ]) || process.cwd();
  const activeRoot = nearestStateRoot(cwd);
  if (activeRoot) return activeRoot;

  const hostRoot = firstPath([process.env.CODEX_PROJECT_DIR]);
  if (hostRoot) {
    const resolvedHostRoot = nearestStateRoot(hostRoot) || path.resolve(hostRoot);
    if (pathContains(resolvedHostRoot, cwd)) return resolvedHostRoot;
  }
  return path.resolve(cwd);
}

function runHook(host, options = {}) {
  if (host !== "claude" && host !== "codex") throw new Error(`unsupported hook host: ${host}`);
  try {
    const input = readInput();
    const stopHookActive = input && input.stop_hook_active === true;
    const projectRoot = host === "codex"
      ? codexProjectRoot(input, options.runtimeFile)
      : claudeProjectRoot(input);
    if (host === "codex" && projectRoot === null) return;
    const result = validateProject({ projectRoot });
    if (!result.ok && result.code === "MISSING_STATE") {
      // The optional hook stays silent in projects where the consultant has
      // never created state, on both hosts.
    } else if (result.active_operation !== null || result.plan.length > 0) {
      const stage = result.active_operation === null ? "planned" : result.active_operation.stage;
      const actor = result.plan_actor === null ? "unassigned" : result.plan_actor;
      if (stopHookActive) {
        emit({
          systemMessage: `causal-consultant operation remains unfinished (stage: ${stage}, actor: ${actor}); allowing stop after a prior block. The next causal-consultant turn resumes it, or cancel it explicitly.`,
          suppressOutput: true,
        });
      } else {
        emit({
          decision: "block",
          reason: `causal-consultant operation is still active (stage: ${stage}, actor: ${actor}); run statectl open, resume it, and finish or cancel before stopping.`,
          systemMessage: "project_state.yaml contains an unfinished causal-consultant operation.",
        });
      }
    } else if (result.warnings.length) {
      emit({
        systemMessage: `project_state.yaml is valid, with ${result.warnings.length} unavailable or incomplete artifact reference(s).`,
        suppressOutput: true,
      });
    } else if (host === "claude") {
      emit({ suppressOutput: true });
    }
  } catch (error) {
    emit({
      systemMessage: error instanceof StateError
        ? `project_state.yaml failed strict validation (${error.code}); run causal-consultant preflight and report its recovery boundary.`
        : "project_state.yaml validation failed unexpectedly; run causal-consultant preflight before normal work.",
      suppressOutput: true,
    });
  }
}

module.exports = { runHook };
