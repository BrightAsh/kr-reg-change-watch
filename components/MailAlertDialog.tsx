"use client";

import { useEffect, useMemo, useState } from "react";
import { categoryLabels } from "@/lib/categories";
import { changeTypeLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import { publicInstitutionSystemGroups } from "@/lib/publicInstitutionSystem";
import type { ChangeType, DocumentType, RegulatoryCategory, SourceType } from "@/lib/types";

interface Props {
  ministries: string[];
}

type MailWorkspaceMode = "all" | "public-system";
type CategoryFilter = "all" | RegulatoryCategory;
type DialogPanel = "subscribe" | "unsubscribe";
type CopyState = "idle" | "copied" | "saved" | "error";

interface MailSubscription {
  email: string;
  mode: MailWorkspaceMode;
  category?: CategoryFilter;
  systemGroup?: string;
  filters?: {
    ministries?: string[];
    sourceTypes?: SourceType[];
    documentTypes?: DocumentType[];
    changeTypes?: ChangeType[];
    query?: string;
  };
  active?: boolean;
}

interface Option {
  value: string;
  label: string;
}

const storageKey = "kr-reg-mail-alert-draft";
const sourceOptions = (Object.keys(sourceTypeLabels) as SourceType[]).map((value) => ({
  value,
  label: sourceTypeLabels[value]
}));
const documentOptions = (Object.keys(documentTypeLabels) as DocumentType[]).map((value) => ({
  value,
  label: documentTypeLabels[value]
}));
const changeOptions = (Object.keys(changeTypeLabels) as ChangeType[]).map((value) => ({
  value,
  label: changeTypeLabels[value]
}));
const categoryOptions: Array<{ value: CategoryFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "law", label: categoryLabels.law },
  { value: "notice", label: categoryLabels.notice },
  { value: "guideline", label: categoryLabels.guideline },
  { value: "news", label: categoryLabels.news }
];

