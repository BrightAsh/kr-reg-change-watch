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

  const dateScopedItems = useMemo(
    () =>
      selectedDate
        ? enrichedItems.filter((item) => (item.collection_date || item.publish_date) === selectedDate)
        : enrichedItems,
    [enrichedItems, selectedDate]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dateScopedItems.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (ministry && item.ministry !== ministry) return false;
      if (sourceType && item.source_type !== sourceType) return false;
      if (documentType && item.document_type !== documentType) return false;
      if (changeType && item.change_type !== changeType) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.raw_text, item.ministry, item.issue_number, item.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [category, changeType, dateScopedItems, documentType, ministry, query, sourceType]);

  const counts = useMemo(() => {
    const byCategory: Record<CategoryFilter, number> = {
      all: dateScopedItems.length,
      law: 0,
      notice: 0,
      guideline: 0,
      news: 0
    };
    for (const item of dateScopedItems) byCategory[item.category || itemCategory(item)] += 1;
    return byCategory;
  }, [dateScopedItems]);

  const dateCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of enrichedItems) {
      const date = item.collection_date || item.publish_date;
      if (date) result.set(date, (result.get(date) || 0) + 1);
    }
    return result;
  }, [enrichedItems]);

  const dateHasCache = !selectedDate || dates.includes(selectedDate);
  const selectedDateCount = dateScopedItems.length;
  const filterCount = [query, ministry, sourceType, documentType, changeType, category !== "all" ? category : ""].filter(Boolean).length;

  function saveApiKey(value: string) {
    setApiKey(value);
    if (value) sessionStorage.setItem("kr-reg-openai-key", value);
    else sessionStorage.removeItem("kr-reg-openai-key");
  }

  function clearFilters() {
    setQuery("");
    setMinistry("");
    setSourceType("");
    setDocumentType("");
    setChangeType("");
    setCategory("all");
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
          `기준일: ${item.collection_date || item.publish_date || "-"}`,
          `공표일/발령일: ${item.publish_date || "-"}`,
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
    <section className="app-workspace" aria-label="규제 변경 탐색">
      <aside className="side-panel" aria-label="탐색 설정">
        <section className="side-section">
          <div className="section-title">
            <span>기준일</span>
            <strong>{selectedDate || "전체 기간"}</strong>
          </div>
          <button className={!selectedDate ? "date-chip active" : "date-chip"} type="button" onClick={() => setSelectedDate("")}>
            전체 기간
          </button>
          <div className="date-list" aria-label="저장된 날짜">
            {dates.map((date) => (
              <button
                className={selectedDate === date ? "active" : ""}
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
              >
                <span>{formatShortDate(date)}</span>
                <strong>{dateCounts.get(date) || 0}</strong>
              </button>
            ))}
          </div>
          <label className="field-label">
            <span>날짜 직접 선택</span>
            <input
              aria-label="날짜 직접 선택"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        </section>

        <section className="side-section">
          <div className="section-title">
            <span>필터</span>
            <strong>{filterCount ? `${filterCount}개 적용` : "기본 보기"}</strong>
          </div>
          <label className="field-label">
            <span>기관</span>
            <select value={ministry} onChange={(event) => setMinistry(event.target.value)}>
              <option value="">전체 기관</option>
              {ministries.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>출처</span>
            <select value={sourceType} onChange={(event) => setSourceType(event.target.value)}>
              <option value="">전체 출처</option>
              {sourceTypes.map((value) => (
                <option key={value} value={value}>
                  {sourceTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>문서</span>
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              <option value="">전체 문서</option>
              {documentTypes.map((value) => (
                <option key={value} value={value}>
                  {documentTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            <span>변경</span>
            <select value={changeType} onChange={(event) => setChangeType(event.target.value)}>
              <option value="">전체 변경</option>
              {changeTypes.map((value) => (
                <option key={value} value={value}>
                  {changeTypeLabels[value]}
                </option>
              ))}
            </select>
          </label>
          <button className="quiet-button" type="button" onClick={clearFilters}>
            필터 초기화
          </button>
        </section>

        <section className="side-section source-section">
          <div className="section-title">
            <span>출처 상태</span>
            <strong>{logs.length ? `${logs.length}개` : "대기"}</strong>
          </div>
          <ul className="source-list">
            {logs.slice(0, 8).map((log, index) => (
              <li key={`${log.source}-${index}`}>
                <span className={`status-dot ${log.status}`} />
                <div>
                  <strong>{log.source}</strong>
                  <small>{log.count.toLocaleString("ko-KR")}건</small>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <div className="content-stage">
        <section className="search-panel" aria-label="검색">
          <label className="search-field">
            <span>검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 본문, 기관, 문서번호 검색"
            />
          </label>
          <div className="scope-card">
            <span>{selectedDate ? `${formatDateLabel(selectedDate)} 자료` : "전체 누적 자료"}</span>
            <strong>{selectedDateCount.toLocaleString("ko-KR")}건</strong>
          </div>
        </section>

        <nav className="segment-tabs" aria-label="문서 분류">
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
        </nav>

        <section className="briefing-panel" aria-label="AI 브리핑">
          <div>
            <span>AI 브리핑</span>
            <strong>현재 화면의 항목을 짧게 정리합니다.</strong>
          </div>
          <label>
            <span>API 키</span>
            <input
              type="password"
              value={apiKey}
              onChange={(event) => saveApiKey(event.target.value)}
              placeholder="sk-..."
            />
          </label>
          <button disabled={!apiKey || !filtered.length || summaryStatus === "working"} type="button" onClick={summarizeVisible}>
            {summaryStatus === "working" ? "정리 중" : "브리핑 생성"}
          </button>
          {apiKey ? (
            <button className="text-button" type="button" onClick={() => saveApiKey("")}>
              키 삭제
            </button>
          ) : null}
        </section>

        {digest || summaryError ? (
          <section className={`digest-panel ${summaryStatus === "error" ? "error" : ""}`}>
            <strong>{summaryStatus === "error" ? "브리핑 실패" : "AI 브리핑"}</strong>
            <p>{summaryStatus === "error" ? summaryError : digest}</p>
          </section>
        ) : null}

        <section className="results-header">
          <div>
            <strong>{filtered.length.toLocaleString("ko-KR")}건</strong>
            <span>{dateHasCache ? "표시 중" : "저장 자료 없음"}</span>
          </div>
          <span>{run?.last_run_at ? `${formatDateTime(run.last_run_at)} 업데이트` : "업데이트 대기"}</span>
        </section>

        <section className="item-list" aria-label="변경 목록">
          {filtered.length ? (
            filtered.map((item) => <ItemRow key={item.id} item={item} detailHrefPrefix={detailHrefPrefix} />)
          ) : (
            <div className="empty-state">
              <strong>{dateHasCache ? "표시할 항목이 없습니다." : "저장된 자료가 없습니다."}</strong>
              <span>
                {dateHasCache ? "검색어나 필터를 조금 넓혀보세요." : "해당 날짜의 수집 자료가 준비되면 이곳에 표시됩니다."}
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function ItemRow({ item, detailHrefPrefix }: { item: CollectedItem; detailHrefPrefix: string }) {
  const detailHref = `${detailHrefPrefix.replace(/\/$/, "")}/${encodeURIComponent(item.id)}`;
  const category = item.category || itemCategory(item);
  const evidenceLines = extractEvidenceLines(item.raw_text).slice(0, 2);

  return (
    <article className={`item-card category-${category}`}>
      <div className="category-rail" aria-hidden="true" />
      <div className="item-main">
        <div className="item-meta">
          <span>{categoryLabels[category]}</span>
          <span>{documentTypeLabels[item.document_type]}</span>
          <span>{changeTypeLabels[item.change_type]}</span>
          <span>{confidenceLabels[item.confidence]}</span>
          {item.verification_required ? <span className="warn">확인 필요</span> : null}
        </div>
        <h2>
          <Link href={detailHref}>{item.title}</Link>
        </h2>
        <p>{item.summary || "요약 전입니다. 상세 화면에서 원문과 수집 근거를 확인할 수 있습니다."}</p>
        {evidenceLines.length ? (
          <ul className="item-evidence" aria-label="수집 근거">
            {evidenceLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        <div className="item-foot">
          <span>{item.ministry}</span>
          <span>{item.issue_number || "문서번호 없음"}</span>
          <span>기준 {item.collection_date || item.publish_date || "-"}</span>
          <span>시행 {item.effective_date || "-"}</span>
        </div>
      </div>
      <div className="item-links">
        <a href={item.original_url} target="_blank" rel="noreferrer">
          원문
        </a>
        <Link href={detailHref}>상세</Link>
      </div>
    </article>
  );
}

function formatShortDate(value: string): string {
  const [, month, day] = value.split("-");
  return `${Number(month)}.${Number(day)}`;
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
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
