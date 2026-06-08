import fs from "node:fs/promises";
import path from "node:path";
import type { CollectedItem, CollectionLog, DailyCollection, SourceType } from "../lib/types";
import { itemCategory } from "../lib/categories";
import { classifyPublicInstitutionSystemItem } from "../lib/publicInstitutionSystem";
import { compactText, hashText, inferChangeType, inferDocumentType, normalizeDate, stableId } from "../lib/text";
import {
  addLog,
  dailyDir,
  ensureDataDirs,
  fetchText,
  logsDir,
  parseArgs,
  readJson,
  rootDir,
  snapshotsDir,
  writeJson
} from "./common";

interface MotirRoute {
  source: string;
  defaultUrl: string;
  ministry: string;
  sourceType: SourceType;
  maxPages: number;
}

interface MotirCandidate {
  route: MotirRoute;
  recordId: string;
  sourceRecordId: string;
  title: string;
  publishDate: string;
  detailUrl: string;
  context: string;
}

const MOTIR_ROUTES: MotirRoute[] = [
  {
    source: "산업통상부 입법예고",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCLa1cb24c71",
    ministry: "산업통상부",
    sourceType: "legislation_notice",
    maxPages: 30
  },
  {
    source: "산업통상부 행정예고",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCLa6723dc7b",
    ministry: "산업통상부",
    sourceType: "legislation_notice",
    maxPages: 30
  },
  {
    source: "산업통상부 고시",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCL0c554f816",
    ministry: "산업통상부",
    sourceType: "ministry_board",
    maxPages: 30
  },
  {
    source: "산업통상부 공고",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCLc01b2801b",
    ministry: "산업통상부",
    sourceType: "legislation_notice",
    maxPages: 30
  },
  {
    source: "산업통상부 구.정통부고시",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCL6c89ac4d8",
    ministry: "산업통상부",
    sourceType: "ministry_board",
    maxPages: 30
  },
  {
    source: "산업통상부 구.재경부고시",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCL32ba1ce4a",
    ministry: "산업통상부",
    sourceType: "ministry_board",
    maxPages: 30
  },
  {
    source: "산업통상부 훈령",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCL825d20c7e",
    ministry: "산업통상부",
    sourceType: "ministry_board",
    maxPages: 30
  },
  {
    source: "산업통상부 예규",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCL520ce518e",
    ministry: "산업통상부",
    sourceType: "ministry_board",
    maxPages: 30
  },
  {
    source: "산업통상부 지침",
    defaultUrl: "https://www.motir.go.kr/kor/article/ATCL516d59376",
    ministry: "산업통상부",
    sourceType: "ministry_board",
    maxPages: 30
  }
];

async function main() {
  await ensureDataDirs();

  const args = parseArgs();
  const startDate = normalizeDate(args.start) || normalizeDate(args.date_range_start);
  const endDate = normalizeDate(args.end) || normalizeDate(args.date_range_end);
  if (!startDate || !endDate) throw new Error("Usage: tsx scripts/backfill-motir-range.ts --start YYYY-MM-DD --end YYYY-MM-DD");
  if (startDate > endDate) throw new Error(`Invalid date range: ${startDate} > ${endDate}`);

  const dates = dateRange(startDate, endDate);
  const itemsByDate = new Map<string, CollectedItem[]>();
  const logsByDate = new Map<string, CollectionLog[]>();
  for (const date of dates) {
    itemsByDate.set(date, []);
    logsByDate.set(date, []);
  }

  const allCollected: CollectedItem[] = [];
  for (const route of MOTIR_ROUTES) {
    const routeItems = await collectRoute(route, startDate, endDate);
    allCollected.push(...routeItems);
    for (const date of dates) {
      const dateItems = routeItems.filter((item) => item.publish_date === date);
      itemsByDate.get(date)?.push(...dateItems);
      addLog(
        logsByDate.get(date) as CollectionLog[],
        route.source,
        "ok",
        "산업통상부 게시판 HTML 범위 수집 완료",
        dateItems.length,
        route.defaultUrl
      );
    }
    console.log(`${route.source}: ${routeItems.length} item(s)`);
  }

  const totalChanged = await writeDailyCollections(dates, itemsByDate, logsByDate);
  const mergedItems = await rebuildItemsFromDaily();
  const allLogs = dates.flatMap((date) => logsByDate.get(date) || []);
  await writeJson(path.join(logsDir, "last-fetch.json"), allLogs);
  await writeJson(path.join(rootDir, "data", "run.json"), {
    last_run_at: new Date().toISOString(),
    last_target_date: endDate,
    item_count: mergedItems.length,
    changed_count: totalChanged,
    available_dates: await listDailyDates(),
    cache_hit: false,
    logs: allLogs
  });

  console.log(`MOTIR backfill complete. Collected ${allCollected.length} item(s), stored ${totalChanged} item(s).`);
}

