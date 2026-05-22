import fs from "node:fs/promises";
import path from "node:path";
import type { CollectedItem, ItemFilters, RunMetadata } from "./types";

const root = process.cwd();
const dataDir = path.join(root, "data");
const itemsPath = path.join(dataDir, "items.json");
const runPath = path.join(dataDir, "run.json");

export async function readItems(): Promise<CollectedItem[]> {
  try {
    const raw = await fs.readFile(itemsPath, "utf8");
    return JSON.parse(raw) as CollectedItem[];
  } catch {
    return [];
  }
}

export async function readRunMetadata(): Promise<RunMetadata> {
  try {
    const raw = await fs.readFile(runPath, "utf8");
    return JSON.parse(raw) as RunMetadata;
  } catch {
    return {
      last_run_at: null,
      last_target_date: null,
      item_count: 0,
      changed_count: 0,
      logs: []
    };
  }
}

export function filterItems(items: CollectedItem[], filters: ItemFilters): CollectedItem[] {
  const query = filters.query?.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.ministry && item.ministry !== filters.ministry) return false;
    if (filters.sourceType && item.source_type !== filters.sourceType) return false;
    if (filters.documentType && item.document_type !== filters.documentType) return false;
    if (filters.changeType && item.change_type !== filters.changeType) return false;
    if (filters.date && item.publish_date !== filters.date) return false;
    if (!query) return true;
    return [
      item.title,
      item.raw_text,
      item.ministry,
      item.issue_number,
      item.source
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort((a, b) =>
    a.localeCompare(b, "ko")
  );
}

export function sortItems(items: CollectedItem[]): CollectedItem[] {
  return [...items].sort((a, b) => {
    const dateA = a.publish_date ?? "";
    const dateB = b.publish_date ?? "";
    if (dateA !== dateB) return dateB.localeCompare(dateA);
    return a.title.localeCompare(b.title, "ko");
  });
}

export function getStats(items: CollectedItem[]) {
  return {
    total: items.length,
    official: items.filter((item) => item.confidence === "official").length,
    notices: items.filter((item) => item.source_type === "legislation_notice").length,
    verify: items.filter((item) => item.verification_required).length
  };
}
