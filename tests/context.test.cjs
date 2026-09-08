"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const store = require("../scripts/lib/store.cjs");
const { createFixture, fixture } = require("./fixtures/context-rc3.cjs");
const cli = path.resolve(__dirname, "../scripts/project.cjs");
const keys = { questions: "question_id", evidence: "evidence_id", assumptions: "assumption_id",
  decisions: "decision_id", candidate_routes: "strategy_id", specialist_reviews: "review_id", runs: "run_id" };
const code = expected => error => error.code === expected;

function project(t, options = {}) {
  const base = fs.realpathSync.native(os.tmpdir());
  const owned = fs.mkdtempSync(path.join(base, "causal-context-test-"));
  t.after(() => {
    const relative = path.relative(base, fs.realpathSync.native(owned));
    assert.ok(!path.isAbsolute(relative) && !relative.startsWith("..") && relative.startsWith("causal-context-test-"));
    fs.rmSync(owned, { recursive: true, force: true });
  });
  const root = path.join(owned, "project");
  createFixture(store, root, options);
  return root;
}
function refs(context) {
  return new Set(Object.entries(keys).flatMap(([name, key]) => context[name].map(record => record[key])));
}
function hasRefs(context, expected) {
  const actual = refs(context);
  for (const value of expected || []) assert.ok(actual.has(value), "Missing consequential record " + value);
}
function append(root, event_id, changes, type = "memory_updated", extra = {}) {
  const state = store.status(root).project;
  return store.record(root, { event_id, expected_project_id: state.state_meta.project_id,
    expected_last_event_id: state.state_meta.last_event_id, type, payload: { changes, ...extra } });
}
function treeHash(root) {
  const entries = [];
  function visit(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, item.name);
      if (item.isDirectory()) visit(target);
      else entries.push(path.relative(root, target) + "\t" + crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"));
    }
  }
  visit(root);
  return crypto.createHash("sha256").update(entries.join("\n")).digest("hex");
}

test("focused context retains old resolution, contrary evidence, correction dependents and constraints", t => {
  const root = project(t);
  const expected = fixture.cases.find(item => item.id === "focused");
  const current = store.status(root).project;
  const before = treeHash(root);
  const result = store.context(root, expected.request);
  hasRefs(result.context, expected.required_refs);
  for (const value of expected.omitted_refs) assert.ok(!refs(result.context).has(value), "Unrelated record was pulled into a known focus: " + value);
  assert.deepEqual(result.context.project_understanding, current.project_understanding);
  assert.deepEqual(result.context.consultation, current.consultation);
  assert.equal(result.project_id, fixture.project_id);
  assert.equal(result.last_event_id, current.state_meta.last_event_id);
  assert.equal(result.sequence, current.state_meta.sequence);
  assert.equal(result.projection_current, true);
  assert.equal(Object.hasOwn(result.context, "history_index"), false);
  assert.equal(Object.hasOwn(result.context, "state_meta"), false);
  assert.deepEqual(result.context.evidence.find(item => item.evidence_id === "evidence-assignment-original"),
    current.evidence.find(item => item.evidence_id === "evidence-assignment-original"));
  assert.equal(treeHash(root), before, "Context must not write a projection, a log or another cache.");
});

test("focusing an ordinary premise reveals reverse dependents without needing a correction to it", t => {
  const root = project(t);
  const expected = fixture.cases.find(item => item.id === "focal-premise");
  const result = store.context(root, expected.request);
  hasRefs(result.context, expected.required_refs);
  assert.ok(!refs(result.context).has("evidence-unlinked"));
  assert.ok(result.selection.reasons.some(item => item.record_ref === "strategy-attendance" && item.reason.includes("reverse")));
});

test("journal review links and historical checkpoints remain discoverable without widening review records", t => {
  const root = project(t);
  const expected = fixture.cases.find(item => item.id === "review-history");
  const result = store.context(root, expected.request);
  hasRefs(result.context, expected.required_refs);
  const review = result.context.specialist_reviews.find(item => item.review_id === "review-allocation");
  assert.deepEqual(Object.keys(review).sort(), ["completed_at", "event_ref", "review_id", "summary"]);
  assert.ok(result.coverage.omission_reasons.some(reason => reason.includes("checkpoint-reviewed") && reason.includes("history")));
  const history = store.history(root, { record_id: "checkpoint-reviewed" });
  assert.ok(history.events.some(event => event.payload.checkpoint?.checkpoint_id === "checkpoint-reviewed"));
  assert.equal(result.context.consultation.checkpoint_id, "checkpoint-current");
});

