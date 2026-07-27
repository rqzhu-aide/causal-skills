"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const YAML = require("yaml");
const ROUTES = require("./route-catalog.json");

const SCHEMA_VERSION = 3;
const MANIFEST_VERSION = 1;
const STATE_FILE = "project_state.yaml";
const ARCHIVE_DIR = "project_state.archives";
const MAX_INTENT_LENGTH = 1000;
const MAX_RESPONSE_TEXT_LENGTH = 1000;
const MAX_ARTIFACT_SLUG_LENGTH = 80;
const WELCOME_LINE = "[Causal-Consultant Loaded] This is a new project. Causal analysis team ready.";
const MENU_NEXT_STEPS = "Choose one option, or suggest another action.";
const RESPONSE_HEADINGS = new Set([
  "[OK Confirmed]",
  "[> Framing]",
  "[+ Consultant Options]",
  "[! Boundary]",
  "[? Next Steps]",
]);
const DERIVED_SUMMARY_FIELDS = [
  "data_audit_complete",
  "domain_knowledge_complete",
  "causal_check_complete",
  "exploration_complete",
  "analysis_output",
  "report_output",
];

const REQUIRED_TOP_LEVEL = [
  "state_meta",
  "project_summary",
  "council_chamber",
  "next_step_plan",
  "pending_decision",
  "response_receipt",
  "data_facts",
  "domain_knowledge",
  "causal_facts",
  "discovery_sidecar",
  "report_assembly",
  "artifact_records",
];

const LEGACY_TOP_LEVEL = REQUIRED_TOP_LEVEL.filter(
  (key) => !["state_meta", "pending_decision", "response_receipt"].includes(key),
);
const V2_TOP_LEVEL = REQUIRED_TOP_LEVEL.filter(
  (key) => !["pending_decision", "response_receipt"].includes(key),
);
const CORE_WORKERS = new Set(ROUTES.core.filter((id) => id !== "team_lead"));
const DESIGN_IDS = new Set(ROUTES.design);
const SUPPORT_IDS = new Set(ROUTES.support);
const ARTIFACT_ACTORS = new Set([
  "data_audit",
  "causal_discovery",
  "report_writer",
]);

const SECTION_KEYS = {
  project_summary: new Set([
    "title",
    "objective",
    "materials",
    "last_updated",
    "phase",
    "data_audit_complete",
    "domain_knowledge_complete",
    "causal_check_complete",
    "exploration_complete",
    "exploration_summary",
    "analysis_output",
    "report_output",
  ]),
  data_facts: new Set([
    "last_updated",
    "data_checked",
    "data_sources",
    "audit_scope",
    "unit_of_observation",
    "variables",
    "structure_notes",
    "timing_notes",
    "dependency_notes",
    "leakage_risks",
    "missingness_notes",
    "support_notes",
    "validity_questions",
    "exploratory_runs",
    "artifact_refs",
  ]),
  domain_knowledge: new Set([
    "last_updated",
    "domain_checked",
    "domain_scope",
    "user_provided",
    "data_facts",
    "construct_notes",
    "measurement_notes",
    "population_setting_notes",
    "domain_practice",
    "source_limitations",
    "practice_searches",
    "references",
  ]),
  causal_facts: new Set([
    "last_updated",
    "causal_checked",
    "analysis_readiness",
    "causal_question",
    "exposure_or_intervention",
    "outcome",
    "estimand",
    "assumptions",
    "threats",
    "support_status",
    "recommended_checks",
    "recommended_method_routes",
  ]),
  discovery_sidecar: new Set([
    "last_updated",
    "status",
    "goal",
    "scope",
    "method_summary",
    "findings",
    "diagnostics",
    "limitations",
    "artifact_refs",
    "reviewer_requests",
  ]),
  report_assembly: new Set([
    "last_updated",
    "scope_id",
    "scope_revision",
    "current_format",
    "report_goal",
    "audience",
    "target_section",
    "planned_structure",
    "key_points",
    "wording_constraints",
    "draft_notes",
  ]),
};

const CHAMBER_KEYS = new Set([
  "last_updated",
  "current_status",
  "summary",
  "questions_for_user",
  "feedback_to_route",
]);
const ANALYSIS_CHAMBER_KEYS = new Set([
  ...CHAMBER_KEYS,
  "scope_id",
  "scope_revision",
  "support",
]);

class StateError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "StateError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new StateError(code, message, details);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, label, code = "INVALID_STATE") {
  if (!isObject(value)) fail(code, `${label} must be a mapping`);
}

function assertArray(value, label, code = "INVALID_STATE") {
  if (!Array.isArray(value)) fail(code, `${label} must be a list`);
}

function assertStringOrNull(value, label, code = "INVALID_STATE") {
  if (value !== null && typeof value !== "string") {
    fail(code, `${label} must be a string or null`);
  }
}

function assertStringArray(value, label, code = "INVALID_STATE") {
  assertArray(value, label, code);
  if (value.some((item) => typeof item !== "string")) {
    fail(code, `${label} must contain only strings`);
  }
}

function assertStringArrayFields(section, fields, label) {
  for (const field of fields) assertStringArray(section[field], `${label}.${field}`);
}

function assertStringOrNullFields(section, fields, label) {
  for (const field of fields) assertStringOrNull(section[field], `${label}.${field}`);
}

function assertEnum(value, allowed, label, code = "INVALID_STATE") {
  if (!allowed.includes(value)) {
    fail(code, `${label} must be one of: ${allowed.map(String).join(", ")}`);
  }
}

function assertKnownKeys(value, allowed, label, code = "INVALID_STATE") {
  if (!isObject(value)) fail(code, `${label} must be a mapping`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    fail(code, `${label} contains unsupported fields: ${unknown.join(", ")}`);
  }
}

function assertExactTopLevel(state, expected = REQUIRED_TOP_LEVEL) {
  assertObject(state, "project state");
  const missing = expected.filter((key) => !(key in state));
  if (missing.length) fail("INVALID_STATE", `missing top-level sections: ${missing.join(", ")}`);
  const extra = Object.keys(state).filter((key) => !expected.includes(key));
  if (extra.length) fail("INVALID_STATE", `unsupported top-level sections: ${extra.join(", ")}`);
}

