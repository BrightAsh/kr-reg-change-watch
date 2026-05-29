"use client";

import type { AiRunState } from "@/components/AiSummaryDialog";

interface Props {
  state: AiRunState;
  title: string;
  workingText: string;
  errorTitle: string;
  onOpenSettings: () => void;
}

export const emptyAiRunState: AiRunState = {
  status: "idle",
  result: "",
  error: "",
  providerLabel: "",
  model: ""
};

export default function AiInlineResult({ state, title, workingText, errorTitle, onOpenSettings }: Props) {
  if (state.status === "idle") return null;

  const isWorking = state.status === "working";
  const isError = state.status === "error";
  const body = isWorking ? workingText : isError ? state.error : state.result;

  return (
    <section className={`ai-inline-panel ${state.status}`} aria-live="polite">
      <div className="ai-inline-head">
        <div className="ai-inline-title">
          {isWorking ? <span className="ai-spinner" aria-hidden="true" /> : null}
          <div>
            <span>{isError ? errorTitle : title}</span>
            <strong>{isWorking ? "AI가 내용을 정리하고 있습니다." : isError ? "요약을 완료하지 못했습니다." : "요약 결과"}</strong>
          </div>
        </div>
        <div className="ai-inline-meta">
          {state.providerLabel ? <span>{state.providerLabel}</span> : null}
          {state.model ? <span>{state.model}</span> : null}
          {!isWorking ? (
            <button type="button" onClick={onOpenSettings}>
              다시 열기
            </button>
          ) : null}
        </div>
      </div>
      <p>{body}</p>
    </section>
  );
}
