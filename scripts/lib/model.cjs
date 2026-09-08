"use strict";

const { fail } = require("./files.cjs");
const CATALOG = require("../../references/catalog.json");

const ID = /^[a-z][a-z0-9_-]{0,79}$/;
const PUBLIC_TYPES = ["checkpoint", "memory_updated", "review_completed", "correction"];
const RUN_TYPES = ["run_started", "run_finalized", "run_failed", "run_abandoned"];
const CHECKPOINT_STATUSES = ["assessing", "awaiting_user", "ready_for_specialist", "specialist_complete"];
const STRATEGY_STATUSES = ["possible", "conditional", "preferred", "unsupported_with_current_evidence", "not_relevant"];
const COLLECTIONS = {
  questions: { id: "question_id", kind: "question" },
  evidence: { id: "evidence_id", kind: "evidence" },
  assumptions: { id: "assumption_id", kind: "assumption" },
  decisions: { id: "decision_id", kind: "decision" },
  candidate_routes: { id: "strategy_id", kind: "strategy" }
};

function jsonValue(value, label = "input", seen = new Set(), depth = 0) {
  if (depth > 40) fail("INVALID_INPUT", label + " is nested too deeply.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object" || seen.has(value)) fail("INVALID_INPUT", label + " must be JSON data.");
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    fail("INVALID_INPUT", label + " must be a plain JSON object.");
  }
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key)) fail("INVALID_INPUT", label + " contains an unsafe key.");
    jsonValue(value[key], label + "." + key, seen, depth + 1);
  }
  seen.delete(value);
}
function object(value, label, required = [], optional = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("INVALID_INPUT", label + " must be an object.");
  const allowed = new Set([...required, ...optional]);
  for (const key of required) if (!Object.hasOwn(value, key)) fail("INVALID_INPUT", label + "." + key + " is required.");
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("INVALID_INPUT", "Unknown field " + label + "." + key + ".");
}
function text(value, label) {
  if (typeof value !== "string" || !value.trim()) fail("INVALID_INPUT", label + " must be nonempty text.");
}
function id(value, label) {
  if (typeof value !== "string" || !ID.test(value) || ["constructor", "prototype"].includes(value)) fail("INVALID_INPUT", label + " must be a valid project-local ID.");
}
function enumeration(value, choices, label) {
  if (!choices.includes(value)) fail("INVALID_INPUT", label + " must be one of: " + choices.join(", ") + ".");
}
function array(value, label, item, nonempty = false) {
  if (!Array.isArray(value) || (nonempty && !value.length)) fail("INVALID_INPUT", label + " must be " + (nonempty ? "a nonempty" : "an") + " array.");
  value.forEach((entry, index) => item(entry, label + "[" + index + "]"));
}
function strings(value, label, nonempty = false) { array(value, label, text, nonempty); }
function optionalStrings(value, keys, label) {
  for (const key of keys) if (Object.hasOwn(value, key)) strings(value[key], label + "." + key);
}
function validateUnderstanding(value, label = "project_understanding") {
  object(value, label, [], ["objective", "intended_use", "audience", "causal_target", "materials", "current_claim_boundary"]);
  for (const [key, entry] of Object.entries(value)) {
    if (key === "materials") strings(entry, label + "." + key);
    else text(entry, label + "." + key);
  }
}

function emptyState(projectId, timestamp) {
  id(projectId, "project_id");
  text(timestamp, "timestamp");
  return {
    state_meta: { schema_version: 7, project_id: projectId, last_event_id: null, sequence: 0, created_at: timestamp, updated_at: timestamp },
    project_understanding: {}, consultation: null, questions: [], evidence: [], assumptions: [], decisions: [],
    candidate_routes: [], specialist_reviews: [], runs: [], history_index: {}
  };
}

