import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { Check, ChevronDown, ChevronUp } from "@/components/LucideIcon";
import { useColors } from "@/hooks/useColors";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  value: T | "";
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
}

/** Labelled dropdown in the same style as the asset form's Status picker. */
export function SelectField<T extends string>({ label, value, options, onChange, placeholder }: Props<T>) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: colors.card,
            borderColor: open ? colors.primary : colors.border,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
      >
        <Text
          style={[styles.value, { color: selected ? colors.foreground : colors.mutedForeground }]}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder || "Select…"}
        </Text>
        {open ? (
          <ChevronUp size={18} color={colors.mutedForeground} strokeWidth={1.8} />
        ) : (
          <ChevronDown size={18} color={colors.mutedForeground} strokeWidth={1.8} />
        )}
      </Pressable>

      {open ? (
        <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  if (Platform.OS !== "web") Haptics.selectionAsync();
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  i < options.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                  isSelected && { backgroundColor: colors.primary + "18" },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.optionText,
                    {
                      color: isSelected ? colors.primary : colors.foreground,
                      fontFamily: isSelected ? "Inter_600SemiBold" : "Inter_400Regular",
                    },
                  ]}
                >
                  {opt.label}
                </Text>
                {isSelected ? <Check size={16} color={colors.primary} strokeWidth={2} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  value: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  menu: { marginTop: 8, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionText: { fontSize: 14 },
});
