import { Stack } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Download, Lock } from "@/components/LucideIcon";
import { STATUSES, STATUS_COLORS, STATUS_LABELS } from "@/constants/categories";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  EVENT_LABELS,
  ReportFilter,
  ReportRow,
  filterRows,
  flattenEvents,
  toCsv,
} from "@/lib/reports";
import type { AssetEventType, AssetStatus } from "@/types/asset";

const EVENT_TYPES = Object.keys(EVENT_LABELS) as AssetEventType[];

async function exportCsv(csv: string) {
  const fileName = `encalm-asset-report-${new Date().toISOString().slice(0, 10)}.csv`;
  if (Platform.OS === "web" && typeof document !== "undefined") {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return;
  }
  await Share.share({ title: fileName, message: csv });
}

function Chip({
  label,
  active,
  onPress,
  dot,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  dot?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primary + "1F" : colors.card,
        },
      ]}
    >
      {dot ? <View style={[styles.chipDot, { backgroundColor: dot }]} /> : null}
      <Text style={[styles.chipText, { color: active ? colors.foreground : colors.mutedForeground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function ReportsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assets } = useAssets();
  const { user } = useAuth();
  const [filter, setFilter] = useState<ReportFilter>({ type: "all", status: "all" });

  const allRows = useMemo(() => flattenEvents(assets), [assets]);
  const rows = useMemo(() => filterRows(allRows, filter), [allRows, filter]);

  if (user?.role !== "admin") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Report logs" }} />
        <Lock size={28} color={colors.mutedForeground} strokeWidth={1.8} />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>IT Admins only</Text>
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          Report logs are available to IT Administrators.
        </Text>
      </View>
    );
  }

  const set = (patch: Partial<ReportFilter>) => setFilter((f) => ({ ...f, ...patch }));

  const renderRow = ({ item }: { item: ReportRow }) => (
    <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.rowTop}>
        <Text style={[styles.event, { color: colors.foreground }]}>{item.event}</Text>
        <Text style={[styles.date, { color: colors.mutedForeground }]}>
          {new Date(item.at).toLocaleString()}
        </Text>
      </View>
      <Text style={[styles.device, { color: colors.foreground }]}>
        {item.device} · <Text style={{ color: colors.mutedForeground }}>{item.assetId}</Text>
      </Text>
      {item.statusChange ? (
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>Status: {item.statusChange}</Text>
      ) : null}
      {item.user ? (
        <Text style={[styles.meta, { color: colors.mutedForeground }]}>User: {item.user}</Text>
      ) : null}
      <Text style={[styles.meta, { color: colors.mutedForeground }]}>
        By: {item.by || "—"}
        {item.approvedBy ? `  ·  Approved by: ${item.approvedBy}` : ""}
      </Text>
      {item.notes ? (
        <Text style={[styles.notes, { color: colors.mutedForeground }]}>“{item.notes}”</Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: "Report logs" }} />
      <FlatList
        data={rows}
        keyExtractor={(r) => `${r.assetId}:${r.eventId}`}
        renderItem={renderRow}
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 10 }}
        ListHeaderComponent={
          <View style={{ gap: 10, marginBottom: 6 }}>
            <View style={styles.headerRow}>
              <Text style={[styles.count, { color: colors.foreground }]}>
                {rows.length} of {allRows.length} events
              </Text>
              <Pressable
                onPress={() => exportCsv(toCsv(rows))}
                disabled={rows.length === 0}
                style={({ pressed }) => [
                  styles.exportBtn,
                  { backgroundColor: colors.brandNavy, opacity: rows.length === 0 ? 0.5 : pressed ? 0.8 : 1 },
                ]}
              >
                <Download size={14} color="#FFFFFF" strokeWidth={2} />
                <Text style={styles.exportText}>Download CSV</Text>
              </Pressable>
            </View>

            <TextInput
              placeholder="Search device, asset ID, user…"
              placeholderTextColor={colors.mutedForeground}
              value={filter.search || ""}
              onChangeText={(search) => set({ search })}
              style={[styles.input, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
            />
            <View style={styles.dateRow}>
              <TextInput
                placeholder="From (YYYY-MM-DD)"
                placeholderTextColor={colors.mutedForeground}
                value={filter.from || ""}
                onChangeText={(from) => set({ from: from.trim() || undefined })}
                style={[styles.input, styles.dateInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              />
              <TextInput
                placeholder="To (YYYY-MM-DD)"
                placeholderTextColor={colors.mutedForeground}
                value={filter.to || ""}
                onChangeText={(to) => set({ to: to.trim() || undefined })}
                style={[styles.input, styles.dateInput, { borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground }]}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="All events" active={filter.type === "all"} onPress={() => set({ type: "all" })} />
              {EVENT_TYPES.map((t) => (
                <Chip key={t} label={EVENT_LABELS[t]} active={filter.type === t} onPress={() => set({ type: t })} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              <Chip label="Any status" active={filter.status === "all"} onPress={() => set({ status: "all" })} />
              {STATUSES.map((s: AssetStatus) => (
                <Chip
                  key={s}
                  label={STATUS_LABELS[s]}
                  dot={STATUS_COLORS[s].dot}
                  active={filter.status === s}
                  onPress={() => set({ status: s })}
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No events</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {allRows.length === 0
                ? "Events are recorded from now on as devices are registered, assigned, serviced and retired."
                : "No events match these filters."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, marginTop: 6 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, textAlign: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  count: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999 },
  exportText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "Inter_400Regular", fontSize: 14 },
  dateRow: { flexDirection: "row", gap: 10 },
  dateInput: { flex: 1 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12 },
  row: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 3 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  event: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  date: { fontFamily: "Inter_400Regular", fontSize: 12 },
  device: { fontFamily: "Inter_500Medium", fontSize: 13 },
  meta: { fontFamily: "Inter_400Regular", fontSize: 12 },
  notes: { fontFamily: "Inter_400Regular", fontSize: 12, fontStyle: "italic", marginTop: 2 },
});
