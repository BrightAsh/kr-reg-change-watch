import fs from "node:fs/promises";
import path from "node:path";
import type { CollectedItem, CollectionLog, DailyCollection, SourceType } from "../lib/types";
import {
  addLog,
  asArray,
  dateDaysAgo,
  env,
  fetchJsonOrXml,
  fetchText,
  loadDotEnv,
  makeUrl,
  parseArgs,
  readJson,
  rootDir,
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

interface DataRoute {
  source: string;
  group: string;
  url: string;
  run: (logs: CollectionLog[]) => Promise<CollectedItem[]>;
}

interface BoardRoute {
  source: string;
  group: string;
  url: string;
  ministry: string;
  sourceType: SourceType;
  documentHint?: string;
  maxPages?: number;
}

interface MsitRoute extends BoardRoute {
  mPid: string;
  mId: string;
  bbsSeqNo: string;
}

interface DataOneWindowRoute {
  source: string;
  bbsTypeCd: string;
  listPath: string;
  detailPath: string;
  ministry: string;
  sourceType: SourceType;
}

const DATA_ROOT = path.join(rootDir, "data", "data");
const DATA_DAILY_DIR = path.join(DATA_ROOT, "daily");
const DATA_SNAPSHOTS_DIR = path.join(DATA_ROOT, "snapshots");
const DATA_LOGS_DIR = path.join(DATA_ROOT, "logs");
const DATA_ITEMS_PATH = path.join(DATA_ROOT, "items.json");
const DATA_RUN_PATH = path.join(DATA_ROOT, "run.json");
const LAW_GUIDE = "https://open.law.go.kr/LSO/openApi/guideList.do";
const LAWMAKING_URL = "https://opinion.lawmaking.go.kr";
const GWANBO_DATASET = "https://www.data.go.kr/data/15109157/openapi.do";

loadDotEnv();

const args = parseArgs();
const lookback = Number(env("DATA_FETCH_LOOKBACK_DAYS", env("FETCH_LOOKBACK_DAYS", "1")));
const targetDate = String(args.date || dateDaysAgo(Number.isFinite(lookback) ? lookback : 1));
const forceCollect = Boolean(args.force || env("DATA_FORCE_COLLECT") === "1" || env("FORCE_COLLECT") === "1");
const maxPages = Math.max(1, Number(env("DATA_FETCH_MAX_PAGES", "20")) || 20);
const detailLimit = Math.max(0, Number(env("DATA_FETCH_DETAIL_LIMIT", "40")) || 40);

const DATA_KEYWORDS = [
  "데이터",
  "데이터 가치",
  "데이터 가치평가",
  "가치평가기관",
  "데이터 산업진흥",
  "데이터산업",
  "데이터 품질",
  "데이터 품질인증",
  "품질인증기관",
  "데이터안심구역",
  "데이터기반행정",
  "공공데이터",
  "통계품질",
  "통계기반정책평가",
  "통계작성",
  "국가데이터처",
  "원윈도우"
];

const LAWMAKING_KEYWORDS = [
  "데이터",
  "데이터 가치평가",
  "데이터 가치평가기관",
  "데이터 산업진흥",
  "데이터 품질인증",
  "공공데이터",
  "데이터기반행정",
  "통계품질",
  "통계기반정책평가"
];

const MSIT_ROUTES: MsitRoute[] = [
  {
    source: "과학기술정보통신부 훈령예규고시",
    group: "msit",
    url: "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=108",
    ministry: "과학기술정보통신부",
    sourceType: "ministry_board",
    documentHint: "훈령 예규 고시",
    mPid: "103",
    mId: "108",
    bbsSeqNo: "83",
    maxPages: 5
  },
  {
    source: "과학기술정보통신부 입법행정예고",
    group: "msit",
    url: "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=103&mId=109",
    ministry: "과학기술정보통신부",
    sourceType: "legislation_notice",
    documentHint: "입법 행정 예고",
    mPid: "103",
    mId: "109",
    bbsSeqNo: "84",
    maxPages: 5
  },
  {
    source: "과학기술정보통신부 공지사항",
    group: "msit",
    url: "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=121&mId=310",
    ministry: "과학기술정보통신부",
    sourceType: "ministry_board",
    documentHint: "공지사항",
    mPid: "121",
    mId: "310",
    bbsSeqNo: "96",
    maxPages: 3
  },
  {
    source: "과학기술정보통신부 사업공고",
    group: "msit",
    url: "https://www.msit.go.kr/bbs/list.do?sCode=user&mPid=121&mId=311",
    ministry: "과학기술정보통신부",
    sourceType: "legislation_notice",
    documentHint: "사업공고",
    mPid: "121",
    mId: "311",
    bbsSeqNo: "100",
    maxPages: 3
  }
];

const KDATA_ROUTES: BoardRoute[] = [
  {
    source: "한국데이터산업진흥원 공지사항",
    group: "kdata",
    url: "https://www.kdata.or.kr/kr/board/notice_01/boardList.do",
    ministry: "한국데이터산업진흥원",
    sourceType: "ministry_board",
    documentHint: "공지사항",
    maxPages: 8
  },
  {
    source: "한국데이터산업진흥원 보도자료",
    group: "kdata",
    url: "https://www.kdata.or.kr/kr/board/promotion_01/boardList.do",
    ministry: "한국데이터산업진흥원",
    sourceType: "press",
    documentHint: "보도자료",
    maxPages: 5
  },
  {
    source: "한국데이터산업진흥원 조사연구보고서",
    group: "kdata",
    url: "https://www.kdata.or.kr/kr/board/info_01/boardList.do",
    ministry: "한국데이터산업진흥원",
    sourceType: "ministry_board",
    documentHint: "자료",
    maxPages: 3
  },
  {
    source: "한국데이터산업진흥원 데이터 산업 동향",
    group: "kdata",
    url: "https://www.kdata.or.kr/kr/board/info_11/boardList.do",
    ministry: "한국데이터산업진흥원",
    sourceType: "ministry_board",
    documentHint: "자료",
    maxPages: 3
  }
];

const DATA_ONE_WINDOW_ROUTES: DataOneWindowRoute[] = [
  {
    source: "데이터 원윈도우 정책지침",
    bbsTypeCd: "005",
    listPath: "/dbPcyEvlSys/list",
    detailPath: "/dbPcyEvlSys/detail",
    ministry: "데이터 원윈도우",
    sourceType: "ministry_board"
  },
  {
    source: "데이터 원윈도우 공지사항",
    bbsTypeCd: "001",
    listPath: "/ntcMttr/list",
    detailPath: "/ntcMttr/detail",
    ministry: "데이터 원윈도우",
    sourceType: "ministry_board"
  }
];

const MOIS_ROUTES: BoardRoute[] = [
  {
    source: "행정안전부 훈령예규고시",
    group: "mois",
    url: "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000016",
    ministry: "행정안전부",
    sourceType: "ministry_board",
    documentHint: "훈령 예규 고시",
    maxPages: 5
  },
  {
    source: "행정안전부 입법행정예고",
    group: "mois",
    url: "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000017",
    ministry: "행정안전부",
    sourceType: "legislation_notice",
    documentHint: "입법 행정 예고",
    maxPages: 5
  },
  {
    source: "행정안전부 법령자료실",
    group: "mois",
    url: "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardList.do?bbsId=BBSMSTR_000000000018",
    ministry: "행정안전부",
    sourceType: "ministry_board",
    documentHint: "법령자료",
    maxPages: 5
  },
  {
    source: "행정안전부 알립니다",
    group: "mois",
    url: "https://www.mois.go.kr/frt/bbs/type013/commonSelectBoardList.do?bbsId=BBSMSTR_000000000006",
    ministry: "행정안전부",
    sourceType: "ministry_board",
    documentHint: "공지사항",
    maxPages: 3
  }
];

const MODS_ROUTES: BoardRoute[] = [
  ["국가데이터처 법령", "a10403010000"],
  ["국가데이터처 입법예고", "a10403020000"],
  ["국가데이터처 훈령", "a10403030000"],
  ["국가데이터처 고시", "a10403040000"],
  ["국가데이터처 예규", "a10403050000"],
  ["국가데이터처 기타 법령자료", "a10403060000"],
  ["국가데이터처 통계기반정책평가 관련자료", "a10407040100"],
  ["국가데이터처 통계품질관리 자료실", "a10409060100"]
].map(([source, mid]) => ({
  source,
  group: "mods",
  url: `https://mods.go.kr/menu.es?mid=${mid}`,
  ministry: "국가데이터처",
  sourceType: source.includes("입법예고") ? "legislation_notice" : "ministry_board",
  documentHint: source,
  maxPages: 5
}));

async function main() {
  await ensureDataCollectionDirs();

  const dailyPath = path.join(DATA_DAILY_DIR, `${targetDate}.json`);
  const cached = await readJson<DailyCollection | null>(dailyPath, null);
  if (cached?.date === targetDate && !forceCollect && canReuseDataCache(cached)) {
    const merged = mergeItems(await readDataItemsExcludingDate(targetDate), cached.items);
    const cacheLogs: CollectionLog[] = [
      ...cached.logs,
      {
        source: "데이터 수집 캐시",
        status: "ok",
        message: `${targetDate} 데이터 전용 수집 캐시를 재사용했습니다.`,
        count: cached.items.length,
        at: new Date().toISOString()
      }
    ];
    await writeDataRun(merged, cached.changed_count, true, cacheLogs);
    await writeJson(DATA_ITEMS_PATH, merged);
    await writeJson(path.join(DATA_LOGS_DIR, "last-fetch.json"), cacheLogs);
    console.log(`Data collection cache hit for ${targetDate}. Reused ${cached.items.length} item(s).`);
    return;
  }
  if (cached?.date === targetDate && !forceCollect) {
    console.warn(`Data collection cache for ${targetDate} has non-ok route logs. Recollecting instead of reusing it.`);
  }

  const logs: CollectionLog[] = [];
  const collected: CollectedItem[] = [];

  const routes: DataRoute[] = [
    {
      source: "국가법령정보센터 데이터 법령",
      group: "official-law",
      url: LAW_GUIDE,
      run: (routeLogs) => fetchLawSearchRoute(routeLogs, "law", "국가법령정보센터 데이터 법령")
    },
    {
      source: "국가법령정보센터 데이터 행정규칙",
      group: "official-law",
      url: LAW_GUIDE,
      run: (routeLogs) => fetchLawSearchRoute(routeLogs, "admrul", "국가법령정보센터 데이터 행정규칙")
    },
    {
      source: "국민참여입법센터 데이터 입법예고",
      group: "lawmaking",
      url: `${LAWMAKING_URL}/gcom/ogLmPp`,
      run: (routeLogs) => fetchLawmakingWebRoute(routeLogs, "국민참여입법센터 데이터 입법예고", "ogLmPp")
    },
    {
      source: "국민참여입법센터 데이터 행정예고",
      group: "lawmaking",
      url: `${LAWMAKING_URL}/gcom/admpp`,
      run: (routeLogs) => fetchLawmakingWebRoute(routeLogs, "국민참여입법센터 데이터 행정예고", "admpp")
    },
    {
      source: "국민참여입법센터 국회입법현황",
      group: "lawmaking",
      url: `${LAWMAKING_URL}/gcom/nsmLmSts/out`,
      run: (routeLogs) => fetchLawmakingWebRoute(routeLogs, "국민참여입법센터 국회입법현황", "assembly")
    },
    {
      source: "대한민국 전자관보 데이터 검색",
      group: "gazette",
      url: GWANBO_DATASET,
      run: fetchGazetteRoute
    },
    ...MSIT_ROUTES.map((route) => ({
      source: route.source,
      group: route.group,
      url: route.url,
      run: (routeLogs: CollectionLog[]) => fetchMsitRoute(routeLogs, route)
    })),
    ...KDATA_ROUTES.map((route) => ({
      source: route.source,
      group: route.group,
      url: route.url,
      run: (routeLogs: CollectionLog[]) => fetchKdataRoute(routeLogs, route)
    })),
    ...DATA_ONE_WINDOW_ROUTES.map((route) => ({
      source: route.source,
      group: "data-one-window",
      url: `https://www.data1window.kr${route.listPath}`,
      run: (routeLogs: CollectionLog[]) => fetchDataOneWindowRoute(routeLogs, route)
    })),
    ...MOIS_ROUTES.map((route) => ({
      source: route.source,
      group: route.group,
      url: route.url,
      run: (routeLogs: CollectionLog[]) => fetchGenericGovernmentBoard(routeLogs, route)
    })),
    ...MODS_ROUTES.map((route) => ({
      source: route.source,
      group: route.group,
      url: route.url,
      run: (routeLogs: CollectionLog[]) => fetchModsRoute(routeLogs, route)
    })),
    {
      source: "공공데이터포털 공지사항",
      group: "data-go-kr",
      url: "https://www.data.go.kr/bbs/ntc/selectNoticeListView.do",
      run: (routeLogs) =>
        fetchGenericGovernmentBoard(routeLogs, {
          source: "공공데이터포털 공지사항",
          group: "data-go-kr",
          url: "https://www.data.go.kr/bbs/ntc/selectNoticeListView.do",
          ministry: "공공데이터포털",
          sourceType: "ministry_board",
          documentHint: "공지사항",
          maxPages: 3
        })
    }
  ];

  for (const route of routes) {
    const startedAt = logs.length;
    try {
      console.log(`[data-collect] ${targetDate} ${route.source}: start`);
      const items = await route.run(logs);
      collected.push(...items);
      tagLogs(logs, startedAt, route.group, route.source);
      console.log(`[data-collect] ${targetDate} ${route.source}: ${items.length}`);
    } catch (error) {
      addLog(logs, route.source, "error", messageOf(error), 0, route.url, route.group, route.source);
      console.warn(`[data-collect] ${targetDate} ${route.source} failed: ${messageOf(error)}`);
    }
  }

  const itemsForDate = mergeItems([], normalizeForTargetDate(collected));
  const previous = await readPreviousSnapshot(targetDate);
  const changedCount = countChangedItems(previous, itemsForDate);
  const merged = mergeItems(await readDataItemsExcludingDate(targetDate), itemsForDate);
  const daily: DailyCollection = {
    date: targetDate,
    collected_at: new Date().toISOString(),
    item_count: itemsForDate.length,
    changed_count: changedCount,
    cache_hit: false,
    items: itemsForDate,
    logs
  };

  await writeJson(DATA_ITEMS_PATH, merged);
  await writeJson(path.join(DATA_SNAPSHOTS_DIR, `${targetDate}.json`), itemsForDate);
  await writeJson(path.join(DATA_DAILY_DIR, `${targetDate}.json`), daily);
  await writeJson(path.join(DATA_LOGS_DIR, "last-fetch.json"), logs);
  await writeDataRun(merged, changedCount, false, logs);
  console.log(`Data collection complete for ${targetDate}. ${itemsForDate.length} item(s), ${changedCount} changed/new.`);
}

function canReuseDataCache(daily: DailyCollection): boolean {
  return daily.logs.length > 0 && daily.logs.every((log) => log.status === "ok");
}

async function ensureDataCollectionDirs(): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.mkdir(DATA_DAILY_DIR, { recursive: true });
  await fs.mkdir(DATA_SNAPSHOTS_DIR, { recursive: true });
  await fs.mkdir(DATA_LOGS_DIR, { recursive: true });
}

