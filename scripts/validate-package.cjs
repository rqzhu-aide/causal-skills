"use strict";

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { validateTemplate } = require("./statectl-src/core.cjs");

const ROOT = path.resolve(__dirname, "..");
const EXPECTED_LOADERS = new Map([
  ["references/route_selection_workflow.md", "controller_for_router_phase"],
  ["references/report_routing_workflow.md", "router_when_report_needed"],
  ["references/analysis_routing_workflow.md", "router_when_analysis_execution_needed"],
  ["references/team_lead_report_flow.md", "team_lead_when_report_needed"],
  ["references/team_lead_analysis_flow.md", "team_lead_when_analysis_needed"],
  ["references/artifact_output_policy.md", "worker_when_creating_output"],
  ["references/design_execution_contract.md", "design_references"],
  [
    "references/legacy_evidence.md",
    "controller_when_active_completion_protocol_1_or_team_lead_when_reviewing_historical_manifest",
  ],
  ["references/context_transport.md", "host_when_isolated_invocations_or_context_file"],
  [
    "assets/report_template_analysis.md",
    "controller_when_output_bound_report_scope_binds_analysis_artifact_ids",
  ],
  [
    "assets/report_template_planning.md",
    "controller_when_output_bound_report_analysis_artifact_ids_are_empty",
  ],
  ["assets/report_html_layout_template.html", "controller_when_output_bound_report"],
]);

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

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

function validateLoadedBy(index) {
  if (index.method_routes_catalog?.loaded_by !== "causal_check") {
    throw new Error("method_routes_catalog.loaded_by must be causal_check");
  }

  const entries = [
    ...requireArray(index.shared_references, "shared_references"),
    ...requireArray(index.conditional_assets, "conditional_assets"),
  ];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  if (byPath.size !== entries.length) {
    throw new Error("shared reference and conditional asset paths must be unique");
  }

  for (const [entryPath, loadedBy] of EXPECTED_LOADERS) {
    const entry = byPath.get(entryPath);
    if (!entry) throw new Error(`missing loader contract for indexed path: ${entryPath}`);
    if (entry.loaded_by !== loadedBy) {
      throw new Error(`loaded_by mismatch for ${entryPath}: expected ${loadedBy}`);
    }
  }
  for (const entryPath of byPath.keys()) {
    if (!EXPECTED_LOADERS.has(entryPath)) {
      throw new Error(`no validated loader contract for indexed path: ${entryPath}`);
    }
  }
}

function validateReleaseMetadata(packageJson, packageLock, readme) {
  const version = packageJson.version;
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error("package.json version must be a three-part semantic version");
  }
  if (packageLock.version !== version || packageLock.packages?.[""]?.version !== version) {
    throw new Error("package-lock.json versions must match package.json");
  }

  const badge = readme.match(
    /\[!\[Version\]\(https:\/\/img\.shields\.io\/badge\/version-(\d+\.\d+\.\d+)-blue\.svg\)\]\([^)]*\)/,
  );
  if (!badge || badge[1] !== version) {
    throw new Error("README version badge must match package.json");
  }

  const urlPattern = /https:\/\/(?:github\.com\/rqzhu-aide\/causal-consultant\/tree\/|raw\.githubusercontent\.com\/rqzhu-aide\/causal-consultant\/)(v\d+\.\d+\.\d+)(?=\/|[\s"')])/g;
  const urlVersions = [...readme.matchAll(urlPattern)].map((match) => match[1]);
  if (!urlVersions.length) throw new Error("README must contain a versioned repository URL");
  const expectedRef = `v${version}`;
  if (urlVersions.some((ref) => ref !== expectedRef)) {
    throw new Error(`README versioned URLs must use ${expectedRef}`);
  }
}

function validateInvocationPolicy() {
  const metadata = readYaml("agents/openai.yaml");
  if (metadata.policy?.allow_implicit_invocation !== false) {
    throw new Error("agents/openai.yaml must disable implicit invocation");
  }
  const runtimeFiles = fs.readFileSync(path.join(ROOT, "README.md"), "utf8").split(/\r?\n/);
  if (!runtimeFiles.some((line) => line.trim() === "agents/")) {
    throw new Error("README runtime subset must include agents/");
  }
}

function validateReleaseConsistency() {
  validateReleaseMetadata(
    readJson("package.json"),
    readJson("package-lock.json"),
    fs.readFileSync(path.join(ROOT, "README.md"), "utf8"),
  );
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
  const conditionalAssets = requireArray(index.conditional_assets, "conditional_assets");
  const entries = [...coreRoutes, ...methodRoutes, ...sharedReferences, ...conditionalAssets];
  const ids = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry.id !== "string" || typeof entry.path !== "string") {
      throw new Error("every indexed route/reference must have string id and path fields");
    }
    if (ids.has(entry.id)) throw new Error(`duplicate route/reference id: ${entry.id}`);
    ids.add(entry.id);
    if (!fs.existsSync(path.join(ROOT, entry.path))) throw new Error(`indexed path does not exist: ${entry.path}`);
  }

  validateLoadedBy(index);

  if (!sharedReferences.some((entry) => entry.path === "references/route_selection_workflow.md")) {
    throw new Error("route_selection_workflow.md must be indexed as a shared reference");
  }

  const expectedConditionalAssetPaths = [
    "assets/report_html_layout_template.html",
    "assets/report_template_analysis.md",
    "assets/report_template_planning.md",
  ];
  const indexedConditionalAssetPaths = conditionalAssets.map((entry) => entry.path).sort();
  if (indexedConditionalAssetPaths.join("\n") !== expectedConditionalAssetPaths.join("\n")) {
    throw new Error("conditional asset paths differ from controller report assets");
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

function main() {
  validateFrontmatter();
  validateInvocationPolicy();
  validateReleaseConsistency();
  validateRoutes();
  const template = validateTemplate({ skillRoot: ROOT });
  if (template.capabilities?.scope_snapshot !== 1) {
    throw new Error("state controller must advertise scope_snapshot capability 1");
  }
  if (
    template.capabilities?.analysis_contract !== 1
    || template.capabilities?.completion_protocol !== 1
    || template.capabilities?.artifact_roles !== 1
    || template.capabilities?.analysis_options !== 1
    || template.capabilities?.causal_scope_basis !== 1
    || template.capabilities?.requirement_evidence !== 1
    || template.capabilities?.report_evidence_binding !== 1
  ) {
    throw new Error("state controller must advertise research-strategy, work-contract, and artifact-evidence capabilities");
  }
  if (
    template.capabilities?.turn_context !== 1
    || template.capabilities?.required_references !== 1
    || template.capabilities?.operation_packet_ref !== 1
    || template.capabilities?.phase_capsule !== 1
    || template.capabilities?.begin_artifact_reservation !== 1
    || template.capabilities?.conditional_references !== 1
  ) {
    throw new Error("state controller must advertise phase-context and packet capabilities");
  }
  if (
    template.capabilities?.response_rendering !== 1
    || template.capabilities?.pending_decision !== 1
    || template.capabilities?.response_receipt !== 1
    || template.capabilities?.direct_assignment !== 1
    || template.capabilities?.startup_notice !== 1
  ) {
    throw new Error("state controller must advertise response rendering, direct assignment, and persistence capabilities");
  }
  process.stdout.write("skill package is valid\n");
}

if (require.main === module) main();

module.exports = {
  validateLoadedBy,
  validateReleaseMetadata,
};
