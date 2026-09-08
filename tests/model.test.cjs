"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  CATALOG, emptyState, validateSemantic, applyEvent, jsonValue
} = require("../scripts/lib/model.cjs");

const FIXTURE = JSON.parse(fs.readFileSync(path.resolve(__dirname, "fixtures/state-examples.json"), "utf8"));
const TIME = "2026-09-03T12:00:00.000Z";
function envelope(state, request) {
  return {
    schema_version: 7, project_id: state.state_meta.project_id,
    event_id: request.event_id, sequence: state.state_meta.sequence + 1,
    previous_event_id: state.state_meta.last_event_id, timestamp: TIME,
    type: request.type, payload: structuredClone(request.payload)
  };
}
function initialized() {
  const state = emptyState(FIXTURE.init.project_id, TIME);
  return applyEvent(state, envelope(state, {
    event_id: FIXTURE.init.event_id, type: "init",
    payload: { project_understanding: FIXTURE.init.project_understanding }
  }));
}
function commit(state, request) {
  const before = structuredClone(state);
  validateSemantic(state, request);
  const next = applyEvent(state, envelope(state, request));
  assert.deepEqual(state, before, "validation and reduction must not mutate prior state");
  return next;
}
function through(count) {
  let state = initialized();
  for (const example of FIXTURE.records.slice(0, count)) state = commit(state, structuredClone(example.request));
  return state;
}
function memoryRequest(state, changes, suffix = "memory") {
  return {
    event_id: "event-" + suffix, expected_project_id: state.state_meta.project_id,
    expected_last_event_id: state.state_meta.last_event_id, type: "memory_updated", payload: { changes }
  };
}
function rejects(state, request, code) {
  assert.throws(() => validateSemantic(state, request), error => error.code === code);
}
function reviewRequest(state, assignment, suffix = "direct") {
  const request = structuredClone(FIXTURE.records[1].request);
  request.event_id = "event-" + suffix;
  request.expected_last_event_id = state.state_meta.last_event_id;
  request.payload.review.assignment = assignment;
  request.payload.checkpoint.selected_assignment = assignment;
  delete request.payload.changes.consultation;
  return request;
}

test("initialization establishes identity and source understanding without review machinery", () => {
  const state = initialized();
  assert.equal(state.state_meta.project_id, "project-demo");
  assert.equal(state.state_meta.schema_version, 7);
  assert.equal(state.state_meta.sequence, 1);
  assert.equal(state.state_meta.last_event_id, "event-init");
  assert.equal(state.consultation, null);
  assert.equal(state.project_understanding.objective, FIXTURE.init.project_understanding.objective);
  assert.deepEqual(state.history_index["event-init"], { kind: "event", event_ref: "event-init" });
});

test("checkpoint event foregrounds one question without inventing specialist work", () => {
  const state = through(1);
  assert.equal(state.consultation.checkpoint_id, "checkpoint-adoption");
  assert.equal(state.consultation.status, "awaiting_user");
  assert.equal(state.specialist_reviews.length, 0);
  assert.equal(state.questions[0].status, "open");
});

test("initialization derives creation time from its committed event, not a pre-commit clock read", () => {
  const temporaryTime = "2026-09-03T11:59:59.000Z";
  const state = emptyState("project-demo", temporaryTime);
  const event = envelope(state, { event_id: "event-init", type: "init", payload: { project_understanding: {} } });
  const initializedState = applyEvent(state, event);
  const replayedState = applyEvent(emptyState("project-demo", event.timestamp), event);
  assert.equal(initializedState.state_meta.created_at, event.timestamp);
  assert.deepEqual(initializedState, replayedState);
});

