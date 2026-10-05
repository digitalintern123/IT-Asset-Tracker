import { Feather } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

type FeatherIcon = React.ComponentProps<typeof Feather>["name"];

interface Props {
  icon?: FeatherIcon;
  title: string;
  message?: string;
}

export function EmptyState({ icon = "inbox", title, message }: Props) {
  const colors = useColors();
  return (
    <View style={styles.container}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: colors.secondary, borderColor: colors.border },
        ]}
      >
        <Feather name={icon} size={26} color={colors.mutedForeground} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
      {message ? (
        <Text style={[styles.message, { color: colors.mutedForeground }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    paddingHorizontal: 24,
    gap: 10,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  message: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 280,
  },
});
