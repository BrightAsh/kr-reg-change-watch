import path from "node:path";
import type { CollectedItem, CollectionLog, DailyCollection, SourceType } from "../lib/types";
import {
  addLog,
  asArray,
  dateDaysAgo,
  dailyDir,
  ensureDataDirs,
  env,
  fetchJsonOrXml,
  fetchText,
  loadDotEnv,
  logsDir,
  makeUrl,
  parseArgs,
  parseXml,
  readJson,
  rootDir,
  snapshotsDir,
  writeJson
} from "./common";
import { itemCategory } from "../lib/categories";
import {
  compactText,
  hashText,
  inferChangeType,
  inferDocumentType,
  normalizeDate,
  stableId,
  yyyymmdd
} from "../lib/text";

type AnyRecord = Record<string, unknown>;

const OFFICIAL_LAW_GUIDE =
  "https://open.law.go.kr/LSO/openApi/guideList.do";
const LAWMAKING_GUIDE =
  "https://opinion.lawmaking.go.kr/api/operationGuide";
const GWANBO_DATASET =
  "https://www.data.go.kr/data/15109157/openapi.do";
const LAWMAKING_TARGETS = [
  { name: "법제처", code: "1170000" },
  { name: "행정안전부", code: "1741000" },
  { name: "기획재정부", code: "1051000" }
];

loadDotEnv();

const args = parseArgs();
const lookback = Number(env("FETCH_LOOKBACK_DAYS", "1"));
const targetDate = String(args.date || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));
const maxPages = Number(env("FETCH_MAX_PAGES", "5"));
const detailLimit = Number(env("FETCH_DETAIL_LIMIT", "30"));
const lawTextDetailLimit = Number(env("FETCH_LAW_TEXT_DETAIL_LIMIT", "25")) || 25;
const lawTextMaxChars = Number(env("FETCH_LAW_TEXT_MAX_CHARS", "12000")) || 12000;
const forceCollect = Boolean(args.force || env("FORCE_COLLECT") === "1");
const itemsPath = path.join(rootDir, "data", "items.json");
const runPath = path.join(rootDir, "data", "run.json");
const dailyPath = path.join(dailyDir, `${targetDate}.json`);

interface MinistryRoute {
  source: string;
  envName: string;
  defaultUrl: string;
  ministry: string;
  sourceType?: SourceType;
}

const MINISTRY_ROUTES: MinistryRoute[] = [
  {
    source: "행정안전부 훈령·예규·고시",
    envName: "MOIS_BOARD_URL",
    defaultUrl: "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000016",
    ministry: "행정안전부",
    sourceType: "ministry_board"
  },
  {
    source: "행정안전부 입법·행정예고",
    envName: "MOIS_NOTICE_BOARD_URL",
    defaultUrl: "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000017",
    ministry: "행정안전부",
    sourceType: "legislation_notice"
  },
  {
    source: "기획재정부 훈령",
    envName: "MOEF_DIRECTIVE_URL",
    defaultUrl: "https://mofe.go.kr/lw/admrul.do?bbsId=MOSFBBS_000000000118&menuNo=7090100",
    ministry: "기획재정부",
    sourceType: "ministry_board"
  },
  {
    source: "기획재정부 예규",
    envName: "MOEF_ESTABLISHED_RULE_URL",
    defaultUrl: "https://mofe.go.kr/lw/denm/TbDenmList.do?bbsId=MOSFBBS_000000000119&menuNo=7090100",
    ministry: "기획재정부",
    sourceType: "ministry_board"
  },
  {
    source: "기획재정부 고시",
    envName: "MOEF_NOTICE_URL",
    defaultUrl: "https://mofe.go.kr/lw/denm/TbDenmList.do?bbsId=MOSFBBS_000000000120&menuNo=7090200",
    ministry: "기획재정부",
    sourceType: "ministry_board"
  },
  {
    source: "기획재정부 공고",
    envName: "MOEF_ANNOUNCEMENT_URL",
    defaultUrl: "https://mofe.go.kr/lw/pblanc/TbPblancList.do?bbsId=MOSFBBS_000000000060&menuNo=7090200",
    ministry: "기획재정부",
    sourceType: "legislation_notice"
  },
  {
    source: "기획재정부 지침",
    envName: "MOEF_GUIDELINE_URL",
    defaultUrl: "https://mofe.go.kr/lw/denm/TbDenmList.do?bbsId=MOSFBBS_000000000121&menuNo=7090200",
    ministry: "기획재정부",
    sourceType: "ministry_board"
  },
  {
    source: "기획재정부 입법예고",
    envName: "MOEF_LEGISLATION_NOTICE_URL",
    defaultUrl: "https://mofe.go.kr/lw/lap/TbPrvntcList.do?bbsId=MOSFBBS_000000000055&menuNo=7050300",
    ministry: "기획재정부",
    sourceType: "legislation_notice"
  },
  {
    source: "기획재정부 행정예고",
    envName: "MOEF_ADMIN_NOTICE_URL",
    defaultUrl: "https://mofe.go.kr/lw/lap/TbPrvntcList.do?bbsId=MOSFBBS_000000000056&menuNo=7050300",
    ministry: "기획재정부",
    sourceType: "legislation_notice"
  }
];

async function main() {
  await ensureDataDirs();

  if (!forceCollect) {
    const cached = await readJson<DailyCollection | null>(dailyPath, null);
    if (cached?.date === targetDate) {
      const existing = await readJson<CollectedItem[]>(itemsPath, []);
      const canonicalExisting = await readCanonicalItemsExcludingDate(targetDate, existing);
      const merged = mergeItems(canonicalExisting, cached.items);
      const cacheLogs: CollectionLog[] = [
        ...cached.logs,
        {
          source: "일자별 캐시",
          status: "ok",
          message: `${targetDate} 캐시가 있어 외부 수집을 건너뜁니다.`,
          count: cached.items.length,
          at: new Date().toISOString()
        }
      ];
      await writeJson(itemsPath, merged);
      await writeJson(path.join(snapshotsDir, `${targetDate}.json`), cached.items);
      await writeJson(path.join(logsDir, "last-fetch.json"), cacheLogs);
      await writeJson(runPath, {
        last_run_at: new Date().toISOString(),
        last_target_date: targetDate,
        item_count: merged.length,
        changed_count: cached.changed_count,
        available_dates: await listDailyDates(),
        cache_hit: true,
        logs: cacheLogs
      });
      console.log(`Cache hit for ${targetDate}. Reused ${cached.items.length} item(s).`);
      return;
    }
  }

  const logs: CollectionLog[] = [];
  const collected: CollectedItem[] = [];

  await runSource(logs, collected, () => fetchLawChangeHistory(logs));
  await runSource(logs, collected, () => fetchArticleChanges(logs));
  await runSource(logs, collected, () => fetchAdministrativeRules(logs));
  await runSource(logs, collected, () => fetchAdministrativeRuleComparisons(logs));
  await runSource(logs, collected, () => fetchLawmakingNotices(logs, "입법예고", "ogLmPp"));
  await runSource(logs, collected, () => fetchLawmakingNotices(logs, "행정예고", "ptcpAdmPp"));
  await runSource(logs, collected, () => fetchGazette(logs));
  await runSource(logs, collected, () => fetchMinistryRoutes(logs));
  await runSource(logs, collected, () => fetchPolicyRss(logs));
  await runSource(logs, collected, () => fetchNaverNews(logs));

  const scoped = normalizeAndFilterByTargetDate(collected);
  const existing = await readJson<CollectedItem[]>(itemsPath, []);
  const canonicalExisting = await readCanonicalItemsExcludingDate(targetDate, existing);
  const merged = mergeItems(canonicalExisting, scoped);
  const changedToday = scoped.length;
  const daily: DailyCollection = {
    date: targetDate,
    collected_at: new Date().toISOString(),
    item_count: scoped.length,
    changed_count: changedToday,
    cache_hit: false,
    items: scoped,
    logs
  };

  await writeJson(itemsPath, merged);
  await writeJson(path.join(snapshotsDir, `${targetDate}.json`), scoped);
  await writeJson(dailyPath, daily);
  await writeJson(path.join(logsDir, "last-fetch.json"), logs);
  await writeJson(runPath, {
    last_run_at: new Date().toISOString(),
    last_target_date: targetDate,
    item_count: merged.length,
    changed_count: changedToday,
    available_dates: await listDailyDates(),
    cache_hit: false,
    logs
  });

  console.log(`Collected ${scoped.length} item(s) for ${targetDate}. Total stored: ${merged.length}.`);
}