test("direct review commits its selection checkpoint and a distinct next checkpoint together", () => {
  const state = through(2);
  assert.equal(state.consultation.checkpoint_id, "checkpoint-identifier-stability");
  assert.equal(state.consultation.status, "awaiting_user");
  assert.deepEqual(state.history_index["checkpoint-audit-request"], { kind: "checkpoint", event_ref: "event-review-audit" });
  assert.equal(state.specialist_reviews.length, 1);
  assert.deepEqual(Object.keys(state.specialist_reviews[0]).sort(), ["completed_at", "event_ref", "review_id", "summary"]);
  assert.equal(state.specialist_reviews[0].event_ref, "event-review-audit");
  assert.equal(state.questions.filter(item => item.status === "open").length, 2);
});

test("same-design strategies retain distinct targets and independent standing", () => {
  const state = through(3);
  assert.equal(state.candidate_routes.length, 2);
  assert.ok(state.candidate_routes.every(item => item.design_id === "difference_in_differences"));
  assert.notEqual(state.candidate_routes[0].target, state.candidate_routes[1].target);
  assert.equal(state.candidate_routes.find(item => item.strategy_id === "strategy-all-districts").status, "conditional");
  assert.equal(state.candidate_routes.find(item => item.strategy_id === "strategy-stable-panel").status, "unsupported_with_current_evidence");
});

test("correction preserves prior evidence identity and an answered question without another review", () => {
  const state = through(3);
  assert.equal(state.consultation, null);
  assert.equal(state.specialist_reviews.length, 1);
  assert.equal(state.evidence.find(item => item.evidence_id === "evidence-panel-structure").summary, FIXTURE.records[1].request.payload.changes.evidence[1].summary);
  assert.equal(state.questions.find(item => item.question_id === "question-identifier-stability").status, "answered");
  assert.equal(state.questions.find(item => item.question_id === "question-adoption").status, "open");
  assert.equal(state.history_index["question-identifier-stability"].event_ref, "event-identifier-correction");
  assert.equal(state.history_index["event-review-audit"].kind, "event");
});

test("complete replay produces exactly the same semantic projection", () => {
  const left = through(3);
  const right = through(3);
  assert.deepEqual(left, right);
});

test("a review without a next checkpoint marks its own selection checkpoint complete", () => {
  const state = initialized();
  const next = commit(state, reviewRequest(state, { specialist_id: "data_audit", operation: "review" }));
  assert.equal(next.consultation.checkpoint_id, "checkpoint-audit-request");
  assert.equal(next.consultation.status, "specialist_complete");
});

test("a review can explicitly clear the current checkpoint", () => {
  const state = initialized();
  const request = reviewRequest(state, { specialist_id: "data_audit", operation: "review" });
  request.payload.changes.consultation = null;
  assert.equal(commit(state, request).consultation, null);
});

test("a historical selection checkpoint does not replace an unrelated current checkpoint", () => {
  let state = through(2);
  const request = {
    event_id: "event-historical-review", expected_project_id: "project-demo", expected_last_event_id: state.state_meta.last_event_id,
    type: "review_completed", payload: {
      review: {
        review_id: "review-historical", summary: "Follow-up on the earlier bounded audit.",
        assignment: { specialist_id: "data_audit", operation: "review" },
        question_addressed: "Verify the earlier recorded coverage finding.",
        selection_basis: { checkpoint_id: "checkpoint-audit-request", user_contribution_refs: ["evidence-user-audit"] },
        work_performed: ["Rechecked the relevant coverage note."], findings: ["The earlier coverage description remains limited by identifier stability."]
      }
    }
  };
  state = commit(state, request);
  assert.equal(state.consultation.checkpoint_id, "checkpoint-identifier-stability");
  assert.equal(state.consultation.status, "awaiting_user");
});

test("all mapped specialist operations and design/support combinations are accepted", () => {
  for (const [specialist_id, operations] of Object.entries(CATALOG.specialists)) for (const operation of operations) {
    const state = initialized();
    if (specialist_id === "design_worker") {
      for (const design_id of CATALOG.designs) {
        const assignment = { specialist_id, operation, design_id, support_ids: [...CATALOG.supports] };
        assert.doesNotThrow(() => validateSemantic(state, reviewRequest(state, assignment)));
      }
    } else assert.doesNotThrow(() => validateSemantic(state, reviewRequest(state, { specialist_id, operation })));
  }
});

