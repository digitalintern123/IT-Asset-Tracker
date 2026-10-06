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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BrandHeader } from "@/components/BrandHeader";
import { DigitalSignaturePad } from "@/components/DigitalSignaturePad";
import { useITAM } from "@/contexts/ITAMContext";
import { useColors } from "@/hooks/useColors";

export default function DigitalHandoverScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const params = useLocalSearchParams<{ id?: string }>();
  const { handovers, signHandoverSlip } = useITAM();

  const slip = useMemo(
    () => handovers.find((h) => h.id === params.id) || handovers[0],
    [handovers, params.id]
  );

  const [signatureData, setSignatureData] = useState<string>("");
  const [savingSign, setSavingSign] = useState(false);

  const handleSaveSignature = async () => {
    if (!slip) return;
    if (!signatureData) {
      alert("Please draw your signature before saving.");
      return;
    }

    setSavingSign(true);
    try {
      await signHandoverSlip(slip.id, signatureData);
      if (Platform.OS === "web") {
        window.alert("Digital signature sealed successfully!");
      } else {
        Alert.alert("Success", "Digital signature sealed successfully!");
      }
    } catch (err: any) {
      alert(err?.message || "Failed to save signature");
    } finally {
      setSavingSign(false);
    }
  };

  const handlePrintOrShare = () => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.print();
    } else {
      Alert.alert(
        "Export Handover Slip",
        `Handover Slip ${slip?.id} is stored in persistent records. In browser mode, use Ctrl+P to export as official PDF.`
      );
    }
  };

  if (!slip) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Feather name="alert-circle" size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.foreground, marginTop: 12 }]}>
          Handover slip not found.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={[styles.backBtn, { backgroundColor: colors.primary, marginTop: 16 }]}
        >
          <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isSigned = Boolean(slip.signatureSvgData);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: `Slip: ${slip.id}`,
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
              <Feather name="arrow-left" size={16} color={colors.foreground} style={{ marginRight: 4 }} />
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: "Inter_500Medium",
                  fontSize: 14,
                }}
              >
                Back
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              onPress={handlePrintOrShare}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                backgroundColor: colors.primary,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Feather name="printer" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
                Print / PDF
              </Text>
            </Pressable>
          ),
        }}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}>
        {/* Printable Official Slip Document */}
        <View style={[styles.slipDoc, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Executive Header */}
          <View style={[styles.docHeader, { borderBottomColor: colors.border }]}>
            <BrandHeader compact />
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.docSlipId, { color: colors.primary }]}>{slip.id}</Text>
              <View style={[styles.typeBadge, { backgroundColor: colors.primary + "1A" }]}>
                <Text style={[styles.typeBadgeText, { color: colors.primary }]}>
                  {slip.type.toUpperCase()} SLIP
                </Text>
              </View>
              <Text style={[styles.docDate, { color: colors.mutedForeground }]}>
                Date: {new Date(slip.issuedAt).toLocaleDateString("en-IN")}
              </Text>
            </View>
          </View>

          {/* Parties Grid */}
          <View style={styles.partiesGrid}>
            <View style={[styles.partyBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.partyRole, { color: colors.mutedForeground }]}>
                RECIPIENT / CUSTODIAN
              </Text>
              <Text style={[styles.partyName, { color: colors.foreground }]}>{slip.toPerson}</Text>
              <Text style={[styles.partySub, { color: colors.mutedForeground }]}>
                {slip.department}
              </Text>
              <Text style={[styles.partySub, { color: colors.mutedForeground }]}>
                📍 {slip.location}
              </Text>
            </View>

            <View style={[styles.partyBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.partyRole, { color: colors.mutedForeground }]}>
                ISSUING IT AUTHORITY
              </Text>
              <Text style={[styles.partyName, { color: colors.foreground }]}>{slip.issuedBy}</Text>
              <Text style={[styles.partySub, { color: colors.mutedForeground }]}>
                Encalm IT Asset Management
              </Text>
              <Text style={[styles.partySub, { color: colors.mutedForeground }]}>
                {slip.fromPerson ? `From: ${slip.fromPerson}` : "Central IT Inventory"}
              </Text>
            </View>
          </View>

          {/* Equipment Table */}
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Equipment & Asset Schedule
          </Text>
          <View style={[styles.table, { borderColor: colors.border }]}>
            <View style={[styles.tableHeader, { backgroundColor: colors.secondary, borderBottomColor: colors.border }]}>
              <Text style={[styles.thCell, { flex: 2, color: colors.foreground }]}>Item & Asset Tag</Text>
              <Text style={[styles.thCell, { flex: 2, color: colors.foreground }]}>Serial Number</Text>
              <Text style={[styles.thCell, { flex: 1.2, color: colors.foreground }]}>Condition</Text>
            </View>

            {slip.assetDetails.map((item, idx) => (
              <View
                key={idx}
                style={[
                  styles.tableRow,
                  { borderBottomColor: colors.border, backgroundColor: idx % 2 === 1 ? colors.secondary + "40" : "transparent" },
                ]}
              >
                <View style={{ flex: 2 }}>
                  <Text style={[styles.tdBold, { color: colors.foreground }]}>{item.name}</Text>
                  <Text style={[styles.tdMuted, { color: colors.mutedForeground }]}>{item.id} • {item.category}</Text>
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={[styles.tdMono, { color: colors.foreground }]}>{item.serialNumber}</Text>
                </View>
                <View style={{ flex: 1.2 }}>
                  <View style={[styles.condPill, { backgroundColor: colors.primary + "15" }]}>
                    <Text style={[styles.condPillText, { color: colors.primary }]}>
                      {item.condition.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {/* Notes and Terms */}
          {slip.notes && (
            <View style={[styles.notesBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.notesLabel, { color: colors.foreground }]}>Remarks:</Text>
              <Text style={[styles.notesText, { color: colors.mutedForeground }]}>{slip.notes}</Text>
            </View>
          )}

          <View style={styles.termsBox}>
            <Text style={[styles.termsTitle, { color: colors.foreground }]}>
              Terms of IT Equipment Custody
            </Text>
            <Text style={[styles.termsText, { color: colors.mutedForeground }]}>
              1. The assigned equipment remains the exclusive property of Encalm Hospitality Trust.{"\n"}
              2. The custodian is responsible for safe custody, airport airside compliance, and prompt reporting of defects or damage.{"\n"}
              3. Upon role transfer or separation of employment, all equipment and accessories must be returned in good working order.
            </Text>
          </View>

          {/* Digital Signature Area */}
          <View style={[styles.sigSection, { borderTopColor: colors.border }]}>
            <Text style={[styles.sigTitle, { color: colors.foreground }]}>
              Digital Custody Signature & Acknowledgment
            </Text>

            {isSigned ? (
              <View style={[styles.verifiedSigBox, { backgroundColor: "#10B98110", borderColor: "#10B98140" }]}>
                <View style={styles.verifiedHeader}>
                  <Feather name="check-circle" size={18} color="#10B981" />
                  <Text style={[styles.verifiedHeaderText, { color: "#10B981" }]}>
                    Digitally Signed & Verified
                  </Text>
                </View>

                {/* Render the saved SVG path */}
                <View style={styles.sigCanvasPreview}>
                  <Svg height={90} width="100%">
                    <Path
                      d={slip.signatureSvgData!}
                      stroke={colors.foreground}
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>

                <Text style={[styles.sigStamp, { color: colors.mutedForeground }]}>
                  Signed by: {slip.toPerson} • Sealed: {new Date(slip.issuedAt).toLocaleString("en-IN")}
                </Text>
              </View>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Text style={[styles.sigPrompt, { color: colors.mutedForeground }]}>
                  Please sign below to confirm receipt and accept custody of the scheduled items:
                </Text>

                <DigitalSignaturePad onSave={setSignatureData} height={150} />

                <Pressable
                  onPress={handleSaveSignature}
                  disabled={savingSign || !signatureData}
                  style={({ pressed }) => [
                    styles.sealBtn,
                    {
                      backgroundColor: colors.primary,
                      opacity: savingSign || !signatureData ? 0.5 : pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Feather name="lock" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.sealBtnText}>
                    {savingSign ? "Sealing Signature..." : "Save & Seal Digital Signature"}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  backBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  slipDoc: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  docHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  docSlipId: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  typeBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  docDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  partiesGrid: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  partyBox: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  partyRole: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  partyName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  partySub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginTop: 18,
    marginBottom: 8,
  },
  table: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  thCell: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tdBold: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  tdMuted: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  tdMono: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  condPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  condPillText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  notesBox: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 10,
    marginTop: 12,
  },
  notesLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  notesText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  termsBox: {
    marginTop: 14,
    padding: 10,
  },
  termsTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  termsText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
  sigSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
    paddingTop: 16,
  },
  sigTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  sigPrompt: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
  },
  sealBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  sealBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  verifiedSigBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginTop: 10,
  },
  verifiedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  verifiedHeaderText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  sigCanvasPreview: {
    height: 90,
    justifyContent: "center",
    marginVertical: 8,
  },
  sigStamp: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    textAlign: "right",
  },
});
