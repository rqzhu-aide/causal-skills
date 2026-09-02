"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const YAML = require("yaml");
const ROUTES = require("./route-catalog.json");

const SCHEMA_VERSION = 9;
const MANIFEST_VERSION = 3;
const RECEIPT_MANIFEST_VERSION = 2;
const LEGACY_MANIFEST_VERSION = 1;
const PHASE_CAPSULE_PROTOCOL = "phase-capsule-v1";
const PHASE_CAPSULE_VERSION = 1;
const STATE_FILE = "project_state.yaml";
const STATE_LOCK_FILE = ".causal-consultant-state.lock";
const STATE_LOCK_OWNER_FILE = "owner.json";
const STATE_LOCK_INITIALIZATION_GRACE_MS = 30_000;
const ARCHIVE_DIR = "project_state.archives";
const AUDIENCE_LEVELS = ["unstated", "novice", "applied", "trained", "expert"];
const MAX_AUDIENCE_PREFERENCES = 3;
const MAX_AUDIENCE_TEXT_LENGTH = 300;
const MAX_CARRIED_QUESTIONS = 100;
const MAX_CARRIED_QUESTION_ACTIONS = 20;
const MAX_CARRIED_QUESTION_TEXT_LENGTH = 500;
const CARRIED_QUESTION_STATUSES = ["open", "retired"];
const CARRIED_QUESTION_RESOLUTION_KINDS = ["answered", "immaterial", "unavailable"];
const CARRIED_QUESTION_SOURCE_KINDS = ["handoff", "synthesized", "legacy_v8"];
const MAX_INTENT_LENGTH = 1000;
const MAX_RESPONSE_TEXT_LENGTH = 1000;
const MAX_RESPONSE_FRAMING_LENGTH = 6000;
const MAX_ARTIFACT_SLUG_LENGTH = 80;
const MAX_EVIDENCE_LOCATOR_LENGTH = 500;
const MAX_RECEIPT_DEVIATIONS = 20;
const MAX_ANALYSIS_OPTIONS = 3;
const MAX_ANALYSIS_OPTION_TEXT_LENGTH = 500;
const MAX_ANALYSIS_OPTION_LIST_ITEMS = 4;
const MAX_ANALYSIS_OPTION_TOTAL_TEXT_LENGTH = 2500;
const DISCOVERY_CONTRACT_KEYS = new Set([
  "target",
  "input_refs",
  "variables",
  "method_plan",
  "constraints",
  "diagnostic_requirements",
  "output_type",
  "claim_boundary",
]);
const ANALYSIS_CONTRACT_KEYS = new Set([
  "target",
  "input_refs",
  "method_plan",
  "execution_requirements",
  "output_type",
  "claim_boundary",
]);
const REQUIREMENT_KINDS = new Set([
  "target",
  "input_ref",
  "method_plan",
  "execution_requirement",
  "output_type",
  "claim_boundary",
  "variable",
  "constraint",
  "diagnostic_requirement",
  "report_goal",
  "audience",
  "target_section",
  "planned_structure",
  "key_points",
  "wording_constraints",
  "current_format",
  "analysis_artifact_id",
]);
const ARTIFACT_ROLES = ["completion", "infeasibility_evidence"];
const EXECUTION_RECEIPT_KEYS = new Set([
  "contract_hash",
  "completed_requirements",
  "unmet_requirements",
  "supplemental_work",
  "evidence_files",
  "requirement_evidence",
  "deviations",
]);
const LEGACY_EXECUTION_RECEIPT_KEYS = new Set([
  "contract_hash",
  "completed_requirements",
  "unmet_requirements",
  "supplemental_work",
  "evidence_files",
]);
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
const REPORT_SCOPE_MATERIAL_FIELDS = [
  "report_goal",
  "audience",
  "target_section",
  "claim_boundary",
  "planned_structure",
  "key_points",
  "wording_constraints",
  "analysis_artifact_ids",
];

