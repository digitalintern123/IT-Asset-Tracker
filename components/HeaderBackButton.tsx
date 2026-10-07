import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, Text } from "react-native";

import { ChevronLeft } from "@/components/LucideIcon";
import { useColors } from "@/hooks/useColors";
import { goBack } from "@/lib/navigation";

/**
 * Header back button for screens that may be opened without in-app history
 * (page refresh, bookmark, emailed link), where the stack shows no back arrow.
 */
export function HeaderBackButton({ label = "Assets" }: { label?: string }) {
  const router = useRouter();
  const colors = useColors();
  return (
    <Pressable
      onPress={() => goBack(router)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 7,
        paddingHorizontal: 12,
        marginLeft: Platform.OS === "web" ? 16 : 8,
        borderRadius: 50,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <ChevronLeft size={16} color={colors.foreground} strokeWidth={2} style={{ marginRight: 3 }} />
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
        {label}
      </Text>
    </Pressable>
  );
}
