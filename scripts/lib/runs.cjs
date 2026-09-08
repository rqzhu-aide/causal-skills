"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {
  fail, canonical, sha256, rootPath, safePath, ensureDirectory, readFile,
  writeNew, withLock, assertNotLegacy
} = require("./files.cjs");
const { CATALOG, jsonValue, object, text, id, enumeration, array, strings, validateAdditionalDesigns } = require("./model.cjs");
const store = require("./store.cjs");

const IDENTITIES = ["event_id", "expected_project_id", "expected_last_event_id"];
function requestShape(request, required, optional = [], withEvent = true) {
  jsonValue(request);
  object(request, "request", [...(withEvent ? IDENTITIES : IDENTITIES.slice(1)), ...required], optional);
  if (withEvent) id(request.event_id, "event_id");
  id(request.expected_project_id, "expected_project_id");
  if (request.expected_last_event_id !== null) id(request.expected_last_event_id, "expected_last_event_id");
  id(request.run_id, "run_id");
}
function runPrefix(runId) { id(runId, "run_id"); return "runs/" + runId; }
function getRun(state, runId, active = false) {
  id(runId, "run_id");
  const run = state.runs.find(value => value.run_id === runId);
  if (!run) fail("UNKNOWN_RUN", "No committed run has this ID: " + runId);
  if (active && run.status !== "in_progress") fail("RUN_IMMUTABLE", "Only an in-progress run accepts new files or finalization.");
  return run;
}
function knownEvidence(state, evidenceId) {
  id(evidenceId, "evidence_ref");
  const evidence = state.evidence.find(value => value.evidence_id === evidenceId);
  if (!evidence) fail("UNKNOWN_REFERENCE", "Unknown evidence reference: " + evidenceId);
  return evidence;
}
function validatePlan(plan, state) {
  jsonValue(plan, "plan");
  const fields = {
    audit: ["question", "diagnostics"],
    analysis: ["target", "population", "treatment", "comparator", "outcome", "timing", "estimand", "design_id", "estimator", "exclusions", "diagnostics"],
    discovery: ["variables", "method", "diagnostics"],
    report: ["purpose", "evidence_refs", "format"]
  };
  if (!plan || typeof plan !== "object") fail("INVALID_INPUT", "plan must be an object.");
  enumeration(plan.kind, Object.keys(fields), "plan.kind");
  const optional = { audit: ["transformations"], analysis: ["additional_design_ids", "identification_basis"], discovery: [], report: [] };
  object(plan, "plan", ["kind", "objective", "claim_boundary", "inputs", ...fields[plan.kind]], optional[plan.kind]);
  text(plan.objective, "plan.objective");
  text(plan.claim_boundary, "plan.claim_boundary");
  array(plan.inputs, "plan.inputs", (input, label) => {
    object(input, label, ["source_ref", "path"], ["sha256"]);
    text(input.source_ref, label + ".source_ref");
    text(input.path, label + ".path");
    if (input.path.includes("\0")) fail("INVALID_INPUT", label + ".path contains a NUL byte.");
    if (Object.hasOwn(input, "sha256") && !/^[a-f0-9]{64}$/.test(input.sha256)) fail("INVALID_INPUT", label + ".sha256 must be a SHA-256 hash.");
  });
  for (const key of fields[plan.kind]) {
    if (["exclusions", "diagnostics", "variables", "evidence_refs"].includes(key)) strings(plan[key], "plan." + key);
    else text(plan[key], "plan." + key);
  }
  if (plan.kind === "analysis") {
    enumeration(plan.design_id, CATALOG.designs, "plan.design_id");
    validateAdditionalDesigns(plan, "plan");
    if (Object.hasOwn(plan, "identification_basis")) {
      object(plan.identification_basis, "plan.identification_basis", ["argument", "assumptions", "source_refs"]);
      text(plan.identification_basis.argument, "plan.identification_basis.argument");
      strings(plan.identification_basis.assumptions, "plan.identification_basis.assumptions", true);
      strings(plan.identification_basis.source_refs, "plan.identification_basis.source_refs", true);
    } else if (plan.design_id === "custom_identification" || plan.additional_design_ids?.length) {
      fail("INVALID_INPUT", "Custom or composed analyses require an identification_basis.");
    }
  }
  if (plan.kind === "audit" && Object.hasOwn(plan, "transformations")) {
    strings(plan.transformations, "plan.transformations", true);
    strings(plan.diagnostics, "plan.diagnostics", true);
  }
  if (plan.kind === "report") {
    if (!plan.evidence_refs.length) fail("INVALID_INPUT", "A report must identify the evidence it synthesizes.");
    for (const evidenceId of plan.evidence_refs) knownEvidence(state, evidenceId);
  }
}
function fileDigestAbsolute(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile()) fail("INVALID_INPUT", "Input must be a regular file: " + filePath);
    const hash = crypto.createHash("sha256");
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let bytes = 0;
    let read;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read));
      bytes += read;
    }
    const after = fs.fstatSync(fd);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes !== after.size) fail("INPUT_CHANGED", "File changed while it was being hashed: " + filePath);
    return { sha256: hash.digest("hex"), bytes };
  } finally { fs.closeSync(fd); }
}
function fileDigest(root, relative) { return fileDigestAbsolute(safePath(root, relative)); }
function inputSource(root, input) {
  const source_path = path.resolve(root, input.path);
  const resolved_source_path = fs.realpathSync.native(source_path);
  const digest = fileDigestAbsolute(resolved_source_path);
  if (input.sha256 && input.sha256 !== digest.sha256) fail("INPUT_CHANGED", "Input does not match its expected hash: " + input.source_ref);
  return { source_ref: input.source_ref, path: input.path, source_path, resolved_source_path, source_sha256: digest.sha256, bytes: digest.bytes };
}
function extension(sourcePath) {
  const ext = path.extname(sourcePath);
  return /^\.[a-z0-9]{1,12}$/i.test(ext) ? ext.toLowerCase() : ".bin";
}
function parseFile(root, relative, label) { return store.parseJSON(readFile(root, relative), label); }
function frozenPlan(root, run) {
  const bytes = readFile(root, run.plan_ref);
  if (sha256(bytes) !== run.plan_sha256) fail("PLAN_CHANGED", "The frozen plan changed: " + run.plan_ref);
  const plan = store.parseJSON(bytes, "Run plan");
  if (plan.run_id !== run.run_id || plan.kind !== run.kind) fail("PLAN_CHANGED", "Plan identity does not match its committed run.");
  return plan;
}
function checkInputs(root, plan, sourceCheck = true) {
  for (const input of plan.inputs) {
    const snapshot = fileDigest(root, input.snapshot_ref);
    if (snapshot.sha256 !== input.snapshot_sha256 || snapshot.bytes !== input.bytes) fail("INPUT_CHANGED", "Input snapshot changed: " + input.snapshot_ref);
    if (sourceCheck) {
      const actual = fs.realpathSync.native(input.source_path);
      if (actual !== input.resolved_source_path || fileDigestAbsolute(actual).sha256 !== input.source_sha256) {
        fail("SOURCE_CHANGED", "Original input changed after the snapshot: " + input.source_ref);
      }
    }
  }
}
function manifestFor(root, run) {
  if (run.status !== "completed" || !run.manifest_ref || !run.manifest_sha256) fail("INCOMPLETE_RUN", "Evidence requires a completed, manifested run.");
  const bytes = readFile(root, run.manifest_ref);
  if (sha256(bytes) !== run.manifest_sha256) fail("MANIFEST_CHANGED", "The committed manifest changed: " + run.manifest_ref);
  const manifest = store.parseJSON(bytes, "Run manifest");
  if (manifest.run_id !== run.run_id) fail("MANIFEST_CHANGED", "Manifest identity does not match its run.");
  return manifest;
}
function assertComputedEvidence(root, state, evidence) {
  if (evidence.kind !== "computed") return;
  if (evidence.legacy) fail("INVALID_INPUT", "Legacy findings are source evidence, not newly computed v7 results.");
  const run = getRun(state, evidence.run_id);
  const manifest = manifestFor(root, run);
  const plan = frozenPlan(root, run);
  checkInputs(root, plan, false);
  const prefix = runPrefix(run.run_id) + "/";
  if (typeof evidence.source_ref !== "string" || !evidence.source_ref.startsWith(prefix)) fail("UNKNOWN_REFERENCE", "Computed evidence must name a project-relative file in its completed run.");
  const relative = evidence.source_ref.slice(prefix.length);
  safePath(root, evidence.source_ref);
  if (!manifest.output_paths.includes(relative) && !manifest.diagnostic_paths.includes(relative)) fail("UNKNOWN_REFERENCE", "Computed evidence must identify a manifested output or diagnostic.");
  const entry = manifest.files.find(file => file.path === relative);
  if (!entry || fileDigest(root, evidence.source_ref).sha256 !== entry.sha256) fail("ARTIFACT_CHANGED", "Computed evidence file does not match its manifest.");
  if (evidence.source_sha256 && evidence.source_sha256 !== entry.sha256) fail("ARTIFACT_CHANGED", "Computed evidence hash does not match its manifested file.");
}
function evidenceBindings(root, state, plan) {
  return (plan.evidence_refs || []).map(evidenceId => {
    const record = knownEvidence(state, evidenceId);
    if (record.kind === "computed") assertComputedEvidence(root, state, record);
    const binding = {
      evidence_id: evidenceId, event_ref: state.history_index[evidenceId].event_ref,
      kind: record.kind, source_ref: record.source_ref, summary: record.summary
    };
    for (const key of ["source_sha256", "source_excerpt", "legacy", "limitations"]) if (Object.hasOwn(record, key)) binding[key] = structuredClone(record[key]);
    if (record.run_id) {
      const run = getRun(state, record.run_id);
      const manifest = manifestFor(root, run);
      binding.run_id = run.run_id;
      binding.manifest_ref = run.manifest_ref;
      binding.manifest_sha256 = run.manifest_sha256;
      binding.plan_ref = run.plan_ref;
      binding.plan_sha256 = run.plan_sha256;
      binding.artifact_sha256 = manifest.files.find(file => runPrefix(run.run_id) + "/" + file.path === record.source_ref).sha256;
    }
    return binding;
  });
}
function checkBoundInputHashes(bindings, inputs) {
  for (const binding of bindings || []) {
    const expected = binding.artifact_sha256 || binding.source_sha256;
    if (!expected) continue;
    for (const input of inputs.filter(value => value.source_ref === binding.source_ref)) {
      if (input.source_sha256 !== expected || (input.snapshot_sha256 && input.snapshot_sha256 !== expected)) {
        fail("SOURCE_CHANGED", "Report input does not match its selected evidence version: " + binding.source_ref);
      }
    }
  }
}
function checkEvidenceBindings(root, plan) {
  checkBoundInputHashes(plan.evidence_bindings, plan.inputs);
  for (const binding of plan.evidence_bindings || []) {
    if (binding.kind !== "computed") continue;
    const sourcePlanBytes = readFile(root, binding.plan_ref);
    if (sha256(sourcePlanBytes) !== binding.plan_sha256) fail("SOURCE_CHANGED", "A report's bound source plan changed: " + binding.plan_ref);
    const sourcePlan = store.parseJSON(sourcePlanBytes, "Bound source plan");
    checkInputs(root, sourcePlan, false);
    const manifestBytes = readFile(root, binding.manifest_ref);
    if (sha256(manifestBytes) !== binding.manifest_sha256) fail("SOURCE_CHANGED", "A report's bound source manifest changed: " + binding.manifest_ref);
    const manifest = store.parseJSON(manifestBytes, "Bound source manifest");
    const prefix = runPrefix(binding.run_id) + "/";
    if (!binding.source_ref.startsWith(prefix)) fail("UNKNOWN_REFERENCE", "Invalid bound report source reference.");
    const relative = binding.source_ref.slice(prefix.length);
    const entry = manifest.files.find(file => file.path === relative);
    if (manifest.run_id !== binding.run_id || !entry || entry.sha256 !== binding.artifact_sha256 ||
        (!manifest.output_paths.includes(relative) && !manifest.diagnostic_paths.includes(relative)) ||
        fileDigest(root, binding.source_ref).sha256 !== binding.artifact_sha256) {
      fail("SOURCE_CHANGED", "A report's bound source artifact no longer matches: " + binding.source_ref);
    }
  }
}

