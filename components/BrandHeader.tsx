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
      <View style={styles.inner}>
        <View style={styles.brandRow}>
          <Image
            source={require("@/assets/brand/encalm-logo-white.png")}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.headerDivider} />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View>
              <Text style={[styles.brandTag, { color: colors.brandGoldSoft }]}>
                ASSET TRACKER
              </Text>
              <Text style={styles.brandSub}>Hospitality Operations</Text>
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
  inner: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  logo: {
    width: 52,
    height: 42,
  },
  headerDivider: {
    width: 1,
    height: 26,
    backgroundColor: "rgba(205, 164, 94, 0.4)",
  },
  brandTag: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  brandSub: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "rgba(255, 255, 255, 0.65)",
    letterSpacing: 0.5,
    marginTop: 1,
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
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 32,
    fontFamily: Platform.OS === "web" ? '"Playfair Display", Georgia, serif' : "Inter_700Bold",
    color: "#FFFFFF",
    marginTop: 4,
    letterSpacing: -0.2,
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