function semanticContext(state, request) {
  const available = new Map(Object.entries(state.history_index || {}).map(([key, value]) => [key, value.kind]));
  const inEvent = new Set();
  const evidence = new Map(state.evidence.map(record => [record.evidence_id, record]));
  function reserve(value, kind, immutable = false) {
    id(value, kind + " ID");
    if (inEvent.has(value)) fail("DUPLICATE_ID", "An ID occurs twice in this event: " + value);
    if (available.has(value) && (available.get(value) !== kind || immutable)) {
      fail("DUPLICATE_ID", "An existing ID cannot be reused here: " + value);
    }
    available.set(value, kind);
    inEvent.add(value);
  }
  reserve(request.event_id, "event", true);
  const payload = request.payload;
  const changes = payload.changes || {};
  if (payload.checkpoint) reserve(payload.checkpoint.checkpoint_id, "checkpoint");
  if (changes.consultation) reserve(changes.consultation.checkpoint_id, "checkpoint");
  for (const [name, config] of Object.entries(COLLECTIONS)) {
    if (!Object.hasOwn(changes, name)) continue;
    array(changes[name], "changes." + name, (record, label) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) fail("INVALID_INPUT", label + " must be an object.");
      reserve(record[config.id], config.kind);
      if (name === "evidence") evidence.set(record.evidence_id, record);
    });
  }
  if (payload.review) reserve(payload.review.review_id, "review", true);
  function reference(value, label, kind) {
    id(value, label);
    if (!available.has(value) || (kind && available.get(value) !== kind)) {
      fail("UNKNOWN_REFERENCE", label + " does not identify known " + (kind || "project history") + ": " + value);
    }
  }
  function references(values, label, kind, nonempty = false) {
    array(values, label, (value, itemLabel) => reference(value, itemLabel, kind), nonempty);
    if (new Set(values).size !== values.length) fail("INVALID_INPUT", label + " contains duplicate references.");
  }
  function contributionRefs(values, label, nonempty = false) {
    references(values, label, "evidence", nonempty);
    for (const value of values) if (evidence.get(value)?.kind !== "user_statement") {
      fail("UNKNOWN_REFERENCE", label + " must refer to user-statement evidence: " + value);
    }
  }
  return { reference, references, contributionRefs, runStatus: runId => state.runs.find(run => run.run_id === runId)?.status };
}

