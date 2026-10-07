import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HeaderBackButton } from "@/components/HeaderBackButton";
import { AlertTriangle, CheckCircle2, Info } from "@/components/LucideIcon";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { submitConfirmation } from "@/lib/confirmations";
import { buildConfirmationReceiptMail, deliverMail } from "@/lib/mail";
import { matchesAsset } from "@/lib/assetId";

type Phase = "ready" | "submitting" | "done" | "error";

/**
 * Opened from the "please confirm" email. The signed-in user confirms they
 * have received the device; Encalm IT is emailed a copy.
 */
export default function ConfirmScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ asset?: string; custody?: string }>();
  const assetId = String(params.asset || "").trim();
  const custodyId = String(params.custody || "").trim();
  const { user, getValidAccessToken } = useAuth();
  const { assets, refresh } = useAssets();
  const [phase, setPhase] = useState<Phase>("ready");
  const [message, setMessage] = useState<string | null>(null);

  // Staff may not be able to read the register; then only the tag is shown.
  const asset = useMemo(() => assets.find((a) => matchesAsset(a, assetId)), [assets, assetId]);
  const record = asset?.assignmentHistory?.find((r) => r.id === custodyId);
  const userEmail = (user?.email || "").trim().toLowerCase();
  const wrongUser =
    !!record?.assigneeEmail && !!userEmail && record.assigneeEmail.trim().toLowerCase() !== userEmail;
  const ended = !!record?.returnedAt;
  const alreadyConfirmed = !!record?.confirmedAt;

  const headerOptions = {
    title: "Confirm receipt",
    headerLeft: router.canGoBack() ? undefined : () => <HeaderBackButton />,
  };

  const confirm = async () => {
    if (!user) return;
    setPhase("submitting");
    setMessage(null);
    try {
      const token = (await getValidAccessToken()) || user.accessToken;
      if (!token) throw new Error("Your Microsoft 365 session has expired. Please sign in again.");
      const name = asset?.name || assetId;
      await submitConfirmation(token, { assetId, custodyId, assetName: name });
      const outcome = await deliverMail(
        token,
        buildConfirmationReceiptMail({ id: assetId, name }, user.name, user.email),
      );
      setPhase("done");
      if (outcome !== "sent") {
        setMessage("Your confirmation is recorded. Please also send the email that opened, so Encalm IT is notified.");
      }
      void refresh();
    } catch (err: any) {
      setPhase("error");
      setMessage(err?.message || "Could not record your confirmation. Please try again.");
    }
  };

  const card = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }];
  const text = { color: colors.foreground };
  const muted = { color: colors.mutedForeground };

  let body: React.ReactNode;
  if (!assetId || !custodyId) {
    body = (
      <Notice icon="warn" colors={colors} title="This confirmation link is incomplete">
        Please open the link from your email again, or contact Encalm IT.
      </Notice>
    );
  } else if (user?.isDemo) {
    body = (
      <Notice icon="info" colors={colors} title="Sign in with Microsoft to confirm">
        Confirming receipt needs your Encalm Microsoft 365 account. Sign out of Demo Mode and sign in with Microsoft.
      </Notice>
    );
  } else if (phase === "done") {
    body = (
      <Notice icon="ok" colors={colors} title="Thank you — confirmed">
        {`You have confirmed receipt of ${asset?.name || assetId}. Encalm IT has been notified.`}
        {message ? `\n\n${message}` : ""}
      </Notice>
    );
  } else if (alreadyConfirmed) {
    body = (
      <Notice icon="ok" colors={colors} title="Already confirmed">
        {`Receipt was confirmed on ${new Date(record!.confirmedAt!).toLocaleString()}.`}
      </Notice>
    );
  } else if (ended) {
    body = (
      <Notice icon="info" colors={colors} title="This assignment has ended">
        This device has since been returned or reassigned, so there is nothing to confirm.
      </Notice>
    );
  } else if (wrongUser) {
    body = (
      <Notice icon="warn" colors={colors} title="This device was assigned to someone else">
        {`It was assigned to ${record!.assignee} (${record!.assigneeEmail}), but you are signed in as ${user?.email}. Please sign in with the account the email was sent to.`}
      </Notice>
    );
  } else {
    body = (
      <View style={card}>
        <Text style={[styles.title, text]}>Encalm IT has assigned this asset to you</Text>
        <Row label="Asset Tag" value={assetId} colors={colors} />
        {asset ? (
          <>
            <Row label="Host Name" value={asset.name} colors={colors} />
            <Row label="Make / Model" value={[asset.make, asset.model].filter(Boolean).join(" ") || "—"} colors={colors} />
            <Row label="Serial number" value={asset.serialNumber || "—"} colors={colors} />
            <Row label="Location" value={asset.location || "—"} colors={colors} />
          </>
        ) : null}
        <Text style={[styles.hint, muted]}>
          Signed in as {user?.name} ({user?.email}). By confirming, you acknowledge you have received this device.
        </Text>
        {phase === "error" && message ? (
          <Text style={[styles.error, { color: colors.destructive }]}>{message}</Text>
        ) : null}
        <Pressable
          onPress={confirm}
          disabled={phase === "submitting"}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.primary, opacity: phase === "submitting" ? 0.7 : pressed ? 0.85 : 1 },
          ]}
        >
          {phase === "submitting" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Confirm receipt</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Stack.Screen options={headerOptions} />
      {body}
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
  card: { width: "100%", maxWidth: 560, borderWidth: 1, borderRadius: 16, padding: 20, gap: 12 },
  title: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  rowValue: { fontSize: 14, fontFamily: "Inter_500Medium", flexShrink: 1, textAlign: "right" },
  hint: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  error: { fontSize: 13, fontFamily: "Inter_500Medium" },
  button: { marginTop: 4, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