const REQUIRED_TOP_LEVEL = [
  "state_meta",
  "project_summary",
  "carried_questions",
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

const PRE_V8_TOP_LEVEL = REQUIRED_TOP_LEVEL.filter((key) => key !== "carried_questions");
const LEGACY_TOP_LEVEL = PRE_V8_TOP_LEVEL.filter(
  (key) => !["state_meta", "pending_decision", "response_receipt"].includes(key),
);
const V2_TOP_LEVEL = PRE_V8_TOP_LEVEL.filter(
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
    "audience_profile",
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
    "analysis_options",
  ]),
  discovery_sidecar: new Set([
    "last_updated",
    "scope_id",
    "scope_revision",
    "execution_contract",
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
    "claim_boundary",
    "planned_structure",
    "key_points",
    "wording_constraints",
    "analysis_artifact_ids",
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
  "execution_contract",
  "causal_basis_hash",
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

function normalizeRequiredString(value, label, code) {
  if (typeof value !== "string" || !value.trim()) {
    fail(code, `${label} must be a nonempty string`);
  }
  return value.trim();
}

function normalizeContractArray(value, label, code, requireItems = false) {
  assertArray(value, label, code);
  const normalized = value.map((item, index) => (
    normalizeRequiredString(item, `${label}[${index}]`, code)
  ));
  if (requireItems && normalized.length === 0) {
    fail(code, `${label} must contain at least one item`);
  }
  if (new Set(normalized).size !== normalized.length) {
    fail(code, `${label} must not contain duplicates`);
  }
  return normalized;
}

function normalizeAnalysisArtifactIds(value, label, code = "INVALID_INPUT") {
  const normalized = normalizeContractArray(value, label, code);
  normalized.forEach((artifactId, index) => {
    if (!isArtifactId(artifactId)) {
      fail(code, `${label}[${index}] must be a UUID or legacy artifact id`);
    }
  });
  return normalized.sort();
}

function normalizeDiscoveryContract(value, label, code = "INVALID_INPUT") {
  assertKnownKeys(value, DISCOVERY_CONTRACT_KEYS, label, code);
  const missing = [...DISCOVERY_CONTRACT_KEYS].filter(
    (field) => !Object.prototype.hasOwnProperty.call(value, field),
  );
  if (missing.length) fail(code, `${label} is missing: ${missing.join(", ")}`);
  const contract = {
    target: normalizeRequiredString(value.target, `${label}.target`, code),
    input_refs: normalizeContractArray(value.input_refs, `${label}.input_refs`, code, true),
    variables: normalizeContractArray(value.variables, `${label}.variables`, code, true),
    method_plan: normalizeRequiredString(value.method_plan, `${label}.method_plan`, code),
    constraints: normalizeContractArray(value.constraints, `${label}.constraints`, code),
    diagnostic_requirements: normalizeContractArray(
      value.diagnostic_requirements,
      `${label}.diagnostic_requirements`,
      code,
    ),
    output_type: normalizeRequiredString(value.output_type, `${label}.output_type`, code),
    claim_boundary: value.claim_boundary,
  };
  assertEnum(contract.claim_boundary, ["candidate_only"], `${label}.claim_boundary`, code);
  return contract;
}

function validateDiscoveryContract(value, label, code = "INVALID_STATE") {
  const normalized = normalizeDiscoveryContract(value, label, code);
  if (!deepEqual(normalized, value)) {
    fail(code, `${label} must use trimmed canonical strings`);
  }
}

function normalizeAnalysisContract(value, label, code = "INVALID_INPUT") {
  assertKnownKeys(value, ANALYSIS_CONTRACT_KEYS, label, code);
  const missing = [...ANALYSIS_CONTRACT_KEYS].filter(
    (field) => !Object.prototype.hasOwnProperty.call(value, field),
  );
  if (missing.length) fail(code, `${label} is missing: ${missing.join(", ")}`);
  return {
    target: normalizeRequiredString(value.target, `${label}.target`, code),
    input_refs: normalizeContractArray(value.input_refs, `${label}.input_refs`, code, true),
    method_plan: normalizeRequiredString(value.method_plan, `${label}.method_plan`, code),
    execution_requirements: normalizeContractArray(
      value.execution_requirements,
      `${label}.execution_requirements`,
      code,
      true,
    ),
    output_type: normalizeRequiredString(value.output_type, `${label}.output_type`, code),
    claim_boundary: normalizeRequiredString(value.claim_boundary, `${label}.claim_boundary`, code),
  };
}

function validateAnalysisContract(value, label, code = "INVALID_STATE") {
  const normalized = normalizeAnalysisContract(value, label, code);
  if (!deepEqual(normalized, value)) {
    fail(code, `${label} must use trimmed canonical strings`);
  }
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function contractHash(scopeKind, contract) {
  return sha256Hex(JSON.stringify({ scope_kind: scopeKind, contract }));
}

function reportContractCandidates(reportAssembly, includeEvidenceBinding = true) {
  const base = {};
  if (includeEvidenceBinding) {
    if (reportAssembly.analysis_artifact_ids === null) {
      fail(
        "SCOPE_MISMATCH",
        "the report evidence binding is unresolved and requires scope revision",
      );
    }
    base.analysis_artifact_ids = [...reportAssembly.analysis_artifact_ids].sort();
  }
  for (const field of ["report_goal", "audience", "target_section", "claim_boundary"]) {
    const value = reportAssembly[field];
    if (typeof value === "string" && value.trim()) base[field] = value.trim();
  }
  for (const field of ["planned_structure", "key_points", "wording_constraints"]) {
    const values = reportAssembly[field]
      .filter((item) => typeof item === "string" && item.trim())
      .map((item) => item.trim());
    if (values.length) base[field] = values;
  }
  if (reportAssembly.current_format === null) return [base];
  return [{ ...base, current_format: reportAssembly.current_format }, base];
}

function assertReportScopeStructureComplete(reportAssembly, code = "SCOPE_MISMATCH") {
  const missing = [];
  for (const field of ["report_goal", "audience", "claim_boundary"]) {
    if (typeof reportAssembly[field] !== "string" || !reportAssembly[field].trim()) {
      missing.push(field);
    }
  }
  for (const field of ["planned_structure", "wording_constraints"]) {
    if (
      !Array.isArray(reportAssembly[field])
      || !reportAssembly[field].some((item) => typeof item === "string" && item.trim())
    ) {
      missing.push(field);
    }
  }
  if (missing.length) {
    fail(
      code,
      "a ready report scope requires a goal, audience, structure, wording constraints, and explicit claim boundary",
      { missing_fields: missing },
    );
  }
}

function assertReadyReportScopeComplete(reportAssembly, code = "SCOPE_MISMATCH") {
  assertReportScopeStructureComplete(reportAssembly, code);
  if (reportAssembly.current_format !== null) {
    fail(
      code,
      "a ready report scope requires current_format null until report output is completed",
      { current_format: reportAssembly.current_format },
    );
  }
}

function requirementDescriptions(scopeKind, contract) {
  const requirements = [];
  const add = (kind, description) => {
    requirements.push({ kind, description });
  };
  const addMany = (kind, values) => values.forEach((value) => add(kind, value));
  if (scopeKind === "analysis") {
    add("target", contract.target);
    addMany("input_ref", contract.input_refs);
    add("method_plan", contract.method_plan);
    addMany("execution_requirement", contract.execution_requirements);
    add("output_type", contract.output_type);
    add("claim_boundary", contract.claim_boundary);
  } else if (scopeKind === "discovery") {
    add("target", contract.target);
    addMany("input_ref", contract.input_refs);
    addMany("variable", contract.variables);
    add("method_plan", contract.method_plan);
    addMany("constraint", contract.constraints);
    addMany("diagnostic_requirement", contract.diagnostic_requirements);
    add("output_type", contract.output_type);
    add("claim_boundary", contract.claim_boundary);
  } else if (scopeKind === "report") {
    for (const field of ["report_goal", "audience", "target_section", "claim_boundary"]) {
      if (contract[field] !== undefined) add(field, contract[field]);
    }
    for (const field of ["planned_structure", "key_points", "wording_constraints"]) {
      if (contract[field] !== undefined) addMany(field, contract[field]);
    }
    addMany("analysis_artifact_id", contract.analysis_artifact_ids ?? []);
    if (contract.current_format !== undefined) add("current_format", contract.current_format);
  }
  return requirements;
}

function requirementId(contractHash, index, kind, description) {
  return `req-${sha256Hex(JSON.stringify({
    contract_hash: contractHash,
    index,
    kind,
    description,
  })).slice(0, 16)}`;
}

function contractBundle(scopeKind, contract) {
  const hash = contractHash(scopeKind, contract);
  const requirements = requirementDescriptions(scopeKind, contract).map((item, index) => ({
    id: requirementId(hash, index, item.kind, item.description),
    kind: item.kind,
    description: item.description,
  }));
  return { hash, requirements };
}

function operationContractBundles(state, operation, planInfo) {
  if (operation.scope_ref === null) return [];
  if (planInfo.actor === "causal_discovery") {
    if (operation.discovery_scope === null) return [];
    return [contractBundle("discovery", operation.discovery_scope.contract)];
  }
  if (planInfo.actor && planInfo.actor.startsWith("analysis_execution.")) {
    const slot = state.council_chamber.analysis_execution[planInfo.design];
    if (!slot || slot.execution_contract === null) return [];
    return [contractBundle("analysis", slot.execution_contract)];
  }
  if (planInfo.actor === "report_writer") {
    return reportContractCandidates(
      state.report_assembly,
      operation.report_evidence_binding_protocol !== 0,
    )
      .map((contract) => contractBundle("report", contract));
  }
  return [];
}

function setOperationProtocol(state, operation, planInfo) {
  const bundle = operationContractBundles(state, operation, planInfo)[0] ?? null;
  operation.completion_protocol = bundle === null ? 0 : 2;
  operation.contract_hash = bundle === null ? null : bundle.hash;
}

function analysisCausalBasisHash(state) {
  const sortedStrings = (items) => [...items].sort();
  const preferredOption = state.causal_facts.analysis_options
    .find((option) => option.role === "preferred") ?? null;
  const preferred = preferredOption === null
    ? null
    : {
        ...preferredOption,
        data_work: sortedStrings(preferredOption.data_work),
        requirements: sortedStrings(preferredOption.requirements),
      };
  const recommendations = state.causal_facts.recommended_method_routes
    .map((route) => ({
      ...route,
      route_cautions: sortedStrings(route.route_cautions),
    }))
    .sort((left, right) => {
      const leftKey = `${left.category}:${left.id}`;
      const rightKey = `${right.category}:${right.id}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  return sha256Hex(canonicalJson({
    causal_checked: state.causal_facts.causal_checked,
    analysis_readiness: state.causal_facts.analysis_readiness,
    causal_question: state.causal_facts.causal_question,
    exposure_or_intervention: state.causal_facts.exposure_or_intervention,
    outcome: state.causal_facts.outcome,
    estimand: state.causal_facts.estimand,
    assumptions: sortedStrings(state.causal_facts.assumptions),
    threats: sortedStrings(state.causal_facts.threats),
    support_status: state.causal_facts.support_status,
    recommended_checks: sortedStrings(state.causal_facts.recommended_checks),
    recommended_method_routes: recommendations,
    preferred_analysis_option: preferred,
  }));
}

function operationPacket(state, operation, planInfo) {
  if (operation === null) return null;
  let requirements = [];
  if ([1, 2].includes(operation.completion_protocol)) {
    const bundle = operationContractBundles(state, operation, planInfo)
      .find((candidate) => candidate.hash === operation.contract_hash);
    if (!bundle) {
      fail("SCOPE_MISMATCH", "active operation contract_hash does not match its bound scope");
    }
    requirements = bundle.requirements;
  }
  return {
    operation_id: operation.id,
    stage: operation.stage,
    action: operation.stage === "worker_pending" ? "apply" : "finish",
    actor: planInfo.actor,
    support: planInfo.support,
    intent_summary: operation.intent_summary,
    scope_ref: operation.scope_ref === null ? null : clone(operation.scope_ref),
    completion_protocol: operation.completion_protocol,
    contract_hash: operation.contract_hash,
    requirements,
  };
}

function packetContent(packet) {
  if (packet === null) return null;
  const {
    stage: _stage,
    action: _action,
    ...content
  } = packet;
  return content;
}

function operationPacketResult(previousPacket, currentPacket) {
  if (currentPacket === null || !deepEqual(packetContent(previousPacket), packetContent(currentPacket))) {
    return { operation_packet: currentPacket };
  }
  return {
    operation_packet_ref: {
      operation_id: currentPacket.operation_id,
      stage: currentPacket.stage,
      action: currentPacket.action,
      completion_protocol: currentPacket.completion_protocol,
      contract_hash: currentPacket.contract_hash,
      contract_unchanged: true,
    },
  };
}

function normalizeReceiptStringArray(value, label) {
  return normalizeContractArray(value, label, "INVALID_ARTIFACT_RECEIPT");
}

function normalizeEvidenceFiles(value, label) {
  const files = normalizeReceiptStringArray(value, label).map((item, index) => {
    const normalized = normalizePath(item);
    if (
      normalized !== item
      || path.posix.normalize(normalized) !== normalized
      || !normalized.startsWith("output/")
    ) {
      fail("INVALID_ARTIFACT_RECEIPT", `${label}[${index}] must be a canonical project-relative output path`);
    }
    return normalized;
  });
  if (new Set(files).size !== files.length) {
    fail("INVALID_ARTIFACT_RECEIPT", `${label} must not contain duplicates`);
  }
  return files;
}

function normalizeRequirementEvidence(value, label) {
  assertArray(value, label, "INVALID_ARTIFACT_RECEIPT");
  const normalized = value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    const keys = new Set(["requirement_id", "file", "locator"]);
    assertKnownKeys(item, keys, itemLabel, "INVALID_ARTIFACT_RECEIPT");
    const missing = [...keys].filter((field) => !Object.prototype.hasOwnProperty.call(item, field));
    if (missing.length) fail("INVALID_ARTIFACT_RECEIPT", `${itemLabel} is missing: ${missing.join(", ")}`);
    const locator = normalizeRequiredString(item.locator, `${itemLabel}.locator`, "INVALID_ARTIFACT_RECEIPT")
      .replace(/\r\n?/g, "\n");
    if (locator.includes("\n") || locator.length > MAX_EVIDENCE_LOCATOR_LENGTH) {
      fail("INVALID_ARTIFACT_RECEIPT", `${itemLabel}.locator must be a single line of at most ${MAX_EVIDENCE_LOCATOR_LENGTH} characters`);
    }
    return {
      requirement_id: normalizeRequiredString(item.requirement_id, `${itemLabel}.requirement_id`, "INVALID_ARTIFACT_RECEIPT"),
      file: normalizeEvidenceFiles([item.file], `${itemLabel}.file`)[0],
      locator,
    };
  });
  const ids = normalized.map((item) => item.requirement_id);
  if (new Set(ids).size !== ids.length) {
    fail("INVALID_ARTIFACT_RECEIPT", `${label} must not contain duplicate requirement IDs`);
  }
  return normalized;
}

function normalizeReceiptDeviations(value, label) {
  if (value === undefined) return [];
  assertArray(value, label, "INVALID_ARTIFACT_RECEIPT");
  if (value.length > MAX_RECEIPT_DEVIATIONS) {
    fail("INVALID_ARTIFACT_RECEIPT", `${label} may contain at most ${MAX_RECEIPT_DEVIATIONS} items`);
  }
  const normalized = value.map((item, index) => {
    const text = normalizeRequiredString(item, `${label}[${index}]`, "INVALID_ARTIFACT_RECEIPT")
      .replace(/\r\n?/g, "\n");
    if (text.includes("\n") || text.length > MAX_EVIDENCE_LOCATOR_LENGTH) {
      fail("INVALID_ARTIFACT_RECEIPT", `${label}[${index}] must be a single line of at most ${MAX_EVIDENCE_LOCATOR_LENGTH} characters`);
    }
    return text;
  });
  if (new Set(normalized).size !== normalized.length) {
    fail("INVALID_ARTIFACT_RECEIPT", `${label} must not contain duplicates`);
  }
  return normalized;
}

function normalizeExecutionReceipt(
  value,
  label = "artifact.execution_receipt",
  receiptVersion = null,
) {
  assertObject(value, label, "INVALID_ARTIFACT_RECEIPT");
  const selectedVersion = receiptVersion ?? (
    Object.prototype.hasOwnProperty.call(value, "requirement_evidence")
    || Object.prototype.hasOwnProperty.call(value, "deviations")
      ? MANIFEST_VERSION
      : RECEIPT_MANIFEST_VERSION
  );
  const keys = selectedVersion === RECEIPT_MANIFEST_VERSION
    ? LEGACY_EXECUTION_RECEIPT_KEYS
    : EXECUTION_RECEIPT_KEYS;
  assertKnownKeys(value, keys, label, "INVALID_ARTIFACT_RECEIPT");
  const requiredKeys = selectedVersion === RECEIPT_MANIFEST_VERSION
    ? [...LEGACY_EXECUTION_RECEIPT_KEYS]
    : [...EXECUTION_RECEIPT_KEYS].filter((field) => field !== "deviations");
  const missing = requiredKeys.filter(
    (field) => !Object.prototype.hasOwnProperty.call(value, field),
  );
  if (missing.length) {
    fail("INVALID_ARTIFACT_RECEIPT", `${label} is missing: ${missing.join(", ")}`);
  }
  if (typeof value.contract_hash !== "string" || !/^[0-9a-f]{64}$/.test(value.contract_hash)) {
    fail("INVALID_ARTIFACT_RECEIPT", `${label}.contract_hash must be a lowercase SHA-256 hex digest`);
  }
  const receipt = {
    contract_hash: value.contract_hash,
    completed_requirements: normalizeReceiptStringArray(
      value.completed_requirements,
      `${label}.completed_requirements`,
    ),
    unmet_requirements: normalizeReceiptStringArray(
      value.unmet_requirements,
      `${label}.unmet_requirements`,
    ),
    supplemental_work: normalizeReceiptStringArray(
      value.supplemental_work,
      `${label}.supplemental_work`,
    ),
    evidence_files: normalizeEvidenceFiles(value.evidence_files, `${label}.evidence_files`),
  };
  const completed = new Set(receipt.completed_requirements);
  const unmet = new Set(receipt.unmet_requirements);
  if ([...completed].some((id) => unmet.has(id))) {
    fail("INVALID_ARTIFACT_RECEIPT", "completed_requirements and unmet_requirements must not overlap");
  }
  if (!receipt.evidence_files.length) {
    fail("INVALID_ARTIFACT_RECEIPT", "execution_receipt.evidence_files must identify at least one evidence file");
  }
  if (selectedVersion === MANIFEST_VERSION) {
    receipt.requirement_evidence = normalizeRequirementEvidence(
      value.requirement_evidence,
      `${label}.requirement_evidence`,
    );
    receipt.deviations = normalizeReceiptDeviations(value.deviations, `${label}.deviations`);
    const completed = new Set(receipt.completed_requirements);
    const mapped = new Set(receipt.requirement_evidence.map((item) => item.requirement_id));
    if (mapped.size !== completed.size || [...completed].some((id) => !mapped.has(id))) {
      fail("INVALID_ARTIFACT_RECEIPT", "requirement_evidence must contain exactly one entry per completed requirement");
    }
    const evidenceFiles = new Set(receipt.evidence_files);
    if (receipt.requirement_evidence.some((item) => !evidenceFiles.has(item.file))) {
      fail("INVALID_ARTIFACT_RECEIPT", "requirement_evidence files must also appear in evidence_files");
    }
  }
  return receipt;
}

function normalizeManifestRequirements(
  value,
  contractHash,
  label = "artifact manifest.requirements",
  code = "INVALID_ARTIFACT_MANIFEST",
) {
  assertArray(value, label, code);
  if (contractHash === null && value.length) {
    fail(code, `${label} must be empty when the manifest has no bound contract`);
  }
  const keys = new Set(["id", "kind", "description"]);
  const normalized = value.map((item, index) => {
    const itemLabel = `${label}[${index}]`;
    assertKnownKeys(item, keys, itemLabel, code);
    const missing = [...keys].filter(
      (field) => !Object.prototype.hasOwnProperty.call(item, field),
    );
    if (missing.length) {
      fail(code, `${itemLabel} is missing: ${missing.join(", ")}`);
    }
    const requirement = {
      id: normalizeRequiredString(item.id, `${itemLabel}.id`, code),
      kind: normalizeRequiredString(item.kind, `${itemLabel}.kind`, code),
      description: normalizeRequiredString(
        item.description,
        `${itemLabel}.description`,
        code,
      ),
    };
    if (!/^req-[0-9a-f]{16}$/.test(requirement.id)) {
      fail(code, `${itemLabel}.id must be a canonical requirement ID`);
    }
    if (!REQUIREMENT_KINDS.has(requirement.kind)) {
      fail(code, `${itemLabel}.kind is not a supported requirement kind`);
    }
    if (contractHash !== null) {
      const expectedId = requirementId(
        contractHash,
        index,
        requirement.kind,
        requirement.description,
      );
      if (requirement.id !== expectedId) {
        fail(code, `${itemLabel}.id does not match its contract, order, kind, and description`);
      }
    }
    return requirement;
  });
  const ids = normalized.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    fail(code, `${label} must not contain duplicate requirement IDs`);
  }
  return normalized;
}

function validateReceiptAgainstPacket(
  receipt,
  packet,
  artifactRole,
  files = null,
) {
  if (packet.completion_protocol === 0) {
    if (receipt !== null) {
      fail("INVALID_ARTIFACT_RECEIPT", "completion protocol 0 does not accept an execution_receipt");
    }
    if (artifactRole !== "completion") {
      fail("SCOPE_MISMATCH", "infeasibility evidence requires a bound completion protocol");
    }
    return;
  }
  if (receipt === null) {
    fail("INVALID_ARTIFACT_RECEIPT", `completion protocol ${packet.completion_protocol} requires an execution_receipt`);
  }
  if (receipt.contract_hash !== packet.contract_hash) {
    fail("SCOPE_MISMATCH", "execution_receipt.contract_hash does not match the bound contract");
  }
  if (
    packet.completion_protocol === 2
    && !Object.prototype.hasOwnProperty.call(receipt, "requirement_evidence")
  ) {
    fail("INVALID_ARTIFACT_RECEIPT", "completion protocol 2 requires requirement_evidence");
  }
  const required = packet.requirements.map((item) => item.id);
  const requiredSet = new Set(required);
  const completed = new Set(receipt.completed_requirements);
  const unmet = new Set(receipt.unmet_requirements);
  if ([...completed, ...unmet].some((id) => !requiredSet.has(id))) {
    fail("INVALID_ARTIFACT_RECEIPT", "requirement IDs outside the operation packet belong in supplemental_work");
  }
  if (artifactRole === "completion") {
    const missing = required.filter((id) => !completed.has(id));
    if (missing.length || unmet.size) {
      fail("INCOMPLETE_WORK", "completion requires every operation-packet requirement and no unmet requirements", {
        missing_requirements: missing,
        unmet_requirements: [...unmet],
      });
    }
  } else {
    if (!unmet.size) {
      fail("INVALID_ARTIFACT_RECEIPT", "infeasibility evidence requires at least one unmet requirement");
    }
    if (required.some((id) => !completed.has(id) && !unmet.has(id))) {
      fail("INVALID_ARTIFACT_RECEIPT", "infeasibility evidence requires full required-set accounting");
    }
  }
  if (files !== null) {
    const inventory = new Set(files.map(normalizePath));
    if (receipt.evidence_files.some((file) => !inventory.has(file))) {
      fail("INVALID_ARTIFACT_RECEIPT", "execution_receipt evidence_files must be listed in the artifact manifest");
    }
    if (
      receipt.requirement_evidence
      && receipt.requirement_evidence.some((item) => !inventory.has(item.file))
    ) {
      fail("INVALID_ARTIFACT_RECEIPT", "requirement_evidence files must be listed in the artifact manifest");
    }
  }
}

function assertExactTopLevel(state, expected = REQUIRED_TOP_LEVEL) {
  assertObject(state, "project state");
  const missing = expected.filter((key) => !(key in state));
  if (missing.length) fail("INVALID_STATE", `missing top-level sections: ${missing.join(", ")}`);
  const extra = Object.keys(state).filter((key) => !expected.includes(key));
  if (extra.length) fail("INVALID_STATE", `unsupported top-level sections: ${extra.join(", ")}`);
}

function normalizeResponseText(
  value,
  label,
  singleLine = false,
  maxLength = MAX_RESPONSE_TEXT_LENGTH,
) {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_INPUT", `${label} must be a nonempty string`);
  }
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length > maxLength) {
    fail("INVALID_INPUT", `${label} must contain at most ${maxLength} characters`);
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

function isArtifactId(value) {
  return isUuid(value) || (typeof value === "string" && /^legacy-\d{4}$/.test(value));
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

function atomicWrite(filePath, text, temporaryDirectory = null) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const tempRoot = temporaryDirectory === null ? directory : temporaryDirectory;
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempPath = path.join(tempRoot, `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomUUID()}`);
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
  assertEnum(value.kind, ["analysis", "report", "discovery"], `${label}.kind`, code);
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

function validateDiscoveryScopeSnapshot(value, label, code = "INVALID_STATE") {
  if (value === null) return;
  assertKnownKeys(value, new Set(["transition", "base_ref", "contract"]), label, code);
  const missing = ["transition", "base_ref", "contract"].filter(
    (field) => !Object.prototype.hasOwnProperty.call(value, field),
  );
  if (missing.length) fail(code, `${label} is missing: ${missing.join(", ")}`);
  assertEnum(value.transition, ["new", "revise", "preserve"], `${label}.transition`, code);
  validateScopeRef(value.base_ref, `${label}.base_ref`, code);
  if (value.base_ref !== null && value.base_ref.kind !== "discovery") {
    fail(code, `${label}.base_ref must be a discovery scope reference`);
  }
  if (value.transition === "new" && value.base_ref !== null) {
    fail(code, `${label}.base_ref must be null for a new scope`);
  }
  if (value.transition !== "new" && value.base_ref === null) {
    fail(code, `${label}.base_ref is required for ${value.transition}`);
  }
  validateDiscoveryContract(value.contract, `${label}.contract`, code);
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
    "discovery_scope",
    "completion_protocol",
    "contract_hash",
    "report_evidence_binding_protocol",
    "started_at",
  ]), "state_meta.active_operation");
  if (!isUuid(operation.id)) fail("INVALID_STATE", "active_operation.id must be a UUID");
  assertEnum(operation.stage, ["worker_pending", "lead_pending"], "active_operation.stage");
  if (typeof operation.intent_summary !== "string" || !operation.intent_summary.trim() || operation.intent_summary.length > MAX_INTENT_LENGTH) {
    fail("INVALID_STATE", `active_operation.intent_summary must contain 1-${MAX_INTENT_LENGTH} characters`);
  }
  validateScopeRef(operation.scope_ref);
  if (!Object.prototype.hasOwnProperty.call(operation, "discovery_scope")) {
    fail("INVALID_STATE", "active_operation.discovery_scope is required");
  }
  if (!Object.prototype.hasOwnProperty.call(operation, "report_evidence_binding_protocol")) {
    fail("INVALID_STATE", "active_operation.report_evidence_binding_protocol is required");
  }
  validateDiscoveryScopeSnapshot(operation.discovery_scope, "active_operation.discovery_scope");
  if (planInfo.actor === "report_writer") {
    if (![0, 1].includes(operation.report_evidence_binding_protocol)) {
      fail("INVALID_STATE", "active report operation requires evidence-binding protocol 0 or 1");
    }
  } else if (operation.report_evidence_binding_protocol !== null) {
    fail("INVALID_STATE", "non-report operation requires null report_evidence_binding_protocol");
  }
  if (![0, 1, 2].includes(operation.completion_protocol)) {
    fail("INVALID_STATE", "active_operation.completion_protocol must be 0, 1, or 2");
  }
  if (operation.completion_protocol === 0 && operation.contract_hash !== null) {
    fail("INVALID_STATE", "completion protocol 0 requires a null contract_hash");
  }
  if (
    [1, 2].includes(operation.completion_protocol)
    && (typeof operation.contract_hash !== "string" || !/^[0-9a-f]{64}$/.test(operation.contract_hash))
  ) {
    fail("INVALID_STATE", "bound completion protocols require a lowercase SHA-256 contract_hash");
  }
  const isDiscovery = planInfo.actor === "causal_discovery";
  if (operation.discovery_scope !== null) {
    if (!isDiscovery || operation.scope_ref === null || operation.scope_ref.kind !== "discovery") {
      fail("SCOPE_MISMATCH", "active discovery_scope requires the causal_discovery route and a discovery scope_ref");
    }
  } else if (operation.scope_ref !== null && operation.scope_ref.kind === "discovery") {
    fail("SCOPE_MISMATCH", "an active discovery scope_ref requires discovery_scope");
  }
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
  if (!operation) return;
  if (planInfo.actor === "causal_discovery") {
    if (operation.scope_ref === null) return;
    if (operation.scope_ref.kind !== "discovery" || operation.discovery_scope === null) {
      fail("SCOPE_MISMATCH", "active causal_discovery scope binding is invalid");
    }
    const snapshot = operation.discovery_scope;
    const current = state.discovery_sidecar;
    if (operation.stage === "worker_pending") {
      if (snapshot.transition === "new") {
        if (operation.scope_ref.revision !== 1) {
          fail("SCOPE_MISMATCH", "a new discovery scope must start at revision 1");
        }
        return;
      }
      if (
        current.scope_id !== snapshot.base_ref.id
        || current.scope_revision !== snapshot.base_ref.revision
      ) {
        fail("SCOPE_MISMATCH", "active discovery scope no longer matches its durable base");
      }
      if (
        snapshot.transition === "preserve"
        && (
          !deepEqual(operation.scope_ref, snapshot.base_ref)
          || !deepEqual(current.execution_contract, snapshot.contract)
        )
      ) {
        fail("SCOPE_MISMATCH", "preserved discovery scope does not match its base");
      }
      if (
        snapshot.transition === "revise"
        && (
          operation.scope_ref.id !== snapshot.base_ref.id
          || operation.scope_ref.revision !== snapshot.base_ref.revision + 1
        )
      ) {
        fail("SCOPE_MISMATCH", "revised discovery scope_ref is not the next base revision");
      }
      return;
    }
    if (
      current.scope_id !== operation.scope_ref.id
      || current.scope_revision !== operation.scope_ref.revision
      || !deepEqual(current.execution_contract, snapshot.contract)
      || !["scoped", "artifact_created", "reviewed", "blocked"].includes(current.status)
    ) {
      fail("SCOPE_MISMATCH", "completed discovery handoff does not match its active scope");
    }
    return;
  }
  if (operation.scope_ref === null) return;
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
    if (
      scope
      && (
        scope.causal_basis_hash === null
        || scope.causal_basis_hash !== analysisCausalBasisHash(state)
      )
    ) {
      fail("SCOPE_MISMATCH", "active analysis scope no longer matches its causal basis");
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
    if (!Object.prototype.hasOwnProperty.call(slot, "execution_contract")) {
      fail("INVALID_STATE", `${label}.execution_contract is required`);
    }
    if (slot.execution_contract !== null) {
      validateAnalysisContract(slot.execution_contract, `${label}.execution_contract`);
    }
    if (!Object.prototype.hasOwnProperty.call(slot, "causal_basis_hash")) {
      fail("INVALID_STATE", `${label}.causal_basis_hash is required`);
    }
    if (
      slot.causal_basis_hash !== null
      && (
        typeof slot.causal_basis_hash !== "string"
        || !/^[a-f0-9]{64}$/.test(slot.causal_basis_hash)
      )
    ) {
      fail("INVALID_STATE", `${label}.causal_basis_hash must be null or a SHA-256 hex digest`);
    }
  } else {
    assertStringOrNull(slot.current_status, `${label}.current_status`);
  }
  assertStringOrNull(slot.summary, `${label}.summary`);
  assertStringArray(slot.questions_for_user, `${label}.questions_for_user`);
  assertStringArray(slot.feedback_to_route, `${label}.feedback_to_route`);
}

function validateAudienceProfile(profile) {
  const label = "project_summary.audience_profile";
  assertObject(profile, label);
  assertKnownKeys(profile, new Set(["level", "evidence", "preferences"]), label);
  for (const key of ["level", "evidence", "preferences"]) {
    if (!Object.prototype.hasOwnProperty.call(profile, key)) {
      fail("INVALID_STATE", `${label}.${key} is required`);
    }
  }
  assertEnum(profile.level, AUDIENCE_LEVELS, `${label}.level`);
  if (profile.evidence !== null) {
    if (typeof profile.evidence !== "string" || !profile.evidence.trim()) {
      fail("INVALID_STATE", `${label}.evidence must be a nonempty string or null`);
    }
    if (profile.evidence !== profile.evidence.trim()) {
      fail("INVALID_STATE", `${label}.evidence must use a trimmed canonical string`);
    }
    if (profile.evidence.length > MAX_AUDIENCE_TEXT_LENGTH) {
      fail("INVALID_STATE", `${label}.evidence may contain at most ${MAX_AUDIENCE_TEXT_LENGTH} characters`);
    }
  }
  if (profile.level === "unstated" && profile.evidence !== null) {
    fail("INVALID_STATE", `${label}.evidence must be null while level is unstated`);
  }
  if (profile.level !== "unstated" && profile.evidence === null) {
    fail("INVALID_STATE", `${label}.level requires evidence naming what established it`);
  }
  assertStringArray(profile.preferences, `${label}.preferences`);
  if (profile.preferences.length > MAX_AUDIENCE_PREFERENCES) {
    fail("INVALID_STATE", `${label}.preferences may contain at most ${MAX_AUDIENCE_PREFERENCES} items`);
  }
  profile.preferences.forEach((item, index) => {
    if (!item.trim() || item !== item.trim()) {
      fail("INVALID_STATE", `${label}.preferences[${index}] must be a trimmed nonempty string`);
    }
    if (item.length > MAX_AUDIENCE_TEXT_LENGTH) {
      fail("INVALID_STATE", `${label}.preferences[${index}] may contain at most ${MAX_AUDIENCE_TEXT_LENGTH} characters`);
    }
  });
  if (new Set(profile.preferences).size !== profile.preferences.length) {
    fail("INVALID_STATE", `${label}.preferences must not contain duplicates`);
  }
}

function isKnownQuestionActor(actor) {
  if (actor === "team_lead" || CORE_WORKERS.has(actor)) return true;
  if (typeof actor !== "string" || !actor.startsWith("analysis_execution.")) return false;
  return DESIGN_IDS.has(actor.slice("analysis_execution.".length));
}

function canonicalQuestionKey(value) {
  return value.toLowerCase().replace(/\s+/g, " ");
}

function validateCarriedQuestionText(value, label, code = "INVALID_STATE") {
  if (
    typeof value !== "string"
    || !value.trim()
    || value !== value.trim()
    || /[\r\n]/.test(value)
  ) {
    fail(code, `${label} must be a trimmed nonempty single-line string`);
  }
  if (value.length > MAX_CARRIED_QUESTION_TEXT_LENGTH) {
    fail(code, `${label} may contain at most ${MAX_CARRIED_QUESTION_TEXT_LENGTH} characters`);
  }
}

function validateCarriedQuestionSource(source, label, stateRevision) {
  assertKnownKeys(
    source,
    new Set(["actor", "operation_id", "revision", "source_kind", "source_text"]),
    label,
  );
  for (const key of ["actor", "operation_id", "revision", "source_kind", "source_text"]) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      fail("INVALID_STATE", `${label}.${key} is required`);
    }
  }
  if (!isKnownQuestionActor(source.actor)) {
    fail("INVALID_STATE", `${label}.actor is not a supported operation actor`);
  }
  if (!isUuid(source.operation_id)) {
    fail("INVALID_STATE", `${label}.operation_id must be a UUID`);
  }
  assertEnum(source.source_kind, CARRIED_QUESTION_SOURCE_KINDS, `${label}.source_kind`);
  if (source.source_kind === "legacy_v8") {
    if (source.source_text !== null) {
      fail("INVALID_STATE", `${label}.source_text must be null for legacy_v8 provenance`);
    }
  } else {
    validateCarriedQuestionText(source.source_text, `${label}.source_text`);
    if (
      (source.source_kind === "handoff" && source.actor === "team_lead")
      || (source.source_kind === "synthesized" && source.actor !== "team_lead")
    ) {
      fail("INVALID_STATE", `${label}.source_kind does not match its actor`);
    }
  }
  if (
    !Number.isInteger(source.revision)
    || source.revision < 1
    || source.revision > stateRevision
  ) {
    fail("INVALID_STATE", `${label}.revision must be a committed positive revision`);
  }
}

function validateCarriedQuestions(questions, stateRevision, templateMode = false) {
  assertArray(questions, "carried_questions");
  if (questions.length > MAX_CARRIED_QUESTIONS) {
    fail("INVALID_STATE", `carried_questions may contain at most ${MAX_CARRIED_QUESTIONS} entries`);
  }
  if (templateMode && questions.length !== 0) {
    fail("INVALID_STATE", "the bundled template must leave carried_questions empty");
  }

  const ids = new Set();
  const canonicalQuestions = new Set();
  questions.forEach((entry, index) => {
    const label = `carried_questions[${index}]`;
    assertKnownKeys(entry, new Set([
      "question_id",
      "question",
      "first_source",
      "last_source",
      "source_operation_count",
      "status",
      "first_surfaced_revision",
      "retired_revision",
      "resolution",
    ]), label);
    for (const key of [
      "question_id",
      "question",
      "first_source",
      "last_source",
      "source_operation_count",
      "status",
      "first_surfaced_revision",
      "retired_revision",
      "resolution",
    ]) {
      if (!Object.prototype.hasOwnProperty.call(entry, key)) {
        fail("INVALID_STATE", `${label}.${key} is required`);
      }
    }
    if (!isUuid(entry.question_id)) {
      fail("INVALID_STATE", `${label}.question_id must be a UUID`);
    }
    if (ids.has(entry.question_id)) {
      fail("INVALID_STATE", "carried_questions must use unique question IDs");
    }
    ids.add(entry.question_id);

    validateCarriedQuestionText(entry.question, `${label}.question`);
    const questionKey = canonicalQuestionKey(entry.question);
    if (canonicalQuestions.has(questionKey)) {
      fail("INVALID_STATE", "carried_questions must use unique canonical question text");
    }
    canonicalQuestions.add(questionKey);

    validateCarriedQuestionSource(entry.first_source, `${label}.first_source`, stateRevision);
    validateCarriedQuestionSource(entry.last_source, `${label}.last_source`, stateRevision);
    if (
      entry.first_source.source_kind !== "legacy_v8"
      && entry.first_source.source_text !== entry.question
    ) {
      fail("INVALID_STATE", `${label}.first_source.source_text must equal the canonical question`);
    }
    if (entry.last_source.revision < entry.first_source.revision) {
      fail("INVALID_STATE", `${label}.last_source cannot precede first_source`);
    }
    if (
      !Number.isInteger(entry.source_operation_count)
      || entry.source_operation_count < 1
      || entry.source_operation_count > stateRevision
    ) {
      fail("INVALID_STATE", `${label}.source_operation_count must be a positive integer`);
    }
    if (entry.source_operation_count === 1 && !deepEqual(entry.first_source, entry.last_source)) {
      fail("INVALID_STATE", `${label} with one source operation must have identical first and last sources`);
    }
    if (
      entry.source_operation_count > 1
      && entry.first_source.operation_id === entry.last_source.operation_id
    ) {
      fail("INVALID_STATE", `${label} with multiple source operations must have distinct first and last operations`);
    }

    assertEnum(entry.status, CARRIED_QUESTION_STATUSES, `${label}.status`);
    if (entry.first_surfaced_revision !== null) {
      if (
        !Number.isInteger(entry.first_surfaced_revision)
        || entry.first_surfaced_revision < entry.first_source.revision
        || entry.first_surfaced_revision > stateRevision
      ) {
        fail("INVALID_STATE", `${label}.first_surfaced_revision must be a valid committed revision`);
      }
    }
    if (entry.status === "open") {
      if (entry.retired_revision !== null || entry.resolution !== null) {
        fail("INVALID_STATE", `${label} cannot have retirement data while open`);
      }
      return;
    }

    if (
      !Number.isInteger(entry.retired_revision)
      || entry.retired_revision < entry.last_source.revision
      || entry.retired_revision > stateRevision
    ) {
      fail("INVALID_STATE", `${label}.retired_revision must be a valid committed revision`);
    }
    if (
      entry.first_surfaced_revision !== null
      && entry.retired_revision < entry.first_surfaced_revision
    ) {
      fail("INVALID_STATE", `${label}.retired_revision cannot precede first_surfaced_revision`);
    }
    assertKnownKeys(entry.resolution, new Set(["kind", "note"]), `${label}.resolution`);
    if (
      !Object.prototype.hasOwnProperty.call(entry.resolution, "kind")
      || !Object.prototype.hasOwnProperty.call(entry.resolution, "note")
    ) {
      fail("INVALID_STATE", `${label}.resolution requires kind and note`);
    }
    assertEnum(
      entry.resolution.kind,
      CARRIED_QUESTION_RESOLUTION_KINDS,
      `${label}.resolution.kind`,
    );
    validateCarriedQuestionText(entry.resolution.note, `${label}.resolution.note`);
  });
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
    "artifact_role",
  ]), label);
  const required = ["artifact_id", "operation_id", "route", "location", "created_at", "summary", "artifact_role"];
  const missing = required.filter((key) => !(key in record));
  if (missing.length) fail("INVALID_STATE", `${label} is missing: ${missing.join(", ")}`);
  const legacy = typeof record.artifact_id === "string" && /^legacy-\d{4}$/.test(record.artifact_id);
  if (!isArtifactId(record.artifact_id)) fail("INVALID_STATE", `${label}.artifact_id must be a UUID or legacy id`);
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
  assertEnum(record.artifact_role, ARTIFACT_ROLES, `${label}.artifact_role`);
  if (record.design !== undefined && !DESIGN_IDS.has(record.design)) fail("INVALID_STATE", `${label}.design is invalid`);
  if (record.support !== undefined && record.support !== null && !SUPPORT_IDS.has(record.support)) fail("INVALID_STATE", `${label}.support is invalid`);
  if (record.route === "analysis_execution") {
    if (!DESIGN_IDS.has(record.design)) fail("INVALID_STATE", `${label}.design is required for analysis output`);
    if (!("support" in record)) fail("INVALID_STATE", `${label}.support is required for analysis output`);
  } else if (record.design !== undefined || record.support !== undefined) {
    fail("INVALID_STATE", `${label} may use design/support only for analysis_execution`);
  }
}

function validateAnalysisOptions(options) {
  assertArray(options, "causal_facts.analysis_options");
  if (options.length > MAX_ANALYSIS_OPTIONS) {
    fail("INVALID_STATE", `causal_facts.analysis_options may contain at most ${MAX_ANALYSIS_OPTIONS} strategies`);
  }
  const required = new Set([
    "role",
    "target",
    "approach",
    "data_work",
    "requirements",
    "main_risk",
    "prefer_when",
  ]);
  const allowed = new Set([...required, "design", "support"]);
  options.forEach((option, index) => {
    const label = `causal_facts.analysis_options[${index}]`;
    assertKnownKeys(option, allowed, label);
    const missing = [...required].filter((field) => !Object.prototype.hasOwnProperty.call(option, field));
    if (missing.length) fail("INVALID_STATE", `${label} is missing: ${missing.join(", ")}`);
    assertEnum(option.role, ["preferred", "alternative", "fallback"], `${label}.role`);
    let totalTextLength = 0;
    for (const field of ["target", "approach", "main_risk", "prefer_when"]) {
      if (typeof option[field] !== "string" || !option[field].trim()) {
        fail("INVALID_STATE", `${label}.${field} must be a nonempty string`);
      }
      if (option[field] !== option[field].trim()) {
        fail("INVALID_STATE", `${label}.${field} must use a trimmed canonical string`);
      }
      if (option[field].length > MAX_ANALYSIS_OPTION_TEXT_LENGTH) {
        fail("INVALID_STATE", `${label}.${field} may contain at most ${MAX_ANALYSIS_OPTION_TEXT_LENGTH} characters`);
      }
      totalTextLength += option[field].length;
    }
    for (const field of ["data_work", "requirements"]) {
      const normalized = normalizeContractArray(option[field], `${label}.${field}`, "INVALID_STATE");
      if (!deepEqual(normalized, option[field])) {
        fail("INVALID_STATE", `${label}.${field} must use trimmed canonical strings`);
      }
      if (normalized.length > MAX_ANALYSIS_OPTION_LIST_ITEMS) {
        fail("INVALID_STATE", `${label}.${field} may contain at most ${MAX_ANALYSIS_OPTION_LIST_ITEMS} items`);
      }
      if (normalized.some((item) => item.length > MAX_ANALYSIS_OPTION_TEXT_LENGTH)) {
        fail("INVALID_STATE", `${label}.${field} items may contain at most ${MAX_ANALYSIS_OPTION_TEXT_LENGTH} characters`);
      }
      totalTextLength += normalized.reduce((sum, item) => sum + item.length, 0);
    }
    if (totalTextLength > MAX_ANALYSIS_OPTION_TOTAL_TEXT_LENGTH) {
      fail("INVALID_STATE", `${label} may contain at most ${MAX_ANALYSIS_OPTION_TOTAL_TEXT_LENGTH} characters across its decision text`);
    }
    if (Object.prototype.hasOwnProperty.call(option, "design") && !DESIGN_IDS.has(option.design)) {
      fail("INVALID_STATE", `${label}.design is not a valid design route`);
    }
    if (Object.prototype.hasOwnProperty.call(option, "support") && !SUPPORT_IDS.has(option.support)) {
      fail("INVALID_STATE", `${label}.support is not a valid support route`);
    }
    if (Object.prototype.hasOwnProperty.call(option, "support") && !Object.prototype.hasOwnProperty.call(option, "design")) {
      fail("INVALID_STATE", `${label}.support requires a design route`);
    }
  });
  if (options.filter((option) => option.role === "preferred").length > 1) {
    fail("INVALID_STATE", "causal_facts.analysis_options may contain at most one preferred strategy");
  }
  if (options.filter((option) => option.role !== "preferred").length > 2) {
    fail("INVALID_STATE", "causal_facts.analysis_options may contain at most two nonpreferred strategies");
  }
}

function validateAnalysisPortfolioConsistency(causalFacts) {
  const options = causalFacts.analysis_options;
  if (options.length === 0) return;
  const recommendations = causalFacts.recommended_method_routes;
  const design = recommendations.find((route) => route.category === "design")?.id ?? null;
  const support = recommendations.find((route) => route.category === "support")?.id ?? null;
  const preferred = options.filter((option) => option.role === "preferred");
  if (["ready", "limited"].includes(causalFacts.analysis_readiness)) {
    if (
      preferred.length !== 1
      || preferred[0].design !== design
      || (preferred[0].support ?? null) !== support
    ) {
      fail(
        "INVALID_STATE",
        "an actionable analysis portfolio must have one preferred strategy matching the recommended design and support",
      );
    }
  } else {
    if (preferred.length) {
      fail("INVALID_STATE", "a nonactionable analysis portfolio cannot contain a preferred strategy");
    }
    if (recommendations.length) {
      fail("INVALID_STATE", "nonactionable analysis readiness requires empty method recommendations");
    }
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
    if (
      normalizedAssignment.route === "report_writer"
      && normalizedAssignment.scope_ref !== null
      && state.report_assembly.analysis_artifact_ids === null
    ) {
      fail(
        "INVALID_STATE",
        `${label}.assignment cannot approve a report scope with unresolved evidence binding`,
      );
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
    new Set([
      "operation_id",
      "revision",
      "created_at",
      "response_markdown",
      "direct_assignment",
    ]),
    "response_receipt",
  );
  if (!Object.prototype.hasOwnProperty.call(receipt, "direct_assignment")) {
    fail("INVALID_STATE", "response_receipt.direct_assignment is required");
  }
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
  if (receipt.direct_assignment !== null) {
    const normalized = normalizeAssignment(state, receipt.direct_assignment, "response_receipt.direct_assignment").assignment;
    if (!deepEqual(normalized, receipt.direct_assignment)) {
      fail("INVALID_STATE", "response_receipt.direct_assignment must be stored in canonical form");
    }
  }
  if (state.pending_decision !== null && receipt.direct_assignment !== null) {
    fail("INVALID_STATE", "response_receipt cannot contain both a numbered decision and a direct assignment");
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
  validateAudienceProfile(state.project_summary.audience_profile);
  assertStringOrNull(state.project_summary.exploration_summary, "project_summary.exploration_summary");
  assertEnum(state.project_summary.analysis_output, ["exist", "non_exist"], "project_summary.analysis_output");
  assertEnum(state.project_summary.report_output, ["exist", "non_exist"], "project_summary.report_output");

  validateCarriedQuestions(
    state.carried_questions,
    state.state_meta.revision,
    templateMode,
  );

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
  validateAnalysisOptions(state.causal_facts.analysis_options);
  validateAnalysisPortfolioConsistency(state.causal_facts);
  assertEnum(state.discovery_sidecar.status, ["not_started", "scoped", "artifact_created", "reviewed", "blocked"], "discovery_sidecar.status");
  assertStringOrNullFields(state.discovery_sidecar, ["goal", "scope", "method_summary"], "discovery_sidecar");
  const missingDiscoveryControl = ["scope_id", "scope_revision", "execution_contract"].filter(
    (field) => !Object.prototype.hasOwnProperty.call(state.discovery_sidecar, field),
  );
  if (missingDiscoveryControl.length) {
    fail("INVALID_STATE", `discovery_sidecar is missing: ${missingDiscoveryControl.join(", ")}`);
  }
  const discoveryHasIdentity = isUuid(state.discovery_sidecar.scope_id)
    && Number.isInteger(state.discovery_sidecar.scope_revision)
    && state.discovery_sidecar.scope_revision >= 1;
  const discoveryEmptyIdentity = state.discovery_sidecar.scope_id === null
    && state.discovery_sidecar.scope_revision === 0;
  if (!discoveryHasIdentity && !discoveryEmptyIdentity) {
    fail("INVALID_STATE", "discovery_sidecar has an invalid scope identity");
  }
  if (discoveryHasIdentity) {
    validateDiscoveryContract(
      state.discovery_sidecar.execution_contract,
      "discovery_sidecar.execution_contract",
    );
  } else if (state.discovery_sidecar.execution_contract !== null) {
    fail("INVALID_STATE", "an unbound discovery_sidecar must have a null execution_contract");
  }
  assertStringArrayFields(state.discovery_sidecar, ["findings", "diagnostics", "limitations", "artifact_refs", "reviewer_requests"], "discovery_sidecar");
  assertEnum(state.report_assembly.current_format, [null, "md", "html"], "report_assembly.current_format");
  assertStringOrNullFields(
    state.report_assembly,
    ["report_goal", "audience", "target_section", "claim_boundary"],
    "report_assembly",
  );
  assertStringArrayFields(state.report_assembly, ["planned_structure", "key_points", "wording_constraints", "draft_notes"], "report_assembly");
  if (state.report_assembly.analysis_artifact_ids !== null) {
    const normalizedReportEvidence = normalizeAnalysisArtifactIds(
      state.report_assembly.analysis_artifact_ids,
      "report_assembly.analysis_artifact_ids",
      "INVALID_STATE",
    );
    if (!deepEqual(normalizedReportEvidence, state.report_assembly.analysis_artifact_ids)) {
      fail("INVALID_STATE", "report_assembly.analysis_artifact_ids must be unique and sorted");
    }
  }

  const reportHasIdentity = isUuid(state.report_assembly.scope_id) && Number.isInteger(state.report_assembly.scope_revision) && state.report_assembly.scope_revision >= 1;
  const reportEmptyIdentity = state.report_assembly.scope_id === null && state.report_assembly.scope_revision === 0;
  if (!reportHasIdentity && !reportEmptyIdentity) fail("INVALID_STATE", "report_assembly has an invalid scope identity");
  if (
    reportEmptyIdentity
    && (
      state.report_assembly.analysis_artifact_ids === null
      || state.report_assembly.analysis_artifact_ids.length
    )
  ) {
    fail("INVALID_STATE", "an unbound report_assembly cannot bind analysis artifacts");
  }
  if (
    state.report_assembly.analysis_artifact_ids === null
    && state.state_meta.active_operation?.report_evidence_binding_protocol === 1
  ) {
    fail("INVALID_STATE", "report evidence-binding protocol 1 requires a resolved artifact-ID list");
  }
  const reportStatus = state.council_chamber.report_writer.current_status;
  if (!templateMode && ["ready", "blocked", "done"].includes(reportStatus) && !reportHasIdentity) {
    fail("INVALID_STATE", `report_assembly requires scope identity for status ${reportStatus}`);
  }
  if (reportStatus !== null && !["requested", "ready", "blocked", "done"].includes(reportStatus)) {
    fail("INVALID_STATE", "council_chamber.report_writer.current_status is invalid");
  }
  validateActiveScopeBinding(state, planInfo);
  operationPacket(state, state.state_meta.active_operation, planInfo);

  assertArray(state.artifact_records, "artifact_records");
  state.artifact_records.forEach(validateArtifactRecord);
  const ids = state.artifact_records.map((item) => item.artifact_id);
  if (new Set(ids).size !== ids.length) fail("INVALID_STATE", "artifact_id values must be unique");
  const recordsById = new Map(state.artifact_records.map((record) => [record.artifact_id, record]));
  if (state.report_assembly.analysis_artifact_ids === null) {
    if (!state.artifact_records.some((record) => (
      record.route === "analysis_execution"
      && record.artifact_role === "completion"
    ))) {
      fail(
        "INVALID_STATE",
        "a null report evidence binding requires historical analysis completion records",
      );
    }
  } else {
    state.report_assembly.analysis_artifact_ids.forEach((artifactId) => {
      const record = recordsById.get(artifactId);
      if (
        !record
        || record.route !== "analysis_execution"
        || record.artifact_role !== "completion"
      ) {
        fail(
          "INVALID_STATE",
          `report_assembly.analysis_artifact_ids must reference analysis completion records: ${artifactId}`,
        );
      }
    });
  }
  const operationIds = state.artifact_records.map((item) => item.operation_id).filter(Boolean);
  if (new Set(operationIds).size !== operationIds.length) fail("INVALID_STATE", "operation_id may appear in only one artifact record");
  const completionArtifacts = state.artifact_records.filter((record) => record.artifact_role === "completion");

  const activeOperation = state.state_meta.active_operation;
  const activeOperationHasArtifact = activeOperation !== null
    && completionArtifacts.some((record) => record.operation_id === activeOperation.id);
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
  if (state.project_summary.analysis_output === "exist" && !completionArtifacts.some((record) => record.route === "analysis_execution")) {
    fail("INVALID_STATE", "analysis_output exist requires an analysis_execution artifact record");
  }
  if (state.project_summary.analysis_output === "non_exist" && completionArtifacts.some((record) => record.route === "analysis_execution")) {
    if (!pendingAnalysisCloseout) {
      fail("INVALID_STATE", "analysis_output non_exist conflicts with a completed analysis artifact");
    }
  }
  if (state.project_summary.report_output === "exist") {
    if (!completionArtifacts.some((record) => record.route === "report_writer")) {
      fail("INVALID_STATE", "report_output exist requires a report_writer artifact record");
    }
  }
  if (state.project_summary.report_output === "non_exist" && state.report_assembly.current_format !== null) {
    if (!pendingReportCloseout) {
      fail("INVALID_STATE", "report_output non_exist requires null report format outside a pending report closeout");
    }
  }
  if (state.project_summary.report_output === "non_exist" && completionArtifacts.some((record) => record.route === "report_writer")) {
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

function addDiscoveryControls(state) {
  assertObject(state.discovery_sidecar, "discovery_sidecar");
  if (!Object.prototype.hasOwnProperty.call(state.state_meta, "active_operation")) {
    fail("INVALID_STATE", "state_meta is missing active_operation");
  }
  if (state.state_meta.active_operation !== null) {
    assertObject(state.state_meta.active_operation, "state_meta.active_operation");
  }
  state.discovery_sidecar.scope_id = null;
  state.discovery_sidecar.scope_revision = 0;
  state.discovery_sidecar.execution_contract = null;
  if (
    state.state_meta.active_operation !== null
    && !Object.prototype.hasOwnProperty.call(state.state_meta.active_operation, "discovery_scope")
  ) {
    state.state_meta.active_operation.discovery_scope = null;
  }
}

function addSchema5Controls(state) {
  assertObject(state.council_chamber.analysis_execution, "council_chamber.analysis_execution");
  for (const slot of Object.values(state.council_chamber.analysis_execution)) {
    assertObject(slot, "analysis chamber slot");
    slot.execution_contract = null;
  }
  state.artifact_records = state.artifact_records.map((record) => ({
    ...record,
    artifact_role: "completion",
  }));
  if (state.state_meta.active_operation !== null) {
    state.state_meta.active_operation.completion_protocol = 0;
    state.state_meta.active_operation.contract_hash = null;
  }
}

function addSchema6Controls(state) {
  assertObject(state.causal_facts, "causal_facts");
  if (Object.prototype.hasOwnProperty.call(state.causal_facts, "analysis_options")) {
    fail("UNSUPPORTED_SCHEMA", "pre-v6 causal_facts cannot already contain analysis_options");
  }
  state.causal_facts.analysis_options = [];
  assertObject(state.council_chamber.analysis_execution, "council_chamber.analysis_execution");
  for (const slot of Object.values(state.council_chamber.analysis_execution)) {
    if (Object.prototype.hasOwnProperty.call(slot, "causal_basis_hash")) {
      fail("UNSUPPORTED_SCHEMA", "pre-v6 analysis slots cannot already contain causal_basis_hash");
    }
    slot.causal_basis_hash = null;
  }
  const active = state.state_meta.active_operation;
  if (active !== null && active.scope_ref?.kind === "analysis") {
    const planInfo = validatePlan(state.next_step_plan);
    const slot = planInfo.design === null
      ? null
      : state.council_chamber.analysis_execution[planInfo.design];
    if (
      slot
      && slot.scope_id === active.scope_ref.id
      && slot.scope_revision === active.scope_ref.revision
    ) {
      slot.causal_basis_hash = analysisCausalBasisHash(state);
    }
  }
  if (state.response_receipt !== null) {
    if (Object.prototype.hasOwnProperty.call(state.response_receipt, "direct_assignment")) {
      fail("UNSUPPORTED_SCHEMA", "pre-v6 response_receipt cannot already contain direct_assignment");
    }
    state.response_receipt.direct_assignment = null;
  }
}

function addSchema8Controls(state) {
  assertObject(state.project_summary, "project_summary");
  if (Object.prototype.hasOwnProperty.call(state.project_summary, "audience_profile")) {
    fail("UNSUPPORTED_SCHEMA", "pre-v8 project_summary cannot already contain audience_profile");
  }
  if (Object.prototype.hasOwnProperty.call(state, "carried_questions")) {
    fail("UNSUPPORTED_SCHEMA", "pre-v8 project state cannot already contain carried_questions");
  }
  state.project_summary.audience_profile = {
    level: "unstated",
    evidence: null,
    preferences: [],
  };
  state.carried_questions = [];
}

function upgradeV8QuestionSource(source, label) {
  assertObject(source, label);
  const keys = Object.keys(source).sort();
  const legacyKeys = ["actor", "operation_id", "revision"].sort();
  const currentKeys = [
    "actor",
    "operation_id",
    "revision",
    "source_kind",
    "source_text",
  ].sort();
  if (deepEqual(keys, legacyKeys)) {
    return {
      ...clone(source),
      source_kind: "legacy_v8",
      source_text: null,
    };
  }
  if (deepEqual(keys, currentKeys)) return clone(source);
  fail(
    "UNSUPPORTED_SCHEMA",
    `${label} is neither a legacy nor current schema-8 question source`,
  );
}

function addSchema9Controls(state) {
  assertObject(state.report_assembly, "report_assembly");
  if (Object.prototype.hasOwnProperty.call(state.report_assembly, "claim_boundary")) {
    fail("UNSUPPORTED_SCHEMA", "pre-v9 report_assembly cannot already contain claim_boundary");
  }
  state.report_assembly.claim_boundary = null;
  const targetsCurrentReportScope = (assignment) => (
    assignment?.route === "report_writer"
    && assignment.scope_ref?.kind === "report"
    && assignment.scope_ref.id === state.report_assembly.scope_id
    && assignment.scope_ref.revision === state.report_assembly.scope_revision
  );
  if (targetsCurrentReportScope(state.response_receipt?.direct_assignment)) {
    state.response_receipt.direct_assignment = null;
  }
  if (
    state.pending_decision !== null
    && state.pending_decision.options.some((option) => (
      targetsCurrentReportScope(option.assignment)
    ))
  ) {
    state.pending_decision = null;
  }
  assertArray(state.carried_questions, "carried_questions");
  state.carried_questions.forEach((entry, index) => {
    assertObject(entry, `carried_questions[${index}]`);
    for (const field of ["first_source", "last_source"]) {
      if (!Object.prototype.hasOwnProperty.call(entry, field)) {
        fail("UNSUPPORTED_SCHEMA", `schema-8 carried_questions[${index}].${field} is missing`);
      }
      entry[field] = upgradeV8QuestionSource(
        entry[field],
        `carried_questions[${index}].${field}`,
      );
    }
  });
}

function addSchema7Controls(state, projectRoot) {
  assertObject(state.report_assembly, "report_assembly");
  if (Object.prototype.hasOwnProperty.call(state.report_assembly, "analysis_artifact_ids")) {
    fail("UNSUPPORTED_SCHEMA", "pre-v7 report_assembly cannot already contain analysis_artifact_ids");
  }
  const reportHasScope = isUuid(state.report_assembly.scope_id)
    && Number.isInteger(state.report_assembly.scope_revision)
    && state.report_assembly.scope_revision >= 1;
  const hasAnalysisCompletion = state.artifact_records.some((record) => (
    record.route === "analysis_execution"
    && record.artifact_role === "completion"
  ));
  state.report_assembly.analysis_artifact_ids =
    reportHasScope && hasAnalysisCompletion ? null : [];

  const targetsCurrentReportScope = (assignment) => (
    assignment?.route === "report_writer"
    && assignment.scope_ref?.kind === "report"
    && assignment.scope_ref.id === state.report_assembly.scope_id
    && assignment.scope_ref.revision === state.report_assembly.scope_revision
  );
  if (state.report_assembly.analysis_artifact_ids === null) {
    if (targetsCurrentReportScope(state.response_receipt?.direct_assignment)) {
      state.response_receipt.direct_assignment = null;
    }
    if (
      state.pending_decision !== null
      && state.pending_decision.options.some((option) => (
        targetsCurrentReportScope(option.assignment)
      ))
    ) {
      state.pending_decision = null;
    }
  }

  const active = state.state_meta.active_operation;
  if (active !== null) {
    if (Object.prototype.hasOwnProperty.call(active, "report_evidence_binding_protocol")) {
      fail(
        "UNSUPPORTED_SCHEMA",
        "pre-v7 active_operation cannot already contain report_evidence_binding_protocol",
      );
    }
    const planInfo = validatePlan(state.next_step_plan);
    active.report_evidence_binding_protocol = planInfo.actor === "report_writer" ? 0 : null;
  }
}

function finalizeSchemaMigration(state) {
  state.state_meta.revision += 1;
  state.state_meta.updated_at = nowIso();
  if (state.response_receipt !== null) {
    state.response_receipt.revision = state.state_meta.revision;
  }
  validateState(state);
  return state;
}

function migrateLegacyState(legacy, options = {}) {
  const { discardPlan = false, projectRoot } = options;
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
  addDiscoveryControls(reordered);
  addSchema5Controls(reordered);
  addSchema6Controls(reordered);
  addSchema7Controls(reordered, projectRoot);
  addSchema8Controls(reordered);
  addSchema9Controls(reordered);
  validateState(reordered);
  return reordered;
}

function migrateV2State(v2, projectRoot) {
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
  addDiscoveryControls(migrated);
  addSchema5Controls(migrated);
  addSchema6Controls(migrated);
  addSchema7Controls(migrated, projectRoot);
  addSchema8Controls(migrated);
  addSchema9Controls(migrated);
  validateState(migrated);
  return finalizeSchemaMigration(migrated);
}

function migrateV3State(v3, projectRoot) {
  assertExactTopLevel(v3, PRE_V8_TOP_LEVEL);
  assertObject(v3.state_meta, "state_meta");
  if (v3.state_meta.schema_version !== 3) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v3.state_meta.schema_version}`);
  }

  const migrated = clone(v3);
  migrated.state_meta.schema_version = SCHEMA_VERSION;
  addDiscoveryControls(migrated);
  addSchema5Controls(migrated);
  addSchema6Controls(migrated);
  addSchema7Controls(migrated, projectRoot);
  addSchema8Controls(migrated);
  addSchema9Controls(migrated);
  validateState(migrated);
  return finalizeSchemaMigration(migrated);
}

function migrateV4State(v4, projectRoot) {
  assertExactTopLevel(v4, PRE_V8_TOP_LEVEL);
  assertObject(v4.state_meta, "state_meta");
  if (v4.state_meta.schema_version !== 4) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v4.state_meta.schema_version}`);
  }

  const migrated = clone(v4);
  migrated.state_meta.schema_version = SCHEMA_VERSION;
  addSchema5Controls(migrated);
  addSchema6Controls(migrated);
  addSchema7Controls(migrated, projectRoot);
  addSchema8Controls(migrated);
  addSchema9Controls(migrated);
  validateState(migrated);
  return finalizeSchemaMigration(migrated);
}

function migrateV5State(v5, projectRoot) {
  assertExactTopLevel(v5, PRE_V8_TOP_LEVEL);
  assertObject(v5.state_meta, "state_meta");
  if (v5.state_meta.schema_version !== 5) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v5.state_meta.schema_version}`);
  }

  const migrated = clone(v5);
  migrated.state_meta.schema_version = SCHEMA_VERSION;
  addSchema6Controls(migrated);
  addSchema7Controls(migrated, projectRoot);
  addSchema8Controls(migrated);
  addSchema9Controls(migrated);
  validateState(migrated);
  return finalizeSchemaMigration(migrated);
}

