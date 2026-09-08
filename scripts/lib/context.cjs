"use strict";

const { fail, canonical } = require("./files.cjs");
const { jsonValue, object, text, id, array } = require("./model.cjs");

const COLLECTIONS = { questions: "question_id", evidence: "evidence_id", assumptions: "assumption_id",
  decisions: "decision_id", candidate_routes: "strategy_id", specialist_reviews: "review_id", runs: "run_id" };
const ARRAY_REFS = ["basis_refs", "evidence_refs", "user_contribution_refs", "route_changes",
  "assumptions_added_or_revised", "evidence_for", "evidence_against", "strategy_ids_it_could_change",
  "related_unresolved_question_refs"];
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function requestShape(value) {
  jsonValue(value);
  object(value, "context request", [], ["focus_refs", "query", "limit", "cursor", "expected_last_event_id"]);
  if (Object.hasOwn(value, "focus_refs")) {
    array(value.focus_refs, "focus_refs", id);
    if (new Set(value.focus_refs).size !== value.focus_refs.length) fail("INVALID_INPUT", "focus_refs must be distinct.");
  }
  if (Object.hasOwn(value, "query")) text(value.query, "query");
  const limit = value.limit === undefined ? 20 : value.limit;
  const cursor = value.cursor === undefined ? 0 : value.cursor;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail("INVALID_INPUT", "limit must be an integer from 1 to 100.");
  if (!Number.isSafeInteger(cursor) || cursor < 0) fail("INVALID_INPUT", "cursor must be a nonnegative integer.");
  if (Object.hasOwn(value, "expected_last_event_id")) id(value.expected_last_event_id, "expected_last_event_id");
  if (cursor > 0 && value.expected_last_event_id === undefined) fail("INVALID_INPUT", "Pages after the first require expected_last_event_id.");
  return { ...value, limit, cursor };
}

// Only documented internal reference fields form edges. Source locators,
// arbitrary prose, catalog IDs and the event containing a record do not.
function references(record, ownId) {
  const result = new Set();
  for (const field of ARRAY_REFS) for (const ref of record[field] || []) result.add(ref);
  for (const field of ["supersedes", "last_review_id", "run_id", "parent_run_id"]) {
    if (record[field] && record[field] !== ownId) result.add(record[field]);
  }
  for (const assignment of [record.assignment, record.selected_assignment]) {
    for (const ref of assignment?.strategy_ids || []) result.add(ref);
  }
  if (record.selection_basis) {
    result.add(record.selection_basis.checkpoint_id);
    for (const ref of record.selection_basis.user_contribution_refs || []) result.add(ref);
  }
  return [...result].sort(compare);
}

