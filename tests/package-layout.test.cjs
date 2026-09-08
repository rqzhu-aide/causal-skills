"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { validate, packageFiles } = require("../scripts/validate.cjs");
const repository = path.resolve(__dirname, "..");

function fixture(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const owned = fs.mkdtempSync(path.join(base, "causal-package-layout-"));
  t.after(() => {
    assert.equal(path.dirname(fs.realpathSync.native(owned)), base);
    assert.ok(path.basename(owned).startsWith("causal-package-layout-"));
    fs.rmSync(owned, { recursive: true, force: true });
  });
  for (const file of packageFiles(repository).files) {
    const destination = path.join(owned, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repository, file), destination);
  }
  return owned;
}

function add(root, name, content) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, { flag: "wx" });
}

test("the active release identity agrees across package, skill, README and CLI", () => {
  const pkg = require("../package.json");
  assert.equal(pkg.version, "7.0.1");
  assert.match(fs.readFileSync(path.join(repository, "SKILL.md"), "utf8"), /metadata:\r?\n  version: "7\.0\.1"/);
  assert.match(fs.readFileSync(path.join(repository, "README.md"), "utf8"), /^Version: \*\*7\.0\.1\*\*/m);
  const result = spawnSync(process.execPath, [path.join(repository, "scripts/project.cjs"), "help"], { encoding: "utf8", windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).version, pkg.version);
});

for (const file of ["SKILL.md", "README.md"]) {
  test("distribution validation detects version drift in " + file, t => {
    const root = fixture(t), target = path.join(root, file);
    const original = fs.readFileSync(target, "utf8");
    assert.ok(original.includes("7.0.1"));
    fs.writeFileSync(target, original.replace("7.0.1", "7.0.2"));
    const result = validate(root);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(error => error.includes(file + " version must match package.json")));
  });
}

test("the CLI reads its version from the installed package", t => {
  const root = fixture(t), target = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(target, "utf8"));
  pkg.version = "7.0.2";
  fs.writeFileSync(target, JSON.stringify(pkg));
  const result = spawnSync(process.execPath, [path.join(root, "scripts/project.cjs"), "help"], { encoding: "utf8", windowsHide: true });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).version, pkg.version);
});

test("developer evidence, tests and CI do not enter distribution validation or identity", t => {
  const root = fixture(t), before = validate(root);
  assert.equal(before.ok, true, before.errors.join("\n"));
  add(root, "architecture/old.md", "[Missing](../absent.md) statectl.cjs\n");
  add(root, "architecture/old.cjs", "deliberately invalid JavaScript !!!\n");
  add(root, ".git/identity", "repository metadata\n");
  add(root, ".github/workflows/test.yml", "developer CI\n");
  add(root, "tests/not-runtime.test.cjs", "deliberately invalid test source\n");
  const after = validate(root);
  assert.equal(after.ok, true, after.errors.join("\n"));
  assert.equal(after.package_sha256, before.package_sha256);
  assert.equal(after.files, before.files);
  assert.ok(packageFiles(root).files.every(file => !/^(architecture|tests|\.git|\.github)\//.test(file)));
});

test("runtime references cannot depend on excluded developer files", t => {
  const root = fixture(t);
  add(root, "architecture/design.md", "Developer-only design.\n");
  fs.appendFileSync(path.join(root, "references/memory.md"), "\n[Developer dependency](../architecture/design.md)\n");
  const result = validate(root);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.includes("Reference is outside the distribution")));
});

test("the declared npm files cannot silently include developer evidence", t => {
  const root = fixture(t), target = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(target, "utf8"));
  pkg.files.push("architecture");
  fs.writeFileSync(target, JSON.stringify(pkg));
  assert.ok(validate(root).errors.some(error => error.includes("declared skill distribution entries")));
});

test("an actual runtime-reference edit changes the distribution identity", t => {
  const root = fixture(t), before = validate(root);
  fs.appendFileSync(path.join(root, "references/memory.md"), "\nAdditional runtime guidance.\n");
  const after = validate(root);
  assert.equal(after.ok, true, after.errors.join("\n"));
  assert.notEqual(after.package_sha256, before.package_sha256);
});

test("the test launcher executes immediate test files, not historical or fixture copies", t => {
  const root = fixture(t);
  add(root, "tests/run.cjs", fs.readFileSync(path.join(__dirname, "run.cjs")));
  add(root, "tests/sample.test.cjs", "require('node:test')('selected current test', () => {});\n");
  add(root, "architecture/frozen.test.cjs", "throw new Error('Historical test must not run');\n");
  add(root, "tests/fixtures/not-current.test.cjs", "throw new Error('Fixture test must not run');\n");
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT; // Exercise a standalone invocation, not an inherited test worker.
  const result = spawnSync(process.execPath, [path.join(root, "tests/run.cjs")], {
    cwd: root, encoding: "utf8", windowsHide: true, env: environment
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /selected current test/);
});

test("the test launcher forwards Node test-filter options", t => {
  const root = fixture(t);
  add(root, "tests/run.cjs", fs.readFileSync(path.join(__dirname, "run.cjs")));
  add(root, "tests/sample.test.cjs", "const test = require('node:test');\ntest('selected check', () => {});\ntest('unselected check', () => { throw new Error('Filter was ignored'); });\n");
  const environment = { ...process.env };
  delete environment.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [path.join(root, "tests/run.cjs"), "--test-name-pattern=^selected check$"], {
    cwd: root, encoding: "utf8", windowsHide: true, env: environment
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /selected check/);
});
