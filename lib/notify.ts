import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";

import type { Asset } from "@/types/asset";

let configured = false;

function configure() {
  if (configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  configure();
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.status === "granted";
}

export async function sendAssetAssignedNotification(
  asset: Asset,
  assignedBy: string,
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const granted = await ensureNotificationPermission();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "New asset assigned",
      body: `${asset.name} has been assigned to ${asset.assignee} by ${assignedBy}.`,
      data: { assetId: asset.id, type: "asset_assigned" },
    },
    trigger: null,
  });
  return true;
}

function emailLooksValid(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export async function openAssignmentEmail(
  asset: Asset,
  assigneeEmail: string,
  fromName: string,
): Promise<boolean> {
  if (!emailLooksValid(assigneeEmail)) return false;
  const subject = encodeURIComponent(
    `Asset assigned: ${asset.name}`,
  );
  const lines = [
    `Hi ${asset.assignee || "there"},`,
    "",
    `An asset has been assigned to you in the Encalm Asset Tracker:`,
    "",
    `• Asset: ${asset.name}`,
    `• Category: ${asset.category}`,
    `• Serial number: ${asset.serialNumber || "—"}`,
    `• Location: ${asset.location || "—"}`,
    asset.warrantyExpiry ? `• Warranty until: ${asset.warrantyExpiry}` : "",
    "",
    `Please confirm receipt and report any issues.`,
    "",
    `— ${fromName}`,
    `Encalm Asset Tracker`,
  ]
    .filter(Boolean)
    .join("\n");
  const body = encodeURIComponent(lines);
  const url = `mailto:${encodeURIComponent(assigneeEmail)}?subject=${subject}&body=${body}`;
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

export async function openReassignmentEmail(
  asset: Asset,
  previousAssignee: string,
  newAssignee: string,
  newAssigneeEmail: string,
  fromName: string,
  reason?: string,
): Promise<boolean> {
  if (!emailLooksValid(newAssigneeEmail)) return false;
  const subject = encodeURIComponent(
    `Asset Custody Transfer: ${asset.name} (${asset.id})`,
  );
  const lines = [
    `Dear ${newAssignee},`,
    "",
    `An asset has been formally reassigned to you in the Encalm IT Asset Tracker:`,
    "",
    `• Asset Name: ${asset.name}`,
    `• Asset Tag: ${asset.id}`,
    `• Serial Number: ${asset.serialNumber || "—"}`,
    `• Category: ${asset.category}`,
    `• Location: ${asset.location || "—"}`,
    `• Previous Custodian: ${previousAssignee || "Unassigned"}`,
    reason ? `• Transfer Reason: ${reason}` : "",
    "",
    `Please inspect the equipment and confirm handover.`,
    "",
    `Regards,`,
    `${fromName}`,
    `Encalm IT Operations`,
  ]
    .filter(Boolean)
    .join("\n");
  const body = encodeURIComponent(lines);
  const url = `mailto:${encodeURIComponent(newAssigneeEmail)}?subject=${subject}&body=${body}`;
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

export async function openApprovalRequestEmail(
  asset: Asset,
  action: "delete" | "reassign" | "edit",
  requesterName: string,
  requesterEmail: string,
  reason: string,
  adminEmails: string[],
): Promise<boolean> {
  const primaryAdmin = adminEmails[0] || "admin@encalmhospitality.com";
  const ccList = adminEmails.slice(1).join(",");
  const actionLabel = action.toUpperCase();

  const subject = encodeURIComponent(
    `[APPROVAL REQUIRED] ${actionLabel} Asset: ${asset.name} (${asset.id})`,
  );
  const lines = [
    `Dear IT Administrator,`,
    "",
    `A formal approval request has been submitted for an IT asset:`,
    "",
    `• Requested Action: ${actionLabel}`,
    `• Asset Name: ${asset.name}`,
    `• Asset Tag: ${asset.id}`,
    `• Category: ${asset.category}`,
    `• Serial Number: ${asset.serialNumber || "—"}`,
    `• Current Status: ${asset.status}`,
    `• Current Assignee: ${asset.assignee || "None"}`,
    "",
    `REQUEST DETAILS:`,
    `• Requester: ${requesterName} (${requesterEmail})`,
    `• Justification / Reason: ${reason}`,
    `• Requested At: ${new Date().toLocaleString()}`,
    "",
    `Please log into the Encalm Asset Tracker application to review, approve, or reject this request.`,
    "",
    `Encalm IT Asset Management System`,
  ].join("\n");

  const body = encodeURIComponent(lines);
  const ccParam = ccList ? `&cc=${encodeURIComponent(ccList)}` : "";
  const url = `mailto:${encodeURIComponent(primaryAdmin)}?subject=${subject}&body=${body}${ccParam}`;

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
