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
    // Local calendar day (the From/To pickers and the CSV use local time).
    const d = new Date(r.at);
    const day = isNaN(d.getTime())
      ? r.at.slice(0, 10)
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

/**
 * Full register backup in the inventory-sheet layout, so the file can be
 * re-imported with Settings → Import from Excel (after saving it as .xlsx).
 */
export function registerCsv(assets: Asset[]): string {
  const header = [
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
    "Asset ID",
    "Category",
    "Status",
    "Purchase date",
    "Purchase price",
    "Warranty expiry",
  ];
  const lines = [header.map(csvCell).join(",")];
  assets.forEach((a, i) => {
    const [site, ...rest] = String(a.location || "").split(" — ");
    const holder = [...(a.assignmentHistory || [])].reverse().find((r) => !r.returnedAt);
    lines.push(
      [
        String(i + 1),
        a.name,
        a.make,
        a.model,
        a.serialNumber,
        site,
        rest.join(" — "),
        a.department,
        a.assignee,
        holder?.assigneeEmail,
        "",
        a.notes,
        a.custodianship,
        a.criticality,
        a.operationalStatus,
        a.assetClass,
        a.accessories,
        a.vertical,
        a.id,
        a.category,
        STATUS_LABELS[a.status] ?? a.status,
        a.purchaseDate,
        a.purchasePrice ? String(a.purchasePrice) : "",
        a.warrantyExpiry,
      ]
        .map((v) => csvCell(String(v ?? "")))
        .join(","),
    );
  });
  return "\uFEFF" + lines.join("\r\n");
}

/** Complete backup including custody history and audit events. */
export function registerJson(assets: Asset[]): string {
  const strip = ({ _syncStatus, etag, ...rest }: Asset) => rest;
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), count: assets.length, assets: assets.map(strip) },
    null,
    2,
  );
}
