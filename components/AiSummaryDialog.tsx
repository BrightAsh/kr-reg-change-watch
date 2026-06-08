"use client";

import { useEffect, useMemo, useState } from "react";

type AiProviderId = "gemini" | "groq" | "openrouter" | "openai";
export type SummaryStatus = "idle" | "working" | "done" | "error";
type JsonRecord = Record<string, unknown>;
type ReportMode = "auto" | "paged";

interface ModelTokenLimit {
  providerId: AiProviderId;
  model: string;
  contextWindow: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  source: string;
}

interface BriefingPayload extends JsonRecord {
  selected_date?: string;
  total_filtered_count?: number;
  included_count?: number;
  note?: string;
  page_number?: number;
  page_count?: number;
  items?: JsonRecord[];
}

export interface AiRunState {
  status: SummaryStatus;
  result: string;
  error: string;
  providerLabel: string;
  model: string;
  progress?: string;
  pageCount?: number;
  completedPages?: number;
}

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
  maxOutputTokens?: number;
  reportMode?: ReportMode;
  disabled?: boolean;
  disabledMessage?: string;
  onRunStateChange?: (state: AiRunState) => void;
}

const providerStorageKey = "kr-reg-ai-provider";
const customModelValue = "__custom__";
const legacyOpenAiKey = "kr-reg-openai-key";
const tokenSafetyMargin = 2048;
const minimumChunkInputTokens = 1800;
const defaultFallbackLimit: ModelTokenLimit = {
  providerId: "openrouter",
  model: "unknown",
  contextWindow: 32768,
  maxInputTokens: 24576,
  maxOutputTokens: 8192,
  source: "fallback"
};

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
  maxOutputTokens = 0,
  reportMode = "auto",
  disabled,
  disabledMessage,
  onRunStateChange
}: Props) {
  const [providerId, setProviderId] = useState<AiProviderId>("gemini");
  const [model, setModel] = useState(providers.gemini.models[0].value);
  const [apiKey, setApiKey] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const [status, setStatus] = useState<SummaryStatus>("idle");

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
  }, [open]);

  function selectProvider(nextProvider: AiProviderId) {
    const nextModel = readStoredModel(nextProvider);
    const nextKey = readStoredKey(nextProvider);
    setProviderId(nextProvider);
    setModel(nextModel);
    setApiKey(nextKey);
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
  }

  async function runSummaryWith(nextProvider: AiProviderId, nextModel: string, nextKey: string) {
    if (!nextKey.trim() || !nextModel.trim() || !input.trim() || disabled) return;
    const runStateBase = {
      providerLabel: providers[nextProvider].label,
      model: nextModel.trim()
    };
    setStatus("working");
    onRunStateChange?.({ ...runStateBase, status: "working", result: "", error: "" });
    onClose();

    try {
      const tokenLimit = await resolveModelTokenLimit(nextProvider, nextModel.trim(), nextKey.trim());
      const text = await requestAiSummaryWithModelLimits({
        providerId: nextProvider,
        model: nextModel.trim(),
        apiKey: nextKey.trim(),
        instructions,
        input,
        requestedOutputTokens: maxOutputTokens,
        reportMode,
        tokenLimit,
        onProgress: (progress, completedPages, pageCount) => {
          onRunStateChange?.({
            ...runStateBase,
            status: "working",
            result: "",
            error: "",
            progress,
            completedPages,
            pageCount
          });
        }
      });
      const nextResult = text || "요약 결과가 비어 있습니다.";
      setStatus("done");
      onRunStateChange?.({ ...runStateBase, status: "done", result: nextResult, error: "" });
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setStatus("error");
      onRunStateChange?.({ ...runStateBase, status: "error", result: "", error: nextError });
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
              {`${provider.note} 키는 이 브라우저에 저장됩니다. 실제 API 호출은 아래 진행 버튼을 눌렀을 때만 실행됩니다.`}
            </p>

            <div className="modal-actions">
              <button disabled={!canRun} type="button" onClick={saveCurrentSettings}>
                {submitLabel}
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
              모델과 키를 확인한 뒤 진행 버튼을 누르면 요약을 시작합니다. 공용 PC에서는 사용 후 키를 삭제하세요.
            </p>

            <div className="modal-actions">
              <button disabled={!canRun} type="button" onClick={() => runSummaryWith(providerId, model, apiKey)}>
                {status === "working" ? workingLabel : submitLabel}
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

      </section>
    </div>
  );
}