function validateAdditionalDesigns(value, label) {
  if (!Object.hasOwn(value, "additional_design_ids")) return;
  array(value.additional_design_ids, label + ".additional_design_ids", (entry, name) => {
    enumeration(entry, CATALOG.designs, name);
    if (entry === "custom_identification" || entry === value.design_id) fail("INVALID_INPUT", name + " must be an additional non-custom design.");
  });
  if (new Set(value.additional_design_ids).size !== value.additional_design_ids.length) fail("INVALID_INPUT", label + ".additional_design_ids contains duplicates.");
  if (value.additional_design_ids.length && !value.design_id) fail("INVALID_INPUT", label + ".additional_design_ids requires a primary design_id.");
}
function validateAssignment(value, label, context) {
  object(value, label, ["specialist_id", "operation"], ["design_id", "additional_design_ids", "support_ids", "strategy_ids"]);
  enumeration(value.specialist_id, Object.keys(CATALOG.specialists), label + ".specialist_id");
  enumeration(value.operation, CATALOG.specialists[value.specialist_id], label + ".operation");
  if (value.specialist_id === "design_worker") {
    enumeration(value.design_id, CATALOG.designs, label + ".design_id");
    validateAdditionalDesigns(value, label);
  } else if (Object.hasOwn(value, "design_id") || Object.hasOwn(value, "additional_design_ids")) {
    fail("INVALID_INPUT", "Only design_worker assignments have design identities.");
  }
  if (Object.hasOwn(value, "support_ids")) {
    array(value.support_ids, label + ".support_ids", (entry, name) => enumeration(entry, CATALOG.supports, name));
    if (new Set(value.support_ids).size !== value.support_ids.length) fail("INVALID_INPUT", label + ".support_ids contains duplicates.");
  }
  if (Object.hasOwn(value, "strategy_ids")) context.references(value.strategy_ids, label + ".strategy_ids", "strategy");
}
function validateCheckpoint(value, label, context) {
  object(value, label, ["checkpoint_id", "status", "primary_uncertainty", "why_it_matters"], [
    "strategy_ids_it_could_change", "ways_user_can_help", "consultant_led_options_if_unknown", "user_contribution_refs",
    "related_unresolved_question_refs", "selected_assignment"
  ]);
  id(value.checkpoint_id, label + ".checkpoint_id");
  enumeration(value.status, CHECKPOINT_STATUSES, label + ".status");
  text(value.primary_uncertainty, label + ".primary_uncertainty");
  text(value.why_it_matters, label + ".why_it_matters");
  optionalStrings(value, ["ways_user_can_help", "consultant_led_options_if_unknown"], label);
  if (Object.hasOwn(value, "strategy_ids_it_could_change")) context.references(value.strategy_ids_it_could_change, label + ".strategy_ids_it_could_change", "strategy");
  if (Object.hasOwn(value, "related_unresolved_question_refs")) context.references(value.related_unresolved_question_refs, label + ".related_unresolved_question_refs", "question");
  if (Object.hasOwn(value, "user_contribution_refs")) context.contributionRefs(value.user_contribution_refs, label + ".user_contribution_refs");
  if (Object.hasOwn(value, "selected_assignment")) validateAssignment(value.selected_assignment, label + ".selected_assignment", context);
}
function optionalRefs(value, mapping, label, context) {
  for (const [key, kind] of Object.entries(mapping)) if (Object.hasOwn(value, key)) context.references(value[key], label + "." + key, kind);
}
function supersedes(value, ownId, kind, label, context) {
  if (!Object.hasOwn(value, "supersedes")) return;
  context.reference(value.supersedes, label + ".supersedes", kind);
  if (value.supersedes === ownId) fail("INVALID_INPUT", label + " cannot supersede itself.");
}

