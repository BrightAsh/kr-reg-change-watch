import { readCollectionStatusReport } from "../lib/collectionStatus";
import { dateDaysAgo, env, parseArgs } from "./common";

const args = parseArgs();
const lookback = Number(env("FETCH_LOOKBACK_DAYS", "1"));
const targetDate = String(args.date || env("TARGET_DATE") || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));

const report = await readCollectionStatusReport();
const day = report.days.find((entry) => entry.date === targetDate);

if (!day) {
  console.error(`Collection status for ${targetDate} was not found.`);
  process.exit(1);
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