export default function MailAlertDialog({ ministries }: Props) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<DialogPanel>("subscribe");
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState<MailWorkspaceMode>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [systemGroup, setSystemGroup] = useState("all");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const ministryOptions = useMemo(() => ministries.map((value) => ({ value, label: value })), [ministries]);
  const subscription = useMemo(
    () =>
      buildSubscription({
        email,
        mode,
        category,
        systemGroup,
        ministries: selectedMinistries,
        sources: selectedSources.filter(isSourceType),
        documents: selectedDocuments.filter(isDocumentType),
        changes: selectedChanges.filter(isChangeType),
        query
      }),
    [category, email, mode, query, selectedChanges, selectedDocuments, selectedMinistries, selectedSources, systemGroup]
  );
  const configJson = useMemo(() => JSON.stringify([subscription], null, 2), [subscription]);
  const unsubscribeValue = email.trim();
  const canBuild = Boolean(email.trim() && email.includes("@"));
  const activeAdvancedCount =
    selectedMinistries.length + selectedSources.length + selectedDocuments.length + selectedChanges.length + (query.trim() ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    setCopyState("idle");

    const saved = readSavedSubscription();
    if (!saved) return;
    applySubscription(saved);
  }, [open]);

  function applySubscription(saved: MailSubscription) {
    setEmail(saved.email || "");
    setMode(saved.mode === "public-system" ? "public-system" : "all");
    setCategory(readCategory(saved.category));
    setSystemGroup(readSystemGroup(saved.systemGroup));
    setSelectedMinistries(filterStrings(saved.filters?.ministries, ministries));
    setSelectedSources(filterStrings(saved.filters?.sourceTypes, sourceOptions.map((option) => option.value)));
    setSelectedDocuments(filterStrings(saved.filters?.documentTypes, documentOptions.map((option) => option.value)));
    setSelectedChanges(filterStrings(saved.filters?.changeTypes, changeOptions.map((option) => option.value)));
    setQuery(saved.filters?.query || "");
    setAdvancedOpen(Boolean(saved.filters && Object.keys(saved.filters).length));
  }

  function updateMode(nextMode: MailWorkspaceMode) {
    setMode(nextMode);
    if (nextMode === "all") setSystemGroup("all");
    if (nextMode === "public-system") setCategory("all");
  }

  async function copyConfig() {
    if (!canBuild) return;
    await copyText(configJson);
  }

  async function copyUnsubscribe() {
    if (!unsubscribeValue) return;
    await copyText(unsubscribeValue);
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  function saveDraft() {
    if (!canBuild) return;
    localStorage.setItem(storageKey, JSON.stringify(subscription));
    setCopyState("saved");
  }

  function clearLocalDraft() {
    localStorage.removeItem(storageKey);
    setEmail("");
    setSelectedMinistries([]);
    setSelectedSources([]);
    setSelectedDocuments([]);
    setSelectedChanges([]);
    setQuery("");
    setCopyState("saved");
  }

  if (!open) {
    return (
      <button className="mail-alert-button" type="button" onClick={() => setOpen(true)}>
        <span className="mail-alert-icon" aria-hidden="true" />
        <span>일일 알림 받기</span>
      </button>
    );
  }

  return (
    <>
      <button className="mail-alert-button active" type="button" onClick={() => setOpen(true)}>
        <span className="mail-alert-icon" aria-hidden="true" />
        <span>일일 알림 받기</span>
      </button>
      <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
        <section
          className="ai-modal mail-modal"
          role="dialog"
          aria-modal="true"
          aria-label="메일 알림 설정"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <span>메일 알림</span>
              <strong>매일 필요한 변경만 받기</strong>
            </div>
            <button type="button" aria-label="닫기" onClick={() => setOpen(false)}>
              ×
            </button>
          </div>

          <div className="mail-mode-tabs" aria-label="메일 알림 작업">
            <button className={panel === "subscribe" ? "active" : ""} type="button" onClick={() => setPanel("subscribe")}>
              알림 설정
            </button>
            <button className={panel === "unsubscribe" ? "active" : ""} type="button" onClick={() => setPanel("unsubscribe")}>
              수신 중지
            </button>
          </div>

          {panel === "subscribe" ? (
            <>
              <label className="field-label">
                <span>받을 이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </label>

              <div className="mail-field-group">
                <span className="mail-field-title">탭</span>
                <div className="mail-segmented">
                  <button className={mode === "all" ? "active" : ""} type="button" onClick={() => updateMode("all")}>
                    전체 수집
                  </button>
                  <button
                    className={mode === "public-system" ? "active" : ""}
                    type="button"
                    onClick={() => updateMode("public-system")}
                  >
                    공공기관 9개 체계
                  </button>
                </div>
              </div>

              <div className="mail-field-group">
                <span className="mail-field-title">항목</span>
                {mode === "all" ? (
                  <div className="mail-choice-grid compact">
                    {categoryOptions.map((option) => (
                      <button
                        className={category === option.value ? "active" : ""}
                        key={option.value}
                        type="button"
                        onClick={() => setCategory(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mail-choice-grid system">
                    <button
                      className={systemGroup === "all" ? "active" : ""}
                      type="button"
                      onClick={() => setSystemGroup("all")}
                    >
                      9개 항목 전체
                    </button>
                    {publicInstitutionSystemGroups.map((group) => (
                      <button
                        className={systemGroup === group.id ? "active" : ""}
                        key={group.id}
                        type="button"
                        onClick={() => setSystemGroup(group.id)}
                      >
                        {group.order}. {group.shortTitle}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <details
                className="mail-advanced"
                open={advancedOpen}
                onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
              >
                <summary>
                  <span>추가 필터</span>
                  {activeAdvancedCount ? <strong>{activeAdvancedCount.toLocaleString("ko-KR")}</strong> : null}
                </summary>
                <div className="mail-filter-grid">
                  <CheckGroup
                    label="기관"
                    options={ministryOptions}
                    selected={selectedMinistries}
                    onToggle={(value) => setSelectedMinistries((current) => toggleValue(current, value))}
                    onClear={() => setSelectedMinistries([])}
                  />
                  <CheckGroup
                    label="출처"
                    options={sourceOptions}
                    selected={selectedSources}
                    onToggle={(value) => setSelectedSources((current) => toggleValue(current, value))}
                    onClear={() => setSelectedSources([])}
                  />
                  <CheckGroup
                    label="문서"
                    options={documentOptions}
                    selected={selectedDocuments}
                    onToggle={(value) => setSelectedDocuments((current) => toggleValue(current, value))}
                    onClear={() => setSelectedDocuments([])}
                  />
                  <CheckGroup
                    label="변경"
                    options={changeOptions}
                    selected={selectedChanges}
                    onToggle={(value) => setSelectedChanges((current) => toggleValue(current, value))}
                    onClear={() => setSelectedChanges([])}
                  />
                  <label className="field-label mail-query-field">
                    <span>검색어</span>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 본문, 기관" />
                  </label>
                </div>
              </details>

              <label className="field-label">
                <span>MAIL_SUBSCRIPTIONS_JSON</span>
                <textarea readOnly value={configJson} rows={8} />
              </label>

              <div className="modal-actions">
                <button disabled={!canBuild} type="button" onClick={copyConfig}>
                  설정 JSON 복사
                </button>
                <button className="secondary" disabled={!canBuild} type="button" onClick={saveDraft}>
                  브라우저에 저장
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field-label">
                <span>중지할 이메일</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label className="field-label">
                <span>MAIL_UNSUBSCRIBE_EMAILS</span>
                <textarea readOnly value={unsubscribeValue} rows={3} />
              </label>
              <div className="modal-actions">
                <button disabled={!unsubscribeValue} type="button" onClick={copyUnsubscribe}>
                  중지 값 복사
                </button>
                <button className="secondary" type="button" onClick={clearLocalDraft}>
                  저장값 삭제
                </button>
              </div>
            </>
          )}

          {copyState !== "idle" ? (
            <p className={copyState === "error" ? "mail-feedback error" : "mail-feedback"}>
              {copyState === "copied"
                ? "복사했습니다."
                : copyState === "saved"
                  ? "저장했습니다."
                  : "브라우저 복사 권한을 확인해 주세요."}
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}

function CheckGroup({
  label,
  options,
  selected,
  onToggle,
  onClear
}: {
  label: string;
  options: Option[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="mail-check-group">
      <div>
        <strong>{label}</strong>
        {selected.length ? (
          <button type="button" onClick={onClear}>
            전체 해제
          </button>
        ) : null}
      </div>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input type="checkbox" checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function buildSubscription({
  email,
  mode,
  category,
  systemGroup,
  ministries,
  sources,
  documents,
  changes,
  query
}: {
  email: string;
  mode: MailWorkspaceMode;
  category: CategoryFilter;
  systemGroup: string;
  ministries: string[];
  sources: SourceType[];
  documents: DocumentType[];
  changes: ChangeType[];
  query: string;
}): MailSubscription {
  const filters: NonNullable<MailSubscription["filters"]> = {};
  if (ministries.length) filters.ministries = ministries;
  if (sources.length) filters.sourceTypes = sources;
  if (documents.length) filters.documentTypes = documents;
  if (changes.length) filters.changeTypes = changes;
  if (query.trim()) filters.query = query.trim();

  return {
    email: email.trim(),
    mode,
    ...(mode === "all" ? { category } : { systemGroup }),
    ...(Object.keys(filters).length ? { filters } : {}),
    active: true
  };
}

function readSavedSubscription(): MailSubscription | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as MailSubscription;
  } catch {
    return null;
  }
}

function readCategory(value: unknown): CategoryFilter {
  return categoryOptions.some((option) => option.value === value) ? (value as CategoryFilter) : "all";
}

function readSystemGroup(value: unknown): string {
  return typeof value === "string" && publicInstitutionSystemGroups.some((group) => group.id === value) ? value : "all";
}

function filterStrings(values: unknown, allowed: string[]): string[] {
  if (!Array.isArray(values)) return [];
  const allowedSet = new Set(allowed);
  return values.filter((value): value is string => typeof value === "string" && allowedSet.has(value));
}

function toggleValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

function isSourceType(value: string): value is SourceType {
  return sourceOptions.some((option) => option.value === value);
}

function isDocumentType(value: string): value is DocumentType {
  return documentOptions.some((option) => option.value === value);
}

function isChangeType(value: string): value is ChangeType {
  return changeOptions.some((option) => option.value === value);
}