test("an explicit historical-only root is refused with a retrieval direction", t => {
  const root = project(t);
  for (const record of ["checkpoint-reviewed", "event-assignment", "not-a-known-record"]) {
    assert.throws(() => store.context(root, { focus_refs: [record] }), error => error.code === "UNKNOWN_REFERENCE" && error.message.includes("history"));
  }
});

test("event-only correction links reveal their changed premise even without supersedes", t => {
  const root = project(t);
  append(root, "event-extra-source", { evidence: [{ evidence_id: "evidence-extra-old", kind: "user_statement", source_ref: "chat:extra-old", summary: "Earlier allocation detail." }] });
  append(root, "event-extra-decision", { decisions: [{ decision_id: "decision-extra", kind: "design", statement: "Depends on the earlier detail.", status: "current", basis_refs: ["evidence-extra-old"] }] });
  append(root, "event-extra-correction", { evidence: [{ evidence_id: "evidence-extra-new", kind: "user_statement", source_ref: "chat:extra-new", summary: "The earlier detail was wrong." }] },
    "correction", { corrects_refs: ["event-extra-source"], reason: "Correct the prior detail from its original event." });
  const result = store.context(root, { focus_refs: ["evidence-extra-new"] });
  hasRefs(result.context, ["evidence-extra-old", "evidence-extra-new", "decision-extra"]);
  assert.ok(result.coverage.omission_reasons.some(reason => reason.includes("event-extra-correction")));
});

test("a correction covering multiple events retains each affected premise and dependent", t => {
  const root = project(t);
  for (const suffix of ["a", "b"]) {
    append(root, "event-multi-" + suffix, { evidence: [{ evidence_id: "evidence-multi-" + suffix, kind: "user_statement", source_ref: "chat:multi-" + suffix, summary: "Prior fact " + suffix }] });
    append(root, "event-dependent-" + suffix, { decisions: [{ decision_id: "decision-multi-" + suffix, kind: "design", statement: "Depends on fact " + suffix, status: "current", basis_refs: ["evidence-multi-" + suffix] }] });
  }
  append(root, "event-multi-correction", { evidence: [{ evidence_id: "evidence-multi-new", kind: "user_statement", source_ref: "chat:multi-correction", summary: "Both earlier accounts need revision." }] },
    "correction", { corrects_refs: ["event-multi-a", "event-multi-b"], reason: "The user corrects both original accounts." });
  const result = store.context(root, { focus_refs: ["evidence-multi-new"] });
  hasRefs(result.context, ["evidence-multi-new", "evidence-multi-a", "evidence-multi-b", "decision-multi-a", "decision-multi-b"]);
  assert.ok(!refs(result.context).has("evidence-unlinked"));
});

test("same-ID evidence changes expose current content and a locator for its earlier versions", t => {
  const root = project(t);
  append(root, "event-stable-old", { evidence: [{ evidence_id: "evidence-stable", kind: "user_statement", source_ref: "chat:stable-old", summary: "The earlier account was uncertain." }] });
  append(root, "event-stable-dependent", { decisions: [{ decision_id: "decision-stable", kind: "design", statement: "Assess the stable evidence record.", status: "current", basis_refs: ["evidence-stable"] }] });
  append(root, "event-stable-new", { evidence: [{ evidence_id: "evidence-stable", kind: "user_statement", source_ref: "chat:stable-new", summary: "The current account explicitly corrects the earlier wording." }] });
  const result = store.context(root, { focus_refs: ["evidence-stable"] });
  hasRefs(result.context, ["decision-stable"]);
  assert.equal(result.context.evidence.find(record => record.evidence_id === "evidence-stable").source_ref, "chat:stable-new");
  assert.ok(result.coverage.omission_reasons.some(reason => reason.includes("history --record-id evidence-stable")));
  const prior = store.history(root, { record_id: "evidence-stable" }).events.find(event => event.event_id === "event-stable-old");
  assert.equal(prior.payload.changes.evidence[0].summary, "The earlier account was uncertain.");
});

