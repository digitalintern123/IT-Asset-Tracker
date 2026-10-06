import { Feather } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useITAM } from "@/contexts/ITAMContext";
import { useColors } from "@/hooks/useColors";
import type { MaintenanceServiceType } from "@/types/itam";

type ActionTab = "assign" | "checkin" | "transfer" | "maintenance";

export default function CustodyActionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { assets } = useAssets();
  const { user } = useAuth();
  const {
    employees,
    assignAsset,
    checkInAsset,
    transferAsset,
    scheduleMaintenance,
  } = useITAM();

  const params = useLocalSearchParams<{
    mode?: string;
    assetId?: string;
    employeeId?: string;
  }>();

  const initialTab: ActionTab =
    params.mode === "checkin"
      ? "checkin"
      : params.mode === "transfer"
      ? "transfer"
      : params.mode === "maintenance"
      ? "maintenance"
      : "assign";

  const [activeTab, setActiveTab] = useState<ActionTab>(initialTab);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(params.assetId || "");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>(params.employeeId || "");
  const [targetEmployeeId, setTargetEmployeeId] = useState<string>("");
  const [condition, setCondition] = useState<"new" | "excellent" | "good" | "fair">("good");
  const [location, setLocation] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Check-In specific
  const [sendToMaint, setSendToMaint] = useState(false);
  const [maintReason, setMaintReason] = useState("");

  // Maintenance specific
  const [serviceType, setServiceType] = useState<MaintenanceServiceType>("routine_service");
  const [vendor, setVendor] = useState("Apple Authorized Care");
  const [costStr, setCostStr] = useState("0");
  const [issueDescription, setIssueDescription] = useState("");

  // Asset filtering based on tab
  const availableAssets = useMemo(
    () => assets.filter((a) => a.status === "available"),
    [assets]
  );
  const inUseAssets = useMemo(
    () => assets.filter((a) => a.status === "in_use"),
    [assets]
  );

  const activeAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId),
    [assets, selectedAssetId]
  );

  const handleSubmit = async () => {
    if (!selectedAssetId && activeTab !== "maintenance") {
      alert("Please select an asset.");
      return;
    }

    setSubmitting(true);
    try {
      if (activeTab === "assign") {
        if (!selectedEmployeeId) {
          alert("Please select an employee.");
          setSubmitting(false);
          return;
        }
        const slip = await assignAsset({
          assetId: selectedAssetId,
          employeeId: selectedEmployeeId,
          condition,
          location,
          notes,
        });
        router.replace(`/operations/handover?id=${slip.id}`);
      } else if (activeTab === "checkin") {
        const slip = await checkInAsset({
          assetId: selectedAssetId,
          condition,
          returnLocation: location || "IT Storage - Terminal 3 Basement",
          notes,
          sendToMaintenance: sendToMaint,
          maintenanceReason: maintReason,
        });
        router.replace(`/operations/handover?id=${slip.id}`);
      } else if (activeTab === "transfer") {
        if (!targetEmployeeId) {
          alert("Please select the recipient employee.");
          setSubmitting(false);
          return;
        }
        const slip = await transferAsset({
          assetId: selectedAssetId,
          fromEmployeeId: activeAsset?.employeeId || activeAsset?.assignee || "",
          toEmployeeId: targetEmployeeId,
          condition,
          location,
          notes,
        });
        router.replace(`/operations/handover?id=${slip.id}`);
      } else if (activeTab === "maintenance") {
        if (!selectedAssetId) {
          alert("Please select an asset for maintenance.");
          setSubmitting(false);
          return;
        }
        await scheduleMaintenance({
          assetId: selectedAssetId,
          assetName: activeAsset?.name || "Asset",
          serviceType,
          vendor,
          status: "in_progress",
          scheduledDate: new Date().toISOString().slice(0, 10),
          completedDate: null,
          cost: parseFloat(costStr) || 0,
          issueDescription: issueDescription || "Diagnostic service scheduled.",
          performedBy: user?.name || "IT Engineer",
        });
        if (Platform.OS === "web") {
          window.alert("Service job logged successfully!");
        } else {
          Alert.alert("Success", "Service job logged successfully!");
        }
        router.back();
      }
    } catch (err: any) {
      const msg = err?.message || "Operation failed";
      if (Platform.OS === "web") {
        window.alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: "Custody & Service Action",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 6,
                paddingHorizontal: 10,
                marginRight: 16,
                borderRadius: 8,
                backgroundColor: colors.secondary,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="x" size={16} color={colors.foreground} style={{ marginRight: 4 }} />
              <Text
                style={{
                  color: colors.foreground,
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

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {/* Tab Switcher */}
        <View style={[styles.tabBar, { backgroundColor: colors.secondary }]}>
          <Pressable
            onPress={() => setActiveTab("assign")}
            style={[
              styles.tabBtn,
              activeTab === "assign" && { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === "assign" ? colors.primary : colors.mutedForeground },
              ]}
            >
              Check-Out
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("checkin")}
            style={[
              styles.tabBtn,
              activeTab === "checkin" && { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === "checkin" ? colors.primary : colors.mutedForeground },
              ]}
            >
              Check-In
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("transfer")}
            style={[
              styles.tabBtn,
              activeTab === "transfer" && { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === "transfer" ? colors.primary : colors.mutedForeground },
              ]}
            >
              Transfer
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("maintenance")}
            style={[
              styles.tabBtn,
              activeTab === "maintenance" && { backgroundColor: colors.card },
            ]}
          >
            <Text
              style={[
                styles.tabBtnText,
                { color: activeTab === "maintenance" ? colors.primary : colors.mutedForeground },
              ]}
            >
              Service
            </Text>
          </Pressable>
        </View>

        {/* ── Form Body ────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Asset Selection */}
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
            Select Asset
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorScroll}
          >
            {(activeTab === "assign"
              ? availableAssets
              : activeTab === "maintenance"
              ? assets
              : inUseAssets
            ).map((a) => {
              const isSel = selectedAssetId === a.id;
              return (
                <Pressable
                  key={a.id}
                  onPress={() => setSelectedAssetId(a.id)}
                  style={[
                    styles.selectorPill,
                    {
                      borderColor: isSel ? colors.primary : colors.border,
                      backgroundColor: isSel ? colors.primary + "1A" : colors.secondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.selectorPillTitle,
                      { color: isSel ? colors.primary : colors.foreground },
                    ]}
                  >
                    {a.name}
                  </Text>
                  <Text style={[styles.selectorPillSub, { color: colors.mutedForeground }]}>
                    {a.id} {a.assignee ? `• ${a.assignee}` : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Active Asset Info Badge */}
          {activeAsset && (
            <View style={[styles.assetPreview, { backgroundColor: colors.secondary }]}>
              <Feather name="check-circle" size={16} color={colors.primary} />
              <Text style={[styles.assetPreviewText, { color: colors.foreground }]}>
                Selected: {activeAsset.name} ({activeAsset.id}) • S/N: {activeAsset.serialNumber} • Status: {activeAsset.status.toUpperCase()}
              </Text>
            </View>
          )}

          {/* Check-Out: Assignee Selection */}
          {activeTab === "assign" && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
                Assign To Staff Member
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectorScroll}
              >
                {employees.map((e) => {
                  const isSel = selectedEmployeeId === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => setSelectedEmployeeId(e.id)}
                      style={[
                        styles.selectorPill,
                        {
                          borderColor: isSel ? colors.primary : colors.border,
                          backgroundColor: isSel ? colors.primary + "1A" : colors.secondary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectorPillTitle,
                          { color: isSel ? colors.primary : colors.foreground },
                        ]}
                      >
                        {e.name}
                      </Text>
                      <Text style={[styles.selectorPillSub, { color: colors.mutedForeground }]}>
                        {e.designation} ({e.department})
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Transfer: Destination Assignee */}
          {activeTab === "transfer" && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
                Transfer Custody To
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectorScroll}
              >
                {employees.map((e) => {
                  const isSel = targetEmployeeId === e.id;
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => setTargetEmployeeId(e.id)}
                      style={[
                        styles.selectorPill,
                        {
                          borderColor: isSel ? colors.primary : colors.border,
                          backgroundColor: isSel ? colors.primary + "1A" : colors.secondary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.selectorPillTitle,
                          { color: isSel ? colors.primary : colors.foreground },
                        ]}
                      >
                        {e.name}
                      </Text>
                      <Text style={[styles.selectorPillSub, { color: colors.mutedForeground }]}>
                        {e.designation} ({e.department})
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* Condition Grading */}
          {activeTab !== "maintenance" && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
                Hardware Condition Check
              </Text>
              <View style={styles.conditionRow}>
                {(["new", "excellent", "good", "fair"] as const).map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCondition(c)}
                    style={[
                      styles.conditionBtn,
                      {
                        backgroundColor: condition === c ? colors.primary : colors.secondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.conditionBtnText,
                        { color: condition === c ? "#FFFFFF" : colors.foreground },
                      ]}
                    >
                      {c.toUpperCase()}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {/* Location */}
          {activeTab !== "maintenance" && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
                Location / Terminal Station
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border },
                ]}
                placeholder="e.g. T3 Terminal Lounge - Reception Desk"
                placeholderTextColor={colors.mutedForeground}
                value={location}
                onChangeText={setLocation}
              />
            </>
          )}

          {/* Check-In Damaged / Route to Maintenance Switch */}
          {activeTab === "checkin" && (
            <View style={[styles.switchCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.switchTitle, { color: colors.foreground }]}>
                  Flag Unit for Maintenance / Repair
                </Text>
                <Text style={[styles.switchSub, { color: colors.mutedForeground }]}>
                  If unit returned with defects, move directly to Maintenance state.
                </Text>
              </View>
              <Switch value={sendToMaint} onValueChange={setSendToMaint} />
            </View>
          )}

          {activeTab === "checkin" && sendToMaint && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 10 }]}>
                Repair / Damage Reason
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border },
                ]}
                placeholder="e.g. Broken display hinge, cracked screen, swollen battery"
                placeholderTextColor={colors.mutedForeground}
                value={maintReason}
                onChangeText={setMaintReason}
              />
            </>
          )}

          {/* Maintenance Specific Fields */}
          {activeTab === "maintenance" && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
                Authorized Vendor / Repair Center
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border },
                ]}
                value={vendor}
                onChangeText={setVendor}
                placeholder="e.g. Apple Authorized Care, Dell Onsite, Airport IT Bench"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
                Estimated Cost (₹ INR)
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border },
                ]}
                keyboardType="numeric"
                value={costStr}
                onChangeText={setCostStr}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
              />

              <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
                Issue Description & Diagnostics
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  { height: 70, backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border },
                ]}
                multiline
                value={issueDescription}
                onChangeText={setIssueDescription}
                placeholder="Describe fault or scheduled servicing scope..."
                placeholderTextColor={colors.mutedForeground}
              />
            </>
          )}

          {/* Notes */}
          <Text style={[styles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>
            Handover Remarks / Notes
          </Text>
          <TextInput
            style={[
              styles.textInput,
              { height: 60, backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border },
            ]}
            multiline
            placeholder="Optional reference notes or special accessories issued..."
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
          />

          {/* Submit Action Button */}
          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.submitBtn,
              {
                backgroundColor: colors.primary,
                opacity: submitting ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather
              name={activeTab === "maintenance" ? "tool" : "file-text"}
              size={18}
              color="#FFFFFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.submitBtnText}>
              {submitting
                ? "Processing..."
                : activeTab === "assign"
                ? "Confirm Check-Out & Sign Slip"
                : activeTab === "checkin"
                ? "Confirm Check-In Return"
                : activeTab === "transfer"
                ? "Execute Transfer & Sign Slip"
                : "Log Service Record"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  tabBar: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  tabBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  selectorScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  selectorPill: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
  },
  selectorPillTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  selectorPillSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  assetPreview: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    gap: 8,
  },
  assetPreviewText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  conditionRow: {
    flexDirection: "row",
    gap: 8,
  },
  conditionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  conditionBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  switchCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 14,
  },
  switchTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  switchSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 24,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
