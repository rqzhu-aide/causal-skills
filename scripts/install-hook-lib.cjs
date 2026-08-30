"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SKILL_ROOT = path.resolve(__dirname, "..");
const COMMAND_MARKER = "/* causal-consultant Codex hook */";
const CONSULTANT_BASENAME_PATTERN = /(?:^|[\/\s'"=,])project_state_stop_check\.(?:cjs|js)(?=$|[\/\s'"`,;])/;

const HOSTS = {
  codex: {
    directoryName: ".codex",
    configName: "hooks.json",
    hookName: "project_state_stop_check.cjs",
    sourceConfig: path.join(SKILL_ROOT, "project-hooks", "codex", "hooks.json"),
    sourceBundle: path.join(SKILL_ROOT, "project-hooks", "codex", "project_state_stop_check.cjs"),
    anchored: true,
  },
  claude: {
    directoryName: ".claude",
    configName: "settings.json",
    hookName: "project_state_stop_check.cjs",
    sourceConfig: path.join(SKILL_ROOT, "project-hooks", "claude", "settings.json"),
    sourceBundle: path.join(SKILL_ROOT, "project-hooks", "claude", "project_state_stop_check.cjs"),
    anchored: false,
  },
};

function hostConfig(hostName) {
  const host = HOSTS[hostName];
  if (!host) throw new Error(`unsupported hook host: ${hostName}`);
  return host;
}

function configLabel(host) {
  return `${host.directoryName}/${host.configName}`;
}

function consultantPathPattern(host) {
  const directory = host.directoryName.replace(/\./g, "\\.");
  return new RegExp(
    `(?:^|[\\/\\s'"=])${directory}\\/project_state_stop_check\\.(?:cjs|js)(?=$|[\\s'"\`,;])`,
  );
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseArguments(argv) {
  let projectRoot = process.cwd();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--project-root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--project-root requires a directory");
      projectRoot = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return path.resolve(projectRoot);
}

function assertSafeTarget(host, projectRoot) {
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`project root is not a directory: ${projectRoot}`);
  }
  const hookDirectory = path.join(projectRoot, host.directoryName);
  if (fs.existsSync(hookDirectory) && fs.lstatSync(hookDirectory).isSymbolicLink()) {
    throw new Error(`refusing to install through a symbolic ${host.directoryName} directory`);
  }
  for (const target of [host.configName, host.hookName]) {
    const candidate = path.join(hookDirectory, target);
    if (fs.existsSync(candidate)) {
      const status = fs.lstatSync(candidate);
      if (status.isSymbolicLink()) {
        throw new Error(`refusing to replace symbolic target: ${host.directoryName}/${target}`);
      }
      if (!status.isFile()) {
        throw new Error(`refusing to replace non-regular target: ${host.directoryName}/${target}`);
      }
    }
  }
  return hookDirectory;
}

function anchoredCommand(bundleTarget, bundleBytes) {
  const encodedTarget = Buffer.from(bundleTarget, "utf8").toString("base64");
  const expectedHash = crypto.createHash("sha256").update(bundleBytes).digest("hex");
  return "node -e \"" + COMMAND_MARKER
    + "const c=require('crypto'),f=require('fs'),p=Buffer.from('" + encodedTarget
    + "','base64').toString('utf8'),h=c.createHash('sha256').update(f.readFileSync(p)).digest('hex');"
    + "if(h!=='" + expectedHash + "')throw new Error('causal-consultant Codex hook integrity check failed');"
    + "require(p)\"";
}

function canonicalHandler(host, bundleTarget, bundleBytes) {
  const config = JSON.parse(fs.readFileSync(host.sourceConfig, "utf8"));
  const handler = structuredClone(config.hooks.Stop[0].hooks[0]);
  if (host.anchored) {
    handler.command = anchoredCommand(bundleTarget, bundleBytes);
    handler.commandWindows = anchoredCommand(bundleTarget, bundleBytes);
  }
  return handler;
}

function isConsultantCommand(host, command) {
  if (typeof command !== "string") return false;
  if (command.includes(COMMAND_MARKER)) return true;
  const normalized = command.replace(/\\/g, "/");
  return consultantPathPattern(host).test(normalized)
    || (
      CONSULTANT_BASENAME_PATTERN.test(normalized)
      && normalized.includes("causal-consultant")
    );
}

function matchingHandlers(host, stopGroups) {
  const matches = [];
  for (let groupIndex = 0; groupIndex < stopGroups.length; groupIndex += 1) {
    const group = stopGroups[groupIndex];
    if (!isPlainObject(group) || !Array.isArray(group.hooks)) {
      throw new Error("existing hooks.Stop entries must contain a hooks array");
    }
    for (let hookIndex = 0; hookIndex < group.hooks.length; hookIndex += 1) {
      const handler = group.hooks[hookIndex];
      if (!isPlainObject(handler)) throw new Error("existing Stop hook handlers must be objects");
      const commands = [
        handler.command,
        handler.commandWindows,
        ...(Array.isArray(handler.args) ? handler.args : []),
      ].filter((value) => typeof value === "string");
      if (commands.some((command) => isConsultantCommand(host, command))) {
        matches.push({ groupIndex, hookIndex, handler });
      }
    }
  }
  return matches;
}

function mergedConfig(host, existing, handler) {
  if (!isPlainObject(existing)) {
    throw new Error(`existing ${configLabel(host)} must contain a JSON object`);
  }
  const merged = structuredClone(existing);
  if (merged.hooks === undefined) merged.hooks = {};
  if (!isPlainObject(merged.hooks)) throw new Error("existing hooks value must be an object");
  if (merged.hooks.Stop === undefined) merged.hooks.Stop = [];
  if (!Array.isArray(merged.hooks.Stop)) throw new Error("existing hooks.Stop value must be an array");

  const matches = matchingHandlers(host, merged.hooks.Stop);
  if (matches.length > 1) {
    throw new Error("multiple causal-consultant Stop hooks found; remove duplicates before installing");
  }
  if (matches.length === 1) {
    const match = matches[0];
    merged.hooks.Stop[match.groupIndex].hooks[match.hookIndex] = structuredClone(handler);
  } else {
    merged.hooks.Stop.push({ hooks: [structuredClone(handler)] });
  }
  return merged;
}

function backupFile(target) {
  if (!fs.existsSync(target)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  for (let suffix = 0; ; suffix += 1) {
    const candidate = `${target}.bak-${stamp}${suffix === 0 ? "" : `-${suffix}`}`;
    try {
      fs.copyFileSync(target, candidate, fs.constants.COPYFILE_EXCL);
      return candidate;
    } catch (error) {
      if (error && error.code === "EEXIST") continue;
      throw error;
    }
  }
}

function stageTemporary(target, bytes, mode) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const temporary = target + ".tmp-" + process.pid + "-" + crypto.randomUUID();
    let descriptor;
    try {
      descriptor = fs.openSync(temporary, "wx", mode);
    } catch (error) {
      if (error && error.code === "EEXIST") continue;
      throw error;
    }
    try {
      fs.writeFileSync(descriptor, bytes);
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      descriptor = undefined;
      return temporary;
    } catch (error) {
      if (descriptor !== undefined) {
        try {
          fs.closeSync(descriptor);
        } catch {
          // Preserve the primary staging failure.
        }
      }
      fs.rmSync(temporary, { force: true });
      throw error;
    }
  }
  throw new Error("could not allocate an exclusive temporary hook file");
}

