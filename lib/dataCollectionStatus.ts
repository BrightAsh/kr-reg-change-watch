import fs from "node:fs/promises";
import path from "node:path";
import type { CollectionLog, DailyCollection } from "./types";
import type {
  CollectionDayState,
  CollectionDayStatus,
  CollectionMethodState,
  CollectionMethodStatus,
  CollectionStatusReport
} from "./collectionStatus";

const root = process.cwd();
const dataRoot = path.join(root, "data", "data");
const dailyDir = path.join(dataRoot, "daily");
const logsDir = path.join(dataRoot, "logs");
const statusPath = path.join(dataRoot, "collection-status.json");
const startDate = "2026-06-01";

const expectedMethods: CollectionMethodStatus[] = [
  method("국가법령정보센터 데이터 법령", "https://open.law.go.kr/LSO/openApi/guideList.do"),
  method("국가법령정보센터 데이터 행정규칙", "https://open.law.go.kr/LSO/openApi/guideList.do"),
  method("국민참여입법센터 데이터 입법예고", "https://opinion.lawmaking.go.kr/gcom/ogLmPp"),
  method("국민참여입법센터 데이터 행정예고", "https://opinion.lawmaking.go.kr/gcom/admpp"),
  method("국민참여입법센터 국회입법현황", "https://opinion.lawmaking.go.kr/gcom/nsmLmSts/out"),
  method("대한민국 전자관보 데이터 검색", "https://www.gwanbo.go.kr"),
  method("과학기술정보통신부 훈령예규고시", "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=108"),
  method("과학기술정보통신부 입법행정예고", "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=109"),
  method("과학기술정보통신부 공지사항", "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=121&mId=310"),
  method("과학기술정보통신부 사업공고", "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=121&mId=311"),
  method("한국데이터산업진흥원 공지사항", "https://www.kdata.or.kr/kr/board/notice_01/boardList.do"),
  method("한국데이터산업진흥원 보도자료", "https://www.kdata.or.kr/kr/board/promotion_01/boardList.do"),
  method("한국데이터산업진흥원 조사연구보고서", "https://www.kdata.or.kr/kr/board/info_01/boardList.do"),
  method("한국데이터산업진흥원 데이터 산업 동향", "https://www.kdata.or.kr/kr/board/info_11/boardList.do"),
  method("데이터 원윈도우 정책지침", "https://www.data1window.kr/dbPcyEvlSys/list"),
  method("데이터 원윈도우 공지사항", "https://www.data1window.kr/ntcMttr/list"),
  method("행정안전부 훈령예규고시", "https://www.mois.go.kr"),
  method("행정안전부 입법행정예고", "https://www.mois.go.kr"),
  method("행정안전부 법령자료실", "https://www.mois.go.kr"),
  method("행정안전부 알립니다", "https://www.mois.go.kr"),
  method("국가데이터처 법령", "https://mods.go.kr/menu.es?mid=a10403010000"),
  method("국가데이터처 입법예고", "https://mods.go.kr/menu.es?mid=a10403020000"),
  method("국가데이터처 훈령", "https://mods.go.kr/menu.es?mid=a10403030000"),
  method("국가데이터처 고시", "https://mods.go.kr/menu.es?mid=a10403040000"),
  method("국가데이터처 예규", "https://mods.go.kr/menu.es?mid=a10403050000"),
  method("국가데이터처 기타 법령자료", "https://mods.go.kr/menu.es?mid=a10403060000"),
  method("국가데이터처 통계기반정책평가 관련자료", "https://mods.go.kr/menu.es?mid=a10407040100"),
  method("국가데이터처 통계품질관리 자료실", "https://mods.go.kr/menu.es?mid=a10409060100"),
  method("공공데이터포털 공지사항", "https://www.data.go.kr/bbs/ntc/selectNoticeListView.do")
];

interface FailureLog {
  date?: string;
  attempted_at?: string;
  collected_at?: string;
  message?: string;
  logs?: CollectionLog[];
}

export async function readDataCollectionStatusReport(): Promise<CollectionStatusReport> {
  try {
    const raw = await fs.readFile(statusPath, "utf8");
    return JSON.parse(raw) as CollectionStatusReport;
  } catch {
    return buildDataCollectionStatusReport();
  }
}

