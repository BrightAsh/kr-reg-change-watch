"use client";

import { useMemo, useState } from "react";
import type { CollectionDayStatus, CollectionStatusReport } from "@/lib/collectionStatus";

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
  skipped: "건너뜀",
  not_started: "수집 전"
};

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

export default function CollectionStatusBoard({ report }: Props) {
  const defaultDate =
    [...report.days].reverse().find((day) => day.status !== "not_started")?.date || report.end_date;
  const [selectedDate, setSelectedDate] = useState(defaultDate);
  const selected = report.days.find((day) => day.date === selectedDate) || report.days[report.days.length - 1];
  const months = useMemo(() => groupMonths(report.days), [report.days]);

  return (
    <section className="status-board" aria-label="수집 현황">
      <div className="status-summary" aria-label="수집 상태 요약">
        <StatusSummaryItem label="완료" value={report.summary.complete} tone="complete" />
        <StatusSummaryItem label="부분 완료" value={report.summary.partial} tone="partial" />
        <StatusSummaryItem label="오류" value={report.summary.failed} tone="failed" />
        <StatusSummaryItem label="수집 전" value={report.summary.not_started} tone="not_started" />
      </div>

      <div className="status-layout">
        <div className="status-calendar-wrap">
          <div className="status-month-grid">
            {months.map((month) => (
              <section className="status-month" key={month.key} aria-label={`${month.label} 수집 현황`}>
                <h2>{month.label}</h2>
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
                        onClick={() => setSelectedDate(cell.date)}
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
                      <div className="status-day-empty" key={`empty-${month.key}-${index}`} />
                    )
                  )}
                </div>
              </section>
            ))}
          </div>
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

          <div className="status-method-list">
            {selected.methods.map((method, index) => (
              <article className={`status-method method-${method.status}`} key={`${method.source}-${index}`}>
                <div className="status-method-main">
                  <strong>{method.source}</strong>
                  <span>{method.url || "URL 없음"}</span>
                </div>
                <div className="status-method-result">
                  {method.status === "ok" ? (
                    <span className="method-count">{(method.count || 0).toLocaleString("ko-KR")}건</span>
                  ) : method.status === "error" ? (
                    <details>
                      <summary>오류</summary>
                      <p>{method.message || "오류 메시지가 기록되지 않았습니다."}</p>
                      {method.at ? <small>{formatDateTime(method.at)}</small> : null}
                    </details>
                  ) : (
                    <span>{methodLabels[method.status]}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function StatusSummaryItem({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: CollectionDayStatus["status"];
}) {
  return (
    <div className={`status-summary-item status-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("ko-KR")}</strong>
    </div>
  );
}

function groupMonths(days: CollectionDayStatus[]) {
  const grouped = new Map<string, CollectionDayStatus[]>();
  for (const day of days) {
    const key = day.date.slice(0, 7);
    grouped.set(key, [...(grouped.get(key) || []), day]);
  }
  return [...grouped.entries()].map(([key, monthDays]) => {
    const [year, month] = key.split("-").map(Number);
    const cells: Array<CollectionDayStatus | null> = [];
    const firstWeekday = new Date(year, month - 1, 1).getDay();
    for (let index = 0; index < firstWeekday; index += 1) cells.push(null);
    cells.push(...monthDays);
    while (cells.length % 7 !== 0) cells.push(null);
    return {
      key,
      label: `${year}년 ${month}월`,
      cells
    };
  });
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
