import fs from "node:fs/promises";
import path from "node:path";
import tls from "node:tls";
import { categoryLabels, itemCategory } from "../lib/categories";
import { changeTypeLabels, confidenceLabels, documentTypeLabels, sourceTypeLabels } from "../lib/labels";
import { classifyPublicInstitutionSystemItem, publicInstitutionSystemGroups } from "../lib/publicInstitutionSystem";
import type {
  ChangeType,
  CollectedItem,
  DailyCollection,
  DocumentType,
  PublicInstitutionSystemMatch,
  RegulatoryCategory,
  RunMetadata,
  SourceType
} from "../lib/types";
import { dailyDir, env, loadDotEnv, parseArgs, readJson, rootDir } from "./common";

type WorkspaceMode = "all" | "public-system";
type CategoryFilter = "all" | RegulatoryCategory;

interface MailSubscription {
  email: string;
  mode?: WorkspaceMode;
  category?: CategoryFilter;
  categories?: RegulatoryCategory[] | string;
  systemGroup?: string;
  systemGroups?: string[] | string;
  filters?: {
    ministries?: string[] | string;
    sourceTypes?: SourceType[] | string;
    documentTypes?: DocumentType[] | string;
    changeTypes?: ChangeType[] | string;
    query?: string;
  };
  active?: boolean;
  subjectPrefix?: string;
}

interface NormalizedSubscription {
  email: string;
  mode: WorkspaceMode;
  categories: RegulatoryCategory[];
  systemGroups: string[];
  filters: {
    ministries: string[];
    sourceTypes: SourceType[];
    documentTypes: DocumentType[];
    changeTypes: ChangeType[];
    query: string;
  };
  subjectPrefix: string;
}

type EnrichedItem = CollectedItem & {
  category: RegulatoryCategory;
  public_system_matches: PublicInstitutionSystemMatch[];
};

const categoryOrder: RegulatoryCategory[] = ["law", "notice", "guideline", "news"];
const defaultSubjectPrefix = "[Reg Watch]";

async function main(): Promise<void> {
  loadDotEnv();
  const fromEmail = env("MAIL_FROM_EMAIL") || env("GMAIL_USER") || env("SMTP_USER");
  const appPassword = (env("GMAIL_APP_PASSWORD") || env("MAIL_APP_PASSWORD") || env("SMTP_PASSWORD")).replace(/\s+/g, "");
  if (!fromEmail || !appPassword) {
    console.log("Mail alert skipped: MAIL_FROM_EMAIL and GMAIL_APP_PASSWORD are not configured.");
    return;
  }

  const subscriptions = readSubscriptions();
  if (!subscriptions.length) {
    if (env("MAIL_REQUIRE_RECIPIENT") === "1") {
      throw new Error("Mail alert failed: no active subscriptions configured.");
    }
    console.log("Mail alert skipped: no active subscriptions configured.");
    return;
  }

  const args = parseArgs();
  const targetDate = await resolveTargetDate(typeof args.date === "string" ? args.date : "");
  const daily = await readJson<DailyCollection | null>(path.join(dailyDir, `${targetDate}.json`), null);
  if (!daily) {
    throw new Error(`No daily collection data found for ${targetDate}.`);
  }

  const fromName = env("MAIL_FROM_NAME", "Reg Watch");
  const baseUrl = env("MAIL_BASE_URL", "https://brightash.github.io/kr-reg-change-watch").replace(/\/$/, "");
  const maxItems = Math.max(1, Number(env("MAIL_MAX_ITEMS", "40")) || 40);
  const smtpHost = env("SMTP_HOST", "smtp.gmail.com");
  const smtpPort = Math.max(1, Number(env("SMTP_PORT", "465")) || 465);
  const dryRun = env("MAIL_DRY_RUN") === "1";
  const enrichedItems = daily.items.map(enrichItem);

  for (const subscription of subscriptions) {
    const filtered = filterItemsForSubscription(enrichedItems, subscription);
    const limited = filtered.slice(0, maxItems);
    const message = buildMailMessage({
      date: daily.date,
      subscription,
      items: filtered,
      includedItems: limited,
      maxItems,
      baseUrl
    });

    if (dryRun) {
      console.log(`Mail alert dry-run for ${maskEmail(subscription.email)}: ${filtered.length} matched item(s).`);
      continue;
    }

    await sendSmtpMail({
      host: smtpHost,
      port: smtpPort,
      username: fromEmail,
      password: appPassword,
      fromEmail,
      fromName,
      toEmail: subscription.email,
      subject: message.subject,
      text: message.text,
      html: message.html
    });
    console.log(`Mail alert sent to ${maskEmail(subscription.email)}: ${filtered.length} matched item(s).`);
  }
}