async function requestAiSummaryWithModelLimits({
  providerId,
  model,
  apiKey,
  instructions,
  input,
  requestedOutputTokens,
  reportMode,
  tokenLimit,
  onProgress
}: {
  providerId: AiProviderId;
  model: string;
  apiKey: string;
  instructions: string;
  input: string;
  requestedOutputTokens: number;
  reportMode: ReportMode;
  tokenLimit: ModelTokenLimit;
  onProgress?: (progress: string, completedPages?: number, pageCount?: number) => void;
}): Promise<string> {
  const outputTokens = outputTokenBudget(tokenLimit, requestedOutputTokens);
  const inputBudget = effectiveInputBudget(tokenLimit, outputTokens, instructions);
  const fullInputTokens = estimateTokenCount(input);

  if (fullInputTokens <= inputBudget) {
    onProgress?.("모델 한도 안에서 한 번에 요약을 작성하고 있습니다.");
    return requestAiSummary({
      providerId,
      model,
      apiKey,
      instructions,
      input,
      maxOutputTokens: outputTokens
    });
  }

  const briefingPayload = parseBriefingPayload(input);
  if (briefingPayload?.items?.length) {
    const chunks = buildBriefingChunks(briefingPayload, instructions, inputBudget);
    if (!chunks.length) throw new Error("청크로 나눌 수 있는 브리핑 항목이 없습니다.");

    const pages: string[] = [];
    for (let index = 0; index < chunks.length; index += 1) {
      const pageNumber = index + 1;
      onProgress?.(
        `모델 한도를 넘어 ${chunks.length.toLocaleString("ko-KR")}페이지 보고서로 나누어 작성 중입니다. ${pageNumber.toLocaleString(
          "ko-KR"
        )}페이지를 생성하고 있습니다.`,
        index,
        chunks.length
      );
      const pageInput = buildBriefingChunkInput(briefingPayload, chunks[index], pageNumber, chunks.length);
      const pageText = await requestAiSummary({
        providerId,
        model,
        apiKey,
        instructions: pageInstructions(instructions, pageNumber, chunks.length, reportMode),
        input: pageInput,
        maxOutputTokens: outputTokens
      });
      pages.push(formatReportPage(pageText, pageNumber));
    }
    onProgress?.("페이지 보고서를 모두 작성했습니다.", chunks.length, chunks.length);
    return combineReportPages(pages, briefingPayload, tokenLimit, inputBudget, outputTokens);
  }

  const textChunks = buildTextChunks(input, instructions, inputBudget);
  const pages: string[] = [];
  for (let index = 0; index < textChunks.length; index += 1) {
    const pageNumber = index + 1;
    onProgress?.(
      `입력이 길어 ${textChunks.length.toLocaleString("ko-KR")}페이지로 나누어 작성 중입니다. ${pageNumber.toLocaleString(
        "ko-KR"
      )}페이지를 생성하고 있습니다.`,
      index,
      textChunks.length
    );
    const pageText = await requestAiSummary({
      providerId,
      model,
      apiKey,
      instructions: pageInstructions(instructions, pageNumber, textChunks.length, reportMode),
      input: textChunks[index],
      maxOutputTokens: outputTokens
    });
    pages.push(formatReportPage(pageText, pageNumber));
  }
  return combineReportPages(pages, null, tokenLimit, inputBudget, outputTokens);
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
          temperature: 0.1,
          maxOutputTokens,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      })
    }
  );

  const payload = await parseJsonResponse(response, "Gemini API");
  const candidates = arrayValue(payload.candidates);
  const finishReason = stringValue(recordValue(candidates[0]).finishReason);
  const text = compactOutput(
    candidates
      .flatMap((candidate) => arrayValue(recordValue(recordValue(candidate).content).parts))
      .map((part) => stringValue(recordValue(part).text))
      .filter(Boolean)
      .join("\n\n")
  );
  return appendFinishWarning(text, finishReason);
}

