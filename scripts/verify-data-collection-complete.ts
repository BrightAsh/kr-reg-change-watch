import path from "node:path";
import type { CollectedItem, DailyCollection } from "../lib/types";
import { parseArgs, readJson, rootDir } from "./common";
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
  if (day.status !== "complete") {
    const failures = day.methods
      .filter((method) => method.status !== "ok")
      .map((method) => `${method.source}: ${method.status}${method.message ? ` - ${method.message}` : ""}`);
    throw new Error(`Data collection for ${targetDate} is ${day.status}.\n${failures.join("\n")}`);
  }
  const daily = await readJson<DailyCollection | null>(
    path.join(rootDir, "data", "data", "daily", `${targetDate}.json`),
    null
  );
  if (!daily) {
    throw new Error(`Data collection file for ${targetDate} was not found.`);
  }
  const qualityErrors = validateDailyQuality(targetDate, daily.items);
  if (qualityErrors.length > 0) {
    throw new Error(`Data collection for ${targetDate} has quality errors.\n${qualityErrors.join("\n")}`);
  }
  console.log(`Data collection for ${targetDate} is ${day.status}. ${day.item_count} item(s) collected.`);
}

function validateDailyQuality(targetDate: string, items: CollectedItem[]): string[] {
  const errors: string[] = [];
  const badTitles = items.filter((item) => /-->|게시일\s*(?:19|20)\d{2}|조회\s*\d+|^[:：]/.test(item.title));
  if (badTitles.length > 0) {
    errors.push(
      `Contaminated titles: ${badTitles
        .slice(0, 5)
        .map((item) => `${item.source} - ${item.title}`)
        .join("; ")}`
    );
  }

  const invalidDates = items.filter((item) => item.publish_date && item.publish_date !== targetDate);
  if (invalidDates.length > 0) {
    errors.push(
      `Publish date mismatches: ${invalidDates
        .slice(0, 5)
        .map((item) => `${item.source} - ${item.title} (${item.publish_date})`)
        .join("; ")}`
    );
  }

  const invalidUrls = items.filter((item) => !/^https?:\/\//i.test(item.original_url));
  if (invalidUrls.length > 0) {
    errors.push(
      `Invalid original URLs: ${invalidUrls
        .slice(0, 5)
        .map((item) => `${item.source} - ${item.title} (${item.original_url})`)
        .join("; ")}`
    );
  }

  const duplicateKeys = new Map<string, CollectedItem[]>();
  for (const item of items) {
    const key = [item.source, item.title.replace(/\s+/g, "").toLowerCase(), item.publish_date || ""].join("|");
    duplicateKeys.set(key, [...(duplicateKeys.get(key) || []), item]);
  }
  const duplicates = [...duplicateKeys.values()].filter((group) => group.length > 1);
  if (duplicates.length > 0) {
    errors.push(
      `Duplicate items: ${duplicates
        .slice(0, 5)
        .map((group) => `${group[0].source} - ${group[0].title} (${group.length})`)
        .join("; ")}`
    );
  }

  return errors;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