function normalizeResponseText(value, label, singleLine = false) {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_INPUT", `${label} must be a nonempty string`);
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length > MAX_RESPONSE_TEXT_LENGTH) {
    fail("INVALID_INPUT", `${label} must contain at most ${MAX_RESPONSE_TEXT_LENGTH} characters`);
  }
  if (singleLine && normalized.includes("\n")) {
    fail("INVALID_INPUT", `${label} must be a single line`);
  }
  if (normalized.split("\n").some((line) => {
    const trimmed = line.trim();
    return trimmed.startsWith("[Causal-Consultant Loaded]")
      || [...RESPONSE_HEADINGS].some((heading) => trimmed.startsWith(heading));
  })) {
    fail("INVALID_INPUT", `${label} must not contain a response heading`);
  }
  return normalized;
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isTimestamp(value) {
  if (typeof value !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) && !Number.isNaN(Date.parse(value));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizePath(value) {
  return String(value).replace(/\\/g, "/");
}

function parseYaml(text, label = STATE_FILE) {
  let document;
  try {
    document = YAML.parseDocument(text, {
      schema: "core",
      uniqueKeys: true,
      maxAliasCount: 50,
      prettyErrors: true,
    });
  } catch (error) {
    fail("INVALID_YAML", `${label} could not be parsed: ${error.message}`);
  }
  if (document.errors.length) {
    fail("INVALID_YAML", `${label} could not be parsed: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  try {
    return document.toJS({ maxAliasCount: 50 });
  } catch (error) {
    fail("INVALID_YAML", `${label} could not be converted safely: ${error.message}`);
  }
}

function stringifyYaml(value) {
  return YAML.stringify(value, {
    lineWidth: 0,
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE",
  });
}

function readBytes(filePath) {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    fail("IO_ERROR", `could not read ${filePath}: ${error.message}`);
  }
}

function readText(filePath) {
  return readBytes(filePath).toString("utf8");
}

function atomicWrite(filePath, text) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempPath = path.join(directory, `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`);
  let handle;
  try {
    handle = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(handle, text, "utf8");
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    if (
      process.env.STATECTL_FAIL_BEFORE_RENAME === "1"
      && path.basename(filePath) === STATE_FILE
    ) {
      fail("INJECTED_WRITE_FAILURE", "injected failure before atomic replacement");
    }
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch (_closeError) { /* best effort */ }
    }
    try { fs.rmSync(tempPath, { force: true }); } catch (_removeError) { /* best effort */ }
    if (error instanceof StateError) throw error;
    fail("IO_ERROR", `could not atomically write ${filePath}: ${error.message}`);
  }
}

function archiveBytes(projectRoot, bytes, reason) {
  const directory = path.join(projectRoot, ARCHIVE_DIR);
  fs.mkdirSync(directory, { recursive: true });
  const stamp = nowIso().replace(/[-:.]/g, "");
  const archivePath = path.join(directory, `${stamp}-${reason}-${crypto.randomUUID().slice(0, 8)}.yaml`);
  let handle;
  try {
    handle = fs.openSync(archivePath, "wx", 0o600);
    fs.writeFileSync(handle, bytes);
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    return archivePath;
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch (_closeError) { /* best effort */ }
    }
    try { fs.rmSync(archivePath, { force: true }); } catch (_removeError) { /* best effort */ }
    fail("IO_ERROR", `could not archive existing project state: ${error.message}`);
  }
}

function clone(value) {
  return structuredClone(value);
}

function deepMerge(target, patch) {
  if (!isObject(patch)) return clone(patch);
  const output = isObject(target) ? clone(target) : {};
  for (const [key, value] of Object.entries(patch)) {
    output[key] = isObject(value) ? deepMerge(output[key], value) : clone(value);
  }
  return output;
}

function deepEqual(left, right) {
  return isDeepStrictEqual(left, right);
}

function hasDuplicateAssignments(options) {
  return options.some((option, index) => (
    options.slice(0, index).some((previous) => deepEqual(previous.assignment, option.assignment))
  ));
}

function validatePlan(plan) {
  assertArray(plan, "next_step_plan");
  if (plan.length === 0) return { kind: "idle", actor: null, design: null, support: null };
  if (plan.length === 1) {
    assertKnownKeys(plan[0], new Set(["id"]), "next_step_plan[0]");
    if (plan[0].id !== "team_lead") fail("PLAN_MISMATCH", "a one-entry plan must contain only team_lead");
    return { kind: "lead", actor: "team_lead", design: null, support: null };
  }
  if (plan.length !== 2) fail("PLAN_MISMATCH", "a nonempty plan must contain one or two entries");
  assertObject(plan[0], "next_step_plan[0]");
  assertKnownKeys(plan[1], new Set(["id"]), "next_step_plan[1]");
  if (plan[1].id !== "team_lead") fail("PLAN_MISMATCH", "team_lead must be the final plan entry");
  const route = plan[0].id;
  if (CORE_WORKERS.has(route)) {
    assertKnownKeys(plan[0], new Set(["id"]), "next_step_plan[0]");
    return { kind: "worker", actor: route, design: null, support: null };
  }
  if (typeof route === "string" && route.startsWith("analysis_execution.")) {
    assertKnownKeys(plan[0], new Set(["id", "support"]), "next_step_plan[0]");
    const design = route.slice("analysis_execution.".length);
    if (!DESIGN_IDS.has(design)) fail("PLAN_MISMATCH", `unknown analysis design route: ${design}`);
    const support = plan[0].support ?? null;
    if (support !== null && !SUPPORT_IDS.has(support)) fail("PLAN_MISMATCH", `unknown analysis support route: ${support}`);
    return { kind: "worker", actor: route, design, support };
  }
  fail("PLAN_MISMATCH", `unknown planned route: ${route}`);
}

function validateScopeRef(value, label = "scope_ref", code = "INVALID_STATE") {
  if (value === null) return;
  assertKnownKeys(value, new Set(["kind", "id", "revision"]), label, code);
  assertEnum(value.kind, ["analysis", "report"], `${label}.kind`, code);
  if (!isUuid(value.id)) fail(code, `${label}.id must be a UUID`);
  if (!Number.isInteger(value.revision) || value.revision < 1) {
    fail(code, `${label}.revision must be a positive integer`);
  }
}

function validateStartupNotice(notice, templateMode) {
  if (notice === null) return;
  if (templateMode) fail("INVALID_STATE", "the bundled template must leave state_meta.startup_notice null");
  assertKnownKeys(notice, new Set(["kind", "archive_path"]), "state_meta.startup_notice");
  if (!Object.prototype.hasOwnProperty.call(notice, "kind")
    || !Object.prototype.hasOwnProperty.call(notice, "archive_path")) {
    fail("INVALID_STATE", "state_meta.startup_notice requires kind and archive_path");
  }
  assertEnum(notice.kind, ["created", "reset"], "state_meta.startup_notice.kind");
  if (notice.kind === "created") {
    if (notice.archive_path !== null) {
      fail("INVALID_STATE", "a created startup notice must have a null archive_path");
    }
    return;
  }
  if (typeof notice.archive_path !== "string") {
    fail("INVALID_STATE", "a reset startup notice requires an archive_path");
  }
  const normalized = normalizePath(notice.archive_path);
  if (
    normalized !== notice.archive_path
    || normalized.includes("\0")
    || path.posix.normalize(normalized) !== normalized
    || !normalized.startsWith(`${ARCHIVE_DIR}/`)
    || normalized === `${ARCHIVE_DIR}/`
  ) {
    fail("INVALID_STATE", `state_meta.startup_notice.archive_path must be a canonical path under ${ARCHIVE_DIR}/`);
  }
}

function validateActiveOperation(meta, planInfo) {
  const operation = meta.active_operation;
  if (operation === null) {
    if (planInfo.kind !== "idle") fail("PLAN_MISMATCH", "a nonempty plan requires state_meta.active_operation");
    return;
  }
  assertKnownKeys(operation, new Set([
    "id",
    "stage",
    "intent_summary",
    "scope_ref",
    "artifact_intent",
    "started_at",
  ]), "state_meta.active_operation");
  if (!isUuid(operation.id)) fail("INVALID_STATE", "active_operation.id must be a UUID");
  assertEnum(operation.stage, ["worker_pending", "lead_pending"], "active_operation.stage");
  if (typeof operation.intent_summary !== "string" || !operation.intent_summary.trim() || operation.intent_summary.length > MAX_INTENT_LENGTH) {
    fail("INVALID_STATE", `active_operation.intent_summary must contain 1-${MAX_INTENT_LENGTH} characters`);
  }
  validateScopeRef(operation.scope_ref);
  if (!isTimestamp(operation.started_at)) fail("INVALID_STATE", "active_operation.started_at must be an RFC3339 UTC timestamp");
  if (operation.artifact_intent !== null) {
    assertKnownKeys(operation.artifact_intent, new Set(["kind", "location"]), "active_operation.artifact_intent");
    assertEnum(operation.artifact_intent.kind, ["file", "directory"], "active_operation.artifact_intent.kind");
    if (typeof operation.artifact_intent.location !== "string" || !operation.artifact_intent.location.startsWith("output/")) {
      fail("INVALID_STATE", "active_operation.artifact_intent.location must be under output/");
    }
  }
  if (planInfo.kind === "idle") fail("PLAN_MISMATCH", "active_operation requires a nonempty plan");
  if (planInfo.kind === "lead" && operation.stage !== "lead_pending") {
    fail("PLAN_MISMATCH", "team-lead-only operations must be lead_pending");
  }
}

function validateActiveScopeBinding(state, planInfo) {
  const operation = state.state_meta.active_operation;
  if (!operation || operation.scope_ref === null) return;
  let scope;
  let status;
  if (planInfo.actor && planInfo.actor.startsWith("analysis_execution.")) {
    if (operation.scope_ref.kind !== "analysis") fail("SCOPE_MISMATCH", "active analysis route has a non-analysis scope_ref");
    const design = planInfo.actor.slice("analysis_execution.".length);
    scope = state.council_chamber.analysis_execution[design];
    status = scope && scope.current_status;
    if (scope && scope.support !== planInfo.support) {
      fail("SCOPE_MISMATCH", "active analysis scope support does not match the planned support route");
    }
  } else if (planInfo.actor === "report_writer") {
    if (operation.scope_ref.kind !== "report") fail("SCOPE_MISMATCH", "active report route has a non-report scope_ref");
    scope = state.report_assembly;
    status = state.council_chamber.report_writer.current_status;
  } else {
    fail("SCOPE_MISMATCH", "active scope_ref is not valid for the planned route");
  }
  if (!scope || scope.scope_id !== operation.scope_ref.id || scope.scope_revision !== operation.scope_ref.revision) {
    fail("SCOPE_MISMATCH", "active scope_ref does not match the planned route's live scope");
  }
  if (operation.stage === "worker_pending" && status !== "ready") {
    fail("SCOPE_MISMATCH", "worker_pending approved scope must remain ready");
  }
  if (operation.stage === "lead_pending" && !["ready", "blocked", "done"].includes(status)) {
    fail("SCOPE_MISMATCH", "lead_pending scope must have a completed worker handoff status");
  }
}

function validateChamberSlot(slot, label, analysis = false, templateMode = false) {
  const allowed = analysis ? ANALYSIS_CHAMBER_KEYS : CHAMBER_KEYS;
  assertKnownKeys(slot, allowed, label);
  assertStringOrNull(slot.last_updated, `${label}.last_updated`);
  if (analysis) {
    assertEnum(slot.current_status, [null, "requested", "ready", "blocked", "done"], `${label}.current_status`);
    if (slot.support !== null && !SUPPORT_IDS.has(slot.support)) fail("INVALID_STATE", `${label}.support is not a valid support route`);
    const hasIdentity = isUuid(slot.scope_id) && Number.isInteger(slot.scope_revision) && slot.scope_revision >= 1;
    const emptyIdentity = slot.scope_id === null && slot.scope_revision === 0;
    if (!hasIdentity && !emptyIdentity) fail("INVALID_STATE", `${label} has an invalid scope identity`);
    if (!templateMode && slot.current_status !== null && slot.current_status !== "requested" && !hasIdentity) {
      fail("INVALID_STATE", `${label} requires scope identity for status ${slot.current_status}`);
    }
  } else {
    assertStringOrNull(slot.current_status, `${label}.current_status`);
  }
  assertStringOrNull(slot.summary, `${label}.summary`);
  assertStringArray(slot.questions_for_user, `${label}.questions_for_user`);
  assertStringArray(slot.feedback_to_route, `${label}.feedback_to_route`);
}

function validateArtifactRecord(record, index) {
  const label = `artifact_records[${index}]`;
  assertKnownKeys(record, new Set([
    "artifact_id",
    "operation_id",
    "route",
    "location",
    "created_at",
    "summary",
    "design",
    "support",
  ]), label);
  const required = ["artifact_id", "operation_id", "route", "location", "created_at", "summary"];
  const missing = required.filter((key) => !(key in record));
  if (missing.length) fail("INVALID_STATE", `${label} is missing: ${missing.join(", ")}`);
  const legacy = typeof record.artifact_id === "string" && /^legacy-\d{4}$/.test(record.artifact_id);
  if (!legacy && !isUuid(record.artifact_id)) fail("INVALID_STATE", `${label}.artifact_id must be a UUID or legacy id`);
  if (legacy) {
    if (record.operation_id !== null) fail("INVALID_STATE", `${label}.operation_id must be null for legacy records`);
  } else if (!isUuid(record.operation_id)) {
    fail("INVALID_STATE", `${label}.operation_id must be a UUID`);
  }
  assertEnum(record.route, ["data_audit", "causal_discovery", "analysis_execution", "report_writer"], `${label}.route`);
  if (typeof record.location !== "string" || !normalizePath(record.location).startsWith("output/")) {
    fail("INVALID_STATE", `${label}.location must be under output/`);
  }
  if (typeof record.created_at !== "string") fail("INVALID_STATE", `${label}.created_at must be a string`);
  if (!legacy && !isTimestamp(record.created_at)) fail("INVALID_STATE", `${label}.created_at must be an RFC3339 UTC timestamp`);
  if (typeof record.summary !== "string" || !record.summary.trim()) fail("INVALID_STATE", `${label}.summary must be nonempty`);
  if (record.design !== undefined && !DESIGN_IDS.has(record.design)) fail("INVALID_STATE", `${label}.design is invalid`);
  if (record.support !== undefined && record.support !== null && !SUPPORT_IDS.has(record.support)) fail("INVALID_STATE", `${label}.support is invalid`);
  if (record.route === "analysis_execution") {
    if (!DESIGN_IDS.has(record.design)) fail("INVALID_STATE", `${label}.design is required for analysis output`);
    if (!("support" in record)) fail("INVALID_STATE", `${label}.support is required for analysis output`);
  } else if (record.design !== undefined || record.support !== undefined) {
    fail("INVALID_STATE", `${label} may use design/support only for analysis_execution`);
  }
}

function validatePendingDecision(state, planInfo) {
  const decision = state.pending_decision;
  if (decision === null) return;
  if (planInfo.kind !== "idle" || state.state_meta.active_operation !== null) {
    fail("INVALID_STATE", "pending_decision cannot coexist with an active operation or plan");
  }
  assertKnownKeys(
    decision,
    new Set(["decision_id", "source_operation_id", "created_at", "options"]),
    "pending_decision",
  );
  if (!isUuid(decision.decision_id)) fail("INVALID_STATE", "pending_decision.decision_id must be a UUID");
  if (!isUuid(decision.source_operation_id)) {
    fail("INVALID_STATE", "pending_decision.source_operation_id must be a UUID");
  }
  if (!isTimestamp(decision.created_at)) {
    fail("INVALID_STATE", "pending_decision.created_at must be an RFC3339 UTC timestamp");
  }
  assertArray(decision.options, "pending_decision.options");
  if (decision.options.length < 2 || decision.options.length > 4) {
    fail("INVALID_STATE", "pending_decision.options must contain 2-4 choices");
  }
  decision.options.forEach((option, index) => {
    const label = `pending_decision.options[${index}]`;
    assertKnownKeys(
      option,
      new Set(["number", "assignment"]),
      label,
    );
    if (option.number !== index + 1) {
      fail("INVALID_STATE", `${label}.number must match its sequential position`);
    }
    const normalizedAssignment = normalizeAssignmentShape(
      option.assignment,
      `${label}.assignment`,
      true,
    );
    if (!deepEqual(option.assignment, normalizedAssignment)) {
      fail("INVALID_STATE", `${label}.assignment must be stored in canonical form`);
    }
  });
  if (hasDuplicateAssignments(decision.options)) {
    fail("INVALID_STATE", "pending_decision.options must contain distinct assignments");
  }
}

function validateResponseReceipt(state, planInfo) {
  const receipt = state.response_receipt;
  if (receipt === null) {
    if (state.pending_decision !== null) {
      fail("INVALID_STATE", "pending_decision requires its matching response_receipt");
    }
    return;
  }
  if (planInfo.kind !== "idle" || state.state_meta.active_operation !== null) {
    fail("INVALID_STATE", "response_receipt cannot coexist with an active operation or plan");
  }
  assertKnownKeys(
    receipt,
    new Set(["operation_id", "revision", "created_at", "response_markdown"]),
    "response_receipt",
  );
  if (!isUuid(receipt.operation_id)) {
    fail("INVALID_STATE", "response_receipt.operation_id must be a UUID");
  }
  if (receipt.revision !== state.state_meta.revision) {
    fail("INVALID_STATE", "response_receipt.revision must match the current state revision");
  }
  if (!isTimestamp(receipt.created_at)) {
    fail("INVALID_STATE", "response_receipt.created_at must be an RFC3339 UTC timestamp");
  }
  if (typeof receipt.response_markdown !== "string" || !receipt.response_markdown.trim()) {
    fail("INVALID_STATE", "response_receipt.response_markdown must be nonempty");
  }
  if (
    state.pending_decision !== null
    && state.pending_decision.source_operation_id !== receipt.operation_id
  ) {
    fail("INVALID_STATE", "pending_decision and response_receipt must come from the same operation");
  }
}

function validateState(state, options = {}) {
  const { templateMode = false } = options;
  assertExactTopLevel(state);

  assertKnownKeys(state.state_meta, new Set([
    "schema_version",
    "project_id",
    "revision",
    "created_at",
    "updated_at",
    "active_operation",
    "startup_notice",
  ]), "state_meta");
  if (state.state_meta.schema_version !== SCHEMA_VERSION) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${state.state_meta.schema_version}`);
  }
  if (templateMode) {
    if (state.state_meta.project_id !== null || state.state_meta.created_at !== null || state.state_meta.updated_at !== null) {
      fail("INVALID_STATE", "the bundled template must leave runtime metadata null");
    }
  } else {
    if (!isUuid(state.state_meta.project_id)) fail("INVALID_STATE", "state_meta.project_id must be a UUID");
    if (!isTimestamp(state.state_meta.created_at) || !isTimestamp(state.state_meta.updated_at)) {
      fail("INVALID_STATE", "state_meta timestamps must be RFC3339 UTC values");
    }
  }
  if (!Number.isInteger(state.state_meta.revision) || state.state_meta.revision < 0) {
    fail("INVALID_STATE", "state_meta.revision must be a nonnegative integer");
  }
  validateStartupNotice(state.state_meta.startup_notice, templateMode);

  assertKnownKeys(state.project_summary, SECTION_KEYS.project_summary, "project_summary");
  assertStringOrNull(state.project_summary.title, "project_summary.title");
  assertStringOrNull(state.project_summary.objective, "project_summary.objective");
  assertStringArray(state.project_summary.materials, "project_summary.materials");
  assertStringOrNull(state.project_summary.last_updated, "project_summary.last_updated");
  assertEnum(state.project_summary.phase, ["exploration", "analysis", "reporting"], "project_summary.phase");
  for (const key of ["data_audit_complete", "domain_knowledge_complete", "causal_check_complete", "exploration_complete"]) {
    if (typeof state.project_summary[key] !== "boolean") fail("INVALID_STATE", `project_summary.${key} must be boolean`);
  }
  assertStringOrNull(state.project_summary.exploration_summary, "project_summary.exploration_summary");
  assertEnum(state.project_summary.analysis_output, ["exist", "non_exist"], "project_summary.analysis_output");
  assertEnum(state.project_summary.report_output, ["exist", "non_exist"], "project_summary.report_output");

  assertObject(state.council_chamber, "council_chamber");
  const chamberKeys = new Set(["data_audit", "domain_expert", "causal_check", "causal_discovery", "analysis_execution", "report_writer"]);
  assertKnownKeys(state.council_chamber, chamberKeys, "council_chamber");
  for (const route of ["data_audit", "domain_expert", "causal_check", "causal_discovery", "report_writer"]) {
    validateChamberSlot(state.council_chamber[route], `council_chamber.${route}`, false, templateMode);
  }
  assertObject(state.council_chamber.analysis_execution, "council_chamber.analysis_execution");
  for (const [design, slot] of Object.entries(state.council_chamber.analysis_execution)) {
    if (!DESIGN_IDS.has(design)) fail("INVALID_STATE", `unknown analysis chamber design: ${design}`);
    validateChamberSlot(slot, `council_chamber.analysis_execution.${design}`, true, templateMode);
  }

  const planInfo = validatePlan(state.next_step_plan);
  validateActiveOperation(state.state_meta, planInfo);

  for (const section of ["data_facts", "domain_knowledge", "causal_facts", "discovery_sidecar", "report_assembly"]) {
    assertKnownKeys(state[section], SECTION_KEYS[section], section);
    assertStringOrNull(state[section].last_updated, `${section}.last_updated`);
  }
  assertEnum(state.data_facts.data_checked, ["not_checked", "passing", "limited", "imagined", "blocked"], "data_facts.data_checked");
  assertStringOrNullFields(state.data_facts, ["audit_scope", "unit_of_observation"], "data_facts");
  assertStringArrayFields(state.data_facts, [
    "data_sources",
    "variables",
    "structure_notes",
    "timing_notes",
    "dependency_notes",
    "leakage_risks",
    "missingness_notes",
    "support_notes",
    "validity_questions",
    "exploratory_runs",
    "artifact_refs",
  ], "data_facts");
  assertEnum(state.domain_knowledge.domain_checked, ["not_checked", "passing", "limited", "blocked"], "domain_knowledge.domain_checked");
  assertStringOrNullFields(state.domain_knowledge, ["domain_scope", "user_provided", "data_facts"], "domain_knowledge");
  assertStringArrayFields(state.domain_knowledge, [
    "construct_notes",
    "measurement_notes",
    "population_setting_notes",
    "domain_practice",
    "source_limitations",
    "practice_searches",
    "references",
  ], "domain_knowledge");
  assertEnum(state.causal_facts.causal_checked, ["not_checked", "passing", "limited", "blocked"], "causal_facts.causal_checked");
  assertEnum(state.causal_facts.analysis_readiness, ["ready", "limited", "not_ready", "blocked"], "causal_facts.analysis_readiness");
  assertStringOrNullFields(state.causal_facts, [
    "causal_question",
    "exposure_or_intervention",
    "outcome",
    "estimand",
    "support_status",
  ], "causal_facts");
  assertStringArrayFields(state.causal_facts, ["assumptions", "threats", "recommended_checks"], "causal_facts");
  assertArray(state.causal_facts.recommended_method_routes, "causal_facts.recommended_method_routes");
  state.causal_facts.recommended_method_routes.forEach((route, index) => {
    const label = `causal_facts.recommended_method_routes[${index}]`;
    assertKnownKeys(route, new Set(["id", "category", "route_cautions"]), label);
    assertEnum(route.category, ["design", "support"], `${label}.category`);
    const expected = route.category === "design" ? DESIGN_IDS : SUPPORT_IDS;
    if (!expected.has(route.id)) fail("INVALID_STATE", `${label}.id is not a valid ${route.category} route`);
    assertStringArray(route.route_cautions, `${label}.route_cautions`);
  });
  const recommendedIds = state.causal_facts.recommended_method_routes.map((route) => route.id);
  if (new Set(recommendedIds).size !== recommendedIds.length) {
    fail("INVALID_STATE", "recommended_method_routes must not contain duplicate route IDs");
  }
  const recommendedDesigns = state.causal_facts.recommended_method_routes.filter((route) => route.category === "design");
  const recommendedSupports = state.causal_facts.recommended_method_routes.filter((route) => route.category === "support");
  if (recommendedDesigns.length > 1 || recommendedSupports.length > 1) {
    fail("INVALID_STATE", "recommended_method_routes may contain at most one design and one support route");
  }
  if (recommendedSupports.length && !recommendedDesigns.length) {
    fail("INVALID_STATE", "a recommended support route requires a recommended design route");
  }
  assertEnum(state.discovery_sidecar.status, ["not_started", "scoped", "artifact_created", "reviewed", "blocked"], "discovery_sidecar.status");
  assertStringOrNullFields(state.discovery_sidecar, ["goal", "scope", "method_summary"], "discovery_sidecar");
  assertStringArrayFields(state.discovery_sidecar, ["findings", "diagnostics", "limitations", "artifact_refs", "reviewer_requests"], "discovery_sidecar");
  assertEnum(state.report_assembly.current_format, [null, "md", "html"], "report_assembly.current_format");
  assertStringOrNullFields(state.report_assembly, ["report_goal", "audience", "target_section"], "report_assembly");
  assertStringArrayFields(state.report_assembly, ["planned_structure", "key_points", "wording_constraints", "draft_notes"], "report_assembly");

  const reportHasIdentity = isUuid(state.report_assembly.scope_id) && Number.isInteger(state.report_assembly.scope_revision) && state.report_assembly.scope_revision >= 1;
  const reportEmptyIdentity = state.report_assembly.scope_id === null && state.report_assembly.scope_revision === 0;
  if (!reportHasIdentity && !reportEmptyIdentity) fail("INVALID_STATE", "report_assembly has an invalid scope identity");
  const reportStatus = state.council_chamber.report_writer.current_status;
  if (!templateMode && ["ready", "blocked", "done"].includes(reportStatus) && !reportHasIdentity) {
    fail("INVALID_STATE", `report_assembly requires scope identity for status ${reportStatus}`);
  }
  if (reportStatus !== null && !["requested", "ready", "blocked", "done"].includes(reportStatus)) {
    fail("INVALID_STATE", "council_chamber.report_writer.current_status is invalid");
  }
  validateActiveScopeBinding(state, planInfo);

  assertArray(state.artifact_records, "artifact_records");
  state.artifact_records.forEach(validateArtifactRecord);
  const ids = state.artifact_records.map((item) => item.artifact_id);
  if (new Set(ids).size !== ids.length) fail("INVALID_STATE", "artifact_id values must be unique");
  const operationIds = state.artifact_records.map((item) => item.operation_id).filter(Boolean);
  if (new Set(operationIds).size !== operationIds.length) fail("INVALID_STATE", "operation_id may appear in only one artifact record");

  const activeOperation = state.state_meta.active_operation;
  const activeOperationHasArtifact = activeOperation !== null
    && state.artifact_records.some((record) => record.operation_id === activeOperation.id);
  const pendingAnalysisCloseout = activeOperation !== null
    && activeOperation.stage === "lead_pending"
    && planInfo.actor !== null
    && planInfo.actor.startsWith("analysis_execution.")
    && activeOperationHasArtifact;
  const pendingReportCloseout = activeOperation !== null
    && activeOperation.stage === "lead_pending"
    && planInfo.actor === "report_writer"
    && activeOperationHasArtifact;

  if (state.project_summary.data_audit_complete && !["passing", "limited"].includes(state.data_facts.data_checked)) {
    fail("INVALID_STATE", "data_audit_complete requires data_checked passing or limited");
  }
  if (state.project_summary.domain_knowledge_complete && !["passing", "limited"].includes(state.domain_knowledge.domain_checked)) {
    fail("INVALID_STATE", "domain_knowledge_complete requires domain_checked passing or limited");
  }
  if (state.project_summary.causal_check_complete && !["passing", "limited"].includes(state.causal_facts.causal_checked)) {
    fail("INVALID_STATE", "causal_check_complete requires causal_checked passing or limited");
  }
  if (state.project_summary.exploration_complete && !(
    state.project_summary.data_audit_complete &&
    state.project_summary.domain_knowledge_complete &&
    state.project_summary.causal_check_complete
  )) {
    fail("INVALID_STATE", "exploration_complete requires all three core completion flags");
  }
  if (state.project_summary.analysis_output === "exist" && !state.artifact_records.some((record) => record.route === "analysis_execution")) {
    fail("INVALID_STATE", "analysis_output exist requires an analysis_execution artifact record");
  }
  if (state.project_summary.analysis_output === "non_exist" && state.artifact_records.some((record) => record.route === "analysis_execution")) {
    if (!pendingAnalysisCloseout) {
      fail("INVALID_STATE", "analysis_output non_exist conflicts with a completed analysis artifact");
    }
  }
  if (state.project_summary.report_output === "exist") {
    if (!state.artifact_records.some((record) => record.route === "report_writer")) {
      fail("INVALID_STATE", "report_output exist requires a report_writer artifact record");
    }
  }
  if (state.project_summary.report_output === "non_exist" && state.report_assembly.current_format !== null) {
    if (!pendingReportCloseout) {
      fail("INVALID_STATE", "report_output non_exist requires null report format outside a pending report closeout");
    }
  }
  if (state.project_summary.report_output === "non_exist" && state.artifact_records.some((record) => record.route === "report_writer")) {
    if (!pendingReportCloseout) {
      fail("INVALID_STATE", "report_output non_exist conflicts with a completed report artifact");
    }
  }

  validatePendingDecision(state, planInfo);
  validateResponseReceipt(state, planInfo);
  if (state.state_meta.startup_notice !== null
    && (state.pending_decision !== null || state.response_receipt !== null)) {
    fail("INVALID_STATE", "state_meta.startup_notice cannot coexist with a completed response");
  }
  return { planInfo };
}

function instantiateTemplate(template, startupNotice) {
  const state = clone(template);
  const timestamp = nowIso();
  state.state_meta.project_id = crypto.randomUUID();
  state.state_meta.revision = 0;
  state.state_meta.created_at = timestamp;
  state.state_meta.updated_at = timestamp;
  state.state_meta.active_operation = null;
  state.state_meta.startup_notice = clone(startupNotice);
  state.pending_decision = null;
  state.response_receipt = null;
  validateState(state);
  return state;
}

function isOpinionsEra(state) {
  if (!isObject(state) || !isObject(state.council_chamber)) return false;
  if (Object.values(state.council_chamber).some((slot) => isObject(slot) && "opinions" in slot)) return true;
  const analysis = state.council_chamber.analysis_execution;
  return isObject(analysis) && "current_status" in analysis;
}

function validateLegacyShape(state) {
  assertExactTopLevel(state, LEGACY_TOP_LEVEL);
  if (isOpinionsEra(state)) fail("UNSUPPORTED_SCHEMA", "opinions-era project state is not supported by the v5 migrator");
  assertObject(state.project_summary, "project_summary");
  assertObject(state.council_chamber, "council_chamber");
  for (const key of ["data_audit", "domain_expert", "causal_check", "causal_discovery", "analysis_execution", "report_writer"]) {
    if (!(key in state.council_chamber)) fail("UNSUPPORTED_SCHEMA", `legacy council_chamber is missing ${key}`);
  }
  assertArray(state.next_step_plan, "next_step_plan");
  for (const key of ["data_facts", "domain_knowledge", "causal_facts", "discovery_sidecar", "report_assembly"]) {
    assertObject(state[key], key);
  }
  assertArray(state.artifact_records, "artifact_records");
}

function legacyScopePresent(slot) {
  if (!isObject(slot)) return false;
  return Object.values(slot).some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (isObject(value)) return Object.keys(value).length > 0;
    return value !== null && value !== undefined;
  });
}

