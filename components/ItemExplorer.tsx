"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { categoryLabels, itemCategory } from "@/lib/categories";
import { changeTypeLabels, confidenceLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import type {
  ChangeType,
  CollectedItem,
  DocumentType,
  RegulatoryCategory,
  SourceType
} from "@/lib/types";

interface Props {
  items: CollectedItem[];
  ministries: string[];
  dates: string[];
  detailHrefPrefix?: string;
}

type CategoryFilter = "all" | RegulatoryCategory;
type FilterKey = "ministry" | "source" | "document" | "change";

interface FilterOption {
  value: string;
  label: string;
}

const sourceTypes = Object.keys(sourceTypeLabels) as SourceType[];
const documentTypes = Object.keys(documentTypeLabels) as DocumentType[];
const changeTypes = Object.keys(changeTypeLabels) as ChangeType[];
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const categoryFilters: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "law", label: categoryLabels.law },
  { value: "notice", label: categoryLabels.notice },
  { value: "guideline", label: categoryLabels.guideline },
  { value: "news", label: categoryLabels.news }
];

const fixedHolidayMonthDays = new Set(["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"]);
const holidayOverrides = new Set([
  "2026-02-16",
  "2026-02-17",
  "2026-02-18",
  "2026-05-24",
  "2026-05-25",
  "2026-09-24",
  "2026-09-25",
  "2026-09-26"
]);

