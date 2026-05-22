import path from "node:path";
import type { CollectedItem, CollectionLog } from "../lib/types";
import {
  addLog,
  asArray,
  dateDaysAgo,
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

loadDotEnv();

const args = parseArgs();
const lookback = Number(env("FETCH_LOOKBACK_DAYS", "1"));
const targetDate = String(args.date || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));
const maxPages = Number(env("FETCH_MAX_PAGES", "5"));
const detailLimit = Number(env("FETCH_DETAIL_LIMIT", "30"));
const itemsPath = path.join(rootDir, "data", "items.json");
const runPath = path.join(rootDir, "data", "run.json");

async function main() {
  await ensureDataDirs();
  const logs: CollectionLog[] = [];
  const collected: CollectedItem[] = [];

  await runSource(logs, collected, () => fetchLawChangeHistory(logs));
  await runSource(logs, collected, () => fetchArticleChanges(logs));
  await runSource(logs, collected, () => fetchAdministrativeRules(logs));
  await runSource(logs, collected, () => fetchAdministrativeRuleComparisons(logs));
  await runSource(logs, collected, () => fetchLawmakingNotices(logs, "입법예고", "ogLmPp"));
  await runSource(logs, collected, () => fetchLawmakingNotices(logs, "행정예고", "ptcpAdmPp"));
  await runSource(logs, collected, () => fetchGazette(logs));
  await runSource(logs, collected, () => fetchMoisBoard(logs));
  await runSource(logs, collected, () => fetchConfiguredMinistryBoard(logs, "재정경제부/기획재정부 게시판", "MOEF_BOARD_URL"));
  await runSource(logs, collected, () => fetchPolicyRss(logs));
  await runSource(logs, collected, () => fetchNaverNews(logs));

  const existing = await readJson<CollectedItem[]>(itemsPath, []);
  const merged = mergeItems(existing, collected);
  const changedToday = collected.length;

  await writeJson(itemsPath, merged);
  await writeJson(path.join(snapshotsDir, `${targetDate}.json`), collected);
  await writeJson(path.join(logsDir, "last-fetch.json"), logs);
  await writeJson(runPath, {
    last_run_at: new Date().toISOString(),
    last_target_date: targetDate,
    item_count: merged.length,
    changed_count: changedToday,
    logs
  });

  console.log(`Collected ${collected.length} item(s) for ${targetDate}. Total stored: ${merged.length}.`);
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
  const items = rows.map((row) => {
    const title = text(row, ["법령명한글", "법령명"]);
    const originalUrl = lawUrl(text(row, ["법령상세링크"]), text(row, ["법령일련번호"]));
    const rawText = compactText(JSON.stringify(row));
    return makeItem({
      source,
      source_type: "official_law",
      ministry: text(row, ["소관부처명"]) || "미상",
      document_type: inferDocumentType(`${text(row, ["법령구분명"])} ${title}`),
      title,
      issue_number: text(row, ["공포번호"]) || null,
      publish_date: normalizeDate(text(row, ["공포일자"])) || targetDate,
      effective_date: normalizeDate(text(row, ["시행일자"])),
      change_type: inferChangeType(text(row, ["제개정구분명"])),
      original_url: originalUrl,
      raw_text: rawText,
      raw_hash: hashText(rawText),
      confidence: "official",
      source_record_id: text(row, ["법령일련번호", "법령ID"]) || null
    });
  });
  addLog(logs, source, "ok", "법제처 공식 법령 변경이력 API 수집 완료", items.length, OFFICIAL_LAW_GUIDE);
  return items;
}