function migrateLegacyState(legacy, options = {}) {
  const { discardPlan = false } = options;
  validateLegacyShape(legacy);
  if (legacy.next_step_plan.length && !discardPlan) {
    fail("LEGACY_ACTIVE_PLAN", "recognized v4.5 state has a nonempty transient plan and cannot be resumed safely");
  }
  const state = clone(legacy);
  if (discardPlan) state.next_step_plan = [];
  const timestamp = nowIso();
  state.state_meta = {
    schema_version: SCHEMA_VERSION,
    project_id: crypto.randomUUID(),
    revision: 0,
    created_at: timestamp,
    updated_at: timestamp,
    active_operation: null,
    startup_notice: null,
  };
  const reordered = { state_meta: state.state_meta };
  for (const key of LEGACY_TOP_LEVEL) reordered[key] = state[key];
  reordered.pending_decision = null;
  reordered.response_receipt = null;
  if ("discovery_sidecar_output" in reordered.project_summary) {
    delete reordered.project_summary.discovery_sidecar_output;
  }
  for (const [design, slot] of Object.entries(reordered.council_chamber.analysis_execution)) {
    if (!DESIGN_IDS.has(design) || !isObject(slot)) {
      fail("UNSUPPORTED_SCHEMA", `legacy analysis slot ${design} is not a supported v4.5 design slot`);
    }
    if (legacyScopePresent(slot)) {
      slot.scope_id = crypto.randomUUID();
      slot.scope_revision = 1;
    } else {
      slot.scope_id = null;
      slot.scope_revision = 0;
    }
  }
  const reportStatus = reordered.council_chamber.report_writer.current_status;
  const reportHasContent = reportStatus !== null || legacyScopePresent(reordered.report_assembly);
  reordered.report_assembly.scope_id = reportHasContent ? crypto.randomUUID() : null;
  reordered.report_assembly.scope_revision = reportHasContent ? 1 : 0;
  reordered.artifact_records = reordered.artifact_records.map((record, index) => ({
    ...record,
    artifact_id: `legacy-${String(index + 1).padStart(4, "0")}`,
    operation_id: null,
  }));
  validateState(reordered);
  return reordered;
}

