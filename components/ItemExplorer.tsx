"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AiInlineResult, { emptyAiRunState } from "@/components/AiInlineResult";
import AiSummaryDialog from "@/components/AiSummaryDialog";
import { categoryLabels, itemCategory } from "@/lib/categories";
import { changeTypeLabels, confidenceLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import { classifyPublicInstitutionSystemItem, publicInstitutionSystemGroups } from "@/lib/publicInstitutionSystem";
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
  dataItems?: CollectedItem[];
  dataMinistries?: string[];
  dataDates?: string[];
  detailHrefPrefix?: string;
}

type CategoryFilter = "all" | RegulatoryCategory;
type WorkspaceMode = "all" | "regulatory" | "public-system" | "data";
type FilterKey = "ministry" | "source" | "document" | "change";
type EnrichedItem = CollectedItem & {
  category: RegulatoryCategory;
  public_system_matches: NonNullable<CollectedItem["public_system_matches"]>;
};

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

const briefingInstructions =
  [
    "한국 규제·법령 변경 모니터의 업무 브리핑 편집자처럼 작성하세요.",
    "반드시 제공된 FILTERED_ITEMS_JSON 안의 필드, URL, 수집 본문만 근거로 판단하세요.",
    "URL은 직접 열람한 것처럼 말하지 말고, 사용자가 확인할 공식 원문/참고 링크로만 제시하세요.",
    "출력 형식은 1) 오늘의 핵심 변화 2) 법령 3) 고시/공고 4) 지침/규칙 5) 뉴스/발언 6) 업무 확인 포인트 순서로 고정하세요.",
    "각 항목은 기관, 제목, 무엇이 달라졌는지, 원문 URL을 함께 적으세요.",
    "뉴스/정책브리핑은 공식 변경 확정 자료가 아니라 참고 자료라고 분명히 표시하세요.",
    "근거가 부족한 항목은 추정하지 말고 원문 확인 필요라고 적으세요."
  ].join("\n");

