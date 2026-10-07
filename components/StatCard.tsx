import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { LucideIcon } from "@/components/LucideIcon";
import { useColors } from "@/hooks/useColors";

interface Props {
  label: string;
  value: string | number;
  icon: string;
  tint?: string;
}

export function StatCard({ label, value, icon, tint }: Props) {
  const colors = useColors();
  const accent = tint ?? colors.primary;
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: accent + "1F" }]}
      >
        <LucideIcon name={icon} size={16} color={accent} strokeWidth={1.8} />
      </View>
      <Text style={[styles.value, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    minWidth: 0,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
