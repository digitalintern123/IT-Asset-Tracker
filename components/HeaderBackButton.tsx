import { useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, Text } from "react-native";

import { ChevronLeft } from "@/components/LucideIcon";
import { useColors } from "@/hooks/useColors";
import { goBack } from "@/lib/navigation";

/**
 * Header back button used on every stack screen on web. It goes back in the
 * app when there is history ("Back"), else to the Assets list ("Assets") —
 * after a page refresh, a bookmark or an emailed link. Drawn with an SVG
 * icon, so it never depends on an image file being served.
 */
export function HeaderBackButton({ label }: { label?: string }) {
  const router = useRouter();
  const colors = useColors();
  const text = label ?? (router.canGoBack() ? "Back" : "Assets");
  return (
    <Pressable
      onPress={() => goBack(router)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={text === "Back" ? "Back" : `Back to ${text}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 7,
        paddingHorizontal: 12,
        marginLeft: Platform.OS === "web" ? 16 : 8,
        marginRight: 12,
        borderRadius: 50,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <ChevronLeft size={16} color={colors.foreground} strokeWidth={2} style={{ marginRight: 3 }} />
      <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 }}>
        {text}
      </Text>
    </Pressable>
  );
}
