"use strict";

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { validateTemplate } = require("./statectl-src/core.cjs");

const ROOT = path.resolve(__dirname, "..");

function readYaml(relativePath) {
  const filePath = path.join(ROOT, relativePath);
  const document = YAML.parseDocument(fs.readFileSync(filePath, "utf8"), {
    schema: "core",
    uniqueKeys: true,
    maxAliasCount: 50,
  });
  if (document.errors.length) {
    throw new Error(`${relativePath}: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  return document.toJS({ maxAliasCount: 50 });
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function validateFrontmatter() {
  const text = fs.readFileSync(path.join(ROOT, "SKILL.md"), "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error("SKILL.md must begin with YAML frontmatter");
  const document = YAML.parseDocument(match[1], { schema: "core", uniqueKeys: true });
  if (document.errors.length) throw new Error(`SKILL.md frontmatter: ${document.errors[0].message}`);
  const frontmatter = document.toJS();
  const keys = Object.keys(frontmatter).sort();
  if (keys.join(",") !== "description,name") {
    throw new Error("SKILL.md frontmatter must contain only name and description");
  }
  if (frontmatter.name !== "causal-consultant" || typeof frontmatter.description !== "string" || !frontmatter.description.trim()) {
    throw new Error("SKILL.md frontmatter has an invalid name or description");
  }
}

function validateRoutes() {
  const index = readYaml("references/route_index.yaml");
  const coreRoutes = requireArray(index.core_routes, "core_routes");
  const methodRoutes = requireArray(index.method_routes, "method_routes");
  const sharedReferences = requireArray(index.shared_references, "shared_references");
  const entries = [...coreRoutes, ...methodRoutes, ...sharedReferences];
  const ids = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || typeof entry.path !== "string") {
      throw new Error("every indexed route/reference must have string id and path fields");
    }
    if (ids.has(entry.id)) throw new Error(`duplicate route/reference id: ${entry.id}`);
    ids.add(entry.id);
    if (!fs.existsSync(path.join(ROOT, entry.path))) throw new Error(`indexed path does not exist: ${entry.path}`);
  }

  const catalogPath = index.method_routes_catalog?.path;
  if (typeof catalogPath !== "string" || !fs.existsSync(path.join(ROOT, catalogPath))) {
    throw new Error("method_routes_catalog.path is missing or invalid");
  }
  const catalog = readYaml(catalogPath);
  const indexedDesigns = methodRoutes.filter((route) => route.category === "design").map((route) => route.id).sort();
  const indexedSupports = methodRoutes.filter((route) => route.category === "support").map((route) => route.id).sort();
  const catalogDesigns = requireArray(catalog.design_candidates, "design_candidates").map((route) => route.id).sort();
  const catalogSupports = requireArray(catalog.support_routes, "support_routes").map((route) => route.id).sort();
  if (new Set(catalogDesigns).size !== catalogDesigns.length || catalogDesigns.join("\n") !== indexedDesigns.join("\n")) {
    throw new Error("design route IDs differ between route_index.yaml and method_route_catalog.yaml");
  }
  if (new Set(catalogSupports).size !== catalogSupports.length || catalogSupports.join("\n") !== indexedSupports.join("\n")) {
    throw new Error("support route IDs differ between route_index.yaml and method_route_catalog.yaml");
  }
}

validateFrontmatter();
validateRoutes();
const template = validateTemplate({ skillRoot: ROOT });
if (template.capabilities?.scope_snapshot !== 1) {
  throw new Error("state controller must advertise scope_snapshot capability 1");
}
if (
  template.capabilities?.analysis_contract !== 1
  || template.capabilities?.completion_protocol !== 1
  || template.capabilities?.artifact_roles !== 1
) {
  throw new Error("state controller must advertise work-contract and artifact-role capabilities");
}
if (
  template.capabilities?.response_rendering !== 1
  || template.capabilities?.pending_decision !== 1
  || template.capabilities?.response_receipt !== 1
  || template.capabilities?.startup_notice !== 1
) {
  throw new Error("state controller must advertise response rendering and persistence capabilities");
}
process.stdout.write("skill package is valid\n");
