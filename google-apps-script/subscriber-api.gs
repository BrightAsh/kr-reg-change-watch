/**
 * Google Apps Script subscription API for BrightAsh/kr-reg-change-watch.
 *
 * Setup:
 * 1. Create a Google Sheet.
 * 2. Open Extensions > Apps Script and paste this file.
 * 3. Script Properties:
 *    - SHEET_NAME: optional, defaults to "subscribers"
 *    - SUBSCRIBER_READ_TOKEN: required; same value as the GitHub Actions secret
 * 4. Deploy as a Web app: execute as yourself, accessible to anyone with the link.
 */

const DEFAULT_SHEET_NAME = "subscribers";
const TIME_ZONE = "Asia/Seoul";
const READ_TOKEN_PROPERTY = "SUBSCRIBER_READ_TOKEN";
const SHEET_NAME_PROPERTY = "SHEET_NAME";
const HEADERS = [
  "email",
  "active",
  "mode",
  "categoriesJson",
  "systemGroupsJson",
  "filtersJson",
  "createdAt",
  "updatedAt",
  "unsubscribedAt",
  "lastAction",
  "historyJson"
];

function doGet(event) {
  return handleRequest_(event);
}

function doPost(event) {
  return handleRequest_(event);
}

function handleRequest_(event) {
  const params = readParams_(event);
  const callback = sanitizeCallback_(params.callback || "");
  const action = String(params.action || "lookup").toLowerCase();
  let result;

  try {
    if (action === "lookup") {
      result = lookupSubscription_(params);
    } else if (action === "upsert") {
      result = upsertSubscription_(params);
    } else if (action === "unsubscribe") {
      result = unsubscribeSubscription_(params);
    } else if (action === "list") {
      result = listSubscriptions_(params);
    } else {
      result = { ok: false, error: "Unknown action." };
    }
  } catch (error) {
    result = {
      ok: false,
      error: error && error.message ? error.message : String(error)
    };
  }

  return output_(result, callback);
}

function lookupSubscription_(params) {
  const email = normalizeEmail_(params.email || "");
  if (!email) return { ok: false, error: "Valid email is required." };

  const sheet = getSheet_();
  const match = findRecordByEmail_(sheet, email);
  if (!match || !match.record.active) return { ok: true, found: false };

  return {
    ok: true,
    found: true,
    subscriber: publicSubscriber_(match.record)
  };
}

function upsertSubscription_(params) {
  const payload = decodePayload_(params.payload || "");
  const subscription = sanitizeSubscription_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_();
    const match = findRecordByEmail_(sheet, subscription.email);
    const now = now_();
    const created = !match;
    const existing = match ? match.record : {};
    const history = readHistory_(existing.historyJson);
    history.push({
      at: now,
      action: created ? "create" : "update",
      mode: subscription.mode
    });

    const record = {
      email: subscription.email,
      active: true,
      mode: subscription.mode,
      categories: subscription.categories,
      systemGroups: subscription.systemGroups,
      filters: subscription.filters,
      createdAt: existing.createdAt || now,
      updatedAt: now,
      unsubscribedAt: "",
      lastAction: created ? "create" : "update",
      historyJson: JSON.stringify(trimHistory_(history))
    };

    writeRecord_(sheet, match ? match.rowNumber : 0, record);
    return {
      ok: true,
      created,
      subscriber: publicSubscriber_(record)
    };
  } finally {
    lock.releaseLock();
  }
}

function unsubscribeSubscription_(params) {
  const email = normalizeEmail_(params.email || "");
  if (!email) return { ok: false, error: "Valid email is required." };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = getSheet_();
    const match = findRecordByEmail_(sheet, email);
    if (!match || !match.record.active) {
      return { ok: true, found: false, unsubscribed: false };
    }

    const now = now_();
    const history = readHistory_(match.record.historyJson);
    history.push({ at: now, action: "unsubscribe" });

    const record = Object.assign({}, match.record, {
      active: false,
      updatedAt: now,
      unsubscribedAt: now,
      lastAction: "unsubscribe",
      historyJson: JSON.stringify(trimHistory_(history))
    });
    writeRecord_(sheet, match.rowNumber, record);

    return { ok: true, found: true, unsubscribed: true };
  } finally {
    lock.releaseLock();
  }
}

function listSubscriptions_(params) {
  assertReadToken_(params.token || "");

  const sheet = getSheet_();
  const records = readRecords_(sheet)
    .map((entry) => entry.record)
    .filter((record) => record.active)
    .map(publicSubscriber_);

  return {
    ok: true,
    subscribers: records
  };
}

function assertReadToken_(token) {
  const expected = String(PropertiesService.getScriptProperties().getProperty(READ_TOKEN_PROPERTY) || "").trim();
  if (!expected) throw new Error("Read token is not configured.");
  if (String(token || "").trim() !== expected) {
    throw new Error("Unauthorized.");
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("This script must be bound to a Google Sheet.");

  const sheetName =
    String(PropertiesService.getScriptProperties().getProperty(SHEET_NAME_PROPERTY) || "").trim() || DEFAULT_SHEET_NAME;
  const sheet = spreadsheet.getSheetByName(sheetName) || spreadsheet.insertSheet(sheetName);
  ensureHeaders_(sheet);
  return sheet;
}

function ensureHeaders_(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const needsWrite = HEADERS.some((header, index) => current[index] !== header);
  if (needsWrite) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }
}