function validateChanges(changes, context) {
  object(changes, "changes", [], ["project_understanding", "consultation", ...Object.keys(COLLECTIONS)]);
  if (Object.hasOwn(changes, "project_understanding")) validateUnderstanding(changes.project_understanding, "changes.project_understanding");
  if (Object.hasOwn(changes, "consultation") && changes.consultation !== null) validateCheckpoint(changes.consultation, "changes.consultation", context);
  for (const record of changes.questions || []) {
    const label = "question " + record.question_id;
    object(record, label, ["question_id", "statement", "status"], ["reason", "basis_refs"]);
    text(record.statement, label + ".statement");
    enumeration(record.status, ["open", "answered", "retired"], label + ".status");
    if (record.status !== "open" || Object.hasOwn(record, "reason")) text(record.reason, label + ".reason");
    optionalRefs(record, { basis_refs: undefined }, label, context);
  }
  for (const record of changes.evidence || []) {
    const label = "evidence " + record.evidence_id;
    object(record, label, ["evidence_id", "kind", "source_ref", "summary"], ["limitations", "source_sha256", "source_excerpt", "supersedes", "legacy", "run_id"]);
    enumeration(record.kind, ["user_statement", "file", "literature", "computed"], label + ".kind");
    text(record.source_ref, label + ".source_ref");
    text(record.summary, label + ".summary");
    if (Object.hasOwn(record, "source_excerpt")) text(record.source_excerpt, label + ".source_excerpt");
    optionalStrings(record, ["limitations"], label);
    if (Object.hasOwn(record, "source_sha256") && !/^[a-f0-9]{64}$/.test(record.source_sha256)) fail("INVALID_INPUT", label + ".source_sha256 must be a SHA-256 hash.");
    supersedes(record, record.evidence_id, "evidence", label, context);
    if (record.kind === "computed") {
      if (record.legacy) fail("INVALID_INPUT", "Legacy findings remain source evidence, not newly computed v7 results.");
      context.reference(record.run_id, label + ".run_id", "run");
      if (context.runStatus(record.run_id) !== "completed") fail("INCOMPLETE_RUN", label + " requires a completed run.");
      if (!record.source_ref.startsWith("runs/" + record.run_id + "/")) fail("UNKNOWN_REFERENCE", label + ".source_ref must identify a file in its completed run.");
    } else if (Object.hasOwn(record, "run_id")) fail("INVALID_INPUT", "Only computed evidence uses run_id.");
    if (Object.hasOwn(record, "legacy")) {
      object(record.legacy, label + ".legacy", ["source_project", "source_version", "verification"]);
      text(record.legacy.source_project, label + ".legacy.source_project");
      text(record.legacy.source_version, label + ".legacy.source_version");
      enumeration(record.legacy.verification, ["legacy_unverified", "reviewed_summary"], label + ".legacy.verification");
    }
  }
  for (const record of changes.assumptions || []) {
    const label = "assumption " + record.assumption_id;
    object(record, label, ["assumption_id", "statement", "status"], ["basis_refs", "supersedes"]);
    text(record.statement, label + ".statement");
    enumeration(record.status, ["active", "revised", "retired"], label + ".status");
    optionalRefs(record, { basis_refs: undefined }, label, context);
    supersedes(record, record.assumption_id, "assumption", label, context);
  }
  for (const record of changes.decisions || []) {
    const label = "decision " + record.decision_id;
    object(record, label, ["decision_id", "kind", "statement", "status"], ["basis_refs", "user_contribution_refs", "supersedes"]);
    text(record.statement, label + ".statement");
    enumeration(record.kind, ["target", "investigation", "design", "execution", "reporting", "boundary"], label + ".kind");
    enumeration(record.status, ["current", "superseded", "withdrawn"], label + ".status");
    optionalRefs(record, { basis_refs: undefined }, label, context);
    if (Object.hasOwn(record, "user_contribution_refs")) context.contributionRefs(record.user_contribution_refs, label + ".user_contribution_refs");
    supersedes(record, record.decision_id, "decision", label, context);
  }
  for (const record of changes.candidate_routes || []) {
    const label = "strategy " + record.strategy_id;
    object(record, label, ["strategy_id", "target", "approach", "status", "reason"], [
      "design_id", "additional_design_ids", "support_ids", "data_requirements", "claim_boundary", "evidence_for", "evidence_against",
      "unmet_requirements", "reopen_or_promote_when", "last_review_id"
    ]);
    for (const key of ["target", "approach", "reason"]) text(record[key], label + "." + key);
    enumeration(record.status, STRATEGY_STATUSES, label + ".status");
    if (Object.hasOwn(record, "design_id") && record.design_id !== null) enumeration(record.design_id, CATALOG.designs, label + ".design_id");
    validateAdditionalDesigns(record, label);
    if (Object.hasOwn(record, "support_ids")) array(record.support_ids, label + ".support_ids", (entry, name) => enumeration(entry, CATALOG.supports, name));
    optionalStrings(record, ["data_requirements", "unmet_requirements"], label);
    for (const key of ["claim_boundary", "reopen_or_promote_when"]) if (Object.hasOwn(record, key)) text(record[key], label + "." + key);
    optionalRefs(record, { evidence_for: "evidence", evidence_against: "evidence" }, label, context);
    if (Object.hasOwn(record, "last_review_id")) context.reference(record.last_review_id, label + ".last_review_id", "review");
  }
}
function validateReview(review, context) {
  object(review, "review", ["review_id", "summary", "assignment", "question_addressed", "selection_basis", "work_performed", "findings"], [
    "evidence_refs", "limitations", "noise_or_invalid_information", "route_changes", "assumptions_added_or_revised",
    "remaining_uncertainty", "suggested_next_uncertainty"
  ]);
  text(review.summary, "review.summary");
  text(review.question_addressed, "review.question_addressed");
  validateAssignment(review.assignment, "review.assignment", context);
  object(review.selection_basis, "review.selection_basis", ["checkpoint_id", "user_contribution_refs"]);
  context.reference(review.selection_basis.checkpoint_id, "review.selection_basis.checkpoint_id", "checkpoint");
  context.contributionRefs(review.selection_basis.user_contribution_refs, "review.selection_basis.user_contribution_refs", true);
  strings(review.work_performed, "review.work_performed", true);
  strings(review.findings, "review.findings", true);
  optionalStrings(review, ["limitations", "noise_or_invalid_information", "remaining_uncertainty"], "review");
  optionalRefs(review, { evidence_refs: "evidence", route_changes: "strategy", assumptions_added_or_revised: "assumption" }, "review", context);
  if (Object.hasOwn(review, "suggested_next_uncertainty")) text(review.suggested_next_uncertainty, "review.suggested_next_uncertainty");
}

