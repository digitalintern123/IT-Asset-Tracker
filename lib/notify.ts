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
