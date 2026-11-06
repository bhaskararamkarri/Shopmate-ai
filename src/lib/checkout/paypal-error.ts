/**
 * ShopMate AI — safe PayPal checkout diagnostics.
 *
 * Client-safe module: it never imports server-only code and never receives a
 * credential. PayPal SDK errors can contain request URLs, access tokens,
 * cookies, or buyer details; this module extracts only an allow-listed,
 * sanitized diagnostic so `onError` can be investigated without leaking them.
 */

export interface PayPalErrorDiagnostic {
  name: string;
  message: string;
  code?: string;
  debugId?: string;
  correlationId?: string;
  orderId?: string;
}

const MAX_MESSAGE_LENGTH = 300;
const MAX_RAW_MESSAGE_LENGTH = 4_000;
const MAX_NAME_LENGTH = 80;
const MAX_CODE_LENGTH = 64;
const MAX_RECORDS = 50;
const MAX_DEPTH = 6;
const MAX_JSON_LENGTH = 5_000;

const FALLBACK_MESSAGE = "PayPal reported an error.";

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const DEBUG_ID_PATTERN = /^[0-9a-f]{8,32}$/i;
const CORRELATION_ID_PATTERN = /^[0-9a-f][0-9a-f-]{15,63}$/i;
const ORDER_ID_PATTERN = /^[A-Z0-9]{10,20}$/;

const MESSAGE_KEYS = [
  "message",
  "description",
  "error_description",
  "detail",
] as const;

const DEBUG_ID_KEYS = [
  "debug_id",
  "debugId",
  "debugID",
  "paypal_debug_id",
] as const;

const CORRELATION_ID_KEYS = ["correlation_id", "correlationId"] as const;

const NESTED_KEYS = [
  "details",
  "data",
  "response",
  "body",
  "payload",
  "error",
  "cause",
  "context",
] as const;

// Full URLs are removed before anything else so query-string credentials can
// never survive in the logged message.
const URL_PATTERN = /\bhttps?:\/\/[^\s"'<>]+/gi;
const PAYPAL_DOMAIN_PATTERN =
  /\b(?:[a-z0-9-]+\.)*(?:paypal|paypalobjects)\.com(?:\/[^\s"'<>]*)?/gi;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const AUTH_HEADER_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;
const SENSITIVE_FIELD_PATTERN =
  /\b(authorization|proxy-authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|client[_-]?id|password|secret|api[_-]?key|session|token|payer[_-]?id|account[_-]?id|email[_-]?address|email|phone|address|given[_-]?name|surname|name)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^,;}\n]+)/gi;
const QUERY_PARAM_PATTERN =
  /\b(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|client[_-]?id|password|secret|api[_-]?key|session|token|cookie)\s*=\s*[^&\s]+/gi;
// Long opaque values are almost always credentials or hashes. Order ids (17
// chars) and PayPal debug ids (13 hex chars) are intentionally below this cap.
const LONG_TOKEN_PATTERN = /\b[A-Za-z0-9_-]{40,}\b/g;
const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;
const LONG_DIGITS_PATTERN = /\b\d{9,}\b/g;
const BUYER_NAME_PATTERN =
  /\b(buyer|payer|customer)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g;
const ADDRESS_PATTERN =
  /\b\d{1,5}\s+(?:[A-Z][A-Za-z.'-]*\s+){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way)\b/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeGet(record: Record<string, unknown>, key: string): unknown {
  try {
    return record[key];
  } catch {
    return undefined;
  }
}

function tryParseJson(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > MAX_JSON_LENGTH) return undefined;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return undefined;
  }
}

interface CollectedError {
  records: Record<string, unknown>[];
  strings: string[];
}

/**
 * Walks a bounded portion of the error graph. The bound prevents a hostile or
 * accidentally huge object from stalling the checkout, and `seen` handles
 * circular references.
 */
function collectError(error: unknown): CollectedError {
  const records: Record<string, unknown>[] = [];
  const strings: string[] = [];
  const seen = new Set<unknown>();
  const queue: Array<{ value: unknown; depth: number }> = [
    { value: error, depth: 0 },
  ];
  let visited = 0;

  while (queue.length > 0 && visited < MAX_RECORDS) {
    const current = queue.shift();
    if (!current) break;
    visited += 1;

    if (typeof current.value === "string") {
      strings.push(current.value);
      const parsed = tryParseJson(current.value);
      if (parsed !== undefined) {
        queue.push({ value: parsed, depth: current.depth + 1 });
      }
      continue;
    }

    if (!isRecord(current.value) || seen.has(current.value)) continue;
    seen.add(current.value);
    records.push(current.value);

    for (const key of MESSAGE_KEYS) {
      const value = safeGet(current.value, key);
      if (typeof value === "string") strings.push(value);
    }

    if (current.depth >= MAX_DEPTH) continue;

    for (const key of NESTED_KEYS) {
      const child = safeGet(current.value, key);
      if (child === undefined) continue;
      if (Array.isArray(child)) {
        for (const item of child.slice(0, 10)) {
          queue.push({ value: item, depth: current.depth + 1 });
        }
      } else if (typeof child === "object" && child !== null) {
        queue.push({ value: child, depth: current.depth + 1 });
      } else if (typeof child === "string") {
        strings.push(child);
        const parsed = tryParseJson(child);
        if (parsed !== undefined) {
          queue.push({ value: parsed, depth: current.depth + 1 });
        }
      }
    }
  }

  return { records, strings };
}

