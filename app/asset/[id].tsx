import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { formatRupees } from "@/lib/currency";
import { MS_CONFIG } from "@/lib/msConfig";
import {
  openApprovalRequestEmail,
  openAssignmentEmail,
  openReassignmentEmail,
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
  const {
    getAsset,
    updateAsset,
    deleteAsset,
    reassignAsset,
    requestApproval,
    resolveApproval,
  } = useAssets();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Re-assign modal state
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignName, setReassignName] = useState("");
  const [reassignEmail, setReassignEmail] = useState("");
  const [reassignLocation, setReassignLocation] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [reassignSubmitting, setReassignSubmitting] = useState(false);

  // Deletion Request modal state (for non-admins)
  const [deleteRequestModalOpen, setDeleteRequestModalOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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

  const isAdmin = user?.role === "admin";
  const canDirectDelete = isAdmin;

  // Handle direct delete (Admin) or request modal (Non-admin)
  const handleDeletePress = () => {
    if (canDirectDelete) {
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
        if (window.confirm(`Delete "${asset.name}" (${asset.id})? This cannot be undone.`)) {
          doDelete();
        }
        return;
      }
      Alert.alert("Delete asset?", `"${asset.name}" will be permanently removed.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    } else {
      // Non-admin: open reason modal to submit approval request
      setDeleteReason("");
      setDeleteRequestModalOpen(true);
    }
  };

  const handleConfirmDeleteRequest = async () => {
    if (!deleteReason.trim()) {
      if (Platform.OS === "web") window.alert("Please provide a reason for deletion.");
      else Alert.alert("Reason Required", "Please provide a reason for the deletion request.");
      return;
    }
    setDeleteSubmitting(true);
    try {
      await requestApproval(asset.id, {
        action: "delete",
        requesterName: user?.name || "IT Staff",
        requesterEmail: user?.email || "staff@encalmhospitality.com",
        reason: deleteReason.trim(),
      });

      setDeleteRequestModalOpen(false);

      // Trigger pre-filled approval email to Admin
      await openApprovalRequestEmail(
        asset,
        "delete",
        user?.name || "IT Staff",
        user?.email || "staff@encalmhospitality.com",
        deleteReason.trim(),
        [...MS_CONFIG.ADMIN_EMAILS],
      );

      if (Platform.OS === "web") {
        window.alert("Deletion approval request submitted and notification email opened.");
      } else {
        Alert.alert(
          "Request Submitted",
          "Deletion request has been submitted to IT Administrators for approval."
        );
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to submit deletion request.";
      if (Platform.OS === "web") window.alert(`Error: ${msg}`);
      else Alert.alert("Error", msg);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleConfirmReassign = async () => {
    if (!reassignName.trim()) {
      if (Platform.OS === "web") window.alert("Please enter the new assignee name.");
      else Alert.alert("Missing Name", "Please enter the new assignee name.");
      return;
    }
    setReassignSubmitting(true);
    try {
      const prevAssignee = asset.assignee;
      await reassignAsset(asset.id, {
        newAssignee: reassignName.trim(),
        assigneeEmail: reassignEmail.trim() || undefined,
        location: reassignLocation.trim() || undefined,
        reason: reassignReason.trim() || undefined,
      });

      setReassignModalOpen(false);

      if (reassignEmail.trim()) {
        await openReassignmentEmail(
          asset,
          prevAssignee,
          reassignName.trim(),
          reassignEmail.trim(),
          user?.name || "IT Operations",
          reassignReason.trim() || undefined,
        );
      }

      if (Platform.OS === "web") {
        window.alert(`Asset successfully reassigned to ${reassignName.trim()}`);
      } else {
        Alert.alert("Reassigned", `Asset successfully transferred to ${reassignName.trim()}`);
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to reassign asset.";
      if (Platform.OS === "web") window.alert(`Error: ${msg}`);
      else Alert.alert("Error", msg);
    } finally {
      setReassignSubmitting(false);
    }
  };

  const handleResolveApproval = async (approved: boolean) => {
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      await resolveApproval(asset.id, approved);
      if (approved && asset.approvalRequest?.action === "delete") {
        router.back();
      }
    } catch (err: any) {
      const msg = err?.message || "Failed to process approval.";
      if (Platform.OS === "web") window.alert(`Error: ${msg}`);
      else Alert.alert("Error", msg);
    }
  };

  const icon = CATEGORY_ICONS[asset.category];

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack.Screen
          options={{
            title: "Edit asset",
            headerLeft: () => (
              <Pressable
                onPress={() => setEditing(false)}
                hitSlop={8}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  marginRight: 16,
                  borderRadius: 8,
                  backgroundColor: Platform.OS === "web" ? colors.secondary : "transparent",
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Feather
                  name="x"
                  size={16}
                  color={Platform.OS === "web" ? colors.foreground : colors.primary}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={{
                    color: Platform.OS === "web" ? colors.foreground : colors.primary,
                    fontFamily: "Inter_500Medium",
                    fontSize: 14,
                  }}
                >
                  Cancel
                </Text>
              </Pressable>
            ),
            headerRight: () => null,
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
          headerLeft: undefined,
          headerRight: () => (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {user?.permissions?.canEditAsset ? (
                <Pressable
                  onPress={() => {
                    setReassignName("");
                    setReassignEmail("");
                    setReassignLocation(asset.location || "");
                    setReassignReason("");
                    setReassignModalOpen(true);
                  }}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colors.primary + "18",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Feather name="user-check" size={14} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.primary,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    Reassign
                  </Text>
                </Pressable>
              ) : null}

              {user?.permissions?.canEditAsset ? (
                <Pressable
                  onPress={() => setEditing(true)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: Platform.OS === "web" ? colors.secondary : "transparent",
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Feather name="edit-2" size={14} color={colors.primary} />
                  <Text
                    style={{
                      color: colors.primary,
                      fontFamily: "Inter_600SemiBold",
                      fontSize: 13,
                    }}
                  >
                    Edit
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ),
        }}
      />

      <View style={styles.contentWrap}>
        {/* PENDING APPROVAL BANNER */}
        {asset.approvalRequest && asset.approvalRequest.status === "pending" ? (
          <View
            style={[
              styles.approvalBanner,
              {
                backgroundColor: "#FFF8E1",
                borderColor: "#FFE082",
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Feather name="alert-circle" size={20} color="#F57F17" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: "#E65100" }}>
                  APPROVAL PENDING: {asset.approvalRequest.action.toUpperCase()} REQUEST
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_400Regular",
                    color: "#5D4037",
                    marginTop: 3,
                    lineHeight: 18,
                  }}
                >
                  Requested by <Text style={{ fontFamily: "Inter_600SemiBold" }}>{asset.approvalRequest.requesterName}</Text> ({asset.approvalRequest.requesterEmail})
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontFamily: "Inter_500Medium",
                    color: "#3E2723",
                    marginTop: 4,
                    fontStyle: "italic",
                  }}
                >
                  "{asset.approvalRequest.reason}"
                </Text>
              </View>
            </View>

            {isAdmin ? (
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                <Pressable
                  onPress={() => handleResolveApproval(false)}
                  style={({ pressed }) => [
                    styles.bannerActionBtn,
                    {
                      backgroundColor: "#FFEBEE",
                      borderColor: "#FFCDD2",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather name="x" size={14} color="#C62828" />
                  <Text style={{ color: "#C62828", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                    Reject
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleResolveApproval(true)}
                  style={({ pressed }) => [
                    styles.bannerActionBtn,
                    {
                      backgroundColor: "#E8F5E9",
                      borderColor: "#C8E6C9",
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Feather name="check" size={14} color="#2E7D32" />
                  <Text style={{ color: "#2E7D32", fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                    Approve
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}

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
        <DetailRow label="Asset Tag (ID)" value={asset.id} colors={colors} />
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
              ? formatRupees(asset.purchasePrice)
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

      {asset.assignmentHistory && asset.assignmentHistory.length > 0 ? (
        <DetailGroup title="Custody & Assignment History" colors={colors}>
          {asset.assignmentHistory.map((record, index) => {
            const isLast = index === (asset.assignmentHistory?.length || 0) - 1;
            const period = record.returnedAt
              ? `${formatDate(record.assignedAt)} – ${formatDate(record.returnedAt)}`
              : `Active since ${formatDate(record.assignedAt)}`;
            return (
              <View
                key={record.id || index}
                style={[
                  styles.detailRow,
                  !isLast && {
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[styles.detailValue, { color: colors.foreground }]}>
                    {record.assignee}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                    {period} {record.location ? `· ${record.location}` : ""}
                  </Text>
                  {record.notes ? (
                    <Text style={{ fontSize: 11, color: colors.mutedForeground, fontStyle: "italic", marginTop: 2 }}>
                      "{record.notes}"
                    </Text>
                  ) : null}
                </View>
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor: record.returnedAt ? colors.muted : "#E6F4EA",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontFamily: "Inter_600SemiBold",
                      color: record.returnedAt ? colors.mutedForeground : "#137333",
                    }}
                  >
                    {record.returnedAt ? "Returned" : "Active"}
                  </Text>
                </View>
              </View>
            );
          })}
        </DetailGroup>
      ) : null}

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

      {/* DELETE / REQUEST DELETION BUTTON */}
      <View style={{ paddingHorizontal: 20, marginTop: 24 }}>
        <Pressable
          onPress={handleDeletePress}
          style={({ pressed }) => [
            styles.deleteBtn,
            {
              backgroundColor: colors.destructive + "12",
              borderColor: colors.destructive + "33",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather
            name={canDirectDelete ? "trash-2" : "shield-off"}
            size={16}
            color={colors.destructive}
          />
          <Text
            style={[styles.deleteLabel, { color: colors.destructive }]}
          >
            {canDirectDelete ? "Delete asset (Admin)" : "Request Asset Deletion"}
          </Text>
        </Pressable>
      </View>

      <Text
        style={[
          styles.timestamp,
          { color: colors.mutedForeground },
        ]}
      >
        Last updated {formatDate(asset.updatedAt)}
      </Text>
      </View>

      {/* REASSIGN MODAL */}
      <Modal
        visible={reassignModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReassignModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="user-check" size={18} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Reassign Custody</Text>
              </View>
              <Pressable onPress={() => setReassignModalOpen(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
              Transfer custody of <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{asset.name}</Text> ({asset.id}) to a new custodian.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>NEW CUSTODIAN NAME *</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. Vikram Mehta"
              placeholderTextColor={colors.mutedForeground + "88"}
              value={reassignName}
              onChangeText={setReassignName}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 12 }]}>CUSTODIAN EMAIL (OPTIONAL)</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. vikram.m@encalm.com"
              placeholderTextColor={colors.mutedForeground + "88"}
              value={reassignEmail}
              onChangeText={setReassignEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 12 }]}>LOCATION / TERMINAL</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder="e.g. T3 Terminal Lounge Reception"
              placeholderTextColor={colors.mutedForeground + "88"}
              value={reassignLocation}
              onChangeText={setReassignLocation}
            />

            <Text style={[styles.inputLabel, { color: colors.mutedForeground, marginTop: 12 }]}>REASSIGNMENT REASON / HANDOVER NOTES</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, minHeight: 64 }]}
              placeholder="e.g. Department transfer, replacement unit"
              placeholderTextColor={colors.mutedForeground + "88"}
              value={reassignReason}
              onChangeText={setReassignReason}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={() => setReassignModalOpen(false)}
                style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmReassign}
                disabled={reassignSubmitting}
                style={[styles.modalBtn, { backgroundColor: colors.primary, flex: 1, opacity: reassignSubmitting ? 0.7 : 1 }]}
              >
                <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }}>
                  {reassignSubmitting ? "Reassigning..." : "Confirm Reassignment"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* DELETION APPROVAL REQUEST MODAL */}
      <Modal
        visible={deleteRequestModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteRequestModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="shield-alert" size={18} color={colors.destructive} />
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>Request Asset Deletion</Text>
              </View>
              <Pressable onPress={() => setDeleteRequestModalOpen(false)} hitSlop={8}>
                <Feather name="x" size={20} color={colors.mutedForeground} />
              </Pressable>
            </View>

            <Text style={{ fontSize: 13, color: colors.mutedForeground, marginBottom: 16 }}>
              You are requesting to permanently delete <Text style={{ fontFamily: "Inter_600SemiBold", color: colors.foreground }}>{asset.name}</Text> ({asset.id}). An approval request with your reason will be submitted to IT Administrators.
            </Text>

            <Text style={[styles.inputLabel, { color: colors.mutedForeground }]}>REASON FOR DELETION *</Text>
            <TextInput
              style={[styles.textInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background, minHeight: 80 }]}
              placeholder="e.g. Device destroyed, duplicate entry, written off per IT audit"
              placeholderTextColor={colors.mutedForeground + "88"}
              value={deleteReason}
              onChangeText={setDeleteReason}
              multiline
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 20 }}>
              <Pressable
                onPress={() => setDeleteRequestModalOpen(false)}
                style={[styles.modalBtn, { borderColor: colors.border, borderWidth: 1 }]}
              >
                <Text style={{ color: colors.foreground, fontFamily: "Inter_500Medium" }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleConfirmDeleteRequest}
                disabled={deleteSubmitting}
                style={[styles.modalBtn, { backgroundColor: colors.destructive, flex: 1, opacity: deleteSubmitting ? 0.7 : 1 }]}
              >
                <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }}>
                  {deleteSubmitting ? "Submitting..." : "Submit Deletion Request"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  contentWrap: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
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
    fontSize: 24,
    fontFamily: Platform.OS === "web" ? '"Playfair Display", Georgia, serif' : "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.2,
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
    borderRadius: 50,
    borderWidth: 1,
  },
  deleteLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
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
  approvalBanner: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  bannerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 480,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  inputLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  modalBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
