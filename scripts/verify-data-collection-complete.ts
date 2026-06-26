import { parseArgs } from "./common";
import { readDataCollectionStatusReport } from "../lib/dataCollectionStatus";

const args = parseArgs();

async function main() {
  const report = await readDataCollectionStatusReport();
  const targetDate =
    typeof args.date === "string"
      ? args.date
      : [...report.days].reverse().find((day) => day.status !== "not_started")?.date;
  if (!targetDate) {
    throw new Error("No data collection date was found.");
  }
  const day = report.days.find((entry) => entry.date === targetDate);
  if (!day) {
    throw new Error(`Data collection status for ${targetDate} was not found.`);
  }
  if (day.status === "failed") {
    const failures = day.methods
      .filter((method) => method.status === "error" || method.status === "external_error")
      .map((method) => `${method.source}: ${method.status}${method.message ? ` - ${method.message}` : ""}`);
    throw new Error(`Data collection for ${targetDate} failed.\n${failures.join("\n")}`);
  }
  console.log(`Data collection for ${targetDate} is ${day.status}. ${day.item_count} item(s) collected.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