async function collectRoute(route: MotirRoute, startDate: string, endDate: string): Promise<CollectedItem[]> {
  const candidates = new Map<string, MotirCandidate>();
  const articleCode = motirArticleCode(route.defaultUrl);
  if (!articleCode) throw new Error(`Cannot parse MOTIR article code: ${route.defaultUrl}`);

  for (let page = 1; page <= route.maxPages; page += 1) {
    const pageUrl = withPage(route.defaultUrl, page);
    const html = await fetchText(pageUrl);
    for (const candidate of extractCandidates(html, pageUrl, route, articleCode, startDate, endDate)) {
      candidates.set(candidate.sourceRecordId, candidate);
    }
    if (boardPageIsOlderThan(html, startDate)) break;
    if (!hasLikelyNextPage(html, page)) break;
  }

  const items: CollectedItem[] = [];
  for (const candidate of candidates.values()) {
    let detailHtml = "";
    try {
      detailHtml = await fetchText(candidate.detailUrl);
    } catch {
      detailHtml = "";
    }
    const item = makeMotirItem(candidate, detailHtml);
    if (item.publish_date && item.publish_date >= startDate && item.publish_date <= endDate) {
      items.push(item);
    }
  }
  return mergeItems([], items);
}

function extractCandidates(
  html: string,
  listUrl: string,
  route: MotirRoute,
  articleCode: string,
  startDate: string,
  endDate: string
): MotirCandidate[] {
  const rows = [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map((match) => ({
    html: match[0],
    index: match.index || 0
  }));
  const sourceRows = rows.length
    ? rows
    : [...html.matchAll(/<a\b[^>]*href=['"]javascript:article\.view\(['"][^'"]+['"]\);?['"][^>]*>[\s\S]*?<\/a>/gi)].map((match) => ({
        html: html.slice(Math.max(0, (match.index || 0) - 900), Math.min(html.length, (match.index || 0) + match[0].length + 1200)),
        index: match.index || 0
      }));

  const candidates: MotirCandidate[] = [];
  for (const row of sourceRows) {
    const link = row.html.match(/<a\b[^>]*href=['"]javascript:article\.view\(['"]([^'"]+)['"]\);?['"][^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;

    const recordId = link[1];
    const title = cleanTitle(htmlToText(link[2]));
    if (!title) continue;

    const dates = extractDateStrings(htmlToText(row.html));
    const publishDate = dates.find((date) => date >= startDate && date <= endDate) || dates.at(-1) || "";
    if (!publishDate || publishDate < startDate || publishDate > endDate) continue;

    const detailUrl = new URL(`/kor/article/${articleCode}/${encodeURIComponent(recordId)}/view`, listUrl).toString();
    candidates.push({
      route,
      recordId,
      sourceRecordId: `${articleCode}:${recordId}`,
      title,
      publishDate,
      detailUrl,
      context: compactText(row.html)
    });
  }
  return candidates;
}

function makeMotirItem(candidate: MotirCandidate, detailHtml: string): CollectedItem {
  const detailText = compactText(detailHtml || candidate.context);
  const publishDate =
    normalizeDate(findLabelDate(detailText, ["등록일", "작성일", "발령일자", "공고일", "시행일"])) ||
    candidate.publishDate;
  const rawText = compactText([candidate.title, detailText || candidate.context].join(" "));
  const issueNumber = extractIssueNumber(`${candidate.title} ${rawText}`);
  const originalUrl = normalizeOriginalUrl(candidate.detailUrl);
  const item: CollectedItem = {
    id: stableId([candidate.route.source, candidate.sourceRecordId, candidate.title, issueNumber, publishDate, originalUrl]),
    source: candidate.route.source,
    source_type: candidate.route.sourceType,
    ministry: candidate.route.ministry,
    document_type: inferDocumentType(`${candidate.route.source} ${candidate.title} ${rawText}`),
    title: candidate.title,
    issue_number: issueNumber,
    publish_date: publishDate,
    effective_date: normalizeDate(rawText.match(/시행[^\d]*(20\d{2}[./-]\d{1,2}[./-]\d{1,2})/)?.[1]),
    change_type: inferChangeType(`${candidate.title} ${rawText}`),
    original_url: originalUrl,
    attachment_urls: collectAttachmentUrls(detailHtml || candidate.context, originalUrl),
    raw_text: rawText,
    raw_hash: hashText(rawText),
    summary: null,
    diff_summary: null,
    confidence: "official_notice",
    verification_required: false,
    auto_summary: false,
    collection_date: publishDate,
    collected_at: new Date().toISOString(),
    source_record_id: candidate.sourceRecordId
  };
  item.category = itemCategory(item);
  item.public_system_matches = classifyPublicInstitutionSystemItem(item);
  return item;
}

async function writeDailyCollections(
  dates: string[],
  itemsByDate: Map<string, CollectedItem[]>,
  logsByDate: Map<string, CollectionLog[]>
): Promise<number> {
  let totalChanged = 0;
  for (const date of dates) {
    const incoming = mergeItems([], itemsByDate.get(date) || []);
    const dailyPath = path.join(dailyDir, `${date}.json`);
    const existingDaily = await readJson<DailyCollection | null>(dailyPath, null);
    const previousMotir = new Map((existingDaily?.items || []).filter(isMotirItem).map((item) => [item.original_url, item]));
    const preserved = (existingDaily?.items || []).filter((item) => !isMotirItem(item));
    const withPreservedSummaries = incoming.map((item) => {
      const previous = previousMotir.get(item.original_url);
      return previous
        ? {
            ...item,
            summary: previous.summary || item.summary,
            diff_summary: previous.diff_summary || item.diff_summary,
            auto_summary: previous.auto_summary || item.auto_summary
          }
        : item;
    });
    const scoped = mergeItems(preserved, withPreservedSummaries);
    const logs = [
      ...(existingDaily?.logs || []).filter((log) => !log.source.startsWith("산업통상부")),
      ...(logsByDate.get(date) || [])
    ];
    const daily: DailyCollection = {
      date,
      collected_at: new Date().toISOString(),
      item_count: scoped.length,
      changed_count: withPreservedSummaries.length,
      cache_hit: false,
      items: scoped,
      logs
    };
    await writeJson(dailyPath, daily);
    await writeJson(path.join(snapshotsDir, `${date}.json`), scoped);
    totalChanged += withPreservedSummaries.length;
    console.log(`${date}: ${withPreservedSummaries.length} MOTIR item(s), ${scoped.length} total item(s)`);
  }
  return totalChanged;
}

async function rebuildItemsFromDaily(): Promise<CollectedItem[]> {
  const files = (await fs.readdir(dailyDir).catch(() => []))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();
  const items: CollectedItem[] = [];
  for (const file of files) {
    const daily = await readJson<DailyCollection | null>(path.join(dailyDir, file), null);
    if (daily?.items?.length) items.push(...daily.items);
  }
  const merged = mergeItems([], items);
  await writeJson(path.join(rootDir, "data", "items.json"), merged);
  return merged;
}

function mergeItems(existing: CollectedItem[], incoming: CollectedItem[]): CollectedItem[] {
  const map = new Map<string, CollectedItem>();
  for (const item of existing) map.set(item.id, attachPublicSystemMatches({ ...item, category: itemCategory(item) }));
  for (const item of incoming) {
    const previous = map.get(item.id);
    const merged = previous
      ? {
          ...previous,
          ...item,
          summary: previous.summary || item.summary,
          diff_summary: previous.diff_summary || item.diff_summary,
          auto_summary: previous.auto_summary || item.auto_summary,
          public_system_matches: item.public_system_matches?.length ? item.public_system_matches : previous.public_system_matches
        }
      : item;
    map.set(item.id, attachPublicSystemMatches({ ...merged, category: itemCategory(merged) }));
  }
  return [...map.values()].sort((a, b) => {
    const dateOrder = (b.publish_date || "").localeCompare(a.publish_date || "");
    if (dateOrder !== 0) return dateOrder;
    return a.title.localeCompare(b.title, "ko");
  });
}

function attachPublicSystemMatches(item: CollectedItem): CollectedItem {
  return {
    ...item,
    public_system_matches: classifyPublicInstitutionSystemItem(item)
  };
}

function isMotirItem(item: CollectedItem): boolean {
  return item.source.startsWith("산업통상부") || item.original_url.includes("motir.go.kr");
}

async function listDailyDates(): Promise<string[]> {
  const files = await fs.readdir(dailyDir).catch(() => []);
  return files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .map((file) => file.replace(".json", ""))
    .sort((a, b) => b.localeCompare(a));
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function withPage(url: string, page: number): string {
  const parsed = new URL(url);
  if (page > 1 || parsed.searchParams.has("pageIndex")) parsed.searchParams.set("pageIndex", String(page));
  return parsed.toString();
}

function hasLikelyNextPage(html: string, page: number): boolean {
  const next = String(page + 1);
  return html.includes(`pageIndex=${next}`) || new RegExp(`>\\s*${next}\\s*<`).test(html);
}

function boardPageIsOlderThan(html: string, startDate: string): boolean {
  const tbody = html.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || html;
  const dates = extractDateStrings(htmlToText(tbody));
  return dates.length > 0 && dates.every((date) => date < startDate);
}

function motirArticleCode(url: string): string {
  return new URL(url).pathname.match(/\/kor\/article\/([^/?#]+)/i)?.[1] || "";
}

function cleanTitle(value: string): string {
  return value
    .replace(/\bN\b/g, " ")
    .replace(/새글|첨부파일|파일첨부/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    const found = normalizeDate(textValue.slice(index, index + 120));
    if (found) return found;
  }
  return normalizeDate(textValue.match(/20\d{2}[./-]\d{1,2}[./-]\d{1,2}/)?.[0]);
}

function extractDateStrings(value: string): string[] {
  const dates: string[] = [];
  for (const match of value.matchAll(/((?:19|20)?\d{2})[.\-/년\s]+(\d{1,2})[.\-/월\s]+(\d{1,2})/g)) {
    const year = normalizeYear(match[1]);
    dates.push(`${year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`);
  }
  return [...new Set(dates)];
}

function normalizeYear(value: string): string {
  if (value.length === 4) return value;
  const year = Number(value);
  return `${year >= 70 ? 1900 + year : 2000 + year}`;
}

function extractIssueNumber(value: string): string | null {
  return value.match(/(?:제\s*)?\d{4}\s*[-–]\s*\d+\s*호|(?:제\s*)?\d+\s*호/)?.[0]?.replace(/\s+/g, " ") || null;
}

function collectAttachmentUrls(html: string, baseUrl: string): string[] {
  const attachmentUrls: string[] = [];
  for (const match of html.matchAll(/href=["']([^"']*(?:\/attach\/down\/[^"']+|\.(?:hwp|hwpx|pdf|docx?|xlsx?|zip)[^"']*))["']/gi)) {
    try {
      attachmentUrls.push(normalizeOriginalUrl(new URL(decodeHtml(match[1]), baseUrl).toString()));
    } catch {
      // Ignore malformed attachment URLs in one-off backfill output.
    }
  }
  return [...new Set(attachmentUrls)];
}

function normalizeOriginalUrl(url: string): string {
  const cleaned = decodeHtml(url).replace(/;jsessionid=[^/?#]+/gi, "");
  const parsed = new URL(cleaned);
  for (const key of [...parsed.searchParams.keys()]) {
    if (["oc", "servicekey", "api_key", "apikey", "client_id", "clientid", "client_secret"].includes(key.toLowerCase())) {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
