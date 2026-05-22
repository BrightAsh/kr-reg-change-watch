import type { CollectedItem, RunMetadata } from "./types";

export interface DataStore {
  readItems(): Promise<CollectedItem[]>;
  writeItems(items: CollectedItem[]): Promise<void>;
  readRunMetadata(): Promise<RunMetadata>;
  writeRunMetadata(metadata: RunMetadata): Promise<void>;
}

export const itemTableColumns = [
  "id",
  "source",
  "source_type",
  "ministry",
  "document_type",
  "title",
  "issue_number",
  "publish_date",
  "effective_date",
  "change_type",
  "original_url",
  "attachment_urls",
  "raw_text",
  "raw_hash",
  "summary",
  "diff_summary",
  "confidence"
] as const;

export const supabaseMigrationHint = `
create table regulatory_items (
  id text primary key,
  source text not null,
  source_type text not null,
  ministry text not null,
  document_type text not null,
  title text not null,
  issue_number text,
  publish_date date,
  effective_date date,
  change_type text not null,
  original_url text not null,
  attachment_urls jsonb not null default '[]',
  raw_text text not null,
  raw_hash text not null,
  summary text,
  diff_summary text,
  confidence text not null,
  verification_required boolean not null default false,
  auto_summary boolean not null default false,
  collected_at timestamptz
);
`.trim();