export async function writeDataCollectionStatusReport(): Promise<CollectionStatusReport> {
  const report = await buildDataCollectionStatusReport();
  await fs.mkdir(dataRoot, { recursive: true });
  await fs.writeFile(statusPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

export async function buildDataCollectionStatusReport(): Promise<CollectionStatusReport> {
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

  const useFailure = Boolean(failure && !daily);
  const logs = useFailure ? failure?.logs || [] : daily?.logs || [];
  const methods = mergeExpectedMethods(logs, Boolean(daily || failure));
  const errorCount = methods.filter((entry) => entry.status === "error" || entry.status === "external_error").length;
  const skippedCount = methods.filter((entry) => entry.status === "skipped").length;
  const missingCount = methods.filter((entry) => entry.status === "missing").length;
  const okCount = methods.filter((entry) => entry.status === "ok").length;

  let status: CollectionDayState = "complete";
  if (errorCount && okCount) status = "partial";
  else if (errorCount && !okCount) status = "failed";
  else if (skippedCount || (missingCount && okCount)) status = "partial";
  if (useFailure && !okCount) status = "failed";

  return {
    date,
    status,
    item_count: useFailure ? 0 : daily?.item_count || 0,
    changed_count: useFailure ? 0 : daily?.changed_count || 0,
    collected_at: useFailure ? failure?.collected_at || failure?.attempted_at || null : daily?.collected_at || null,
    source: useFailure ? "failure-log" : "daily",
    methods
  };
}

function mergeExpectedMethods(logs: CollectionLog[], attempted: boolean): CollectionMethodStatus[] {
  if (!attempted) return expectedMethods.map((entry) => ({ ...entry }));
  const used = new Set<number>();
  const merged = expectedMethods.map((expected) => {
    const matches = logs
      .map((log, index) => ({ log, index }))
      .filter(({ log }) => (log.route === expected.source || log.source === expected.source) && !isDiagnosticLog(log));
    for (const match of matches) used.add(match.index);
    if (!matches.length) {
      return {
        ...expected,
        status: "missing" as const,
        count: null,
        message: "해당 날짜에는 이 데이터 수집 경로의 실행 로그가 없습니다.",
        at: null
      };
    }
    const matchedLogs = matches.map((match) => match.log);
    const errorLogs = matchedLogs.filter((log) => log.status === "error");
    const hasSkipped = matchedLogs.some((log) => log.status === "skipped");
    const status: CollectionMethodState = errorLogs.length
      ? errorLogs.every(isExternalConnectivityLog)
        ? "external_error"
        : "error"
      : hasSkipped
        ? "skipped"
        : "ok";
    const count = matchedLogs
      .filter((log) => log.status === "ok")
      .reduce((total, log) => total + (Number.isFinite(log.count) ? log.count : 0), 0);
    return {
      source: expected.source,
      status,
      count,
      message: matchedLogs.map((log) => log.message).filter(Boolean).join("\n"),
      at: matchedLogs.map((log) => log.at).filter(Boolean).sort().at(-1) || null,
      url: matchedLogs.find((log) => log.url)?.url || expected.url
    };
  });

  const extras = logs
    .map((log, index) => ({ log, index }))
    .filter(({ log, index }) => !used.has(index) && !isDiagnosticLog(log))
    .map(({ log }) => methodFromLog(log));
  return [...merged, ...extras];
}

async function readDailyMap(): Promise<Map<string, DailyCollection>> {
  const map = new Map<string, DailyCollection>();
  const files = await fs.readdir(dailyDir).catch(() => []);
  await Promise.all(
    files
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map(async (file) => {
        try {
          const raw = await fs.readFile(path.join(dailyDir, file), "utf8");
          const daily = JSON.parse(raw) as DailyCollection;
          if (daily.date) map.set(daily.date, daily);
        } catch {
          // Broken daily files remain on disk for manual inspection.
        }
      })
  );
  return map;
}

async function readFailureMap(): Promise<Map<string, FailureLog>> {
  const map = new Map<string, FailureLog>();
  const files = await fs.readdir(logsDir).catch(() => []);
  await Promise.all(
    files
      .filter((file) => /^failed-\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map(async (file) => {
        try {
          const date = file.replace(/^failed-/, "").replace(/\.json$/, "");
          const raw = await fs.readFile(path.join(logsDir, file), "utf8");
          map.set(date, { ...(JSON.parse(raw) as FailureLog), date });
        } catch {
          // Ignore unreadable failure logs.
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
    source: log.source || "알 수 없는 데이터 수집 경로",
    status: log.status === "error" && isExternalConnectivityLog(log) ? "external_error" : log.status,
    count: Number.isFinite(log.count) ? log.count : 0,
    message: log.message || "",
    at: log.at || null,
    url: log.url
  };
}

function isDiagnosticLog(log: CollectionLog): boolean {
  return log.source === "데이터 수집 캐시";
}

const NETWORK_PATTERNS = [
  /curl failed/i,
  /timeout/i,
  /timed out/i,
  /SSL connect error/i,
  /TLS/i,
  /failed to connect/i,
  /fetch failed/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i
];

function isExternalConnectivityLog(log: CollectionLog): boolean {
  const value = `${log.source || ""} ${log.message || ""} ${log.url || ""}`;
  return NETWORK_PATTERNS.some((pattern) => pattern.test(value));
}

function enumerateDates(firstDate: string, lastDate: string): string[] {
  const output: string[] = [];
  const cursor = new Date(`${firstDate}T00:00:00+09:00`);
  const end = new Date(`${lastDate}T00:00:00+09:00`);
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
