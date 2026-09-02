"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const CONTEXT_PROTOCOL = "phase-capsule-v1";
const CONTEXT_VERSION = 1;
const CONTEXT_RELATIVE_PATH = ".statectl-tmp/phase-context.json";

class ContextFileError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = "ContextFileError";
    this.code = code;
    this.details = details;
  }
}

function contextPaths(projectRoot) {
  const root = path.resolve(projectRoot);
  const directory = path.join(root, ".statectl-tmp");
  return {
    root,
    directory,
    filePath: path.join(directory, "phase-context.json"),
    relativePath: CONTEXT_RELATIVE_PATH,
  };
}

function fail(code, message, details = undefined) {
  throw new ContextFileError(code, message, details);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function capsuleContextId(capsule) {
  const { context_id: _contextId, ...body } = capsule;
  const digest = crypto.createHash("sha256").update(canonicalJson(body), "utf8").digest("hex");
  return `ctx-v${CONTEXT_VERSION}-${digest}`;
}

function validateDirectory(paths, { create }) {
  let rootStat;
  try {
    rootStat = fs.statSync(paths.root);
  } catch (error) {
    fail(
      "CONTEXT_FILE_PREFLIGHT_FAILED",
      `could not inspect project root ${paths.root}: ${error.message}`,
    );
  }
  if (!rootStat.isDirectory()) {
    fail("CONTEXT_FILE_PREFLIGHT_FAILED", `project root is not a directory: ${paths.root}`);
  }

  if (!fs.existsSync(paths.directory)) {
    if (!create) return false;
    try {
      fs.mkdirSync(paths.directory, { mode: 0o700 });
    } catch (error) {
      if (!fs.existsSync(paths.directory)) {
        fail(
          "CONTEXT_FILE_PREFLIGHT_FAILED",
          `could not create ${CONTEXT_RELATIVE_PATH}: ${error.message}`,
        );
      }
    }
  }

  let directoryStat;
  try {
    directoryStat = fs.lstatSync(paths.directory);
  } catch (error) {
    fail(
      "CONTEXT_FILE_PREFLIGHT_FAILED",
      `could not inspect .statectl-tmp: ${error.message}`,
    );
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    fail(
      "CONTEXT_FILE_PREFLIGHT_FAILED",
      ".statectl-tmp must be a real directory inside the project root",
    );
  }

  try {
    const realRoot = fs.realpathSync(paths.root);
    const realDirectory = fs.realpathSync(paths.directory);
    const relative = path.relative(realRoot, realDirectory);
    if (
      relative === ""
      || path.isAbsolute(relative)
      || relative === ".."
      || relative.startsWith(`..${path.sep}`)
    ) {
      fail(
        "CONTEXT_FILE_PREFLIGHT_FAILED",
        ".statectl-tmp resolves outside the project root",
      );
    }
  } catch (error) {
    if (error instanceof ContextFileError) throw error;
    fail(
      "CONTEXT_FILE_PREFLIGHT_FAILED",
      `could not resolve .statectl-tmp safely: ${error.message}`,
    );
  }

  if (fs.existsSync(paths.filePath)) {
    let fileStat;
    try {
      fileStat = fs.lstatSync(paths.filePath);
    } catch (error) {
      fail(
        "CONTEXT_FILE_PREFLIGHT_FAILED",
        `could not inspect ${CONTEXT_RELATIVE_PATH}: ${error.message}`,
      );
    }
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) {
      fail(
        "CONTEXT_FILE_PREFLIGHT_FAILED",
        `${CONTEXT_RELATIVE_PATH} must be a regular file when it already exists`,
      );
    }
  }
  return true;
}

function preflightContextFile(projectRoot) {
  const paths = contextPaths(projectRoot);
  validateDirectory(paths, { create: true });
  const probePath = path.join(
    paths.directory,
    `.phase-context.preflight-${process.pid}-${crypto.randomUUID()}`,
  );
  let handle;
  try {
    handle = fs.openSync(probePath, "wx", 0o600);
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    fs.rmSync(probePath);
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch (_closeError) { /* best effort */ }
    }
    try { fs.rmSync(probePath, { force: true }); } catch (_removeError) { /* best effort */ }
    fail(
      "CONTEXT_FILE_PREFLIGHT_FAILED",
      `could not prepare ${CONTEXT_RELATIVE_PATH}: ${error.message}`,
    );
  }
  return paths;
}