function validateSemantic(state, request) {
  jsonValue(request);
  object(request, "request", ["event_id", "expected_project_id", "expected_last_event_id", "type", "payload"]);
  id(request.event_id, "event_id");
  id(request.expected_project_id, "expected_project_id");
  if (request.expected_last_event_id !== null) id(request.expected_last_event_id, "expected_last_event_id");
  if (request.expected_project_id !== state.state_meta.project_id) fail("PROJECT_MISMATCH", "The request belongs to another project.");
  if (request.expected_last_event_id !== state.state_meta.last_event_id) fail("STALE_WRITE", "Reload current state before changing it.");
  enumeration(request.type, PUBLIC_TYPES, "type");
  const required = {
    checkpoint: ["checkpoint"], memory_updated: ["changes"], review_completed: ["review"], correction: ["corrects_refs", "reason", "changes"]
  }[request.type];
  const optional = { checkpoint: ["changes"], memory_updated: [], review_completed: ["changes", "checkpoint"], correction: [] }[request.type];
  object(request.payload, "payload", required, optional);
  if (Object.hasOwn(request.payload, "changes")) object(request.payload.changes, "changes", [], ["project_understanding", "consultation", ...Object.keys(COLLECTIONS)]);
  const context = semanticContext(state, request);
  if (Object.hasOwn(request.payload, "checkpoint")) validateCheckpoint(request.payload.checkpoint, "checkpoint", context);
  if (Object.hasOwn(request.payload, "changes")) validateChanges(request.payload.changes, context);
  if (request.type === "review_completed") validateReview(request.payload.review, context);
  if (request.type === "correction") {
    text(request.payload.reason, "payload.reason");
    context.references(request.payload.corrects_refs, "payload.corrects_refs", undefined, true);
    for (const ref of request.payload.corrects_refs) if (!Object.hasOwn(state.history_index, ref)) {
      fail("UNKNOWN_REFERENCE", "A correction must identify already committed history: " + ref);
    }
  }
  return request;
}

