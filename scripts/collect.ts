import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs, rootDir } from "./common";

const args = parseArgs();
const dateArgs = typeof args.date === "string" ? ["--date", args.date] : [];
const forceArgs = args.force ? ["--force"] : [];
const retryFailedArgs = args["retry-failed"] ? ["--retry-failed"] : [];
const tsx = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

try {
  run("fetch", ["scripts/fetch.ts", ...dateArgs, ...forceArgs, ...retryFailedArgs]);
} catch (error) {
  run("status:update", ["scripts/update-collection-status.ts"]);
  throw error;
}

run("diff", ["scripts/diff.ts", ...dateArgs]);
run("summarize", ["scripts/summarize.ts", ...dateArgs]);
run("status:update", ["scripts/update-collection-status.ts"]);

function run(label: string, commandArgs: string[]): void {
  const result = spawnSync(tsx, commandArgs, {
    cwd: rootDir,
    env: process.env,
    shell: false,
    stdio: "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}
