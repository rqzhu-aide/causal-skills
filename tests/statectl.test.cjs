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
  let result;
  assert.doesNotThrow(() => {
    result = JSON.parse(lines.at(-1));
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

function finish(projectRoot, prior, updates = {}, options = {}) {
  return execute(projectRoot, "finish", {
    args: options.cancel ? ["--cancel"] : [],
    env: options.env,
    payload: {
      ...expected(prior),
      operation_id: prior.operation_id,
      updates,
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

function prepareAnalysisScope(projectRoot, design = "single_time_observational", support = null) {
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
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

  assert.equal(state.state_meta.schema_version, 2);
  assert.equal(state.state_meta.project_id, created.project_id);
  assert.equal(state.state_meta.revision, 0);
  assert.equal(state.state_meta.active_operation, null);
  assert.deepEqual(state.next_step_plan, []);

  const reopened = expectSuccess(execute(projectRoot, "open"), "OPENED");
  assert.equal(reopened.project_id, created.project_id);
  assert.equal(reopened.revision, 0);
  assert.equal(reopened.mode, "idle");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), firstBytes);
  expectSuccess(execute(projectRoot, "validate"), "VALID");
});

test("open --fresh archives exact prior bytes before replacing even malformed state", (t) => {
  const projectRoot = temporaryProject(t);
  const malformed = "project_summary: [unterminated\r\n# preserve these exact bytes\r\n";
  fs.writeFileSync(statePath(projectRoot), malformed, "utf8");

  const reset = expectSuccess(execute(projectRoot, "open", { args: ["--fresh"] }), "RESET");
  assert.equal(fs.readFileSync(reset.archive_path, "utf8"), malformed);
  assert.notEqual(fs.readFileSync(statePath(projectRoot), "utf8"), malformed);
  expectSuccess(execute(projectRoot, "validate"), "VALID");

  const secondRoot = temporaryProject(t);
  const createdFresh = expectSuccess(execute(secondRoot, "open", { args: ["--fresh"] }), "CREATED_FRESH");
  assert.equal(createdFresh.archive_path, null);
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
  const started = expectSuccess(begin(projectRoot, opened, "data_audit"), "BEGAN_WORKER");
  const workerResume = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(workerResume.plan_actor, "data_audit");
  assert.equal(workerResume.active_operation.id, started.operation_id);

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
  assert.equal(readState(projectRoot).project_summary.data_audit_complete, true);

  const leadResume = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD");
  assert.equal(leadResume.active_operation.id, started.operation_id);
  assert.equal(leadResume.active_operation.stage, "lead_pending");

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
  const finalState = readState(projectRoot);
  assert.equal(finalState.state_meta.active_operation, null);
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
      patch: { causal_checked: "passing", analysis_readiness: "ready" },
    },
    {
      actor: "causal_discovery",
      root: "discovery_sidecar",
      patch: { status: "scoped", goal: "Explore candidate structure" },
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

test("artifact reservation, manifest verification, resume, and recording are one atomic protocol", (t) => {
  const projectRoot = temporaryProject(t);
  const prepared = prepareAnalysisScope(projectRoot);
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
    location: reserved.artifact_intent.location,
    temporary_path: reserved.temporary_path,
    reason_code: "MISSING_ARTIFACT",
  });

  const workerPatch = {
    council_chamber: {
      analysis_execution: {
        [prepared.design]: analysisSlot("done", "Approved analysis and artifact completed."),
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
  fs.mkdirSync(path.dirname(temporaryArtifactPath), { recursive: true });
  fs.writeFileSync(temporaryArtifactPath, "estimate,se\n1.25,0.18\n", "utf8");
  fs.renameSync(temporaryArtifactPath, artifactPath);
  const manifest = {
    schema_version: 1,
    operation_id: execution.operation_id,
    route: "analysis_execution",
    scope_ref: prepared.scope_ref,
    files: [reserved.artifact_intent.location],
    completed_at: "2000-01-01T00:00:00.000Z",
    summary: "Treatment-effect estimates.",
  };
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

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

  const reusable = expectSuccess(execute(projectRoot, "open"), "RESUME_WORKER");
  assert.equal(reusable.artifact_status.status, "complete");
  assert.equal(reusable.artifact_status.manifest_path, reserved.manifest_path);

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
      artifact: { summary: manifest.summary },
    },
  }), "SCOPE_MISMATCH");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), beforeStatusMismatch);

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
  assert.notEqual(applied.artifact_record.created_at, manifest.completed_at);
  assert.match(applied.artifact_record.created_at, /^\d{4}-\d{2}-\d{2}T/);
  const afterApply = readState(projectRoot);
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

test("atomic finish failure preserves a resumable lead operation and removes temp state", (t) => {
  const projectRoot = temporaryProject(t);
  const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
  const started = expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
  const before = fs.readFileSync(statePath(projectRoot), "utf8");

  expectFailure(finish(projectRoot, started, {
    project_summary: { title: "Must not be committed" },
  }, { env: { STATECTL_FAIL_BEFORE_RENAME: "1" } }), "INJECTED_WRITE_FAILURE");

  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), before);
  assert.deepEqual(
    fs.readdirSync(projectRoot).filter((name) => name.startsWith(".project_state.yaml.tmp-")),
    [],
  );
  const resumed = expectSuccess(execute(projectRoot, "open"), "RESUME_LEAD");
  assert.equal(resumed.revision, started.revision);
  assert.equal(resumed.active_operation.id, started.operation_id);

  expectSuccess(finish(projectRoot, started, {
    project_summary: { title: "Committed after retry" },
  }), "OPERATION_FINISHED");
  assert.equal(readState(projectRoot).project_summary.title, "Committed after retry");
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

  await t.test("active operation blocks", () => {
    const projectRoot = temporaryProject(t);
    const opened = expectSuccess(execute(projectRoot, "open"), "CREATED");
    expectSuccess(begin(projectRoot, opened, "team_lead"), "BEGAN_LEAD");
    const result = runHook(projectRoot);
    assert.equal(result.decision, "block");
    assert.match(result.reason, /still active/);
  });

  await t.test("duplicate YAML keys block with strict parser code", () => {
    const projectRoot = temporaryProject(t);
    fs.writeFileSync(statePath(projectRoot), "state_meta: {}\nstate_meta: {}\n", "utf8");
    const result = runHook(projectRoot);
    assert.equal(result.decision, "block");
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
  fs.renameSync(temporary, target);
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  const manifest = {
    schema_version: 1,
    operation_id: started.operation_id,
    route: "data_audit",
    scope_ref: null,
    files: [reserved.manifest_path],
    completed_at: new Date().toISOString(),
    summary: "Data-audit package.",
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

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
    artifact: { summary: manifest.summary },
  };
  const stateBeforeFailures = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", { payload: applyPayload }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBeforeFailures);

  const escapedPath = path.join(projectRoot, "output", "escaped.txt");
  fs.writeFileSync(escapedPath, "outside reserved directory\n", "utf8");
  manifest.files = [`${reserved.artifact_intent.location}/../escaped.txt`];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  expectFailure(execute(projectRoot, "apply", { payload: applyPayload }), "INVALID_ARTIFACT_MANIFEST");
  assert.equal(fs.readFileSync(statePath(projectRoot), "utf8"), stateBeforeFailures);

  manifest.files = [`${reserved.artifact_intent.location}/results.csv`];
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
  const manifest = {
    schema_version: 1,
    operation_id: execution.operation_id,
    route: "report_writer",
    scope_ref: prepared.scope_ref,
    files: [reserved.artifact_intent.location],
    completed_at: new Date().toISOString(),
    summary: "Completed clinical report.",
  };
  const manifestPath = path.join(projectRoot, ...reserved.manifest_path.split("/"));
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const beforeInvalidReportApply = fs.readFileSync(statePath(projectRoot), "utf8");
  expectFailure(execute(projectRoot, "apply", {
    payload: {
      ...expected(reserved),
      operation_id: execution.operation_id,
      actor: "report_writer",
      scope_transition: "preserve",
      updates: { report_assembly: { current_format: "html" } },
      artifact: { summary: manifest.summary },
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
      artifact: { summary: manifest.summary },
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
      artifact: { summary: manifest.summary },
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
          report_writer: {
            current_status: "done",
            summary: "Historical report completed.",
            questions_for_user: [],
            feedback_to_route: [],
          },
        },
      },
      artifact: { summary: manifest.summary },
    },
  }), "WORKER_APPLIED");
  const published = expectSuccess(finish(projectRoot, reportApplied, {}, { cancel: true }), "OPERATION_CANCELLED");
  const historical = readState(projectRoot);
  assert.equal(historical.artifact_records.length, 1);
  assert.equal(historical.project_summary.report_output, "exist");

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

test("an exact analysis scope binds its support route at begin and apply", (t) => {
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
              "done",
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
              current_status: "ready",
              summary: "The controller stamps the planned support route.",
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

test("--discard-legacy-plan is rejected when no legacy v4.5 state exists", async (t) => {
  await t.test("missing state", () => {
    const projectRoot = temporaryProject(t);
    const failure = expectFailure(execute(projectRoot, "open", {
      args: ["--discard-legacy-plan"],
    }), "INVALID_INPUT");
    assert.match(failure.message, /requires an existing recognized v4\.5 state/);
    assert.equal(fs.existsSync(statePath(projectRoot)), false);
  });

  await t.test("current v2 state", () => {
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