function upsert(list, record, key) {
  const index = list.findIndex(existing => existing[key] === record[key]);
  if (index < 0) list.push(structuredClone(record));
  else list[index] = structuredClone(record);
}
function reduceEvent(state, event, copyState) {
  jsonValue(event, "event");
  object(event, "event", ["schema_version", "project_id", "event_id", "sequence", "previous_event_id", "timestamp", "type", "payload"], ["sha256", "request_sha256"]);
  id(event.event_id, "event.event_id");
  if (Object.hasOwn(state.history_index, event.event_id)) fail("DUPLICATE_ID", "Event identity is already present: " + event.event_id);
  if (event.project_id !== state.state_meta.project_id || event.schema_version !== 7) fail("PROJECT_MISMATCH", "Event project/schema identity does not match.");
  if (event.sequence !== state.state_meta.sequence + 1 || event.previous_event_id !== state.state_meta.last_event_id) {
    fail("INVALID_EVENT", "Event predecessor or sequence does not match current state.");
  }
  text(event.timestamp, "event.timestamp");
  if (PUBLIC_TYPES.includes(event.type)) {
    validateSemantic(state, { event_id: event.event_id, expected_project_id: event.project_id, expected_last_event_id: event.previous_event_id, type: event.type, payload: event.payload });
  } else if (event.type === "init") {
    if (state.state_meta.sequence !== 0) fail("INVALID_EVENT", "A project can only be initialized once.");
    object(event.payload, "init payload", ["project_understanding"]);
    validateUnderstanding(event.payload.project_understanding);
  } else if (!RUN_TYPES.includes(event.type)) fail("INVALID_EVENT", "Unknown event type: " + event.type);

  const next = copyState ? structuredClone(state) : state;
  const index = (recordId, kind) => {
    const prior = next.history_index[recordId];
    if (prior && prior.kind !== kind) fail("DUPLICATE_ID", "Conflicting history identity: " + recordId);
    next.history_index[recordId] = { kind, event_ref: event.event_id };
  };
  index(event.event_id, "event");
  if (event.type === "init") {
    next.project_understanding = structuredClone(event.payload.project_understanding);
    next.state_meta.created_at = event.timestamp;
  }
  if (PUBLIC_TYPES.includes(event.type)) {
    const payload = event.payload;
    const changes = payload.changes || {};
    if (payload.checkpoint) {
      next.consultation = structuredClone(payload.checkpoint);
      index(payload.checkpoint.checkpoint_id, "checkpoint");
    }
    if (changes.project_understanding) Object.assign(next.project_understanding, structuredClone(changes.project_understanding));
    for (const [name, config] of Object.entries(COLLECTIONS)) for (const record of changes[name] || []) {
      upsert(next[name], record, config.id);
      index(record[config.id], config.kind);
    }
    if (payload.review) {
      const review = payload.review;
      next.specialist_reviews.push({ review_id: review.review_id, event_ref: event.event_id, summary: review.summary, completed_at: event.timestamp });
      index(review.review_id, "review");
      if (next.consultation?.checkpoint_id === review.selection_basis.checkpoint_id) next.consultation.status = "specialist_complete";
    }
    if (Object.hasOwn(changes, "consultation")) {
      next.consultation = structuredClone(changes.consultation);
      if (changes.consultation) index(changes.consultation.checkpoint_id, "checkpoint");
    }
  }
  if (RUN_TYPES.includes(event.type)) {
    object(event.payload, "run payload", ["run"]);
    const run = event.payload.run;
    if (!run || typeof run !== "object" || Array.isArray(run)) fail("INVALID_EVENT", "Run record must be an object.");
    id(run.run_id, "run.run_id");
    const expected = { run_started: "in_progress", run_finalized: "completed", run_failed: "failed", run_abandoned: "abandoned" }[event.type];
    if (run.status !== expected) fail("INVALID_EVENT", "Run event and status disagree.");
    const prior = next.runs.find(item => item.run_id === run.run_id);
    if (event.type === "run_started" ? !!prior : !prior || prior.status !== "in_progress") fail("INVALID_EVENT", "Invalid run lifecycle transition.");
    upsert(next.runs, run, "run_id");
    index(run.run_id, "run");
  }
  next.state_meta.last_event_id = event.event_id;
  next.state_meta.sequence = event.sequence;
  next.state_meta.updated_at = event.timestamp;
  return next;
}
function applyEvent(state, event) { return reduceEvent(state, event, true); }

// Journal reconstruction owns this disposable state. Discard the builder on any
// error; the public reducer and transaction path continue to preserve prior state.
function createReplayBuilder(projectId, timestamp) {
  let state = emptyState(projectId, timestamp);
  return { apply(event) { state = reduceEvent(state, event, false); return state; } };
}

module.exports = {
  CATALOG, ID, PUBLIC_TYPES, CHECKPOINT_STATUSES, STRATEGY_STATUSES, COLLECTIONS,
  emptyState, validateSemantic, applyEvent, createReplayBuilder, jsonValue, object, text, id,
  enumeration, array, strings, validateUnderstanding, validateAssignment, validateAdditionalDesigns
};
