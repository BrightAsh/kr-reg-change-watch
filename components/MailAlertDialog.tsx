"use client";

import { useEffect, useMemo, useState } from "react";
import { categoryLabels } from "@/lib/categories";
import { changeTypeLabels, documentTypeLabels, sourceTypeLabels } from "@/lib/labels";
import { publicInstitutionSystemGroups } from "@/lib/publicInstitutionSystem";
import type { ChangeType, DocumentType, RegulatoryCategory, SourceType } from "@/lib/types";

interface Props {
  ministries: string[];
  dataMinistries?: string[];
}

type MailWorkspaceMode = "all" | "public-system" | "data";
type CategoryFilter = "all" | RegulatoryCategory;
type DialogPanel = "subscribe" | "unsubscribe";
type FeedbackState = "idle" | "working" | "registered" | "unsubscribed" | "found" | "missing" | "not-configured" | "error";

interface MailSubscription {
  email: string;
  mode: MailWorkspaceMode;
  category?: CategoryFilter;
  categories?: RegulatoryCategory[];
  systemGroup?: string;
  systemGroups?: string[];
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

interface SubscriptionApiResponse {
  ok?: boolean;
  found?: boolean;
  created?: boolean;
  unsubscribed?: boolean;
  subscriber?: unknown;
  subscribers?: unknown[];
  error?: string;
}

const subscriptionApiUrl = process.env.NEXT_PUBLIC_SUBSCRIPTION_API_URL || "";
const customDomainValue = "__custom__";
const commonEmailDomains = ["gmail.com", "naver.com", "daum.net", "kakao.com", "hanmail.net", "outlook.com", "icloud.com"];
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

export default function MailAlertDialog({ ministries, dataMinistries = [] }: Props) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<DialogPanel>("subscribe");
  const [emailLocal, setEmailLocal] = useState("");
  const [emailDomain, setEmailDomain] = useState("gmail.com");
  const [customEmailDomain, setCustomEmailDomain] = useState("");
  const [mode, setMode] = useState<MailWorkspaceMode>("all");
  const [selectedCategories, setSelectedCategories] = useState<RegulatoryCategory[]>([]);
  const [selectedSystemGroups, setSelectedSystemGroups] = useState<string[]>([]);
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [selectedChanges, setSelectedChanges] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");
  const [checkedEmail, setCheckedEmail] = useState("");
  const [checkedEmailFound, setCheckedEmailFound] = useState(false);

  const email = useMemo(() => buildEmailAddress(emailLocal, emailDomain, customEmailDomain), [
    customEmailDomain,
    emailDomain,
    emailLocal
  ]);
  const ministryOptions = useMemo(() => {
    const values = mode === "data" ? dataMinistries : ministries;
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")).map((value) => ({ value, label: value }));
  }, [dataMinistries, ministries, mode]);
  const subscription = useMemo(
    () =>
      buildSubscription({
        email,
        mode,
        categories: selectedCategories,
        systemGroups: selectedSystemGroups,
        ministries: selectedMinistries,
        sources: selectedSources.filter(isSourceType),
        documents: selectedDocuments.filter(isDocumentType),
        changes: selectedChanges.filter(isChangeType),
        query
      }),
    [email, mode, query, selectedCategories, selectedChanges, selectedDocuments, selectedMinistries, selectedSources, selectedSystemGroups]
  );
  const busy = feedbackState === "working";
  const apiReady = Boolean(subscriptionApiUrl);
  const validEmail = isEmailAddress(email);
  const emailChecked = validEmail && normalizeEmail(checkedEmail) === normalizeEmail(email);
  const canCheck = apiReady && validEmail && !busy;
  const canSubscribe = apiReady && validEmail && emailChecked && !busy;
  const canUnsubscribe = canSubscribe && checkedEmailFound;
  const activeAdvancedCount =
    selectedMinistries.length + selectedSources.length + selectedDocuments.length + selectedChanges.length + (query.trim() ? 1 : 0);

  useEffect(() => {
    if (!open) return;
    setFeedbackState("idle");
  }, [open]);

