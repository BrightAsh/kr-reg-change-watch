import type { CollectedItem } from "./types";

export type PublicInstitutionRelation = "direct" | "delegated" | "candidate";

export interface PublicInstitutionSystemGroup {
  id: string;
  order: number;
  title: string;
  shortTitle: string;
  basis: string;
  keywords: string[];
  strongKeywords: string[];
  directTitles: string[];
  delegatedTitles: string[];
}

export interface PublicInstitutionSystemMatch {
  group_id: string;
  group_order: number;
  group_title: string;
  relation: PublicInstitutionRelation;
  relation_label: string;
  match_basis: string;
  evidence: string[];
  score: number;
}

export const publicInstitutionSystemGroups: PublicInstitutionSystemGroup[] = [
  {
    id: "contract-rules",
    order: 1,
    title: "공기업·준정부기관 계약사무규칙",
    shortTitle: "계약사무규칙",
    basis: "공공기관의 운영에 관한 법률 제39조 제3항",
    keywords: ["입찰", "계약", "부정당업자", "입찰참가자격", "계약담당자"],
    strongKeywords: ["계약사무규칙", "입찰참가자격 제한", "부정당업자"],
    directTitles: ["공기업·준정부기관 계약사무규칙", "공기업 준정부기관 계약사무규칙"],
    delegatedTitles: []
  },
  {
    id: "accounting-rules",
    order: 2,
    title: "공기업·준정부기관 회계사무규칙",
    shortTitle: "회계사무규칙",
    basis: "공공기관의 운영에 관한 법률 제39조 제3항",
    keywords: ["회계원칙", "회계담당", "채권", "결산", "회계기준"],
    strongKeywords: ["회계사무규칙", "회계기준"],
    directTitles: ["공기업·준정부기관 회계사무규칙", "공기업 준정부기관 회계사무규칙"],
    delegatedTitles: ["공기업·준정부기관 회계기준", "공기업 준정부기관 회계기준"]
  },
  {
    id: "preliminary-feasibility",
    order: 3,
    title: "공기업·준정부기관 사업 예비타당성조사 운용지침",
    shortTitle: "예비타당성조사",
    basis: "공공기관의 운영에 관한 법률 제40조 제3항 및 시행령 제25조의3 제6항",
    keywords: ["예비타당성조사", "총사업비", "대상사업"],
    strongKeywords: ["예비타당성조사 운용지침", "예비타당성조사"],
    directTitles: [
      "공기업·준정부기관 사업 예비타당성조사 운용지침",
      "공기업 준정부기관 사업 예비타당성조사 운용지침"
    ],
    delegatedTitles: []
  },
  {
    id: "total-project-cost",
    order: 4,
    title: "공기업·준정부기관 총사업비관리지침",
    shortTitle: "총사업비관리지침",
    basis: "공공기관의 운영에 관한 법률 제40조",
    keywords: ["총사업비", "수요예측재조사", "타당성재검토", "타당성재조사"],
    strongKeywords: ["총사업비관리지침", "총사업비 관리", "타당성 재조사"],
    directTitles: ["공기업·준정부기관 총사업비관리지침", "공기업 준정부기관 총사업비관리지침"],
    delegatedTitles: []
  },
  {
    id: "management-guideline",
    order: 5,
    title: "공기업·준정부기관의 경영에 관한 지침",
    shortTitle: "경영 지침",
    basis: "공공기관의 운영에 관한 법률 제50조",
    keywords: ["조직", "정원", "출연", "출자", "인사", "임금피크", "보수체계", "인사교류"],
    strongKeywords: ["경영에 관한 지침", "예산운용지침", "감사 운영 규정", "공공기관 지정", "경영정보 공시"],
    directTitles: [
      "공기업·준정부기관의 경영에 관한 지침",
      "공기업 준정부기관의 경영에 관한 지침"
    ],
    delegatedTitles: [
      "공기업·준정부기관 예산운용지침",
      "공기업 준정부기관 예산운용지침",
      "공기업·준정부기관 감사 운영 규정",
      "공기업 준정부기관 감사 운영 규정"
    ]
  },
  {
    id: "innovation-guideline",
    order: 6,
    title: "공공기관의 혁신에 관한 지침",
    shortTitle: "혁신 지침",
    basis: "공공기관의 운영에 관한 법률 제15조",
    keywords: ["인사운영", "예산운용", "보수", "조직", "경영진단", "해외사무소"],
    strongKeywords: ["혁신에 관한 지침", "공공기관 혁신", "AI 혁신", "해외사무소", "K-마루"],
    directTitles: ["공공기관의 혁신에 관한 지침"],
    delegatedTitles: []
  },
  {
    id: "integrated-disclosure",
    order: 7,
    title: "공공기관의 통합공시에 관한 기준",
    shortTitle: "통합공시 기준",
    basis: "공공기관의 운영에 관한 법률 시행령 제16조",
    keywords: ["공시기준", "공시매뉴얼", "공시예외", "불성실공시", "통합공시"],
    strongKeywords: ["통합공시에 관한 기준", "통합공시", "경영정보 공시", "공시 점검"],
    directTitles: ["공공기관의 통합공시에 관한 기준"],
    delegatedTitles: []
  },
  {
    id: "safety-guideline",
    order: 8,
    title: "공공기관의 안전관리에 관한 지침",
    shortTitle: "안전관리 지침",
    basis: "공공기관의 운영에 관한 법률 제15조",
    keywords: ["안전관리", "안전경영책임계획", "안전보건교육", "안전관리등급제"],
    strongKeywords: ["안전관리에 관한 지침", "안전관리등급", "안전관리등급제", "안전경영책임계획"],
    directTitles: ["공공기관의 안전관리에 관한 지침"],
    delegatedTitles: ["공공기관 안전관리등급제 운영에 관한 지침"]
  },
  {
    id: "executive-pay",
    order: 9,
    title: "공기업·준정부기관 임원 보수지침",
    shortTitle: "임원 보수지침",
    basis: "공공기관의 운영에 관한 법률 제33조",
    keywords: ["기관장", "상임감사", "상임이사", "비상임이사", "보수", "퇴직금"],
    strongKeywords: ["임원 보수지침", "기관장 보수", "상임감사 보수", "임원 퇴직금"],
    directTitles: ["공기업·준정부기관 임원 보수지침", "공기업준정부기관 임원 보수지침"],
    delegatedTitles: []
  }
];