function findRecordByEmail_(sheet, email) {
  return readRecords_(sheet).find((entry) => entry.record.email === email) || null;
}

function readRecords_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return rows
    .map((row, index) => ({
      rowNumber: index + 2,
      record: rowToRecord_(row)
    }))
    .filter((entry) => entry.record.email);
}

function rowToRecord_(row) {
  return {
    email: normalizeEmail_(row[0]),
    active: row[1] === true || String(row[1]).toLowerCase() === "true",
    mode: row[2] === "public-system" ? "public-system" : "all",
    categories: readJsonArray_(row[3]),
    systemGroups: readJsonArray_(row[4]),
    filters: readJsonObject_(row[5]),
    createdAt: String(row[6] || ""),
    updatedAt: String(row[7] || ""),
    unsubscribedAt: String(row[8] || ""),
    lastAction: String(row[9] || ""),
    historyJson: String(row[10] || "[]")
  };
}

function writeRecord_(sheet, rowNumber, record) {
  const values = [[
    record.email,
    Boolean(record.active),
    record.mode,
    JSON.stringify(record.categories || []),
    JSON.stringify(record.systemGroups || []),
    JSON.stringify(record.filters || {}),
    record.createdAt || "",
    record.updatedAt || "",
    record.unsubscribedAt || "",
    record.lastAction || "",
    record.historyJson || "[]"
  ]];

  const targetRow = rowNumber || Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(targetRow, 1, 1, HEADERS.length).setValues(values);
}

function publicSubscriber_(record) {
  return {
    email: record.email,
    active: Boolean(record.active),
    mode: record.mode === "public-system" ? "public-system" : "all",
    categories: Array.isArray(record.categories) ? record.categories : [],
    systemGroups: Array.isArray(record.systemGroups) ? record.systemGroups : [],
    filters: record.filters && typeof record.filters === "object" ? record.filters : {},
    createdAt: record.createdAt || "",
    updatedAt: record.updatedAt || ""
  };
}

function sanitizeSubscription_(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Subscription payload is required.");
  const email = normalizeEmail_(payload.email || "");
  if (!email) throw new Error("Valid email is required.");

  const mode = payload.mode === "public-system" ? "public-system" : "all";
  return {
    email,
    mode,
    categories: mode === "all" ? sanitizeCategories_(payload.categories, payload.category) : [],
    systemGroups: mode === "public-system" ? sanitizeStringArray_(payload.systemGroups || payload.systemGroup, 100) : [],
    filters: sanitizeFilters_(payload.filters)
  };
}

function sanitizeCategories_(categories, category) {
  const allowed = ["law", "notice", "guideline", "news"];
  const values = sanitizeStringArray_(categories || (category && category !== "all" ? [category] : []), 20);
  return values.filter((value) => allowed.indexOf(value) !== -1);
}

function sanitizeFilters_(filters) {
  if (!filters || typeof filters !== "object") return {};

  const result = {};
  const ministries = sanitizeStringArray_(filters.ministries, 200);
  const sourceTypes = sanitizeStringArray_(filters.sourceTypes, 20);
  const documentTypes = sanitizeStringArray_(filters.documentTypes, 20);
  const changeTypes = sanitizeStringArray_(filters.changeTypes, 20);
  const query = String(filters.query || "").trim().slice(0, 300);

  if (ministries.length) result.ministries = ministries;
  if (sourceTypes.length) result.sourceTypes = sourceTypes;
  if (documentTypes.length) result.documentTypes = documentTypes;
  if (changeTypes.length) result.changeTypes = changeTypes;
  if (query) result.query = query;

  return result;
}

function sanitizeStringArray_(value, limit) {
  const source = Array.isArray(value) ? value : value ? [value] : [];
  const seen = {};
  return source
    .map((entry) => String(entry || "").trim())
    .filter(Boolean)
    .filter((entry) => {
      if (seen[entry]) return false;
      seen[entry] = true;
      return true;
    })
    .slice(0, limit);
}

function normalizeEmail_(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function decodePayload_(payload) {
  if (!payload) throw new Error("Subscription payload is required.");
  let normalized = String(payload).replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";

  const bytes = Utilities.base64Decode(normalized);
  const text = Utilities.newBlob(bytes).getDataAsString("UTF-8");
  return JSON.parse(text);
}

function readParams_(event) {
  const params = Object.assign({}, event && event.parameter ? event.parameter : {});
  const postData = event && event.postData && event.postData.contents ? String(event.postData.contents) : "";
  if (!postData) return params;

  try {
    const body = JSON.parse(postData);
    if (body && typeof body === "object") return Object.assign(params, body);
  } catch (error) {
    // Ignore non-JSON post bodies; query parameters remain enough for JSONP and Actions.
  }
  return params;
}

function readJsonArray_(value) {
  const parsed = readJson_(value, []);
  return Array.isArray(parsed) ? parsed.map((entry) => String(entry || "").trim()).filter(Boolean) : [];
}

function readJsonObject_(value) {
  const parsed = readJson_(value, {});
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function readHistory_(value) {
  const parsed = readJson_(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function readJson_(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(String(value));
  } catch (error) {
    return fallback;
  }
}

function trimHistory_(history) {
  return history.slice(Math.max(0, history.length - 80));
}

function now_() {
  return Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ss") + "+09:00";
}

function output_(data, callback) {
  const json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function sanitizeCallback_(value) {
  const callback = String(value || "").trim();
  return /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(callback) ? callback : "";
}