function start(projectRoot, request, options = {}) {
  requestShape(request, ["run_id", "plan"], ["parent_run_id"]);
  return store.transact(projectRoot, request, ({ root, state }) => {
    validatePlan(request.plan, state);
    if (state.runs.some(run => run.run_id === request.run_id)) fail("RUN_EXISTS", "Run identity is already committed.");
    if (request.run_id === request.event_id || Object.hasOwn(state.history_index, request.run_id)) {
      fail("DUPLICATE_ID", "Run identity conflicts with another project record: " + request.run_id);
    }
    if (request.parent_run_id !== undefined) {
      id(request.parent_run_id, "parent_run_id");
      if (request.parent_run_id === request.run_id) fail("INVALID_INPUT", "A run cannot be its own parent.");
      getRun(state, request.parent_run_id);
    }
    const prefix = runPrefix(request.run_id);
    const target = safePath(root, prefix);
    if (fs.existsSync(target)) fail("ORPHAN_RUN", "Run directory already exists and will not be adopted: " + prefix);
    const sources = request.plan.inputs.map(input => inputSource(root, input));
    const bindings = evidenceBindings(root, state, request.plan);
    checkBoundInputHashes(bindings, sources);
    ensureDirectory(root, "runs");
    fs.mkdirSync(target);
    ensureDirectory(root, prefix + "/inputs");
    for (let i = 0; i < sources.length; i++) {
      const source = sources[i];
      source.snapshot_ref = prefix + "/inputs/" + String(i + 1).padStart(4, "0") + extension(source.source_path);
      const destination = safePath(root, source.snapshot_ref);
      fs.copyFileSync(source.resolved_source_path, destination, fs.constants.COPYFILE_EXCL);
      const fd = fs.openSync(safePath(root, source.snapshot_ref), "r+");
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const snapshot = fileDigest(root, source.snapshot_ref);
      if (snapshot.sha256 !== source.source_sha256 || snapshot.bytes !== source.bytes) fail("INPUT_CHANGED", "Input changed during snapshot creation: " + source.source_ref);
      source.snapshot_sha256 = snapshot.sha256;
    }
    const started_at = new Date().toISOString();
    const plan = { ...structuredClone(request.plan), plan_schema_version: 1, run_id: request.run_id, frozen_at: started_at, inputs: sources };
    if (bindings.length) plan.evidence_bindings = bindings;
    checkInputs(root, plan);
    const plan_ref = prefix + "/plan.yaml";
    const serialized = JSON.stringify(plan, null, 2) + "\n";
    writeNew(root, plan_ref, serialized);
    const run = { run_id: request.run_id, kind: plan.kind, status: "in_progress", plan_ref, plan_sha256: sha256(serialized), claim_boundary: plan.claim_boundary, started_at };
    if (request.parent_run_id !== undefined) run.parent_run_id = request.parent_run_id;
    return { type: "run_started", payload: { run }, result: { run_path: safePath(root, prefix), plan_ref, inputs: sources } };
  }, { ...options, eventType: "run_started" });
}

