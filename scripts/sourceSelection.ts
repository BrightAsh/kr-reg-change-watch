import {
  COLLECTION_SOURCE_GROUP_METHODS,
  type CollectionMethodStatus,
  type CollectionSourceGroup
} from "../lib/collectionStatus";

export function parseCollectionSourceFilter(value: string): Set<CollectionSourceGroup> {
  const aliases: Record<string, CollectionSourceGroup> = {
    law: "official-law",
    official: "official-law",
    "official-law": "official-law",
    lawmaking: "lawmaking",
    legislation: "lawmaking",
    "legislation-notice": "lawmaking",
    gazette: "gazette",
    gwanbo: "gazette",
    ministry: "ministry-board",
    "ministry-board": "ministry-board",
    motir: "motir",
    industry: "motir",
    "industry-board": "motir",
    "산업부": "motir",
    "산업통상부": "motir",
    alio: "alio",
    rss: "policy-rss",
    "policy-rss": "policy-rss",
    policy: "policy-rss",
    naver: "naver-news",
    news: "naver-news",
    "naver-news": "naver-news"
  };

  return new Set(
    value
      .split(/[\s,;|]+/)
      .map((entry) => aliases[entry.trim().toLowerCase()])
      .filter((entry): entry is CollectionSourceGroup => Boolean(entry))
  );
}

export function parseCollectionRouteFilter(value: string): Set<string> {
  const ministryMethods = COLLECTION_SOURCE_GROUP_METHODS["ministry-board"];
  const moisMethods = ministryMethods.filter((source) => source.startsWith("행정안전부 "));
  const moefMethods = ministryMethods.filter((source) => source.startsWith("기획재정부 "));
  const routeAliases: Record<string, string[]> = {
    "law-history": ["국가법령정보센터 법령 변경이력"],
    "law-change-history": ["국가법령정보센터 법령 변경이력"],
    "law-article": ["국가법령정보센터 일자별 조문 개정 이력"],
    "law-article-change": ["국가법령정보센터 일자별 조문 개정 이력"],
    "law-admin-rule": ["국가법령정보센터 행정규칙"],
    "law-administrative-rule": ["국가법령정보센터 행정규칙"],
    "law-admin-rule-compare": ["국가법령정보센터 행정규칙 신구법 비교"],
    "law-administrative-rule-compare": ["국가법령정보센터 행정규칙 신구법 비교"],
    mois: moisMethods,
    "행안부": moisMethods,
    "행정안전부": moisMethods,
    moef: moefMethods,
    mofe: moefMethods,
    "기재부": moefMethods,
    "기획재정부": moefMethods,
    "재정경제부": moefMethods,
    "mois-directive": ["행정안전부 훈령·예규·고시"],
    "mois-rule": ["행정안전부 훈령·예규·고시"],
    "mois-notice": ["행정안전부 훈령·예규·고시"],
    "mois-legislation": ["행정안전부 입법·행정예고"],
    "mois-legislation-notice": ["행정안전부 입법·행정예고"],
    "mois-law": ["행정안전부 법령자료실"],
    "mois-law-library": ["행정안전부 법령자료실"],
    "moef-law": ["기획재정부 법령자료실"],
    "moef-law-library": ["기획재정부 법령자료실"],
    "moef-english": ["기획재정부 영문법령정보"],
    "moef-english-law": ["기획재정부 영문법령정보"],
    "moef-tax": ["기획재정부 조세조약"],
    "moef-tax-treaty": ["기획재정부 조세조약"],
    "moef-directive": ["기획재정부 훈령"],
    "moef-rule": ["기획재정부 예규"],
    "moef-notice": ["기획재정부 고시"],
    "moef-announcement": ["기획재정부 공고"],
    "moef-guideline": ["기획재정부 지침"],
    "moef-legislation": ["기획재정부 입법예고"],
    "moef-legislation-notice": ["기획재정부 입법예고"],
    "moef-admin": ["기획재정부 행정예고"],
    "moef-admin-notice": ["기획재정부 행정예고"],
    "alio-law": ["ALIO 공공기관 법령/지침"],
    "alio-directive": ["ALIO 공공기관 법령/지침"],
    "alio-policy": ["ALIO 공공정책자료"],
    "alio-pds": ["ALIO 공공정책자료"]
  };
  const knownMethods = Object.values(COLLECTION_SOURCE_GROUP_METHODS).flat();
  const selected = new Set<string>();

  for (const token of value.split(/[\s,;|]+/).map((entry) => entry.trim()).filter(Boolean)) {
    for (const source of routeAliases[token.toLowerCase()] || []) selected.add(source);
    const normalized = normalizeCollectionRouteToken(token);
    for (const source of knownMethods) {
      if (normalizeCollectionRouteToken(source) === normalized) selected.add(source);
    }
  }

  return selected;
}

export function selectedCollectionMethodStatuses(
  methods: CollectionMethodStatus[],
  sourceFilter: Set<CollectionSourceGroup>,
  routeFilter = new Set<string>()
): CollectionMethodStatus[] {
  const selectedSources = selectedCollectionMethodSources(sourceFilter, routeFilter);
  if (!selectedSources.length) return methods;
  return methods.filter((method) => selectedSources.some((source) => sameCollectionMethod(source, method.source)));
}

export function selectedCollectionMethodSources(
  sourceFilter: Set<CollectionSourceGroup>,
  routeFilter = new Set<string>()
): string[] {
  const selected = new Set<string>();
  for (const group of sourceFilter) {
    for (const source of COLLECTION_SOURCE_GROUP_METHODS[group] || []) selected.add(source);
  }
  for (const source of routeFilter) selected.add(source);
  return [...selected];
}

function sameCollectionMethod(expected: string, source: string): boolean {
  if (!source) return false;
  if (source === expected) return true;
  if (source.startsWith(`${expected} `)) return true;
  if (source.includes(expected) || expected.includes(source)) return true;
  return false;
}

function normalizeCollectionRouteToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s·ㆍ.,/()_-]+/g, "");
}
