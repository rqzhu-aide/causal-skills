"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("esbuild");
const YAML = require("yaml");

const ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.join(__dirname, "statectl-src");
const CHECK = process.argv.includes("--check");

function routeCatalogText() {
  const indexPath = path.join(ROOT, "references", "route_index.yaml");
  const document = YAML.parseDocument(fs.readFileSync(indexPath, "utf8"), {
    schema: "core",
    uniqueKeys: true,
    maxAliasCount: 50,
  });
  if (document.errors.length) throw new Error(`route_index.yaml is invalid: ${document.errors.map((error) => error.message).join("; ")}`);
  const index = document.toJS({ maxAliasCount: 50 });
  const core = index.core_routes.map((item) => item.id);
  const design = index.method_routes.filter((item) => item.category === "design").map((item) => item.id);
  const support = index.method_routes.filter((item) => item.category === "support").map((item) => item.id);
  return `${JSON.stringify({ core, design, support }, null, 2)}\n`;
}

function build(entry, outfile, licenseBanner) {
  esbuild.buildSync({
    absWorkingDir: ROOT,
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node18",
    minify: false,
    sourcemap: false,
    legalComments: "eof",
    banner: { js: licenseBanner },
    charset: "utf8",
    logLevel: "silent",
  });
  const text = fs.readFileSync(outfile, "utf8").replace(/\r\n/g, "\n");
  fs.writeFileSync(outfile, text, "utf8");
}

function compareOrWrite(generatedPath, trackedPath) {
  const generated = fs.readFileSync(generatedPath, "utf8").replace(/\r\n/g, "\n");
  if (CHECK) {
    const tracked = fs.existsSync(trackedPath)
      ? fs.readFileSync(trackedPath, "utf8").replace(/\r\n/g, "\n")
      : null;
    if (tracked !== generated) {
      throw new Error(`runtime bundle is stale: ${path.relative(ROOT, trackedPath)}`);
    }
  } else {
    fs.mkdirSync(path.dirname(trackedPath), { recursive: true });
    fs.writeFileSync(trackedPath, generated, "utf8");
  }
}

function compareOrWriteText(text, trackedPath) {
  if (CHECK) {
    if (!fs.existsSync(trackedPath) || fs.readFileSync(trackedPath, "utf8").replace(/\r\n/g, "\n") !== text) {
      throw new Error(`generated source is stale: ${path.relative(ROOT, trackedPath)}`);
    }
  } else {
    fs.mkdirSync(path.dirname(trackedPath), { recursive: true });
    fs.writeFileSync(trackedPath, text, "utf8");
  }
}

function loadPartials() {
  const directory = path.join(__dirname, "reference-partials");
  const partials = new Map();
  if (!fs.existsSync(directory)) return partials;
  for (const file of fs.readdirSync(directory).sort()) {
    if (!file.endsWith(".md")) continue;
    const name = file.slice(0, -3);
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`invalid partial name: ${file}`);
    partials.set(
      name,
      fs.readFileSync(path.join(directory, file), "utf8").replace(/\r\n/g, "\n").trim(),
    );
  }
  return partials;
}

function markdownTargets() {
  const targets = [path.join(ROOT, "SKILL.md")];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) targets.push(full);
    }
  };
  walk(path.join(ROOT, "references"));
  return targets;
}

function renderPartials() {
  const partials = loadPartials();
  const markerPattern = /<!-- partial:([a-z0-9-]+) -->\n([\s\S]*?)<!-- \/partial:\1 -->/g;
  for (const target of markdownTargets()) {
    const original = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
    const opens = (original.match(/<!-- partial:/g) || []).length;
    const closes = (original.match(/<!-- \/partial:/g) || []).length;
    let matches = 0;
    const rendered = original.replace(markerPattern, (whole, name) => {
      matches += 1;
      if (!partials.has(name)) {
        throw new Error(`unknown partial "${name}" in ${path.relative(ROOT, target)}`);
      }
      return `<!-- partial:${name} -->\n${partials.get(name)}\n<!-- /partial:${name} -->`;
    });
    if (opens !== matches || closes !== matches) {
      throw new Error(`malformed partial markers in ${path.relative(ROOT, target)}`);
    }
    if (rendered !== original) {
      if (CHECK) {
        throw new Error(`reference partial is stale: ${path.relative(ROOT, target)}`);
      }
      fs.writeFileSync(target, rendered, "utf8");
    }
  }
}

function main() {
  renderPartials();
  const catalog = routeCatalogText();
  const catalogPath = path.join(SOURCE_DIR, "route-catalog.json");
  compareOrWriteText(catalog, catalogPath);

  const yamlLicense = fs.readFileSync(
    require.resolve("yaml/package.json").replace(/package\.json$/, "LICENSE"),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const licenseBanner = `/* Bundled dependency: yaml (ISC)\n\n${yamlLicense.trimEnd()}\n*/`;

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "causal-statectl-build-"));
  try {
    const controller = path.join(tempDir, "statectl.cjs");
    const codexHook = path.join(tempDir, "project_state_stop_check.cjs");
    const claudeHook = path.join(tempDir, "claude_project_state_stop_check.cjs");
    build(path.join(SOURCE_DIR, "cli.cjs"), controller, licenseBanner);
    build(path.join(SOURCE_DIR, "codex-hook.cjs"), codexHook, licenseBanner);
    build(path.join(SOURCE_DIR, "hook.cjs"), claudeHook, licenseBanner);
    compareOrWrite(controller, path.join(__dirname, "statectl.cjs"));
    compareOrWrite(codexHook, path.join(ROOT, "project-hooks", "codex", "project_state_stop_check.cjs"));
    compareOrWrite(claudeHook, path.join(ROOT, "project-hooks", "claude", "project_state_stop_check.cjs"));

    compareOrWriteText(yamlLicense, path.join(__dirname, "vendor-licenses", "yaml-ISC.txt"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  process.stdout.write(CHECK ? "runtime bundles are current\n" : "runtime bundles rebuilt\n");
}

main();