async function writeDataRun(items: CollectedItem[], changedCount: number, cacheHit: boolean, logs: CollectionLog[]) {
  await writeJson(DATA_RUN_PATH, {
    last_run_at: new Date().toISOString(),
    last_target_date: targetDate,
    item_count: items.length,
    changed_count: changedCount,
    available_dates: await listDataDailyDates(),
    cache_hit: cacheHit,
    logs
  });
}

async function listDataDailyDates(): Promise<string[]> {
  const files = await fs.readdir(DATA_DAILY_DIR).catch(() => []);
  return files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .map((file) => file.replace(".json", ""))
    .sort((a, b) => b.localeCompare(a));
}

async function fetchLawSearchRoute(logs: CollectionLog[], target: "law" | "admrul", source: string): Promise<CollectedItem[]> {
  const oc = lawOpenApiOc();
  if (!oc) {
    addLog(logs, source, "skipped", "LAW_OPEN_API_OC/LAW_OC/KOREAN_LAW_API_KEY 미설정으로 법제처 API를 건너뜁니다.", 0, LAW_GUIDE);
    return [];
  }

  const rowsByKey = new Map<string, AnyRecord>();
  for (const params of lawDateSearchParams(target)) {
    const rows = await lawSearch(target, params);
    for (const row of rows) {
      const textValue = compactText(JSON.stringify(row));
      if (!isRelevantDataText(textValue)) continue;
      if (!recordHasTargetDate(row, target === "law" ? ["공포일자", "시행일자", "생성일자"] : ["발령일자", "시행일자", "생성일자"])) continue;
      const key = text(row, target === "law" ? ["법령일련번호", "법령ID", "MST"] : ["행정규칙일련번호", "행정규칙ID", "ID"]) || text(row, ["법령명한글", "행정규칙명"]);
      if (key) rowsByKey.set(key, row);
    }
  }

  const items: CollectedItem[] = [];
  let detailCount = 0;
  for (const row of rowsByKey.values()) {
    let merged = row;
    let detail: AnyRecord | null = null;
    const recordId = text(row, target === "law" ? ["법령일련번호", "MST"] : ["행정규칙일련번호", "ID"]);
    if (recordId && detailCount < detailLimit) {
      detailCount += 1;
      try {
        detail = await lawService(target, target === "law" ? { MST: recordId } : { ID: recordId });
        merged = { ...row, ...(flattenFirstObject(detail) || {}) };
      } catch (error) {
        addLog(logs, source, "error", `상세 본문 조회 실패: ${recordId} - ${messageOf(error)}`, 0, LAW_GUIDE);
      }
    }
    const title = text(merged, ["법령명한글", "행정규칙명", "기본정보 법령명_한글"]) || "데이터 법령";
    const rawText = compactText(
      [
        title,
        text(merged, ["제개정구분명", "법령구분명", "행정규칙종류"]),
        text(merged, ["소관부처명"]),
        text(merged, ["조문내용", "부칙내용", "제개정이유내용", "개정문내용", "본문"])
      ].join(" ")
    );
    const originalUrl =
      lawUrl(text(merged, target === "law" ? ["법령상세링크", "상세링크"] : ["행정규칙상세링크", "상세링크"])) ||
      (target === "law"
        ? `https://www.law.go.kr/법령/${encodeURIComponent(title)}`
        : `https://www.law.go.kr/행정규칙/${encodeURIComponent(title)}`);
    items.push(
      makeDataItem({
        source,
        source_type: "official_law",
        ministry: text(merged, ["소관부처명"]) || "미상",
        document_type: inferDocumentType(`${text(merged, ["법령구분명", "행정규칙종류"])} ${title}`),
        title,
        issue_number: text(merged, ["공포번호", "발령번호"]) || null,
        publish_date: normalizeDate(text(merged, ["공포일자", "발령일자", "생성일자"])) || targetDate,
        effective_date: normalizeDate(text(merged, ["시행일자"])),
        change_type: inferChangeType(text(merged, ["제개정구분명"]) || title),
        original_url: originalUrl,
        attachment_urls: collectLinks(detail || merged),
        raw_text: rawText || compactText(JSON.stringify(merged)),
        raw_hash: hashText(rawText || compactText(JSON.stringify(merged))),
        confidence: "official",
        verification_required: false,
        source_record_id: recordId || null
      })
    );
  }
  addLog(logs, source, "ok", "국가법령정보센터 데이터 관련 법령/행정규칙 검색 수집 완료", items.length, LAW_GUIDE);
  return items;
}

