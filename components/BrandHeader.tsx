import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  kicker: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function BrandHeader({ kicker, title, subtitle, right }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  return (
    <LinearGradient
      colors={[colors.brandNavyDeep, colors.brandNavy, "#1B2A57"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          paddingTop: insets.top + 14,
        },
      ]}
    >
      <View style={styles.brandRow}>
        <View style={styles.logoWrap}>
          <Image
            source={require("@/assets/brand/encalm-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View>
            <Text style={styles.brandName}>ENCALM</Text>
            <Text style={[styles.brandTag, { color: colors.brandGoldSoft }]}>
              Asset Tracker
            </Text>
          </View>
          {user?.isDemo ? (
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>DEMO</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.dotMark, { backgroundColor: colors.brandGold }]} />
      </View>

      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.kicker, { color: colors.brandGoldSoft }]}>
            {kicker}
          </Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 18,
  },
  logoWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(205,164,94,0.35)",
  },
  logo: {
    width: 28,
    height: 28,
  },
  brandName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
  },
  brandTag: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.4,
    marginTop: 1,
    textTransform: "uppercase",
  },
  dotMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 30,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 6,
  },
  demoBadge: {
    backgroundColor: "rgba(205, 164, 94, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(205, 164, 94, 0.5)",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  demoBadgeText: {
    color: "#E2C68E",
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
  },
});
