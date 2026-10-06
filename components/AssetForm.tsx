import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  CATEGORIES,
  STATUSES,
  STATUS_LABELS,
} from "@/constants/categories";
import { useColors } from "@/hooks/useColors";
import type { Asset, AssetCategory, AssetInput, AssetStatus } from "@/types/asset";

interface AssetFormResult {
  input: AssetInput;
  assigneeEmail: string;
}

interface Props {
  initial?: Asset;
  initialAssigneeEmail?: string;
  onSubmit: (result: AssetFormResult) => void | Promise<void>;
  submitLabel: string;
  submitting?: boolean;
}

export function AssetForm({
  initial,
  initialAssigneeEmail,
  onSubmit,
  submitLabel,
  submitting,
}: Props) {
  const colors = useColors();

  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<AssetCategory>(
    initial?.category ?? "Laptop",
  );
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? "");
  const [status, setStatus] = useState<AssetStatus>(initial?.status ?? "available");
  const [assignee, setAssignee] = useState(initial?.assignee ?? "");
  const [assigneeEmail, setAssigneeEmail] = useState(initialAssigneeEmail ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [purchaseDate, setPurchaseDate] = useState(
    initial?.purchaseDate ?? new Date().toISOString().slice(0, 10),
  );
  const [purchasePriceText, setPurchasePriceText] = useState(
    initial?.purchasePrice ? String(initial.purchasePrice) : "",
  );
  const [warrantyExpiry, setWarrantyExpiry] = useState(
    initial?.warrantyExpiry ?? "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (status === "in_use" && !assignee.trim()) {
      setError("Assignee name is strictly required when marking asset as In Use");
      return;
    }
    if (status === "maintenance" && !notes.trim()) {
      setError("Maintenance notes detailing the issue or repair reason are required");
      return;
    }
    setError(null);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const price = parseFloat(purchasePriceText.replace(/[^0-9.]/g, ""));
    await onSubmit({
      input: {
        name: name.trim(),
        category,
        serialNumber: serialNumber.trim(),
        status,
        assignee: assignee.trim(),
        location: location.trim(),
        purchaseDate: purchaseDate.trim(),
        purchasePrice: Number.isFinite(price) ? price : 0,
        warrantyExpiry: warrantyExpiry.trim() || null,
        notes: notes.trim(),
      },
      assigneeEmail: assigneeEmail.trim(),
    });
  };

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      color: colors.foreground,
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Section label="Asset" colors={colors}>
        <Field label="Name" colors={colors}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. MacBook Pro 16″"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
        <Field label="Category" colors={colors}>
          <Chips
            options={CATEGORIES}
            value={category}
            onChange={setCategory}
            colors={colors}
          />
        </Field>
        <Field label="Serial number" colors={colors}>
          <TextInput
            value={serialNumber}
            onChangeText={setSerialNumber}
            placeholder="Optional"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section label="Assignment" colors={colors}>
        <Field label="Status" colors={colors}>
          <Chips
            options={STATUSES}
            value={status}
            onChange={setStatus}
            renderLabel={(s) => STATUS_LABELS[s as AssetStatus]}
            colors={colors}
          />
        </Field>
        <Field label="Assigned to" colors={colors}>
          <TextInput
            value={assignee}
            onChangeText={setAssignee}
            placeholder="Person or team"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
        <Field label="Assignee O365 email" colors={colors}>
          <TextInput
            value={assigneeEmail}
            onChangeText={setAssigneeEmail}
            placeholder="name@encalm.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            style={inputStyle}
          />
        </Field>
        <Field label="Location" colors={colors}>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. HQ — Floor 3"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section label="Purchase" colors={colors}>
        <Field label="Purchase date (YYYY-MM-DD)" colors={colors}>
          <TextInput
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="2025-01-15"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            autoCapitalize="none"
          />
        </Field>
        <Field label="Purchase price (₹ INR)" colors={colors}>
          <TextInput
            value={purchasePriceText}
            onChangeText={setPurchasePriceText}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
        </Field>
        <Field label="Warranty expiry (YYYY-MM-DD)" colors={colors}>
          <TextInput
            value={warrantyExpiry}
            onChangeText={setWarrantyExpiry}
            placeholder="Optional"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            autoCapitalize="none"
          />
        </Field>
      </Section>

      <Section label="Notes" colors={colors}>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything worth remembering"
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={4}
          style={[
            inputStyle,
            { minHeight: 96, textAlignVertical: "top", paddingTop: 12 },
          ]}
        />
      </Section>

      {error ? (
        <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>
      ) : null}

      <Pressable
        onPress={handleSubmit}
        disabled={submitting}
        style={({ pressed }) => [
          styles.submit,
          {
            backgroundColor: colors.brandNavy,
            opacity: submitting ? 0.7 : pressed ? 0.9 : 1,
          },
        ]}
      >
        <Feather name="check" size={18} color={colors.brandGoldSoft} />
        <Text style={[styles.submitLabel, { color: "#FFFFFF" }]}>
          {submitLabel}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
        {label.toUpperCase()}
      </Text>
      <View style={{ gap: 14 }}>{children}</View>
    </View>
  );
}

function Field({
  label,
  colors,
  children,
}: {
  label: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Chips<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
  colors,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  renderLabel?: (v: T) => string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => {
              if (Platform.OS !== "web") {
                Haptics.selectionAsync();
              }
              onChange(opt);
            }}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.brandNavy : colors.card,
                borderColor: active ? colors.brandNavy : colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                {
                  color: active ? colors.brandGoldSoft : colors.foreground,
                },
              ]}
            >
              {renderLabel ? renderLabel(opt) : opt}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    maxWidth: 780,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 64,
    gap: 24,
  },
  section: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    fontFamily: "Inter_600SemiBold",
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  submit: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
  },
  submitLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  error: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
