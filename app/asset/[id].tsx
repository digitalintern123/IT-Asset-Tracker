import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import QRCode from "react-native-qrcode-svg";

import { AssetForm } from "@/components/AssetForm";
import { StatusBadge } from "@/components/StatusBadge";
import { CATEGORY_ICONS } from "@/constants/categories";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  openAssignmentEmail,
  sendAssetAssignedNotification,
} from "@/lib/notify";

function formatDate(d?: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export default function AssetDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getAsset, updateAsset, deleteAsset } = useAssets();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const asset = id ? getAsset(id) : undefined;

  if (!asset) {
    return (
      <View
        style={[
          styles.centered,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <Stack.Screen options={{ title: "Asset" }} />
        <Text style={{ color: colors.mutedForeground }}>Asset not found.</Text>
      </View>
    );
  }

  const handleDelete = () => {
    const doDelete = async () => {
      try {
        if (Platform.OS !== "web") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
        await deleteAsset(asset.id);
        router.back();
      } catch (err: any) {
        const msg = err?.message || "Failed to delete asset from SharePoint.";
        if (Platform.OS === "web") {
          window.alert(`Error: ${msg}`);
        } else {
          Alert.alert("Delete Failed", msg);
        }
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${asset.name}"? This cannot be undone.`))
        doDelete();
      return;
    }
    Alert.alert("Delete asset?", `"${asset.name}" will be removed.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: doDelete },
    ]);
  };

  const icon = CATEGORY_ICONS[asset.category];

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen
          options={{
            title: "Edit asset",
            headerLeft: () => (
              <Pressable onPress={() => setEditing(false)} hitSlop={8}>
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            ),
          }}
        />
        <AssetForm
          initial={asset}
          submitLabel="Save changes"
          submitting={submitting}
          onSubmit={async ({ input, assigneeEmail }) => {
            setSubmitting(true);
            try {
              const prev = asset;
              const updated = await updateAsset(asset.id, input);
              const fromName = user?.name ?? "Asset Tracker";
              const newlyAssigned =
                updated &&
                updated.assignee &&
                updated.status === "in_use" &&
                (prev.assignee !== updated.assignee ||
                  prev.status !== updated.status);
              if (updated && newlyAssigned) {
                await sendAssetAssignedNotification(updated, fromName);
                if (assigneeEmail && Platform.OS !== "web") {
                  Alert.alert(
                    "Notify assignee?",
                    `Send ${updated.assignee} an email about this change?`,
                    [
                      { text: "Skip", style: "cancel" },
                      {
                        text: "Send email",
                        onPress: () =>
                          openAssignmentEmail(updated, assigneeEmail, fromName),
                      },
                    ],
                  );
                } else if (assigneeEmail && Platform.OS === "web") {
                  openAssignmentEmail(updated, assigneeEmail, fromName);
                }
              }
              setEditing(false);
            } catch (err: any) {
              const msg = err?.message || "Failed to update asset in SharePoint.";
              if (Platform.OS === "web") {
                window.alert(`Error: ${msg}`);
              } else {
                Alert.alert("Update Failed", msg);
              }
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
    >
      <Stack.Screen
        options={{
          title: asset.name,
          headerRight: () =>
            user?.permissions?.canEditAsset ? (
              <Pressable onPress={() => setEditing(true)} hitSlop={8}>
                <Text
                  style={{
                    color: colors.primary,
                    fontFamily: "Inter_600SemiBold",
                  }}
                >
                  Edit
                </Text>
              </Pressable>
            ) : null,
        }}
      />

      <View
        style={[
          styles.hero,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View
          style={[
            styles.heroIcon,
            { backgroundColor: colors.primary + "1F" },
          ]}
        >
          <Feather name={icon} size={28} color={colors.primary} />
        </View>
        <Text style={[styles.heroName, { color: colors.foreground }]}>
          {asset.name}
        </Text>
        <Text style={[styles.heroMeta, { color: colors.mutedForeground }]}>
          {asset.category}
        </Text>
        <View style={{ marginTop: 10 }}>
          <StatusBadge status={asset.status} />
        </View>
      </View>

      <DetailGroup title="Identification" colors={colors}>
        <DetailRow label="Serial number" value={asset.serialNumber || "—"} colors={colors} />
        <DetailRow label="Category" value={asset.category} colors={colors} last />
      </DetailGroup>

      <DetailGroup title="Assignment" colors={colors}>
        <DetailRow label="Assigned to" value={asset.assignee || "—"} colors={colors} />
        <DetailRow label="Location" value={asset.location || "—"} colors={colors} last />
      </DetailGroup>

      <DetailGroup title="Purchase" colors={colors}>
        <DetailRow label="Purchase date" value={formatDate(asset.purchaseDate)} colors={colors} />
        <DetailRow
          label="Purchase price"
          value={
            asset.purchasePrice
              ? `$${asset.purchasePrice.toLocaleString()}`
              : "—"
          }
          colors={colors}
        />
        <DetailRow
          label="Warranty expiry"
          value={formatDate(asset.warrantyExpiry)}
          colors={colors}
          last
        />
      </DetailGroup>

      <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 10 }}>
        <Text
          style={{
            fontSize: 11,
            letterSpacing: 1.2,
            fontFamily: "Inter_600SemiBold",
            color: colors.mutedForeground,
          }}
        >
          QR CODE
        </Text>
        <View
          style={[
            styles.qrCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.qrWrap}>
            <QRCode
              value={JSON.stringify({
                id: asset.id,
                serial: asset.serialNumber,
              })}
              size={168}
              backgroundColor="#FFFFFF"
              color="#0B1F24"
            />
          </View>
          <Text style={[styles.qrHint, { color: colors.mutedForeground }]}>
            Print or attach this code to the asset. Scan from the Assets tab to
            jump straight to this record.
          </Text>
        </View>
      </View>

      {asset.notes ? (
        <DetailGroup title="Notes" colors={colors}>
          <View style={{ padding: 14 }}>
            <Text
              style={{
                color: colors.foreground,
                fontFamily: "Inter_400Regular",
                fontSize: 14,
                lineHeight: 21,
              }}
            >
              {asset.notes}
            </Text>
          </View>
        </DetailGroup>
      ) : null}

      {user?.permissions?.canDeleteAsset ? (
        <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.deleteBtn,
              {
                backgroundColor: colors.destructive + "12",
                borderColor: colors.destructive + "33",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <Feather name="trash-2" size={16} color={colors.destructive} />
            <Text
              style={[styles.deleteLabel, { color: colors.destructive }]}
            >
              Delete asset
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Text
        style={[
          styles.timestamp,
          { color: colors.mutedForeground },
        ]}
      >
        Last updated {formatDate(asset.updatedAt)}
      </Text>
    </ScrollView>
  );
}

function DetailGroup({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 20, gap: 10 }}>
      <Text
        style={{
          fontSize: 11,
          letterSpacing: 1.2,
          fontFamily: "Inter_600SemiBold",
          color: colors.mutedForeground,
        }}
      >
        {title.toUpperCase()}
      </Text>
      <View
        style={{
          backgroundColor: colors.card,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

function DetailRow({
  label,
  value,
  colors,
  last,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && {
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <Text
        style={[styles.detailValue, { color: colors.foreground }]}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    margin: 20,
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  heroMeta: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  detailValue: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
    textAlign: "right",
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  deleteLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  timestamp: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 18,
  },
  qrCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    alignItems: "center",
    gap: 12,
  },
  qrWrap: {
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 12,
  },
  qrHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 18,
  },
});
