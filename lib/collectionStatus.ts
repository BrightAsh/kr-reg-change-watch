import fs from "node:fs/promises";
import path from "node:path";
import type { CollectionLog, DailyCollection } from "./types";

export type CollectionMethodState = "ok" | "error" | "skipped" | "missing" | "not_started";
export type CollectionDayState = "complete" | "partial" | "failed" | "not_started";

export interface CollectionMethodStatus {
  source: string;
  status: CollectionMethodState;
  count: number | null;
  message: string;
  at: string | null;
  url?: string;
}

export interface CollectionDayStatus {
  date: string;
  status: CollectionDayState;
  item_count: number;
  changed_count: number;
  collected_at: string | null;
  source: "daily" | "failure-log" | "none";
  methods: CollectionMethodStatus[];
}

export interface CollectionStatusReport {
  generated_at: string;
  start_date: string;
  end_date: string;
  summary: {
    complete: number;
    partial: number;
    failed: number;
    not_started: number;
  };
  days: CollectionDayStatus[];
}

interface FailureLog {
  date?: string;
  attempted_at?: string;
  collected_at?: string;
  message?: string;
  logs?: CollectionLog[];
}

const root = process.cwd();
const dataDir = path.join(root, "data");
const dailyDir = path.join(dataDir, "daily");
const logsDir = path.join(dataDir, "logs");
const statusPath = path.join(dataDir, "collection-status.json");

const expectedMethods: CollectionMethodStatus[] = [
  method("국가법령정보센터 법령 변경이력", "https://open.law.go.kr/LSO/openApi/guideList.do"),
  method("국가법령정보센터 일자별 조문 개정 이력", "https://open.law.go.kr/LSO/openApi/guideList.do"),
  method("국가법령정보센터 행정규칙", "https://open.law.go.kr/LSO/openApi/guideList.do"),
  method("국가법령정보센터 행정규칙 신구법 비교", "https://open.law.go.kr/LSO/openApi/guideList.do"),
  method("국민참여입법센터 입법예고", "https://opinion.lawmaking.go.kr/api/operationGuide"),
  method("국민참여입법센터 입법예고(수정일 기준)", "https://opinion.lawmaking.go.kr/api/operationGuide"),
  method("국민참여입법센터 행정예고", "https://opinion.lawmaking.go.kr/api/operationGuide"),
  method("대한민국 전자관보", "https://www.data.go.kr/data/15109157/openapi.do"),
  method("행정안전부 훈령·예규·고시", "https://www.mois.go.kr"),
  method("행정안전부 입법·행정예고", "https://www.mois.go.kr"),
  method("행정안전부 법령자료실", "https://www.mois.go.kr"),
  method("기획재정부 법령자료실", "https://mofe.go.kr"),
  method("기획재정부 영문법령정보", "https://mofe.go.kr"),
  method("기획재정부 조세조약", "https://mofe.go.kr"),
  method("기획재정부 훈령", "https://mofe.go.kr"),
  method("기획재정부 예규", "https://mofe.go.kr"),
  method("기획재정부 고시", "https://mofe.go.kr"),
  method("기획재정부 공고", "https://mofe.go.kr"),
  method("기획재정부 지침", "https://mofe.go.kr"),
  method("기획재정부 입법예고", "https://mofe.go.kr"),
  method("기획재정부 행정예고", "https://mofe.go.kr"),
  method("산업통상부 입법예고", "https://www.motir.go.kr"),
  method("산업통상부 행정예고", "https://www.motir.go.kr"),
  method("산업통상부 고시", "https://www.motir.go.kr"),
  method("산업통상부 공고", "https://www.motir.go.kr"),
  method("산업통상부 훈령", "https://www.motir.go.kr"),
  method("산업통상부 예규", "https://www.motir.go.kr"),
  method("산업통상부 지침", "https://www.motir.go.kr"),
  method("ALIO 공공기관 법령/지침", "https://www.alio.go.kr"),
  method("ALIO 공공정책자료", "https://www.alio.go.kr"),
  method("대한민국 정책브리핑 RSS", "https://www.korea.kr/etc/rss.do"),
  method("네이버 뉴스 검색 API")
];