test("unknown specialist, operation, design, support and irrelevant design ID are rejected", () => {
  const state = initialized();
  for (const assignment of [
    { specialist_id: "team_lead", operation: "review" },
    { specialist_id: "data_audit", operation: "execution" },
    { specialist_id: "design_worker", operation: "execution" },
    { specialist_id: "design_worker", operation: "execution", design_id: "unknown" },
    { specialist_id: "data_audit", operation: "review", design_id: "difference_in_differences" },
    { specialist_id: "data_audit", operation: "review", support_ids: ["unknown"] }
  ]) rejects(state, reviewRequest(state, assignment), "INVALID_INPUT");
});

test("same-event references are validated after collecting all newly defined identities", () => {
  assert.doesNotThrow(() => through(2));
  const state = initialized();
  const request = memoryRequest(state, {
    assumptions: [{ assumption_id: "assumption-1", statement: "Timing is as described.", status: "active", basis_refs: ["evidence-later"] }],
    evidence: [{ evidence_id: "evidence-later", kind: "user_statement", source_ref: "chat:turn-1", summary: "Timing account." }]
  });
  assert.equal(commit(state, request).assumptions[0].basis_refs[0], "evidence-later");
});

test("unknown references and wrong reference kinds cannot establish review provenance", () => {
  const state = initialized();
  for (const mutate of [
    req => { req.payload.review.selection_basis.checkpoint_id = "checkpoint-missing"; },
    req => { req.payload.review.selection_basis.user_contribution_refs = ["evidence-panel-structure"]; },
    req => { req.payload.review.evidence_refs = ["strategy-all-districts"]; },
    req => { req.payload.review.assignment.strategy_ids = ["strategy-missing"]; }
  ]) {
    const request = reviewRequest(state, { specialist_id: "data_audit", operation: "review" });
    mutate(request);
    rejects(state, request, "UNKNOWN_REFERENCE");
  }
});

test("review requires nonempty user contribution, work and findings records", () => {
  const state = initialized();
  for (const field of ["work_performed", "findings", "user_contribution_refs"]) {
    const request = reviewRequest(state, { specialist_id: "data_audit", operation: "review" });
    if (field === "user_contribution_refs") request.payload.review.selection_basis[field] = [];
    else request.payload.review[field] = [];
    rejects(state, request, "INVALID_INPUT");
  }
});

test("completed review IDs are immutable even under a different event ID", () => {
  const state = through(2);
  const request = structuredClone(FIXTURE.records[1].request);
  request.event_id = "event-duplicate-review";
  request.expected_last_event_id = state.state_meta.last_event_id;
  rejects(state, request, "DUPLICATE_ID");
});

test("duplicate same-event and cross-kind identities are rejected", () => {
  const state = initialized();
  const record = { evidence_id: "evidence-duplicate", kind: "file", source_ref: "input.csv", summary: "Data." };
  rejects(state, memoryRequest(state, { evidence: [record, { ...record }] }), "DUPLICATE_ID");
  rejects(state, memoryRequest(state, {
    evidence: [record], questions: [{ question_id: record.evidence_id, statement: "Question?", status: "open" }]
  }), "DUPLICATE_ID");
  rejects(state, memoryRequest(state, { questions: [{ question_id: "event-init", statement: "Question?", status: "open" }] }), "DUPLICATE_ID");
});

test("wrong project and stale predecessor are rejected without changing state", () => {
  const state = initialized();
  const request = memoryRequest(state, {});
  rejects(state, { ...request, expected_project_id: "project-other" }, "PROJECT_MISMATCH");
  rejects(state, { ...request, expected_last_event_id: null }, "STALE_WRITE");
  assert.equal(state.state_meta.sequence, 1);
});

