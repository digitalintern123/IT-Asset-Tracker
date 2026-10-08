import { Stack, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeaderBackButton } from "@/components/HeaderBackButton";
import { Download, FileText, Lock } from "@/components/LucideIcon";
import { SelectField } from "@/components/SelectField";
import { CATEGORIES, VERTICALS } from "@/constants/categories";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ImportRow, inventoryTemplateCsv, parseInventorySheet } from "@/lib/importSheet";
import type { AssetCategory } from "@/types/asset";

type Phase = "pick" | "preview" | "importing" | "done";

function pickFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function downloadTemplate() {
  const blob = new Blob([inventoryTemplateCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "encalm-asset-inventory-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Admin-only, one-time import of the Encalm inventory sheet (.xlsx). */
export default function ImportScreen() {
  const colors = useColors();
  const router = useRouter();
  const { user } = useAuth();
  const { assets, importAssets } = useAssets();
  const [phase, setPhase] = useState<Phase>("pick");
  const [fileName, setFileName] = useState("");
  const [sheet, setSheet] = useState<unknown[][] | null>(null);
  const [defaultCategory, setDefaultCategory] = useState<AssetCategory>("Laptop");
  const [defaultVertical, setDefaultVertical] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [results, setResults] = useState<{ ok: boolean; error?: string; row: number }[]>([]);

  const parsed = useMemo(
    () =>
      sheet
        ? parseInventorySheet(sheet, assets, { category: defaultCategory, vertical: defaultVertical })
        : null,
    [sheet, assets, defaultCategory, defaultVertical],
  );
  const okRows = parsed?.rows.filter((r) => r.ok) ?? [];
  const errorRows = parsed?.rows.filter((r) => !r.ok) ?? [];
  const missingVertical = okRows.some((r) => !r.input.vertical);

  const headerOptions = {
    title: "Import from Excel",
    headerLeft: router.canGoBack() ? undefined : () => <HeaderBackButton />,
  };

  if (user?.role !== "admin") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={headerOptions} />
        <Lock size={28} color={colors.mutedForeground} strokeWidth={1.8} />
        <Text style={[styles.h2, { color: colors.foreground }]}>IT Admins only</Text>
      </View>
    );
  }
  if (Platform.OS !== "web") {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={headerOptions} />
        <Text style={[styles.h2, { color: colors.foreground }]}>Use the web app</Text>
        <Text style={[styles.muted, { color: colors.mutedForeground }]}>
          Importing an Excel file is available in the browser version of the tracker.
        </Text>
      </View>
    );
  }

  const choose = async () => {
    setError(null);
    const file = await pickFile();
    if (!file) return;
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const rows = (await readSheet(file)) as unknown[][];
      setFileName(file.name);
      setSheet(rows);
      setPhase("preview");
    } catch (e: any) {
      setError(`Could not read "${file.name}". Please choose the .xlsx inventory file. (${e?.message || e})`);
    }
  };

  const runImport = async () => {
    // Fixed now: once imported, these serials are "already in the register",
    // so re-parsing afterwards would count every row as skipped.
    setSkippedCount(errorRows.length);
    setPhase("importing");
    setProgress(0);
    try {
      const res = await importAssets(
        okRows.map((r) => ({ input: r.input, assigneeEmail: r.assigneeEmail })),
        setProgress,
      );
      setResults(res.map((r, i) => ({ ...r, row: okRows[i].rowNumber })));
      setPhase("done");
    } catch (e: any) {
      setError(e?.message || "Import failed.");
      setPhase("preview");
    }
  };

  const card = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const fg = { color: colors.foreground };
  const muted = { color: colors.mutedForeground };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Stack.Screen options={headerOptions} />

      <View style={card}>
        <Text style={[styles.h2, fg]}>One-time import of existing assets</Text>
        <Text style={[styles.muted, muted]}>
          Upload the Encalm IT inventory sheet (.xlsx) with columns: Computer name, Make, Model, Serial number,
          Location, Used in location, Department, User name, User email, City, Remark, Custodianship, Criticality,
          Status (Operational / Non Operational), Asset categorisation. No emails are sent; imported hand-overs
          show as "Imported — not confirmed".
        </Text>
        <View style={styles.actions}>
          <Pressable onPress={choose} style={({ pressed }) => [styles.primary, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <FileText size={15} color="#FFFFFF" strokeWidth={2} />
            <Text style={styles.primaryText}>{sheet ? "Choose another file" : "Choose .xlsx file"}</Text>
          </Pressable>
          <Pressable onPress={downloadTemplate} style={({ pressed }) => [styles.secondary, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
            <Download size={15} color={colors.foreground} strokeWidth={2} />
            <Text style={[styles.secondaryText, fg]}>Download template</Text>
          </Pressable>
        </View>
        {error ? <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text> : null}
      </View>

      {parsed && phase !== "done" ? (
        <View style={card}>
          <Text style={[styles.h2, fg]}>{fileName}</Text>
          {parsed.missingHeaders.length ? (
            <Text style={[styles.error, { color: colors.destructive }]}>
              Couldn't find these columns: {parsed.missingHeaders.join(", ")}. Check the header row matches the template.
            </Text>
          ) : null}
          <Text style={[styles.summary, fg]}>
            {parsed.rows.length} rows · <Text style={{ color: "#16A34A" }}>{okRows.length} ready</Text>
            {errorRows.length ? <Text style={{ color: colors.destructive }}> · {errorRows.length} will be skipped</Text> : null}
          </Text>
          <View style={styles.defaults}>
            <View style={{ flex: 1, minWidth: 220 }}>
              <SelectField
                label="Default category (when not clear from the host name)"
                value={defaultCategory}
                options={CATEGORIES.map((c) => ({ value: c, label: c }))}
                onChange={(c) => setDefaultCategory(c as AssetCategory)}
              />
            </View>
            <View style={{ flex: 1, minWidth: 220 }}>
              <SelectField
                label="Default vertical (when not clear from the host name)"
                value={defaultVertical}
                options={VERTICALS.map((v) => ({ value: v, label: v }))}
                onChange={setDefaultVertical}
                placeholder="Select company"
              />
            </View>
          </View>

          {parsed.rows.map((r) => (
            <PreviewRow key={r.rowNumber} row={r} colors={colors} />
          ))}

          {phase === "importing" ? (
            <View style={styles.progress}>
              <ActivityIndicator color={colors.primary} />
              <Text style={fg}>Importing {progress} of {okRows.length}…</Text>
            </View>
          ) : (
            <Pressable
              onPress={runImport}
              disabled={okRows.length === 0 || missingVertical}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primary,
                styles.importBtn,
                { backgroundColor: colors.primary, opacity: okRows.length === 0 || missingVertical ? 0.5 : pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={styles.primaryText}>
                {missingVertical ? "Pick a default vertical first" : `Import ${okRows.length} asset${okRows.length === 1 ? "" : "s"}`}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {phase === "done" ? (
        <View style={card}>
          <Text style={[styles.h2, fg]}>Import finished</Text>
          <Text style={[styles.summary, fg]}>
            {results.filter((r) => r.ok).length} imported
            {results.some((r) => !r.ok) ? ` · ${results.filter((r) => !r.ok).length} failed` : ""}
            {skippedCount ? ` · ${skippedCount} skipped` : ""}
          </Text>
          {results
            .filter((r) => !r.ok)
            .map((r) => (
              <Text key={r.row} style={[styles.error, { color: colors.destructive }]}>
                Row {r.row}: {r.error}
              </Text>
            ))}
          <Pressable onPress={() => router.replace("/")} style={({ pressed }) => [styles.primary, styles.importBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}>
            <Text style={styles.primaryText}>View assets</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function PreviewRow({ row, colors }: { row: ImportRow; colors: ReturnType<typeof useColors> }) {
  const errors = row.problems.filter((p) => p.level === "error");
  const warnings = row.problems.filter((p) => p.level === "warning");
  const mark = errors.length ? "✗" : warnings.length ? "⚠" : "✓";
  const tint = errors.length ? colors.destructive : warnings.length ? "#B45309" : "#16A34A";
  const i = row.input;
  return (
    <View style={[styles.row, { borderColor: colors.border }]}>
      <Text style={[styles.mark, { color: tint }]}>{mark}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]}>
          Row {row.rowNumber}: {i.name || "—"} · {[i.make, i.model].filter(Boolean).join(" ") || "—"} · {i.serialNumber || "—"}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
          {i.category} · {i.location || "—"} · {i.department || "—"} · {i.assignee ? `${i.assignee}${row.assigneeEmail ? ` <${row.assigneeEmail}>` : ""}` : "No user (Available)"}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>
          {i.vertical || "No vertical"} · {i.criticality || "—"} · {i.operationalStatus} · {i.assetClass}
        </Text>
        {row.problems.map((p, k) => (
          <Text key={k} style={[styles.rowMeta, { color: p.level === "error" ? colors.destructive : "#B45309" }]}>
            {p.level === "error" ? "Skipped: " : "Note: "}
            {p.message}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 14, maxWidth: 980, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  h2: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  muted: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
  primary: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999 },
  primaryText: { color: "#FFFFFF", fontFamily: "Inter_600SemiBold", fontSize: 14 },
  secondary: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 999, borderWidth: 1 },
  secondaryText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium" },
  summary: { fontSize: 14, fontFamily: "Inter_500Medium" },
  defaults: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  row: { flexDirection: "row", gap: 10, borderTopWidth: 1, paddingTop: 10 },
  mark: { fontSize: 16, fontFamily: "Inter_600SemiBold", width: 18 },
  rowTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  rowMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progress: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  importBtn: { marginTop: 8, alignSelf: "flex-start" },
});