function randomSibling(target, label) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = target + "." + label + "-" + process.pid + "-" + crypto.randomUUID();
    if (!fs.existsSync(candidate)) return candidate;
  }
  throw new Error("could not allocate a replacement path for " + target);
}

function atomicWrite(target, bytes) {
  let mode = 0o600;
  if (fs.existsSync(target)) {
    const status = fs.lstatSync(target);
    if (!status.isFile() || status.isSymbolicLink()) {
      throw new Error("refusing to replace a non-regular target: " + target);
    }
    mode = status.mode & 0o7777;
  }
  const temporary = stageTemporary(target, bytes, mode);
  let displaced = null;
  try {
    fs.renameSync(temporary, target);
  } catch (error) {
    if (!fs.existsSync(target)) throw error;
    displaced = randomSibling(target, "replace");
    fs.renameSync(target, displaced);
    try {
      fs.renameSync(temporary, target);
    } catch (replacementError) {
      try {
        if (!fs.existsSync(target) && fs.existsSync(displaced)) {
          fs.renameSync(displaced, target);
          displaced = null;
        }
      } catch (restorationError) {
        const combined = new Error(
          "replacement failed: " + describeError(replacementError)
            + "; immediate restoration failed: " + describeError(restorationError),
        );
        combined.residuePaths = displaced ? [displaced] : [];
        throw combined;
      }
      throw replacementError;
    }
    try {
      fs.rmSync(displaced, { force: true });
      displaced = null;
    } catch (cleanupError) {
      cleanupError.residuePaths = [displaced];
      throw cleanupError;
    }
  } finally {
    try {
      fs.rmSync(temporary, { force: true });
    } catch (cleanupError) {
      cleanupError.residuePaths = [
        temporary,
        ...(displaced ? [displaced] : []),
      ];
      throw cleanupError;
    }
  }
}