function graphFor(state, events) {
  const nodes = new Map();
  const forward = new Map();
  const reverse = new Map();
  const revisions = new Map();
  const changed = new Set();
  const definitions = new Map();
  const versions = new Map();
  const priorContents = new Map();
  const eventMap = new Map(events.map(event => [event.event_id, event]));
  const reviewBodies = new Map();
  const checkpoints = new Map();
  const add = (graph, from, to) => {
    if (!graph.has(from)) graph.set(from, new Set());
    graph.get(from).add(to);
  };
  const revision = (from, to) => {
    add(revisions, from, to); add(revisions, to, from);
    changed.add(from); changed.add(to);
  };

  for (const event of events) {
    const payload = event.payload;
    const defined = [];
    for (const [name, key] of Object.entries(COLLECTIONS)) {
      if (name === "specialist_reviews" || name === "runs") continue;
      for (const record of payload.changes?.[name] || []) {
        const ref = record[key];
        const contents = canonical(record);
        // A changed semantic premise warrants impact discovery, not a status
        // change. Identical re-sends and checkpoint/run lifecycle churn do not.
        if (priorContents.has(ref) && priorContents.get(ref) !== contents) changed.add(ref);
        priorContents.set(ref, contents);
        defined.push(ref);
      }
    }
    for (const checkpoint of [payload.checkpoint, payload.changes?.consultation]) {
      if (checkpoint) { checkpoints.set(checkpoint.checkpoint_id, checkpoint); defined.push(checkpoint.checkpoint_id); }
    }
    if (payload.review) { reviewBodies.set(payload.review.review_id, payload.review); defined.push(payload.review.review_id); }
    if (payload.run) defined.push(payload.run.run_id);
    definitions.set(event.event_id, [...new Set(defined)]);
    for (const ref of definitions.get(event.event_id)) versions.set(ref, (versions.get(ref) || 0) + 1);
    nodes.set(event.event_id, { kind: "event", record: event, current: false });
  }
  for (const [ref, record] of checkpoints) nodes.set(ref, { kind: "checkpoint", record, current: false });
  for (const [name, key] of Object.entries(COLLECTIONS)) for (const record of state[name]) {
    const ref = record[key];
    nodes.set(ref, { kind: name, record, current: true, links: name === "specialist_reviews" ? reviewBodies.get(ref) : record });
  }
  if (state.consultation) nodes.set(state.consultation.checkpoint_id, { kind: "checkpoint", record: state.consultation, current: true });

  for (const [ref, node] of nodes) {
    if (node.kind === "event") {
      // Event membership is forward-only. Reversing it would pull every
      // unrelated record that happened to be committed in the same event.
      for (const target of definitions.get(ref)) add(forward, ref, target);
      continue;
    }
    for (const target of references(node.links || node.record, ref)) {
      if (nodes.has(target)) { add(forward, ref, target); add(reverse, target, ref); }
    }
    if (node.record.supersedes) revision(ref, node.record.supersedes);
  }
  for (const event of events.filter(event => event.type === "correction")) {
    const targets = event.payload.corrects_refs.flatMap(ref => eventMap.has(ref) ? [ref, ...definitions.get(ref)] : [ref]);
    for (const target of [...targets, ...definitions.get(event.event_id)]) revision(event.event_id, target);
  }
  return { nodes, forward, reverse, revisions, changed, versions };
}

function stringValues(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(stringValues);
}

