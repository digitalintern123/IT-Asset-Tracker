/**
 * Outgoing email for the asset workflow (maintenance notices, reassignment
 * approvals). Sent automatically through Microsoft Graph (/me/sendMail, needs
 * the Mail.Send scope); if that fails, a pre-filled draft is opened instead so
 * the message is never silently lost.
 */

import { Linking, Platform } from "react-native";

import { STATUS_LABELS } from "@/constants/categories";
import { MS_CONFIG } from "@/lib/msConfig";
import type { ApprovalRequest, Asset } from "@/types/asset";

export interface MailMessage {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
}

export type MailOutcome = "sent" | "draft" | "failed";

function isEmail(s?: string | null): s is string {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Valid, trimmed, de-duplicated (case-insensitive) addresses. */
export function cleanRecipients(list: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (!isEmail(raw)) continue;
    const email = raw.trim();
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(email);
  }
  return out;
}

export async function sendGraphMail(token: string, msg: MailMessage): Promise<void> {
  const toRecipients = (list: string[]) =>
    list.map((address) => ({ emailAddress: { address } }));
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: "Text", content: msg.body },
        toRecipients: toRecipients(msg.to),
        ccRecipients: toRecipients(msg.cc || []),
      },
      saveToSentItems: true,
    }),
  });
  if (res.status !== 202) {
    const err: any = new Error(`Graph sendMail failed (HTTP ${res.status})`);
    err.statusCode = res.status;
    throw err;
  }
}

export async function openMailDraft(msg: MailMessage): Promise<boolean> {
  const params = [
    `subject=${encodeURIComponent(msg.subject)}`,
    `body=${encodeURIComponent(msg.body)}`,
  ];
  if (msg.cc && msg.cc.length > 0) params.push(`cc=${encodeURIComponent(msg.cc.join(","))}`);
  const url = `mailto:${msg.to.map(encodeURIComponent).join(",")}?${params.join("&")}`;
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.location.href = url;
      return true;
    }
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}

/** Send via Graph; fall back to a pre-filled draft if Graph is unavailable. */
export async function deliverMail(
  token: string | null | undefined,
  msg: MailMessage,
): Promise<MailOutcome> {
  if (msg.to.length === 0) return "failed";
  if (token) {
    try {
      await sendGraphMail(token, msg);
      return "sent";
    } catch (err) {
      console.warn("Automatic email failed, opening a draft instead:", err);
    }
  }
  return (await openMailDraft(msg)) ? "draft" : "failed";
}

/** The device's current user's email: latest open custody record, else the assignee field. */
export function currentUserEmail(asset: Asset): string | undefined {
  const open = [...(asset.assignmentHistory || [])].reverse().find((r) => !r.returnedAt);
  if (isEmail(open?.assigneeEmail)) return open!.assigneeEmail!.trim();
  if (isEmail(asset.assignee)) return asset.assignee.trim();
  return undefined;
}

function deviceLines(asset: Asset): string[] {
  return [
    `• Device: ${asset.name}`,
    `• Asset Tag: ${asset.id}`,
    `• Category: ${asset.category}`,
    `• Serial Number: ${asset.serialNumber || "—"}`,
    `• Location: ${asset.location || "—"}`,
  ];
}

export function buildMaintenanceMail(asset: Asset, reason: string, by: string): MailMessage {
  const userEmail = currentUserEmail(asset);
  const managers = cleanRecipients([...MS_CONFIG.IT_MANAGER_EMAILS]);
  const to = cleanRecipients([userEmail, ...managers]);
  return {
    to,
    subject: `[Maintenance] ${asset.name} (${asset.id}) is under maintenance`,
    body: [
      `Hello${asset.assignee ? ` ${asset.assignee}` : ""},`,
      "",
      `This is a reminder that the following device is now under maintenance:`,
      "",
      ...deviceLines(asset),
      `• Current user: ${asset.assignee || "None"}`,
      "",
      `Reason: ${reason || "—"}`,
      `Marked by: ${by} on ${new Date().toLocaleString()}`,
      "",
      `IT will let you know when the device is back in service.`,
      "",
      `Encalm IT Asset Management System`,
    ].join("\n"),
  };
}

export function buildReassignRequestMail(asset: Asset, req: ApprovalRequest): MailMessage {
  const pending = req.pendingChanges || {};
  return {
    to: cleanRecipients([...MS_CONFIG.ADMIN_EMAILS]),
    subject: `[Approval required] Reassign ${asset.name} (${asset.id})`,
    body: [
      `Dear IT Administrator,`,
      "",
      `${req.requesterName} has requested to reassign an in-use device:`,
      "",
      ...deviceLines(asset),
      `• Current user: ${asset.assignee || "None"}`,
      `• New user: ${pending.assignee || "—"}${pending.assigneeEmail ? ` (${pending.assigneeEmail})` : ""}`,
      `• New location: ${pending.location || asset.location || "—"}`,
      "",
      `Reason: ${req.reason || "—"}`,
      `Requested by: ${req.requesterName} (${req.requesterEmail}) on ${new Date(req.requestedAt).toLocaleString()}`,
      "",
      `Please open the Encalm Asset Tracker to approve or reject this request.`,
      "",
      `Encalm IT Asset Management System`,
    ].join("\n"),
  };
}

export function buildReassignDecisionMail(
  asset: Asset,
  req: ApprovalRequest,
  approved: boolean,
  approverName: string,
): MailMessage {
  const pending = req.pendingChanges || {};
  return {
    to: cleanRecipients([req.requesterEmail]),
    subject: `[${approved ? "Approved" : "Rejected"}] Reassign ${asset.name} (${asset.id})`,
    body: [
      `Hello ${req.requesterName},`,
      "",
      `Your request to reassign ${asset.name} (${asset.id}) to ${pending.assignee || "—"} was ${approved ? "APPROVED" : "REJECTED"} by ${approverName}.`,
      req.decisionNotes ? `Notes: ${req.decisionNotes}` : "",
      "",
      `Current status: ${STATUS_LABELS[asset.status] ?? asset.status}`,
      "",
      `Encalm IT Asset Management System`,
    ]
      .filter((line, i, arr) => !(line === "" && arr[i - 1] === ""))
      .join("\n"),
  };
}
