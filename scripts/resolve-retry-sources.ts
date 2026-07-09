import fs from "node:fs/promises";
import path from "node:path";
import { dateDaysAgo, env, parseArgs } from "./common";
import { buildCollectionStatusReport, type CollectionSourceGroup } from "../lib/collectionStatus";
import type { CollectionLog } from "../lib/types";
import { selectedCollectionMethodStatuses } from "./sourceSelection";

type SourceGroup = CollectionSourceGroup;

interface FailedSourceGroupResolution {
  retry: SourceGroup[];
  diagnostic: SourceGroup[];
}

interface FailureLog {
  logs?: CollectionLog[];
}

interface DailyCollection {
  date?: string;
  logs?: CollectionLog[];
}

const sourceGroups: SourceGroup[] = [
  "official-law",
  "lawmaking",
  "gazette",
  "ministry-board",
  "motir",
  "alio",
  "naver-news"
];

const args = parseArgs();
const lookback = Number(env("FETCH_LOOKBACK_DAYS", "1"));
const targetDate = String(args.date || env("TARGET_DATE") || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));
const githubEnvPath = String(args["github-env"] || env("GITHUB_ENV") || "");
const githubOutputPath = String(args["github-output"] || env("GITHUB_OUTPUT") || "");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const daily = await readJson<DailyCollection | null>(path.join("data", "daily", `${targetDate}.json`), null);
  const failure = await readJson<FailureLog | null>(path.join("data", "logs", `failed-${targetDate}.json`), null);
  const resolution = failedSourceGroups(daily, failure);

  if (!daily && !failure) {
    await emit("SKIP_COLLECTION", "0");
    await emit("SKIP_PREFLIGHT", "0");
    await emit("RESOLVED_RETRY_SOURCES", "");
    console.log(`No existing collection for ${targetDate}; retry-failed will collect all sources.`);
    return;
  }

  const cleanupGroups = await cleanupOnlySourceGroups(resolution.diagnostic, resolution.retry);
  const cleanupSet = new Set(cleanupGroups);
  const retryGroups = sourceGroups.filter(
    (group) => resolution.retry.includes(group) || (resolution.diagnostic.includes(group) && !cleanupSet.has(group))
  );

  if (retryGroups.length) {
    const value = retryGroups.join(",");
    await emit("SKIP_COLLECTION", "0");
    await emit("SKIP_PREFLIGHT", "0");
    await emit("COLLECT_SOURCES", value);
    await emit("RESOLVED_RETRY_SOURCES", value);
    console.log(`Resolved failed source groups for ${targetDate}: ${value}`);
    return;
  }

  if (cleanupGroups.length) {
    const value = cleanupGroups.join(",");
    await emit("SKIP_COLLECTION", "0");
    await emit("SKIP_PREFLIGHT", "1");
    await emit("COLLECT_SOURCES", value);
    await emit("RESOLVED_RETRY_SOURCES", value);
    console.log(`Resolved cleanup-only source groups for ${targetDate}: ${value}`);
    return;
  }

  if (!retryGroups.length) {
    await emit("SKIP_COLLECTION", "1");
    await emit("SKIP_PREFLIGHT", "0");
    await emit("RESOLVED_RETRY_SOURCES", "");
    console.log(`No failed source group to retry for ${targetDate}; skipping collection workflow steps.`);
    return;
  }
}

function failedSourceGroups(daily: DailyCollection | null, failure: FailureLog | null): FailedSourceGroupResolution {
  const retryGroups = new Set<SourceGroup>();
  const diagnosticGroups = new Set<SourceGroup>();
  for (const log of [...(daily?.logs || []), ...(failure?.logs || [])]) {
    if (log.status !== "error" && log.status !== "skipped") continue;
    const group = normalizeGroup(log.group) || inferGroup(log);
    if (!group) continue;
    if (isRetryDiagnosticLog(log)) diagnosticGroups.add(group);
    else retryGroups.add(group);
  }
  return {
    retry: sourceGroups.filter((group) => retryGroups.has(group)),
    diagnostic: sourceGroups.filter((group) => diagnosticGroups.has(group))
  };
}

async function cleanupOnlySourceGroups(diagnosticGroups: SourceGroup[], retryGroups: SourceGroup[]): Promise<SourceGroup[]> {
  const retrySet = new Set(retryGroups);
  const candidates = diagnosticGroups.filter((group) => !retrySet.has(group));
  if (!candidates.length) return [];

  const report = await buildCollectionStatusReport();
  const day = report.days.find((entry) => entry.date === targetDate);
  if (!day) return [];

  return candidates.filter((group) => {
    const methods = selectedCollectionMethodStatuses(day.methods, new Set<CollectionSourceGroup>([group]));
    return methods.length > 0 && methods.every((method) => method.status === "ok");
  });
}

function isRetryDiagnosticLog(log: CollectionLog): boolean {
  const textValue = `${log.source || ""} ${log.message || ""}`;
  return /Critical source connectivity failure/i.test(textValue) ||
    /\uC811\uC18D \uD655\uC778|\uC218\uC9D1 \uC0C1\uD0DC \uC810\uAC80|\uC77C\uBD80 \uC218\uC9D1 \uC2E4\uD328/.test(textValue);
}

function normalizeGroup(value: unknown): SourceGroup | "" {
  if (typeof value !== "string") return "";
  return sourceGroups.includes(value as SourceGroup) ? (value as SourceGroup) : "";
}

function inferGroup(log: CollectionLog): SourceGroup | "" {
  const value = `${log.source || ""} ${log.message || ""} ${log.url || ""}`.toLowerCase();
  if (/law\.go\.kr|open\.law\.go\.kr|official-law/.test(value)) return "official-law";
  if (/lawmaking\.go\.kr|opinion\.lawmaking\.go\.kr|lawmaking/.test(value)) return "lawmaking";
  if (/gwanbo\.go\.kr|data\.go\.kr\/data\/15109157|gazette|gwanbo/.test(value)) return "gazette";
  if (/mois\.go\.kr|mofe\.go\.kr|ministry-board/.test(value)) return "ministry-board";
  if (/motir\.go\.kr|motir|industry-board/.test(value)) return "motir";
  if (/alio\.go\.kr|alio/.test(value)) return "alio";
  if (/naver\.com|naver-news|news search/.test(value)) return "naver-news";
  return "";
}

async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path.join(process.cwd(), filePath), "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function emit(name: string, value: string) {
  const line = `${name}=${value}`;
  console.log(line);
  if (githubEnvPath) {
    await fs.appendFile(githubEnvPath, `${line}\n`, "utf8");
  }
  if (githubOutputPath) {
    await fs.appendFile(githubOutputPath, `${name.toLowerCase()}=${value}\n`, "utf8");
  }
}
