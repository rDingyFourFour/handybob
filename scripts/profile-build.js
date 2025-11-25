#!/usr/bin/env node
const { spawn } = require("node:child_process");
const startTime = Date.now();
console.log("[profile-build] starting next build", new Date().toISOString());

const build = spawn("npm", ["run", "build"], {
  stdio: "inherit",
  env: process.env,
});

build.on("close", (code) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  if (code === 0) {
    console.log(`[profile-build] next build finished in ${duration}s`);
  } else {
    console.error(`[profile-build] next build exited with code ${code} after ${duration}s`);
    process.exit(code);
  }
});
