/**
 * One-time import of the Encalm IT inventory sheet
 * (S No | COMPUTER NAME / NUMBER | COMPUTER MAKE | COMPUTER MODEL |
 *  DEVICE SERIAL NUMBER | LOCATION | USED IN LOCATION | DEPARTMENT |
 *  USER NAME | User Email ID | City | Remark and update |
 *  Asset Custodianship | Criticality | Status | Asset Categorisation).
 *
 * Pure: turns sheet rows into asset inputs plus per-row problems, so the
 * Import screen can preview before anything is written.
 */

import {
  ASSET_CLASSES,
  CRITICALITY_LEVELS,
  LocationCode,
  OPERATIONAL_STATUSES,
  VERTICALS,
} from "@/constants/categories";
import { formatLocation } from "@/lib/location";
import type { Asset, AssetCategory, AssetInput } from "@/types/asset";

export type ImportField =
  | "hostName"
  | "make"
  | "model"
  | "serial"
  | "location"
  | "usedIn"
  | "department"
  | "userName"
  | "userEmail"
  | "city"
  | "remarks"
  | "custodianship"
  | "criticality"
  | "operationalStatus"
  | "assetClass"
  | "accessories"
  | "vertical";

/** Header text (normalised) → field. Several spellings are accepted. */
const HEADER_ALIASES: Record<ImportField, string[]> = {
  hostName: ["computer name / number", "computer name", "host name", "hostname", "computer number"],
  make: ["computer make", "make"],
  model: ["computer model", "model", "asset model"],
  serial: ["device serial number (service tag)", "device serial number", "serial number", "service tag", "serial no"],
  location: ["location"],
  usedIn: ["used in location", "terminal / desk", "used in"],
  department: ["department"],
  userName: ["user name", "username", "assigned to"],
  userEmail: ["user email id", "user email", "email", "email id"],
  city: ["city"],
  remarks: ["remark and update", "remarks", "remark", "notes"],
  custodianship: ["assset custodianship", "asset custodianship", "custodianship"],
  criticality: ["criticality of asset /asset valuation", "criticality of asset / asset valuation", "criticality", "asset valuation"],
  operationalStatus: ["status (operational/non operational)", "operational status", "status"],
  assetClass: ["asset cateogarisation (hardware/software/service/)", "asset categorisation (hardware/software/service)", "asset categorisation", "asset categorization", "asset cateogarisation", "asset class"],
  accessories: ["accessories"],
  vertical: ["vertical", "company"],
};

/** Header normalisation: case, spacing, underscores and punctuation-insensitive. */
export function normaliseHeader(h: unknown): string {
  return String(h ?? "")
    .replace(/ /g, " ")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const ALIAS_LOOKUP = new Map<string, ImportField>();
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [ImportField, string[]][]) {
  for (const a of aliases) ALIAS_LOOKUP.set(normaliseHeader(a), field);
}

export function mapHeaders(headerRow: unknown[]): Partial<Record<ImportField, number>> {
  const out: Partial<Record<ImportField, number>> = {};
  headerRow.forEach((h, i) => {
    const field = ALIAS_LOOKUP.get(normaliseHeader(h));
    if (field && out[field] === undefined) out[field] = i;
  });
  return out;
}

/** Cell text: trims, drops non-breaking spaces and collapses whitespace. */
export function cleanText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

const SITE_NAMES: [RegExp, LocationCode][] = [
  [/^(del|delhi|new delhi|ncr|gurgaon|gurugram)$/i, "DEL"],
  [/^(hyd|hyderabad)$/i, "HYD"],
  [/^(goa|mopa|dabolim)$/i, "GOA"],
  [/^(bug|bhogapuram|vizag|visakhapatnam|vishakhapatnam)$/i, "BUG"],
  [/^(nag|nagpur)$/i, "NAG"],
];

export function siteFromText(text: string): LocationCode | "" {
  const t = cleanText(text);
  for (const [re, code] of SITE_NAMES) if (re.test(t)) return code;
  return "";
}

/** "a@x.com/b@x.com", "a@x.com; b@x.com" → ["a@x.com", "b@x.com"]. */
export function splitEmails(text: string): string[] {
  return cleanText(text)
    .split(/[\/,;\s]+/)
    .map((e) => e.trim())
    .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
}

/** Device type from the host name, e.g. GOAEHPL-NB001 → Laptop. */
export function categoryFromHostName(host: string): AssetCategory | "" {
  const h = host.toUpperCase();
  if (/(^|[-_])(NB|LT|LAP)\d*/.test(h) || /-NB\d|NB\d{2,}/.test(h)) return "Laptop";
  if (/(^|[-_])(DT|PC|DESK)\d*/.test(h)) return "Desktop";
  if (/(^|[-_])(MN|MON)\d*/.test(h)) return "Monitor";
  if (/(^|[-_])(PH|MOB)\d*/.test(h)) return "Phone";
  if (/(^|[-_])(TAB)\d*/.test(h)) return "Tablet";
  return "";
}

/** Company from the host name, e.g. GOAEHPL-… → ENCALM HOSPITALITY PVT LTD. */
export function verticalFromHostName(host: string): string {
  const h = host.toUpperCase();
  if (h.includes("EHPL")) return "ENCALM HOSPITALITY PVT LTD";
  if (h.includes("EATS")) return "ENCALM EATS PVT LTD";
  if (h.includes("SKY")) return "ENCALM SKYPLATES";
  if (h.includes("HOTEL")) return "ENCALM HOTEL";
  return "";
}

function pickChoice(value: string, choices: readonly string[]): string {
  const v = value.trim().toLowerCase().replace(/[-_]/g, " ");
  return choices.find((c) => c.toLowerCase() === v) ?? "";
}