for (const [collection, premise, changedField] of [
  ["evidence", { evidence_id: "premise", kind: "user_statement", source_ref: "chat:premise", summary: "Original account." }, "summary"],
  ["questions", { question_id: "premise", statement: "Original account?", status: "answered", reason: "Original response." }, "reason"],
  ["assumptions", { assumption_id: "premise", statement: "Original account.", status: "active" }, "statement"],
  ["decisions", { decision_id: "premise", kind: "design", statement: "Original account.", status: "current" }, "statement"],
  ["candidate_routes", { strategy_id: "premise", target: "Original target.", approach: "Original argument.", status: "conditional", reason: "Original account." }, "reason"]
]) {
  test("content-changed nonfocal " + collection + " reveal dependent conclusions without changing their status", t => {
    const root = project(t);
    const dependents = ["a", "b"].map(suffix => collection === "evidence"
      ? { strategy_id: "dependent-" + suffix, target: "Distinct target " + suffix, approach: "An argument based on the shared account.", status: "conditional", reason: "Review is incomplete.", evidence_for: ["premise"] }
      : { decision_id: "dependent-" + suffix, kind: "design", statement: "Conclusion " + suffix, status: "current", basis_refs: ["premise"] });
    const dependentCollection = collection === "evidence" ? "candidate_routes" : "decisions";
    append(root, "event-premise-first", { [collection]: [premise] });
    append(root, "event-premise-dependents", { [dependentCollection]: dependents });
    const request = { focus_refs: ["dependent-a"] };
    assert.ok(!refs(store.context(root, request).context).has("dependent-b"), "An unchanged shared leaf must not merge unrelated conclusions.");
    append(root, "event-premise-identical", { [collection]: [Object.fromEntries(Object.entries(premise).reverse())] });
    assert.ok(!refs(store.context(root, request).context).has("dependent-b"), "An identical resend with reordered keys must not count as a content change.");
    append(root, "event-premise-revised", { [collection]: [{ ...premise, [changedField]: "Revised account." }] });
    const before = treeHash(root);
    const result = store.context(root, request);
    hasRefs(result.context, ["premise", "dependent-a", "dependent-b"]);
    assert.ok(result.coverage.omission_reasons.some(reason => reason.includes("history --record-id premise")));
    const dependentKey = keys[dependentCollection];
    for (const record of dependents) assert.deepEqual(result.context[dependentCollection].find(item => item[dependentKey] === record[dependentKey]), record);
    assert.equal(treeHash(root), before, "Impact discovery must not invalidate or mutate conclusions.");
  });
}

test("current replacements are not presented as the historical content of an event reference", t => {
  const root = project(t);
  append(root, "event-source-old-version", { evidence: [{ evidence_id: "evidence-versioned", kind: "user_statement", source_ref: "chat:old-version", summary: "Old wording with a qualification." }] });
  append(root, "event-source-new-version", { evidence: [{ evidence_id: "evidence-versioned", kind: "user_statement", source_ref: "chat:new-version", summary: "New current wording." }],
    questions: [{ question_id: "question-event-basis", statement: "What was actually said earlier?", status: "open", basis_refs: ["event-source-old-version"] }] });
  const result = store.context(root, { focus_refs: ["question-event-basis"] });
  assert.ok(result.coverage.omission_reasons.some(reason => reason.includes("event-source-old-version") && reason.includes("history")));
  const current = result.context.evidence.find(item => item.evidence_id === "evidence-versioned");
  if (current) assert.equal(current.summary, "New current wording.");
  const old = store.history(root, { event_id: "event-source-old-version" }).events[0];
  assert.equal(old.payload.changes.evidence[0].summary, "Old wording with a qualification.");
});

test("query pages supplement essential evidence and keep stable complete matching coverage", t => {
  const root = project(t);
  const matched = new Set();
  let cursor = 0;
  let last;
  let pages = 0;
  do {
    const result = store.context(root, { query: "RETRIEVAL-PROBE", limit: 2, cursor, ...(last ? { expected_last_event_id: last } : {}) });
    hasRefs(result.context, ["strategy-offer", "evidence-schedule", "run-pending"]);
    const optional = result.context.questions.filter(item => item.question_id.startsWith("question-query-"));
    assert.equal(optional.length, 2);
    for (const item of optional) { assert.ok(!matched.has(item.question_id)); matched.add(item.question_id); }
    for (const [name, key] of Object.entries(keys)) {
      const counts = result.coverage.collections[name];
      assert.equal(counts.selected, result.context[name].length);
      assert.equal(counts.omitted, counts.total - counts.selected);
      assert.equal(new Set(result.context[name].map(item => item[key])).size, counts.selected);
    }
    cursor = result.coverage.next_cursor;
    last = result.last_event_id;
    assert.equal(result.coverage.selection_complete, cursor === null);
    pages++;
  } while (cursor !== null);
  assert.equal(pages, 3);
  assert.equal(matched.size, 6);
});