test("strict shape rejects unknown fields and nested prototype-related keys", () => {
  const state = initialized();
  rejects(state, { ...memoryRequest(state, {}), approval: true }, "INVALID_INPUT");
  rejects(state, memoryRequest(state, { discarded_questions: [] }), "INVALID_INPUT");
  rejects(state, memoryRequest(state, { project_understanding: { causal_target: "Target", approval: true } }), "INVALID_INPUT");
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const value = JSON.parse('{"nested":{"' + key + '":{"polluted":true}}}');
    assert.throws(() => jsonValue(value), error => error.code === "INVALID_INPUT");
  }
  assert.equal({}.polluted, undefined);
});

test("invalid IDs and non-JSON data are rejected", () => {
  const state = initialized();
  for (const question_id of ["../escape", "", "A", "constructor", "prototype", "__proto__"]) {
    rejects(state, memoryRequest(state, { questions: [{ question_id, statement: "Question?", status: "open" }] }), "INVALID_INPUT");
  }
  for (const value of [undefined, NaN, new Date()]) assert.throws(() => jsonValue(value), error => error.code === "INVALID_INPUT");
  const cyclic = {}; cyclic.self = cyclic;
  assert.throws(() => jsonValue(cyclic), error => error.code === "INVALID_INPUT");
});

test("answered and retired questions need a durable reason", () => {
  const state = initialized();
  for (const status of ["answered", "retired"]) rejects(state, memoryRequest(state, {
    questions: [{ question_id: "question-old", statement: "Original question?", status }]
  }), "INVALID_INPUT");
});

test("empty upsert arrays retain records and partial understanding retains unrelated facts", () => {
  const state = through(3);
  const next = commit(state, memoryRequest(state, {
    questions: [], evidence: [], assumptions: [], decisions: [], candidate_routes: [], project_understanding: { audience: "Expert researcher" }
  }));
  for (const collection of ["questions", "evidence", "candidate_routes"]) assert.deepEqual(next[collection], state[collection]);
  assert.equal(next.project_understanding.objective, state.project_understanding.objective);
  assert.equal(next.project_understanding.audience, "Expert researcher");
});

test("correction must reference committed history, not merely a new record in the same event", () => {
  const state = initialized();
  const request = memoryRequest(state, { questions: [{ question_id: "question-new", statement: "Question?", status: "open" }] });
  request.type = "correction";
  request.payload.corrects_refs = ["question-new"];
  request.payload.reason = "A correction.";
  rejects(state, request, "UNKNOWN_REFERENCE");
});

test("legacy summaries remain labeled and cannot pretend to be a verified run", () => {
  const state = initialized();
  const record = {
    evidence_id: "evidence-legacy", kind: "file", source_ref: "legacy/report.html", summary: "Earlier reported finding.",
    legacy: { source_project: "external/v6", source_version: "6.3.0", verification: "legacy_unverified" }
  };
  const next = commit(state, memoryRequest(state, { evidence: [record] }));
  assert.deepEqual(next.evidence[0].legacy, record.legacy);
  assert.equal(next.runs.length, 0);
  record.legacy.verification = "verified_v7_run";
  rejects(state, memoryRequest(state, { evidence: [record] }), "INVALID_INPUT");
});

test("assumption and decision updates preserve stable identities and superseding references", () => {
  let state = initialized();
  state = commit(state, memoryRequest(state, {
    assumptions: [{ assumption_id: "assumption-old", statement: "Original account.", status: "active" }],
    decisions: [{ decision_id: "decision-old", kind: "target", statement: "Original target.", status: "current" }]
  }, "old-records"));
  const next = commit(state, memoryRequest(state, {
    assumptions: [
      { assumption_id: "assumption-old", statement: "Original account.", status: "revised" },
      { assumption_id: "assumption-new", statement: "Revised account.", status: "active", supersedes: "assumption-old" }
    ],
    decisions: [
      { decision_id: "decision-old", kind: "target", statement: "Original target.", status: "superseded" },
      { decision_id: "decision-new", kind: "target", statement: "Revised target.", status: "current", supersedes: "decision-old" }
    ]
  }, "revised-records"));
  assert.equal(next.assumptions.length, 2);
  assert.equal(next.decisions.length, 2);
  assert.equal(state.assumptions[0].status, "active");
});

