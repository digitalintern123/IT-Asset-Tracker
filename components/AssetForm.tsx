import { Check, ChevronDown, ChevronUp, LucideIcon } from "@/components/LucideIcon";
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
  STATUS_COLORS,
  STATUS_LABELS,
  getCategoryIcon,
} from "@/constants/categories";
import { PeoplePicker } from "@/components/PeoplePicker";
import { useColors } from "@/hooks/useColors";
import type { Asset, AssetInput, AssetStatus, StandardCategory } from "@/types/asset";

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

  const isCustomInitial =
    !!initial?.category &&
    !CATEGORIES.some((c) => c !== "Other" && c === initial.category);

  const [selectedCategory, setSelectedCategory] = useState<StandardCategory>(
    isCustomInitial ? "Other" : ((initial?.category as StandardCategory) ?? "Laptop"),
  );
  const [customCategory, setCustomCategory] = useState(
    isCustomInitial ? initial?.category ?? "" : "",
  );
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const [name, setName] = useState(initial?.name ?? "");
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? "");
  const [status, setStatus] = useState<AssetStatus>(initial?.status ?? "new");
  // A new entry is either a New Device or issued straight away. Once a device
  // has left "New Device" it never goes back (returned devices are "Available").
  const statusOptions: AssetStatus[] = !initial
    ? ["new", "in_use"]
    : STATUSES.filter((st) => st !== "new" || initial.status === "new");
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
    // 1. Asset Name is mandatory
    if (!name.trim()) {
      setError("Asset Name is required *");
      return;
    }
    // 2. Category is mandatory (including custom text if Other)
    if (selectedCategory === "Other" && !customCategory.trim()) {
      setError("Please specify the custom category name *");
      return;
    }
    // 3. Serial Number is mandatory
    if (!serialNumber.trim()) {
      setError("Serial Number is required *");
      return;
    }
    // 4. Status is mandatory
    if (!status) {
      setError("Asset Status is required *");
      return;
    }
    // 5. Assignee Name is mandatory for a device that is In Use
    if (status === "in_use" && !assignee.trim()) {
      setError("Assigned to (Custodian name) is required *");
      return;
    }
    // 6. Assignee Email is mandatory for a device that is In Use
    if (status === "in_use" && !assigneeEmail.trim()) {
      setError("Assignee O365 email is required *");
      return;
    }
    if (assigneeEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail.trim())) {
      setError("Please enter a valid email address (e.g. name@encalm.com) *");
      return;
    }
    // 7. Location is mandatory
    if (!location.trim()) {
      setError("Location / Airport terminal is required *");
      return;
    }
    // 8. Purchase Date is mandatory
    if (!purchaseDate.trim()) {
      setError("Purchase date (YYYY-MM-DD) is required *");
      return;
    }
    // 9. Purchase Price is mandatory
    const cleanPriceStr = purchasePriceText.replace(/[^0-9.]/g, "");
    const price = parseFloat(cleanPriceStr);
    if (!purchasePriceText.trim() || !Number.isFinite(price) || price < 0) {
      setError("Purchase price (₹ INR) is required *");
      return;
    }
    // 10. Warranty Expiry is mandatory
    if (!warrantyExpiry.trim()) {
      setError("Warranty expiry date (YYYY-MM-DD) is required *");
      return;
    }
    // 11. Maintenance Notes required only if in maintenance
    if (status === "maintenance" && !notes.trim()) {
      setError("Maintenance notes detailing the issue or repair reason are required *");
      return;
    }

    setError(null);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const finalCategory =
      selectedCategory === "Other" ? customCategory.trim() : selectedCategory;
    await onSubmit({
      input: {
        name: name.trim(),
        category: finalCategory,
        serialNumber: serialNumber.trim(),
        status,
        assignee: assignee.trim(),
        location: location.trim(),
        purchaseDate: purchaseDate.trim(),
        purchasePrice: price,
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
        <Field label="Name *" colors={colors}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. MacBook Pro 16″"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
        <Field label="Category *" colors={colors}>
          <Pressable
            onPress={() => setDropdownOpen((prev) => !prev)}
            style={({ pressed }) => [
              styles.dropdownTrigger,
              {
                backgroundColor: colors.card,
                borderColor: dropdownOpen ? colors.primary : colors.border,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.dropdownLeft}>
              <View
                style={[
                  styles.dropdownIconWrap,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <LucideIcon
                  name={getCategoryIcon(selectedCategory)}
                  size={16}
                  color={colors.primary}
                  strokeWidth={1.8}
                />
              </View>
              <Text style={[styles.dropdownValue, { color: colors.foreground }]}>
                {selectedCategory}
              </Text>
            </View>
            {dropdownOpen ? (
              <ChevronUp size={18} color={colors.mutedForeground} strokeWidth={1.8} />
            ) : (
              <ChevronDown size={18} color={colors.mutedForeground} strokeWidth={1.8} />
            )}
          </Pressable>

          {dropdownOpen ? (
            <View
              style={[
                styles.dropdownMenu,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {CATEGORIES.map((cat, i) => {
                const isSelected = cat === selectedCategory;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      if (Platform.OS !== "web") {
                        Haptics.selectionAsync();
                      }
                      setSelectedCategory(cat);
                      setDropdownOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      i < CATEGORIES.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                      isSelected && {
                        backgroundColor: colors.primary + "18",
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={styles.dropdownLeft}>
                      <View
                        style={[
                          styles.dropdownIconWrap,
                          {
                            backgroundColor: isSelected
                              ? colors.primary + "22"
                              : colors.secondary,
                          },
                        ]}
                      >
                        <LucideIcon
                          name={getCategoryIcon(cat)}
                          size={15}
                          color={isSelected ? colors.primary : colors.mutedForeground}
                          strokeWidth={1.8}
                        />
                      </View>
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          {
                            color: isSelected
                              ? colors.primary
                              : colors.foreground,
                            fontFamily: isSelected
                              ? "Inter_600SemiBold"
                              : "Inter_400Regular",
                          },
                        ]}
                      >
                        {cat}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Check size={16} color={colors.primary} strokeWidth={2} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Field>

        {selectedCategory === "Other" ? (
          <Field label="Specify custom category *" colors={colors}>
            <TextInput
              value={customCategory}
              onChangeText={setCustomCategory}
              placeholder="e.g. Projector, POS Terminal, Biometric Reader"
              placeholderTextColor={colors.mutedForeground}
              style={inputStyle}
              autoFocus={!initial?.category || initial.category === "Other"}
            />
            <Text
              style={{
                fontSize: 12,
                color: colors.mutedForeground,
                marginTop: -4,
                marginBottom: 2,
              }}
            >
              This custom category will be assigned to the asset and tracked across reports.
            </Text>
          </Field>
        ) : null}
        <Field label="Serial number *" colors={colors}>
          <TextInput
            value={serialNumber}
            onChangeText={setSerialNumber}
            placeholder="e.g. C02G1234MD6R"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section label="Assignment" colors={colors}>
        <Field label="Status *" colors={colors}>
          <Pressable
            onPress={() => setStatusDropdownOpen((prev) => !prev)}
            style={({ pressed }) => [
              styles.dropdownTrigger,
              {
                backgroundColor: colors.card,
                borderColor: statusDropdownOpen ? colors.primary : colors.border,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <View style={styles.dropdownLeft}>
              <View
                style={[
                  styles.dropdownIconWrap,
                  { backgroundColor: STATUS_COLORS[status].bg },
                ]}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: STATUS_COLORS[status].dot,
                  }}
                />
              </View>
              <Text style={[styles.dropdownValue, { color: colors.foreground }]}>
                {STATUS_LABELS[status]}
              </Text>
            </View>
            {statusDropdownOpen ? (
              <ChevronUp size={18} color={colors.mutedForeground} strokeWidth={1.8} />
            ) : (
              <ChevronDown size={18} color={colors.mutedForeground} strokeWidth={1.8} />
            )}
          </Pressable>

          {statusDropdownOpen ? (
            <View
              style={[
                styles.dropdownMenu,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              {statusOptions.map((st, i) => {
                const isSelected = st === status;
                return (
                  <Pressable
                    key={st}
                    onPress={() => {
                      if (Platform.OS !== "web") {
                        Haptics.selectionAsync();
                      }
                      setStatus(st);
                      setStatusDropdownOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.dropdownOption,
                      i < statusOptions.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                      isSelected && {
                        backgroundColor: colors.primary + "18",
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={styles.dropdownLeft}>
                      <View
                        style={[
                          styles.dropdownIconWrap,
                          {
                            backgroundColor: STATUS_COLORS[st].bg,
                          },
                        ]}
                      >
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: STATUS_COLORS[st].dot,
                          }}
                        />
                      </View>
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          {
                            color: isSelected
                              ? colors.primary
                              : colors.foreground,
                            fontFamily: isSelected
                              ? "Inter_600SemiBold"
                              : "Inter_400Regular",
                          },
                        ]}
                      >
                        {STATUS_LABELS[st]}
                      </Text>
                    </View>
                    {isSelected ? (
                      <Check size={16} color={colors.primary} strokeWidth={2} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </Field>
        <PeoplePicker
          value={{ name: assignee, email: assigneeEmail }}
          onChange={(next) => {
            setAssignee(next.name);
            setAssigneeEmail(next.email);
          }}
          nameLabel={status === "in_use" ? "Assigned to *" : "Assigned to"}
          emailLabel={status === "in_use" ? "Assignee O365 email *" : "Assignee O365 email"}
        />
        <Field label="Location *" colors={colors}>
          <TextInput
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. HQ — Floor 3 / T3 Terminal"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
      </Section>

      <Section label="Purchase" colors={colors}>
        <Field label="Purchase date (YYYY-MM-DD) *" colors={colors}>
          <TextInput
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="2025-01-15"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            autoCapitalize="none"
          />
        </Field>
        <Field label="Purchase price (₹ INR) *" colors={colors}>
          <TextInput
            value={purchasePriceText}
            onChangeText={setPurchasePriceText}
            placeholder="0"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            style={inputStyle}
          />
        </Field>
        <Field label="Warranty expiry (YYYY-MM-DD) *" colors={colors}>
          <TextInput
            value={warrantyExpiry}
            onChangeText={setWarrantyExpiry}
            placeholder="2027-01-15"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
            autoCapitalize="none"
          />
        </Field>
      </Section>

      <Section label="Notes" colors={colors}>
        <Field label="Notes (Optional)" colors={colors}>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Anything worth remembering (optional)"
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
            style={[
              inputStyle,
              { minHeight: 96, textAlignVertical: "top", paddingTop: 12 },
            ]}
          />
        </Field>
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
            backgroundColor: colors.primary,
            borderRadius: 50,
            opacity: submitting ? 0.7 : pressed ? 0.9 : 1,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 10,
            elevation: 4,
          },
        ]}
      >
        <Check size={18} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={[styles.submitLabel, { color: "#FFFFFF", letterSpacing: 0.8, textTransform: "uppercase" }]}>
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
  dropdownTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dropdownIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dropdownValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  dropdownMenu: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownOptionText: {
    fontSize: 14,
  },
});
