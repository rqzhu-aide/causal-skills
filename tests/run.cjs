"use strict";
// Explicit file arguments work across supported Node versions and shells.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const files = fs.readdirSync(__dirname).filter(name => name.endsWith(".test.cjs")).sort()
  .map(name => path.join(__dirname, name));
if (!files.length) throw new Error("No test files found");
const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...files], {
  cwd: path.resolve(__dirname, ".."), stdio: "inherit", windowsHide: true
});
if (result.error) throw result.error;
process.exitCode = result.status === null ? 1 : result.status;
