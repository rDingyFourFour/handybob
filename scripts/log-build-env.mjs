#!/usr/bin/env node
const { env } = process;

console.log(
  `Build environment: VERCEL=${env.VERCEL ?? "undefined"} NODE_ENV=${env.NODE_ENV ?? "undefined"}`,
);
