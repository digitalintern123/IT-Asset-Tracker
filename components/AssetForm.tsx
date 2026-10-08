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
  ASSET_CLASSES,
  CRITICALITY_LEVELS,
  OPERATIONAL_STATUSES,
  VERTICALS,
  getCategoryIcon,
} from "@/constants/categories";
import { parseLocation } from "@/lib/location";
import { canTransitionStatus } from "@/lib/statusModel";
import { useAuth } from "@/contexts/AuthContext";
import { LocationPicker } from "@/components/LocationPicker";
import { PeoplePicker } from "@/components/PeoplePicker";
import { SelectField } from "@/components/SelectField";
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
  const [make, setMake] = useState(initial?.make ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(initial?.serialNumber ?? "");
  const [status, setStatus] = useState<AssetStatus>(initial?.status ?? "new");
  // A new entry is either a New Device or issued straight away. Once a device
  // has left "New Device" it never goes back (returned devices are "Available").
  // Editing: only the moves the status rules allow (Out of Order is final
  // except for IT Administrators).
  const { user } = useAuth();
  const statusOptions: AssetStatus[] = !initial
    ? ["new", "in_use"]
    : STATUSES.filter(
        (st) =>
          canTransitionStatus(initial.status, st) ||
          (initial.status === "retired" && user?.role === "admin" && st !== "new"),
      );
  const [assignee, setAssignee] = useState(initial?.assignee ?? "");
  const [assigneeEmail, setAssigneeEmail] = useState(initialAssigneeEmail ?? "");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [department, setDepartment] = useState(initial?.department ?? "");
  const [custodianship, setCustodianship] = useState(initial?.custodianship ?? "");
  const [criticality, setCriticality] = useState<string>(initial?.criticality ?? "");
  const [operationalStatus, setOperationalStatus] = useState<string>(
    initial?.operationalStatus ?? (initial ? "" : "Operational"),
  );
  const [assetClass, setAssetClass] = useState<string>(initial?.assetClass ?? (initial ? "" : "Hardware"));
  const [accessories, setAccessories] = useState(initial?.accessories ?? "");
  const [vertical, setVertical] = useState<string>(
    (VERTICALS as readonly string[]).includes(initial?.vertical ?? "") ? initial!.vertical! : "",
  );
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
      setError("Host Name is required *");
      return;
    }
    if (!make.trim()) {
      setError("Make is required (e.g. Dell, HP, Apple) *");
      return;
    }
    if (!model.trim()) {
      setError("Model is required (e.g. Latitude 5440) *");
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
    // 7. Location site (DEL/HYD/GOA/BUG/NAG) is mandatory
    if (!parseLocation(location).site) {
      setError("Please select a Location (DEL, HYD, GOA, BUG or NAG) *");
      return;
    }
    // 7b. Vertical (company) is mandatory
    if (!vertical) {
      setError("Please select the Vertical (company) *");
      return;
    }
    // 8. Inventory sheet fields
    if (!department.trim()) {
      setError("Department is required *");
      return;
    }
    if (!criticality) {
      setError("Please select the Criticality / Asset valuation *");
      return;
    }
    if (!operationalStatus) {
      setError("Please select the Operational status *");
      return;
    }
    if (!assetClass) {
      setError("Please select the Asset categorisation (Hardware / Software / Service) *");
      return;
    }
    // 9. Purchase details are optional (older devices often have none),
    //    but must be well-formed when given.
    // A real calendar date, not just the YYYY-MM-DD shape (rejects 2025-13-45).
    const isValidDate = (v: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const d = new Date(`${v}T00:00:00Z`);
      return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    };
    if (purchaseDate.trim() && !isValidDate(purchaseDate.trim())) {
      setError("Purchase date must be YYYY-MM-DD *");
      return;
    }
    // Digits with optional thousands separators and decimals only: "-500" or
    // "abc" are errors, not 500 / 0.
    const priceText = purchasePriceText.trim().replace(/^₹\s*/, "");
    if (priceText && !/^[0-9][0-9,]*(\.[0-9]+)?$/.test(priceText)) {
      setError("Purchase price must be a number (₹ INR) *");
      return;
    }
    const price = priceText ? parseFloat(priceText.replace(/,/g, "")) : 0;
    if (!Number.isFinite(price) || price < 0) {
      setError("Purchase price must be a number (₹ INR) *");
      return;
    }
    if (warrantyExpiry.trim() && !isValidDate(warrantyExpiry.trim())) {
      setError("Warranty expiry must be YYYY-MM-DD *");
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
        make: make.trim(),
        model: model.trim(),
        category: finalCategory,
        serialNumber: serialNumber.trim(),
        status,
        // Returned / Out of Order / New devices have no user. Maintenance
        // keeps the current holder.
        assignee: status === "in_use" || status === "maintenance" ? assignee.trim() : "",
        location: location.trim(),
        vertical,
        department: department.trim(),
        custodianship: custodianship.trim(),
        criticality,
        operationalStatus,
        assetClass,
        accessories: accessories.trim(),
        purchaseDate: purchaseDate.trim(),
        purchasePrice: price,
        warrantyExpiry: warrantyExpiry.trim() || null,
        notes: notes.trim(),
      },
      assigneeEmail: status === "in_use" || status === "maintenance" ? assigneeEmail.trim() : "",
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
        <Field label="Host Name *" colors={colors}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. ENC-DEL-LT-014"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="characters"
            style={inputStyle}
          />
        </Field>
        <Field label="Make *" colors={colors}>
          <TextInput
            value={make}
            onChangeText={setMake}
            placeholder="e.g. Dell"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
        <Field label="Model *" colors={colors}>
          <TextInput
            value={model}
            onChangeText={setModel}
            placeholder="e.g. Latitude 5440"
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
        <LocationPicker value={location} onChange={setLocation} />
        <SelectField
          label="Vertical *"
          value={vertical}
          options={VERTICALS.map((v) => ({ value: v, label: v }))}
          onChange={setVertical}
          placeholder="Select company"
        />
        <Field label="Department *" colors={colors}>
          <TextInput
            value={department}
            onChangeText={setDepartment}
            placeholder="e.g. Housekeeping"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
        <Field label="Asset custodianship" colors={colors}>
          <TextInput
            value={custodianship}
            onChangeText={setCustodianship}
            placeholder="e.g. Encalm IT Team & Ops Team"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </Field>
        <SelectField
          label="Criticality / Asset valuation *"
          value={criticality}
          options={CRITICALITY_LEVELS.map((v) => ({ value: v, label: v }))}
          onChange={setCriticality}
          placeholder="Select criticality"
        />
        <SelectField
          label="Operational status *"
          value={operationalStatus}
          options={OPERATIONAL_STATUSES.map((v) => ({ value: v, label: v }))}
          onChange={setOperationalStatus}
          placeholder="Operational / Non Operational"
        />
        <SelectField
          label="Asset categorisation *"
          value={assetClass}
          options={ASSET_CLASSES.map((v) => ({ value: v, label: v }))}
          onChange={setAssetClass}
          placeholder="Hardware / Software / Service"
        />
        <Field label="Accessories" colors={colors}>
          <TextInput
            value={accessories}
            onChangeText={setAccessories}
            placeholder="e.g. Power Cord, Bag"
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
