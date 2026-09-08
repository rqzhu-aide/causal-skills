"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const fixture = require("./context-rc3.json");

// The caller supplies the runtime being compared and an owned empty directory.
// This module never imports the current candidate's controller.
function createFixture(store, root, options = {}) {
  if (fs.existsSync(path.join(root, "journal.jsonl")) || fs.existsSync(path.join(root, "project.yaml"))) {
    throw new Error("Context fixture requires an empty project directory.");
  }
  fs.mkdirSync(root, { recursive: true });
  store.init(root, { project_id: fixture.project_id, event_id: "event-init", project_understanding: fixture.project_understanding });
  let previous = "event-init";
  const record = (item) => {
    store.record(root, { ...structuredClone(item), expected_project_id: fixture.project_id, expected_last_event_id: previous });
    previous = item.event_id;
  };
  for (const event of fixture.events) record(event);
  const questions = [];
  const evidence = [];
  for (let index = 0; index < fixture.padding.answered_questions; index++) {
    const serial = String(index).padStart(3, "0");
    questions.push({ question_id: "question-padding-" + serial, statement: "Archived independent question " + serial,
      status: "answered", reason: "The historic answer concerns an unrelated prior objective, not the clinic offer or attendance strategies." });
  }
  for (let index = 0; index < fixture.padding.file_evidence; index++) {
    const serial = String(index).padStart(3, "0");
    evidence.push({ evidence_id: "evidence-padding-" + serial, kind: "file", source_ref: "archive/record-" + serial + ".txt",
      summary: "Historical independent artifact " + serial + " supports a separate prior inquiry and carries no known reference to the present clinic analysis.",
      limitations: ["Kept for complete history; its age is not a deletion rule."] });
  }
  for (let index = 0; index < fixture.padding.query_questions; index++) {
    const serial = String(index).padStart(3, "0");
    questions.push({ question_id: "question-query-" + serial, statement: "retrieval-probe material " + serial,
      status: "open", reason: "An independent literal-search match for pagination, not a selected question." });
  }
  record({ event_id: "event-padding", type: "memory_updated", payload: { changes: { questions, evidence } } });
  if (options.clearCheckpoint) record({ event_id: "event-clear-focus", type: "memory_updated", payload: { changes: { consultation: null } } });

  const plan = { plan_schema_version: 1, run_id: "run-pending", frozen_at: fixture.timestamp, kind: "audit",
    objective: "An independent interrupted inspection", question: "Did the separate inspection finish?",
    claim_boundary: "No completed finding.", inputs: [], diagnostics: [] };
  const serialized = JSON.stringify(plan, null, 2) + "\n";
  fs.mkdirSync(path.join(root, "runs", "run-pending"), { recursive: true });
  fs.writeFileSync(path.join(root, "runs", "run-pending", "plan.yaml"), serialized, { flag: "wx" });
  store.transact(root, { event_id: "event-pending-run", expected_project_id: fixture.project_id, expected_last_event_id: previous }, () => ({
    type: "run_started", payload: { run: { run_id: "run-pending", kind: "audit", status: "in_progress",
      plan_ref: "runs/run-pending/plan.yaml", plan_sha256: crypto.createHash("sha256").update(serialized).digest("hex"),
      claim_boundary: plan.claim_boundary, started_at: fixture.timestamp } }
  }), { eventType: "run_started" });
  fs.mkdirSync(path.join(root, "runs", "orphan-attempt"));
  fs.writeFileSync(path.join(root, "runs", "orphan-attempt", "notes.txt"), "Uncommitted inspection attempt.\n", { flag: "wx" });
  return { project_id: fixture.project_id, cases: structuredClone(fixture.cases), last_event_id: "event-pending-run" };
}

module.exports = { fixture, createFixture };