function migrateV2State(v2) {
  assertExactTopLevel(v2, V2_TOP_LEVEL);
  assertObject(v2.state_meta, "state_meta");
  if (v2.state_meta.schema_version !== 2) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v2.state_meta.schema_version}`);
  }

  const migrated = clone(v2);
  migrated.state_meta.schema_version = SCHEMA_VERSION;
  migrated.state_meta.startup_notice = null;
  migrated.pending_decision = null;
  migrated.response_receipt = null;
  validateState(migrated);
  migrated.state_meta.revision += 1;
  migrated.state_meta.updated_at = nowIso();
  validateState(migrated);
  return migrated;
}

function artifactWarnings(projectRoot, state) {
  const warnings = [];
  state.artifact_records.forEach((record) => {
    let resolved;
    try {
      resolved = resolveOutputPath(projectRoot, record.location);
    } catch (_error) {
      warnings.push({
        code: "INVALID_HISTORICAL_ARTIFACT_PATH",
        artifact_id: record.artifact_id,
        location: record.location,
      });
      return;
    }
    if (!fs.existsSync(resolved)) {
      warnings.push({
        code: "MISSING_HISTORICAL_ARTIFACT",
        artifact_id: record.artifact_id,
        location: record.location,
      });
      return;
    }
    if (/^legacy-\d{4}$/.test(record.artifact_id)) return;

    let kind;
    try {
      const stat = fs.lstatSync(resolved);
      if (stat.isFile()) kind = "file";
      else if (stat.isDirectory()) kind = "directory";
      else {
        warnings.push({
          code: "INVALID_HISTORICAL_ARTIFACT_TYPE",
          artifact_id: record.artifact_id,
          location: record.location,
        });
        return;
      }
    } catch (_error) {
      warnings.push({
        code: "MISSING_HISTORICAL_ARTIFACT",
        artifact_id: record.artifact_id,
        location: record.location,
      });
      return;
    }

    const manifestPath = manifestPathFor(resolved, kind);
    const relativeManifestPath = normalizePath(path.relative(path.resolve(projectRoot), manifestPath));
    if (!fs.existsSync(manifestPath)) {
      warnings.push({
        code: "MISSING_HISTORICAL_ARTIFACT_MANIFEST",
        artifact_id: record.artifact_id,
        location: record.location,
        manifest_path: relativeManifestPath,
      });
      return;
    }
    if (!fs.lstatSync(manifestPath).isFile()) {
      warnings.push({
        code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
        artifact_id: record.artifact_id,
        location: record.location,
        manifest_path: relativeManifestPath,
      });
      return;
    }

    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (_error) {
      warnings.push({
        code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
        artifact_id: record.artifact_id,
        location: record.location,
        manifest_path: relativeManifestPath,
      });
      return;
    }
    const manifestKeys = new Set([
      "schema_version",
      "operation_id",
      "route",
      "scope_ref",
      "files",
      "completed_at",
      "summary",
    ]);
    const expectedScopeKind = record.route === "analysis_execution"
      ? "analysis"
      : record.route === "report_writer"
        ? "report"
        : null;
    const scopeRef = manifest && manifest.scope_ref;
    const scopeRefValid = expectedScopeKind === null
      ? scopeRef === null
      : isObject(scopeRef)
        && Object.keys(scopeRef).length === 3
        && Object.keys(scopeRef).every((key) => ["kind", "id", "revision"].includes(key))
        && scopeRef.kind === expectedScopeKind
        && isUuid(scopeRef.id)
        && Number.isInteger(scopeRef.revision)
        && scopeRef.revision >= 1;
    if (
      !isObject(manifest)
      || Object.keys(manifest).length !== manifestKeys.size
      || Object.keys(manifest).some((key) => !manifestKeys.has(key))
      || manifest.schema_version !== MANIFEST_VERSION
      || manifest.operation_id !== record.operation_id
      || manifest.route !== record.route
      || !scopeRefValid
      || !Array.isArray(manifest.files)
      || !manifest.files.length
      || manifest.files.some((item) => typeof item !== "string" || !item.trim())
      || !isTimestamp(manifest.completed_at)
      || typeof manifest.summary !== "string"
      || manifest.summary.trim() !== record.summary.trim()
    ) {
      warnings.push({
        code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
        artifact_id: record.artifact_id,
        location: record.location,
        manifest_path: relativeManifestPath,
      });
      return;
    }
    let includesPrimary = false;
    let includesDeliverable = false;
    for (const item of manifest.files) {
      const normalized = normalizePath(item);
      let listedPath;
      try {
        listedPath = resolveOutputPath(projectRoot, normalized);
      } catch (_error) {
        warnings.push({
          code: "INVALID_HISTORICAL_ARTIFACT_FILE_PATH",
          artifact_id: record.artifact_id,
          location: record.location,
          file: normalized,
        });
        continue;
      }
      if (kind === "directory") {
        if (!listedPath.startsWith(`${resolved}${path.sep}`)) {
          warnings.push({
            code: "INVALID_HISTORICAL_ARTIFACT_FILE_PATH",
            artifact_id: record.artifact_id,
            location: record.location,
            file: normalized,
          });
          continue;
        }
        if (listedPath !== manifestPath) includesDeliverable = true;
      } else if (normalized === normalizePath(record.location)) {
        includesPrimary = true;
        includesDeliverable = true;
      }
      if (!fs.existsSync(listedPath) || !fs.lstatSync(listedPath).isFile()) {
        warnings.push({
          code: "MISSING_HISTORICAL_ARTIFACT_FILE",
          artifact_id: record.artifact_id,
          location: record.location,
          file: normalized,
        });
      }
    }
    if ((kind === "file" && !includesPrimary) || !includesDeliverable) {
      warnings.push({
        code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
        artifact_id: record.artifact_id,
        location: record.location,
        manifest_path: relativeManifestPath,
      });
    }
  });
  return warnings;
}

function statePathFor(projectRoot) {
  return path.join(path.resolve(projectRoot), STATE_FILE);
}

function templatePathFor(skillRoot) {
  return path.join(path.resolve(skillRoot), "assets", "project_state_template.yaml");
}

function loadTemplate(skillRoot) {
  const templatePath = templatePathFor(skillRoot);
  const template = parseYaml(readText(templatePath), templatePath);
  validateState(template, { templateMode: true });
  return template;
}

function openProject({ projectRoot, skillRoot, fresh = false, discardLegacyPlan = false }) {
  const root = path.resolve(projectRoot);
  const statePath = statePathFor(root);
  const template = loadTemplate(skillRoot);
  const exists = fs.existsSync(statePath);

  if (fresh && discardLegacyPlan) fail("INVALID_INPUT", "--fresh and --discard-legacy-plan cannot be combined");
  if (discardLegacyPlan && !exists) fail("INVALID_INPUT", "--discard-legacy-plan requires an existing recognized v4.5 state");

  if (fresh) {
    const previous = exists ? readBytes(statePath) : null;
    const archivePath = previous === null ? null : archiveBytes(root, previous, "reset");
    const startupNotice = archivePath === null
      ? { kind: "created", archive_path: null }
      : {
        kind: "reset",
        archive_path: normalizePath(path.relative(root, archivePath)),
      };
    const state = instantiateTemplate(template, startupNotice);
    atomicWrite(statePath, stringifyYaml(state));
    return {
      ok: true,
      code: exists ? "RESET" : "CREATED_FRESH",
      state_path: statePath,
      archive_path: archivePath,
      project_id: state.state_meta.project_id,
      revision: state.state_meta.revision,
      mode: "idle",
      warnings: [],
    };
  }

  if (!exists) {
    const state = instantiateTemplate(template, {
      kind: "created",
      archive_path: null,
    });
    atomicWrite(statePath, stringifyYaml(state));
    return {
      ok: true,
      code: "CREATED",
      state_path: statePath,
      project_id: state.state_meta.project_id,
      revision: state.state_meta.revision,
      mode: "idle",
      warnings: [],
    };
  }

  const original = readBytes(statePath);
  const parsed = parseYaml(original.toString("utf8"), statePath);
  if (!isObject(parsed.state_meta)) {
    const migrated = migrateLegacyState(parsed, { discardPlan: discardLegacyPlan });
    const warnings = artifactWarnings(root, migrated);
    const serialized = stringifyYaml(migrated);
    const archivePath = archiveBytes(root, original, discardLegacyPlan ? "migration-v45-discarded-plan" : "migration-v45");
    atomicWrite(statePath, serialized);
    return {
      ok: true,
      code: discardLegacyPlan ? "MIGRATED_LEGACY_PLAN_DISCARDED" : "MIGRATED",
      state_path: statePath,
      archive_path: archivePath,
      project_id: migrated.state_meta.project_id,
      revision: migrated.state_meta.revision,
      mode: "idle",
      warnings,
    };
  }

  if (parsed.state_meta.schema_version === 2) {
    if (discardLegacyPlan) {
      fail("INVALID_INPUT", "--discard-legacy-plan applies only to a recognized unversioned v4.5 state");
    }
    const migrated = migrateV2State(parsed);
    const { planInfo } = validateState(migrated);
    const operation = migrated.state_meta.active_operation;
    const mode = operation === null
      ? "idle"
      : operation.stage === "worker_pending"
        ? "resume_worker"
        : "resume_lead";
    const artifactStatus = operation && operation.artifact_intent
      ? inspectReservedArtifact(root, operation, planInfo.actor)
      : null;
    const warnings = artifactWarnings(root, migrated);
    const serialized = stringifyYaml(migrated);
    const archivePath = archiveBytes(root, original, "migration-v2-v3");
    atomicWrite(statePath, serialized);
    return {
      ok: true,
      code: "MIGRATED_V2",
      state_path: statePath,
      archive_path: archivePath,
      project_id: migrated.state_meta.project_id,
      revision: migrated.state_meta.revision,
      mode,
      plan: migrated.next_step_plan,
      plan_actor: planInfo.actor,
      active_operation: operation,
      artifact_status: artifactStatus,
      warnings,
    };
  }

  if (discardLegacyPlan) {
    fail("INVALID_INPUT", "--discard-legacy-plan applies only to a recognized unversioned v4.5 state");
  }

  const { planInfo } = validateState(parsed);
  const operation = parsed.state_meta.active_operation;
  let mode = "idle";
  let code = "OPENED";
  if (operation) {
    mode = operation.stage === "worker_pending" ? "resume_worker" : "resume_lead";
    code = operation.stage === "worker_pending" ? "RESUME_WORKER" : "RESUME_LEAD";
  }
  return {
    ok: true,
    code,
    state_path: statePath,
    project_id: parsed.state_meta.project_id,
    revision: parsed.state_meta.revision,
    mode,
    plan: parsed.next_step_plan,
    plan_actor: planInfo.actor,
    active_operation: operation,
    artifact_status: operation && operation.artifact_intent
      ? inspectReservedArtifact(root, operation, planInfo.actor)
      : null,
    warnings: artifactWarnings(root, parsed),
  };
}

function loadCurrentState(projectRoot) {
  const statePath = statePathFor(projectRoot);
  if (!fs.existsSync(statePath)) fail("MISSING_STATE", `${statePath} does not exist`);
  const text = readText(statePath);
  const state = parseYaml(text, statePath);
  validateState(state);
  return { statePath, state };
}

function assertExpected(state, payload) {
  if (!isObject(payload)) fail("INVALID_INPUT", "command input must be a JSON object");
  if (payload.expected_project_id !== state.state_meta.project_id) {
    fail("STALE_PROJECT", "expected_project_id does not match the active project");
  }
  if (!Number.isInteger(payload.expected_revision)) fail("INVALID_INPUT", "expected_revision must be an integer");
  if (payload.expected_revision !== state.state_meta.revision) {
    fail("STALE_REVISION", `expected revision ${payload.expected_revision}, found ${state.state_meta.revision}`, {
      current_revision: state.state_meta.revision,
    });
  }
}

function commitMutation(statePath, state) {
  state.state_meta.revision += 1;
  state.state_meta.updated_at = nowIso();
  validateState(state);
  atomicWrite(statePath, stringifyYaml(state));
  return state.state_meta.revision;
}

function resolveScopeReference(state, route, scopeRef, support = null) {
  validateScopeRef(scopeRef, "scope_ref", "INVALID_INPUT");
  if (scopeRef === null) return;
  let current;
  let status;
  if (route.startsWith("analysis_execution.")) {
    if (scopeRef.kind !== "analysis") fail("SCOPE_MISMATCH", "analysis route requires an analysis scope reference");
    const design = route.slice("analysis_execution.".length);
    current = state.council_chamber.analysis_execution[design];
    status = current && current.current_status;
    if (current && current.support !== support) {
      fail("SCOPE_MISMATCH", "analysis support route does not match the ready scope");
    }
  } else if (route === "report_writer") {
    if (scopeRef.kind !== "report") fail("SCOPE_MISMATCH", "report_writer requires a report scope reference");
    current = state.report_assembly;
    status = state.council_chamber.report_writer.current_status;
  } else {
    fail("SCOPE_MISMATCH", `${route} cannot use a scope reference`);
  }
  if (!current || current.scope_id !== scopeRef.id || current.scope_revision !== scopeRef.revision) {
    fail("SCOPE_MISMATCH", "the requested scope reference is not current");
  }
  if (status !== "ready") {
    fail("SCOPE_MISMATCH", `scope status ${status} cannot be approved or revised`);
  }
}

function assertAnalysisBeginAllowed(state, design, support) {
  const reviewed = ["passing", "limited"];
  const actionable = ["ready", "limited"];
  const failures = [];
  const requireOneOf = (field, actual, allowed) => {
    if (!allowed.includes(actual)) failures.push({ field, actual, allowed });
  };

  requireOneOf("data_facts.data_checked", state.data_facts.data_checked, reviewed);
  requireOneOf("domain_knowledge.domain_checked", state.domain_knowledge.domain_checked, reviewed);
  requireOneOf("causal_facts.causal_checked", state.causal_facts.causal_checked, reviewed);
  requireOneOf("causal_facts.analysis_readiness", state.causal_facts.analysis_readiness, actionable);

  const designRecommendation = state.causal_facts.recommended_method_routes
    .find((route) => route.category === "design");
  if (!designRecommendation || designRecommendation.id !== design) {
    failures.push({
      field: "causal_facts.recommended_method_routes.design",
      actual: designRecommendation ? designRecommendation.id : null,
      allowed: [design],
    });
  }

  if (support !== null) {
    const supportRecommendation = state.causal_facts.recommended_method_routes
      .find((route) => route.category === "support");
    if (!supportRecommendation || supportRecommendation.id !== support) {
      failures.push({
        field: "causal_facts.recommended_method_routes.support",
        actual: supportRecommendation ? supportRecommendation.id : null,
        allowed: [support],
      });
    }
  }

  if (design === "descriptive_association" && state.causal_facts.analysis_readiness === "ready") {
    failures.push({
      field: "causal_facts.analysis_readiness",
      actual: state.causal_facts.analysis_readiness,
      allowed: ["limited"],
    });
  }

  if (failures.length) {
    fail("ANALYSIS_GATE_FAILED", "analysis route entry requirements are not satisfied", {
      route: `analysis_execution.${design}`,
      failures,
    });
  }
}

function normalizeAssignmentShape(input, label = "assignment", stateMode = false) {
  const inputCode = stateMode ? "INVALID_STATE" : "INVALID_INPUT";
  const routeCode = stateMode ? "INVALID_STATE" : "PLAN_MISMATCH";
  const scopeCode = stateMode ? "INVALID_STATE" : "SCOPE_MISMATCH";
  assertKnownKeys(
    input,
    new Set(["route", "support", "intent_summary", "scope_ref"]),
    label,
    inputCode,
  );
  const route = input.route;
  const support = input.support ?? null;
  const scopeRef = input.scope_ref ?? null;
  if (
    typeof input.intent_summary !== "string"
    || !input.intent_summary.trim()
    || input.intent_summary.length > MAX_INTENT_LENGTH
  ) {
    fail(inputCode, `${label}.intent_summary must contain 1-${MAX_INTENT_LENGTH} characters`);
  }
  validateScopeRef(scopeRef, `${label}.scope_ref`, inputCode);

  if (route === "team_lead") {
    if (support !== null || scopeRef !== null) fail(inputCode, "team_lead cannot use support or scope_ref");
  } else if (CORE_WORKERS.has(route)) {
    if (support !== null) fail(inputCode, "core routes cannot use support");
    if (scopeRef !== null && route !== "report_writer") fail(scopeCode, `${route} cannot use scope_ref`);
    if (scopeRef !== null && scopeRef.kind !== "report") {
      fail(scopeCode, "report_writer requires a report scope reference");
    }
  } else if (typeof route === "string" && route.startsWith("analysis_execution.")) {
    const design = route.slice("analysis_execution.".length);
    if (!DESIGN_IDS.has(design)) fail(routeCode, `unknown analysis design route: ${design}`);
    if (support !== null && !SUPPORT_IDS.has(support)) fail(routeCode, `unknown support route: ${support}`);
    if (scopeRef !== null && scopeRef.kind !== "analysis") {
      fail(scopeCode, "analysis route requires an analysis scope reference");
    }
  } else {
    fail(routeCode, `unknown route: ${route}`);
  }

  return {
    route,
    support,
    intent_summary: input.intent_summary.trim(),
    scope_ref: scopeRef === null ? null : clone(scopeRef),
  };
}

function normalizeAssignment(state, input, label = "assignment") {
  const assignment = normalizeAssignmentShape(input, label);
  const {
    route,
    support,
    scope_ref: scopeRef,
  } = assignment;

  let plan;
  let stage;
  if (route === "team_lead") {
    plan = [{ id: "team_lead" }];
    stage = "lead_pending";
  } else if (CORE_WORKERS.has(route)) {
    resolveScopeReference(state, route, scopeRef, support);
    plan = [{ id: route }, { id: "team_lead" }];
    stage = "worker_pending";
  } else if (typeof route === "string" && route.startsWith("analysis_execution.")) {
    const design = route.slice("analysis_execution.".length);
    resolveScopeReference(state, route, scopeRef, support);
    assertAnalysisBeginAllowed(state, design, support);
    plan = [{ id: route, support }, { id: "team_lead" }];
    stage = "worker_pending";
  }

  return {
    assignment,
    plan,
    stage,
  };
}

function resolveDecisionSelection(state, selection) {
  assertKnownKeys(
    selection,
    new Set(["decision_id", "option_number"]),
    "begin selection",
    "INVALID_INPUT",
  );
  const decision = state.pending_decision;
  if (decision === null) fail("NO_PENDING_DECISION", "no pending numbered decision exists");
  if (selection.decision_id !== decision.decision_id) {
    fail("STALE_DECISION", "decision_id does not match the pending decision");
  }
  if (!Number.isInteger(selection.option_number)) {
    fail("INVALID_DECISION_OPTION", "option_number must be an integer");
  }
  const option = decision.options.find((item) => item.number === selection.option_number);
  if (!option) fail("INVALID_DECISION_OPTION", "option_number does not exist in the pending decision");
  return option.assignment;
}

function beginOperation({ projectRoot, payload }) {
  const { statePath, state } = loadCurrentState(projectRoot);
  assertExpected(state, payload);
  if (state.state_meta.active_operation !== null || state.next_step_plan.length) {
    fail("ACTIVE_OPERATION", "finish or cancel the active operation before beginning another");
  }
  const assignmentFields = ["route", "support", "intent_summary", "scope_ref"];
  const allowedInput = new Set(["expected_project_id", "expected_revision", "selection", ...assignmentFields]);
  assertKnownKeys(payload, allowedInput, "begin input", "INVALID_INPUT");
  const hasSelection = Object.prototype.hasOwnProperty.call(payload, "selection");
  if (hasSelection && assignmentFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
    fail("INVALID_INPUT", "begin selection cannot be combined with route assignment fields");
  }
  const assignmentInput = hasSelection
    ? resolveDecisionSelection(state, payload.selection)
    : Object.fromEntries(
      assignmentFields
        .filter((field) => Object.prototype.hasOwnProperty.call(payload, field))
        .map((field) => [field, payload[field]]),
    );
  const { assignment, plan, stage } = normalizeAssignment(state, assignmentInput, "begin assignment");

  const operation = {
    id: crypto.randomUUID(),
    stage,
    intent_summary: assignment.intent_summary,
    scope_ref: assignment.scope_ref,
    artifact_intent: null,
    started_at: nowIso(),
  };
  state.next_step_plan = plan;
  state.state_meta.active_operation = operation;
  state.pending_decision = null;
  state.response_receipt = null;
  const revision = commitMutation(statePath, state);
  return {
    ok: true,
    code: stage === "lead_pending" ? "BEGAN_LEAD" : "BEGAN_WORKER",
    project_id: state.state_meta.project_id,
    revision,
    operation_id: operation.id,
    stage,
    plan,
  };
}

function assertOperation(state, payload, requiredStage = null) {
  const operation = state.state_meta.active_operation;
  if (!operation) fail("NO_ACTIVE_OPERATION", "no active operation exists");
  if (payload.operation_id !== operation.id) fail("STALE_OPERATION", "operation_id does not match the active operation");
  if (requiredStage && operation.stage !== requiredStage) {
    fail("INVALID_STAGE", `operation stage must be ${requiredStage}, found ${operation.stage}`);
  }
  return operation;
}

function normalizeExtension(value) {
  if (value === undefined || value === null || value === "") return "";
  const extension = value.startsWith(".") ? value : `.${value}`;
  if (!/^\.[a-z0-9]{1,10}$/i.test(extension)) fail("INVALID_INPUT", "extension must be a simple file extension");
  return extension.toLowerCase();
}

function resolveOutputPath(projectRoot, relativeLocation) {
  const normalized = normalizePath(relativeLocation);
  if (!normalized.startsWith("output/") || normalized.includes("\0")) {
    fail("INVALID_ARTIFACT_PATH", "artifact location must be a relative path under output/");
  }
  const root = path.resolve(projectRoot);
  const outputRoot = path.resolve(root, "output");
  const resolved = path.resolve(root, ...normalized.split("/"));
  if (resolved !== outputRoot && !resolved.startsWith(`${outputRoot}${path.sep}`)) {
    fail("INVALID_ARTIFACT_PATH", "artifact location escapes the project output directory");
  }
  return resolved;
}

function reserveArtifact({ projectRoot, payload }) {
  const { statePath, state } = loadCurrentState(projectRoot);
  assertExpected(state, payload);
  const allowedInput = new Set(["expected_project_id", "expected_revision", "operation_id", "kind", "slug", "extension"]);
  assertKnownKeys(payload, allowedInput, "reserve-artifact input", "INVALID_INPUT");
  const operation = assertOperation(state, payload, "worker_pending");
  const planInfo = validatePlan(state.next_step_plan);
  const actor = planInfo.actor;
  if (!(ARTIFACT_ACTORS.has(actor) || actor.startsWith("analysis_execution."))) {
    fail("OWNERSHIP_VIOLATION", `${actor} cannot create durable artifacts`);
  }
  if ((actor === "report_writer" || actor.startsWith("analysis_execution.")) && operation.scope_ref === null) {
    fail("SCOPE_MISMATCH", `${actor} must begin with an exact ready scope_ref before reserving output`);
  }
  if (operation.artifact_intent !== null) fail("ARTIFACT_ALREADY_RESERVED", "this operation already has an artifact reservation");
  assertEnum(payload.kind, ["file", "directory"], "kind", "INVALID_INPUT");
  if (
    typeof payload.slug !== "string"
    || payload.slug.length > MAX_ARTIFACT_SLUG_LENGTH
    || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(payload.slug)
  ) {
    fail("INVALID_INPUT", `slug must contain at most ${MAX_ARTIFACT_SLUG_LENGTH} lowercase letters, digits, hyphens, or underscores`);
  }
  const extension = payload.kind === "file" ? normalizeExtension(payload.extension) : "";
  if (payload.kind === "file" && !extension) fail("INVALID_INPUT", "file artifacts require an extension");
  if (payload.kind === "directory" && payload.extension !== undefined) fail("INVALID_INPUT", "directory artifacts do not use extensions");
  const location = `output/${payload.slug}-${operation.id.slice(0, 8)}${extension}`;
  const target = resolveOutputPath(projectRoot, location);
  const manifest = manifestPathFor(target, payload.kind);
  if (fs.existsSync(target) || fs.existsSync(manifest)) fail("ARTIFACT_COLLISION", `reserved location already exists: ${location}`);
  operation.artifact_intent = { kind: payload.kind, location };
  const revision = commitMutation(statePath, state);
  return {
    ok: true,
    code: "ARTIFACT_RESERVED",
    project_id: state.state_meta.project_id,
    revision,
    operation_id: operation.id,
    artifact_intent: operation.artifact_intent,
    temporary_path: temporaryArtifactLocation(operation.artifact_intent, operation.id),
    manifest_path: normalizePath(path.relative(path.resolve(projectRoot), manifest)),
  };
}

function temporaryArtifactLocation(intent, operationId) {
  const normalized = normalizePath(intent.location);
  const directory = path.posix.dirname(normalized);
  const name = path.posix.basename(normalized);
  return `${directory}/.${name}.tmp-${operationId.slice(0, 8)}`;
}

function manifestPathFor(target, kind) {
  return kind === "directory"
    ? path.join(target, "artifact-manifest.json")
    : `${target}.manifest.json`;
}

function expectedArtifactRoute(actor) {
  return actor.startsWith("analysis_execution.") ? "analysis_execution" : actor;
}

function validateManifest(projectRoot, operation, actor) {
  const intent = operation.artifact_intent;
  if (!intent) fail("MISSING_ARTIFACT", "no artifact is reserved for this operation");
  const target = resolveOutputPath(projectRoot, intent.location);
  if (!fs.existsSync(target)) fail("MISSING_ARTIFACT", `reserved artifact does not exist: ${intent.location}`);
  validateArtifactBody(projectRoot, operation, target);
  const manifestPath = manifestPathFor(target, intent.kind);
  if (!fs.existsSync(manifestPath)) fail("MISSING_ARTIFACT", `completion manifest does not exist: ${manifestPath}`);
  if (!fs.lstatSync(manifestPath).isFile()) {
    fail("INVALID_ARTIFACT_MANIFEST", "completion manifest must be a regular file");
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail("INVALID_ARTIFACT_MANIFEST", `completion manifest is invalid JSON: ${error.message}`);
  }
  assertKnownKeys(manifest, new Set([
    "schema_version",
    "operation_id",
    "route",
    "scope_ref",
    "files",
    "completed_at",
    "summary",
  ]), "artifact manifest", "INVALID_ARTIFACT_MANIFEST");
  if (manifest.schema_version !== MANIFEST_VERSION) fail("INVALID_ARTIFACT_MANIFEST", "unsupported manifest schema version");
  if (manifest.operation_id !== operation.id) fail("INVALID_ARTIFACT_MANIFEST", "manifest operation_id does not match");
  if (manifest.route !== expectedArtifactRoute(actor)) fail("INVALID_ARTIFACT_MANIFEST", "manifest route does not match the active worker");
  if (!deepEqual(manifest.scope_ref ?? null, operation.scope_ref ?? null)) fail("INVALID_ARTIFACT_MANIFEST", "manifest scope_ref does not match");
  if (!isTimestamp(manifest.completed_at)) fail("INVALID_ARTIFACT_MANIFEST", "manifest completed_at must be RFC3339 UTC");
  if (typeof manifest.summary !== "string" || !manifest.summary.trim()) fail("INVALID_ARTIFACT_MANIFEST", "manifest summary must be nonempty");
  assertArray(manifest.files, "artifact manifest.files", "INVALID_ARTIFACT_MANIFEST");
  if (!manifest.files.length || manifest.files.some((item) => typeof item !== "string" || !item.trim())) {
    fail("INVALID_ARTIFACT_MANIFEST", "manifest files must contain at least one project-relative path");
  }
  const normalizedLocation = normalizePath(intent.location);
  let includesPrimary = false;
  let includesDeliverable = false;
  for (const item of manifest.files) {
    const normalized = normalizePath(item);
    const resolved = resolveOutputPath(projectRoot, normalized);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      fail("MISSING_ARTIFACT", `manifest file does not exist: ${normalized}`);
    }
    if (intent.kind === "directory") {
      if (!resolved.startsWith(`${target}${path.sep}`)) {
        fail("INVALID_ARTIFACT_MANIFEST", `manifest file is outside the reserved directory: ${normalized}`);
      }
      if (resolved !== manifestPath) includesDeliverable = true;
    } else if (normalized === normalizedLocation) {
      includesPrimary = true;
      includesDeliverable = true;
    }
  }
  if (intent.kind === "file" && !includesPrimary) {
    fail("INVALID_ARTIFACT_MANIFEST", "file manifest must list the reserved primary file");
  }
  if (!includesDeliverable) {
    fail("INVALID_ARTIFACT_MANIFEST", "manifest must list at least one deliverable file, not only its own manifest");
  }
  return { target, manifestPath, manifest };
}

function validateArtifactBody(projectRoot, operation, artifactPath, temporary = false) {
  const intent = operation.artifact_intent;
  let stat;
  try {
    stat = fs.lstatSync(artifactPath);
  } catch (error) {
    fail("MISSING_ARTIFACT", `reserved artifact cannot be inspected: ${error.message}`);
  }
  if (intent.kind === "file") {
    if (!stat.isFile() || stat.size === 0) {
      fail("MISSING_ARTIFACT", "reserved file artifact is empty or not a regular file");
    }
    return [intent.location];
  }
  if (!stat.isDirectory()) fail("MISSING_ARTIFACT", "reserved directory artifact is not a directory");

  const files = [];
  const visit = (directory, relativeDirectory = "") => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      fail("IO_ERROR", `could not inspect reserved directory artifact: ${error.message}`);
    }
    for (const entry of entries) {
      const relative = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute, relative);
      else if (entry.isFile()) files.push(normalizePath(relative));
      else fail("INVALID_ARTIFACT_PATH", `reserved artifact contains an unsupported entry: ${normalizePath(relative)}`);
    }
  };
  visit(artifactPath);
  if (temporary && files.includes("artifact-manifest.json")) {
    fail("ARTIFACT_COLLISION", "artifact-manifest.json is controller-owned");
  }
  if (!files.length) fail("MISSING_ARTIFACT", "reserved directory artifact contains no deliverable files");
  return files.sort().map((relative) => `${normalizePath(intent.location)}/${relative}`);
}

function generatedManifest(operation, actor, files, summary) {
  return {
    schema_version: MANIFEST_VERSION,
    operation_id: operation.id,
    route: expectedArtifactRoute(actor),
    scope_ref: operation.scope_ref ?? null,
    files,
    completed_at: nowIso(),
    summary,
  };
}

function artifactSummary(artifactInput) {
  if (!isObject(artifactInput) || Object.keys(artifactInput).some((key) => key !== "summary")) {
    fail("INVALID_INPUT", "artifact input must contain only summary");
  }
  if (typeof artifactInput.summary !== "string" || !artifactInput.summary.trim()) {
    fail("INVALID_INPUT", "artifact summary must be nonempty");
  }
  return artifactInput.summary.trim();
}

function publishReservedArtifact(projectRoot, operation, actor, artifactInput) {
  const summary = artifactSummary(artifactInput);
  const intent = operation.artifact_intent;
  if (!intent) fail("MISSING_ARTIFACT", "no artifact is reserved for this operation");
  const target = resolveOutputPath(projectRoot, intent.location);
  const temporaryLocation = temporaryArtifactLocation(intent, operation.id);
  const temporary = resolveOutputPath(projectRoot, temporaryLocation);
  const manifestPath = manifestPathFor(target, intent.kind);
  const artifactStatus = inspectReservedArtifact(projectRoot, operation, actor);

  if (artifactStatus.location_state === "collision") {
    fail("ARTIFACT_COLLISION", "the reserved artifact locations are in conflict");
  }
  if (artifactStatus.location_state === "absent") {
    fail("MISSING_ARTIFACT", `reserved temporary artifact does not exist: ${temporaryLocation}`);
  }
  if (artifactStatus.location_state === "complete") {
    const completed = validateManifest(projectRoot, operation, actor);
    if (completed.manifest.summary.trim() !== summary) {
      fail("INVALID_ARTIFACT_MANIFEST", "artifact summary must match the completion manifest summary");
    }
    return completed;
  }
  if (artifactStatus.location_state === "invalid") {
    if (artifactEntryExists(manifestPath)) validateManifest(projectRoot, operation, actor);
    validateArtifactBody(projectRoot, operation, target);
    fail(artifactStatus.reason_code, "reserved artifact is invalid");
  }

  if (artifactStatus.location_state === "final-awaiting-manifest") {
    const files = validateArtifactBody(projectRoot, operation, target);
    atomicWrite(manifestPath, `${JSON.stringify(generatedManifest(operation, actor, files, summary), null, 2)}\n`);
  } else if (artifactStatus.location_state === "temp-only") {
    const files = validateArtifactBody(projectRoot, operation, temporary, true);
    const manifest = generatedManifest(operation, actor, files, summary);
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      fail("IO_ERROR", `could not publish reserved artifact: ${error.message}`);
    }
    atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } else {
    fail("INTERNAL_ERROR", `unsupported artifact location state: ${artifactStatus.location_state}`);
  }

  const completed = validateManifest(projectRoot, operation, actor);
  if (completed.manifest.summary.trim() !== summary) {
    fail("INVALID_ARTIFACT_MANIFEST", "artifact summary must match the completion manifest summary");
  }
  return completed;
}

function artifactEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (["ENOENT", "ENOTDIR"].includes(error.code)) return false;
    fail("IO_ERROR", `could not inspect reserved artifact path: ${error.message}`);
  }
}

function inspectReservedArtifact(projectRoot, operation, actor) {
  const target = resolveOutputPath(projectRoot, operation.artifact_intent.location);
  const temporary = resolveOutputPath(
    projectRoot,
    temporaryArtifactLocation(operation.artifact_intent, operation.id),
  );
  const manifestPath = manifestPathFor(target, operation.artifact_intent.kind);
  const relativeManifestPath = normalizePath(path.relative(path.resolve(projectRoot), manifestPath));
  const base = {
    location: operation.artifact_intent.location,
    temporary_path: temporaryArtifactLocation(operation.artifact_intent, operation.id),
    manifest_path: relativeManifestPath,
  };
  const describe = (locationState, reasonCode = null) => ({
    status: locationState === "complete" ? "complete" : "incomplete",
    location_state: locationState,
    ...base,
    ...(reasonCode === null ? {} : { reason_code: reasonCode }),
  });
  const targetExists = artifactEntryExists(target);
  const temporaryExists = artifactEntryExists(temporary);
  const manifestExists = artifactEntryExists(manifestPath);

  if ((targetExists && temporaryExists) || (!targetExists && manifestExists)) {
    return describe("collision", "ARTIFACT_COLLISION");
  }
  if (!targetExists) {
    return temporaryExists
      ? describe("temp-only", "MISSING_ARTIFACT")
      : describe("absent", "MISSING_ARTIFACT");
  }
  if (!manifestExists) {
    try {
      validateArtifactBody(projectRoot, operation, target);
      return describe("final-awaiting-manifest", "MISSING_ARTIFACT");
    } catch (error) {
      if (error instanceof StateError && ["MISSING_ARTIFACT", "INVALID_ARTIFACT_PATH"].includes(error.code)) {
        return describe("invalid", error.code);
      }
      throw error;
    }
  }
  try {
    validateManifest(projectRoot, operation, actor);
    return describe("complete");
  } catch (error) {
    if (
      error instanceof StateError
      && ["MISSING_ARTIFACT", "INVALID_ARTIFACT_MANIFEST", "INVALID_ARTIFACT_PATH"].includes(error.code)
    ) {
      return describe("invalid", error.code);
    }
    throw error;
  }
}

function rejectControllerFields(patch, label, fields = ["last_updated"]) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(patch, field)) {
      fail("OWNERSHIP_VIOLATION", `${label}.${field} is controller-owned`);
    }
  }
}

function validatePatchKeys(patch, section) {
  assertKnownKeys(patch, SECTION_KEYS[section], `updates.${section}`, "OWNERSHIP_VIOLATION");
  rejectControllerFields(patch, `updates.${section}`);
  if (section === "report_assembly") {
    rejectControllerFields(patch, "updates.report_assembly", ["scope_id", "scope_revision"]);
  }
}

function validateChamberPatch(patch, route, analysis = false) {
  const allowed = analysis ? ANALYSIS_CHAMBER_KEYS : CHAMBER_KEYS;
  assertKnownKeys(patch, allowed, `updates.council_chamber.${route}`, "OWNERSHIP_VIOLATION");
  rejectControllerFields(patch, `updates.council_chamber.${route}`);
  if (analysis) rejectControllerFields(patch, `updates.council_chamber.${route}`, ["scope_id", "scope_revision"]);
}

function assertScopeHandoffStatus(patch, label) {
  assertEnum(patch.current_status, ["ready", "blocked", "done"], `${label}.current_status`, "INVALID_INPUT");
}

function assertCoreHandoffStatus(patch, label) {
  if (typeof patch.current_status !== "string" || !patch.current_status.trim()) {
    fail("INVALID_INPUT", `${label}.current_status must be a nonempty string`);
  }
}

function validateOwnedUpdates(actor, updates) {
  assertObject(updates, "updates", "INVALID_INPUT");
  const keys = new Set(Object.keys(updates));
  const allowedRoots = new Set();
  let chamberRoute = actor;
  let analysisDesign = null;
  if (actor === "data_audit") allowedRoots.add("data_facts");
  else if (actor === "domain_expert") allowedRoots.add("domain_knowledge");
  else if (actor === "causal_check") allowedRoots.add("causal_facts");
  else if (actor === "causal_discovery") allowedRoots.add("discovery_sidecar");
  else if (actor === "report_writer") allowedRoots.add("report_assembly");
  else if (actor.startsWith("analysis_execution.")) {
    analysisDesign = actor.slice("analysis_execution.".length);
    chamberRoute = "analysis_execution";
  } else {
    fail("OWNERSHIP_VIOLATION", `unknown worker actor: ${actor}`);
  }
  allowedRoots.add("council_chamber");
  const disallowed = [...keys].filter((key) => !allowedRoots.has(key));
  if (disallowed.length) fail("OWNERSHIP_VIOLATION", `${actor} cannot update: ${disallowed.join(", ")}`);
  for (const section of [...allowedRoots].filter((key) => key !== "council_chamber")) {
    if (updates[section] !== undefined) validatePatchKeys(updates[section], section);
  }
  if (updates.council_chamber !== undefined) {
    assertObject(updates.council_chamber, "updates.council_chamber", "INVALID_INPUT");
    if (analysisDesign) {
      assertKnownKeys(updates.council_chamber, new Set(["analysis_execution"]), "updates.council_chamber", "OWNERSHIP_VIOLATION");
      assertObject(updates.council_chamber.analysis_execution, "updates.council_chamber.analysis_execution", "INVALID_INPUT");
      assertKnownKeys(updates.council_chamber.analysis_execution, new Set([analysisDesign]), "updates.council_chamber.analysis_execution", "OWNERSHIP_VIOLATION");
      validateChamberPatch(updates.council_chamber.analysis_execution[analysisDesign], analysisDesign, true);
    } else {
      assertKnownKeys(updates.council_chamber, new Set([chamberRoute]), "updates.council_chamber", "OWNERSHIP_VIOLATION");
      validateChamberPatch(updates.council_chamber[chamberRoute], chamberRoute, false);
    }
  }
}

function applyScopeTransition(state, operation, actor, updates, transition, hasArtifact) {
  const isAnalysis = actor.startsWith("analysis_execution.");
  const isReport = actor === "report_writer";
  if (!isAnalysis && !isReport) {
    if (transition !== undefined && transition !== null) fail("INVALID_INPUT", `${actor} cannot use scope_transition`);
    return;
  }
  if (!["new", "revise", "preserve"].includes(transition)) {
    fail("INVALID_INPUT", `${actor} apply requires scope_transition: new, revise, or preserve`);
  }
  let current;
  let patch;
  if (isAnalysis) {
    const design = actor.slice("analysis_execution.".length);
    current = state.council_chamber.analysis_execution[design] || {
      scope_id: null,
      scope_revision: 0,
    };
    patch = updates.council_chamber && updates.council_chamber.analysis_execution
      ? updates.council_chamber.analysis_execution[design]
      : null;
    if (!patch) fail("INVALID_INPUT", "analysis scope transition requires a matching chamber patch");
  } else {
    current = state.report_assembly;
    patch = updates.report_assembly;
    if (!patch) fail("INVALID_INPUT", "report scope transition requires a report_assembly patch");
  }
  const hasCurrentIdentity = isUuid(current.scope_id)
    && Number.isInteger(current.scope_revision)
    && current.scope_revision >= 1;
  if (isAnalysis && hasCurrentIdentity && transition === "preserve" && current.support !== patch.support) {
    fail("SCOPE_MISMATCH", "changing analysis support requires scope_transition new or revise");
  }
  if (operation.scope_ref !== null) {
    if (current.scope_id !== operation.scope_ref.id || current.scope_revision !== operation.scope_ref.revision) {
      fail("SCOPE_MISMATCH", "the approved scope changed before worker apply");
    }
    if (transition !== "preserve") {
      const nextStatus = isAnalysis
        ? patch.current_status
        : updates.council_chamber && updates.council_chamber.report_writer
          ? updates.council_chamber.report_writer.current_status
          : undefined;
      if (hasArtifact || nextStatus === "done") {
        fail("SCOPE_MISMATCH", "output creation must preserve the exact approved scope");
      }
      if (!["ready", "blocked"].includes(nextStatus)) {
        fail("SCOPE_MISMATCH", "a material scope change must return a ready or blocked handoff without output");
      }
    }
  }
  if (transition === "new") {
    patch.scope_id = crypto.randomUUID();
    patch.scope_revision = 1;
  } else {
    if (!isUuid(current.scope_id) || !Number.isInteger(current.scope_revision) || current.scope_revision < 1) {
      fail("SCOPE_MISMATCH", `cannot ${transition} a scope that has no current identity`);
    }
    patch.scope_id = current.scope_id;
    patch.scope_revision = current.scope_revision + (transition === "revise" ? 1 : 0);
  }
  operation.scope_ref = {
    kind: isAnalysis ? "analysis" : "report",
    id: patch.scope_id,
    revision: patch.scope_revision,
  };
}

function emptyChamberSlot() {
  return {
    last_updated: null,
    current_status: null,
    summary: null,
    questions_for_user: [],
    feedback_to_route: [],
  };
}

function emptyAnalysisSlot() {
  return {
    ...emptyChamberSlot(),
    scope_id: null,
    scope_revision: 0,
    support: null,
  };
}

function emptyReportAssembly() {
  return {
    last_updated: null,
    scope_id: null,
    scope_revision: 0,
    current_format: null,
    report_goal: null,
    audience: null,
    target_section: null,
    planned_structure: [],
    key_points: [],
    wording_constraints: [],
    draft_notes: [],
  };
}

function resetNewScopeState(state, actor, transition) {
  if (transition !== "new") return;
  if (actor.startsWith("analysis_execution.")) {
    const design = actor.slice("analysis_execution.".length);
    state.council_chamber.analysis_execution[design] = emptyAnalysisSlot();
  } else if (actor === "report_writer") {
    state.report_assembly = emptyReportAssembly();
    state.council_chamber.report_writer = emptyChamberSlot();
  }
}

function validateScopeCompletion(state, actor, updates, hasArtifact) {
  const isAnalysis = actor.startsWith("analysis_execution.");
  const isReport = actor === "report_writer";
  if (!isAnalysis && !isReport) return;
  const status = isAnalysis
    ? state.council_chamber.analysis_execution[actor.slice("analysis_execution.".length)].current_status
    : state.council_chamber.report_writer.current_status;
  if ((status === "done") !== hasArtifact) {
    fail("SCOPE_MISMATCH", hasArtifact
      ? `${actor} artifact completion requires current_status done`
      : `${actor} current_status done requires a completed artifact`);
  }
  if (isReport && hasArtifact) {
    const chamberPatch = updates.council_chamber && updates.council_chamber.report_writer;
    if (!chamberPatch || chamberPatch.current_status !== "done") {
      fail("SCOPE_MISMATCH", "report output requires an explicit report_writer transition to done");
    }
    if (state.report_assembly.current_format !== "html") {
      fail("SCOPE_MISMATCH", "report output requires report_assembly.current_format html");
    }
  }
}

function validateCausalCheckReadiness(state, actor, updates) {
  if (actor !== "causal_check") return;

  const patch = updates.causal_facts || {};
  const decisionFields = [
    "analysis_readiness",
    "support_status",
    "recommended_checks",
    "recommended_method_routes",
  ];
  const reassessed = Object.hasOwn(patch, "analysis_readiness")
    || Object.hasOwn(patch, "recommended_method_routes");
  if (!reassessed) return;

  const missing = decisionFields.filter((field) => !Object.hasOwn(patch, field));
  if (missing.length) {
    fail("INVALID_INPUT", `causal_check readiness reassessment requires the complete decision bundle; missing: ${missing.join(", ")}`);
  }

  const readiness = state.causal_facts.analysis_readiness;
  const recommendations = state.causal_facts.recommended_method_routes;
  assertEnum(readiness, ["ready", "limited", "not_ready", "blocked"], "causal_facts.analysis_readiness", "INVALID_INPUT");
  assertStringOrNull(state.causal_facts.support_status, "causal_facts.support_status", "INVALID_INPUT");
  assertStringArray(state.causal_facts.recommended_checks, "causal_facts.recommended_checks", "INVALID_INPUT");
  assertArray(recommendations, "causal_facts.recommended_method_routes", "INVALID_INPUT");
  recommendations.forEach((route, index) => assertObject(
    route,
    `causal_facts.recommended_method_routes[${index}]`,
    "INVALID_INPUT",
  ));
  const designRoutes = recommendations.filter((route) => route.category === "design");
  if (["ready", "limited"].includes(readiness) && designRoutes.length !== 1) {
    fail("INVALID_INPUT", "causal_check apply with analysis_readiness ready or limited requires one recommended design route");
  }
  if (["not_ready", "blocked"].includes(readiness) && recommendations.length) {
    fail("INVALID_INPUT", "causal_check apply with analysis_readiness not_ready or blocked requires empty method recommendations");
  }
  if (readiness === "ready" && designRoutes[0] && designRoutes[0].id === "descriptive_association") {
    fail("INVALID_INPUT", "descriptive_association requires analysis_readiness limited");
  }
}

function stampWorkerUpdates(updates, actor, timestamp) {
  const roots = Object.keys(updates).filter((key) => key !== "council_chamber");
  for (const root of roots) updates[root].last_updated = timestamp;
  if (updates.council_chamber) {
    if (actor.startsWith("analysis_execution.")) {
      const design = actor.slice("analysis_execution.".length);
      updates.council_chamber.analysis_execution[design].last_updated = timestamp;
    } else {
      updates.council_chamber[actor].last_updated = timestamp;
    }
  }
}

function normalizeCompletedHandoff(updates, actor, artifactInput) {
  if (artifactInput === undefined || artifactInput === null) return;
  const summary = artifactSummary(artifactInput);
  if (actor.startsWith("analysis_execution.")) {
    const design = actor.slice("analysis_execution.".length);
    const patch = updates.council_chamber.analysis_execution[design];
    patch.summary = summary;
    patch.questions_for_user = [];
  } else if (actor === "report_writer") {
    const patch = updates.council_chamber.report_writer;
    patch.summary = summary;
    patch.questions_for_user = [];
  }
}

function appendArtifactRecord(state, projectRoot, operation, actor, artifactInput) {
  const summary = artifactSummary(artifactInput);
  const { manifest } = validateManifest(projectRoot, operation, actor);
  if ((actor === "report_writer" || actor.startsWith("analysis_execution.")) && operation.scope_ref === null) {
    fail("SCOPE_MISMATCH", `${actor} output requires an exact approved scope_ref`);
  }
  if (summary !== manifest.summary.trim()) {
    fail("INVALID_ARTIFACT_MANIFEST", "artifact summary must match the completion manifest summary");
  }
  if (state.artifact_records.some((record) => record.operation_id === operation.id)) {
    fail("DUPLICATE_ARTIFACT", "this operation already has an artifact record");
  }
  const planInfo = validatePlan(state.next_step_plan);
  const record = {
    artifact_id: crypto.randomUUID(),
    operation_id: operation.id,
    route: expectedArtifactRoute(actor),
    location: operation.artifact_intent.location,
    created_at: nowIso(),
    summary,
  };
  if (actor.startsWith("analysis_execution.")) {
    record.design = planInfo.design;
    record.support = planInfo.support;
  }
  state.artifact_records.push(record);
  return record;
}

function applyWorker({ projectRoot, payload }) {
  const { statePath, state } = loadCurrentState(projectRoot);
  assertExpected(state, payload);
  const allowedInput = new Set([
    "expected_project_id",
    "expected_revision",
    "operation_id",
    "actor",
    "updates",
    "scope_transition",
    "artifact",
  ]);
  assertKnownKeys(payload, allowedInput, "apply input", "INVALID_INPUT");
  const operation = assertOperation(state, payload, "worker_pending");
  const planInfo = validatePlan(state.next_step_plan);
  if (payload.actor !== planInfo.actor) fail("PLAN_MISMATCH", `apply actor must be ${planInfo.actor}`);
  validateOwnedUpdates(payload.actor, payload.updates);
  const updates = clone(payload.updates);
  const hadApprovedScope = operation.scope_ref !== null;
  if (
    payload.artifact !== undefined
    && payload.artifact !== null
    && (payload.actor === "report_writer" || payload.actor.startsWith("analysis_execution."))
    && !hadApprovedScope
  ) {
    fail("SCOPE_MISMATCH", `${payload.actor} cannot publish output without the scope_ref bound by begin`);
  }
  if (payload.actor.startsWith("analysis_execution.")) {
    const design = payload.actor.slice("analysis_execution.".length);
    const chamberPatch = updates.council_chamber
      && updates.council_chamber.analysis_execution
      && updates.council_chamber.analysis_execution[design];
    if (!chamberPatch) fail("INVALID_INPUT", "analysis apply requires its matching chamber handoff");
    assertScopeHandoffStatus(chamberPatch, `updates.council_chamber.analysis_execution.${design}`);
    if (chamberPatch.support !== undefined && chamberPatch.support !== planInfo.support) {
      fail("SCOPE_MISMATCH", "analysis chamber support must match the planned support route");
    }
    chamberPatch.support = planInfo.support;
  } else if (payload.actor === "report_writer") {
    const chamberPatch = updates.council_chamber && updates.council_chamber.report_writer;
    if (!chamberPatch) fail("INVALID_INPUT", "report apply requires its matching chamber handoff");
    assertScopeHandoffStatus(chamberPatch, "updates.council_chamber.report_writer");
  } else {
    const chamberPatch = updates.council_chamber && updates.council_chamber[payload.actor];
    if (!chamberPatch) fail("INVALID_INPUT", `${payload.actor} apply requires its matching chamber handoff`);
    assertCoreHandoffStatus(chamberPatch, `updates.council_chamber.${payload.actor}`);
  }
  applyScopeTransition(
    state,
    operation,
    payload.actor,
    updates,
    payload.scope_transition,
    payload.artifact !== undefined && payload.artifact !== null,
  );
  resetNewScopeState(state, payload.actor, payload.scope_transition);
  normalizeCompletedHandoff(updates, payload.actor, payload.artifact);
  stampWorkerUpdates(updates, payload.actor, nowIso());

  const hasArtifact = payload.artifact !== undefined && payload.artifact !== null;
  const merged = deepMerge(state, updates);
  validateCausalCheckReadiness(merged, payload.actor, updates);
  validateScopeCompletion(merged, payload.actor, updates, hasArtifact);

  let artifactRecord = null;
  if (hasArtifact) {
    if (!operation.artifact_intent) fail("MISSING_ARTIFACT", "artifact output was not reserved");
    if (merged.artifact_records.some((record) => record.operation_id === operation.id)) {
      fail("DUPLICATE_ARTIFACT", "this operation already has an artifact record");
    }
    publishReservedArtifact(projectRoot, operation, payload.actor, payload.artifact);
    artifactRecord = appendArtifactRecord(merged, projectRoot, operation, payload.actor, payload.artifact);
  } else if (operation.artifact_intent) {
    const artifactStatus = inspectReservedArtifact(projectRoot, operation, payload.actor);
    if (!["absent", "temp-only"].includes(artifactStatus.location_state)) {
      if (artifactStatus.location_state === "collision") {
        fail("ARTIFACT_COLLISION", "the reserved artifact locations are in conflict and cannot be left unrecorded");
      }
      if (artifactStatus.location_state === "invalid" && artifactStatus.reason_code !== "MISSING_ARTIFACT") {
        fail(artifactStatus.reason_code, "the reserved final artifact is invalid and cannot be left unrecorded");
      }
      fail("MISSING_ARTIFACT_RECORD", "a reserved final artifact must be completed and recorded by apply");
    }
  }

  if (deriveSummaryAggregates(merged)) merged.project_summary.last_updated = nowIso();
  merged.state_meta.active_operation.stage = "lead_pending";
  const revision = commitMutation(statePath, merged);
  return {
    ok: true,
    code: "WORKER_APPLIED",
    project_id: merged.state_meta.project_id,
    revision,
    operation_id: operation.id,
    stage: "lead_pending",
    artifact_record: artifactRecord,
  };
}

function deriveSummaryAggregates(state) {
  const hasArtifact = (route) => state.artifact_records.some((record) => record.route === route);
  const coreComplete = {
    data_audit_complete: ["passing", "limited"].includes(state.data_facts.data_checked),
    domain_knowledge_complete: ["passing", "limited"].includes(state.domain_knowledge.domain_checked),
    causal_check_complete: ["passing", "limited"].includes(state.causal_facts.causal_checked),
  };
  const derived = {
    ...coreComplete,
    exploration_complete: Object.values(coreComplete).every(Boolean),
    analysis_output: hasArtifact("analysis_execution") ? "exist" : "non_exist",
    report_output: hasArtifact("report_writer") ? "exist" : "non_exist",
  };
  const changed = Object.entries(derived).some(([field, value]) => state.project_summary[field] !== value);
  Object.assign(state.project_summary, derived);
  return changed;
}

function rejectReadyScopeSummaryUpdate(state, updates) {
  if (
    !updates.project_summary
    || !Object.prototype.hasOwnProperty.call(updates.project_summary, "exploration_summary")
  ) return;
  const actor = validatePlan(state.next_step_plan).actor;
  const status = actor && actor.startsWith("analysis_execution.")
    ? state.council_chamber.analysis_execution[actor.slice("analysis_execution.".length)].current_status
    : actor === "report_writer"
      ? state.council_chamber.report_writer.current_status
      : null;
  if (
    status === "ready"
    && !deepEqual(updates.project_summary.exploration_summary, state.project_summary.exploration_summary)
  ) {
    fail(
      "OWNERSHIP_VIOLATION",
      "a ready analysis or report scope remains route-owned and cannot update project_summary.exploration_summary",
    );
  }
}

function normalizePresentation(state, presentation) {
  const fields = ["confirmation", "framing", "options", "boundary", "next_steps"];
  assertKnownKeys(presentation, new Set(fields), "finish presentation", "INVALID_INPUT");
  const missing = fields.filter((field) => !Object.prototype.hasOwnProperty.call(presentation, field));
  if (missing.length) fail("INVALID_INPUT", `finish presentation is missing: ${missing.join(", ")}`);

  let confirmation = null;
  if (presentation.confirmation !== null) {
    confirmation = normalizeResponseText(
      presentation.confirmation,
      "finish presentation.confirmation",
      true,
    );
  }
  const framing = normalizeResponseText(presentation.framing, "finish presentation.framing");
  const boundary = normalizeResponseText(presentation.boundary, "finish presentation.boundary");
  const suppliedNextSteps = normalizeResponseText(
    presentation.next_steps,
    "finish presentation.next_steps",
    true,
  );
  assertArray(presentation.options, "finish presentation.options", "INVALID_INPUT");
  if (presentation.options.length === 1 || presentation.options.length > 4) {
    fail("INVALID_INPUT", "finish presentation.options must contain 0 or 2-4 choices");
  }

  const options = presentation.options.map((option, index) => {
    const label = `finish presentation.options[${index}]`;
    assertKnownKeys(
      option,
      new Set(["label", "consultant_read", "tradeoff", "assignment"]),
      label,
      "INVALID_INPUT",
    );
    const required = ["label", "consultant_read", "tradeoff", "assignment"];
    const missingOptionFields = required.filter(
      (field) => !Object.prototype.hasOwnProperty.call(option, field),
    );
    if (missingOptionFields.length) {
      fail("INVALID_INPUT", `${label} is missing: ${missingOptionFields.join(", ")}`);
    }
    return {
      label: normalizeResponseText(option.label, `${label}.label`, true),
      consultant_read: normalizeResponseText(
        option.consultant_read,
        `${label}.consultant_read`,
        true,
      ),
      tradeoff: normalizeResponseText(option.tradeoff, `${label}.tradeoff`, true),
      assignment: normalizeAssignment(state, option.assignment, `${label}.assignment`).assignment,
    };
  });
  const normalizedLabels = options.map((option) => option.label.toLowerCase());
  if (new Set(normalizedLabels).size !== normalizedLabels.length) {
    fail("INVALID_INPUT", "finish presentation.options must contain distinct labels");
  }
  if (hasDuplicateAssignments(options)) {
    fail("INVALID_INPUT", "finish presentation.options must contain distinct assignments");
  }

  return {
    confirmation,
    framing,
    options,
    boundary,
    next_steps: options.length ? MENU_NEXT_STEPS : suppliedNextSteps,
  };
}

function decisionFromPresentation(presentation, operationId) {
  if (presentation.options.length === 0) return null;
  return {
    decision_id: crypto.randomUUID(),
    source_operation_id: operationId,
    created_at: nowIso(),
    options: presentation.options.map((option, index) => ({
      number: index + 1,
      assignment: clone(option.assignment),
    })),
  };
}

function renderPresentation(presentation, includeWelcome) {
  const blocks = [];
  if (presentation.confirmation !== null) {
    blocks.push(`[OK Confirmed] ${presentation.confirmation}`);
  }
  if (includeWelcome) blocks.push(WELCOME_LINE);
  blocks.push(`[> Framing]\n${presentation.framing}`);
  if (presentation.options.length) {
    const optionLines = ["[+ Consultant Options]"];
    presentation.options.forEach((option, index) => {
      optionLines.push(
        `    ${index + 1}. ${option.label}`,
        `       Consultant read: ${option.consultant_read}`,
        `       Tradeoff: ${option.tradeoff}`,
      );
    });
    blocks.push(optionLines.join("\n"));
  }
  blocks.push(`[! Boundary]\n${presentation.boundary}`);
  blocks.push(`[? Next Steps]\n${presentation.next_steps}`);
  return blocks.join("\n\n");
}

function finishOperation({ projectRoot, payload, cancel = false }) {
  const { statePath, state } = loadCurrentState(projectRoot);
  assertExpected(state, payload);
  const allowedInput = new Set([
    "expected_project_id",
    "expected_revision",
    "operation_id",
    "updates",
    "presentation",
  ]);
  assertKnownKeys(payload, allowedInput, "finish input", "INVALID_INPUT");
  const operation = assertOperation(state, payload, cancel ? null : "lead_pending");
  if (!Object.prototype.hasOwnProperty.call(payload, "presentation")) {
    fail("INVALID_INPUT", "finish input requires presentation");
  }
  const updates = payload.updates ?? {};
  assertObject(updates, "updates", "INVALID_INPUT");
  if (cancel && Object.keys(updates).length > 0) {
    fail("OWNERSHIP_VIOLATION", "finish --cancel preserves durable state and does not accept updates");
  }
  assertKnownKeys(updates, new Set(["project_summary"]), "finish updates", "OWNERSHIP_VIOLATION");
  if (updates.project_summary !== undefined) {
    assertKnownKeys(
      updates.project_summary,
      SECTION_KEYS.project_summary,
      "updates.project_summary",
      "OWNERSHIP_VIOLATION",
    );
    rejectControllerFields(
      updates.project_summary,
      "updates.project_summary",
      ["last_updated", ...DERIVED_SUMMARY_FIELDS],
    );
  }
  rejectReadyScopeSummaryUpdate(state, updates);
  const startupNotice = state.state_meta.startup_notice;
  const previousSummary = clone(state.project_summary);
  const merged = deepMerge(state, updates);
  deriveSummaryAggregates(merged);
  if (!deepEqual(previousSummary, merged.project_summary)) merged.project_summary.last_updated = nowIso();
  merged.next_step_plan = [];
  merged.state_meta.active_operation = null;
  merged.state_meta.startup_notice = null;
  merged.pending_decision = null;
  const presentation = normalizePresentation(merged, payload.presentation);
  merged.pending_decision = decisionFromPresentation(presentation, operation.id);
  const responseMarkdown = renderPresentation(
    presentation,
    startupNotice !== null,
  );
  merged.response_receipt = {
    operation_id: operation.id,
    revision: merged.state_meta.revision + 1,
    created_at: nowIso(),
    response_markdown: responseMarkdown,
  };
  const revision = commitMutation(statePath, merged);
  return {
    ok: true,
    code: cancel ? "OPERATION_CANCELLED" : "OPERATION_FINISHED",
    project_id: merged.state_meta.project_id,
    revision,
    operation_id: operation.id,
    mode: "idle",
    next_action: "deliver_response_and_stop",
    pending_decision: merged.pending_decision,
    response_markdown: responseMarkdown,
  };
}

function scopeSnapshot(state) {
  const analysis = {};
  for (const design of Object.keys(state.council_chamber.analysis_execution).sort()) {
    const slot = state.council_chamber.analysis_execution[design];
    if (slot.scope_id === null) continue;
    analysis[design] = {
      scope_id: slot.scope_id,
      scope_revision: slot.scope_revision,
      current_status: slot.current_status,
      support: slot.support,
      last_updated: slot.last_updated,
    };
  }
  const report = state.report_assembly.scope_id === null
    ? null
    : {
      scope_id: state.report_assembly.scope_id,
      scope_revision: state.report_assembly.scope_revision,
      current_status: state.council_chamber.report_writer.current_status,
      last_updated: state.council_chamber.report_writer.last_updated,
    };
  return { analysis, report };
}

function validateProject({ projectRoot }) {
  const root = path.resolve(projectRoot);
  const statePath = statePathFor(root);
  if (!fs.existsSync(statePath)) {
    return { ok: false, code: "MISSING_STATE", state_path: statePath, warnings: [] };
  }
  const state = parseYaml(readText(statePath), statePath);
  const { planInfo } = validateState(state);
  return {
    ok: true,
    code: "VALID",
    state_path: statePath,
    project_id: state.state_meta.project_id,
    revision: state.state_meta.revision,
    active_operation: state.state_meta.active_operation,
    plan: state.next_step_plan,
    plan_actor: planInfo.actor,
    pending_decision: state.pending_decision,
    response_receipt: state.response_receipt,
    scope_snapshot: scopeSnapshot(state),
    warnings: artifactWarnings(root, state),
  };
}

function validateTemplate({ skillRoot }) {
  loadTemplate(skillRoot);
  return {
    ok: true,
    code: "VALID_TEMPLATE",
    schema_version: SCHEMA_VERSION,
    capabilities: {
      scope_snapshot: 1,
      response_rendering: 1,
      pending_decision: 1,
      response_receipt: 1,
      startup_notice: 1,
    },
  };
}

module.exports = {
  StateError,
  applyWorker,
  beginOperation,
  finishOperation,
  openProject,
  reserveArtifact,
  validateProject,
  validateTemplate,
};
