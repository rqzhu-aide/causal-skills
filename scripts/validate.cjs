#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const PACKAGE_ENTRIES = ["SKILL.md", "README.md", "LICENSE", "agents", "references", "scripts"];

// The repository also contains developer evidence and CI. Only these explicit
// distribution entries (plus npm's package.json) belong to the installed skill.
function packageFiles(directory = root) {
  const errors = [];
  const files = [];
  function walk(name) {
    const target = path.join(directory, name);
    if (!fs.existsSync(target)) { errors.push("Missing distribution entry: " + name); return; }
    const entry = fs.lstatSync(target);
    if (entry.isSymbolicLink()) { errors.push("Package contains a link: " + name); return; }
    if (entry.isFile()) files.push(name);
    else if (entry.isDirectory()) {
      for (const child of fs.readdirSync(target).sort()) {
        if (!["node_modules", ".git"].includes(child)) walk(name + "/" + child);
      }
    }
  }
  for (const name of ["package.json", ...PACKAGE_ENTRIES]) walk(name);
  return { files: files.sort(), errors };
}

function validate(directory = root) {
  const { files, errors } = packageFiles(directory);
  const demand = (condition, message) => { if (!condition) errors.push(message); };
  const read = file => fs.readFileSync(path.join(directory, file), "utf8").replace(/\r\n/g, "\n");
  const required = ["SKILL.md", "README.md", "LICENSE", "package.json", "agents/openai.yaml",
    "references/catalog.json", "references/memory.md", "references/runs.md", "scripts/project.cjs"];
  for (const name of required) demand(files.includes(name), "Missing " + name);
  const pkg = JSON.parse(read("package.json"));
  demand(Array.isArray(pkg.files) && JSON.stringify([...pkg.files].sort()) === JSON.stringify([...PACKAGE_ENTRIES].sort()),
    "package.json files must contain only the declared skill distribution entries");
  const skill = read("SKILL.md");
  demand(/^7\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version), "Expected a v7 package version");
  demand(!pkg.dependencies || Object.keys(pkg.dependencies).length === 0, "Runtime dependencies need explicit review");
  const metadata = skill.match(/^---\nname: causal-consultant\ndescription: [^\n]+\nmetadata:\n  version: "([^"\n]+)"\n---\n/);
  demand(metadata, "Invalid skill metadata");
  demand(metadata?.[1] === pkg.version, "SKILL.md version must match package.json");
  demand(read("README.md").match(/^Version: \*\*([^*\n]+)\*\*/m)?.[1] === pkg.version,
    "README.md version must match package.json");
  demand(/allow_implicit_invocation:\s*false/.test(read("agents/openai.yaml")), "Explicit invocation policy missing");
  demand(!files.some(file => file.startsWith("architecture/")), "Developer architecture must stay outside the installed skill");
  const catalog = JSON.parse(read("references/catalog.json"));
  demand(Object.keys(catalog.specialists).length === 6 && catalog.designs.length === 10 &&
    new Set(catalog.designs).size === 10 && catalog.designs.includes("custom_identification") &&
    catalog.supports.length === 6 && catalog.specialists.data_audit?.includes("prepare"), "Scientific catalog coverage changed");
  for (const role of Object.keys(catalog.specialists)) demand(files.includes("references/" + role + ".md"), "Missing role: " + role);
  for (const design of catalog.designs) demand(files.includes("references/design/" + design + ".md"), "Missing design: " + design);
  for (const support of catalog.supports) demand(files.includes("references/support/" + support + ".md"), "Missing support: " + support);
  for (const file of files) {
    if (file.endsWith(".cjs")) {
      try { new vm.Script(read(file), { filename: file }); }
      catch (error) { errors.push("Invalid JavaScript " + file + ": " + error.message); }
    }
    // README is repository-facing documentation, not a runtime reference.
    if (!file.endsWith(".md") || file === "README.md") continue;
    const content = read(file);
    for (const match of content.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1].replace(/^<|>$/g, "");
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      const destination = path.resolve(path.dirname(path.join(directory, file)), href.split("#")[0]);
      const relative = path.relative(directory, destination);
      demand(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Link escapes standalone package: " + file + " -> " + href);
      demand(fs.existsSync(destination), "Broken reference: " + file + " -> " + href);
      demand(files.includes(relative.replace(/\\/g, "/")), "Reference is outside the distribution: " + file + " -> " + href);
    }
    if (file !== "README.md") demand(!/statectl\.cjs|route_selection_workflow\.md|active_turn\.|approved_scope\.|begin-turn|finish-turn/.test(content), "Old controller contract in " + file);
  }
  const runtimeFiles = files.filter(file => file.startsWith("scripts/") && file.endsWith(".cjs"));
  const digest = crypto.createHash("sha256");
  for (const file of files.filter(file => !file.startsWith("tests/")).sort()) {
    digest.update(file + "\t" + crypto.createHash("sha256").update(fs.readFileSync(path.join(directory, file))).digest("hex") + "\n");
  }
  return { ok: errors.length === 0, version: pkg.version, files: files.length, inventory_scope: "installed distribution; excludes developer evidence, tests and CI",
    runtime_lines: runtimeFiles.reduce((sum, file) => sum + read(file).trimEnd().split("\n").length, 0),
    package_sha256: digest.digest("hex"), errors };
}

if (require.main === module) {
  try { const result = validate(); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validate, packageFiles };
