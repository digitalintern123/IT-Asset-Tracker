import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
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
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { UserRole, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/roles";

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];
export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assets, syncing, syncError, lastSyncedAt, refresh } = useAssets();
  const { user, signOut, setDemoRole } = useAuth();

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
            <Feather name="log-out" size={14} color={colors.brandGoldSoft} />
          </Pressable>
        </View>
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
          <Feather name={user ? "cloud" : "database"} size={20} color={user ? colors.primary : colors.mutedForeground} />
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
              : user
              ? "Site: encalmit.sharepoint.com · List: IT Asset Register"
              : "Sign in to connect"
          }
          colors={colors}
          onPress={() => {
            if (user?.isDemo) {
              Alert.alert("Demo Sandbox", "You are in Demo Mode. Assets are simulated locally and not synced to corporate SharePoint.");
            } else if (user) {
              refresh();
            } else {
              Alert.alert("Sign In Required", "Please sign in with your corporate Microsoft 365 account to access SharePoint.");
            }
          }}
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
                {user?.isDemo ? "Simulated" : user ? "Connected" : "Disconnected"}
              </Text>
            </View>
          }
        />
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
            sublabel={ROLE_DESCRIPTIONS[user.role || "technician"]}
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
                  {ROLE_LABELS[user.role || "technician"]}
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
            right={<Feather name="chevron-right" size={16} color={colors.primary} />}
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
  icon: FeatherIcon;
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
        <Feather name={icon} size={16} color={tint} />
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
          <Feather
            name="chevron-right"
            size={18}
            color={colors.mutedForeground}
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