  useEffect(() => {
    setCheckedEmail("");
    setCheckedEmailFound(false);
  }, [panel]);

  function applySubscription(saved: MailSubscription) {
    const savedMode = parseMailWorkspaceMode(saved.mode);
    const validMinistries = savedMode === "data" ? dataMinistries : ministries;
    setEmailParts(saved.email || "");
    setMode(savedMode);
    setSelectedCategories(readCategories(saved));
    setSelectedSystemGroups(readSystemGroups(saved));
    setSelectedMinistries(filterStrings(saved.filters?.ministries, validMinistries));
    setSelectedSources(filterStrings(saved.filters?.sourceTypes, sourceOptions.map((option) => option.value)));
    setSelectedDocuments(filterStrings(saved.filters?.documentTypes, documentOptions.map((option) => option.value)));
    setSelectedChanges(filterStrings(saved.filters?.changeTypes, changeOptions.map((option) => option.value)));
    setQuery(saved.filters?.query || "");
    setAdvancedOpen(Boolean(saved.filters && Object.keys(saved.filters).length));
  }

  function setEmailParts(value: string) {
    const parsed = parseEmailAddress(value);
    setEmailLocal(parsed.local);
    if (parsed.domain && commonEmailDomains.includes(parsed.domain)) {
      setEmailDomain(parsed.domain);
      setCustomEmailDomain("");
      return;
    }
    if (parsed.domain) {
      setEmailDomain(customDomainValue);
      setCustomEmailDomain(parsed.domain);
    }
  }

  function updateEmailLocal(value: string) {
    setFeedbackState("idle");
    setCheckedEmail("");
    setCheckedEmailFound(false);
    if (value.includes("@")) {
      setEmailParts(value);
      return;
    }
    setEmailLocal(value.replace(/\s/g, ""));
  }

  function updateEmailDomain(value: string) {
    setFeedbackState("idle");
    setCheckedEmail("");
    setCheckedEmailFound(false);
    setEmailDomain(value);
  }

  async function checkEmailRegistration() {
    if (!apiReady) {
      setFeedbackState("not-configured");
      return;
    }
    if (!validEmail || busy) return;

    setFeedbackState("working");
    try {
      const response = await callSubscriptionApi("lookup", { email: normalizeEmail(email) });
      if (!response.ok) throw new Error(response.error || "Lookup failed.");
      const saved = normalizeApiSubscription(response.subscriber);
      if (response.found && saved && normalizeEmail(saved.email) === normalizeEmail(email)) {
        applySubscription(saved);
        setCheckedEmail(saved.email);
        setCheckedEmailFound(true);
        setFeedbackState("found");
        return;
      }
      setCheckedEmail(normalizeEmail(email));
      setCheckedEmailFound(false);
      setFeedbackState("missing");
    } catch {
      setCheckedEmail("");
      setCheckedEmailFound(false);
      setFeedbackState("error");
    }
  }

  function updateMode(nextMode: MailWorkspaceMode) {
    setMode(nextMode);
    if (nextMode !== "public-system") setSelectedSystemGroups([]);
    if (nextMode !== "all") setSelectedCategories([]);
    setSelectedMinistries([]);
  }

  async function requestSubscription() {
    if (!apiReady) {
      setFeedbackState("not-configured");
      return;
    }
    if (!validEmail || busy) return;

    setFeedbackState("working");
    try {
      const response = await callSubscriptionApi("upsert", {
        payload: base64UrlEncode(JSON.stringify(subscription))
      });
      if (!response.ok) throw new Error(response.error || "Subscription failed.");
      const saved = normalizeApiSubscription(response.subscriber);
      if (saved) applySubscription(saved);
      setCheckedEmail(subscription.email);
      setCheckedEmailFound(true);
      setFeedbackState("registered");
    } catch {
      setFeedbackState("error");
    }
  }

  async function requestUnsubscribe() {
    if (!canUnsubscribe) return;

    setFeedbackState("working");
    try {
      const response = await callSubscriptionApi("unsubscribe", { email: normalizeEmail(email) });
      if (!response.ok) throw new Error(response.error || "Unsubscribe failed.");
      if (!response.found || !response.unsubscribed) {
        setCheckedEmail("");
        setCheckedEmailFound(false);
        setFeedbackState("missing");
        return;
      }
      setCheckedEmail("");
      setCheckedEmailFound(false);
      setFeedbackState("unsubscribed");
    } catch {
      setFeedbackState("error");
    }
  }