function upgradeV6State(v6, projectRoot) {
  assertExactTopLevel(v6, PRE_V8_TOP_LEVEL);
  assertObject(v6.state_meta, "state_meta");
  if (v6.state_meta.schema_version !== 6) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v6.state_meta.schema_version}`);
  }

  const migrated = clone(v6);
  migrated.state_meta.schema_version = SCHEMA_VERSION;
  addSchema7Controls(migrated, projectRoot);
  addSchema8Controls(migrated);
  addSchema9Controls(migrated);
  validateState(migrated);
  return migrated;
}

function migrateV6State(v6, projectRoot) {
  return finalizeSchemaMigration(upgradeV6State(v6, projectRoot));
}

function upgradeV7State(v7) {
  assertExactTopLevel(v7, PRE_V8_TOP_LEVEL);
  assertObject(v7.state_meta, "state_meta");
  if (v7.state_meta.schema_version !== 7) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v7.state_meta.schema_version}`);
  }

  const migrated = clone(v7);
  migrated.state_meta.schema_version = SCHEMA_VERSION;
  addSchema8Controls(migrated);
  addSchema9Controls(migrated);
  validateState(migrated);
  return migrated;
}

function migrateV7State(v7) {
  return finalizeSchemaMigration(upgradeV7State(v7));
}

