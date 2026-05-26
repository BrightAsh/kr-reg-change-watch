"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { changeTypeLabels, confidenceLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import type { ChangeType, CollectedItem, CollectionLog, DocumentType, SourceType } from "@/lib/types";

interface Props {
  items: CollectedItem[];
  ministries: string[];
  dates: string[];
  logs: CollectionLog[];
  detailHrefPrefix?: string;
}

const sourceTypes = Object.keys(sourceTypeLabels) as SourceType[];
const documentTypes = Object.keys(documentTypeLabels) as DocumentType[];
const changeTypes = Object.keys(changeTypeLabels) as ChangeType[];

export default function ItemExplorer({ items, ministries, dates, logs, detailHrefPrefix = "/items" }: Props) {
  const [query, setQuery] = useState("");
  const [ministry, setMinistry] = useState("");
  const [sourceType, setSourceType] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [changeType, setChangeType] = useState("");
  const [date, setDate] = useState("");

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return items.filter((item) => {
      if (ministry && item.ministry !== ministry) return false;
      if (sourceType && item.source_type !== sourceType) return false;
      if (documentType && item.document_type !== documentType) return false;
      if (changeType && item.change_type !== changeType) return false;
      if (date && item.publish_date !== date) return false;
      if (!normalizedQuery) return true;
      return [item.title, item.raw_text, item.ministry, item.issue_number, item.source]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [changeType, date, documentType, items, ministry, query, sourceType]);

  return (
    <>
      <section className="filters" aria-label="필터와 검색">
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
          <span>출처 유형</span>
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
          <span>문서 유형</span>
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
          <span>변경상태</span>
          <select value={changeType} onChange={(event) => setChangeType(event.target.value)}>
            <option value="">전체</option>
            {changeTypes.map((value) => (
              <option key={value} value={value}>
                {changeTypeLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>날짜</span>
          <select value={date} onChange={(event) => setDate(event.target.value)}>
            <option value="">전체</option>
            {dates.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="results-header">
        <strong>{filtered.length.toLocaleString("ko-KR")}건</strong>
        <span>뉴스와 보도자료는 공식 변경으로 집계하지 않습니다.</span>
      </section>

      <section className="item-list" aria-label="변경 목록">
        {filtered.length ? (
          filtered.map((item) => <ItemRow key={item.id} item={item} detailHrefPrefix={detailHrefPrefix} />)
        ) : (
          <div className="empty-state">
            <strong>표시할 항목이 없습니다.</strong>
            <span>현재 필터 조건에 맞는 수집 결과가 없습니다.</span>
          </div>
        )}
      </section>

      <section className="logs-panel" aria-label="수집 로그">
        <h2>최근 수집 로그</h2>
        {logs.length ? (
          <ul>
            {logs.slice(0, 8).map((log, index) => (
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

  return (
    <article className="item-card">
      <div className="item-main">
        <div className="item-meta">
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
        <p>{item.summary || "자동요약 전입니다. 원문 링크를 먼저 확인하세요."}</p>
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
