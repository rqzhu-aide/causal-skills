"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const store = require("../scripts/lib/store.cjs");
const fixture = require("./fixtures/question-chain-rc3.json");

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cc-question-chain-"));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("cc-question-chain-"));
    fs.rmSync(root, { recursive: true, force: true });
  });
  let receipt = store.init(root, fixture.init);
  return { root, record(eventId, type, payload) {
    receipt = store.record(root, { event_id: eventId, expected_project_id: receipt.project_id,
      expected_last_event_id: receipt.last_event_id, type, payload });
    return receipt;
  } };
}

test("existing records preserve the specialist proposal, lead checkpoint, deferral and qualified answer across resume", t => {
  const p = project(t);
  p.record("event-audit", fixture.audit.type, fixture.audit.payload);
  let state = store.status(p.root).project;
  assert.equal(state.specialist_reviews.length, 1);
  assert.deepEqual(state.consultation.related_unresolved_question_refs, ["question-start"]);
  const proposal = store.history(p.root, { record_id: "review-audit" }).events[0].payload.review;
  assert.equal(proposal.selection_basis.checkpoint_id, "checkpoint-audit");
  assert.equal(proposal.remaining_uncertainty[0], fixture.audit.payload.review.remaining_uncertainty[0]);
  const original = structuredClone(state.questions[0]);
  p.record("event-ambiguous", "memory_updated", { changes: {
    evidence: [fixture.ambiguous_answer], questions: [{ ...original, reason: fixture.deferral_reason }], consultation: null
  } });
  // A new status reconstructs journal authority rather than relying on conversational recall.
  state = store.status(p.root).project;
  assert.equal(state.questions[0].status, "open");
  assert.deepEqual(state.questions[0].basis_refs, original.basis_refs);
  assert.equal(state.candidate_routes[0].status, "conditional");
  const strategy = structuredClone(state.candidate_routes[0]);
  p.record("event-clarified", "memory_updated", { changes: {
    evidence: [fixture.precise_answer],
    questions: [{ ...state.questions[0], status: "answered", reason: fixture.resolution,
      basis_refs: [...state.questions[0].basis_refs, fixture.precise_answer.evidence_id] }],
    candidate_routes: [{ ...strategy, reason: "Booking cannot anchor attendance follow-up; inspect the offered event table",
      unmet_requirements: ["Inspect and validate actual attendance dates"], evidence_for: [...strategy.evidence_for, fixture.precise_answer.evidence_id] }],
    project_understanding: { current_claim_boundary: "No attendance-based follow-up construction until actual attendance is established" }
  } });
  state = store.status(p.root).project;
  assert.equal(state.questions[0].status, "answered");
  assert.equal(state.questions[0].reason, fixture.resolution);
  assert.equal(state.candidate_routes[0].last_review_id, strategy.last_review_id);
  assert.deepEqual(state.candidate_routes[0].data_requirements, strategy.data_requirements);
  assert.equal(state.specialist_reviews.length, 1, "Clarification is not a second specialist review");
  const versions = store.history(p.root, { record_id: "question-start" }).events;
  assert.equal(versions.length, 3);
  assert.equal(versions[0].payload.changes.questions[0].status, "open");
  assert.equal(state.evidence.find(item => item.evidence_id === "user-start-precise").limitations[0], fixture.precise_answer.limitations[0]);
});

test("retiring an unavailable question preserves its basis and does not assert the missing fact", t => {
  const p = project(t);
  p.record("event-audit", fixture.audit.type, fixture.audit.payload);
  const question = store.status(p.root).project.questions[0];
  p.record("event-declined", "memory_updated", { changes: {
    questions: [{ ...question, status: "retired", reason: "The record is unavailable and staff contact is declined; date meaning remains unknown" }],
    consultation: null, project_understanding: { current_claim_boundary: "No attendance-based causal interpretation; date meaning remains unknown" }
  } });
  const state = store.status(p.root).project;
  assert.equal(state.questions[0].status, "retired");
  assert.deepEqual(state.questions[0].basis_refs, question.basis_refs);
  assert.equal(state.candidate_routes[0].status, "conditional");
  assert.equal(state.specialist_reviews.length, 1);
});

test("same-ID records remain complete replacements; preserving optional fields is a caller responsibility", t => {
  const p = project(t);
  p.record("event-audit", fixture.audit.type, fixture.audit.payload);
  p.record("event-replacement", "memory_updated", { changes: { questions: [{ question_id: "question-start",
    statement: "The same question", status: "open" }] } });
  const state = store.status(p.root).project;
  assert.equal(Object.hasOwn(state.questions[0], "basis_refs"), false);
  assert.equal(store.history(p.root, { record_id: "question-start" }).events[0].payload.changes.questions[0].basis_refs.length, 2);
});