export default function ItemExplorer({
  items,
  ministries,
  dates,
  dataItems = [],
  dataMinistries = [],
  dataDates = [],
  detailHrefPrefix = "/items"
}: Props) {
  const today = formatDateString(new Date());
  const combinedDates = useMemo(() => uniqueStrings([...dates, ...dataDates]).sort((a, b) => b.localeCompare(a)), [dataDates, dates]);
  const combinedMinistries = useMemo(() => uniqueKorean([...ministries, ...dataMinistries]), [dataMinistries, ministries]);
  const initialRegulatoryDate = dates[0] || today;
  const initialAllDate = combinedDates[0] || initialRegulatoryDate;
  const initialDataDate = dataDates[0] || initialAllDate;
  const defaultDatesByMode = useMemo<Record<WorkspaceMode, string>>(
    () => ({
      all: initialAllDate,
      regulatory: initialRegulatoryDate,
      "public-system": initialRegulatoryDate,
      data: initialDataDate
    }),
    [initialAllDate, initialDataDate, initialRegulatoryDate]
  );
  const validMinistrySet = useMemo(() => new Set(combinedMinistries), [combinedMinistries]);
  const [query, setQuery] = useState("");
  const [ministryFilters, setMinistryFilters] = useState<string[]>([]);
  const [sourceTypeFilters, setSourceTypeFilters] = useState<string[]>([]);
  const [documentTypeFilters, setDocumentTypeFilters] = useState<string[]>([]);
  const [changeTypeFilters, setChangeTypeFilters] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(initialAllDate);
  const [monthCursor, setMonthCursor] = useState(initialAllDate.slice(0, 7));
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("all");
  const [activeSystemGroup, setActiveSystemGroup] = useState("all");
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [draftSelection, setDraftSelection] = useState<string[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRun, setAiRun] = useState(emptyAiRunState);
  const [urlReady, setUrlReady] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const enrichedItems = useMemo<EnrichedItem[]>(
    () =>
      items.map((item) => ({
        ...item,
        category: itemCategory(item),
        public_system_matches: item.public_system_matches?.length
          ? item.public_system_matches
          : classifyPublicInstitutionSystemItem(item)
      })),
    [items]
  );

  const enrichedDataItems = useMemo<EnrichedItem[]>(
    () =>
      dataItems.map((item) => ({
        ...item,
        category: itemCategory(item),
        public_system_matches: item.public_system_matches || []
      })),
    [dataItems]
  );

  const combinedItems = useMemo(
    () => mergeDisplayItems([...enrichedItems, ...enrichedDataItems]),
    [enrichedDataItems, enrichedItems]
  );

  const activeDates =
    workspaceMode === "all" ? combinedDates : workspaceMode === "data" ? dataDates : dates;
  const activeMinistries =
    workspaceMode === "all" ? combinedMinistries : workspaceMode === "data" ? dataMinistries : ministries;

  const modeScopedItems = useMemo(
    () => {
      if (workspaceMode === "all") return combinedItems;
      if (workspaceMode === "regulatory") return enrichedItems;
      if (workspaceMode === "data") return enrichedDataItems;
      if (workspaceMode === "public-system") {
        return enrichedItems.filter((item) => (item.public_system_matches || []).length > 0);
      }
      return combinedItems;
    },
    [combinedItems, enrichedDataItems, enrichedItems, workspaceMode]
  );

  const dateCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const item of modeScopedItems) {
      const date = item.collection_date || item.publish_date;
      if (date) result.set(date, (result.get(date) || 0) + 1);
    }
    return result;
  }, [modeScopedItems]);

  const dateScopedItems = useMemo(
    () => modeScopedItems.filter((item) => (item.collection_date || item.publish_date) === selectedDate),
    [modeScopedItems, selectedDate]
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

  const systemCounts = useMemo(() => {
    const byGroup = new Map<string, number>();
    for (const item of dateScopedItems) {
      for (const match of item.public_system_matches || []) {
        byGroup.set(match.group_id, (byGroup.get(match.group_id) || 0) + 1);
      }
    }
    return byGroup;
  }, [dateScopedItems]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return dateScopedItems.filter((item) => {
      if (workspaceMode !== "public-system" && category !== "all" && item.category !== category) return false;
      if (
        workspaceMode === "public-system" &&
        activeSystemGroup !== "all" &&
        !(item.public_system_matches || []).some((match) => match.group_id === activeSystemGroup)
      ) {
        return false;
      }
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
    activeSystemGroup,
    category,
    changeTypeFilters,
    dateScopedItems,
    documentTypeFilters,
    ministryFilters,
    query,
    sourceTypeFilters,
    workspaceMode
  ]);

  const briefingInput = useMemo(
    () => buildBriefingInput(filtered, selectedDate),
    [filtered, selectedDate]
  );

  const listHref = useMemo(
    () =>
      buildListHref({
        mode: workspaceMode,
        date: selectedDate,
        category,
        system: activeSystemGroup,
        query,
        ministries: ministryFilters,
        sources: sourceTypeFilters,
        documents: documentTypeFilters,
        changes: changeTypeFilters
      }),
    [
      activeSystemGroup,
      category,
      changeTypeFilters,
      documentTypeFilters,
      ministryFilters,
      query,
      selectedDate,
      sourceTypeFilters,
      workspaceMode
    ]
  );

  const calendarCells = useMemo(() => buildCalendar(monthCursor), [monthCursor]);
  const collectedDateSet = useMemo(() => new Set(activeDates), [activeDates]);
  const dateHasCache = collectedDateSet.has(selectedDate);
  const emptyTitle = !dateHasCache
    ? "자료를 수집하지 않은 날짜입니다. 관리자에게 문의하세요."
    : dateScopedItems.length
      ? "표시할 항목이 없습니다."
      : "수집된 자료는 0건입니다.";

  const filterConfigs: Array<{
    key: FilterKey;
    label: string;
    selected: string[];
    options: FilterOption[];
  }> = [
    { key: "ministry", label: "기관", selected: ministryFilters, options: activeMinistries.map((value) => ({ value, label: value })) },
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    const date = params.get("date");
    const nextMode = parseWorkspaceMode(mode);
    const nextCategory = parseCategoryParam(params.get("category"));
    const nextSystem = parseSystemParam(params.get("system"));
    const nextQuery = params.get("q") || "";
    const nextMinistries = parseArrayParams(params, "ministry").filter((value) => validMinistrySet.has(value));
    const nextSources = parseArrayParams(params, "source").filter(isSourceType);
    const nextDocuments = parseArrayParams(params, "document").filter(isDocumentType);
    const nextChanges = parseArrayParams(params, "change").filter(isChangeType);
    const defaultDate = defaultDatesByMode[nextMode];
    const nextDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : defaultDate;

    setWorkspaceMode(nextMode);
    setSelectedDate(nextDate);
    setMonthCursor(nextDate.slice(0, 7));
    setCategory(nextCategory);
    setActiveSystemGroup(nextSystem);
    setQuery(nextQuery);
    setMinistryFilters(nextMinistries);
    setSourceTypeFilters(nextSources);
    setDocumentTypeFilters(nextDocuments);
    setChangeTypeFilters(nextChanges);
    setUrlReady(true);
  }, [defaultDatesByMode, validMinistrySet]);

  useEffect(() => {
    if (!urlReady) return;
    window.history.replaceState(null, "", toBrowserListHref(listHref));
  }, [listHref, urlReady]);

  function shiftMonth(offset: number) {
    const [year, month] = monthCursor.split("-").map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    setMonthCursor(formatMonthString(next));
  }

  function selectCalendarDate(date: string) {
    setSelectedDate(date);
    setMonthCursor(date.slice(0, 7));
  }

  function changeWorkspaceMode(mode: WorkspaceMode) {
    setWorkspaceMode(mode);
    setCategory("all");
    setActiveSystemGroup("all");
    setActiveFilter(null);
    setDraftSelection([]);
    setMinistryFilters([]);
    setSourceTypeFilters([]);
    setDocumentTypeFilters([]);
    setChangeTypeFilters([]);
    const nextDate = defaultDatesByMode[mode];
    setSelectedDate(nextDate);
    setMonthCursor(nextDate.slice(0, 7));
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

  const workspaceClassName = [
    "app-workspace",
    workspaceMode === "public-system" ? "system-workspace" : "",
    workspaceMode === "data" ? "data-workspace" : "",
    sidebarCollapsed ? "sidebar-collapsed" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const sidePanelClassName = [
    "side-panel",
    workspaceMode === "public-system" ? "system-side-panel" : "",
    sidebarCollapsed ? "collapsed" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={workspaceClassName} aria-label="규제 변경 탐색">
      <nav className="workspace-tabs" aria-label="수집 범위">
        <button
          className={workspaceMode === "all" ? "active" : ""}
          type="button"
          onClick={() => changeWorkspaceMode("all")}
        >
          <span>전체</span>
        </button>
        <button
          className={workspaceMode === "regulatory" ? "active" : ""}
          type="button"
          onClick={() => changeWorkspaceMode("regulatory")}
        >
          <span>법령·고시·지침</span>
        </button>
        <button
          className={workspaceMode === "public-system" ? "active" : ""}
          type="button"
          onClick={() => changeWorkspaceMode("public-system")}
        >
          <span>공공기관 9개 체계</span>
        </button>
        <button
          className={workspaceMode === "data" ? "active" : ""}
          type="button"
          onClick={() => changeWorkspaceMode("data")}
        >
          <span>데이터</span>
        </button>
      </nav>
      <aside className={sidePanelClassName} aria-label="날짜와 분류">
        <button
          className="calendar-collapse-toggle"
          type="button"
          aria-label={sidebarCollapsed ? "날짜와 분류 펼치기" : "날짜와 분류 접기"}
          aria-expanded={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((current) => !current)}
        >
          <span className="collapse-label-desktop">{sidebarCollapsed ? ">>" : "<<"}</span>
          <span className="collapse-label-mobile">{sidebarCollapsed ? "↓" : "↑"}</span>
        </button>
        <div className="side-panel-inner" aria-hidden={sidebarCollapsed}>
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
              {calendarCells.map((cell, index) => {
                if (!cell.date) return <div className="calendar-empty" key={`empty-${index}`} />;
                const date = cell.date;
                const count = dateCounts.get(date) || 0;
                const collected = collectedDateSet.has(date);
                return (
                  <button
                    className={calendarClassName(date, index, selectedDate, count, collected)}
                    key={date}
                    type="button"
                    aria-label={`${formatDateLabel(date)} ${collected ? `${count}건 수집 완료` : "수집 전"}`}
                    onClick={() => selectCalendarDate(date)}
                  >
                    <span>{cell.day}</span>
                    <small>{collected ? count.toLocaleString("ko-KR") : "-"}</small>
                  </button>
                );
              })}
            </div>
          </section>

          {workspaceMode === "public-system" ? (
            <nav className="category-summary system-summary" aria-label="9개 공공기관 운영 체계">
              <button
                className={activeSystemGroup === "all" ? "active" : ""}
                type="button"
                onClick={() => setActiveSystemGroup("all")}
              >
                <span>9개 항목 전체</span>
                <strong>{dateScopedItems.length.toLocaleString("ko-KR")}</strong>
              </button>
              {publicInstitutionSystemGroups.map((group) => (
                <button
                  className={activeSystemGroup === group.id ? "active" : ""}
                  key={group.id}
                  type="button"
                  onClick={() => setActiveSystemGroup(group.id)}
                >
                  <span>
                    {group.order}. {group.title}
                  </span>
                  <strong>{(systemCounts.get(group.id) || 0).toLocaleString("ko-KR")}</strong>
                </button>
              ))}
            </nav>
          ) : (
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
          )}
        </div>
        {!sidebarCollapsed ? <WorkspaceFootnote className="workspace-footnote-panel" /> : null}
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

          <button className="ai-brief-button" type="button" onClick={() => setAiOpen(true)}>
            AI 브리핑
          </button>

          <label className="search-field">
            <span className="search-icon" aria-hidden="true" />
            <input
              aria-label="검색"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="제목, 본문, 기관, 문서번호"
            />
          </label>
        </section>

        <AiInlineResult
          state={aiRun}
          title="AI 브리핑"
          workingText="현재 화면의 항목을 업무용 브리핑으로 정리하고 있습니다."
          errorTitle="브리핑 실패"
          onOpenSettings={() => setAiOpen(true)}
        />

        <section className="item-list" aria-label="변경 목록">
          {filtered.length ? (
            filtered.map((item) => (
              <ItemRow key={item.id} item={item} detailHrefPrefix={detailHrefPrefix} listHref={listHref} />
            ))
          ) : (
            <div className="empty-state">
              <strong>{emptyTitle}</strong>
            </div>
          )}
        </section>
        {sidebarCollapsed ? <WorkspaceFootnote className="workspace-footnote-content" /> : null}
      </div>

      <button
        className="scroll-top-button"
        type="button"
        aria-label="페이지 맨 위로 이동"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        TOP
      </button>

      <AiSummaryDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title="AI 브리핑"
        subtitle="현재 화면의 항목을 요약합니다."
        input={briefingInput}
        instructions={briefingInstructions}
        submitLabel="브리핑 진행"
        workingLabel="정리 중"
        reportMode="paged"
        disabled={!filtered.length}
        disabledMessage="현재 화면에 요약할 항목이 없습니다."
        onRunStateChange={setAiRun}
      />
    </section>
  );
}

function WorkspaceFootnote({ className }: { className: string }) {
  return (
    <footer className={`workspace-footnote ${className}`} aria-label="저작권과 문의">
      <p>© 한국석유공사(KNOC). 본 웹사이트 및 수집·정리 프로그램의 저작권은 한국석유공사에 있습니다.</p>
      <p>
        사용 중 문제나 의견 사항이 있으면 연락해 주세요.{" "}
        <a href="tel:0522162526">052)216-2526</a> ·{" "}
        <a href="mailto:myeongjae.song@knoc.co.kr">myeongjae.song@knoc.co.kr</a>
      </p>
    </footer>
  );
}

function ItemRow({
  item,
  detailHrefPrefix,
  listHref
}: {
  item: CollectedItem;
  detailHrefPrefix: string;
  listHref: string;
}) {
  const detailHref = `${detailHrefPrefix.replace(/\/$/, "")}/${encodeURIComponent(item.id)}?back=${encodeURIComponent(listHref)}`;
  const category = item.category || itemCategory(item);
  const evidenceLines = extractEvidenceLines(item.raw_text).slice(0, 2);
  const systemMatches = item.public_system_matches || [];

  return (
    <article className={`item-card category-${category}`}>
      <div className="category-rail" aria-hidden="true" />
      <div className="item-main">
        <div className="item-meta">
          <span>{categoryLabels[category]}</span>
          <span>{documentTypeLabels[item.document_type]}</span>
          <span>{changeTypeLabels[item.change_type]}</span>
          <span>{confidenceLabels[item.confidence]}</span>
          {systemMatches.slice(0, 2).map((match) => (
            <span className="system-chip" key={`${match.group_id}-${match.relation}`}>
              {match.group_title} · {match.relation_label}
            </span>
          ))}
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

function calendarClassName(date: string, index: number, selectedDate: string, count: number, collected: boolean): string {
  return [
    "calendar-day",
    date === selectedDate ? "selected" : "",
    collected ? "collected" : "uncollected",
    count ? "has-data" : "",
    collected && !count ? "collected-empty" : "",
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

function buildListHref({
  mode,
  date,
  category,
  system,
  query,
  ministries,
  sources,
  documents,
  changes
}: {
  mode: WorkspaceMode;
  date: string;
  category: CategoryFilter;
  system: string;
  query: string;
  ministries: string[];
  sources: string[];
  documents: string[];
  changes: string[];
}): string {
  const params = new URLSearchParams();
  if (mode !== "all") params.set("mode", mode);
  if (date) params.set("date", date);
  if (mode !== "public-system" && category !== "all") params.set("category", category);
  if (mode === "public-system" && system !== "all") params.set("system", system);
  if (query.trim()) params.set("q", query.trim());
  for (const value of ministries) params.append("ministry", value);
  for (const value of sources) params.append("source", value);
  for (const value of documents) params.append("document", value);
  for (const value of changes) params.append("change", value);
  const queryString = params.toString();
  return queryString ? `/?${queryString}` : "/";
}

function toBrowserListHref(href: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  if (!basePath) return href;
  if (href === "/") return `${basePath}/`;
  return `${basePath}${href}`;
}

function parseArrayParams(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .flatMap((value) => value.split("|"))
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseCategoryParam(value: string | null): CategoryFilter {
  return categoryFilters.some((filter) => filter.value === value) ? (value as CategoryFilter) : "all";
}

function parseWorkspaceMode(value: string | null): WorkspaceMode {
  if (value === "regulatory" || value === "public-system" || value === "data") return value;
  return "all";
}

function parseSystemParam(value: string | null): string {
  return publicInstitutionSystemGroups.some((group) => group.id === value) ? String(value) : "all";
}

function isSourceType(value: string): value is SourceType {
  return sourceTypes.includes(value as SourceType);
}

function isDocumentType(value: string): value is DocumentType {
  return documentTypes.includes(value as DocumentType);
}

function isChangeType(value: string): value is ChangeType {
  return changeTypes.includes(value as ChangeType);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
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

function buildBriefingInput(items: Array<CollectedItem & { category?: RegulatoryCategory }>, selectedDate: string): string {
  const payload = {
    selected_date: selectedDate,
    total_filtered_count: items.length,
    included_count: items.length,
    note: "현재 화면의 모든 항목을 제공합니다. 모델 한도를 넘으면 항목 단위 페이지 보고서로 나누어 작성합니다.",
    items: items.map((item) => ({
      id: item.id,
      category: categoryLabels[item.category || itemCategory(item)],
      source: item.source,
      source_type: sourceTypeLabels[item.source_type],
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
      original_url: item.original_url,
      attachment_urls: item.attachment_urls,
      existing_summary: item.summary,
      diff_summary: item.diff_summary,
      source_record_id: item.source_record_id,
      public_system_matches: (item.public_system_matches || []).map((match) => ({
        group: match.group_title,
        relation: match.relation_label,
        evidence: match.evidence
      })),
      raw_text_char_count: item.raw_text.length,
      raw_text: compactForAi(item.raw_text)
    }))
  };

  return [
    "FILTERED_ITEMS_JSON",
    JSON.stringify(payload, null, 2),
    "END_FILTERED_ITEMS_JSON",
    "",
    "주의: URL은 제공된 링크일 뿐이며, AI가 직접 열람한 원문으로 간주하지 마세요."
  ].join("\n");
}

function compactForAi(value: string): string {
  const compacted = value
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return compacted;
}

function mergeDisplayItems(items: EnrichedItem[]): EnrichedItem[] {
  const map = new Map<string, EnrichedItem>();
  for (const item of items) {
    const key = displayItemKey(item);
    const previous = map.get(key);
    map.set(key, previous ? mergeDisplayItem(previous, item) : item);
  }
  return [...map.values()].sort((a, b) => {
    const dateOrder = (b.collection_date || b.publish_date || "").localeCompare(a.collection_date || a.publish_date || "");
    if (dateOrder !== 0) return dateOrder;
    return a.title.localeCompare(b.title, "ko");
  });
}

function mergeDisplayItem(first: EnrichedItem, second: EnrichedItem): EnrichedItem {
  const primary = displayItemScore(second) > displayItemScore(first) ? second : first;
  const secondary = primary === first ? second : first;
  return {
    ...primary,
    summary: primary.summary || secondary.summary,
    diff_summary: primary.diff_summary || secondary.diff_summary,
    auto_summary: primary.auto_summary || secondary.auto_summary,
    attachment_urls: uniqueStrings([...(primary.attachment_urls || []), ...(secondary.attachment_urls || [])]),
    public_system_matches: mergeSystemMatches(primary.public_system_matches, secondary.public_system_matches)
  };
}

function displayItemScore(item: EnrichedItem): number {
  return (
    (item.summary ? 500 : 0) +
    (item.diff_summary ? 250 : 0) +
    Math.min(item.raw_text.length, 1000) +
    (item.attachment_urls || []).length * 25 +
    item.public_system_matches.length * 20
  );
}

function displayItemKey(item: CollectedItem): string {
  const date = item.collection_date || item.publish_date || "";
  const normalizedUrl = normalizeDisplayUrl(item.original_url);
  if (normalizedUrl) return `url:${date}:${normalizedUrl}`;
  if (item.source_record_id) return `record:${date}:${item.source_type}:${normalizeDisplayText(item.source_record_id)}`;
  return `title:${date}:${normalizeDisplayText(item.ministry)}:${normalizeDisplayText(item.title)}`;
}

function normalizeDisplayUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key)) url.searchParams.delete(key);
    }
    const sortedParams = [...url.searchParams.entries()].sort(([left], [right]) => left.localeCompare(right));
    url.search = "";
    for (const [key, paramValue] of sortedParams) url.searchParams.append(key, paramValue);
    return url.toString().replace(/\/$/, "").toLowerCase();
  } catch {
    return value.trim().replace(/\/$/, "").toLowerCase();
  }
}

function normalizeDisplayText(value: string | null | undefined): string {
  return String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function mergeSystemMatches(
  first: EnrichedItem["public_system_matches"],
  second: EnrichedItem["public_system_matches"]
): EnrichedItem["public_system_matches"] {
  const map = new Map<string, EnrichedItem["public_system_matches"][number]>();
  for (const match of [...first, ...second]) {
    const key = `${match.group_id}:${match.relation}`;
    const previous = map.get(key);
    if (!previous || match.score > previous.score) map.set(key, match);
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.group_order - b.group_order);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueKorean(values: string[]): string[] {
  return uniqueStrings(values).sort((a, b) => a.localeCompare(b, "ko"));
}