function write(projectRoot, request) {
  requestShape(request, ["run_id", "path", "content"], [], false);
  text(request.path, "path");
  if (typeof request.content !== "string") fail("INVALID_INPUT", "content must be text.");
  const relative = request.path.replace(/\\/g, "/");
  const protectedPath = relative.toLowerCase();
  if (["plan.yaml", "manifest.json"].includes(protectedPath) || protectedPath === "inputs" || protectedPath.startsWith("inputs/")) fail("RUN_IMMUTABLE", "Plans, snapshots, and manifests cannot be written through this helper.");
  const root = rootPath(projectRoot);
  return withLock(root, () => {
    const { state } = store.readJournal(root);
    if (request.expected_project_id !== state.state_meta.project_id) fail("WRONG_PROJECT", "This write belongs to a different project.");
    if (request.expected_last_event_id !== state.state_meta.last_event_id) fail("STALE_WRITE", "Reload state before writing the run file.");
    const run = getRun(state, request.run_id, true);
    frozenPlan(root, run);
    const destination = runPrefix(run.run_id) + "/" + relative;
    const target = safePath(root, destination);
    const digest = sha256(request.content);
    if (fs.existsSync(target)) {
      if (fileDigest(root, destination).sha256 !== digest) fail("FILE_EXISTS", "Use a new filename for changed content; this file was not overwritten.");
      return { ok: true, run_id: run.run_id, path: destination, sha256: digest, replayed: true };
    }
    const parent = path.posix.dirname(destination);
    ensureDirectory(root, parent);
    writeNew(root, destination, request.content);
    return { ok: true, run_id: run.run_id, path: destination, sha256: digest, replayed: false };
  });
}

