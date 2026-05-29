"use client";

import { useMemo, useState } from "react";
import AiSummaryDialog from "@/components/AiSummaryDialog";

interface Props {
  title: string;
  ministry: string;
  source: string;
  publishDate: string | null;
  effectiveDate: string | null;
  readableText: string;
}

const detailInstructions =
  "한국 규제·법령 변경을 업무 담당자가 빠르게 판단할 수 있도록 한국어로 요약하세요. 반드시 제공된 수집 본문 안에서만 판단하고, 적용 대상, 달라진 점, 확인해야 할 업무 영향을 짧은 문단과 목록으로 정리하세요. 근거가 부족하면 부족하다고 말하세요.";

export default function DetailAiSummaryButton({
  title,
  ministry,
  source,
  publishDate,
  effectiveDate,
  readableText
}: Props) {
  const [open, setOpen] = useState(false);

  const summaryInput = useMemo(
    () =>
      [
        `제목: ${title}`,
        `기관: ${ministry}`,
        `공포/게시일: ${publishDate || "-"}`,
        `시행일: ${effectiveDate || "-"}`,
        `출처: ${source}`,
        `수집 본문:\n${readableText}`
      ]
        .filter(Boolean)
        .join("\n\n"),
    [effectiveDate, ministry, publishDate, readableText, source, title]
  );

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

      <AiSummaryDialog
        open={open}
        onClose={() => setOpen(false)}
        title="AI 요약"
        subtitle="수집 본문을 요약합니다."
        input={summaryInput}
        instructions={detailInstructions}
        submitLabel="요약 생성"
        workingLabel="요약 중"
        resultTitle="AI 요약"
        errorTitle="요약 실패"
        maxOutputTokens={900}
        disabled={!readableText.trim()}
        disabledMessage="수집 본문이 없어 요약할 수 없습니다."
      />
    </>
  );
}