async function requestOpenAiSummary(
  model: string,
  apiKey: string,
  instructions: string,
  input: string,
  maxOutputTokens: number
): Promise<string> {
  const body: JsonRecord = {
    model,
    max_output_tokens: maxOutputTokens,
    instructions,
    input
  };
  if (model.toLowerCase().startsWith("gpt-5")) {
    body.reasoning = { effort: "minimal" };
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await parseJsonResponse(response, "OpenAI API");
  const incompleteDetails = recordValue(payload.incomplete_details);
  const finishReason = stringValue(incompleteDetails.reason) || stringValue(payload.status);
  return appendFinishWarning(
    compactOutput(stringValue(payload.output_text) || extractOutputText(payload.output)),
    finishReason
  );
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
  return appendFinishWarning(compactOutput(extractOutputText(message.content)), stringValue(firstChoice.finish_reason));
}

async function resolveModelTokenLimit(
  providerId: AiProviderId,
  model: string,
  apiKey: string
): Promise<ModelTokenLimit> {
  if (providerId === "openrouter") {
    return resolveOpenRouterTokenLimit(model, apiKey);
  }
  return staticModelTokenLimit(providerId, model);
}

async function resolveOpenRouterTokenLimit(model: string, apiKey: string): Promise<ModelTokenLimit> {
  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      }
    });
    const payload = await parseJsonResponse(response, "OpenRouter Models API");
    const models = arrayValue(payload.data).map(recordValue);
    const found = models.find((entry) => stringValue(entry.id) === model);
    if (!found) return { ...defaultFallbackLimit, providerId: "openrouter", model };

    const topProvider = recordValue(found.top_provider);
    const contextWindow =
      numberValue(topProvider.context_length) || numberValue(found.context_length) || defaultFallbackLimit.contextWindow;
    const maxOutputTokens =
      numberValue(topProvider.max_completion_tokens) || numberValue(found.max_completion_tokens) || defaultFallbackLimit.maxOutputTokens;
    return {
      providerId: "openrouter",
      model,
      contextWindow,
      maxInputTokens: contextWindow,
      maxOutputTokens,
      source: "OpenRouter Models API"
    };
  } catch {
    return { ...defaultFallbackLimit, providerId: "openrouter", model };
  }
}

function staticModelTokenLimit(providerId: AiProviderId, model: string): ModelTokenLimit {
  const normalized = model.replace(/^models\//, "").toLowerCase();
  if (providerId === "gemini") {
    return {
      providerId,
      model,
      contextWindow: 1_114_112,
      maxInputTokens: 1_048_576,
      maxOutputTokens: 65_536,
      source: "Gemini 2.5 model docs"
    };
  }
  if (providerId === "openai" && normalized.startsWith("gpt-5")) {
    return {
      providerId,
      model,
      contextWindow: 400_000,
      maxInputTokens: 272_000,
      maxOutputTokens: 128_000,
      source: "OpenAI GPT-5 API docs"
    };
  }
  if (providerId === "openai") {
    return {
      providerId,
      model,
      contextWindow: 128_000,
      maxInputTokens: 112_000,
      maxOutputTokens: 16_384,
      source: "OpenAI fallback"
    };
  }
  if (providerId === "groq") {
    if (normalized === "openai/gpt-oss-120b") {
      return {
        providerId,
        model,
        contextWindow: 131_072,
        maxInputTokens: 131_072,
        maxOutputTokens: 65_536,
        source: "Groq model docs"
      };
    }
    if (normalized === "qwen/qwen3-32b") {
      return {
        providerId,
        model,
        contextWindow: 131_072,
        maxInputTokens: 131_072,
        maxOutputTokens: 40_960,
        source: "Groq model docs"
      };
    }
    if (normalized === "llama-3.3-70b-versatile") {
      return {
        providerId,
        model,
        contextWindow: 131_072,
        maxInputTokens: 131_072,
        maxOutputTokens: 32_768,
        source: "Groq model docs"
      };
    }
  }
  return { ...defaultFallbackLimit, providerId, model };
}

function outputTokenBudget(tokenLimit: ModelTokenLimit, requestedOutputTokens: number): number {
  const modelMax = tokenLimit.maxOutputTokens || requestedOutputTokens || defaultFallbackLimit.maxOutputTokens;
  const contextSafeMax = Math.max(1, tokenLimit.contextWindow - minimumChunkInputTokens - tokenSafetyMargin);
  return Math.max(1, Math.min(modelMax, contextSafeMax));
}

function effectiveInputBudget(tokenLimit: ModelTokenLimit, outputTokens: number, instructions: string): number {
  const instructionTokens = estimateTokenCount(instructions);
  const byContext = tokenLimit.contextWindow - outputTokens - tokenSafetyMargin - instructionTokens;
  const byInputLimit = tokenLimit.maxInputTokens - tokenSafetyMargin - instructionTokens;
  return Math.max(minimumChunkInputTokens, Math.min(byContext, byInputLimit));
}

function estimateTokenCount(value: string): number {
  let estimated = 0;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (/\s/.test(char)) estimated += 0.15;
    else if (code <= 0x007f) estimated += 0.28;
    else estimated += 1.05;
  }
  return Math.ceil(estimated);
}

