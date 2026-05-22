import crypto from "node:crypto";
import type { ChangeType, DocumentType } from "./types";

export function compactText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashText(value: string): string {
  return crypto.createHash("sha256").update(value || "", "utf8").digest("hex");
}

export function stableId(parts: Array<string | number | null | undefined>): string {
  const key = parts.map((part) => String(part ?? "")).join("|");
  return crypto.createHash("sha1").update(key, "utf8").digest("hex").slice(0, 16);
}

export function ymd(date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

export function yyyymmdd(date: string): string {
  return date.replaceAll("-", "");
}

export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const raw = String(value).trim();
  const ymdMatch = raw.match(/((?:19|20)\d{2})[.\-/년\s]*(\d{1,2})[.\-/월\s]*(\d{1,2})/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, "0")}-${ymdMatch[3].padStart(2, "0")}`;
  }
  const compactMatch = raw.replace(/[^\d]/g, "").match(/((?:19|20)\d{2})(\d{2})(\d{2})/);
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return ymd(new Date(parsed));
  return null;
}

export function inferChangeType(value: unknown): ChangeType {
  const text = compactText(value);
  if (/폐지|폐기/.test(text)) return "abolished";
  if (/전부개정|전문개정|전면개정/.test(text)) return "full_revision";
  if (/일부개정|부분개정|개정/.test(text)) return "partial_revision";
  if (/제정|신규|신설/.test(text)) return "new";
  if (/예고|공고|입법예고|행정예고/.test(text)) return "notice";
  return "unknown";
}

export function inferDocumentType(value: unknown): DocumentType {
  const text = compactText(value);
  if (/대통령령|시행령/.test(text)) return "decree";
  if (/총리령|부령|시행규칙|조례|규칙/.test(text)) return "ordinance";
  if (/훈령/.test(text)) return "directive";
  if (/예규/.test(text)) return "established_rule";
  if (/고시/.test(text)) return "notice";
  if (/지침/.test(text)) return "guideline";
  if (/공고|예고/.test(text)) return "announcement";
  if (/뉴스|보도/.test(text)) return "news";
  return "law";
}

export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as T;
}
