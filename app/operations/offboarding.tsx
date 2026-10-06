import { Feather } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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

import { useITAM } from "@/contexts/ITAMContext";
import { useColors } from "@/hooks/useColors";

export default function OffboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const params = useLocalSearchParams<{ employeeId?: string }>();
  const { employees, getEmployee, getEmployeeAssets, offboardEmployee } = useITAM();

  const [selectedEmpId, setSelectedEmpId] = useState<string>(
    params.employeeId || employees[0]?.id || ""
  );

  const currentEmp = useMemo(
    () => getEmployee(selectedEmpId),
    [getEmployee, selectedEmpId]
  );

  const heldAssets = useMemo(
    () => (currentEmp ? getEmployeeAssets(currentEmp.id) : []),
    [currentEmp, getEmployeeAssets]
  );

  // Per-asset return state
  const [returnStates, setReturnStates] = useState<
    Record<
      string,
      {
        condition: "good" | "fair" | "damaged";
        routeTo: "available" | "maintenance";
        adapterReturned: boolean;
        bagReturned: boolean;
        notes: string;
      }
    >
  >({});

  const [clearanceNotes, setClearanceNotes] = useState(
    "All IT hardware, security tokens, and airport terminal passes received and verified."
  );
  const [submitting, setSubmitting] = useState(false);

  const getAssetReturnState = (assetId: string) => {
    return (
      returnStates[assetId] || {
        condition: "good",
        routeTo: "available",
        adapterReturned: true,
        bagReturned: true,
        notes: "",
      }
    );
  };

  const updateAssetReturnState = (
    assetId: string,
    field: string,
    value: any
  ) => {
    setReturnStates((prev) => ({
      ...prev,
      [assetId]: {
        ...getAssetReturnState(assetId),
        [field]: value,
      },
    }));
  };

  const handleComplete = async () => {
    if (!currentEmp) return;

    if (heldAssets.length === 0) {
      alert("This employee currently has no assigned assets to offboard.");
      return;
    }

    setSubmitting(true);
    try {
      const items = heldAssets.map((a) => {
        const state = getAssetReturnState(a.id);
        return {
          assetId: a.id,
          condition: state.condition === "damaged" ? ("fair" as const) : (state.condition as any),
          routeTo: state.routeTo,
          notes: `${state.notes} (Adapter: ${state.adapterReturned ? "Yes" : "Missing"}, Bag: ${state.bagReturned ? "Yes" : "Missing"})`,
        };
      });

      const slip = await offboardEmployee({
        employeeId: currentEmp.id,
        items,
        clearanceNotes,
      });

      router.replace(`/operations/handover?id=${slip.id}`);
    } catch (err: any) {
      const msg = err?.message || "Failed to complete offboarding";
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
          title: "Employee Offboarding",
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
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            1. Departing Staff Member
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, marginTop: 10 }}
          >
            {employees.map((e) => {
              const isSel = selectedEmpId === e.id;
              const count = getEmployeeAssets(e.id).length;
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
                    {e.designation} • {count} {count === 1 ? "asset" : "assets"}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {currentEmp && (
            <View style={[styles.empDetailBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.empDetailName, { color: colors.foreground }]}>
                {currentEmp.name} ({currentEmp.id})
              </Text>
              <Text style={[styles.empDetailSub, { color: colors.mutedForeground }]}>
                {currentEmp.designation} • Department: {currentEmp.department}
              </Text>
              <Text style={[styles.empDetailSub, { color: colors.mutedForeground }]}>
                Email: {currentEmp.email} • Location: {currentEmp.location}
              </Text>
            </View>
          )}
        </View>

        {/* Step 2: Assets to Retrieve */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            2. Active Equipment Retrieval Checklist ({heldAssets.length} Items)
          </Text>

          {heldAssets.length === 0 ? (
            <View style={[styles.emptyBox, { borderColor: colors.border }]}>
              <Feather name="check-circle" size={28} color="#10B981" />
              <Text style={[styles.emptyText, { color: colors.mutedForeground, marginTop: 6 }]}>
                No assets currently assigned to {currentEmp?.name || "this employee"}.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12, marginTop: 12 }}>
              {heldAssets.map((asset) => {
                const state = getAssetReturnState(asset.id);
                return (
                  <View
                    key={asset.id}
                    style={[
                      styles.assetItemCard,
                      { backgroundColor: colors.secondary, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.assetItemHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.assetItemName, { color: colors.foreground }]}>
                          {asset.name}
                        </Text>
                        <Text style={[styles.assetItemSerial, { color: colors.mutedForeground }]}>
                          {asset.id} • {asset.category} • S/N: {asset.serialNumber}
                        </Text>
                      </View>
                    </View>

                    {/* Condition Selector */}
                    <Text style={[styles.itemSubLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
                      Returned Physical Condition:
                    </Text>
                    <View style={styles.conditionRow}>
                      {(["good", "fair", "damaged"] as const).map((cond) => (
                        <Pressable
                          key={cond}
                          onPress={() =>
                            updateAssetReturnState(
                              asset.id,
                              "condition",
                              cond
                            )
                          }
                          style={[
                            styles.condBtn,
                            {
                              backgroundColor:
                                state.condition === cond
                                  ? cond === "damaged"
                                    ? colors.destructive
                                    : colors.primary
                                  : colors.card,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.condBtnText,
                              {
                                color:
                                  state.condition === cond
                                    ? "#FFFFFF"
                                    : colors.foreground,
                              },
                            ]}
                          >
                            {cond.toUpperCase()}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Accessories Checkboxes */}
                    <View style={styles.accessoryRow}>
                      <Pressable
                        onPress={() =>
                          updateAssetReturnState(
                            asset.id,
                            "adapterReturned",
                            !state.adapterReturned
                          )
                        }
                        style={styles.accessoryCheck}
                      >
                        <Feather
                          name={state.adapterReturned ? "check-square" : "square"}
                          size={16}
                          color={state.adapterReturned ? colors.primary : colors.mutedForeground}
                        />
                        <Text style={[styles.accessoryText, { color: colors.foreground }]}>
                          Original Charger / Adapter
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          updateAssetReturnState(
                            asset.id,
                            "bagReturned",
                            !state.bagReturned
                          )
                        }
                        style={styles.accessoryCheck}
                      >
                        <Feather
                          name={state.bagReturned ? "check-square" : "square"}
                          size={16}
                          color={state.bagReturned ? colors.primary : colors.mutedForeground}
                        />
                        <Text style={[styles.accessoryText, { color: colors.foreground }]}>
                          Carry Case / Bag
                        </Text>
                      </Pressable>
                    </View>

                    {/* Destination Routing */}
                    <Text style={[styles.itemSubLabel, { color: colors.mutedForeground, marginTop: 8 }]}>
                      Route Returned Unit To:
                    </Text>
                    <View style={styles.conditionRow}>
                      <Pressable
                        onPress={() =>
                          updateAssetReturnState(asset.id, "routeTo", "available")
                        }
                        style={[
                          styles.condBtn,
                          {
                            backgroundColor:
                              state.routeTo === "available"
                                ? "#10B981"
                                : colors.card,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.condBtnText,
                            {
                              color:
                                state.routeTo === "available"
                                  ? "#FFFFFF"
                                  : colors.foreground,
                            },
                          ]}
                        >
                          Central Stock (Available)
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={() =>
                          updateAssetReturnState(asset.id, "routeTo", "maintenance")
                        }
                        style={[
                          styles.condBtn,
                          {
                            backgroundColor:
                              state.routeTo === "maintenance"
                                ? "#F59E0B"
                                : colors.card,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.condBtnText,
                            {
                              color:
                                state.routeTo === "maintenance"
                                  ? "#FFFFFF"
                                  : colors.foreground,
                            },
                          ]}
                        >
                          Maintenance / Wipe
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Step 3: Clearance Sign-Off */}
        {heldAssets.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 16 }]}>
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              3. IT Clearance Sign-Off Certificate
            </Text>

            <TextInput
              style={[
                styles.notesInput,
                { backgroundColor: colors.secondary, color: colors.foreground, borderColor: colors.border },
              ]}
              multiline
              value={clearanceNotes}
              onChangeText={setClearanceNotes}
              placeholder="Remarks regarding hardware return, wiped data, and account deactivation..."
              placeholderTextColor={colors.mutedForeground}
            />

            <Pressable
              onPress={handleComplete}
              disabled={submitting}
              style={({ pressed }) => [
                styles.completeBtn,
                {
                  backgroundColor: colors.primary,
                  opacity: submitting ? 0.6 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Feather name="shield" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.completeBtnText}>
                {submitting
                  ? "Generating Clearance..."
                  : `Complete Clearance (${heldAssets.length} Assets) & Sign Slip`}
              </Text>
            </Pressable>
          </View>
        )}
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
  cardTitle: {
    fontSize: 15,
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
  empDetailBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 12,
  },
  empDetailName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  empDetailSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  assetItemCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  assetItemHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  assetItemName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  assetItemSerial: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  itemSubLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  conditionRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  condBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 6,
    alignItems: "center",
  },
  condBtnText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  accessoryRow: {
    flexDirection: "row",
    gap: 16,
    marginTop: 10,
  },
  accessoryCheck: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  accessoryText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    height: 60,
    marginTop: 10,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 10,
    marginTop: 16,
  },
  completeBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
