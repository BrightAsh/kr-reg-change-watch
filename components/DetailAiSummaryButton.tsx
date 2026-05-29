"use client";

import { useEffect, useState } from "react";

interface Props {
  title: string;
  ministry: string;
  source: string;
  publishDate: string | null;
  effectiveDate: string | null;
  readableText: string;
}

const storageKey = "kr-reg-openai-key";

export default function DetailAiSummaryButton({
  title,
  ministry,
  source,
  publishDate,
  effectiveDate,
  readableText
}: Props) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setApiKey(sessionStorage.getItem(storageKey) || "");
  }, []);

  function saveApiKey(value: string) {
    setApiKey(value);
    if (value) sessionStorage.setItem(storageKey, value);
    else sessionStorage.removeItem(storageKey);
  }

  async function summarizeItem() {
    if (!apiKey) return;
    setStatus("working");
    setError("");
    setResult("");

    const input = [
      `제목: ${title}`,
      `기관: ${ministry}`,
      `공포/게시일: ${publishDate || "-"}`,
      `시행일: ${effectiveDate || "-"}`,
      `출처: ${source}`,
      `수집 본문:\n${readableText}`
    ]
      .filter(Boolean)
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
          max_output_tokens: 900,
          instructions:
            "한국 규제·법령 변경을 업무 담당자가 빠르게 판단할 수 있도록 한국어로 요약하세요. 반드시 제공된 수집 본문 안에서만 판단하고, 적용 대상, 달라진 점, 확인해야 할 업무 영향을 짧은 문단과 목록으로 정리하세요. 근거가 부족하면 부족하다고 말하세요.",
          input
        })
      });
      if (!response.ok) throw new Error(`OpenAI API HTTP ${response.status}`);
      const payload = (await response.json()) as { output_text?: string; output?: unknown };
      const text = compactOutput(payload.output_text || extractOutputText(payload.output));
      setResult(text || "요약 결과가 비어 있습니다.");
      setStatus("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setStatus("error");
    }
  }

  return (
    <>
      <button
        className="detail-action-button detail-ai-button"
        type="button"
        disabled={!readableText.trim()}
        onClick={() => setOpen(true)}
      >
        AI 요약
      </button>

      {open ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpen(false)}>
          <section
            className="ai-modal"
            role="dialog"
            aria-modal="true"
            aria-label="AI 요약"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <span>AI 요약</span>
                <strong>수집 본문을 요약합니다</strong>
              </div>
              <button type="button" aria-label="닫기" onClick={() => setOpen(false)}>
                x
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
            <p className="modal-note">AI 요약은 아래 수집 본문만 근거로 생성합니다. 키는 이 브라우저 세션에만 저장됩니다.</p>
            <div className="modal-actions">
              <button disabled={!apiKey || status === "working"} type="button" onClick={summarizeItem}>
                {status === "working" ? "요약 중" : "요약 생성"}
              </button>
              {apiKey ? (
                <button className="secondary" type="button" onClick={() => saveApiKey("")}>
                  키 삭제
                </button>
              ) : null}
            </div>
            {result || error ? (
              <div className={`digest-panel ${status === "error" ? "error" : ""}`}>
                <strong>{status === "error" ? "요약 실패" : "AI 요약"}</strong>
                <p>{status === "error" ? error : result}</p>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function compactOutput(value: string): string {
  return value.replace(/\n{3,}/g, "\n\n").trim();
}

function extractOutputText(output: unknown): string {
  if (!output) return "";
  if (typeof output === "string") return output;
  if (Array.isArray(output)) return output.map(extractOutputText).filter(Boolean).join("\n");
  if (typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    if (Array.isArray(record.content)) return record.content.map(extractOutputText).filter(Boolean).join("\n");
    if (Array.isArray(record.output)) return record.output.map(extractOutputText).filter(Boolean).join("\n");
  }
  return "";
}
