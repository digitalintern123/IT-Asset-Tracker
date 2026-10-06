import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAssets } from "@/contexts/AssetContext";
import { useITAM, ONBOARDING_PRESETS } from "@/contexts/ITAMContext";
import { useColors } from "@/hooks/useColors";
import type { OnboardingBundlePreset } from "@/types/itam";

export default function OnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { assets } = useAssets();
  const { employees, onboardEmployee, addEmployee } = useITAM();

  const [selectedEmpId, setSelectedEmpId] = useState<string>(employees[0]?.id || "");
  const [isAddingNewEmp, setIsAddingNewEmp] = useState(false);
  const [newEmpName, setNewEmpName] = useState("");
  const [newEmpEmail, setNewEmpEmail] = useState("");
  const [newEmpDept, setNewEmpDept] = useState("Lounge Operations");
  const [newEmpRole, setNewEmpRole] = useState("Operations Staff");

  const [selectedPresetId, setSelectedPresetId] = useState<string>(ONBOARDING_PRESETS[0]?.id || "");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [condition, setCondition] = useState<"new" | "excellent" | "good" | "fair">("new");
  const [notes, setNotes] = useState("Standard new hire hardware issuance.");
  const [submitting, setSubmitting] = useState(false);

  const availableAssets = useMemo(
    () => assets.filter((a) => a.status === "available"),
    [assets]
  );

  const activePreset = useMemo(
    () => ONBOARDING_PRESETS.find((p) => p.id === selectedPresetId),
    [selectedPresetId]
  );

  const toggleAsset = (id: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExecute = async () => {
    if (selectedAssetIds.length === 0) {
      alert("Please select at least one asset to provision.");
      return;
    }

    setSubmitting(true);
    try {
      let targetEmpId = selectedEmpId;

      if (isAddingNewEmp) {
        if (!newEmpName.trim()) {
          alert("Please enter the new hire's name.");
          setSubmitting(false);
          return;
        }
        const created = await addEmployee({
          name: newEmpName.trim(),
          email: newEmpEmail.trim() || `${newEmpName.toLowerCase().replace(/\s+/g, ".")}@encalm.com`,
          department: newEmpDept as any,
          designation: newEmpRole,
          location: "T3 Terminal Lounge",
          status: "active",
          joinedDate: new Date().toISOString().slice(0, 10),
        });
        targetEmpId = created.id;
      }

      const slip = await onboardEmployee({
        employeeId: targetEmpId,
        assetIds: selectedAssetIds,
        condition,
        notes,
      });

      router.replace(`/operations/handover?id=${slip.id}`);
    } catch (err: any) {
      const msg = err?.message || "Failed to complete onboarding provisioning";
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
          title: "New Hire Onboarding",
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
        {/* Step 1: Select Employee */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumText}>1</Text>
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              Select or Register Incoming Employee
            </Text>
          </View>

          <View style={styles.empToggleRow}>
            <Pressable
              onPress={() => setIsAddingNewEmp(false)}
              style={[
                styles.empToggleBtn,
                !isAddingNewEmp && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.empToggleText,
                  { color: !isAddingNewEmp ? "#FFFFFF" : colors.mutedForeground },
                ]}
              >
                Existing Staff Roster
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setIsAddingNewEmp(true)}
              style={[
                styles.empToggleBtn,
                isAddingNewEmp && { backgroundColor: colors.primary },
              ]}
            >
              <Text
                style={[
                  styles.empToggleText,
                  { color: isAddingNewEmp ? "#FFFFFF" : colors.mutedForeground },
                ]}
              >
                + Register New Hire
              </Text>
            </Pressable>
          </View>

          {!isAddingNewEmp ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginTop: 12 }}
            >
              {employees.map((e) => {
                const isSel = selectedEmpId === e.id;
                return (
                  <Pressable
                    key={e.id}
                    onPress={() => setSelectedEmpId(e.id)}
                    style={[
                      styles.empPill,
                      {
                        borderColor: isSel ? colors.primary : colors.border,
                        backgroundColor: isSel ? colors.primary + "1A" : colors.secondary,
                      },
                    ]}
                  >
                    <Text style={[styles.empPillName, { color: isSel ? colors.primary : colors.foreground }]}>
                      {e.name}
                    </Text>
                    <Text style={[styles.empPillSub, { color: colors.mutedForeground }]}>
                      {e.designation} • {e.department}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={{ gap: 10, marginTop: 12 }}>
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                placeholder="Full Name (e.g. Karan Kapoor)"
                placeholderTextColor={colors.mutedForeground}
                value={newEmpName}
                onChangeText={setNewEmpName}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                placeholder="Work Email (e.g. karan.kapoor@encalm.com)"
                placeholderTextColor={colors.mutedForeground}
                value={newEmpEmail}
                onChangeText={setNewEmpEmail}
              />
              <TextInput
                style={[styles.input, { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
                placeholder="Job Role (e.g. Lounge Operations Associate)"
                placeholderTextColor={colors.mutedForeground}
                value={newEmpRole}
                onChangeText={setNewEmpRole}
              />
            </View>
          )}
        </View>

        {/* Step 2: Role Preset Bundles */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumText}>2</Text>
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              Choose Role Provisioning Kit
            </Text>
          </View>

          <View style={{ gap: 8, marginTop: 12 }}>
            {ONBOARDING_PRESETS.map((preset) => {
              const isSel = selectedPresetId === preset.id;
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => setSelectedPresetId(preset.id)}
                  style={[
                    styles.presetRow,
                    {
                      borderColor: isSel ? colors.primary : colors.border,
                      backgroundColor: isSel ? colors.primary + "10" : colors.secondary,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.presetTitle, { color: isSel ? colors.primary : colors.foreground }]}>
                      {preset.title}
                    </Text>
                    <Text style={[styles.presetDesc, { color: colors.mutedForeground }]}>
                      {preset.description}
                    </Text>
                    <Text style={[styles.presetCats, { color: colors.primary }]}>
                      Recommended: {preset.recommendedCategories.join(" + ")}
                    </Text>
                  </View>
                  <Feather
                    name={isSel ? "check-circle" : "circle"}
                    size={20}
                    color={isSel ? colors.primary : colors.mutedForeground}
                  />
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Step 3: Multi-Select Available Stock */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumText}>3</Text>
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              Select Assets to Issue ({selectedAssetIds.length} Selected)
            </Text>
          </View>

          {availableAssets.length === 0 ? (
            <Text style={[styles.emptyStockText, { color: colors.destructive }]}>
              No assets currently available in stock. Please add assets or check-in devices first.
            </Text>
          ) : (
            <View style={{ gap: 8, marginTop: 12 }}>
              {availableAssets.map((asset) => {
                const isChecked = selectedAssetIds.includes(asset.id);
                return (
                  <Pressable
                    key={asset.id}
                    onPress={() => toggleAsset(asset.id)}
                    style={[
                      styles.assetSelectRow,
                      {
                        borderColor: isChecked ? colors.primary : colors.border,
                        backgroundColor: isChecked ? colors.primary + "15" : colors.secondary,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.assetNameText, { color: colors.foreground }]}>
                        {asset.name}
                      </Text>
                      <Text style={[styles.assetSerialText, { color: colors.mutedForeground }]}>
                        {asset.id} • {asset.category} • S/N: {asset.serialNumber}
                      </Text>
                    </View>
                    <Feather
                      name={isChecked ? "check-square" : "square"}
                      size={20}
                      color={isChecked ? colors.primary : colors.mutedForeground}
                    />
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* Step 4: Condition and Confirmation */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
          <View style={styles.stepHeader}>
            <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
              <Text style={styles.stepNumText}>4</Text>
            </View>
            <Text style={[styles.stepTitle, { color: colors.foreground }]}>
              Condition & Handover Notes
            </Text>
          </View>

          <View style={styles.conditionRow}>
            {(["new", "excellent", "good"] as const).map((c) => (
              <Pressable
                key={c}
                onPress={() => setCondition(c)}
                style={[
                  styles.condBtn,
                  { backgroundColor: condition === c ? colors.primary : colors.secondary },
                ]}
              >
                <Text style={{ color: condition === c ? "#FFFFFF" : colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                  {c.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={[styles.input, { height: 60, marginTop: 12, backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border }]}
            multiline
            placeholder="Issuance remarks, accessory bundle, or special instructions..."
            placeholderTextColor={colors.mutedForeground}
            value={notes}
            onChangeText={setNotes}
          />

          <Pressable
            onPress={handleExecute}
            disabled={submitting || selectedAssetIds.length === 0}
            style={({ pressed }) => [
              styles.execBtn,
              {
                backgroundColor: colors.primary,
                opacity: submitting || selectedAssetIds.length === 0 ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Feather name="check" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.execBtnText}>
              {submitting ? "Provisioning..." : `Provision ${selectedAssetIds.length} Assets & Sign Slip`}
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
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  stepNumText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  stepTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  empToggleRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  empToggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  empToggleText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  empPill: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    minWidth: 160,
  },
  empPillName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  empPillSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
  },
  presetTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  presetDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  presetCats: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    marginTop: 4,
  },
  emptyStockText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    marginTop: 12,
    textAlign: "center",
  },
  assetSelectRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 12,
  },
  assetNameText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  assetSerialText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  conditionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  condBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  execBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 20,
  },
  execBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
