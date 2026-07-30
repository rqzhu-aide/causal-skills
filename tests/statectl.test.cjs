"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const YAML = require("yaml");

const SKILL_ROOT = path.resolve(__dirname, "..");
const CLI = path.join(SKILL_ROOT, "scripts", "statectl.cjs");
const CODEX_HOOK = path.join(SKILL_ROOT, "project-hooks", ".codex", "project_state_stop_check.js");
const CLAUDE_HOOK = path.join(SKILL_ROOT, "project-hooks", ".claude", "project_state_stop_check.js");
const SOURCE_HOOK = path.join(SKILL_ROOT, "scripts", "statectl-src", "hook.cjs");
const FIXTURES = path.join(__dirname, "fixtures");

function temporaryProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "causal-statectl-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function execute(projectRoot, command, options = {}) {
  const args = [CLI, command, "--project-root", projectRoot, ...(options.args || [])];
  if (options.payload !== undefined) args.push("--input", "-");
  const child = spawnSync(process.execPath, args, {
    cwd: projectRoot,
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
  return { ...child, result };
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

function downgradeCurrentStateToV2(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 4);
  state.state_meta.schema_version = 2;
  delete state.state_meta.startup_notice;
  delete state.pending_decision;
  delete state.response_receipt;
  delete state.discovery_sidecar.scope_id;
  delete state.discovery_sidecar.scope_revision;
  delete state.discovery_sidecar.execution_contract;
  if (state.state_meta.active_operation !== null) delete state.state_meta.active_operation.discovery_scope;
  writeState(projectRoot, state);
  return state;
}

function downgradeCurrentStateToV3(projectRoot) {
  const state = readState(projectRoot);
  assert.equal(state.state_meta.schema_version, 4);
  state.state_meta.schema_version = 3;
  delete state.discovery_sidecar.scope_id;
  delete state.discovery_sidecar.scope_revision;
  delete state.discovery_sidecar.execution_contract;
  if (state.state_meta.active_operation !== null) delete state.state_meta.active_operation.discovery_scope;
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

function finish(projectRoot, prior, updates = {}, options = {}) {
  return execute(projectRoot, "finish", {
    args: options.cancel ? ["--cancel"] : [],
    env: options.env,
    payload: {
      ...expected(prior),
      operation_id: prior.operation_id,
      updates,
      presentation: options.presentation ?? DEFAULT_PRESENTATION,
    },
  });
}

function analysisSlot(status, summary, support = null) {
  return {
    current_status: status,
    summary,
    questions_for_user: [],
    feedback_to_route: [],
    support,
  };
}

function causalCheckUpdates(causalFacts, summary = "Causal review completed.") {
  return {
    causal_facts: causalFacts,
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

function prepareReportScope(projectRoot) {
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
          planned_structure: ["Findings", "Limitations"],
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

function runHook(projectRoot, options = {}) {
  const env = { ...process.env, NODE_PATH: "", ...(options.env || {}) };
  for (const name of options.unsetEnv || []) delete env[name];
  const child = spawnSync(process.execPath, [options.hook || CODEX_HOOK], {
    cwd: options.cwd || projectRoot,
    encoding: "utf8",
    input: JSON.stringify(options.input || { cwd: projectRoot }),
    env,
  });
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout.trim());
}

test("open creates a valid state and a normal open is a byte-preserving no-op", (t) => {
  const projectRoot = temporaryProject(t);
  const created = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const firstBytes = fs.readFileSync(statePath(projectRoot), "utf8");
  const state = readState(projectRoot);

  assert.equal(state.state_meta.schema_version, 4);
  assert.equal(state.state_meta.project_id, created.project_id);
  assert.equal(state.state_meta.revision, 0);
  assert.equal(state.state_meta.active_operation, null);
  assert.deepEqual(state.state_meta.startup_notice, {
    kind: "created",
    archive_path: null,
  });
  assert.deepEqual(state.next_step_plan, []);
  assert.equal(state.pending_decision, null);
  assert.equal(state.response_receipt, null);

  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.equal(reopened.project_id, created.project_id);
  assert.equal(reopened.revision, 0);
  assert.equal(reopened.mode, "idle");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), firstBytes);
  expectSuccess(execute(projectRoot, "validate"), "VALID");
});

test("validate exposes a deterministic scope snapshot without mutating state", (t) => {
  const projectRoot = temporaryProject(t);
  expectSuccess(execute(projectRoot, "open"), "CREATED");
  const state = readState(projectRoot);
  const singleId = crypto.randomUUID();
  const differenceId = crypto.randomUUID();
  const reportId = crypto.randomUUID();
  state.council_chamber.analysis_execution.single_time_observational = {
    ...analysisSlot("ready", "Single-time scope."),
    last_updated: null,
    scope_id: singleId,
    scope_revision: 2,
  };
  state.council_chamber.analysis_execution.difference_in_differences = {
    ...analysisSlot("blocked", "Difference-in-differences scope.", "statistical-validity"),
    last_updated: null,
    scope_id: differenceId,
    scope_revision: 1,
  };
  state.council_chamber.analysis_execution.randomized_assignment = {
    ...analysisSlot("requested", "No scope identity yet."),
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
        last_updated: null,
      },
      single_time_observational: {
        scope_id: singleId,
        scope_revision: 2,
        current_status: "ready",
        support: null,
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
  assert.equal(state.state_meta.schema_version, 4);
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
      mutate: (state) => { state.causal_facts.analysis_readiness = "not_ready"; },
    },
    {
      name: "missing design recommendation",
      field: "causal_facts.recommended_method_routes.design",
      mutate: (state) => { state.causal_facts.recommended_method_routes = []; },
    },
    {
      name: "wrong design recommendation",
      field: "causal_facts.recommended_method_routes.design",
      mutate: (state) => {
        state.causal_facts.recommended_method_routes[0].id = "difference_in_differences";
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
      name: "omitted optional support",
      recommendedSupport: "statistical-validity",
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

      const started = expectSuccess(begin(projectRoot, opened, `analysis_execution.${design}`), "BEGAN_WORKER");
      assert.equal(started.plan[0].support, null);
      expectSuccess(finish(projectRoot, started, {}, { cancel: true }), "OPERATION_CANCELLED");
    });
  }
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

test("revision checks, ownership, worker resume, lead resume, and closeout form one lifecycle", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const startupNotice = readState(projectRoot).state_meta.startup_notice;
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  assert.deepEqual(readState(projectRoot).state_meta.startup_notice, startupNotice);
  const workerResume = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(workerResume.plan_actor, "data_audit");
  assert.equal(workerResume.active_operation.id, started.operation_id);
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
  const appliedState = readState(projectRoot);
  assert.equal(appliedState.project_summary.data_audit_complete, true);
  assert.deepEqual(appliedState.state_meta.startup_notice, startupNotice);

  const leadResume = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD");
  assert.equal(leadResume.active_operation.id, started.operation_id);
  assert.equal(leadResume.active_operation.stage, "lead_pending");
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
      artifact: { summary },
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
      artifact: { summary },
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
      artifact: { summary: "Original discovery output." },
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

test("causal-check descriptive fallback is limited and nondecision updates remain independent", (t) => {
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
  writeState(projectRoot, staleDecision);

  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  const next = expectSuccess(begin(projectRoot, reopened, "causal_check"), "BEGAN_WORKER");
  const independent = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(next),
      operation_id: next.operation_id,
      actor: "causal_check",
      updates: causalCheckUpdates(
        { assumptions: ["No unmeasured confounding is not established."] },
        "One causal assumption was clarified.",
      ),
    },
  }), "WORKER_APPLIED");
  expectSuccess(finish(projectRoot, independent), "OPERATION_FINISHED");
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

    expectFailure(begin(projectRoot, closed, `analysis_execution.${prepared.design}`, {
      scope_ref: prepared.scope_ref,
    }), "SCOPE_MISMATCH");
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
            planned_structure: ["Findings", "Limitations"],
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
      artifact: { summary: "Treatment-effect estimates." },
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
      artifact: { summary: "Treatment-effect estimates." },
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
      artifact: { summary: "Treatment-effect estimates." },
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
      artifact: { summary: "Treatment-effect estimates." },
    },
  }), "INJECTED_WRITE_FAILURE");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInterruptedApply);
  assert.equal(fs.existsSync(temporaryArtifactPath), false);
  assert.equal(fs.existsSync(artifactPath), true);
  assert.equal(fs.existsSync(manifestPath), true);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.deepEqual(manifest, {
    schema_version: 1,
    operation_id: execution.operation_id,
    route: "analysis_execution",
    scope_ref: prepared.scope_ref,
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
      artifact: { summary: manifest.summary },
    },
  }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeInvalidManifest);
  manifest.files = [reserved.artifact_intent.location];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const applied = expectSuccess(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: `analysis_execution.${prepared.design}`,
      scope_transition: "preserve",
      updates: workerPatch,
      artifact: { summary: manifest.summary },
    },
  }), "WORKER_APPLIED");
  assert.equal(applied.artifact_record.operation_id, execution.operation_id);
  assert.equal(applied.artifact_record.location, reserved.artifact_intent.location);
  assert.equal(applied.artifact_record.design, prepared.design);
  assert.match(applied.artifact_record.created_at, /^\d{4}-\d{2}-\d{2}T/);
  const afterApply = readState(projectRoot);
  const completedSlot = afterApply.council_chamber.analysis_execution[prepared.design];
  assert.equal(completedSlot.summary, manifest.summary);
  assert.deepEqual(completedSlot.questions_for_user, []);
  assert.deepEqual(completedSlot.feedback_to_route, ["Preserve this feedback."]);
  assert.equal(afterApply.project_summary.analysis_output, "exist");
  const summaryTimestamp = afterApply.project_summary.last_updated;

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

