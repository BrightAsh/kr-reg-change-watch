import Link from "next/link";
import { categoryLabels, itemCategory } from "@/lib/categories";
import { changeTypeLabels, confidenceLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import type { CollectedItem } from "@/lib/types";

interface Props {
  item: CollectedItem;
  backHref: string;
  backLabel?: string;
}

export default function ItemDetailView({ item, backHref, backLabel = "목록으로" }: Props) {
  const category = item.category || itemCategory(item);
  const evidenceLines = extractEvidenceLines(item.raw_text);

  return (
    <main className="page-shell detail-shell">
      <Link className="back-link" href={backHref}>
        {backLabel}
      </Link>

      <article className="detail-panel">
        <div className="item-meta">
          <span>{categoryLabels[category]}</span>
          <span>{sourceTypeLabels[item.source_type]}</span>
          <span>{documentTypeLabels[item.document_type]}</span>
          <span>{changeTypeLabels[item.change_type]}</span>
          <span>{confidenceLabels[item.confidence]}</span>
          {item.verification_required ? <span className="warn">검증 필요</span> : null}
        </div>

        <h1>{item.title}</h1>
        <dl className="detail-grid">
          <div>
            <dt>기관</dt>
            <dd>{item.ministry}</dd>
          </div>
          <div>
            <dt>문서번호</dt>
            <dd>{item.issue_number || "-"}</dd>
          </div>
          <div>
            <dt>수집 기준일</dt>
            <dd>{item.collection_date || item.publish_date || "-"}</dd>
          </div>
          <div>
            <dt>공표일</dt>
            <dd>{item.publish_date || "-"}</dd>
          </div>
          <div>
            <dt>시행일</dt>
            <dd>{item.effective_date || "-"}</dd>
          </div>
          <div>
            <dt>출처</dt>
            <dd>{item.source}</dd>
          </div>
          <div>
            <dt>원문</dt>
            <dd>
              <a href={item.original_url} target="_blank" rel="noreferrer">
                원문 열기
              </a>
            </dd>
          </div>
        </dl>

        <section className="detail-section">
          <h2>요약</h2>
          <p>{item.summary || "아직 요약이 생성되지 않았습니다. 원문을 우선 확인하세요."}</p>
          <p className="note">요약은 수집 데이터로 만든 참고 정보이며 원문을 대체하지 않습니다.</p>
        </section>

        {item.diff_summary ? (
          <section className="detail-section">
            <h2>변경 감지</h2>
            <p>{item.diff_summary}</p>
          </section>
        ) : null}

        {evidenceLines.length ? (
          <section className="detail-section">
            <h2>수집 근거</h2>
            <ul className="history-list">
              {evidenceLines.slice(0, 12).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {item.attachment_urls.length ? (
          <section className="detail-section">
            <h2>첨부</h2>
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

        <section className="detail-section">
          <h2>원문 추출 텍스트</h2>
          <pre className="raw-text">{item.raw_text || "원문 본문을 가져오지 못했습니다. 원문 링크를 확인하세요."}</pre>
        </section>
      </article>
    </main>
  );
}

function extractEvidenceLines(value: string): string[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return [
    ...extractSectionLines(lines, "최근 연혁").filter((line) => line.startsWith("공포 ")),
    ...extractSectionLines(lines, "변경 조문")
  ];
}

function extractSectionLines(lines: string[], heading: string): string[] {
  const start = lines.indexOf(heading);
  if (start === -1) return [];
  const output: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^(전체 연혁|원자료 JSON|첨부|최근 연혁|변경 조문)$/.test(line)) break;
    output.push(line);
  }
  return output;
}
