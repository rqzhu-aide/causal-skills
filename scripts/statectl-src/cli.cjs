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
    if (["fresh", "cancel", "template", "discard-legacy-plan"].includes(name)) {
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

function main() {
  const { command, options } = parseArguments(process.argv.slice(2));
  const skillRoot = inferSkillRoot();
  let result;
  switch (command) {
    case "open":
      assertOptionNames(options, ["project-root", "fresh", "discard-legacy-plan"]);
      result = openProject({
        projectRoot: requireProjectRoot(options),
        skillRoot,
        fresh: Boolean(options.fresh),
        discardLegacyPlan: Boolean(options["discard-legacy-plan"]),
      });
      break;
    case "begin":
      assertOptionNames(options, ["project-root", "input"]);
      result = beginOperation({
        projectRoot: requireProjectRoot(options),
        payload: readPayload(options.input),
      });
      break;
    case "reserve-artifact":
      assertOptionNames(options, ["project-root", "input"]);
      result = reserveArtifact({
        projectRoot: requireProjectRoot(options),
        payload: readPayload(options.input),
      });
      break;
    case "apply":
      assertOptionNames(options, ["project-root", "input"]);
      result = applyWorker({
        projectRoot: requireProjectRoot(options),
        payload: readPayload(options.input),
      });
      break;
    case "finish":
      assertOptionNames(options, ["project-root", "input", "cancel"]);
      result = finishOperation({
        projectRoot: requireProjectRoot(options),
        payload: readPayload(options.input),
        cancel: Boolean(options.cancel),
      });
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
  const known = error instanceof StateError;
  emit({
    ok: false,
    code: known ? error.code : "INTERNAL_ERROR",
    message: error && error.message ? error.message : String(error),
    ...(known && error.details !== undefined ? { details: error.details } : {}),
  });
  process.exitCode = 1;
}
