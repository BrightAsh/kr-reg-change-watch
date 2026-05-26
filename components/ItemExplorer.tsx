"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { categoryLabels, itemCategory } from "@/lib/categories";
import { changeTypeLabels, confidenceLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import type {
  ChangeType,
  CollectedItem,
  CollectionLog,
  DocumentType,
  RegulatoryCategory,
  RunMetadata,
  SourceType
} from "@/lib/types";

interface Props {
  items: CollectedItem[];
  ministries: string[];
  dates: string[];
  logs: CollectionLog[];
  run?: RunMetadata;
  detailHrefPrefix?: string;
}

type CategoryFilter = "all" | RegulatoryCategory;

const sourceTypes = Object.keys(sourceTypeLabels) as SourceType[];
const documentTypes = Object.keys(documentTypeLabels) as DocumentType[];
const changeTypes = Object.keys(changeTypeLabels) as ChangeType[];
const categoryFilters: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "law", label: categoryLabels.law },
  { value: "notice", label: categoryLabels.notice },
  { value: "guideline", label: categoryLabels.guideline },
  { value: "news", label: categoryLabels.news }
];

export default function ItemExplorer({
  items,
  ministries,
  dates,
  logs,
  run,
  detailHrefPrefix = "/items"
}: Props) {
  const [query, setQuery] = useState("");
  const [ministry, setMinistry] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [changeType, setChangeType] = useState("");
  const [selectedDate, setSelectedDate] = useState(dates[0] || "");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [apiKey, setApiKey] = useState("");
  const [digest, setDigest] = useState("");
  const [summaryStatus, setSummaryStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [summaryError, setSummaryError] = useState("");

  useEffect(() => {
    setApiKey(sessionStorage.getItem("kr-reg-openai-key") || "");
  }, []);

  const enrichedItems = useMemo(
    () => items.map((item) => ({ ...item, category: itemCategory(item) })),
    [items]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return enrichedItems.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (ministry && item.ministry !== ministry) return false;
      if (sourceType && item.source_type !== sourceType) return false;
      if (documentType && item.document_type !== documentType) return false;
      if (changeType && item.change_type !== changeType) return false;
      if (selectedDate && item.publish_date !== selectedDate) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.raw_text, item.ministry, item.issue_number, item.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [category, changeType, documentType, enrichedItems, ministry, query, selectedDate, sourceType]);

  const counts = useMemo(() => {
    const byCategory: Record<CategoryFilter, number> = { all: enrichedItems.length, law: 0, notice: 0, guideline: 0, news: 0 };
    for (const item of enrichedItems) byCategory[item.category || itemCategory(item)] += 1;
    return byCategory;
  }, [enrichedItems]);

  const dateHasCache = !selectedDate || dates.includes(selectedDate);
  const selectedDateCount = selectedDate
    ? enrichedItems.filter((item) => item.publish_date === selectedDate).length
    : enrichedItems.length;

  function saveApiKey(value: string) {
    setApiKey(value);
    if (value) sessionStorage.setItem("kr-reg-openai-key", value);
    else sessionStorage.removeItem("kr-reg-openai-key");
  }

  async function summarizeVisible() {
    if (!apiKey || !filtered.length) return;
    setSummaryStatus("working");
    setSummaryError("");
    setDigest("");

    const evidence = filtered
      .slice(0, 20)
      .map((item, index) =>
        [
          `${index + 1}. ${item.title}`,
          `분류: ${categoryLabels[item.category || itemCategory(item)]}`,
          `기관: ${item.ministry}`,
          `공표일: ${item.publish_date || "-"}`,
          `출처: ${item.source}`,
          `요약/원문: ${item.summary || item.raw_text.slice(0, 500)}`
        ].join("\n")
      )
      .join("\n\n");

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5",
          max_output_tokens: 700,
          instructions:
            "한국 규제·법령 변경 모니터의 편집자처럼 요약하세요. 제공된 항목 안에서만 판단하고, 법령/고시/지침/뉴스를 구분해 한국어로 간결하게 정리하세요.",
          input: evidence
        })
      });
      if (!response.ok) throw new Error(`OpenAI API HTTP ${response.status}`);
      const payload = (await response.json()) as { output_text?: string; output?: unknown };
      const text = compactOutput(payload.output_text || extractOutputText(payload.output));
      setDigest(text || "요약 결과가 비어 있습니다.");
      setSummaryStatus("done");
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : String(error));
      setSummaryStatus("error");
    }
  }

  return (
    <>
      <section className="control-panel" aria-label="탐색 도구">
        <div className="date-bar" aria-label="날짜 선택">
          <button className={!selectedDate ? "active" : ""} type="button" onClick={() => setSelectedDate("")}>
            전체 날짜
          </button>
          {dates.slice(0, 8).map((value) => (
            <button
              className={selectedDate === value ? "active" : ""}
              key={value}
              type="button"
              onClick={() => setSelectedDate(value)}
            >
              {value}
            </button>
          ))}
          <input
            aria-label="날짜 직접 입력"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </div>

        <div className="category-tabs" aria-label="문서 분류">
          {categoryFilters.map((tab) => (
            <button
              className={category === tab.value ? "active" : ""}
              key={tab.value}
              type="button"
              onClick={() => setCategory(tab.value)}
            >
              <span>{tab.label}</span>
              <strong>{counts[tab.value].toLocaleString("ko-KR")}</strong>
            </button>
          ))}
        </div>

        <div className="filters" aria-label="필터와 검색">
          <label>
            <span>검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 본문, 기관, 문서번호"
            />
          </label>
          <label>
            <span>기관</span>
            <select value={ministry} onChange={(event) => setMinistry(event.target.value)}>
              <option value="">전체</option>
              {ministries.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>출처</span>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              <option value="">전체</option>
              {sourceTypes.map((value) => (
                <option key={value} value={value}>
                  {sourceTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>문서</span>
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              <option value="">전체</option>
              {documentTypes.map((value) => (
                <option key={value} value={value}>
                  {documentTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>변경</span>
            <select value={changeType} onChange={(event) => setChangeType(event.target.value)}>
              <option value="">전체</option>
              {changeTypes.map((value) => (
                <option key={value} value={value}>
                  {changeTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="summary-console">
          <div>
            <span>OpenAI API key</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => saveApiKey(event.target.value)}
              placeholder="sk-..."
            />
          </div>
          <button disabled={!apiKey || !filtered.length || summaryStatus === "working"} type="button" onClick={summarizeVisible}>
            {summaryStatus === "working" ? "요약 중" : "표시 항목 요약"}
          </button>
          {apiKey ? (
            <button className="secondary" type="button" onClick={() => saveApiKey("")}>
              키 지우기
            </button>
          ) : null}
        </div>
      </section>

      {digest || summaryError ? (
        <section className={`digest-panel ${summaryStatus === "error" ? "error" : ""}`}>
          <strong>{summaryStatus === "error" ? "요약 실패" : "AI 요약"}</strong>
          <p>{summaryStatus === "error" ? summaryError : digest}</p>
        </section>
      ) : null}

      <section className="results-header">
        <div>
          <strong>{filtered.length.toLocaleString("ko-KR")}건</strong>
          <span>{selectedDate ? `${selectedDate} 캐시 ${selectedDateCount.toLocaleString("ko-KR")}건` : "전체 누적 자료"}</span>
        </div>
        <span>
          {run?.cache_hit ? "캐시 사용" : "최근 수집"} · {run?.last_run_at ? new Date(run.last_run_at).toLocaleString("ko-KR") : "미실행"}
        </span>
      </section>

      <section className="item-list" aria-label="변경 목록">
        {filtered.length ? (
          filtered.map((item) => <ItemRow key={item.id} item={item} detailHrefPrefix={detailHrefPrefix} />)
        ) : (
          <div className="empty-state">
            <strong>{dateHasCache ? "표시할 항목이 없습니다." : "캐시된 자료가 없습니다."}</strong>
            <span>
              {dateHasCache
                ? "현재 조건에 맞는 수집 결과가 없습니다."
                : "GitHub Actions에서 해당 날짜를 수집하면 이 날짜가 목록에 나타납니다."}
            </span>
          </div>
        )}
      </section>

      <section className="logs-panel" aria-label="수집 로그">
        <h2>최근 수집 로그</h2>
        {logs.length ? (
          <ul>
            {logs.slice(0, 10).map((log, index) => (
              <li key={`${log.source}-${index}`}>
                <span className={`status-dot ${log.status}`} />
                <div>
                  <strong>{log.source}</strong>
                  <p>{log.message}</p>
                </div>
                <span>{log.count.toLocaleString("ko-KR")}건</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>아직 실행 로그가 없습니다.</p>
        )}
      </section>
    </>
  );
}

function ItemRow({ item, detailHrefPrefix }: { item: CollectedItem; detailHrefPrefix: string }) {
  const detailHref = `${detailHrefPrefix.replace(/\/$/, "")}/${encodeURIComponent(item.id)}`;
  const category = item.category || itemCategory(item);

  return (
    <article className={`item-card category-${category}`}>
      <div className="item-main">
        <div className="item-meta">
          <span>{categoryLabels[category]}</span>
          <span>{sourceTypeLabels[item.source_type]}</span>
          <span>{documentTypeLabels[item.document_type]}</span>
          <span>{changeTypeLabels[item.change_type]}</span>
          <span>{confidenceLabels[item.confidence]}</span>
          {item.auto_summary ? <span>자동요약</span> : null}
          {item.verification_required ? <span className="warn">검증 필요</span> : null}
        </div>
        <h2>
          <Link href={detailHref}>{item.title}</Link>
        </h2>
        <p>{item.summary || "요약 전입니다. 원문 링크와 메타데이터를 먼저 확인하세요."}</p>
        <div className="item-foot">
          <span>{item.ministry}</span>
          <span>{item.issue_number || "문서번호 없음"}</span>
          <span>공표 {item.publish_date || "-"}</span>
          <span>시행 {item.effective_date || "-"}</span>
        </div>
      </div>
      <div className="item-actions">
        <a href={item.original_url} target="_blank" rel="noreferrer">
          원문
        </a>
        <Link href={detailHref}>상세</Link>
      </div>
    </article>
  );
}

function extractOutputText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractOutputText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    return Object.values(record).map(extractOutputText).filter(Boolean).join(" ");
  }
  return "";
}

function compactOutput(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}
