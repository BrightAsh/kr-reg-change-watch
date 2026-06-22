import fs from "node:fs/promises";
import path from "node:path";
import { dateDaysAgo, env, parseArgs } from "./common";
import type { CollectionLog } from "../lib/types";

type SourceGroup =
  | "official-law"
  | "lawmaking"
  | "gazette"
  | "ministry-board"
  | "motir"
  | "alio"
  | "policy-rss"
  | "naver-news";

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
  "policy-rss",
  "naver-news"
];

const args = parseArgs();
const lookback = Number(env("FETCH_LOOKBACK_DAYS", "1"));
const targetDate = String(args.date || env("TARGET_DATE") || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));
const githubEnvPath = String(args["github-env"] || env("GITHUB_ENV") || "");

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

async function main() {
  const daily = await readJson<DailyCollection | null>(path.join("data", "daily", `${targetDate}.json`), null);
  const failure = await readJson<FailureLog | null>(path.join("data", "logs", `failed-${targetDate}.json`), null);
  const groups = failedSourceGroups(daily, failure);

  if (!daily && !failure) {
    await emit("SKIP_COLLECTION", "0");
    await emit("RESOLVED_RETRY_SOURCES", "");
    console.log(`No existing collection for ${targetDate}; retry-failed will collect all sources.`);
    return;
  }

  if (!groups.length) {
    await emit("SKIP_COLLECTION", "1");
    await emit("RESOLVED_RETRY_SOURCES", "");
    console.log(`No failed source group to retry for ${targetDate}; skipping collection workflow steps.`);
    return;
  }

  const value = groups.join(",");
  await emit("SKIP_COLLECTION", "0");
  await emit("COLLECT_SOURCES", value);
  await emit("RESOLVED_RETRY_SOURCES", value);
  console.log(`Resolved failed source groups for ${targetDate}: ${value}`);
}

function failedSourceGroups(daily: DailyCollection | null, failure: FailureLog | null): SourceGroup[] {
  const groups = new Set<SourceGroup>();
  for (const log of [...(daily?.logs || []), ...(failure?.logs || [])]) {
    if (log.status !== "error" && log.status !== "skipped") continue;
    const group = normalizeGroup(log.group) || inferGroup(log);
    if (group) groups.add(group);
  }
  return sourceGroups.filter((group) => groups.has(group));
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
  if (/korea\.kr|policy-rss|rss/.test(value)) return "policy-rss";
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
}
