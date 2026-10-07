/**
 * Report logs: every audit event across all assets, flattened for the Reports
 * screen and CSV export.
 */

import { STATUS_LABELS } from "@/constants/categories";
import type { Asset, AssetEventType, AssetStatus } from "@/types/asset";

export const EVENT_LABELS: Record<AssetEventType, string> = {
  created: "Registered",
  assigned: "Assigned",
  returned: "Returned",
  status_changed: "Status changed",
  reassign_requested: "Reassignment requested",
  reassign_approved: "Reassignment approved",
  reassign_rejected: "Reassignment rejected",
  confirmed: "Receipt confirmed by user",
};

export interface ReportRow {
  eventId: string;
  at: string;
  assetId: string;
  device: string;
  make: string;
  model: string;
  location: string;
  vertical: string;
  department: string;
  criticality: string;
  operationalStatus: string;
  type: AssetEventType;
  event: string;
  user: string;
  by: string;
  approvedBy: string;
  fromStatus?: AssetStatus;
  toStatus?: AssetStatus;
  statusChange: string;
  notes: string;
}

function statusLabel(s?: AssetStatus): string {
  return s ? STATUS_LABELS[s] ?? s : "";
}

export function flattenEvents(assets: Asset[]): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const asset of assets) {
    for (const evt of asset.events || []) {
      const from = statusLabel(evt.fromStatus);
      const to = statusLabel(evt.toStatus);
      rows.push({
        eventId: evt.id,
        at: evt.at,
        assetId: asset.id,
        device: asset.name,
        make: asset.make || "",
        model: asset.model || "",
        location: asset.location || "",
        vertical: asset.vertical || "",
        department: asset.department || "",
        criticality: asset.criticality || "",
        operationalStatus: asset.operationalStatus || "",
        type: evt.type,
        event: EVENT_LABELS[evt.type] ?? evt.type,
        user: evt.assignee || "",
        by: evt.by || "",
        approvedBy: evt.approvedBy || "",
        fromStatus: evt.fromStatus,
        toStatus: evt.toStatus,
        statusChange: from && to ? `${from} → ${to}` : to || from,
        notes: evt.notes || "",
      });
    }
  }
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export interface ReportFilter {
  type?: AssetEventType | "all";
  status?: AssetStatus | "all";
  from?: string; // YYYY-MM-DD, inclusive
  to?: string; // YYYY-MM-DD, inclusive
  search?: string;
}

export function filterRows(rows: ReportRow[], f: ReportFilter): ReportRow[] {
  const q = (f.search || "").trim().toLowerCase();
  return rows.filter((r) => {
    if (f.type && f.type !== "all" && r.type !== f.type) return false;
    if (f.status && f.status !== "all" && r.toStatus !== f.status && r.fromStatus !== f.status) {
      return false;
    }
    const day = r.at.slice(0, 10);
    if (f.from && day < f.from) return false;
    if (f.to && day > f.to) return false;
    if (q) {
      const hay = `${r.assetId} ${r.device} ${r.make} ${r.model} ${r.location} ${r.vertical} ${r.department} ${r.user} ${r.by} ${r.approvedBy} ${r.notes}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function csvCell(value: string): string {
  // Neutralise spreadsheet formulas from user-entered text.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: ReportRow[]): string {
  const header = [
    "Date",
    "Asset ID",
    "Host Name",
    "Make",
    "Model",
    "Vertical",
    "Location",
    "Department",
    "Criticality",
    "Operational status",
    "Event",
    "User",
    "By",
    "Approved by",
    "Status",
    "Notes",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        new Date(r.at).toLocaleString(),
        r.assetId,
        r.device,
        r.make,
        r.model,
        r.vertical,
        r.location,
        r.department,
        r.criticality,
        r.operationalStatus,
        r.event,
        r.user,
        r.by,
        r.approvedBy,
        r.statusChange,
        r.notes,
      ]
        .map((v) => csvCell(String(v ?? "")))
        .join(","),
    );
  }
  // BOM so Excel opens UTF-8 (e.g. the → arrow) correctly.
  return "﻿" + lines.join("\r\n");
}
