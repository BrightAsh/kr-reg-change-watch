"use client";

import { useEffect, useMemo, useState } from "react";

type AiProviderId = "gemini" | "groq" | "openrouter" | "openai";
type SummaryStatus = "idle" | "working" | "done" | "error";
type JsonRecord = Record<string, unknown>;

interface AiModelOption {
  value: string;
  label: string;
}

interface AiProviderConfig {
  label: string;
  description: string;
  keyLabel: string;
  keyPlaceholder: string;
  note: string;
  models: AiModelOption[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  input: string;
  instructions: string;
  submitLabel: string;
  workingLabel: string;
  resultTitle: string;
  errorTitle: string;
  maxOutputTokens: number;
  disabled?: boolean;
  disabledMessage?: string;
}

const providerStorageKey = "kr-reg-ai-provider";
const customModelValue = "__custom__";
const legacyOpenAiKey = "kr-reg-openai-key";

const providers: Record<AiProviderId, AiProviderConfig> = {
  gemini: {
    label: "Gemini",
    description: "무료 티어 우선",
    keyLabel: "Gemini API 키",
    keyPlaceholder: "AIza...",
    note: "Google AI Studio에서 발급한 키를 사용합니다.",
    models: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" }
    ]
  },
  groq: {
    label: "Groq",
    description: "빠른 응답",
    keyLabel: "Groq API 키",
    keyPlaceholder: "gsk_...",
    note: "GroqCloud에서 발급한 키를 사용합니다.",
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { value: "qwen/qwen3-32b", label: "Qwen3 32B" },
      { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B" }
    ]
  },
  openrouter: {
    label: "OpenRouter",
    description: "모델 선택 폭 넓음",
    keyLabel: "OpenRouter API 키",
    keyPlaceholder: "sk-or-...",
    note: "OpenRouter의 무료 모델은 혼잡하거나 변경될 수 있습니다.",
    models: [
      { value: "openrouter/free", label: "Free Router" },
      { value: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B Free" },
      { value: "deepseek/deepseek-r1-0528:free", label: "DeepSeek R1 Free" },
      { value: "meta-llama/llama-4-scout:free", label: "Llama 4 Scout Free" }
    ]
  },
  openai: {
    label: "OpenAI",
    description: "GPT API",
    keyLabel: "OpenAI API 키",
    keyPlaceholder: "sk-...",
    note: "OpenAI Responses API를 사용합니다.",
    models: [
      { value: "gpt-5", label: "GPT-5" },
      { value: "gpt-5-mini", label: "GPT-5 mini" }
    ]
  }
};

export default function AiSummaryDialog({
  open,
  onClose,
  title,
  subtitle,
  input,
  instructions,
  submitLabel,
  workingLabel,
  resultTitle,
  errorTitle,
  maxOutputTokens,
  disabled,
  disabledMessage
}: Props) {
  const [providerId, setProviderId] = useState<AiProviderId>("gemini");
  const [model, setModel] = useState(providers.gemini.models[0].value);
  const [apiKey, setApiKey] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [status, setStatus] = useState<SummaryStatus>("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const provider = providers[providerId];
  const presetModelValue = provider.models.some((option) => option.value === model) ? model : customModelValue;
  const providerOptions = useMemo(
    () => Object.entries(providers) as Array<[AiProviderId, AiProviderConfig]>,
    []
  );
  const canRun = Boolean(apiKey.trim() && model.trim() && input.trim() && !disabled && status !== "working");

  useEffect(() => {
    if (!open) return;
    const savedProvider = readProvider(localStorage.getItem(providerStorageKey));
    const savedModel = readStoredModel(savedProvider);
    const savedKey = readStoredKey(savedProvider);

    setProviderId(savedProvider);
    setModel(savedModel);
    setApiKey(savedKey);
    setSetupMode(!savedKey);
    setStatus("idle");
    setResult("");
    setError("");

    if (savedKey && savedModel && input.trim() && !disabled) {
      void runSummaryWith(savedProvider, savedModel, savedKey);
    }
  }, [open]);

  function selectProvider(nextProvider: AiProviderId) {
    const nextModel = readStoredModel(nextProvider);
    const nextKey = readStoredKey(nextProvider);
    setProviderId(nextProvider);
    setModel(nextModel);
    setApiKey(nextKey);
    setResult("");
    setError("");
    setStatus("idle");
  }

  function saveModel(value: string) {
    setModel(value);
  }

  function saveCurrentSettings() {
    const nextProvider = providerId;
    const nextModel = model.trim();
    const nextKey = apiKey.trim();
    if (!nextModel || !nextKey) return;

    localStorage.setItem(providerStorageKey, nextProvider);
    localStorage.setItem(modelStorageKey(nextProvider), nextModel);
    localStorage.setItem(keyStorageKey(nextProvider), nextKey);
    setSetupMode(false);
    void runSummaryWith(nextProvider, nextModel, nextKey);
  }

  function deleteCurrentKey() {
    localStorage.removeItem(keyStorageKey(providerId));
    sessionStorage.removeItem(keyStorageKey(providerId));
    if (providerId === "openai") sessionStorage.removeItem(legacyOpenAiKey);
    setApiKey("");
    setSetupMode(true);
    setStatus("idle");
    setResult("");
    setError("");
  }

  async function runSummaryWith(nextProvider: AiProviderId, nextModel: string, nextKey: string) {
    if (!nextKey.trim() || !nextModel.trim() || !input.trim() || disabled) return;
    setStatus("working");
    setResult("");
    setError("");

    try {
      const text = await requestAiSummary({
        providerId: nextProvider,
        model: nextModel.trim(),
        apiKey: nextKey.trim(),
        instructions,
        input,
        maxOutputTokens
      });
      setResult(text || "요약 결과가 비어 있습니다.");
      setStatus("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="ai-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>{title}</span>
            <strong>{subtitle}</strong>
          </div>
          <button type="button" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>

        {disabled ? (
          <>
            <p className="modal-note">{disabledMessage || "요약할 자료가 없습니다."}</p>
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={onClose}>
                닫기
              </button>
            </div>
          </>
        ) : setupMode ? (
          <>
            <div className="ai-provider-grid" aria-label="AI 모델 제공자">
              {providerOptions.map(([id, option]) => (
                <button
                  className={id === providerId ? "ai-provider-option active" : "ai-provider-option"}
                  key={id}
                  type="button"
                  onClick={() => selectProvider(id)}
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>

            <label className="field-label">
              <span>모델</span>
              <select
                value={presetModelValue}
                onChange={(event) =>
                  event.target.value === customModelValue ? saveModel("") : saveModel(event.target.value)
                }
              >
                {provider.models.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value={customModelValue}>직접 입력</option>
              </select>
            </label>

            {presetModelValue === customModelValue ? (
              <label className="field-label">
                <span>모델 ID</span>
                <input
                  value={model}
                  onChange={(event) => saveModel(event.target.value)}
                  placeholder="provider/model-name"
                />
              </label>
            ) : null}

            <label className="field-label">
              <span>{provider.keyLabel}</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={provider.keyPlaceholder}
              />
            </label>

            <p className="modal-note">
              {`${provider.note} 키는 이 브라우저에 저장되고, 다음부터 AI 버튼을 누르면 바로 실행됩니다.`}
            </p>

            <div className="modal-actions">
              <button disabled={!canRun} type="button" onClick={saveCurrentSettings}>
                키 저장 후 실행
              </button>
              {apiKey ? (
                <button className="secondary" type="button" onClick={deleteCurrentKey}>
                  키 삭제
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="ai-status-line">
              <span>{provider.label}</span>
              <span>{model}</span>
              <strong>키 저장됨</strong>
            </div>

            <p className="modal-note">
              AI 버튼을 누를 때마다 현재 화면 또는 수집 본문을 새로 요약합니다. 공용 PC에서는 사용 후 키를 삭제하세요.
            </p>

            <div className="modal-actions">
              <button disabled={!canRun} type="button" onClick={() => runSummaryWith(providerId, model, apiKey)}>
                {status === "working" ? workingLabel : result || error ? "다시 실행" : submitLabel}
              </button>
              <button className="secondary" type="button" onClick={() => setSetupMode(true)}>
                모델/키 변경
              </button>
              <button className="secondary" type="button" onClick={deleteCurrentKey}>
                키 삭제
              </button>
            </div>
          </>
        )}

        {status === "working" ? (
          <div className="digest-panel">
            <strong>{workingLabel}</strong>
            <p>선택한 모델로 내용을 정리하고 있습니다.</p>
          </div>
        ) : null}

        {result || error ? (
          <div className={`digest-panel ${status === "error" ? "error" : ""}`}>
            <strong>{status === "error" ? errorTitle : resultTitle}</strong>
            <p>{status === "error" ? error : result}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

async function requestAiSummary({
  providerId,
  model,
  apiKey,
  instructions,
  input,
  maxOutputTokens
}: {
  providerId: AiProviderId;
  model: string;
  apiKey: string;
  instructions: string;
  input: string;
  maxOutputTokens: number;
}): Promise<string> {
  if (providerId === "gemini") return requestGeminiSummary(model, apiKey, instructions, input, maxOutputTokens);
  if (providerId === "openai") return requestOpenAiSummary(model, apiKey, instructions, input, maxOutputTokens);
  if (providerId === "groq") {
    return requestChatCompletionSummary(
      "https://api.groq.com/openai/v1/chat/completions",
      model,
      apiKey,
      instructions,
      input,
      maxOutputTokens,
      "groq"
    );
  }
  return requestChatCompletionSummary(
    "https://openrouter.ai/api/v1/chat/completions",
    model,
    apiKey,
    instructions,
    input,
    maxOutputTokens,
    "openrouter"
  );
}

async function requestGeminiSummary(
  model: string,
  apiKey: string,
  instructions: string,
  input: string,
  maxOutputTokens: number
): Promise<string> {
  const normalizedModel = model.replace(/^models\//, "");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(normalizedModel)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: instructions }] },
        contents: [{ parts: [{ text: input }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens
        }
      })
    }
  );

  const payload = await parseJsonResponse(response, "Gemini API");
  return compactOutput(
    arrayValue(payload.candidates)
      .flatMap((candidate) => arrayValue(recordValue(recordValue(candidate).content).parts))
      .map((part) => stringValue(recordValue(part).text))
      .filter(Boolean)
      .join("\n\n")
  );
}

async function requestOpenAiSummary(
  model: string,
  apiKey: string,
  instructions: string,
  input: string,
  maxOutputTokens: number
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_output_tokens: maxOutputTokens,
      instructions,
      input
    })
  });

  const payload = await parseJsonResponse(response, "OpenAI API");
  return compactOutput(stringValue(payload.output_text) || extractOutputText(payload.output));
}

async function requestChatCompletionSummary(
  url: string,
  model: string,
  apiKey: string,
  instructions: string,
  input: string,
  maxOutputTokens: number,
  provider: "groq" | "openrouter"
): Promise<string> {
  const body =
    provider === "groq"
      ? {
          model,
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: input }
          ],
          temperature: 0.2,
          max_completion_tokens: maxOutputTokens
        }
      : {
          model,
          messages: [
            { role: "system", content: instructions },
            { role: "user", content: input }
          ],
          temperature: 0.2,
          max_tokens: maxOutputTokens
        };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "X-Title": "Korean Regulation Change Monitor"
    },
    body: JSON.stringify(body)
  });

  const payload = await parseJsonResponse(response, provider === "groq" ? "Groq API" : "OpenRouter API");
  const firstChoice = recordValue(arrayValue(payload.choices)[0]);
  const message = recordValue(firstChoice.message);
  return compactOutput(extractOutputText(message.content));
}

async function parseJsonResponse(response: Response, label: string): Promise<JsonRecord> {
  const raw = await response.text();
  let payload: JsonRecord = {};
  try {
    payload = raw ? (JSON.parse(raw) as JsonRecord) : {};
  } catch {
    payload = { raw };
  }
  if (!response.ok) {
    const errorRecord = recordValue(payload.error);
    const message = stringValue(errorRecord.message) || stringValue(payload.message) || raw || `${label} HTTP ${response.status}`;
    throw new Error(`${label} HTTP ${response.status}: ${message}`);
  }
  return payload;
}

function readProvider(value: string | null): AiProviderId {
  return value && value in providers ? (value as AiProviderId) : "gemini";
}

function keyStorageKey(providerId: AiProviderId): string {
  return `kr-reg-ai-key-${providerId}`;
}

function modelStorageKey(providerId: AiProviderId): string {
  return `kr-reg-ai-model-${providerId}`;
}

function readStoredKey(providerId: AiProviderId): string {
  return (
    localStorage.getItem(keyStorageKey(providerId)) ||
    sessionStorage.getItem(keyStorageKey(providerId)) ||
    (providerId === "openai" ? sessionStorage.getItem(legacyOpenAiKey) || "" : "")
  );
}

function readStoredModel(providerId: AiProviderId): string {
  return (
    localStorage.getItem(modelStorageKey(providerId)) ||
    sessionStorage.getItem(modelStorageKey(providerId)) ||
    providers[providerId].models[0].value
  );
}

function compactOutput(value: unknown): string {
  return String(value || "").replace(/\n{3,}/g, "\n\n").trim();
}

function extractOutputText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractOutputText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value as JsonRecord;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    if (Array.isArray(record.content)) return record.content.map(extractOutputText).filter(Boolean).join("\n");
    if (Array.isArray(record.output)) return record.output.map(extractOutputText).filter(Boolean).join("\n");
    return Object.values(record).map(extractOutputText).filter(Boolean).join("\n");
  }
  return "";
}

function recordValue(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
