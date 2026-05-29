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
  [
    "한국 규제·법령 변경을 업무 담당자가 빠르게 판단할 수 있도록 한국어로 요약하세요.",
    "반드시 제공된 ITEM_JSON, URLS, READABLE_TEXT, RAW_COLLECTED_TEXT 안의 내용만 근거로 판단하세요.",
    "URL은 직접 열람한 것처럼 말하지 말고, 사용자가 확인할 공식 원문/첨부 링크로만 제시하세요.",
    "출력 형식은 1) 핵심 결론 2) 무엇이 달라졌나 3) 적용 대상/영향 4) 업무 확인 포인트 5) 원문 확인 링크 순서로 고정하세요.",
    "뉴스/정책자료라면 공식 변경 확정 자료가 아니라 참고 자료라고 표시하세요.",
    "근거가 부족하거나 수집 본문이 단편적이면 추정하지 말고 원문 확인 필요라고 적으세요.",
    "JSON 키 이름이나 내부 해시값처럼 사용자에게 불필요한 기술값은 결과에 노출하지 마세요."
  ].join("\n");

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
        maxOutputTokens={2200}
        disabled={!readableText.trim()}
        disabledMessage="수집 본문이 없어 요약할 수 없습니다."
      />
    </>
  );
}