async function fetchArticleChanges(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "국가법령정보센터 일자별 조문 개정 이력";
  const rows = await fetchLawSearch(logs, source, "lsJoHstInf", { regDt: yyyymmdd(targetDate) });
  const items = rows.map((row) => {
    const title = text(row, ["법령명한글", "법령명"]);
    const originalUrl =
      lawUrl(text(row, ["조문변경이력상세링크", "조문링크"]), text(row, ["법령일련번호"])) ||
      OFFICIAL_LAW_GUIDE;
    const rawText = compactText(
      [title, text(row, ["조문정보"]), text(row, ["변경사유"]), JSON.stringify(row)].join(" ")
    );
    return makeItem({
      source,
      source_type: "official_law",
      ministry: text(row, ["소관부처명"]) || "미상",
      document_type: inferDocumentType(`${text(row, ["법령구분명"])} ${title}`),
      title: `${title}${text(row, ["조문번호"]) ? ` ${text(row, ["조문번호"])}` : ""}`,
      issue_number: text(row, ["공포번호"]) || null,
      publish_date: normalizeDate(text(row, ["조문개정일", "공포일자"])) || targetDate,
      effective_date: normalizeDate(text(row, ["조문시행일", "시행일자"])),
      change_type: inferChangeType(text(row, ["제개정구분명", "변경사유"])),
      original_url: originalUrl,
      raw_text: rawText,
      raw_hash: hashText(rawText),
      confidence: "official",
      source_record_id: text(row, ["법령일련번호", "법령ID", "조문번호"]) || null
    });
  });
  addLog(logs, source, "ok", "법제처 공식 일자별 조문 개정 이력 API 수집 완료", items.length, OFFICIAL_LAW_GUIDE);
  return items;
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
        text(merged, ["개정문내용"]),
        JSON.stringify(row)
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
    const rawText = compactText([title, oldText, newText, JSON.stringify(row)].join(" "));
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
  const base = env("LAWMAKING_BASE", "http://www.lawmaking.go.kr/rest").replace(/\/$/, "");
  const source = `국민참여입법센터 ${label}`;
  const url = makeUrl(`${base}/${endpoint}`, {
    pageIndex: 1,
    pageSize: 100
  });
  const payload = await fetchJsonOrXml(url);
  const rows = findRecordRows(payload, [
    "공고명",
    "법령안명",
    "admPpSeq",
    "lbicId",
    "mappingLbicId",
    "mappingAdmRulSeq"
  ]);
  const items = rows
    .map((row) => normalizeLawmakingRow(row, source, label, endpoint, url))
    .filter((item): item is CollectedItem => Boolean(item));
  addLog(logs, source, "ok", "국민참여입법센터 공개 LINK API 수집 완료", items.length, LAWMAKING_GUIDE);
  return items;
}

async function fetchGazette(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "대한민국 전자관보";
  const url = env("GWANBO_LIST_URL");
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
  const withKey = makeUrl(url, {
    serviceKey: env("DATA_GO_KR_SERVICE_KEY") || undefined,
    pageNo: 1,
    numOfRows: 100,
    fromDate: yyyymmdd(targetDate),
    toDate: yyyymmdd(targetDate)
  });
  const payload = await fetchJsonOrXml(withKey);
  const rows = findRecordRows(payload, ["관보제목", "title", "발행일자", "pdf"]);
  const items = rows.map((row) => {
    const title = text(row, ["관보제목", "제목", "title", "gwanboSj"]);
    const rawText = compactText(JSON.stringify(row));
    const originalUrl = text(row, ["표준내용URL", "PDF", "pdf", "link"]);
    return makeItem({
      source,
      source_type: "gazette",
      ministry: text(row, ["발행기관", "기관명"]) || "행정안전부",
      document_type: inferDocumentType(`${text(row, ["관보구분", "편집구분"])} ${title}`),
      title,
      issue_number: text(row, ["관보번호", "공고번호", "호수"]) || null,
      publish_date: normalizeDate(text(row, ["발행일자", "publishDate"])) || targetDate,
      effective_date: null,
      change_type: inferChangeType(title),
      original_url: originalUrl || url,
      raw_text: rawText,
      raw_hash: hashText(rawText),
      confidence: "official",
      verification_required: !originalUrl,
      source_record_id: text(row, ["id", "문서번호", "gwanboId"]) || null
    });
  });
  addLog(logs, source, "ok", "설정된 관보 API URL 수집 완료", items.length, GWANBO_DATASET);
  return items;
}

