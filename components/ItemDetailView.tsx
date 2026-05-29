import Link from "next/link";
import DetailAiSummaryButton from "@/components/DetailAiSummaryButton";
import { categoryLabels, itemCategory } from "@/lib/categories";
import { changeTypeLabels, confidenceLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import type { CollectedItem } from "@/lib/types";

interface Props {
  item: CollectedItem;
  backHref: string;
  backLabel?: string;
}

interface ReadableSection {
  title: string;
  lines: string[];
}

const sectionHeadings = new Set([
  "최근 연혁",
  "전체 연혁",
  "변경 조문",
  "개정문",
  "제개정 이유",
  "법령 본문",
  "본문",
  "수집 본문",
  "추가 근거",
  "첨부"
]);

export default function ItemDetailView({ item, backHref, backLabel = "목록으로" }: Props) {
  const category = item.category || itemCategory(item);
  const readableSections = buildReadableSections(item.raw_text);
  const aiInput = buildAiInput(item, readableSections);
  const inlineImageUrls = item.attachment_urls.filter(isLikelyInlineImageUrl);
  const fileUrls = item.attachment_urls.filter((url) => !inlineImageUrls.includes(url));
  const sourceDate = item.collection_date || item.publish_date || "-";
  const keyFacts = [
    { label: "기관", value: item.ministry },
    { label: "기준일", value: sourceDate },
    { label: "공포/게시일", value: item.publish_date || "-" },
    { label: "시행일", value: item.effective_date || "-" },
    { label: "문서번호", value: item.issue_number || "-" },
    { label: "출처", value: item.source }
  ];

  return (
    <main className="page-shell detail-shell">
      <Link className="back-link" href={backHref}>
        {backLabel}
      </Link>

      <article className="detail-panel">
        <header className={`detail-hero category-${category}`}>
          <div className="detail-hero-top">
            <div className="item-meta">
              <span>{categoryLabels[category]}</span>
              <span>{sourceTypeLabels[item.source_type]}</span>
              <span>{documentTypeLabels[item.document_type]}</span>
              <span>{changeTypeLabels[item.change_type]}</span>
              <span>{confidenceLabels[item.confidence]}</span>
              {item.verification_required ? <span className="warn">확인 필요</span> : null}
            </div>
          </div>
          <h1>{item.title}</h1>
          <p className="detail-lead">
            자동 수집된 변경 자료입니다. 핵심 정보와 수집 본문을 먼저 확인하고, 실제 적용 전에는 공식 원문을 함께 확인하세요.
          </p>
          <div className="detail-actions">
            <a className="detail-action-button primary" href={item.original_url} target="_blank" rel="noreferrer">
              원문 열기
            </a>
          </div>
        </header>

        <section className="detail-snapshot" aria-label="기본 정보">
          {keyFacts.map((fact) => (
            <div key={fact.label}>
              <span>{fact.label}</span>
              <strong>{fact.value}</strong>
            </div>
          ))}
        </section>

        <section className="detail-content-card full">
          <div className="detail-section-title">
            <h2>수집 본문</h2>
            <DetailAiSummaryButton
              title={item.title}
              ministry={item.ministry}
              source={item.source}
              publishDate={item.publish_date}
              effectiveDate={item.effective_date}
              readableText={aiInput}
            />
          </div>
          {readableSections.length ? (
            <div className="readable-section-list">
              {readableSections.map((section, index) => (
                <section className="readable-section" key={`${section.title}-${index}`}>
                  <h3>{section.title}</h3>
                  <div className="readable-body">{sectionToDisplayText(section)}</div>
                </section>
              ))}
            </div>
          ) : (
            <p className="detail-empty">
              이 항목은 화면에 표시할 수 있는 본문을 충분히 확보하지 못했습니다. 공식 원문을 열어 확인하세요.
            </p>
          )}
        </section>

        {inlineImageUrls.length ? (
          <section className="detail-content-card full">
            <div className="detail-section-title">
              <h2>원문 이미지</h2>
            </div>
            <div className="source-image-list">
              {inlineImageUrls.map((url) => (
                <figure className="source-image" key={url}>
                  <img src={url} alt="법제처 원문 이미지" loading="lazy" />
                  <figcaption>
                    <a href={url} target="_blank" rel="noreferrer">
                      이미지 원문 열기
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        {fileUrls.length ? (
          <section className="detail-content-card full">
            <div className="detail-section-title">
              <h2>첨부 파일</h2>
            </div>
            <ul className="link-list">
              {fileUrls.map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>
    </main>
  );
}

function buildReadableSections(rawText: string): ReadableSection[] {
  const jsonSections = tryBuildJsonSections(rawText);
  if (jsonSections.length) return jsonSections;

  const lines = cleanupRawText(rawText)
    .split(/\r?\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const sections: ReadableSection[] = [];
  let current: ReadableSection = { title: "수집 본문", lines: [] };

  for (const line of lines) {
    const heading = normalizeHeading(line);
    if (heading === "원자료 JSON") break;
    if (sectionHeadings.has(heading)) {
      pushSection(sections, current);
      current = { title: heading, lines: [] };
      continue;
    }
    if (isTechnicalLine(line)) continue;
    current.lines.push(line);
  }

  pushSection(sections, current);
  return preferContentSections(mergeDuplicateSections(sections));
}

function cleanupRawText(value: string): string {
  const withoutJsonBlock = value.split(/\r?\n원자료 JSON\b/)[0];
  return withoutJsonBlock
    .replace(/\\n/g, "\n")
    .replace(/([가-힣)])n(?=공포\s+\d{4}-\d{2}-\d{2})/g, "$1\n")
    .replace(/\s+---\s*추가 근거\s*---\s+/g, "\n추가 근거\n")
    .replace(/\n\s*[\[{][\s\S]*$/m, "");
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeHeading(line: string): string {
  return line.replace(/^---\s*/, "").replace(/\s*---$/, "").trim();
}

function isTechnicalLine(line: string): boolean {
  if (/^(법령 변경이력 갱신|조문 개정 이력)$/.test(line)) return true;
  if (/^(수집 기준일|법령ID|연혁 행 수|원자료 행 수|조문 변경 수):/.test(line)) return true;
  if (/^원자료\s*JSON/.test(line)) return true;
  if (/^[\[{]/.test(line) && /["{}[\]:]/.test(line)) return true;
  if (line.includes('":') && (line.includes("{") || line.includes("["))) return true;
  return false;
}

function pushSection(sections: ReadableSection[], section: ReadableSection) {
  const lines = uniqueLines(section.lines);
  if (!lines.length) return;
  sections.push({ ...section, lines });
}

function mergeDuplicateSections(sections: ReadableSection[]): ReadableSection[] {
  const byTitle = new Map<string, ReadableSection>();
  for (const section of sections) {
    const existing = byTitle.get(section.title);
    if (!existing) {
      byTitle.set(section.title, section);
      continue;
    }
    existing.lines = uniqueLines([...existing.lines, ...section.lines]);
  }
  return [...byTitle.values()];
}

function preferContentSections(sections: ReadableSection[]): ReadableSection[] {
  const contentTitles = new Set(["개정문", "제개정 이유", "법령 본문", "본문", "변경 조문", "추가 근거", "첨부"]);
  const hasOfficialBody = sections.some((section) => ["개정문", "제개정 이유", "법령 본문", "본문"].includes(section.title));
  if (!hasOfficialBody) return sections;
  return sections.filter((section) => contentTitles.has(section.title));
}

function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
}

function sectionToDisplayText(section: ReadableSection): string {
  const paragraphs: string[] = [];
  let current = "";

  for (const line of section.lines) {
    const cleaned = line.trim();
    if (!cleaned || /^첨부 이미지:/.test(cleaned)) continue;
    if (startsNewParagraph(cleaned) && current) {
      paragraphs.push(current);
      current = "";
    }
    current = current ? `${current} ${cleaned}` : cleaned;
    if (isStandaloneParagraph(cleaned)) {
      paragraphs.push(current);
      current = "";
    }
  }

  if (current) paragraphs.push(current);
  return paragraphs.join("\n\n");
}

function startsNewParagraph(line: string): boolean {
  return /^부칙$/.test(line) || /^제\d+조(?:의\d+)?\(/.test(line) || /^◇\s*/.test(line);
}

function isStandaloneParagraph(line: string): boolean {
  return /^부칙$/.test(line);
}

function isLikelyInlineImageUrl(url: string): boolean {
  return /\.(?:png|jpe?g|gif|webp|svg)(?:[?#]|$)/i.test(url) || /\/flDownload\.do\?flSeq=/i.test(url);
}

function tryBuildJsonSections(rawText: string): ReadableSection[] {
  const trimmed = rawText.trim();
  if (!trimmed || !/^[\[{]/.test(trimmed)) return [];
  try {
    const payload = JSON.parse(trimmed) as unknown;
    const lines = flattenUsefulJson(payload).slice(0, 120);
    return lines.length ? [{ title: "수집 본문", lines }] : [];
  } catch {
    return [];
  }
}

function flattenUsefulJson(value: unknown, prefix = ""): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenUsefulJson(entry, prefix || `항목 ${index + 1}`));
  }
  if (typeof value !== "object") {
    return prefix ? [`${prefix}: ${String(value)}`] : [String(value)];
  }

  const output: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!isUsefulJsonKey(key)) continue;
    const label = prefix ? `${prefix} / ${key}` : key;
    if (typeof child === "object" && child !== null) output.push(...flattenUsefulJson(child, label));
    else if (child !== undefined && child !== null && String(child).trim()) output.push(`${label}: ${String(child).trim()}`);
  }
  return uniqueLines(output);
}

function isUsefulJsonKey(key: string): boolean {
  return /(제목|내용|기관|부처|번호|일자|날짜|구분|본문|공포|시행|링크|url|pdf|title|date|link|body|description|name|subject)/i.test(
    key
  );
}

function buildAiInput(item: CollectedItem, sections: ReadableSection[]): string {
  const sectionText = sections.map((section) => `${section.title}\n${sectionToDisplayText(section)}`).join("\n\n");
  const itemJson = {
    id: item.id,
    source: item.source,
    source_type: sourceTypeLabels[item.source_type],
    category: categoryLabels[item.category || itemCategory(item)],
    ministry: item.ministry,
    document_type: documentTypeLabels[item.document_type],
    change_type: changeTypeLabels[item.change_type],
    confidence: confidenceLabels[item.confidence],
    verification_required: Boolean(item.verification_required),
    title: item.title,
    issue_number: item.issue_number,
    publish_date: item.publish_date,
    effective_date: item.effective_date,
    collection_date: item.collection_date,
    collected_at: item.collected_at,
    source_record_id: item.source_record_id,
    original_url: item.original_url,
    attachment_urls: item.attachment_urls,
    existing_summary: item.summary,
    diff_summary: item.diff_summary,
    raw_hash: item.raw_hash
  };

  return [
    "ITEM_JSON",
    JSON.stringify(itemJson, null, 2),
    "",
    "URLS",
    `원문 URL: ${item.original_url}`,
    item.attachment_urls.length ? `첨부 URL:\n${item.attachment_urls.join("\n")}` : "첨부 URL: 없음",
    "",
    "READABLE_TEXT",
    sectionText || "화면 표시용 수집 본문 없음",
    "",
    "RAW_COLLECTED_TEXT",
    compactForAi(item.raw_text, 24000),
    "",
    "주의: URL은 제공된 링크이며, AI가 직접 열람한 원문으로 간주하지 마세요."
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 32000);
}

function compactForAi(value: string, maxLength: number): string {
  const compacted = value
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (compacted.length <= maxLength) return compacted;
  return `${compacted.slice(0, maxLength)}\n...[${(compacted.length - maxLength).toLocaleString("ko-KR")}자 더 있음]`;
}
