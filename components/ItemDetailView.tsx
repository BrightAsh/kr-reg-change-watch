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
  const summaryText = item.summary || "자동 요약이 아직 없습니다. 아래 수집 본문과 공식 원문을 확인하세요.";
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
            <DetailAiSummaryButton
              title={item.title}
              ministry={item.ministry}
              source={item.source}
              publishDate={item.publish_date}
              effectiveDate={item.effective_date}
              summary={summaryText}
              diffSummary={item.diff_summary}
              readableText={aiInput}
            />
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

        <div className="detail-content-grid">
          <section className="detail-content-card summary-card">
            <div className="detail-section-title">
              <h2>수집 요약</h2>
              <span>{item.auto_summary ? "AI 생성" : "자동 정리"}</span>
            </div>
            <p>{summaryText}</p>
          </section>

          <section className="detail-content-card">
            <div className="detail-section-title">
              <h2>확인 포인트</h2>
            </div>
            <ul className="impact-list">
              <li>
                <strong>변경 상태</strong>
                <span>{item.diff_summary || "이전 자료와의 세부 비교는 아직 생성되지 않았습니다."}</span>
              </li>
              <li>
                <strong>업무 적용</strong>
                <span>시행일과 원문을 기준으로 내부 절차, 제출 서식, 운영 기준 변경 여부를 확인하세요.</span>
              </li>
              <li>
                <strong>AI 요약</strong>
                <span>OpenAI API 키를 입력하면 이 항목만 별도로 요약할 수 있습니다.</span>
              </li>
            </ul>
          </section>
        </div>

        <section className="detail-content-card full">
          <div className="detail-section-title">
            <h2>수집 본문</h2>
            <span>사용자용 정리</span>
          </div>
          {readableSections.length ? (
            <div className="readable-section-list">
              {readableSections.map((section, index) => (
                <section className="readable-section" key={`${section.title}-${index}`}>
                  <h3>{section.title}</h3>
                  {section.lines.length > 1 ? (
                    <ul className="readable-lines">
                      {section.lines.map((line, lineIndex) => (
                        <li key={`${line}-${lineIndex}`}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="readable-body">{section.lines[0]}</p>
                  )}
                </section>
              ))}
            </div>
          ) : (
            <p className="detail-empty">
              이 항목은 화면에 표시할 수 있는 본문을 충분히 확보하지 못했습니다. 공식 원문을 열어 확인하세요.
            </p>
          )}
        </section>

        {item.attachment_urls.length ? (
          <section className="detail-content-card full">
            <div className="detail-section-title">
              <h2>첨부 파일</h2>
            </div>
            <ul className="link-list">
              {item.attachment_urls.map((url) => (
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
  return mergeDuplicateSections(sections);
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

function uniqueLines(lines: string[]): string[] {
  return [...new Set(lines.map((line) => line.trim()).filter(Boolean))];
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
  const sectionText = sections.map((section) => `${section.title}\n${section.lines.join("\n")}`).join("\n\n");
  return [
    `제목: ${item.title}`,
    `기관: ${item.ministry}`,
    `분류: ${item.document_type} / ${item.change_type}`,
    `기준일: ${item.collection_date || item.publish_date || "-"}`,
    `공포/게시일: ${item.publish_date || "-"}`,
    `시행일: ${item.effective_date || "-"}`,
    `출처: ${item.source}`,
    item.summary ? `기존 요약: ${item.summary}` : "",
    item.diff_summary ? `변경 감지: ${item.diff_summary}` : "",
    sectionText ? `수집 본문\n${sectionText}` : ""
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 12000);
}
