import type { CollectedItem, RegulatoryCategory } from "./types";

export const categoryLabels: Record<RegulatoryCategory, string> = {
  law: "법령",
  notice: "고시/공고",
  guideline: "지침/규칙",
  news: "뉴스/발언"
};

export function itemCategory(item: Pick<CollectedItem, "category" | "source_type" | "document_type">): RegulatoryCategory {
  if (item.category) return item.category;
  if (item.source_type === "news" || item.source_type === "press" || item.document_type === "news") return "news";
  if (item.document_type === "directive" || item.document_type === "established_rule" || item.document_type === "guideline") {
    return "guideline";
  }
  if (item.document_type === "notice" || item.document_type === "announcement" || item.source_type === "gazette") {
    return "notice";
  }
  return "law";
}
