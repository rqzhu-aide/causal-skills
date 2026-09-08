"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const store = require("../scripts/lib/store.cjs");
const runs = require("../scripts/lib/runs.cjs");
const model = require("../scripts/lib/model.cjs");
const { canonical, sha256 } = require("../scripts/lib/files.cjs");
const examples = require("./fixtures/extensions-rc3.json");

function project(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, "cc-v7-extensions-"));
  t.after(() => {
    const relative = path.relative(base, root);
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith("..") && relative.startsWith("cc-v7-extensions-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  store.init(root, { project_id: "project-extensions", event_id: "event-init" });
  fs.mkdirSync(path.join(root, "data"));
  for (const name of ["enrollment", "visits"]) {
    fs.writeFileSync(path.join(root, "data", name + ".json"), JSON.stringify(examples.preparation_truth[name]) + "\n");
  }
  return root;
}
function state(root) { return store.status(root).project; }
function identity(root, event_id) {
  const value = state(root).state_meta;
  return { event_id, expected_project_id: value.project_id, expected_last_event_id: value.last_event_id };
}
function journal(root) { return fs.readFileSync(path.join(root, "journal.jsonl")); }
function record(root, changes, event_id = "event-memory") {
  return store.record(root, { ...identity(root, event_id), type: "memory_updated", payload: { changes } });
}
function start(root, plan, run_id = "run-extension", event_id = "event-start") {
  return runs.start(root, { ...identity(root, event_id), run_id, plan: structuredClone(plan) });
}
function write(root, run_id, relative, content) {
  const { event_id, ...identities } = identity(root, "unused");
  return runs.write(root, { ...identities, run_id, path: relative, content });
}
function frozen(root, run_id = "run-extension") {
  return JSON.parse(fs.readFileSync(path.join(root, "runs", run_id, "plan.yaml"), "utf8"));
}
function rejectedUnchanged(root, action, code = "INVALID_INPUT") {
  const before = journal(root);
  assert.throws(action, error => error.code === code);
  assert.deepEqual(journal(root), before);
}
function checkpoint(assignment, checkpoint_id = "checkpoint-assignment") {
  return { checkpoint_id, status: "assessing", primary_uncertainty: "Exercise the declared assignment shape",
    why_it_matters: "Different references must remain one bounded review", selected_assignment: assignment };
}
function strategy(fields = {}) {
  return { strategy_id: "strategy-test", target: "A declared fixture target", approach: "A fixture proposal",
    status: "conditional", reason: "Serialization fixture only", ...fields };
}

test("a complete composed review persists source qualifications and one specialist identity", t => {
  const root = project(t);
  const request = structuredClone(examples.semantic_request);
  assert.equal(store.record(root, request).committed, true);
  const saved = state(root);
  assert.equal(saved.specialist_reviews.length, 1);
  assert.equal(saved.evidence[0].source_excerpt, request.payload.changes.evidence[0].source_excerpt);
  assert.deepEqual(saved.candidate_routes[0].additional_design_ids, ["randomized_assignment"]);
  const history = store.history(root, { record_id: "review-composed" }).events;
  assert.deepEqual(history[0].payload.review.assignment, request.payload.review.assignment);
  assert.equal(store.status(root).projection_current, true);
  assert.deepEqual(request, examples.semantic_request, "Validation must not normalize or mutate the caller's request.");
});

test("preparation, custom and composed assignments reuse the existing specialist contract", t => {
  const root = project(t);
  for (const [name, assignment] of Object.entries(examples.assignments)) {
    record(root, { consultation: checkpoint(assignment, "checkpoint-" + name) }, "event-" + name);
    assert.deepEqual(state(root).consultation.selected_assignment, assignment);
  }
});

test("additional design identities reject duplicates, self references, custom additions and non-worker assignments", t => {
  const root = project(t);
  const base = examples.assignments.composed;
  for (const assignment of [
    { ...base, additional_design_ids: ["randomized_assignment", "randomized_assignment"] },
    { ...base, additional_design_ids: [base.design_id] },
    { ...base, additional_design_ids: ["custom_identification"] },
    { ...base, additional_design_ids: ["unknown_design"] },
    { ...base, additional_design_ids: "randomized_assignment" },
    { ...base, additional_design_ids: null },
    { specialist_id: "data_audit", operation: "prepare", additional_design_ids: [] },
    { specialist_id: "data_audit", operation: "prepare", design_id: "randomized_assignment" }
  ]) rejectedUnchanged(root, () => record(root, { consultation: checkpoint(assignment) }));
});

test("candidate guide composition permits a future strategy without forcing a primary design", t => {
  const root = project(t);
  for (const fields of [
    { additional_design_ids: [] },
    { design_id: null, additional_design_ids: [] },
    { design_id: "custom_identification", additional_design_ids: ["single_time_observational"] }
  ]) {
    record(root, { candidate_routes: [strategy(fields)] }, "event-candidate-" + state(root).state_meta.sequence);
    assert.deepEqual(state(root).candidate_routes[0], strategy(fields));
  }
  for (const fields of [
    { additional_design_ids: ["randomized_assignment"] },
    { design_id: null, additional_design_ids: ["randomized_assignment"] },
    { design_id: "randomized_assignment", additional_design_ids: ["randomized_assignment"] },
    { design_id: "custom_identification", additional_design_ids: ["custom_identification"] },
    { design_id: "randomized_assignment", additional_design_ids: ["interference_spillovers", "interference_spillovers"] }
  ]) rejectedUnchanged(root, () => record(root, { candidate_routes: [strategy(fields)] }));
});

test("source excerpts preserve exact text and reject blank or non-text additions before commit", t => {
  const root = project(t);
  const evidence = { evidence_id: "evidence-wording", kind: "user_statement", source_ref: "fixture:user-message",
    summary: "User recollection with a qualification.", source_excerpt: "  I think the earlier records used visit date.\n" };
  record(root, { evidence: [evidence] });
  assert.equal(state(root).evidence[0].source_excerpt, evidence.source_excerpt);
  for (const source_excerpt of ["", "  ", null, 1, true, [], {}]) {
    rejectedUnchanged(root, () => record(root, { evidence: [{ ...evidence, source_excerpt }] }, "event-invalid-excerpt"));
  }
});

test("standard plans remain byte-compatible in meaning without inserting extension defaults", t => {
  const root = project(t);
  const plan = structuredClone(examples.plans.standard);
  const request = { ...identity(root, "event-standard"), run_id: "run-standard", plan };
  runs.start(root, request);
  const saved = frozen(root, "run-standard");
  for (const key of ["additional_design_ids", "identification_basis", "transformations"]) assert.equal(Object.hasOwn(saved, key), false);
  assert.deepEqual(plan, examples.plans.standard);
  const { expected_last_event_id, ...hashed } = request;
  const event = store.history(root, { event_id: "event-standard" }).events[0];
  assert.equal(event.request_sha256, sha256(canonical(hashed)), "The existing request fingerprint format is preserved.");
  const before = journal(root);
  assert.equal(runs.start(root, request).replayed, true);
  assert.deepEqual(journal(root), before);
});

test("new analysis plans freeze the identifying argument and guides without altering source locators", t => {
  const root = project(t);
  for (const name of ["composed", "custom"]) {
    const plan = examples.plans[name];
    start(root, plan, "run-" + name, "event-" + name);
    const saved = frozen(root, "run-" + name);
    assert.deepEqual(saved.identification_basis, plan.identification_basis);
    assert.deepEqual(saved.additional_design_ids, plan.additional_design_ids);
    assert.equal(saved.design_id, plan.design_id);
  }
  const advanced = { ...examples.plans.standard, identification_basis: examples.plans.custom.identification_basis, additional_design_ids: [] };
  start(root, advanced, "run-advanced", "event-advanced");
  assert.deepEqual(frozen(root, "run-advanced").identification_basis, advanced.identification_basis);
});

test("invalid extension plans leave no run directory or journal event and permit corrected retry", t => {
  const root = project(t);
  const base = examples.plans.composed;
  const withoutBasis = structuredClone(base); delete withoutBasis.identification_basis;
  const customWithoutBasis = structuredClone(examples.plans.custom); delete customWithoutBasis.identification_basis;
  const invalid = [
    withoutBasis, customWithoutBasis,
    { ...base, additional_design_ids: [base.design_id] },
    { ...base, additional_design_ids: ["randomized_assignment", "randomized_assignment"] },
    { ...base, additional_design_ids: ["custom_identification"] },
    { ...base, additional_design_ids: ["unknown_design"] },
    { ...base, additional_design_ids: null },
    { ...base, identification_basis: {} },
    { ...base, identification_basis: { ...base.identification_basis, argument: " " } },
    { ...base, identification_basis: { ...base.identification_basis, assumptions: [] } },
    { ...base, identification_basis: { ...base.identification_basis, source_refs: [] } },
    { ...base, identification_basis: { ...base.identification_basis, source_refs: [""] } },
    { ...base, identification_basis: { ...base.identification_basis, verified: true } },
    { ...base, transformations: ["An audit-only field"] },
    { ...examples.plans.preparation, transformations: [] },
    { ...examples.plans.preparation, transformations: [" "] },
    { ...examples.plans.preparation, transformations: null },
    { ...examples.plans.preparation, diagnostics: [] },
    { ...examples.plans.preparation, design_id: "randomized_assignment" },
    { ...examples.plans.ordinary_audit, identification_basis: base.identification_basis }
  ];
  for (const plan of invalid) {
    rejectedUnchanged(root, () => start(root, plan));
    assert.equal(fs.existsSync(path.join(root, "runs")), false, "Malformed starts must not create orphans.");
  }
  assert.equal(start(root, examples.plans.preparation).committed, true);
  assert.deepEqual(store.status(root).orphan_run_paths, []);
});

const PREPARE = [
  "const fs = require('node:fs');",
  "const enrollment = JSON.parse(fs.readFileSync('inputs/0001.json', 'utf8'));",
  "const visits = JSON.parse(fs.readFileSync('inputs/0002.json', 'utf8'));",
  "const ids = values => new Set(values.map(row => row.subject_id));",
  "const duplicate_keys = enrollment.length - ids(enrollment).size + visits.length - ids(visits).size;",
  "if (duplicate_keys) throw new Error('Ambiguous join keys');",
  "const lookup = new Map(visits.map(row => [row.subject_id, row.attendance_day]));",
  "const derived = enrollment.map(row => ({...row, attendance_day: lookup.get(row.subject_id) ?? null}));",
  "const matched = derived.filter(row => row.attendance_day !== null).length;",
  "const attendance_before_enrollment = derived.filter(row => row.attendance_day !== null && row.attendance_day < row.enrollment_day).length;",
  "fs.mkdirSync('results');",
  "fs.writeFileSync('results/derived.json', JSON.stringify(derived));",
  "fs.writeFileSync('results/diagnostics.json', JSON.stringify({enrolled:enrollment.length, matched, unmatched:enrollment.length-matched, duplicate_keys, attendance_before_enrollment}));",
  "console.log('Prepared '+derived.length+' rows with '+matched+' matched attendance records.');"
].join("\n");

function prepare(root) {
  start(root, examples.plans.preparation);
  write(root, "run-extension", "code/prepare.cjs", PREPARE);
  const result = spawnSync(process.execPath, ["code/prepare.cjs"], { cwd: path.join(root, "runs", "run-extension"), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  write(root, "run-extension", "execution.txt", result.stdout);
  return { ...identity(root, "event-finalize"), run_id: "run-extension", code_paths: ["code/prepare.cjs"],
    output_paths: ["results/derived.json"], diagnostic_paths: ["results/diagnostics.json"],
    environment: { runtime: "node", version: process.version, command: "node code/prepare.cjs", execution_log: "execution.txt" }, deviations: [] };
}

test("preparation finalization requires code, derived output, diagnostics and environment before a manifest", t => {
  const root = project(t);
  const request = prepare(root);
  for (const replacement of [{ code_paths: [] }, { output_paths: [] }, { diagnostic_paths: [] }, { environment: {} }]) {
    rejectedUnchanged(root, () => runs.finalize(root, { ...request, ...replacement }));
    assert.equal(fs.existsSync(path.join(root, "runs", "run-extension", "manifest.json")), false);
  }
  assert.equal(runs.finalize(root, request).committed, true);
  assert.equal(runs.finalize(root, request).replayed, true);
  assert.equal(runs.verify(root).ok, true);
});

test("an actual preparation run preserves source rows and exposes its derived output as computed evidence", t => {
  const root = project(t);
  const sources = ["enrollment", "visits"].map(name => fs.readFileSync(path.join(root, "data", name + ".json")));
  const request = prepare(root);
  runs.finalize(root, request);
  for (const [index, name] of ["enrollment", "visits"].entries()) assert.deepEqual(fs.readFileSync(path.join(root, "data", name + ".json")), sources[index]);
  for (const name of ["derived", "diagnostics"]) {
    const actual = JSON.parse(fs.readFileSync(path.join(root, "runs", "run-extension", "results", name + ".json"), "utf8"));
    assert.deepEqual(actual, examples.preparation_truth[name]);
  }
  record(root, { evidence: [{ evidence_id: "evidence-prepared", kind: "computed", run_id: "run-extension",
    source_ref: "runs/run-extension/results/derived.json", summary: "Three enrolled rows retained, with one missing attendance record; preparation only." }] }, "event-prepared-evidence");
  assert.equal(state(root).evidence[0].kind, "computed");
  assert.equal(state(root).runs[0].kind, "audit");
  assert.equal(Object.hasOwn(frozen(root), "design_id"), false);
  assert.deepEqual(frozen(root).transformations, examples.plans.preparation.transformations);
  assert.equal(runs.verify(root).ok, true);
});

test("ordinary audits without transformations retain the rc.2 authoring contract", t => {
  const root = project(t);
  start(root, examples.plans.ordinary_audit);
  write(root, "run-extension", "audit.txt", "Ordinary synthetic audit note.\n");
  runs.finalize(root, { ...identity(root, "event-finalize"), run_id: "run-extension", code_paths: [], output_paths: ["audit.txt"],
    diagnostic_paths: [], environment: { authoring: "Synthetic ordinary audit" }, deviations: [] });
  assert.equal(runs.verify(root).ok, true);
});

test("a report freezes its source excerpt even when the current evidence wording is corrected later", t => {
  const root = project(t);
  const evidence = { evidence_id: "evidence-wording", kind: "user_statement", source_ref: "fixture:original-message",
    summary: "Qualified original recollection.", source_excerpt: "I think offers were randomized." };
  record(root, { evidence: [evidence] });
  start(root, { kind: "report", objective: "Preserve the selected evidence version", claim_boundary: "Qualified recollection only",
    inputs: [], purpose: "Planning", evidence_refs: [evidence.evidence_id], format: "Markdown" });
  record(root, { evidence: [{ ...evidence, summary: "Later correction.", source_excerpt: "No offer was randomized." }] }, "event-corrected-wording");
  const report = frozen(root);
  assert.equal(report.evidence_bindings[0].source_excerpt, evidence.source_excerpt);
  assert.equal(state(root).evidence[0].source_excerpt, "No offer was randomized.");
  write(root, "run-extension", "report.md", "The original account was qualified; later interpretation requires its separately recorded correction.\n");
  runs.finalize(root, { ...identity(root, "event-finalize"), run_id: "run-extension", code_paths: [], output_paths: ["report.md"],
    diagnostic_paths: [], environment: { authoring: "Synthetic report fixture" }, deviations: [] });
  assert.equal(runs.verify(root).ok, true);
});

test("old semantic requests remain unchanged rather than acquiring extension fields during replay", () => {
  const original = { event_id: "event-old", expected_project_id: "project-extensions", expected_last_event_id: null,
    type: "memory_updated", payload: { changes: { candidate_routes: [strategy({ design_id: "randomized_assignment" })],
      evidence: [{ evidence_id: "evidence-old", kind: "user_statement", source_ref: "fixture:old", summary: "An old recorded fact." }] } } };
  const before = canonical(original);
  model.validateSemantic(model.emptyState("project-extensions", "2026-09-04T00:00:00Z"), original);
  assert.equal(canonical(original), before);
  const event = { schema_version: 7, project_id: original.expected_project_id, event_id: original.event_id, sequence: 1,
    previous_event_id: null, timestamp: "2026-09-04T00:00:00Z", type: original.type, payload: original.payload };
  const saved = model.applyEvent(model.emptyState("project-extensions", event.timestamp), event);
  assert.equal(Object.hasOwn(saved.candidate_routes[0], "additional_design_ids"), false);
  assert.equal(Object.hasOwn(saved.evidence[0], "source_excerpt"), false);
});