function selectContext(loaded, request = {}) {
  const options = requestShape(request);
  const { state, events } = loaded;
  if (options.expected_last_event_id !== undefined && options.expected_last_event_id !== state.state_meta.last_event_id) {
    fail("STALE_CONTEXT", "Project history changed; restart context pagination with the same focus and query.", {
      current_last_event_id: state.state_meta.last_event_id
    });
  }
  const { nodes, forward, reverse, revisions, changed, versions } = graphFor(state, events);
  for (const ref of options.focus_refs || []) {
    if (!nodes.get(ref)?.current) fail("UNKNOWN_REFERENCE", "focus_refs requires a current record; use history --record-id or --event-id for historical or unknown reference: " + ref);
  }
  const roots = new Set(options.focus_refs || []);
  if (state.consultation) {
    roots.add(state.consultation.checkpoint_id);
    for (const ref of [...(state.consultation.strategy_ids_it_could_change || []), ...(state.consultation.related_unresolved_question_refs || [])]) roots.add(ref);
  }
  const usefulFocus = roots.size > 0;
  const selected = new Map();
  const queue = [];
  const reverseQueue = [];
  const reverseSeen = new Set();
  const include = (ref, reason) => {
    if (!nodes.has(ref) || selected.has(ref)) return;
    selected.set(ref, reason); queue.push(ref);
    if (changed.has(ref)) reverseQueue.push(ref);
  };
  for (const ref of roots) {
    include(ref, (options.focus_refs || []).includes(ref) ? "explicit focus" : "current checkpoint focus");
    reverseQueue.push(ref);
  }
  for (const run of state.runs.filter(run => run.status === "in_progress")) include(run.run_id, "incomplete run");

  // Forward closure preserves all recorded bases and contrary evidence.
  // Reverse closure starts at focal or changed premises, not every shared
  // ordinary leaf. Sharing a population source is not itself one strategy.
  let forwardIndex = 0;
  let reverseIndex = 0;
  while (forwardIndex < queue.length || reverseIndex < reverseQueue.length) {
    while (forwardIndex < queue.length) {
      const ref = queue[forwardIndex++];
      for (const target of [...(forward.get(ref) || [])].sort(compare)) include(target, "direct basis: " + ref);
      for (const target of [...(revisions.get(ref) || [])].sort(compare)) include(target, "correction/supersession: " + ref);
    }
    while (reverseIndex < reverseQueue.length) {
      const ref = reverseQueue[reverseIndex++];
      if (reverseSeen.has(ref)) continue;
      reverseSeen.add(ref);
      for (const target of [...(reverse.get(ref) || [])].sort(compare)) {
        include(target, "reverse dependency: " + ref);
        reverseQueue.push(target);
      }
    }
  }

  const ordered = Object.entries(COLLECTIONS).flatMap(([name, key]) =>
    state[name].map(record => ({ ref: record[key], name, record })).sort((a, b) => compare(a.ref, b.ref)));
  const query = options.query?.toLowerCase();
  const optional = ordered.filter(item => !selected.has(item.ref) && (query !== undefined
    ? stringValues(item.record).some(value => value.toLowerCase().includes(query)) : !usefulFocus));
  const page = optional.slice(options.cursor, options.cursor + options.limit);
  const essentialCount = [...selected.keys()].filter(ref => nodes.get(ref).current).length;
  for (const item of page) selected.set(item.ref, query !== undefined ? "query match; focus for dependencies" : "broad discovery");
  const context = { project_understanding: structuredClone(state.project_understanding), consultation: structuredClone(state.consultation) };
  const collections = {};
  for (const [name, key] of Object.entries(COLLECTIONS)) {
    context[name] = state[name].filter(record => selected.has(record[key])).sort((a, b) => compare(a[key], b[key])).map(record => structuredClone(record));
    collections[name] = { total: state[name].length, selected: context[name].length, omitted: state[name].length - context[name].length };
  }
  const next = options.cursor + page.length < optional.length ? options.cursor + page.length : null;
  const omissions = [];
  if (Object.values(collections).some(count => count.omitted)) {
    omissions.push("Records outside this page or recorded neighborhood are omitted. Use literal query, focus_refs, history or complete status when links or current focus are insufficient.");
  }
  if (query !== undefined) omissions.push("Query matches are discovery suggestions; use focus_refs for their full recorded neighborhood. Page completeness is not scientific sufficiency.");
  if (!usefulFocus && query === undefined) omissions.push("No useful focus is recorded; this is broad paginated discovery. Complete status is available in one read.");
  for (const ref of [...selected.keys()].sort(compare)) {
    const node = nodes.get(ref);
    if (!node.current) omissions.push("Historical content is not reproduced here: history " + (node.kind === "event" ? "--event-id " : "--record-id ") + ref + ". Current replacements do not establish an earlier version.");
    if (node.current && versions.get(ref) > 1) omissions.push("Earlier versions: history --record-id " + ref + ". Current content is the latest record.");
    if (node.kind === "specialist_reviews") omissions.push("Full review findings and limitations: history --event-id " + node.record.event_ref + " (review " + ref + ").");
  }
  return { context, selection: { focus_refs: [...roots].sort(compare), reasons: [...selected.entries()]
    .filter(([ref]) => nodes.get(ref).current).sort(([a], [b]) => compare(a, b)).map(([record_ref, reason]) => ({ record_ref, reason })) },
    coverage: { collections, omission_reasons: omissions, next_cursor: next,
      exceeds_requested_limit: essentialCount > options.limit, selection_complete: next === null } };
}

module.exports = { selectContext };
