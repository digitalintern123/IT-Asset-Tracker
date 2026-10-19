import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { HeaderBackButton } from "@/components/HeaderBackButton";
import { AlertTriangle, CheckCircle2, Info } from "@/components/LucideIcon";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { matchesAsset } from "@/lib/assetId";
import { openCustodyRecord } from "@/lib/assetWorkflow";
import type { Asset } from "@/types/asset";

type Phase = "ready" | "working" | "done" | "error";

const ACCESS_NOTE =
  "SharePoint access for the user could not be set; run Settings → Sync device access (details in Diagnostics).";

/**
 * Approval matrix: opened from the "Approval required" email. A member of
 * IT-Asset Approver signs in and approves or rejects a hand-over, a
 * technician's edit request, or a whole import batch. Nothing happens on page load — mail scanners that open links can't
 * approve anything; the admin has to press the button.
 */
export default function ApproveScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ asset?: string; request?: string; batch?: string; decision?: string }>();
  const assetId = String(params.asset || "").trim();
  const requestId = String(params.request || "").trim();
  const batchId = String(params.batch || "").trim();
  const suggested = params.decision === "reject" ? "reject" : "approve";
  const { user } = useAuth();
  const { assets, syncing, resolveApproval, resolveApprovalBatch } = useAssets();
  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState("");

  const asset = assetId ? assets.find((a) => matchesAsset(a, assetId)) : undefined;
  const batch: Asset[] = batchId
    ? assets.filter((a) => a.approvalRequest?.batchId === batchId && a.approvalRequest.status === "pending")
    : [];
  const req = asset?.approvalRequest;
  const isApprover = !!user?.isApprover;
  const isEdit = req?.action === "edit_access";

  const headerOptions = {
    title: isEdit ? "Approve edit" : "Approve hand-over",
    headerLeft: router.canGoBack() ? undefined : () => <HeaderBackButton />,
  };

  const decide = async (approved: boolean) => {
    setPhase("working");
    setMessage(null);
    try {
      if (batchId) {
        const res = await resolveApprovalBatch(batchId, approved, notes.trim() || undefined, (d, t) =>
          setProgress(`${d} of ${t}`),
        );
        setMessage(
          `${res.done} hand-over(s) ${approved ? "approved" : "rejected"}` +
            (res.failed.length ? `; ${res.failed.length} could not be processed (${res.failed[0].error})` : "") +
            (res.access?.failed ? `. ${ACCESS_NOTE}` : ""),
        );
      } else {
        const access = await resolveApproval(assetId, approved, notes.trim() || undefined);
        const accessFailed = !!access && !access.ok;
        setMessage(
          isEdit
            ? approved
              ? `Approved. ${req?.requesterName || "The technician"} has been emailed and can save one change within 24 hours.`
              : "Rejected. The technician has been told; the device stays as it was."
            : approved
            ? `Approved. ${req?.pendingChanges?.assignee || "The user"} has been sent the hand-over confirmation email.` +
              (accessFailed ? ` ${ACCESS_NOTE}` : "")
            : "Rejected. The requester has been told; the device stays as it was.",
        );
      }
      setPhase("done");
    } catch (err: any) {
      setPhase("error");
      setMessage(err?.message || "Could not record the decision. Please try again.");
    }
  };

  const card = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const text = { color: colors.foreground };
  const muted = { color: colors.mutedForeground };

  const buttons = (count?: number) => (
    <>
      <TextInput
        placeholder="Note (optional)"
        placeholderTextColor={colors.mutedForeground}
        value={notes}
        onChangeText={setNotes}
        style={[styles.input, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
      />
      {phase === "error" && message ? <Text style={[styles.error, { color: colors.destructive }]}>{message}</Text> : null}
      {phase === "working" ? (
        <View style={{ alignItems: "center", gap: 6 }}>
          <ActivityIndicator color={colors.primary} />
          {progress ? <Text style={muted}>{progress}</Text> : null}
        </View>
      ) : (
        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => decide(false)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: "#C62828", opacity: pressed ? 0.85 : suggested === "reject" ? 1 : 0.9 },
            ]}
          >
            <Text style={styles.buttonText}>{count ? `Reject all ${count}` : "Reject"}</Text>
          </Pressable>
          <Pressable
            onPress={() => decide(true)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: "#2E7D32", opacity: pressed ? 0.85 : suggested === "approve" ? 1 : 0.9 },
            ]}
          >
            <Text style={styles.buttonText}>{count ? `Approve all ${count}` : "Approve"}</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  let body: React.ReactNode;
  if (!batchId && (!assetId || !requestId)) {
    body = (
      <Notice icon="warn" colors={colors} title="This approval link is incomplete">
        Please open the link from the approval email again.
      </Notice>
    );
  } else if (!isApprover) {
    body = (
      <Notice icon="warn" colors={colors} title="Only IT-Asset Approver members can approve">
        {`You are signed in as ${user?.email || "someone else"}. Requests are approved by members of the IT-Asset Approver group.`}
      </Notice>
    );
  } else if (phase === "done") {
    body = (
      <Notice icon="ok" colors={colors} title="Decision recorded">
        {message || ""}
      </Notice>
    );
  } else if (batchId) {
    body =
      batch.length === 0 ? (
        syncing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Notice icon="info" colors={colors} title="Nothing waiting in this import">
            Every hand-over in this import has already been approved or rejected.
          </Notice>
        )
      ) : (
        <View style={card}>
          <Text style={[styles.title, text]}>Inventory import — {batch.length} hand-over(s)</Text>
          <Text style={[styles.hint, muted]}>
            {`Requested by ${batch[0].approvalRequest?.requesterName}. Approving records each device as handed over to the user below (no emails are sent to them).`}
          </Text>
          {batch.slice(0, 200).map((a) => (
            <Row key={a.id} label={`${a.name} (${a.id})`} value={a.approvalRequest?.pendingChanges?.assignee || "—"} colors={colors} />
          ))}
          {batch.length > 200 ? <Text style={muted}>…and {batch.length - 200} more</Text> : null}
          {buttons(batch.length)}
        </View>
      );
  } else if (!asset) {
    body = syncing ? (
      <ActivityIndicator color={colors.primary} />
    ) : (
      <Notice icon="warn" colors={colors} title="Device not found">
        {`${assetId} isn't in the register (it may have been deleted).`}
      </Notice>
    );
  } else if (!req || req.id !== requestId || req.status !== "pending") {
    body = (
      <Notice icon="info" colors={colors} title="This request is no longer waiting">
        {req && req.id === requestId
          ? `It was ${req.status}${req.approverName ? ` by ${req.approverName}` : ""}${req.decidedAt ? ` on ${new Date(req.decidedAt).toLocaleString()}` : ""}.`
          : "It has already been decided or replaced by a newer request. Open the device to see its current state."}
      </Notice>
    );
  } else if (isEdit) {
    body = (
      <View style={card}>
        <Text style={[styles.title, text]}>Allow this edit?</Text>
        <Row label="Device" value={`${asset.name} (${asset.id})`} colors={colors} />
        <Row label="Make / Model" value={[asset.make, asset.model].filter(Boolean).join(" ") || "—"} colors={colors} />
        <Row label="Serial number" value={asset.serialNumber || "—"} colors={colors} />
        <Row label="Requested by" value={`${req.requesterName} · ${new Date(req.requestedAt).toLocaleString()}`} colors={colors} />
        <Row label="Reason for edit" value={req.reason || "—"} colors={colors} />
        <Text style={[styles.hint, muted]}>
          If approved, the technician can save one change within 24 hours. A change of user still goes for hand-over approval.
        </Text>
        {buttons()}
      </View>
    );
  } else {
    const pending = req.pendingChanges || {};
    const holder = openCustodyRecord(asset)?.assignee || (asset.status === "in_use" ? asset.assignee : "");
    body = (
      <View style={card}>
        <Text style={[styles.title, text]}>Approve this hand-over?</Text>
        <Row label="Device" value={`${asset.name} (${asset.id})`} colors={colors} />
        <Row label="Make / Model" value={[asset.make, asset.model].filter(Boolean).join(" ") || "—"} colors={colors} />
        <Row label="Serial number" value={asset.serialNumber || "—"} colors={colors} />
        <Row label="Currently with" value={holder || "Nobody (in IT stock)"} colors={colors} />
        <Row
          label="Hand over to"
          value={`${pending.assignee || "—"}${pending.assigneeEmail ? ` (${pending.assigneeEmail})` : ""}`}
          colors={colors}
        />
        <Row label="Location" value={pending.location || asset.location || "—"} colors={colors} />
        <Row label="Requested by" value={`${req.requesterName} · ${new Date(req.requestedAt).toLocaleString()}`} colors={colors} />
        <Row label="Reason" value={req.reason || "—"} colors={colors} />
        <Text style={[styles.hint, muted]}>
          After approval the device is handed over and the user is asked to confirm receipt.
        </Text>
        {buttons()}
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Stack.Screen options={headerOptions} />
      {body}
      {asset && phase === "done" ? (
        <Pressable onPress={() => router.replace(`/asset/${asset.id}`)} style={{ marginTop: 16 }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Open the device</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function Notice({
  icon,
  title,
  children,
  colors,
}: {
  icon: "ok" | "warn" | "info";
  title: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useColors>;
}) {
  const Icon = icon === "ok" ? CheckCircle2 : icon === "warn" ? AlertTriangle : Info;
  const tint = icon === "ok" ? "#22C55E" : icon === "warn" ? colors.destructive : colors.primary;
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: "center" }]}>
      <Icon size={36} color={tint} strokeWidth={1.8} />
      <Text style={[styles.title, { color: colors.foreground, textAlign: "center" }]}>{title}</Text>
      <Text style={[styles.hint, { color: colors.mutedForeground, textAlign: "center" }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, alignItems: "center" },
  card: { width: "100%", maxWidth: 620, borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flexShrink: 1 },
  rowValue: { fontSize: 14, fontFamily: "Inter_500Medium", flexShrink: 1, textAlign: "right" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  buttonRow: { flexDirection: "row", gap: 10 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
