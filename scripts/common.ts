import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { XMLParser } from "fast-xml-parser";
import type { CollectionLog } from "../lib/types";

export const rootDir = process.cwd();
export const dataDir = path.join(rootDir, "data");
export const snapshotsDir = path.join(dataDir, "snapshots");
export const logsDir = path.join(dataDir, "logs");
export const dailyDir = path.join(dataDir, "daily");

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
});
const execFileAsync = promisify(execFile);
const defaultUserAgent =
  "Mozilla/5.0 (compatible; kr-reg-change-watch/0.1; +https://github.com/BrightAsh/kr-reg-change-watch)";

export function loadDotEnv(): void {
  for (const file of [".env.local", ".env"]) {
    loadEnvPath(path.join(rootDir, file));
  }
}

function loadEnvPath(filePath: string): void {
  let raw = "";
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

export async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(snapshotsDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
  await fs.mkdir(dailyDir, { recursive: true });
}

export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export function parseArgs(argv = process.argv.slice(2)): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [key, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
  const retries = Math.max(1, Number(env("FETCH_RETRIES", "3")) || 3);
  const timeoutMs = Math.max(5000, Number(env("FETCH_TIMEOUT_MS", "45000")) || 45000);
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "user-agent": defaultUserAgent,
          accept: "application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
          "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
          ...headersObject(init.headers)
        },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(750 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  try {
    return await fetchTextWithCurl(url, init, timeoutMs, retries);
  } catch (curlError) {
    throw new Error(
      `GET ${url} failed after ${retries} attempt(s): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }; curl fallback failed: ${curlError instanceof Error ? curlError.message : String(curlError)}`
    );
  }
}

async function fetchTextWithCurl(url: string, init: RequestInit, timeoutMs: number, retries: number): Promise<string> {
  const headers = {
    accept: "application/json, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
    "accept-language": "ko-KR,ko;q=0.9,en;q=0.8",
    ...headersObject(init.headers)
  };
  const curl = process.platform === "win32" ? "curl.exe" : "curl";
  const args = [
    "-L",
    "--http1.1",
    "--retry",
    String(retries),
    "--retry-all-errors",
    "--max-time",
    String(Math.ceil(timeoutMs / 1000)),
    "-sS",
    "--fail",
    "-A",
    defaultUserAgent
  ];
  if (process.platform === "win32") args.push("--ssl-no-revoke");
  for (const [name, value] of Object.entries(headers)) {
    args.push("-H", `${name}: ${value}`);
  }
  args.push(url);

  try {
    const { stdout } = await execFileAsync(curl, args, {
      encoding: "utf8",
      timeout: timeoutMs + 5000,
      maxBuffer: 25 * 1024 * 1024
    });
    return stdout;
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code) : "";
    throw new Error(`curl failed${code ? ` with code ${code}` : ""}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function headersObject(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

export async function fetchJsonOrXml(url: string): Promise<unknown> {
  const raw = await fetchText(url);
  const trimmed = raw.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return {};
  }
  return parseXml(trimmed);
}

export function parseXml(raw: string): unknown {
  return xmlParser.parse(raw);
}

export function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function addLog(
  logs: CollectionLog[],
  source: string,
  status: CollectionLog["status"],
  message: string,
  count = 0,
  url?: string
): void {
  logs.push({
    source,
    status,
    message,
    count,
    at: new Date().toISOString(),
    url
  });
}

export function makeUrl(base: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function dateDaysAgo(days: number): string {
  const now = new Date();
  const seoulToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
  const date = new Date(`${seoulToday}T00:00:00+09:00`);
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function isDateString(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