function readSubscriptions(): NormalizedSubscription[] {
  const rawSubscriptions = env("MAIL_SUBSCRIPTIONS_JSON");
  let subscriptions: MailSubscription[] = [];

  if (rawSubscriptions) {
    subscriptions = parseSubscriptionsJson(rawSubscriptions);
  }

  if (!subscriptions.length) {
    subscriptions = parseEmailList(env("MAIL_TO") || env("MAIL_RECIPIENT")).map((email) => ({ email }));
  }

  const overrideEmails = parseEmailList(env("MAIL_TO_OVERRIDE"));
  if (overrideEmails.length) {
    const base = subscriptions[0] || { email: "" };
    subscriptions = overrideEmails.map((email) => ({ ...base, email, active: true }));
  }

  const unsubscribed = new Set(parseEmailList(env("MAIL_UNSUBSCRIBE_EMAILS")).map((email) => email.toLowerCase()));
  return subscriptions
    .filter((subscription) => subscription.active !== false)
    .map(normalizeSubscription)
    .filter((subscription) => isEmail(subscription.email))
    .filter((subscription) => !unsubscribed.has(subscription.email.toLowerCase()));
}

function parseSubscriptionsJson(raw: string): MailSubscription[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`MAIL_SUBSCRIPTIONS_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry) => normalizeRawSubscriptionEntry(entry));
  }
  return normalizeRawSubscriptionEntry(parsed);
}

function normalizeRawSubscriptionEntry(entry: unknown): MailSubscription[] {
  if (typeof entry === "string") return parseEmailList(entry).map((email) => ({ email }));
  if (!entry || typeof entry !== "object") return [];
  const record = entry as MailSubscription;
  return [{ ...record, email: String(record.email || "").trim() }];
}

function normalizeSubscription(subscription: MailSubscription): NormalizedSubscription {
  const mode: WorkspaceMode = subscription.mode === "public-system" ? "public-system" : "all";
  return {
    email: subscription.email.trim(),
    mode,
    categories: mode === "all" ? readCategories(subscription) : [],
    systemGroups: mode === "public-system" ? readSystemGroups(subscription) : [],
    filters: {
      ministries: parseStringArray(subscription.filters?.ministries),
      sourceTypes: parseStringArray(subscription.filters?.sourceTypes).filter(isSourceType),
      documentTypes: parseStringArray(subscription.filters?.documentTypes).filter(isDocumentType),
      changeTypes: parseStringArray(subscription.filters?.changeTypes).filter(isChangeType),
      query: String(subscription.filters?.query || "").trim()
    },
    subjectPrefix: subscription.subjectPrefix?.trim() || defaultSubjectPrefix
  };
}

async function resolveTargetDate(cliDate: string): Promise<string> {
  if (isDateString(cliDate)) return cliDate;
  const mailTarget = env("MAIL_TARGET_DATE");
  if (isDateString(mailTarget)) return mailTarget;
  const target = env("TARGET_DATE");
  if (isDateString(target)) return target;

  const run = await readJson<RunMetadata | null>(path.join(rootDir, "data", "run.json"), null);
  const lastTargetDate = run?.last_target_date;
  if (isDateString(lastTargetDate)) return lastTargetDate;

  const files = await fs.readdir(dailyDir);
  const latest = files
    .map((file) => file.replace(/\.json$/, ""))
    .filter(isDateString)
    .sort((a, b) => b.localeCompare(a))[0];
  if (!latest) throw new Error("No target date was provided and no daily data files were found.");
  return latest;
}

function enrichItem(item: CollectedItem): EnrichedItem {
  return {
    ...item,
    category: item.category || itemCategory(item),
    public_system_matches: item.public_system_matches?.length
      ? item.public_system_matches
      : classifyPublicInstitutionSystemItem(item)
  };
}

function filterItemsForSubscription(items: EnrichedItem[], subscription: NormalizedSubscription): EnrichedItem[] {
  const normalizedQuery = subscription.filters.query.toLowerCase();
  return items.filter((item) => {
    if (subscription.mode === "public-system") {
      if (!item.public_system_matches.length) return false;
      if (
        subscription.systemGroups.length &&
        !item.public_system_matches.some((match) => subscription.systemGroups.includes(match.group_id))
      ) {
        return false;
      }
    } else if (subscription.categories.length && !subscription.categories.includes(item.category)) {
      return false;
    }

    if (subscription.filters.ministries.length && !subscription.filters.ministries.includes(item.ministry)) return false;
    if (subscription.filters.sourceTypes.length && !subscription.filters.sourceTypes.includes(item.source_type)) return false;
    if (subscription.filters.documentTypes.length && !subscription.filters.documentTypes.includes(item.document_type)) return false;
    if (subscription.filters.changeTypes.length && !subscription.filters.changeTypes.includes(item.change_type)) return false;
    if (!normalizedQuery) return true;

    return [
      item.title,
      item.summary,
      item.diff_summary,
      item.raw_text,
      item.ministry,
      item.issue_number,
      item.source
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function buildMailMessage({
  date,
  subscription,
  items,
  includedItems,
  maxItems,
  baseUrl
}: {
  date: string;
  subscription: NormalizedSubscription;
  items: EnrichedItem[];
  includedItems: EnrichedItem[];
  maxItems: number;
  baseUrl: string;
}): { subject: string; text: string; html: string } {
  const scopeLabel = buildScopeLabel(subscription);
  const subject = `${subscription.subjectPrefix} ${date} 규제 변경 ${items.length.toLocaleString("ko-KR")}건`;
  const omittedCount = Math.max(0, items.length - includedItems.length);
  const textLines = [
    `Reg Watch 일일 알림`,
    `날짜: ${date}`,
    `조건: ${scopeLabel}`,
    `매칭: ${items.length.toLocaleString("ko-KR")}건`,
    omittedCount ? `표시: 상위 ${maxItems.toLocaleString("ko-KR")}건, ${omittedCount.toLocaleString("ko-KR")}건 생략` : "",
    "",
    ...buildTextSections(subscription, includedItems, baseUrl),
    "",
    `수신 중지: 운영자에게 ${subscription.email} 주소의 알림 중지를 요청하세요.`
  ].filter((line) => line !== "");

  const html = [
    "<!doctype html>",
    '<html lang="ko">',
    '<body style="margin:0;background:#edf1f6;color:#101217;font-family:Arial,Apple SD Gothic Neo,Noto Sans KR,sans-serif;">',
    '<main style="max-width:760px;margin:0 auto;padding:24px;">',
    '<section style="border:1px solid #d8e0eb;border-radius:8px;background:#fff;padding:20px;">',
    `<p style="margin:0 0 7px;color:#0064d2;font-size:12px;font-weight:800;">Reg Watch 일일 알림</p>`,
    `<h1 style="margin:0 0 10px;font-size:24px;line-height:1.25;">${escapeHtml(date)} 규제 변경 ${items.length.toLocaleString("ko-KR")}건</h1>`,
    `<p style="margin:0 0 16px;color:#313845;line-height:1.6;">${escapeHtml(scopeLabel)}</p>`,
    omittedCount
      ? `<p style="margin:0 0 16px;color:#758091;font-size:13px;">상위 ${maxItems.toLocaleString("ko-KR")}건만 표시했습니다. 생략 ${omittedCount.toLocaleString("ko-KR")}건.</p>`
      : "",
    includedItems.length ? buildHtmlSections(subscription, includedItems, baseUrl) : buildEmptyHtml(),
    `<p style="margin:20px 0 0;color:#758091;font-size:12px;line-height:1.6;">수신 중지: 운영자에게 ${escapeHtml(subscription.email)} 주소의 알림 중지를 요청하세요.</p>`,
    "</section>",
    "</main>",
    "</body>",
    "</html>"
  ].join("");

  return { subject, text: textLines.join("\n"), html };
}

function buildTextSections(subscription: NormalizedSubscription, items: EnrichedItem[], baseUrl: string): string[] {
  if (!items.length) return ["조건에 맞는 자료가 없습니다."];
  return buildSections(subscription, items).flatMap((section) => [
    `[${section.label}]`,
    ...section.items.map((item, index) => {
      const detailUrl = `${baseUrl}/items/${encodeURIComponent(item.id)}/`;
      return [
        `${index + 1}. ${item.title}`,
        `   ${item.ministry} · ${documentTypeLabels[item.document_type]} · ${changeTypeLabels[item.change_type]} · ${confidenceLabels[item.confidence]}`,
        item.summary ? `   ${compactText(item.summary, 180)}` : "",
        `   상세: ${detailUrl}`,
        item.original_url ? `   원문: ${item.original_url}` : ""
      ]
        .filter(Boolean)
        .join("\n");
    }),
    ""
  ]);
}

function buildHtmlSections(subscription: NormalizedSubscription, items: EnrichedItem[], baseUrl: string): string {
  return buildSections(subscription, items)
    .map(
      (section) => `
        <section style="margin-top:18px;">
          <h2 style="margin:0 0 8px;font-size:16px;line-height:1.35;">${escapeHtml(section.label)}</h2>
          <div style="display:grid;gap:10px;">
            ${section.items.map((item) => buildHtmlItem(item, baseUrl)).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function buildHtmlItem(item: EnrichedItem, baseUrl: string): string {
  const detailUrl = `${baseUrl}/items/${encodeURIComponent(item.id)}/`;
  const meta = [
    item.ministry,
    documentTypeLabels[item.document_type],
    changeTypeLabels[item.change_type],
    confidenceLabels[item.confidence]
  ].join(" · ");
  const summary = compactText(item.summary || item.diff_summary || "상세 화면에서 원문과 수집 근거를 확인할 수 있습니다.", 360);
  return `
    <article style="border:1px solid #d8e0eb;border-radius:8px;background:#fbfcff;padding:14px;">
      <p style="margin:0 0 7px;color:#758091;font-size:12px;font-weight:800;">${escapeHtml(meta)}</p>
      <h3 style="margin:0 0 8px;font-size:16px;line-height:1.45;">${escapeHtml(item.title)}</h3>
      <p style="margin:0 0 10px;color:#313845;font-size:14px;line-height:1.65;">${escapeHtml(summary)}</p>
      <p style="margin:0;display:flex;gap:8px;flex-wrap:wrap;font-size:13px;font-weight:800;">
        <a href="${escapeAttribute(detailUrl)}" style="color:#0064d2;text-decoration:none;">상세</a>
        ${item.original_url ? `<a href="${escapeAttribute(item.original_url)}" style="color:#101217;text-decoration:none;">원문</a>` : ""}
      </p>
    </article>
  `;
}

function buildEmptyHtml(): string {
  return '<p style="margin:18px 0 0;color:#313845;line-height:1.65;">조건에 맞는 자료가 없습니다.</p>';
}

function buildSections(
  subscription: NormalizedSubscription,
  items: EnrichedItem[]
): Array<{ label: string; items: EnrichedItem[] }> {
  if (subscription.mode === "public-system") {
    if (subscription.systemGroups.length === 1) {
      const group = publicInstitutionSystemGroups.find((entry) => entry.id === subscription.systemGroups[0]);
      return [{ label: group?.title || "공공기관 9개 체계", items }];
    }

    const groups = subscription.systemGroups.length
      ? publicInstitutionSystemGroups.filter((group) => subscription.systemGroups.includes(group.id))
      : publicInstitutionSystemGroups;
    return groups
      .map((group) => ({
        label: `${group.order}. ${group.title}`,
        items: items.filter((item) => item.public_system_matches.some((match) => match.group_id === group.id))
      }))
      .filter((section) => section.items.length);
  }

  return categoryOrder
    .map((category) => ({
      label: categoryLabels[category],
      items: items.filter((item) => item.category === category)
    }))
    .filter((section) => section.items.length);
}

function buildScopeLabel(subscription: NormalizedSubscription): string {
  const base =
    subscription.mode === "public-system"
      ? !subscription.systemGroups.length
        ? "공공기관 운영 법령 및 정부지침 체계 9개 항목 전체"
        : subscription.systemGroups.length === 1
          ? publicInstitutionSystemGroups.find((group) => group.id === subscription.systemGroups[0])?.title || "공공기관 9개 체계"
          : `공공기관 9개 체계 ${subscription.systemGroups.length}개 항목`
      : !subscription.categories.length
        ? "전체 수집"
        : subscription.categories.length === 1
          ? categoryLabels[subscription.categories[0]]
          : subscription.categories.map((category) => categoryLabels[category]).join(", ");
  const extraFilters = [
    subscription.filters.ministries.length ? `기관 ${subscription.filters.ministries.length}개` : "",
    subscription.filters.sourceTypes.length ? `출처 ${subscription.filters.sourceTypes.length}개` : "",
    subscription.filters.documentTypes.length ? `문서 ${subscription.filters.documentTypes.length}개` : "",
    subscription.filters.changeTypes.length ? `변경 ${subscription.filters.changeTypes.length}개` : "",
    subscription.filters.query ? `검색어 "${subscription.filters.query}"` : ""
  ].filter(Boolean);
  return extraFilters.length ? `${base} · ${extraFilters.join(" · ")}` : base;
}

async function sendSmtpMail({
  host,
  port,
  username,
  password,
  fromEmail,
  fromName,
  toEmail,
  subject,
  text,
  html
}: {
  host: string;
  port: number;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const socket = await connectTls(host, port);
  const session = new SmtpSession(socket);
  try {
    await session.expect([220]);
    await session.command(`EHLO ${env("SMTP_EHLO_DOMAIN", "github-actions.local")}`, [250]);
    await session.command("AUTH LOGIN", [334]);
    await session.command(Buffer.from(username).toString("base64"), [334]);
    await session.command(Buffer.from(password).toString("base64"), [235]);
    await session.command(`MAIL FROM:<${fromEmail}>`, [250]);
    await session.command(`RCPT TO:<${toEmail}>`, [250, 251]);
    await session.command("DATA", [354]);
    await session.writeData(buildMimeMessage({ fromEmail, fromName, toEmail, subject, text, html }));
    await session.command("QUIT", [221]);
  } finally {
    socket.destroy();
  }
}

function connectTls(host: string, port: number): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host });
    socket.setEncoding("utf8");
    socket.once("secureConnect", () => resolve(socket));
    socket.once("error", reject);
  });
}

