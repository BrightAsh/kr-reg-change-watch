"use client";

import { useMemo, useState } from "react";
import type { CollectionDayStatus, CollectionMethodStatus, CollectionStatusReport } from "@/lib/collectionStatus";

interface Props {
  report: CollectionStatusReport;
}

const stateLabels: Record<CollectionDayStatus["status"], string> = {
  complete: "완료",
  partial: "부분 완료",
  failed: "오류",
  not_started: "수집 전"
};

const methodLabels = {
  ok: "성공",
  error: "오류",
  external_error: "외부 접속 장애",
  skipped: "건너뜀",
  missing: "미시도",
  not_started: "수집 전"
};

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

export default function CollectionStatusBoard({ report }: Props) {
  const defaultDate =
    [...report.days].reverse().find((day) => day.status !== "not_started")?.date || report.end_date;
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const [monthCursor, setMonthCursor] = useState(defaultDate.slice(0, 7));
  const [activeLog, setActiveLog] = useState<CollectionMethodStatus | null>(null);
  const selected = report.days.find((day) => day.date === selectedDate) || report.days[report.days.length - 1];
  const monthKeys = useMemo(() => uniqueMonths(report.days), [report.days]);
  const month = useMemo(() => buildMonth(report.days, monthCursor), [monthCursor, report.days]);
  const monthIndex = monthKeys.indexOf(monthCursor);
  const canMovePrev = monthIndex > 0;
  const canMoveNext = monthIndex >= 0 && monthIndex < monthKeys.length - 1;

  function shiftMonth(offset: number) {
    const nextIndex = monthIndex + offset;
    const nextMonth = monthKeys[nextIndex];
    if (nextMonth) setMonthCursor(nextMonth);
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    setActiveLog(null);
  }

  return (
    <section className="status-board" aria-label="수집 현황">
      <div className="status-layout">
        <div className="status-calendar-wrap">
          <div className="status-calendar-head">
            <button type="button" onClick={() => shiftMonth(-1)} disabled={!canMovePrev} aria-label="이전 달">
              &lt;
            </button>
            <h2>{formatMonthLabel(monthCursor)}</h2>
            <button type="button" onClick={() => shiftMonth(1)} disabled={!canMoveNext} aria-label="다음 달">
              &gt;
            </button>
          </div>
          <section className="status-month single" aria-label={`${formatMonthLabel(monthCursor)} 수집 현황`}>
            <div className="status-weekdays" aria-hidden="true">
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="status-days">
              {month.cells.map((cell, index) =>
                cell ? (
                  <button
                    className={[
                      "status-day",
                      `status-${cell.status}`,
                      cell.date === selected.date ? "selected" : ""
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={cell.date}
                    type="button"
                    onClick={() => selectDate(cell.date)}
                  >
                    <span>{Number(cell.date.slice(8, 10))}</span>
                    <strong>{stateLabels[cell.status]}</strong>
                    {cell.status === "complete" || cell.status === "partial" ? (
                      <small>{cell.item_count.toLocaleString("ko-KR")}건</small>
                    ) : (
                      <small>{cell.status === "failed" ? "로그 확인" : "-"}</small>
                    )}
                  </button>
                ) : (
                  <div className="status-day-empty" key={`empty-${monthCursor}-${index}`} />
                )
              )}
            </div>
          </section>
        </div>

        <aside className="status-detail" aria-label={`${selected.date} 수집 상세`}>
          <div className="status-detail-head">
            <div>
              <p>{formatDateLabel(selected.date)}</p>
              <h2>{stateLabels[selected.status]}</h2>
            </div>
            <div className={`status-badge status-${selected.status}`}>{stateLabels[selected.status]}</div>
          </div>
          <dl className="status-detail-meta">
            <div>
              <dt>수집 자료</dt>
              <dd>{selected.item_count.toLocaleString("ko-KR")}건</dd>
            </div>
            <div>
              <dt>변경 반영</dt>
              <dd>{selected.changed_count.toLocaleString("ko-KR")}건</dd>
            </div>
            <div>
              <dt>기록 시각</dt>
              <dd>{selected.collected_at ? formatDateTime(selected.collected_at) : "-"}</dd>
            </div>
          </dl>

          <p className="status-detail-hint">
            수집방법 이름을 누르면 해당 출처로 이동합니다. 건수 또는 오류를 누르면 수집 로그가 열립니다.
          </p>

          <div className="status-method-list">
            {selected.methods.map((method, index) => (
              <article className={`status-method method-${method.status}`} key={`${method.source}-${index}`}>
                <div className="status-method-main">
                  {method.url ? (
                    <a href={method.url} target="_blank" rel="noreferrer" title="출처 페이지로 이동">
                      {method.source}
                    </a>
                  ) : (
                    <strong>{method.source}</strong>
                  )}
                </div>
                <div className="status-method-result">
                  {method.status === "ok" ? (
                    <button className="method-count" type="button" onClick={() => setActiveLog(method)}>
                      {(method.count || 0).toLocaleString("ko-KR")}건
                    </button>
                  ) : method.status === "error" ? (
                    <button className="method-error-button" type="button" onClick={() => setActiveLog(method)}>
                      오류
                    </button>
                  ) : method.status === "external_error" ? (
                    <button className="method-external-button" type="button" onClick={() => setActiveLog(method)}>
                      외부 접속 장애
                    </button>
                  ) : (
                    <button className="method-muted" type="button" onClick={() => setActiveLog(method)}>
                      {methodLabels[method.status]}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>

      {activeLog ? (
        <div className="status-log-backdrop" role="presentation" onClick={() => setActiveLog(null)}>
          <section className={`status-log-popover method-${activeLog.status}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="status-log-head">
              <div>
                <p>{formatDateLabel(selected.date)}</p>
                <h2>{activeLog.source}</h2>
              </div>
              <button type="button" onClick={() => setActiveLog(null)} aria-label="로그 닫기">
                닫기
              </button>
            </div>
            <div className="status-log-result">
              <strong>{activeLog.status === "ok" ? `${(activeLog.count || 0).toLocaleString("ko-KR")}건` : methodLabels[activeLog.status]}</strong>
              {activeLog.url ? (
                <a href={activeLog.url} target="_blank" rel="noreferrer">
                  출처 열기
                </a>
              ) : null}
            </div>
            <pre>{activeLog.message || "기록된 로그가 없습니다."}</pre>
            {activeLog.at ? <small>{formatDateTime(activeLog.at)}</small> : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function uniqueMonths(days: CollectionDayStatus[]): string[] {
  return [...new Set(days.map((day) => day.date.slice(0, 7)))].sort();
}

function buildMonth(days: CollectionDayStatus[], monthKey: string) {
  const monthDays = days.filter((day) => day.date.startsWith(`${monthKey}-`));
  const [year, month] = monthKey.split("-").map(Number);
  const cells: Array<CollectionDayStatus | null> = [];
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
  cells.push(...monthDays);
  while (cells.length < 42) cells.push(null);
  return { cells };
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return `${year}년 ${Number(month)}월`;
}

function formatDateLabel(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}