test("literal query does not interpret regex and query discovery does not imply a complete evidence neighborhood", t => {
  const root = project(t);
  append(root, "event-query-basis", {
    evidence: [{ evidence_id: "evidence-query-support", kind: "file", source_ref: "records/query-support.txt", summary: "A separate concrete source." }],
    questions: [{ question_id: "question-query-supported", statement: "needle-goal detail", status: "open", basis_refs: ["evidence-query-support"] }]
  });
  const result = store.context(root, { query: "needle-goal" });
  hasRefs(result.context, ["question-query-supported"]);
  assert.ok(!refs(result.context).has("evidence-query-support"));
  assert.ok(result.coverage.omission_reasons.some(reason => reason.includes("focus_refs")));
  hasRefs(store.context(root, { focus_refs: ["question-query-supported"] }).context, ["evidence-query-support"]);
  assert.ok(!refs(store.context(root, { query: ".*" }).context).has("question-query-supported"));
});

test("missing-link old questions remain visible through explicit full-status fallback", t => {
  const root = project(t);
  const focused = store.context(root);
  assert.ok(!refs(focused.context).has("question-unasked"));
  assert.ok(focused.coverage.collections.questions.omitted > 0);
  assert.ok(focused.coverage.omission_reasons.some(reason => reason.includes("status")));
  const complete = store.status(root);
  assert.equal(complete.project.questions.find(item => item.question_id === "question-unasked").status, "open");
  assert.equal(complete.project.questions.length, 110);
});

test("no-focus discovery pages can enumerate current records with no age-based loss", t => {
  const root = project(t, { clearCheckpoint: true });
  const expected = refs(store.status(root).project);
  const found = new Set();
  let cursor = 0;
  let last;
  do {
    const result = store.context(root, { limit: 20, cursor, ...(last ? { expected_last_event_id: last } : {}) });
    assert.equal(result.context.consultation, null);
    for (const record of refs(result.context)) found.add(record);
    cursor = result.coverage.next_cursor;
    last = result.last_event_id;
  } while (cursor !== null);
  assert.deepEqual([...found].sort(), [...expected].sort());
});

test("mandatory incomplete and orphan work survives unrelated explicit focus", t => {
  const root = project(t);
  const result = store.context(root, { focus_refs: ["evidence-unlinked"] });
  hasRefs(result.context, ["run-pending", "evidence-unlinked"]);
  assert.deepEqual(result.orphan_run_paths, ["orphan-attempt"]);
  assert.equal(result.context.runs.find(item => item.run_id === "run-pending").status, "in_progress");
  assert.equal(result.context.consultation.checkpoint_id, "checkpoint-current");
});