export function classifyPublicInstitutionSystemItem(item: Pick<
  CollectedItem,
  "title" | "summary" | "diff_summary" | "source" | "source_type" | "raw_text" | "attachment_urls"
>): PublicInstitutionSystemMatch[] {
  const headlineText = [
    item.title,
    item.summary,
    item.diff_summary,
    item.source,
    ...(item.attachment_urls || [])
  ].join(" ");
  const fullText = `${headlineText} ${item.raw_text || ""}`;
  const normalizedHeadline = normalizeSystemKey(headlineText);
  const matches: PublicInstitutionSystemMatch[] = [];

  for (const group of publicInstitutionSystemGroups) {
    const directTitle = group.directTitles.find((candidate) =>
      normalizedHeadline.includes(normalizeSystemKey(candidate))
    );
    if (directTitle) {
      matches.push(buildSystemMatch(group, "direct", "직접 규정", "문서명 직접 일치", [directTitle], 100));
      continue;
    }

    const delegatedTitle = group.delegatedTitles.find((candidate) =>
      normalizedHeadline.includes(normalizeSystemKey(candidate))
    );
    if (delegatedTitle) {
      matches.push(buildSystemMatch(group, "delegated", "하위/위임 규정", "하위/위임 문서명 일치", [delegatedTitle], 95));
    }
  }

  if (matches.length) return sortSystemMatches(matches);

  const normalizedCandidateText = normalizeSystemKey(headlineText);
  const hasPublicContext = /(공공기관|공기업|준정부기관|알리오|경영공시|기획재정부|재정경제부)/.test(fullText);
  const candidateAllowed = ["alio", "press", "ministry_board", "legislation_notice", "news"].includes(item.source_type);
  if (!hasPublicContext || !candidateAllowed) return [];

  for (const group of publicInstitutionSystemGroups) {
    const strongHits = group.strongKeywords.filter((keyword) => normalizedCandidateText.includes(normalizeSystemKey(keyword)));
    if (!strongHits.length) continue;
    matches.push(buildSystemMatch(group, "candidate", "정책자료/키워드 후보", "제목·요약의 관련 문구 발견", strongHits, 70 + strongHits.length * 3));
  }

  return sortSystemMatches(matches);
}

function buildSystemMatch(
  group: PublicInstitutionSystemGroup,
  relation: PublicInstitutionRelation,
  relationLabel: string,
  basis: string,
  evidence: string[],
  score: number
): PublicInstitutionSystemMatch {
  return {
    group_id: group.id,
    group_order: group.order,
    group_title: group.title,
    relation,
    relation_label: relationLabel,
    match_basis: basis,
    evidence,
    score
  };
}

function sortSystemMatches(matches: PublicInstitutionSystemMatch[]): PublicInstitutionSystemMatch[] {
  return matches.sort((a, b) => b.score - a.score || a.group_order - b.group_order);
}

function normalizeSystemKey(value: string): string {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\s\-_()[\]{}.,'"`~!@#$%^&*+=:;<>?/\\|·ㆍ]/g, "")
    .toLowerCase();
}
