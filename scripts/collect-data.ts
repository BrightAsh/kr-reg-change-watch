import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs, rootDir } from "./common";

const args = parseArgs();
const dateArgs = typeof args.date === "string" ? ["--date", args.date] : [];
const forceArgs = args.force ? ["--force"] : [];
const tsxCli = path.join(rootDir, "node_modules", "tsx", "dist", "cli.mjs");

try {
  run("data:fetch", ["scripts/fetch-data.ts", ...dateArgs, ...forceArgs]);
} catch (error) {
  run("data:status", ["scripts/update-data-collection-status.ts"]);
  throw error;
}

run("data:diff", ["scripts/diff-data.ts", ...dateArgs]);
run("data:status", ["scripts/update-data-collection-status.ts"]);

function run(label: string, commandArgs: string[]): void {
  const result = spawnSync(process.execPath, [tsxCli, ...commandArgs], {
    cwd: rootDir,
    env: process.env,
    shell: false,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
}
