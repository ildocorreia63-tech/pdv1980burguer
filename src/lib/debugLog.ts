// Lightweight debug logger for the digital menu / PIX flow.
// Keeps a rolling buffer of recent events (in memory + localStorage)
// so we can inspect the exact failure point without a debugger.

export type LogLevel = "info" | "warn" | "error";
export type LogEntry = {
  ts: string;            // ISO timestamp
  trace_id: string;      // groups events of a single order flow
  scope: string;         // e.g. "cardapio.submitOrder"
  stage: string;         // e.g. "insert_order", "asaas_create_pix"
  level: LogLevel;
  message: string;
  data?: unknown;
};

const KEY = "debug:log:v1";
const MAX = 200;

let buffer: LogEntry[] = load();
const listeners = new Set<(list: LogEntry[]) => void>();

function load(): LogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(buffer.slice(-MAX))); } catch {/* ignore */}
}
function safeData(d: unknown): unknown {
  if (d == null) return d;
  try { return JSON.parse(JSON.stringify(d)); } catch { return String(d); }
}

export function newTraceId(prefix = "trace"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function logEvent(
  trace_id: string,
  scope: string,
  stage: string,
  message: string,
  level: LogLevel = "info",
  data?: unknown,
) {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    trace_id, scope, stage, level, message,
    data: safeData(data),
  };
  buffer.push(entry);
  if (buffer.length > MAX) buffer = buffer.slice(-MAX);
  save();
  listeners.forEach((fn) => { try { fn(buffer); } catch {/* ignore */} });
  const tag = `%c[${scope}:${stage}]`;
  const style = level === "error" ? "color:#fff;background:#c0392b;padding:1px 4px;border-radius:3px"
              : level === "warn"  ? "color:#000;background:#f1c40f;padding:1px 4px;border-radius:3px"
              :                     "color:#fff;background:#2c3e50;padding:1px 4px;border-radius:3px";
  const args: unknown[] = [`${tag} ${message}`, style, { trace_id, ...(entry.data as object || {}) }];
  if (level === "error") console.error(...args);
  else if (level === "warn") console.warn(...args);
  else console.log(...args);
}

export function getLog(): LogEntry[] { return [...buffer]; }
export function subscribeLog(fn: (list: LogEntry[]) => void) {
  listeners.add(fn); return () => listeners.delete(fn);
}
export function clearLog() { buffer = []; save(); listeners.forEach((fn) => fn(buffer)); }
export function logAsText(): string {
  return buffer.map((e) =>
    `[${e.ts}] ${e.level.toUpperCase()} ${e.scope}:${e.stage} (${e.trace_id}) — ${e.message}` +
    (e.data ? `\n  ${JSON.stringify(e.data)}` : "")
  ).join("\n");
}

// Expose to window so devs can inspect from the browser console.
if (typeof window !== "undefined") {
  (window as any).__debugLog = { get: getLog, clear: clearLog, text: logAsText };
}
