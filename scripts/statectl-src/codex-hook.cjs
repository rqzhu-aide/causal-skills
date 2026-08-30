#!/usr/bin/env node
"use strict";

const { runHook } = require("./hook-runner.cjs");

runHook("codex", { runtimeFile: __filename });
