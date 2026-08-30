#!/usr/bin/env node
"use strict";

const lib = require("./install-hook-lib.cjs");

const HOST = "claude";

function install(projectRoot, options = {}) {
  return lib.install(HOST, projectRoot, options);
}

function isConsultantCommand(command) {
  return lib.isConsultantCommand(HOST, command);
}

if (require.main === module) {
  lib.runCli(HOST, process.argv.slice(2));
}

module.exports = {
  atomicWrite: lib.atomicWrite,
  install,
  isConsultantCommand,
};
