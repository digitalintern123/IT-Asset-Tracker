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

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { assets, clearAll, loadSamples } = useAssets();
  const { user, signOut } = useAuth();

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
            { backgroundColor: colors.primary + "1F" },
          ]}
        >
          <Feather name="database" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.summaryTitle, { color: colors.foreground }]}>
            Local storage
          </Text>
          <Text
            style={[styles.summarySub, { color: colors.mutedForeground }]}
          >
            {assets.length} assets stored on this device
          </Text>
        </View>
      </View>

      <Section title="Cloud sync" colors={colors}>
        <Row
          icon="cloud"
          label="Microsoft SharePoint"
          sublabel="Not connected"
          colors={colors}
          onPress={() =>
            Alert.alert(
              "SharePoint sync",
              "Cloud sync to SharePoint will be enabled once your Azure AD app registration is configured. Provide the tenant ID, client ID, and SharePoint site URL to connect.",
            )
          }
          right={
            <View
              style={[
                styles.statusPill,
                { backgroundColor: colors.muted },
              ]}
            >
              <Text
                style={[
                  styles.statusPillText,
                  { color: colors.mutedForeground },
                ]}
              >
                Pending
              </Text>
            </View>
          }
        />
        <Row
          icon="shield"
          label="Microsoft Azure AD"
          sublabel="Sign-in disabled"
          colors={colors}
          onPress={() =>
            Alert.alert(
              "Azure AD",
              "Single sign-on with your Microsoft 365 tenant will be available after registering the app in Azure AD.",
            )
          }
        />
      </Section>

      <Section title="Data" colors={colors}>
        <Row
          icon="refresh-cw"
          label="Reload sample data"
          sublabel="Replace local assets with starter examples"
          colors={colors}
          onPress={() =>
            confirm(
              "Reload sample data?",
              "This will replace all current assets with the starter set.",
              async () => {
                if (Platform.OS !== "web") {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success,
                  );
                }
                await loadSamples();
              },
            )
          }
        />
        <Row
          icon="trash-2"
          label="Clear all assets"
          sublabel="Remove every asset from this device"
          colors={colors}
          destructive
          onPress={() =>
            confirm(
              "Clear all assets?",
              "This cannot be undone.",
              async () => {
                if (Platform.OS !== "web") {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Warning,
                  );
                }
                await clearAll();
              },
              true,
            )
          }
        />
      </Section>

      <Section title="About" colors={colors}>
        <Row
          icon="info"
          label="Version"
          sublabel="1.0.0"
          colors={colors}
        />
        <Row
          icon="hard-drive"
          label="Storage"
          sublabel="On-device (AsyncStorage)"
          colors={colors}
        />
      </Section>
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