async function fetchMoisBoard(logs: CollectionLog[]): Promise<CollectedItem[]> {
  return fetchConfiguredMinistryBoard(logs, "행정안전부 훈령·예규·고시", "MOIS_BOARD_URL", "행정안전부");
}

async function fetchConfiguredMinistryBoard(
  logs: CollectionLog[],
  source: string,
  envName: string,
  defaultMinistry = "재정경제부/기획재정부"
): Promise<CollectedItem[]> {
  const url = env(envName);
  if (!url) {
    addLog(logs, source, "skipped", `${envName} 미설정으로 게시판 HTML 수집을 건너뜁니다.`, 0);
    return [];
  }
  const html = await fetchText(url);
  const rows = parseBoardRows(html, url, defaultMinistry, source, logs);
  addLog(logs, source, "ok", "공식 게시판 HTML 수집 완료", rows.length, url);
  return rows;
}

async function fetchPolicyRss(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const urls = env("KOREA_POLICY_RSS")
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
            publish_date: normalizeDate(text(entry, ["pubDate", "dc:date"])) || targetDate,
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
  const queries = env("NAVER_NEWS_QUERIES", "법령 개정")
    .split(",")
    .map((query) => query.trim())
    .filter(Boolean);
  const items: CollectedItem[] = [];
  for (const query of queries) {
    const url = makeUrl("https://openapi.naver.com/v1/search/news.json", {
      query,
      display: 10,
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
        const rawText = compactText(`${title} ${body}`);
        items.push(
          makeItem({
            source,
            source_type: "news",
            ministry: inferMinistryFromText(`${title} ${body}`),
            document_type: "news",
            title,
            issue_number: null,
            publish_date: normalizeDate(text(row, ["pubDate"])) || targetDate,
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

async function fetchLawSearch(
  logs: CollectionLog[],
  source: string,
  target: string,
  extraParams: Record<string, string | number>
): Promise<AnyRecord[]> {
  const oc = env("LAW_OPEN_API_OC");
  if (!oc) {
    addLog(logs, source, "skipped", "LAW_OPEN_API_OC 미설정으로 법제처 API 수집을 건너뜁니다.", 0, OFFICIAL_LAW_GUIDE);
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
  const oc = env("LAW_OPEN_API_OC");
  if (!oc) throw new Error("LAW_OPEN_API_OC is required");
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

function normalizeLawmakingRow(
  row: AnyRecord,
  source: string,
  label: "입법예고" | "행정예고",
  endpoint: "ogLmPp" | "ptcpAdmPp",
  endpointUrl: string
): CollectedItem | null {
  const title = text(row, [
    "법령안명",
    "공고명",
    "입법예고명",
    "행정예고명",
    "title",
    "lbicNm",
    "admRulNm",
    "ppNm"
  ]);
  if (!title) return null;
  const recordId = text(row, ["lbicId", "admPpSeq", "seq", "mappingLbicId", "mappingAdmRulSeq"]);
  const detailUrl = text(row, ["상세URL", "url", "link", "detailUrl"]);
  const rawText = compactText(JSON.stringify(row));
  return makeItem({
    source,
    source_type: "legislation_notice",
    ministry: text(row, ["소관부처", "소관부처명", "부처명", "ministry", "deptNm"]) || "미상",
    document_type: endpoint === "ogLmPp" ? inferDocumentType(title) : "announcement",
    title,
    issue_number: text(row, ["공고번호", "공포번호", "noticeNo"]) || null,
    publish_date:
      normalizeDate(text(row, ["공고일자", "예고시작일자", "시작일자", "stYdFmt", "pubDate"])) || targetDate,
    effective_date: normalizeDate(text(row, ["시행일자", "예고종료일자", "종료일자", "edYdFmt"])),
    change_type: "notice",
    original_url: detailUrl || endpointUrl,
    raw_text: rawText,
    raw_hash: hashText(rawText),
    confidence: "official_notice",
    source_record_id: recordId || null,
    verification_required: !detailUrl
  });
}

function parseBoardRows(
  html: string,
  listUrl: string,
  ministry: string,
  source: string,
  logs: CollectionLog[]
): CollectedItem[] {
  const rows: CollectedItem[] = [];
  const trMatches = html.matchAll(/<tr[\s\S]*?<\/tr>/gi);
  for (const trMatch of trMatches) {
    const chunk = trMatch[0];
    const hrefMatch = chunk.match(/href=["']([^"']*(?:commonSelectBoardArticle|View\.do|view|article)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
    if (!hrefMatch) continue;
    const rawHref = hrefMatch[1].replaceAll("&amp;", "&");
    const title = compactText(hrefMatch[2]);
    if (!title) continue;
    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(rawHref, listUrl).toString();
    } catch (error) {
      addLog(logs, source, "error", `게시글 원문 URL 파싱 실패: ${title} - ${messageOf(error)}`, 0, listUrl);
      continue;
    }
    const publishDate = normalizeDate(chunk.match(/20\d{2}[./-]\d{2}[./-]\d{2}/)?.[0]) || targetDate;
    const attachmentUrls: string[] = [];
    for (const match of chunk.matchAll(/href=["']([^"']+\.(?:hwp|hwpx|pdf|docx?|xlsx?|zip)[^"']*)["']/gi)) {
      try {
        attachmentUrls.push(new URL(match[1].replaceAll("&amp;", "&"), listUrl).toString());
      } catch (error) {
        addLog(logs, source, "error", `첨부파일 URL 파싱 실패: ${title} - ${messageOf(error)}`, 0, absoluteUrl);
      }
    }
    const rawText = compactText(chunk);
    rows.push(
      makeItem({
        source,
        source_type: "ministry_board",
        ministry,
        document_type: inferDocumentType(title),
        title,
        issue_number: extractIssueNumber(title),
        publish_date: publishDate,
        effective_date: normalizeDate(title.match(/시행[^\d]*(20\d{2}[./-]\d{1,2}[./-]\d{1,2})/)?.[1]),
        change_type: inferChangeType(title),
        original_url: absoluteUrl,
        attachment_urls: attachmentUrls,
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: "official_notice",
        verification_required: false
      })
    );
  }
  return rows;
}

function mergeItems(existing: CollectedItem[], incoming: CollectedItem[]): CollectedItem[] {
  const map = new Map<string, CollectedItem>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) map.set(item.id, { ...map.get(item.id), ...item });
  return [...map.values()].sort((a, b) => {
    const dateOrder = (b.publish_date || "").localeCompare(a.publish_date || "");
    if (dateOrder !== 0) return dateOrder;
    return a.title.localeCompare(b.title, "ko");
  });
}

function makeItem(
  input: Omit<CollectedItem, "id" | "attachment_urls" | "summary" | "diff_summary" | "auto_summary" | "collected_at"> &
    Partial<Pick<CollectedItem, "id" | "attachment_urls" | "summary" | "diff_summary" | "auto_summary" | "collected_at">>
): CollectedItem {
  const hasOriginalUrl = Boolean(input.original_url);
  const originalUrl = input.original_url || OFFICIAL_LAW_GUIDE;
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
    attachment_urls: [],
    summary: null,
    diff_summary: null,
    auto_summary: false,
    collected_at: new Date().toISOString(),
    ...input,
    title,
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
  return JSON.stringify(value);
}

function normalizeKey(value: string): string {
  return value.replace(/[\s_./:-]/g, "").toLowerCase();
}

function lawUrl(link: string, fallbackId?: string): string {
  if (link) {
    if (/^https?:\/\//i.test(link)) return link;
    return new URL(link.startsWith("/") ? link : `/${link}`, "https://www.law.go.kr").toString();
  }
  if (fallbackId) return `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${encodeURIComponent(fallbackId)}`;
  return "";
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