test("orphan linked entries are reported without traversing their external target", t => {
  const root = project(t);
  const outside = path.join(path.dirname(root), "outside");
  fs.mkdirSync(outside);
  const sentinel = path.join(outside, "sentinel.txt");
  fs.writeFileSync(sentinel, "Do not inspect as a project run.\n");
  try { fs.symlinkSync(outside, path.join(root, "runs", "orphan-linked"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Link creation unavailable: " + error.code); return; } throw error; }
  const result = store.context(root);
  assert.deepEqual(result.orphan_run_paths.sort(), ["orphan-attempt", "orphan-linked"]);
  assert.ok(!JSON.stringify(result).includes("Do not inspect as a project run."));
  assert.equal(fs.readFileSync(sentinel, "utf8"), "Do not inspect as a project run.\n");
});

test("essential overflow returns intact evidence instead of truncation or an automatic fallback", t => {
  const root = project(t);
  const ordinary = store.context(root);
  const overflow = store.context(root, { limit: 1 });
  assert.equal(overflow.coverage.exceeds_requested_limit, true);
  assert.deepEqual(overflow.context, ordinary.context);
  assert.equal(overflow.coverage.next_cursor, null);
  assert.equal(overflow.coverage.selection_complete, true);
});

test("cycles terminate and deterministic reads do not repeat selected records", t => {
  const root = project(t);
  append(root, "event-cycle", { questions: [
    { question_id: "question-cycle-a", statement: "A references B.", status: "open", basis_refs: ["question-cycle-b"] },
    { question_id: "question-cycle-b", statement: "B references A.", status: "open", basis_refs: ["question-cycle-a"] }
  ] });
  const result = store.context(root, { focus_refs: ["question-cycle-a"] });
  hasRefs(result.context, ["question-cycle-a", "question-cycle-b"]);
  assert.equal(result.context.questions.filter(item => item.question_id.startsWith("question-cycle-")).length, 2);
  assert.deepEqual(store.context(root, { focus_refs: ["question-cycle-a"] }), result);
});

test("arbitrary source text that resembles an ID creates no dependency edge", t => {
  const root = project(t);
  append(root, "event-id-like-source", { evidence: [{ evidence_id: "evidence-id-text", kind: "file", source_ref: "evidence-unlinked", summary: "This locator resembles an internal ID; it is not a typed reference." }] });
  const result = store.context(root, { focus_refs: ["evidence-id-text"] });
  hasRefs(result.context, ["evidence-id-text"]);
  assert.ok(!refs(result.context).has("evidence-unlinked"));
});

test("focused delivery preserves new evidence qualifiers and composed strategy fields", t => {
  const root = project(t);
  const evidence = { evidence_id: "evidence-exact-wording", kind: "user_statement", source_ref: "chat:exact-wording",
    summary: "The speaker is unsure whether all neighbors were eligible.", source_excerpt: "I think all neighbors were eligible, but I did not check.",
    limitations: ["The speaker did not inspect the eligibility records."] };
  const strategy = { strategy_id: "strategy-composed", target: "Effect under joint assignment and exposure", approach: "A single composed argument.",
    design_id: "randomized_assignment", additional_design_ids: ["interference_spillovers"], status: "conditional",
    reason: "Eligibility and joint exposure need checking.", evidence_for: [evidence.evidence_id] };
  append(root, "event-composed-context", { evidence: [evidence], candidate_routes: [strategy] });
  const result = store.context(root, { focus_refs: [strategy.strategy_id] });
  assert.deepEqual(result.context.evidence.find(item => item.evidence_id === evidence.evidence_id), evidence);
  assert.deepEqual(result.context.candidate_routes.find(item => item.strategy_id === strategy.strategy_id), strategy);
  assert.ok(!result.selection.reasons.some(item => item.record_ref === "interference_spillovers"));
});

test("pagination guards reject absent identity and changed journals before mixing pages", t => {
  const root = project(t);
  const first = store.context(root, { query: "retrieval-probe", limit: 2 });
  assert.throws(() => store.context(root, { query: "retrieval-probe", limit: 2, cursor: first.coverage.next_cursor }), code("INVALID_INPUT"));
  append(root, "event-between-pages", { project_understanding: { intended_use: "The user changed the decision between pages." } });
  assert.throws(() => store.context(root, { query: "retrieval-probe", limit: 2, cursor: first.coverage.next_cursor,
    expected_last_event_id: first.last_event_id }), error => error.code === "STALE_CONTEXT" && error.details.current_last_event_id === "event-between-pages");
});

test("invalid context requests preserve project bytes", t => {
  const root = project(t);
  const before = treeHash(root);
  for (const request of [null, false, [], "query", { extra: true }, { query: " " }, { query: 2 }, { limit: 0 }, { limit: 101 },
    { limit: "2" }, { cursor: -1 }, { cursor: 1.1 }, { focus_refs: "strategy-offer" },
    { focus_refs: ["strategy-offer", "strategy-offer"] }, { focus_refs: ["constructor"] },
    JSON.parse('{"__proto__": {"polluted": true}}')]) {
    assert.throws(() => store.context(root, request), code("INVALID_INPUT"));
  }
  assert.equal(treeHash(root), before);
});

test("context reconstructs stale projection without writing it and refuses corrupt authoritative history", t => {
  const root = project(t);
  const projection = path.join(root, "project.yaml");
  fs.writeFileSync(projection, "{}\n");
  const before = treeHash(root);
  const result = store.context(root);
  assert.equal(result.projection_current, false);
  hasRefs(result.context, ["evidence-assignment-revised"]);
  assert.equal(treeHash(root), before);
  const journal = path.join(root, "journal.jsonl");
  fs.appendFileSync(journal, '{"partial":');
  assert.throws(() => store.context(root), code("INCOMPLETE_JOURNAL"));
});

test("CLI context accepts optional JSON input and leaves status and history interfaces intact", t => {
  const root = project(t);
  const before = treeHash(root);
  const output = spawnSync(process.execPath, [cli, "context", "--project-root", root, "--input", "-"],
    { input: JSON.stringify({ focus_refs: ["evidence-population"] }), encoding: "utf8" });
  assert.equal(output.status, 0, output.stdout);
  hasRefs(JSON.parse(output.stdout).context, ["strategy-attendance"]);
  const ordinary = spawnSync(process.execPath, [cli, "context", "--project-root", root], { encoding: "utf8" });
  assert.equal(ordinary.status, 0, ordinary.stdout);
  assert.equal(JSON.parse(ordinary.stdout).last_event_id, "event-pending-run");
  const invalid = spawnSync(process.execPath, [cli, "context", "--project-root", root, "--limit", "2"], { encoding: "utf8" });
  assert.equal(JSON.parse(invalid.stdout).code, "INVALID_INPUT");
  assert.equal(store.status(root).project.questions.length, 110);
  assert.ok(store.history(root, { record_id: "question-unasked" }).events.length);
  assert.equal(treeHash(root), before);
});