function lawDateSearchParams(target: "law" | "admrul"): Array<Record<string, string | number>> {
  const dateValue = yyyymmdd(targetDate);
  if (target === "law") {
    return [
      { date: dateValue, sort: "ddes" },
      { efYd: `${dateValue}~${dateValue}`, sort: "efdes" }
    ];
  }
  return [{ date: dateValue, sort: "ddes" }];
}

async function fetchLawmakingWebRoute(
  logs: CollectionLog[],
  source: string,
  endpoint: "ogLmPp" | "admpp" | "assembly"
): Promise<CollectedItem[]> {
  const items: CollectedItem[] = [];
  const seen = new Set<string>();
  const date = dottedDate(targetDate);
  for (const keyword of LAWMAKING_KEYWORDS) {
    const url =
      endpoint === "ogLmPp"
        ? makeUrl(`${LAWMAKING_URL}/gcom/ogLmPp`, { stYdFmt: date, edYdFmt: date, lsNm: keyword, isOgYn: "Y", opYn: "Y" })
        : endpoint === "admpp"
          ? makeUrl(`${LAWMAKING_URL}/gcom/admpp/list`, { stYdFmt: date, edYdFmt: date, admRulNm: keyword })
          : makeUrl(`${LAWMAKING_URL}/gcom/nsmLmSts/out`, { stYdFmt: date, edYdFmt: date, lsNm: keyword });
    const html = await fetchText(url);
    for (const item of parseLawmakingAnchors(html, url, source, endpoint)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
  }
  addLog(logs, source, "ok", "국민참여입법센터 데이터 키워드 웹 목록 수집 완료", items.length, `${LAWMAKING_URL}/api/operationGuide`);
  return items;
}

function parseLawmakingAnchors(
  html: string,
  listUrl: string,
  source: string,
  endpoint: "ogLmPp" | "admpp" | "assembly"
): CollectedItem[] {
  const items: CollectedItem[] = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const href = decodeHtml(match[1]);
    const label = compactText(htmlToText(match[2]));
    if (!label || label.length < 4) continue;
    if (endpoint === "ogLmPp" && !/\/gcom\/ogLmPp\/\d+/i.test(href)) continue;
    if (endpoint === "admpp" && !/\/gcom\/admpp\//i.test(href)) continue;
    if (endpoint === "assembly" && !/(detail|nsmLmSts)/i.test(href)) continue;
    if (!isRelevantDataText(label)) continue;

    const index = match.index || 0;
    const context = html.slice(Math.max(0, index - 900), Math.min(html.length, index + match[0].length + 900));
    const contextText = compactText(htmlToText(context));
    const publishDate =
      findDateAfterLabel(contextText, ["공고일자", "공고일", "등록일", "제안일", "처리일"]) ||
      findDateAfterLabel(contextText, ["접수기간", "예고기간", "입법의견 접수기간"]);
    if (publishDate !== targetDate) continue;

    const originalUrl = normalizeOriginalUrl(new URL(href, listUrl).toString());
    const rawText = compactText([label, contextText].join(" "));
    items.push(
      makeDataItem({
        source,
        source_type: "legislation_notice",
        ministry: inferMinistryFromText(rawText),
        document_type: inferDocumentType(label),
        title: label,
        issue_number: extractIssueNumber(rawText),
        publish_date: publishDate,
        effective_date: normalizeDate(findLabelDate(rawText, ["시행일자", "종료일자"])),
        change_type: "notice",
        original_url: originalUrl,
        attachment_urls: collectAttachmentUrls(context, originalUrl),
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: "official_notice",
        verification_required: false,
        source_record_id: originalUrl.match(/(\d{3,})/)?.[1] || null
      })
    );
  }
  return items;
}

async function fetchGazetteRoute(logs: CollectionLog[]): Promise<CollectedItem[]> {
  const source = "대한민국 전자관보 데이터 검색";
  const url = env("GWANBO_LIST_URL");
  const serviceKey = env("DATA_GO_KR_SERVICE_KEY");
  if (!url || !serviceKey) {
    addLog(logs, source, "skipped", "GWANBO_LIST_URL/DATA_GO_KR_SERVICE_KEY 미설정으로 전자관보 API를 건너뜁니다.", 0, GWANBO_DATASET);
    return [];
  }
  const payload = await fetchJsonOrXml(
    makeUrl(url, {
      serviceKey,
      pageNo: 1,
      pageSize: 100,
      numOfRows: 100,
      reqFrom: yyyymmdd(targetDate),
      reqTo: yyyymmdd(targetDate)
    })
  );
  const rows = findRecordRows(payload, ["title", "sj", "subject", "관보", "date", "일자"]);
  const items = rows
    .map((row) => normalizeGazetteRow(row, source))
    .filter((item): item is CollectedItem => Boolean(item));
  addLog(logs, source, "ok", "전자관보 API 데이터 키워드 필터 수집 완료", items.length, GWANBO_DATASET);
  return items;
}

function normalizeGazetteRow(row: AnyRecord, source: string): CollectedItem | null {
  const title = text(row, ["title", "sj", "subject", "제목", "건명", "ofcttSj"]);
  const body = compactText(JSON.stringify(row));
  if (!title || !isRelevantDataText(`${title} ${body}`)) return null;
  const publishDate = normalizeDate(text(row, ["date", "일자", "publishDate", "ofcttDe", "게재일"])) || targetDate;
  if (publishDate !== targetDate) return null;
  const originalUrl = normalizeOriginalUrl(text(row, ["url", "link", "상세링크"]) || "https://www.gwanbo.go.kr");
  const rawText = compactText([title, body].join(" "));
  return makeDataItem({
    source,
    source_type: "gazette",
    ministry: inferMinistryFromText(rawText),
    document_type: inferDocumentType(title),
    title,
    issue_number: extractIssueNumber(rawText),
    publish_date: publishDate,
    effective_date: null,
    change_type: inferChangeType(title),
    original_url: originalUrl,
    attachment_urls: collectLinks(row),
    raw_text: rawText,
    raw_hash: hashText(rawText),
    confidence: "official",
    verification_required: !originalUrl,
    source_record_id: text(row, ["id", "seq", "관보번호"]) || null
  });
}

async function fetchMsitRoute(logs: CollectionLog[], route: MsitRoute): Promise<CollectedItem[]> {
  const items: CollectedItem[] = [];
  for (let page = 1; page <= (route.maxPages || maxPages); page += 1) {
    const pageUrl = withPage(route.url, page);
    const html = await fetchText(pageUrl);
    const pageRows = parseMsitRows(html, pageUrl, route);
    items.push(...pageRows);
    if (pageRows.length === 0 && pageHasOnlyOlderDates(html)) break;
  }
  const unique = mergeItems([], items);
  addLog(logs, route.source, "ok", "과기정통부 자바스크립트 게시판 목록 수집 완료", unique.length, route.url);
  return unique;
}

function parseMsitRows(html: string, listUrl: string, route: MsitRoute): CollectedItem[] {
  const idMatches = [...html.matchAll(/<a\b[^>]*onclick=["']fn_detail\((\d+)\);?["'][^>]*>/gi)];
  const titleMatches = [...html.matchAll(/sHtml\+=\s*unescape\('((?!ctgryHtml)[\s\S]*?)'\);/gi)].map((match) =>
    decodeHtml(match[1])
  );
  const dates = new Map<number, string>();
  for (const match of html.matchAll(/\$\('#td_'\+'REG_DT'\+'_(\d+)'\)\.html\('([^']+)'\);/gi)) {
    const index = Number(match[1]);
    const date = normalizeDate(match[2]);
    if (date) dates.set(index, date);
  }

  const rows: CollectedItem[] = [];
  idMatches.forEach((match, index) => {
    const id = match[1];
    const title = cleanTitle(titleMatches[index] || "");
    const publishDate = dates.get(index) || null;
    if (!title || publishDate !== targetDate || !isRelevantDataText(`${title} ${route.source}`)) return;
    const originalUrl = normalizeOriginalUrl(
      makeUrl("https://www.msit.go.kr/bbs/view.do", {
        sCode: "user",
        mPid: route.mPid,
        mId: route.mId,
        bbsSeqNo: route.bbsSeqNo,
        nttSeqNo: id
      })
    );
    const context = surroundingText(html, match.index || 0, 1200);
    const rawText = compactText([route.source, title, context].join(" "));
    rows.push(
      makeDataItem({
        source: route.source,
        source_type: route.sourceType,
        ministry: route.ministry,
        document_type: inferDocumentType(`${route.documentHint || ""} ${title}`),
        title,
        issue_number: extractIssueNumber(`${title} ${rawText}`),
        publish_date: publishDate,
        effective_date: normalizeDate(findLabelDate(rawText, ["시행일자"])),
        change_type: inferChangeType(title),
        original_url: originalUrl,
        attachment_urls: collectAttachmentUrls(context, originalUrl),
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: route.sourceType === "press" ? "press" : "official_notice",
        verification_required: false,
        source_record_id: id
      })
    );
  });
  return rows;
}

async function fetchKdataRoute(logs: CollectionLog[], route: BoardRoute): Promise<CollectedItem[]> {
  const items: CollectedItem[] = [];
  for (let page = 1; page <= (route.maxPages || maxPages); page += 1) {
    const pageUrl = withPage(route.url, page);
    const html = await fetchText(pageUrl);
    const pageRows = parseKdataRows(html, pageUrl, route);
    for (const row of pageRows) {
      const enriched = await enrichKdataItem(row, route).catch(() => row);
      items.push(enriched);
    }
    if (pageRows.length === 0 && pageHasOnlyOlderDates(html)) break;
  }
  const unique = mergeItems([], items);
  addLog(logs, route.source, "ok", "K-DATA 게시판 목록/본문 수집 완료", unique.length, route.url);
  return unique;
}

function parseKdataRows(html: string, listUrl: string, route: BoardRoute): CollectedItem[] {
  const rows: CollectedItem[] = [];
  const pattern = /<li\b[^>]*onclick=["']fnLinkView\('(\d+)'\);?["'][^>]*>([\s\S]*?)<\/li>/gi;
  for (const match of html.matchAll(pattern)) {
    const id = match[1];
    const block = match[2];
    const title = cleanTitle(htmlToText(block.match(/<p class=["']tit["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || ""));
    const publishDate = normalizeDate(htmlToText(block.match(/<p class=["']date["'][^>]*>([\s\S]*?)<\/p>/i)?.[1] || ""));
    if (!title || publishDate !== targetDate || !isRelevantDataText(`${title} ${route.source}`)) continue;
    const originalUrl = normalizeOriginalUrl(new URL(`./boardView.do?bbsIdx=${encodeURIComponent(id)}`, listUrl).toString());
    const rawText = compactText([route.source, title, htmlToText(block)].join(" "));
    rows.push(
      makeDataItem({
        source: route.source,
        source_type: route.sourceType,
        ministry: route.ministry,
        document_type: inferDocumentType(`${route.documentHint || ""} ${title}`),
        title,
        issue_number: id,
        publish_date: publishDate,
        effective_date: null,
        change_type: inferChangeType(title),
        original_url: originalUrl,
        attachment_urls: [],
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: route.sourceType === "press" ? "press" : "official_notice",
        verification_required: false,
        source_record_id: id
      })
    );
  }
  return rows;
}

async function enrichKdataItem(item: CollectedItem, route: BoardRoute): Promise<CollectedItem> {
  const html = await fetchText(item.original_url);
  const detailText = compactText(htmlToText(html));
  const attachmentUrls = collectAttachmentUrls(html, item.original_url);
  const rawText = compactText([item.raw_text, detailText].join(" "));
  return {
    ...item,
    attachment_urls: attachmentUrls,
    raw_text: rawText,
    raw_hash: hashText(rawText),
    document_type: inferDocumentType(`${route.documentHint || ""} ${item.title} ${detailText}`)
  };
}

async function fetchDataOneWindowRoute(logs: CollectionLog[], route: DataOneWindowRoute): Promise<CollectedItem[]> {
  const listUrl = makeUrl("https://www.data1window.kr/vrest/api/v1/resource/post/list", {
    limit: 1000,
    offset: 0,
    bbsTypeCd: route.bbsTypeCd,
    searchValue: ""
  });
  const payload = await fetchJsonOrXml(listUrl);
  const rows = findRecordRows(payload, ["pstSn", "pstTtl", "wrtDt"]);
  const items: CollectedItem[] = [];
  for (const row of rows) {
    const title = text(row, ["pstTtl", "title"]);
    const publishDate = normalizeDate(text(row, ["wrtDt", "regDt", "등록일"]));
    if (!title || publishDate !== targetDate || !isRelevantDataText(`${title} ${route.source}`)) continue;
    const pstSn = text(row, ["pstSn"]);
    const pstTypeCd = text(row, ["pstTypeCd"]) || route.bbsTypeCd;
    const originalUrl = normalizeOriginalUrl(`https://www.data1window.kr${route.detailPath}?pstTypeCd=${encodeURIComponent(pstTypeCd)}&pstSn=${encodeURIComponent(pstSn)}`);
    let detailText = "";
    let attachmentUrls: string[] = [];
    if (pstSn) {
      try {
        const detail = await fetchJsonOrXml(
          makeUrl("https://www.data1window.kr/vrest/api/v1/resource/post/get", { pstTypeCd, pstSn })
        );
        detailText = compactText(JSON.stringify(detail));
        attachmentUrls = collectDataOneWindowAttachmentUrls(detail);
      } catch (error) {
        addLog(logs, route.source, "error", `원윈도우 상세 조회 실패: ${pstSn} - ${messageOf(error)}`, 0, originalUrl);
      }
    }
    const rawText = compactText([route.source, title, detailText || JSON.stringify(row)].join(" "));
    items.push(
      makeDataItem({
        source: route.source,
        source_type: route.sourceType,
        ministry: route.ministry,
        document_type: inferDocumentType(title),
        title,
        issue_number: pstSn || null,
        publish_date: publishDate,
        effective_date: null,
        change_type: inferChangeType(title),
        original_url: originalUrl,
        attachment_urls: attachmentUrls,
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: "official_notice",
        verification_required: false,
        source_record_id: pstSn || null
      })
    );
  }
  addLog(logs, route.source, "ok", "데이터 원윈도우 JSON 목록/본문 API 수집 완료", items.length, `https://www.data1window.kr${route.listPath}`);
  return mergeItems([], items);
}

function collectDataOneWindowAttachmentUrls(value: unknown): string[] {
  const urls: string[] = [];
  walk(value, (node) => {
    if (!isRecord(node)) return;
    const uuid = text(node, ["usdtUuid"]);
    if (uuid) {
      urls.push(
        `https://www.data1window.kr/vrest/api/v1/resource/common/getfileByUuid?usdtUuid=${encodeURIComponent(uuid)}`
      );
    }
  });
  return uniqueStrings(urls);
}

async function fetchGenericGovernmentBoard(logs: CollectionLog[], route: BoardRoute): Promise<CollectedItem[]> {
  const items: CollectedItem[] = [];
  for (let page = 1; page <= (route.maxPages || maxPages); page += 1) {
    const pageUrl = withPage(route.url, page);
    const html = await fetchText(pageUrl);
    const rows = parseGenericGovernmentRows(html, pageUrl, route);
    items.push(...rows);
    if (rows.length === 0 && pageHasOnlyOlderDates(html)) break;
  }
  const unique = mergeItems([], items);
  addLog(logs, route.source, "ok", "정부/공공 게시판 HTML 수집 완료", unique.length, route.url);
  return unique;
}

function parseGenericGovernmentRows(html: string, listUrl: string, route: BoardRoute): CollectedItem[] {
  const rows: CollectedItem[] = [];
  const anchors = [...html.matchAll(/<a\b[^>]*href=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const href = decodeHtml(match[2]);
    const title = cleanTitle(htmlToText(match[3]));
    if (!isLikelyBoardTitle(title, href) || !isRelevantDataText(`${title} ${route.source}`)) continue;
    const index = match.index || 0;
    const context = enclosingTagBlock(html, index, "tr") || surroundingText(html, index, 1000);
    const contextText = htmlToText(context);
    const publishDate =
      normalizeDate(findLabelDate(contextText, ["게시일", "등록일", "작성일", "공고일", "발령일자"])) ||
      normalizeDate(contextText.match(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/)?.[0]);
    if (publishDate) {
      if (publishDate !== targetDate) continue;
    } else if (!containsDateText(context, targetDate)) {
      continue;
    }
    const originalUrl = normalizeBoardHref(href, listUrl);
    const rawText = compactText([route.source, title, contextText].join(" "));
    rows.push(
      makeDataItem({
        source: route.source,
        source_type: route.sourceType,
        ministry: route.ministry,
        document_type: inferDocumentType(`${route.documentHint || ""} ${title}`),
        title,
        issue_number: extractIssueNumber(rawText),
        publish_date: publishDate || targetDate,
        effective_date: normalizeDate(findLabelDate(rawText, ["시행일자"])),
        change_type: inferChangeType(title),
        original_url: originalUrl,
        attachment_urls: collectAttachmentUrls(context, originalUrl),
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: route.sourceType === "press" ? "press" : "official_notice",
        verification_required: false,
        source_record_id: href.match(/(?:nttId|list_no|seq|bbsId)=?([^&'")]+)/i)?.[1] || null
      })
    );
  }
  return rows;
}

function normalizeBoardHref(href: string, listUrl: string): string {
  const dataGoMatch = href.match(/fn_view\(["']([^"']+)["']\s*,\s*["']([^"']*)["']\)/i);
  if (dataGoMatch && /data\.go\.kr/i.test(listUrl)) {
    return normalizeOriginalUrl(
      makeUrl(new URL("/bbs/ntc/selectNotice.do", listUrl).toString(), {
        originId: dataGoMatch[1],
        atchFileId: dataGoMatch[2]
      })
    );
  }
  if (/^javascript:/i.test(href)) return normalizeOriginalUrl(listUrl);
  return normalizeOriginalUrl(new URL(href, listUrl).toString());
}

async function fetchModsRoute(logs: CollectionLog[], route: BoardRoute): Promise<CollectedItem[]> {
  const items: CollectedItem[] = [];
  for (let page = 1; page <= (route.maxPages || maxPages); page += 1) {
    const pageUrl = withPage(route.url, page);
    const html = await fetchText(pageUrl);
    const rows = parseModsRows(html, pageUrl, route);
    items.push(...rows);
    if (rows.length === 0 && pageHasOnlyOlderDates(html)) break;
  }
  const unique = mergeItems([], items);
  addLog(logs, route.source, "ok", "국가데이터처 게시판 HTML 수집 완료", unique.length, route.url);
  return unique;
}

function parseModsRows(html: string, listUrl: string, route: BoardRoute): CollectedItem[] {
  const rows: CollectedItem[] = [];
  const pattern =
    /<a\b(?=[^>]*class=["'][^"']*board_link[^"']*["'])([^>]*)>([\s\S]*?)<\/a>([\s\S]*?)(?=<a\b[^>]*class=["'][^"']*board_link|<div class=["']board_pager|<\/form>)/gi;
  for (const match of html.matchAll(pattern)) {
    const attrs = match[1];
    const href = decodeHtml(attrs.match(/href=["']javascript:addSearchParam\('([^']+)'/i)?.[1] || "");
    if (!href) continue;
    const block = match[0];
    const title = cleanTitle(htmlToText(match[2]));
    const publishDate = normalizeDate(htmlToText(block.match(/<strong>게시일<\/strong>\s*<span>([^<]+)<\/span>/i)?.[1] || ""));
    if (!title || publishDate !== targetDate || !isRelevantDataText(`${title} ${route.source}`)) continue;
    const originalUrl = normalizeOriginalUrl(new URL(href.replace(/&amp;/g, "&"), listUrl).toString());
    const attachmentUrls = collectAttachmentUrls(block, originalUrl);
    const rawText = compactText([route.source, title, htmlToText(block)].join(" "));
    rows.push(
      makeDataItem({
        source: route.source,
        source_type: route.sourceType,
        ministry: route.ministry,
        document_type: inferDocumentType(`${route.documentHint || ""} ${title}`),
        title,
        issue_number: extractIssueNumber(`${title} ${rawText}`),
        publish_date: publishDate,
        effective_date: null,
        change_type: inferChangeType(title),
        original_url: originalUrl,
        attachment_urls: attachmentUrls,
        raw_text: rawText,
        raw_hash: hashText(rawText),
        confidence: "official_notice",
        verification_required: false,
        source_record_id: href.match(/list_no=(\d+)/)?.[1] || null
      })
    );
  }
  return rows;
}

async function lawSearch(target: "law" | "admrul", extraParams: Record<string, string | number>): Promise<AnyRecord[]> {
  const oc = lawOpenApiOc();
  if (!oc) return [];
  const base = `${env("LAW_OPEN_API_BASE", "https://www.law.go.kr/DRF").replace(/\/$/, "")}/lawSearch.do`;
  const rows: AnyRecord[] = [];
  for (let page = 1; page <= Math.min(maxPages, 10); page += 1) {
    const payload = await fetchJsonOrXml(
      makeUrl(base, {
        OC: oc,
        target,
        type: "JSON",
        display: 100,
        page,
        ...extraParams
      })
    );
    const pageRows = findRecordRows(payload, ["법령명한글", "행정규칙명", "법령일련번호", "행정규칙일련번호"]);
    rows.push(...pageRows);
    const total = Number(text(flattenFirstObject(payload) || {}, ["totalCnt", "총건수"]));
    if (!pageRows.length || (Number.isFinite(total) && rows.length >= total)) break;
  }
  return rows;
}

async function lawService(target: "law" | "admrul", params: Record<string, string>): Promise<AnyRecord> {
  const oc = lawOpenApiOc();
  if (!oc) throw new Error("LAW_OPEN_API_OC, LAW_OC, or KOREAN_LAW_API_KEY is required");
  const payload = await fetchJsonOrXml(
    makeUrl(`${env("LAW_OPEN_API_BASE", "https://www.law.go.kr/DRF").replace(/\/$/, "")}/lawService.do`, {
      OC: oc,
      target,
      type: "JSON",
      ...params
    })
  );
  return isRecord(payload) ? payload : {};
}

function lawOpenApiOc(): string {
  return env("LAW_OPEN_API_OC") || env("LAW_OC") || env("KOREAN_LAW_API_KEY");
}

function makeDataItem(
  input: Omit<CollectedItem, "id" | "summary" | "diff_summary" | "auto_summary" | "collected_at"> &
    Partial<Pick<CollectedItem, "id" | "summary" | "diff_summary" | "auto_summary" | "collected_at">>
): CollectedItem {
  const title = input.title || "데이터 관련 수집 항목";
  const originalUrl = normalizeOriginalUrl(input.original_url || "");
  const id =
    input.id ||
    stableId(["data", input.source, input.source_record_id, title, input.issue_number, input.publish_date, originalUrl]);
  return {
    summary: null,
    diff_summary: null,
    auto_summary: false,
    collected_at: new Date().toISOString(),
    collection_date: targetDate,
    ...input,
    id,
    title,
    original_url: originalUrl,
    attachment_urls: uniqueStrings((input.attachment_urls || []).map(normalizeOriginalUrl)),
    raw_hash: input.raw_hash || hashText(input.raw_text),
    category: itemCategory(input)
  };
}

function normalizeForTargetDate(items: CollectedItem[]): CollectedItem[] {
  const normalized = items
    .map((item) => ({
      ...item,
      publish_date: normalizeDate(item.publish_date) || item.publish_date,
      collection_date: targetDate,
      category: itemCategory(item)
    }))
    .filter((item) => item.collection_date === targetDate || item.publish_date === targetDate);
  return dedupeBySourceTitleDate(normalized);
}

async function readDataItemsExcludingDate(date: string): Promise<CollectedItem[]> {
  const files = await fs.readdir(DATA_DAILY_DIR).catch(() => []);
  const items: CollectedItem[] = [];
  for (const file of files.filter((entry) => /^\d{4}-\d{2}-\d{2}\.json$/.test(entry) && entry !== `${date}.json`)) {
    const daily = await readJson<DailyCollection | null>(path.join(DATA_DAILY_DIR, file), null);
    if (daily?.items?.length) items.push(...daily.items);
  }
  if (items.length) return mergeItems([], items);
  const cumulative = await readJson<CollectedItem[]>(DATA_ITEMS_PATH, []);
  return cumulative.filter((item) => (item.collection_date || item.publish_date) !== date);
}

async function readPreviousSnapshot(date: string): Promise<CollectedItem[]> {
  const files = (await fs.readdir(DATA_SNAPSHOTS_DIR).catch(() => []))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file) && file < `${date}.json`)
    .sort();
  const previous = files.at(-1);
  return previous ? readJson<CollectedItem[]>(path.join(DATA_SNAPSHOTS_DIR, previous), []) : [];
}

function countChangedItems(previous: CollectedItem[], current: CollectedItem[]): number {
  const before = new Map(previous.map((item) => [item.id, item.raw_hash]));
  return current.filter((item) => before.get(item.id) !== item.raw_hash).length;
}

function mergeItems(existing: CollectedItem[], incoming: CollectedItem[]): CollectedItem[] {
  const map = new Map<string, CollectedItem>();
  for (const item of existing) map.set(item.id, item);
  for (const item of incoming) {
    const previous = map.get(item.id);
    map.set(item.id, {
      ...previous,
      ...item,
      summary: item.summary || previous?.summary || null,
      diff_summary: item.diff_summary || previous?.diff_summary || null,
      auto_summary: item.auto_summary || previous?.auto_summary || false,
      category: itemCategory(item)
    });
  }
  return [...map.values()].sort((a, b) => {
    const dateOrder = (b.collection_date || b.publish_date || "").localeCompare(a.collection_date || a.publish_date || "");
    if (dateOrder !== 0) return dateOrder;
    return a.title.localeCompare(b.title, "ko");
  });
}

function dedupeBySourceTitleDate(items: CollectedItem[]): CollectedItem[] {
  const seen = new Set<string>();
  const output: CollectedItem[] = [];
  for (const item of items) {
    const key = [item.source, comparableTitle(item.title), item.publish_date || item.collection_date || ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function comparableTitle(value: string): string {
  return cleanTitle(value)
    .replace(/\s+/g, "")
    .toLowerCase();
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
  const records: AnyRecord[] = [];
  walk(payload, (value) => {
    if (isRecord(value) && scoreRecord(value, keyHints) > 0) records.push(value);
  });
  return records;
}

function flattenFirstObject(value: unknown): AnyRecord | null {
  if (!isRecord(value)) return null;
  const output: AnyRecord = {};
  walk(value, (node) => {
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (!isRecord(child) && !Array.isArray(child) && output[key] === undefined) output[key] = child;
    }
  });
  return output;
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
  if (isRecord(value)) return Object.values(value).map(valueToString).join(" ");
  return "";
}

function walk(value: unknown, visitor: (value: unknown) => void): void {
  visitor(value);
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visitor);
  } else if (isRecord(value)) {
    for (const child of Object.values(value)) walk(child, visitor);
  }
}

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeKey(value: string): string {
  return value.replace(/[\s_./:-]/g, "").toLowerCase();
}

function recordHasTargetDate(row: AnyRecord, keys: string[]): boolean {
  return keys.some((key) => normalizeDate(text(row, [key])) === targetDate);
}

function dottedDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}.${Number(month)}.${Number(day)}.`;
}

function withPage(url: string, page: number): string {
  try {
    const parsed = new URL(url);
    if (page > 1 || parsed.searchParams.has("pageIndex")) parsed.searchParams.set("pageIndex", String(page));
    if (parsed.searchParams.has("pageNo")) parsed.searchParams.set("pageNo", String(page));
    if (parsed.searchParams.has("nPage")) parsed.searchParams.set("nPage", String(page));
    return parsed.toString();
  } catch {
    return url;
  }
}

function cleanTitle(value: string): string {
  return compactText(value)
    .replace(/(?:-->\s*)+/g, "")
    .replace(/^새글\s*/g, "")
    .replace(/^제목\s*/g, "")
    .replace(/^[:：]\s*/g, "")
    .replace(/\s*파일첨부\s*$/g, "")
    .replace(/\s*게시일\s*(?:19|20)\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}[\s\S]*$/g, "")
    .replace(/\s*(?:hwp|hwpx|pdf|docx?|xlsx?|zip)파일[\s\S]*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToText(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&middot;/g, "·")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function surroundingText(value: string, index: number, radius: number): string {
  return value.slice(Math.max(0, index - radius), Math.min(value.length, index + radius));
}

function enclosingTagBlock(html: string, index: number, tagName: string): string | null {
  const tag = tagName.replace(/[^\w:-]/g, "");
  if (!tag) return null;
  const openPattern = new RegExp(`<${tag}\\b`, "gi");
  let start = -1;
  for (const match of html.matchAll(openPattern)) {
    const matchIndex = match.index || 0;
    if (matchIndex > index) break;
    start = matchIndex;
  }
  if (start < 0) return null;
  const close = html.toLowerCase().indexOf(`</${tag.toLowerCase()}>`, index);
  if (close < 0) return null;
  return html.slice(start, close + tag.length + 3);
}

function isRelevantDataText(value: string): boolean {
  const normalized = compactText(value).toLowerCase();
  return DATA_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function pageHasOnlyOlderDates(html: string): boolean {
  const dates = extractDateStrings(htmlToText(html));
  return dates.length > 0 && dates.every((date) => date < targetDate);
}

function extractDateStrings(value: string): string[] {
  return [...value.matchAll(/((?:19|20)\d{2})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/g)]
    .map((match) => normalizeDate(match[0]))
    .filter((date): date is string => Boolean(date));
}

function containsDateText(value: string, date: string): boolean {
  const [year, month, day] = date.split("-");
  const monthNumber = String(Number(month));
  const dayNumber = String(Number(day));
  return [
    date,
    `${year}.${month}.${day}`,
    `${year}.${monthNumber}.${dayNumber}`,
    `${year}/${month}/${day}`,
    `${year}/${monthNumber}/${dayNumber}`,
    `${year}-${monthNumber}-${dayNumber}`
  ].some((variant) => value.includes(variant));
}

function findLabelDate(value: string, labels: string[]): string {
  for (const label of labels) {
    const pattern = new RegExp(`${escapeRegExp(label)}\\s*[:：]?\\s*((?:19|20)\\d{2}[.\\-/년\\s]*\\d{1,2}[.\\-/월\\s]*\\d{1,2})`);
    const match = value.match(pattern);
    if (match) return match[1];
  }
  return "";
}

function findDateAfterLabel(value: string, labels: string[]): string {
  for (const label of labels) {
    const index = value.indexOf(label);
    if (index === -1) continue;
    const nearby = value.slice(index + label.length, index + label.length + 160);
    const match = nearby.match(/(?:19|20)\d{2}\s*[.년/-]\s*\d{1,2}\s*[.월/-]\s*\d{1,2}\s*\.?/);
    const date = match ? normalizeDate(match[0]) : null;
    if (date) return date;
  }
  return "";
}

function collectLinks(value: unknown): string[] {
  const links: string[] = [];
  walk(value, (node) => {
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      if (!/(링크|url|URL|파일|다운로드|file)/i.test(key)) continue;
      for (const candidate of asArray(child as string | string[])) {
        const raw = compactText(valueToString(candidate));
        if (/^https?:\/\//i.test(raw)) links.push(raw);
        else if (raw.includes("/")) links.push(new URL(raw, "https://www.law.go.kr").toString());
      }
    }
  });
  return uniqueStrings(links);
}

function collectAttachmentUrls(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(/href=["']([^"']*(?:download|Download|boardDownload|attach|file|File|\.hwp|\.hwpx|\.pdf|\.docx?|\.xlsx?|\.zip)[^"']*)["']/gi)) {
    try {
      urls.push(normalizeOriginalUrl(new URL(decodeHtml(match[1]), baseUrl).toString()));
    } catch {
      // Ignore malformed attachment hints.
    }
  }
  return uniqueStrings(urls);
}

function lawUrl(link: string): string {
  if (!link) return "";
  if (/^https?:\/\//i.test(link)) return normalizeOriginalUrl(link);
  return normalizeOriginalUrl(new URL(link.startsWith("/") ? link : `/${link}`, "https://www.law.go.kr").toString());
}

function normalizeOriginalUrl(value: string): string {
  const cleaned = decodeHtml(value || "").replace(/;jsessionid=[^/?#]+/gi, "");
  try {
    const parsed = new URL(cleaned);
    stripSensitiveQueryParams(parsed);
    return parsed.toString();
  } catch {
    return cleaned;
  }
}

function stripSensitiveQueryParams(url: URL): void {
  const sensitive = new Set(["oc", "servicekey", "api_key", "apikey", "client_id", "clientid", "client_secret"]);
  for (const key of [...url.searchParams.keys()]) {
    if (sensitive.has(key.toLowerCase())) url.searchParams.delete(key);
  }
}

function inferMinistryFromText(value: string): string {
  const ministries = [
    "과학기술정보통신부",
    "행정안전부",
    "국가데이터처",
    "한국데이터산업진흥원",
    "한국지능정보사회진흥원",
    "법제처",
    "기획재정부"
  ];
  return ministries.find((ministry) => value.includes(ministry)) || "미상";
}

function extractIssueNumber(value: string): string | null {
  return value.match(/(?:제\s*)?\d{4}\s*[-–]\s*\d+호|제\s*\d+호/)?.[0]?.replace(/\s+/g, " ") || null;
}

function isLikelyBoardTitle(title: string, href: string): boolean {
  if (title.length < 4 || title.length > 220) return false;
  if (/^(#|javascript:;?$)/i.test(href.trim())) return false;
  if (/^(처음|이전|다음|마지막|목록|검색|다운로드|더보기|홈으로|RSS)$/i.test(title)) return false;
  if (/\.(?:hwp|hwpx|pdf|docx?|xlsx?|zip)(?:$|[?#])/i.test(href)) return false;
  return true;
}

function tagLogs(logs: CollectionLog[], startIndex: number, group: string, route: string): void {
  for (const log of logs.slice(startIndex)) {
    if (!log.group) log.group = group;
    if (!log.route) log.route = route;
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