export default function ItemExplorer({ items, ministries, dates, detailHrefPrefix = "/items" }: Props) {
  const initialDate = dates[0] || formatDateString(new Date());
  const [query, setQuery] = useState("");
  const [ministryFilters, setMinistryFilters] = useState<string[]>([]);
  const [sourceTypeFilters, setSourceTypeFilters] = useState<string[]>([]);
  const [documentTypeFilters, setDocumentTypeFilters] = useState<string[]>([]);
  const [changeTypeFilters, setChangeTypeFilters] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [monthCursor, setMonthCursor] = useState(initialDate.slice(0, 7));
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
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

  const dateCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of enrichedItems) {
      const date = item.collection_date || item.publish_date;
      if (date) result.set(date, (result.get(date) || 0) + 1);
    }
    return result;
  }, [enrichedItems]);

  const dateScopedItems = useMemo(
    () => enrichedItems.filter((item) => (item.collection_date || item.publish_date) === selectedDate),
    [enrichedItems, selectedDate]
  );

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

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dateScopedItems.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (ministryFilters.length && !ministryFilters.includes(item.ministry)) return false;
      if (sourceTypeFilters.length && !sourceTypeFilters.includes(item.source_type)) return false;
      if (documentTypeFilters.length && !documentTypeFilters.includes(item.document_type)) return false;
      if (changeTypeFilters.length && !changeTypeFilters.includes(item.change_type)) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.raw_text, item.ministry, item.issue_number, item.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [
    category,
    changeTypeFilters,
    dateScopedItems,
    documentTypeFilters,
    ministryFilters,
    query,
    sourceTypeFilters
  ]);

  const calendarCells = useMemo(() => buildCalendar(monthCursor), [monthCursor]);
  const dateHasCache = dates.includes(selectedDate);
  const activeFilterCount =
    ministryFilters.length + sourceTypeFilters.length + documentTypeFilters.length + changeTypeFilters.length;

  const filterConfigs: Array<{
    key: FilterKey;
    label: string;
    selected: string[];
    options: FilterOption[];
  }> = [
    { key: "ministry", label: "기관", selected: ministryFilters, options: ministries.map((value) => ({ value, label: value })) },
    {
      key: "source",
      label: "출처",
      selected: sourceTypeFilters,
      options: sourceTypes.map((value) => ({ value, label: sourceTypeLabels[value] }))
    },
    {
      key: "document",
      label: "문서",
      selected: documentTypeFilters,
      options: documentTypes.map((value) => ({ value, label: documentTypeLabels[value] }))
    },
    {
      key: "change",
      label: "변경",
      selected: changeTypeFilters,
      options: changeTypes.map((value) => ({ value, label: changeTypeLabels[value] }))
    }
  ];

  const currentFilterConfig = filterConfigs.find((config) => config.key === activeFilter);

  function saveApiKey(value: string) {
    setApiKey(value);
    if (value) sessionStorage.setItem("kr-reg-openai-key", value);
    else sessionStorage.removeItem("kr-reg-openai-key");
  }

  function shiftMonth(offset: number) {
    const [year, month] = monthCursor.split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    setMonthCursor(formatMonthString(next));
  }

  function selectCalendarDate(date: string) {
    setSelectedDate(date);
    setMonthCursor(date.slice(0, 7));
  }

  function openFilterMenu(key: FilterKey, selected: string[]) {
    if (activeFilter === key) {
      setActiveFilter(null);
      return;
    }
    setDraftSelection(selected);
    setActiveFilter(key);
  }

  function toggleDraft(value: string) {
    setDraftSelection((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
    );
  }

  function applyFilter() {
    if (activeFilter === "ministry") setMinistryFilters(draftSelection);
    if (activeFilter === "source") setSourceTypeFilters(draftSelection);
    if (activeFilter === "document") setDocumentTypeFilters(draftSelection);
    if (activeFilter === "change") setChangeTypeFilters(draftSelection);
    setActiveFilter(null);
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
      <aside className="side-panel" aria-label="날짜와 분류">
        <section className="calendar-card" aria-label="날짜 선택">
          <div className="calendar-toolbar">
            <button type="button" aria-label="이전 달" onClick={() => shiftMonth(-1)}>
              &lt;
            </button>
            <strong>{formatMonthLabel(monthCursor)}</strong>
            <button type="button" aria-label="다음 달" onClick={() => shiftMonth(1)}>
              &gt;
            </button>
          </div>
          <div className="calendar-weekdays" aria-hidden="true">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {calendarCells.map((cell, index) =>
              cell.date ? (
                <button
                  className={calendarClassName(cell.date, index, selectedDate, dateCounts.get(cell.date) || 0)}
                  key={cell.date}
                  type="button"
                  aria-label={`${formatDateLabel(cell.date)} ${dateCounts.get(cell.date) || 0}건`}
                  onClick={() => selectCalendarDate(cell.date)}
                >
                  <span>{cell.day}</span>
                  <small>{(dateCounts.get(cell.date) || 0).toLocaleString("ko-KR")}</small>
                </button>
              ) : (
                <div className="calendar-empty" key={`empty-${index}`} />
              )
            )}
          </div>
        </section>

        <nav className="category-summary" aria-label="문서 분류">
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
      </aside>

      <div className="content-stage">
        <section className="filter-toolbar" aria-label="검색과 필터">
          {filterConfigs.map((config) => (
            <div className="filter-menu" key={config.key}>
              <button
                className={config.selected.length ? "filter-trigger active" : "filter-trigger"}
                type="button"
                onClick={() => openFilterMenu(config.key, config.selected)}
              >
                <span>{config.label}</span>
                <strong>{config.selected.length || ""}</strong>
              </button>
              {activeFilter === config.key && currentFilterConfig ? (
                <div className="filter-popover">
                  <div className="filter-popover-head">
                    <strong>{currentFilterConfig.label}</strong>
                    <button type="button" onClick={() => setDraftSelection([])}>
                      전체 해제
                    </button>
                  </div>
                  <div className="filter-options">
                    {currentFilterConfig.options.map((option) => (
                      <label key={option.value}>
                        <input
                          type="checkbox"
                          checked={draftSelection.includes(option.value)}
                          onChange={() => toggleDraft(option.value)}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="filter-popover-actions">
                    <button type="button" onClick={() => setActiveFilter(null)}>
                      취소
                    </button>
                    <button type="button" onClick={applyFilter}>
                      확인
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          <label className="search-field">
            <span>검색</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 본문, 기관, 문서번호 검색"
            />
          </label>
        </section>

        <section className="results-header">
          <div>
            <strong>{filtered.length.toLocaleString("ko-KR")}건</strong>
            <span>{dateHasCache ? "표시 중" : "저장 자료 없음"}</span>
            {activeFilterCount ? <small>{activeFilterCount.toLocaleString("ko-KR")}개 필터</small> : null}
          </div>
          <button className="ai-brief-button" type="button" onClick={() => setAiOpen(true)}>
            AI 브리핑
          </button>
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

      {aiOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setAiOpen(false)}>
          <section
            className="ai-modal"
            role="dialog"
            aria-modal="true"
            aria-label="AI 브리핑"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>AI 브리핑</span>
                <strong>현재 화면의 항목을 요약합니다.</strong>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setAiOpen(false)}>
                ×
              </button>
            </div>
            <label className="field-label">
              <span>OpenAI API 키</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => saveApiKey(event.target.value)}
                placeholder="sk-..."
              />
            </label>
            <div className="modal-actions">
              <button disabled={!apiKey || !filtered.length || summaryStatus === "working"} type="button" onClick={summarizeVisible}>
                {summaryStatus === "working" ? "정리 중" : "브리핑 생성"}
              </button>
              {apiKey ? (
                <button className="secondary" type="button" onClick={() => saveApiKey("")}>
                  키 삭제
                </button>
              ) : null}
            </div>
            {digest || summaryError ? (
              <div className={`digest-panel ${summaryStatus === "error" ? "error" : ""}`}>
                <strong>{summaryStatus === "error" ? "브리핑 실패" : "AI 브리핑"}</strong>
                <p>{summaryStatus === "error" ? summaryError : digest}</p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
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

function buildCalendar(monthCursor: string): Array<{ date: string | null; day: number | null }> {
  const [year, month] = monthCursor.split("-").map(Number);
  const monthIndex = month - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<{ date: string | null; day: number | null }> = [];
  for (let index = 0; index < firstWeekday; index += 1) cells.push({ date: null, day: null });
  for (let day = 1; day <= daysInMonth; day += 1) cells.push({ date: makeDateString(year, monthIndex, day), day });
  while (cells.length < 42) cells.push({ date: null, day: null });
  return cells;
}

function calendarClassName(date: string, index: number, selectedDate: string, count: number): string {
  return [
    "calendar-day",
    date === selectedDate ? "selected" : "",
    count ? "has-data" : "",
    index % 7 === 0 || index % 7 === 6 || isKoreanHoliday(date) ? "holiday" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function isKoreanHoliday(date: string): boolean {
  return fixedHolidayMonthDays.has(date.slice(5)) || holidayOverrides.has(date);
}

function makeDateString(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad(monthIndex + 1)}-${pad(day)}`;
}

function formatDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatMonthString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function formatMonthLabel(value: string): string {
  const [year, month] = value.split("-");
  return `${year}년 ${Number(month)}월`;
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}. ${Number(month)}. ${Number(day)}.`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
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
