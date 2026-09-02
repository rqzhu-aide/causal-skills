"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const test = require("node:test");
const YAML = require("yaml");
const {
  applyWorker: applySourceWorker,
  beginOperation: beginSourceOperation,
  reserveArtifact: reserveSourceArtifact,
  validateTemplate: validateSourceTemplate,
} = require("../scripts/statectl-src/core.cjs");

const { capsuleContextId, writeFullCapsule } = require("../scripts/statectl-src/context-file.cjs");
const {
  validateLoadedBy,
  validateReleaseMetadata,
} = require("../scripts/validate-package.cjs");
const {
  atomicWrite: atomicWriteCodexHookInstall,
  install: installCodexHook,
} = require("../scripts/install-codex-hook.cjs");
const SKILL_ROOT = path.resolve(__dirname, "..");
const BUNDLED_CLI = path.join(SKILL_ROOT, "scripts", "statectl.cjs");
const CLI = process.env.STATECTL_TEST_SOURCE === "1"
  ? path.join(SKILL_ROOT, "scripts", "statectl-src", "cli.cjs")
  : BUNDLED_CLI;
const CODEX_HOOK = path.join(SKILL_ROOT, "project-hooks", "codex", "project_state_stop_check.cjs");
const CLAUDE_HOOK = path.join(SKILL_ROOT, "project-hooks", "claude", "project_state_stop_check.cjs");
const CODEX_SOURCE_HOOK = path.join(SKILL_ROOT, "scripts", "statectl-src", "codex-hook.cjs");
const SOURCE_HOOK = path.join(SKILL_ROOT, "scripts", "statectl-src", "hook.cjs");
const CODEX_HOOK_INSTALLER = path.join(SKILL_ROOT, "scripts", "install-codex-hook.cjs");
const CLAUDE_HOOK_INSTALLER = path.join(SKILL_ROOT, "scripts", "install-claude-hook.cjs");
const { install: installClaudeHook } = require("../scripts/install-claude-hook.cjs");
const FIXTURES = path.join(__dirname, "fixtures");
const PACKETS = new Map();

function temporaryProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "causal-statectl-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function execute(projectRoot, command, options = {}) {
  const args = [CLI, command, "--project-root", projectRoot, ...(options.args || [])];
  if (options.payload !== undefined) args.push("--input", "-");
  const child = spawnSync(process.execPath, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    input: options.payload === undefined ? undefined : JSON.stringify(options.payload),
    env: {
      ...process.env,
      STATECTL_SKILL_ROOT: SKILL_ROOT,
      ...(options.env || {}),
    },
  });
  const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.ok(lines.length, `statectl emitted no JSON\nstdout: ${child.stdout}\nstderr: ${child.stderr}`);
  assert.equal(lines.length, 1, `statectl must emit exactly one JSON result\nstdout: ${child.stdout}`);
  let result;
  assert.doesNotThrow(() => {
    result = JSON.parse(lines[0]);
  }, `statectl emitted invalid JSON\nstdout: ${child.stdout}\nstderr: ${child.stderr}`);
  if (result && result.operation_packet && result.operation_packet.operation_id) {
    PACKETS.set(result.operation_packet.operation_id, structuredClone(result.operation_packet));
  }
  return { ...child, result };
}

function executeAsync(projectRoot, command, options = {}) {
  const args = [CLI, command, "--project-root", projectRoot, ...(options.args || [])];
  if (options.payload !== undefined) args.push("--input", "-");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: options.cwd ?? projectRoot,
      env: {
        ...process.env,
        STATECTL_SKILL_ROOT: SKILL_ROOT,
        ...(options.env || {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => {
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length !== 1) {
        reject(new Error(`statectl emitted ${lines.length} JSON lines\nstdout: ${stdout}\nstderr: ${stderr}`));
        return;
      }
      let result;
      try {
        result = JSON.parse(lines[0]);
      } catch (error) {
        reject(new Error(`statectl emitted invalid JSON: ${error.message}\nstdout: ${stdout}`));
        return;
      }
      resolve({ status, stdout, stderr, result });
    });
    if (options.payload === undefined) child.stdin.end();
    else child.stdin.end(JSON.stringify(options.payload));
  });
}

async function waitForPath(targetPath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(targetPath)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${targetPath}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForCondition(predicate, label, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      if (predicate()) return;
    } catch (_error) {
      // Retry across atomic file replacement.
    }
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function expectSuccess(execution, code) {
  assert.equal(execution.status, 0, `${execution.stderr}\n${execution.stdout}`);
  assert.equal(execution.result.ok, true);
  if (code) assert.equal(execution.result.code, code);
  return execution.result;
}

function expectFailure(execution, code) {
  assert.notEqual(execution.status, 0, execution.stdout);
  assert.equal(execution.result.ok, false);
  assert.equal(execution.result.code, code);
  return execution.result;
}

function statePath(projectRoot) {
  return path.join(projectRoot, "project_state.yaml");
}

function stateLockPath(projectRoot) {
  return path.join(projectRoot, ".causal-consultant-state.lock");
}

function readState(projectRoot) {
  const document = YAML.parseDocument(fs.readFileSync(statePath(projectRoot), "utf8"), {
    schema: "core",
    uniqueKeys: true,
  });
  assert.deepEqual(document.errors, []);
  return document.toJS();
}

function writeState(projectRoot, state) {
  fs.writeFileSync(statePath(projectRoot), YAML.stringify(state, { lineWidth: 0 }), "utf8");
}

function legacyReportContractBundle(reportAssembly, { includeEvidenceBinding = false } = {}) {
  const contract = {};
  if (includeEvidenceBinding) {
    assert.ok(Array.isArray(reportAssembly.analysis_artifact_ids));
    contract.analysis_artifact_ids = [...reportAssembly.analysis_artifact_ids].sort();
  }
  for (const field of ["report_goal", "audience", "target_section"]) {
    const value = reportAssembly[field];
    if (typeof value === "string" && value.trim()) contract[field] = value.trim();
  }
  for (const field of ["planned_structure", "key_points", "wording_constraints"]) {
    const values = reportAssembly[field]
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim());
    if (values.length) contract[field] = values;
  }
  const contractHash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ scope_kind: "report", contract }), "utf8")
    .digest("hex");
  const descriptions = [];
  for (const field of ["report_goal", "audience", "target_section"]) {
    if (contract[field] !== undefined) descriptions.push({ kind: field, description: contract[field] });
  }
  for (const field of ["planned_structure", "key_points", "wording_constraints"]) {
    for (const description of contract[field] ?? []) descriptions.push({ kind: field, description });
  }
  for (const description of contract.analysis_artifact_ids ?? []) {
    descriptions.push({ kind: "analysis_artifact_id", description });
  }
  const requirements = descriptions.map((item, index) => ({
    id: `req-${crypto.createHash("sha256").update(JSON.stringify({
      contract_hash: contractHash,
      index,
      kind: item.kind,
      description: item.description,
    }), "utf8").digest("hex").slice(0, 16)}`,
    ...item,
  }));
  return { contractHash, requirements };
}

test("package loader registry rejects ownership drift", () => {
  const index = YAML.parse(fs.readFileSync(
    path.join(SKILL_ROOT, "references", "route_index.yaml"),
    "utf8",
  ));
  assert.doesNotThrow(() => validateLoadedBy(index));

  const drifted = structuredClone(index);
  const legacy = drifted.shared_references.find((entry) => entry.id === "legacy_evidence");
  legacy.loaded_by = "controller_when_legacy_protocol_or_historical_manifest";
  assert.throws(
    () => validateLoadedBy(drifted),
    /loaded_by mismatch for references\/legacy_evidence\.md/,
  );
});

test("release metadata validation rejects local version drift", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, "package-lock.json"), "utf8"));
  const readme = fs.readFileSync(path.join(SKILL_ROOT, "README.md"), "utf8");
  assert.doesNotThrow(() => validateReleaseMetadata(packageJson, packageLock, readme));
  const driftedVersion = packageJson.version === "0.0.0" ? "0.0.1" : "0.0.0";

  const driftedLock = structuredClone(packageLock);
  driftedLock.packages[""].version = driftedVersion;
  assert.throws(
    () => validateReleaseMetadata(packageJson, driftedLock, readme),
    /package-lock\.json versions must match/,
  );
  assert.throws(
    () => validateReleaseMetadata(
      packageJson,
      packageLock,
      readme.replace(
        `version-${packageJson.version}-blue.svg`,
        `version-${driftedVersion}-blue.svg`,
      ),
    ),
    /README version badge must match/,
  );
  assert.throws(
    () => validateReleaseMetadata(
      packageJson,
      packageLock,
      readme.replace(`/tree/v${packageJson.version}`, `/tree/v${driftedVersion}`),
    ),
    /README versioned URLs must use/,
  );
});

function downgradeCurrentStateToV2(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  state.state_meta.schema_version = 2;
  delete state.report_assembly.claim_boundary;
  delete state.carried_questions;
  delete state.project_summary.audience_profile;
  delete state.causal_facts.analysis_options;
  delete state.report_assembly.analysis_artifact_ids;
  delete state.state_meta.startup_notice;
  delete state.pending_decision;
  delete state.response_receipt;
  delete state.discovery_sidecar.scope_id;
  delete state.discovery_sidecar.scope_revision;
  delete state.discovery_sidecar.execution_contract;
  for (const slot of Object.values(state.council_chamber.analysis_execution)) {
    delete slot.execution_contract;
    delete slot.causal_basis_hash;
  }
  if (state.state_meta.active_operation !== null) {
    delete state.state_meta.active_operation.discovery_scope;
    delete state.state_meta.active_operation.completion_protocol;
    delete state.state_meta.active_operation.contract_hash;
    delete state.state_meta.active_operation.report_evidence_binding_protocol;
  }
  for (const record of state.artifact_records) {
    delete record.artifact_role;
    delete record.execution_receipt;
  }
  writeState(projectRoot, state);
  return state;
}

function downgradeCurrentStateToV3(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  state.state_meta.schema_version = 3;
  delete state.report_assembly.claim_boundary;
  delete state.carried_questions;
  delete state.project_summary.audience_profile;
  delete state.causal_facts.analysis_options;
  delete state.report_assembly.analysis_artifact_ids;
  if (state.response_receipt !== null) delete state.response_receipt.direct_assignment;
  delete state.discovery_sidecar.scope_id;
  delete state.discovery_sidecar.scope_revision;
  delete state.discovery_sidecar.execution_contract;
  for (const slot of Object.values(state.council_chamber.analysis_execution)) {
    delete slot.execution_contract;
    delete slot.causal_basis_hash;
  }
  if (state.state_meta.active_operation !== null) {
    delete state.state_meta.active_operation.discovery_scope;
    delete state.state_meta.active_operation.completion_protocol;
    delete state.state_meta.active_operation.contract_hash;
    delete state.state_meta.active_operation.report_evidence_binding_protocol;
  }
  for (const record of state.artifact_records) {
    delete record.artifact_role;
    delete record.execution_receipt;
  }
  writeState(projectRoot, state);
  return state;
}

function downgradeCurrentStateToV4(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  state.state_meta.schema_version = 4;
  delete state.report_assembly.claim_boundary;
  delete state.carried_questions;
  delete state.project_summary.audience_profile;
  delete state.causal_facts.analysis_options;
  delete state.report_assembly.analysis_artifact_ids;
  if (state.response_receipt !== null) delete state.response_receipt.direct_assignment;
  for (const slot of Object.values(state.council_chamber.analysis_execution)) {
    delete slot.execution_contract;
    delete slot.causal_basis_hash;
  }
  if (state.state_meta.active_operation !== null) {
    delete state.state_meta.active_operation.completion_protocol;
    delete state.state_meta.active_operation.contract_hash;
    delete state.state_meta.active_operation.report_evidence_binding_protocol;
  }
  for (const record of state.artifact_records) {
    delete record.artifact_role;
    delete record.execution_receipt;
  }
  writeState(projectRoot, state);
  return state;
}

function downgradeCurrentStateToV5(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  state.state_meta.schema_version = 5;
  delete state.report_assembly.claim_boundary;
  delete state.carried_questions;
  delete state.project_summary.audience_profile;
  delete state.causal_facts.analysis_options;
  delete state.report_assembly.analysis_artifact_ids;
  for (const slot of Object.values(state.council_chamber.analysis_execution)) {
    delete slot.causal_basis_hash;
  }
  if (state.response_receipt !== null) delete state.response_receipt.direct_assignment;
  if (state.state_meta.active_operation !== null) {
    delete state.state_meta.active_operation.report_evidence_binding_protocol;
  }
  writeState(projectRoot, state);
  return state;
}

function downgradeCurrentStateToV6(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  state.state_meta.schema_version = 6;
  delete state.carried_questions;
  delete state.project_summary.audience_profile;
  if (
    state.state_meta.active_operation !== null
    && state.next_step_plan[0]?.id === "report_writer"
    && [1, 2].includes(state.state_meta.active_operation.completion_protocol)
  ) {
    state.state_meta.active_operation.contract_hash =
      legacyReportContractBundle(state.report_assembly).contractHash;
  }
  delete state.report_assembly.claim_boundary;
  delete state.report_assembly.analysis_artifact_ids;
  if (state.state_meta.active_operation !== null) {
    delete state.state_meta.active_operation.report_evidence_binding_protocol;
  }
  writeState(projectRoot, state);
  return state;
}

function downgradeCurrentStateToV7(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  state.state_meta.schema_version = 7;
  delete state.report_assembly.claim_boundary;
  delete state.carried_questions;
  delete state.project_summary.audience_profile;
  writeState(projectRoot, state);
  return state;
}

function downgradeCurrentStateToV8(projectRoot, { legacySources = false } = {}) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  state.state_meta.schema_version = 8;
  if (
    state.state_meta.active_operation !== null
    && state.next_step_plan[0]?.id === "report_writer"
    && [1, 2].includes(state.state_meta.active_operation.completion_protocol)
  ) {
    state.state_meta.active_operation.contract_hash = legacyReportContractBundle(
      state.report_assembly,
      { includeEvidenceBinding: true },
    ).contractHash;
  }
  delete state.report_assembly.claim_boundary;
  if (legacySources) {
    for (const entry of state.carried_questions) {
      for (const field of ["first_source", "last_source"]) {
        delete entry[field].source_kind;
        delete entry[field].source_text;
      }
    }
  }
  writeState(projectRoot, state);
  return state;
}

function copyFixture(projectRoot, fixtureName) {
  fs.copyFileSync(path.join(FIXTURES, fixtureName), statePath(projectRoot));
}

function expected(result) {
  return {
    expected_project_id: result.project_id,
    expected_revision: result.revision,
  };
}

function assertRequiredReferences(result, expectedReferences) {
  assert.deepEqual(result.required_references, expectedReferences);
  assert.equal(new Set(result.required_references).size, result.required_references.length);
  for (const reference of result.required_references) {
    assert.equal(reference.includes("\\"), false, `${reference} must use POSIX separators`);
    assert.equal(path.posix.normalize(reference), reference);
    assert.equal(fs.existsSync(path.join(SKILL_ROOT, ...reference.split("/"))), true, `${reference} must exist`);
  }
}

function assertTurnContext(projectRoot, result, expectedContext) {
  const state = readState(projectRoot);
  assert.deepEqual(Object.keys(result.turn_context).sort(), [
    "actor",
    "artifact_status",
    "artifact_warnings",
    "audience",
    "directives",
    "operation",
    "previous_response_cue",
    "project_id",
    "revision",
    "scope_snapshot",
    "stage",
    "startup_notice",
    "state",
    "version",
  ]);
  assert.equal(result.turn_context.version, 1);
  assert.equal(result.turn_context.audience, expectedContext.audience);
  assert.equal(result.turn_context.actor, expectedContext.actor);
  assert.equal(result.turn_context.stage, expectedContext.stage);
  assert.equal(result.turn_context.project_id, state.state_meta.project_id);
  assert.equal(result.turn_context.revision, state.state_meta.revision);
  assert.deepEqual(result.turn_context.startup_notice, state.state_meta.startup_notice);
  assert.deepEqual(result.turn_context.operation, state.state_meta.active_operation);
  if (Object.prototype.hasOwnProperty.call(result, "artifact_status")) {
    assert.deepEqual(result.turn_context.artifact_status, result.artifact_status);
  }
  if (Object.prototype.hasOwnProperty.call(result, "warnings")) {
    assert.deepEqual(result.turn_context.artifact_warnings, result.warnings);
  }
  assertRequiredReferences(result, expectedContext.references);
  assert.equal("turn_context" in state, false);
  assert.equal("required_references" in state, false);
  assert.equal("operation_packet_ref" in state, false);
  assert.equal(state.state_meta.schema_version, 9);
}

function begin(projectRoot, prior, route, extras = {}) {
  return execute(projectRoot, "begin", {
    payload: {
      ...expected(prior),
      route,
      intent_summary: `Exercise ${route}`,
      ...extras,
    },
  });
}

const DEFAULT_PRESENTATION = Object.freeze({
  confirmation: null,
  framing: "The current operation is complete.",
  options: [],
  boundary: "No additional boundary changed.",
  next_steps: "Continue with the next requested step.",
  direct_assignment: null,
});

const DEFAULT_DISCOVERY_CONTRACT = Object.freeze({
  target: "Candidate structure around treatment and outcome",
  input_refs: ["data/study.csv"],
  variables: ["treatment", "outcome", "age"],
  method_plan: "stable-pc",
  constraints: ["treatment precedes outcome"],
  diagnostic_requirements: ["bootstrap edge stability"],
  output_type: "CPDAG and edge-stability table",
  claim_boundary: "candidate_only",
});

const DEFAULT_ANALYSIS_EXECUTION_CONTRACT = Object.freeze({
  target: "Estimate the approved treatment-outcome contrast",
  input_refs: ["data/study.csv"],
  method_plan: "Fit the approved design and report uncertainty",
  execution_requirements: [
    "Estimate the approved contrast using the bound design.",
    "Report the required diagnostics and uncertainty.",
  ],
  output_type: "Estimate table with diagnostics",
  claim_boundary: "Interpret only within the approved causal scope.",
});

function discoveryScope(transition, contract = DEFAULT_DISCOVERY_CONTRACT) {
  return { transition, contract: structuredClone(contract) };
}

function decisionOption(label, route, extras = {}) {
  return {
    label,
    consultant_read: `${label} is currently supportable.`,
    tradeoff: `${label} uses this operation.`,
    assignment: {
      route,
      intent_summary: `Exercise ${label.toLowerCase()}`,
      ...extras,
    },
  };
}

function optionsPresentation(options) {
  return {
    confirmation: "The current operation is complete.",
    framing: "There are multiple useful ways to continue.",
    options,
    boundary: "Each choice starts one operation and preserves the current evidence boundary.",
    next_steps: "Choose one of the options.",
    direct_assignment: null,
  };
}

function beginSelection(projectRoot, prior, decisionId, optionNumber, extras = {}) {
  return execute(projectRoot, "begin", {
    payload: {
      ...expected(prior),
      selection: {
        decision_id: decisionId,
        option_number: optionNumber,
      },
      ...extras,
    },
  });
}

function readyDirectAssignment(projectRoot) {
  const state = readState(projectRoot);
  const operation = state.state_meta.active_operation;
  if (operation === null || operation.stage !== "lead_pending" || operation.scope_ref === null) {
    return null;
  }
  const route = state.next_step_plan[0]?.id;
  const support = state.next_step_plan[0]?.support ?? null;
  const status = typeof route === "string" && route.startsWith("analysis_execution.")
    ? state.council_chamber.analysis_execution[route.slice("analysis_execution.".length)]?.current_status
    : route === "report_writer"
      ? state.council_chamber.report_writer.current_status
      : null;
  if (status !== "ready") return null;
  return {
    route,
    support,
    intent_summary: `Execute the exact ready ${operation.scope_ref.kind} scope.`,
    scope_ref: structuredClone(operation.scope_ref),
  };
}

function finish(projectRoot, prior, updates = {}, options = {}) {
  const defaultPresentation = structuredClone(DEFAULT_PRESENTATION);
  if (!options.cancel) {
    defaultPresentation.direct_assignment = readyDirectAssignment(projectRoot);
    if (defaultPresentation.direct_assignment !== null) {
      const kind = defaultPresentation.direct_assignment.scope_ref.kind;
      defaultPresentation.next_steps = `Do you approve executing this exact ready ${kind} scope?`;
    }
  }
  return execute(projectRoot, "finish", {
    args: options.cancel ? ["--cancel"] : [],
    env: options.env,
    payload: {
      ...expected(prior),
      operation_id: prior.operation_id,
      updates,
      presentation: options.presentation ?? defaultPresentation,
      ...(options.questionActions === undefined
        ? {}
        : { question_actions: options.questionActions }),
    },
  });
}

function recordQuestion(sourceText, options = {}) {
  return {
    action: "record",
    question_id: options.questionId ?? null,
    source_text: sourceText,
    surface: options.surface ?? false,
  };
}

function surfaceQuestion(questionId) {
  return { action: "surface", question_id: questionId };
}

function retireQuestion(questionId, kind, note) {
  return {
    action: "retire",
    question_id: questionId,
    resolution: { kind, note },
  };
}

function projectedOpenQuestion(entry) {
  return {
    question: entry.question,
    status: "open",
    source_operation_count: entry.source_operation_count,
    surfaced: entry.first_surfaced_revision !== null,
  };
}

function projectedRetiredQuestion(entry) {
  return {
    question: entry.question,
    status: "retired",
    resolution: structuredClone(entry.resolution),
  };
}

function applyDataAuditQuestion(projectRoot, started, question) {
  return expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: {
          data_checked: "limited",
          audit_scope: "Question-led audit handoff.",
        },
        council_chamber: {
          data_audit: {
            current_status: "limited",
            summary: "The audit found one material user-only question.",
            questions_for_user: [question],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
}

function analysisSlot(status, summary, support = null, executionContract = DEFAULT_ANALYSIS_EXECUTION_CONTRACT) {
  const slot = {
    current_status: status,
    summary,
    questions_for_user: [],
    feedback_to_route: [],
    support,
  };
  if (status === "ready") slot.execution_contract = structuredClone(executionContract);
  return slot;
}

function rawAnalysisSlot(status, summary, support = null, executionContract = DEFAULT_ANALYSIS_EXECUTION_CONTRACT) {
  return {
    ...analysisSlot(status, summary, support, executionContract),
    causal_basis_hash: null,
  };
}

function packetFor(result) {
  const packet = result.operation_packet ?? PACKETS.get(result.operation_id);
  assert.ok(packet, "result must expose or reference a previously returned operation_packet");
  return packet;
}

function packetRequirementIds(result) {
  const packet = packetFor(result);
  assert.ok(Array.isArray(packet.requirements));
  return packet.requirements.map((item) => item.id);
}

function executionReceipt(result, options = {}) {
  const packet = packetFor(result);
  const requirementIds = packetRequirementIds(result);
  const unmetRequirements = options.unmet_requirements ?? [];
  const completedRequirements = options.completed_requirements
    ?? requirementIds.filter((id) => !unmetRequirements.includes(id));
  const evidenceFiles = [...(
    options.evidence_files
    ?? (result.artifact_intent ? [result.artifact_intent.location] : [])
  )];
  return {
    contract_hash: options.contract_hash ?? packet.contract_hash,
    completed_requirements: [...completedRequirements],
    unmet_requirements: [...unmetRequirements],
    supplemental_work: [...(options.supplemental_work ?? [])],
    evidence_files: evidenceFiles,
    requirement_evidence: structuredClone(
      options.requirement_evidence
      ?? completedRequirements.map((requirementId) => ({
        requirement_id: requirementId,
        file: evidenceFiles[0],
        locator: `Evidence for ${requirementId}`,
      })),
    ),
    deviations: [...(options.deviations ?? [])],
  };
}

function legacyExecutionReceipt(result, options = {}) {
  const receipt = executionReceipt(result, options);
  delete receipt.requirement_evidence;
  delete receipt.deviations;
  return receipt;
}

function writeLegacySchema2Completion(projectRoot, result, actor, summary, receipt) {
  const finalPath = path.join(projectRoot, ...result.artifact_intent.location.split("/"));
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  fs.writeFileSync(finalPath, "estimate,se\n0.8,0.1\n", "utf8");
  const manifestPath = path.join(projectRoot, ...result.manifest_path.split("/"));
  const manifest = {
    schema_version: 2,
    operation_id: result.operation_id,
    route: actor.startsWith("analysis_execution.") ? "analysis_execution" : actor,
    scope_ref: structuredClone(result.scope_ref ?? null),
    artifact_role: "completion",
    execution_receipt: structuredClone(receipt),
    files: [result.artifact_intent.location],
    completed_at: new Date().toISOString(),
    summary,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { finalPath, manifestPath, manifest };
}

function scopedArtifact(result, summary, options = {}) {
  const artifactRole = options.artifact_role ?? "completion";
  const receiptOptions = { ...options };
  delete receiptOptions.artifact_role;
  return {
    summary,
    artifact_role: artifactRole,
    execution_receipt: executionReceipt(result, receiptOptions),
  };
}

function writeReservedTemporary(projectRoot, reserved, contents = "diagnostic,value\nstatus,1\n") {
  const temporary = path.join(projectRoot, ...reserved.temporary_path.split("/"));
  fs.mkdirSync(path.dirname(temporary), { recursive: true });
  fs.writeFileSync(temporary, contents, "utf8");
  return temporary;
}

function causalCheckUpdates(causalFacts, summary = "Causal review completed.") {
  const facts = structuredClone(causalFacts);
  const decisionFields = [
    "analysis_readiness",
    "support_status",
    "recommended_checks",
    "recommended_method_routes",
  ];
  if (
    decisionFields.some((field) => Object.prototype.hasOwnProperty.call(facts, field))
    && !Object.prototype.hasOwnProperty.call(facts, "analysis_options")
  ) {
    const design = facts.recommended_method_routes?.find((route) => route.category === "design")?.id;
    const support = facts.recommended_method_routes?.find((route) => route.category === "support")?.id;
    facts.analysis_options = ["ready", "limited"].includes(facts.analysis_readiness) && design
      ? [analysisOption("preferred", design, support)]
      : [];
  }
  return {
    causal_facts: facts,
    council_chamber: {
      causal_check: {
        current_status: "review_complete",
        summary,
        questions_for_user: [],
        feedback_to_route: [],
      },
    },
  };
}

function analysisOption(role, design, support = null, overrides = {}) {
  return {
    role,
    target: "Estimate the configured treatment effect.",
    approach: `Use the ${design} design route.`,
    design,
    ...(support === null ? {} : { support }),
    data_work: [],
    requirements: ["Respect the stated unit, timing, and support conditions."],
    main_risk: "The identifying assumptions may remain only partly testable.",
    prefer_when: "The current design assumptions and data support remain credible.",
    ...overrides,
  };
}

function seedAnalysisEligibility(projectRoot, options = {}) {
  const {
    design = "single_time_observational",
    support = null,
    readiness = "ready",
  } = options;
  const state = readState(projectRoot);
  state.data_facts.data_checked = "passing";
  state.domain_knowledge.domain_checked = "passing";
  state.causal_facts.causal_checked = "passing";
  state.causal_facts.analysis_readiness = readiness;
  state.causal_facts.recommended_method_routes = [
    { id: design, category: "design", route_cautions: [] },
    ...(support === null ? [] : [{ id: support, category: "support", route_cautions: [] }]),
  ];
  state.causal_facts.analysis_options = [analysisOption("preferred", design, support)];
  writeState(projectRoot, state);
}

function prepareAnalysisScope(projectRoot, design = "single_time_observational", support = null) {
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  seedAnalysisEligibility(projectRoot, {
    design,
    support,
    readiness: design === "descriptive_association" ? "limited" : "ready",
  });
  const started = expectSuccess(begin(projectRoot, opened, `analysis_execution.${design}`, { support }), "BEGAN_WORKER");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: `analysis_execution.${design}`,
      scope_transition: "new",
      updates: {
        council_chamber: {
          analysis_execution: {
            [design]: analysisSlot("ready", "Approved-scope candidate is ready.", support),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const stateWithScope = readState(projectRoot);
  const slot = stateWithScope.council_chamber.analysis_execution[design];
  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  return {
    project_id: closed.project_id,
    revision: closed.revision,
    design,
    support,
    scope_ref: { kind: "analysis", id: slot.scope_id, revision: slot.scope_revision },
  };
}

function pushAnalysisCompletionRecord(projectRoot, options = {}) {
  const artifactId = options.artifactId ?? "legacy-0001";
  const location = options.location ?? `output/analysis-priors-${artifactId}/`;
  const state = readState(projectRoot);
  state.project_summary.analysis_output = "exist";
  state.artifact_records.push({
    artifact_id: artifactId,
    operation_id: null,
    route: "analysis_execution",
    design: "single_time_observational",
    support: null,
    location,
    created_at: "historical import",
    summary: "Prior completed analysis output.",
    artifact_role: "completion",
  });
  writeState(projectRoot, state);
  if (options.available) {
    fs.mkdirSync(path.join(projectRoot, ...location.split("/").filter(Boolean)), {
      recursive: true,
    });
  }
  return artifactId;
}

function pushReportCompletionRecord(projectRoot, options = {}) {
  const artifactId = options.artifactId ?? "legacy-9001";
  const location = options.location ?? `output/report-priors-${artifactId}.html`;
  const state = readState(projectRoot);
  state.project_summary.report_output = "exist";
  state.artifact_records.push({
    artifact_id: artifactId,
    operation_id: options.operationId ?? null,
    route: "report_writer",
    location,
    created_at: "historical import",
    summary: "Prior completed report output.",
    artifact_role: "completion",
  });
  writeState(projectRoot, state);
  if (options.available) {
    const filePath = path.join(projectRoot, ...location.split("/").filter(Boolean));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "<!doctype html><title>Prior report</title>\n", "utf8");
  }
  return artifactId;
}

function prepareReportScope(projectRoot, options = {}) {
  const opened = options.opened ?? expectSuccess(execute(projectRoot, "open"), "CREATED");
  const analysisArtifactIds = options.analysisArtifactIds ?? [];
  const started = expectSuccess(begin(projectRoot, opened, "report_writer"), "BEGAN_WORKER");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "report_writer",
      scope_transition: "new",
      updates: {
        report_assembly: {
          report_goal: "Report the approved findings",
          audience: "Clinical collaborators",
          target_section: "Results",
          claim_boundary: "Report only evidence supported by the approved causal scope.",
          planned_structure: ["Findings", "Limitations"],
          wording_constraints: ["Preserve the approved causal claim boundary."],
          analysis_artifact_ids: analysisArtifactIds,
        },
        council_chamber: {
          report_writer: {
            current_status: "ready",
            summary: "Report scope is ready.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const scope = readState(projectRoot).report_assembly;
  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  return {
    project_id: closed.project_id,
    revision: closed.revision,
    scope_ref: { kind: "report", id: scope.scope_id, revision: scope.scope_revision },
  };
}

function runHookProcess(projectRoot, options = {}) {
  const env = { ...process.env, NODE_PATH: "", ...(options.env || {}) };
  for (const name of options.unsetEnv || []) delete env[name];
  return spawnSync(process.execPath, [options.hook || CODEX_HOOK], {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    input: JSON.stringify(options.input || { cwd: projectRoot }),
    env,
  });
}

function runHook(projectRoot, options = {}) {
  const child = runHookProcess(projectRoot, options);
  assert.equal(child.status, 0, child.stderr);
  assert.notEqual(child.stdout, "", "hook emitted no JSON");
  return JSON.parse(child.stdout.trim());
}

function runCodexHookInstaller(projectRoot) {
  const child = spawnSync(process.execPath, [CODEX_HOOK_INSTALLER, "--project-root", projectRoot], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `installer must emit one JSON line\nstdout: ${child.stdout}\nstderr: ${child.stderr}`);
  return { ...child, result: JSON.parse(lines[0]) };
}

function runClaudeHookInstaller(projectRoot) {
  const child = spawnSync(process.execPath, [CLAUDE_HOOK_INSTALLER, "--project-root", projectRoot], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `installer must emit one JSON line\nstdout: ${child.stdout}\nstderr: ${child.stderr}`);
  return { ...child, result: JSON.parse(lines[0]) };
}

test("open creates a valid state and a normal open is a byte-preserving no-op", (t) => {
  const projectRoot = temporaryProject(t);
  const created = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const firstBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  const state = readState(projectRoot);

  assert.equal(state.state_meta.schema_version, 9);
  assert.equal(state.state_meta.project_id, created.project_id);
  assert.equal(state.state_meta.revision, 0);
  assert.equal(state.state_meta.active_operation, null);
  assert.deepEqual(state.state_meta.startup_notice, {
    kind: "created",
    archive_path: null,
  });
  assert.deepEqual(state.next_step_plan, []);
  assert.deepEqual(state.carried_questions, []);
  assert.equal(state.pending_decision, null);
  assert.equal(state.response_receipt, null);

  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.equal(reopened.project_id, created.project_id);
  assert.equal(reopened.revision, 0);
  assert.equal(reopened.mode, "idle");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), firstBytes);
  expectSuccess(execute(projectRoot, "validate"), "VALID");
});

test("open creates a missing project root before acquiring its state lock", (t) => {
  const parent = temporaryProject(t);
  const projectRoot = path.join(parent, "nested", "new-project");
  assert.equal(fs.existsSync(projectRoot), false);
  const opened = expectSuccess(execute(projectRoot, "open", { cwd: parent }), "CREATED");
  assert.equal(fs.existsSync(projectRoot), true);
  assert.equal(readState(projectRoot).state_meta.project_id, opened.project_id);
  assert.equal(fs.existsSync(stateLockPath(projectRoot)), false);
});

test("project-state mutation locking prevents concurrent lost updates", async (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const payload = {
    ...expected(opened),
    route: "team_lead",
    intent_summary: "Start exactly one concurrent operation.",
  };
  const before = fs.readFileSync(statePath(projectRoot));
  const firstPromise = executeAsync(projectRoot, "begin", {
    env: { STATECTL_TEST_HOLD_LOCK_MS: "750" },
    payload,
  });
  await waitForPath(stateLockPath(projectRoot));

  expectFailure(execute(projectRoot, "begin", { payload }), "STATE_LOCKED");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const winner = expectSuccess(await firstPromise, "BEGAN_LEAD");
  const state = readState(projectRoot);
  assert.equal(state.state_meta.revision, 1);
  assert.equal(state.state_meta.active_operation.id, winner.operation_id);
  assert.equal(fs.existsSync(stateLockPath(projectRoot)), false);
  expectFailure(execute(projectRoot, "begin", { payload }), "STALE_REVISION");
  expectSuccess(finish(projectRoot, winner, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("project-state mutation locking reaps dead owners but never a live owner", async (t) => {
  await t.test("dead owner", async () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const child = spawn(process.execPath, ["-e", "process.exit(0)"]);
    const deadPid = child.pid;
    await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    const lockPath = stateLockPath(projectRoot);
    fs.mkdirSync(lockPath);
    fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify({
      protocol: 1,
      pid: deadPid,
      hostname: os.hostname().trim().toLowerCase() || "unknown-host",
      token: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    }));

    const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    assert.equal(fs.existsSync(lockPath), false);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("live owner", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const lockPath = stateLockPath(projectRoot);
    fs.mkdirSync(lockPath);
    fs.writeFileSync(path.join(lockPath, "owner.json"), JSON.stringify({
      protocol: 1,
      pid: process.pid,
      hostname: os.hostname().trim().toLowerCase() || "unknown-host",
      token: crypto.randomUUID(),
      created_at: new Date(0).toISOString(),
    }));
    const old = new Date(0);
    fs.utimesSync(lockPath, old, old);

    expectFailure(begin(projectRoot, opened, "team_lead"), "STATE_LOCKED");
    assert.equal(fs.existsSync(lockPath), true);
    fs.rmSync(lockPath, { recursive: true, force: true });
    const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("unexpected lock path", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const lockPath = stateLockPath(projectRoot);
    const marker = Buffer.from("not a controller lock\n");
    fs.writeFileSync(lockPath, marker);

    expectFailure(begin(projectRoot, opened, "team_lead"), "STATE_LOCKED");
    assert.deepEqual(fs.readFileSync(lockPath), marker);
    fs.rmSync(lockPath);
    const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });
});

test("template validation advertises the required controller capabilities", () => {
  const result = validateSourceTemplate({ skillRoot: SKILL_ROOT });
  assert.equal(result.schema_version, 9);
  assert.equal(result.capabilities.analysis_options, 1);
  assert.equal(result.capabilities.requirement_evidence, 1);
  assert.equal(result.capabilities.direct_assignment, 1);
  assert.equal(result.capabilities.audience_profile, 1);
  assert.equal(result.capabilities.carried_questions, 2);
  assert.equal(result.capabilities.causal_scope_basis, 1);
  assert.equal(result.capabilities.conditional_references, 1);
  assert.equal(result.capabilities.lead_directives, 1);
  assert.equal(result.capabilities.report_evidence_binding, 1);
});

test("begin treats a historical manifest lstat race as an availability warning", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "warning-race",
      extension: "txt",
    },
  }), "ARTIFACT_RESERVED");
  writeReservedTemporary(projectRoot, reserved, "validated audit output\n");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: {
          data_checked: "passing",
          data_sources: ["data/input.csv"],
          audit_scope: "Historical artifact warning regression.",
          unit_of_observation: "Row",
          artifact_refs: [reserved.artifact_intent.location],
        },
        council_chamber: {
          data_audit: {
            current_status: "complete",
            summary: "Audit artifact completed.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
      artifact: { summary: "Validated audit output." },
    },
  }), "WORKER_APPLIED");
  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");

  const manifestPath = path.resolve(projectRoot, ...reserved.manifest_path.split("/"));
  const originalLstat = fs.lstatSync;
  let reopened;
  fs.lstatSync = function lstatWithManifestRace(filePath, ...args) {
    if (path.resolve(filePath) === manifestPath) {
      const error = new Error("forced historical manifest race");
      error.code = "ENOENT";
      throw error;
    }
    return originalLstat.call(fs, filePath, ...args);
  };
  try {
    reopened = beginSourceOperation({
      projectRoot,
      payload: {
        ...expected(closed),
        route: "team_lead",
        intent_summary: "Verify warning-only historical artifact diagnostics.",
      },
    });
  } finally {
    fs.lstatSync = originalLstat;
  }

  assert.equal(reopened.ok, true);
  assert.equal(reopened.code, "BEGAN_LEAD");
  assert.equal(reopened.revision, closed.revision + 1);
  assert.deepEqual(reopened.turn_context.artifact_warnings, [{
    code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
    artifact_id: applied.artifact_record.artifact_id,
    location: applied.artifact_record.location,
    manifest_path: reserved.manifest_path,
  }]);
  const state = readState(projectRoot);
  assert.equal(state.state_meta.revision, reopened.revision);
  assert.equal(state.state_meta.active_operation.id, reopened.operation_id);
  assert.equal(state.state_meta.active_operation.stage, "lead_pending");
  expectSuccess(finish(projectRoot, reopened, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("active artifact inspection classifies filesystem races without mutating state", async (t) => {
  function preparedArtifact(projectRoot) {
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug: "active-race",
        extension: "txt",
      },
    }), "ARTIFACT_RESERVED");
    const target = path.join(projectRoot, ...reserved.artifact_intent.location.split("/"));
    const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "validated audit output\n", "utf8");
    const summary = "Validated audit output.";
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      schema_version: 1,
      operation_id: started.operation_id,
      route: "data_audit",
      scope_ref: null,
      files: [reserved.artifact_intent.location],
      completed_at: new Date().toISOString(),
      summary,
    }, null, 2)}\n`, "utf8");
    return {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "data_audit",
        updates: {
          data_facts: {
            data_checked: "passing",
            audit_scope: "Active artifact race classification.",
          },
          council_chamber: {
            data_audit: {
              current_status: "complete",
              summary: "Audit completed.",
              questions_for_user: [],
              feedback_to_route: [],
            },
          },
        },
        artifact: { summary },
      },
      target,
      manifestPath,
    };
  }

  const scenarios = [
    { name: "output disappears", selectedPath: "target", fsCode: "ENOENT", expectedCode: "MISSING_ARTIFACT" },
    { name: "manifest disappears", selectedPath: "manifestPath", fsCode: "ENOENT", expectedCode: "MISSING_ARTIFACT" },
    { name: "output cannot be inspected", selectedPath: "target", fsCode: "EACCES", expectedCode: "IO_ERROR" },
    { name: "manifest cannot be inspected", selectedPath: "manifestPath", fsCode: "EACCES", expectedCode: "IO_ERROR" },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const prepared = preparedArtifact(projectRoot);
      const before = fs.readFileSync(statePath(projectRoot));
      const racePath = path.resolve(prepared[scenario.selectedPath]);
      const originalLstat = fs.lstatSync;
      let matchingInspections = 0;
      fs.lstatSync = function lstatWithActiveArtifactRace(filePath, ...args) {
        if (path.resolve(filePath) === racePath && ++matchingInspections === 2) {
          if (scenario.fsCode === "ENOENT") fs.unlinkSync(racePath);
          const error = new Error(`forced ${scenario.fsCode} active artifact race`);
          error.code = scenario.fsCode;
          throw error;
        }
        return originalLstat.call(fs, filePath, ...args);
      };
      try {
        assert.throws(
          () => applySourceWorker({ projectRoot, payload: prepared.payload }),
          (error) => error && error.code === scenario.expectedCode,
        );
      } finally {
        fs.lstatSync = originalLstat;
      }
      assert.equal(matchingInspections, 2);
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
      const state = readState(projectRoot);
      assert.equal(state.state_meta.revision, prepared.payload.expected_revision);
      assert.equal(state.state_meta.active_operation.stage, "worker_pending");
    });
  }
});

test("idle open returns exact routing context and a compact previous-response cue", (t) => {
  const projectRoot = temporaryProject(t);
  const created = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const seeded = readState(projectRoot);
  const analysisId = crypto.randomUUID();
  const discoveryId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  seeded.council_chamber.analysis_execution.single_time_observational = {
    ...rawAnalysisSlot("ready", "Exact analysis scope sentinel."),
    last_updated: null,
    scope_id: analysisId,
    scope_revision: 2,
  };
  seeded.discovery_sidecar = {
    ...seeded.discovery_sidecar,
    scope_id: discoveryId,
    scope_revision: 3,
    execution_contract: structuredClone(DEFAULT_DISCOVERY_CONTRACT),
    status: "scoped",
    goal: DEFAULT_DISCOVERY_CONTRACT.target,
    scope: "Exact discovery scope sentinel.",
  };
  seeded.report_assembly.scope_id = reportId;
  seeded.report_assembly.scope_revision = 4;
  seeded.report_assembly.report_goal = "Exact report scope sentinel.";
  seeded.council_chamber.report_writer.current_status = "ready";
  seeded.council_chamber.report_writer.summary = "Exact report handoff sentinel.";
  writeState(projectRoot, seeded);

  const started = expectSuccess(begin(projectRoot, created, "team_lead"), "BEGAN_LEAD");
  const finished = expectSuccess(finish(projectRoot, started, {}, {
    presentation: {
      confirmation: "Confirmation sentinel omitted from routing context.",
      framing: "Framing sentinel omitted from routing context.",
      options: [
        {
          label: "Audit the supplied data",
          consultant_read: "Inspect the current dataset structure.",
          tradeoff: "Improves data certainty before analysis.",
          assignment: { route: "data_audit", intent_summary: "Audit the supplied dataset." },
        },
        {
          label: "Clarify the study domain",
          consultant_read: "Review the construct and setting.",
          tradeoff: "Improves interpretation before method selection.",
          assignment: { route: "domain_expert", intent_summary: "Clarify the study domain." },
        },
      ],
      boundary: "Exact boundary cue.",
      next_steps: "This is replaced when options exist.",
      direct_assignment: null,
    },
  }), "OPERATION_FINISHED");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  assertTurnContext(projectRoot, reopened, {
    audience: "router",
    actor: null,
    stage: "idle",
    references: ["references/route_selection_workflow.md"],
  });

  const state = readState(projectRoot);
  const contextState = reopened.turn_context.state;
  assert.deepEqual(contextState.project_summary, state.project_summary);
  assert.deepEqual(
    contextState.analysis_execution.single_time_observational.execution_contract,
    DEFAULT_ANALYSIS_EXECUTION_CONTRACT,
  );
  assert.deepEqual(contextState.core_status.causal_discovery.sidecar, state.discovery_sidecar);
  assert.deepEqual(contextState.report.assembly, state.report_assembly);
  assert.deepEqual(contextState.pending_decision, state.pending_decision);
  assert.deepEqual(contextState.artifact_records, state.artifact_records);
  assert.deepEqual(reopened.turn_context.previous_response_cue, {
    operation_id: finished.operation_id,
    revision: finished.revision,
    direct_assignment: null,
    consultant_options: [
      "    1. Audit the supplied data",
      "       Consultant read: Inspect the current dataset structure.",
      "       Tradeoff: Improves data certainty before analysis.",
      "    2. Clarify the study domain",
      "       Consultant read: Review the construct and setting.",
      "       Tradeoff: Improves interpretation before method selection.",
    ].join("\n"),
    boundary: "Exact boundary cue.",
    next_steps: "Choose one option, or suggest another action.",
  });
  const serializedContext = JSON.stringify(reopened.turn_context);
  assert.equal(serializedContext.includes("Framing sentinel omitted"), false);
  assert.equal(serializedContext.includes("Confirmation sentinel omitted"), false);
  assert.equal(serializedContext.includes("response_markdown"), false);
});

test("validate exposes a deterministic scope snapshot without mutating state", (t) => {
  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");
  const state = readState(projectRoot);
  const singleId = crypto.randomUUID();
  const differenceId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  state.council_chamber.analysis_execution.single_time_observational = {
    ...rawAnalysisSlot("ready", "Single-time scope."),
    last_updated: null,
    scope_id: singleId,
    scope_revision: 2,
  };
  state.council_chamber.analysis_execution.difference_in_differences = {
    ...rawAnalysisSlot("blocked", "Difference-in-differences scope.", "statistical-validity"),
    execution_contract: null,
    last_updated: null,
    scope_id: differenceId,
    scope_revision: 1,
  };
  state.council_chamber.analysis_execution.randomized_assignment = {
    ...rawAnalysisSlot("requested", "No scope identity yet."),
    execution_contract: null,
    last_updated: null,
    scope_id: null,
    scope_revision: 0,
  };
  state.report_assembly.scope_id = reportId;
  state.report_assembly.scope_revision = 3;
  state.council_chamber.report_writer.current_status = "ready";
  writeState(projectRoot, state);
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  const validated = expectSuccess(execute(projectRoot, "validate"), "VALID");
  assert.deepEqual(Object.keys(validated.scope_snapshot.analysis), [
    "difference_in_differences",
    "single_time_observational",
  ]);
  assert.deepEqual(validated.scope_snapshot, {
    analysis: {
      difference_in_differences: {
        scope_id: differenceId,
        scope_revision: 1,
        current_status: "blocked",
        support: "statistical-validity",
        basis_current: false,
        last_updated: null,
      },
      single_time_observational: {
        scope_id: singleId,
        scope_revision: 2,
        current_status: "ready",
        support: null,
        basis_current: false,
        last_updated: null,
      },
    },
    report: {
      scope_id: reportId,
      scope_revision: 3,
      current_status: "ready",
      last_updated: null,
    },
    discovery: null,
  });
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
});

test("open --fresh archives exact prior bytes before replacing even malformed state", (t) => {
  const projectRoot = temporaryProject(t);
  const malformed = "project_summary: [unterminated\r\n# preserve these exact bytes\r\n";
  fs.writeFileSync(statePath(projectRoot), malformed, "utf8");

  const reset = expectSuccess(execute(projectRoot, "open", { args: ["--fresh"] }), "RESET");
  assert.equal(fs.readFileSync(reset.archive_path, "utf8"), malformed);
  assert.notEqual(fs.readFileSync(statePath(projectRoot), "utf8"), malformed);
  const resetState = readState(projectRoot);
  const relativeArchive = path.relative(projectRoot, reset.archive_path).split(path.sep).join("/");
  assert.deepEqual(resetState.state_meta.startup_notice, {
    kind: "reset",
    archive_path: relativeArchive,
  });
  assert.equal(path.isAbsolute(resetState.state_meta.startup_notice.archive_path), false);
  assert.deepEqual(
    fs.readFileSync(path.resolve(projectRoot, resetState.state_meta.startup_notice.archive_path)),
    Buffer.from(malformed),
  );
  expectSuccess(execute(projectRoot, "validate"), "VALID");

  const secondRoot = temporaryProject(t);
  const createdFresh = expectSuccess(execute(secondRoot, "open", { args: ["--fresh"] }), "CREATED_FRESH");
  assert.equal(createdFresh.archive_path, null);
  assert.deepEqual(readState(secondRoot).state_meta.startup_notice, {
    kind: "created",
    archive_path: null,
  });
});

test("supported v4.5 migration preserves evidence, adds identities, and is idempotent", (t) => {
  const projectRoot = temporaryProject(t);
  copyFixture(projectRoot, "supported-v45.yaml");
  const original = fs.readFileSync(statePath(projectRoot), "utf8");

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED");
  assert.equal(fs.readFileSync(migrated.archive_path, "utf8"), original);
  assert.deepEqual(migrated.warnings, [{
    code: "MISSING_HISTORICAL_ARTIFACT",
    artifact_id: "legacy-0001",
    location: "output/legacy-estimate.csv",
  }]);

  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 9);
  assert.equal(state.state_meta.startup_notice, null);
  assert.equal(state.pending_decision, null);
  assert.equal(state.response_receipt, null);
  assert.equal(state.project_summary.title, "Legacy clinical study");
  assert.equal("discovery_sidecar_output" in state.project_summary, false);
  assert.match(state.council_chamber.analysis_execution.single_time_observational.scope_id, /^[0-9a-f-]{36}$/);
  assert.equal(state.council_chamber.analysis_execution.single_time_observational.scope_revision, 1);
  assert.match(state.report_assembly.scope_id, /^[0-9a-f-]{36}$/);
  assert.equal(state.report_assembly.scope_revision, 1);
  assert.equal(state.artifact_records[0].artifact_id, "legacy-0001");
  assert.equal(state.artifact_records[0].operation_id, null);
  assert.equal(state.artifact_records[0].artifact_role, "completion");
  assert.equal(state.artifact_records[0].created_at, "23:14:59");

  const migratedBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), migratedBytes);
});

test("migration recognizes feedback-only scopes and owns legacy artifact identity", (t) => {
  const projectRoot = temporaryProject(t);
  const legacy = YAML.parse(fs.readFileSync(path.join(FIXTURES, "supported-v45.yaml"), "utf8"));
  const analysis = legacy.council_chamber.analysis_execution.single_time_observational;
  analysis.last_updated = null;
  analysis.current_status = null;
  analysis.summary = null;
  analysis.support = null;
  analysis.questions_for_user = ["Preserve this analysis scope question."];
  const reportChamber = legacy.council_chamber.report_writer;
  reportChamber.last_updated = null;
  reportChamber.current_status = null;
  reportChamber.summary = null;
  reportChamber.questions_for_user = [];
  reportChamber.feedback_to_route = [];
  Object.assign(legacy.report_assembly, {
    last_updated: null,
    current_format: null,
    report_goal: null,
    audience: null,
    target_section: null,
    planned_structure: [],
    key_points: ["Preserve this report scope point."],
    wording_constraints: [],
    draft_notes: [],
  });
  legacy.artifact_records[0].artifact_id = crypto.randomUUID();
  legacy.artifact_records[0].operation_id = crypto.randomUUID();
  writeState(projectRoot, legacy);

  expectSuccess(execute(projectRoot, "open"), "MIGRATED");
  const state = readState(projectRoot);
  assert.match(state.council_chamber.analysis_execution.single_time_observational.scope_id, /^[0-9a-f-]{36}$/);
  assert.match(state.report_assembly.scope_id, /^[0-9a-f-]{36}$/);
  assert.equal(state.artifact_records[0].artifact_id, "legacy-0001");
  assert.equal(state.artifact_records[0].operation_id, null);
  assert.equal(state.artifact_records[0].artifact_role, "completion");
});

test("legacy active plans and opinions-era states fail closed without byte changes", async (t) => {
  await t.test("legacy active plan", () => {
    const projectRoot = temporaryProject(t);
    const fixture = fs.readFileSync(path.join(FIXTURES, "supported-v45.yaml"), "utf8");
    const active = fixture.replace(
      "next_step_plan: []",
      "next_step_plan:\n  - id: data_audit\n  - id: team_lead",
    );
    assert.notEqual(active, fixture);
    fs.writeFileSync(statePath(projectRoot), active, "utf8");
    expectFailure(execute(projectRoot, "open"), "LEGACY_ACTIVE_PLAN");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), active);

    const recovered = expectSuccess(
      execute(projectRoot, "open", { args: ["--discard-legacy-plan"] }),
      "MIGRATED_LEGACY_PLAN_DISCARDED",
    );
    assert.equal(readState(projectRoot).next_step_plan.length, 0);
    assert.equal(fs.readFileSync(recovered.archive_path, "utf8"), active);
  });

  await t.test("opinions era", () => {
    const projectRoot = temporaryProject(t);
    copyFixture(projectRoot, "unsupported-opinions.yaml");
    const original = fs.readFileSync(statePath(projectRoot), "utf8");
    expectFailure(execute(projectRoot, "open"), "UNSUPPORTED_SCHEMA");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), original);
  });
});

test("strict validation rejects malformed YAML, duplicate keys, and unknown schemas", async (t) => {
  for (const scenario of [
    { name: "malformed YAML", text: "state_meta: [unterminated\n", code: "INVALID_YAML" },
    { name: "duplicate keys", text: "state_meta: {}\nstate_meta: {}\n", code: "INVALID_YAML" },
  ]) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      fs.writeFileSync(statePath(projectRoot), scenario.text, "utf8");
      expectFailure(execute(projectRoot, "validate"), scenario.code);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), scenario.text);
    });
  }

  await t.test("newer schema", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const state = readState(projectRoot);
    state.state_meta.schema_version = 99;
    writeState(projectRoot, state);
    const original = fs.readFileSync(statePath(projectRoot), "utf8");
    expectFailure(execute(projectRoot, "validate"), "UNSUPPORTED_SCHEMA");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), original);
  });
});

test("strict validation rejects malformed startup notices", async (t) => {
  const cases = [
    {
      name: "missing notice",
      mutate(state) {
        delete state.state_meta.startup_notice;
      },
    },
    {
      name: "created notice with archive",
      mutate(state) {
        state.state_meta.startup_notice.archive_path = "project_state.archives/old.yaml";
      },
    },
    {
      name: "reset notice with traversal",
      mutate(state) {
        state.state_meta.startup_notice = {
          kind: "reset",
          archive_path: "project_state.archives/../old.yaml",
        };
      },
    },
    {
      name: "unknown notice field",
      mutate(state) {
        state.state_meta.startup_notice.extra = true;
      },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      expectSuccess(execute(projectRoot, "open"), "CREATED");
      const state = readState(projectRoot);
      scenario.mutate(state);
      writeState(projectRoot, state);
      const before = fs.readFileSync(statePath(projectRoot));

      expectFailure(execute(projectRoot, "validate"), "INVALID_STATE");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    });
  }
});

test("method recommendations require one unique design with at most one support", async (t) => {
  const design = (id) => ({ id, category: "design", route_cautions: [] });
  const support = (id) => ({ id, category: "support", route_cautions: [] });
  const cases = [
    [design("single_time_observational"), design("single_time_observational")],
    [design("single_time_observational"), design("difference_in_differences")],
    [support("statistical-validity")],
    [
      design("single_time_observational"),
      support("statistical-validity"),
      support("heterogeneous-effects"),
    ],
  ];
  for (const recommendations of cases) {
    await t.test(recommendations.map((item) => item.id).join(" + "), () => {
      const projectRoot = temporaryProject(t);
      expectSuccess(execute(projectRoot, "open"), "CREATED");
      const state = readState(projectRoot);
      state.causal_facts.recommended_method_routes = recommendations;
      writeState(projectRoot, state);
      expectFailure(execute(projectRoot, "validate"), "INVALID_STATE");
    });
  }
});

test("analysis options use a compact canonical portfolio schema", async (t) => {
  const preferred = analysisOption("preferred", "single_time_observational");
  const alternative = analysisOption("alternative", "difference_in_differences", null, {
    target: "Estimate a change-based effect after constructing a valid panel.",
  });
  const fallback = analysisOption("fallback", "descriptive_association", null, {
    target: "Describe the adjusted association without a causal claim.",
  });
  const cases = [
    {
      name: "more than three",
      options: [preferred, alternative, fallback, { ...alternative, target: "A fourth strategy." }],
    },
    {
      name: "two preferred",
      options: [preferred, { ...alternative, role: "preferred" }],
    },
    {
      name: "invalid role",
      options: [{ ...preferred, role: "candidate" }],
    },
    {
      name: "unknown design",
      options: [{ ...preferred, design: "unknown_design" }],
    },
    {
      name: "support without design",
      options: [{ ...preferred, design: undefined, support: "statistical-validity" }],
      clean: (options) => { delete options[0].design; },
    },
    {
      name: "missing risk",
      options: [{ ...preferred }],
      clean: (options) => { delete options[0].main_risk; },
    },
    {
      name: "non-list requirements",
      options: [{ ...preferred, requirements: "one requirement" }],
    },
    {
      name: "overlong text",
      options: [{ ...preferred, approach: "x".repeat(501) }],
    },
    {
      name: "too many requirement items",
      options: [{
        ...preferred,
        requirements: ["one", "two", "three", "four", "five"],
      }],
    },
    {
      name: "excess total decision text",
      options: [{
        ...preferred,
        target: "t".repeat(500),
        approach: "a".repeat(500),
        main_risk: "r".repeat(500),
        prefer_when: "p".repeat(500),
        data_work: ["d".repeat(500)],
        requirements: ["q"],
      }],
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      expectSuccess(execute(projectRoot, "open"), "CREATED");
      const state = readState(projectRoot);
      state.causal_facts.analysis_options = structuredClone(scenario.options);
      scenario.clean?.(state.causal_facts.analysis_options);
      writeState(projectRoot, state);
      expectFailure(execute(projectRoot, "validate"), "INVALID_STATE");
    });
  }

  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");
  const state = readState(projectRoot);
  state.causal_facts.analysis_readiness = "ready";
  state.causal_facts.recommended_method_routes = [
    { id: "single_time_observational", category: "design", route_cautions: [] },
  ];
  state.causal_facts.analysis_options = [preferred, alternative, fallback];
  writeState(projectRoot, state);
  expectSuccess(execute(projectRoot, "validate"), "VALID");

  const boundaryRoot = temporaryProject(t);
  expectSuccess(execute(boundaryRoot, "open"), "CREATED");
  const boundaryState = readState(boundaryRoot);
  boundaryState.causal_facts.analysis_readiness = "ready";
  boundaryState.causal_facts.recommended_method_routes = [
    { id: "single_time_observational", category: "design", route_cautions: [] },
  ];
  boundaryState.causal_facts.analysis_options = [
    {
      ...preferred,
      target: "t".repeat(500),
      approach: "a".repeat(500),
      main_risk: "r".repeat(500),
      prefer_when: "p".repeat(500),
      data_work: ["d".repeat(500)],
      requirements: [],
    },
    {
      ...alternative,
      data_work: ["a", "b", "c", "d"],
      requirements: ["w", "x", "y", "z"],
    },
  ];
  writeState(boundaryRoot, boundaryState);
  expectSuccess(execute(boundaryRoot, "validate"), "VALID");
});

test("analysis begin rejects an unmet route-entry gate without mutating state", async (t) => {
  const cases = [
    {
      name: "imagined data",
      field: "data_facts.data_checked",
      mutate: (state) => { state.data_facts.data_checked = "imagined"; },
    },
    {
      name: "unchecked domain",
      field: "domain_knowledge.domain_checked",
      mutate: (state) => { state.domain_knowledge.domain_checked = "not_checked"; },
    },
    {
      name: "blocked causal review",
      field: "causal_facts.causal_checked",
      mutate: (state) => { state.causal_facts.causal_checked = "blocked"; },
    },
    {
      name: "analysis not ready",
      field: "causal_facts.analysis_readiness",
      mutate: (state) => {
        state.causal_facts.analysis_readiness = "not_ready";
        state.causal_facts.recommended_method_routes = [];
        state.causal_facts.analysis_options = [];
      },
    },
    {
      name: "missing design recommendation",
      field: "causal_facts.recommended_method_routes.design",
      mutate: (state) => {
        state.causal_facts.recommended_method_routes = [];
        state.causal_facts.analysis_options = [];
      },
    },
    {
      name: "wrong design recommendation",
      field: "causal_facts.recommended_method_routes.design",
      mutate: (state) => {
        state.causal_facts.recommended_method_routes[0].id = "difference_in_differences";
        state.causal_facts.analysis_options = [
          analysisOption("preferred", "difference_in_differences"),
        ];
      },
    },
    {
      name: "unrecommended support",
      field: "causal_facts.recommended_method_routes.support",
      extras: { support: "statistical-validity" },
      mutate: () => {},
    },
    {
      name: "causal-ready descriptive fallback",
      design: "descriptive_association",
      field: "causal_facts.analysis_readiness",
      mutate: () => {},
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const design = scenario.design || "single_time_observational";
      seedAnalysisEligibility(projectRoot, { design });
      const state = readState(projectRoot);
      scenario.mutate(state);
      writeState(projectRoot, state);
      const before = fs.readFileSync(statePath(projectRoot), "utf8");

      const failure = expectFailure(begin(
        projectRoot,
        opened,
        `analysis_execution.${design}`,
        scenario.extras,
      ), "ANALYSIS_GATE_FAILED");
      assert.equal(failure.details.route, `analysis_execution.${design}`);
      assert.ok(failure.details.failures.some((item) => item.field === scenario.field));
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

      const unchanged = readState(projectRoot);
      assert.equal(unchanged.state_meta.revision, opened.revision);
      assert.equal(unchanged.state_meta.active_operation, null);
      assert.deepEqual(unchanged.next_step_plan, []);
    });
  }
});

test("analysis begin accepts the supported route-entry boundaries", async (t) => {
  const cases = [
    {
      name: "limited core reviews",
      setup: (state) => {
        state.data_facts.data_checked = "limited";
        state.domain_knowledge.domain_checked = "limited";
        state.causal_facts.causal_checked = "limited";
        state.causal_facts.analysis_readiness = "limited";
      },
    },
    {
      name: "descriptive fallback",
      design: "descriptive_association",
      readiness: "limited",
      setup: () => {},
    },
    {
      name: "omitted support inherits the preferred recommendation",
      recommendedSupport: "statistical-validity",
      expectedSupport: "statistical-validity",
      setup: () => {},
    },
    {
      name: "explicit null selects a same-design formulation without support",
      recommendedSupport: "statistical-validity",
      extras: { support: null },
      expectedSupport: null,
      setup: () => {},
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const design = scenario.design || "single_time_observational";
      seedAnalysisEligibility(projectRoot, {
        design,
        support: scenario.recommendedSupport || null,
        readiness: scenario.readiness || "ready",
      });
      const state = readState(projectRoot);
      scenario.setup(state);
      writeState(projectRoot, state);

      const started = expectSuccess(begin(
        projectRoot,
        opened,
        `analysis_execution.${design}`,
        scenario.extras ?? {},
      ), "BEGAN_WORKER");
      assert.equal(started.plan[0].support, scenario.expectedSupport ?? null);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
});

test("nonpreferred research strategies remain advisory until causal review promotes them", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  seedAnalysisEligibility(projectRoot, {
    design: "single_time_observational",
    support: null,
  });
  const state = readState(projectRoot);
  state.causal_facts.analysis_options.push(
    analysisOption("alternative", "difference_in_differences", null, {
      target: "Estimate a change-based effect if a valid panel becomes available.",
      approach: "Use a difference-in-differences design after checking pretrends.",
      requirements: ["Construct repeated outcomes and a credible comparison trend."],
      main_risk: "Parallel trends may not be credible.",
      prefer_when: "Longitudinal data and a defensible comparison become available.",
    }),
  );
  writeState(projectRoot, state);
  const before = fs.readFileSync(statePath(projectRoot));

  const blocked = expectFailure(begin(
    projectRoot,
    opened,
    "analysis_execution.difference_in_differences",
  ), "ANALYSIS_GATE_FAILED");
  assert.ok(blocked.details.failures.some(
    (item) => item.field === "causal_facts.recommended_method_routes.design",
  ));
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const preferred = expectSuccess(begin(
    projectRoot,
    opened,
    "analysis_execution.single_time_observational",
  ), "BEGAN_WORKER");
  expectSuccess(finish(projectRoot, preferred, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("analysis begin applies the same gate to an exact ready scope", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const state = readState(projectRoot);
  state.domain_knowledge.domain_checked = "not_checked";
  state.project_summary.domain_knowledge_complete = false;
  state.project_summary.exploration_complete = false;
  writeState(projectRoot, state);
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  const failure = expectFailure(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
    scope_ref: prepared.scope_ref,
  }), "ANALYSIS_GATE_FAILED");
  assert.ok(failure.details.failures.some((item) => item.field === "domain_knowledge.domain_checked"));
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
});

test("begin emits exactly the three supported plan shapes and rejects unknown routes", async (t) => {
  const cases = [
    {
      route: "team_lead",
      code: "BEGAN_LEAD",
      stage: "lead_pending",
      plan: [{ id: "team_lead" }],
    },
    {
      route: "data_audit",
      code: "BEGAN_WORKER",
      stage: "worker_pending",
      plan: [{ id: "data_audit" }, { id: "team_lead" }],
    },
    {
      route: "analysis_execution.single_time_observational",
      extras: { support: "statistical-validity" },
      code: "BEGAN_WORKER",
      stage: "worker_pending",
      plan: [
        { id: "analysis_execution.single_time_observational", support: "statistical-validity" },
        { id: "team_lead" },
      ],
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.route, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      if (scenario.route.startsWith("analysis_execution.")) {
        seedAnalysisEligibility(projectRoot, {
          design: scenario.route.slice("analysis_execution.".length),
          support: scenario.extras.support,
        });
      }
      const started = expectSuccess(begin(projectRoot, opened, scenario.route, scenario.extras), scenario.code);
      assert.equal(started.stage, scenario.stage);
      assert.deepEqual(started.plan, scenario.plan);
      const resumed = expectSuccess(execute(projectRoot, "open"), scenario.stage === "worker_pending" ? "RESUME_WORKER" : "RESUME_LEAD");
      assert.deepEqual(resumed.plan, scenario.plan);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }

  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const original = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(begin(projectRoot, opened, "analysis_execution.unknown_design"), "PLAN_MISMATCH");
  expectFailure(begin(projectRoot, opened, "data_audit", { support: "statistical-validity" }), "INVALID_INPUT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), original);
});

test("begin returns comprehensive actor context and exact route references", async (t) => {
  for (const actor of [
    "data_audit",
    "domain_expert",
    "causal_check",
    "causal_discovery",
    "report_writer",
  ]) {
    await t.test(actor, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, actor), "BEGAN_WORKER");
      assertTurnContext(projectRoot, started, {
        audience: "worker",
        actor,
        stage: "worker_pending",
        references: [`references/${actor}.md`],
      });
      for (const section of [
        "project_summary",
        "council_chamber",
        "data_facts",
        "domain_knowledge",
        "causal_facts",
        "discovery_sidecar",
        "artifact_records",
      ]) {
        assert.ok(Object.prototype.hasOwnProperty.call(started.turn_context.state, section), section);
      }
      assert.equal(
        Object.prototype.hasOwnProperty.call(started.turn_context.state, "report_assembly"),
        actor === "report_writer",
      );
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }

  await t.test("team_lead", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    assertTurnContext(projectRoot, started, {
      audience: "team_lead",
      actor: "team_lead",
      stage: "lead_pending",
      references: ["references/team_lead.md", "references/team_lead_audience.md"],
    });
    assert.deepEqual(started.turn_context.directives, [{
      kind: "audience_unstated",
      instruction: "The audience level is unstated. Set project_summary.audience_profile only if this turn's message or committed project evidence demonstrates the user's statistical fluency; otherwise leave it unstated and explain at a neutral depth.",
    }]);
    assert.deepEqual(started.turn_context.state.report_assembly, readState(projectRoot).report_assembly);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("analysis design and support", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareAnalysisScope(
      projectRoot,
      "single_time_observational",
      "statistical-validity",
    );
    const state = readState(projectRoot);
    state.council_chamber.analysis_execution.difference_in_differences = {
      ...rawAnalysisSlot("blocked", "Unrelated analysis scope sentinel."),
      last_updated: null,
      scope_id: crypto.randomUUID(),
      scope_revision: 1,
      execution_contract: null,
    };
    writeState(projectRoot, state);
    const started = expectSuccess(begin(
      projectRoot,
      prepared,
      "analysis_execution.single_time_observational",
      { support: "statistical-validity", scope_ref: prepared.scope_ref },
    ), "BEGAN_WORKER");
    assertTurnContext(projectRoot, started, {
      audience: "worker",
      actor: "analysis_execution.single_time_observational",
      stage: "worker_pending",
      references: [
        "references/design_execution_contract.md",
        "references/design/single_time_observational.md",
        "references/support/statistical-validity.md",
        "references/artifact_output_policy.md",
      ],
    });
    const analysisContext = started.turn_context.state.council_chamber.analysis_execution;
    assert.deepEqual(Object.keys(analysisContext), ["single_time_observational"]);
    assert.deepEqual(
      analysisContext.single_time_observational.execution_contract,
      DEFAULT_ANALYSIS_EXECUTION_CONTRACT,
    );
    assert.equal(
      started.turn_context.scope_snapshot.analysis.difference_in_differences.current_status,
      "blocked",
    );
    assert.equal(JSON.stringify(started.turn_context.state).includes("Unrelated analysis scope sentinel."), false);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("bound report", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareReportScope(projectRoot);
    const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    assertTurnContext(projectRoot, started, {
      audience: "worker",
      actor: "report_writer",
      stage: "worker_pending",
      references: [
        "references/report_writer.md",
        "assets/report_template_planning.md",
        "assets/report_html_layout_template.html",
        "references/artifact_output_policy.md",
      ],
    });
    assert.deepEqual(started.turn_context.state.report_assembly, readState(projectRoot).report_assembly);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("bound report with available analysis evidence selects the analysis template", (t2) => {
    const projectRoot = temporaryProject(t2);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const artifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
    const prepared = prepareReportScope(projectRoot, {
      opened,
      analysisArtifactIds: [artifactId],
    });
    const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
    assert.deepEqual(reopened.warnings, []);
    const started = expectSuccess(begin(projectRoot, reopened, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    assert.ok(started.required_references.includes("assets/report_template_analysis.md"));
    assert.ok(started.required_references.includes("assets/report_html_layout_template.html"));
    assert.equal(started.required_references.includes("assets/report_template_planning.md"), false);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("an available analysis artifact added after scope preparation remains unrelated", (t2) => {
    const projectRoot = temporaryProject(t2);
    const prepared = prepareReportScope(projectRoot);
    pushAnalysisCompletionRecord(projectRoot, { available: true });
    const opened = expectSuccess(execute(projectRoot, "open"), "OPENED");
    assert.deepEqual(opened.warnings, []);
    const started = expectSuccess(begin(projectRoot, opened, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    assert.ok(started.required_references.includes("assets/report_template_planning.md"));
    assert.equal(started.required_references.includes("assets/report_template_analysis.md"), false);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("unavailable bound analysis evidence blocks execution without a planning fallback", (t2) => {
    const projectRoot = temporaryProject(t2);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const artifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
    const prepared = prepareReportScope(projectRoot, {
      opened,
      analysisArtifactIds: [artifactId],
    });
    fs.rmSync(path.join(projectRoot, "output", `analysis-priors-${artifactId}`), {
      recursive: true,
      force: true,
    });
    const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
    assert.equal(reopened.warnings.some(
      (warning) => warning.code === "MISSING_HISTORICAL_ARTIFACT"
        && warning.artifact_id === artifactId,
    ), true);
    const before = fs.readFileSync(statePath(projectRoot));
    const failure = expectFailure(begin(projectRoot, reopened, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "SCOPE_MISMATCH");
    assert.deepEqual(failure.details.unavailable_analysis_artifact_ids, [artifactId]);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  });

  await t.test("a ready report scope must state an intentional evidence binding", (t2) => {
    const projectRoot = temporaryProject(t2);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "report_writer"), "BEGAN_WORKER");
    const before = fs.readFileSync(statePath(projectRoot));
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "new",
        updates: {
          report_assembly: {
            report_goal: "Prepare a bounded report",
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
            },
          },
        },
      },
    }), "INVALID_INPUT");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  });

  await t.test("a revised ready report scope must restate its evidence binding", (t2) => {
    const projectRoot = temporaryProject(t2);
    const prepared = prepareReportScope(projectRoot);
    const started = expectSuccess(begin(projectRoot, prepared, "report_writer"), "BEGAN_WORKER");
    const before = fs.readFileSync(statePath(projectRoot));
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "revise",
        updates: {
          report_assembly: {
            report_goal: "Revise the bounded report",
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
            },
          },
        },
      },
    }), "INVALID_INPUT");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  });

  await t.test("scope preparation loads no report templates", (t2) => {
    const projectRoot = temporaryProject(t2);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "report_writer"), "BEGAN_WORKER");
    assert.equal(
      started.required_references.some((reference) => reference.startsWith("assets/")),
      false,
    );
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("a migrated protocol-1 operation returns the legacy evidence reference", (t2) => {
    const projectRoot = temporaryProject(t2);
    const prepared = prepareAnalysisScope(projectRoot);
    expectSuccess(begin(
      projectRoot,
      prepared,
      `analysis_execution.${prepared.design}`,
      { scope_ref: prepared.scope_ref },
    ), "BEGAN_WORKER");
    const v5 = downgradeCurrentStateToV5(projectRoot);
    v5.state_meta.active_operation.completion_protocol = 1;
    writeState(projectRoot, v5);
    const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V5");
    assert.equal(migrated.operation_packet.completion_protocol, 1);
    assert.ok(migrated.required_references.includes("references/legacy_evidence.md"));
    expectSuccess(finish(
      projectRoot,
      { ...migrated, operation_id: migrated.operation_packet.operation_id },
      {},
      { cancel: true },
    ), "OPERATION_CANCELLED");
  });
});

test("command input type failures use INVALID_INPUT without mutating state", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const idleBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(begin(projectRoot, opened, "report_writer", {
    scope_ref: { kind: "report", id: "not-a-uuid", revision: 1 },
  }), "INVALID_INPUT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), idleBytes);

  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const workerBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "blob",
      slug: "invalid-kind",
    },
  }), "INVALID_INPUT");
  expectFailure(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "a".repeat(81),
      extension: "txt",
    },
  }), "INVALID_INPUT");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: [],
    },
  }), "INVALID_INPUT");
  expectFailure(finish(projectRoot, started, [], { cancel: true }), "INVALID_INPUT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), workerBytes);
  expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("ready report scopes require a goal, audience, structure, and claim boundary", async (t) => {
  const completeScope = () => ({
    report_goal: "Explain the approved evidence for a clinical decision.",
    audience: "Clinical collaborators",
    claim_boundary: "Do not exceed the approved causal interpretation.",
    planned_structure: ["Main finding", "Limitations"],
    wording_constraints: ["Do not exceed the approved causal claim boundary."],
    analysis_artifact_ids: [],
  });
  const cases = [
    { field: "report_goal", value: null },
    { field: "audience", value: null },
    { field: "claim_boundary", value: null },
    { field: "planned_structure", value: [] },
    { field: "wording_constraints", value: [] },
  ];

  for (const scenario of cases) {
    await t.test(scenario.field, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "report_writer"), "BEGAN_WORKER");
      const scope = completeScope();
      scope[scenario.field] = scenario.value;
      const before = fs.readFileSync(statePath(projectRoot));
      const failure = expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor: "report_writer",
          scope_transition: "new",
          updates: {
            report_assembly: scope,
            council_chamber: {
              report_writer: {
                current_status: "ready",
                summary: "This incomplete scope must not become approval-ready.",
                questions_for_user: [],
                feedback_to_route: [],
              },
            },
          },
        },
      }), "INVALID_INPUT");
      assert.ok(failure.details.missing_fields.includes(scenario.field));
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }

  for (const status of ["ready", "blocked"]) {
    await t.test(`${status} rejects a completed-output format`, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "report_writer"), "BEGAN_WORKER");
      const scope = { ...completeScope(), current_format: "html" };
      const before = fs.readFileSync(statePath(projectRoot));
      const failure = expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor: "report_writer",
          scope_transition: "new",
          updates: {
            report_assembly: scope,
            council_chamber: {
              report_writer: {
                current_status: status,
                summary: "No report output exists for this handoff.",
                questions_for_user: [],
                feedback_to_route: [],
              },
            },
          },
        },
      }), "INVALID_INPUT");
      assert.equal(failure.details.current_format, "html");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }

  const projectRoot = temporaryProject(t);
  const prepared = prepareReportScope(projectRoot);
  const ready = readState(projectRoot).report_assembly;
  assert.equal(ready.current_format, null);
  ready.audience = null;
  const state = readState(projectRoot);
  state.report_assembly = ready;
  writeState(projectRoot, state);
  const before = fs.readFileSync(statePath(projectRoot));
  const failure = expectFailure(begin(projectRoot, prepared, "report_writer", {
    scope_ref: prepared.scope_ref,
  }), "SCOPE_MISMATCH");
  assert.deepEqual(failure.details.missing_fields, ["audience"]);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
});

test("revision checks, ownership, worker resume, lead resume, and closeout form one lifecycle", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const startupNotice = readState(projectRoot).state_meta.startup_notice;
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  assertTurnContext(projectRoot, started, {
    audience: "worker",
    actor: "data_audit",
    stage: "worker_pending",
    references: ["references/data_audit.md"],
  });
  const beforeWorkerResume = fs.readFileSync(statePath(projectRoot), "utf8");
  assert.deepEqual(readState(projectRoot).state_meta.startup_notice, startupNotice);
  const workerResume = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeWorkerResume);
  assert.equal(workerResume.plan_actor, "data_audit");
  assert.equal(workerResume.active_operation.id, started.operation_id);
  assert.deepEqual(workerResume.turn_context, started.turn_context);
  assert.deepEqual(workerResume.required_references, started.required_references);
  assert.ok(workerResume.operation_packet);
  assert.deepEqual(readState(projectRoot).state_meta.startup_notice, startupNotice);

  const validUpdates = {
    data_facts: {
      data_checked: "passing",
      data_sources: ["data/input.csv"],
      audit_scope: "Baseline cohort",
      unit_of_observation: "Participant",
    },
    council_chamber: {
      data_audit: {
        current_status: "complete",
        summary: "Data passed structural checks.",
        questions_for_user: [],
        feedback_to_route: [],
      },
    },
  };

  const beforeFailures = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      expected_project_id: started.project_id,
      expected_revision: opened.revision,
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: validUpdates,
    },
  }), "STALE_REVISION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeFailures);

  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: { domain_knowledge: { domain_checked: "passing" } },
    },
  }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeFailures);

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: validUpdates,
    },
  }), "WORKER_APPLIED");
  assert.equal(applied.revision, 2);
  assert.equal("operation_packet" in applied, false);
  assert.equal(applied.operation_packet_ref.contract_unchanged, true);
  assertTurnContext(projectRoot, applied, {
    audience: "team_lead",
    actor: "data_audit",
    stage: "lead_pending",
    references: ["references/team_lead.md", "references/team_lead_audience.md"],
  });
  const appliedState = readState(projectRoot);
  assert.equal(appliedState.project_summary.data_audit_complete, true);
  assert.deepEqual(applied.turn_context.state.data_facts, appliedState.data_facts);
  assert.deepEqual(
    applied.turn_context.state.council_chamber.data_audit,
    appliedState.council_chamber.data_audit,
  );
  assert.deepEqual(appliedState.state_meta.startup_notice, startupNotice);

  const beforeLeadResume = fs.readFileSync(statePath(projectRoot), "utf8");
  const leadResume = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeLeadResume);
  assert.equal(leadResume.active_operation.id, started.operation_id);
  assert.equal(leadResume.active_operation.stage, "lead_pending");
  assert.deepEqual(leadResume.turn_context, applied.turn_context);
  assert.deepEqual(leadResume.required_references, applied.required_references);
  assert.ok(leadResume.operation_packet);
  assert.deepEqual(readState(projectRoot).state_meta.startup_notice, startupNotice);

  const beforeBadFinish = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(finish(projectRoot, applied, { artifact_records: [] }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeBadFinish);

  const closed = expectSuccess(finish(projectRoot, applied, {
    project_summary: {
      title: "Data audit project",
      objective: "Audit the supplied cohort",
      materials: ["data/input.csv"],
    },
  }), "OPERATION_FINISHED");
  assert.equal(closed.revision, 3);
  assert.equal(
    closed.response_markdown.match(/\[Causal-Consultant Loaded\]/g)?.length,
    1,
  );
  const finalState = readState(projectRoot);
  assert.equal(finalState.state_meta.active_operation, null);
  assert.equal(finalState.state_meta.startup_notice, null);
  assert.deepEqual(finalState.next_step_plan, []);
  assert.equal(finalState.data_facts.data_checked, "passing");
  assert.equal(finalState.project_summary.data_audit_complete, true);
  assert.equal(finalState.project_summary.domain_knowledge_complete, false);
  assert.equal(finalState.project_summary.causal_check_complete, false);
  assert.equal(finalState.project_summary.exploration_complete, false);
});

test("finish derives and owns the six aggregate project-summary fields", (t) => {
  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");
  const seeded = readState(projectRoot);
  seeded.data_facts.data_checked = "passing";
  seeded.domain_knowledge.domain_checked = "limited";
  seeded.causal_facts.causal_checked = "passing";
  writeState(projectRoot, seeded);

  const opened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  const beforeRejected = fs.readFileSync(statePath(projectRoot), "utf8");
  const forbidden = {
    data_audit_complete: true,
    domain_knowledge_complete: true,
    causal_check_complete: true,
    exploration_complete: true,
    analysis_output: "exist",
    report_output: "exist",
  };
  for (const [field, value] of Object.entries(forbidden)) {
    expectFailure(finish(projectRoot, started, {
      project_summary: { [field]: value },
    }), "OWNERSHIP_VIOLATION");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeRejected);
  }

  const closed = expectSuccess(finish(projectRoot, started, {
    project_summary: { title: "Controller-derived aggregates" },
  }), "OPERATION_FINISHED");
  assert.equal(closed.revision, 2);
  const summary = readState(projectRoot).project_summary;
  assert.deepEqual({
    data_audit_complete: summary.data_audit_complete,
    domain_knowledge_complete: summary.domain_knowledge_complete,
    causal_check_complete: summary.causal_check_complete,
    exploration_complete: summary.exploration_complete,
    analysis_output: summary.analysis_output,
    report_output: summary.report_output,
  }, {
    data_audit_complete: true,
    domain_knowledge_complete: true,
    causal_check_complete: true,
    exploration_complete: true,
    analysis_output: "non_exist",
    report_output: "non_exist",
  });
  assert.match(summary.last_updated, /^\d{4}-\d{2}-\d{2}T/);
});

test("worker apply resynchronizes a completion flag when core status regresses", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const first = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const passing = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(first),
      operation_id: first.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: { data_checked: "passing" },
        council_chamber: { data_audit: { current_status: "passing" } },
      },
    },
  }), "WORKER_APPLIED");
  assert.equal(readState(projectRoot).project_summary.data_audit_complete, true);
  const closed = expectSuccess(finish(projectRoot, passing), "OPERATION_FINISHED");

  const second = expectSuccess(begin(projectRoot, closed, "data_audit"), "BEGAN_WORKER");
  const blocked = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(second),
      operation_id: second.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: { data_checked: "blocked" },
        council_chamber: { data_audit: { current_status: "blocked" } },
      },
    },
  }), "WORKER_APPLIED");
  assert.equal(readState(projectRoot).project_summary.data_audit_complete, false);
  expectSuccess(finish(projectRoot, blocked), "OPERATION_FINISHED");
});

test("finish stamps project_summary only when its content changes", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const unchanged = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  const firstClose = expectSuccess(finish(projectRoot, unchanged), "OPERATION_FINISHED");
  assert.equal(readState(projectRoot).project_summary.last_updated, null);

  const changing = expectSuccess(begin(projectRoot, firstClose, "team_lead"), "BEGAN_LEAD");
  const secondClose = expectSuccess(finish(projectRoot, changing, {
    project_summary: { title: "Stable title" },
  }), "OPERATION_FINISHED");
  const changedTimestamp = readState(projectRoot).project_summary.last_updated;
  assert.match(changedTimestamp, /^\d{4}-\d{2}-\d{2}T/);

  const repeated = expectSuccess(begin(projectRoot, secondClose, "team_lead"), "BEGAN_LEAD");
  expectSuccess(finish(projectRoot, repeated, {
    project_summary: { title: "Stable title" },
  }), "OPERATION_FINISHED");
  assert.equal(readState(projectRoot).project_summary.last_updated, changedTimestamp);
});

test("every worker rejects writes outside its owned state", async (t) => {
  const actors = [
    "data_audit",
    "domain_expert",
    "causal_check",
    "causal_discovery",
    "report_writer",
    "analysis_execution.single_time_observational",
  ];
  for (const actor of actors) {
    await t.test(actor, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      if (actor.startsWith("analysis_execution.")) {
        seedAnalysisEligibility(projectRoot, {
          design: actor.slice("analysis_execution.".length),
        });
      }
      const started = expectSuccess(begin(projectRoot, opened, actor), "BEGAN_WORKER");
      const original = fs.readFileSync(statePath(projectRoot), "utf8");
      expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor,
          updates: { project_summary: { title: "forbidden" } },
        },
      }), "OWNERSHIP_VIOLATION");
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), original);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
});

test("causal-check cannot create or revise an analysis scope", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates: {
        council_chamber: {
          analysis_execution: {
            single_time_observational: {
              current_status: "ready",
              summary: "An approval-ready scope was prepared.",
            },
          },
        },
      },
    },
  }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("analysis workers cannot write the controller-owned causal scope basis", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  seedAnalysisEligibility(projectRoot);
  const actor = "analysis_execution.single_time_observational";
  const started = expectSuccess(begin(projectRoot, opened, actor), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot));

  const failure = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor,
      scope_transition: "new",
      updates: {
        council_chamber: {
          analysis_execution: {
            single_time_observational: {
              ...analysisSlot("ready", "The worker must not own the causal basis."),
              causal_basis_hash: "0".repeat(64),
            },
          },
        },
      },
    },
  }), "OWNERSHIP_VIOLATION");
  assert.match(failure.message, /causal_basis_hash/);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("every core worker apply requires a matching chamber handoff with status", async (t) => {
  for (const actor of ["data_audit", "domain_expert", "causal_check", "causal_discovery"]) {
    await t.test(actor, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, actor), "BEGAN_WORKER");
      const before = fs.readFileSync(statePath(projectRoot), "utf8");

      const failure = expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor,
          updates: {},
        },
      }), "INVALID_INPUT");
      assert.match(failure.message, /matching chamber handoff/);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

      const emptyStatus = expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor,
          updates: { council_chamber: { [actor]: {} } },
        },
      }), "INVALID_INPUT");
      assert.match(emptyStatus.message, /current_status must be a nonempty string/);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
});

test("domain, causal-check, and discovery workers can update only their owned sections", async (t) => {
  const cases = [
    {
      actor: "domain_expert",
      root: "domain_knowledge",
      patch: { domain_checked: "passing", domain_scope: "Clinical practice" },
    },
    {
      actor: "causal_check",
      root: "causal_facts",
      patch: {
        causal_checked: "passing",
        analysis_readiness: "ready",
        support_status: "A mature observational design is ready for scope review.",
        recommended_checks: [],
        recommended_method_routes: [
          { id: "single_time_observational", category: "design", route_cautions: [] },
        ],
        analysis_options: [analysisOption("preferred", "single_time_observational")],
      },
    },
    {
      actor: "causal_discovery",
      root: "discovery_sidecar",
      patch: { status: "reviewed", goal: "Review candidate structure" },
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.actor, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, scenario.actor), "BEGAN_WORKER");
      const applied = expectSuccess(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor: scenario.actor,
          updates: {
            [scenario.root]: scenario.patch,
            council_chamber: {
              [scenario.actor]: {
                current_status: "complete",
                summary: `${scenario.actor} completed its assignment.`,
                questions_for_user: [],
                feedback_to_route: [],
              },
            },
          },
        },
      }), "WORKER_APPLIED");
      assert.deepEqual(Object.entries(scenario.patch).map(([key, value]) => readState(projectRoot)[scenario.root][key]), Object.values(scenario.patch));
      expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    });
  }
});

test("discovery scope-only work persists one exact contract and later begin binds it without approval", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_discovery"), "BEGAN_WORKER");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_discovery",
      discovery_scope: discoveryScope("new"),
      updates: {
        discovery_sidecar: {
          status: "scoped",
          goal: DEFAULT_DISCOVERY_CONTRACT.target,
          scope: "Use the declared inputs, variables, constraints, and diagnostics.",
          method_summary: "Scope only; no discovery run was performed.",
        },
        council_chamber: {
          causal_discovery: {
            current_status: "scoped",
            summary: "The bounded discovery exercise is scoped but has not run.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");

  const scopedState = readState(projectRoot);
  const scopeRef = scopedState.state_meta.active_operation.scope_ref;
  assert.equal(scopeRef.kind, "discovery");
  assert.equal(scopeRef.revision, 1);
  assert.match(scopeRef.id, /^[0-9a-f-]{36}$/);
  assert.equal(scopedState.discovery_sidecar.scope_id, scopeRef.id);
  assert.equal(scopedState.discovery_sidecar.scope_revision, 1);
  assert.deepEqual(scopedState.discovery_sidecar.execution_contract, DEFAULT_DISCOVERY_CONTRACT);
  assert.equal(scopedState.discovery_sidecar.status, "scoped");
  assert.deepEqual(scopedState.artifact_records, []);

  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  const exact = { kind: "discovery", id: scopeRef.id, revision: 1 };
  const bound = expectSuccess(begin(projectRoot, closed, "causal_discovery", {
    scope_ref: exact,
  }), "BEGAN_WORKER");
  assertTurnContext(projectRoot, bound, {
    audience: "worker",
    actor: "causal_discovery",
    stage: "worker_pending",
    references: [
      "references/causal_discovery.md",
      "references/artifact_output_policy.md",
    ],
  });
  assert.deepEqual(bound.turn_context.state.discovery_sidecar.execution_contract, DEFAULT_DISCOVERY_CONTRACT);
  assert.deepEqual(readState(projectRoot).state_meta.active_operation.discovery_scope, {
    transition: "preserve",
    base_ref: exact,
    contract: DEFAULT_DISCOVERY_CONTRACT,
  });
  expectSuccess(finish(projectRoot, bound, {}, { cancel: true }), "OPERATION_CANCELLED");

  const idle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(begin(projectRoot, idle, "causal_discovery", {
    scope_ref: { ...exact, revision: 2 },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
});

test("discovery contract revision is controller-owned and keeps or replaces identity correctly", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const first = expectSuccess(begin(projectRoot, opened, "causal_discovery"), "BEGAN_WORKER");
  const firstApplied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(first),
      operation_id: first.operation_id,
      actor: "causal_discovery",
      discovery_scope: discoveryScope("new"),
      updates: {
        discovery_sidecar: { status: "scoped" },
        council_chamber: { causal_discovery: { current_status: "scoped" } },
      },
    },
  }), "WORKER_APPLIED");
  const original = readState(projectRoot).discovery_sidecar;
  const closed = expectSuccess(finish(projectRoot, firstApplied), "OPERATION_FINISHED");

  const revisedContract = {
    ...DEFAULT_DISCOVERY_CONTRACT,
    method_plan: "ges",
  };
  const revise = expectSuccess(begin(projectRoot, closed, "causal_discovery"), "BEGAN_WORKER");
  const revised = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(revise),
      operation_id: revise.operation_id,
      actor: "causal_discovery",
      discovery_scope: discoveryScope("revise", revisedContract),
      updates: {
        discovery_sidecar: { status: "scoped" },
        council_chamber: { causal_discovery: { current_status: "scoped" } },
      },
    },
  }), "WORKER_APPLIED");
  const revisedState = readState(projectRoot);
  assert.equal(revisedState.discovery_sidecar.scope_id, original.scope_id);
  assert.equal(revisedState.discovery_sidecar.scope_revision, 2);
  assert.deepEqual(revisedState.discovery_sidecar.execution_contract, revisedContract);
  const revisedClosed = expectSuccess(finish(projectRoot, revised), "OPERATION_FINISHED");

  const replacement = expectSuccess(begin(projectRoot, revisedClosed, "causal_discovery"), "BEGAN_WORKER");
  const replaced = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(replacement),
      operation_id: replacement.operation_id,
      actor: "causal_discovery",
      discovery_scope: discoveryScope("new"),
      updates: {
        discovery_sidecar: { status: "scoped" },
        council_chamber: { causal_discovery: { current_status: "scoped" } },
      },
    },
  }), "WORKER_APPLIED");
  const replacedState = readState(projectRoot);
  assert.notEqual(replacedState.discovery_sidecar.scope_id, original.scope_id);
  assert.equal(replacedState.discovery_sidecar.scope_revision, 1);
  const replacementClosed = expectSuccess(finish(projectRoot, replaced), "OPERATION_FINISHED");

  const next = expectSuccess(begin(projectRoot, replacementClosed, "causal_discovery"), "BEGAN_WORKER");
  const bytes = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(next),
      operation_id: next.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: {
          status: "scoped",
          execution_contract: structuredClone(DEFAULT_DISCOVERY_CONTRACT),
        },
        council_chamber: { causal_discovery: { current_status: "scoped" } },
      },
    },
  }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), bytes);
  expectSuccess(finish(projectRoot, next, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("direct discovery output freezes its contract at reservation and records the exact scope", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_discovery"), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "candidate-graph",
      extension: "csv",
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "candidate-graph",
      extension: "csv",
      discovery_scope: discoveryScope("new"),
    },
  }), "ARTIFACT_RESERVED");
  assert.ok(reserved.operation_packet);
  assert.equal("operation_packet_ref" in reserved, false);
  assert.equal(reserved.scope_ref.kind, "discovery");
  assert.deepEqual(reserved.discovery_scope.contract, DEFAULT_DISCOVERY_CONTRACT);
  const resumed = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.deepEqual(resumed.active_operation.discovery_scope, reserved.discovery_scope);
  const frozenBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor: "causal_discovery",
      discovery_scope: discoveryScope("new", {
        ...DEFAULT_DISCOVERY_CONTRACT,
        method_plan: "tabu-search",
      }),
      updates: {
        discovery_sidecar: { status: "blocked" },
        council_chamber: { causal_discovery: { current_status: "blocked" } },
      },
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), frozenBytes);

  const temporary = path.join(projectRoot, ...reserved.temporary_path.split("/"));
  fs.mkdirSync(path.dirname(temporary), { recursive: true });
  fs.writeFileSync(temporary, "from,to,stability\ntreatment,outcome,0.72\n", "utf8");
  const summary = "Candidate graph and stability output completed.";
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: {
          status: "reviewed",
          method_summary: "Stable-PC candidate discovery with bootstrap stability.",
        },
        council_chamber: {
          causal_discovery: {
            current_status: "reviewed",
            summary,
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
      artifact: scopedArtifact(reserved, summary),
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), frozenBytes);
  assert.equal(fs.existsSync(temporary), true);

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: {
          status: "artifact_created",
          method_summary: "Stable-PC candidate discovery with bootstrap stability.",
          findings: ["One candidate adjacency was retained."],
          diagnostics: ["Bootstrap stability completed."],
          limitations: ["Orientations remain candidate-only."],
        },
        council_chamber: {
          causal_discovery: {
            current_status: "artifact_created",
            summary,
            questions_for_user: [],
            feedback_to_route: ["Ask causal_check to assess any downstream implication."],
          },
        },
      },
      artifact: scopedArtifact(reserved, summary),
    },
  }), "WORKER_APPLIED");
  const state = readState(projectRoot);
  assert.deepEqual(state.discovery_sidecar.execution_contract, DEFAULT_DISCOVERY_CONTRACT);
  assert.deepEqual(state.discovery_sidecar.artifact_refs, [reserved.artifact_intent.location]);
  assert.equal(state.artifact_records.length, 1);
  assert.equal(state.artifact_records[0].location, reserved.artifact_intent.location);
  const manifestPath = path.join(
    projectRoot,
    `${reserved.artifact_intent.location}.manifest.json`,
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest.scope_ref, reserved.scope_ref);
  assert.deepEqual(manifest.discovery_contract, DEFAULT_DISCOVERY_CONTRACT);
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");

  fs.writeFileSync(manifestPath, "null\n", "utf8");
  const warnings = expectSuccess(execute(projectRoot, "open"), "OPENED").warnings;
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, "INVALID_HISTORICAL_ARTIFACT_MANIFEST");
});

test("discovery output and status mismatches fail atomically while review and blocking remain unbound", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const review = expectSuccess(begin(projectRoot, opened, "causal_discovery"), "BEGAN_WORKER");
  const reviewed = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(review),
      operation_id: review.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: { status: "reviewed", artifact_refs: ["input/graph.json"] },
        council_chamber: { causal_discovery: { current_status: "reviewed" } },
      },
    },
  }), "WORKER_APPLIED");
  assert.equal(readState(projectRoot).discovery_sidecar.scope_id, null);
  const closed = expectSuccess(finish(projectRoot, reviewed), "OPERATION_FINISHED");

  const run = expectSuccess(begin(projectRoot, closed, "causal_discovery"), "BEGAN_WORKER");
  const invalidContract = structuredClone(DEFAULT_DISCOVERY_CONTRACT);
  invalidContract.claim_boundary = "causal";
  const beforeInvalid = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(run),
      operation_id: run.operation_id,
      kind: "file",
      slug: "invalid-discovery",
      extension: "csv",
      discovery_scope: discoveryScope("new", invalidContract),
    },
  }), "INVALID_INPUT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInvalid);

  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(run),
      operation_id: run.operation_id,
      kind: "file",
      slug: "blocked-discovery",
      extension: "csv",
      discovery_scope: discoveryScope("new"),
    },
  }), "ARTIFACT_RESERVED");
  const reservedBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: run.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: { status: "reviewed" },
        council_chamber: { causal_discovery: { current_status: "reviewed" } },
      },
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), reservedBytes);

  const blocked = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: run.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: {
          status: "blocked",
          limitations: ["Required package is unavailable; no substitute method was used."],
        },
        council_chamber: { causal_discovery: { current_status: "blocked" } },
      },
    },
  }), "WORKER_APPLIED");
  const blockedState = readState(projectRoot);
  assert.equal(blockedState.discovery_sidecar.status, "blocked");
  assert.deepEqual(blockedState.discovery_sidecar.execution_contract, DEFAULT_DISCOVERY_CONTRACT);
  assert.deepEqual(blockedState.artifact_records, []);
  expectSuccess(finish(projectRoot, blocked), "OPERATION_FINISHED");
});

test("unbound discovery review cannot relabel a current bound sidecar", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const scopeWork = expectSuccess(begin(projectRoot, opened, "causal_discovery"), "BEGAN_WORKER");
  const scoped = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(scopeWork),
      operation_id: scopeWork.operation_id,
      actor: "causal_discovery",
      discovery_scope: discoveryScope("new"),
      updates: {
        discovery_sidecar: {
          status: "scoped",
          goal: "Current bounded discovery exercise",
        },
        council_chamber: {
          causal_discovery: {
            current_status: "scoped",
            summary: "The current exercise is scoped.",
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const currentSidecar = structuredClone(readState(projectRoot).discovery_sidecar);
  const exact = {
    kind: "discovery",
    id: currentSidecar.scope_id,
    revision: currentSidecar.scope_revision,
  };
  const closed = expectSuccess(finish(projectRoot, scoped), "OPERATION_FINISHED");

  const unbound = expectSuccess(begin(projectRoot, closed, "causal_discovery"), "BEGAN_WORKER");
  const beforeRejected = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(unbound),
      operation_id: unbound.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: {
          status: "reviewed",
          findings: ["Unrelated reviewed material"],
        },
        council_chamber: {
          causal_discovery: {
            current_status: "reviewed",
            summary: "Unrelated material was reviewed.",
          },
        },
      },
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeRejected);

  const chamberOnly = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(unbound),
      operation_id: unbound.operation_id,
      actor: "causal_discovery",
      updates: {
        council_chamber: {
          causal_discovery: {
            current_status: "reviewed",
            summary: "Unrelated material was reviewed without changing the current scope.",
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  assert.deepEqual(readState(projectRoot).discovery_sidecar, currentSidecar);
  const chamberClosed = expectSuccess(finish(projectRoot, chamberOnly), "OPERATION_FINISHED");

  const exactReview = expectSuccess(begin(projectRoot, chamberClosed, "causal_discovery", {
    scope_ref: exact,
  }), "BEGAN_WORKER");
  const beforeScoped = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(exactReview),
      operation_id: exactReview.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: { status: "scoped" },
        council_chamber: { causal_discovery: { current_status: "scoped" } },
      },
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeScoped);

  const reviewed = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(exactReview),
      operation_id: exactReview.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: {
          status: "reviewed",
          findings: ["The current scoped material was reviewed."],
        },
        council_chamber: {
          causal_discovery: {
            current_status: "reviewed",
            summary: "The current scope was reviewed.",
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const reviewedState = readState(projectRoot);
  assert.equal(reviewedState.discovery_sidecar.scope_id, exact.id);
  assert.equal(reviewedState.discovery_sidecar.scope_revision, exact.revision);
  assert.deepEqual(reviewedState.discovery_sidecar.execution_contract, DEFAULT_DISCOVERY_CONTRACT);
  expectSuccess(finish(projectRoot, reviewed), "OPERATION_FINISHED");
});

test("revising a discovery contract clears prior execution residue but preserves history", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_discovery"), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "revision-source",
      extension: "csv",
      discovery_scope: discoveryScope("new"),
    },
  }), "ARTIFACT_RESERVED");
  const temporary = path.join(projectRoot, ...reserved.temporary_path.split("/"));
  fs.mkdirSync(path.dirname(temporary), { recursive: true });
  fs.writeFileSync(temporary, "from,to\ntreatment,outcome\n", "utf8");
  const completed = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor: "causal_discovery",
      updates: {
        discovery_sidecar: {
          status: "artifact_created",
          goal: "Original goal",
          scope: "Original scope",
          method_summary: "Original method summary",
          findings: ["Original finding"],
          diagnostics: ["Original diagnostic"],
          limitations: ["Original limitation"],
          reviewer_requests: ["Original reviewer request"],
        },
        council_chamber: {
          causal_discovery: {
            current_status: "artifact_created",
            summary: "Original discovery output.",
            questions_for_user: ["Original question"],
            feedback_to_route: ["Original feedback"],
          },
        },
      },
      artifact: scopedArtifact(reserved, "Original discovery output."),
    },
  }), "WORKER_APPLIED");
  const completedState = readState(projectRoot);
  const originalId = completedState.discovery_sidecar.scope_id;
  const historicalRecords = structuredClone(completedState.artifact_records);
  const closed = expectSuccess(finish(projectRoot, completed), "OPERATION_FINISHED");

  const revisedContract = {
    ...DEFAULT_DISCOVERY_CONTRACT,
    method_plan: "ges",
  };
  const revision = expectSuccess(begin(projectRoot, closed, "causal_discovery"), "BEGAN_WORKER");
  const revised = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(revision),
      operation_id: revision.operation_id,
      actor: "causal_discovery",
      discovery_scope: discoveryScope("revise", revisedContract),
      updates: {
        discovery_sidecar: {
          status: "scoped",
          goal: "Revised goal",
        },
        council_chamber: {
          causal_discovery: {
            current_status: "scoped",
            summary: "The revised exercise is scoped.",
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const revisedState = readState(projectRoot);
  assert.equal(revisedState.discovery_sidecar.scope_id, originalId);
  assert.equal(revisedState.discovery_sidecar.scope_revision, 2);
  assert.deepEqual(revisedState.discovery_sidecar.execution_contract, revisedContract);
  assert.equal(revisedState.discovery_sidecar.goal, "Revised goal");
  assert.equal(revisedState.discovery_sidecar.scope, null);
  assert.equal(revisedState.discovery_sidecar.method_summary, null);
  for (const field of [
    "findings",
    "diagnostics",
    "limitations",
    "artifact_refs",
    "reviewer_requests",
  ]) {
    assert.deepEqual(revisedState.discovery_sidecar[field], []);
  }
  assert.deepEqual(revisedState.artifact_records, historicalRecords);
  assert.deepEqual(revisedState.council_chamber.causal_discovery.questions_for_user, []);
  assert.deepEqual(revisedState.council_chamber.causal_discovery.feedback_to_route, []);
  expectSuccess(finish(projectRoot, revised), "OPERATION_FINISHED");
});

test("causal-check actionable readiness requires a recommended design", async (t) => {
  for (const analysisReadiness of ["ready", "limited"]) {
    await t.test(analysisReadiness, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
      const before = fs.readFileSync(statePath(projectRoot), "utf8");
      const updates = causalCheckUpdates({
        causal_checked: "limited",
        analysis_readiness: analysisReadiness,
        support_status: "A bounded observational design is ready for scope review.",
        recommended_checks: [],
        recommended_method_routes: [],
      });

      const failure = expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor: "causal_check",
          updates,
        },
      }), "INVALID_INPUT");
      assert.match(failure.message, /requires one recommended design route/);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

      updates.causal_facts.recommended_method_routes = [
        { id: "single_time_observational", category: "design", route_cautions: [] },
      ];
      updates.causal_facts.analysis_options = [
        analysisOption("preferred", "single_time_observational"),
      ];
      const applied = expectSuccess(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor: "causal_check",
          updates,
        },
      }), "WORKER_APPLIED");
      expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    });
  }
});

test("causal-check readiness reassessment requires one complete decision bundle", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  const updates = causalCheckUpdates({
    causal_checked: "limited",
    analysis_readiness: "limited",
    support_status: "A bounded observational design is ready for scope review.",
    recommended_method_routes: [
      { id: "single_time_observational", category: "design", route_cautions: [] },
    ],
  });

  const failure = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "INVALID_INPUT");
  assert.match(failure.message, /complete decision bundle.*recommended_checks/);
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

  updates.causal_facts.recommended_checks = [];
  delete updates.causal_facts.analysis_options;
  const missingOptions = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "INVALID_INPUT");
  assert.match(missingOptions.message, /complete decision bundle.*analysis_options/);
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

  updates.causal_facts.analysis_options = [
    analysisOption("preferred", "single_time_observational"),
  ];
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("actionable causal readiness requires the preferred option to mirror executable routes", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
  const updates = causalCheckUpdates({
    causal_checked: "limited",
    analysis_readiness: "limited",
    support_status: "A bounded route is ready for scope review.",
    recommended_checks: [],
    recommended_method_routes: [
      { id: "single_time_observational", category: "design", route_cautions: [] },
      { id: "statistical-validity", category: "support", route_cautions: [] },
    ],
    analysis_options: [analysisOption("preferred", "difference_in_differences")],
  });
  const before = fs.readFileSync(statePath(projectRoot));
  const mismatch = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "INVALID_INPUT");
  assert.match(mismatch.message, /preferred analysis option must mirror/);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  updates.causal_facts.analysis_options = [
    analysisOption("preferred", "single_time_observational", "statistical-validity"),
    analysisOption("alternative", "difference_in_differences"),
  ];
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "WORKER_APPLIED");
  assert.deepEqual(readState(projectRoot).causal_facts.analysis_options, updates.causal_facts.analysis_options);
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("nonactionable causal readiness may preserve alternatives without a preferred route", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
  const updates = causalCheckUpdates({
    causal_checked: "limited",
    analysis_readiness: "not_ready",
    support_status: "A design discriminator remains unresolved.",
    recommended_checks: ["Resolve treatment timing."],
    recommended_method_routes: [],
    analysis_options: [
      analysisOption("alternative", "difference_in_differences"),
      analysisOption("fallback", "descriptive_association"),
    ],
  });
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("causal-check readiness reassessment rejects malformed recommendation input atomically", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  const failure = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates: causalCheckUpdates({
        causal_checked: "limited",
        analysis_readiness: "limited",
        support_status: "A bounded observational design is under review.",
        recommended_checks: [],
        recommended_method_routes: null,
      }),
    },
  }), "INVALID_INPUT");
  assert.match(failure.message, /recommended_method_routes must be a list/);
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("causal-check nonactionable readiness rejects method recommendations atomically", async (t) => {
  for (const analysisReadiness of ["not_ready", "blocked"]) {
    await t.test(analysisReadiness, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
      const before = fs.readFileSync(statePath(projectRoot), "utf8");
      const failure = expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor: "causal_check",
          updates: causalCheckUpdates({
            causal_checked: analysisReadiness === "blocked" ? "blocked" : "limited",
            analysis_readiness: analysisReadiness,
            support_status: "No method route is mature enough for scope review.",
            recommended_checks: ["Resolve the remaining design question."],
            recommended_method_routes: [
              { id: "single_time_observational", category: "design", route_cautions: [] },
            ],
          }),
        },
      }), "INVALID_INPUT");
      assert.match(failure.message, /requires empty method recommendations/);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
});

test("causal-check descriptive fallback is limited and chamber-only updates remain independent", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "causal_check"), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  const updates = causalCheckUpdates({
    causal_checked: "limited",
    analysis_readiness: "ready",
    support_status: "Only an association analysis is supportable.",
    recommended_checks: [],
    recommended_method_routes: [
      { id: "descriptive_association", category: "design", route_cautions: [] },
    ],
  });
  const failure = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "INVALID_INPUT");
  assert.match(failure.message, /descriptive_association requires analysis_readiness limited/);
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

  updates.causal_facts.analysis_readiness = "limited";
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates,
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");

  const staleDecision = readState(projectRoot);
  staleDecision.causal_facts.analysis_readiness = "ready";
  staleDecision.causal_facts.recommended_method_routes = [];
  staleDecision.causal_facts.analysis_options = [];
  writeState(projectRoot, staleDecision);

  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const next = expectSuccess(begin(projectRoot, reopened, "causal_check"), "BEGAN_WORKER");
  const independent = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(next),
      operation_id: next.operation_id,
      actor: "causal_check",
      updates: {
        council_chamber: {
          causal_check: {
            current_status: "review_complete",
            summary: "The existing causal decision remains unchanged.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, independent), "OPERATION_FINISHED");
});


test("new ready analysis scopes require one canonical execution contract", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  seedAnalysisEligibility(projectRoot);
  const actor = "analysis_execution.single_time_observational";
  const started = expectSuccess(begin(projectRoot, opened, actor), "BEGAN_WORKER");
  const withoutContract = {
    council_chamber: {
      analysis_execution: {
        single_time_observational: {
          current_status: "ready",
          summary: "This scope is missing its execution contract.",
          questions_for_user: [],
          feedback_to_route: [],
        },
      },
    },
  };
  const before = fs.readFileSync(statePath(projectRoot));
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor,
      scope_transition: "new",
      updates: withoutContract,
    },
  }), "INVALID_INPUT");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const invalidContracts = [
    {
      name: "empty input refs",
      contract: { ...DEFAULT_ANALYSIS_EXECUTION_CONTRACT, input_refs: [] },
    },
    {
      name: "duplicate input refs",
      contract: {
        ...DEFAULT_ANALYSIS_EXECUTION_CONTRACT,
        input_refs: ["data/study.csv", "data/study.csv"],
      },
    },
    {
      name: "empty execution requirements",
      contract: { ...DEFAULT_ANALYSIS_EXECUTION_CONTRACT, execution_requirements: [] },
    },
    {
      name: "duplicate execution requirements",
      contract: {
        ...DEFAULT_ANALYSIS_EXECUTION_CONTRACT,
        execution_requirements: ["Fit the approved design.", "Fit the approved design."],
      },
    },
    {
      name: "unsupported field",
      contract: { ...DEFAULT_ANALYSIS_EXECUTION_CONTRACT, unsupported: "extra" },
    },
  ];
  for (const scenario of invalidContracts) {
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor,
        scope_transition: "new",
        updates: {
          council_chamber: {
            analysis_execution: {
              single_time_observational: analysisSlot(
                "ready",
                `Invalid contract: ${scenario.name}.`,
                null,
                scenario.contract,
              ),
            },
          },
        },
      },
    }), "INVALID_INPUT");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before, scenario.name);
  }

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor,
      scope_transition: "new",
      updates: {
        council_chamber: {
          analysis_execution: {
            single_time_observational: analysisSlot(
              "ready",
              "The bounded analysis scope is ready.",
            ),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const slot = readState(projectRoot).council_chamber.analysis_execution.single_time_observational;
  assert.deepEqual(slot.execution_contract, DEFAULT_ANALYSIS_EXECUTION_CONTRACT);
  assert.match(slot.scope_id, /^[0-9a-f-]{36}$/);
  assert.equal(slot.scope_revision, 1);
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});
test("analysis and report workers require an explicit completed scope handoff status", async (t) => {
  const invalidStatuses = [
    { name: "omitted" },
    { name: "null", value: null },
    { name: "requested", value: "requested" },
  ];
  const workers = [
    {
      name: "analysis",
      route: "analysis_execution.single_time_observational",
      setup: (projectRoot) => seedAnalysisEligibility(projectRoot),
      updates: (handoff) => ({
        council_chamber: {
          analysis_execution: { single_time_observational: handoff },
        },
      }),
    },
    {
      name: "report",
      route: "report_writer",
      setup: () => {},
      updates: (handoff) => ({
        report_assembly: { report_goal: "Prepare a bounded report" },
        council_chamber: { report_writer: handoff },
      }),
    },
  ];

  for (const worker of workers) {
    await t.test(worker.name, async (t) => {
      for (const invalid of invalidStatuses) {
        await t.test(invalid.name, () => {
          const projectRoot = temporaryProject(t);
          const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
          worker.setup(projectRoot);
          const started = expectSuccess(begin(projectRoot, opened, worker.route), "BEGAN_WORKER");
          const handoff = { summary: "This handoff must not commit." };
          if (Object.prototype.hasOwnProperty.call(invalid, "value")) handoff.current_status = invalid.value;
          const before = fs.readFileSync(statePath(projectRoot), "utf8");

          const failure = expectFailure(execute(projectRoot, "apply", {
            payload: {
              ...expected(started),
              operation_id: started.operation_id,
              actor: worker.route,
              scope_transition: "new",
              updates: worker.updates(handoff),
            },
          }), "INVALID_INPUT");
          assert.match(failure.message, /current_status/);
          assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
          expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
        });
      }
    });
  }
});

test("analysis and report scope identities are controller-owned and exact references are required", async (t) => {
  await t.test("analysis scope", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareAnalysisScope(projectRoot);
    const original = fs.readFileSync(statePath(projectRoot), "utf8");

    expectFailure(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
      scope_ref: { ...prepared.scope_ref, revision: prepared.scope_ref.revision + 1 },
    }), "SCOPE_MISMATCH");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), original);

    const execution = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(execution),
        operation_id: execution.operation_id,
        actor: `analysis_execution.${prepared.design}`,
        scope_transition: "preserve",
        updates: {
          council_chamber: {
            analysis_execution: {
              [prepared.design]: analysisSlot("blocked", "Approved analysis could not complete."),
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");

    const failure = expectFailure(begin(projectRoot, closed, `analysis_execution.${prepared.design}`, {
      scope_ref: prepared.scope_ref,
    }), "SCOPE_MISMATCH");
    assert.match(failure.message, /cannot be bound for execution/);
  });

  await t.test("report scope", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "report_writer"), "BEGAN_WORKER");
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "new",
        updates: {
          report_assembly: {
            report_goal: "Report the approved findings",
            audience: "Clinical collaborators",
            target_section: "Results",
            claim_boundary: "Report only evidence supported by the approved causal scope.",
            planned_structure: ["Findings", "Limitations"],
            wording_constraints: ["Preserve the approved causal claim boundary."],
            analysis_artifact_ids: [],
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
              summary: "Report scope is ready.",
              questions_for_user: [],
              feedback_to_route: [],
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    const scoped = readState(projectRoot).report_assembly;
    assert.match(scoped.scope_id, /^[0-9a-f-]{36}$/);
    assert.equal(scoped.scope_revision, 1);
    const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    const exact = { kind: "report", id: scoped.scope_id, revision: scoped.scope_revision };
    const approved = expectSuccess(begin(projectRoot, closed, "report_writer", { scope_ref: exact }), "BEGAN_WORKER");
    expectSuccess(finish(projectRoot, approved, {}, { cancel: true }), "OPERATION_CANCELLED");
  });
});

test("analysis and report done handoffs require an artifact in the same apply", async (t) => {
  await t.test("analysis", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareAnalysisScope(projectRoot);
    const started = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const before = fs.readFileSync(statePath(projectRoot), "utf8");
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: `analysis_execution.${prepared.design}`,
        scope_transition: "preserve",
        updates: {
          council_chamber: {
            analysis_execution: {
              [prepared.design]: analysisSlot("done", "No artifact was created."),
            },
          },
        },
      },
    }), "SCOPE_MISMATCH");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("report", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareReportScope(projectRoot);
    const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const before = fs.readFileSync(statePath(projectRoot), "utf8");
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: { draft_notes: ["No artifact was created."] },
          council_chamber: { report_writer: { current_status: "done" } },
        },
      },
    }), "SCOPE_MISMATCH");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });
});


test("operation packets stay contract-stable while reserve and apply compact unchanged packets", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = "analysis_execution." + prepared.design;
  const idle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.equal(idle.operation_packet, null);
  const started = expectSuccess(begin(projectRoot, idle, actor, {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const workerPacket = structuredClone(started.operation_packet);
  assert.deepEqual(Object.keys(workerPacket).sort(), [
    "action",
    "actor",
    "completion_protocol",
    "contract_hash",
    "intent_summary",
    "operation_id",
    "requirements",
    "scope_ref",
    "stage",
    "support",
  ]);
  assert.equal(workerPacket.operation_id, started.operation_id);
  assert.equal(workerPacket.stage, "worker_pending");
  assert.equal(workerPacket.action, "apply");
  assert.equal(workerPacket.actor, actor);
  assert.equal(workerPacket.support, prepared.support);
  assert.deepEqual(workerPacket.scope_ref, prepared.scope_ref);
  assert.equal(workerPacket.completion_protocol, 2);
  assert.match(workerPacket.contract_hash, /^[0-9a-f]{64}$/);
  assert.ok(workerPacket.requirements.length > 0);
  assert.equal(
    new Set(workerPacket.requirements.map((item) => item.id)).size,
    workerPacket.requirements.length,
  );
  for (const item of workerPacket.requirements) {
    assert.deepEqual(Object.keys(item).sort(), ["description", "id", "kind"]);
    assert.match(item.id, /^[a-z0-9][a-z0-9._-]*$/);
    assert.equal(typeof item.kind, "string");
    assert.ok(item.kind.length > 0);
    assert.equal(typeof item.description, "string");
    assert.ok(item.description.length > 0);
  }

  const durableOperation = readState(projectRoot).state_meta.active_operation;
  assert.equal(durableOperation.completion_protocol, 2);
  assert.equal(durableOperation.contract_hash, workerPacket.contract_hash);
  assert.deepEqual(
    expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER").operation_packet,
    workerPacket,
  );

  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "packet-stability",
      extension: "csv",
    },
  }), "ARTIFACT_RESERVED");
  assert.equal("operation_packet" in reserved, false);
  assert.deepEqual(reserved.operation_packet_ref, {
    operation_id: workerPacket.operation_id,
    stage: "worker_pending",
    action: "apply",
    completion_protocol: workerPacket.completion_protocol,
    contract_hash: workerPacket.contract_hash,
    contract_unchanged: true,
  });
  writeReservedTemporary(projectRoot, reserved, "estimate,se\n1.5,0.2\n");

  const artifact = scopedArtifact(reserved, "Bound analysis with supplemental diagnostics.", {
    supplemental_work: ["Produced a supplemental influence diagnostic."],
    deviations: [],
  });
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: {
              current_status: "done",
            },
          },
        },
      },
      artifact,
    },
  }), "WORKER_APPLIED");
  assert.equal("operation_packet" in applied, false);
  assert.deepEqual(applied.operation_packet_ref, {
    operation_id: workerPacket.operation_id,
    stage: "lead_pending",
    action: "finish",
    completion_protocol: workerPacket.completion_protocol,
    contract_hash: workerPacket.contract_hash,
    contract_unchanged: true,
  });
  const leadPacket = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD").operation_packet;
  assert.equal(leadPacket.stage, "lead_pending");
  assert.equal(leadPacket.action, "finish");
  for (const field of [
    "operation_id",
    "actor",
    "support",
    "intent_summary",
    "scope_ref",
    "completion_protocol",
    "contract_hash",
    "requirements",
  ]) {
    assert.deepEqual(leadPacket[field], workerPacket[field], field + " changed across apply");
  }

  const manifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, ...reserved.manifest_path.split("/")),
    "utf8",
  ));
  assert.equal(manifest.schema_version, 3);
  assert.deepEqual(manifest.requirements, workerPacket.requirements);
  assert.equal(manifest.artifact_role, "completion");
  assert.deepEqual(manifest.execution_receipt, artifact.execution_receipt);
  assert.deepEqual(manifest.execution_receipt.supplemental_work, [
    "Produced a supplemental influence diagnostic.",
  ]);
  assert.equal(
    manifest.execution_receipt.requirement_evidence.length,
    manifest.execution_receipt.completed_requirements.length,
  );
  assert.ok(manifest.execution_receipt.requirement_evidence.every(
    (item) => item.file === reserved.artifact_intent.location && item.locator,
  ));
  assert.deepEqual(manifest.execution_receipt.deviations, []);
  assert.deepEqual(applied.turn_context.artifact_status.execution_receipt, manifest.execution_receipt);
  assert.equal(applied.artifact_record.artifact_role, "completion");
  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  assert.equal(closed.operation_packet, null);
});

test("apply returns a full replacement packet when a new scope changes the work contract", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  seedAnalysisEligibility(projectRoot);
  const started = expectSuccess(begin(
    projectRoot,
    opened,
    "analysis_execution.single_time_observational",
  ), "BEGAN_WORKER");
  assert.equal(started.operation_packet.completion_protocol, 0);
  assert.equal(started.operation_packet.contract_hash, null);

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "analysis_execution.single_time_observational",
      scope_transition: "new",
      updates: {
        council_chamber: {
          analysis_execution: {
            single_time_observational: analysisSlot("ready", "New contract is ready."),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  assert.equal("operation_packet_ref" in applied, false);
  assert.ok(applied.operation_packet);
  assert.equal(applied.operation_packet.stage, "lead_pending");
  assert.equal(applied.operation_packet.action, "finish");
  assert.equal(applied.operation_packet.completion_protocol, 2);
  assert.match(applied.operation_packet.contract_hash, /^[0-9a-f]{64}$/);
  assert.ok(applied.operation_packet.requirements.length > 0);
  assertTurnContext(projectRoot, applied, {
    audience: "team_lead",
    actor: "analysis_execution.single_time_observational",
    stage: "lead_pending",
    references: [
      "references/team_lead.md",
      "references/team_lead_analysis_flow.md",
      "references/team_lead_audience.md",
    ],
  });

  const resumed = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD");
  assert.deepEqual(resumed.operation_packet, applied.operation_packet);
  assert.deepEqual(resumed.turn_context, applied.turn_context);
  assert.deepEqual(resumed.required_references, applied.required_references);
  expectSuccess(finish(projectRoot, applied, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("scoped completion rejects incomplete, inconsistent, or uninventoried receipts atomically", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = "analysis_execution." + prepared.design;
  const started = expectSuccess(begin(projectRoot, prepared, actor, {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "receipt-guard",
      extension: "csv",
    },
  }), "ARTIFACT_RESERVED");
  const temporary = writeReservedTemporary(projectRoot, reserved, "estimate,se\n1.2,0.3\n");
  const finalPath = path.join(projectRoot, ...reserved.artifact_intent.location.split("/"));
  const requirements = packetRequirementIds(reserved);
  assert.ok(requirements.length > 1);

  const doneUpdates = {
    council_chamber: {
      analysis_execution: {
        [prepared.design]: {
          current_status: "done",
        },
      },
    },
  };
  const blockedUpdates = {
    council_chamber: {
      analysis_execution: {
        [prepared.design]: {
          current_status: "blocked",
          summary: "The bound execution is infeasible.",
          questions_for_user: ["Revise the scope?"],
        },
      },
    },
  };
  const applyWith = (artifact, updates = doneUpdates, scopeTransition = "preserve") => execute(
    projectRoot,
    "apply",
    {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor,
        scope_transition: scopeTransition,
        updates,
        artifact,
      },
    },
  );
  const before = fs.readFileSync(statePath(projectRoot));
  const revision = readState(projectRoot).state_meta.revision;
  const expectAtomicFailure = (execution, code) => {
    expectFailure(execution, code);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    assert.equal(readState(projectRoot).state_meta.revision, revision);
    assert.equal(fs.existsSync(temporary), true);
    assert.equal(fs.existsSync(finalPath), false);
  };

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Incomplete completion.", {
    completed_requirements: requirements.slice(0, -1),
  })), "INCOMPLETE_WORK");

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Unknown requirement.", {
    completed_requirements: [...requirements, "unknown.requirement"],
  })), "INVALID_ARTIFACT_RECEIPT");

  const unsupportedReceipt = scopedArtifact(reserved, "Unsupported receipt field.");
  unsupportedReceipt.execution_receipt.unsupported = true;
  expectAtomicFailure(applyWith(unsupportedReceipt), "INVALID_ARTIFACT_RECEIPT");

  const contractHash = packetFor(reserved).contract_hash;
  const mismatchedHash = (contractHash[0] === "0" ? "1" : "0") + contractHash.slice(1);
  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Hash mismatch.", {
    contract_hash: mismatchedHash,
  })), "SCOPE_MISMATCH");

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Missing evidence file.", {
    evidence_files: ["output/missing-evidence.csv"],
  })), "INVALID_ARTIFACT_RECEIPT");

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Missing requirement map.", {
    requirement_evidence: [],
  })), "INVALID_ARTIFACT_RECEIPT");

  const absentRequirementMap = scopedArtifact(reserved, "Absent requirement map.");
  delete absentRequirementMap.execution_receipt.requirement_evidence;
  expectAtomicFailure(applyWith(absentRequirementMap), "INVALID_ARTIFACT_RECEIPT");

  const duplicateEvidence = executionReceipt(reserved).requirement_evidence;
  duplicateEvidence[1] = { ...duplicateEvidence[0] };
  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Duplicate requirement map.", {
    requirement_evidence: duplicateEvidence,
  })), "INVALID_ARTIFACT_RECEIPT");

  const unknownEvidence = executionReceipt(reserved).requirement_evidence;
  unknownEvidence[0].requirement_id = "unknown.requirement";
  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Unknown mapped requirement.", {
    requirement_evidence: unknownEvidence,
  })), "INVALID_ARTIFACT_RECEIPT");

  const multilineLocator = executionReceipt(reserved).requirement_evidence;
  multilineLocator[0].locator = "Methods section\nsecond line";
  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Multiline locator.", {
    requirement_evidence: multilineLocator,
  })), "INVALID_ARTIFACT_RECEIPT");

  const longLocator = executionReceipt(reserved).requirement_evidence;
  longLocator[0].locator = "x".repeat(501);
  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Overlong locator.", {
    requirement_evidence: longLocator,
  })), "INVALID_ARTIFACT_RECEIPT");

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Duplicate deviations.", {
    deviations: ["One deviation.", "One deviation."],
  })), "INVALID_ARTIFACT_RECEIPT");

  const uninventoriedLocation = "output/uninventoried-evidence.csv";
  fs.writeFileSync(
    path.join(projectRoot, ...uninventoriedLocation.split("/")),
    "diagnostic,value\nextra,1\n",
    "utf8",
  );
  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Uninventoried evidence.", {
    evidence_files: [uninventoriedLocation],
  })), "INVALID_ARTIFACT_RECEIPT");

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Overlapping accounting.", {
    completed_requirements: requirements,
    unmet_requirements: [requirements[0]],
  })), "INVALID_ARTIFACT_RECEIPT");

  const unmetEvidence = executionReceipt(reserved, {
    unmet_requirements: [requirements[0]],
  }).requirement_evidence;
  unmetEvidence.push({
    requirement_id: requirements[0],
    file: reserved.artifact_intent.location,
    locator: "Evidence for an unmet requirement.",
  });
  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Evidence claimed for unmet work.", {
    artifact_role: "infeasibility_evidence",
    unmet_requirements: [requirements[0]],
    requirement_evidence: unmetEvidence,
  }), blockedUpdates), "INVALID_ARTIFACT_RECEIPT");

  expectAtomicFailure(applyWith(
    scopedArtifact(reserved, "Completion cannot accompany blocked.", {
      artifact_role: "completion",
    }),
    blockedUpdates,
  ), "SCOPE_MISMATCH");

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "No unmet requirement named.", {
    artifact_role: "infeasibility_evidence",
  }), blockedUpdates), "INVALID_ARTIFACT_RECEIPT");

  expectAtomicFailure(applyWith(scopedArtifact(reserved, "Incomplete infeasibility accounting.", {
    artifact_role: "infeasibility_evidence",
    completed_requirements: requirements.slice(1, -1),
    unmet_requirements: [requirements[0]],
  }), blockedUpdates), "INVALID_ARTIFACT_RECEIPT");

  const infeasibilityArtifact = scopedArtifact(reserved, "Evidence of infeasibility.", {
    artifact_role: "infeasibility_evidence",
    unmet_requirements: [requirements[0]],
  });
  expectAtomicFailure(
    applyWith(infeasibilityArtifact, doneUpdates),
    "SCOPE_MISMATCH",
  );
  expectAtomicFailure(
    applyWith(infeasibilityArtifact, blockedUpdates, "revise"),
    "SCOPE_MISMATCH",
  );

  const applied = expectSuccess(applyWith(
    scopedArtifact(reserved, "All required work completed."),
  ), "WORKER_APPLIED");
  assert.equal(applied.artifact_record.artifact_role, "completion");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("approved analysis can reserve once at begin and hand the lead requirement-level evidence", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = `analysis_execution.${prepared.design}`;
  const started = expectSuccess(begin(projectRoot, prepared, actor, {
    support: prepared.support,
    scope_ref: prepared.scope_ref,
    artifact_reservation: {
      kind: "directory",
      slug: "verified-analysis",
    },
  }), "BEGAN_WORKER");
  assert.equal(packetFor(started).completion_protocol, 2);
  assert.equal(started.artifact_intent.kind, "directory");

  const temporary = path.join(projectRoot, ...started.temporary_path.split("/"));
  fs.mkdirSync(temporary, { recursive: true });
  const bodies = {
    "methods.md": "# Methods\nThe bound design, inputs, and estimator are specified here.\n",
    "analysis.js": "export function estimate() { return { estimate: 1.2, se: 0.3 }; }\n",
    "results.csv": "contrast,estimate,se\napproved,1.2,0.3\n",
    "diagnostics.csv": "diagnostic,status\nuncertainty,passed\nsupport,passed\n",
    "limitations.md": "# Claim boundary\nInterpret only within the approved causal scope.\n",
  };
  for (const [name, contents] of Object.entries(bodies)) {
    fs.writeFileSync(path.join(temporary, name), contents, "utf8");
  }

  const location = started.artifact_intent.location;
  const evidenceFiles = Object.keys(bodies).map((name) => `${location}/${name}`);
  const fileByKind = {
    target: `${location}/results.csv`,
    input_ref: `${location}/methods.md`,
    method_plan: `${location}/analysis.js`,
    execution_requirement: `${location}/diagnostics.csv`,
    output_type: `${location}/results.csv`,
    claim_boundary: `${location}/limitations.md`,
  };
  const locatorByKind = {
    target: "results.csv: approved contrast row",
    input_ref: "methods.md: Methods input description",
    method_plan: "analysis.js: estimate function",
    execution_requirement: "diagnostics.csv: diagnostic status rows",
    output_type: "results.csv: estimate and standard-error columns",
    claim_boundary: "limitations.md: Claim boundary section",
  };
  const packet = packetFor(started);
  const receipt = {
    contract_hash: packet.contract_hash,
    completed_requirements: packet.requirements.map((requirement) => requirement.id),
    unmet_requirements: [],
    supplemental_work: [],
    evidence_files: evidenceFiles,
    requirement_evidence: packet.requirements.map((requirement) => ({
      requirement_id: requirement.id,
      file: fileByKind[requirement.kind],
      locator: locatorByKind[requirement.kind],
    })),
    deviations: [],
  };
  assert.ok(receipt.requirement_evidence.every((item) => item.file && item.locator));

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: {
              current_status: "done",
              summary: "The exact approved analysis and diagnostics are complete.",
            },
          },
        },
      },
      artifact: {
        summary: "Verified analysis package with methods, code, results, diagnostics, and limits.",
        artifact_role: "completion",
        execution_receipt: receipt,
      },
    },
  }), "WORKER_APPLIED");

  const manifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, ...started.manifest_path.split("/")),
    "utf8",
  ));
  assert.equal(manifest.schema_version, 3);
  assert.deepEqual([...manifest.files].sort(), [...evidenceFiles].sort());
  assert.deepEqual(manifest.requirements, packet.requirements);
  assert.deepEqual(manifest.execution_receipt, receipt);
  assert.deepEqual(applied.turn_context.artifact_status.execution_receipt, receipt);
  assert.equal(
    new Set(receipt.requirement_evidence.map((item) => item.requirement_id)).size,
    packet.requirements.length,
  );
  const originalRequirements = structuredClone(manifest.requirements);
  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");

  const revisedContract = {
    ...structuredClone(DEFAULT_ANALYSIS_EXECUTION_CONTRACT),
    method_plan: "Fit a revised estimator under the same design.",
    execution_requirements: [
      "Estimate the approved contrast with the revised estimator.",
      "Report revised diagnostics and uncertainty.",
    ],
  };
  const revising = expectSuccess(begin(projectRoot, closed, actor, {
    support: prepared.support,
  }), "BEGAN_WORKER");
  const revised = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(revising),
      operation_id: revising.operation_id,
      actor,
      scope_transition: "revise",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: analysisSlot(
              "ready",
              "A later analysis scope revision is ready.",
              prepared.support,
              revisedContract,
            ),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, revised), "OPERATION_FINISHED");

  const historicalManifest = JSON.parse(fs.readFileSync(
    path.join(projectRoot, ...started.manifest_path.split("/")),
    "utf8",
  ));
  assert.deepEqual(historicalManifest.requirements, originalRequirements);
  const mappedIds = new Set(
    historicalManifest.execution_receipt.requirement_evidence
      .map((item) => item.requirement_id),
  );
  assert.ok(originalRequirements.every((requirement) => mappedIds.has(requirement.id)));
  assert.deepEqual(expectSuccess(execute(projectRoot, "open"), "OPENED").warnings, []);

  historicalManifest.requirements[0].description += " Tampered.";
  fs.writeFileSync(
    path.join(projectRoot, ...started.manifest_path.split("/")),
    `${JSON.stringify(historicalManifest, null, 2)}\n`,
    "utf8",
  );
  const warnings = expectSuccess(execute(projectRoot, "open"), "OPENED").warnings;
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].code, "INVALID_HISTORICAL_ARTIFACT_MANIFEST");

  historicalManifest.requirements = originalRequirements;
  fs.writeFileSync(
    path.join(projectRoot, ...started.manifest_path.split("/")),
    `${JSON.stringify(historicalManifest, null, 2)}\n`,
    "utf8",
  );
  assert.deepEqual(expectSuccess(execute(projectRoot, "validate"), "VALID").warnings, []);
});

test("bound analysis, report, and discovery scopes preserve infeasibility evidence as blocked", async (t) => {
  await t.test("analysis", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareAnalysisScope(projectRoot);
    const actor = "analysis_execution." + prepared.design;
    const started = expectSuccess(begin(projectRoot, prepared, actor, {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug: "analysis-infeasibility",
        extension: "csv",
      },
    }), "ARTIFACT_RESERVED");
    writeReservedTemporary(projectRoot, reserved, "check,value\nsupport,failed\n");
    const requirements = packetRequirementIds(reserved);
    const artifact = scopedArtifact(reserved, "Diagnostics showing analysis infeasibility.", {
      artifact_role: "infeasibility_evidence",
      unmet_requirements: [requirements[0]],
      supplemental_work: ["Checked empirical support beyond the failed requirement."],
    });
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor,
        scope_transition: "preserve",
        updates: {
          council_chamber: {
            analysis_execution: {
              [prepared.design]: {
                current_status: "blocked",
                summary: "The exact approved analysis is infeasible.",
                questions_for_user: ["Revise the estimand or inputs?"],
                feedback_to_route: ["Preserve the diagnostic evidence for rerouting."],
              },
            },
          },
        },
        artifact,
      },
    }), "WORKER_APPLIED");

    const state = readState(projectRoot);
    const slot = state.council_chamber.analysis_execution[prepared.design];
    assert.equal(slot.current_status, "blocked");
    assert.equal(slot.summary, "The exact approved analysis is infeasible.");
    assert.deepEqual(slot.questions_for_user, ["Revise the estimand or inputs?"]);
    assert.equal(state.project_summary.analysis_output, "non_exist");
    assert.equal(state.artifact_records.length, 1);
    assert.equal(state.artifact_records[0].artifact_role, "infeasibility_evidence");
    const manifest = JSON.parse(fs.readFileSync(
      path.join(projectRoot, ...reserved.manifest_path.split("/")),
      "utf8",
    ));
    assert.equal(manifest.schema_version, 3);
    assert.equal(manifest.artifact_role, "infeasibility_evidence");
    assert.deepEqual(manifest.execution_receipt, artifact.execution_receipt);
    assert.deepEqual(manifest.scope_ref, prepared.scope_ref);

    const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    assert.equal(readState(projectRoot).project_summary.analysis_output, "non_exist");
    expectSuccess(execute(projectRoot, "validate"), "VALID");
    assert.equal(closed.mode, "idle");
  });

  await t.test("report", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareReportScope(projectRoot);
    const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug: "report-infeasibility",
        extension: "md",
      },
    }), "ARTIFACT_RESERVED");
    const temporary = writeReservedTemporary(
      projectRoot,
      reserved,
      "# Report rendering diagnostic\n\nA required source was unavailable.\n",
    );
    const requirements = packetRequirementIds(reserved);
    const artifact = scopedArtifact(reserved, "Evidence that the bound report is infeasible.", {
      artifact_role: "infeasibility_evidence",
      unmet_requirements: [requirements[0]],
    });
    const beforeMismatch = fs.readFileSync(statePath(projectRoot));
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            current_format: "html",
          },
          council_chamber: {
            report_writer: {
              current_status: "done",
            },
          },
        },
        artifact,
      },
    }), "SCOPE_MISMATCH");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), beforeMismatch);
    assert.equal(fs.existsSync(temporary), true);

    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            draft_notes: ["The required source could not be resolved."],
          },
          council_chamber: {
            report_writer: {
              current_status: "blocked",
              summary: "The exact approved report is infeasible.",
              questions_for_user: ["Supply the missing source or revise coverage?"],
              feedback_to_route: [],
            },
          },
        },
        artifact,
      },
    }), "WORKER_APPLIED");

    const state = readState(projectRoot);
    assert.equal(state.council_chamber.report_writer.current_status, "blocked");
    assert.equal(state.council_chamber.report_writer.summary, "The exact approved report is infeasible.");
    assert.equal(state.report_assembly.current_format, null);
    assert.equal(state.project_summary.report_output, "non_exist");
    assert.equal(state.artifact_records.length, 1);
    assert.equal(state.artifact_records[0].artifact_role, "infeasibility_evidence");
    const manifest = JSON.parse(fs.readFileSync(
      path.join(projectRoot, ...reserved.manifest_path.split("/")),
      "utf8",
    ));
    assert.equal(manifest.schema_version, 3);
    assert.equal(manifest.artifact_role, "infeasibility_evidence");
    assert.deepEqual(manifest.execution_receipt, artifact.execution_receipt);
    assert.deepEqual(manifest.scope_ref, prepared.scope_ref);

    expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    assert.equal(readState(projectRoot).project_summary.report_output, "non_exist");
    expectSuccess(execute(projectRoot, "validate"), "VALID");
  });

  await t.test("discovery", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "causal_discovery"), "BEGAN_WORKER");
    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug: "discovery-infeasibility",
        extension: "csv",
        discovery_scope: discoveryScope("new"),
      },
    }), "ARTIFACT_RESERVED");
    const temporary = writeReservedTemporary(
      projectRoot,
      reserved,
      "diagnostic,value\nbootstrap_runs,0\n",
    );
    assert.equal(reserved.operation_packet.completion_protocol, 2);
    assert.deepEqual(reserved.operation_packet.scope_ref, reserved.scope_ref);
    const requirements = packetRequirementIds(reserved);
    const artifact = scopedArtifact(reserved, "Evidence that the frozen discovery run is infeasible.", {
      artifact_role: "infeasibility_evidence",
      unmet_requirements: [requirements[0]],
    });
    const beforeMismatch = fs.readFileSync(statePath(projectRoot));
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "causal_discovery",
        updates: {
          discovery_sidecar: {
            status: "artifact_created",
          },
          council_chamber: {
            causal_discovery: {
              current_status: "artifact_created",
            },
          },
        },
        artifact,
      },
    }), "SCOPE_MISMATCH");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), beforeMismatch);
    assert.equal(fs.existsSync(temporary), true);

    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "causal_discovery",
        updates: {
          discovery_sidecar: {
            status: "blocked",
            diagnostics: ["Bootstrap stability could not be run."],
            limitations: ["The frozen diagnostic requirement is infeasible."],
          },
          council_chamber: {
            causal_discovery: {
              current_status: "blocked",
              summary: "The exact frozen discovery run is infeasible.",
              questions_for_user: ["Revise the diagnostic requirement?"],
              feedback_to_route: [],
            },
          },
        },
        artifact,
      },
    }), "WORKER_APPLIED");

    const state = readState(projectRoot);
    assert.equal(state.discovery_sidecar.status, "blocked");
    assert.deepEqual(state.discovery_sidecar.execution_contract, DEFAULT_DISCOVERY_CONTRACT);
    assert.deepEqual(state.discovery_sidecar.artifact_refs, [reserved.artifact_intent.location]);
    assert.equal(state.council_chamber.causal_discovery.current_status, "blocked");
    assert.equal(state.artifact_records.length, 1);
    assert.equal(state.artifact_records[0].artifact_role, "infeasibility_evidence");
    const manifest = JSON.parse(fs.readFileSync(
      path.join(projectRoot, ...reserved.manifest_path.split("/")),
      "utf8",
    ));
    assert.equal(manifest.schema_version, 3);
    assert.equal(manifest.artifact_role, "infeasibility_evidence");
    assert.deepEqual(manifest.execution_receipt, artifact.execution_receipt);
    assert.deepEqual(manifest.scope_ref, reserved.scope_ref);
    assert.deepEqual(manifest.discovery_contract, DEFAULT_DISCOVERY_CONTRACT);

    expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    expectSuccess(execute(projectRoot, "validate"), "VALID");
  });
});

test("completed infeasibility manifest retries preserve role and receipt and record once", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = "analysis_execution." + prepared.design;
  const started = expectSuccess(begin(projectRoot, prepared, actor, {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "retry-infeasibility",
      extension: "csv",
    },
  }), "ARTIFACT_RESERVED");
  const temporary = writeReservedTemporary(
    projectRoot,
    reserved,
    "diagnostic,value\npositivity,failed\n",
  );
  const finalPath = path.join(projectRoot, ...reserved.artifact_intent.location.split("/"));
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  const requirementIds = packetRequirementIds(reserved);
  const artifact = scopedArtifact(reserved, "Positivity evidence blocks the bound analysis.", {
    artifact_role: "infeasibility_evidence",
    unmet_requirements: [requirementIds[0]],
  });
  const updates = {
    council_chamber: {
      analysis_execution: {
        [prepared.design]: {
          current_status: "blocked",
          summary: "The exact approved analysis is infeasible.",
          questions_for_user: ["Revise the population or estimand?"],
          feedback_to_route: [],
        },
      },
    },
  };
  const applyWith = (submittedArtifact, env = undefined) => execute(projectRoot, "apply", {
    env,
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor,
      scope_transition: "preserve",
      updates,
      artifact: submittedArtifact,
    },
  });

  const before = fs.readFileSync(statePath(projectRoot));
  expectFailure(
    applyWith(artifact, { STATECTL_FAIL_BEFORE_RENAME: "1" }),
    "INJECTED_WRITE_FAILURE",
  );
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  assert.equal(fs.existsSync(temporary), false);
  assert.equal(fs.existsSync(finalPath), true);
  assert.equal(fs.existsSync(manifestPath), true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(manifest.schema_version, 3);
  assert.equal(manifest.artifact_role, "infeasibility_evidence");
  assert.deepEqual(manifest.execution_receipt, artifact.execution_receipt);

  const resumed = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(resumed.artifact_status.status, "complete");
  assert.equal(resumed.artifact_status.artifact_role, "infeasibility_evidence");
  assert.deepEqual(resumed.artifact_status.execution_receipt, artifact.execution_receipt);
  assert.deepEqual(resumed.operation_packet, packetFor(reserved));

  const roleMismatch = structuredClone(artifact);
  roleMismatch.artifact_role = "completion";
  expectFailure(applyWith(roleMismatch), "INVALID_ARTIFACT_RECEIPT");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const receiptMismatch = structuredClone(artifact);
  receiptMismatch.execution_receipt.supplemental_work = ["A different retry claim."];
  expectFailure(applyWith(receiptMismatch), "INVALID_ARTIFACT_RECEIPT");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const applied = expectSuccess(applyWith(artifact), "WORKER_APPLIED");
  assert.equal(applied.artifact_record.artifact_role, "infeasibility_evidence");
  const leadState = readState(projectRoot);
  assert.equal(leadState.artifact_records.length, 1);
  assert.equal(leadState.artifact_records[0].operation_id, started.operation_id);
  assert.equal(leadState.project_summary.analysis_output, "non_exist");

  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  const finalState = readState(projectRoot);
  assert.equal(finalState.artifact_records.length, 1);
  assert.equal(finalState.project_summary.analysis_output, "non_exist");
  assert.deepEqual(
    JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    manifest,
  );
});

test("historical manifest schemas 2 and 1 remain compatible", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = "analysis_execution." + prepared.design;
  const started = expectSuccess(begin(projectRoot, prepared, actor, {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "historical-v1",
      extension: "csv",
    },
  }), "ARTIFACT_RESERVED");
  writeReservedTemporary(projectRoot, reserved, "estimate,se\n0.8,0.1\n");
  const artifact = scopedArtifact(reserved, "Historical completion output.");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: {
              current_status: "done",
            },
          },
        },
      },
      artifact,
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");

  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  const schema3 = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(schema3.schema_version, 3);
  assert.equal(schema3.artifact_role, "completion");
  assert.deepEqual(schema3.execution_receipt, artifact.execution_receipt);
  assert.deepEqual(schema3.requirements, packetFor(reserved).requirements);
  const schema2 = structuredClone(schema3);
  schema2.schema_version = 2;
  delete schema2.execution_receipt.requirement_evidence;
  delete schema2.execution_receipt.deviations;
  delete schema2.requirements;
  fs.writeFileSync(manifestPath, JSON.stringify(schema2, null, 2) + "\n", "utf8");
  assert.deepEqual(expectSuccess(execute(projectRoot, "open"), "OPENED").warnings, []);
  const schema1 = {
    schema_version: 1,
    operation_id: schema2.operation_id,
    route: schema2.route,
    scope_ref: schema2.scope_ref,
    files: schema2.files,
    completed_at: schema2.completed_at,
    summary: schema2.summary,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(schema1, null, 2) + "\n", "utf8");

  const opened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.deepEqual(opened.warnings, []);
  assert.equal(readState(projectRoot).artifact_records[0].artifact_role, "completion");
  assert.equal(readState(projectRoot).project_summary.analysis_output, "exist");
  assert.deepEqual(expectSuccess(execute(projectRoot, "validate"), "VALID").warnings, []);
});

test("current completion protocol 2 rejects an active schema-2 completion atomically", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = `analysis_execution.${prepared.design}`;
  const started = expectSuccess(begin(projectRoot, prepared, actor, {
    support: prepared.support,
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "current-protocol-legacy-receipt",
      extension: "csv",
    },
  }), "ARTIFACT_RESERVED");
  assert.equal(packetFor(reserved).completion_protocol, 2);
  const summary = "Legacy receipt cannot complete a current protocol-2 operation.";
  const receipt = legacyExecutionReceipt(reserved);
  writeLegacySchema2Completion(projectRoot, reserved, actor, summary, receipt);
  const before = fs.readFileSync(statePath(projectRoot));

  const failure = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: { current_status: "done" },
          },
        },
      },
      artifact: {
        summary,
        artifact_role: "completion",
        execution_receipt: receipt,
      },
    },
  }), "INVALID_ARTIFACT_RECEIPT");
  assert.match(failure.message, /completion protocol 2 requires requirement_evidence/);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
});

test("migrated protocol-1 analysis completion remains recoverable without weakening new reservations", async (t) => {
  function prepareLegacyOperation(subtest, slug, artifactState) {
    const projectRoot = temporaryProject(subtest);
    const prepared = prepareAnalysisScope(projectRoot);
    const actor = `analysis_execution.${prepared.design}`;
    const started = expectSuccess(begin(projectRoot, prepared, actor, {
      support: prepared.support,
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const reserved = artifactState === "none"
      ? null
      : expectSuccess(execute(projectRoot, "reserve-artifact", {
          payload: {
            ...expected(started),
            operation_id: started.operation_id,
            kind: "file",
            slug,
            extension: "csv",
          },
        }), "ARTIFACT_RESERVED");
    const summary = `Migrated ${artifactState} protocol-1 completion.`;
    const legacyArtifact = reserved === null
      ? null
      : {
          summary,
          artifact_role: "completion",
          execution_receipt: legacyExecutionReceipt(reserved),
        };
    if (artifactState === "temp") {
      writeReservedTemporary(projectRoot, reserved, "estimate,se\n0.8,0.1\n");
    } else if (artifactState === "final") {
      writeLegacySchema2Completion(
        projectRoot,
        reserved,
        actor,
        summary,
        legacyArtifact.execution_receipt,
      );
    }
    const v5 = downgradeCurrentStateToV5(projectRoot);
    v5.state_meta.active_operation.completion_protocol = 1;
    writeState(projectRoot, v5);
    const original = fs.readFileSync(statePath(projectRoot));
    const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V5");
    assert.deepEqual(fs.readFileSync(migrated.archive_path), original);
    assert.equal(migrated.operation_packet.completion_protocol, 1);
    return {
      projectRoot,
      prepared,
      actor,
      started,
      reserved,
      summary,
      legacyArtifact,
      migrated,
    };
  }

  function applyCompletion(context, prior, artifact, env = undefined) {
    return execute(context.projectRoot, "apply", {
      env,
      payload: {
        ...expected(prior),
        operation_id: context.started.operation_id,
        actor: context.actor,
        scope_transition: "preserve",
        updates: {
          council_chamber: {
            analysis_execution: {
              [context.prepared.design]: { current_status: "done" },
            },
          },
        },
        artifact,
      },
    });
  }

  await t.test("existing schema-2 final is resumable and idempotent", (subtest) => {
    const context = prepareLegacyOperation(subtest, "legacy-final", "final");
    assert.equal(context.migrated.artifact_status.status, "complete");
    const migratedBytes = fs.readFileSync(statePath(context.projectRoot));
    const archiveDirectory = path.join(context.projectRoot, "project_state.archives");
    const archiveNames = fs.readdirSync(archiveDirectory).sort();
    const reopened = expectSuccess(execute(context.projectRoot, "open"), "RESUME_WORKER");
    assert.deepEqual(fs.readFileSync(statePath(context.projectRoot)), migratedBytes);
    assert.deepEqual(fs.readdirSync(archiveDirectory).sort(), archiveNames);

    const applied = expectSuccess(
      applyCompletion(context, reopened, context.legacyArtifact),
      "WORKER_APPLIED",
    );
    assert.equal(readState(context.projectRoot).artifact_records.length, 1);
    expectSuccess(finish(context.projectRoot, applied), "OPERATION_FINISHED");
  });

  await t.test("schema-2 temp recovery is resumable and records once", (subtest) => {
    const context = prepareLegacyOperation(subtest, "legacy-temp", "temp");
    const before = fs.readFileSync(statePath(context.projectRoot));
    expectFailure(
      applyCompletion(
        context,
        context.migrated,
        context.legacyArtifact,
        { STATECTL_FAIL_BEFORE_RENAME: "1" },
      ),
      "INJECTED_WRITE_FAILURE",
    );
    assert.deepEqual(fs.readFileSync(statePath(context.projectRoot)), before);
    const finalPath = path.join(
      context.projectRoot,
      ...context.reserved.artifact_intent.location.split("/"),
    );
    const manifestPath = path.join(
      context.projectRoot,
      ...context.reserved.manifest_path.split("/"),
    );
    assert.equal(fs.existsSync(finalPath), true);
    assert.equal(JSON.parse(fs.readFileSync(manifestPath, "utf8")).schema_version, 2);

    const reopened = expectSuccess(execute(context.projectRoot, "open"), "RESUME_WORKER");
    assert.equal(reopened.artifact_status.status, "complete");
    const applied = expectSuccess(
      applyCompletion(context, reopened, context.legacyArtifact),
      "WORKER_APPLIED",
    );
    assert.equal(readState(context.projectRoot).artifact_records.length, 1);
    expectSuccess(finish(context.projectRoot, applied), "OPERATION_FINISHED");
  });

  await t.test("a migrated unreserved operation upgrades on reserve and rejects a legacy receipt", (subtest) => {
    const context = prepareLegacyOperation(subtest, "upgrade-on-reserve", "none");
    const reserved = expectSuccess(execute(context.projectRoot, "reserve-artifact", {
      payload: {
        ...expected(context.migrated),
        operation_id: context.started.operation_id,
        kind: "file",
        slug: "upgrade-on-reserve",
        extension: "csv",
      },
    }), "ARTIFACT_RESERVED");
    assert.equal(reserved.operation_packet.completion_protocol, 2);
    writeReservedTemporary(context.projectRoot, reserved, "estimate,se\n0.8,0.1\n");
    const artifact = {
      summary: "A legacy receipt cannot complete the upgraded reservation.",
      artifact_role: "completion",
      execution_receipt: legacyExecutionReceipt(reserved),
    };
    const before = fs.readFileSync(statePath(context.projectRoot));
    expectFailure(
      applyCompletion(context, reserved, artifact),
      "INVALID_ARTIFACT_RECEIPT",
    );
    assert.deepEqual(fs.readFileSync(statePath(context.projectRoot)), before);
  });

  await t.test("a mapped receipt on protocol 1 emits a schema-3 manifest", (subtest) => {
    const context = prepareLegacyOperation(subtest, "mapped-protocol-one", "temp");
    const artifact = scopedArtifact(
      context.reserved,
      "Mapped receipt on a migrated protocol-1 operation.",
    );
    const applied = expectSuccess(
      applyCompletion(context, context.migrated, artifact),
      "WORKER_APPLIED",
    );
    const manifestPath = path.join(
      context.projectRoot,
      ...context.reserved.manifest_path.split("/"),
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    assert.equal(manifest.schema_version, 3);
    assert.deepEqual(manifest.execution_receipt, artifact.execution_receipt);
    expectSuccess(finish(context.projectRoot, applied), "OPERATION_FINISHED");
  });
});

test("artifact reservation rejects a pre-existing temporary path without mutation", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const suffix = started.operation_id.slice(0, 8);
  const temporary = path.join(
    projectRoot,
    "output",
    `.audit-collision-${suffix}.csv.tmp-${suffix}`,
  );
  fs.mkdirSync(path.dirname(temporary), { recursive: true });
  fs.writeFileSync(temporary, "unowned temporary output\n", "utf8");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "audit-collision",
      extension: "csv",
    },
  }), "ARTIFACT_COLLISION");

  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  assert.equal(fs.readFileSync(temporary, "utf8"), "unowned temporary output\n");
});

test("artifact reservation, manifest verification, resume, and recording are one atomic protocol", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const seeded = readState(projectRoot);
  seeded.council_chamber.analysis_execution[prepared.design].summary = "Stale ready-scope summary.";
  seeded.council_chamber.analysis_execution[prepared.design].questions_for_user = ["Stale approval question?"];
  seeded.council_chamber.analysis_execution[prepared.design].feedback_to_route = ["Preserve this feedback."];
  writeState(projectRoot, seeded);
  const reorderedScopeRef = {
    revision: prepared.scope_ref.revision,
    id: prepared.scope_ref.id,
    kind: prepared.scope_ref.kind,
  };
  const execution = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
    scope_ref: reorderedScopeRef,
  }), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(execution),
      operation_id: execution.operation_id,
      kind: "file",
      slug: "treatment-estimate",
      extension: "csv",
    },
  }), "ARTIFACT_RESERVED");
  assert.match(reserved.artifact_intent.location, /^output\/treatment-estimate-[0-9a-f]{8}\.csv$/);

  const incomplete = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.deepEqual(incomplete.artifact_status, {
    status: "incomplete",
    location_state: "absent",
    location: reserved.artifact_intent.location,
    temporary_path: reserved.temporary_path,
    manifest_path: reserved.manifest_path,
    reason_code: "MISSING_ARTIFACT",
  });

  const workerPatch = {
    council_chamber: {
      analysis_execution: {
        [prepared.design]: { current_status: "done" },
      },
    },
  };
  const beforeMissing = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: scopedArtifact(reserved, "Treatment-effect estimates."),
    },
  }), "MISSING_ARTIFACT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeMissing);

  const artifactPath = path.join(projectRoot, ...reserved.artifact_intent.location.split("/"));
  const temporaryArtifactPath = path.join(projectRoot, ...reserved.temporary_path.split("/"));
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  fs.mkdirSync(path.dirname(temporaryArtifactPath), { recursive: true });
  fs.writeFileSync(temporaryArtifactPath, "estimate,se\n1.25,0.18\n", "utf8");
  fs.copyFileSync(temporaryArtifactPath, artifactPath);
  const collision = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(collision.artifact_status.location_state, "collision");
  assert.equal(collision.artifact_status.reason_code, "ARTIFACT_COLLISION");
  const beforeCollision = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: scopedArtifact(reserved, "Treatment-effect estimates."),
    },
  }), "ARTIFACT_COLLISION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeCollision);
  fs.rmSync(artifactPath);

  const beforeStatusMismatch = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: analysisSlot("ready", "Artifact exists but status is not done."),
          },
        },
      },
      artifact: scopedArtifact(reserved, "Treatment-effect estimates."),
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeStatusMismatch);
  assert.equal(fs.existsSync(temporaryArtifactPath), true);
  assert.equal(fs.existsSync(artifactPath), false);

  const beforeInterruptedApply = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    env: { STATECTL_FAIL_BEFORE_RENAME: "1" },
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: scopedArtifact(reserved, "Treatment-effect estimates."),
    },
  }), "INJECTED_WRITE_FAILURE");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInterruptedApply);
  assert.equal(fs.existsSync(temporaryArtifactPath), false);
  assert.equal(fs.existsSync(artifactPath), true);
  assert.equal(fs.existsSync(manifestPath), true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest, {
    schema_version: 3,
    operation_id: execution.operation_id,
    route: "analysis_execution",
    scope_ref: prepared.scope_ref,
    artifact_role: "completion",
    execution_receipt: executionReceipt(reserved),
    requirements: packetFor(reserved).requirements,
    files: [reserved.artifact_intent.location],
    completed_at: manifest.completed_at,
    summary: "Treatment-effect estimates.",
  });
  assert.match(manifest.completed_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.ok(Date.parse(manifest.completed_at) <= Date.now() + 1000);

  const reusable = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(reusable.artifact_status.status, "complete");
  assert.equal(reusable.artifact_status.location_state, "complete");
  assert.equal(reusable.artifact_status.manifest_path, reserved.manifest_path);

  const beforeInvalidManifest = fs.readFileSync(statePath(projectRoot), "utf8");
  manifest.files = {};
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: scopedArtifact(reserved, manifest.summary),
    },
  }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInvalidManifest);
  manifest.files = [reserved.artifact_intent.location];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const canonicalRequirements = structuredClone(manifest.requirements);
  delete manifest.requirements;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: scopedArtifact(reserved, manifest.summary),
    },
  }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInvalidManifest);

  manifest.requirements = [...canonicalRequirements].reverse();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: scopedArtifact(reserved, manifest.summary),
    },
  }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInvalidManifest);
  manifest.requirements = canonicalRequirements;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: scopedArtifact(reserved, manifest.summary),
    },
  }), "WORKER_APPLIED");
  assert.equal(applied.artifact_record.operation_id, execution.operation_id);
  assert.equal(applied.artifact_record.location, reserved.artifact_intent.location);
  assert.equal(applied.artifact_record.design, prepared.design);
  assert.equal(applied.artifact_record.artifact_role, "completion");
  assert.match(applied.artifact_record.created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(applied.turn_context.artifact_status.location_state, "complete");
  assert.deepEqual(applied.turn_context.artifact_status.execution_receipt, manifest.execution_receipt);
  const afterApply = readState(projectRoot);
  const completedSlot = afterApply.council_chamber.analysis_execution[prepared.design];
  assert.equal(completedSlot.summary, manifest.summary);
  assert.deepEqual(completedSlot.questions_for_user, []);
  assert.deepEqual(completedSlot.feedback_to_route, ["Preserve this feedback."]);
  assert.equal(afterApply.project_summary.analysis_output, "exist");
  const summaryTimestamp = afterApply.project_summary.last_updated;

  const leadResume = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD");
  assert.deepEqual(leadResume.turn_context.artifact_status, applied.turn_context.artifact_status);

  const closed = expectSuccess(finish(projectRoot, applied, {}, { cancel: true }), "OPERATION_CANCELLED");
  assert.equal(closed.revision, reserved.revision + 2);
  assert.equal(readState(projectRoot).project_summary.analysis_output, "exist");
  assert.equal(readState(projectRoot).project_summary.last_updated, summaryTimestamp);
  expectSuccess(execute(projectRoot, "validate"), "VALID");

  const tamperedManifest = { ...manifest, summary: "Tampered summary." };
  fs.writeFileSync(manifestPath, `${JSON.stringify(tamperedManifest, null, 2)}\n`, "utf8");
  const invalidManifest = expectSuccess(execute(projectRoot, "open"), "OPENED").warnings;
  assert.equal(invalidManifest.length, 1);
  assert.equal(invalidManifest[0].code, "INVALID_HISTORICAL_ARTIFACT_MANIFEST");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  fs.rmSync(manifestPath);
  const missingManifest = expectSuccess(execute(projectRoot, "open"), "OPENED").warnings;
  assert.equal(missingManifest.length, 1);
  assert.equal(missingManifest[0].code, "MISSING_HISTORICAL_ARTIFACT_MANIFEST");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  fs.rmSync(artifactPath);
  const warning = expectSuccess(execute(projectRoot, "open"), "OPENED").warnings;
  assert.equal(warning.length, 1);
  assert.equal(warning[0].code, "MISSING_HISTORICAL_ARTIFACT");
});

test("reserved artifact state is explicit and final output cannot be silently abandoned", async (t) => {
  const updates = {
    data_facts: {
      data_checked: "limited",
      audit_scope: "No artifact was adopted.",
    },
    council_chamber: {
      data_audit: {
        current_status: "limited",
        summary: "Audit handoff without an artifact.",
        questions_for_user: [],
        feedback_to_route: [],
      },
    },
  };

  const setup = (projectRoot, slug) => {
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug,
        extension: "csv",
      },
    }), "ARTIFACT_RESERVED");
    return {
      started,
      reserved,
      target: path.join(projectRoot, ...reserved.artifact_intent.location.split("/")),
      temporary: path.join(projectRoot, ...reserved.temporary_path.split("/")),
      manifestPath: path.join(projectRoot, ...reserved.manifest_path.split("/")),
    };
  };

  for (const physicalState of ["absent", "temp-only"]) {
    await t.test(`${physicalState} may close without adopting output`, () => {
      const projectRoot = temporaryProject(t);
      const context = setup(projectRoot, `allowed-${physicalState}`);
      if (physicalState === "temp-only") {
        fs.mkdirSync(path.dirname(context.temporary), { recursive: true });
        fs.writeFileSync(context.temporary, "field,missing\noutcome,0\n", "utf8");
      }
      const opened = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
      assert.equal(opened.artifact_status.location_state, physicalState);
      const applied = expectSuccess(execute(projectRoot, "apply", {
        payload: {
          ...expected(context.reserved),
          operation_id: context.started.operation_id,
          actor: "data_audit",
          updates,
        },
      }), "WORKER_APPLIED");
      assert.equal(applied.artifact_record, null);
      assert.deepEqual(readState(projectRoot).artifact_records, []);
      if (physicalState === "temp-only") assert.equal(fs.existsSync(context.temporary), true);
      expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    });
  }

  const projectRoot = temporaryProject(t);
  const context = setup(projectRoot, "guarded-final");
  fs.mkdirSync(path.dirname(context.temporary), { recursive: true });
  fs.writeFileSync(context.temporary, "field,missing\noutcome,0\n", "utf8");
  fs.renameSync(context.temporary, context.target);
  assert.equal(
    expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER").artifact_status.location_state,
    "final-awaiting-manifest",
  );

  const applyWithoutArtifact = () => execute(projectRoot, "apply", {
    payload: {
      ...expected(context.reserved),
      operation_id: context.started.operation_id,
      actor: "data_audit",
      updates,
    },
  });
  const stateBefore = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(applyWithoutArtifact(), "MISSING_ARTIFACT_RECORD");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBefore);

  fs.writeFileSync(context.target, "", "utf8");
  const invalidFinal = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER").artifact_status;
  assert.equal(invalidFinal.location_state, "invalid");
  expectFailure(applyWithoutArtifact(), "MISSING_ARTIFACT_RECORD");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBefore);

  fs.writeFileSync(context.target, "field,missing\noutcome,0\n", "utf8");
  fs.writeFileSync(context.manifestPath, "{}\n", "utf8");
  const invalidManifest = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER").artifact_status;
  assert.equal(invalidManifest.location_state, "invalid");
  assert.equal(invalidManifest.reason_code, "INVALID_ARTIFACT_MANIFEST");
  expectFailure(applyWithoutArtifact(), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBefore);

  const manifest = {
    schema_version: 1,
    operation_id: context.started.operation_id,
    route: "data_audit",
    scope_ref: null,
    files: [context.reserved.artifact_intent.location],
    completed_at: new Date().toISOString(),
    summary: "Completed but unrecorded audit artifact.",
  };
  fs.writeFileSync(context.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  assert.equal(
    expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER").artifact_status.location_state,
    "complete",
  );
  expectFailure(applyWithoutArtifact(), "MISSING_ARTIFACT_RECORD");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBefore);

  fs.rmSync(context.target);
  const manifestOnly = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER").artifact_status;
  assert.equal(manifestOnly.location_state, "collision");
  expectFailure(applyWithoutArtifact(), "ARTIFACT_COLLISION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBefore);
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(context.reserved),
      operation_id: context.started.operation_id,
      actor: "data_audit",
      updates,
      artifact: { summary: manifest.summary },
    },
  }), "ARTIFACT_COLLISION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBefore);

  fs.writeFileSync(context.target, "field,missing\noutcome,0\n", "utf8");
  fs.writeFileSync(context.temporary, "field,missing\noutcome,0\n", "utf8");
  const collision = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER").artifact_status;
  assert.equal(collision.location_state, "collision");
  expectFailure(applyWithoutArtifact(), "ARTIFACT_COLLISION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBefore);
});

test("atomic finish failure preserves a resumable lead operation and removes temp state", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  const startupNotice = readState(projectRoot).state_meta.startup_notice;
  const presentation = optionsPresentation([
    decisionOption("Audit the data", "data_audit"),
    decisionOption("Review the domain", "domain_expert"),
  ]);

  expectFailure(finish(projectRoot, started, {
    project_summary: { title: "Must not be committed" },
  }, {
    env: { STATECTL_FAIL_BEFORE_RENAME: "1" },
    presentation,
  }), "INJECTED_WRITE_FAILURE");

  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  const failedState = readState(projectRoot);
  assert.deepEqual(failedState.state_meta.startup_notice, startupNotice);
  assert.equal(failedState.pending_decision, null);
  assert.equal(failedState.response_receipt, null);
  assert.deepEqual(
    fs.readdirSync(projectRoot).filter((name) => name.startsWith(".project_state.yaml.tmp-")),
    [],
  );
  const resumed = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD");
  assert.equal(resumed.revision, started.revision);
  assert.equal(resumed.active_operation.id, started.operation_id);
  assert.deepEqual(readState(projectRoot).state_meta.startup_notice, startupNotice);

  const closed = expectSuccess(finish(projectRoot, started, {
    project_summary: { title: "Committed after retry" },
  }), "OPERATION_FINISHED");
  assert.equal(
    closed.response_markdown.match(/\[Causal-Consultant Loaded\]/g)?.length,
    1,
  );
  const committedState = readState(projectRoot);
  assert.equal(committedState.project_summary.title, "Committed after retry");
  assert.equal(committedState.state_meta.startup_notice, null);
  assert.equal(committedState.response_receipt.response_markdown, closed.response_markdown);
});

test("bundled stop hooks validate strictly without external YAML modules", async (t) => {
  assert.notDeepEqual(fs.readFileSync(CODEX_HOOK), fs.readFileSync(CLAUDE_HOOK));
  assert.match(fs.readFileSync(CODEX_HOOK, "utf8"), /Bundled dependency: yaml \(ISC\)/);
  assert.match(fs.readFileSync(BUNDLED_CLI, "utf8"), /Bundled dependency: yaml \(ISC\)/);

  await t.test("Codex missing state is silent", () => {
    const projectRoot = temporaryProject(t);
    const child = runHookProcess(projectRoot);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
  });

  await t.test("Claude missing state is silent", () => {
    const projectRoot = temporaryProject(t);
    const child = runHookProcess(projectRoot, { hook: CLAUDE_HOOK });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
  });

  await t.test("idle valid state passes", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const child = runHookProcess(projectRoot);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
  });

  await t.test("idle pending decision passes", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const lead = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    expectSuccess(finish(projectRoot, lead, {}, {
      presentation: optionsPresentation([
        decisionOption("Audit the data", "data_audit"),
        decisionOption("Review the domain", "domain_expert"),
      ]),
    }), "OPERATION_FINISHED");
    const child = runHookProcess(projectRoot);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
  });

  await t.test("active operation blocks", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const result = runHook(projectRoot);
    assert.equal(result.decision, "block", JSON.stringify(result));
    assert.match(result.reason, /still active/);
    assert.match(result.reason, /stage: lead_pending, actor: team_lead/);
    assert.equal(
      result.systemMessage,
      "project_state.yaml contains an unfinished causal-consultant operation.",
    );
  });

  await t.test("stop_hook_active allows the stop instead of blocking again", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const result = runHook(projectRoot, {
      input: { cwd: projectRoot, stop_hook_active: true },
    });
    assert.equal(result.decision, undefined);
    assert.equal(result.suppressOutput, true);
    assert.match(result.systemMessage, /remains unfinished/);
    assert.match(result.systemMessage, /allowing stop/);
  });

  await t.test("Claude blocks the first stop attempt with stage and actor detail", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const result = runHook(projectRoot, {
      hook: CLAUDE_HOOK,
      input: { cwd: projectRoot, stop_hook_active: false },
    });
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
    assert.match(result.reason, /stage: lead_pending, actor: team_lead/);
    assert.equal(
      result.systemMessage,
      "project_state.yaml contains an unfinished causal-consultant operation.",
    );
  });

  await t.test("Claude stop_hook_active yields instead of blocking again", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const result = runHook(projectRoot, {
      hook: CLAUDE_HOOK,
      input: { cwd: projectRoot, stop_hook_active: true },
    });
    assert.equal(result.decision, undefined);
    assert.equal(result.suppressOutput, true);
    assert.match(result.systemMessage, /remains unfinished/);
    assert.match(result.systemMessage, /allowing stop/);
  });

  await t.test("stop_hook_active with idle state stays silent", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const child = runHookProcess(projectRoot, { input: { cwd: projectRoot, stop_hook_active: true } });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout, "");
  });

  await t.test("strict validation errors warn without blocking preflight recovery", () => {
    const projectRoot = temporaryProject(t);
    fs.writeFileSync(statePath(projectRoot), "state_meta: {}\nstate_meta: {}\n", "utf8");
    const result = runHook(projectRoot);
    assert.equal(result.decision, undefined);
    assert.equal(result.suppressOutput, true);
    assert.match(result.systemMessage, /INVALID_YAML/);
  });

  await t.test("explicit project root takes precedence over cwd", () => {
    const explicitRoot = temporaryProject(t);
    const cwdRoot = temporaryProject(t);
    expectSuccess(execute(explicitRoot, "open"), "CREATED");
    const opened = expectSuccess(execute(cwdRoot, "open"), "CREATED");
    expectSuccess(begin(cwdRoot, opened, "team_lead"), "BEGAN_LEAD");

    assert.deepEqual(runHook(cwdRoot, {
      hook: SOURCE_HOOK,
      input: { projectRoot: explicitRoot, cwd: cwdRoot },
    }), { suppressOutput: true });
  });

  await t.test("host project root takes precedence over cwd", () => {
    const envRoot = temporaryProject(t);
    const cwdRoot = temporaryProject(t);
    expectSuccess(execute(envRoot, "open"), "CREATED");
    const opened = expectSuccess(execute(cwdRoot, "open"), "CREATED");
    expectSuccess(begin(cwdRoot, opened, "team_lead"), "BEGAN_LEAD");

    assert.deepEqual(runHook(cwdRoot, {
      hook: SOURCE_HOOK,
      input: { cwd: cwdRoot },
      env: { CLAUDE_PROJECT_DIR: envRoot },
      unsetEnv: ["CODEX_PROJECT_DIR"],
    }), { suppressOutput: true });
  });

  await t.test("Codex active cwd state takes precedence over stale host root", () => {
    const envRoot = temporaryProject(t);
    const cwdRoot = temporaryProject(t);
    expectSuccess(execute(envRoot, "open"), "CREATED");
    const opened = expectSuccess(execute(cwdRoot, "open"), "CREATED");
    expectSuccess(begin(cwdRoot, opened, "team_lead"), "BEGAN_LEAD");

    const result = runHook(cwdRoot, {
      hook: CODEX_SOURCE_HOOK,
      input: { cwd: cwdRoot },
      env: { CODEX_PROJECT_DIR: envRoot },
      unsetEnv: ["CLAUDE_PROJECT_DIR"],
    });
    assert.equal(result.decision, "block", JSON.stringify(result));
    assert.match(result.reason, /still active/);
  });

  await t.test("installed Codex bundle ignores a redirected project root", () => {
    const projectRoot = temporaryProject(t);
    const redirectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    expectSuccess(execute(redirectRoot, "open"), "CREATED");
    const hookDirectory = path.join(projectRoot, ".codex");
    const installedHook = path.join(hookDirectory, "project_state_stop_check.cjs");
    const nested = path.join(projectRoot, "nested", "work");
    fs.mkdirSync(hookDirectory, { recursive: true });
    fs.mkdirSync(nested, { recursive: true });
    fs.copyFileSync(CODEX_HOOK, installedHook);

    const result = runHook(projectRoot, {
      hook: installedHook,
      cwd: nested,
      input: { cwd: nested, projectRoot: redirectRoot },
      env: { CODEX_PROJECT_DIR: redirectRoot },
    });
    assert.equal(result.decision, "block", JSON.stringify(result));
    assert.match(result.reason, /still active/);
  });

  await t.test("installed Codex bundle stays silent for an outside working directory", () => {
    const projectRoot = temporaryProject(t);
    const outsideRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const hookDirectory = path.join(projectRoot, ".codex");
    const installedHook = path.join(hookDirectory, "project_state_stop_check.cjs");
    fs.mkdirSync(hookDirectory, { recursive: true });
    fs.copyFileSync(CODEX_HOOK, installedHook);

    const outsideProcess = runHookProcess(projectRoot, {
      hook: installedHook,
      cwd: outsideRoot,
      input: { cwd: outsideRoot, projectRoot },
      env: { CODEX_PROJECT_DIR: projectRoot },
    });
    assert.equal(outsideProcess.status, 0, outsideProcess.stderr);
    assert.equal(outsideProcess.stdout, "");

    const outsideInput = runHookProcess(projectRoot, {
      hook: installedHook,
      cwd: projectRoot,
      input: { cwd: outsideRoot, projectRoot },
      env: { CODEX_PROJECT_DIR: projectRoot },
    });
    assert.equal(outsideInput.status, 0, outsideInput.stderr);
    assert.equal(outsideInput.stdout, "");
  });

  await t.test("cwd resolves to the nearest state-bearing ancestor", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const nested = path.join(projectRoot, "nested", "work");
    fs.mkdirSync(nested, { recursive: true });

    const result = runHook(projectRoot, {
      hook: SOURCE_HOOK,
      cwd: nested,
      input: { cwd: nested },
      unsetEnv: ["CLAUDE_PROJECT_DIR", "CODEX_PROJECT_DIR", "PWD"],
    });
    assert.equal(result.decision, "block", JSON.stringify(result));
    assert.match(result.reason, /still active/);
  });
});

test("installed hook configurations resolve from nested working directories", async (t) => {
  const CLAUDE_SETTINGS = path.join(SKILL_ROOT, "project-hooks", "claude", "settings.json");
  const CODEX_HOOKS_CONFIG = path.join(SKILL_ROOT, "project-hooks", "codex", "hooks.json");
  const bashProbe = spawnSync("bash", ["-c", "echo ok"], { encoding: "utf8" });
  const hasBash = bashProbe.status === 0 && bashProbe.stdout.trim() === "ok";

  function configuredClaudeHandler() {
    const config = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, "utf8"));
    const handler = config.hooks.Stop[0].hooks[0];
    assert.equal(handler.command, "node");
    assert.ok(Array.isArray(handler.args) && handler.args.length === 1);
    return handler;
  }

  function runClaudeExecForm(projectRoot, cwd, input) {
    const handler = configuredClaudeHandler();
    const args = handler.args.map(
      (argument) => argument.replaceAll("${CLAUDE_PROJECT_DIR}", projectRoot),
    );
    const env = { ...process.env, NODE_PATH: "", CLAUDE_PROJECT_DIR: projectRoot };
    delete env.CODEX_PROJECT_DIR;
    const child = spawnSync(handler.command, args, {
      cwd,
      encoding: "utf8",
      input: JSON.stringify(input),
      env,
    });
    assert.equal(child.status, 0, child.stderr);
    return child;
  }

  function configuredCommand(configPath, field) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const hook = config.hooks.Stop[0].hooks[0];
    assert.equal(typeof hook[field], "string", `${configPath} must define ${field}`);
    return hook[field];
  }

  function anchoredTarget(command) {
    assert.match(command, /\/\* causal-consultant Codex hook \*\//);
    const match = command.match(/Buffer\.from\('([A-Za-z0-9+/=]+)','base64'\)/);
    assert.ok(match, "installed command must contain an encoded target");
    return Buffer.from(match[1], "base64").toString("utf8");
  }

  function installNestedProject(t2, hostDirectory, options = {}) {
    const projectRoot = temporaryProject(t2);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const hookDirectory = path.join(projectRoot, hostDirectory);
    fs.mkdirSync(hookDirectory, { recursive: true });
    fs.copyFileSync(
      hostDirectory === ".claude" ? CLAUDE_HOOK : CODEX_HOOK,
      path.join(
        hookDirectory,
        "project_state_stop_check.cjs",
      ),
    );
    if (hostDirectory === ".codex" && options.git !== false) {
      const initialized = spawnSync("git", ["init", "--quiet", projectRoot], { encoding: "utf8" });
      assert.equal(initialized.status, 0, initialized.stderr);
    }
    const nested = path.join(projectRoot, "nested", "deep");
    fs.mkdirSync(nested, { recursive: true });
    return { projectRoot, nested };
  }

  function executeConfigured(shell, command, cwd, extraEnv) {
    const env = { ...process.env, NODE_PATH: "" };
    delete env.CLAUDE_PROJECT_DIR;
    delete env.CODEX_PROJECT_DIR;
    Object.assign(env, extraEnv || {});
    return shell === "cmd"
      ? spawnSync(command, {
        shell: true,
        cwd,
        encoding: "utf8",
        input: JSON.stringify({ cwd, stop_hook_active: false }),
        env,
      })
      : spawnSync("bash", ["-c", command], {
        cwd,
        encoding: "utf8",
        input: JSON.stringify({ cwd, stop_hook_active: false }),
        env,
      });
  }

  function runConfigured(shell, command, cwd, extraEnv) {
    const child = executeConfigured(shell, command, cwd, extraEnv);
    assert.equal(child.status, 0, `hook command failed\nstdout: ${child.stdout}\nstderr: ${child.stderr}`);
    const lines = child.stdout.trim().split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1, `hook must emit one JSON line\nstdout: ${child.stdout}`);
    return JSON.parse(lines[0]);
  }

  await t.test("claude exec-form settings block from a nested directory", (t2) => {
    const { projectRoot, nested } = installNestedProject(t2, ".claude");
    const child = runClaudeExecForm(projectRoot, nested, { stop_hook_active: false });
    const result = JSON.parse(child.stdout.trim());
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });

  await t.test("claude exec-form settings block once in an ESM project", (t2) => {
    const { projectRoot, nested } = installNestedProject(t2, ".claude");
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"type":"module"}\n', "utf8");
    const blocked = JSON.parse(
      runClaudeExecForm(projectRoot, nested, { stop_hook_active: false }).stdout.trim(),
    );
    assert.equal(blocked.decision, "block");
    const yielded = JSON.parse(
      runClaudeExecForm(projectRoot, nested, { stop_hook_active: true }).stdout.trim(),
    );
    assert.equal(yielded.decision, undefined);
    assert.equal(yielded.suppressOutput, true);
    assert.match(yielded.systemMessage, /allowing stop/);
  });

  await t.test("codex command blocks from a nested ESM project without env", (t2) => {
    if (!hasBash) return t2.skip("bash is unavailable");
    const { projectRoot, nested } = installNestedProject(t2, ".codex");
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"type":"module"}\n', "utf8");
    const command = configuredCommand(CODEX_HOOKS_CONFIG, "command");
    const result = runConfigured("bash", command, nested, {});
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });

  await t.test("codex command anchors at the git root and ignores a nested shadow bundle", (t2) => {
    if (!hasBash && process.platform !== "win32") return t2.skip("supported shell is unavailable");
    const { projectRoot, nested } = installNestedProject(t2, ".codex");
    const shadowDirectory = path.join(projectRoot, "nested", ".codex");
    const shadowMarker = path.join(projectRoot, "shadow-hook-executed");
    fs.mkdirSync(shadowDirectory, { recursive: true });
    fs.copyFileSync(
      path.join(projectRoot, "project_state.yaml"),
      path.join(projectRoot, "nested", "project_state.yaml"),
    );
    fs.writeFileSync(
      path.join(shadowDirectory, "project_state_stop_check.cjs"),
      `require("node:fs").writeFileSync(${JSON.stringify(shadowMarker)}, "executed\\n");\n`,
      "utf8",
    );
    const field = process.platform === "win32" ? "commandWindows" : "command";
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const command = configuredCommand(CODEX_HOOKS_CONFIG, field);
    const result = runConfigured(shell, command, nested, {});
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
    assert.equal(fs.existsSync(shadowMarker), false, "nested shadow hook must not execute");
  });

  await t.test("codex command honors CODEX_PROJECT_DIR from a nested directory", (t2) => {
    if (!hasBash && process.platform !== "win32") return t2.skip("supported shell is unavailable");
    const { projectRoot, nested } = installNestedProject(t2, ".codex", { git: false });
    const field = process.platform === "win32" ? "commandWindows" : "command";
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const command = configuredCommand(CODEX_HOOKS_CONFIG, field);
    const result = runConfigured(shell, command, nested, {
      CODEX_PROJECT_DIR: projectRoot,
    });
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });

  await t.test("codex windows command blocks from a nested ESM project", (t2) => {
    if (process.platform !== "win32") return t2.skip("cmd.exe is Windows-specific");
    const { projectRoot, nested } = installNestedProject(t2, ".codex");
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"type":"module"}\n', "utf8");
    const command = configuredCommand(CODEX_HOOKS_CONFIG, "commandWindows");
    const result = runConfigured("cmd", command, nested, {});
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });

  await t.test("codex command prefers the active cwd over stale CODEX_PROJECT_DIR", (t2) => {
    if (!hasBash && process.platform !== "win32") return t2.skip("supported shell is unavailable");
    const { nested } = installNestedProject(t2, ".codex");
    const staleRoot = temporaryProject(t2);
    expectSuccess(execute(staleRoot, "open"), "CREATED");
    const staleHookDirectory = path.join(staleRoot, ".codex");
    fs.mkdirSync(staleHookDirectory, { recursive: true });
    fs.copyFileSync(CODEX_HOOK, path.join(staleHookDirectory, "project_state_stop_check.cjs"));
    const field = process.platform === "win32" ? "commandWindows" : "command";
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const command = configuredCommand(CODEX_HOOKS_CONFIG, field);
    const result = runConfigured(shell, command, nested, { CODEX_PROJECT_DIR: staleRoot });
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });

  await t.test("codex command accepts a nested CODEX_PROJECT_DIR within the active host root", (t2) => {
    if (!hasBash && process.platform !== "win32") return t2.skip("supported shell is unavailable");
    const { projectRoot, nested } = installNestedProject(t2, ".codex");
    const siblingCwd = path.join(projectRoot, "sibling", "work");
    fs.mkdirSync(siblingCwd, { recursive: true });
    const field = process.platform === "win32" ? "commandWindows" : "command";
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const command = configuredCommand(CODEX_HOOKS_CONFIG, field);
    const result = runConfigured(shell, command, siblingCwd, { CODEX_PROJECT_DIR: nested });
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
    assert.notEqual(projectRoot, nested);
  });

  await t.test("codex command rejects stale CODEX_PROJECT_DIR for an external state-free cwd", (t2) => {
    if (!hasBash && process.platform !== "win32") return t2.skip("supported shell is unavailable");
    const staleRoot = temporaryProject(t2);
    const opened = expectSuccess(execute(staleRoot, "open"), "CREATED");
    expectSuccess(begin(staleRoot, opened, "team_lead"), "BEGAN_LEAD");
    const staleHookDirectory = path.join(staleRoot, ".codex");
    fs.mkdirSync(staleHookDirectory, { recursive: true });
    fs.copyFileSync(CODEX_HOOK, path.join(staleHookDirectory, "project_state_stop_check.cjs"));
    const externalCwd = temporaryProject(t2);
    const field = process.platform === "win32" ? "commandWindows" : "command";
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const command = configuredCommand(CODEX_HOOKS_CONFIG, field);
    const result = executeConfigured(shell, command, externalCwd, { CODEX_PROJECT_DIR: staleRoot });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "");
  });

  await t.test("Codex installer produces a runnable nested ESM installation", (t2) => {
    if (!hasBash && process.platform !== "win32") return t2.skip("supported shell is unavailable");
    const container = temporaryProject(t2);
    const projectRoot = path.join(container, "project with spaces & percent%value%");
    fs.mkdirSync(projectRoot);
    const initialized = spawnSync("git", ["init", "--quiet", projectRoot], { encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"type":"module"}\n', "utf8");
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const installed = runCodexHookInstaller(projectRoot);
    assert.equal(installed.status, 0, installed.stderr);
    assert.equal(installed.result.code, "INSTALLED");
    const nested = path.join(projectRoot, "nested", "deep");
    fs.mkdirSync(nested, { recursive: true });
    const shadowDirectory = path.join(projectRoot, "nested", ".codex");
    fs.mkdirSync(shadowDirectory);
    fs.writeFileSync(
      path.join(shadowDirectory, "project_state_stop_check.cjs"),
      "process.stdout.write('{\"shadowed\":true}\\n');\n",
      "utf8",
    );
    const installedConfig = path.join(projectRoot, ".codex", "hooks.json");
    const field = process.platform === "win32" ? "commandWindows" : "command";
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const command = configuredCommand(installedConfig, field);
    assert.equal(
      anchoredTarget(command),
      path.join(fs.realpathSync.native(projectRoot), ".codex", "project_state_stop_check.cjs"),
    );
    const result = runConfigured(shell, command, nested, {});
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
    assert.equal(result.shadowed, undefined);

    fs.writeFileSync(
      path.join(projectRoot, ".codex", "project_state_stop_check.cjs"),
      "process.stdout.write('tampered');\n",
      "utf8",
    );
    const tampered = executeConfigured(shell, command, nested, {});
    assert.notEqual(tampered.status, 0);
    assert.equal(tampered.stdout, "");
    assert.match(tampered.stderr, /Codex hook integrity check failed/);
  });

  await t.test("configured Codex command emits zero stdout when state is missing or idle", (t2) => {
    if (!hasBash && process.platform !== "win32") return t2.skip("supported shell is unavailable");
    const projectRoot = temporaryProject(t2);
    const codexDirectory = path.join(projectRoot, ".codex");
    fs.mkdirSync(codexDirectory, { recursive: true });
    const initialized = spawnSync("git", ["init", "--quiet", projectRoot], { encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    fs.copyFileSync(CODEX_HOOK, path.join(codexDirectory, "project_state_stop_check.cjs"));
    const nested = path.join(projectRoot, "nested");
    fs.mkdirSync(nested);
    const field = process.platform === "win32" ? "commandWindows" : "command";
    const shell = process.platform === "win32" ? "cmd" : "bash";
    const command = configuredCommand(CODEX_HOOKS_CONFIG, field);

    const missing = executeConfigured(shell, command, nested, {});
    assert.equal(missing.status, 0, missing.stderr);
    assert.equal(missing.stdout, "");

    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const idle = executeConfigured(shell, command, nested, {});
    assert.equal(idle.status, 0, idle.stderr);
    assert.equal(idle.stdout, "");
  });

  await t.test("idle state stays silent through the configured claude handler", (t2) => {
    const projectRoot = temporaryProject(t2);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const hookDirectory = path.join(projectRoot, ".claude");
    fs.mkdirSync(hookDirectory, { recursive: true });
    fs.copyFileSync(CLAUDE_HOOK, path.join(hookDirectory, "project_state_stop_check.cjs"));
    const nested = path.join(projectRoot, "nested", "deep");
    fs.mkdirSync(nested, { recursive: true });
    const child = runClaudeExecForm(projectRoot, nested, { stop_hook_active: false });
    assert.deepEqual(JSON.parse(child.stdout.trim()), { suppressOutput: true });
  });

  await t.test("Codex installer safely merges, backs up, and is idempotent", (t2) => {
    const projectRoot = temporaryProject(t2);
    const codexDirectory = path.join(projectRoot, ".codex");
    fs.mkdirSync(codexDirectory, { recursive: true });
    const existing = {
      projectSetting: "preserve-me",
      hooks: {
        Stop: [
          { hooks: [{ type: "command", command: "node unrelated.cjs", timeout: 4 }] },
          {
            hooks: [{
              type: "command",
              command: "node .codex/project_state_stop_check.js",
              timeout: 3,
              async: true,
            }],
          },
        ],
        SessionStart: [{ hooks: [{ type: "command", command: "node setup.cjs" }] }],
      },
    };
    const configPath = path.join(codexDirectory, "hooks.json");
    const bundlePath = path.join(codexDirectory, "project_state_stop_check.cjs");
    fs.writeFileSync(configPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
    fs.writeFileSync(bundlePath, "stale bundle\n", "utf8");

    const first = runCodexHookInstaller(projectRoot);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.result.code, "INSTALLED");
    assert.equal(first.result.changed.bundle, true);
    assert.equal(first.result.changed.config, true);
    assert.equal(first.result.backups.some((item) => item.startsWith(".codex/hooks.json.bak-")), true);
    const bundleBackup = first.result.backups.find(
      (item) => item.startsWith(".codex/project_state_stop_check.cjs.bak-"),
    );
    assert.equal(typeof bundleBackup, "string");
    assert.equal(fs.readFileSync(path.join(projectRoot, ...bundleBackup.split("/")), "utf8"), "stale bundle\n");
    assert.deepEqual(fs.readFileSync(bundlePath), fs.readFileSync(CODEX_HOOK));
    const installed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    assert.equal(installed.projectSetting, "preserve-me");
    assert.deepEqual(installed.hooks.SessionStart, existing.hooks.SessionStart);
    const handlers = installed.hooks.Stop.flatMap((group) => group.hooks);
    assert.equal(handlers.some((handler) => handler.command === "node unrelated.cjs"), true);
    assert.equal(
      handlers.filter((handler) => /\/\* causal-consultant Codex hook \*\//.test(handler.command || "")).length,
      1,
    );
    const installedConsultant = handlers.find(
      (handler) => /\/\* causal-consultant Codex hook \*\//.test(handler.command || ""),
    );
    const canonicalConsultant = JSON.parse(
      fs.readFileSync(CODEX_HOOKS_CONFIG, "utf8"),
    ).hooks.Stop[0].hooks[0];
    const installedMetadata = structuredClone(installedConsultant);
    const canonicalMetadata = structuredClone(canonicalConsultant);
    delete installedMetadata.command;
    delete installedMetadata.commandWindows;
    delete canonicalMetadata.command;
    delete canonicalMetadata.commandWindows;
    assert.deepEqual(installedMetadata, canonicalMetadata);
    assert.equal(
      anchoredTarget(installedConsultant.command),
      path.join(fs.realpathSync.native(projectRoot), ".codex", "project_state_stop_check.cjs"),
    );
    assert.equal(installedConsultant.commandWindows, installedConsultant.command);
    assert.notEqual(installedConsultant.command, canonicalConsultant.command);
    assert.equal(Object.prototype.hasOwnProperty.call(installedConsultant, "async"), false);

    const backupsBefore = fs.readdirSync(codexDirectory).filter((name) => name.includes(".bak-")).sort();
    const second = runCodexHookInstaller(projectRoot);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(second.result.code, "ALREADY_INSTALLED");
    assert.deepEqual(
      fs.readdirSync(codexDirectory).filter((name) => name.includes(".bak-")).sort(),
      backupsBefore,
    );
  });

  await t.test("Codex installer restores both targets when the second write fails", (t2) => {
    const projectRoot = temporaryProject(t2);
    const codexDirectory = path.join(projectRoot, ".codex");
    fs.mkdirSync(codexDirectory);
    const configPath = path.join(codexDirectory, "hooks.json");
    const bundlePath = path.join(codexDirectory, "project_state_stop_check.cjs");
    const originalConfig = Buffer.from(
      JSON.stringify({ projectSetting: "original", hooks: { Stop: [] } }, null, 2) + "\n",
      "utf8",
    );
    const originalBundle = Buffer.from("original bundle bytes\n", "utf8");
    fs.writeFileSync(configPath, originalConfig);
    fs.writeFileSync(bundlePath, originalBundle);
    const originalEntries = fs.readdirSync(codexDirectory).sort();
    let writes = 0;

    assert.throws(
      () => installCodexHook(projectRoot, {
        writeTarget(target, bytes) {
          writes += 1;
          if (writes === 2) throw new Error("injected second write failure");
          atomicWriteCodexHookInstall(target, bytes);
        },
      }),
      /original targets were restored: injected second write failure/,
    );
    assert.equal(writes, 2);
    assert.deepEqual(fs.readFileSync(configPath), originalConfig);
    assert.deepEqual(fs.readFileSync(bundlePath), originalBundle);
    assert.deepEqual(fs.readdirSync(codexDirectory).sort(), originalEntries);
  });

  await t.test("Codex installer distinguishes an unverified rollback failure", (t2) => {
    const projectRoot = temporaryProject(t2);
    const codexDirectory = path.join(projectRoot, ".codex");
    fs.mkdirSync(codexDirectory);
    const configPath = path.join(codexDirectory, "hooks.json");
    const bundlePath = path.join(codexDirectory, "project_state_stop_check.cjs");
    fs.writeFileSync(configPath, JSON.stringify({ hooks: { Stop: [] } }) + "\n", "utf8");
    fs.writeFileSync(bundlePath, "original bundle bytes\n", "utf8");
    let writes = 0;
    let failure;

    try {
      installCodexHook(projectRoot, {
        writeTarget(target, bytes) {
          writes += 1;
          if (writes === 2) throw new Error("injected commit failure");
          atomicWriteCodexHookInstall(target, bytes);
        },
        rollbackWriteTarget() {
          throw new Error("injected rollback failure");
        },
      });
    } catch (error) {
      failure = error;
    }
    assert.ok(failure);
    assert.equal(failure && failure.code, "ROLLBACK_FAILED");
    assert.match(failure.message, /installation failed: injected commit failure/);
    assert.match(failure.message, /rollback failed:/);
    assert.match(failure.message, /injected rollback failure/);
  });

  await t.test("Codex installer preserves a similarly named unrelated hook", (t2) => {
    const projectRoot = temporaryProject(t2);
    const codexDirectory = path.join(projectRoot, ".codex");
    fs.mkdirSync(codexDirectory, { recursive: true });
    const unrelated = {
      type: "command",
      command: "node tools/my_project_state_stop_check.js",
      timeout: 7,
    };
    const configPath = path.join(codexDirectory, "hooks.json");
    fs.writeFileSync(configPath, `${JSON.stringify({
      hooks: { Stop: [{ hooks: [unrelated] }] },
    }, null, 2)}\n`, "utf8");

    const installedResult = runCodexHookInstaller(projectRoot);
    assert.equal(installedResult.status, 0, installedResult.stderr);
    assert.equal(installedResult.result.code, "INSTALLED");
    const installed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const handlers = installed.hooks.Stop.flatMap((group) => group.hooks);
    assert.deepEqual(handlers.find((handler) => handler.command === unrelated.command), unrelated);
    assert.equal(
      handlers.filter((handler) => /causal-consultant Codex hook/.test(handler.command || "")).length,
      1,
    );
  });

  await t.test("Codex installer rejects duplicate registrations without mutation", (t2) => {
    const projectRoot = temporaryProject(t2);
    const codexDirectory = path.join(projectRoot, ".codex");
    fs.mkdirSync(codexDirectory, { recursive: true });
    const configPath = path.join(codexDirectory, "hooks.json");
    const duplicate = {
      hooks: {
        Stop: [{
          hooks: [
            { type: "command", command: "node .codex/project_state_stop_check.js" },
            { type: "command", command: "node .codex/project_state_stop_check.cjs" },
          ],
        }],
      },
    };
    const original = `${JSON.stringify(duplicate, null, 2)}\n`;
    fs.writeFileSync(configPath, original, "utf8");
    const result = runCodexHookInstaller(projectRoot);
    assert.notEqual(result.status, 0);
    assert.equal(result.result.code, "INSTALL_FAILED");
    assert.match(result.result.message, /multiple causal-consultant Stop hooks/);
    assert.equal(fs.readFileSync(configPath, "utf8"), original);
    assert.equal(fs.existsSync(path.join(codexDirectory, "project_state_stop_check.cjs")), false);
    assert.deepEqual(fs.readdirSync(codexDirectory), ["hooks.json"]);
  });

  await t.test("Codex installer rejects a non-regular hook target", (t2) => {
    const projectRoot = temporaryProject(t2);
    const codexDirectory = path.join(projectRoot, ".codex");
    const configPath = path.join(codexDirectory, "hooks.json");
    fs.mkdirSync(configPath, { recursive: true });

    const result = runCodexHookInstaller(projectRoot);
    assert.notEqual(result.status, 0);
    assert.equal(result.result.code, "INSTALL_FAILED");
    assert.match(result.result.message, /non-regular target: \.codex\/hooks\.json/);
    assert.deepEqual(fs.readdirSync(codexDirectory), ["hooks.json"]);
    assert.equal(fs.statSync(configPath).isDirectory(), true);
  });
});

test("claude hook installer merges, backs up, and stays idempotent", async (t) => {
  const CLAUDE_SNIPPET = JSON.parse(fs.readFileSync(
    path.join(SKILL_ROOT, "project-hooks", "claude", "settings.json"),
    "utf8",
  ));
  const SNIPPET_HANDLER = CLAUDE_SNIPPET.hooks.Stop[0].hooks[0];

  await t.test("fresh install creates settings.json and the bundle", (t2) => {
    const projectRoot = temporaryProject(t2);
    const { result } = runClaudeHookInstaller(projectRoot);
    assert.equal(result.ok, true);
    assert.equal(result.code, "INSTALLED");
    assert.deepEqual(result.backups, []);
    const settings = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ".claude", "settings.json"), "utf8"),
    );
    assert.deepEqual(settings.hooks.Stop[0].hooks[0], SNIPPET_HANDLER);
    assert.equal(settings.hooks.Stop[0].hooks[0].command, "node");
    assert.equal(
      fs.existsSync(path.join(projectRoot, ".claude", "project_state_stop_check.cjs")),
      true,
    );
    const rerun = runClaudeHookInstaller(projectRoot);
    assert.equal(rerun.result.code, "ALREADY_INSTALLED");
  });

  await t.test("existing settings are merged and backed up, not overwritten", (t2) => {
    const projectRoot = temporaryProject(t2);
    const claudeDirectory = path.join(projectRoot, ".claude");
    fs.mkdirSync(claudeDirectory, { recursive: true });
    const existing = {
      permissions: { allow: ["Bash(npm test:*)"] },
      env: { EXAMPLE: "1" },
      hooks: {
        PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo done" }] }],
        Stop: [{ hooks: [{ type: "command", command: "node unrelated-stop.js" }] }],
      },
    };
    const settingsPath = path.join(claudeDirectory, "settings.json");
    fs.writeFileSync(settingsPath, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

    const { result } = runClaudeHookInstaller(projectRoot);
    assert.equal(result.code, "INSTALLED");
    assert.equal(result.backups.length, 1);
    assert.match(result.backups[0], /settings\.json\.bak-/);
    assert.equal(fs.existsSync(path.join(projectRoot, result.backups[0])), true);

    const merged = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.deepEqual(merged.permissions, existing.permissions);
    assert.deepEqual(merged.env, existing.env);
    assert.deepEqual(merged.hooks.PostToolUse, existing.hooks.PostToolUse);
    assert.equal(merged.hooks.Stop[0].hooks[0].command, "node unrelated-stop.js");
    assert.deepEqual(merged.hooks.Stop[1].hooks[0], SNIPPET_HANDLER);
  });

  await t.test("an outdated consultant entry is replaced in place", (t2) => {
    const projectRoot = temporaryProject(t2);
    const claudeDirectory = path.join(projectRoot, ".claude");
    fs.mkdirSync(claudeDirectory, { recursive: true });
    const settingsPath = path.join(claudeDirectory, "settings.json");
    fs.writeFileSync(settingsPath, `${JSON.stringify({
      hooks: {
        Stop: [{
          hooks: [{
            type: "command",
            command: "node \".claude/project_state_stop_check.js\"",
          }],
        }],
      },
    }, null, 2)}\n`, "utf8");

    const { result } = runClaudeHookInstaller(projectRoot);
    assert.equal(result.code, "INSTALLED");
    const merged = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    assert.equal(merged.hooks.Stop.length, 1);
    assert.equal(merged.hooks.Stop[0].hooks.length, 1);
    assert.deepEqual(merged.hooks.Stop[0].hooks[0], SNIPPET_HANDLER);
  });

  await t.test("invalid existing settings abort without mutation", (t2) => {
    const projectRoot = temporaryProject(t2);
    const claudeDirectory = path.join(projectRoot, ".claude");
    fs.mkdirSync(claudeDirectory, { recursive: true });
    const settingsPath = path.join(claudeDirectory, "settings.json");
    fs.writeFileSync(settingsPath, "{ not json", "utf8");
    assert.throws(
      () => installClaudeHook(projectRoot),
      /existing \.claude\/settings\.json is invalid JSON/,
    );
    assert.equal(fs.readFileSync(settingsPath, "utf8"), "{ not json");
    assert.equal(
      fs.existsSync(path.join(claudeDirectory, "project_state_stop_check.cjs")),
      false,
    );
  });

  await t.test("the installed configuration blocks from a nested directory", (t2) => {
    const projectRoot = temporaryProject(t2);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    runClaudeHookInstaller(projectRoot);
    const installed = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ".claude", "settings.json"), "utf8"),
    );
    const handler = installed.hooks.Stop.at(-1).hooks[0];
    assert.equal(handler.command, "node");
    const args = handler.args.map(
      (argument) => argument.replaceAll("${CLAUDE_PROJECT_DIR}", projectRoot),
    );
    const nested = path.join(projectRoot, "nested", "deep");
    fs.mkdirSync(nested, { recursive: true });
    const env = { ...process.env, NODE_PATH: "", CLAUDE_PROJECT_DIR: projectRoot };
    delete env.CODEX_PROJECT_DIR;
    const child = spawnSync(handler.command, args, {
      cwd: nested,
      encoding: "utf8",
      input: JSON.stringify({ stop_hook_active: false }),
      env,
    });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout.trim());
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });

  await t.test("Claude installer produces a runnable nested ESM installation", (t2) => {
    const container = temporaryProject(t2);
    const projectRoot = path.join(container, "project with spaces & percent%value%");
    fs.mkdirSync(projectRoot);
    fs.writeFileSync(path.join(projectRoot, "package.json"), '{"type":"module"}\n', "utf8");
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const installed = runClaudeHookInstaller(projectRoot);
    assert.equal(installed.result.code, "INSTALLED");
    const settings = JSON.parse(
      fs.readFileSync(path.join(projectRoot, ".claude", "settings.json"), "utf8"),
    );
    const handler = settings.hooks.Stop.at(-1).hooks[0];
    assert.match(handler.args[0], /project_state_stop_check\.cjs$/);
    const args = handler.args.map(
      (argument) => argument.replaceAll("${CLAUDE_PROJECT_DIR}", projectRoot),
    );
    const nested = path.join(projectRoot, "nested", "deep");
    fs.mkdirSync(nested, { recursive: true });
    const env = { ...process.env, NODE_PATH: "", CLAUDE_PROJECT_DIR: projectRoot };
    delete env.CODEX_PROJECT_DIR;
    const child = spawnSync(handler.command, args, {
      cwd: nested,
      encoding: "utf8",
      input: JSON.stringify({ stop_hook_active: false }),
      env,
    });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout.trim());
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });
});

test("injected begin failure leaves revision zero and no partial operation", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "begin", {
    env: { STATECTL_FAIL_BEFORE_RENAME: "1" },
    payload: {
      ...expected(opened),
      route: "data_audit",
      intent_summary: "Exercise atomic begin failure",
    },
  }), "INJECTED_WRITE_FAILURE");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  const state = readState(projectRoot);
  assert.equal(state.state_meta.revision, 0);
  assert.equal(state.state_meta.active_operation, null);
  assert.deepEqual(state.next_step_plan, []);
});

test("strict validation rejects a plan whose active scope reference does not match its route", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const started = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const state = readState(projectRoot);
  state.state_meta.active_operation.scope_ref.id = crypto.randomUUID();
  writeState(projectRoot, state);
  expectFailure(execute(projectRoot, "validate"), "SCOPE_MISMATCH");
  assert.equal(started.stage, "worker_pending");
});

test("directory artifacts require a real in-directory deliverable and reject parent traversal", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "directory",
      slug: "audit-package",
    },
  }), "ARTIFACT_RESERVED");

  const target = path.join(projectRoot, ...reserved.artifact_intent.location.split("/"));
  const temporary = path.join(projectRoot, ...reserved.temporary_path.split("/"));
  fs.mkdirSync(temporary, { recursive: true });
  fs.writeFileSync(path.join(temporary, "results.csv"), "variable,missing\noutcome,0\n", "utf8");
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  const updates = {
    data_facts: { data_checked: "passing" },
    council_chamber: {
      data_audit: {
        current_status: "complete",
        summary: "Audit package completed.",
        questions_for_user: [],
        feedback_to_route: [],
      },
    },
  };
  const applyPayload = {
    ...expected(reserved),
    operation_id: started.operation_id,
    actor: "data_audit",
    updates,
    artifact: { summary: "Data-audit package." },
  };
  const stateBeforeFailures = fs.readFileSync(statePath(projectRoot), "utf8");

  const workerManifestPath = path.join(temporary, "artifact-manifest.json");
  fs.writeFileSync(workerManifestPath, "{}\n", "utf8");
  expectFailure(execute(projectRoot, "apply", { payload: applyPayload }), "ARTIFACT_COLLISION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBeforeFailures);
  assert.equal(fs.existsSync(temporary), true);
  assert.equal(fs.existsSync(target), false);
  fs.rmSync(workerManifestPath);

  const orphanManifestTemp = path.join(temporary, ".artifact-manifest.json.tmp-orphan");
  fs.writeFileSync(orphanManifestTemp, "orphan controller temporary\n", "utf8");
  const orphanFailure = expectFailure(
    execute(projectRoot, "apply", { payload: applyPayload }),
    "INVALID_ARTIFACT_PATH",
  );
  assert.match(orphanFailure.message, /controller-owned manifest temporary file/);
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBeforeFailures);
  assert.equal(fs.existsSync(temporary), true);
  assert.equal(fs.existsSync(target), false);
  fs.rmSync(orphanManifestTemp);

  expectFailure(execute(projectRoot, "apply", {
    env: { STATECTL_FAIL_BEFORE_RENAME: "1" },
    payload: applyPayload,
  }), "INJECTED_WRITE_FAILURE");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBeforeFailures);
  assert.equal(fs.existsSync(temporary), false);
  assert.equal(fs.existsSync(target), true);
  assert.equal(fs.existsSync(manifestPath), true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const generatedFiles = [`${reserved.artifact_intent.location}/results.csv`];
  assert.deepEqual(manifest.files, generatedFiles);

  manifest.files = [reserved.manifest_path];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expectFailure(execute(projectRoot, "apply", { payload: applyPayload }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBeforeFailures);

  const escapedPath = path.join(projectRoot, "output", "escaped.txt");
  fs.writeFileSync(escapedPath, "outside reserved directory\n", "utf8");
  manifest.files = [`${reserved.artifact_intent.location}/../escaped.txt`];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expectFailure(execute(projectRoot, "apply", { payload: applyPayload }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBeforeFailures);

  manifest.files = generatedFiles;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const applied = expectSuccess(execute(projectRoot, "apply", { payload: applyPayload }), "WORKER_APPLIED");
  assert.equal(applied.artifact_record.location, reserved.artifact_intent.location);
  assert.equal(applied.artifact_record.route, "data_audit");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  expectSuccess(execute(projectRoot, "validate"), "VALID");

  fs.rmSync(path.join(target, "results.csv"));
  const warnings = expectSuccess(execute(projectRoot, "open"), "OPENED").warnings;
  assert.deepEqual(warnings, [{
    code: "MISSING_HISTORICAL_ARTIFACT_FILE",
    artifact_id: applied.artifact_record.artifact_id,
    location: reserved.artifact_intent.location,
    file: `${reserved.artifact_intent.location}/results.csv`,
  }]);
});

test("active manifests must exactly inventory the reserved artifact body", async (t) => {
  const scenarios = [
    {
      name: "file manifest adds an unrelated output",
      kind: "file",
      extension: "csv",
      writeTemporary(projectRoot, reserved) {
        writeReservedTemporary(projectRoot, reserved, "field,value\nrows,12\n");
      },
      mutateManifest(projectRoot, _reserved, manifest) {
        const unrelated = "output/unrelated-active-output.csv";
        fs.writeFileSync(
          path.join(projectRoot, ...unrelated.split("/")),
          "field,value\nextra,1\n",
          "utf8",
        );
        manifest.files.push(unrelated);
      },
    },
    {
      name: "directory manifest omits an actual deliverable",
      kind: "directory",
      extension: undefined,
      writeTemporary(projectRoot, reserved) {
        const temporary = path.join(projectRoot, ...reserved.temporary_path.split("/"));
        fs.mkdirSync(temporary, { recursive: true });
        fs.writeFileSync(path.join(temporary, "results.csv"), "field,value\nrows,12\n", "utf8");
        fs.writeFileSync(path.join(temporary, "diagnostics.csv"), "check,value\nvalid,1\n", "utf8");
      },
      mutateManifest(_projectRoot, _reserved, manifest) {
        manifest.files = manifest.files.filter((file) => !file.endsWith("/diagnostics.csv"));
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, (subtest) => {
      const projectRoot = temporaryProject(subtest);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
      const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          kind: scenario.kind,
          slug: "exact-active-inventory",
          ...(scenario.extension === undefined ? {} : { extension: scenario.extension }),
        },
      }), "ARTIFACT_RESERVED");
      scenario.writeTemporary(projectRoot, reserved);
      const applyPayload = {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "data_audit",
        updates: {
          data_facts: { data_checked: "passing" },
          council_chamber: {
            data_audit: {
              current_status: "complete",
              summary: "The active inventory test audit is complete.",
              questions_for_user: [],
              feedback_to_route: [],
            },
          },
        },
        artifact: { summary: "Exact active inventory output." },
      };
      const before = fs.readFileSync(statePath(projectRoot));
      expectFailure(execute(projectRoot, "apply", {
        env: { STATECTL_FAIL_BEFORE_RENAME: "1" },
        payload: applyPayload,
      }), "INJECTED_WRITE_FAILURE");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

      const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      scenario.mutateManifest(projectRoot, reserved, manifest);
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      const failure = expectFailure(
        execute(projectRoot, "apply", { payload: applyPayload }),
        "INVALID_ARTIFACT_MANIFEST",
      );
      assert.match(failure.message, /exactly match the reserved artifact inventory/);
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
      assert.equal(readState(projectRoot).state_meta.active_operation.stage, "worker_pending");
    });
  }
});

test("existing artifact manifests cannot use links outside the reserved location", (t) => {
  const projectRoot = temporaryProject(t);
  const outsideRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "directory",
      slug: "linked-audit",
    },
  }), "ARTIFACT_RESERVED");

  const target = path.join(projectRoot, ...reserved.artifact_intent.location.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "result.csv"), "outside,reservation\n1,true\n", "utf8");
  try {
    fs.symlinkSync(outsideRoot, target, process.platform === "win32" ? "junction" : "dir");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`link creation is unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const manifest = {
    schema_version: 1,
    operation_id: started.operation_id,
    route: "data_audit",
    scope_ref: null,
    files: [`${reserved.artifact_intent.location}/result.csv`],
    completed_at: new Date().toISOString(),
    summary: "Linked audit package.",
  };
  fs.writeFileSync(path.join(outsideRoot, "artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: { data_checked: "passing" },
        council_chamber: {
          data_audit: {
            current_status: "complete",
            summary: "Audit completed.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
      artifact: { summary: manifest.summary },
    },
  }), "MISSING_ARTIFACT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  expectSuccess(finish(projectRoot, reserved, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("finish --cancel rejects semantic updates, preserves worker state, and synchronizes aggregates", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: {
          data_checked: "limited",
          audit_scope: "Durable partial audit",
          support_notes: ["Preserve this worker result when cancelling closeout."],
        },
        council_chamber: {
          data_audit: {
            current_status: "limited",
            summary: "Partial audit is durable.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const staleBoundary = readState(projectRoot);
  staleBoundary.project_summary.data_audit_complete = false;
  staleBoundary.project_summary.last_updated = null;
  writeState(projectRoot, staleBoundary);
  const beforeCancel = readState(projectRoot);
  const beforeBytes = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(finish(projectRoot, applied, {
    project_summary: { title: "Cancellation must not write this" },
  }, { cancel: true }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeBytes);

  const cancelled = expectSuccess(finish(projectRoot, applied, {}, { cancel: true }), "OPERATION_CANCELLED");
  const afterCancel = readState(projectRoot);
  for (const key of [
    "council_chamber",
    "data_facts",
    "domain_knowledge",
    "causal_facts",
    "discovery_sidecar",
    "report_assembly",
    "artifact_records",
  ]) {
    assert.deepEqual(afterCancel[key], beforeCancel[key], `${key} changed during cancellation`);
  }
  for (const key of ["title", "objective", "materials", "phase", "exploration_summary"]) {
    assert.deepEqual(afterCancel.project_summary[key], beforeCancel.project_summary[key]);
  }
  assert.equal(afterCancel.project_summary.data_audit_complete, true);
  assert.equal(afterCancel.project_summary.domain_knowledge_complete, false);
  assert.equal(afterCancel.project_summary.causal_check_complete, false);
  assert.equal(afterCancel.project_summary.exploration_complete, false);
  assert.match(afterCancel.project_summary.last_updated, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(cancelled.revision, applied.revision + 1);
  assert.equal(afterCancel.state_meta.active_operation, null);
  assert.deepEqual(afterCancel.next_step_plan, []);
});

test("a historical report artifact remains valid with a new scope but cannot be relabeled non-existent", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareReportScope(projectRoot);
  const seeded = readState(projectRoot);
  seeded.council_chamber.report_writer.summary = "Stale ready report summary.";
  seeded.council_chamber.report_writer.questions_for_user = ["Stale report approval question?"];
  seeded.council_chamber.report_writer.feedback_to_route = ["Preserve report feedback."];
  writeState(projectRoot, seeded);
  const execution = expectSuccess(begin(projectRoot, prepared, "report_writer", {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(execution),
      operation_id: execution.operation_id,
      kind: "file",
      slug: "clinical-report",
      extension: "html",
    },
  }), "ARTIFACT_RESERVED");
  const artifactPath = path.join(projectRoot, ...reserved.artifact_intent.location.split("/"));
  const temporaryPath = path.join(projectRoot, ...reserved.temporary_path.split("/"));
  fs.mkdirSync(path.dirname(temporaryPath), { recursive: true });
  fs.writeFileSync(temporaryPath, "<!doctype html><title>Clinical report</title>\n", "utf8");
  fs.renameSync(temporaryPath, artifactPath);
  const artifactSummary = "Completed clinical report.";
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  assert.equal(fs.existsSync(manifestPath), false);
  const beforeInvalidReportApply = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: { report_assembly: { current_format: "html" } },
      artifact: scopedArtifact(reserved, artifactSummary),
    },
  }), "INVALID_INPUT");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: {
        report_assembly: { current_format: "html" },
        council_chamber: { report_writer: { current_status: "ready" } },
      },
      artifact: scopedArtifact(reserved, artifactSummary),
    },
  }), "SCOPE_MISMATCH");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: {
        report_assembly: { draft_notes: ["Missing explicit HTML format."] },
        council_chamber: { report_writer: { current_status: "done" } },
      },
      artifact: scopedArtifact(reserved, artifactSummary),
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInvalidReportApply);
  const reportApplied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: {
        report_assembly: {
          current_format: "html",
          draft_notes: ["Published historical report."],
        },
        council_chamber: {
          report_writer: { current_status: "done" },
        },
      },
      artifact: scopedArtifact(reserved, artifactSummary),
    },
  }), "WORKER_APPLIED");
  assert.equal(fs.existsSync(manifestPath), true);
  const published = expectSuccess(finish(projectRoot, reportApplied, {}, { cancel: true }), "OPERATION_CANCELLED");
  const historical = readState(projectRoot);
  assert.equal(historical.artifact_records.length, 1);
  assert.equal(historical.project_summary.report_output, "exist");
  assert.equal(historical.council_chamber.report_writer.summary, artifactSummary);
  assert.deepEqual(historical.council_chamber.report_writer.questions_for_user, []);
  assert.deepEqual(historical.council_chamber.report_writer.feedback_to_route, ["Preserve report feedback."]);

  const newScopeStarted = expectSuccess(begin(projectRoot, published, "report_writer"), "BEGAN_WORKER");
  const newScopeApplied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(newScopeStarted),
      operation_id: newScopeStarted.operation_id,
      actor: "report_writer",
      scope_transition: "new",
      updates: {
          report_assembly: {
            current_format: null,
            report_goal: "Prepare a follow-up report",
            audience: "Policy collaborators",
            target_section: "Updated results",
            claim_boundary: "Do not extend the approved evidence to unstudied policies.",
            planned_structure: ["Updated findings", "Limitations"],
            wording_constraints: ["Preserve the approved causal claim boundary."],
            analysis_artifact_ids: [],
            draft_notes: [],
          },
        council_chamber: {
          report_writer: {
            current_status: "ready",
            summary: "A new report scope is ready without replacing the historical artifact.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const pending = readState(projectRoot);
  assert.equal(pending.project_summary.report_output, "exist");
  assert.equal(pending.artifact_records.length, 1);
  assert.equal(pending.artifact_records[0].artifact_id, historical.artifact_records[0].artifact_id);
  assert.equal(pending.report_assembly.current_format, null);
  assert.equal(pending.council_chamber.report_writer.current_status, "ready");
  assert.notEqual(pending.report_assembly.scope_id, prepared.scope_ref.id);
  assert.deepEqual(pending.state_meta.active_operation.scope_ref, {
    kind: "report",
    id: pending.report_assembly.scope_id,
    revision: pending.report_assembly.scope_revision,
  });
  expectSuccess(finish(projectRoot, newScopeApplied), "OPERATION_FINISHED");
  expectSuccess(execute(projectRoot, "validate"), "VALID");

  const contradictory = readState(projectRoot);
  contradictory.project_summary.report_output = "non_exist";
  writeState(projectRoot, contradictory);
  expectFailure(execute(projectRoot, "validate"), "INVALID_STATE");
});

test("an approved scope may return a new or revised ready handoff without creating output", async (t) => {
  for (const transition of ["new", "revise"]) {
    await t.test(transition, () => {
      const projectRoot = temporaryProject(t);
      const prepared = prepareAnalysisScope(projectRoot);
      const started = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
        scope_ref: prepared.scope_ref,
      }), "BEGAN_WORKER");
      const applied = expectSuccess(execute(projectRoot, "apply", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          actor: `analysis_execution.${prepared.design}`,
          scope_transition: transition,
          updates: {
            council_chamber: {
              analysis_execution: {
                [prepared.design]: analysisSlot("ready", `Material change returned as ${transition} ready scope.`),
              },
            },
          },
        },
      }), "WORKER_APPLIED");
      assert.equal(applied.artifact_record, null);
      const changed = readState(projectRoot);
      const slot = changed.council_chamber.analysis_execution[prepared.design];
      if (transition === "new") {
        assert.notEqual(slot.scope_id, prepared.scope_ref.id);
        assert.equal(slot.scope_revision, 1);
      } else {
        assert.equal(slot.scope_id, prepared.scope_ref.id);
        assert.equal(slot.scope_revision, prepared.scope_ref.revision + 1);
      }
      const changedRef = { kind: "analysis", id: slot.scope_id, revision: slot.scope_revision };
      assert.deepEqual(changed.state_meta.active_operation.scope_ref, changedRef);
      assert.equal(changed.state_meta.active_operation.stage, "lead_pending");
      assert.equal(changed.artifact_records.length, 0);

      const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
      const approvedAgain = expectSuccess(begin(projectRoot, closed, `analysis_execution.${prepared.design}`, {
        scope_ref: changedRef,
      }), "BEGAN_WORKER");
      expectSuccess(finish(projectRoot, approvedAgain, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
});

test("ready scopes remain route-owned and do not become durable exploration summaries", async (t) => {
  const cases = [
    {
      name: "analysis",
      prepare: prepareAnalysisScope,
      route: (prepared) => `analysis_execution.${prepared.design}`,
      apply: (prepared, started) => ({
        ...expected(started),
        operation_id: started.operation_id,
        actor: `analysis_execution.${prepared.design}`,
        scope_transition: "preserve",
        updates: {
          council_chamber: {
            analysis_execution: {
              [prepared.design]: analysisSlot("ready", "Analysis scope remains ready."),
            },
          },
        },
      }),
    },
    {
      name: "report",
      prepare: prepareReportScope,
      route: () => "report_writer",
      apply: (_prepared, started) => ({
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: { draft_notes: ["Report scope remains ready."] },
          council_chamber: {
            report_writer: {
              current_status: "ready",
              summary: "Report scope remains ready.",
              questions_for_user: [],
              feedback_to_route: [],
            },
          },
        },
      }),
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const prepared = scenario.prepare(projectRoot);
      const durableSummary = "Existing durable finding.";
      const lead = expectSuccess(begin(projectRoot, prepared, "team_lead"), "BEGAN_LEAD");
      const summarized = expectSuccess(finish(projectRoot, lead, {
        project_summary: { exploration_summary: durableSummary },
      }), "OPERATION_FINISHED");
      const started = expectSuccess(begin(projectRoot, summarized, scenario.route(prepared)), "BEGAN_WORKER");
      const applied = expectSuccess(execute(projectRoot, "apply", {
        payload: scenario.apply(prepared, started),
      }), "WORKER_APPLIED");
      const before = fs.readFileSync(statePath(projectRoot), "utf8");
      expectFailure(finish(projectRoot, applied, {
        project_summary: { exploration_summary: "Transient approval state must not persist." },
      }), "OWNERSHIP_VIOLATION");
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

      const summaryTimestamp = readState(projectRoot).project_summary.last_updated;
      const closed = expectSuccess(finish(projectRoot, applied, {
        project_summary: { exploration_summary: durableSummary },
      }), "OPERATION_FINISHED");
      const finished = readState(projectRoot);
      assert.equal(finished.project_summary.exploration_summary, durableSummary);
      assert.equal(finished.project_summary.last_updated, summaryTimestamp);
    });
  }

  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  expectSuccess(finish(projectRoot, started, {
    project_summary: { exploration_summary: "Durable reviewed finding." },
  }), "OPERATION_FINISHED");
  assert.equal(readState(projectRoot).project_summary.exploration_summary, "Durable reviewed finding.");
});

test("new scope transitions clear only the replaced scope state", async (t) => {
  await t.test("analysis slot", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareAnalysisScope(projectRoot);
    const seeded = readState(projectRoot);
    const oldSlot = seeded.council_chamber.analysis_execution[prepared.design];
    oldSlot.questions_for_user = ["Old analysis question"];
    oldSlot.feedback_to_route = ["Old analysis feedback"];
    const otherDesign = "difference_in_differences";
    seeded.council_chamber.analysis_execution[otherDesign] = {
      ...rawAnalysisSlot("ready", "Independent design scope."),
      last_updated: null,
      scope_id: crypto.randomUUID(),
      scope_revision: 1,
    };
    const otherBefore = structuredClone(seeded.council_chamber.analysis_execution[otherDesign]);
    writeState(projectRoot, seeded);

    const started = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`), "BEGAN_WORKER");
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: `analysis_execution.${prepared.design}`,
        scope_transition: "new",
        updates: {
          council_chamber: {
            analysis_execution: {
              [prepared.design]: {
                current_status: "ready",
                summary: "Replacement analysis scope.",
                execution_contract: structuredClone(DEFAULT_ANALYSIS_EXECUTION_CONTRACT),
              },
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    const state = readState(projectRoot);
    const replacement = state.council_chamber.analysis_execution[prepared.design];
    assert.notEqual(replacement.scope_id, prepared.scope_ref.id);
    assert.equal(replacement.scope_revision, 1);
    assert.deepEqual(replacement.questions_for_user, []);
    assert.deepEqual(replacement.feedback_to_route, []);
    assert.deepEqual(state.council_chamber.analysis_execution[otherDesign], otherBefore);
    expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  });

  await t.test("report scope and chamber", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareReportScope(projectRoot);
    const seeded = readState(projectRoot);
    seeded.report_assembly.key_points = ["Old report point"];
    seeded.report_assembly.wording_constraints = ["Old wording constraint"];
    seeded.report_assembly.draft_notes = ["Old draft note"];
    seeded.council_chamber.report_writer.questions_for_user = ["Old report question"];
    seeded.council_chamber.report_writer.feedback_to_route = ["Old report feedback"];
    seeded.data_facts.support_notes = ["Unrelated durable fact"];
    writeState(projectRoot, seeded);

    const started = expectSuccess(begin(projectRoot, prepared, "report_writer"), "BEGAN_WORKER");
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "new",
        updates: {
          report_assembly: {
            report_goal: "Replacement report scope",
            audience: "Replacement report readers",
            claim_boundary: "Do not exceed the replacement scope evidence.",
            planned_structure: ["Replacement findings", "Replacement limitations"],
            wording_constraints: ["Preserve the replacement scope's causal claim boundary."],
            analysis_artifact_ids: [],
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
              summary: "Replacement report scope is ready.",
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    const state = readState(projectRoot);
    assert.notEqual(state.report_assembly.scope_id, prepared.scope_ref.id);
    assert.equal(state.report_assembly.scope_revision, 1);
    assert.equal(state.report_assembly.audience, "Replacement report readers");
    assert.deepEqual(
      state.report_assembly.planned_structure,
      ["Replacement findings", "Replacement limitations"],
    );
    assert.deepEqual(state.report_assembly.key_points, []);
    assert.deepEqual(
      state.report_assembly.wording_constraints,
      ["Preserve the replacement scope's causal claim boundary."],
    );
    assert.deepEqual(state.report_assembly.draft_notes, []);
    assert.deepEqual(state.council_chamber.report_writer.questions_for_user, []);
    assert.deepEqual(state.council_chamber.report_writer.feedback_to_route, []);
    assert.deepEqual(state.data_facts.support_notes, ["Unrelated durable fact"]);
    expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  });
});

test("ready analysis and report scopes cannot reserve output without an exact scope binding", async (t) => {
  const cases = [
    {
      name: "analysis",
      prepare: (projectRoot) => prepareAnalysisScope(projectRoot),
      route: (prepared) => `analysis_execution.${prepared.design}`,
      extension: "csv",
    },
    {
      name: "report",
      prepare: (projectRoot) => prepareReportScope(projectRoot),
      route: () => "report_writer",
      extension: "html",
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const prepared = scenario.prepare(projectRoot);
      const started = expectSuccess(begin(projectRoot, prepared, scenario.route(prepared)), "BEGAN_WORKER");
      const before = fs.readFileSync(statePath(projectRoot), "utf8");
      expectFailure(execute(projectRoot, "reserve-artifact", {
        payload: {
          ...expected(started),
          operation_id: started.operation_id,
          kind: "file",
          slug: `unbound-${scenario.name}`,
          extension: scenario.extension,
        },
      }), "SCOPE_MISMATCH");
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
});

test("an exact analysis scope binds its support route and can block for rerouting", (t) => {
  const projectRoot = temporaryProject(t);
  const support = "statistical-validity";
  const prepared = prepareAnalysisScope(projectRoot, "single_time_observational", support);
  const idleBytes = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
    scope_ref: prepared.scope_ref,
    support: "heterogeneous-effects",
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), idleBytes);

  const started = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${prepared.design}`, {
    scope_ref: prepared.scope_ref,
    support,
  }), "BEGAN_WORKER");
  const workerBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: analysisSlot(
              "ready",
              "This handoff supplies the wrong support route.",
              "heterogeneous-effects",
            ),
          },
        },
      },
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), workerBytes);

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: {
              current_status: "blocked",
              summary: "A different support route requires later rerouting.",
              questions_for_user: [],
              feedback_to_route: [],
            },
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const state = readState(projectRoot);
  assert.equal(state.council_chamber.analysis_execution[prepared.design].support, support);
  assert.equal(state.next_step_plan[0].support, support);
  assert.deepEqual(state.state_meta.active_operation.scope_ref, prepared.scope_ref);
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("changing analysis support requires a new or revised scope identity", (t) => {
  const projectRoot = temporaryProject(t);
  const design = "single_time_observational";
  const prepared = prepareAnalysisScope(projectRoot, design, "statistical-validity");
  seedAnalysisEligibility(projectRoot, { design, support: "heterogeneous-effects" });
  const rerouted = readState(projectRoot);
  rerouted.response_receipt = null;
  writeState(projectRoot, rerouted);
  const started = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${design}`, {
    support: "heterogeneous-effects",
  }), "BEGAN_WORKER");
  const updates = {
    council_chamber: {
      analysis_execution: {
        [design]: {
          current_status: "ready",
          summary: "The selected support route changed.",
          execution_contract: structuredClone(DEFAULT_ANALYSIS_EXECUTION_CONTRACT),
          questions_for_user: [],
          feedback_to_route: [],
        },
      },
    },
  };
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: `analysis_execution.${design}`,
      scope_transition: "preserve",
      updates,
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: `analysis_execution.${design}`,
      scope_transition: "revise",
      updates,
    },
  }), "WORKER_APPLIED");
  const slot = readState(projectRoot).council_chamber.analysis_execution[design];
  assert.equal(slot.scope_id, prepared.scope_ref.id);
  assert.equal(slot.scope_revision, prepared.scope_ref.revision + 1);
  assert.equal(slot.support, "heterogeneous-effects");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("a same-design model alternative revises the analysis scope without rerunning causal selection", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = `analysis_execution.${prepared.design}`;
  const causalBefore = structuredClone(readState(projectRoot).causal_facts);
  const revisedContract = {
    ...structuredClone(DEFAULT_ANALYSIS_EXECUTION_CONTRACT),
    method_plan: "Fit the approved design with a doubly robust estimator and robust uncertainty.",
    execution_requirements: [
      ...DEFAULT_ANALYSIS_EXECUTION_CONTRACT.execution_requirements,
      "Compare the revised estimator with the original formulation.",
    ],
  };

  const started = expectSuccess(begin(projectRoot, prepared, actor, {
    support: prepared.support,
  }), "BEGAN_WORKER");
  assert.equal(readState(projectRoot).state_meta.active_operation.scope_ref, null);
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor,
      scope_transition: "revise",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: analysisSlot(
              "ready",
              "A materially different model formulation is ready for direct approval.",
              prepared.support,
              revisedContract,
            ),
          },
        },
      },
    },
  }), "WORKER_APPLIED");

  const state = readState(projectRoot);
  const slot = state.council_chamber.analysis_execution[prepared.design];
  assert.deepEqual(state.causal_facts, causalBefore);
  assert.equal(slot.scope_id, prepared.scope_ref.id);
  assert.equal(slot.scope_revision, prepared.scope_ref.revision + 1);
  assert.equal(slot.execution_contract.method_plan, revisedContract.method_plan);
  assert.equal(
    expectSuccess(execute(projectRoot, "validate"), "VALID")
      .scope_snapshot.analysis[prepared.design].basis_current,
    true,
  );

  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  const revisedRef = {
    kind: "analysis",
    id: prepared.scope_ref.id,
    revision: prepared.scope_ref.revision + 1,
  };
  assert.deepEqual(closed.direct_assignment.scope_ref, revisedRef);
  const approved = expectSuccess(begin(projectRoot, closed, actor, {
    support: prepared.support,
    scope_ref: revisedRef,
  }), "BEGAN_WORKER");
  expectSuccess(finish(projectRoot, approved, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("causal target changes require a rebuilt strategy portfolio and invalidate the old exact analysis scope", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = `analysis_execution.${prepared.design}`;
  const oldState = readState(projectRoot);
  const oldBasis = oldState.council_chamber.analysis_execution[prepared.design].causal_basis_hash;
  const priorFacts = oldState.causal_facts;
  const started = expectSuccess(begin(projectRoot, prepared, "causal_check"), "BEGAN_WORKER");
  const stalePortfolio = {
    causal_question: "What is the treatment effect in the revised target population?",
    estimand: "Average treatment effect in the revised target population",
    analysis_readiness: priorFacts.analysis_readiness,
    support_status: priorFacts.support_status,
    recommended_checks: structuredClone(priorFacts.recommended_checks),
    recommended_method_routes: structuredClone(priorFacts.recommended_method_routes),
    analysis_options: structuredClone(priorFacts.analysis_options),
  };
  const before = fs.readFileSync(statePath(projectRoot));

  const staleFailure = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates: causalCheckUpdates(stalePortfolio),
    },
  }), "INVALID_INPUT");
  assert.match(staleFailure.message, /rebuilt or cleared strategy portfolio/);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const rebuiltPortfolio = {
    ...stalePortfolio,
    recommended_checks: ["Recheck support in the revised target population."],
    analysis_options: [analysisOption("preferred", prepared.design, prepared.support, {
      target: "Estimate the effect in the revised target population.",
      approach: "Rebuild the approved design for the revised target population.",
    })],
  };
  const reassessed = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "causal_check",
      updates: causalCheckUpdates(rebuiltPortfolio),
    },
  }), "WORKER_APPLIED");
  const closed = expectSuccess(finish(projectRoot, reassessed), "OPERATION_FINISHED");
  const staleSnapshot = expectSuccess(execute(projectRoot, "validate"), "VALID");
  assert.equal(staleSnapshot.scope_snapshot.analysis[prepared.design].basis_current, false);

  const beforeExact = fs.readFileSync(statePath(projectRoot));
  const exactFailure = expectFailure(begin(projectRoot, closed, actor, {
    support: prepared.support,
    scope_ref: prepared.scope_ref,
  }), "SCOPE_MISMATCH");
  assert.match(exactFailure.message, /older causal basis/);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), beforeExact);

  const revising = expectSuccess(begin(projectRoot, closed, actor, {
    support: prepared.support,
  }), "BEGAN_WORKER");
  const revised = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(revising),
      operation_id: revising.operation_id,
      actor,
      scope_transition: "revise",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: analysisSlot(
              "ready",
              "The analysis scope now reflects the revised causal target.",
              prepared.support,
            ),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const refreshed = readState(projectRoot).council_chamber.analysis_execution[prepared.design];
  assert.equal(refreshed.scope_id, prepared.scope_ref.id);
  assert.equal(refreshed.scope_revision, prepared.scope_ref.revision + 1);
  assert.match(refreshed.causal_basis_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(refreshed.causal_basis_hash, oldBasis);
  assert.equal(
    expectSuccess(execute(projectRoot, "validate"), "VALID")
      .scope_snapshot.analysis[prepared.design].basis_current,
    true,
  );
  expectSuccess(finish(projectRoot, revised), "OPERATION_FINISHED");
});

test("causal basis hashing is stable under reordered set-like arrays and object keys", (t) => {
  const projectRoot = temporaryProject(t);
  const design = "single_time_observational";
  const support = "statistical-validity";
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  seedAnalysisEligibility(projectRoot, { design, support });
  const seeded = readState(projectRoot);
  seeded.causal_facts.assumptions = ["Exchangeability", "Consistency"];
  seeded.causal_facts.threats = ["Limited overlap", "Unmeasured confounding"];
  seeded.causal_facts.recommended_checks = ["Inspect overlap", "Assess balance"];
  seeded.causal_facts.recommended_method_routes = [
    {
      category: "support",
      id: support,
      route_cautions: ["Use robust uncertainty", "Inspect influential observations"],
    },
    {
      category: "design",
      id: design,
      route_cautions: ["Respect treatment timing", "Do not adjust for descendants"],
    },
  ];
  writeState(projectRoot, seeded);

  const started = expectSuccess(begin(projectRoot, opened, `analysis_execution.${design}`, {
    support,
  }), "BEGAN_WORKER");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: `analysis_execution.${design}`,
      scope_transition: "new",
      updates: {
        council_chamber: {
          analysis_execution: {
            [design]: analysisSlot("ready", "Canonical causal-basis scope.", support),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const scoped = readState(projectRoot).council_chamber.analysis_execution[design];
  const scopeRef = { kind: "analysis", id: scoped.scope_id, revision: scoped.scope_revision };
  const basis = scoped.causal_basis_hash;
  const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");

  const reordered = readState(projectRoot);
  reordered.causal_facts.assumptions.reverse();
  reordered.causal_facts.threats.reverse();
  reordered.causal_facts.recommended_checks.reverse();
  reordered.causal_facts.recommended_method_routes = reordered.causal_facts.recommended_method_routes
    .reverse()
    .map((route) => ({
      route_cautions: [...route.route_cautions].reverse(),
      category: route.category,
      id: route.id,
    }));
  writeState(projectRoot, reordered);

  const validated = expectSuccess(execute(projectRoot, "validate"), "VALID");
  assert.equal(validated.scope_snapshot.analysis[design].basis_current, true);
  assert.equal(readState(projectRoot).council_chamber.analysis_execution[design].causal_basis_hash, basis);
  const exact = expectSuccess(begin(projectRoot, closed, `analysis_execution.${design}`, {
    support,
    scope_ref: scopeRef,
  }), "BEGAN_WORKER");
  expectSuccess(finish(projectRoot, exact, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("active exact analysis operations fail closed when their causal basis changes out of band", async (t) => {
  for (const stage of ["worker_pending", "lead_pending"]) {
    await t.test(stage, (subtest) => {
      const projectRoot = temporaryProject(subtest);
      const prepared = prepareAnalysisScope(projectRoot);
      const actor = `analysis_execution.${prepared.design}`;
      const started = expectSuccess(begin(projectRoot, prepared, actor, {
        support: prepared.support,
        scope_ref: prepared.scope_ref,
      }), "BEGAN_WORKER");
      if (stage === "lead_pending") {
        expectSuccess(execute(projectRoot, "apply", {
          payload: {
            ...expected(started),
            operation_id: started.operation_id,
            actor,
            scope_transition: "preserve",
            updates: {
              council_chamber: {
                analysis_execution: {
                  [prepared.design]: analysisSlot(
                    "ready",
                    "The exact analysis remains ready for approval.",
                    prepared.support,
                  ),
                },
              },
            },
          },
        }), "WORKER_APPLIED");
      }

      const changed = readState(projectRoot);
      assert.equal(changed.state_meta.active_operation.stage, stage);
      changed.causal_facts.threats.push("Out-of-band causal-basis change.");
      writeState(projectRoot, changed);
      const invalidBytes = fs.readFileSync(statePath(projectRoot));

      expectFailure(execute(projectRoot, "validate"), "SCOPE_MISMATCH");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), invalidBytes);
      expectFailure(execute(projectRoot, "open"), "SCOPE_MISMATCH");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), invalidBytes);
    });
  }
});

test("--discard-legacy-plan is rejected when no legacy v4.5 state exists", async (t) => {
  await t.test("missing state", () => {
    const projectRoot = temporaryProject(t);
    const failure = expectFailure(execute(projectRoot, "open", {
      args: ["--discard-legacy-plan"],
    }), "INVALID_INPUT");
    assert.match(failure.message, /requires an existing recognized v4\.5 state/);
    assert.equal(fs.existsSync(statePath(projectRoot)), false);
  });

  await t.test("current v9 state", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const before = fs.readFileSync(statePath(projectRoot), "utf8");
    const failure = expectFailure(execute(projectRoot, "open", {
      args: ["--discard-legacy-plan"],
    }), "INVALID_INPUT");
    assert.match(failure.message, /applies only to a recognized unversioned v4\.5 state/);
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  });
});

test("finish renders the existing response shell and persists numbered choices atomically", async (t) => {
  await t.test("response without options", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const closed = expectSuccess(finish(projectRoot, started), "OPERATION_FINISHED");

    assert.equal(closed.revision, 2);
    assert.equal(closed.next_action, "emit_response_markdown_verbatim_and_stop");
    assert.equal(closed.pending_decision, null);
    assert.equal(
      closed.response_markdown,
      [
        "[Causal-Consultant Loaded] This is a new project. Causal analysis team ready.",
        "",
        "[> Framing]",
        "The current operation is complete.",
        "",
        "[! Boundary]",
        "No additional boundary changed.",
        "",
        "[? Next Steps]",
        "Continue with the next requested step.",
      ].join("\n"),
    );
    const state = readState(projectRoot);
    assert.equal(state.pending_decision, null);
    assert.equal(state.response_receipt.operation_id, started.operation_id);
    assert.equal(state.response_receipt.revision, closed.revision);
    assert.equal(state.response_receipt.response_markdown, closed.response_markdown);
    expectSuccess(execute(projectRoot, "open"), "OPENED");
    const recovered = readState(projectRoot).response_receipt;
    assert.equal(
      recovered.response_markdown,
      closed.response_markdown,
    );
  });

  await t.test("response with options", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const presentation = optionsPresentation([
      decisionOption("Audit the data", "data_audit"),
      decisionOption("Review the domain", "domain_expert"),
    ]);
    const closed = expectSuccess(finish(projectRoot, started, {}, { presentation }), "OPERATION_FINISHED");

    assert.equal(closed.revision, 2);
    assert.equal(
      closed.response_markdown,
      [
        "[OK Confirmed] The current operation is complete.",
        "",
        "[Causal-Consultant Loaded] This is a new project. Causal analysis team ready.",
        "",
        "[> Framing]",
        "There are multiple useful ways to continue.",
        "",
        "[+ Consultant Options]",
        "    1. Audit the data",
        "       Consultant read: Audit the data is currently supportable.",
        "       Tradeoff: Audit the data uses this operation.",
        "    2. Review the domain",
        "       Consultant read: Review the domain is currently supportable.",
        "       Tradeoff: Review the domain uses this operation.",
        "",
        "[! Boundary]",
        "Each choice starts one operation and preserves the current evidence boundary.",
        "",
        "[? Next Steps]",
        "Choose one option, or suggest another action.",
      ].join("\n"),
    );

    const pending = closed.pending_decision;
    assert.match(pending.decision_id, /^[0-9a-f-]{36}$/);
    assert.equal(pending.source_operation_id, started.operation_id);
    assert.match(pending.created_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(pending.options.map((option) => option.number), [1, 2]);
    assert.deepEqual(
      pending.options.map((option) => Object.keys(option)),
      [["number", "assignment"], ["number", "assignment"]],
    );
    assert.deepEqual(pending.options[0].assignment, {
      route: "data_audit",
      support: null,
      intent_summary: "Exercise audit the data",
      scope_ref: null,
    });

    const committedBytes = fs.readFileSync(statePath(projectRoot), "utf8");
    const committed = readState(projectRoot);
    assert.deepEqual(committed.pending_decision, pending);
    assert.equal(committed.response_receipt.operation_id, started.operation_id);
    assert.equal(committed.response_receipt.revision, closed.revision);
    assert.equal(committed.response_receipt.response_markdown, closed.response_markdown);
    const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
    assert.equal(reopened.mode, "idle");
    assert.equal(Object.hasOwn(reopened, "pending_decision"), false);
    assert.equal(Object.hasOwn(reopened, "response_receipt"), false);
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), committedBytes);
    const validated = expectSuccess(execute(projectRoot, "validate"), "VALID");
    assert.deepEqual(validated.pending_decision, pending);
    assert.deepEqual(validated.response_receipt, committed.response_receipt);
  });

  await t.test("subsequent response omits the fresh-project welcome", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const first = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const initialized = expectSuccess(finish(projectRoot, first), "OPERATION_FINISHED");
    assert.equal(
      initialized.response_markdown.match(/\[Causal-Consultant Loaded\]/g)?.length,
      1,
    );
    const initializedState = readState(projectRoot);
    assert.equal(initializedState.project_summary.title, null);
    assert.equal(initializedState.state_meta.startup_notice, null);
    const second = expectSuccess(begin(projectRoot, initialized, "team_lead"), "BEGAN_LEAD");
    const presentation = {
      ...DEFAULT_PRESENTATION,
      confirmation: "The follow-up is complete.",
    };
    const closed = expectSuccess(
      finish(projectRoot, second, {}, { presentation }),
      "OPERATION_FINISHED",
    );

    assert.equal(
      closed.response_markdown,
      [
        "[OK Confirmed] The follow-up is complete.",
        "",
        "[> Framing]",
        "The current operation is complete.",
        "",
        "[! Boundary]",
        "No additional boundary changed.",
        "",
        "[? Next Steps]",
        "Continue with the next requested step.",
      ].join("\n"),
    );
    assert.equal(closed.response_markdown.match(/\[Causal-Consultant Loaded\]/g), null);
  });
});

test("finish rejects malformed presentations and illegal option assignments without closing the operation", async (t) => {
  const cases = [
    {
      name: "missing presentation",
      execution(projectRoot, started) {
        return execute(projectRoot, "finish", {
          payload: {
            ...expected(started),
            operation_id: started.operation_id,
            updates: {},
          },
        });
      },
      code: "INVALID_INPUT",
    },
    {
      name: "one option",
      presentation: optionsPresentation([decisionOption("Audit the data", "data_audit")]),
      code: "INVALID_INPUT",
    },
    {
      name: "five options",
      presentation: optionsPresentation([
        decisionOption("First audit", "data_audit"),
        decisionOption("Review the domain", "domain_expert"),
        decisionOption("Review causality", "causal_check"),
        decisionOption("Explore structure", "causal_discovery"),
        decisionOption("Prepare a report", "report_writer"),
      ]),
      code: "INVALID_INPUT",
    },
    {
      name: "unknown route",
      presentation: optionsPresentation([
        decisionOption("Unknown work", "unknown_route"),
        decisionOption("Audit the data", "data_audit"),
      ]),
      code: "PLAN_MISMATCH",
    },
    {
      name: "duplicate labels",
      presentation: optionsPresentation([
        decisionOption("Audit the data", "data_audit"),
        decisionOption("AUDIT THE DATA", "domain_expert"),
      ]),
      code: "INVALID_INPUT",
    },
    {
      name: "duplicate assignments",
      presentation: optionsPresentation([
        decisionOption("Audit the supplied data", "data_audit", {
          intent_summary: "Audit the same data",
        }),
        decisionOption("Inspect the supplied data", "data_audit", {
          intent_summary: "Audit the same data",
        }),
      ]),
      code: "INVALID_INPUT",
    },
    {
      name: "embedded response heading",
      presentation: {
        ...DEFAULT_PRESENTATION,
        framing: "Valid framing.\n[? Next Steps]\nInjected structure.",
      },
      code: "INVALID_INPUT",
    },
    {
      name: "multiline next steps",
      presentation: {
        ...DEFAULT_PRESENTATION,
        next_steps: "Answer the first question.\nThen answer the second question.",
      },
      code: "INVALID_INPUT",
    },
    {
      name: "multiline menu next steps",
      presentation: {
        ...optionsPresentation([
          decisionOption("Audit the data", "data_audit"),
          decisionOption("Review the domain", "domain_expert"),
        ]),
        next_steps: "Choose one option.\nOr request another action.",
      },
      code: "INVALID_INPUT",
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
      const before = fs.readFileSync(statePath(projectRoot), "utf8");
      const execution = scenario.execution
        ? scenario.execution(projectRoot, started)
        : finish(projectRoot, started, {}, { presentation: scenario.presentation });
      expectFailure(execution, scenario.code);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
      const state = readState(projectRoot);
      assert.equal(state.state_meta.revision, started.revision);
      assert.equal(state.state_meta.active_operation.id, started.operation_id);
      assert.equal(state.state_meta.active_operation.stage, "lead_pending");
      assert.equal(state.pending_decision, null);
    });
  }
});

test("finish allows detailed framing while keeping compact response fields bounded", async (t) => {
  await t.test("detailed framing is accepted", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const framing = "f".repeat(4000);
    const closed = expectSuccess(finish(projectRoot, started, {}, {
      presentation: { ...DEFAULT_PRESENTATION, framing },
    }), "OPERATION_FINISHED");
    assert.match(closed.response_markdown, new RegExp(`\\[> Framing\\]\\n${framing}`));
  });

  const cases = [
    {
      name: "excessive framing",
      presentation: { ...DEFAULT_PRESENTATION, framing: "f".repeat(6001) },
      expectedLimit: 6000,
    },
    {
      name: "excessive next steps",
      presentation: { ...DEFAULT_PRESENTATION, next_steps: "n".repeat(1001) },
      expectedLimit: 1000,
    },
    {
      name: "excessive option text",
      presentation: optionsPresentation([
        { ...decisionOption("Audit the data", "data_audit"), consultant_read: "a".repeat(1001) },
        decisionOption("Review the domain", "domain_expert"),
      ]),
      expectedLimit: 1000,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
      const before = fs.readFileSync(statePath(projectRoot));
      const failure = expectFailure(
        finish(projectRoot, started, {}, { presentation: scenario.presentation }),
        "INVALID_INPUT",
      );
      assert.match(failure.message, new RegExp(`at most ${scenario.expectedLimit} characters`));
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    });
  }
});

test("ready analysis and report handoffs require direct approval without options", async (t) => {
  function readyAnalysis(projectRoot) {
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    seedAnalysisEligibility(projectRoot);
    const started = expectSuccess(
      begin(projectRoot, opened, "analysis_execution.single_time_observational"),
      "BEGAN_WORKER",
    );
    return expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "analysis_execution.single_time_observational",
        scope_transition: "new",
        updates: {
          council_chamber: {
            analysis_execution: {
              single_time_observational: analysisSlot("ready", "Analysis scope is ready."),
            },
          },
        },
      },
    }), "WORKER_APPLIED");
  }

  function readyReport(projectRoot) {
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "report_writer"), "BEGAN_WORKER");
    return expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "new",
        updates: {
          report_assembly: {
            report_goal: "Report the completed evidence",
            audience: "Decision makers",
            target_section: "Results",
            claim_boundary: "Do not exceed the completed analysis evidence.",
            planned_structure: ["Findings", "Limitations"],
            wording_constraints: ["Preserve the approved causal claim boundary."],
            analysis_artifact_ids: [],
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
              summary: "Report scope is ready.",
              questions_for_user: [],
              feedback_to_route: [],
            },
          },
        },
      },
    }), "WORKER_APPLIED");
  }

  const menu = optionsPresentation([
    decisionOption("Audit the data", "data_audit"),
    decisionOption("Review the domain", "domain_expert"),
  ]);
  for (const [name, prepare] of [["analysis", readyAnalysis], ["report", readyReport]]) {
    await t.test(name, () => {
      const projectRoot = temporaryProject(t);
      const applied = prepare(projectRoot);
      const before = fs.readFileSync(statePath(projectRoot), "utf8");
      const failure = expectFailure(
        finish(projectRoot, applied, {}, { presentation: menu }),
        "INVALID_INPUT",
      );
      assert.match(failure.message, /direct approval/);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
      const pending = readState(projectRoot);
      assert.equal(pending.state_meta.revision, applied.revision);
      assert.equal(pending.state_meta.active_operation.stage, "lead_pending");

      const presentation = {
        ...DEFAULT_PRESENTATION,
        next_steps: `Do you approve executing this exact ready ${name} scope?`,
        direct_assignment: readyDirectAssignment(projectRoot),
      };
      const closed = expectSuccess(
        finish(projectRoot, applied, {}, { presentation }),
        "OPERATION_FINISHED",
      );
      assert.equal(closed.pending_decision, null);
      assert.deepEqual(closed.direct_assignment, presentation.direct_assignment);
      assert.equal(closed.response_markdown.includes("[+ Consultant Options]"), false);

      const approved = expectSuccess(execute(projectRoot, "begin", {
        payload: {
          ...expected(closed),
          ...closed.direct_assignment,
        },
      }), "BEGAN_WORKER");
      assert.deepEqual(
        readState(projectRoot).state_meta.active_operation.scope_ref,
        presentation.direct_assignment.scope_ref,
      );
      expectSuccess(finish(projectRoot, approved, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }

  await t.test("explicit cancellation remains exempt", () => {
    const projectRoot = temporaryProject(t);
    const applied = readyAnalysis(projectRoot);
    const cancelled = expectSuccess(
      finish(projectRoot, applied, {}, { cancel: true, presentation: menu }),
      "OPERATION_CANCELLED",
    );
    assert.ok(cancelled.pending_decision);
  });
});

test("numbered selection derives one stored assignment and normal begin supersedes the menu", async (t) => {
  await t.test("selection and worker closeout keep the normal revision budget", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const lead = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const menu = expectSuccess(finish(projectRoot, lead, {}, {
      presentation: optionsPresentation([
        decisionOption("Audit the data", "data_audit"),
        decisionOption("Review the domain", "domain_expert"),
      ]),
    }), "OPERATION_FINISHED");
    const decisionId = menu.pending_decision.decision_id;
    const beforeFailures = fs.readFileSync(statePath(projectRoot), "utf8");

    expectFailure(beginSelection(projectRoot, menu, crypto.randomUUID(), 2), "STALE_DECISION");
    expectFailure(beginSelection(projectRoot, menu, decisionId, 9), "INVALID_DECISION_OPTION");
    expectFailure(beginSelection(projectRoot, menu, decisionId, 2, {
      route: "data_audit",
      intent_summary: "Caller override must be rejected",
    }), "INVALID_INPUT");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeFailures);

    const selected = expectSuccess(
      beginSelection(projectRoot, menu, decisionId, 2),
      "BEGAN_WORKER",
    );
    assert.equal(selected.revision, menu.revision + 1);
    assert.deepEqual(selected.plan, [{ id: "domain_expert" }, { id: "team_lead" }]);
    let state = readState(projectRoot);
    assert.equal(state.pending_decision, null);
    assert.equal(state.response_receipt, null);
    assert.equal(state.state_meta.active_operation.intent_summary, "Exercise review the domain");

    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(selected),
        operation_id: selected.operation_id,
        actor: "domain_expert",
        updates: {
          domain_knowledge: {
            domain_checked: "limited",
            domain_scope: "Selection revision test",
          },
          council_chamber: {
            domain_expert: {
              current_status: "limited",
              summary: "The selected domain review completed.",
              questions_for_user: [],
              feedback_to_route: [],
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    const closed = expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    assert.equal(closed.revision, menu.revision + 3);
    state = readState(projectRoot);
    assert.equal(state.pending_decision, null);
    assert.equal(state.domain_knowledge.domain_checked, "limited");
  });

  await t.test("ordinary begin supersedes the menu only after a successful commit", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const lead = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const menu = expectSuccess(finish(projectRoot, lead, {}, {
      presentation: optionsPresentation([
        decisionOption("Audit the data", "data_audit"),
        decisionOption("Review the domain", "domain_expert"),
      ]),
    }), "OPERATION_FINISHED");
    const before = fs.readFileSync(statePath(projectRoot), "utf8");

    expectFailure(begin(projectRoot, menu, "unknown_route"), "PLAN_MISMATCH");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
    assert.notEqual(readState(projectRoot).pending_decision, null);

    const started = expectSuccess(begin(projectRoot, menu, "data_audit"), "BEGAN_WORKER");
    assert.equal(started.revision, menu.revision + 1);
    assert.equal(readState(projectRoot).pending_decision, null);
    assert.equal(readState(projectRoot).response_receipt, null);
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");

    const idle = expectSuccess(execute(projectRoot, "open"), "OPENED");
    expectFailure(beginSelection(projectRoot, idle, menu.pending_decision.decision_id, 1), "NO_PENDING_DECISION");
  });
});

test("exact analysis and report execution cannot be stored as numbered choices", async (t) => {
  const scenarios = [
    {
      name: "analysis",
      prepare: prepareAnalysisScope,
      route(prepared) { return `analysis_execution.${prepared.design}`; },
      extras(prepared) { return { support: prepared.support }; },
    },
    {
      name: "report",
      prepare: prepareReportScope,
      route() { return "report_writer"; },
      extras() { return {}; },
    },
  ];
  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const prepared = scenario.prepare(projectRoot);
      const lead = expectSuccess(begin(projectRoot, prepared, "team_lead"), "BEGAN_LEAD");
      const before = fs.readFileSync(statePath(projectRoot));
      const failure = expectFailure(finish(projectRoot, lead, {}, {
        presentation: optionsPresentation([
          decisionOption("Run the exact prepared scope", scenario.route(prepared), {
            ...scenario.extras(prepared),
            scope_ref: prepared.scope_ref,
          }),
          decisionOption("Audit the data again", "data_audit"),
        ]),
      }), "INVALID_INPUT");
      assert.match(failure.message, /requires direct approval/);
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    });
  }
});

test("malformed discovery migration containers fail without mutation or archive", async (t) => {
  const scenarios = [
    {
      name: "schema-2 null discovery sidecar",
      prepare(projectRoot) {
        const state = downgradeCurrentStateToV2(projectRoot);
        state.discovery_sidecar = null;
        writeState(projectRoot, state);
      },
    },
    {
      name: "schema-3 missing active operation",
      prepare(projectRoot) {
        const state = downgradeCurrentStateToV3(projectRoot);
        delete state.state_meta.active_operation;
        writeState(projectRoot, state);
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      expectSuccess(execute(projectRoot, "open"), "CREATED");
      scenario.prepare(projectRoot);
      const original = fs.readFileSync(statePath(projectRoot));
      const archiveDirectory = path.join(projectRoot, "project_state.archives");

      expectFailure(execute(projectRoot, "open"), "INVALID_STATE");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), original);
      assert.equal(fs.existsSync(archiveDirectory), false);
    });
  }
});


test("report evidence and material contract changes require scope revision", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const firstId = pushAnalysisCompletionRecord(projectRoot, {
    artifactId: "legacy-0001",
    available: true,
  });
  const secondId = pushAnalysisCompletionRecord(projectRoot, {
    artifactId: "legacy-0002",
    available: true,
  });
  const prepared = prepareReportScope(projectRoot, {
    opened,
    analysisArtifactIds: [firstId],
  });
  const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot));

  for (const reportPatch of [
    { analysis_artifact_ids: [secondId] },
    { report_goal: "A materially different report goal" },
  ]) {
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: reportPatch,
          council_chamber: {
            report_writer: {
              current_status: "ready",
            },
          },
        },
      },
    }), "SCOPE_MISMATCH");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  }

  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "report_writer",
      scope_transition: "revise",
      updates: {
        report_assembly: {
          report_goal: "A revised report with an unstated evidence basis",
        },
        council_chamber: {
          report_writer: {
            current_status: "ready",
          },
        },
      },
    },
  }), "INVALID_INPUT");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const revised = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "report_writer",
      scope_transition: "revise",
      updates: {
        report_assembly: {
          report_goal: "A materially different report goal",
          analysis_artifact_ids: [secondId],
        },
        council_chamber: {
          report_writer: {
            current_status: "ready",
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const report = readState(projectRoot).report_assembly;
  assert.equal(report.scope_id, prepared.scope_ref.id);
  assert.equal(report.scope_revision, prepared.scope_ref.revision + 1);
  assert.deepEqual(report.analysis_artifact_ids, [secondId]);
  expectSuccess(finish(projectRoot, revised), "OPERATION_FINISHED");
});

test("schema-6 migration preserves unresolved legacy report provenance", async (t) => {
  await t.test("legacy planning scope plus unrelated analysis history", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const prepared = prepareReportScope(projectRoot, {
      opened,
      analysisArtifactIds: [],
    });
    pushAnalysisCompletionRecord(projectRoot, { available: true });
    const v6 = downgradeCurrentStateToV6(projectRoot);
    const original = fs.readFileSync(statePath(projectRoot));

    const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    assert.deepEqual(fs.readFileSync(migrated.archive_path), original);
    assert.equal(migrated.revision, v6.state_meta.revision + 1);
    assert.equal(readState(projectRoot).report_assembly.analysis_artifact_ids, null);
    const beforeBegin = fs.readFileSync(statePath(projectRoot));
    const failure = expectFailure(begin(projectRoot, migrated, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "SCOPE_MISMATCH");
    assert.equal(failure.details.report_evidence_binding, "unresolved");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), beforeBegin);
  });

  await t.test("multiple available and unavailable analyses are not auto-bound", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    prepareReportScope(projectRoot, { opened, analysisArtifactIds: [] });
    pushAnalysisCompletionRecord(projectRoot, {
      artifactId: "legacy-0001",
      available: true,
    });
    pushAnalysisCompletionRecord(projectRoot, {
      artifactId: "legacy-0002",
      available: false,
    });
    downgradeCurrentStateToV6(projectRoot);
    expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    assert.equal(readState(projectRoot).report_assembly.analysis_artifact_ids, null);
  });

  await t.test("scoped report with no analysis history keeps an empty binding but loses stale approval", () => {
    const projectRoot = temporaryProject(t);
    prepareReportScope(projectRoot);
    downgradeCurrentStateToV6(projectRoot);
    expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    assert.deepEqual(readState(projectRoot).report_assembly.analysis_artifact_ids, []);
    assert.equal(readState(projectRoot).report_assembly.claim_boundary, null);
    assert.equal(readState(projectRoot).response_receipt.direct_assignment, null);
  });

  await t.test("unbound report state stays empty despite analysis history", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    pushAnalysisCompletionRecord(projectRoot, { available: true });
    downgradeCurrentStateToV6(projectRoot);
    expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    assert.equal(readState(projectRoot).report_assembly.scope_id, null);
    assert.deepEqual(readState(projectRoot).report_assembly.analysis_artifact_ids, []);
  });
});

test("schema-6 unresolved migration clears stale report approval cues", async (t) => {
  await t.test("direct assignment", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareReportScope(projectRoot);
    const beforeMigration = readState(projectRoot);
    const responseMarkdown = beforeMigration.response_receipt.response_markdown;
    assert.deepEqual(beforeMigration.response_receipt.direct_assignment.scope_ref, prepared.scope_ref);
    pushAnalysisCompletionRecord(projectRoot, { available: true });
    downgradeCurrentStateToV6(projectRoot);

    expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    const migrated = readState(projectRoot);
    assert.equal(migrated.report_assembly.analysis_artifact_ids, null);
    assert.equal(migrated.response_receipt.direct_assignment, null);
    assert.equal(migrated.response_receipt.response_markdown, responseMarkdown);
  });

  await t.test("numbered decision", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareReportScope(projectRoot);
    const state = readState(projectRoot);
    const responseMarkdown = state.response_receipt.response_markdown;
    state.response_receipt.direct_assignment = null;
    state.pending_decision = {
      decision_id: crypto.randomUUID(),
      source_operation_id: state.response_receipt.operation_id,
      created_at: state.response_receipt.created_at,
      options: [
        {
          number: 1,
          assignment: {
            route: "report_writer",
            support: null,
            intent_summary: "Approve the legacy report scope.",
            scope_ref: prepared.scope_ref,
          },
        },
        {
          number: 2,
          assignment: {
            route: "data_audit",
            support: null,
            intent_summary: "Review the source data first.",
            scope_ref: null,
          },
        },
      ],
    };
    writeState(projectRoot, state);
    pushAnalysisCompletionRecord(projectRoot, { available: true });
    downgradeCurrentStateToV6(projectRoot);

    expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    const migrated = readState(projectRoot);
    assert.equal(migrated.report_assembly.analysis_artifact_ids, null);
    assert.equal(migrated.pending_decision, null);
    assert.equal(migrated.response_receipt.direct_assignment, null);
    assert.equal(migrated.response_receipt.response_markdown, responseMarkdown);
  });
});

test("report context projection isolates candidate and approved evidence", async (t) => {
  await t.test("unbound preparation sees analysis candidates and slots", () => {
    const projectRoot = temporaryProject(t);
    const analysisReady = prepareAnalysisScope(projectRoot);
    const candidateId = pushAnalysisCompletionRecord(projectRoot, {
      artifactId: "legacy-0001",
      available: false,
    });
    const candidateNote = "Candidate legacy-0001 may support a later report scope.";
    const state = readState(projectRoot);
    state.report_assembly.draft_notes = [candidateNote];
    writeState(projectRoot, state);

    const started = expectSuccess(begin(projectRoot, analysisReady, "report_writer"), "BEGAN_WORKER");
    assert.deepEqual(
      started.turn_context.state.artifact_records.map((record) => record.artifact_id),
      [candidateId],
    );
    assert.ok(started.turn_context.state.council_chamber.analysis_execution[analysisReady.design]);
    assert.ok(started.turn_context.scope_snapshot.analysis[analysisReady.design]);
    assert.deepEqual(started.turn_context.state.report_assembly.draft_notes, [candidateNote]);
    assert.ok(started.turn_context.artifact_warnings.some((warning) => (
      warning.artifact_id === candidateId
    )));
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("bound analysis exposes only selected analysis and current report output", () => {
    const projectRoot = temporaryProject(t);
    const analysisReady = prepareAnalysisScope(projectRoot);
    const selectedId = pushAnalysisCompletionRecord(projectRoot, {
      artifactId: "legacy-0001",
      available: true,
    });
    const unrelatedId = pushAnalysisCompletionRecord(projectRoot, {
      artifactId: "legacy-0002",
      available: false,
    });
    const prepared = prepareReportScope(projectRoot, {
      opened: analysisReady,
      analysisArtifactIds: [selectedId],
    });
    const oldReportId = pushReportCompletionRecord(projectRoot);
    const candidateNote = "Selected legacy-0001; omitted legacy-0002 and legacy-9001.";
    const state = readState(projectRoot);
    state.report_assembly.draft_notes = [candidateNote];
    writeState(projectRoot, state);

    const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    assert.deepEqual(
      started.turn_context.state.artifact_records.map((record) => record.artifact_id),
      [selectedId],
    );
    assert.deepEqual(started.turn_context.state.council_chamber.analysis_execution, {});
    assert.deepEqual(started.turn_context.scope_snapshot.analysis, {});
    assert.deepEqual(started.turn_context.state.report_assembly.draft_notes, []);
    assert.equal(started.turn_context.artifact_warnings.some((warning) => (
      [unrelatedId, oldReportId].includes(warning.artifact_id)
    )), false);

    const reopened = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
    assert.equal(reopened.warnings.some((warning) => (
      [unrelatedId, oldReportId].includes(warning.artifact_id)
    )), false);

    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug: "bound-analysis-report",
        extension: "html",
      },
    }), "ARTIFACT_RESERVED");
    writeReservedTemporary(projectRoot, reserved, "<!doctype html><title>Bound report</title>\n");
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            current_format: "html",
          },
          council_chamber: {
            report_writer: {
              current_status: "done",
            },
          },
        },
        artifact: scopedArtifact(reserved, "Completed bound analysis report."),
      },
    }), "WORKER_APPLIED");
    const leadRecords = applied.turn_context.state.artifact_records;
    assert.deepEqual(applied.turn_context.state.report_assembly.draft_notes, []);
    assert.deepEqual(
      leadRecords.filter((record) => record.route === "analysis_execution")
        .map((record) => record.artifact_id),
      [selectedId],
    );
    assert.deepEqual(
      leadRecords.filter((record) => record.route === "report_writer")
        .map((record) => record.operation_id),
      [started.operation_id],
    );
    assert.equal(leadRecords.some((record) => record.artifact_id === oldReportId), false);
    assert.equal(applied.turn_context.artifact_warnings.some((warning) => (
      [unrelatedId, oldReportId].includes(warning.artifact_id)
    )), false);
    expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  });

  await t.test("bound planning exposes no historical analysis", () => {
    const projectRoot = temporaryProject(t);
    const analysisReady = prepareAnalysisScope(projectRoot);
    const prepared = prepareReportScope(projectRoot, {
      opened: analysisReady,
      analysisArtifactIds: [],
    });
    const unrelatedId = pushAnalysisCompletionRecord(projectRoot, {
      artifactId: "legacy-0001",
      available: false,
    });
    const candidateNote = "Historical analysis exists but is intentionally not bound.";
    const state = readState(projectRoot);
    state.report_assembly.draft_notes = [candidateNote];
    writeState(projectRoot, state);

    const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    assert.deepEqual(
      started.turn_context.state.artifact_records.filter((record) => (
        record.route === "analysis_execution"
      )),
      [],
    );
    assert.deepEqual(started.turn_context.state.council_chamber.analysis_execution, {});
    assert.deepEqual(started.turn_context.scope_snapshot.analysis, {});
    assert.deepEqual(started.turn_context.state.report_assembly.draft_notes, []);
    assert.equal(started.turn_context.artifact_warnings.some((warning) => (
      warning.artifact_id === unrelatedId
    )), false);
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            draft_notes: [candidateNote],
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    assert.deepEqual(applied.turn_context.state.report_assembly.draft_notes, []);
    expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
  });
});

test("report evidence availability is rechecked at ready handoff and closeout", async (t) => {
  await t.test("blocked to ready preserve is atomic when bound evidence is missing", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const artifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
    const prepared = prepareReportScope(projectRoot, {
      opened,
      analysisArtifactIds: [artifactId],
    });
    const blocker = expectSuccess(begin(projectRoot, prepared, "report_writer"), "BEGAN_WORKER");
    const blocked = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(blocker),
        operation_id: blocker.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            draft_notes: ["Evidence restoration is required."],
          },
          council_chamber: {
            report_writer: {
              current_status: "blocked",
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    const idle = expectSuccess(finish(projectRoot, blocked), "OPERATION_FINISHED");
    const record = readState(projectRoot).artifact_records.find((item) => (
      item.artifact_id === artifactId
    ));
    fs.rmSync(path.join(projectRoot, ...record.location.split("/").filter(Boolean)), {
      recursive: true,
      force: true,
    });

    const repair = expectSuccess(begin(projectRoot, idle, "report_writer"), "BEGAN_WORKER");
    const before = fs.readFileSync(statePath(projectRoot));
    const failure = expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(repair),
        operation_id: repair.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            draft_notes: ["Attempted ready handoff with missing evidence."],
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
            },
          },
        },
      },
    }), "SCOPE_MISMATCH");
    assert.deepEqual(failure.details.unavailable_analysis_artifact_ids, [artifactId]);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  });

  await t.test("protocol-1 closeout blocks source loss but cancellation remains allowed", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const artifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
    const prepared = prepareReportScope(projectRoot, {
      opened,
      analysisArtifactIds: [artifactId],
    });
    const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug: "source-loss-report",
        extension: "html",
      },
    }), "ARTIFACT_RESERVED");
    writeReservedTemporary(projectRoot, reserved, "<!doctype html><title>Source loss</title>\n");
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            current_format: "html",
          },
          council_chamber: {
            report_writer: {
              current_status: "done",
            },
          },
        },
        artifact: scopedArtifact(reserved, "Completed report before source loss."),
      },
    }), "WORKER_APPLIED");
    const record = readState(projectRoot).artifact_records.find((item) => (
      item.artifact_id === artifactId
    ));
    fs.rmSync(path.join(projectRoot, ...record.location.split("/").filter(Boolean)), {
      recursive: true,
      force: true,
    });
    const before = fs.readFileSync(statePath(projectRoot));

    const failure = expectFailure(finish(projectRoot, applied), "SCOPE_MISMATCH");
    assert.deepEqual(failure.details.unavailable_analysis_artifact_ids, [artifactId]);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    expectSuccess(finish(projectRoot, applied, {}, { cancel: true }), "OPERATION_CANCELLED");
  });
});

test("schema-6 active report execution opens for repair without allowing unresolved output", async (t) => {
  await t.test("worker pending", () => {
    const projectRoot = temporaryProject(t);
    const analysisReady = prepareAnalysisScope(projectRoot);
    const artifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
    const prepared = prepareReportScope(projectRoot, {
      opened: analysisReady,
      analysisArtifactIds: [artifactId],
    });
    expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const legacyHash = legacyReportContractBundle(readState(projectRoot).report_assembly).contractHash;
    downgradeCurrentStateToV6(projectRoot);

    const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    const active = readState(projectRoot).state_meta.active_operation;
    assert.equal(active.report_evidence_binding_protocol, 0);
    assert.equal(active.contract_hash, legacyHash);
    assert.equal(readState(projectRoot).report_assembly.analysis_artifact_ids, null);
    assert.ok(migrated.turn_context.state.artifact_records.some((record) => (
      record.artifact_id === artifactId
    )));
    assert.ok(
      migrated.turn_context.state.council_chamber.analysis_execution[analysisReady.design],
    );
    assert.ok(migrated.turn_context.scope_snapshot.analysis[analysisReady.design]);
    assert.equal(
      migrated.required_references.some((reference) => reference.startsWith("assets/report_template_")),
      false,
    );
    assert.equal(migrated.required_references.includes("references/artifact_output_policy.md"), false);

    const beforeBlockedOutput = fs.readFileSync(statePath(projectRoot));
    expectFailure(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(migrated),
        operation_id: migrated.active_operation.id,
        kind: "file",
        slug: "migrated-report",
        extension: "html",
      },
    }), "SCOPE_MISMATCH");
    expectFailure(execute(projectRoot, "apply", {
      payload: {
        ...expected(migrated),
        operation_id: migrated.active_operation.id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            draft_notes: ["Attempted unresolved output."],
          },
          council_chamber: {
            report_writer: {
              current_status: "done",
            },
          },
        },
        artifact: {},
      },
    }), "SCOPE_MISMATCH");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), beforeBlockedOutput);

    const revised = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(migrated),
        operation_id: migrated.active_operation.id,
        actor: "report_writer",
        scope_transition: "revise",
        updates: {
          report_assembly: {
            report_goal: "Repair the migrated evidence provenance",
            claim_boundary: "Do not exceed the explicitly selected analysis evidence.",
            analysis_artifact_ids: [artifactId],
          },
          council_chamber: {
            report_writer: {
              current_status: "ready",
            },
          },
        },
      },
    }), "WORKER_APPLIED");
    const repaired = readState(projectRoot);
    assert.deepEqual(repaired.report_assembly.analysis_artifact_ids, [artifactId]);
    assert.equal(repaired.state_meta.active_operation.report_evidence_binding_protocol, 1);
    expectSuccess(finish(projectRoot, revised), "OPERATION_FINISHED");
  });

  await t.test("lead pending with a completed legacy-hash manifest", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const artifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
    const prepared = prepareReportScope(projectRoot, {
      opened,
      analysisArtifactIds: [artifactId],
    });
    const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
      scope_ref: prepared.scope_ref,
    }), "BEGAN_WORKER");
    const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        kind: "file",
        slug: "legacy-report",
        extension: "html",
      },
    }), "ARTIFACT_RESERVED");
    writeReservedTemporary(projectRoot, reserved, "<!doctype html><title>Legacy report</title>\n");
    const applied = expectSuccess(execute(projectRoot, "apply", {
      payload: {
        ...expected(reserved),
        operation_id: started.operation_id,
        actor: "report_writer",
        scope_transition: "preserve",
        updates: {
          report_assembly: {
            current_format: "html",
          },
          council_chamber: {
            report_writer: {
              current_status: "done",
            },
          },
        },
        artifact: scopedArtifact(reserved, "Completed legacy report."),
      },
    }), "WORKER_APPLIED");

    const reportState = readState(projectRoot);
    const legacyBundle = legacyReportContractBundle(reportState.report_assembly);
    const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const evidenceFile = manifest.execution_receipt.evidence_files[0];
    manifest.requirements = legacyBundle.requirements;
    manifest.execution_receipt.contract_hash = legacyBundle.contractHash;
    manifest.execution_receipt.completed_requirements =
      legacyBundle.requirements.map((requirement) => requirement.id);
    manifest.execution_receipt.unmet_requirements = [];
    manifest.execution_receipt.requirement_evidence =
      legacyBundle.requirements.map((requirement) => ({
        requirement_id: requirement.id,
        file: evidenceFile,
        locator: `Evidence for ${requirement.id}`,
      }));
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    downgradeCurrentStateToV6(projectRoot);

    const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
    const active = readState(projectRoot).state_meta.active_operation;
    assert.equal(migrated.mode, "resume_lead");
    assert.equal(migrated.artifact_status.location_state, "complete");
    assert.equal(active.report_evidence_binding_protocol, 0);
    assert.equal(active.contract_hash, legacyBundle.contractHash);
    assert.equal(readState(projectRoot).report_assembly.analysis_artifact_ids, null);
    expectSuccess(finish(projectRoot, {
      ...migrated,
      operation_id: migrated.active_operation.id,
    }), "OPERATION_FINISHED");
    assert.equal(readState(projectRoot).state_meta.active_operation, null);
    assert.equal(applied.operation_id, migrated.active_operation.id);
  });
});

test("migrated ready report lead can hand off repair but cannot persist unresolved approval", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const artifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
  const prepared = prepareReportScope(projectRoot, {
    opened,
    analysisArtifactIds: [artifactId],
  });
  const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: {
        report_assembly: {
          draft_notes: ["Return for explicit evidence repair."],
        },
        council_chamber: {
          report_writer: {
            current_status: "ready",
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  downgradeCurrentStateToV6(projectRoot);

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
  assert.equal(migrated.mode, "resume_lead");
  assert.equal(migrated.active_operation.report_evidence_binding_protocol, 0);
  assert.equal(readState(projectRoot).report_assembly.analysis_artifact_ids, null);
  const prior = {
    ...migrated,
    operation_id: migrated.active_operation.id,
  };
  const exactApproval = structuredClone(DEFAULT_PRESENTATION);
  exactApproval.direct_assignment = {
    route: "report_writer",
    support: null,
    intent_summary: "Approve the unresolved legacy report scope.",
    scope_ref: prepared.scope_ref,
  };
  const before = fs.readFileSync(statePath(projectRoot));
  const failure = expectFailure(finish(projectRoot, prior, {}, {
    presentation: exactApproval,
  }), "SCOPE_MISMATCH");
  assert.equal(failure.details.report_evidence_binding, "unresolved");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);

  const repairHandoff = structuredClone(DEFAULT_PRESENTATION);
  repairHandoff.next_steps = "Revise the report scope with an explicit evidence selection.";
  repairHandoff.direct_assignment = {
    route: "report_writer",
    support: null,
    intent_summary: "Resolve the legacy report evidence selection.",
    scope_ref: null,
  };
  expectSuccess(finish(projectRoot, prior, {}, {
    presentation: repairHandoff,
  }), "OPERATION_FINISHED");
  const closed = readState(projectRoot);
  assert.equal(closed.response_receipt.direct_assignment.route, "report_writer");
  assert.equal(closed.response_receipt.direct_assignment.scope_ref, null);
});

test("migrated report preparation upgrades new and revised scopes to binding protocol 1", async (t) => {
  for (const transition of ["new", "revise"]) {
    await t.test(transition, () => {
      const projectRoot = temporaryProject(t);
      let selectedArtifactId = null;
      const prior = transition === "new"
        ? expectSuccess(execute(projectRoot, "open"), "CREATED")
        : prepareReportScope(projectRoot);
      if (transition === "revise") {
        selectedArtifactId = pushAnalysisCompletionRecord(projectRoot, { available: true });
      }
      expectSuccess(begin(projectRoot, prior, "report_writer"), "BEGAN_WORKER");
      downgradeCurrentStateToV6(projectRoot);
      const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V6");
      assert.equal(
        readState(projectRoot).state_meta.active_operation.report_evidence_binding_protocol,
        0,
      );
      const applied = expectSuccess(execute(projectRoot, "apply", {
        payload: {
          ...expected(migrated),
          operation_id: migrated.active_operation.id,
          actor: "report_writer",
          scope_transition: transition,
          updates: {
            report_assembly: {
              report_goal: `${transition} report scope`,
              audience: "Migration test readers",
              claim_boundary: "Do not exceed the migrated report evidence.",
              planned_structure: ["Scope", "Evidence", "Limitations"],
              wording_constraints: ["Preserve the approved causal claim boundary."],
              analysis_artifact_ids: selectedArtifactId === null ? [] : [selectedArtifactId],
            },
            council_chamber: {
              report_writer: {
                current_status: "ready",
              },
            },
          },
        },
      }), "WORKER_APPLIED");
      const active = readState(projectRoot).state_meta.active_operation;
      assert.equal(active.report_evidence_binding_protocol, 1);
      assert.match(active.contract_hash, /^[0-9a-f]{64}$/);
      assert.deepEqual(
        readState(projectRoot).report_assembly.analysis_artifact_ids,
        selectedArtifactId === null ? [] : [selectedArtifactId],
      );
      expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
    });
  }
});

test("the source Stop hook blocks an active v6 state without migrating it on disk", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  downgradeCurrentStateToV6(projectRoot);
  const before = fs.readFileSync(statePath(projectRoot));
  for (const hook of [SOURCE_HOOK, CODEX_SOURCE_HOOK]) {
    const result = runHook(projectRoot, { hook });
    assert.equal(result.decision, "block", JSON.stringify(result));
    assert.match(result.reason, /still active/);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  }
  assert.equal(readState(projectRoot).state_meta.schema_version, 6);
});

test("source and bundled Stop hooks inspect active legacy-shape v8 state without writing", (t) => {
  const projectRoot = temporaryProject(t);
  const question = "Was treatment timing fixed before outcomes were observed?";
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const worker = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const applied = applyDataAuditQuestion(projectRoot, worker, question);
  const closed = expectSuccess(finish(projectRoot, applied, {}, {
    questionActions: [recordQuestion(question)],
  }), "OPERATION_FINISHED");
  expectSuccess(begin(projectRoot, closed, "team_lead"), "BEGAN_LEAD");
  downgradeCurrentStateToV8(projectRoot, { legacySources: true });
  const before = fs.readFileSync(statePath(projectRoot));

  for (const hook of [SOURCE_HOOK, CODEX_SOURCE_HOOK, CODEX_HOOK, CLAUDE_HOOK]) {
    const result = runHook(projectRoot, { hook });
    assert.equal(result.decision, "block", JSON.stringify(result));
    assert.match(result.reason, /still active/);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  }
  assert.equal(readState(projectRoot).state_meta.schema_version, 8);
});

test("schema-4 migration archives exact bytes, preserves identity, and is idempotent", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const started = expectSuccess(begin(projectRoot, prepared, "analysis_execution." + prepared.design, {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const legacyOperationId = crypto.randomUUID();
  const legacyLocation = "output/legacy-audit.csv";
  const legacySummary = "Legacy audit artifact.";
  const state = readState(projectRoot);
  state.artifact_records.push({
    artifact_id: crypto.randomUUID(),
    operation_id: legacyOperationId,
    route: "data_audit",
    location: legacyLocation,
    created_at: "2026-01-01T00:00:00Z",
    summary: legacySummary,
  });
  writeState(projectRoot, state);

  const legacyPath = path.join(projectRoot, ...legacyLocation.split("/"));
  fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
  fs.writeFileSync(legacyPath, "field,value\nrows,12\n", "utf8");
  fs.writeFileSync(legacyPath + ".manifest.json", JSON.stringify({
    schema_version: 1,
    operation_id: legacyOperationId,
    route: "data_audit",
    scope_ref: null,
    files: [legacyLocation],
    completed_at: "2026-01-01T00:00:00Z",
    summary: legacySummary,
  }, null, 2) + "\n", "utf8");

  const v4 = downgradeCurrentStateToV4(projectRoot);
  const original = fs.readFileSync(statePath(projectRoot));
  const archiveDirectory = path.join(projectRoot, "project_state.archives");
  assert.equal(v4.state_meta.active_operation.completion_protocol, undefined);
  assert.equal(v4.state_meta.active_operation.contract_hash, undefined);
  assert.equal(
    v4.council_chamber.analysis_execution[prepared.design].execution_contract,
    undefined,
  );
  assert.equal(
    v4.council_chamber.analysis_execution[prepared.design].causal_basis_hash,
    undefined,
  );
  assert.equal(v4.artifact_records[0].artifact_role, undefined);

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V4");
  assert.deepEqual(fs.readFileSync(migrated.archive_path), original);
  assert.equal(migrated.project_id, v4.state_meta.project_id);
  assert.equal(migrated.revision, v4.state_meta.revision + 1);
  assert.equal(migrated.mode, "resume_worker");
  assert.deepEqual(migrated.warnings, []);

  const current = readState(projectRoot);
  assert.equal(current.state_meta.schema_version, 9);
  assert.equal(current.state_meta.project_id, v4.state_meta.project_id);
  assert.equal(current.state_meta.active_operation.completion_protocol, 0);
  assert.equal(current.state_meta.active_operation.contract_hash, null);
  assert.equal(
    current.council_chamber.analysis_execution[prepared.design].execution_contract,
    null,
  );
  assert.equal(
    typeof current.council_chamber.analysis_execution[prepared.design].causal_basis_hash,
    "string",
  );
  assert.equal(current.artifact_records[0].artifact_role, "completion");
  assert.equal(current.artifact_records[0].operation_id, legacyOperationId);

  const migratedBytes = fs.readFileSync(statePath(projectRoot));
  const archiveNames = fs.readdirSync(archiveDirectory).sort();
  const reopened = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(reopened.project_id, migrated.project_id);
  assert.equal(reopened.revision, migrated.revision);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), migratedBytes);
  assert.deepEqual(fs.readdirSync(archiveDirectory).sort(), archiveNames);
  assert.equal(reopened.operation_packet.contract_hash, null);
  assert.deepEqual(reopened.operation_packet.requirements, []);
  expectSuccess(finish(projectRoot, {
    ...reopened,
    operation_id: started.operation_id,
  }, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("schema-5 migration adds an empty strategy portfolio without invalidating prior readiness", (t) => {
  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");
  seedAnalysisEligibility(projectRoot, {
    design: "single_time_observational",
    support: "statistical-validity",
    readiness: "ready",
  });
  const v5 = downgradeCurrentStateToV5(projectRoot);
  const original = fs.readFileSync(statePath(projectRoot));

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V5");
  assert.deepEqual(fs.readFileSync(migrated.archive_path), original);
  const current = readState(projectRoot);
  assert.equal(current.state_meta.schema_version, 9);
  assert.deepEqual(current.causal_facts.analysis_options, []);
  assert.equal(current.causal_facts.analysis_readiness, v5.causal_facts.analysis_readiness);
  assert.deepEqual(
    current.causal_facts.recommended_method_routes,
    v5.causal_facts.recommended_method_routes,
  );
  expectSuccess(execute(projectRoot, "validate"), "VALID");

  const migratedBytes = fs.readFileSync(statePath(projectRoot));
  expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), migratedBytes);
});

test("an idle migrated ready analysis scope must be revised onto the current causal basis", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = `analysis_execution.${prepared.design}`;
  downgradeCurrentStateToV5(projectRoot);
  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V5");
  assert.equal(
    expectSuccess(execute(projectRoot, "validate"), "VALID")
      .scope_snapshot.analysis[prepared.design].basis_current,
    false,
  );
  assert.equal(
    readState(projectRoot).council_chamber.analysis_execution[prepared.design]
      .causal_basis_hash,
    null,
  );

  const beforeExact = fs.readFileSync(statePath(projectRoot));
  expectFailure(begin(projectRoot, migrated, actor, {
    support: prepared.support,
    scope_ref: prepared.scope_ref,
  }), "SCOPE_MISMATCH");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), beforeExact);

  const revising = expectSuccess(begin(projectRoot, migrated, actor, {
    support: prepared.support,
  }), "BEGAN_WORKER");
  const revised = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(revising),
      operation_id: revising.operation_id,
      actor,
      scope_transition: "revise",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: analysisSlot(
              "ready",
              "The migrated scope is now bound to the current causal basis.",
              prepared.support,
            ),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const slot = readState(projectRoot).council_chamber.analysis_execution[prepared.design];
  assert.equal(slot.scope_id, prepared.scope_ref.id);
  assert.equal(slot.scope_revision, prepared.scope_ref.revision + 1);
  assert.match(slot.causal_basis_hash, /^[0-9a-f]{64}$/);
  assert.equal(
    expectSuccess(execute(projectRoot, "validate"), "VALID")
      .scope_snapshot.analysis[prepared.design].basis_current,
    true,
  );
  expectSuccess(finish(projectRoot, revised), "OPERATION_FINISHED");
});

test("schema-5 migration grandfathers an active bound ready analysis lead through closeout", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
  const actor = `analysis_execution.${prepared.design}`;
  const started = expectSuccess(begin(projectRoot, prepared, actor, {
    support: prepared.support,
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor,
      scope_transition: "preserve",
      updates: {
        council_chamber: {
          analysis_execution: {
            [prepared.design]: analysisSlot(
              "ready",
              "The already-bound analysis remains ready for lead closeout.",
              prepared.support,
            ),
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const v5 = downgradeCurrentStateToV5(projectRoot);
  v5.state_meta.active_operation.completion_protocol = 1;
  writeState(projectRoot, v5);
  const original = fs.readFileSync(statePath(projectRoot));

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V5");
  assert.equal(migrated.mode, "resume_lead");
  assert.ok(
    migrated.required_references.includes("references/legacy_evidence.md"),
    "lead phase must receive the legacy evidence reference for protocol-1 operations",
  );
  assert.ok(
    migrated.required_references.includes("references/team_lead_analysis_flow.md"),
    "lead phase must receive the analysis flow reference for analysis operations",
  );
  assert.deepEqual(fs.readFileSync(migrated.archive_path), original);
  assert.equal(migrated.operation_packet.completion_protocol, 1);
  const current = readState(projectRoot);
  assert.match(
    current.council_chamber.analysis_execution[prepared.design].causal_basis_hash,
    /^[0-9a-f]{64}$/,
  );
  assert.equal(
    expectSuccess(execute(projectRoot, "validate"), "VALID")
      .scope_snapshot.analysis[prepared.design].basis_current,
    true,
  );

  const closed = expectSuccess(finish(projectRoot, {
    ...migrated,
    operation_id: applied.operation_id,
  }), "OPERATION_FINISHED");
  assert.deepEqual(closed.direct_assignment.scope_ref, prepared.scope_ref);
  const closedBytes = fs.readFileSync(statePath(projectRoot));
  expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), closedBytes);
});

test("schema-3 through schema-5 migration preserves response receipts and pending decisions exactly", async (t) => {
  const scenarios = [
    { version: 3, downgrade: downgradeCurrentStateToV3 },
    { version: 4, downgrade: downgradeCurrentStateToV4 },
    { version: 5, downgrade: downgradeCurrentStateToV5 },
  ];
  for (const scenario of scenarios) {
    await t.test(`schema ${scenario.version}`, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
      const closed = expectSuccess(finish(projectRoot, started, {}, {
        presentation: optionsPresentation([
          decisionOption("Audit the data", "data_audit"),
          decisionOption("Review the domain", "domain_expert"),
        ]),
      }), "OPERATION_FINISHED");
      const legacy = scenario.downgrade(projectRoot);
      const legacyReceipt = structuredClone(legacy.response_receipt);
      const legacyDecision = structuredClone(legacy.pending_decision);
      const original = fs.readFileSync(statePath(projectRoot));
      const archiveDirectory = path.join(projectRoot, "project_state.archives");

      const migrated = expectSuccess(
        execute(projectRoot, "open"),
        `MIGRATED_V${scenario.version}`,
      );
      assert.deepEqual(fs.readFileSync(migrated.archive_path), original);
      const current = readState(projectRoot);
      assert.equal(current.state_meta.revision, legacy.state_meta.revision + 1);
      assert.equal(current.response_receipt.revision, current.state_meta.revision);
      assert.equal(current.response_receipt.operation_id, legacyReceipt.operation_id);
      assert.equal(current.response_receipt.created_at, legacyReceipt.created_at);
      assert.equal(current.response_receipt.response_markdown, closed.response_markdown);
      assert.equal(current.response_receipt.response_markdown, legacyReceipt.response_markdown);
      assert.equal(current.response_receipt.direct_assignment, null);
      assert.deepEqual(current.pending_decision, legacyDecision);
      assert.equal(
        current.pending_decision.source_operation_id,
        current.response_receipt.operation_id,
      );

      const migratedBytes = fs.readFileSync(statePath(projectRoot));
      const archiveNames = fs.readdirSync(archiveDirectory).sort();
      expectSuccess(execute(projectRoot, "open"), "OPENED");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), migratedBytes);
      assert.deepEqual(fs.readdirSync(archiveDirectory).sort(), archiveNames);
    });
  }
});

test("schema-2 migration preserves idle and active route boundaries", async (t) => {
  for (const scenario of [
    { name: "idle", route: null, mode: "idle" },
    { name: "worker pending", route: "data_audit", mode: "resume_worker" },
    { name: "lead pending", route: "team_lead", mode: "resume_lead" },
  ]) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      if (scenario.route !== null) {
        expectSuccess(
          begin(projectRoot, opened, scenario.route),
          scenario.route === "team_lead" ? "BEGAN_LEAD" : "BEGAN_WORKER",
        );
      }
      const currentV7 = readState(projectRoot);
      const priorOperation = currentV7.state_meta.active_operation;
      const priorPlan = currentV7.next_step_plan;
      const v2 = downgradeCurrentStateToV2(projectRoot);
      const original = fs.readFileSync(statePath(projectRoot), "utf8");

      const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V2");
      assert.equal(fs.readFileSync(migrated.archive_path, "utf8"), original);
      assert.equal(migrated.project_id, v2.state_meta.project_id);
      assert.equal(migrated.revision, v2.state_meta.revision + 1);
      assert.equal(migrated.mode, scenario.mode);
      assert.deepEqual(migrated.active_operation, priorOperation);
      assert.deepEqual(migrated.plan, priorPlan);

      const current = readState(projectRoot);
      assert.equal(current.state_meta.schema_version, 9);
      assert.equal(current.state_meta.project_id, v2.state_meta.project_id);
      assert.equal(current.state_meta.revision, v2.state_meta.revision + 1);
      assert.equal(current.state_meta.startup_notice, null);
      assert.deepEqual(current.state_meta.active_operation, priorOperation);
      assert.deepEqual(current.next_step_plan, priorPlan);
      assert.equal(current.pending_decision, null);
      assert.equal(current.response_receipt, null);
      for (const section of [
        "data_facts",
        "domain_knowledge",
        "artifact_records",
      ]) {
        assert.deepEqual(current[section], v2[section], `${section} changed during v2 migration`);
      }
      assert.deepEqual(current.project_summary, {
        ...v2.project_summary,
        audience_profile: { level: "unstated", evidence: null, preferences: [] },
      }, "project_summary changed during v2 migration beyond the added audience profile");
      assert.deepEqual(current.carried_questions, []);
      assert.deepEqual(current.report_assembly, {
        ...v2.report_assembly,
        analysis_artifact_ids: [],
        claim_boundary: null,
      });
      assert.deepEqual(current.causal_facts, {
        ...v2.causal_facts,
        analysis_options: [],
      });
      const expectedCouncil = structuredClone(v2.council_chamber);
      for (const slot of Object.values(expectedCouncil.analysis_execution)) {
        slot.execution_contract = null;
        slot.causal_basis_hash = null;
      }
      assert.deepEqual(current.council_chamber, expectedCouncil);
      assert.deepEqual(current.discovery_sidecar, {
        ...v2.discovery_sidecar,
        scope_id: null,
        scope_revision: 0,
        execution_contract: null,
      });

      const migratedBytes = fs.readFileSync(statePath(projectRoot), "utf8");
      const reopened = expectSuccess(
        execute(projectRoot, "open"),
        scenario.mode === "resume_worker"
          ? "RESUME_WORKER"
          : scenario.mode === "resume_lead"
            ? "RESUME_LEAD"
            : "OPENED",
      );
      assert.equal(reopened.mode, scenario.mode);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), migratedBytes);
    });
  }

  await t.test("invalid v2 state fails closed", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const invalid = downgradeCurrentStateToV2(projectRoot);
    invalid.next_step_plan = [{ id: "data_audit" }];
    writeState(projectRoot, invalid);
    const original = fs.readFileSync(statePath(projectRoot), "utf8");

    expectFailure(execute(projectRoot, "open"), "PLAN_MISMATCH");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), original);
  });

  await t.test("artifact diagnostics fail before migration archives or replaces state", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
    const v2 = downgradeCurrentStateToV2(projectRoot);
    v2.state_meta.active_operation.artifact_intent = {
      kind: "file",
      location: "output/../escape.csv",
    };
    writeState(projectRoot, v2);
    const original = fs.readFileSync(statePath(projectRoot));
    const archiveDirectory = path.join(projectRoot, "project_state.archives");

    expectFailure(execute(projectRoot, "open"), "INVALID_ARTIFACT_PATH");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), original);
    assert.equal(fs.existsSync(archiveDirectory), false);
  });
});

test("schema-3 migration closes unbound discovery reservations without post-hoc binding", async (t) => {
  const scenarios = [
    { name: "temp-only", prepare: ({ temporary }) => fs.writeFileSync(temporary, "partial\n", "utf8") },
    { name: "final-without-manifest", prepare: ({ final }) => fs.writeFileSync(final, "legacy\n", "utf8") },
    {
      name: "completed-legacy-manifest",
      prepare: ({ final, manifest, location, operationId }) => {
        fs.writeFileSync(final, "legacy\n", "utf8");
        fs.writeFileSync(manifest, `${JSON.stringify({
          schema_version: 1,
          operation_id: operationId,
          route: "causal_discovery",
          scope_ref: null,
          files: [location],
          completed_at: "2026-01-01T00:00:00Z",
          summary: "Legacy discovery output.",
        }, null, 2)}\n`, "utf8");
      },
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, () => {
      const projectRoot = temporaryProject(t);
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(
        begin(projectRoot, opened, "causal_discovery"),
        "BEGAN_WORKER",
      );
      const location = `output/legacy-pending-${started.operation_id.slice(0, 8)}.csv`;
      const pending = readState(projectRoot);
      pending.state_meta.active_operation.artifact_intent = {
        kind: "file",
        location,
      };
      pending.discovery_sidecar.status = "reviewed";
      pending.discovery_sidecar.goal = "Earlier legacy review";
      pending.discovery_sidecar.findings = ["Earlier candidate adjacency"];
      pending.discovery_sidecar.artifact_refs = ["input/earlier-graph.json"];
      writeState(projectRoot, pending);
      const v3 = downgradeCurrentStateToV3(projectRoot);
      const final = path.join(projectRoot, ...location.split("/"));
      const temporary = path.join(
        path.dirname(final),
        `.${path.basename(final)}.tmp-${started.operation_id.slice(0, 8)}`,
      );
      const manifest = `${final}.manifest.json`;
      fs.mkdirSync(path.dirname(final), { recursive: true });
      scenario.prepare({
        final,
        temporary,
        manifest,
        location,
        operationId: started.operation_id,
      });
      const original = fs.readFileSync(statePath(projectRoot), "utf8");

      const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V3");
      assert.equal(fs.readFileSync(migrated.archive_path, "utf8"), original);
      assert.equal(migrated.mode, "resume_worker");
      assert.equal(migrated.revision, v3.state_meta.revision + 1);
      assert.equal(migrated.active_operation.discovery_scope, null);
      assert.deepEqual(
        migrated.active_operation.artifact_intent,
        v3.state_meta.active_operation.artifact_intent,
      );

      const migratedBytes = fs.readFileSync(statePath(projectRoot), "utf8");
      const preservedSidecar = structuredClone(readState(projectRoot).discovery_sidecar);
      expectFailure(execute(projectRoot, "apply", {
        payload: {
          ...expected(migrated),
          operation_id: started.operation_id,
          actor: "causal_discovery",
          discovery_scope: discoveryScope("new"),
          artifact: { summary: "Legacy discovery output." },
          updates: {
            discovery_sidecar: { status: "artifact_created" },
            council_chamber: {
              causal_discovery: { current_status: "artifact_created" },
            },
          },
        },
      }), "SCOPE_MISMATCH");
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), migratedBytes);

      const blocked = expectSuccess(execute(projectRoot, "apply", {
        payload: {
          ...expected(migrated),
          operation_id: started.operation_id,
          actor: "causal_discovery",
          updates: {
            council_chamber: {
              causal_discovery: {
                current_status: "blocked",
                summary: "The legacy output was preserved but not adopted.",
                questions_for_user: [],
                feedback_to_route: [],
              },
            },
          },
        },
      }), "WORKER_APPLIED");
      const state = readState(projectRoot);
      assert.deepEqual(state.discovery_sidecar, preservedSidecar);
      assert.equal(
        state.council_chamber.causal_discovery.current_status,
        "blocked",
      );
      assert.deepEqual(state.artifact_records, []);
      for (const existing of [temporary, final, manifest].filter(fs.existsSync)) {
        assert.equal(fs.existsSync(existing), true);
      }
      expectSuccess(finish(projectRoot, blocked), "OPERATION_FINISHED");
    });
  }
});

test("schema-3 migration preserves populated discovery as unbound legacy context", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "causal-statectl-populated-"));
  try {
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const state = readState(projectRoot);
    state.discovery_sidecar.status = "artifact_created";
    state.discovery_sidecar.goal = "Legacy neighborhood review";
    state.discovery_sidecar.scope = "Treatment, outcome, and baseline variables";
    state.discovery_sidecar.method_summary = "Legacy method description";
    state.discovery_sidecar.findings = ["One candidate adjacency"];
    state.discovery_sidecar.artifact_refs = ["output/legacy-discovery.csv"];
    writeState(projectRoot, state);
    const v3 = downgradeCurrentStateToV3(projectRoot);

    const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V3");
    const current = readState(projectRoot);
    assert.equal(current.discovery_sidecar.scope_id, null);
    assert.equal(current.discovery_sidecar.scope_revision, 0);
    assert.equal(current.discovery_sidecar.execution_contract, null);
    for (const field of [
      "status",
      "goal",
      "scope",
      "method_summary",
      "findings",
      "artifact_refs",
    ]) {
      assert.deepEqual(current.discovery_sidecar[field], v3.discovery_sidecar[field]);
    }
    const validated = expectSuccess(execute(projectRoot, "validate"), "VALID");
    assert.equal(validated.scope_snapshot.discovery, null);
    assert.equal(migrated.mode, "idle");
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("reset and cancellation handle pending choices without resurrection", async (t) => {
  await t.test("reset archives the decision and clears it", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const lead = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const menu = expectSuccess(finish(projectRoot, lead, {}, {
      presentation: optionsPresentation([
        decisionOption("Audit the data", "data_audit"),
        decisionOption("Review the domain", "domain_expert"),
      ]),
    }), "OPERATION_FINISHED");
    const original = fs.readFileSync(statePath(projectRoot), "utf8");

    const reset = expectSuccess(execute(projectRoot, "open", { args: ["--fresh"] }), "RESET");
    assert.equal(fs.readFileSync(reset.archive_path, "utf8"), original);
    assert.notEqual(reset.project_id, menu.project_id);
    assert.equal(readState(projectRoot).pending_decision, null);
    assert.equal(readState(projectRoot).response_receipt, null);
  });

  await t.test("cancelling selected work does not restore the consumed decision", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const lead = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const menu = expectSuccess(finish(projectRoot, lead, {}, {
      presentation: optionsPresentation([
        decisionOption("Audit the data", "data_audit"),
        decisionOption("Review the domain", "domain_expert"),
      ]),
    }), "OPERATION_FINISHED");
    const selected = expectSuccess(
      beginSelection(projectRoot, menu, menu.pending_decision.decision_id, 1),
      "BEGAN_WORKER",
    );
    const cancelled = expectSuccess(
      finish(projectRoot, selected, {}, { cancel: true }),
      "OPERATION_CANCELLED",
    );
    assert.equal(cancelled.pending_decision, null);
    assert.equal(readState(projectRoot).pending_decision, null);
  });

  await t.test("cancellation may publish a new bounded decision", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
    const presentation = optionsPresentation([
      decisionOption("Review the domain", "domain_expert"),
      decisionOption("Clarify the objective", "team_lead"),
    ]);
    const cancelled = expectSuccess(
      finish(projectRoot, started, {}, { cancel: true, presentation }),
      "OPERATION_CANCELLED",
    );
    assert.equal(cancelled.pending_decision.source_operation_id, started.operation_id);
    assert.deepEqual(
      cancelled.pending_decision.options.map((option) => option.number),
      [1, 2],
    );
    assert.deepEqual(readState(projectRoot).pending_decision, cancelled.pending_decision);
  });
});

test("strict validation rejects pending choices beside an active operation", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const lead = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  const menu = expectSuccess(finish(projectRoot, lead, {}, {
    presentation: optionsPresentation([
      decisionOption("Audit the data", "data_audit"),
      decisionOption("Review the domain", "domain_expert"),
    ]),
  }), "OPERATION_FINISHED");
  const pending = readState(projectRoot).pending_decision;
  const started = expectSuccess(begin(projectRoot, menu, "data_audit"), "BEGAN_WORKER");
  const invalid = readState(projectRoot);
  invalid.pending_decision = pending;
  writeState(projectRoot, invalid);
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(execute(projectRoot, "validate"), "INVALID_STATE");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  assert.equal(started.stage, "worker_pending");
});

test("strict validation rejects duplicate pending assignments", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const lead = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  expectSuccess(finish(projectRoot, lead, {}, {
    presentation: optionsPresentation([
      decisionOption("Audit the data", "data_audit"),
      decisionOption("Review the domain", "domain_expert"),
    ]),
  }), "OPERATION_FINISHED");

  const invalid = readState(projectRoot);
  invalid.pending_decision.options[1].assignment = structuredClone(
    invalid.pending_decision.options[0].assignment,
  );
  writeState(projectRoot, invalid);
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(execute(projectRoot, "validate"), "INVALID_STATE");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
});

const PHASE_CONTEXT_PROTOCOL = "phase-capsule-v1";
const PHASE_CONTEXT_RELATIVE_PATH = ".statectl-tmp/phase-context.json";

function phaseContextPath(projectRoot) {
  return path.join(projectRoot, ...PHASE_CONTEXT_RELATIVE_PATH.split("/"));
}

function readPhaseContext(projectRoot) {
  return JSON.parse(fs.readFileSync(phaseContextPath(projectRoot), "utf8"));
}

function assertContextReference(result, capsule, phase) {
  assert.deepEqual(result.context_ref, {
    protocol: PHASE_CONTEXT_PROTOCOL,
    version: 1,
    context_id: capsule.context_id,
    phase,
    path: PHASE_CONTEXT_RELATIVE_PATH,
  });
  assert.equal(capsuleContextId(capsule), capsule.context_id);
  assert.equal("phase_capsule" in result, false);
  assert.equal("phase_capsule_delta" in result, false);
  assert.equal("turn_context" in result, false);
  assert.equal("operation_packet" in result, false);
}

test("context-file mode carries a full router-worker-lead lifecycle across CLI processes", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "CREATED");
  const router = readPhaseContext(projectRoot);
  assert.equal(router.protocol, PHASE_CONTEXT_PROTOCOL);
  assert.equal(router.version, 1);
  assert.equal(router.kind, "full");
  assert.equal(router.phase, "router");
  assert.equal(router.completion_command, "begin");
  assert.equal(router.turn_context.revision, opened.revision);
  assertContextReference(opened, router, "router");
  assert.deepEqual(Object.keys(opened).sort(), [
    "code",
    "context_ref",
    "mode",
    "ok",
    "project_id",
    "revision",
  ]);
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(phaseContextPath(projectRoot)).mode & 0o777, 0o600);
  }

  const firstBytes = fs.readFileSync(phaseContextPath(projectRoot));
  const reopened = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "OPENED");
  assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), firstBytes);
  assert.equal(reopened.context_ref.context_id, opened.context_ref.context_id);

  const started = expectSuccess(execute(projectRoot, "begin", {
    args: ["--context-file"],
    payload: {
      ...expected(reopened),
      route: "data_audit",
      intent_summary: "Audit the current data inputs.",
    },
  }), "BEGAN_WORKER");
  const worker = readPhaseContext(projectRoot);
  assert.equal(worker.phase, "worker");
  assert.equal(worker.completion_command, "apply");
  assert.equal(worker.turn_context.actor, "data_audit");
  assert.equal(worker.turn_context.operation.id, started.operation_id);
  assertContextReference(started, worker, "worker");

  const workerStateBytes = fs.readFileSync(statePath(projectRoot));
  const workerContextBytes = fs.readFileSync(phaseContextPath(projectRoot));
  const workerResume = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "RESUME_WORKER");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), workerStateBytes);
  assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), workerContextBytes);
  assert.deepEqual(workerResume.context_ref, started.context_ref);

  expectFailure(execute(projectRoot, "apply", {
    args: ["--context-file"],
    payload: {
      ...expected(workerResume),
      operation_id: started.operation_id,
      actor: "domain_expert",
      updates: {},
    },
  }), "PLAN_MISMATCH");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), workerStateBytes);
  assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), workerContextBytes);

  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    args: ["--context-file"],
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "phase-context-audit",
      extension: "csv",
    },
  }), "ARTIFACT_RESERVED");
  const reservedWorker = readPhaseContext(projectRoot);
  assert.equal(reservedWorker.phase, "worker");
  assert.equal(reservedWorker.turn_context.revision, reserved.revision);
  assert.deepEqual(
    reservedWorker.turn_context.operation.artifact_intent,
    reserved.artifact_intent,
  );
  assert.equal(reservedWorker.turn_context.artifact_status.temporary_path, reserved.temporary_path);
  assertContextReference(reserved, reservedWorker, "worker");
  assert.equal(typeof reserved.temporary_path, "string");
  assert.equal(typeof reserved.manifest_path, "string");

  const applied = expectSuccess(execute(projectRoot, "apply", {
    args: ["--context-file"],
    payload: {
      ...expected(reserved),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: {
          data_checked: "passing",
          data_sources: ["data/input.csv"],
          audit_scope: "Current supplied inputs",
          unit_of_observation: "Participant",
        },
        council_chamber: {
          data_audit: {
            current_status: "complete",
            summary: "The supplied inputs passed the requested audit.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  const lead = readPhaseContext(projectRoot);
  assert.equal(lead.phase, "lead");
  assert.equal(lead.completion_command, "finish");
  assert.equal(lead.turn_context.stage, "lead_pending");
  assertContextReference(applied, lead, "lead");

  const leadStateBytes = fs.readFileSync(statePath(projectRoot));
  const leadContextBytes = fs.readFileSync(phaseContextPath(projectRoot));
  const leadResume = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "RESUME_LEAD");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), leadStateBytes);
  assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), leadContextBytes);
  assert.deepEqual(leadResume.context_ref, applied.context_ref);

  const closed = expectSuccess(finish(projectRoot, {
    ...leadResume,
    operation_id: lead.turn_context.operation.id,
  }), "OPERATION_FINISHED");
  assert.equal(fs.existsSync(phaseContextPath(projectRoot)), false);
  assert.equal(closed.delivery_warnings, undefined);
  const finalState = readState(projectRoot);
  assert.equal(finalState.state_meta.active_operation, null);
  assert.equal("phase_capsule" in finalState, false);
  assert.equal("context_id" in finalState, false);
});

test("begin can reserve output atomically and deliver the complete worker capsule", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "CREATED");
  const started = expectSuccess(execute(projectRoot, "begin", {
    args: ["--context-file"],
    payload: {
      ...expected(opened),
      route: "data_audit",
      intent_summary: "Audit the data and save a compact table.",
      artifact_reservation: {
        kind: "file",
        slug: "combined-audit",
        extension: "csv",
      },
    },
  }), "BEGAN_WORKER");
  assert.equal(started.revision, opened.revision + 1);
  assert.equal(typeof started.temporary_path, "string");
  assert.equal(typeof started.manifest_path, "string");

  const worker = readPhaseContext(projectRoot);
  assert.deepEqual(worker.turn_context.operation.artifact_intent, started.artifact_intent);
  assert.equal(worker.turn_context.artifact_status.temporary_path, started.temporary_path);
  assert.equal(worker.turn_context.artifact_status.manifest_path, started.manifest_path);
  assert.ok(worker.required_references.includes("references/artifact_output_policy.md"));
  assertContextReference(started, worker, "worker");
  expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("invalid begin-time reservation leaves state unchanged", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const before = fs.readFileSync(statePath(projectRoot));
  expectFailure(execute(projectRoot, "begin", {
    payload: {
      ...expected(opened),
      route: "team_lead",
      intent_summary: "Do not reserve output for lead-only work.",
      artifact_reservation: {
        kind: "file",
        slug: "invalid-lead-output",
        extension: "txt",
      },
    },
  }), "OWNERSHIP_VIOLATION");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
});

test("inline phase-capsule CLI returns a full capsule at every stage boundary", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-protocol", PHASE_CONTEXT_PROTOCOL],
  }), "CREATED");
  assert.equal(opened.phase_capsule.kind, "full");
  assert.equal(opened.phase_capsule.phase, "router");

  const started = expectSuccess(execute(projectRoot, "begin", {
    args: ["--context-protocol", PHASE_CONTEXT_PROTOCOL],
    payload: {
      ...expected(opened),
      route: "data_audit",
      intent_summary: "Audit the supplied data.",
    },
  }), "BEGAN_WORKER");
  assert.equal(started.phase_capsule.kind, "full");
  assert.equal(started.phase_capsule.phase, "worker");

  const applied = expectSuccess(execute(projectRoot, "apply", {
    args: ["--context-protocol", PHASE_CONTEXT_PROTOCOL],
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: {
          data_checked: "passing",
          data_sources: ["data/input.csv"],
          audit_scope: "Current supplied inputs",
          unit_of_observation: "Participant",
        },
        council_chamber: {
          data_audit: {
            current_status: "complete",
            summary: "The supplied inputs passed the requested audit.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  assert.equal(applied.phase_capsule.kind, "full");
  assert.equal(applied.phase_capsule.phase, "lead");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("context-file preflight failures leave state unchanged", async (t) => {
  await t.test("a non-directory context path blocks before begin", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    fs.writeFileSync(path.join(projectRoot, ".statectl-tmp"), "not a directory\n", "utf8");
    const before = fs.readFileSync(statePath(projectRoot));
    expectFailure(execute(projectRoot, "begin", {
      args: ["--context-file"],
      payload: {
        ...expected(opened),
        route: "data_audit",
        intent_summary: "This must not begin.",
      },
    }), "CONTEXT_FILE_PREFLIGHT_FAILED");
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  });

  await t.test("a linked context directory is rejected", (subtest) => {
    const projectRoot = temporaryProject(t);
    const linkedDirectory = temporaryProject(t);
    try {
      fs.symlinkSync(
        linkedDirectory,
        path.join(projectRoot, ".statectl-tmp"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      subtest.skip(`directory links are unavailable: ${error.code || error.message}`);
      return;
    }
    expectFailure(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), "CONTEXT_FILE_PREFLIGHT_FAILED");
    assert.equal(fs.existsSync(statePath(projectRoot)), false);
  });

  await t.test("an in-project context directory casing variant is accepted", (subtest) => {
    if (process.platform !== "win32") {
      subtest.skip("case-variant path behavior is Windows-specific");
      return;
    }
    const projectRoot = temporaryProject(t);
    fs.mkdirSync(path.join(projectRoot, ".STATECTL-TMP"));
    const opened = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), "CREATED");
    assert.equal(opened.context_ref.path, PHASE_CONTEXT_RELATIVE_PATH);
  });
});

test("late context delivery and cleanup failures remain nonfatal after controller commits", async (t) => {
  await t.test("late write failure returns the full capsule and preserves the prior file", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), "CREATED");
    const priorBytes = fs.readFileSync(phaseContextPath(projectRoot));
    const started = expectSuccess(execute(projectRoot, "begin", {
      args: ["--context-file"],
      env: { STATECTL_FAIL_CONTEXT_WRITE: "1" },
      payload: {
        ...expected(opened),
        route: "data_audit",
        intent_summary: "Commit even if context-file delivery fails.",
      },
    }), "BEGAN_WORKER");
    assert.equal(started.phase_capsule.kind, "full");
    assert.equal(started.phase_capsule.phase, "worker");
    assert.equal(started.context_ref, undefined);
    assert.deepEqual(started.delivery_warnings, [{
      code: "CONTEXT_FILE_WRITE_FAILED",
      message: "could not atomically write .statectl-tmp/phase-context.json: injected phase-context write failure",
    }]);
    assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), priorBytes);
    assert.equal(readState(projectRoot).state_meta.active_operation.id, started.operation_id);
    assert.deepEqual(
      fs.readdirSync(path.join(projectRoot, ".statectl-tmp")),
      ["phase-context.json"],
    );
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("finish leaves another project's capsule unchanged", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), "CREATED");
    const started = expectSuccess(execute(projectRoot, "begin", {
      args: ["--context-file"],
      payload: {
        ...expected(opened),
        route: "team_lead",
        intent_summary: "Close this operation without touching another project's context.",
      },
    }), "BEGAN_LEAD");

    const otherRoot = temporaryProject(t);
    expectSuccess(execute(otherRoot, "open", { args: ["--context-file"] }), "CREATED");
    const otherBytes = fs.readFileSync(phaseContextPath(otherRoot));
    fs.writeFileSync(phaseContextPath(projectRoot), otherBytes);

    const closed = expectSuccess(finish(projectRoot, started), "OPERATION_FINISHED");
    assert.deepEqual(closed.delivery_warnings, [{
      code: "CONTEXT_FILE_CLEANUP_FAILED",
      message: ".statectl-tmp/phase-context.json belongs to a different project and was left unchanged",
    }]);
    assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), otherBytes);
    assert.equal(readState(projectRoot).state_meta.active_operation, null);
  });

  await t.test("finish leaves a newer same-project operation capsule unchanged", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), "CREATED");
    const started = expectSuccess(execute(projectRoot, "begin", {
      args: ["--context-file"],
      payload: {
        ...expected(opened),
        route: "team_lead",
        intent_summary: "Close without deleting a newer operation capsule.",
      },
    }), "BEGAN_LEAD");

    const newerCapsule = JSON.parse(fs.readFileSync(phaseContextPath(projectRoot), "utf8"));
    newerCapsule.turn_context.operation.id = crypto.randomUUID();
    newerCapsule.context_id = capsuleContextId(newerCapsule);
    writeFullCapsule(projectRoot, newerCapsule);
    const newerBytes = fs.readFileSync(phaseContextPath(projectRoot));

    const closed = expectSuccess(finish(projectRoot, started), "OPERATION_FINISHED");
    assert.deepEqual(closed.delivery_warnings, [{
      code: "CONTEXT_FILE_CLEANUP_FAILED",
      message: ".statectl-tmp/phase-context.json belongs to a different operation and was left unchanged",
    }]);
    assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), newerBytes);
    assert.equal(readState(projectRoot).state_meta.active_operation, null);
  });

  await t.test("cleanup cannot delete replacements across preview and claim races", async () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), "CREATED");
    const started = expectSuccess(execute(projectRoot, "begin", {
      args: ["--context-file"],
      payload: {
        ...expected(opened),
        route: "team_lead",
        intent_summary: "Exercise atomic context cleanup.",
      },
    }), "BEGAN_LEAD");
    const originalCapsule = JSON.parse(
      fs.readFileSync(phaseContextPath(projectRoot), "utf8"),
    );
    const previewMarkerName = `.phase-context.preview-ready-${crypto.randomUUID()}`;
    const previewMarkerPath = path.join(
      path.dirname(phaseContextPath(projectRoot)),
      previewMarkerName,
    );
    const finishPromise = executeAsync(projectRoot, "finish", {
      env: {
        STATECTL_TEST_CONTEXT_CLEANUP_HOLD_MS: "1500",
        STATECTL_TEST_CONTEXT_CLEANUP_CLAIM_HOLD_MS: "1500",
        STATECTL_TEST_CONTEXT_CLEANUP_PREVIEW_MARKER: previewMarkerName,
      },
      payload: {
        ...expected(started),
        operation_id: started.operation_id,
        updates: {},
        presentation: structuredClone(DEFAULT_PRESENTATION),
      },
    });

    await waitForPath(previewMarkerPath, 10_000);
    assert.equal(readState(projectRoot).state_meta.active_operation, null);
    const firstReplacement = structuredClone(originalCapsule);
    firstReplacement.turn_context.operation.id = crypto.randomUUID();
    firstReplacement.context_id = capsuleContextId(firstReplacement);
    writeFullCapsule(projectRoot, firstReplacement);
    const firstReplacementBytes = fs.readFileSync(phaseContextPath(projectRoot));

    const contextDirectory = path.dirname(phaseContextPath(projectRoot));
    await waitForCondition(
      () => fs.readdirSync(contextDirectory).some(
        (name) => name.startsWith(".phase-context.cleanup-"),
      ),
      "the atomic cleanup claim",
      10_000,
    );
    const secondReplacement = structuredClone(firstReplacement);
    secondReplacement.turn_context.operation.id = crypto.randomUUID();
    secondReplacement.context_id = capsuleContextId(secondReplacement);
    writeFullCapsule(projectRoot, secondReplacement);
    const secondReplacementBytes = fs.readFileSync(phaseContextPath(projectRoot));

    const closed = expectSuccess(await finishPromise, "OPERATION_FINISHED");
    assert.equal(closed.delivery_warnings.length, 1);
    assert.equal(closed.delivery_warnings[0].code, "CONTEXT_FILE_CLEANUP_FAILED");
    assert.match(closed.delivery_warnings[0].message, /different operation/);
    assert.match(closed.delivery_warnings[0].message, /preserved at/);
    assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), secondReplacementBytes);
    const claims = fs.readdirSync(contextDirectory).filter(
      (name) => name.startsWith(".phase-context.cleanup-"),
    );
    assert.equal(claims.length, 1);
    assert.deepEqual(
      fs.readFileSync(path.join(contextDirectory, claims[0])),
      firstReplacementBytes,
    );
  });

  await t.test("finish reports cleanup failure without reversing closeout", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), "CREATED");
    const started = expectSuccess(execute(projectRoot, "begin", {
      args: ["--context-file"],
      payload: {
        ...expected(opened),
        route: "data_audit",
        intent_summary: "Cancel after testing cleanup.",
      },
    }), "BEGAN_WORKER");
    const closed = expectSuccess(finish(projectRoot, started, {}, {
      cancel: true,
      env: { STATECTL_FAIL_CONTEXT_CLEANUP: "1" },
    }), "OPERATION_CANCELLED");
    assert.deepEqual(closed.delivery_warnings, [{
      code: "CONTEXT_FILE_CLEANUP_FAILED",
      message: "injected phase-context cleanup failure",
    }]);
    assert.equal(readState(projectRoot).state_meta.active_operation, null);
    assert.equal(fs.existsSync(phaseContextPath(projectRoot)), true);
  });
});
test("artifact reservation rejects unsafe paths and late collisions without state mutation", async (t) => {
  const removeDirectoryLink = (linkPath) => {
    if (process.platform === "win32") fs.rmdirSync(linkPath);
    else fs.unlinkSync(linkPath);
  };

  await t.test("a non-string file extension is an input error", (subtest) => {
    const projectRoot = temporaryProject(subtest);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const before = fs.readFileSync(statePath(projectRoot));

    expectFailure(execute(projectRoot, "begin", {
      payload: {
        ...expected(opened),
        route: "data_audit",
        intent_summary: "Reject an invalid artifact extension.",
        artifact_reservation: {
          kind: "file",
          slug: "numeric-extension",
          extension: 7,
        },
      },
    }), "INVALID_INPUT");

    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    assert.equal(readState(projectRoot).state_meta.active_operation, null);
  });

  await t.test("an output root linked outside the project is rejected", (subtest) => {
    const projectRoot = temporaryProject(subtest);
    const outsideRoot = temporaryProject(subtest);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const outputRoot = path.join(projectRoot, "output");
    try {
      fs.symlinkSync(outsideRoot, outputRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        subtest.skip(`directory links are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    const before = fs.readFileSync(statePath(projectRoot));
    try {
      expectFailure(execute(projectRoot, "begin", {
        payload: {
          ...expected(opened),
          route: "data_audit",
          intent_summary: "Do not reserve output outside the project.",
          artifact_reservation: {
            kind: "file",
            slug: "outside-output",
            extension: "csv",
          },
        },
      }), "INVALID_ARTIFACT_PATH");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
      assert.equal(readState(projectRoot).state_meta.active_operation, null);
      assert.deepEqual(fs.readdirSync(outsideRoot), []);
    } finally {
      removeDirectoryLink(outputRoot);
    }
  });


  await t.test("an output root linked elsewhere inside the project is rejected", (subtest) => {
    const projectRoot = temporaryProject(subtest);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const redirectedRoot = path.join(projectRoot, "redirected-output");
    fs.mkdirSync(redirectedRoot);
    const outputRoot = path.join(projectRoot, "output");
    try {
      fs.symlinkSync(
        redirectedRoot,
        outputRoot,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
        subtest.skip(`directory links are unavailable: ${error.code}`);
        return;
      }
      throw error;
    }

    const before = fs.readFileSync(statePath(projectRoot));
    try {
      expectFailure(execute(projectRoot, "begin", {
        payload: {
          ...expected(opened),
          route: "data_audit",
          intent_summary: "Keep generated output inside the output directory.",
          artifact_reservation: {
            kind: "file",
            slug: "inside-project-redirect",
            extension: "csv",
          },
        },
      }), "INVALID_ARTIFACT_PATH");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
      assert.equal(readState(projectRoot).state_meta.active_operation, null);
      assert.deepEqual(fs.readdirSync(redirectedRoot), []);
    } finally {
      removeDirectoryLink(outputRoot);
    }
  });
  await t.test("a dangling output-root link is rejected", (subtest) => {
    const projectRoot = temporaryProject(subtest);
    const outsideRoot = temporaryProject(subtest);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const outputRoot = path.join(projectRoot, "output");
    const missingTarget = path.join(outsideRoot, "missing-output");
    try {
      fs.symlinkSync(missingTarget, outputRoot, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      subtest.skip(`dangling directory links are unavailable: ${error.code || error.message}`);
      return;
    }

    const before = fs.readFileSync(statePath(projectRoot));
    try {
      expectFailure(execute(projectRoot, "begin", {
        payload: {
          ...expected(opened),
          route: "data_audit",
          intent_summary: "Reject a dangling output root.",
          artifact_reservation: {
            kind: "directory",
            slug: "dangling-output",
          },
        },
      }), "INVALID_ARTIFACT_PATH");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
      assert.equal(readState(projectRoot).state_meta.active_operation, null);
    } finally {
      removeDirectoryLink(outputRoot);
    }
  });

  await t.test("begin rejects a collision found by its final inspection", (subtest) => {
    const projectRoot = temporaryProject(subtest);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const outputRoot = path.join(projectRoot, "output");
    fs.mkdirSync(outputRoot);
    const before = fs.readFileSync(statePath(projectRoot));
    const originalLstat = fs.lstatSync;
    let target = null;
    let targetInspections = 0;
    fs.lstatSync = function lstatWithBeginReservationRace(filePath, ...args) {
      const candidate = path.resolve(filePath);
      const isTarget = (
        path.dirname(candidate) === outputRoot
        && /^begin-race-[0-9a-f]{8}\.csv$/.test(path.basename(candidate))
      );
      if (!isTarget) return originalLstat.call(fs, filePath, ...args);
      target ??= candidate;
      targetInspections += 1;
      try {
        return originalLstat.call(fs, filePath, ...args);
      } catch (error) {
        if (
          candidate === target
          && targetInspections === 1
          && error
          && ["ENOENT", "ENOTDIR"].includes(error.code)
        ) {
          fs.writeFileSync(target, "late collision\n", "utf8");
        }
        throw error;
      }
    };
    try {
      assert.throws(
        () => beginSourceOperation({
          projectRoot,
          payload: {
            ...expected(opened),
            route: "data_audit",
            intent_summary: "Reject a late begin-time collision.",
            artifact_reservation: {
              kind: "file",
              slug: "begin-race",
              extension: "csv",
            },
          },
        }),
        (error) => error && error.code === "ARTIFACT_COLLISION",
      );
    } finally {
      fs.lstatSync = originalLstat;
    }

    assert.ok(targetInspections >= 2);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    assert.equal(readState(projectRoot).state_meta.active_operation, null);
    if (target !== null) fs.rmSync(target, { force: true });
  });

  await t.test("reserve-artifact rejects a collision found by its final inspection", (subtest) => {
    const projectRoot = temporaryProject(subtest);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
    const outputRoot = path.join(projectRoot, "output");
    fs.mkdirSync(outputRoot);
    const target = path.join(
      outputRoot,
      `reserve-race-${started.operation_id.slice(0, 8)}.csv`,
    );
    const before = fs.readFileSync(statePath(projectRoot));
    const originalLstat = fs.lstatSync;
    let targetInspections = 0;
    fs.lstatSync = function lstatWithReservationRace(filePath, ...args) {
      if (path.resolve(filePath) !== target) {
        return originalLstat.call(fs, filePath, ...args);
      }
      targetInspections += 1;
      try {
        return originalLstat.call(fs, filePath, ...args);
      } catch (error) {
        if (
          targetInspections === 1
          && error
          && ["ENOENT", "ENOTDIR"].includes(error.code)
        ) {
          fs.writeFileSync(target, "late collision\n", "utf8");
        }
        throw error;
      }
    };
    try {
      assert.throws(
        () => reserveSourceArtifact({
          projectRoot,
          payload: {
            ...expected(started),
            operation_id: started.operation_id,
            kind: "file",
            slug: "reserve-race",
            extension: "csv",
          },
        }),
        (error) => error && error.code === "ARTIFACT_COLLISION",
      );
    } finally {
      fs.lstatSync = originalLstat;
    }

    assert.ok(targetInspections >= 2);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
    const state = readState(projectRoot);
    assert.equal(state.state_meta.revision, started.revision);
    assert.equal(state.state_meta.active_operation.artifact_intent, null);
    fs.rmSync(target, { force: true });
    expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
  });
});
test("context-file mode supports a team-lead-only lifecycle", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "CREATED");
  const started = expectSuccess(execute(projectRoot, "begin", {
    args: ["--context-file"],
    payload: {
      ...expected(opened),
      route: "team_lead",
      intent_summary: "Close one lead-only operation.",
    },
  }), "BEGAN_LEAD");

  const lead = readPhaseContext(projectRoot);
  assert.equal(lead.phase, "lead");
  assert.equal(lead.completion_command, "finish");
  assert.equal(lead.turn_context.actor, "team_lead");
  assert.equal(lead.turn_context.stage, "lead_pending");
  assertRequiredReferences(lead, ["references/team_lead.md", "references/team_lead_audience.md"]);
  assertContextReference(started, lead, "lead");

  const stateBytes = fs.readFileSync(statePath(projectRoot));
  const contextBytes = fs.readFileSync(phaseContextPath(projectRoot));
  const resumed = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "RESUME_LEAD");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), stateBytes);
  assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), contextBytes);
  assert.deepEqual(resumed.context_ref, started.context_ref);

  expectSuccess(finish(projectRoot, started), "OPERATION_FINISHED");
  assert.equal(fs.existsSync(phaseContextPath(projectRoot)), false);
});

test("exact analysis and report scopes reach their worker capsules", async (t) => {
  const scenarios = [
    {
      name: "analysis",
      prepare: (projectRoot) => prepareAnalysisScope(
        projectRoot,
        "single_time_observational",
        "statistical-validity",
      ),
      route: "analysis_execution.single_time_observational",
      actor: "analysis_execution.single_time_observational",
      support: "statistical-validity",
      references: [
        "references/design_execution_contract.md",
        "references/design/single_time_observational.md",
        "references/support/statistical-validity.md",
        "references/artifact_output_policy.md",
      ],
    },
    {
      name: "report",
      prepare: (projectRoot) => prepareReportScope(projectRoot),
      route: "report_writer",
      actor: "report_writer",
      support: null,
      references: [
        "references/report_writer.md",
        "assets/report_template_planning.md",
        "assets/report_html_layout_template.html",
        "references/artifact_output_policy.md",
      ],
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, (subtest) => {
      const projectRoot = temporaryProject(subtest);
      const prepared = scenario.prepare(projectRoot);
      const opened = expectSuccess(execute(projectRoot, "open", {
        args: ["--context-file"],
      }), "OPENED");
      const started = expectSuccess(execute(projectRoot, "begin", {
        args: ["--context-file"],
        payload: {
          ...expected(opened),
          route: scenario.route,
          intent_summary: "Execute the exact ready scope.",
          ...(scenario.support === null ? {} : { support: scenario.support }),
          scope_ref: prepared.scope_ref,
        },
      }), "BEGAN_WORKER");

      const worker = readPhaseContext(projectRoot);
      assert.equal(worker.phase, "worker");
      assert.equal(worker.turn_context.actor, scenario.actor);
      assert.deepEqual(worker.turn_context.operation.scope_ref, prepared.scope_ref);
      assert.deepEqual(worker.operation_packet.scope_ref, prepared.scope_ref);
      assertRequiredReferences(worker, scenario.references);
      assertContextReference(started, worker, "worker");
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
});

test("numbered selection can reserve its selected worker output in one begin", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open", {
    args: ["--context-file"],
  }), "CREATED");
  const lead = expectSuccess(execute(projectRoot, "begin", {
    args: ["--context-file"],
    payload: {
      ...expected(opened),
      route: "team_lead",
      intent_summary: "Offer one durable next choice.",
    },
  }), "BEGAN_LEAD");
  const menu = expectSuccess(finish(projectRoot, lead, {}, {
    presentation: optionsPresentation([
      decisionOption("Audit the data", "data_audit"),
      decisionOption("Review the domain", "domain_expert"),
    ]),
  }), "OPERATION_FINISHED");

  const selected = expectSuccess(execute(projectRoot, "begin", {
    args: ["--context-file"],
    payload: {
      ...expected(menu),
      selection: {
        decision_id: menu.pending_decision.decision_id,
        option_number: 1,
      },
      artifact_reservation: {
        kind: "file",
        slug: "selected-audit",
        extension: "csv",
      },
    },
  }), "BEGAN_WORKER");

  assert.equal(selected.revision, menu.revision + 1);
  const worker = readPhaseContext(projectRoot);
  assert.equal(worker.turn_context.actor, "data_audit");
  assert.equal(worker.turn_context.operation.intent_summary, "Exercise audit the data");
  assert.deepEqual(
    worker.turn_context.operation.artifact_intent,
    selected.artifact_intent,
  );
  assert.equal(worker.turn_context.artifact_status.temporary_path, selected.temporary_path);
  assert.ok(worker.required_references.includes("references/artifact_output_policy.md"));
  assert.equal(readState(projectRoot).pending_decision, null);
  assertContextReference(selected, worker, "worker");
  expectSuccess(finish(projectRoot, selected, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("legacy, inline capsule, and context-file open modes are equivalent at every stage", (t) => {
  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");

  const compareModes = (expectedCode) => {
    const stateBytes = fs.readFileSync(statePath(projectRoot));
    const legacy = expectSuccess(execute(projectRoot, "open"), expectedCode);
    const inline = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-protocol", PHASE_CONTEXT_PROTOCOL],
    }), expectedCode);
    const compact = expectSuccess(execute(projectRoot, "open", {
      args: ["--context-file"],
    }), expectedCode);
    const capsule = readPhaseContext(projectRoot);

    assert.deepEqual(capsule, inline.phase_capsule);
    assert.deepEqual(capsule.turn_context, legacy.turn_context);
    assert.deepEqual(capsule.operation_packet, legacy.operation_packet);
    assert.deepEqual(capsule.required_references, legacy.required_references);
    assert.equal(compact.context_ref.context_id, capsule.context_id);
    assert.equal(capsuleContextId(capsule), capsule.context_id);
    assert.deepEqual(fs.readFileSync(statePath(projectRoot)), stateBytes);

    const tampered = structuredClone(capsule);
    tampered.turn_context.revision += 1;
    assert.notEqual(capsuleContextId(tampered), tampered.context_id);
    const contextBytes = fs.readFileSync(phaseContextPath(projectRoot));
    assert.throws(
      () => writeFullCapsule(projectRoot, tampered),
      (error) => error && error.code === "CONTEXT_FILE_WRITE_FAILED",
    );
    assert.deepEqual(fs.readFileSync(phaseContextPath(projectRoot)), contextBytes);
    return legacy;
  };

  const idle = compareModes("OPENED");
  const started = expectSuccess(begin(projectRoot, idle, "data_audit"), "BEGAN_WORKER");
  compareModes("RESUME_WORKER");

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: {
          data_checked: "passing",
          data_sources: ["data/input.csv"],
          audit_scope: "Phase transport equivalence",
          unit_of_observation: "Participant",
        },
        council_chamber: {
          data_audit: {
            current_status: "complete",
            summary: "The phase transport evidence is equivalent.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");

  compareModes("RESUME_LEAD");
  expectSuccess(finish(projectRoot, applied), "OPERATION_FINISHED");
});

test("audience_profile defaults to unstated and round-trips through team-lead finish", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  assert.deepEqual(readState(projectRoot).project_summary.audience_profile, {
    level: "unstated",
    evidence: null,
    preferences: [],
  });

  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  expectSuccess(finish(projectRoot, started, {
    project_summary: {
      audience_profile: {
        level: "novice",
        evidence: "User said they know very little about causal inference.",
        preferences: ["Plain language first"],
      },
    },
  }), "OPERATION_FINISHED");

  const profile = readState(projectRoot).project_summary.audience_profile;
  assert.deepEqual(profile, {
    level: "novice",
    evidence: "User said they know very little about causal inference.",
    preferences: ["Plain language first"],
  });
  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.deepEqual(reopened.turn_context.state.project_summary.audience_profile, profile);
  const reportWorker = expectSuccess(
    begin(projectRoot, reopened, "report_writer"),
    "BEGAN_WORKER",
  );
  assert.deepEqual(
    reportWorker.turn_context.state.project_summary.audience_profile,
    profile,
  );
  const reportCancelled = expectSuccess(
    finish(projectRoot, reportWorker, {}, { cancel: true }),
    "OPERATION_CANCELLED",
  );
  const lead = expectSuccess(begin(projectRoot, reportCancelled, "team_lead"), "BEGAN_LEAD");
  assert.deepEqual(lead.turn_context.state.project_summary.audience_profile, profile);
  expectSuccess(finish(projectRoot, lead, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("audience_profile rejects unsupported shapes without mutating state", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  const rejected = [
    { level: "guru", evidence: "Made up level.", preferences: [] },
    { level: "novice", evidence: null, preferences: [] },
    { level: "unstated", evidence: "Cannot justify an unstated level.", preferences: [] },
    { level: "expert", evidence: "  untrimmed  ", preferences: [] },
    { level: "applied", evidence: "Fine.", preferences: ["a", "b", "c", "d"] },
    { level: "applied", evidence: "Fine.", preferences: ["same", "same"] },
    { level: "applied", evidence: "Fine.", preferences: [""] },
    { level: "applied", evidence: "Fine.", preferences: [], extra: true },
    { level: "applied", preferences: [] },
    "novice",
  ];
  for (const audience_profile of rejected) {
    expectFailure(finish(projectRoot, started, {
      project_summary: { audience_profile },
    }), "INVALID_STATE");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  }
  expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("a worker route cannot write the audience profile", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      actor: "data_audit",
      updates: {
        project_summary: {
          audience_profile: { level: "expert", evidence: "Not this route's call.", preferences: [] },
        },
      },
    },
  }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("schema-7 migration adds conservative schema-9 consultation state", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  expectSuccess(finish(projectRoot, started, {
    project_summary: {
      title: "Pre-migration project",
      audience_profile: {
        level: "trained",
        evidence: "User referenced their own IV specification.",
        preferences: [],
      },
    },
  }), "OPERATION_FINISHED");

  const v7 = downgradeCurrentStateToV7(projectRoot);
  assert.equal("audience_profile" in v7.project_summary, false);
  assert.equal("carried_questions" in v7, false);
  const original = fs.readFileSync(statePath(projectRoot), "utf8");

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V7");
  assert.equal(fs.readFileSync(migrated.archive_path, "utf8"), original);
  assert.equal(migrated.project_id, v7.state_meta.project_id);
  assert.equal(migrated.revision, v7.state_meta.revision + 1);

  const current = readState(projectRoot);
  assert.equal(current.state_meta.schema_version, 9);
  // the migration must not invent a level from prior content
  assert.deepEqual(current.project_summary, {
    ...v7.project_summary,
    audience_profile: { level: "unstated", evidence: null, preferences: [] },
  });
  assert.deepEqual(current.carried_questions, []);
  assert.deepEqual(current.report_assembly, {
    ...v7.report_assembly,
    claim_boundary: null,
  });
  assert.deepEqual(current.causal_facts, v7.causal_facts);

  // migrating again is a no-op beyond the version it already carries
  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.equal(reopened.revision, current.state_meta.revision);
});

test("a state claiming v7 while already carrying newer consultation controls is refused", (t) => {
  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");
  const state = readState(projectRoot);
  state.state_meta.schema_version = 7;
  delete state.carried_questions;
  writeState(projectRoot, state);
  expectFailure(execute(projectRoot, "open"), "UNSUPPORTED_SCHEMA");
});

test("schema-8 migration preserves current provenance and marks missing wording explicitly", async (t) => {
  for (const legacySources of [true, false]) {
    await t.test(legacySources ? "legacy source shape" : "current source shape", () => {
      const projectRoot = temporaryProject(t);
      const question = "Was treatment timing recorded before outcome measurement?";
      const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
      const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
      const applied = applyDataAuditQuestion(projectRoot, started, question);
      let prior = expectSuccess(finish(projectRoot, applied, {}, {
        questionActions: [recordQuestion(question)],
      }), "OPERATION_FINISHED");

      if (legacySources) {
        const entry = readState(projectRoot).carried_questions[0];
        const lead = expectSuccess(begin(projectRoot, prior, "team_lead"), "BEGAN_LEAD");
        prior = expectSuccess(finish(projectRoot, lead, {}, {
          questionActions: [retireQuestion(
            entry.question_id,
            "answered",
            "The researcher confirmed treatment timing precedes outcome measurement.",
          )],
        }), "OPERATION_FINISHED");
      } else {
        prior = expectSuccess(begin(projectRoot, prior, "data_audit"), "BEGAN_WORKER");
      }

      const v8 = downgradeCurrentStateToV8(projectRoot, { legacySources });
      const original = fs.readFileSync(statePath(projectRoot));
      const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V8");
      assert.deepEqual(fs.readFileSync(migrated.archive_path), original);
      assert.equal(migrated.revision, v8.state_meta.revision + 1);
      assert.equal(migrated.mode, legacySources ? "idle" : "resume_worker");

      const current = readState(projectRoot);
      assert.equal(current.state_meta.schema_version, 9);
      assert.equal(current.report_assembly.claim_boundary, null);
      const expectedEntry = structuredClone(v8.carried_questions[0]);
      if (legacySources) {
        for (const field of ["first_source", "last_source"]) {
          expectedEntry[field].source_kind = "legacy_v8";
          expectedEntry[field].source_text = null;
        }
      }
      assert.deepEqual(current.carried_questions, [expectedEntry]);
      if (legacySources) {
        assert.equal(current.carried_questions[0].status, "retired");
        assert.deepEqual(
          current.carried_questions[0].resolution,
          v8.carried_questions[0].resolution,
        );
        assert.deepEqual(current.response_receipt, {
          ...v8.response_receipt,
          revision: v8.state_meta.revision + 1,
        });
      } else {
        assert.deepEqual(current.state_meta.active_operation, v8.state_meta.active_operation);
      }

      const migratedBytes = fs.readFileSync(statePath(projectRoot));
      expectSuccess(execute(projectRoot, "open"), legacySources ? "OPENED" : "RESUME_WORKER");
      assert.deepEqual(fs.readFileSync(statePath(projectRoot)), migratedBytes);
      if (!legacySources) {
        expectSuccess(finish(projectRoot, {
          ...migrated,
          operation_id: migrated.active_operation.id,
        }, {}, { cancel: true }), "OPERATION_CANCELLED");
      }
    });
  }

  await t.test("empty ledger", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    const v8 = downgradeCurrentStateToV8(projectRoot);
    const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V8");
    assert.equal(migrated.revision, v8.state_meta.revision + 1);
    assert.deepEqual(readState(projectRoot).carried_questions, []);
  });
});

test("schema-8 active report must revise a missing claim boundary before completion", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareReportScope(projectRoot);
  expectSuccess(begin(projectRoot, prepared, "report_writer", {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  downgradeCurrentStateToV8(projectRoot);

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V8");
  assert.equal(migrated.mode, "resume_worker");
  assert.equal(readState(projectRoot).report_assembly.claim_boundary, null);
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(migrated),
      operation_id: migrated.active_operation.id,
      kind: "file",
      slug: "migrated-v8-report",
      extension: "html",
    },
  }), "ARTIFACT_RESERVED");
  const beforeRejectedCompletion = fs.readFileSync(statePath(projectRoot));

  const rejected = expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: reserved.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: {
        report_assembly: { current_format: "html" },
        council_chamber: {
          report_writer: { current_status: "done" },
        },
      },
      artifact: scopedArtifact(reserved, "Rejected boundary-free report."),
    },
  }), "SCOPE_MISMATCH");
  assert.deepEqual(rejected.details.missing_fields, ["claim_boundary"]);
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), beforeRejectedCompletion);

  const repaired = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: reserved.operation_id,
      actor: "report_writer",
      scope_transition: "revise",
      updates: {
        report_assembly: {
          claim_boundary: "Report only claims supported by the explicitly bound evidence.",
          analysis_artifact_ids: [],
        },
        council_chamber: {
          report_writer: { current_status: "ready" },
        },
      },
    },
  }), "WORKER_APPLIED");
  const repairClosed = expectSuccess(finish(projectRoot, repaired), "OPERATION_FINISHED");
  const repairedScope = readState(projectRoot).report_assembly;
  const approved = expectSuccess(begin(projectRoot, repairClosed, "report_writer", {
    scope_ref: {
      kind: "report",
      id: repairedScope.scope_id,
      revision: repairedScope.scope_revision,
    },
  }), "BEGAN_WORKER");
  const output = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(approved),
      operation_id: approved.operation_id,
      kind: "file",
      slug: "repaired-v8-report",
      extension: "html",
    },
  }), "ARTIFACT_RESERVED");
  writeReservedTemporary(projectRoot, output, "<!doctype html><title>Repaired report</title>\n");
  const completed = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(output),
      operation_id: output.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: {
        report_assembly: { current_format: "html" },
        council_chamber: {
          report_writer: { current_status: "done" },
        },
      },
      artifact: scopedArtifact(output, "Completed repaired schema-8 report."),
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, completed), "OPERATION_FINISHED");
  assert.equal(
    readState(projectRoot).report_assembly.claim_boundary,
    "Report only claims supported by the explicitly bound evidence.",
  );
});

test("schema-8 completed report closes under its frozen legacy contract", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareReportScope(projectRoot);
  const started = expectSuccess(begin(projectRoot, prepared, "report_writer", {
    scope_ref: prepared.scope_ref,
  }), "BEGAN_WORKER");
  const reserved = expectSuccess(execute(projectRoot, "reserve-artifact", {
    payload: {
      ...expected(started),
      operation_id: started.operation_id,
      kind: "file",
      slug: "completed-v8-report",
      extension: "html",
    },
  }), "ARTIFACT_RESERVED");
  writeReservedTemporary(projectRoot, reserved, "<!doctype html><title>Legacy completed report</title>\n");
  expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: reserved.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: {
        report_assembly: { current_format: "html" },
        council_chamber: {
          report_writer: { current_status: "done" },
        },
      },
      artifact: scopedArtifact(reserved, "Completed report before migration."),
    },
  }), "WORKER_APPLIED");

  const reportState = readState(projectRoot);
  const schema8Bundle = legacyReportContractBundle(
    reportState.report_assembly,
    { includeEvidenceBinding: true },
  );
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const evidenceFile = manifest.execution_receipt.evidence_files[0];
  manifest.requirements = schema8Bundle.requirements;
  manifest.execution_receipt.contract_hash = schema8Bundle.contractHash;
  manifest.execution_receipt.completed_requirements =
    schema8Bundle.requirements.map((requirement) => requirement.id);
  manifest.execution_receipt.unmet_requirements = [];
  manifest.execution_receipt.requirement_evidence =
    schema8Bundle.requirements.map((requirement) => ({
      requirement_id: requirement.id,
      file: evidenceFile,
      locator: `Evidence for ${requirement.id}`,
    }));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  downgradeCurrentStateToV8(projectRoot);

  const migrated = expectSuccess(execute(projectRoot, "open"), "MIGRATED_V8");
  assert.equal(migrated.mode, "resume_lead");
  assert.equal(migrated.artifact_status.location_state, "complete");
  assert.equal(readState(projectRoot).report_assembly.claim_boundary, null);
  expectSuccess(finish(projectRoot, {
    ...migrated,
    operation_id: migrated.active_operation.id,
  }), "OPERATION_FINISHED");
  assert.equal(readState(projectRoot).state_meta.active_operation, null);
});

test("partial schema-8 question provenance fails without mutation or archive", (t) => {
  const projectRoot = temporaryProject(t);
  const question = "Was the treatment timestamp recorded prospectively?";
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const applied = applyDataAuditQuestion(projectRoot, started, question);
  const closed = expectSuccess(finish(projectRoot, applied, {}, {
    questionActions: [recordQuestion(question)],
  }), "OPERATION_FINISHED");
  const v8 = downgradeCurrentStateToV8(projectRoot);
  delete v8.carried_questions[0].first_source.source_text;
  writeState(projectRoot, v8);
  const before = fs.readFileSync(statePath(projectRoot));

  expectFailure(execute(projectRoot, "open"), "UNSUPPORTED_SCHEMA");
  assert.deepEqual(fs.readFileSync(statePath(projectRoot)), before);
  assert.equal(fs.existsSync(path.join(projectRoot, "project_state.archives")), false);
  assert.equal(closed.project_id, v8.state_meta.project_id);
});

test("schema 9 requires the carried-question ledger", (t) => {
  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");
  const state = readState(projectRoot);
  delete state.carried_questions;
  writeState(projectRoot, state);
  expectFailure(execute(projectRoot, "open"), "INVALID_STATE");
});

test("lead phase selects question and audience modules from state and computes directives", (t) => {
  const projectRoot = temporaryProject(t);
  const question = "Is the enrollment date recorded per patient or only per site cohort?";
  const audienceUnstated = {
    kind: "audience_unstated",
    instruction: "The audience level is unstated. Set project_summary.audience_profile only if this turn's message or committed project evidence demonstrates the user's statistical fluency; otherwise leave it unstated and explain at a neutral depth.",
  };

  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  assert.deepEqual(opened.turn_context.directives, []);
  const firstStarted = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  assert.deepEqual(firstStarted.turn_context.directives, []);
  assertRequiredReferences(firstStarted, ["references/data_audit.md"]);

  const firstApplied = applyDataAuditQuestion(projectRoot, firstStarted, question);
  assertRequiredReferences(firstApplied, [
    "references/team_lead.md",
    "references/team_lead_questions.md",
    "references/team_lead_audience.md",
  ]);
  assert.deepEqual(firstApplied.turn_context.directives, [
    audienceUnstated,
    {
      kind: "handoff_questions",
      count: 1,
      instruction: "The current handoff raised 1 question(s) for the user. Record each material one through question_actions with its exact committed text; surface at most one this turn.",
    },
  ]);

  expectSuccess(finish(projectRoot, firstApplied, {
    project_summary: {
      audience_profile: { level: "applied", evidence: "runs regressions in R", preferences: [] },
    },
  }, { questionActions: [recordQuestion(question)] }), "OPERATION_FINISHED");
  const questionId = readState(projectRoot).carried_questions[0].question_id;

  const idle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const leadOnly = expectSuccess(begin(projectRoot, idle, "team_lead"), "BEGAN_LEAD");
  assertRequiredReferences(leadOnly, ["references/team_lead.md", "references/team_lead_questions.md"]);
  assert.deepEqual(leadOnly.turn_context.directives, [{
    kind: "open_questions_summary",
    open: 1,
    never_surfaced: 1,
    overdue: 0,
    omitted_from_directives: 0,
    instruction: "Surface at most one carried question per turn: the one whose answer would change the most. Omitting an open question from question_actions holds it unchanged.",
  }]);
  expectSuccess(finish(projectRoot, leadOnly, {}, { cancel: true }), "OPERATION_CANCELLED");

  const secondIdle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const secondStarted = expectSuccess(begin(projectRoot, secondIdle, "data_audit"), "BEGAN_WORKER");
  const secondApplied = applyDataAuditQuestion(projectRoot, secondStarted, question);
  expectSuccess(finish(projectRoot, secondApplied, {}, {
    questionActions: [recordQuestion(question, { questionId })],
  }), "OPERATION_FINISHED");

  const thirdIdle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const overdueLead = expectSuccess(begin(projectRoot, thirdIdle, "team_lead"), "BEGAN_LEAD");
  assert.equal(overdueLead.turn_context.directives[0].kind, "question_overdue");
  assert.equal(overdueLead.turn_context.directives[0].question_id, questionId);
  assert.equal(overdueLead.turn_context.directives[0].source_operation_count, 2);
  assert.equal(overdueLead.turn_context.directives.at(-1).overdue, 1);
  const surfacePresentation = structuredClone(DEFAULT_PRESENTATION);
  surfacePresentation.next_steps = "Share your data files. " + question;
  expectSuccess(finish(projectRoot, overdueLead, {}, {
    presentation: surfacePresentation,
    questionActions: [surfaceQuestion(questionId)],
  }), "OPERATION_FINISHED");

  const fourthIdle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const awaitingLead = expectSuccess(begin(projectRoot, fourthIdle, "team_lead"), "BEGAN_LEAD");
  assert.equal(awaitingLead.turn_context.directives[0].kind, "question_awaiting_answer");
  assert.equal(awaitingLead.turn_context.directives[0].question_id, questionId);
  expectSuccess(finish(projectRoot, awaitingLead, {}, {
    questionActions: [retireQuestion(questionId, "answered", "Per patient, confirmed by the user.")],
  }), "OPERATION_FINISHED");

  const fifthIdle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const quietLead = expectSuccess(begin(projectRoot, fifthIdle, "team_lead"), "BEGAN_LEAD");
  assertRequiredReferences(quietLead, ["references/team_lead.md"]);
  assert.deepEqual(quietLead.turn_context.directives, []);
  expectSuccess(finish(projectRoot, quietLead, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("carried questions preserve provenance and lifecycle across operations", (t) => {
  const projectRoot = temporaryProject(t);
  const firstQuestion = "Does treatment begin before outcome measurement?";
  const repeatedQuestion = "Can you confirm whether treatment begins before the outcome is measured?";
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");

  const firstStarted = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const firstApplied = applyDataAuditQuestion(projectRoot, firstStarted, firstQuestion);
  const firstClosed = expectSuccess(finish(projectRoot, firstApplied, {}, {
    questionActions: [recordQuestion(firstQuestion)],
  }), "OPERATION_FINISHED");

  const firstState = readState(projectRoot);
  assert.equal(firstState.carried_questions.length, 1);
  const initial = structuredClone(firstState.carried_questions[0]);
  assert.match(initial.question_id, /^[0-9a-f-]{36}$/);
  assert.equal(initial.question, firstQuestion);
  assert.deepEqual(initial.first_source, {
    actor: "data_audit",
    operation_id: firstStarted.operation_id,
    revision: firstClosed.revision,
    source_kind: "handoff",
    source_text: firstQuestion,
  });
  assert.deepEqual(initial.last_source, initial.first_source);
  assert.equal(initial.source_operation_count, 1);
  assert.equal(initial.status, "open");
  assert.equal(initial.first_surfaced_revision, null);
  assert.equal(initial.retired_revision, null);
  assert.equal(initial.resolution, null);
  const summaryUpdated = firstState.project_summary.last_updated;

  const idle = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.deepEqual(idle.turn_context.state.carried_questions, [projectedOpenQuestion(initial)]);
  const secondStarted = expectSuccess(begin(projectRoot, idle, "data_audit"), "BEGAN_WORKER");
  assert.equal(readState(projectRoot).response_receipt, null);
  assert.deepEqual(
    secondStarted.turn_context.state.carried_questions,
    [projectedOpenQuestion(initial)],
  );
  const secondApplied = applyDataAuditQuestion(projectRoot, secondStarted, repeatedQuestion);
  assert.deepEqual(secondApplied.turn_context.state.carried_questions, [initial]);

  const surfacePresentation = structuredClone(DEFAULT_PRESENTATION);
  surfacePresentation.next_steps = "Please answer this before the next analysis: " + firstQuestion;
  const secondClosed = expectSuccess(finish(projectRoot, secondApplied, {}, {
    presentation: surfacePresentation,
    questionActions: [recordQuestion(repeatedQuestion, {
      questionId: initial.question_id,
      surface: true,
    })],
  }), "OPERATION_FINISHED");
  const repeated = readState(projectRoot).carried_questions[0];
  assert.equal(repeated.question, firstQuestion);
  assert.deepEqual(repeated.first_source, initial.first_source);
  assert.deepEqual(repeated.last_source, {
    actor: "data_audit",
    operation_id: secondStarted.operation_id,
    revision: secondClosed.revision,
    source_kind: "handoff",
    source_text: repeatedQuestion,
  });
  assert.equal(repeated.source_operation_count, 2);
  assert.equal(repeated.first_surfaced_revision, secondClosed.revision);

  const retirementStarted = expectSuccess(
    begin(projectRoot, secondClosed, "team_lead"),
    "BEGAN_LEAD",
  );
  assert.deepEqual(retirementStarted.turn_context.state.carried_questions, [repeated]);
  const retirementClosed = expectSuccess(finish(projectRoot, retirementStarted, {}, {
    questionActions: [retireQuestion(
      repeated.question_id,
      "answered",
      "The user confirmed that treatment precedes outcome measurement.",
    )],
  }), "OPERATION_FINISHED");
  const retired = readState(projectRoot).carried_questions[0];
  assert.equal(retired.status, "retired");
  assert.equal(retired.retired_revision, retirementClosed.revision);
  assert.deepEqual(retired.resolution, {
    kind: "answered",
    note: "The user confirmed that treatment precedes outcome measurement.",
  });
  assert.equal(readState(projectRoot).project_summary.last_updated, summaryUpdated);

  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.deepEqual(
    reopened.turn_context.state.carried_questions,
    [projectedRetiredQuestion(retired)],
  );
  const worker = expectSuccess(begin(projectRoot, reopened, "data_audit"), "BEGAN_WORKER");
  assert.deepEqual(
    worker.turn_context.state.carried_questions,
    [projectedRetiredQuestion(retired)],
  );
  const lead = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(worker),
      operation_id: worker.operation_id,
      actor: "data_audit",
      updates: {
        data_facts: { data_checked: "limited" },
        council_chamber: {
          data_audit: {
            current_status: "limited",
            summary: "No new question was raised.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
    },
  }), "WORKER_APPLIED");
  assert.deepEqual(lead.turn_context.state.carried_questions, [retired]);
  expectSuccess(finish(projectRoot, lead, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("surface actions are atomic and must match the rendered presentation", (t) => {
  const projectRoot = temporaryProject(t);
  const question = "Which outcome definition should govern the primary claim?";
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(finish(projectRoot, started, {}, {
    questionActions: [recordQuestion(question, { surface: true })],
  }), "INVALID_INPUT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);

  const presentation = structuredClone(DEFAULT_PRESENTATION);
  presentation.next_steps = "Please answer this design question: " + question;
  const closed = expectSuccess(finish(projectRoot, started, {}, {
    presentation,
    questionActions: [recordQuestion(question, { surface: true })],
  }), "OPERATION_FINISHED");
  const entry = readState(projectRoot).carried_questions[0];
  assert.equal(entry.first_source.actor, "team_lead");
  assert.equal(entry.first_surfaced_revision, closed.revision);

  const optionsStarted = expectSuccess(
    begin(projectRoot, closed, "team_lead"),
    "BEGAN_LEAD",
  );
  const optionQuestion = "What decision threshold would change the recommendation?";
  const optionPresentation = optionsPresentation([
    decisionOption("Audit", "data_audit"),
    decisionOption("Domain review", "domain_expert"),
  ]);
  optionPresentation.next_steps = optionQuestion;
  const optionsBefore = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(finish(projectRoot, optionsStarted, {}, {
    presentation: optionPresentation,
    questionActions: [recordQuestion(optionQuestion, { surface: true })],
  }), "INVALID_INPUT");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), optionsBefore);

  optionPresentation.framing += " " + optionQuestion;
  expectSuccess(finish(projectRoot, optionsStarted, {}, {
    presentation: optionPresentation,
    questionActions: [recordQuestion(optionQuestion, { surface: true })],
  }), "OPERATION_FINISHED");

  const secondRoot = temporaryProject(t);
  const secondOpened = expectSuccess(execute(secondRoot, "open"), "CREATED");
  const secondStarted = expectSuccess(begin(secondRoot, secondOpened, "team_lead"), "BEGAN_LEAD");
  const first = "Is treatment timing known?";
  const second = "Is outcome measurement blinded?";
  const twoQuestionPresentation = structuredClone(DEFAULT_PRESENTATION);
  twoQuestionPresentation.next_steps = first + " " + second;
  const secondBefore = fs.readFileSync(statePath(secondRoot), "utf8");
  expectFailure(finish(secondRoot, secondStarted, {}, {
    presentation: twoQuestionPresentation,
    questionActions: [
      recordQuestion(first, { surface: true }),
      recordQuestion(second, { surface: true }),
    ],
  }), "INVALID_INPUT");
  assert.equal(fs.readFileSync(statePath(secondRoot), "utf8"), secondBefore);
  expectSuccess(finish(secondRoot, secondStarted, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("question actions enforce ownership, cancellation, and canonical identity", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const worker = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const workerBefore = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(worker),
      operation_id: worker.operation_id,
      actor: "data_audit",
      updates: { carried_questions: [] },
    },
  }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), workerBefore);
  expectFailure(finish(projectRoot, worker, {}, {
    cancel: true,
    questionActions: [recordQuestion("Should this be stored?")],
  }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), workerBefore);
  const cancelled = expectSuccess(
    finish(projectRoot, worker, {}, { cancel: true }),
    "OPERATION_CANCELLED",
  );

  const lead = expectSuccess(begin(projectRoot, cancelled, "team_lead"), "BEGAN_LEAD");
  const leadBefore = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(finish(projectRoot, lead, { carried_questions: [] }), "OWNERSHIP_VIOLATION");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), leadBefore);

  const malformed = [
    null,
    [{}],
    [{ action: "record", question_id: null, source_text: "Missing surface." }],
    [recordQuestion("Two\nlines")],
    [recordQuestion("Invalid id.", { questionId: "not-a-uuid" })],
    [
      recordQuestion("Is the population fixed?"),
      recordQuestion("  IS   THE POPULATION FIXED?  "),
    ],
    [surfaceQuestion(crypto.randomUUID())],
    [retireQuestion(crypto.randomUUID(), "answered", "Unknown question.")],
    Array.from({ length: 21 }, (_, index) => recordQuestion("Question " + index + "?")),
  ];
  for (const questionActions of malformed) {
    expectFailure(finish(projectRoot, lead, {}, { questionActions }), "INVALID_INPUT");
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), leadBefore);
  }
  expectSuccess(finish(projectRoot, lead, {}, { cancel: true }), "OPERATION_CANCELLED");
});

test("strict validation rejects corrupted carried-question history", (t) => {
  const projectRoot = temporaryProject(t);
  const question = "Is the coded exposure the intervention of scientific interest?";
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  expectSuccess(finish(projectRoot, started, {}, {
    questionActions: [recordQuestion(question)],
  }), "OPERATION_FINISHED");
  const valid = readState(projectRoot);

  const mutations = [
    (state) => {
      state.carried_questions.push({
        ...structuredClone(state.carried_questions[0]),
        question_id: crypto.randomUUID(),
      });
    },
    (state) => {
      state.carried_questions[0].first_source.actor = "unknown_actor";
      state.carried_questions[0].last_source.actor = "unknown_actor";
    },
    (state) => {
      state.carried_questions[0].first_source.source_text = "A different first source.";
      state.carried_questions[0].last_source.source_text = "A different first source.";
    },
    (state) => {
      state.carried_questions[0].first_source.source_kind = "handoff";
      state.carried_questions[0].last_source.source_kind = "handoff";
    },
    (state) => {
      state.carried_questions[0].first_source.source_kind = "legacy_v8";
      state.carried_questions[0].last_source.source_kind = "legacy_v8";
    },
    (state) => {
      state.carried_questions[0].first_source.source_text = null;
      state.carried_questions[0].last_source.source_text = null;
    },
    (state) => {
      state.carried_questions[0].source_operation_count = 2;
    },
    (state) => {
      state.carried_questions[0].first_surfaced_revision = state.state_meta.revision + 1;
    },
    (state) => {
      state.carried_questions[0].resolution = {
        kind: "answered",
        note: "Open questions cannot carry retirement data.",
      };
    },
    (state) => {
      const entry = state.carried_questions[0];
      entry.status = "retired";
      entry.retired_revision = entry.last_source.revision - 1;
      entry.resolution = { kind: "answered", note: "Invalid revision order." };
    },
  ];

  for (const mutate of mutations) {
    const corrupted = structuredClone(valid);
    mutate(corrupted);
    writeState(projectRoot, corrupted);
    expectFailure(execute(projectRoot, "open"), "INVALID_STATE");
  }
  writeState(projectRoot, valid);
  expectSuccess(execute(projectRoot, "open"), "OPENED");
});
