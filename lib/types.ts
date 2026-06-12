export type SourceType =
  | "official_law"
  | "alio"
  | "gazette"
  | "ministry_board"
  | "legislation_notice"
  | "press"
  | "news";

export type DocumentType =
  | "law"
  | "decree"
  | "ordinance"
  | "notice"
  | "directive"
  | "established_rule"
  | "guideline"
  | "announcement"
  | "news";

export type ChangeType =
  | "new"
  | "partial_revision"
  | "full_revision"
  | "abolished"
  | "notice"
  | "unknown";

export type Confidence = "official" | "official_notice" | "press" | "news";

export type RegulatoryCategory = "law" | "notice" | "guideline" | "news";

export interface CollectedItem {
  id: string;
  source: string;
  source_type: SourceType;
  category?: RegulatoryCategory;
  ministry: string;
  document_type: DocumentType;
  title: string;
  issue_number: string | null;
  publish_date: string | null;
  effective_date: string | null;
  change_type: ChangeType;
  original_url: string;
  attachment_urls: string[];
  raw_text: string;
  raw_hash: string;
  summary: string | null;
  diff_summary: string | null;
  confidence: Confidence;
  verification_required?: boolean;
  auto_summary?: boolean;
  collection_date?: string;
  collected_at?: string;
  source_record_id?: string | null;
  public_system_matches?: PublicInstitutionSystemMatch[];
  alio_document_date?: string | null;
  alio_posted_date?: string | null;
}

export interface PublicInstitutionSystemMatch {
  group_id: string;
  group_order: number;
  group_title: string;
  relation: "direct" | "delegated" | "candidate";
  relation_label: string;
  match_basis: string;
  evidence: string[];
  score: number;
}

export interface CollectionLog {
  source: string;
  status: "ok" | "skipped" | "error";
  message: string;
  count: number;
  at: string;
  url?: string;
  group?: string;
  route?: string;
}

export interface RunMetadata {
  last_run_at: string | null;
  last_target_date: string | null;
  item_count: number;
  changed_count: number;
  available_dates?: string[];
  cache_hit?: boolean;
  logs: CollectionLog[];
}

export interface ItemFilters {
  ministry?: string;
  sourceType?: SourceType;
  documentType?: DocumentType;
  changeType?: ChangeType;
  date?: string;
  query?: string;
}

export interface DailyCollection {
  date: string;
  collected_at: string;
  item_count: number;
  changed_count: number;
  cache_hit?: boolean;
  items: CollectedItem[];
  logs: CollectionLog[];
}
