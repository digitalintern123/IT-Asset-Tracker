/**
 * Pure asset-workflow rules: custody history, the audit trail (report logs)
 * and when a reassignment needs IT Admin approval. No React or I/O here so the
 * rules can be tested directly.
 */

import type {
  Asset,
  AssetEvent,
  AssetEventType,
  AssetInput,
  AssignmentRecord,
} from "@/types/asset";

export interface ChangeContext {
  by: string;
  approvedBy?: string;
  assigneeEmail?: string;
  reason?: string;
  now?: string;
}

let seq = 0;
function newId(prefix: string): string {
  seq = (seq + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${seq}_${Math.random().toString(36).slice(2, 6)}`;
}

export function makeEvent(
  type: AssetEventType,
  fields: Omit<AssetEvent, "id" | "type" | "at" | "by"> & { by: string; at?: string },
): AssetEvent {
  const { at, ...rest } = fields;
  return { id: newId("evt"), type, at: at || new Date().toISOString(), ...rest };
}

function trimmed(s?: string | null): string {
  return (s || "").trim();
}

/**
 * True when a non-admin is moving an In Use device to a different user.
 * Returning a device (no assignee / not In Use) needs no approval.
 */
export function needsReassignApproval(existing: Asset, input: AssetInput, isAdmin: boolean): boolean {
  if (isAdmin) return false;
  if (existing.status !== "in_use") return false;
  if (input.status !== "in_use") return false;
  const from = trimmed(existing.assignee).toLowerCase();
  const to = trimmed(input.assignee).toLowerCase();
  return !!to && from !== to;
}

/** Custody history and new audit events for registering a device. */
export function eventsForCreate(
  input: AssetInput,
  ctx: ChangeContext,
): { history: AssignmentRecord[]; events: AssetEvent[] } {
  const now = ctx.now || new Date().toISOString();
  const history: AssignmentRecord[] = [];
  const events: AssetEvent[] = [
    makeEvent("created", { by: ctx.by, at: now, toStatus: input.status, notes: ctx.reason }),
  ];
  if (input.status === "in_use" && trimmed(input.assignee)) {
    history.push({
      id: newId("hist"),
      assignee: trimmed(input.assignee),
      assigneeEmail: ctx.assigneeEmail || undefined,
      assignedBy: ctx.by,
      assignedAt: now,
      location: input.location,
      notes: "Initial registration assignment",
    });
    events.push(
      makeEvent("assigned", {
        by: ctx.by,
        at: now,
        assignee: trimmed(input.assignee),
        assigneeEmail: ctx.assigneeEmail || undefined,
      }),
    );
  }
  return { history, events };
}

/**
 * Custody history and new audit events for an update.
 * - Custody closes when the user changes or the device is returned
 *   (Available) or taken out of service (Out of Order).
 * - A new custody record opens when the device is In Use with a user who
 *   does not already hold it.
 */
export function eventsForUpdate(
  existing: Asset,
  input: AssetInput,
  ctx: ChangeContext,
): { history: AssignmentRecord[]; events: AssetEvent[] } {
  const now = ctx.now || new Date().toISOString();
  let history = [...(existing.assignmentHistory || [])];
  const events: AssetEvent[] = [];

  const fromUser = trimmed(existing.assignee);
  const toUser = trimmed(input.assignee);
  const assigneeChanged = fromUser.toLowerCase() !== toUser.toLowerCase();
  const statusChanged = existing.status !== input.status;
  const releasing =
    assigneeChanged || input.status === "available" || input.status === "retired";

  if (releasing && history.some((r) => !r.returnedAt)) {
    history = history.map((r) => (r.returnedAt ? r : { ...r, returnedAt: now }));
    if (fromUser) {
      events.push(makeEvent("returned", { by: ctx.by, at: now, assignee: fromUser }));
    }
  }

  const opensCustody =
    input.status === "in_use" &&
    !!toUser &&
    (assigneeChanged || existing.status !== "in_use" || !history.some((r) => !r.returnedAt));
  if (opensCustody) {
    history.push({
      id: newId("hist"),
      assignee: toUser,
      assigneeEmail: ctx.assigneeEmail || undefined,
      assignedBy: ctx.by,
      approvedBy: ctx.approvedBy,
      assignedAt: now,
      location: input.location,
      notes: ctx.reason || input.notes || "Custody transferred",
    });
    events.push(
      makeEvent("assigned", {
        by: ctx.by,
        at: now,
        assignee: toUser,
        assigneeEmail: ctx.assigneeEmail || undefined,
        approvedBy: ctx.approvedBy,
      }),
    );
  }

  if (statusChanged) {
    events.push(
      makeEvent("status_changed", {
        by: ctx.by,
        at: now,
        fromStatus: existing.status,
        toStatus: input.status,
        assignee: toUser || undefined,
        notes: input.status === "maintenance" || input.status === "retired" ? input.notes : undefined,
      }),
    );
  }

  return { history, events };
}

/** The editable fields of an asset (drops ids, timestamps and sync metadata). */
export function toAssetInput(asset: Asset): AssetInput {
  const { id, createdAt, updatedAt, spItemId, _syncStatus, etag, version, ...rest } = asset;
  return rest;
}
