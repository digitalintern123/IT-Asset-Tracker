/**
 * Edit approval and "my devices" rules. Pure functions (no React, no I/O) so
 * they can be tested directly.
 *
 * - IT Technicians edit a device only after an IT-Asset Approver approved
 *   their edit request: one save, within 24 hours of the approval, by the
 *   technician who asked. Admins and approvers edit directly.
 * - Staff without an app role see only the devices issued to them.
 */

import { openCustodyRecord } from "@/lib/assetWorkflow";
import type { ApprovalRequest, Asset } from "@/types/asset";

export const EDIT_GRANT_HOURS = 24;
const EDIT_GRANT_MS = EDIT_GRANT_HOURS * 60 * 60 * 1000;

interface EditUser {
  role?: string;
  email?: string;
  isApprover?: boolean;
  seesAll?: boolean;
  isDemo?: boolean;
}

function same(a?: string | null, b?: string | null): boolean {
  const x = (a || "").trim().toLowerCase();
  return !!x && x === (b || "").trim().toLowerCase();
}

/** Technicians need an approved edit request; admins and approvers don't. */
export function needsEditApproval(user: EditUser | null | undefined): boolean {
  return user?.role === "technician" && !user.isApprover;
}

/** When an approved edit request stops being usable. */
export function editGrantExpiresAt(req: ApprovalRequest): number {
  return new Date(req.decidedAt || 0).getTime() + EDIT_GRANT_MS;
}

/** The approved, unused, unexpired edit request of this user, if any. */
export function activeEditGrant(
  asset: Asset | undefined,
  email: string | undefined,
  now = Date.now(),
): ApprovalRequest | null {
  const req = asset?.approvalRequest;
  if (!req || req.action !== "edit_access" || req.status !== "approved") return null;
  if (req.consumedAt || !same(req.requesterEmail, email)) return null;
  const expires = editGrantExpiresAt(req);
  return Number.isFinite(expires) && now < expires ? req : null;
}

/** What the Edit button does for this user on this device. */
export type EditState = "direct" | "granted" | "pending" | "request" | "none";

export function editState(asset: Asset, user: EditUser | null | undefined, canEdit: boolean, now = Date.now()): EditState {
  if (!canEdit) return "none";
  if (!needsEditApproval(user)) return "direct";
  if (activeEditGrant(asset, user?.email, now)) return "granted";
  const req = asset.approvalRequest;
  if (req?.action === "edit_access" && req.status === "pending" && same(req.requesterEmail, user?.email)) return "pending";
  return "request";
}

/** The device is issued to this person (open custody record or the assignee field). */
export function isOwnDevice(asset: Asset, email?: string): boolean {
  if (!email) return false;
  const open = openCustodyRecord(asset);
  if (open) return same(open.assigneeEmail, email) || same(open.assignee, email);
  return same(asset.assignee, email);
}

/** The part of the register this user may see. */
export function visibleAssets(assets: Asset[], user: EditUser | null | undefined): Asset[] {
  if (!user || user.isDemo || user.seesAll) return assets;
  return assets.filter((a) => isOwnDevice(a, user.email));
}