test("bundled stop hook validates strictly without external YAML modules", async (t) => {
  assert.deepEqual(fs.readFileSync(CODEX_HOOK), fs.readFileSync(CLAUDE_HOOK));
  assert.match(fs.readFileSync(CODEX_HOOK, "utf8"), /Bundled dependency: yaml \(ISC\)/);
  assert.match(fs.readFileSync(CLI, "utf8"), /Bundled dependency: yaml \(ISC\)/);

  await t.test("missing state warns without blocking", () => {
    const projectRoot = temporaryProject(t);
    const result = runHook(projectRoot);
    assert.equal(result.suppressOutput, true);
    assert.match(result.systemMessage, /does not exist/);
    assert.equal(result.decision, undefined);
  });

  await t.test("idle valid state passes", () => {
    const projectRoot = temporaryProject(t);
    expectSuccess(execute(projectRoot, "open"), "CREATED");
    assert.deepEqual(runHook(projectRoot), { suppressOutput: true });
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
    assert.deepEqual(runHook(projectRoot), { suppressOutput: true });
  });

  await t.test("active operation blocks", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const result = runHook(projectRoot);
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
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
      artifact: { summary: artifactSummary },
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
      artifact: { summary: artifactSummary },
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
      artifact: { summary: artifactSummary },
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
      artifact: { summary: artifactSummary },
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
          planned_structure: ["Updated findings", "Limitations"],
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
      ...analysisSlot("ready", "Independent design scope."),
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
          report_assembly: { report_goal: "Replacement report scope" },
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
    assert.equal(state.report_assembly.audience, null);
    assert.deepEqual(state.report_assembly.planned_structure, []);
    assert.deepEqual(state.report_assembly.key_points, []);
    assert.deepEqual(state.report_assembly.wording_constraints, []);
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
  const started = expectSuccess(begin(projectRoot, prepared, `analysis_execution.${design}`, {
    support: "heterogeneous-effects",
  }), "BEGAN_WORKER");
  const updates = {
    council_chamber: {
      analysis_execution: {
        [design]: {
          current_status: "ready",
          summary: "The selected support route changed.",
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

test("--discard-legacy-plan is rejected when no legacy v4.5 state exists", async (t) => {
  await t.test("missing state", () => {
    const projectRoot = temporaryProject(t);
    const failure = expectFailure(execute(projectRoot, "open", {
      args: ["--discard-legacy-plan"],
    }), "INVALID_INPUT");
    assert.match(failure.message, /requires an existing recognized v4\.5 state/);
    assert.equal(fs.existsSync(statePath(projectRoot)), false);
  });

  await t.test("current v4 state", () => {
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
            planned_structure: ["Findings", "Limitations"],
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
      assert.match(failure.message, /direct approval without options/);
      assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
      const pending = readState(projectRoot);
      assert.equal(pending.state_meta.revision, applied.revision);
      assert.equal(pending.state_meta.active_operation.stage, "lead_pending");

      const presentation = {
        ...DEFAULT_PRESENTATION,
        next_steps: "Do you approve this scope? If not, tell me what you would revise.",
      };
      const closed = expectSuccess(
        finish(projectRoot, applied, {}, { presentation }),
        "OPERATION_FINISHED",
      );
      assert.equal(closed.pending_decision, null);
      assert.equal(closed.response_markdown.includes("[+ Consultant Options]"), false);
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

test("choice-based execution revalidates the exact current scope before binding approval", async (t) => {
  await t.test("current scope", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareAnalysisScope(projectRoot);
    const lead = expectSuccess(begin(projectRoot, prepared, "team_lead"), "BEGAN_LEAD");
    const menu = expectSuccess(finish(projectRoot, lead, {}, {
      presentation: optionsPresentation([
        decisionOption("Run the prepared analysis", `analysis_execution.${prepared.design}`, {
          support: prepared.support,
          scope_ref: prepared.scope_ref,
        }),
        decisionOption("Audit the data again", "data_audit"),
      ]),
    }), "OPERATION_FINISHED");

    const selected = expectSuccess(
      beginSelection(projectRoot, menu, menu.pending_decision.decision_id, 1),
      "BEGAN_WORKER",
    );
    const state = readState(projectRoot);
    assert.deepEqual(state.state_meta.active_operation.scope_ref, prepared.scope_ref);
    assert.deepEqual(state.next_step_plan, [
      { id: `analysis_execution.${prepared.design}`, support: prepared.support },
      { id: "team_lead" },
    ]);
    expectSuccess(finish(projectRoot, selected, {}, { cancel: true }), "OPERATION_CANCELLED");
  });

  await t.test("scope changed after presentation", () => {
    const projectRoot = temporaryProject(t);
    const prepared = prepareAnalysisScope(projectRoot);
    const lead = expectSuccess(begin(projectRoot, prepared, "team_lead"), "BEGAN_LEAD");
    const menu = expectSuccess(finish(projectRoot, lead, {}, {
      presentation: optionsPresentation([
        decisionOption("Run the prepared analysis", `analysis_execution.${prepared.design}`, {
          support: prepared.support,
          scope_ref: prepared.scope_ref,
        }),
        decisionOption("Audit the data again", "data_audit"),
      ]),
    }), "OPERATION_FINISHED");

    const changed = readState(projectRoot);
    changed.council_chamber.analysis_execution[prepared.design].scope_revision += 1;
    writeState(projectRoot, changed);
    const before = fs.readFileSync(statePath(projectRoot), "utf8");
    expectFailure(
      beginSelection(projectRoot, menu, menu.pending_decision.decision_id, 1),
      "SCOPE_MISMATCH",
    );
    assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
    assert.deepEqual(readState(projectRoot).pending_decision, menu.pending_decision);
  });
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
      const v4 = readState(projectRoot);
      const priorOperation = v4.state_meta.active_operation;
      const priorPlan = v4.next_step_plan;
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
      assert.equal(current.state_meta.schema_version, 4);
      assert.equal(current.state_meta.project_id, v2.state_meta.project_id);
      assert.equal(current.state_meta.revision, v2.state_meta.revision + 1);
      assert.equal(current.state_meta.startup_notice, null);
      assert.deepEqual(current.state_meta.active_operation, priorOperation);
      assert.deepEqual(current.next_step_plan, priorPlan);
      assert.equal(current.pending_decision, null);
      assert.equal(current.response_receipt, null);
      for (const section of [
        "project_summary",
        "council_chamber",
        "data_facts",
        "domain_knowledge",
        "causal_facts",
        "report_assembly",
        "artifact_records",
      ]) {
        assert.deepEqual(current[section], v2[section], `${section} changed during v2 migration`);
      }
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