async function runSource(
  logs: CollectionLog[],
  collected: CollectedItem[],
  fn: () => Promise<CollectedItem[]>
) {
  try {
    collected.push(...(await fn()));
  } catch (error) {
    addLog(logs, "collector", "error", error instanceof Error ? error.message : String(error));
  }
}

async function fetchLawChangeHistory(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "국가법령정보센터 법령 변경이력";
  const rows = await fetchLawSearch(logs, source, "lsHstInf", { regDt: yyyymmdd(targetDate) });
  const items = groupLawChangeHistoryRows(source, rows);
  const enriched = await enrichLawItemsWithRevisionText(items, logs, source);
  const suffix = rows.length === items.length ? "" : ` 원자료 ${rows.length}행을 법령 단위 ${items.length}건으로 묶었습니다.`;
  addLog(logs, source, "ok", `법제처 공식 법령 변경이력 API 수집 완료.${suffix}`, enriched.length, OFFICIAL_LAW_GUIDE);
  return enriched;
}

function groupLawChangeHistoryRows(source: string, rows: AnyRecord[]): CollectedItem[] {
  const groups = new Map<string, AnyRecord[]>();
  for (const row of rows) {
    const lawId = text(row, ["법령ID"]);
    const title = text(row, ["법령명한글", "법령명"]);
    const lawType = text(row, ["법령구분명"]);
    const key = lawId || stableId([source, title, lawType]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(row);
  }

  return [...groups.entries()].map(([lawKey, groupRows]) => {
    const sortedRows = [...groupRows].sort(compareLawHistoryRowsDesc);
    const representative =
      sortedRows.find((row) => text(row, ["현행연혁코드"]) === "현행") ||
      sortedRows[0] ||
      groupRows[0];
    const title = text(representative, ["법령명한글", "법령명"]) || "법령 변경이력";
    const originalUrl = lawUrl(text(representative, ["법령상세링크"]), text(representative, ["법령일련번호"]));
    const rawText = buildLawHistoryRawText(lawKey, sortedRows);
    const rowCount = groupRows.length;
    const historySummary = summarizeLawHistoryRows(sortedRows);

    return makeItem({
      id: stableId([source, "law-history", lawKey, targetDate]),
      source,
      source_type: "official_law",
      ministry: text(representative, ["소관부처명"]) || "미상",
      document_type: inferDocumentType(`${text(representative, ["법령구분명"])} ${title}`),
      title: `${title} 변경이력 갱신 ${rowCount.toLocaleString("ko-KR")}건`,
      issue_number: text(representative, ["공포번호"]) || null,
      publish_date: normalizeDate(text(representative, ["공포일자"])) || targetDate,
      effective_date: normalizeDate(text(representative, ["시행일자"])),
      change_type: inferChangeType(text(representative, ["제개정구분명"])),
      original_url: originalUrl,
      raw_text: rawText,
      raw_hash: hashText(rawText),
      summary: `${targetDate} 기준 법제처 변경이력 API가 반환한 ${rowCount.toLocaleString("ko-KR")}개 연혁 행을 법령ID ${lawKey} 단위로 묶었습니다. ${historySummary || ""}`.trim(),
      diff_summary:
        "이 출처는 개정문 전문이 아니라 법령별 연혁 메타데이터를 제공합니다. 원문 버튼에서 법제처 법령 본문을 확인할 수 있습니다.",
      confidence: "official",
      source_record_id: lawKey
    });
  });
}

function compareLawHistoryRowsDesc(a: AnyRecord, b: AnyRecord): number {
  return lawHistorySortDate(b).localeCompare(lawHistorySortDate(a));
}

function lawHistorySortDate(row: AnyRecord): string {
  return normalizeDate(text(row, ["공포일자"])) || normalizeDate(text(row, ["시행일자"])) || "";
}

function buildLawHistoryRawText(lawKey: string, rows: AnyRecord[]): string {
  const historyLines = rows.map((row) => {
    const promulgation = normalizeDate(text(row, ["공포일자"])) || "-";
    const effective = normalizeDate(text(row, ["시행일자"])) || "-";
    const revision = text(row, ["제개정구분명"]) || "-";
    const issue = text(row, ["공포번호"]) || "-";
    const title = text(row, ["법령명한글", "법령명"]) || "-";
    return `공포 ${promulgation} / 시행 ${effective} / ${revision} / 제${issue}호 / ${title}`;
  });

  return [
    "법령 변경이력 갱신",
    "",
    `수집 기준일: ${targetDate}`,
    `법령ID: ${lawKey}`,
    `연혁 행 수: ${rows.length.toLocaleString("ko-KR")}`,
    "",
    "최근 연혁",
    ...historyLines.slice(0, 12),
    "",
    "전체 연혁",
    ...historyLines
  ].join("\n");
}

function summarizeLawHistoryRows(rows: AnyRecord[]): string | null {
  if (!rows.length) return null;
  const latest = rows[0];
  const earliest = rows[rows.length - 1];
  const latestDate = lawHistorySortDate(latest) || "-";
  const earliestDate = lawHistorySortDate(earliest) || "-";
  const latestRevision = text(latest, ["제개정구분명"]) || "변경";
  const latestIssue = text(latest, ["공포번호"]);
  const recent = rows
    .slice(0, 5)
    .map((row) => {
      const date = lawHistorySortDate(row) || "-";
      const revision = text(row, ["제개정구분명"]) || "변경";
      const issue = text(row, ["공포번호"]);
      return `${date} ${revision}${issue ? ` 제${issue}호` : ""}`;
    })
    .join("; ");
  return `기간 ${earliestDate}~${latestDate}, 최신 이력은 ${latestDate} ${latestRevision}${latestIssue ? ` 제${latestIssue}호` : ""}입니다. 최근 이력: ${recent}.`;
}

async function fetchArticleChanges(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "국가법령정보센터 일자별 조문 개정 이력";
  const rows = await fetchLawSearch(logs, source, "lsJoHstInf", { regDt: yyyymmdd(targetDate) });
  const items = groupArticleChangeRows(source, rows);
  const enriched = await enrichLawItemsWithRevisionText(items, logs, source);
  const suffix = rows.length === items.length ? "" : ` 원자료 ${rows.length}행을 법령 단위 ${items.length}건으로 묶었습니다.`;
  addLog(logs, source, "ok", `법제처 공식 일자별 조문 개정 이력 API 수집 완료.${suffix}`, enriched.length, OFFICIAL_LAW_GUIDE);
  return enriched;
}

function groupArticleChangeRows(source: string, rows: AnyRecord[]): CollectedItem[] {
  const groups = new Map<string, AnyRecord[]>();
  for (const row of rows) {
    const lawId = text(row, ["법령ID"]);
    const title = text(row, ["법령명한글", "법령명"]);
    const key = lawId || stableId([source, title, text(row, ["소관부처명"])]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(row);
  }

  return [...groups.entries()].map(([lawKey, groupRows]) => {
    const sortedRows = [...groupRows].sort(compareArticleRowsDesc);
    const representative = sortedRows[0] || groupRows[0];
    const title = text(representative, ["법령명한글", "법령명"]) || "조문 개정 이력";
    const articleCount = sortedRows.reduce((sum, row) => sum + Math.max(collectArticleRows(row).length, 1), 0);
    const originalUrl =
      lawUrl("", text(representative, ["법령일련번호"])) ||
      lawUrl(text(representative, ["조문변경이력상세링크", "조문링크"])) ||
      OFFICIAL_LAW_GUIDE;
    const rawText = buildArticleChangeRawText(lawKey, sortedRows);
    const summary = summarizeArticleChangeRows(sortedRows, articleCount);

    return makeItem({
      id: stableId([source, "article-history", lawKey, targetDate]),
      source,
      source_type: "official_law",
      ministry: text(representative, ["소관부처명"]) || "미상",
      document_type: inferDocumentType(`${text(representative, ["법령구분명"])} ${title}`),
      title: `${title} 조문 변경 ${articleCount.toLocaleString("ko-KR")}건`,
      issue_number: text(representative, ["공포번호"]) || null,
      publish_date: targetDate,
      effective_date: normalizeDate(text(representative, ["조문시행일", "시행일자"])),
      change_type: inferChangeType(`${text(representative, ["제개정구분명"])} ${rawText}`),
      original_url: originalUrl,
      raw_text: rawText,
      raw_hash: hashText(rawText),
      summary,
      diff_summary:
        "이 항목은 법제처 조문 변경이력 메타데이터를 법령 단위로 묶은 것입니다. 조문별 본문은 원문 링크에서 확인하세요.",
      confidence: "official",
      source_record_id: lawKey
    });
  });
}

function compareArticleRowsDesc(a: AnyRecord, b: AnyRecord): number {
  return articleChangeSortDate(b).localeCompare(articleChangeSortDate(a));
}

function articleChangeSortDate(row: AnyRecord): string {
  return normalizeDate(text(row, ["조문개정일", "공포일자"])) || normalizeDate(text(row, ["조문시행일", "시행일자"])) || "";
}

function buildArticleChangeRawText(lawKey: string, rows: AnyRecord[]): string {
  const lines = uniqueStrings(rows.flatMap((row) => articleChangeLines(row)));
  return [
    "조문 개정 이력",
    "",
    `수집 기준일: ${targetDate}`,
    `법령ID: ${lawKey}`,
    `원자료 행 수: ${rows.length.toLocaleString("ko-KR")}`,
    `조문 변경 수: ${lines.length.toLocaleString("ko-KR")}`,
    "",
    "변경 조문",
    ...lines
  ].join("\n");
}

function summarizeArticleChangeRows(rows: AnyRecord[], articleCount: number): string {
  const latest = rows[0];
  const recent = uniqueStrings(rows.flatMap((row) => articleChangeLines(row)))
    .slice(0, 8)
    .join("; ");
  const lawTitle = text(latest, ["법령명한글", "법령명"]) || "해당 법령";
  return `${targetDate} 기준 법제처 조문 개정 이력 API가 반환한 ${rows.length.toLocaleString(
    "ko-KR"
  )}개 행을 ${lawTitle} 법령 단위로 묶었습니다. 확인된 조문 변경은 ${articleCount.toLocaleString(
    "ko-KR"
  )}건입니다.${recent ? ` 최근 변경: ${recent}.` : ""}`;
}

function articleChangeLines(row: AnyRecord): string[] {
  const title = text(row, ["법령명한글", "법령명"]) || "법령";
  const issue = text(row, ["공포번호"]);
  const revision = text(row, ["제개정구분명", "변경사유"]) || "변경";
  const fallbackAmendDate = normalizeDate(text(row, ["조문개정일", "공포일자"])) || "-";
  const fallbackEffectiveDate = normalizeDate(text(row, ["조문시행일", "시행일자"])) || "-";
  const articleRows = collectArticleRows(row);
  if (!articleRows.length) {
    return [`${title} / 개정 ${fallbackAmendDate} / 시행 ${fallbackEffectiveDate} / ${revision}${issue ? ` / 제${issue}호` : ""}`];
  }
  return articleRows.map((article) => {
    const articleNo = formatArticleNumber(directText(article, ["조문번호"]));
    const amendDate = normalizeDate(directText(article, ["조문개정일"])) || fallbackAmendDate;
    const effectiveDate = normalizeDate(directText(article, ["조문시행일"])) || fallbackEffectiveDate;
    const reason = directText(article, ["변경사유"]) || revision;
    return `${title}${articleNo ? ` ${articleNo}` : ""} / 개정 ${amendDate} / 시행 ${effectiveDate} / ${reason}${
      issue ? ` / 제${issue}호` : ""
    }`;
  });
}

function collectArticleRows(row: AnyRecord): AnyRecord[] {
  const rows: AnyRecord[] = [];
  walk(row, (node) => {
    if (isRecord(node) && hasDirectKey(node, "조문번호")) rows.push(node);
  });
  const seen = new Set<string>();
  return rows.filter((entry) => {
    const key = [
      directText(entry, ["조문번호"]),
      directText(entry, ["조문개정일"]),
      directText(entry, ["조문시행일"]),
      directText(entry, ["변경사유"])
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatArticleNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 6) {
    const main = Number(digits.slice(0, 4));
    const branch = Number(digits.slice(4, 6));
    if (main && branch) return `제${main}조의${branch}`;
    if (main) return `제${main}조`;
  }
  return value ? `제${value}조` : "";
}

async function fetchAdministrativeRules(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "국가법령정보센터 행정규칙";
  const rows = await fetchLawSearch(logs, source, "admrul", { date: yyyymmdd(targetDate), sort: "ddes" });
  const details = new Map<string, AnyRecord>();
  for (const row of rows.slice(0, detailLimit)) {
    const id = text(row, ["행정규칙일련번호", "ID"]);
    if (!id) continue;
    try {
      const detail = await fetchLawService("admrul", { ID: id });
      details.set(id, detail);
    } catch (error) {
      addLog(logs, source, "error", `행정규칙 본문 조회 실패: ${id} - ${messageOf(error)}`, 0, OFFICIAL_LAW_GUIDE);
    }
  }

  const items = rows.map((row) => {
    const id = text(row, ["행정규칙일련번호", "ID"]);
    const detail = id ? details.get(id) : undefined;
    const merged = { ...row, ...(flattenFirstObject(detail) || {}) };
    const title = text(merged, ["행정규칙명", "법령명한글"]);
    const originalUrl = lawUrl(text(merged, ["행정규칙상세링크"]));
    const rawText = compactText(
      [
        title,
        text(merged, ["조문내용"]),
        text(merged, ["부칙내용"]),
        text(merged, ["제개정이유내용"]),
        text(merged, ["개정문내용"])
      ].join(" ")
    );
    return makeItem({
      source,
      source_type: "official_law",
      ministry: text(merged, ["소관부처명"]) || "미상",
      document_type: inferDocumentType(`${text(merged, ["행정규칙종류"])} ${title}`),
      title,
      issue_number: text(merged, ["발령번호"]) || null,
      publish_date: normalizeDate(text(merged, ["발령일자"])) || targetDate,
      effective_date: normalizeDate(text(merged, ["시행일자"])),
      change_type: inferChangeType(text(merged, ["제개정구분명"])),
      original_url: originalUrl || OFFICIAL_LAW_GUIDE,
      attachment_urls: collectLinks(detail),
      raw_text: rawText,
      raw_hash: hashText(rawText),
      confidence: "official",
      verification_required: !originalUrl,
      source_record_id: id || text(merged, ["행정규칙ID"]) || null
    });
  });
  addLog(logs, source, "ok", "법제처 공식 행정규칙 목록/본문 API 수집 완료", items.length, OFFICIAL_LAW_GUIDE);
  return items;
}

async function fetchAdministrativeRuleComparisons(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "국가법령정보센터 행정규칙 신구법 비교";
  const rows = await fetchLawSearch(logs, source, "admrulOldAndNew", { date: yyyymmdd(targetDate), sort: "ddes" });
  const details = new Map<string, AnyRecord>();
  for (const row of rows.slice(0, detailLimit)) {
    const id = text(row, ["신구법일련번호", "행정규칙일련번호", "ID"]);
    if (!id) continue;
    try {
      details.set(id, await fetchLawService("admrulOldAndNew", { ID: id }));
    } catch (error) {
      addLog(logs, source, "error", `행정규칙 신구법 본문 조회 실패: ${id} - ${messageOf(error)}`, 0, OFFICIAL_LAW_GUIDE);
    }
  }

  const items = rows.map((row) => {
    const id = text(row, ["신구법일련번호", "행정규칙일련번호", "ID"]);
    const detail = id ? details.get(id) : undefined;
    const merged = { ...row, ...(flattenFirstObject(detail) || {}) };
    const title = text(merged, ["신구법명", "행정규칙명"]);
    const originalUrl = lawUrl(text(merged, ["신구법상세링크", "신구법 상세링크"]));
    const oldText = compactText(text(detail || {}, ["구조문목록", "구조문_기본정보", "구조문"]));
    const newText = compactText(text(detail || {}, ["신조문목록", "신조문_기본정보", "신조문"]));
    const rawText = compactText([title, oldText, newText].join(" "));
    return makeItem({
      source,
      source_type: "official_law",
      ministry: text(merged, ["소관부처명"]) || "미상",
      document_type: inferDocumentType(`${text(merged, ["법령구분명", "행정규칙종류"])} ${title}`),
      title,
      issue_number: text(merged, ["발령번호"]) || null,
      publish_date: normalizeDate(text(merged, ["발령일자"])) || targetDate,
      effective_date: normalizeDate(text(merged, ["시행일자"])),
      change_type: inferChangeType(text(merged, ["제개정구분명"])),
      original_url: originalUrl || OFFICIAL_LAW_GUIDE,
      raw_text: rawText,
      raw_hash: hashText(rawText),
      diff_summary: summarizeDiffEvidence(oldText, newText),
      confidence: "official",
      verification_required: !originalUrl,
      source_record_id: id || text(merged, ["신구법ID"]) || null
    });
  });
  addLog(logs, source, "ok", "법제처 공식 행정규칙 신구법 비교 API 수집 완료", items.length, OFFICIAL_LAW_GUIDE);
  return items;
}

async function fetchLawmakingNotices(
  logs: CollectionLog[],
  label: "입법예고" | "행정예고",
  endpoint: "ogLmPp" | "ptcpAdmPp"
): Promise<CollectedItem[]> {
  const source = `국민참여입법센터 ${label}`;
  const oc = env("LAWMAKING_OC");
  if (!oc) {
    addLog(logs, source, "skipped", "LAWMAKING_OC 미설정으로 국민참여입법센터 API를 건너뜁니다.", 0, LAWMAKING_GUIDE);
    return [];
  }
  const base = env("LAWMAKING_BASE", "https://www.lawmaking.go.kr/rest").replace(/\/$/, "");
  const items: CollectedItem[] = [];
  const errors: string[] = [];
  const date = dottedDate(targetDate);

  for (const target of LAWMAKING_TARGETS) {
    const params =
      endpoint === "ogLmPp"
        ? { OC: oc, cptOfiOrgCd: target.code, stYdFmt: date, edYdFmt: date }
        : { OC: oc, asndOfiNm: target.name, stYdFmt: date, edYdFmt: date };
    const url = makeUrl(`${base}/${endpoint}.xml`, params);
    try {
      const payload = await fetchJsonOrXml(url);
      const retMsg = text(payload, ["retMsg"]);
      if (retMsg && retMsg !== "00" && retMsg !== "0") {
        errors.push(`${target.name}: retMsg ${retMsg}`);
        continue;
      }
      const rows = findRecordRows(payload, [
        "공고명",
        "법령안명",
        "입법예고명",
        "행정예고명",
        "ogLmPpSeq",
        "ogAdmPpSeq",
        "mappingLbicId",
        "mappingAdmRulSeq",
        "announceType",
        "pntcDt",
        "stYd"
      ]);
      items.push(
        ...rows
          .map((row) => normalizeLawmakingRow(row, source, label, endpoint, url, oc))
          .filter((item): item is CollectedItem => Boolean(item && item.publish_date === targetDate))
      );
    } catch (error) {
      errors.push(`${target.name}: ${messageOf(error)}`);
    }
  }

  addLog(
    logs,
    source,
    errors.length ? "error" : "ok",
    errors.length
      ? `국민참여입법센터 API 일부 실패: ${errors.join("; ")}`
      : "국민참여입법센터 공개 XML API 수집 완료",
    items.length,
    LAWMAKING_GUIDE
  );
  return items;
}

async function fetchGazette(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "대한민국 전자관보";
  const url = env("GWANBO_LIST_URL");
  const serviceKey = env("DATA_GO_KR_SERVICE_KEY");
  if (!url) {
    addLog(
      logs,
      source,
      "skipped",
      "관보 공공데이터포털 데이터셋은 확인됐지만 실제 Swagger 호출 URL은 환경변수 GWANBO_LIST_URL 설정 후 사용합니다.",
      0,
      GWANBO_DATASET
    );
    return [];
  }
  if (!serviceKey) {
    addLog(logs, source, "skipped", "DATA_GO_KR_SERVICE_KEY 미설정으로 관보 API를 건너뜁니다.", 0, GWANBO_DATASET);
    return [];
  }
  const withKey = makeUrl(url, {
    serviceKey,
    pageNo: 1,
    pageSize: 100,
    numOfRows: 100,
    reqFrom: yyyymmdd(targetDate),
    reqTo: yyyymmdd(targetDate),
    fromDate: yyyymmdd(targetDate),
    toDate: yyyymmdd(targetDate),
    type: 1
  });
  const payload = await fetchJsonOrXml(withKey);
  const rows = findRecordRows(payload, ["cntntSj", "hopePblictDt", "pdfFilePath", "관보제목", "title", "발행일자", "pdf"]);
  const items = rows.map((row) => {
    const title = text(row, ["cntntSj", "관보제목", "제목", "title", "gwanboSj", "ofcttBookNm"]);
    const originalUrl = normalizeGazetteUrl(text(row, ["pdfFilePath", "표준내용URL", "PDF", "pdf", "link"]), url);
    const publishDate = normalizeDate(text(row, ["hopePblictDt", "발행일자", "publishDate"])) || targetDate;
    const rawText = compactText(
      [
        title,
        text(row, ["ofcttBookNm"]),
        text(row, ["cmplatSeNm", "관보구분", "편집구분"]),
        text(row, ["themaSe", "테마구분"]),
        text(row, ["pblcnInstNm", "발행기관", "기관명"]),
        text(row, ["basisLawNm", "근거법령"]),
        text(row, ["cntntSeqNo", "관보번호", "공고번호", "호수"]),
        publishDate,
        text(row, ["rvsnRsnMainCn", "개정이유", "주요내용"]),
        originalUrl
      ].join(" ")
    );
    return makeItem({
      source,
      source_type: "gazette",
      ministry: text(row, ["pblcnInstNm", "발행기관", "기관명"]) || "행정안전부",
      document_type: inferDocumentType(`${text(row, ["cmplatSeNm", "themaSe", "basisLawNm", "관보구분", "편집구분"])} ${title}`),
      title,
      issue_number: text(row, ["ofcttBookNm", "관보번호", "공고번호", "호수", "cntntSeqNo"]) || null,
      publish_date: publishDate,
      effective_date: null,
      change_type: inferChangeType(title),
      original_url: originalUrl || url,
      raw_text: rawText,
      raw_hash: hashText(rawText),
      confidence: "official",
      verification_required: !originalUrl,
      source_record_id: text(row, ["cntntSeqNo", "id", "문서번호", "gwanboId"]) || null
    });
  }).filter((item) => item.publish_date === targetDate);
  addLog(logs, source, "ok", "설정된 관보 API URL 수집 완료", items.length, GWANBO_DATASET);
  return items;
}

async function fetchMinistryRoutes(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const items: CollectedItem[] = [];
  for (const route of MINISTRY_ROUTES) {
    try {
      items.push(...(await fetchConfiguredMinistryBoard(logs, route)));
    } catch (error) {
      addLog(logs, route.source, "error", `공식 게시판 수집 실패: ${messageOf(error)}`, 0, route.defaultUrl);
    }
  }
  return items;
}

async function fetchConfiguredMinistryBoard(logs: CollectionLog[], route: MinistryRoute): Promise<CollectedItem[]> {
  const configured = env(route.envName);
  const url = configured || route.defaultUrl;
  if (!url) {
    addLog(logs, route.source, "skipped", `${route.envName} 미설정으로 게시판 HTML 수집을 건너뜁니다.`, 0);
    return [];
  }

  const items: CollectedItem[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const pageUrl = withPage(url, page);
    const html = await fetchText(pageUrl);
    const rows = await parseBoardRows(html, pageUrl, route, logs);
    items.push(...rows);
    if (!hasLikelyNextPage(html, page)) break;
  }

  const unique = mergeItems([], items);
  addLog(logs, route.source, "ok", "공식 게시판 HTML 수집 완료", unique.length, url);
  return unique;
}

async function fetchPolicyRss(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const defaultRss = [
    "http://www.korea.kr/rss/pressrelease.xml",
    "http://www.korea.kr/rss/policy.xml",
    "http://www.korea.kr/rss/dept_moleg.xml",
    "http://www.korea.kr/rss/dept_mois.xml",
    "http://www.korea.kr/rss/dept_moef.xml",
    "http://www.korea.kr/rss/president.xml",
    "http://www.korea.kr/rss/speech.xml",
    "http://www.korea.kr/rss/cabinet.xml",
    "http://www.korea.kr/rss/ebriefing.xml"
  ].join(",");
  const urls = env("KOREA_POLICY_RSS", defaultRss)
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  const source = "대한민국 정책브리핑 RSS";
  if (urls.length === 0) {
    addLog(logs, source, "skipped", "KOREA_POLICY_RSS 미설정", 0);
    return [];
  }
  const items: CollectedItem[] = [];
  for (const url of urls) {
    try {
      const xml = await fetchText(url);
      const parsed = parseXml(xml) as AnyRecord;
      const entries = findRecordRows(parsed, ["title", "link", "pubDate", "description"]);
      for (const entry of entries) {
        const title = compactText(text(entry, ["title"]));
        const body = compactText(text(entry, ["description", "content:encoded"]));
        const publishDate = normalizeDate(text(entry, ["pubDate", "dc:date"])) || targetDate;
        if (publishDate !== targetDate) continue;
        if (!/(법령|개정|제정|폐지|고시|공고|훈령|예규|지침|입법예고|행정예고)/.test(`${title} ${body}`)) {
          continue;
        }
        const rawText = compactText(`${title} ${body}`);
        items.push(
          makeItem({
            source,
            source_type: "press",
            ministry: inferMinistryFromText(`${title} ${body}`),
            document_type: "news",
            title,
            issue_number: null,
            publish_date: publishDate,
            effective_date: null,
            change_type: inferChangeType(`${title} ${body}`),
            original_url: text(entry, ["link"]) || url,
            raw_text: rawText,
            raw_hash: hashText(rawText),
            confidence: "press",
            verification_required: true
          })
        );
      }
    } catch (error) {
      addLog(logs, source, "error", `RSS 수집 실패: ${messageOf(error)}`, 0, url);
    }
  }
  addLog(logs, source, "ok", "정책브리핑 RSS 수집 완료", items.length, "https://www.korea.kr/etc/rss.do");
  return items;
}

async function fetchNaverNews(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "네이버 뉴스 검색 API";
  const clientId = env("NAVER_CLIENT_ID");
  const clientSecret = env("NAVER_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    addLog(logs, source, "skipped", "NAVER_CLIENT_ID/NAVER_CLIENT_SECRET 미설정으로 뉴스 보조 수집을 건너뜁니다.", 0);
    return [];
  }
  const queries = env(
    "NAVER_NEWS_QUERIES",
    "법제처 법령 개정,행정안전부 고시,행정안전부 지침,기획재정부 고시,기획재정부 지침,입법예고 행정예고,대통령 법령 개정,장관 고시 개정"
  )
    .split(",")
    .map((query) => query.trim())
    .filter(Boolean);
  const items: CollectedItem[] = [];
  for (const query of queries) {
      const url = makeUrl("https://openapi.naver.com/v1/search/news.json", {
        query,
        display: 100,
        sort: "date"
      });
    try {
      const raw = await fetchText(url, {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret
        }
      });
      const payload = JSON.parse(raw) as { items?: AnyRecord[] };
      for (const row of payload.items || []) {
        const title = compactText(text(row, ["title"]));
        const body = compactText(text(row, ["description"]));
        const publishDate = normalizeDate(text(row, ["pubDate"])) || "";
        if (publishDate !== targetDate) continue;
        const rawText = compactText(`${title} ${body}`);
        items.push(
          makeItem({
            source,
            source_type: "news",
            ministry: inferMinistryFromText(`${title} ${body}`),
            document_type: "news",
            title,
            issue_number: null,
            publish_date: publishDate,
            effective_date: null,
            change_type: "unknown",
            original_url: text(row, ["originallink", "link"]),
            raw_text: rawText,
            raw_hash: hashText(rawText),
            confidence: "news",
            verification_required: true
          })
        );
      }
    } catch (error) {
      addLog(logs, source, "error", `뉴스 검색 실패(${query}): ${messageOf(error)}`, 0, url);
    }
  }
  addLog(logs, source, "ok", "뉴스 보조 수집 완료. 뉴스는 공식 변경으로 표시하지 않습니다.", items.length);
  return items;
}

async function enrichLawItemsWithRevisionText(
  items: CollectedItem[],
  logs: CollectionLog[],
  source: string
): Promise<CollectedItem[]> {
  if (!items.length || lawTextDetailLimit <= 0) return items;

  const output: CollectedItem[] = [];
  let enrichedCount = 0;
  let failedCount = 0;

  for (const [index, item] of items.entries()) {
    if (index >= lawTextDetailLimit) {
      output.push(item);
      continue;
    }

    try {
      const revisionText = await fetchLawRevisionText(item);
      if (!revisionText) {
        output.push(item);
        continue;
      }
      const rawText = `${item.raw_text}\n\n${revisionText}`;
      output.push({
        ...item,
        raw_text: rawText,
        raw_hash: hashText(rawText),
        diff_summary:
          item.diff_summary?.replace(
            "원문 버튼에서 법제처 법령 본문을 확인할 수 있습니다.",
            "아래 개정문과 원문 링크에서 세부 내용을 확인할 수 있습니다."
          ) || item.diff_summary
      });
      enrichedCount += 1;
    } catch (error) {
      failedCount += 1;
      output.push(item);
      if (failedCount <= 3) {
        addLog(logs, `${source} 본문 보강`, "error", `${item.title} 본문 보강 실패: ${messageOf(error)}`, 0, item.original_url);
      }
    }
  }

  if (enrichedCount) {
    addLog(
      logs,
      `${source} 본문 보강`,
      "ok",
      `법제처 lawService API로 개정문/제개정이유 ${enrichedCount.toLocaleString("ko-KR")}건을 보강했습니다.`,
      enrichedCount,
      OFFICIAL_LAW_GUIDE
    );
  }
  if (failedCount > 3) {
    addLog(logs, `${source} 본문 보강`, "error", `본문 보강 실패 ${failedCount.toLocaleString("ko-KR")}건`, failedCount);
  }
  return output;
}

async function fetchLawRevisionText(item: CollectedItem): Promise<string | null> {
  const params = lawServiceParamsFromItem(item);
  if (!params) return null;

  const detail = await fetchLawService("law", params);
  const amendment = cleanCollectedBody(text(detail, ["개정문내용", "개정문"]));
  const reason = cleanCollectedBody(text(detail, ["제개정이유내용", "제개정이유"]));
  const mainText = cleanCollectedBody(text(detail, ["조문내용", "법령내용", "본문"]));
  const sections = [
    ["개정문", amendment],
    ["제개정 이유", reason],
    ["법령 본문", amendment || reason ? "" : mainText]
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}\n${limitCollectedBody(value)}`);

  return sections.length ? sections.join("\n\n") : null;
}

function lawServiceParamsFromItem(item: CollectedItem): Record<string, string> | null {
  try {
    const parsed = new URL(item.original_url);
    const mst = urlParamInsensitive(parsed, "MST");
    if (!mst) return null;
    const effective = urlParamInsensitive(parsed, "efYd") || yyyymmdd(item.effective_date || item.publish_date || targetDate);
    return { MST: mst, efYd: effective };
  } catch {
    return null;
  }
}

function cleanCollectedBody(value: string): string {
  return compactText(value)
    .replace(/\s*\[\s*/g, " ")
    .replace(/\s*\]\s*/g, " ")
    .replace(/\s*,\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function limitCollectedBody(value: string): string {
  return value.length > lawTextMaxChars ? `${value.slice(0, lawTextMaxChars).trim()}\n...` : value;
}

async function fetchLawSearch(
  logs: CollectionLog[],
  source: string,
  target: string,
  extraParams: Record<string, string | number>
): Promise<AnyRecord[]> {
  const oc = lawOpenApiOc();
  if (!oc) {
    addLog(logs, source, "skipped", "LAW_OPEN_API_OC/LAW_OC/KOREAN_LAW_API_KEY 미설정으로 법제처 API 수집을 건너뜁니다.", 0, OFFICIAL_LAW_GUIDE);
    return [];
  }
  const base = `${env("LAW_OPEN_API_BASE", "https://www.law.go.kr/DRF").replace(/\/$/, "")}/lawSearch.do`;
  const allRows: AnyRecord[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = makeUrl(base, {
      OC: oc,
      target,
      type: "JSON",
      display: 100,
      page,
      ...extraParams
    });
    const payload = await fetchJsonOrXml(url);
    const rows = findRecordRows(payload, [
      "법령명한글",
      "행정규칙명",
      "신구법명",
      "조문정보",
      "법령일련번호",
      "행정규칙일련번호"
    ]);
    allRows.push(...rows);
    const total = Number(text(flattenFirstObject(payload) || {}, ["totalCnt", "총건수"]));
    if (!rows.length || allRows.length >= total) break;
  }
  return allRows;
}

async function fetchLawService(target: string, params: Record<string, string>): Promise<AnyRecord> {
  const oc = lawOpenApiOc();
  if (!oc) throw new Error("LAW_OPEN_API_OC, LAW_OC, or KOREAN_LAW_API_KEY is required");
  const base = `${env("LAW_OPEN_API_BASE", "https://www.law.go.kr/DRF").replace(/\/$/, "")}/lawService.do`;
  const url = makeUrl(base, {
    OC: oc,
    target,
    type: "JSON",
    ...params
  });
  const payload = await fetchJsonOrXml(url);
  return (payload && typeof payload === "object" ? payload : {}) as AnyRecord;
}

function lawOpenApiOc(): string {
  return env("LAW_OPEN_API_OC") || env("LAW_OC") || env("KOREAN_LAW_API_KEY");
}

function normalizeLawmakingRow(
  row: AnyRecord,
  source: string,
  label: "입법예고" | "행정예고",
  endpoint: "ogLmPp" | "ptcpAdmPp",
  endpointUrl: string,
  oc: string
): CollectedItem | null {
  const title = text(row, [
    "법령안명",
    "공고명",
    "입법예고명",
    "행정예고명",
    "title",
    "lbicNm",
    "admRulNm",
    "ppNm",
    "lsNm"
  ]);
  if (!title) return null;
  const recordId = text(row, ["ogLmPpSeq", "ogAdmPpSeq", "lbicId", "admPpSeq", "seq"]);
  const mappingId = text(row, ["mappingLbicId", "mappingAdmRulSeq"]);
  const announceType = text(row, ["announceType"]);
  const detailUrl = text(row, ["상세URL", "url", "link", "detailUrl"]);
  const originalUrl = detailUrl || lawmakingDetailUrl(endpoint, recordId, mappingId, announceType, oc) || endpointUrl;
  const attachments = collectLawmakingLinks(row, endpointUrl);
  const rawText = compactText(
    [
      title,
      text(row, ["lmPpCts", "admPpCts", "입법예고내용", "행정예고내용"])
    ].join(" ")
  );
  return makeItem({
    source,
    source_type: "legislation_notice",
    ministry: text(row, ["소관부처", "소관부처명", "부처명", "ministry", "deptNm", "asndOfiNm", "cptOfiOrgNm"]) || "미상",
    document_type: inferDocumentType(`${text(row, ["lsClsNm", "lmTpNm"])} ${title}`),
    title,
    issue_number: text(row, ["공고번호", "공포번호", "noticeNo", "pntcNo"]) || null,
    publish_date:
      normalizeDate(text(row, ["공고일자", "예고시작일자", "시작일자", "stYdFmt", "pubDate", "pntcDt", "stYd"])) ||
      targetDate,
    effective_date: normalizeDate(text(row, ["시행일자", "예고종료일자", "종료일자", "edYdFmt", "edYd"])),
    change_type: "notice",
    original_url: originalUrl,
    attachment_urls: attachments,
    raw_text: rawText,
    raw_hash: hashText(rawText),
    confidence: "official_notice",
    source_record_id: [recordId, mappingId, announceType].filter(Boolean).join(":") || null,
    verification_required: !originalUrl
  });
}

function dottedDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}.${Number(month)}.${Number(day)}.`;
}

function lawmakingDetailUrl(
  endpoint: "ogLmPp" | "ptcpAdmPp",
  recordId: string,
  mappingId: string,
  announceType: string,
  oc: string
): string {
  if (!recordId || !mappingId || !announceType) return "";
  return makeUrl(`https://www.lawmaking.go.kr/rest/${endpoint}/${recordId}/${mappingId}/${announceType}.html`, { OC: oc });
}

function collectLawmakingLinks(row: AnyRecord, baseUrl: string): string[] {
  const links: string[] = [];
  walk(row, (node) => {
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (!/(FileDownLink|FileDownUrl|fileDownUrl|다운로드|첨부|파일|link|url)/i.test(key)) continue;
      for (const candidate of asArray(child as string | string[])) {
        const raw = compactText(candidate);
        if (!raw || raw === baseUrl) continue;
        try {
          links.push(new URL(raw, baseUrl).toString());
        } catch {
          // Ignore malformed attachment hints from XML rows.
        }
      }
    }
  });
  return [...new Set(links)];
}

function normalizeGazetteUrl(rawUrl: string, baseUrl: string): string {
  if (!rawUrl) return "";
  try {
    return normalizeOriginalUrl(new URL(rawUrl, baseUrl).toString());
  } catch {
    return normalizeOriginalUrl(rawUrl);
  }
}

async function parseBoardRows(
  html: string,
  listUrl: string,
  route: MinistryRoute,
  logs: CollectionLog[]
): Promise<CollectedItem[]> {
  const rows: CollectedItem[] = [];
  const seenUrls = new Set<string>();
  const anchors = extractBoardLinkCandidates(html, listUrl, route);

  for (const anchor of anchors) {
    const rawHref = decodeHtml(anchor.href);
    if (!isAllowedBoardHrefForRoute(route, rawHref)) continue;

    const title = cleanBoardTitle(htmlToText(anchor.label), route);
    if (!isLikelyBoardTitle(title, rawHref)) continue;

    let absoluteUrl = "";
    try {
      absoluteUrl = normalizeOriginalUrl(new URL(rawHref, listUrl).toString());
    } catch (error) {
      addLog(logs, route.source, "error", `게시글 원문 URL 파싱 실패: ${title} - ${messageOf(error)}`, 0, listUrl);
      continue;
    }
    if (seenUrls.has(absoluteUrl)) continue;
    seenUrls.add(absoluteUrl);

    const context = html.slice(Math.max(0, anchor.index - 900), Math.min(html.length, anchor.index + anchor.html.length + 1200));
    const contextDate = boardContextDate(context);
    if (contextDate && contextDate !== targetDate && !containsDateText(context, targetDate)) continue;

    let detailHtml = "";
    try {
      detailHtml = await fetchText(absoluteUrl);
    } catch {
      detailHtml = "";
    }

    const detailText = compactText(detailHtml || context);
    const publishDate =
      normalizeDate(findLabelDate(detailText, ["등록일", "작성일", "발령일자", "검색기간", "예고기간"])) ||
      contextDate ||
      null;
    if (publishDate !== targetDate) continue;

    const attachmentUrls = collectAttachmentUrls(detailHtml || context, absoluteUrl, logs, route.source, title);
    const rawText = compactText([title, detailText || context].join(" "));
    rows.push(
      makeItem({
        source: route.source,
        source_type: route.sourceType || "ministry_board",
        ministry: route.ministry,
        document_type: inferDocumentType(`${route.source} ${title} ${rawText}`),
        title,
        issue_number: extractIssueNumber(`${title} ${rawText}`),
        publish_date: publishDate,
        effective_date: normalizeDate(rawText.match(/시행[^\d]*(20\d{2}[./-]\d{1,2}[./-]\d{1,2})/)?.[1]),
        change_type: inferChangeType(`${title} ${rawText}`),
        original_url: absoluteUrl,
        attachment_urls: attachmentUrls,
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: "official_notice",
        verification_required: false,
        source_record_id: anchor.recordId || null
      })
    );
  }
  return rows;
}

function boardContextDate(context: string): string | null {
  const textValue = compactText(context);
  return (
    normalizeDate(findLabelDate(textValue, ["등록일", "작성일", "발령일자", "예고기간"])) ||
    normalizeDate(textValue.match(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/)?.[0]) ||
    null
  );
}

function containsDateText(value: string, date: string): boolean {
  const [year, month, day] = date.split("-");
  const monthNumber = String(Number(month));
  const dayNumber = String(Number(day));
  const variants = [
    date,
    `${year}.${month}.${day}`,
    `${year}.${monthNumber}.${dayNumber}`,
    `${year}/${month}/${day}`,
    `${year}/${monthNumber}/${dayNumber}`,
    `${year}-${monthNumber}-${dayNumber}`
  ];
  return variants.some((variant) => value.includes(variant));
}

interface BoardLinkCandidate {
  href: string;
  label: string;
  html: string;
  index: number;
  recordId?: string;
}

function extractBoardLinkCandidates(html: string, listUrl: string, route: MinistryRoute): BoardLinkCandidate[] {
  const candidates: BoardLinkCandidate[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    candidates.push({
      href: match[1],
      label: match[2],
      html: match[0],
      index: match.index ?? 0
    });
  }
  candidates.push(...extractMoisOnclickCandidates(html));
  candidates.push(...extractMoefJavascriptCandidates(html, listUrl, route));
  return candidates;
}

function extractMoisOnclickCandidates(html: string): BoardLinkCandidate[] {
  const candidates: BoardLinkCandidate[] = [];
  const pattern =
    /<a\b[^>]*onclick=["'][^"']*fn_egov_inqire_notice\('([^']+)'\s*,\s*'([^']+)'\)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const nttId = match[1];
    const bbsId = match[2];
    candidates.push({
      href: `/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=${encodeURIComponent(bbsId)}&nttId=${encodeURIComponent(nttId)}`,
      label: match[3],
      html: match[0],
      index: match.index ?? 0,
      recordId: `${bbsId}:${nttId}`
    });
  }
  return candidates;
}

function extractMoefJavascriptCandidates(html: string, listUrl: string, route: MinistryRoute): BoardLinkCandidate[] {
  if (!isMoefRoute(route)) return [];
  const candidates: BoardLinkCandidate[] = [];
  const detailPath = moefDetailPath(route);
  if (!detailPath) return [];
  const bbsId = urlSearchParam(listUrl, "bbsId") || urlSearchParam(route.defaultUrl, "bbsId");
  const menuNo = urlSearchParam(listUrl, "menuNo") || urlSearchParam(route.defaultUrl, "menuNo");
  if (!bbsId || !menuNo) return [];

  const pattern = /<a\b[^>]*href=['"]javascript:fn_egov_select\(["']([^"']+)["']\);?['"][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const recordId = match[1];
    const params =
      detailPath.includes("/lw/lap/")
        ? { bbsId, searchNttId1: recordId, menuNo }
        : { searchBbsId1: bbsId, searchNttId1: recordId, menuNo };
    candidates.push({
      href: makeUrl(detailPath, params),
      label: match[2],
      html: match[0],
      index: match.index ?? 0,
      recordId: `${bbsId}:${recordId}`
    });
  }
  return candidates;
}

function moefDetailPath(route: MinistryRoute): string {
  if (route.defaultUrl.includes("/lw/lap/")) return "https://mofe.go.kr/lw/lap/detailTbPrvntcView.do";
  if (route.defaultUrl.includes("/lw/pblanc/")) return "https://mofe.go.kr/lw/pblanc/detailTbPblancView.do";
  if (route.defaultUrl.includes("/lw/denm/")) return "https://mofe.go.kr/lw/denm/detailTbDenmView.do";
  return "";
}

function urlSearchParam(url: string, name: string): string {
  try {
    return new URL(url).searchParams.get(name) || "";
  } catch {
    return "";
  }
}

function withPage(url: string, page: number): string {
  try {
    const parsed = new URL(url);
    if (page > 1 || parsed.searchParams.has("pageIndex")) parsed.searchParams.set("pageIndex", String(page));
    if (parsed.searchParams.has("pageNo")) parsed.searchParams.set("pageNo", String(page));
    return parsed.toString();
  } catch {
    return url;
  }
}

function hasLikelyNextPage(html: string, page: number): boolean {
  const next = String(page + 1);
  return html.includes(`pageIndex=${next}`) || new RegExp(`>\\s*${next}\\s*<`).test(html);
}

function isLikelyBoardTitle(title: string, href: string): boolean {
  if (title.length < 4 || title.length > 180) return false;
  if (/^(#|javascript:)/i.test(href.trim()) || href.trim() === "/") return false;
  if (/^(처음|이전|다음|마지막|목록|검색|다운로드|자료열기|RSS|홈으로)$/i.test(title)) return false;
  if (/^(입법·행정예고·기타|입법·행정예고|보도자료|관련법령|주요지표|정책자료|정보공개청구 및 정보목록|행정규칙|훈령·예규|고시·공고·지침|더보기)$/i.test(title)) {
    return false;
  }
  if (/더보기$/i.test(title)) return false;
  if (/\.(?:hwp|hwpx|pdf|docx?|xlsx?|zip)(?:$|[?#])/i.test(href)) return false;
  if (!/(View|view|Article|article|detail|Tb|Ntt|ntt|bbs|admrul|denm|pblanc|lap|lawService|lawSearch|DRF)/.test(href)) {
    return false;
  }
  return true;
}

function isAllowedBoardHrefForRoute(route: MinistryRoute, href: string): boolean {
  if (isMoisRoute(route)) return /\/frt\/bbs\/type001\/commonSelectBoardArticle\.do/i.test(href);
  if (!isMoefRoute(route)) return true;
  if (route.defaultUrl.includes("/lw/lap/")) return /\/lw\/lap\/detailTbPrvntcView\.do/i.test(href);
  if (route.defaultUrl.includes("/lw/pblanc/")) return /\/lw\/pblanc\/detailTbPblanc/i.test(href);
  if (route.defaultUrl.includes("/lw/denm/")) return /\/lw\/denm\/detailTbDenm/i.test(href);
  if (route.defaultUrl.includes("/lw/admrul")) {
    return /\/lw\/admrul\/detail/i.test(href) || /law\.go\.kr\/.*admrul/i.test(href);
  }
  return false;
}

function isMoefRoute(route: MinistryRoute): boolean {
  return /moef\.go\.kr|mofe\.go\.kr/i.test(route.defaultUrl);
}

function isMoisRoute(route: MinistryRoute): boolean {
  return /mois\.go\.kr/i.test(route.defaultUrl);
}

function cleanBoardTitle(title: string, route: MinistryRoute): string {
  if (!isMoefRoute(route)) return title;
  const cleaned = title
    .replace(/^(입법·행정예고|훈령·예규|고시·공고·지침|행정규칙|공고|고시|지침)\s+/, "")
    .replace(/\s+20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*~\s*20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*$/, "")
    .replace(/\s+20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*$/, "")
    .replace(/\s+[가-힣·]+(?:관|과|팀|실|국|단|센터)\s*$/, "")
    .trim();
  return cleaned || title;
}

function htmlToText(value: string): string {
  return compactText(decodeHtml(value.replace(/<[^>]+>/g, " ")));
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function findLabelDate(textValue: string, labels: string[]): string | null {
  for (const label of labels) {
    const index = textValue.indexOf(label);
    if (index === -1) continue;
    const nearby = textValue.slice(index, index + 120);
    const found = normalizeDate(nearby);
    if (found) return found;
  }
  return normalizeDate(textValue.match(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/)?.[0]);
}

function collectAttachmentUrls(
  html: string,
  baseUrl: string,
  logs: CollectionLog[],
  source: string,
  title: string
): string[] {
  const attachmentUrls: string[] = [];
  for (const match of html.matchAll(/href=["']([^"']+\.(?:hwp|hwpx|pdf|docx?|xlsx?|zip)[^"']*)["']/gi)) {
    try {
      attachmentUrls.push(new URL(decodeHtml(match[1]), baseUrl).toString());
    } catch (error) {
      addLog(logs, source, "error", `첨부파일 URL 파싱 실패: ${title} - ${messageOf(error)}`, 0, baseUrl);
    }
  }
  return [...new Set(attachmentUrls)];
}

function mergeItems(existing: CollectedItem[], incoming: CollectedItem[]): CollectedItem[] {
  const map = new Map<string, CollectedItem>();
  for (const item of existing) map.set(item.id, { ...item, category: itemCategory(item) });
  for (const item of incoming) map.set(item.id, { ...map.get(item.id), ...item, category: itemCategory(item) });
  return [...map.values()].sort((a, b) => {
    const dateOrder = (b.publish_date || "").localeCompare(a.publish_date || "");
    if (dateOrder !== 0) return dateOrder;
    return a.title.localeCompare(b.title, "ko");
  });
}

function normalizeAndFilterByTargetDate(items: CollectedItem[]): CollectedItem[] {
  const byId = new Map<string, CollectedItem>();
  for (const item of items) {
    const publishDate = item.publish_date ? normalizeDate(item.publish_date) : null;
    const collectionDate = normalizeDate(item.collection_date) || targetDate;
    if (collectionDate !== targetDate && publishDate !== targetDate) continue;
    const normalized = {
      ...item,
      publish_date: publishDate,
      collection_date: collectionDate,
      category: itemCategory(item)
    };
    const key = canonicalItemKey(normalized);
    const existing = byId.get(key);
    byId.set(key, existing ? mergeEquivalentItems(existing, normalized) : normalized);
  }
  return [...byId.values()];
}

function canonicalItemKey(item: CollectedItem): string {
  const administrativeRuleId = administrativeRuleRecordId(item);
  if (administrativeRuleId) return `administrative-rule:${administrativeRuleId}`;
  return item.id;
}

function administrativeRuleRecordId(item: CollectedItem): string | null {
  if (isAdministrativeRuleEvidence(item) && item.source_record_id) return item.source_record_id;
  return administrativeRuleIdFromUrl(item.original_url);
}

function administrativeRuleIdFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const target = urlParamInsensitive(parsed, "target");
    if (target?.toLowerCase() !== "admrul") return null;
    return urlParamInsensitive(parsed, "id");
  } catch {
    return null;
  }
}

function urlParamInsensitive(url: URL, name: string): string | null {
  const desired = name.toLowerCase();
  for (const [key, value] of url.searchParams.entries()) {
    if (key.toLowerCase() === desired && value) return value;
  }
  return null;
}

function isAdministrativeRuleEvidence(item: CollectedItem): boolean {
  return item.source_type === "official_law" && /^국가법령정보센터 행정규칙/.test(item.source);
}

function mergeEquivalentItems(existing: CollectedItem, incoming: CollectedItem): CollectedItem {
  const primary = pickPrimaryItem(existing, incoming);
  const secondary = primary === existing ? incoming : existing;
  const rawText = uniqueStrings([primary.raw_text, secondary.raw_text]).join("\n\n--- 추가 근거 ---\n\n");
  const source = uniqueStrings([primary.source, secondary.source]).join(" + ");
  return {
    ...primary,
    source,
    raw_text: rawText,
    raw_hash: hashText(rawText),
    summary: primary.summary || secondary.summary,
    diff_summary: primary.diff_summary || secondary.diff_summary,
    auto_summary: primary.auto_summary || secondary.auto_summary,
    original_url: primary.original_url || secondary.original_url,
    attachment_urls: [...new Set([...(primary.attachment_urls || []), ...(secondary.attachment_urls || [])])],
    verification_required: primary.verification_required && secondary.verification_required
  };
}

function pickPrimaryItem(existing: CollectedItem, incoming: CollectedItem): CollectedItem {
  if (existing.source_type !== incoming.source_type) {
    if (existing.source_type === "official_law") return existing;
    if (incoming.source_type === "official_law") return incoming;
  }
  if (existing.source.includes("신구법 비교") && !incoming.source.includes("신구법 비교")) return incoming;
  return existing;
}

async function listDailyDates(): Promise<string[]> {
  try {
    const fs = await import("node:fs/promises");
    const files = await fs.readdir(dailyDir);
    return files
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .map((file) => file.replace(".json", ""))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

async function readCanonicalItemsExcludingDate(date: string, fallbackItems: CollectedItem[]): Promise<CollectedItem[]> {
  try {
    const fs = await import("node:fs/promises");
    const files = (await fs.readdir(dailyDir))
      .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
      .filter((file) => file !== `${date}.json`);
    const items: CollectedItem[] = [];
    for (const file of files) {
      const daily = await readJson<DailyCollection | null>(path.join(dailyDir, file), null);
      if (daily?.items?.length) items.push(...daily.items);
    }
    if (items.length) return mergeItems([], items);
  } catch {
    // Fall back to the cumulative file if daily cache files are unavailable.
  }
  return fallbackItems.filter((item) => (item.collection_date || item.publish_date) !== date);
}

function makeItem(
  input: Omit<CollectedItem, "id" | "attachment_urls" | "summary" | "diff_summary" | "auto_summary" | "collected_at"> &
    Partial<Pick<CollectedItem, "id" | "attachment_urls" | "summary" | "diff_summary" | "auto_summary" | "collected_at">>
): CollectedItem {
  const hasOriginalUrl = Boolean(input.original_url);
  const originalUrl = normalizeOriginalUrl(input.original_url || OFFICIAL_LAW_GUIDE);
  const title = input.title || "제목 없음";
  const id =
    input.id ||
    stableId([
      input.source,
      input.source_record_id,
      title,
      input.issue_number,
      input.publish_date,
      originalUrl
    ]);
  return {
    id,
    summary: null,
    diff_summary: null,
    auto_summary: false,
    collection_date: targetDate,
    collected_at: new Date().toISOString(),
    ...input,
    title,
    category: itemCategory(input),
    original_url: originalUrl,
    verification_required: input.verification_required || !hasOriginalUrl,
    raw_hash: input.raw_hash || hashText(input.raw_text),
    attachment_urls: [...new Set(input.attachment_urls || [])]
  };
}

function findRecordRows(payload: unknown, keyHints: string[]): AnyRecord[] {
  const arrays: AnyRecord[][] = [];
  walk(payload, (value) => {
    if (!Array.isArray(value)) return;
    const records = value.filter(isRecord);
    if (!records.length) return;
    const score = records.reduce((sum, record) => sum + scoreRecord(record, keyHints), 0);
    if (score > 0) arrays.push(records);
  });
  arrays.sort((a, b) => b.length * scoreRecord(b[0], keyHints) - a.length * scoreRecord(a[0], keyHints));
  if (arrays[0]) return arrays[0];
  const singleRecords: AnyRecord[] = [];
  walk(payload, (value) => {
    if (isRecord(value) && scoreRecord(value, keyHints) > 0) singleRecords.push(value);
  });
  return singleRecords;
}

function flattenFirstObject(value: unknown): AnyRecord | null {
  if (isRecord(value)) {
    const output: AnyRecord = {};
    walk(value, (node) => {
      if (!isRecord(node)) return;
      for (const [key, child] of Object.entries(node)) {
        if (!isRecord(child) && !Array.isArray(child) && output[key] === undefined) output[key] = child;
      }
    });
    return output;
  }
  return null;
}

function walk(value: unknown, visitor: (value: unknown) => void): void {
  visitor(value);
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visitor);
  } else if (isRecord(value)) {
    for (const child of Object.values(value)) walk(child, visitor);
  }
}

function scoreRecord(record: AnyRecord, keyHints: string[]): number {
  const keys = Object.keys(record).map(normalizeKey);
  return keyHints.reduce((score, hint) => score + (keys.includes(normalizeKey(hint)) ? 1 : 0), 0);
}

function text(record: unknown, keys: string[]): string {
  if (!isRecord(record)) return "";
  for (const key of keys) {
    const value = findValue(record, key);
    if (value !== undefined && value !== null && value !== "") return compactText(valueToString(value));
  }
  return "";
}

function directText(record: unknown, keys: string[]): string {
  if (!isRecord(record)) return "";
  for (const key of keys) {
    const desired = normalizeKey(key);
    for (const [entryKey, value] of Object.entries(record)) {
      if (normalizeKey(entryKey) === desired && value !== undefined && value !== null && value !== "") {
        return compactText(valueToString(value));
      }
    }
  }
  return "";
}

function hasDirectKey(record: AnyRecord, key: string): boolean {
  const desired = normalizeKey(key);
  return Object.keys(record).some((entryKey) => normalizeKey(entryKey) === desired);
}

function findValue(record: AnyRecord, desiredKey: string): unknown {
  const desired = normalizeKey(desiredKey);
  for (const [key, value] of Object.entries(record)) {
    if (normalizeKey(key) === desired) return value;
  }
  for (const value of Object.values(record)) {
    if (isRecord(value)) {
      const found = findValue(value, desiredKey);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function valueToString(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(valueToString).join(" ");
  if (isRecord(value) && typeof value["#text"] === "string") return value["#text"];
  if (isRecord(value)) return Object.values(value).map(valueToString).join(" ");
  return "";
}

function normalizeKey(value: string): string {
  return value.replace(/[\s_./:-]/g, "").toLowerCase();
}

function lawUrl(link: string, fallbackId?: string): string {
  if (link) {
    if (/^https?:\/\//i.test(link)) return normalizeOriginalUrl(link);
    return normalizeOriginalUrl(new URL(link.startsWith("/") ? link : `/${link}`, "https://www.law.go.kr").toString());
  }
  if (fallbackId) return `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${encodeURIComponent(fallbackId)}`;
  return "";
}

function normalizeOriginalUrl(url: string): string {
  const cleaned = decodeHtml(url).replace(/;jsessionid=[^/?#]+/gi, "");
  try {
    return new URL(cleaned).toString();
  } catch {
    return cleaned;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function collectLinks(value: unknown): string[] {
  const links: string[] = [];
  walk(value, (node) => {
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (/링크|url|URL|파일/.test(key)) {
        for (const candidate of asArray(child as string | string[])) {
          const raw = compactText(candidate);
          if (/^https?:\/\//i.test(raw)) links.push(raw);
          else if (raw.includes("/")) links.push(new URL(raw, "https://www.law.go.kr").toString());
        }
      }
    }
  });
  return [...new Set(links)];
}

function summarizeDiffEvidence(oldText: string, newText: string): string | null {
  if (!oldText && !newText) return null;
  const oldChars = oldText.length;
  const newChars = newText.length;
  if (oldChars === 0) return "신조문 정보만 확인됨";
  if (newChars === 0) return "구조문 정보만 확인됨";
  return `구조문 ${oldChars.toLocaleString("ko-KR")}자, 신조문 ${newChars.toLocaleString("ko-KR")}자 기준으로 신구법 비교 원문이 확인됨`;
}

function extractIssueNumber(value: string): string | null {
  return value.match(/(?:제\s*)?\d{4}\s*[-–]\s*\d+호|제\s*\d+호/)?.[0]?.replace(/\s+/g, " ") || null;
}

function inferMinistryFromText(value: string): string {
  const ministries = [
    "행정안전부",
    "재정경제부",
    "기획재정부",
    "법제처",
    "국토교통부",
    "고용노동부",
    "보건복지부",
    "환경부",
    "교육부",
    "산업통상부",
    "중소벤처기업부"
  ];
  return ministries.find((ministry) => value.includes(ministry)) || "미상";
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
