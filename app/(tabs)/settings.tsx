import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
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

import { BrandHeader } from "@/components/BrandHeader";
import { ChevronRight, Cloud, Database, FileText, LogOut, LucideIcon, Upload } from "@/components/LucideIcon";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserRole, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/roles";
import { checkSetup, SetupReport } from "@/lib/setupCheck";

type LucideIconName = string;
export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assets, syncing, syncError, lastSyncedAt, refresh } = useAssets();
  const { user, signOut, setDemoRole, getValidAccessToken } = useAuth();
  const router = useRouter();
  const [testingSp, setTestingSp] = useState(false);
  const [testResult, setTestResult] = useState<SetupReport | null>(null);
  const issues = testResult ? testResult.items.filter((i) => !i.ok).length : 0;
  // Alert.alert is a no-op on react-native-web.
  const notice = (title: string, message: string) => {
    if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };
  const spState: "demo" | "signedOut" | "error" | "connected" | "notSynced" = user?.isDemo
    ? "demo"
    : !user
    ? "signedOut"
    : syncError
    ? "error"
    : lastSyncedAt
    ? "connected"
    : "notSynced";
  const SP_PILL = {
    demo: { bg: "#FFF3E0", fg: "#E65100", text: "Simulated" },
    signedOut: { bg: colors.muted, fg: colors.mutedForeground, text: "Disconnected" },
    error: { bg: "#FCE8E6", fg: "#C5221F", text: "Error" },
    connected: { bg: "#E6F4EA", fg: "#137333", text: "Connected" },
    notSynced: { bg: colors.muted, fg: colors.mutedForeground, text: "Not synced" },
  }[spState];

  const confirm = (
    title: string,
    message: string,
    onConfirm: () => void,
    destructive?: boolean,
  ) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${message}`)) onConfirm();
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        style: destructive ? "destructive" : "default",
        onPress: onConfirm,
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 100,
      }}
    >
      <BrandHeader
        kicker="Preferences"
        title="Settings"
        subtitle="Manage your data and connections"
      />

      <View style={styles.containerWrap}>
        {user ? (
          <View
            style={[
              styles.userCard,
            {
              backgroundColor: colors.brandNavy,
              borderColor: colors.brandGold + "55",
              marginTop: 18,
            },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: colors.brandGold }]}>
            <Text
              style={{
                color: colors.brandNavyDeep,
                fontFamily: "Inter_700Bold",
                fontSize: 16,
              }}
            >
              {user.initials}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={[styles.userEmail, { color: colors.brandGoldSoft }]}>
              {user.email}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              confirm("Sign out?", "You'll need to sign in again.", () =>
                signOut(),
              )
            }
            style={({ pressed }) => [
              styles.signOutBtn,
              {
                borderColor: colors.brandGold + "66",
                opacity: pressed ? 0.7 : 1,
              },
            ]}
          >
            <LogOut size={14} color={colors.brandGoldSoft} strokeWidth={1.8} />
          </Pressable>
        </View>
      ) : null}

      {user?.role === "admin" ? (
        <Pressable
          onPress={() => router.push("/reports")}
          style={({ pressed }) => [
            styles.summary,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginTop: 14,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={[styles.summaryIcon, { backgroundColor: colors.primary + "1F" }]}>
            <FileText size={20} color={colors.primary} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Report logs</Text>
            <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
              Device history, approvals and CSV export
            </Text>
          </View>
          <ChevronRight size={18} color={colors.mutedForeground} strokeWidth={1.8} />
        </Pressable>
      ) : null}

      {user?.role === "admin" && Platform.OS === "web" ? (
        <Pressable
          onPress={() => router.push("/import")}
          style={({ pressed }) => [
            styles.summary,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              marginTop: 14,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={[styles.summaryIcon, { backgroundColor: colors.primary + "1F" }]}>
            <Upload size={20} color={colors.primary} strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.summaryTitle, { color: colors.foreground }]}>Import from Excel</Text>
            <Text style={[styles.summarySub, { color: colors.mutedForeground }]}>
              One-time upload of the inventory sheet (.xlsx)
            </Text>
          </View>
          <ChevronRight size={18} color={colors.mutedForeground} strokeWidth={1.8} />
        </Pressable>
      ) : null}

      <View
        style={[
          styles.summary,
          { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14 },
        ]}
      >
        <View
          style={[
            styles.summaryIcon,
            { backgroundColor: user ? colors.primary + "1F" : colors.muted },
          ]}
        >
          {user ? (
            <Cloud size={20} color={colors.primary} strokeWidth={1.8} />
          ) : (
            <Database size={20} color={colors.mutedForeground} strokeWidth={1.8} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
            {user?.isDemo
              ? "Demo Sandbox (Local)"
              : user
              ? "SharePoint Online Database"
              : "Demo Mode"}
          </Text>
          <Text
            style={[styles.summarySub, { color: colors.mutedForeground }]}
          >
            {user?.isDemo
              ? `${assets.length} sample assets · Local sandbox mode`
              : user
              ? `${assets.length} corporate assets connected to encalmit.sharepoint.com`
              : "Sign in with Microsoft 365 to load corporate assets"}
          </Text>
        </View>
      </View>

      <Section title="Cloud Infrastructure" colors={colors}>
        <Row
          icon="cloud"
          label="Microsoft SharePoint Online"
          sublabel={
            user?.isDemo
              ? "Demo sandbox (No corporate records modified)"
              : !user
              ? "Sign in to connect"
              : syncError
              ? `Couldn't load the register: ${syncError}`
              : "Site: encalmit.sharepoint.com · List: IT Asset Register"
          }
          colors={colors}
          onPress={() => {
            if (user?.isDemo) {
              notice("Demo Sandbox", "You are in Demo Mode. Assets are simulated locally and not synced to corporate SharePoint.");
            } else if (user) {
              refresh();
            } else {
              notice("Sign In Required", "Please sign in with your corporate Microsoft 365 account to access SharePoint.");
            }
          }}
          right={
            <View
              style={[
                styles.statusPill,
                { backgroundColor: SP_PILL.bg },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: SP_PILL.fg },
                ]}
              >
                {SP_PILL.text}
              </Text>
            </View>
          }
        />
        <Row
          icon="activity"
          label="Test SharePoint Connection"
          sublabel={
            testingSp
              ? "Checking site, lists, columns & permissions..."
              : testResult
              ? testResult.ok
                ? `All ${testResult.items.length} checks passed (${testResult.latencyMs}ms)`
                : `${issues} issue${issues === 1 ? "" : "s"} found — see below`
              : "Checks site, lists, columns & Graph permissions"
          }
          colors={colors}
          onPress={async () => {
            if (user?.isDemo) {
              setTestResult({
                ok: true,
                items: [{ label: "Demo Mode: local mock database (nothing to check)", ok: true }],
                latencyMs: 14,
              });
              return;
            }
            const token = (await getValidAccessToken()) || user?.accessToken;
            if (!token) {
              if (Platform.OS === "web") window.alert("Sign in required to test SharePoint connection.");
              else Alert.alert("Authentication Required", "Please sign in with your Microsoft account first.");
              return;
            }
            setTestingSp(true);
            setTestResult(null);
            try {
              const res = await checkSetup(token);
              setTestResult(res);
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(
                  res.ok
                    ? Haptics.NotificationFeedbackType.Success
                    : Haptics.NotificationFeedbackType.Error
                );
              }
            } catch (err: any) {
              setTestResult({
                ok: false,
                items: [{ label: "Setup check", ok: false, detail: err?.message || "Diagnostic check failed" }],
                latencyMs: 0,
              });
            } finally {
              setTestingSp(false);
            }
          }}
          right={
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor: testingSp
                    ? colors.primary + "18"
                    : testResult
                    ? testResult.ok
                      ? "#E6F4EA"
                      : "#FCE8E6"
                    : colors.muted,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  {
                    color: testingSp
                      ? colors.primary
                      : testResult
                      ? testResult.ok
                        ? "#137333"
                        : "#C5221F"
                      : colors.mutedForeground,
                  },
                ]}
              >
                {testingSp
                  ? "Testing..."
                  : testResult
                  ? testResult.ok
                    ? "Passed"
                    : `${issues} issue${issues === 1 ? "" : "s"}`
                  : "Run Test"}
              </Text>
            </View>
          }
        />
        {testResult && !testingSp && !user?.isDemo ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              gap: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            {testResult.items.map((item) => (
              <View key={item.label} style={{ flexDirection: "row", gap: 8 }}>
                <Text
                  style={{
                    width: 16,
                    fontFamily: "Inter_600SemiBold",
                    color: item.unknown ? colors.mutedForeground : item.ok ? "#137333" : "#C5221F",
                  }}
                >
                  {item.unknown ? "?" : item.ok ? "✓" : "✗"}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }}>
                    {item.label}
                  </Text>
                  {item.detail ? (
                    <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>{item.detail}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
        <Row
          icon="shield"
          label="Microsoft Azure AD (Entra ID)"
          sublabel={
            user?.isDemo
              ? "Demo session · demo@encalmhospitality.com"
              : user
              ? `Signed in as ${user.email}`
              : "Single sign-on ready"
          }
          colors={colors}
          right={
            <View
              style={[
                styles.statusPill,
                { backgroundColor: user?.isDemo ? "#FFF3E0" : user ? "#E6F4EA" : colors.muted },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: user?.isDemo ? "#E65100" : user ? "#137333" : colors.mutedForeground },
                ]}
              >
                {user?.isDemo ? "Demo" : user ? "Active" : "Signed Out"}
              </Text>
            </View>
          }
        />
        {user ? (
          <Row
            icon="user-check"
            label="Authorization Role"
            sublabel={
              `${ROLE_DESCRIPTIONS[user.role || "viewer"]}` +
              (user.roleSource ? `\nFrom: ${user.roleSource}` : "") +
              (user.isDemo ? "" : "\nRole changes in Entra ID apply at your next sign-in or within the hour.")
            }
            colors={colors}
            right={
              <View
                style={[
                  styles.statusPill,
                  {
                    backgroundColor:
                      user.role === "admin"
                        ? "#E8F0FE"
                        : user.role === "technician"
                        ? "#E6F4EA"
                        : "#F1F3F4",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusPillText,
                    {
                      color:
                        user.role === "admin"
                          ? "#1967D2"
                          : user.role === "technician"
                          ? "#137333"
                          : "#5F6368",
                    },
                  ]}
                >
                  {ROLE_LABELS[user.role || "viewer"]}
                </Text>
              </View>
            }
          />
        ) : null}
        {user?.isDemo ? (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              backgroundColor: colors.card,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontFamily: "Inter_600SemiBold",
                color: colors.mutedForeground,
                marginBottom: 8,
                letterSpacing: 0.5,
              }}
            >
              DEMO ROLE SWITCHER (TEST RBAC)
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["admin", "technician", "viewer"] as UserRole[]).map((r) => {
                const active = user.role === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => setDemoRole(r)}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 8,
                      alignItems: "center",
                      backgroundColor: active ? colors.primary : colors.muted,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontFamily: "Inter_600SemiBold",
                        color: active ? "#FFFFFF" : colors.mutedForeground,
                        textTransform: "capitalize",
                      }}
                    >
                      {r}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        {user?.isDemo ? (
          <Row
            icon="log-in"
            label="Connect Corporate Microsoft 365"
            sublabel="Sign in to access real Encalm SharePoint inventory"
            colors={colors}
            onPress={() => signOut()}
            right={<ChevronRight size={16} color={colors.primary} strokeWidth={1.8} />}
          />
        ) : null}
        {user ? (
          <Row
            icon="refresh-cw"
            label="Refresh from SharePoint"
            sublabel={
              syncing
                ? "Synchronizing with cloud..."
                : lastSyncedAt
                ? `Last synced: ${new Date(lastSyncedAt).toLocaleTimeString()}`
                : "Tap to reload latest records"
            }
            colors={colors}
            onPress={async () => {
              if (Platform.OS !== "web") {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              await refresh();
            }}
            right={
              syncing ? (
                <Text style={{ fontSize: 12, color: colors.primary }}>Syncing...</Text>
              ) : undefined
            }
          />
        ) : null}
      </Section>

      <Section title="About" colors={colors}>
        <Row
          icon="info"
          label="Version"
          sublabel="1.0.0 (Production Cloud)"
          colors={colors}
        />
        <Row
          icon="hard-drive"
          label="Database"
          sublabel={user ? "Microsoft SharePoint Online (Live Master)" : "Demo Mode (Ephemeral Cache)"}
          colors={colors}
        />
      </Section>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 24, gap: 10 }}>
      <Text
        style={[
          styles.sectionLabel,
          { color: colors.mutedForeground },
        ]}
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

function Row({
  icon,
  label,
  sublabel,
  colors,
  onPress,
  right,
  destructive,
}: {
  icon: LucideIconName;
  label: string;
  sublabel?: string;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}) {
  const tint = destructive ? colors.destructive : colors.foreground;
  const Wrapper: React.ComponentType<{
    children: React.ReactNode;
    style?: object;
  }> = onPress
    ? (props) => (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [
            props.style,
            pressed && { opacity: 0.7 },
          ]}
        >
          {props.children}
        </Pressable>
      )
    : (props) => <View style={props.style}>{props.children}</View>;

  return (
    <Wrapper
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 14,
        borderBottomWidth: 0,
      }}
    >
      <View
        style={[
          styles.rowIcon,
          { backgroundColor: colors.secondary },
        ]}
      >
        <LucideIcon name={icon} size={16} color={tint} strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color: tint }]}>{label}</Text>
        {sublabel ? (
          <Text
            style={[
              styles.rowSublabel,
              { color: colors.mutedForeground },
            ]}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <ChevronRight
            size={18}
            color={colors.mutedForeground}
            strokeWidth={1.8}
          />
        ) : null)}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  containerWrap: {
    width: "100%",
    maxWidth: 860,
    alignSelf: "center",
  },
  headerWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  kicker: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    marginTop: 2,
  },
  summary: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  summaryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  summarySub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: "Inter_600SemiBold",
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  rowSublabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  userCard: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  userName: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  userEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  signOutBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
