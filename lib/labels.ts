import type { ChangeType, Confidence, DocumentType, SourceType } from "./types";

export const sourceTypeLabels: Record<SourceType, string> = {
  official_law: "법령",
  gazette: "관보",
  ministry_board: "부처 게시판",
  legislation_notice: "입법/행정예고",
  press: "보도자료",
  news: "뉴스"
};

export const documentTypeLabels: Record<DocumentType, string> = {
  law: "법률",
  decree: "시행령",
  ordinance: "시행규칙/조례",
  notice: "고시",
  directive: "훈령",
  established_rule: "예규",
  guideline: "지침",
  announcement: "공고",
  news: "뉴스"
};

export const changeTypeLabels: Record<ChangeType, string> = {
  new: "신규",
  partial_revision: "일부개정",
  full_revision: "전부개정",
  abolished: "폐지",
  notice: "예고/공고",
  unknown: "미분류"
};

export const confidenceLabels: Record<Confidence, string> = {
  official: "공식",
  official_notice: "공식 예고",
  press: "보도/정책자료",
  news: "뉴스"
};