function upgradeV8State(v8) {
  assertExactTopLevel(v8);
  assertObject(v8.state_meta, "state_meta");
  if (v8.state_meta.schema_version !== 8) {
    fail("UNSUPPORTED_SCHEMA", `unsupported schema version: ${v8.state_meta.schema_version}`);
  }

  const migrated = clone(v8);
  migrated.state_meta.schema_version = SCHEMA_VERSION;
  addSchema9Controls(migrated);
  validateState(migrated);
  return migrated;
}

function migrateV8State(v8) {
  return finalizeSchemaMigration(upgradeV8State(v8));
}

function availableRegularFile(filePath) {
  try {
    return fs.lstatSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
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
    if (!availableRegularFile(manifestPath)) {
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
    if (!isObject(manifest)) {
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
      "discovery_contract",
      "files",
      "completed_at",
      "summary",
      "artifact_role",
      "execution_receipt",
      "requirements",
    ]);
    const legacyManifest = manifest.schema_version === LEGACY_MANIFEST_VERSION;
    const receiptManifest = manifest.schema_version === RECEIPT_MANIFEST_VERSION;
    const currentManifest = manifest.schema_version === MANIFEST_VERSION;
    let manifestRole = null;
    let normalizedReceipt = null;
    let normalizedRequirements = null;
    let receiptValid = true;
    if (legacyManifest) {
      manifestRole = "completion";
    } else if (receiptManifest || currentManifest) {
      manifestRole = manifest.artifact_role;
      try {
        assertEnum(manifestRole, ARTIFACT_ROLES, "historical artifact manifest.artifact_role", "INVALID_ARTIFACT_RECEIPT");
        normalizedReceipt = manifest.execution_receipt === null
          ? null
          : normalizeExecutionReceipt(
            manifest.execution_receipt,
            "historical artifact manifest.execution_receipt",
            manifest.schema_version,
          );
        if (normalizedReceipt !== null && !deepEqual(normalizedReceipt, manifest.execution_receipt)) {
          receiptValid = false;
        }
        if (
          normalizedReceipt !== null
          && (
            (manifestRole === "completion" && normalizedReceipt.unmet_requirements.length > 0)
            || (
              manifestRole === "infeasibility_evidence"
              && normalizedReceipt.unmet_requirements.length === 0
            )
          )
        ) {
          receiptValid = false;
        }
        if (currentManifest) {
          normalizedRequirements = normalizeManifestRequirements(
            manifest.requirements,
            normalizedReceipt?.contract_hash ?? null,
            "historical artifact manifest.requirements",
          );
          if (!deepEqual(normalizedRequirements, manifest.requirements)) {
            receiptValid = false;
          }
          validateReceiptAgainstPacket(
            normalizedReceipt,
            {
              completion_protocol: normalizedReceipt === null ? 0 : 2,
              contract_hash: normalizedReceipt?.contract_hash ?? null,
              requirements: normalizedRequirements,
            },
            manifestRole,
          );
        } else if (Object.prototype.hasOwnProperty.call(manifest, "requirements")) {
          receiptValid = false;
        }
      } catch (_error) {
        receiptValid = false;
      }
      if (manifestRole === "infeasibility_evidence" && normalizedReceipt === null) receiptValid = false;
    }
    const expectedScopeKind = record.route === "analysis_execution"
      ? "analysis"
      : record.route === "report_writer"
        ? "report"
        : record.route === "causal_discovery"
          ? "discovery"
          : null;
    const scopeRef = manifest.scope_ref;
    const scopeRefShapeValid = isObject(scopeRef)
      && Object.keys(scopeRef).length === 3
      && Object.keys(scopeRef).every((key) => ["kind", "id", "revision"].includes(key))
      && isUuid(scopeRef.id)
      && Number.isInteger(scopeRef.revision)
      && scopeRef.revision >= 1;
    const legacyDiscovery = legacyManifest && record.route === "causal_discovery" && scopeRef === null;
    const scopeRefValid = legacyDiscovery
      ? manifest.discovery_contract === undefined
      : expectedScopeKind === null
      ? scopeRef === null
      : scopeRefShapeValid && scopeRef.kind === expectedScopeKind;
    let discoveryContractValid = manifest.discovery_contract === undefined;
    if (record.route === "causal_discovery" && !legacyDiscovery) {
      try {
        validateDiscoveryContract(
          manifest.discovery_contract,
          "historical artifact manifest.discovery_contract",
        );
        discoveryContractValid = true;
      } catch (_error) {
        discoveryContractValid = false;
      }
    }
    const requiredManifestKeys = [
      "schema_version",
      "operation_id",
      "route",
      "scope_ref",
      "files",
      "completed_at",
      "summary",
    ];
    if (receiptManifest || currentManifest) {
      requiredManifestKeys.push("artifact_role", "execution_receipt");
    }
    if (currentManifest) requiredManifestKeys.push("requirements");
    if (
      Object.keys(manifest).some((key) => !manifestKeys.has(key))
      || requiredManifestKeys.some((key) => !Object.prototype.hasOwnProperty.call(manifest, key))
      || (!legacyManifest && !receiptManifest && !currentManifest)
      || (legacyManifest && ("artifact_role" in manifest || "execution_receipt" in manifest))
      || ((legacyManifest || receiptManifest) && "requirements" in manifest)
      || manifestRole !== record.artifact_role
      || !receiptValid
      || manifest.operation_id !== record.operation_id
      || manifest.route !== record.route
      || !scopeRefValid
      || !discoveryContractValid
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
    if (legacyDiscovery) {
      warnings.push({
        code: "UNBOUND_LEGACY_DISCOVERY_ARTIFACT",
        artifact_id: record.artifact_id,
        location: record.location,
        manifest_path: relativeManifestPath,
      });
    }
    const normalizedManifestFiles = manifest.files.map(normalizePath);
    const manifestInventory = new Set(normalizedManifestFiles);
    let includesPrimary = false;
    let includesDeliverable = false;
    for (const normalized of normalizedManifestFiles) {
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
      if (!fs.existsSync(listedPath) || !availableRegularFile(listedPath)) {
        warnings.push({
          code: "MISSING_HISTORICAL_ARTIFACT_FILE",
          artifact_id: record.artifact_id,
          location: record.location,
          file: normalized,
        });
      }
    }
    if (
      normalizedReceipt !== null
      && normalizedReceipt.evidence_files.some((file) => !manifestInventory.has(file))
    ) {
      warnings.push({
        code: "INVALID_HISTORICAL_ARTIFACT_MANIFEST",
        artifact_id: record.artifact_id,
        location: record.location,
        manifest_path: relativeManifestPath,
      });
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

function unavailableBoundReportAnalysisArtifactIds(projectRoot, state) {
  const bound = new Set(state.report_assembly.analysis_artifact_ids);
  if (!bound.size) return [];
  return [...new Set(
    artifactWarnings(projectRoot, state)
      .filter((warning) => bound.has(warning.artifact_id))
      .map((warning) => warning.artifact_id),
  )].sort();
}

function assertBoundReportAnalysisArtifactsAvailable(projectRoot, state) {
  if (state.report_assembly.analysis_artifact_ids === null) {
    fail(
      "SCOPE_MISMATCH",
      "the legacy report evidence binding is unresolved; select evidence with scope_transition revise and obtain reapproval",
      { report_evidence_binding: "unresolved" },
    );
  }
  const unavailable = unavailableBoundReportAnalysisArtifactIds(projectRoot, state);
  if (!unavailable.length) return;
  fail(
    "SCOPE_MISMATCH",
    "the approved report's bound analysis evidence is unavailable; restore it or revise and reapprove the report scope",
    { unavailable_analysis_artifact_ids: unavailable },
  );
}

function statePathFor(projectRoot) {
  return path.join(path.resolve(projectRoot), STATE_FILE);
}

function stateLockPathFor(projectRoot) {
  return path.join(path.resolve(projectRoot), STATE_LOCK_FILE);
}

function stateLockOwnerPath(lockPath) {
  return path.join(lockPath, STATE_LOCK_OWNER_FILE);
}

function currentLockHostname() {
  return os.hostname().trim().toLowerCase() || "unknown-host";
}

function processAppearsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code !== "ESRCH";
  }
}

function readStateLockOwner(lockPath) {
  const ownerPath = stateLockOwnerPath(lockPath);
  try {
    const stat = fs.lstatSync(ownerPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { text: null, owner: null, unsafe: true };
    }
    const text = fs.readFileSync(ownerPath, "utf8");
    try {
      return { text, owner: JSON.parse(text), unsafe: false };
    } catch (_error) {
      return { text, owner: null, unsafe: false };
    }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { text: null, owner: null, unsafe: false };
    }
    return { text: null, owner: null, unsafe: true };
  }
}

function validStateLockOwner(owner) {
  return isObject(owner)
    && owner.protocol === 1
    && Number.isInteger(owner.pid)
    && owner.pid > 0
    && typeof owner.hostname === "string"
    && owner.hostname.length > 0
    && typeof owner.token === "string"
    && isUuid(owner.token)
    && isTimestamp(owner.created_at);
}

function removeQuarantinedLock(quarantinePath) {
  try {
    fs.rmSync(quarantinePath, { recursive: true, force: true });
  } catch (_error) {
    // The fixed lock path is already free; leave cleanup as best effort.
  }
}

function quarantineStateLock(lockPath, label) {
  const quarantinePath = `${lockPath}.${label}-${crypto.randomUUID()}`;
  fs.renameSync(lockPath, quarantinePath);
  removeQuarantinedLock(quarantinePath);
}

function reclaimAbandonedStateLock(lockPath) {
  let lockStat;
  try {
    lockStat = fs.lstatSync(lockPath);
  } catch (error) {
    return Boolean(error && error.code === "ENOENT");
  }
  if (!lockStat.isDirectory() || lockStat.isSymbolicLink()) return false;

  const initial = readStateLockOwner(lockPath);
  if (initial.unsafe) return false;
  const validOwner = validStateLockOwner(initial.owner);
  if (validOwner) {
    if (initial.owner.hostname !== currentLockHostname()) return false;
    if (processAppearsAlive(initial.owner.pid)) return false;
  } else if (Date.now() - lockStat.mtimeMs < STATE_LOCK_INITIALIZATION_GRACE_MS) {
    return false;
  }

  const claimPath = path.join(lockPath, "reap.claim");
  let claimHandle;
  let quarantined = false;
  try {
    claimHandle = fs.openSync(claimPath, "wx", 0o600);
    fs.writeFileSync(claimHandle, crypto.randomUUID(), "utf8");
    fs.fsyncSync(claimHandle);
    fs.closeSync(claimHandle);
    claimHandle = undefined;
    const current = readStateLockOwner(lockPath);
    if (current.unsafe || current.text !== initial.text) return false;
    quarantineStateLock(lockPath, "reaped");
    quarantined = true;
    return true;
  } catch (error) {
    return Boolean(error && error.code === "ENOENT");
  } finally {
    if (claimHandle !== undefined) {
      try { fs.closeSync(claimHandle); } catch (_closeError) { /* best effort */ }
    }
    if (!quarantined) {
      try { fs.rmSync(claimPath, { force: true }); } catch (_removeError) { /* best effort */ }
    }
  }
}

function acquireStateLock(projectRoot, { createProjectRoot = false } = {}) {
  if (createProjectRoot) {
    try {
      fs.mkdirSync(path.resolve(projectRoot), { recursive: true, mode: 0o700 });
    } catch (error) {
      fail("IO_ERROR", `could not create the project root: ${error.message}`);
    }
  }
  const lockPath = stateLockPathFor(projectRoot);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let handle;
    let created = false;
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      created = true;
      const lock = {
        protocol: 1,
        pid: process.pid,
        hostname: currentLockHostname(),
        token: crypto.randomUUID(),
        created_at: nowIso(),
      };
      handle = fs.openSync(stateLockOwnerPath(lockPath), "wx", 0o600);
      fs.writeFileSync(handle, JSON.stringify(lock), "utf8");
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      return { lockPath, token: lock.token };
    } catch (error) {
      if (handle !== undefined) {
        try { fs.closeSync(handle); } catch (_closeError) { /* best effort */ }
      }
      if (error && error.code === "EEXIST" && !created) {
        if (reclaimAbandonedStateLock(lockPath)) continue;
        fail("STATE_LOCKED", "another causal-consultant state mutation is in progress");
      }
      if (created) {
        try { quarantineStateLock(lockPath, "failed"); } catch (_cleanupError) { /* best effort */ }
      }
      fail("IO_ERROR", `could not acquire the project-state lock: ${error.message}`);
    }
  }
  fail("STATE_LOCKED", "another causal-consultant state mutation is in progress");
}

function releaseStateLock(lock) {
  const claimPath = path.join(lock.lockPath, "release.claim");
  let claimHandle;
  let quarantined = false;
  try {
    claimHandle = fs.openSync(claimPath, "wx", 0o600);
    fs.writeFileSync(claimHandle, lock.token, "utf8");
    fs.fsyncSync(claimHandle);
    fs.closeSync(claimHandle);
    claimHandle = undefined;
    const current = readStateLockOwner(lock.lockPath);
    if (
      !current.unsafe
      && validStateLockOwner(current.owner)
      && current.owner.token === lock.token
    ) {
      quarantineStateLock(lock.lockPath, "released");
      quarantined = true;
    }
  } catch (_error) {
    // A later command can reclaim a lock whose owner process no longer exists.
  } finally {
    if (claimHandle !== undefined) {
      try { fs.closeSync(claimHandle); } catch (_closeError) { /* best effort */ }
    }
    if (!quarantined) {
      try { fs.rmSync(claimPath, { force: true }); } catch (_removeError) { /* best effort */ }
    }
  }
}