class SmtpSession {
  private buffer = "";
  private waiter: ((response: string) => void) | null = null;
  private failure: ((error: Error) => void) | null = null;

  constructor(private readonly socket: tls.TLSSocket) {
    socket.on("data", (chunk) => {
      this.buffer += String(chunk);
      this.flush();
    });
    socket.on("error", (error) => this.reject(error instanceof Error ? error : new Error(String(error))));
    socket.on("end", () => this.reject(new Error("SMTP connection ended unexpectedly.")));
  }

  async expect(codes: number[]): Promise<string> {
    const response = await this.read();
    assertSmtpResponse(response, codes);
    return response;
  }

  async command(line: string, codes: number[]): Promise<string> {
    this.socket.write(`${line}\r\n`);
    return this.expect(codes);
  }

  async writeData(message: string): Promise<string> {
    this.socket.write(`${dotStuff(message)}\r\n.\r\n`);
    return this.expect([250]);
  }

  private read(): Promise<string> {
    const existing = this.extractResponse();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      this.waiter = resolve;
      this.failure = reject;
    });
  }

  private flush(): void {
    if (!this.waiter) return;
    const response = this.extractResponse();
    if (!response) return;
    const resolve = this.waiter;
    this.waiter = null;
    this.failure = null;
    resolve(response);
  }

  private reject(error: Error): void {
    if (!this.failure) return;
    const reject = this.failure;
    this.waiter = null;
    this.failure = null;
    reject(error);
  }

  private extractResponse(): string | null {
    const lines = this.buffer.split("\r\n");
    if (lines.length < 2) return null;

    let consumedLength = 0;
    const responseLines: string[] = [];
    for (const line of lines.slice(0, -1)) {
      responseLines.push(line);
      consumedLength += line.length + 2;
      if (/^\d{3} /.test(line)) {
        this.buffer = this.buffer.slice(consumedLength);
        return responseLines.join("\n");
      }
    }
    return null;
  }
}

