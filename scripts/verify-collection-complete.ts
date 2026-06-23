import path from "node:path";

import type { CollectionSourceGroup } from "../lib/collectionStatus";
import { readCollectionStatusReport } from "../lib/collectionStatus";
import type { CollectionLog, DailyCollection } from "../lib/types";
import { dailyDir, dateDaysAgo, env, parseArgs, readJson } from "./common";
import {
  parseCollectionRouteFilter,
  parseCollectionSourceFilter,
  selectedCollectionMethodSources,
  selectedCollectionMethodStatuses
} from "./sourceSelection";

const args = parseArgs();
const lookback = Number(env("FETCH_LOOKBACK_DAYS", "1"));
const targetDate = String(args.date || env("TARGET_DATE") || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));
const sourceFilterInput = String(args.sources || env("COLLECT_SOURCES"));
const sourceFilter = parseCollectionSourceFilter(sourceFilterInput);
const routeFilter = parseCollectionRouteFilter(String(args.routes || env("COLLECT_ROUTES") || sourceFilterInput));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const report = await readCollectionStatusReport();
  const day = report.days.find((entry) => entry.date === targetDate);

  if (!day) {
    console.error(`Collection status for ${targetDate} was not found.`);
    process.exit(1);
  }

  if (sourceFilter.size || routeFilter.size) {
    const selectedSources = selectedCollectionMethodSources(sourceFilter, routeFilter);
    const selectedMethods = selectedCollectionMethodStatuses(day.methods, sourceFilter, routeFilter);

    if (!selectedMethods.length) {
      console.error(`No selected collection routes were found in status for ${targetDate}: ${selectedSources.join(", ")}`);
      process.exit(1);
    }

    const problems = selectedMethods
      .filter((method) => method.status !== "ok")
      .slice(0, 20)
      .map((method) => `${method.source}: ${method.status}${method.message ? ` - ${method.message}` : ""}`);

    if (problems.length) {
      console.error(`Selected collection routes for ${targetDate} are not complete.`);
      for (const problem of problems) console.error(`- ${problem}`);
      process.exit(1);
    }

    const rawProblems = await selectedRawLogProblems(selectedSources);
    if (rawProblems.length) {
      console.error(`Selected collection routes for ${targetDate} still have raw error/skipped logs.`);
      for (const problem of rawProblems) console.error(`- ${problem}`);
      process.exit(1);
    }

    console.log(`Selected collection routes for ${targetDate} are complete: ${selectedSources.join(", ")}`);
    return;
  }

  if (day.status !== "complete") {
    const problems = day.methods
      .filter((method) => method.status !== "ok")
      .slice(0, 20)
      .map((method) => `${method.source}: ${method.status}${method.message ? ` - ${method.message}` : ""}`);

    console.error(`Collection for ${targetDate} is ${day.status}, not complete.`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }

  console.log(`Collection for ${targetDate} is complete.`);
}

async function selectedRawLogProblems(selectedSources: string[]): Promise<string[]> {
  const daily = await readJson<DailyCollection | null>(path.join(dailyDir, `${targetDate}.json`), null);
  if (!daily || daily.date !== targetDate || !Array.isArray(daily.logs)) return [];

  const selectedSourceSet = new Set(selectedSources);
  return daily.logs
    .filter(
      (log) =>
        (log.status === "error" || log.status === "skipped") &&
        logMatchesSelectedScope(log, selectedSourceSet) &&
        !isRawDiagnosticLog(log)
    )
    .slice(0, 20)
    .map(formatRawProblem);
}

function isRawDiagnosticLog(log: CollectionLog): boolean {
  const source = log.source || "";
  const textValue = `${source} ${log.message || ""}`;
  return (
    source.endsWith("\ubcf8\ubb38 \ubcf4\uac15") ||
    source.endsWith("\uc811\uc18d \ud655\uc778") ||
    source === "\uc218\uc9d1 \uc0c1\ud0dc \uc810\uac80" ||
    /Critical source connectivity failure/i.test(textValue) ||
    /\uc811\uc18d \ud655\uc778|\uc218\uc9d1 \uc0c1\ud0dc \uc810\uac80|\uc77c\ubd80 \uc218\uc9d1 \uc2e4\ud328/.test(textValue)
  );
}

function logMatchesSelectedScope(log: CollectionLog, selectedSourceSet: Set<string>): boolean {
  if (log.group && sourceFilter.has(log.group as CollectionSourceGroup)) return true;
  if (log.route && routeFilter.has(log.route)) return true;
  return selectedSourceSet.has(log.source);
}

function formatRawProblem(log: CollectionLog): string {
  const parts = [log.group, log.route, log.source].filter(Boolean).join(" / ");
  const label = parts || "unknown";
  return `${label}: ${log.status}${log.message ? ` - ${log.message}` : ""}`;
}