function holdStateLockForTest() {
  if (process.env.STATECTL_TEST_HOLD_LOCK_MS === undefined) return;
  const milliseconds = Number(process.env.STATECTL_TEST_HOLD_LOCK_MS);
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 5_000) {
    fail("INVALID_INPUT", "STATECTL_TEST_HOLD_LOCK_MS must be an integer from 1 to 5000");
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function withStateMutationLock(projectRoot, action, options = {}) {
  const lock = acquireStateLock(projectRoot, options);
  try {
    holdStateLockForTest();
    return action();
  } finally {
    releaseStateLock(lock);
  }
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

function openProject({
  projectRoot,
  skillRoot,
  fresh = false,
  discardLegacyPlan = false,
  contextProtocol = null,
}) {
  const selectedContextProtocol = normalizeContextProtocol(contextProtocol, "open context protocol");
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
    const context = contextForCurrentStage(
      state,
      validatePlan(state.next_step_plan),
      [],
      null,
      selectedContextProtocol,
    );
    return {
      ok: true,
      code: exists ? "RESET" : "CREATED_FRESH",
      state_path: statePath,
      archive_path: archivePath,
      project_id: state.state_meta.project_id,
      revision: state.state_meta.revision,
      mode: "idle",
      operation_packet: null,
      warnings: [],
      ...context,
    };
  }

  if (!exists) {
    const state = instantiateTemplate(template, {
      kind: "created",
      archive_path: null,
    });
    atomicWrite(statePath, stringifyYaml(state));
    const context = contextForCurrentStage(
      state,
      validatePlan(state.next_step_plan),
      [],
      null,
      selectedContextProtocol,
    );
    return {
      ok: true,
      code: "CREATED",
      state_path: statePath,
      project_id: state.state_meta.project_id,
      revision: state.state_meta.revision,
      mode: "idle",
      operation_packet: null,
      warnings: [],
      ...context,
    };
  }

  const original = readBytes(statePath);
  const parsed = parseYaml(original.toString("utf8"), statePath);
  if (!isObject(parsed.state_meta)) {
    const migrated = migrateLegacyState(parsed, {
      discardPlan: discardLegacyPlan,
      projectRoot: root,
    });
    const warnings = artifactWarnings(root, migrated);
    const serialized = stringifyYaml(migrated);
    const archivePath = archiveBytes(root, original, discardLegacyPlan ? "migration-v45-discarded-plan" : "migration-v45");
    atomicWrite(statePath, serialized);
    const context = contextForCurrentStage(
      migrated,
      validatePlan(migrated.next_step_plan),
      warnings,
      null,
      selectedContextProtocol,
    );
    return {
      ok: true,
      code: discardLegacyPlan ? "MIGRATED_LEGACY_PLAN_DISCARDED" : "MIGRATED",
      state_path: statePath,
      archive_path: archivePath,
      project_id: migrated.state_meta.project_id,
      revision: migrated.state_meta.revision,
      mode: "idle",
      operation_packet: null,
      warnings,
      ...context,
    };
  }

  if ([2, 3, 4, 5, 6, 7, 8].includes(parsed.state_meta.schema_version)) {
    if (discardLegacyPlan) {
      fail("INVALID_INPUT", "--discard-legacy-plan applies only to a recognized unversioned v4.5 state");
    }
    const sourceVersion = parsed.state_meta.schema_version;
    const migrated = sourceVersion === 2
      ? migrateV2State(parsed, root)
      : sourceVersion === 3
        ? migrateV3State(parsed, root)
        : sourceVersion === 4
          ? migrateV4State(parsed, root)
          : sourceVersion === 5
            ? migrateV5State(parsed, root)
            : sourceVersion === 6
              ? migrateV6State(parsed, root)
              : sourceVersion === 7
                ? migrateV7State(parsed)
                : migrateV8State(parsed);
    const { planInfo } = validateState(migrated);
    const operation = migrated.state_meta.active_operation;
    const packet = operationPacket(migrated, operation, planInfo);
    const mode = operation === null
      ? "idle"
      : operation.stage === "worker_pending"
        ? "resume_worker"
        : "resume_lead";
    const artifactStatus = operation && operation.artifact_intent
      ? inspectReservedArtifact(root, operation, planInfo.actor, packet)
      : null;
    const warnings = artifactWarnings(root, migrated);
    const visibleWarnings = visibleReportArtifactWarnings(migrated, planInfo, warnings);
    const serialized = stringifyYaml(migrated);
    const archivePath = archiveBytes(root, original, `migration-v${sourceVersion}-v${SCHEMA_VERSION}`);
    atomicWrite(statePath, serialized);
    const context = contextForCurrentStage(
      migrated,
      planInfo,
      visibleWarnings,
      artifactStatus,
      selectedContextProtocol,
    );
    return {
      ok: true,
      code: `MIGRATED_V${sourceVersion}`,
      state_path: statePath,
      archive_path: archivePath,
      project_id: migrated.state_meta.project_id,
      revision: migrated.state_meta.revision,
      mode,
      plan: migrated.next_step_plan,
      plan_actor: planInfo.actor,
      active_operation: operation,
      operation_packet: packet,
      artifact_status: artifactStatus,
      warnings: visibleWarnings,
      ...context,
    };
  }

  if (discardLegacyPlan) {
    fail("INVALID_INPUT", "--discard-legacy-plan applies only to a recognized unversioned v4.5 state");
  }

  const { planInfo } = validateState(parsed);
  const operation = parsed.state_meta.active_operation;
  const packet = operationPacket(parsed, operation, planInfo);
  let mode = "idle";
  let code = "OPENED";
  if (operation) {
    mode = operation.stage === "worker_pending" ? "resume_worker" : "resume_lead";
    code = operation.stage === "worker_pending" ? "RESUME_WORKER" : "RESUME_LEAD";
  }
  const artifactStatus = operation && operation.artifact_intent
    ? inspectReservedArtifact(root, operation, planInfo.actor, packet)
    : null;
  const warnings = artifactWarnings(root, parsed);
  const visibleWarnings = visibleReportArtifactWarnings(parsed, planInfo, warnings);
  const context = contextForCurrentStage(
    parsed,
    planInfo,
    visibleWarnings,
    artifactStatus,
    selectedContextProtocol,
  );
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
    operation_packet: packet,
    artifact_status: artifactStatus,
    warnings: visibleWarnings,
    ...context,
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
    if (
      current
      && (
        current.causal_basis_hash === null
        || current.causal_basis_hash !== analysisCausalBasisHash(state)
      )
    ) {
      fail(
        "SCOPE_MISMATCH",
        "the ready analysis scope uses an older causal basis and must be revised",
      );
    }
  } else if (route === "report_writer") {
    if (scopeRef.kind !== "report") fail("SCOPE_MISMATCH", "report_writer requires a report scope reference");
    if (state.report_assembly.analysis_artifact_ids === null) {
      fail(
        "SCOPE_MISMATCH",
        "the legacy report evidence binding is unresolved; revise the report scope with an explicit evidence selection before approval",
        { report_evidence_binding: "unresolved" },
      );
    }
    current = state.report_assembly;
    status = state.council_chamber.report_writer.current_status;
    assertReadyReportScopeComplete(current);
  } else if (route === "causal_discovery") {
    if (scopeRef.kind !== "discovery") fail("SCOPE_MISMATCH", "causal_discovery requires a discovery scope reference");
    current = state.discovery_sidecar;
    if (
      current.scope_id !== scopeRef.id
      || current.scope_revision !== scopeRef.revision
      || current.execution_contract === null
    ) fail("SCOPE_MISMATCH", "the requested discovery scope reference is not current");
    return;
  } else {
    fail("SCOPE_MISMATCH", `${route} cannot use a scope reference`);
  }
  if (!current || current.scope_id !== scopeRef.id || current.scope_revision !== scopeRef.revision) {
    fail("SCOPE_MISMATCH", "the requested scope reference is not current");
  }
  if (status !== "ready") {
    fail("SCOPE_MISMATCH", `scope status ${status} cannot be bound for execution`);
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
    if (scopeRef !== null && !["report_writer", "causal_discovery"].includes(route)) {
      fail(scopeCode, `${route} cannot use scope_ref`);
    }
    if (scopeRef !== null && route === "report_writer" && scopeRef.kind !== "report") {
      fail(scopeCode, "report_writer requires a report scope reference");
    }
    if (scopeRef !== null && route === "causal_discovery" && scopeRef.kind !== "discovery") {
      fail(scopeCode, "causal_discovery requires a discovery scope reference");
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
  if (
    typeof assignment.route === "string"
    && assignment.route.startsWith("analysis_execution.")
    && !Object.prototype.hasOwnProperty.call(input, "support")
  ) {
    const recommendedSupport = state.causal_facts.recommended_method_routes
      .find((route) => route.category === "support");
    if (recommendedSupport) assignment.support = recommendedSupport.id;
  }
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

function beginOperation({
  projectRoot,
  payload,
  contextProtocol = null,
}) {
  const { statePath, state } = loadCurrentState(projectRoot);
  assertExpected(state, payload);
  if (state.state_meta.active_operation !== null || state.next_step_plan.length) {
    fail("ACTIVE_OPERATION", "finish or cancel the active operation before beginning another");
  }
  const assignmentFields = ["route", "support", "intent_summary", "scope_ref"];
  const allowedInput = new Set([
    "expected_project_id",
    "expected_revision",
    "selection",
    "artifact_reservation",
    ...assignmentFields,
  ]);
  assertKnownKeys(payload, allowedInput, "begin input", "INVALID_INPUT");
  const selectedContextProtocol = normalizeContextProtocol(
    contextProtocol,
    "begin context protocol",
  );
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
  if (assignment.route === "report_writer" && assignment.scope_ref !== null) {
    assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
  }

  const operation = {
    id: crypto.randomUUID(),
    stage,
    intent_summary: assignment.intent_summary,
    scope_ref: assignment.scope_ref,
    artifact_intent: null,
    discovery_scope: null,
    completion_protocol: 0,
    contract_hash: null,
    report_evidence_binding_protocol: assignment.route === "report_writer"
      ? state.report_assembly.analysis_artifact_ids === null ? 0 : 1
      : null,
    started_at: nowIso(),
  };
  if (assignment.route === "causal_discovery" && assignment.scope_ref !== null) {
    operation.discovery_scope = {
      transition: "preserve",
      base_ref: clone(assignment.scope_ref),
      contract: clone(state.discovery_sidecar.execution_contract),
    };
  }
  const planInfo = validatePlan(plan);
  setOperationProtocol(state, operation, planInfo);
  state.next_step_plan = plan;
  state.state_meta.active_operation = operation;
  state.pending_decision = null;
  state.response_receipt = null;
  const reservation = payload.artifact_reservation === undefined
    ? null
    : reserveArtifactIntent(
      projectRoot,
      operation,
      planInfo,
      payload.artifact_reservation,
      "begin input.artifact_reservation",
    );
  const warnings = artifactWarnings(projectRoot, state);
  const currentPacket = operationPacket(state, operation, planInfo);
  const artifactStatus = reservation === null
    ? null
    : inspectReservedArtifact(projectRoot, operation, planInfo.actor, currentPacket);
  if (artifactStatus !== null) assertCleanArtifactReservation(artifactStatus);
  const revision = commitMutation(statePath, state);
  const context = contextForCurrentStage(
    state,
    planInfo,
    warnings,
    artifactStatus,
    selectedContextProtocol,
  );
  return {
    ok: true,
    code: stage === "lead_pending" ? "BEGAN_LEAD" : "BEGAN_WORKER",
    project_id: state.state_meta.project_id,
    revision,
    operation_id: operation.id,
    stage,
    plan,
    operation_packet: currentPacket,
    ...(reservation === null ? {} : reservation),
    ...context,
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

function bindDiscoveryScope(state, operation, value, label) {
  if (operation.discovery_scope !== null || operation.scope_ref !== null) {
    fail("SCOPE_MISMATCH", "the active discovery scope is already frozen");
  }
  assertKnownKeys(value, new Set(["transition", "contract"]), label, "INVALID_INPUT");
  const missing = ["transition", "contract"].filter(
    (field) => !Object.prototype.hasOwnProperty.call(value, field),
  );
  if (missing.length) fail("INVALID_INPUT", `${label} is missing: ${missing.join(", ")}`);
  assertEnum(value.transition, ["new", "revise"], `${label}.transition`, "INVALID_INPUT");
  const contract = normalizeDiscoveryContract(
    value.contract,
    `${label}.contract`,
    "INVALID_INPUT",
  );

  let baseRef = null;
  let scopeRef;
  if (value.transition === "new") {
    scopeRef = {
      kind: "discovery",
      id: crypto.randomUUID(),
      revision: 1,
    };
  } else {
    const current = state.discovery_sidecar;
    if (
      !isUuid(current.scope_id)
      || !Number.isInteger(current.scope_revision)
      || current.scope_revision < 1
      || current.execution_contract === null
    ) {
      fail("SCOPE_MISMATCH", "cannot revise a discovery scope that has no current contract");
    }
    baseRef = {
      kind: "discovery",
      id: current.scope_id,
      revision: current.scope_revision,
    };
    scopeRef = {
      ...baseRef,
      revision: baseRef.revision + 1,
    };
  }
  operation.scope_ref = scopeRef;
  operation.discovery_scope = {
    transition: value.transition,
    base_ref: baseRef,
    contract,
  };
  setOperationProtocol(state, operation, validatePlan(state.next_step_plan));
}

function normalizeExtension(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") fail("INVALID_INPUT", "extension must be a string");
  const extension = value.startsWith(".") ? value : `.${value}`;
  if (!/^\.[a-z0-9]{1,10}$/i.test(extension)) fail("INVALID_INPUT", "extension must be a simple file extension");
  return extension.toLowerCase();
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === ""
    || (
      !path.isAbsolute(relative)
      && relative !== ".."
      && !relative.startsWith(`..${path.sep}`)
    )
  );
}

function assertArtifactAncestorsWithinProject(projectRoot, candidate) {
  const root = path.resolve(projectRoot);
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch (error) {
    fail("IO_ERROR", `could not resolve project root for artifact safety: ${error.message}`);
  }

  const relative = path.relative(root, candidate);
  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < segments.length - 1; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      if (error && error.code === "ENOTDIR") {
        fail("INVALID_ARTIFACT_PATH", "an artifact path ancestor is not a directory");
      }
      fail("IO_ERROR", `could not inspect artifact path safely: ${error.message}`);
    }


    if (stat.isSymbolicLink()) {
      fail("INVALID_ARTIFACT_PATH", "artifact path ancestors under output must not be links");
    }
    let realCurrent;
    try {
      realCurrent = fs.realpathSync(current);
    } catch (error) {
      if (error && ["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) {
        fail("INVALID_ARTIFACT_PATH", "artifact path contains a dangling or invalid link");
      }
      fail("IO_ERROR", `could not resolve artifact path safely: ${error.message}`);
    }
    if (!pathIsWithin(realRoot, realCurrent)) {
      fail("INVALID_ARTIFACT_PATH", "artifact path resolves outside the project root");
    }

    if (index < segments.length - 1) {
      let resolvedStat;
      try {
        resolvedStat = fs.statSync(current);
      } catch (error) {
        if (error && ["ENOENT", "ENOTDIR", "ELOOP"].includes(error.code)) {
          fail("INVALID_ARTIFACT_PATH", "artifact path contains a dangling or invalid ancestor");
        }
        fail("IO_ERROR", `could not inspect artifact path ancestor: ${error.message}`);
      }
      if (!resolvedStat.isDirectory()) {
        fail("INVALID_ARTIFACT_PATH", "an artifact path ancestor is not a directory");
      }
    }
  }
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
  assertArtifactAncestorsWithinProject(root, resolved);
  return resolved;
}

function reserveArtifactIntent(projectRoot, operation, planInfo, input, label) {
  assertObject(input, label, "INVALID_INPUT");
  assertKnownKeys(input, new Set(["kind", "slug", "extension"]), label, "INVALID_INPUT");
  const actor = planInfo.actor;
  if (!(ARTIFACT_ACTORS.has(actor) || actor.startsWith("analysis_execution."))) {
    fail("OWNERSHIP_VIOLATION", `${actor} cannot create durable artifacts`);
  }
  if ((actor === "report_writer" || actor.startsWith("analysis_execution.")) && operation.scope_ref === null) {
    fail("SCOPE_MISMATCH", `${actor} must begin with an exact ready scope_ref before reserving output`);
  }
  if (actor === "causal_discovery" && operation.discovery_scope === null) {
    fail("SCOPE_MISMATCH", "causal_discovery must freeze a discovery_scope before reserving output");
  }
  if (operation.artifact_intent !== null) fail("ARTIFACT_ALREADY_RESERVED", "this operation already has an artifact reservation");
  assertEnum(input.kind, ["file", "directory"], `${label}.kind`, "INVALID_INPUT");
  if (
    typeof input.slug !== "string"
    || input.slug.length > MAX_ARTIFACT_SLUG_LENGTH
    || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(input.slug)
  ) {
    fail("INVALID_INPUT", `${label}.slug must contain at most ${MAX_ARTIFACT_SLUG_LENGTH} lowercase letters, digits, hyphens, or underscores`);
  }
  const extension = input.kind === "file" ? normalizeExtension(input.extension) : "";
  if (input.kind === "file" && !extension) fail("INVALID_INPUT", `${label} file artifacts require an extension`);
  if (input.kind === "directory" && input.extension !== undefined) {
    fail("INVALID_INPUT", `${label} directory artifacts do not use extensions`);
  }
  const location = `output/${input.slug}-${operation.id.slice(0, 8)}${extension}`;
  const artifactIntent = { kind: input.kind, location };
  const target = resolveOutputPath(projectRoot, location);
  const manifest = manifestPathFor(target, input.kind);
  const temporary = resolveOutputPath(
    projectRoot,
    temporaryArtifactLocation(artifactIntent, operation.id),
  );
  if (artifactEntryExists(target) || artifactEntryExists(manifest) || artifactEntryExists(temporary)) {
    fail("ARTIFACT_COLLISION", `reserved artifact path already exists: ${location}`);
  }
  operation.artifact_intent = artifactIntent;
  return {
    artifact_intent: clone(artifactIntent),
    temporary_path: temporaryArtifactLocation(artifactIntent, operation.id),
    manifest_path: normalizePath(path.relative(path.resolve(projectRoot), manifest)),
  };
}

function reserveArtifact({
  projectRoot,
  payload,
  contextProtocol = null,
}) {
  const { statePath, state } = loadCurrentState(projectRoot);
  assertExpected(state, payload);
  const allowedInput = new Set([
    "expected_project_id",
    "expected_revision",
    "operation_id",
    "kind",
    "slug",
    "extension",
    "discovery_scope",
  ]);
  assertKnownKeys(payload, allowedInput, "reserve-artifact input", "INVALID_INPUT");
  const selectedContextProtocol = normalizeContextProtocol(
    contextProtocol,
    "reserve-artifact context protocol",
  );
  const operation = assertOperation(state, payload, "worker_pending");
  const planInfo = validatePlan(state.next_step_plan);
  const actor = planInfo.actor;
  const previousPacket = operationPacket(state, operation, planInfo);
  if (actor === "report_writer" && operation.scope_ref !== null) {
    assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
  }
  if (payload.discovery_scope !== undefined) {
    if (actor !== "causal_discovery") {
      fail("OWNERSHIP_VIOLATION", `${actor} cannot set discovery_scope`);
    }
    bindDiscoveryScope(state, operation, payload.discovery_scope, "reserve-artifact discovery_scope");
  }
  if (operation.completion_protocol === 1 && operation.artifact_intent === null) {
    setOperationProtocol(state, operation, planInfo);
  }
  const reservation = reserveArtifactIntent(
    projectRoot,
    operation,
    planInfo,
    {
      kind: payload.kind,
      slug: payload.slug,
      ...(payload.extension !== undefined ? { extension: payload.extension } : {}),
    },
    "reserve-artifact input",
  );
  const currentPacket = operationPacket(state, operation, planInfo);
  const warnings = artifactWarnings(projectRoot, state);
  const artifactStatus = inspectReservedArtifact(projectRoot, operation, actor, currentPacket);
  assertCleanArtifactReservation(artifactStatus);
  const revision = commitMutation(statePath, state);
  const context = selectedContextProtocol === PHASE_CAPSULE_PROTOCOL
    ? { phase_capsule: phaseCapsule(state, planInfo, "worker", warnings, artifactStatus) }
    : {};
  return {
    ok: true,
    code: "ARTIFACT_RESERVED",
    project_id: state.state_meta.project_id,
    revision,
    operation_id: operation.id,
    artifact_intent: reservation.artifact_intent,
    scope_ref: operation.scope_ref,
    discovery_scope: operation.discovery_scope,
    ...operationPacketResult(previousPacket, currentPacket),
    temporary_path: reservation.temporary_path,
    manifest_path: reservation.manifest_path,
    ...context,
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

function isMissingArtifactFsError(error) {
  return error && ["ENOENT", "ENOTDIR"].includes(error.code);
}

function failArtifactFsError(error, missingMessage, ioMessage) {
  if (isMissingArtifactFsError(error)) {
    fail("MISSING_ARTIFACT", `${missingMessage}: ${error.message}`);
  }
  fail("IO_ERROR", `${ioMessage}: ${error.message}`);
}

function lstatRequiredArtifact(filePath, missingMessage, ioMessage) {
  try {
    return fs.lstatSync(filePath);
  } catch (error) {
    failArtifactFsError(error, missingMessage, ioMessage);
  }
}

function readRequiredArtifactText(filePath, missingMessage, ioMessage) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    failArtifactFsError(error, missingMessage, ioMessage);
  }
}

function validateManifest(projectRoot, operation, actor, packet, expectedArtifact = null) {
  const intent = operation.artifact_intent;
  if (!intent) fail("MISSING_ARTIFACT", "no artifact is reserved for this operation");
  const target = resolveOutputPath(projectRoot, intent.location);
  const manifestPath = manifestPathFor(target, intent.kind);
  const relativeManifestPath = normalizePath(
    path.relative(path.resolve(projectRoot), manifestPath),
  );
  const actualFiles = validateArtifactBody(projectRoot, operation, target)
    .filter((file) => file !== relativeManifestPath);
  const manifestStat = lstatRequiredArtifact(
    manifestPath,
    `completion manifest does not exist: ${manifestPath}`,
    `could not inspect completion manifest ${manifestPath}`,
  );
  if (!manifestStat.isFile()) {
    fail("INVALID_ARTIFACT_MANIFEST", "completion manifest must be a regular file");
  }
  const manifestText = readRequiredArtifactText(
    manifestPath,
    `completion manifest does not exist: ${manifestPath}`,
    `could not read completion manifest ${manifestPath}`,
  );
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    fail("INVALID_ARTIFACT_MANIFEST", `completion manifest is invalid JSON: ${error.message}`);
  }
  if (!isObject(manifest)) fail("INVALID_ARTIFACT_MANIFEST", "completion manifest must be a JSON object");
  const legacyManifest = manifest.schema_version === LEGACY_MANIFEST_VERSION;
  const receiptManifest = manifest.schema_version === RECEIPT_MANIFEST_VERSION;
  const currentManifest = manifest.schema_version === MANIFEST_VERSION;
  if (!legacyManifest && !receiptManifest && !currentManifest) {
    fail("INVALID_ARTIFACT_MANIFEST", "unsupported manifest schema version");
  }
  assertKnownKeys(manifest, new Set([
    "schema_version",
    "operation_id",
    "route",
    "scope_ref",
    "discovery_contract",
    "files",
    "completed_at",
    "summary",
    "artifact_role",
    "execution_receipt",
    "requirements",
  ]), "artifact manifest", "INVALID_ARTIFACT_MANIFEST");
  const requiredManifestKeys = [
    "schema_version",
    "operation_id",
    "route",
    "scope_ref",
    "files",
    "completed_at",
    "summary",
  ];
  if (receiptManifest || currentManifest) requiredManifestKeys.push("artifact_role", "execution_receipt");
  if (currentManifest) requiredManifestKeys.push("requirements");
  const missingManifestKeys = requiredManifestKeys.filter(
    (field) => !Object.prototype.hasOwnProperty.call(manifest, field),
  );
  if (missingManifestKeys.length) {
    fail(
      (receiptManifest || currentManifest) && missingManifestKeys.some((field) => ["artifact_role", "execution_receipt"].includes(field))
        ? "INVALID_ARTIFACT_RECEIPT"
        : "INVALID_ARTIFACT_MANIFEST",
      `artifact manifest is missing: ${missingManifestKeys.join(", ")}`,
    );
  }
  if (
    legacyManifest
    && (
      "artifact_role" in manifest
      || "execution_receipt" in manifest
      || "requirements" in manifest
    )
  ) {
    fail(
      "INVALID_ARTIFACT_MANIFEST",
      "schema-1 manifests cannot declare artifact_role, execution_receipt, or requirements",
    );
  }
  if (receiptManifest && "requirements" in manifest) {
    fail("INVALID_ARTIFACT_MANIFEST", "schema-2 manifests cannot declare requirements");
  }
  const artifactRole = legacyManifest ? "completion" : manifest.artifact_role;
  assertEnum(artifactRole, ARTIFACT_ROLES, "artifact manifest.artifact_role", "INVALID_ARTIFACT_RECEIPT");
  const executionReceipt = legacyManifest || manifest.execution_receipt === null
    ? null
    : normalizeExecutionReceipt(
      manifest.execution_receipt,
      "artifact manifest.execution_receipt",
      manifest.schema_version,
    );
  if ((receiptManifest || currentManifest) && executionReceipt !== null && !deepEqual(executionReceipt, manifest.execution_receipt)) {
    fail("INVALID_ARTIFACT_RECEIPT", "artifact manifest execution_receipt must use canonical strings and paths");
  }
  const manifestRequirements = currentManifest
    ? normalizeManifestRequirements(
        manifest.requirements,
        packet.contract_hash,
        "artifact manifest.requirements",
      )
    : null;
  if (currentManifest && !deepEqual(manifestRequirements, manifest.requirements)) {
    fail("INVALID_ARTIFACT_MANIFEST", "artifact manifest requirements must use canonical strings");
  }
  if (currentManifest && !deepEqual(manifestRequirements, packet.requirements)) {
    fail("SCOPE_MISMATCH", "artifact manifest requirements do not match the bound operation packet");
  }
  if (manifest.operation_id !== operation.id) fail("INVALID_ARTIFACT_MANIFEST", "manifest operation_id does not match");
  if (manifest.route !== expectedArtifactRoute(actor)) fail("INVALID_ARTIFACT_MANIFEST", "manifest route does not match the active worker");
  if (!deepEqual(manifest.scope_ref ?? null, operation.scope_ref ?? null)) fail("INVALID_ARTIFACT_MANIFEST", "manifest scope_ref does not match");
  if (actor === "causal_discovery") {
    if (
      operation.discovery_scope === null
      || !deepEqual(manifest.discovery_contract, operation.discovery_scope.contract)
    ) {
      fail("INVALID_ARTIFACT_MANIFEST", "manifest discovery_contract does not match the frozen scope");
    }
  } else if (manifest.discovery_contract !== undefined) {
    fail("INVALID_ARTIFACT_MANIFEST", "only causal_discovery manifests may contain discovery_contract");
  }
  if (!isTimestamp(manifest.completed_at)) fail("INVALID_ARTIFACT_MANIFEST", "manifest completed_at must be RFC3339 UTC");
  if (typeof manifest.summary !== "string" || !manifest.summary.trim()) fail("INVALID_ARTIFACT_MANIFEST", "manifest summary must be nonempty");
  assertArray(manifest.files, "artifact manifest.files", "INVALID_ARTIFACT_MANIFEST");
  if (!manifest.files.length || manifest.files.some((item) => typeof item !== "string" || !item.trim())) {
    fail("INVALID_ARTIFACT_MANIFEST", "manifest files must contain at least one project-relative path");
  }
  const normalizedManifestFiles = manifest.files.map(normalizePath);
  if (new Set(normalizedManifestFiles).size !== normalizedManifestFiles.length) {
    fail("INVALID_ARTIFACT_MANIFEST", "manifest files must not contain duplicates");
  }
  if (!deepEqual([...normalizedManifestFiles].sort(), [...actualFiles].sort())) {
    fail(
      "INVALID_ARTIFACT_MANIFEST",
      "manifest files must exactly match the reserved artifact inventory",
    );
  }
  const normalizedLocation = normalizePath(intent.location);
  let includesPrimary = false;
  let includesDeliverable = false;
  for (const normalized of normalizedManifestFiles) {
    const resolved = resolveOutputPath(projectRoot, normalized);
    const fileStat = lstatRequiredArtifact(
      resolved,
      `manifest file does not exist: ${normalized}`,
      `could not inspect manifest file ${normalized}`,
    );
    if (!fileStat.isFile()) {
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
  validateReceiptAgainstPacket(executionReceipt, packet, artifactRole, normalizedManifestFiles);
  if (expectedArtifact !== null) {
    if (
      artifactRole !== expectedArtifact.artifact_role
      || !deepEqual(executionReceipt, expectedArtifact.execution_receipt)
    ) {
      fail("INVALID_ARTIFACT_RECEIPT", "artifact role and receipt must match the frozen completion manifest");
    }
    if (manifest.summary.trim() !== expectedArtifact.summary) {
      fail("INVALID_ARTIFACT_MANIFEST", "artifact summary must match the completion manifest summary");
    }
  }
  return {
    target, manifestPath, manifest, artifact_role: artifactRole, execution_receipt: executionReceipt,
  };
}

function validateArtifactBody(projectRoot, operation, artifactPath, temporary = false) {
  const intent = operation.artifact_intent;
  const stat = lstatRequiredArtifact(
    artifactPath,
    "reserved artifact does not exist",
    "could not inspect reserved artifact",
  );
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
      failArtifactFsError(
        error,
        "reserved directory artifact does not exist",
        "could not inspect reserved directory artifact",
      );
    }
    for (const entry of entries) {
      const relative = relativeDirectory ? path.join(relativeDirectory, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      if (
        relativeDirectory === ""
        && entry.name.startsWith(".artifact-manifest.json.tmp-")
      ) {
        fail("INVALID_ARTIFACT_PATH", "reserved artifact contains a controller-owned manifest temporary file");
      }
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

function generatedManifest(operation, actor, files, artifact, packet) {
  const usesLegacyReceipt = operation.completion_protocol === 1
    && artifact.execution_receipt !== null
    && !Object.prototype.hasOwnProperty.call(
      artifact.execution_receipt,
      "requirement_evidence",
    );
  const schemaVersion = usesLegacyReceipt ? RECEIPT_MANIFEST_VERSION : MANIFEST_VERSION;
  return {
    schema_version: schemaVersion,
    operation_id: operation.id,
    route: expectedArtifactRoute(actor),
    scope_ref: operation.scope_ref ?? null,
    artifact_role: artifact.artifact_role,
    execution_receipt: clone(artifact.execution_receipt),
    files,
    completed_at: nowIso(),
    summary: artifact.summary,
    ...(schemaVersion === MANIFEST_VERSION
      ? { requirements: clone(packet.requirements) }
      : {}),
    ...(actor === "causal_discovery"
      ? { discovery_contract: clone(operation.discovery_scope.contract) }
      : {}),
  };
}

function artifactSummary(artifactInput) {
  if (!isObject(artifactInput)) fail("INVALID_INPUT", "artifact input must be a mapping");
  if (typeof artifactInput.summary !== "string" || !artifactInput.summary.trim()) {
    fail("INVALID_INPUT", "artifact summary must be nonempty");
  }
  return artifactInput.summary.trim();
}

function normalizeArtifactInput(artifactInput, packet) {
  assertKnownKeys(
    artifactInput,
    new Set(["summary", "artifact_role", "execution_receipt"]),
    "artifact input",
    "INVALID_INPUT",
  );
  const artifactRole = Object.prototype.hasOwnProperty.call(artifactInput, "artifact_role")
    ? artifactInput.artifact_role
    : "completion";
  assertEnum(artifactRole, ARTIFACT_ROLES, "artifact.artifact_role", "INVALID_INPUT");
  const receipt = artifactInput.execution_receipt === undefined || artifactInput.execution_receipt === null
    ? null
    : normalizeExecutionReceipt(artifactInput.execution_receipt);
  return {
    summary: artifactSummary(artifactInput),
    artifact_role: artifactRole,

    execution_receipt: receipt,
  };
}
function publishReservedArtifact(projectRoot, operation, actor, artifact, packet) {
  const intent = operation.artifact_intent;
  if (!intent) fail("MISSING_ARTIFACT", "no artifact is reserved for this operation");
  const target = resolveOutputPath(projectRoot, intent.location);
  const temporaryLocation = temporaryArtifactLocation(intent, operation.id);
  const temporary = resolveOutputPath(projectRoot, temporaryLocation);
  const manifestPath = manifestPathFor(target, intent.kind);
  const artifactStatus = inspectReservedArtifact(projectRoot, operation, actor, packet);

  if (artifactStatus.location_state === "collision") {
    fail("ARTIFACT_COLLISION", "the reserved artifact locations are in conflict");
  }
  if (artifactStatus.location_state === "absent") {
    fail("MISSING_ARTIFACT", `reserved temporary artifact does not exist: ${temporaryLocation}`);
  }
  if (artifactStatus.location_state === "complete") {
    return validateManifest(projectRoot, operation, actor, packet, artifact);
  }
  if (artifactStatus.location_state === "invalid") {
    if (artifactEntryExists(manifestPath)) {
      validateManifest(projectRoot, operation, actor, packet, artifact);
    }
    validateArtifactBody(projectRoot, operation, target);
    fail(artifactStatus.reason_code, "reserved artifact is invalid");
  }

  if (artifactStatus.location_state === "final-awaiting-manifest") {
    const files = validateArtifactBody(projectRoot, operation, target);
    validateReceiptAgainstPacket(artifact.execution_receipt, packet, artifact.artifact_role, files);
    atomicWrite(
      manifestPath,
      `${JSON.stringify(generatedManifest(operation, actor, files, artifact, packet), null, 2)}\n`,
      intent.kind === "directory" ? path.dirname(target) : null,
    );
  } else if (artifactStatus.location_state === "temp-only") {
    const files = validateArtifactBody(projectRoot, operation, temporary, true);
    validateReceiptAgainstPacket(artifact.execution_receipt, packet, artifact.artifact_role, files);
    const manifest = generatedManifest(operation, actor, files, artifact, packet);
    try {
      fs.renameSync(temporary, target);
    } catch (error) {
      if (isMissingArtifactFsError(error)) {
        fail("MISSING_ARTIFACT", `reserved temporary artifact does not exist: ${temporaryLocation}`);
      }
      fail("IO_ERROR", `could not publish reserved artifact: ${error.message}`);
    }
    atomicWrite(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      intent.kind === "directory" ? path.dirname(target) : null,
    );
  } else {
    fail("INTERNAL_ERROR", `unsupported artifact location state: ${artifactStatus.location_state}`);
  }

  return validateManifest(projectRoot, operation, actor, packet, artifact);
}

function artifactEntryExists(filePath) {
  try {
    fs.lstatSync(filePath);
    return true;
  } catch (error) {
    if (isMissingArtifactFsError(error)) return false;
    fail("IO_ERROR", `could not inspect reserved artifact path: ${error.message}`);
  }
}

function inspectReservedArtifact(projectRoot, operation, actor, packet) {
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
  const describe = (locationState, reasonCode = null, details = {}) => ({
    status: locationState === "complete" ? "complete" : "incomplete",
    location_state: locationState,
    ...base,
    ...(reasonCode === null ? {} : { reason_code: reasonCode }),
    ...details,
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
    const completed = validateManifest(projectRoot, operation, actor, packet);
    return describe("complete", null, {
      artifact_role: completed.artifact_role,
      execution_receipt: completed.execution_receipt,
    });
  } catch (error) {
    if (
      error instanceof StateError
      && [
        "MISSING_ARTIFACT",
        "INVALID_ARTIFACT_MANIFEST",
        "INVALID_ARTIFACT_PATH",
        "INVALID_ARTIFACT_RECEIPT",
        "INCOMPLETE_WORK",
        "SCOPE_MISMATCH",
      ].includes(error.code)
    ) {
      return describe("invalid", error.code);
    }
    throw error;
  }
}

function assertCleanArtifactReservation(artifactStatus) {
  if (artifactStatus.location_state === "absent") return;
  if (
    artifactStatus.location_state === "invalid"
    && artifactStatus.reason_code === "INVALID_ARTIFACT_PATH"
  ) {
    fail("INVALID_ARTIFACT_PATH", "the reserved artifact path is invalid");
  }
  fail("ARTIFACT_COLLISION", `the reserved artifact locations are not empty: ${artifactStatus.location_state}`);
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
  if (section === "discovery_sidecar") {
    rejectControllerFields(patch, "updates.discovery_sidecar", ["scope_id", "scope_revision", "execution_contract"]);
  }
}

function validateChamberPatch(patch, route, analysis = false) {
  const allowed = analysis ? ANALYSIS_CHAMBER_KEYS : CHAMBER_KEYS;
  assertKnownKeys(patch, allowed, `updates.council_chamber.${route}`, "OWNERSHIP_VIOLATION");
  rejectControllerFields(patch, `updates.council_chamber.${route}`);
  if (analysis) rejectControllerFields(
    patch,
    `updates.council_chamber.${route}`,
    ["scope_id", "scope_revision", "causal_basis_hash"],
  );
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

function applyScopeTransition(state, operation, actor, updates, transition, artifactRole) {
  const isAnalysis = actor.startsWith("analysis_execution.");
  const isReport = actor === "report_writer";
  const hasArtifact = artifactRole !== null;
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
  let submittedAnalysisContract;
  if (isAnalysis && Object.prototype.hasOwnProperty.call(patch, "execution_contract")) {
    submittedAnalysisContract = patch.execution_contract === null
      ? null
      : normalizeAnalysisContract(
        patch.execution_contract,
        `updates.council_chamber.${actor}.execution_contract`,
      );
    patch.execution_contract = submittedAnalysisContract;
  }
  const submittedReportEvidence = isReport
    && Object.prototype.hasOwnProperty.call(patch, "analysis_artifact_ids");
  if (submittedReportEvidence) {
    patch.analysis_artifact_ids = normalizeAnalysisArtifactIds(
      patch.analysis_artifact_ids,
      "updates.report_assembly.analysis_artifact_ids",
    );
  }
  const nextReportStatus = isReport
    && updates.council_chamber
    && updates.council_chamber.report_writer
    ? updates.council_chamber.report_writer.current_status
    : undefined;
  if (
    isReport
    && ["new", "revise"].includes(transition)
    && nextReportStatus === "ready"
    && !submittedReportEvidence
  ) {
    fail(
      "INVALID_INPUT",
      "new or revised ready report scope requires explicit analysis_artifact_ids; use [] for an intentional planning report",
    );
  }
  const hasCurrentIdentity = isUuid(current.scope_id)
    && Number.isInteger(current.scope_revision)
    && current.scope_revision >= 1;
  if (isAnalysis && hasCurrentIdentity && transition === "preserve" && current.support !== patch.support) {
    fail("SCOPE_MISMATCH", "changing analysis support requires scope_transition new or revise");
  }
  if (isReport && hasCurrentIdentity && transition === "preserve") {
    const changed = REPORT_SCOPE_MATERIAL_FIELDS.filter((field) => (
      Object.prototype.hasOwnProperty.call(patch, field)
      && !deepEqual(patch[field], current[field])
    ));
    if (changed.length) {
      fail(
        "SCOPE_MISMATCH",
        `changing preserved report scope fields requires scope_transition new or revise: ${changed.join(", ")}`,
      );
    }
    patch.analysis_artifact_ids = clone(current.analysis_artifact_ids);
  }
  if (operation.scope_ref !== null) {
    if (current.scope_id !== operation.scope_ref.id || current.scope_revision !== operation.scope_ref.revision) {
      fail("SCOPE_MISMATCH", "the approved scope changed before worker apply");
    }
    if (transition !== "preserve") {
      const nextStatus = isAnalysis
        ? patch.current_status
        : nextReportStatus;
      if (hasArtifact || nextStatus === "done") {
        fail("SCOPE_MISMATCH", "output creation must preserve the exact approved scope");
      }
      if (!["ready", "blocked"].includes(nextStatus)) {
        fail("SCOPE_MISMATCH", "a material scope change must return a ready or blocked handoff without output");
      }
    }
  }
  if (isAnalysis) {
    if (transition === "preserve") {
      if (
        submittedAnalysisContract !== undefined
        && !deepEqual(submittedAnalysisContract, current.execution_contract)
      ) {
        fail("SCOPE_MISMATCH", "preserved analysis execution_contract must match the approved scope");
      }
      patch.execution_contract = clone(current.execution_contract);
      patch.causal_basis_hash = current.causal_basis_hash;
    } else if (patch.current_status === "ready" && submittedAnalysisContract === undefined) {
      fail("INVALID_INPUT", "new or revised ready analysis scope requires execution_contract");
    } else if (submittedAnalysisContract === undefined) {
      patch.execution_contract = null;
    }
    if (transition !== "preserve") {
      patch.causal_basis_hash = analysisCausalBasisHash(state);
    }
  }
  if (
    isReport
    && artifactRole === "infeasibility_evidence"
    && transition === "preserve"
    && Object.prototype.hasOwnProperty.call(patch, "current_format")
    && patch.current_format !== current.current_format
  ) {
    fail("SCOPE_MISMATCH", "report infeasibility evidence cannot change the approved report format");
  }
  if (
    isReport
    && transition !== "preserve"
    && (
      transition === "new"
      || submittedReportEvidence
      || current.analysis_artifact_ids !== null
    )
  ) {
    operation.report_evidence_binding_protocol = 1;
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
    execution_contract: null,
    causal_basis_hash: null,
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
    claim_boundary: null,
    planned_structure: [],
    key_points: [],
    wording_constraints: [],
    analysis_artifact_ids: [],
    draft_notes: [],
  };
}

function emptyDiscoverySidecar() {
  return {
    last_updated: null,
    scope_id: null,
    scope_revision: 0,
    execution_contract: null,
    status: "not_started",
    goal: null,
    scope: null,
    method_summary: null,
    findings: [],
    diagnostics: [],
    limitations: [],
    artifact_refs: [],
    reviewer_requests: [],
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

function applyDiscoveryHandoff(state, operation, actor, updates, artifactRole) {
  if (actor !== "causal_discovery") return;
  const hasArtifact = artifactRole !== null;
  const snapshot = operation.discovery_scope;
  const patch = updates.discovery_sidecar;
  const currentBound = isUuid(state.discovery_sidecar.scope_id)
    && Number.isInteger(state.discovery_sidecar.scope_revision)
    && state.discovery_sidecar.scope_revision >= 1
    && state.discovery_sidecar.execution_contract !== null;
  const chamberPatch = updates.council_chamber.causal_discovery;
  const legacyUncontractedReservation = snapshot === null
    && operation.scope_ref === null
    && operation.artifact_intent !== null;

  if (!patch) {
    if (legacyUncontractedReservation) {
      if (chamberPatch.current_status !== "blocked") {
        fail("SCOPE_MISMATCH", "an uncontracted legacy discovery reservation must close as chamber-only blocked");
      }
      return;
    }
    if (snapshot !== null || !currentBound) {
      fail("INVALID_INPUT", "causal_discovery apply requires a discovery_sidecar update");
    }
    if (!["reviewed", "blocked"].includes(chamberPatch.current_status)) {
      fail("SCOPE_MISMATCH", "an unbound discovery handoff against a current scope must be chamber-only reviewed or blocked");
    }
    return;
  }
  if (legacyUncontractedReservation) {
    fail("SCOPE_MISMATCH", "an uncontracted legacy discovery reservation cannot alter the durable sidecar");
  }
  if (snapshot === null && currentBound) {
    fail("SCOPE_MISMATCH", "unbound discovery work cannot alter the current bound sidecar");
  }
  if (!Object.prototype.hasOwnProperty.call(patch, "status")) {
    fail("INVALID_INPUT", "causal_discovery apply requires discovery_sidecar.status");
  }
  assertEnum(
    patch.status,
    ["scoped", "artifact_created", "reviewed", "blocked"],
    "updates.discovery_sidecar.status",
    "INVALID_INPUT",
  );

  const hasReservation = operation.artifact_intent !== null;
  if (hasArtifact) {
    if (snapshot === null || operation.scope_ref === null) {
      fail("SCOPE_MISMATCH", "a discovery artifact requires a frozen discovery scope");
    }
    const requiredStatus = artifactRole === "completion" ? "artifact_created" : "blocked";
    if (patch.status !== requiredStatus || chamberPatch.current_status !== requiredStatus) {
      fail(
        "SCOPE_MISMATCH",
        `a discovery ${artifactRole} artifact requires sidecar and chamber status ${requiredStatus}`,
      );
    }
  } else if (patch.status === "artifact_created") {
    fail("SCOPE_MISMATCH", "status artifact_created requires a completed discovery artifact");
  }
  if (hasReservation && !hasArtifact && patch.status !== "blocked") {
    fail("SCOPE_MISMATCH", "a reserved discovery run must publish its artifact or return blocked");
  }
  if (
    !hasReservation
    && snapshot !== null
    && snapshot.transition === "preserve"
    && !["reviewed", "blocked"].includes(patch.status)
  ) {
    fail("SCOPE_MISMATCH", "an exact-scope discovery handoff without output must be reviewed or blocked");
  }
  if (
    !hasReservation
    && snapshot !== null
    && ["new", "revise"].includes(snapshot.transition)
    && !["scoped", "blocked"].includes(patch.status)
  ) {
    fail("SCOPE_MISMATCH", "a no-output new or revised discovery handoff must be scoped or blocked");
  }
  if (patch.status === "scoped" && snapshot === null) {
    fail("SCOPE_MISMATCH", "status scoped requires a complete discovery contract");
  }

  if (snapshot !== null) {
    if (["new", "revise"].includes(snapshot.transition)) {
      state.discovery_sidecar = emptyDiscoverySidecar();
      state.council_chamber.causal_discovery = emptyChamberSlot();
    }
    patch.scope_id = operation.scope_ref.id;
    patch.scope_revision = operation.scope_ref.revision;
    patch.execution_contract = clone(snapshot.contract);
  }
  if (hasArtifact) {
    const refs = [
      ...state.discovery_sidecar.artifact_refs,
      ...(patch.artifact_refs ?? []),
      operation.artifact_intent.location,
    ];
    patch.artifact_refs = [...new Set(refs)];
  }
}

function validateScopeCompletion(state, actor, updates, artifactRole) {
  const isAnalysis = actor.startsWith("analysis_execution.");
  const isReport = actor === "report_writer";
  if (!isAnalysis && !isReport) return;
  const status = isAnalysis
    ? state.council_chamber.analysis_execution[actor.slice("analysis_execution.".length)].current_status
    : state.council_chamber.report_writer.current_status;
  if (artifactRole === null) {
    if (status === "done") {
      fail("SCOPE_MISMATCH", `${actor} current_status done requires a completion artifact`);
    }
    return;
  }
  const requiredStatus = artifactRole === "completion" ? "done" : "blocked";
  if (status !== requiredStatus) {
    fail(
      "SCOPE_MISMATCH",
      `${actor} ${artifactRole} artifact requires current_status ${requiredStatus}`,
    );
  }
  if (isReport) {
    const chamberPatch = updates.council_chamber && updates.council_chamber.report_writer;
    if (!chamberPatch || chamberPatch.current_status !== requiredStatus) {
      fail("SCOPE_MISMATCH", `report output requires an explicit transition to ${requiredStatus}`);
    }
    if (artifactRole === "completion") {
      assertReportScopeStructureComplete(state.report_assembly);
      if (state.report_assembly.current_format !== "html") {
        fail("SCOPE_MISMATCH", "report completion requires report_assembly.current_format html");
      }
    }
  }
}

function validateCausalCheckReadiness(state, actor, updates, previousState = null) {
  if (actor !== "causal_check") return;

  const patch = updates.causal_facts || {};
  const decisionFields = [
    "analysis_readiness",
    "support_status",
    "recommended_checks",
    "recommended_method_routes",
    "analysis_options",
  ];
  const reassessmentTriggers = [
    "causal_checked",
    "causal_question",
    "exposure_or_intervention",
    "outcome",
    "estimand",
    "assumptions",
    "threats",
    ...decisionFields,
  ];
  const reassessed = reassessmentTriggers.some((field) => Object.hasOwn(patch, field));
  if (!reassessed) return;

  const missing = decisionFields.filter((field) => !Object.hasOwn(patch, field));
  if (missing.length) {
    fail("INVALID_INPUT", `causal_check readiness reassessment requires the complete decision bundle; missing: ${missing.join(", ")}`);
  }

  const readiness = state.causal_facts.analysis_readiness;
  const recommendations = state.causal_facts.recommended_method_routes;
  const analysisOptions = state.causal_facts.analysis_options;
  assertEnum(readiness, ["ready", "limited", "not_ready", "blocked"], "causal_facts.analysis_readiness", "INVALID_INPUT");
  assertStringOrNull(state.causal_facts.support_status, "causal_facts.support_status", "INVALID_INPUT");
  assertStringArray(state.causal_facts.recommended_checks, "causal_facts.recommended_checks", "INVALID_INPUT");
  assertArray(recommendations, "causal_facts.recommended_method_routes", "INVALID_INPUT");
  assertArray(analysisOptions, "causal_facts.analysis_options", "INVALID_INPUT");
  recommendations.forEach((route, index) => assertObject(
    route,
    `causal_facts.recommended_method_routes[${index}]`,
    "INVALID_INPUT",
  ));
  const designRoutes = recommendations.filter((route) => route.category === "design");
  const supportRoutes = recommendations.filter((route) => route.category === "support");
  const preferredOptions = analysisOptions.filter((option) => option.role === "preferred");
  const targetFields = [
    "causal_question",
    "exposure_or_intervention",
    "outcome",
    "estimand",
  ];
  const targetChanged = previousState !== null && targetFields.some((field) => (
    Object.hasOwn(patch, field)
    && !deepEqual(previousState.causal_facts[field], state.causal_facts[field])
  ));
  if (
    targetChanged
    && (
      previousState.causal_facts.analysis_options.length > 0
      || previousState.causal_facts.recommended_method_routes.length > 0
    )
    && deepEqual(analysisOptions, previousState.causal_facts.analysis_options)
    && deepEqual(recommendations, previousState.causal_facts.recommended_method_routes)
  ) {
    fail(
      "INVALID_INPUT",
      "a changed causal target requires a rebuilt or cleared strategy portfolio",
    );
  }
  if (["ready", "limited"].includes(readiness) && designRoutes.length !== 1) {
    fail("INVALID_INPUT", "causal_check apply with analysis_readiness ready or limited requires one recommended design route");
  }
  if (["ready", "limited"].includes(readiness)) {
    if (preferredOptions.length !== 1) {
      fail("INVALID_INPUT", "causal_check apply with analysis_readiness ready or limited requires exactly one preferred analysis option");
    }
    const preferred = preferredOptions[0];
    const expectedSupport = supportRoutes[0]?.id ?? null;
    if (preferred.design !== designRoutes[0].id || (preferred.support ?? null) !== expectedSupport) {
      fail("INVALID_INPUT", "the preferred analysis option must mirror the recommended design and support routes");
    }
  }
  if (["not_ready", "blocked"].includes(readiness) && recommendations.length) {
    fail("INVALID_INPUT", "causal_check apply with analysis_readiness not_ready or blocked requires empty method recommendations");
  }
  if (["not_ready", "blocked"].includes(readiness) && preferredOptions.length) {
    fail(
      "INVALID_INPUT",
      "causal_check apply with analysis_readiness not_ready or blocked cannot name a preferred analysis option",
    );
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

function normalizeCompletedHandoff(updates, actor, artifact) {
  if (artifact === null || artifact.artifact_role !== "completion") return;
  const summary = artifact.summary;
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

function appendArtifactRecord(state, projectRoot, operation, actor, artifact, packet) {
  const summary = artifact.summary;
  const { manifest, artifact_role: artifactRole } = validateManifest(projectRoot, operation, actor, packet, artifact);
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
    artifact_role: artifactRole,
  };
  if (actor.startsWith("analysis_execution.")) {
    record.design = planInfo.design;
    record.support = planInfo.support;
  }
  state.artifact_records.push(record);
  return record;
}

function applyWorker({
  projectRoot,
  payload,
  contextProtocol = null,
}) {
  const { statePath, state } = loadCurrentState(projectRoot);
  assertExpected(state, payload);
  const allowedInput = new Set([
    "expected_project_id",
    "expected_revision",
    "operation_id",
    "actor",
    "updates",
    "scope_transition",
    "discovery_scope",
    "artifact",
  ]);
  assertKnownKeys(payload, allowedInput, "apply input", "INVALID_INPUT");
  const selectedContextProtocol = normalizeContextProtocol(
    contextProtocol,
    "apply context protocol",
  );
  const operation = assertOperation(state, payload, "worker_pending");
  const planInfo = validatePlan(state.next_step_plan);
  if (payload.actor !== planInfo.actor) fail("PLAN_MISMATCH", `apply actor must be ${planInfo.actor}`);
  const previousPacket = operationPacket(state, operation, planInfo);
  validateOwnedUpdates(payload.actor, payload.updates);
  const updates = clone(payload.updates);
  const hasArtifact = payload.artifact !== undefined && payload.artifact !== null;
  if (payload.actor === "report_writer" && hasArtifact) {
    assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
  }
  if (payload.discovery_scope !== undefined) {
    if (payload.actor !== "causal_discovery") {
      fail("OWNERSHIP_VIOLATION", `${payload.actor} cannot set discovery_scope`);
    }
    if (hasArtifact || operation.artifact_intent !== null) {
      fail(
        "SCOPE_MISMATCH",
        "apply may bind discovery_scope only before output is reserved and without an artifact",
      );
    }
    bindDiscoveryScope(state, operation, payload.discovery_scope, "apply discovery_scope");
  }
  const hadApprovedScope = operation.scope_ref !== null;
  const workerPacket = operationPacket(state, operation, planInfo);
  const artifact = hasArtifact ? normalizeArtifactInput(payload.artifact, workerPacket) : null;
  const artifactRole = artifact === null ? null : artifact.artifact_role;
  if (hasArtifact && operation.artifact_intent !== null) {
    const frozenStatus = inspectReservedArtifact(projectRoot, operation, payload.actor, workerPacket);
    if (frozenStatus.location_state === "complete") {
      validateManifest(projectRoot, operation, payload.actor, workerPacket, artifact);
    } else if (
      frozenStatus.location_state === "invalid"
      && frozenStatus.reason_code === "MISSING_ARTIFACT"
    ) {
      fail("MISSING_ARTIFACT", "the reserved artifact disappeared during validation");
    }
  }


  if (
    hasArtifact
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
    artifactRole,
  );
  resetNewScopeState(state, payload.actor, payload.scope_transition);
  applyDiscoveryHandoff(state, operation, payload.actor, updates, artifactRole);
  normalizeCompletedHandoff(updates, payload.actor, artifact);
  stampWorkerUpdates(updates, payload.actor, nowIso());

  const merged = deepMerge(state, updates);
  const mergedOperation = merged.state_meta.active_operation;
  if (
    !hasArtifact
    && ["new", "revise"].includes(payload.scope_transition)
    && (payload.actor === "report_writer" || payload.actor.startsWith("analysis_execution."))
  ) {
    setOperationProtocol(merged, mergedOperation, planInfo);
  }
  const completionPacket = operationPacket(merged, mergedOperation, planInfo);
  validateCausalCheckReadiness(merged, payload.actor, updates, state);
  validateScopeCompletion(merged, payload.actor, updates, artifactRole);
  if (
    payload.actor === "report_writer"
    && ["ready", "blocked"].includes(
      merged.council_chamber.report_writer.current_status,
    )
    && merged.report_assembly.current_format !== null
  ) {
    fail(
      "INVALID_INPUT",
      "a ready or blocked report handoff requires current_format null until output is completed",
      { current_format: merged.report_assembly.current_format },
    );
  }
  if (
    payload.actor === "report_writer"
    && merged.council_chamber.report_writer.current_status === "ready"
  ) {
    assertReadyReportScopeComplete(merged.report_assembly, "INVALID_INPUT");
    assertBoundReportAnalysisArtifactsAvailable(projectRoot, merged);
  }

  const abandonedLegacyDiscoveryArtifact = (
    payload.actor === "causal_discovery"
    && operation.discovery_scope === null
    && operation.scope_ref === null
    && !hasArtifact
    && updates.council_chamber.causal_discovery.current_status === "blocked"
  );
  let artifactRecord = null;
  if (hasArtifact) {
    if (!operation.artifact_intent) fail("MISSING_ARTIFACT", "artifact output was not reserved");
    if (merged.artifact_records.some((record) => record.operation_id === operation.id)) {
      fail("DUPLICATE_ARTIFACT", "this operation already has an artifact record");
    }
    publishReservedArtifact(projectRoot, mergedOperation, payload.actor, artifact, completionPacket);
    artifactRecord = appendArtifactRecord(
      merged,
      projectRoot,
      mergedOperation,
      payload.actor,
      artifact,
      completionPacket,
    );
  } else if (operation.artifact_intent && !abandonedLegacyDiscoveryArtifact) {
    const artifactStatus = inspectReservedArtifact(projectRoot, mergedOperation, payload.actor, completionPacket);
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
  const leadPacket = operationPacket(merged, merged.state_meta.active_operation, planInfo);
  const artifactStatus = mergedOperation.artifact_intent
    ? inspectReservedArtifact(projectRoot, mergedOperation, payload.actor, leadPacket)
    : null;
  const warnings = artifactWarnings(projectRoot, merged);
  const revision = commitMutation(statePath, merged);
  const context = contextForCurrentStage(
    merged,
    planInfo,
    warnings,
    artifactStatus,
    selectedContextProtocol,
  );
  return {
    ok: true,
    code: "WORKER_APPLIED",
    project_id: merged.state_meta.project_id,
    revision,
    operation_id: operation.id,
    stage: "lead_pending",
    artifact_record: artifactRecord,
    ...operationPacketResult(previousPacket, leadPacket),
    ...context,
  };
}

function deriveSummaryAggregates(state) {
  const hasArtifact = (route) => state.artifact_records.some(
    (record) => record.route === route && record.artifact_role === "completion",
  );
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

function plannedScopeStatus(state) {
  const actor = validatePlan(state.next_step_plan).actor;
  return actor && actor.startsWith("analysis_execution.")
    ? state.council_chamber.analysis_execution[actor.slice("analysis_execution.".length)].current_status
    : actor === "report_writer"
      ? state.council_chamber.report_writer.current_status
      : null;
}

function rejectReadyScopeSummaryUpdate(state, updates) {
  if (
    !updates.project_summary
    || !Object.prototype.hasOwnProperty.call(updates.project_summary, "exploration_summary")
  ) return;
  if (
    plannedScopeStatus(state) === "ready"
    && !deepEqual(updates.project_summary.exploration_summary, state.project_summary.exploration_summary)
  ) {
    fail(
      "OWNERSHIP_VIOLATION",
      "a ready analysis or report scope remains route-owned and cannot update project_summary.exploration_summary",
    );
  }
}

function rejectReadyScopeMenu(state, presentation, cancel) {
  if (presentation.options.some((option) => (
    option.assignment.scope_ref !== null
    && ["analysis", "report"].includes(option.assignment.scope_ref.kind)
  ))) {
    fail("INVALID_INPUT", "an exact ready analysis or report scope requires direct approval, not a numbered option");
  }
  const planInfo = validatePlan(state.next_step_plan);
  const unresolvedReportRepair = planInfo.actor === "report_writer"
    && state.report_assembly.analysis_artifact_ids === null;
  if (cancel || plannedScopeStatus(state) !== "ready" || unresolvedReportRepair) return;
  if (planInfo.actor === "report_writer") {
    assertReadyReportScopeComplete(state.report_assembly);
  }
  if (presentation.options.length > 0 || presentation.direct_assignment === null) {
    fail(
      "INVALID_INPUT",
      "a ready analysis or report handoff must persist one direct approval assignment without options",
    );
  }
  const expectedRoute = planInfo.actor;
  const expectedScope = state.state_meta.active_operation.scope_ref;
  if (
    presentation.direct_assignment.route !== expectedRoute
    || presentation.direct_assignment.support !== planInfo.support
    || !deepEqual(presentation.direct_assignment.scope_ref, expectedScope)
  ) {
    fail("INVALID_INPUT", "direct approval assignment must bind the exact ready scope and support");
  }
}

function normalizePresentation(state, presentation) {
  const fields = [
    "confirmation",
    "framing",
    "options",
    "boundary",
    "next_steps",
    "direct_assignment",
  ];
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
  const framing = normalizeResponseText(
    presentation.framing,
    "finish presentation.framing",
    false,
    MAX_RESPONSE_FRAMING_LENGTH,
  );
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
  const directAssignment = presentation.direct_assignment === undefined
    || presentation.direct_assignment === null
    ? null
    : normalizeAssignment(
      state,
      presentation.direct_assignment,
      "finish presentation.direct_assignment",
    ).assignment;
  if (options.length > 0 && directAssignment !== null) {
    fail("INVALID_INPUT", "finish presentation cannot contain both options and a direct_assignment");
  }

  return {
    confirmation,
    framing,
    options,
    boundary,
    next_steps: options.length ? MENU_NEXT_STEPS : suppliedNextSteps,
    direct_assignment: directAssignment,
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

function currentOperationQuestionTexts(state, planInfo) {
  if (planInfo.actor === "team_lead") return null;
  let slot;
  if (planInfo.actor.startsWith("analysis_execution.")) {
    const design = planInfo.actor.slice("analysis_execution.".length);
    slot = state.council_chamber.analysis_execution[design];
  } else {
    slot = state.council_chamber[planInfo.actor];
  }
  if (slot === undefined) return new Set();
  return new Set(
    slot.questions_for_user
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function carriedQuestionById(questions, questionId, label) {
  const entry = questions.find((item) => item.question_id === questionId);
  if (!entry) fail("INVALID_INPUT", label + " does not identify a carried question");
  if (entry.status !== "open") {
    fail("INVALID_INPUT", label + " identifies a retired carried question");
  }
  return entry;
}

function normalizeQuestionResolution(value, label) {
  assertKnownKeys(value, new Set(["kind", "note"]), label, "INVALID_INPUT");
  for (const key of ["kind", "note"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      fail("INVALID_INPUT", label + "." + key + " is required");
    }
  }
  assertEnum(value.kind, CARRIED_QUESTION_RESOLUTION_KINDS, label + ".kind", "INVALID_INPUT");
  const note = normalizeRequiredString(value.note, label + ".note", "INVALID_INPUT");
  validateCarriedQuestionText(note, label + ".note", "INVALID_INPUT");
  return { kind: value.kind, note };
}

function surfaceCarriedQuestion(entry, presentation, revision, label) {
  const location = presentation.options.length ? "framing" : "next_steps";
  if (!presentation[location].includes(entry.question)) {
    fail(
      "INVALID_INPUT",
      label + " must place the canonical question text in presentation." + location,
    );
  }
  if (entry.first_surfaced_revision === null) {
    entry.first_surfaced_revision = revision;
  }
}

function applyQuestionActions({
  target,
  sourceState,
  planInfo,
  operation,
  actions,
  presentation,
}) {
  assertArray(actions, "finish question_actions", "INVALID_INPUT");
  if (actions.length > MAX_CARRIED_QUESTION_ACTIONS) {
    fail(
      "INVALID_INPUT",
      "finish question_actions may contain at most " + MAX_CARRIED_QUESTION_ACTIONS + " entries",
    );
  }
  if (actions.length === 0) return;
  const sourceTexts = currentOperationQuestionTexts(sourceState, planInfo);
  const revision = sourceState.state_meta.revision + 1;
  const targetedIds = new Set();
  let surfacedCount = 0;

  actions.forEach((action, index) => {
    const label = "finish question_actions[" + index + "]";
    assertObject(action, label, "INVALID_INPUT");
    if (action.action === "record") {
      assertKnownKeys(
        action,
        new Set(["action", "question_id", "source_text", "surface"]),
        label,
        "INVALID_INPUT",
      );
      for (const key of ["question_id", "source_text", "surface"]) {
        if (!Object.prototype.hasOwnProperty.call(action, key)) {
          fail("INVALID_INPUT", label + "." + key + " is required");
        }
      }
      if (action.question_id !== null && !isUuid(action.question_id)) {
        fail("INVALID_INPUT", label + ".question_id must be a UUID or null");
      }
      if (typeof action.surface !== "boolean") {
        fail("INVALID_INPUT", label + ".surface must be boolean");
      }
      const sourceText = normalizeRequiredString(
        action.source_text,
        label + ".source_text",
        "INVALID_INPUT",
      );
      validateCarriedQuestionText(sourceText, label + ".source_text", "INVALID_INPUT");
      const sourceFromHandoff = sourceTexts !== null && sourceTexts.has(sourceText);
      const sourceActor = sourceFromHandoff ? planInfo.actor : "team_lead";
      const sourceKind = sourceFromHandoff ? "handoff" : "synthesized";

      let entry;
      if (action.question_id === null) {
        if (target.carried_questions.length >= MAX_CARRIED_QUESTIONS) {
          fail("INVALID_INPUT", "carried_questions has reached its maximum size");
        }
        const questionKey = canonicalQuestionKey(sourceText);
        if (target.carried_questions.some(
          (item) => canonicalQuestionKey(item.question) === questionKey,
        )) {
          fail(
            "INVALID_INPUT",
            label + ".source_text already has a carried-question identity",
          );
        }
        const source = {
          actor: sourceActor,
          operation_id: operation.id,
          revision,
          source_kind: sourceKind,
          source_text: sourceText,
        };
        entry = {
          question_id: crypto.randomUUID(),
          question: sourceText,
          first_source: source,
          last_source: clone(source),
          source_operation_count: 1,
          status: "open",
          first_surfaced_revision: null,
          retired_revision: null,
          resolution: null,
        };
        target.carried_questions.push(entry);
      } else {
        if (targetedIds.has(action.question_id)) {
          fail("INVALID_INPUT", label + ".question_id is targeted more than once");
        }
        targetedIds.add(action.question_id);
        entry = carriedQuestionById(
          target.carried_questions,
          action.question_id,
          label + ".question_id",
        );
        if (entry.last_source.operation_id !== operation.id) {
          entry.last_source = {
            actor: sourceActor,
            operation_id: operation.id,
            revision,
            source_kind: sourceKind,
            source_text: sourceText,
          };
          entry.source_operation_count += 1;
        }
      }
      if (action.surface) {
        surfacedCount += 1;
        if (surfacedCount > 1) {
          fail("INVALID_INPUT", "finish may surface at most one carried question");
        }
        surfaceCarriedQuestion(entry, presentation, revision, label);
      }
      return;
    }

    if (action.action === "surface") {
      assertKnownKeys(
        action,
        new Set(["action", "question_id"]),
        label,
        "INVALID_INPUT",
      );
      if (!isUuid(action.question_id)) {
        fail("INVALID_INPUT", label + ".question_id must be a UUID");
      }
      if (targetedIds.has(action.question_id)) {
        fail("INVALID_INPUT", label + ".question_id is targeted more than once");
      }
      targetedIds.add(action.question_id);
      const entry = carriedQuestionById(
        target.carried_questions,
        action.question_id,
        label + ".question_id",
      );
      surfacedCount += 1;
      if (surfacedCount > 1) {
        fail("INVALID_INPUT", "finish may surface at most one carried question");
      }
      surfaceCarriedQuestion(entry, presentation, revision, label);
      return;
    }

    if (action.action === "retire") {
      assertKnownKeys(
        action,
        new Set(["action", "question_id", "resolution"]),
        label,
        "INVALID_INPUT",
      );
      if (!isUuid(action.question_id)) {
        fail("INVALID_INPUT", label + ".question_id must be a UUID");
      }
      if (!Object.prototype.hasOwnProperty.call(action, "resolution")) {
        fail("INVALID_INPUT", label + ".resolution is required");
      }
      if (targetedIds.has(action.question_id)) {
        fail("INVALID_INPUT", label + ".question_id is targeted more than once");
      }
      targetedIds.add(action.question_id);
      const entry = carriedQuestionById(
        target.carried_questions,
        action.question_id,
        label + ".question_id",
      );
      entry.status = "retired";
      entry.retired_revision = revision;
      entry.resolution = normalizeQuestionResolution(
        action.resolution,
        label + ".resolution",
      );
      return;
    }

    fail("INVALID_INPUT", label + ".action must be one of: record, surface, retire");
  });
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
    "question_actions",
  ]);
  assertKnownKeys(payload, allowedInput, "finish input", "INVALID_INPUT");
  const operation = assertOperation(state, payload, cancel ? null : "lead_pending");
  const planInfo = validatePlan(state.next_step_plan);
  if (
    !cancel
    && planInfo.actor === "report_writer"
    && operation.report_evidence_binding_protocol === 1
  ) {
    assertBoundReportAnalysisArtifactsAvailable(projectRoot, state);
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "presentation")) {
    fail("INVALID_INPUT", "finish input requires presentation");
  }
  const updates = payload.updates ?? {};
  const questionActions = Object.prototype.hasOwnProperty.call(payload, "question_actions")
    ? payload.question_actions
    : [];
  assertObject(updates, "updates", "INVALID_INPUT");
  if (cancel && Object.keys(updates).length > 0) {
    fail("OWNERSHIP_VIOLATION", "finish --cancel preserves durable state and does not accept updates");
  }
  if (cancel && (!Array.isArray(questionActions) || questionActions.length > 0)) {
    fail(
      "OWNERSHIP_VIOLATION",
      "finish --cancel preserves carried questions and does not accept question actions",
    );
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
  rejectReadyScopeMenu(state, presentation, cancel);
  applyQuestionActions({
    target: merged,
    sourceState: state,
    planInfo,
    operation,
    actions: questionActions,
    presentation,
  });
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
    direct_assignment: clone(presentation.direct_assignment),
  };
  const revision = commitMutation(statePath, merged);
  return {
    ok: true,
    code: cancel ? "OPERATION_CANCELLED" : "OPERATION_FINISHED",
    project_id: merged.state_meta.project_id,
    revision,
    operation_id: operation.id,
    mode: "idle",
    operation_packet: null,
    next_action: "emit_response_markdown_verbatim_and_stop",
    pending_decision: merged.pending_decision,
    direct_assignment: clone(merged.response_receipt.direct_assignment),
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
      basis_current: slot.causal_basis_hash !== null
        && slot.causal_basis_hash === analysisCausalBasisHash(state),
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
  const discovery = state.discovery_sidecar.scope_id === null
    ? null
    : {
      scope_id: state.discovery_sidecar.scope_id,
      scope_revision: state.discovery_sidecar.scope_revision,
      status: state.discovery_sidecar.status,
      execution_contract: clone(state.discovery_sidecar.execution_contract),
      last_updated: state.discovery_sidecar.last_updated,
    };
  return { analysis, report, discovery };
}

function responseHeadingBody(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) return null;
  const bodyStart = start + heading.length;
  let bodyEnd = markdown.length;
  for (const candidate of RESPONSE_HEADINGS) {
    if (candidate === heading) continue;
    const index = markdown.indexOf(`\n\n${candidate}`, bodyStart);
    if (index !== -1 && index < bodyEnd) bodyEnd = index;
  }
  let body = markdown.slice(bodyStart, bodyEnd);
  if (body.startsWith("\n")) body = body.slice(1);
  body = body.trimEnd();
  return body || null;
}

function previousResponseCue(receipt) {
  if (receipt === null) return null;
  return {
    operation_id: receipt.operation_id,
    revision: receipt.revision,
    direct_assignment: clone(receipt.direct_assignment),
    consultant_options: responseHeadingBody(receipt.response_markdown, "[+ Consultant Options]"),
    boundary: responseHeadingBody(receipt.response_markdown, "[! Boundary]"),
    next_steps: responseHeadingBody(receipt.response_markdown, "[? Next Steps]"),
  };
}

function carriedQuestionContext(state) {
  return state.carried_questions.map((entry) => (
    entry.status === "open"
      ? {
          question: entry.question,
          status: entry.status,
          source_operation_count: entry.source_operation_count,
          surfaced: entry.first_surfaced_revision !== null,
        }
      : {
          question: entry.question,
          status: entry.status,
          resolution: clone(entry.resolution),
        }
  ));
}

function routerStateProjection(state) {
  return {
    project_summary: clone(state.project_summary),
    carried_questions: carriedQuestionContext(state),
    core_status: {
      data_audit: {
        last_updated: state.data_facts.last_updated,
        data_checked: state.data_facts.data_checked,
        handoff: clone(state.council_chamber.data_audit),
      },
      domain_expert: {
        last_updated: state.domain_knowledge.last_updated,
        domain_checked: state.domain_knowledge.domain_checked,
        handoff: clone(state.council_chamber.domain_expert),
      },
      causal_check: {
        facts: clone(state.causal_facts),
        handoff: clone(state.council_chamber.causal_check),
      },
      causal_discovery: {
        sidecar: clone(state.discovery_sidecar),
        handoff: clone(state.council_chamber.causal_discovery),
      },
    },
    analysis_execution: clone(state.council_chamber.analysis_execution),
    report: {
      assembly: clone(state.report_assembly),
      handoff: clone(state.council_chamber.report_writer),
    },
    pending_decision: clone(state.pending_decision),
    artifact_records: clone(state.artifact_records),
  };
}

function isOutputBoundReportContext(state, planInfo) {
  const operation = state.state_meta.active_operation;
  return planInfo.actor === "report_writer"
    && operation !== null
    && operation.scope_ref !== null
    && Array.isArray(state.report_assembly.analysis_artifact_ids);
}

function visibleReportArtifactRecords(state, planInfo) {
  if (!isOutputBoundReportContext(state, planInfo)) return clone(state.artifact_records);
  const bound = new Set(state.report_assembly.analysis_artifact_ids ?? []);
  const operationId = state.state_meta.active_operation.id;
  return clone(state.artifact_records.filter((record) => (
    record.route === "analysis_execution"
      ? bound.has(record.artifact_id)
      : record.route === "report_writer"
        ? record.operation_id === operationId
        : true
  )));
}

function visibleReportArtifactWarnings(state, planInfo, warnings) {
  if (!isOutputBoundReportContext(state, planInfo)) return clone(warnings);
  const visibleIds = new Set(
    visibleReportArtifactRecords(state, planInfo).map((record) => record.artifact_id),
  );
  const recordIds = new Set(state.artifact_records.map((record) => record.artifact_id));
  return clone(warnings.filter((warning) => {
    return !recordIds.has(warning.artifact_id) || visibleIds.has(warning.artifact_id);
  }));
}

function workerCouncilProjection(state, planInfo) {
  const council = {
    data_audit: clone(state.council_chamber.data_audit),
    domain_expert: clone(state.council_chamber.domain_expert),
    causal_check: clone(state.council_chamber.causal_check),
    causal_discovery: clone(state.council_chamber.causal_discovery),
    analysis_execution: {},
    report_writer: clone(state.council_chamber.report_writer),
  };
  if (
    (planInfo.actor === "report_writer" && !isOutputBoundReportContext(state, planInfo))
    || ["causal_check", "causal_discovery"].includes(planInfo.actor)
  ) {
    council.analysis_execution = clone(state.council_chamber.analysis_execution);
  } else if (planInfo.design !== null) {
    const slot = state.council_chamber.analysis_execution[planInfo.design];
    if (slot !== undefined) council.analysis_execution[planInfo.design] = clone(slot);
  }
  return council;
}

function workerStateProjection(state, planInfo) {
  const projected = {
    project_summary: clone(state.project_summary),
    carried_questions: carriedQuestionContext(state),
    council_chamber: workerCouncilProjection(state, planInfo),
    data_facts: clone(state.data_facts),
    domain_knowledge: clone(state.domain_knowledge),
    causal_facts: clone(state.causal_facts),
    discovery_sidecar: clone(state.discovery_sidecar),
    artifact_records: planInfo.actor === "report_writer"
      ? visibleReportArtifactRecords(state, planInfo)
      : clone(state.artifact_records),
  };
  if (planInfo.actor === "report_writer") {
    projected.report_assembly = clone(state.report_assembly);
    if (isOutputBoundReportContext(state, planInfo)) {
      projected.report_assembly.draft_notes = [];
    }
  }
  return projected;
}

function leadStateProjection(state, planInfo) {
  if (planInfo.actor !== "team_lead") {
    const projected = workerStateProjection(state, planInfo);
    projected.carried_questions = clone(state.carried_questions);
    return projected;
  }
  return {
    project_summary: clone(state.project_summary),
    carried_questions: clone(state.carried_questions),
    council_chamber: clone(state.council_chamber),
    data_facts: clone(state.data_facts),
    domain_knowledge: clone(state.domain_knowledge),
    causal_facts: clone(state.causal_facts),
    discovery_sidecar: clone(state.discovery_sidecar),
    report_assembly: clone(state.report_assembly),
    artifact_records: clone(state.artifact_records),
  };
}

function turnContext(state, planInfo, audience, warnings, artifactStatus = null) {
  const operation = state.state_meta.active_operation;
  const projected = audience === "router"
    ? routerStateProjection(state)
    : audience === "worker"
      ? workerStateProjection(state, planInfo)
      : leadStateProjection(state, planInfo);
  const snapshot = scopeSnapshot(state);
  if (audience !== "router" && isOutputBoundReportContext(state, planInfo)) {
    snapshot.analysis = {};
  }
  return {
    version: 1,
    audience,
    actor: audience === "router" ? null : planInfo.actor,
    project_id: state.state_meta.project_id,
    revision: state.state_meta.revision,
    stage: operation === null ? "idle" : operation.stage,
    startup_notice: clone(state.state_meta.startup_notice),
    operation: clone(operation),
    scope_snapshot: snapshot,
    state: projected,
    previous_response_cue: audience === "router" ? previousResponseCue(state.response_receipt) : null,
    artifact_status: clone(artifactStatus),
    artifact_warnings: audience !== "router" && planInfo.actor === "report_writer"
      ? visibleReportArtifactWarnings(state, planInfo, warnings)
      : clone(warnings),
    directives: audience === "team_lead" ? leadDirectives(state, planInfo) : [],
  };
}

function phaseName(audience) {
  return audience === "team_lead" ? "lead" : audience;
}

function completionCommandForAudience(audience) {
  if (audience === "router") return "begin";
  if (audience === "worker") return "apply";
  return "finish";
}

function phaseCapsule(state, planInfo, audience, warnings, artifactStatus = null) {
  const context = turnContext(state, planInfo, audience, warnings, artifactStatus);
  const body = {
    protocol: PHASE_CAPSULE_PROTOCOL,
    version: PHASE_CAPSULE_VERSION,
    kind: "full",
    phase: phaseName(audience),
    turn_context: context,
    operation_packet: operationPacket(state, state.state_meta.active_operation, planInfo),
    required_references: requiredReferences(state, planInfo, audience, warnings),
    completion_command: completionCommandForAudience(audience),
  };
  const contextHash = sha256Hex(canonicalJson(body));
  return {
    ...body,
    context_id: `ctx-v${PHASE_CAPSULE_VERSION}-${contextHash}`,
  };
}

function normalizeContextProtocol(value, label) {
  if (value === undefined || value === null) return null;
  if (value !== PHASE_CAPSULE_PROTOCOL) {
    fail("INVALID_INPUT", `${label} must be ${PHASE_CAPSULE_PROTOCOL}`);
  }
  return value;
}

const MAX_QUESTION_DIRECTIVES = 5;

function audienceLevelUnstated(state) {
  const profile = state.project_summary.audience_profile;
  return !isObject(profile) || profile.level === "unstated";
}

function openCarriedQuestions(state) {
  return state.carried_questions.filter((entry) => entry.status === "open");
}

function leadQuestionsReferenceNeeded(state, planInfo) {
  if (openCarriedQuestions(state).length > 0) return true;
  const handoffTexts = currentOperationQuestionTexts(state, planInfo);
  return handoffTexts !== null && handoffTexts.size > 0;
}

function leadDirectives(state, planInfo) {
  const directives = [];
  if (audienceLevelUnstated(state)) {
    directives.push({
      kind: "audience_unstated",
      instruction: "The audience level is unstated. Set project_summary.audience_profile only if this turn's message or committed project evidence demonstrates the user's statistical fluency; otherwise leave it unstated and explain at a neutral depth.",
    });
  }

  const handoffTexts = currentOperationQuestionTexts(state, planInfo);
  if (handoffTexts !== null && handoffTexts.size > 0) {
    directives.push({
      kind: "handoff_questions",
      count: handoffTexts.size,
      instruction: `The current handoff raised ${handoffTexts.size} question(s) for the user. Record each material one through question_actions with its exact committed text; surface at most one this turn.`,
    });
  }

  const open = openCarriedQuestions(state);
  if (open.length > 0) {
    const overdue = open.filter(
      (entry) => entry.first_surfaced_revision === null && entry.source_operation_count >= 2,
    );
    const awaiting = open.filter((entry) => entry.first_surfaced_revision !== null);
    const questionDirectives = [
      ...overdue.map((entry) => ({
        kind: "question_overdue",
        question_id: entry.question_id,
        question: entry.question,
        source_operation_count: entry.source_operation_count,
        instruction: `Overdue carried question: recorded by ${entry.source_operation_count} operations and never surfaced. Surface it this turn (verbatim, saying what changes either way) or retire it explicitly through question_actions.`,
      })),
      ...awaiting.map((entry) => ({
        kind: "question_awaiting_answer",
        question_id: entry.question_id,
        question: entry.question,
        first_surfaced_revision: entry.first_surfaced_revision,
        instruction: "Surfaced and still open. If this turn's message answers it, retire it as answered with an evidence note; if the user declined or cannot answer, treat it as a stated limitation rather than re-asking.",
      })),
    ];
    directives.push(...questionDirectives.slice(0, MAX_QUESTION_DIRECTIVES));
    directives.push({
      kind: "open_questions_summary",
      open: open.length,
      never_surfaced: open.filter((entry) => entry.first_surfaced_revision === null).length,
      overdue: overdue.length,
      omitted_from_directives: Math.max(0, questionDirectives.length - MAX_QUESTION_DIRECTIVES),
      instruction: "Surface at most one carried question per turn: the one whose answer would change the most. Omitting an open question from question_actions holds it unchanged.",
    });
  }
  return directives;
}

function requiredReferences(state, planInfo, audience, warnings) {
  const operation = state.state_meta.active_operation;
  const legacyProtocol = operation !== null && operation.completion_protocol === 1;
  if (audience === "router") return ["references/route_selection_workflow.md"];
  if (audience === "team_lead") {
    const references = ["references/team_lead.md"];
    if (planInfo.design !== null) references.push("references/team_lead_analysis_flow.md");
    if (planInfo.actor === "report_writer") references.push("references/team_lead_report_flow.md");
    if (leadQuestionsReferenceNeeded(state, planInfo)) {
      references.push("references/team_lead_questions.md");
    }
    if (audienceLevelUnstated(state)) references.push("references/team_lead_audience.md");
    if (legacyProtocol) references.push("references/legacy_evidence.md");
    return references;
  }

  const references = [];
  if (planInfo.design !== null) {
    references.push(
      "references/design_execution_contract.md",
      `references/design/${planInfo.design}.md`,
    );
    if (planInfo.support !== null) references.push(`references/support/${planInfo.support}.md`);
  } else {
    references.push(`references/${planInfo.actor}.md`);
  }
  const outputBound = operation !== null && (
    operation.artifact_intent !== null
    || (
      operation.scope_ref !== null
      && (
        planInfo.design !== null
        || planInfo.actor === "causal_discovery"
        || (
          planInfo.actor === "report_writer"
          && Array.isArray(state.report_assembly.analysis_artifact_ids)
        )
      )
    )
  );
  if (outputBound && planInfo.actor === "report_writer") {
    if (state.report_assembly.analysis_artifact_ids !== null) {
      references.push(
        state.report_assembly.analysis_artifact_ids.length > 0
          ? "assets/report_template_analysis.md"
          : "assets/report_template_planning.md",
        "assets/report_html_layout_template.html",
      );
    }
  }
  if (outputBound) references.push("references/artifact_output_policy.md");
  if (legacyProtocol) references.push("references/legacy_evidence.md");
  return [...new Set(references)];
}

function contextForCurrentStage(
  state,
  planInfo,
  warnings,
  artifactStatus = null,
  contextProtocol = null,
) {
  const operation = state.state_meta.active_operation;
  const audience = operation === null
    ? "router"
    : operation.stage === "worker_pending"
      ? "worker"
      : "team_lead";
  if (contextProtocol === PHASE_CAPSULE_PROTOCOL) {
    return { phase_capsule: phaseCapsule(state, planInfo, audience, warnings, artifactStatus) };
  }
  return {
    turn_context: turnContext(state, planInfo, audience, warnings, artifactStatus),
    required_references: requiredReferences(state, planInfo, audience, warnings),
  };
}

function validateProject({ projectRoot }) {
  const root = path.resolve(projectRoot);
  const statePath = statePathFor(root);
  if (!fs.existsSync(statePath)) {
    return { ok: false, code: "MISSING_STATE", state_path: statePath, warnings: [] };
  }
  let state = parseYaml(readText(statePath), statePath);
  if (state.state_meta?.schema_version === 6) {
    state = upgradeV6State(state, root);
  }
  if (state.state_meta?.schema_version === 7) {
    state = upgradeV7State(state);
  }
  if (state.state_meta?.schema_version === 8) {
    state = upgradeV8State(state);
  }
  const { planInfo } = validateState(state);
  return {
    ok: true,
    code: "VALID",
    state_path: statePath,
    project_id: state.state_meta.project_id,
    revision: state.state_meta.revision,
    active_operation: state.state_meta.active_operation,
    operation_packet: operationPacket(state, state.state_meta.active_operation, planInfo),
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
      direct_assignment: 1,
      causal_scope_basis: 1,
      startup_notice: 1,
      discovery_contract: 1,
      analysis_contract: 1,
      completion_protocol: 1,
      artifact_roles: 1,
      analysis_options: 1,
      requirement_evidence: 1,
      turn_context: 1,
      required_references: 1,
      operation_packet_ref: 1,
      phase_capsule: 1,
      begin_artifact_reservation: 1,
      conditional_references: 1,
      report_evidence_binding: 1,
      audience_profile: 1,
      carried_questions: 2,
      lead_directives: 1,
    },
  };
}

module.exports = {
  PHASE_CAPSULE_PROTOCOL,
  StateError,
  applyWorker: (options) => withStateMutationLock(
    options.projectRoot,
    () => applyWorker(options),
  ),
  beginOperation: (options) => withStateMutationLock(
    options.projectRoot,
    () => beginOperation(options),
  ),
  finishOperation: (options) => withStateMutationLock(
    options.projectRoot,
    () => finishOperation(options),
  ),
  openProject: (options) => withStateMutationLock(
    options.projectRoot,
    () => openProject(options),
    { createProjectRoot: true },
  ),
  reserveArtifact: (options) => withStateMutationLock(
    options.projectRoot,
    () => reserveArtifact(options),
  ),
  validateProject,
  validateTemplate,
};