  function toggleCategory(value: RegulatoryCategory) {
    setSelectedCategories((current) => toggleValue(current, value) as RegulatoryCategory[]);
  }

  function toggleSystemGroup(value: string) {
    setSelectedSystemGroups((current) => toggleValue(current, value));
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
                <div className={emailDomain === customDomainValue ? "mail-email-row custom" : "mail-email-row"}>
                  <input
                    aria-label="이메일 아이디"
                    value={emailLocal}
                    onChange={(event) => updateEmailLocal(event.target.value)}
                    placeholder="email"
                  />
                  <span className="mail-at" aria-hidden="true">
                    @
                  </span>
                  <select
                    aria-label="이메일 도메인"
                    value={emailDomain}
                    onChange={(event) => updateEmailDomain(event.target.value)}
                  >
                    {commonEmailDomains.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                    <option value={customDomainValue}>직접 입력</option>
                  </select>
                  {emailDomain === customDomainValue ? (
                    <input
                      aria-label="이메일 도메인 직접 입력"
                      value={customEmailDomain}
                      onChange={(event) => {
                        setFeedbackState("idle");
                        setCheckedEmail("");
                        setCheckedEmailFound(false);
                        setCustomEmailDomain(event.target.value.replace(/\s/g, ""));
                      }}
                      placeholder="company.com"
                    />
                  ) : null}
                  <button className="mail-check-button" disabled={!canCheck} type="button" onClick={checkEmailRegistration}>
                    아이디 확인
                  </button>
                </div>
                <small className="mail-help-text">아이디 확인 후 수신 신청할 수 있습니다.</small>
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
                  <button className={mode === "data" ? "active" : ""} type="button" onClick={() => updateMode("data")}>
                    데이터
                  </button>
                </div>
              </div>

              <div className="mail-field-group">
                <span className="mail-field-title">항목</span>
                {mode === "all" ? (
                  <div className="mail-choice-grid compact">
                    {categoryOptions.map((option) => (
                      option.value === "all" ? (
                        <button
                          className={!selectedCategories.length ? "active" : ""}
                          key={option.value}
                          type="button"
                          aria-pressed={!selectedCategories.length}
                          onClick={() => setSelectedCategories([])}
                        >
                          {option.label}
                        </button>
                      ) : (
                        <button
                          className={selectedCategories.includes(option.value as RegulatoryCategory) ? "active" : ""}
                          key={option.value}
                          type="button"
                          aria-pressed={selectedCategories.includes(option.value as RegulatoryCategory)}
                          onClick={() => toggleCategory(option.value as RegulatoryCategory)}
                        >
                          {option.label}
                        </button>
                      )
                    ))}
                  </div>
                ) : mode === "public-system" ? (
                  <div className="mail-choice-grid system">
                    <button
                      className={!selectedSystemGroups.length ? "active" : ""}
                      type="button"
                      aria-pressed={!selectedSystemGroups.length}
                      onClick={() => setSelectedSystemGroups([])}
                    >
                      9개 항목 전체
                    </button>
                    {publicInstitutionSystemGroups.map((group) => (
                      <button
                        className={selectedSystemGroups.includes(group.id) ? "active" : ""}
                        key={group.id}
                        type="button"
                        aria-pressed={selectedSystemGroups.includes(group.id)}
                        onClick={() => toggleSystemGroup(group.id)}
                      >
                        {group.order}. {group.shortTitle}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mail-choice-grid compact">
                    <button className="active" type="button" aria-pressed="true">
                      데이터 전체
                    </button>
                  </div>
                )}
              </div>

              <div className={advancedOpen ? "mail-advanced open" : "mail-advanced"}>
                <button
                  className="mail-advanced-toggle"
                  type="button"
                  aria-expanded={advancedOpen}
                  onClick={() => setAdvancedOpen((current) => !current)}
                >
                  <span>추가 필터</span>
                  <span className="mail-advanced-status">
                    {activeAdvancedCount ? <strong>{activeAdvancedCount.toLocaleString("ko-KR")}</strong> : null}
                    <span className="mail-chevron" aria-hidden="true" />
                  </span>
                </button>
                <div className="mail-advanced-body">
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
                </div>
              </div>

              <div className="modal-actions">
                <button disabled={!canSubscribe} type="button" onClick={requestSubscription}>
                  수신 신청
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="field-label">
                <span>중지할 이메일</span>
                <div className={emailDomain === customDomainValue ? "mail-email-row custom" : "mail-email-row"}>
                  <input
                    aria-label="중지할 이메일 아이디"
                    value={emailLocal}
                    onChange={(event) => updateEmailLocal(event.target.value)}
                    placeholder="email"
                  />
                  <span className="mail-at" aria-hidden="true">
                    @
                  </span>
                  <select
                    aria-label="중지할 이메일 도메인"
                    value={emailDomain}
                    onChange={(event) => updateEmailDomain(event.target.value)}
                  >
                    {commonEmailDomains.map((domain) => (
                      <option key={domain} value={domain}>
                        {domain}
                      </option>
                    ))}
                    <option value={customDomainValue}>직접 입력</option>
                  </select>
                  {emailDomain === customDomainValue ? (
                    <input
                      aria-label="중지할 이메일 도메인 직접 입력"
                      value={customEmailDomain}
                      onChange={(event) => {
                        setFeedbackState("idle");
                        setCheckedEmail("");
                        setCheckedEmailFound(false);
                        setCustomEmailDomain(event.target.value.replace(/\s/g, ""));
                      }}
                      placeholder="company.com"
                    />
                  ) : null}
                  <button className="mail-check-button" disabled={!canCheck} type="button" onClick={checkEmailRegistration}>
                    아이디 확인
                  </button>
                </div>
                <small className="mail-help-text">아이디 확인 후 수신 중지할 수 있습니다.</small>
              </label>
              <div className="modal-actions">
                <button disabled={!canUnsubscribe} type="button" onClick={requestUnsubscribe}>
                  수신 중지
                </button>
              </div>
            </>
          )}

          {!apiReady && feedbackState === "idle" ? (
            <p className="mail-feedback error">알림 등록 API가 아직 설정되지 않았습니다.</p>
          ) : null}

          {feedbackState !== "idle" ? (
            <p className={feedbackState === "error" || feedbackState === "not-configured" ? "mail-feedback error" : "mail-feedback"}>
              {feedbackState === "registered"
                ? "등록되었습니다."
                : feedbackState === "unsubscribed"
                  ? "수신 거부되었습니다."
                  : feedbackState === "found"
                    ? "등록된 이력이 있습니다."
                    : feedbackState === "missing"
                      ? "등록된 아이디가 없습니다."
                      : feedbackState === "working"
                        ? "처리 중입니다."
                        : feedbackState === "not-configured"
                          ? "알림 등록 API가 아직 설정되지 않았습니다."
                          : "요청 처리 중 오류가 발생했습니다."}
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
  categories,
  systemGroups,
  ministries,
  sources,
  documents,
  changes,
  query
}: {
  email: string;
  mode: MailWorkspaceMode;
  categories: RegulatoryCategory[];
  systemGroups: string[];
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
    ...(mode === "all" ? (categories.length ? { categories } : { category: "all" as const }) : {}),
    ...(mode === "public-system" ? (systemGroups.length ? { systemGroups } : { systemGroup: "all" }) : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
    active: true
  };
}

function buildEmailAddress(local: string, domain: string, customDomain: string): string {
  const normalizedLocal = local.trim();
  const normalizedDomain = (domain === customDomainValue ? customDomain : domain).trim().replace(/^@+/, "");
  if (!normalizedLocal || !normalizedDomain) return normalizedLocal;
  return `${normalizedLocal}@${normalizedDomain}`.toLowerCase();
}

function callSubscriptionApi(action: string, params: Record<string, string>): Promise<SubscriptionApiResponse> {
  return new Promise((resolve, reject) => {
    if (!subscriptionApiUrl) {
      reject(new Error("Subscription API URL is not configured."));
      return;
    }

    const callbackName = `krRegMail_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const callbacks = window as unknown as Record<string, (payload: SubscriptionApiResponse) => void>;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Subscription API request timed out."));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete callbacks[callbackName];
      script.remove();
    }

    callbacks[callbackName] = (payload: SubscriptionApiResponse) => {
      cleanup();
      resolve(payload);
    };

    try {
      const url = new URL(subscriptionApiUrl);
      url.searchParams.set("action", action);
      url.searchParams.set("callback", callbackName);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      script.src = url.toString();
      script.async = true;
      script.onerror = () => {
        cleanup();
        reject(new Error("Subscription API request failed."));
      };
      document.head.appendChild(script);
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function normalizeApiSubscription(value: unknown): MailSubscription | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const email = typeof record.email === "string" ? record.email : "";
  if (!isEmailAddress(email)) return null;

  const mode = parseMailWorkspaceMode(record.mode);
  const filters = normalizeApiFilters(record.filters);

  return {
    email: normalizeEmail(email),
    mode,
    ...(mode === "all" ? { categories: filterStrings(record.categories, categoryOptions.map((option) => option.value)) as RegulatoryCategory[] } : {}),
    ...(mode === "public-system" ? { systemGroups: filterStrings(record.systemGroups, publicInstitutionSystemGroups.map((group) => group.id)) } : {}),
    ...(Object.keys(filters).length ? { filters } : {}),
    active: record.active !== false
  };
}

function parseMailWorkspaceMode(value: unknown): MailWorkspaceMode {
  return value === "public-system" || value === "data" ? value : "all";
}

function normalizeApiFilters(value: unknown): NonNullable<MailSubscription["filters"]> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const filters: NonNullable<MailSubscription["filters"]> = {};

  const ministries = readStringArray(record.ministries);
  const sourceTypes = filterStrings(record.sourceTypes, sourceOptions.map((option) => option.value)) as SourceType[];
  const documentTypes = filterStrings(record.documentTypes, documentOptions.map((option) => option.value)) as DocumentType[];
  const changeTypes = filterStrings(record.changeTypes, changeOptions.map((option) => option.value)) as ChangeType[];
  const query = typeof record.query === "string" ? record.query.trim() : "";

  if (ministries.length) filters.ministries = ministries;
  if (sourceTypes.length) filters.sourceTypes = sourceTypes;
  if (documentTypes.length) filters.documentTypes = documentTypes;
  if (changeTypes.length) filters.changeTypes = changeTypes;
  if (query) filters.query = query;

  return filters;
}

function base64UrlEncode(value: string): string {
  const bytes = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  return btoa(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || "").trim()).filter(Boolean);
}

function parseEmailAddress(value: string): { local: string; domain: string } {
  const normalized = value.trim().replace(/\s/g, "").toLowerCase();
  const atIndex = normalized.indexOf("@");
  if (atIndex === -1) return { local: normalized, domain: "" };
  return {
    local: normalized.slice(0, atIndex),
    domain: normalized.slice(atIndex + 1).replace(/^@+/, "")
  };
}

function normalizeEmail(value: string): string {
  return buildEmailAddress(parseEmailAddress(value).local, customDomainValue, parseEmailAddress(value).domain);
}

function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function readCategories(value: MailSubscription): RegulatoryCategory[] {
  const valid = categoryOptions.filter((option) => option.value !== "all").map((option) => option.value);
  const values = Array.isArray(value.categories) ? value.categories : value.category && value.category !== "all" ? [value.category] : [];
  return filterStrings(values, valid) as RegulatoryCategory[];
}

function readSystemGroups(value: MailSubscription): string[] {
  const valid = publicInstitutionSystemGroups.map((group) => group.id);
  const values = Array.isArray(value.systemGroups)
    ? value.systemGroups
    : value.systemGroup && value.systemGroup !== "all"
      ? [value.systemGroup]
      : [];
  return filterStrings(values, valid);
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