function buildMimeMessage({
  fromEmail,
  fromName,
  toEmail,
  subject,
  text,
  html
}: {
  fromEmail: string;
  fromName: string;
  toEmail: string;
  subject: string;
  text: string;
  html: string;
}): string {
  const boundary = `kr-reg-change-watch-${Date.now()}`;
  return [
    `From: ${encodeHeader(fromName)} <${fromEmail}>`,
    `To: <${toEmail}>`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`
  ].join("\r\n");
}

function assertSmtpResponse(response: string, codes: number[]): void {
  const code = Number(response.slice(0, 3));
  if (!codes.includes(code)) {
    throw new Error(`Unexpected SMTP response ${response.replace(/\r?\n/g, " | ")}`);
  }
}

function dotStuff(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function compactText(value: string, maxLength: number): string {
  const compacted = value.replace(/\s+/g, " ").trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength)}...`;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value: unknown): string {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function parseEmailList(value: string): string[] {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((entry) => String(entry).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/[\n,;|]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readCategories(subscription: MailSubscription): RegulatoryCategory[] {
  const values = parseStringArray(subscription.categories);
  if (values.length) return values.filter(isRegulatoryCategory);
  return isRegulatoryCategory(String(subscription.category || "")) ? [subscription.category as RegulatoryCategory] : [];
}

function readSystemGroups(subscription: MailSubscription): string[] {
  const values = parseStringArray(subscription.systemGroups);
  if (values.length) return values.filter(isSystemGroup);
  return isSystemGroup(String(subscription.systemGroup || "")) ? [String(subscription.systemGroup)] : [];
}

function isSourceType(value: string): value is SourceType {
  return value in sourceTypeLabels;
}

function isDocumentType(value: string): value is DocumentType {
  return value in documentTypeLabels;
}

function isChangeType(value: string): value is ChangeType {
  return value in changeTypeLabels;
}

function isRegulatoryCategory(value: string): value is RegulatoryCategory {
  return value === "law" || value === "notice" || value === "guideline" || value === "news";
}

function isSystemGroup(value: string): boolean {
  return publicInstitutionSystemGroups.some((group) => group.id === value);
}

function maskEmail(value: string): string {
  const [name, domain] = value.split("@");
  if (!domain) return "(invalid email)";
  return `${name.slice(0, 2)}***@${domain}`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