test("long histories retain old resolved facts, all question identities, and old evidence lookup", () => {
  let state = through(3);
  const originalQuestion = structuredClone(state.questions.find(row => row.question_id === "question-identifier-stability"));
  for (let i = 0; i < 100; i++) {
    const changes = { questions: [{ question_id: "question-history-" + i, statement: "History question " + i, status: "answered", reason: "Resolved in a recorded review." }] };
    if (i < 40) changes.evidence = [{ evidence_id: "evidence-history-" + i, kind: "file", source_ref: "artifact-" + i + ".txt", summary: "Historical evidence " + i }];
    state = commit(state, memoryRequest(state, changes, "history-" + i));
  }
  assert.equal(state.questions.length, 102);
  assert.deepEqual(state.questions.find(row => row.question_id === originalQuestion.question_id), originalQuestion);
  assert.equal(state.history_index["evidence-panel-structure"].event_ref, "event-review-audit");
  assert.equal(state.history_index["question-identifier-stability"].event_ref, "event-identifier-correction");
  assert.equal(state.candidate_routes.length, 2);
});

test("public record API cannot forge initialization or run lifecycle events", () => {
  const state = initialized();
  for (const type of ["init", "run_started", "run_finalized", "run_failed", "run_abandoned"]) {
    rejects(state, { ...memoryRequest(state, {}), type }, "INVALID_INPUT");
  }
});

test("internal run projection records start and terminal status without rewriting another run", () => {
  for (const [type, status] of [["run_finalized", "completed"], ["run_failed", "failed"], ["run_abandoned", "abandoned"]]) {
    let state = initialized();
    const run = { run_id: "run-demo", status: "in_progress", plan_ref: "runs/run-demo/plan.yaml", plan_sha256: "a".repeat(64), claim_boundary: "Descriptive only.", started_at: TIME };
    state = applyEvent(state, envelope(state, { event_id: "event-start", type: "run_started", payload: { run } }));
    assert.equal(state.runs[0].status, "in_progress");
    const next = applyEvent(state, envelope(state, { event_id: "event-terminal", type, payload: { run: { ...run, status, completed_at: TIME, reason: "Fixture terminal state." } } }));
    assert.equal(next.runs[0].status, status);
    assert.equal(state.runs[0].status, "in_progress");
    assert.equal(next.history_index["run-demo"].event_ref, "event-terminal");
    assert.throws(() => applyEvent(next, envelope(next, { event_id: "event-again", type, payload: { run: { ...run, status } } })), error => error.code === "INVALID_EVENT");
  }
});

test("event replay rejects invalid ordering, duplicate IDs, wrong identity and a second init", () => {
  const state = initialized();
  const request = memoryRequest(state, {});
  const event = envelope(state, request);
  for (const broken of [
    { ...event, sequence: 9 }, { ...event, previous_event_id: null }
  ]) assert.throws(() => applyEvent(state, broken), error => error.code === "INVALID_EVENT");
  assert.throws(() => applyEvent(state, { ...event, project_id: "project-other" }), error => error.code === "PROJECT_MISMATCH");
  assert.throws(() => applyEvent(state, { ...event, event_id: "event-init" }), error => error.code === "DUPLICATE_ID");
  assert.throws(() => applyEvent(state, { ...event, type: "init", payload: { project_understanding: {} } }), error => error.code === "INVALID_EVENT");
});