function sameBytes(target, bytes) {
  return fs.existsSync(target) && fs.readFileSync(target).equals(bytes);
}

function snapshotFile(target) {
  const existed = fs.existsSync(target);
  const status = existed ? fs.statSync(target) : null;
  return {
    target,
    existed,
    bytes: existed ? fs.readFileSync(target) : null,
    mode: status ? status.mode & 0o7777 : null,
  };
}

function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function rollbackTargets(snapshots, writeTarget) {
  const actionFailures = new Map();
  const failures = [];
  const residuePaths = [];
  for (const snapshot of [...snapshots].reverse()) {
    try {
      if (snapshot.existed) {
        writeTarget(snapshot.target, snapshot.bytes);
        fs.chmodSync(snapshot.target, snapshot.mode);
      } else {
        fs.rmSync(snapshot.target, { force: true });
      }
    } catch (error) {
      actionFailures.set(snapshot.target, describeError(error));
      if (Array.isArray(error && error.residuePaths)) {
        residuePaths.push(...error.residuePaths.filter((item) => typeof item === "string"));
      }
    }
  }
  for (const snapshot of snapshots) {
    try {
      if (snapshot.existed !== fs.existsSync(snapshot.target)) {
        throw new Error("existence differs from the pre-install snapshot");
      }
      if (snapshot.existed) {
        const status = fs.lstatSync(snapshot.target);
        if (!status.isFile() || status.isSymbolicLink()) {
          throw new Error("restored target is not a regular file");
        }
        if (!fs.readFileSync(snapshot.target).equals(snapshot.bytes)) {
          throw new Error("restored bytes differ from the pre-install snapshot");
        }
        if ((status.mode & 0o7777) !== snapshot.mode) {
          throw new Error("restored mode differs from the pre-install snapshot");
        }
      }
    } catch (error) {
      const actionFailure = actionFailures.get(snapshot.target);
      failures.push(
        snapshot.target + ": "
          + (actionFailure ? "restore action failed: " + actionFailure + "; " : "")
          + "restoration verification failed: " + describeError(error),
      );
    }
  }
  return { failures, residuePaths };
}

function cleanupFiles(targets) {
  const failures = [];
  for (const target of targets) {
    try {
      fs.rmSync(target, { force: true });
    } catch (error) {
      failures.push(target + ": " + describeError(error));
    }
  }
  return failures;
}