function parseBriefingPayload(input: string): BriefingPayload | null {
  const marker = "FILTERED_ITEMS_JSON";
  const start = input.indexOf(marker);
  if (start === -1) return null;

  const afterMarker = input.slice(start + marker.length).trimStart();
  const end = afterMarker.indexOf("END_FILTERED_ITEMS_JSON");
  const rawJson = (end === -1 ? afterMarker.replace(/\n\s*주의:[\s\S]*$/m, "") : afterMarker.slice(0, end)).trim();
  try {
    const parsed = JSON.parse(rawJson) as BriefingPayload;
    return Array.isArray(parsed.items) ? parsed : null;
  } catch {
    return null;
  }
}

function buildBriefingChunks(payload: BriefingPayload, instructions: string, inputBudget: number): JsonRecord[][] {
  const items = payload.items || [];
  const chunks: JsonRecord[][] = [];
  let current: JsonRecord[] = [];

  for (const item of items) {
    const candidate = [...current, item];
    const candidateInput = buildBriefingChunkInput(payload, candidate, 1, 1);
    const candidateTokens = estimateTokenCount(candidateInput) + estimateTokenCount(instructions);

    if (candidateTokens <= inputBudget) {
      current = candidate;
      continue;
    }

    if (current.length) {
      chunks.push(current);
      current = [];
    }

    const singleInput = buildBriefingChunkInput(payload, [item], 1, 1);
    const singleTokens = estimateTokenCount(singleInput) + estimateTokenCount(instructions);
    if (singleTokens <= inputBudget) {
      current = [item];
      continue;
    }

    chunks.push([shrinkBriefingItemToBudget(payload, item, instructions, inputBudget)]);
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function shrinkBriefingItemToBudget(
  payload: BriefingPayload,
  item: JsonRecord,
  instructions: string,
  inputBudget: number
): JsonRecord {
  const textKey = typeof item.raw_text === "string" ? "raw_text" : typeof item.raw_text_excerpt === "string" ? "raw_text_excerpt" : "";
  if (!textKey) return item;

  const original = stringValue(item[textKey]);
  let low = 0;
  let high = original.length;
  let best: JsonRecord = { ...item, [textKey]: "" };

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const trimmed = trimWithNotice(original, mid);
    const candidate = { ...item, [textKey]: trimmed, raw_text_trimmed_for_model_limit: true };
    const candidateInput = buildBriefingChunkInput(payload, [candidate], 1, 1);
    const candidateTokens = estimateTokenCount(candidateInput) + estimateTokenCount(instructions);
    if (candidateTokens <= inputBudget) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

function trimWithNotice(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  const omitted = value.length - maxLength;
  return `${value.slice(0, maxLength)}\n...[모델 입력 한도 때문에 ${omitted.toLocaleString("ko-KR")}자 생략됨]`;
}

function buildBriefingChunkInput(
  payload: BriefingPayload,
  items: JsonRecord[],
  pageNumber: number,
  pageCount: number
): string {
  const nextPayload: BriefingPayload = {
    ...payload,
    page_number: pageNumber,
    page_count: pageCount,
    included_count: items.length,
    note:
      pageCount > 1
        ? `전체 항목을 모델 한도에 맞춰 ${pageCount.toLocaleString("ko-KR")}페이지로 나눈 보고서 중 ${pageNumber.toLocaleString(
            "ko-KR"
          )}페이지입니다. 이 페이지에 포함된 항목을 빠짐없이 다루세요.`
        : payload.note,
    items
  };

  return [
    "FILTERED_ITEMS_JSON",
    JSON.stringify(nextPayload, null, 2),
    "END_FILTERED_ITEMS_JSON",
    "",
    "주의: URL은 제공된 링크일 뿐이며, AI가 직접 열람한 원문으로 간주하지 마세요."
  ].join("\n");
}

function buildTextChunks(input: string, instructions: string, inputBudget: number): string[] {
  const parts = input.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const part of parts) {
    const candidate = current ? `${current}\n\n${part}` : part;
    if (estimateTokenCount(candidate) + estimateTokenCount(instructions) <= inputBudget) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current =
      estimateTokenCount(part) + estimateTokenCount(instructions) <= inputBudget
        ? part
        : trimWithNotice(part, Math.max(500, Math.floor(inputBudget * 1.6)));
  }

  if (current) chunks.push(current);
  return chunks.length ? chunks : [input];
}

function pageInstructions(instructions: string, pageNumber: number, pageCount: number, reportMode: ReportMode): string {
  if (pageCount <= 1 && reportMode !== "paged") return instructions;
  return [
    instructions,
    "",
    `이번 출력은 전체 보고서 중 ${pageNumber}/${pageCount}페이지입니다.`,
    "이 페이지에 제공된 항목은 모두 다루고, 다른 페이지의 항목이 있다고 추정하지 마세요.",
    "출력 맨 위에 페이지 제목을 쓰고, 기관·제목·핵심 변화·업무 확인 포인트·원문 URL을 유지하세요."
  ].join("\n");
}

function formatReportPage(text: string, pageNumber: number): string {
  const trimmed = compactOutput(text);
  if (/^#{1,3}\s/.test(trimmed)) return trimmed;
  return `## ${pageNumber.toLocaleString("ko-KR")}페이지\n\n${trimmed}`;
}

function combineReportPages(
  pages: string[],
  payload: BriefingPayload | null,
  tokenLimit: ModelTokenLimit,
  inputBudget: number,
  outputTokens: number
): string {
  if (pages.length === 1) return pages[0];

  const date = payload?.selected_date ? `${payload.selected_date} ` : "";
  const total = typeof payload?.total_filtered_count === "number" ? payload.total_filtered_count.toLocaleString("ko-KR") : "-";
  return [
    `# ${date}AI 브리핑 보고서`,
    "",
    `총 ${pages.length.toLocaleString("ko-KR")}페이지 보고서입니다. 전체 필터 결과 ${total}건을 모델 한도에 맞춰 항목 단위로 나누어 작성했습니다.`,
    `모델 한도 기준: ${tokenLimit.source}, 입력 예산 약 ${inputBudget.toLocaleString("ko-KR")}토큰, 출력 상한 ${outputTokens.toLocaleString(
      "ko-KR"
    )}토큰.`,
    "",
    ...pages
  ].join("\n\n");
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

function appendFinishWarning(text: string, finishReason: string): string {
  if (!/MAX_TOKENS|max_output_tokens|length|incomplete/i.test(finishReason)) return text;
  return `${text}\n\n※ 출력 한도에 도달해 일부 내용이 잘렸을 수 있습니다. 다시 실행하거나 더 강한 모델을 선택해 확인하세요.`.trim();
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

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
