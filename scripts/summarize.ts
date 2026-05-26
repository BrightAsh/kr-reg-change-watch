import path from "node:path";
import type { CollectedItem, DailyCollection } from "../lib/types";
import { changeTypeLabels, documentTypeLabels } from "../lib/labels";
import { dailyDir, ensureDataDirs, env, loadDotEnv, parseArgs, readJson, rootDir, writeJson } from "./common";
import { compactText, hashText } from "../lib/text";

loadDotEnv();

const args = parseArgs();
const itemsPath = path.join(rootDir, "data", "items.json");
const diffPath = path.join(rootDir, "data", "diff.json");
const maxChars = Number(env("SUMMARY_MAX_CHARS", "800"));
const openAiKey = env("OPENAI_API_KEY");
const openAiModel = env("OPENAI_MODEL", "gpt-5");

async function main() {
  await ensureDataDirs();
  const items = await readJson<CollectedItem[]>(itemsPath, []);
  const diff = await readJson<{
    added?: CollectedItem[];
    changed?: Array<{ before: CollectedItem; after: CollectedItem }>;
  }>(diffPath, {});

  const changedIds = new Set((diff.changed || []).map((entry) => entry.after.id));
  const addedIds = new Set((diff.added || []).map((item) => item.id));

  const summarized: CollectedItem[] = [];
  for (const item of items) {
    const summary = await buildGroundedSummary(item);
    const summaryWasGenerated = Boolean(openAiKey) || summary !== item.summary;
    const diffSummary = changedIds.has(item.id)
      ? "어제 스냅샷과 raw_hash가 달라 원문 내용 변경 가능성이 있습니다. 상세 원문을 확인하세요."
      : addedIds.has(item.id)
        ? "이번 스냅샷에 새로 나타난 항목입니다."
        : item.diff_summary;

    summarized.push({
      ...item,
      summary,
      diff_summary: diffSummary,
      auto_summary: item.auto_summary || summaryWasGenerated,
      raw_hash: item.raw_hash || hashText(item.raw_text)
    });
  }

  await writeJson(itemsPath, summarized);
  await updateDailySummary(summarized);
  console.log(`Summarized ${summarized.length} item(s).`);
}

async function updateDailySummary(allItems: CollectedItem[]): Promise<void> {
  const targetDate =
    typeof args.date === "string"
      ? args.date
      : (await readJson<{ last_target_date?: string | null }>(path.join(rootDir, "data", "run.json"), {})).last_target_date;
  if (!targetDate) return;

  const dailyPath = path.join(dailyDir, `${targetDate}.json`);
  const daily = await readJson<DailyCollection | null>(dailyPath, null);
  if (!daily) return;

  const byId = new Map(allItems.map((item) => [item.id, item]));
  await writeJson(dailyPath, {
    ...daily,
    items: daily.items.map((item) => byId.get(item.id) || item)
  });
}

async function buildGroundedSummary(item: CollectedItem): Promise<string> {
  const existingSummary = compactText(item.summary || "");
  if (!openAiKey && existingSummary && !existingSummary.startsWith("자동요약:")) {
    return item.summary || existingSummary;
  }

  const evidence = compactText(item.raw_text).slice(0, maxChars);
  const base = [
    item.ministry && `${item.ministry}`,
    item.document_type && `${documentTypeLabels[item.document_type]}`,
    item.change_type && `${changeTypeLabels[item.change_type]}`,
    item.publish_date && `공표일 ${item.publish_date}`,
    item.effective_date && `시행일 ${item.effective_date}`
  ]
    .filter(Boolean)
    .join(" · ");

  if (!evidence || evidence.length < 30) {
    return `자동요약: ${base || item.title}. 원문 본문 근거가 충분하지 않아 제목과 메타데이터 외 내용은 단정하지 않습니다.`;
  }

  if (openAiKey) {
    try {
      const aiSummary = await summarizeWithOpenAI(item, evidence, base);
      if (aiSummary) return aiSummary.startsWith("자동요약:") ? aiSummary : `자동요약: ${aiSummary}`;
    } catch (error) {
      console.warn(`AI summary failed for ${item.id}:`, error instanceof Error ? error.message : String(error));
    }
  }

  const sentences = evidence
    .split(/(?<=[.。！？!?])\s+|(?<=다\.)\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");

  return `자동요약: ${base ? `${base}. ` : ""}${sentences} 원문 링크를 기준으로 확인하세요.`;
}

async function summarizeWithOpenAI(item: CollectedItem, evidence: string, base: string): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${openAiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: openAiModel,
      max_output_tokens: 220,
      instructions:
        "당신은 한국 법령/행정규칙 변경사항 요약 보조자입니다. 제공된 원문 근거와 메타데이터 안에서만 요약하고, 근거가 없으면 단정하지 마세요. 한국어로 한 단락만 작성하고 반드시 '자동요약:'으로 시작하세요.",
      input: [
        `제목: ${item.title}`,
        `메타데이터: ${base}`,
        `원문 URL: ${item.original_url}`,
        `원문 근거: ${evidence}`
      ].join("\n")
    })
  });
  if (!response.ok) throw new Error(`OpenAI Responses API HTTP ${response.status}`);
  const payload = (await response.json()) as { output_text?: string; output?: unknown };
  return compactText(payload.output_text || extractOutputText(payload.output));
}

function extractOutputText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(extractOutputText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return record.text;
    if (typeof record.content === "string") return record.content;
    return Object.values(record).map(extractOutputText).filter(Boolean).join(" ");
  }
  return "";
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
