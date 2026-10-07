import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { SelectField } from "@/components/SelectField";
import { LOCATIONS, LocationCode } from "@/constants/categories";
import { useColors } from "@/hooks/useColors";
import { formatLocation, parseLocation } from "@/lib/location";

interface Props {
  /** Stored location string, e.g. "DEL — T3 Lounge Reception". */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

const SITE_OPTIONS = LOCATIONS.map((l) => ({ value: l.code as LocationCode, label: `${l.code} — ${l.name}` }));

/** Site dropdown (DEL/HYD/GOA/BUG/NAG) plus an optional terminal/desk detail. */
export function LocationPicker({ value, onChange, required = true }: Props) {
  const colors = useColors();
  const initial = parseLocation(value);
  const [site, setSite] = useState<LocationCode | "">(initial.site);
  const [detail, setDetail] = useState(initial.detail);

  // Follow external resets (e.g. the reassign dialog reopening for another device).
  useEffect(() => {
    const next = parseLocation(value);
    if (formatLocation(next.site, next.detail) !== formatLocation(site, detail)) {
      setSite(next.site);
      setDetail(next.detail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (nextSite: LocationCode | "", nextDetail: string) => {
    setSite(nextSite);
    setDetail(nextDetail);
    onChange(formatLocation(nextSite, nextDetail));
  };

  return (
    <View style={{ gap: 16 }}>
      <SelectField
        label={required ? "Location *" : "Location"}
        value={site}
        options={SITE_OPTIONS}
        onChange={(code) => update(code, detail)}
        placeholder="Select site"
      />
      <View style={{ gap: 6 }}>
        <Text style={[styles.label, { color: colors.foreground }]}>Terminal / desk (optional)</Text>
        <TextInput
          value={detail}
          onChangeText={(text) => update(site, text)}
          placeholder="e.g. T3 Lounge Reception"
          placeholderTextColor={colors.mutedForeground}
          style={[
            styles.input,
            { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