export interface ImportProblem {
  level: "error" | "warning";
  message: string;
}

export interface ImportRow {
  /** Spreadsheet row number (1-based, header is row 1). */
  rowNumber: number;
  input: AssetInput;
  assigneeEmail?: string;
  problems: ImportProblem[];
  /** False when any problem is an error (row is skipped). */
  ok: boolean;
}

export interface ImportDefaults {
  category: AssetCategory;
  vertical: string;
}

export interface ParseResult {
  rows: ImportRow[];
  missingHeaders: ImportField[];
}

const REQUIRED_HEADERS: ImportField[] = ["hostName", "serial", "location"];

export function parseInventorySheet(
  sheet: unknown[][],
  existing: Pick<Asset, "serialNumber">[],
  defaults: ImportDefaults,
): ParseResult {
  // Header row = first row that names at least the host name and serial columns.
  const headerIndex = sheet.findIndex((r) => {
    const m = mapHeaders(r || []);
    return m.hostName !== undefined && m.serial !== undefined;
  });
  if (headerIndex < 0) return { rows: [], missingHeaders: REQUIRED_HEADERS };
  const cols = mapHeaders(sheet[headerIndex]);
  const missingHeaders = REQUIRED_HEADERS.filter((f) => cols[f] === undefined);

  const existingSerials = new Set(
    existing.map((a) => (a.serialNumber || "").trim().toUpperCase()).filter(Boolean),
  );
  const seenInFile = new Map<string, number>();
  const rows: ImportRow[] = [];

  for (let i = headerIndex + 1; i < sheet.length; i++) {
    const raw = sheet[i] || [];
    const get = (f: ImportField) => (cols[f] === undefined ? "" : cleanText(raw[cols[f]!]));
    const hostName = get("hostName");
    const serial = get("serial").toUpperCase();
    // Skip fully blank lines.
    if (!raw.some((c) => cleanText(c))) continue;

    const problems: ImportProblem[] = [];
    const err = (message: string) => problems.push({ level: "error", message });
    const warn = (message: string) => problems.push({ level: "warning", message });

    if (!hostName) err("Missing computer name / host name");
    if (!serial) err("Missing serial number");
    if (serial) {
      if (existingSerials.has(serial)) err(`Serial ${serial} is already in the register`);
      const firstRow = seenInFile.get(serial);
      if (firstRow) err(`Serial ${serial} repeats row ${firstRow}`);
      else seenInFile.set(serial, i + 1);
    }

    const siteText = get("location") || get("city");
    const site = siteFromText(siteText);
    if (!site) err(siteText ? `Unknown location "${siteText}" (use DEL, HYD, GOA, BUG or NAG)` : "Missing location");

    let category = categoryFromHostName(hostName);
    if (!category) {
      category = defaults.category;
      warn(`Category set to ${defaults.category} (couldn't tell from the host name)`);
    }
    let vertical = pickChoice(get("vertical"), VERTICALS) || verticalFromHostName(hostName);
    if (!vertical) {
      vertical = defaults.vertical;
      if (vertical) warn(`Vertical set to ${vertical}`);
      else warn("No vertical — pick a default vertical before importing");
    }

    const userName = get("userName");
    const emails = splitEmails(get("userEmail"));
    const assigneeEmail = emails[0];
    if (userName && !assigneeEmail) warn("User has no email — no confirmation can be requested");

    const notesParts = [get("remarks")];
    if (emails.length > 1) notesParts.push(`Also used by: ${emails.slice(1).join(", ")}`);

    const operational = pickChoice(get("operationalStatus"), OPERATIONAL_STATUSES);
    const criticality = pickChoice(get("criticality"), CRITICALITY_LEVELS);
    const assetClass = pickChoice(get("assetClass"), ASSET_CLASSES);
    if (get("criticality") && !criticality) warn(`Criticality "${get("criticality")}" not recognised (Low / Medium / High)`);

    const input: AssetInput = {
      name: hostName,
      make: get("make"),
      model: get("model"),
      category,
      serialNumber: serial,
      status: userName ? "in_use" : "available",
      assignee: userName,
      location: formatLocation(site, get("usedIn")),
      vertical,
      department: get("department"),
      custodianship: get("custodianship"),
      criticality,
      operationalStatus: operational || "Operational",
      assetClass: assetClass || "Hardware",
      accessories: get("accessories"),
      purchaseDate: "",
      purchasePrice: 0,
      warrantyExpiry: null,
      notes: notesParts.filter(Boolean).join("\n"),
    };

    rows.push({
      rowNumber: i + 1,
      input,
      assigneeEmail,
      problems,
      ok: !problems.some((p) => p.level === "error"),
    });
  }

  return { rows, missingHeaders };
}

/** Blank template with the inventory sheet's headers (CSV opens in Excel). */
export function inventoryTemplateCsv(): string {
  const headers = [
    "S No",
    "COMPUTER NAME / NUMBER",
    "COMPUTER MAKE",
    "COMPUTER MODEL",
    "DEVICE_SERIAL NUMBER (service tag)",
    "LOCATION",
    "USED IN LOCATION",
    "DEPARTMENT",
    "USER NAME",
    "User Email ID",
    "City",
    "Remark and update",
    "Asset Custodianship",
    "Criticality of asset /Asset Valuation",
    "Status (Operational/Non Operational)",
    "Asset Categorisation (Hardware/Software/Service)",
    "Accessories",
    "Vertical",
  ];
  const quote = (h: string) => (/[",]/.test(h) ? `"${h.replace(/"/g, '""')}"` : h);
  return "﻿" + headers.map(quote).join(",") + "\r\n";
}
