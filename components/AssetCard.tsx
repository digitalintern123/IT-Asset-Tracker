import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { CATEGORY_ICONS } from "@/constants/categories";
import { useColors } from "@/hooks/useColors";
import type { Asset } from "@/types/asset";

import { StatusBadge } from "./StatusBadge";

export function AssetCard({ asset }: { asset: Asset }) {
  const colors = useColors();
  const router = useRouter();
  const icon = CATEGORY_ICONS[asset.category];

  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== "web") {
          Haptics.selectionAsync();
        }
        router.push(`/asset/${asset.id}`);
      }}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      >
        <Feather name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <View style={styles.header}>
          <Text
            numberOfLines={1}
            style={[styles.name, { color: colors.foreground }]}
          >
            {asset.name}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.meta, { color: colors.mutedForeground }]}
        >
          {asset.category} · {asset.serialNumber || "No serial"}
        </Text>
        <View style={styles.footer}>
          <StatusBadge status={asset.status} />
          <Text
            numberOfLines={1}
            style={[styles.assignee, { color: colors.mutedForeground }]}
          >
            {asset.assignee ? asset.assignee : asset.location || "Unassigned"}
          </Text>
        </View>
      </View>
      <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  meta: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
    gap: 8,
  },
  assignee: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flexShrink: 1,
    textAlign: "right",
  },
});
