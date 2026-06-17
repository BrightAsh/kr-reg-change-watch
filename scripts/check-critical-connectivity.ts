import path from "node:path";
import type { DailyCollection } from "../lib/types";
import { readCollectionStatusReport } from "../lib/collectionStatus";
import { dailyDir, dateDaysAgo, env, parseArgs, readJson } from "./common";
import {
  parseCollectionRouteFilter,
  parseCollectionSourceFilter,
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
  process.exit(2);
});

async function main() {
  const daily = await readJson<DailyCollection | null>(path.join(dailyDir, `${targetDate}.json`), null);
  const logCritical = daily?.logs?.find(
    (log) =>
      log.status !== "ok" &&
      /Critical source connectivity failure/i.test(`${log.source || ""} ${log.message || ""}`)
  );
  if (logCritical) {
    console.error(`Critical connectivity failure detected for ${targetDate}: ${logCritical.message || logCritical.source}`);
    process.exit(0);
  }

  const report = await readCollectionStatusReport();
  const day = report.days.find((entry) => entry.date === targetDate);

  if (!day) {
    console.log(`No collection status for ${targetDate}.`);
    process.exit(1);
  }

  const methods = selectedCollectionMethodStatuses(day.methods, sourceFilter, routeFilter);
  const critical = methods.find(
    (method) =>
      method.status !== "ok" &&
      /Critical source connectivity failure/i.test(`${method.source || ""} ${method.message || ""}`)
  );

  if (!critical) {
    const scope = sourceFilter.size || routeFilter.size ? "selected routes" : targetDate;
    console.log(`No critical connectivity failure for ${scope}.`);
    process.exit(1);
  }

  console.error(`Critical connectivity failure detected for ${targetDate}: ${critical.message || critical.source}`);
  process.exit(0);
}