function findFirstString(
  records: Record<string, unknown>[],
  keys: readonly string[],
): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = safeGet(record, key);
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

function extractDebugId(
  records: Record<string, unknown>[],
  strings: string[],
): string | undefined {
  for (const record of records) {
    for (const key of DEBUG_ID_KEYS) {
      const value = safeGet(record, key);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (DEBUG_ID_PATTERN.test(trimmed)) return trimmed;
      }
    }
  }

  for (const value of strings) {
    const match = value.match(
      /(?:debug_id|debugId|debugID|paypal_debug_id)\s*["']?\s*[:=]\s*["']?([0-9a-f]{8,32})\b/i,
    );
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function extractCorrelationId(
  records: Record<string, unknown>[],
  strings: string[],
): string | undefined {
  for (const record of records) {
    for (const key of CORRELATION_ID_KEYS) {
      const value = safeGet(record, key);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (CORRELATION_ID_PATTERN.test(trimmed)) return trimmed;
      }
    }
  }

  for (const value of strings) {
    const match = value.match(
      /(?:correlation_id|correlationId)\s*["']?\s*[:=]\s*["']?([0-9a-f][0-9a-f-]{15,63})\b/i,
    );
    if (match?.[1]) return match[1];
  }

  return undefined;
}

function sanitizeName(value: string | undefined): string {
  if (!value) return "Error";
  const trimmed = value.trim();
  if (!NAME_PATTERN.test(trimmed)) return "Error";
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

function sanitizeCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!CODE_PATTERN.test(trimmed)) return undefined;
  return trimmed.slice(0, MAX_CODE_LENGTH);
}

function sanitizeOrderId(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!ORDER_ID_PATTERN.test(trimmed)) return undefined;
  return trimmed;
}

function sanitizeMessage(rawMessage: string): string {
  let value =
    rawMessage.length > MAX_RAW_MESSAGE_LENGTH
      ? rawMessage.slice(0, MAX_RAW_MESSAGE_LENGTH)
      : rawMessage;
  value = value.replace(URL_PATTERN, "[redacted-url]");
  value = value.replace(PAYPAL_DOMAIN_PATTERN, "[redacted-url]");
  value = value.replace(EMAIL_PATTERN, "[redacted-email]");
  value = value.replace(JWT_PATTERN, "[redacted-jwt]");
  value = value.replace(AUTH_HEADER_PATTERN, "$1 [redacted]");
  value = value.replace(SENSITIVE_FIELD_PATTERN, "$1=[redacted]");
  value = value.replace(QUERY_PARAM_PATTERN, "$1=[redacted]");
  value = value.replace(LONG_TOKEN_PATTERN, "[redacted-token]");
  value = value.replace(CARD_NUMBER_PATTERN, "[redacted-number]");
  value = value.replace(LONG_DIGITS_PATTERN, "[redacted-number]");
  value = value.replace(BUYER_NAME_PATTERN, "$1 [redacted]");
  value = value.replace(ADDRESS_PATTERN, "[redacted-address]");
  value = value.replace(/\s+/g, " ").trim();

  if (value.length > MAX_MESSAGE_LENGTH) {
    value = `${value.slice(0, MAX_MESSAGE_LENGTH - 1)}…`;
  }
  return value;
}

/**
 * Returns only the safe subset of a PayPal SDK error. The raw error object is
 * never returned, serialized wholesale, or logged by this module.
 */
export function describePayPalError(
  error: unknown,
  orderId?: string | null,
): PayPalErrorDiagnostic {
  const { records, strings } = collectError(error);

  const name = sanitizeName(findFirstString(records, ["name"]));
  const rawMessage =
    findFirstString(records, MESSAGE_KEYS) ??
    (typeof error === "string" ? error : "");
  const code =
    sanitizeCode(findFirstString(records, ["issue"])) ??
    sanitizeCode(findFirstString(records, ["code"])) ??
    sanitizeCode(findFirstString(records, ["error"]));
  const debugId = extractDebugId(records, strings);
  const correlationId = extractCorrelationId(records, strings);
  const safeOrderId = sanitizeOrderId(orderId);
  const message = sanitizeMessage(rawMessage) || FALLBACK_MESSAGE;

  return {
    name,
    message,
    ...(code ? { code } : {}),
    ...(debugId ? { debugId } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(safeOrderId ? { orderId: safeOrderId } : {}),
  };
}

/**
 * Logs the sanitized diagnostic and returns it so the UI can show a safe
 * PayPal reference. Never pass the raw error object to console.
 */
export function reportPayPalCheckoutError(
  error: unknown,
  orderId?: string | null,
): PayPalErrorDiagnostic {
  const diagnostic = describePayPalError(error, orderId);
  console.error("[paypal-checkout] buyer approval error", diagnostic);
  return diagnostic;
}