function validateFullCapsule(capsule) {
  const validShape = (
    capsule !== null
    && typeof capsule === "object"
    && !Array.isArray(capsule)
    && capsule.protocol === CONTEXT_PROTOCOL
    && capsule.version === CONTEXT_VERSION
    && capsule.kind === "full"
    && ["router", "worker", "lead"].includes(capsule.phase)
    && typeof capsule.context_id === "string"
    && /^ctx-v1-[a-f0-9]{64}$/.test(capsule.context_id)
  );
  if (!validShape || capsule.context_id !== capsuleContextId(capsule)) {
    fail("CONTEXT_FILE_WRITE_FAILED", "controller did not return an intact full phase capsule");
  }
}

function writeFullCapsule(projectRoot, capsule, preparedPaths = null) {
  validateFullCapsule(capsule);
  const paths = preparedPaths ?? preflightContextFile(projectRoot);
  validateDirectory(paths, { create: false });
  const temporaryPath = path.join(
    paths.directory,
    `.phase-context.json.tmp-${process.pid}-${crypto.randomUUID()}`,
  );
  let handle;
  try {
    handle = fs.openSync(temporaryPath, "wx", 0o600);
    fs.writeFileSync(handle, `${JSON.stringify(capsule)}\n`, "utf8");
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    if (process.env.STATECTL_FAIL_CONTEXT_WRITE === "1") {
      throw new Error("injected phase-context write failure");
    }
    fs.renameSync(temporaryPath, paths.filePath);
  } catch (error) {
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch (_closeError) { /* best effort */ }
    }
    try { fs.rmSync(temporaryPath, { force: true }); } catch (_removeError) { /* best effort */ }
    fail(
      "CONTEXT_FILE_WRITE_FAILED",
      `could not atomically write ${CONTEXT_RELATIVE_PATH}: ${error.message}`,
    );
  }
  return {
    protocol: capsule.protocol,
    version: capsule.version,
    context_id: capsule.context_id,
    phase: capsule.phase,
    path: paths.relativePath,
  };
}

function compactContextResult(result, contextRef) {
  const compact = {
    ok: result.ok,
    code: result.code,
    project_id: result.project_id,
    revision: result.revision,
  };
  for (const field of ["mode", "operation_id", "stage"]) {
    if (result[field] !== undefined) compact[field] = result[field];
  }
  for (const field of [
    "artifact_intent",
    "scope_ref",
    "discovery_scope",
    "temporary_path",
    "manifest_path",
  ]) {
    if (result[field] !== undefined) compact[field] = result[field];
  }
  compact.context_ref = contextRef;
  return compact;
}

function deliveryWarning(error, fallbackCode) {
  return {
    code: error && typeof error.code === "string" ? error.code : fallbackCode,
    message: error && error.message ? error.message : String(error),
  };
}

function isOwnedCapsule(value) {
  try {
    validateFullCapsule(value);
    return true;
  } catch (_error) {
    return false;
  }
}

function contextCapsuleOwnershipError(capsule, expectedProjectId, expectedOperationId) {
  if (!isOwnedCapsule(capsule)) {
    return `${CONTEXT_RELATIVE_PATH} is not a controller phase capsule and was left unchanged`;
  }
  if (capsule.turn_context?.project_id !== expectedProjectId) {
    return `${CONTEXT_RELATIVE_PATH} belongs to a different project and was left unchanged`;
  }
  if (capsule.turn_context?.operation?.id !== expectedOperationId) {
    return `${CONTEXT_RELATIVE_PATH} belongs to a different operation and was left unchanged`;
  }
  return null;
}

