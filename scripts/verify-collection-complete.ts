import { readCollectionStatusReport } from "../lib/collectionStatus";
import { dateDaysAgo, env, parseArgs } from "./common";
import {
  parseCollectionSourceFilter,
  selectedCollectionMethodSources,
  selectedCollectionMethodStatuses
} from "./sourceSelection";

const args = parseArgs();
const lookback = Number(env("FETCH_LOOKBACK_DAYS", "1"));
const targetDate = String(args.date || env("TARGET_DATE") || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));
const sourceFilter = parseCollectionSourceFilter(String(args.sources || env("COLLECT_SOURCES")));

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

  if (sourceFilter.size) {
    const selectedSources = selectedCollectionMethodSources(sourceFilter);
    const selectedMethods = selectedCollectionMethodStatuses(day.methods, sourceFilter);

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
