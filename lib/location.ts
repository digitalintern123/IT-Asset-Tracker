/**
 * Location = one of the Encalm sites plus an optional terminal/desk detail,
 * stored together in the SharePoint Location column as "DEL — T3 Lounge".
 * Older free-text values (no site code) are kept as the detail.
 */

import { LOCATIONS, LocationCode } from "@/constants/categories";

const SEPARATOR = " — ";
const CODES = LOCATIONS.map((l) => l.code) as readonly string[];

export interface ParsedLocation {
  site: LocationCode | "";
  detail: string;
}

export function parseLocation(value?: string | null): ParsedLocation {
  const text = (value || "").trim();
  const match = text.match(/^([A-Za-z]{3})(?:\s*[—–-]\s*(.*))?$/s);
  if (match && CODES.includes(match[1].toUpperCase())) {
    return { site: match[1].toUpperCase() as LocationCode, detail: (match[2] || "").trim() };
  }
  return { site: "", detail: text };
}

export function formatLocation(site: LocationCode | "", detail?: string): string {
  const d = (detail || "").trim();
  if (!site) return d;
  return d ? `${site}${SEPARATOR}${d}` : site;
}

export function siteName(site: LocationCode | ""): string {
  return LOCATIONS.find((l) => l.code === site)?.name ?? "";
}