function holdContextCleanupForTest(variable) {
  if (process.env[variable] === undefined) return;
  const milliseconds = Number(process.env[variable]);
  if (!Number.isInteger(milliseconds) || milliseconds < 1 || milliseconds > 5_000) {
    fail(
      "CONTEXT_FILE_CLEANUP_FAILED",
      `${variable} must be an integer from 1 to 5000`,
    );
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function signalContextCleanupPreviewForTest(paths) {
  const markerName = process.env.STATECTL_TEST_CONTEXT_CLEANUP_PREVIEW_MARKER;
  if (markerName === undefined) return;
  if (
    path.basename(markerName) !== markerName
    || !/^\.phase-context\.preview-ready-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(markerName)
  ) {
    fail(
      "CONTEXT_FILE_CLEANUP_FAILED",
      "STATECTL_TEST_CONTEXT_CLEANUP_PREVIEW_MARKER must be a generated preview-marker filename",
    );
  }
  fs.writeFileSync(path.join(paths.directory, markerName), "", { flag: "wx" });
}

function restoreClaimedContextFile(paths, claimPath, cause) {
  try {
    if (process.env.STATECTL_FAIL_CONTEXT_RESTORE_LINK === "1") {
      throw new Error("injected phase-context restore-link failure");
    }
    fs.linkSync(claimPath, paths.filePath);
    fs.rmSync(claimPath);
    return null;
  } catch (error) {
    return {
      code: "CONTEXT_FILE_CLEANUP_FAILED",
      message: [
        cause && cause.message ? cause.message : String(cause),
        `A claimed capsule was preserved at ${claimPath} because it could not be restored without replacing a concurrent writer: ${error.message}`,
      ].join(" "),
    };
  }
}

function removeOwnedContextFile(projectRoot, expectedProjectId, expectedOperationId) {
  const paths = contextPaths(projectRoot);
  if (!fs.existsSync(paths.directory)) return null;
  let claimPath = null;
  let claimIsRegular = false;
  try {
    if (!validateDirectory(paths, { create: false })) return null;
    if (!fs.existsSync(paths.filePath)) return null;
    const preview = JSON.parse(fs.readFileSync(paths.filePath, "utf8"));
    const previewError = contextCapsuleOwnershipError(
      preview,
      expectedProjectId,
      expectedOperationId,
    );
    if (previewError !== null) fail("CONTEXT_FILE_CLEANUP_FAILED", previewError);

    if (process.env.STATECTL_FAIL_CONTEXT_CLEANUP === "1") {
      throw new Error("injected phase-context cleanup failure");
    }
    signalContextCleanupPreviewForTest(paths);
    holdContextCleanupForTest("STATECTL_TEST_CONTEXT_CLEANUP_HOLD_MS");
    claimPath = path.join(
      paths.directory,
      `.phase-context.cleanup-${process.pid}-${crypto.randomUUID()}`,
    );
    try {
      fs.renameSync(paths.filePath, claimPath);
    } catch (error) {
      if (error && error.code === "ENOENT") return null;
      throw error;
    }
    holdContextCleanupForTest("STATECTL_TEST_CONTEXT_CLEANUP_CLAIM_HOLD_MS");
    const claimStat = fs.lstatSync(claimPath);
    claimIsRegular = claimStat.isFile() && !claimStat.isSymbolicLink();
    if (!claimIsRegular) {
      fail(
        "CONTEXT_FILE_CLEANUP_FAILED",
        "the atomically claimed phase context is not a regular file and was quarantined",
      );
    }
    const claimed = JSON.parse(fs.readFileSync(claimPath, "utf8"));
    const claimedError = contextCapsuleOwnershipError(
      claimed,
      expectedProjectId,
      expectedOperationId,
    );
    if (claimedError !== null) fail("CONTEXT_FILE_CLEANUP_FAILED", claimedError);
    fs.rmSync(claimPath);
    return null;
  } catch (error) {
    if (claimPath !== null && fs.existsSync(claimPath)) {
      if (!claimIsRegular) {
        return {
          code: "CONTEXT_FILE_CLEANUP_FAILED",
          message: `${error.message} The claimed path was preserved at ${claimPath}.`,
        };
      }
      const restoreWarning = restoreClaimedContextFile(paths, claimPath, error);
      if (restoreWarning !== null) return restoreWarning;
    }
    return {
      code: "CONTEXT_FILE_CLEANUP_FAILED",
      message: error && error.message ? error.message : String(error),
    };
  }
}

module.exports = {
  CONTEXT_PROTOCOL,
  CONTEXT_RELATIVE_PATH,
  ContextFileError,
  capsuleContextId,
  compactContextResult,
  deliveryWarning,
  preflightContextFile,
  removeOwnedContextFile,
  writeFullCapsule,
};