function install(hostName, projectRoot, options = {}) {
  const host = hostConfig(hostName);
  const canonicalProjectRoot = fs.realpathSync.native(projectRoot);
  const hookDirectory = assertSafeTarget(host, canonicalProjectRoot);
  const hookDirectoryExisted = fs.existsSync(hookDirectory);
  const configTarget = path.join(hookDirectory, host.configName);
  const bundleTarget = path.join(hookDirectory, host.hookName);
  const existingText = fs.existsSync(configTarget) ? fs.readFileSync(configTarget, "utf8") : "{}";
  let existing;
  try {
    existing = JSON.parse(existingText);
  } catch (error) {
    throw new Error(`existing ${configLabel(host)} is invalid JSON: ${error.message}`);
  }

  const bundleBytes = fs.readFileSync(host.sourceBundle);
  const merged = mergedConfig(host, existing, canonicalHandler(host, bundleTarget, bundleBytes));
  const configBytes = Buffer.from(`${JSON.stringify(merged, null, 2)}\n`, "utf8");
  const configChanged = !sameBytes(configTarget, configBytes);
  const bundleChanged = !sameBytes(bundleTarget, bundleBytes);
  if (!configChanged && !bundleChanged) {
    return { ok: true, code: "ALREADY_INSTALLED", project_root: canonicalProjectRoot, backups: [] };
  }

  fs.mkdirSync(hookDirectory, { recursive: true });
  const snapshots = [snapshotFile(bundleTarget), snapshotFile(configTarget)];
  const backupTargets = [];
  const writeTarget = options.writeTarget || atomicWrite;
  const rollbackWriteTarget = options.rollbackWriteTarget || atomicWrite;
  try {
    if (bundleChanged) {
      const backup = backupFile(bundleTarget);
      if (backup) backupTargets.push(backup);
    }
    if (configChanged) {
      const backup = backupFile(configTarget);
      if (backup) backupTargets.push(backup);
    }

    if (bundleChanged) writeTarget(bundleTarget, bundleBytes);
    if (configChanged) writeTarget(configTarget, configBytes);
  } catch (installError) {
    const rollback = rollbackTargets(snapshots, rollbackWriteTarget);
    if (rollback.failures.length > 0) {
      const rollbackError = new Error(
        "installation failed: " + describeError(installError)
          + "; rollback failed: " + rollback.failures.join("; "),
      );
      rollbackError.code = "ROLLBACK_FAILED";
      throw rollbackError;
    }
    const residuePaths = Array.isArray(installError && installError.residuePaths)
      ? installError.residuePaths.filter((item) => typeof item === "string")
      : [];
    const cleanupFailures = cleanupFiles([
      ...backupTargets,
      ...residuePaths,
      ...rollback.residuePaths,
    ]);
    if (!hookDirectoryExisted) {
      try {
        fs.rmdirSync(hookDirectory);
      } catch (error) {
        if (!error || !["ENOENT", "ENOTEMPTY"].includes(error.code)) {
          cleanupFailures.push(hookDirectory + ": " + describeError(error));
        }
      }
    }
    if (cleanupFailures.length > 0) {
      throw new Error(
        "installation failed: " + describeError(installError)
          + "; original targets restored but cleanup failed: " + cleanupFailures.join("; "),
      );
    }
    throw new Error(
      "installation failed and original targets were restored: " + describeError(installError),
    );
  }
  const backups = backupTargets.map(
    (backup) => path.relative(canonicalProjectRoot, backup).split(path.sep).join("/"),
  );
  return {
    ok: true,
    code: "INSTALLED",
    project_root: canonicalProjectRoot,
    changed: { bundle: bundleChanged, config: configChanged },
    backups,
  };
}

function runCli(hostName, argv) {
  try {
    const result = install(hostName, parseArguments(argv));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error && error.code === "ROLLBACK_FAILED" ? error.code : "INSTALL_FAILED";
    process.stdout.write(`${JSON.stringify({ ok: false, code, message: error.message })}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  HOSTS,
  anchoredCommand,
  atomicWrite,
  install,
  isConsultantCommand,
  runCli,
};