function inventory(root, prefix, excludeManifest = false) {
  const files = [];
  function visit(relative) {
    const target = safePath(root, relative);
    for (const entry of fs.readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = relative + "/" + entry.name;
      const checked = safePath(root, child);
      const stat = fs.lstatSync(checked);
      if (stat.isDirectory()) visit(child);
      else if (stat.isFile()) {
        const local = child.slice(prefix.length + 1);
        if (excludeManifest && local === "manifest.json") continue;
        files.push({ path: local, ...fileDigest(root, child) });
      } else fail("UNSAFE_PATH", "Run contains a nonregular file: " + child);
    }
  }
  visit(prefix);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
function declaredPaths(root, prefix, value, label) {
  strings(value, label);
  const normalized = value.map(item => item.replace(/\\/g, "/"));
  if (new Set(normalized).size !== normalized.length) fail("INVALID_INPUT", label + " contains duplicate paths.");
  for (const relative of normalized) {
    const protectedPath = relative.toLowerCase();
    if (protectedPath === "plan.yaml" || protectedPath === "manifest.json" || protectedPath.startsWith("inputs/")) fail("INVALID_INPUT", label + " cannot classify a frozen plan, snapshot, or manifest as an output.");
    safePath(root, prefix + "/" + relative);
    if (!fs.statSync(safePath(root, prefix + "/" + relative)).isFile()) fail("INVALID_INPUT", label + " must identify regular files.");
  }
  return normalized;
}
function finalize(projectRoot, request, options = {}) {
  requestShape(request, ["run_id", "code_paths", "output_paths", "diagnostic_paths", "environment", "deviations"]);
  return store.transact(projectRoot, request, ({ root, state }) => {
    const run = getRun(state, request.run_id, true);
    const prefix = runPrefix(run.run_id);
    const plan = frozenPlan(root, run);
    checkInputs(root, plan);
    checkEvidenceBindings(root, plan);
    const code_paths = declaredPaths(root, prefix, request.code_paths, "code_paths");
    const output_paths = declaredPaths(root, prefix, request.output_paths, "output_paths");
    const diagnostic_paths = declaredPaths(root, prefix, request.diagnostic_paths, "diagnostic_paths");
    if (!output_paths.length) fail("INVALID_INPUT", "Finalization requires at least one reported output.");
    const preparation = plan.kind === "audit" && Object.hasOwn(plan, "transformations");
    if ((["analysis", "discovery"].includes(plan.kind) || preparation) && !code_paths.length) fail("INVALID_INPUT", "A computation must retain executable code or configuration.");
    if (plan.diagnostics?.length && !diagnostic_paths.length) fail("INVALID_INPUT", "The plan names diagnostics; retain their evidence files.");
    if (!request.environment || typeof request.environment !== "object" || Array.isArray(request.environment) || !Object.keys(request.environment).length) fail("INVALID_INPUT", "environment must record nonempty runtime or authoring details.");
    array(request.deviations, "deviations", (deviation, label) => {
      object(deviation, label, ["description", "reason", "timing"]);
      text(deviation.description, label + ".description"); text(deviation.reason, label + ".reason");
      enumeration(deviation.timing, ["pre_result", "post_result"], label + ".timing");
    });
    const manifest_ref = prefix + "/manifest.json";
    if (fs.existsSync(safePath(root, manifest_ref))) fail("ORPHAN_MANIFEST", "A manifest exists without committed completion. It will not be adopted or replaced.");
    const files = inventory(root, prefix);
    const exactPaths = new Set(files.map(file => file.path));
    for (const declared of [...code_paths, ...output_paths, ...diagnostic_paths]) {
      if (!exactPaths.has(declared)) fail("INVALID_INPUT", "Declared paths must match saved filename casing exactly: " + declared);
    }
    const completed_at = new Date().toISOString();
    const manifest = {
      manifest_version: 1, run_id: run.run_id, kind: run.kind,
      parent_run_id: run.parent_run_id || null, started_at: run.started_at, completed_at,
      plan_ref: run.plan_ref, plan_sha256: run.plan_sha256, inputs: plan.inputs,
      code_paths, output_paths, diagnostic_paths, environment: structuredClone(request.environment),
      deviations: structuredClone(request.deviations), claim_boundary: run.claim_boundary,
      evidence_bindings: plan.evidence_bindings || [], files
    };
    const serialized = JSON.stringify(manifest, null, 2) + "\n";
    writeNew(root, manifest_ref, serialized);
    const completed = { ...run, status: "completed", manifest_ref, manifest_sha256: sha256(serialized), completed_at };
    return { type: "run_finalized", payload: { run: completed }, result: { run_id: run.run_id, manifest_ref, manifest_sha256: completed.manifest_sha256 } };
  }, { ...options, eventType: "run_finalized" });
}
function terminal(projectRoot, request, status, options = {}) {
  requestShape(request, ["run_id", "reason"]);
  text(request.reason, "reason");
  return store.transact(projectRoot, request, ({ state }) => {
    const run = getRun(state, request.run_id, true);
    return { type: status === "failed" ? "run_failed" : "run_abandoned", payload: { run: { ...run, status, reason: request.reason, completed_at: new Date().toISOString() } }, result: { run_id: run.run_id, status } };
  }, { ...options, eventType: status === "failed" ? "run_failed" : "run_abandoned" });
}
const failRun = (root, request, options = {}) => terminal(root, request, "failed", options);
const abandon = (root, request, options = {}) => terminal(root, request, "abandoned", options);

function verify(projectRoot, options = {}) {
  object(options, "verification options", [], ["source_check"]);
  const source_check = options.source_check === undefined ? "originals" : options.source_check;
  enumeration(source_check, ["originals", "snapshots"], "source_check");
  const root = rootPath(projectRoot);
  assertNotLegacy(root);
  let loaded;
  try { loaded = store.readJournal(root); }
  catch (error) { return { ok: false, source_check, issues: [{ code: error.code || "IO_ERROR", message: error.message }] }; }
  const issues = [];
  const capture = (runId, action) => { try { return action(); } catch (error) { issues.push({ run_id: runId, code: error.code || "IO_ERROR", message: error.message }); return null; } };
  if (!loaded.projection_current) issues.push({ code: "STALE_PROJECTION", message: "Current state is reconstructible, but the saved projection is not current." });
  capture(undefined, () => {
    for (const runPath of store.orphanRuns(root, loaded.state)) issues.push({ code: "ORPHAN_RUN", path: "runs/" + runPath, message: "This directory has no committed run start." });
  });
  for (const run of loaded.state.runs) {
    if (run.status === "in_progress") issues.push({ run_id: run.run_id, code: "INCOMPLETE_RUN", message: "The run has no committed terminal event." });
    const plan = capture(run.run_id, () => frozenPlan(root, run));
    if (plan) {
      capture(run.run_id, () => checkInputs(root, plan, source_check === "originals"));
      capture(run.run_id, () => checkEvidenceBindings(root, plan));
    }
    const prefix = runPrefix(run.run_id);
    if (run.status === "completed") {
      const manifest = capture(run.run_id, () => manifestFor(root, run));
      const actual = capture(run.run_id, () => inventory(root, prefix, true));
      if (manifest && actual && canonical(actual) !== canonical(manifest.files)) issues.push({ run_id: run.run_id, code: "ARTIFACT_CHANGED", message: "Run files are missing, changed, or unmanifested." });
    } else capture(run.run_id, () => {
      inventory(root, prefix);
      if (fs.existsSync(safePath(root, prefix + "/manifest.json"))) issues.push({ run_id: run.run_id, code: "UNCOMMITTED_MANIFEST", message: "A manifest exists without a committed completed run." });
    });
  }
  return { ok: issues.length === 0, source_check, project_id: loaded.state.state_meta.project_id, last_event_id: loaded.state.state_meta.last_event_id, checked_runs: loaded.state.runs.length, issues };
}

module.exports = { start, write, finalize, failRun, abandon, verify, validatePlan, assertComputedEvidence, frozenPlan, manifestFor, inventory };
