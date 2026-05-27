import fs from "node:fs/promises";
import path from "node:path";
import type { CollectedItem } from "../lib/types";
import { ensureDataDirs, parseArgs, readJson, rootDir, snapshotsDir, writeJson } from "./common";

interface DiffResult {
  today: string | null;
  yesterday: string | null;
  added: CollectedItem[];
  changed: Array<{ before: CollectedItem; after: CollectedItem }>;
  removed: CollectedItem[];
}

async function main() {
  await ensureDataDirs();
  const args = parseArgs();
  const snapshotFiles = (await fs.readdir(snapshotsDir).catch(() => []))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort();

  const requestedFile = typeof args.date === "string" ? `${args.date}.json` : null;
  const todayFile = requestedFile && snapshotFiles.includes(requestedFile) ? requestedFile : snapshotFiles.at(-1);
  const yesterdayFile = todayFile ? snapshotFiles.filter((file) => file < todayFile).at(-1) : null;
  const today = todayFile ? todayFile.replace(".json", "") : null;
  const yesterday = yesterdayFile ? yesterdayFile.replace(".json", "") : null;

  const todayItems = todayFile
    ? await readJson<CollectedItem[]>(path.join(snapshotsDir, todayFile), [])
    : await readJson<CollectedItem[]>(path.join(rootDir, "data", "items.json"), []);
  const yesterdayItems = yesterdayFile
    ? await readJson<CollectedItem[]>(path.join(snapshotsDir, yesterdayFile), [])
    : [];

  const beforeById = new Map(yesterdayItems.map((item) => [item.id, item]));
  const afterById = new Map(todayItems.map((item) => [item.id, item]));

  const added = todayItems.filter((item) => !beforeById.has(item.id));
  const changed = todayItems
    .filter((item) => beforeById.has(item.id) && beforeById.get(item.id)?.raw_hash !== item.raw_hash)
    .map((item) => ({ before: beforeById.get(item.id) as CollectedItem, after: item }));
  const removed = yesterdayItems.filter((item) => !afterById.has(item.id));

  const result: DiffResult = { today, yesterday, added, changed, removed };
  await writeJson(path.join(rootDir, "data", "diff.json"), result);
  console.log(
    `Diff complete. Added: ${added.length}, changed: ${changed.length}, removed: ${removed.length}.`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
