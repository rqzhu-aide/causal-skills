#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  StateError,
  applyWorker,
  beginOperation,
  finishOperation,
  openProject,
  reserveArtifact,
  validateProject,
  validateTemplate,
} = require("./core.cjs");
const {
  CONTEXT_PROTOCOL,
  ContextFileError,
  compactContextResult,
  deliveryWarning,
  preflightContextFile,
  removeOwnedContextFile,
  writeFullCapsule,
} = require("./context-file.cjs");

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new StateError("INVALID_INPUT", `unexpected argument: ${token}`);
    const name = token.slice(2);
    if (["fresh", "cancel", "template", "discard-legacy-plan", "context-file"].includes(name)) {
      options[name] = true;
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new StateError("INVALID_INPUT", `missing value for --${name}`);
    }
    options[name] = value;
    index += 1;
  }
  return { command, options };
}

function readPayload(inputPath) {
  if (!inputPath) throw new StateError("INVALID_INPUT", "--input <json-file|-> is required");
  let text;
  try {
    text = inputPath === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(path.resolve(inputPath), "utf8");
  } catch (error) {
    throw new StateError("INVALID_INPUT", `could not read JSON input: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new StateError("INVALID_INPUT", `input is not valid JSON: ${error.message}`);
  }
}

function requireProjectRoot(options) {
  if (!options["project-root"]) throw new StateError("INVALID_INPUT", "--project-root is required");
  return path.resolve(options["project-root"]);
}

function assertOptionNames(options, allowed) {
  const unknown = Object.keys(options).filter((name) => !allowed.includes(name));
  if (unknown.length) throw new StateError("INVALID_INPUT", `unsupported option(s): ${unknown.map((name) => `--${name}`).join(", ")}`);
}

function inferSkillRoot() {
  return process.env.STATECTL_SKILL_ROOT
    ? path.resolve(process.env.STATECTL_SKILL_ROOT)
    : path.resolve(__dirname, "..");
}

function contextOptions(options) {
  const contextFile = Boolean(options["context-file"]);
  const contextProtocol = contextFile
    ? CONTEXT_PROTOCOL
    : options["context-protocol"] ?? null;
  if (
    contextFile
    && options["context-protocol"] !== undefined
    && options["context-protocol"] !== CONTEXT_PROTOCOL
  ) {
    throw new StateError(
      "INVALID_INPUT",
      `--context-file uses ${CONTEXT_PROTOCOL}`,
    );
  }
  return {
    contextFile,
    contextProtocol,
  };
}

function deliverContextFile(projectRoot, result, preparedPaths) {
  try {
    const contextRef = writeFullCapsule(projectRoot, result.phase_capsule, preparedPaths);
    return compactContextResult(result, contextRef);
  } catch (error) {
    return {
      ...result,
      delivery_warnings: [deliveryWarning(error, "CONTEXT_FILE_WRITE_FAILED")],
    };
  }
}

function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const skillRoot = inferSkillRoot();
  let result;
  switch (command) {
    case "open":
      assertOptionNames(options, [
        "project-root",
        "fresh",
        "discard-legacy-plan",
        "context-protocol",
        "context-file",
      ]);
      {
        const projectRoot = requireProjectRoot(options);
        const context = contextOptions(options);
        const preparedPaths = context.contextFile ? preflightContextFile(projectRoot) : null;
        result = openProject({
          projectRoot,
          skillRoot,
          fresh: Boolean(options.fresh),
          discardLegacyPlan: Boolean(options["discard-legacy-plan"]),
          contextProtocol: context.contextProtocol,
        });
        if (context.contextFile) {
          result = deliverContextFile(projectRoot, result, preparedPaths);
        }
      }
      break;
    case "begin":
      assertOptionNames(options, [
        "project-root",
        "input",
        "context-protocol",
        "context-file",
      ]);
      {
        const projectRoot = requireProjectRoot(options);
        const payload = readPayload(options.input);
        const context = contextOptions(options);
        const preparedPaths = context.contextFile ? preflightContextFile(projectRoot) : null;
        result = beginOperation({
          projectRoot,
          payload,
          contextProtocol: context.contextProtocol,
        });
        if (context.contextFile) {
          result = deliverContextFile(projectRoot, result, preparedPaths);
        }
      }
      break;
    case "reserve-artifact":
      assertOptionNames(options, [
        "project-root",
        "input",
        "context-protocol",
        "context-file",
      ]);
      {
        const projectRoot = requireProjectRoot(options);
        const payload = readPayload(options.input);
        const context = contextOptions(options);
        const preparedPaths = context.contextFile ? preflightContextFile(projectRoot) : null;
        result = reserveArtifact({
          projectRoot,
          payload,
          contextProtocol: context.contextProtocol,
        });
        if (context.contextFile) {
          result = deliverContextFile(projectRoot, result, preparedPaths);
        }
      }
      break;
    case "apply":
      assertOptionNames(options, [
        "project-root",
        "input",
        "context-protocol",
        "context-file",
      ]);
      {
        const projectRoot = requireProjectRoot(options);
        const payload = readPayload(options.input);
        const context = contextOptions(options);
        const preparedPaths = context.contextFile ? preflightContextFile(projectRoot) : null;
        result = applyWorker({
          projectRoot,
          payload,
          contextProtocol: context.contextProtocol,
        });
        if (context.contextFile) {
          result = deliverContextFile(projectRoot, result, preparedPaths);
        }
      }
      break;
    case "finish":
      assertOptionNames(options, ["project-root", "input", "cancel"]);
      {
        const projectRoot = requireProjectRoot(options);
        result = finishOperation({
          projectRoot,
          payload: readPayload(options.input),
          cancel: Boolean(options.cancel),
        });
        const cleanupWarning = removeOwnedContextFile(
          projectRoot,
          result.project_id,
          result.operation_id,
        );
        if (cleanupWarning !== null) result.delivery_warnings = [cleanupWarning];
      }
      break;
    case "validate":
      assertOptionNames(options, ["project-root", "template"]);
      if (options.template && options["project-root"]) throw new StateError("INVALID_INPUT", "validate accepts either --template or --project-root, not both");
      result = options.template
        ? validateTemplate({ skillRoot })
        : validateProject({ projectRoot: requireProjectRoot(options) });
      if (!result.ok) process.exitCode = 1;
      break;
    default:
      throw new StateError(
        "INVALID_INPUT",
        "command must be one of: open, begin, reserve-artifact, apply, finish, validate",
      );
  }
  emit(result);
}

try {
  main();
} catch (error) {
  const known = error instanceof StateError || error instanceof ContextFileError;
  emit({
    ok: false,
    code: known ? error.code : "INTERNAL_ERROR",
    message: error && error.message ? error.message : String(error),
    ...(known && error.details !== undefined ? { details: error.details } : {}),
  });
  process.exitCode = 1;
}
