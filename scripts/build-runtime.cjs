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

function main() {
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
    const hook = path.join(tempDir, "project_state_stop_check.js");
    build(path.join(SOURCE_DIR, "cli.cjs"), controller, licenseBanner);
    build(path.join(SOURCE_DIR, "hook.cjs"), hook, licenseBanner);
    compareOrWrite(controller, path.join(__dirname, "statectl.cjs"));
    compareOrWrite(hook, path.join(ROOT, "project-hooks", ".codex", "project_state_stop_check.js"));
    compareOrWrite(hook, path.join(ROOT, "project-hooks", ".claude", "project_state_stop_check.js"));

    compareOrWriteText(yamlLicense, path.join(__dirname, "vendor-licenses", "yaml-ISC.txt"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  process.stdout.write(CHECK ? "runtime bundles are current\n" : "runtime bundles rebuilt\n");
}

main();
