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