export async function readCollectionStatusReport(): Promise<CollectionStatusReport> {
  try {
    const raw = await fs.readFile(statusPath, "utf8");
    return JSON.parse(raw) as CollectionStatusReport;
  } catch {
    return buildCollectionStatusReport();
  }
}

export async function writeCollectionStatusReport(): Promise<CollectionStatusReport> {
  const report = await buildCollectionStatusReport();
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(statusPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export async function buildCollectionStatusReport(): Promise<CollectionStatusReport> {
  const startDate = "2026-01-01";
  const endDate = kstToday();
  const [dailyMap, failureMap] = await Promise.all([readDailyMap(), readFailureMap()]);
  const days: CollectionDayStatus[] = [];

  for (const date of enumerateDates(startDate, endDate)) {
    const daily = dailyMap.get(date) || null;
    const failure = failureMap.get(date) || null;
    days.push(buildDayStatus(date, daily, failure));
  }

  const summary = {
    complete: days.filter((day) => day.status === "complete").length,
    partial: days.filter((day) => day.status === "partial").length,
    failed: days.filter((day) => day.status === "failed").length,
    not_started: days.filter((day) => day.status === "not_started").length
  };

  return {
    generated_at: new Date().toISOString(),
    start_date: startDate,
    end_date: endDate,
    summary,
    days
  };
}

function buildDayStatus(date: string, daily: DailyCollection | null, failure: FailureLog | null): CollectionDayStatus {
  if (!daily && !failure) {
    return {
      date,
      status: "not_started",
      item_count: 0,
      changed_count: 0,
      collected_at: null,
      source: "none",
      methods: expectedMethods.map((entry) => ({ ...entry }))
    };
  }

  const dailyTime = timeValue(daily?.collected_at || null);
  const failureTime = timeValue(failure?.collected_at || failure?.attempted_at || null);
  const dailyMethods = daily ? mergeExpectedMethods(daily.logs || [], true) : [];
  const dailyComplete = daily ? methodsAreComplete(dailyMethods) : false;
  const useFailure = Boolean(failure && !dailyComplete && (!daily || failureTime >= dailyTime));
  const logs = useFailure ? failure?.logs || [] : daily?.logs || [];
  const methods = mergeExpectedMethods(logs, Boolean(daily || failure));
  const errorCount = methods.filter((entry) => entry.status === "error").length;
  const skippedCount = methods.filter((entry) => entry.status === "skipped").length;
  const missingCount = methods.filter((entry) => entry.status === "missing").length;
  const okCount = methods.filter((entry) => entry.status === "ok").length;

  let status: CollectionDayState = "complete";
  if (errorCount && okCount) status = "partial";
  else if (errorCount && !okCount) status = "failed";
  else if (skippedCount) status = "partial";
  else if (missingCount && okCount) status = "partial";
  if (useFailure && !okCount) status = "failed";

  return {
    date,
    status,
    item_count: useFailure ? 0 : daily?.item_count || 0,
    changed_count: useFailure ? 0 : daily?.changed_count || 0,
    collected_at: useFailure
      ? failure?.collected_at || failure?.attempted_at || null
      : daily?.collected_at || null,
    source: useFailure ? "failure-log" : "daily",
    methods
  };
}

function methodsAreComplete(methods: CollectionMethodStatus[]): boolean {
  return methods.length > 0 && methods.every((entry) => entry.status === "ok");
}

async function readDailyMap(): Promise<Map<string, DailyCollection>> {
  const map = new Map<string, DailyCollection>();
  let files: string[] = [];
  try {
    files = await fs.readdir(dailyDir);
  } catch {
    return map;
  }
  await Promise.all(
    files
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map(async (file) => {
        try {
          const raw = await fs.readFile(path.join(dailyDir, file), "utf8");
          const data = JSON.parse(raw) as DailyCollection;
          if (data.date) map.set(data.date, data);
        } catch {
          // Broken daily files are ignored here; the collector will surface them as failed runs.
        }
      })
  );
  return map;
}

async function readFailureMap(): Promise<Map<string, FailureLog>> {
  const map = new Map<string, FailureLog>();
  let files: string[] = [];
  try {
    files = await fs.readdir(logsDir);
  } catch {
    return map;
  }
  await Promise.all(
    files
      .filter((file) => /^failed-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map(async (file) => {
        try {
          const date = file.replace(/^failed-/, "").replace(/\.json$/, "");
          const raw = await fs.readFile(path.join(logsDir, file), "utf8");
          const data = JSON.parse(raw) as FailureLog;
          map.set(date, { ...data, date });
        } catch {
          // Ignore unreadable failure logs; the source file remains available for manual inspection.
        }
      })
  );
  return map;
}

function method(source: string, url?: string): CollectionMethodStatus {
  return {
    source,
    status: "not_started",
    count: null,
    message: "수집 전",
    at: null,
    url
  };
}

function methodFromLog(log: CollectionLog): CollectionMethodStatus {
  return {
    source: log.source || "알 수 없는 수집 방법",
    status: log.status,
    count: Number.isFinite(log.count) ? log.count : 0,
    message: log.message || "",
    at: log.at || null,
    url: log.url
  };
}

function mergeExpectedMethods(logs: CollectionLog[], attempted: boolean): CollectionMethodStatus[] {
  if (!attempted) return expectedMethods.map((entry) => ({ ...entry }));

  const used = new Set<number>();
  const merged = expectedMethods.map((expected) => {
    const matches = logs
      .map((log, index) => ({ log, index }))
      .filter(({ log }) => sameMethod(expected, log));

    for (const match of matches) used.add(match.index);

    if (!matches.length) {
      return {
        ...expected,
        status: "missing" as const,
        count: null,
        message: "이 날짜에는 해당 수집경로를 실행한 로그가 없습니다.",
        at: null
      };
    }

    const matchedLogs = matches.map((match) => match.log);
    const hasError = matchedLogs.some((log) => log.status === "error");
    const hasSkipped = matchedLogs.some((log) => log.status === "skipped");
    const status: CollectionMethodState = hasError ? "error" : hasSkipped ? "skipped" : "ok";
    const count = matchedLogs
      .filter((log) => log.status === "ok")
      .reduce((total, log) => total + (Number.isFinite(log.count) ? log.count : 0), 0);
    const message = matchedLogs
      .map((log) => log.message)
      .filter(Boolean)
      .join("\n");
    const at = matchedLogs
      .map((log) => log.at)
      .filter(Boolean)
      .sort()
      .at(-1) || null;

    return {
      source: expected.source,
      status,
      count,
      message,
      at,
      url: matchedLogs.find((log) => log.url)?.url || expected.url
    };
  });

  const extraLogs = logs
    .map((log, index) => ({ log, index }))
    .filter(({ index }) => !used.has(index))
    .map(({ log }) => methodFromLog(log));

  return [...merged, ...extraLogs];
}

function sameMethod(expected: CollectionMethodStatus, log: CollectionLog): boolean {
  const source = log.source || "";
  if (log.route === expected.source) return true;
  if (!source) return false;
  if (source === expected.source) return true;
  if (source.startsWith(`${expected.source} `)) return true;
  if (source.includes(expected.source) || expected.source.includes(source)) return true;
  return false;
}

function enumerateDates(startDate: string, endDate: string): string[] {
  const output: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00+09:00`);
  const end = new Date(`${endDate}T00:00:00+09:00`);
  while (cursor <= end) {
    output.push(formatDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return output;
}

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function timeValue(value: string | null): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}
