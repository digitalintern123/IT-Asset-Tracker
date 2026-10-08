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
  /** Plain-text body (also used for the draft fallback). */
  body: string;
  /** Optional HTML body, used when sent through Graph. */
  html?: string;
  /** Send as this mailbox (e.g. the IT helpdesk shared mailbox). */
  from?: string;
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

export async function sendGraphMail(
  token: string,
  msg: MailMessage,
  fromMailbox?: string,
): Promise<void> {
  const toRecipients = (list: string[]) =>
    list.map((address) => ({ emailAddress: { address } }));
  const url = fromMailbox
    ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromMailbox)}/sendMail`
    : "https://graph.microsoft.com/v1.0/me/sendMail";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: msg.html
          ? { contentType: "HTML", content: msg.html }
          : { contentType: "Text", content: msg.body },
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

/**
 * Send via Graph — as `msg.from` (shared mailbox) when set, else from the
 * signed-in user's own mailbox — and fall back to a pre-filled draft.
 */
export async function deliverMail(
  token: string | null | undefined,
  msg: MailMessage,
): Promise<MailOutcome> {
  if (msg.to.length === 0) return "failed";
  if (token) {
    if (msg.from) {
      try {
        await sendGraphMail(token, msg, msg.from);
        return "sent";
      } catch (err) {
        // Needs Mail.Send.Shared consent and "Send As" on the shared mailbox.
        console.warn(`Could not send as ${msg.from}; sending from your own mailbox instead:`, err);
      }
    }
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
  const makeModel = [asset.make, asset.model].filter(Boolean).join(" ");
  return [
    `• Host Name: ${asset.name}`,
    ...(makeModel ? [`• Make / Model: ${makeModel}`] : []),
    `• Asset Tag: ${asset.id}`,
    `• Category: ${asset.category}`,
    `• Serial Number: ${asset.serialNumber || "—"}`,
    `• Location: ${asset.location || "—"}`,
    ...(asset.vertical ? [`• Vertical: ${asset.vertical}`] : []),
  ];
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Hand-over confirmation, in the format Corporate IT already uses
 * ("Laptop Confirmation"), sent as the IT helpdesk mailbox with IT in CC.
 * Privacy: on a reassignment this goes to the new user, so it must only
 * carry device data and the recipient's own name — never earlier custody
 * records, the asset notes or the reassignment reason.
 */
export function buildAssignmentConfirmMail(
  asset: Asset,
  record: { assignee: string; assigneeEmail?: string },
  assignedBy: string,
  confirmUrl: string,
): MailMessage {
  const category = String(asset.category || "Asset");
  const firstName = (record.assignee || "").trim().split(/\s+/)[0] || "Colleague";
  const model = [asset.make, asset.model].filter(Boolean).join(" ") || "—";
  const accessories = asset.accessories || "—";
  const intro = `Please find below the details of the ${category.toLowerCase()} handed over to you. Kindly review and confirm receipt of the same:`;
  const cols = ["S. No.", "Asset Name", "Asset Model", "Serial No.", "Hostname", "Accessories"];
  const vals = ["1", category, model, asset.serialNumber || "—", asset.name, accessories];
  const cell = "border:1px solid #000;padding:6px 10px;font-family:Segoe UI,Arial,sans-serif;font-size:14px;";
  const html = [
    `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#000;">`,
    `<p>Dear ${escapeHtml(firstName)},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    `<table style="border-collapse:collapse;margin:12px 0;">`,
    `<tr>${cols.map((c) => `<th style="${cell}font-weight:600;text-align:center;">${escapeHtml(c)}</th>`).join("")}</tr>`,
    `<tr>${vals.map((v) => `<td style="${cell}">${escapeHtml(v)}</td>`).join("")}</tr>`,
    `</table>`,
    `<p><a href="${escapeHtml(confirmUrl)}" style="display:inline-block;background:#CDA45E;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;">Confirm receipt</a></p>`,
    `<p style="font-size:12px;color:#555;">If the button doesn't work, open this link and sign in with your Encalm Microsoft 365 account:<br>${escapeHtml(confirmUrl)}</p>`,
    `<p>Looking forward your confirmation.</p>`,
    `<p>Warm Regards,<br><b>Corporate IT</b><br>${escapeHtml(MS_CONFIG.HELPDESK_MAILBOX)}<br>Encalm Hospitality Pvt. Ltd.</p>`,
    `<p style="font-size:11px;color:#777;">Handed over by ${escapeHtml(assignedBy)} on ${escapeHtml(new Date().toLocaleString())}.</p>`,
    `</div>`,
  ].join("");
  const text = [
    `Dear ${firstName},`,
    "",
    intro,
    "",
    ...cols.map((c, i) => `${c}: ${vals[i]}`),
    "",
    `Confirm receipt: ${confirmUrl}`,
    "",
    `Looking forward your confirmation.`,
    "",
    `Warm Regards,`,
    `Corporate IT`,
    MS_CONFIG.HELPDESK_MAILBOX,
  ].join("\n");
  return {
    to: cleanRecipients([record.assigneeEmail]),
    cc: cleanRecipients([...MS_CONFIG.IT_CC_EMAILS]).filter(
      (e) => e.toLowerCase() !== (record.assigneeEmail || "").toLowerCase(),
    ),
    from: MS_CONFIG.HELPDESK_MAILBOX,
    subject: `${category} Confirmation — ${asset.name}`,
    body: text,
    html,
  };
}

/** Sent from the user's mailbox to Encalm IT when they confirm receipt. */
export function buildConfirmationReceiptMail(
  asset: { id: string; name: string },
  userName: string,
  userEmail: string,
): MailMessage {
  return {
    to: cleanRecipients([MS_CONFIG.CONFIRMATION_EMAIL]),
    subject: `[Confirmed] ${userName} received ${asset.name} (${asset.id})`,
    body: [
      `Dear Encalm IT,`,
      "",
      `${userName} (${userEmail}) has confirmed receipt of:`,
      "",
      `• Host Name: ${asset.name}`,
      `• Asset Tag: ${asset.id}`,
      `• Confirmed at: ${new Date().toLocaleString()}`,
      "",
      `Encalm IT Asset Management System`,
    ].join("\n"),
  };
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
