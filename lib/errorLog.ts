/**
 * Small on-device error log: crashes, unhandled promise rejections and
 * SharePoint sync/save errors. Admins see it in Settings → Diagnostics and
 * can email it to IT. Kept in localStorage (last 50 entries); tokens and
 * long payloads are stripped before anything is stored.
 */
import { Platform } from "react-native";

import { MS_CONFIG } from "@/lib/msConfig";
import { openMailDraft } from "@/lib/mail";

export interface ErrorLogEntry {
  at: string;
  source: "crash" | "unhandled" | "sync" | "access" | "manual";
  message: string;
  stack?: string;
  page?: string;
}

const KEY = "@encalm/error_log_v1";
const MAX_ENTRIES = 50;

/** Remove anything that looks like a token or an Authorization header. */
export function redact(text: string): string {
  return text
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]*)?/g, "[token]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [token]")
    .replace(/(access_token|id_token|refresh_token|code)=[^&\s]+/gi, "$1=[redacted]");
}

function storage(): Storage | null {
  try {
    return Platform.OS === "web" && typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function getErrorLog(): ErrorLogEntry[] {
  try {
    const raw = storage()?.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearErrorLog(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {}
}

export function recordError(source: ErrorLogEntry["source"], error: unknown): void {
  try {
    const err = error as any;
    const message = redact(String(err?.message ?? err ?? "Unknown error")).slice(0, 500);
    const entry: ErrorLogEntry = {
      at: new Date().toISOString(),
      source,
      message,
      stack: err?.stack ? redact(String(err.stack)).slice(0, 2000) : undefined,
      page: typeof window !== "undefined" ? window.location?.pathname : undefined,
    };
    const list = getErrorLog();
    // Same message from the same page twice in a row: keep one.
    const last = list[list.length - 1];
    if (last && last.message === entry.message && last.page === entry.page) return;
    storage()?.setItem(KEY, JSON.stringify([...list, entry].slice(-MAX_ENTRIES)));
  } catch {}
}

let installed = false;
/** Web: record crashes and unhandled promise rejections. */
export function installGlobalErrorHandlers(): void {
  if (installed || Platform.OS !== "web" || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => recordError("unhandled", e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => recordError("unhandled", (e as PromiseRejectionEvent).reason));
}

/** Plain-text report for IT (newest first). */
export function formatErrorReport(entries: ErrorLogEntry[], extra?: string): string {
  const header = [
    "Encalm IT Asset Tracker — problem report",
    `Time: ${new Date().toLocaleString()}`,
    typeof navigator !== "undefined" ? `Browser: ${navigator.userAgent}` : "",
    extra || "",
    "",
  ].filter(Boolean);
  const body = [...entries].reverse().map((e) =>
    [`[${new Date(e.at).toLocaleString()}] ${e.source} ${e.page || ""}`, e.message, e.stack ? e.stack.split("\n").slice(0, 6).join("\n") : ""]
      .filter(Boolean)
      .join("\n"),
  );
  return [...header, ...body].join("\n\n");
}

/** Opens an email draft to Encalm IT with the report. */
export function emailErrorReport(entries: ErrorLogEntry[], extra?: string): Promise<boolean> {
  return openMailDraft({
    to: [MS_CONFIG.CONFIRMATION_EMAIL],
    subject: "IT Asset Tracker — problem report",
    // mailto bodies are limited in length; keep the latest entries.
    body: formatErrorReport(entries.slice(-10), extra).slice(0, 1800),
  });
}
