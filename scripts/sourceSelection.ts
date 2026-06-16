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

export function selectedCollectionMethodSources(sourceFilter: Set<CollectionSourceGroup>): string[] {
  if (!sourceFilter.size) return [];
  return [...sourceFilter].flatMap((group) => COLLECTION_SOURCE_GROUP_METHODS[group] || []);
}

export function selectedCollectionMethodStatuses(
  methods: CollectionMethodStatus[],
  sourceFilter: Set<CollectionSourceGroup>
): CollectionMethodStatus[] {
  const selectedSources = selectedCollectionMethodSources(sourceFilter);
  if (!selectedSources.length) return methods;
  return methods.filter((method) => selectedSources.some((source) => sameCollectionMethod(source, method.source)));
}

function sameCollectionMethod(expected: string, source: string): boolean {
  if (!source) return false;
  if (source === expected) return true;
  if (source.startsWith(`${expected} `)) return true;
  if (source.includes(expected) || expected.includes(source)) return true;
  return false;
}
