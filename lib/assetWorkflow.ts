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
 * True when a non-admin moves a device someone holds (In Use, or in
 * Maintenance while still held) to a different user. Returning a device
 * (Available / Out of Order) needs no approval. Maintenance counts too, so
 * In Use → Maintenance (new user) → In Use can't skip the approval.
 */
export function needsReassignApproval(existing: Asset, input: AssetInput, isAdmin: boolean): boolean {
  if (isAdmin) return false;
  const held = existing.status === "in_use" || (existing.status === "maintenance" && !!openCustodyRecord(existing));
  if (!held) return false;
  if (input.status !== "in_use" && input.status !== "maintenance") return false;
  const holder = existing.status === "in_use" ? existing.assignee : openCustodyRecord(existing)?.assignee;
  const from = trimmed(holder).toLowerCase();
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
  } else if (ctx.assigneeEmail && !releasing) {
    // Same holder, corrected email: update the open record so the
    // confirmation request goes to (and can be confirmed by) the right
    // account. A confirmation by the old address no longer applies.
    const email = trimmed(ctx.assigneeEmail);
    history = history.map((r) =>
      !r.returnedAt && trimmed(r.assigneeEmail).toLowerCase() !== email.toLowerCase()
        ? { ...r, assigneeEmail: email, confirmedAt: undefined, confirmedBy: undefined }
        : r,
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

/** The custody record of the device's current holder, if any. */
export function openCustodyRecord(asset: Asset): AssignmentRecord | undefined {
  return [...(asset.assignmentHistory || [])].reverse().find((r) => !r.returnedAt);
}

/**
 * Once the current user has confirmed receipt, the device can't be deleted
 * (or have deletion requested) until it is returned or marked Out of Order.
 */
export function isDeleteLocked(asset: Asset): boolean {
  if (asset.status !== "in_use" && asset.status !== "maintenance") return false;
  return !!openCustodyRecord(asset)?.confirmedAt;
}

/** Custody records opened by an update (present after, absent before). */
export function newCustodyRecords(
  before: AssignmentRecord[] | undefined,
  after: AssignmentRecord[] | undefined,
): AssignmentRecord[] {
  const seen = new Set((before || []).map((r) => r.id));
  return (after || []).filter((r) => !seen.has(r.id));
}
