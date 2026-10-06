import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useITAM } from "@/contexts/ITAMContext";
import { useColors } from "@/hooks/useColors";
import { formatRupees } from "@/lib/currency";
import { calculateWarrantyStatus } from "@/lib/warranty";
import type { Employee, EmployeeDepartment } from "@/types/itam";

type OperationSegment =
  | "directory"
  | "custody"
  | "lifecycle"
  | "maintenance"
  | "warranty"
  | "handovers";

const DEPARTMENTS: ("All" | EmployeeDepartment)[] = [
  "All",
  "Lounge Operations",
  "Terminal Operations",
  "Guest Relations",
  "IT Support",
  "Executive Office",
  "Food & Beverage",
];

export default function OperationsScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const router = useRouter();
  const { assets } = useAssets();
  const { user } = useAuth();
  const {
    employees,
    maintenance,
    handovers,
    getEmployeeAssets,
    refreshDirectoryFromGraph,
  } = useITAM();

  const [segment, setSegment] = useState<OperationSegment>("directory");
  const [search, setSearch] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("All");
  const [expandedEmployeeId, setExpandedEmployeeId] = useState<string | null>(null);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => {
      const matchSearch =
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.email.toLowerCase().includes(search.toLowerCase()) ||
        e.designation.toLowerCase().includes(search.toLowerCase()) ||
        e.location.toLowerCase().includes(search.toLowerCase());
      const matchDept = selectedDept === "All" || e.department === selectedDept;
      return matchSearch && matchDept;
    });
  }, [employees, search, selectedDept]);

  // Warranty metrics
  const warrantyAssets = useMemo(() => {
    return assets.map((a) => ({
      asset: a,
      warranty: calculateWarrantyStatus(a.warrantyExpiry),
    }));
  }, [assets]);

  const expiringWarranties = useMemo(
    () => warrantyAssets.filter((w) => w.warranty.status === "expiring_soon"),
    [warrantyAssets]
  );
  const expiredWarranties = useMemo(
    () => warrantyAssets.filter((w) => w.warranty.status === "expired" && w.asset.warrantyExpiry),
    [warrantyAssets]
  );

  // Maintenance metrics
  const activeMaintenanceJobs = useMemo(
    () => maintenance.filter((m) => m.status === "in_progress" || m.status === "scheduled"),
    [maintenance]
  );
  const totalMaintenanceCost = useMemo(
    () => maintenance.reduce((sum, m) => sum + (m.cost || 0), 0),
    [maintenance]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ── Top Header ────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 16 : 8),
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.screenTitle, { color: colors.foreground }]}>
              ITAM Operations
            </Text>
            <Text style={[styles.screenSubtitle, { color: colors.mutedForeground }]}>
              Employee Directory, Custody, Maintenance & Lifecycle
            </Text>
          </View>

          {user?.permissions?.canEditAsset && (
            <Pressable
              onPress={() => router.push("/operations/action?mode=assign")}
              style={({ pressed }) => [
                styles.quickActionBtn,
                { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Feather name="plus" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={styles.quickActionBtnText}>Quick Action</Text>
            </Pressable>
          )}
        </View>

        {/* ── Segmented Control Pills ────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.segmentsScroll}
        >
          <Pressable
            onPress={() => setSegment("directory")}
            style={[
              styles.segmentPill,
              segment === "directory" && { backgroundColor: colors.primary },
            ]}
          >
            <Feather
              name="users"
              size={14}
              color={segment === "directory" ? "#FFFFFF" : colors.mutedForeground}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === "directory" ? "#FFFFFF" : colors.mutedForeground },
              ]}
            >
              Directory ({employees.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSegment("custody")}
            style={[
              styles.segmentPill,
              segment === "custody" && { backgroundColor: colors.primary },
            ]}
          >
            <Feather
              name="repeat"
              size={14}
              color={segment === "custody" ? "#FFFFFF" : colors.mutedForeground}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === "custody" ? "#FFFFFF" : colors.mutedForeground },
              ]}
            >
              Custody & Transfer
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSegment("lifecycle")}
            style={[
              styles.segmentPill,
              segment === "lifecycle" && { backgroundColor: colors.primary },
            ]}
          >
            <Feather
              name="briefcase"
              size={14}
              color={segment === "lifecycle" ? "#FFFFFF" : colors.mutedForeground}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === "lifecycle" ? "#FFFFFF" : colors.mutedForeground },
              ]}
            >
              Onboard & Offboard
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSegment("maintenance")}
            style={[
              styles.segmentPill,
              segment === "maintenance" && { backgroundColor: colors.primary },
            ]}
          >
            <Feather
              name="tool"
              size={14}
              color={segment === "maintenance" ? "#FFFFFF" : colors.mutedForeground}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === "maintenance" ? "#FFFFFF" : colors.mutedForeground },
              ]}
            >
              Maintenance ({activeMaintenanceJobs.length})
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSegment("warranty")}
            style={[
              styles.segmentPill,
              segment === "warranty" && { backgroundColor: colors.primary },
            ]}
          >
            <Feather
              name="shield"
              size={14}
              color={segment === "warranty" ? "#FFFFFF" : colors.mutedForeground}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === "warranty" ? "#FFFFFF" : colors.mutedForeground },
              ]}
            >
              Warranty ({expiringWarranties.length} alerts)
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSegment("handovers")}
            style={[
              styles.segmentPill,
              segment === "handovers" && { backgroundColor: colors.primary },
            ]}
          >
            <Feather
              name="file-text"
              size={14}
              color={segment === "handovers" ? "#FFFFFF" : colors.mutedForeground}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.segmentText,
                { color: segment === "handovers" ? "#FFFFFF" : colors.mutedForeground },
              ]}
            >
              Slips ({handovers.length})
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* ── Main Content Area ─────────────────────────────────── */}
      <View style={styles.body}>
        {/* ── 1. EMPLOYEE DIRECTORY SEGMENT ────────────────── */}
        {segment === "directory" && (
          <View style={{ flex: 1 }}>
            {/* Search and Dept Filter */}
            <View style={styles.filterSection}>
              <View
                style={[
                  styles.searchBar,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  placeholder="Search staff by name, email, or designation..."
                  placeholderTextColor={colors.mutedForeground}
                  value={search}
                  onChangeText={setSearch}
                  style={[styles.searchInput, { color: colors.foreground }]}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch("")} hitSlop={8}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </Pressable>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.deptScroll}
              >
                {DEPARTMENTS.map((dept) => (
                  <Pressable
                    key={dept}
                    onPress={() => setSelectedDept(dept)}
                    style={[
                      styles.deptBadge,
                      {
                        backgroundColor:
                          selectedDept === dept ? colors.primary : colors.secondary,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.deptBadgeText,
                        {
                          color: selectedDept === dept ? "#FFFFFF" : colors.foreground,
                        },
                      ]}
                    >
                      {dept}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Employee Cards List */}
            <FlatList
              data={filteredEmployees}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
              renderItem={({ item }) => {
                const heldAssets = getEmployeeAssets(item.id);
                const isExpanded = expandedEmployeeId === item.id;
                const initials = item.name
                  .split(" ")
                  .map((p) => p[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase();

                return (
                  <View
                    style={[
                      styles.employeeCard,
                      { backgroundColor: colors.card, borderColor: colors.border },
                    ]}
                  >
                    <View style={styles.employeeCardHeader}>
                      <View
                        style={[
                          styles.avatarBox,
                          { backgroundColor: colors.primary + "1A" },
                        ]}
                      >
                        <Text style={[styles.avatarText, { color: colors.primary }]}>
                          {initials}
                        </Text>
                      </View>

                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.empTitleRow}>
                          <Text style={[styles.empName, { color: colors.foreground }]}>
                            {item.name}
                          </Text>
                          <View
                            style={[
                              styles.assetCountBadge,
                              {
                                backgroundColor:
                                  heldAssets.length > 0
                                    ? colors.primary + "20"
                                    : colors.secondary,
                              },
                            ]}
                          >
                            <Feather
                              name="box"
                              size={12}
                              color={
                                heldAssets.length > 0
                                  ? colors.primary
                                  : colors.mutedForeground
                              }
                              style={{ marginRight: 4 }}
                            />
                            <Text
                              style={[
                                styles.assetCountText,
                                {
                                  color:
                                    heldAssets.length > 0
                                      ? colors.primary
                                      : colors.mutedForeground,
                                },
                              ]}
                            >
                              {heldAssets.length} {heldAssets.length === 1 ? "Asset" : "Assets"}
                            </Text>
                          </View>
                        </View>

                        <Text style={[styles.empDesignation, { color: colors.mutedForeground }]}>
                          {item.designation} • {item.department}
                        </Text>
                        <Text style={[styles.empContact, { color: colors.mutedForeground }]}>
                          {item.email} {item.phone ? `• ${item.phone}` : ""}
                        </Text>
                        <Text style={[styles.empLocation, { color: colors.mutedForeground }]}>
                          📍 {item.location}
                        </Text>
                      </View>
                    </View>

                    {/* Actions and Expandable Held Assets */}
                    <View
                      style={[
                        styles.empCardFooter,
                        { borderTopColor: colors.border },
                      ]}
                    >
                      <Pressable
                        onPress={() =>
                          setExpandedEmployeeId(isExpanded ? null : item.id)
                        }
                        style={styles.expandBtn}
                      >
                        <Text style={[styles.expandBtnText, { color: colors.primary }]}>
                          {isExpanded
                            ? "Hide assigned assets"
                            : `View assigned assets (${heldAssets.length})`}
                        </Text>
                        <Feather
                          name={isExpanded ? "chevron-up" : "chevron-down"}
                          size={16}
                          color={colors.primary}
                        />
                      </Pressable>

                      <View style={styles.empActionGroup}>
                        <Pressable
                          onPress={() =>
                            router.push(
                              `/operations/action?mode=assign&employeeId=${encodeURIComponent(
                                item.id
                              )}`
                            )
                          }
                          style={[
                            styles.empActionPill,
                            { backgroundColor: colors.secondary },
                          ]}
                        >
                          <Feather name="plus-circle" size={13} color={colors.foreground} />
                          <Text style={[styles.empActionPillText, { color: colors.foreground }]}>
                            Assign
                          </Text>
                        </Pressable>

                        {heldAssets.length > 0 && (
                          <Pressable
                            onPress={() =>
                              router.push(
                                `/operations/offboarding?employeeId=${encodeURIComponent(
                                  item.id
                                )}`
                              )
                            }
                            style={[
                              styles.empActionPill,
                              { backgroundColor: colors.destructive + "15" },
                            ]}
                          >
                            <Feather name="log-out" size={13} color={colors.destructive} />
                            <Text
                              style={[
                                styles.empActionPillText,
                                { color: colors.destructive },
                              ]}
                            >
                              Offboard
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>

                    {/* Expanded Held Assets List */}
                    {isExpanded && (
                      <View
                        style={[
                          styles.heldAssetsBox,
                          { backgroundColor: colors.secondary, borderColor: colors.border },
                        ]}
                      >
                        {heldAssets.length === 0 ? (
                          <Text style={[styles.noHeldText, { color: colors.mutedForeground }]}>
                            No assets currently assigned to this employee.
                          </Text>
                        ) : (
                          heldAssets.map((asset) => (
                            <Pressable
                              key={asset.id}
                              onPress={() => router.push(`/asset/${asset.id}`)}
                              style={[
                                styles.heldAssetItem,
                                { borderBottomColor: colors.border },
                              ]}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.heldAssetName, { color: colors.foreground }]}>
                                  {asset.name}
                                </Text>
                                <Text style={[styles.heldAssetSerial, { color: colors.mutedForeground }]}>
                                  {asset.id} • S/N: {asset.serialNumber} • {asset.category}
                                </Text>
                              </View>
                              <Feather name="arrow-right" size={16} color={colors.mutedForeground} />
                            </Pressable>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          </View>
        )}

        {/* ── 2. CUSTODY & TRANSFERS SEGMENT ────────────────── */}
        {segment === "custody" && (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          >
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              Fast Custody Actions
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Dispense from inventory, receive returns, or transfer devices between airport staff.
            </Text>

            <View style={styles.actionGrid}>
              <Pressable
                onPress={() => router.push("/operations/action?mode=assign")}
                style={[
                  styles.actionCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: "#3B82F61A" }]}>
                  <Feather name="log-out" size={24} color="#3B82F6" />
                </View>
                <Text style={[styles.actionCardTitle, { color: colors.foreground }]}>
                  Check-Out (Assign)
                </Text>
                <Text style={[styles.actionCardDesc, { color: colors.mutedForeground }]}>
                  Issue available asset to an employee with condition log and digital slip.
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/operations/action?mode=checkin")}
                style={[
                  styles.actionCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: "#10B9811A" }]}>
                  <Feather name="log-in" size={24} color="#10B981" />
                </View>
                <Text style={[styles.actionCardTitle, { color: colors.foreground }]}>
                  Check-In (Return)
                </Text>
                <Text style={[styles.actionCardDesc, { color: colors.mutedForeground }]}>
                  Receive assigned asset back to central stock or route damaged unit to repairs.
                </Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/operations/action?mode=transfer")}
                style={[
                  styles.actionCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.actionIconWrap, { backgroundColor: "#8B5CF61A" }]}>
                  <Feather name="repeat" size={24} color="#8B5CF6" />
                </View>
                <Text style={[styles.actionCardTitle, { color: colors.foreground }]}>
                  Direct Transfer
                </Text>
                <Text style={[styles.actionCardDesc, { color: colors.mutedForeground }]}>
                  Transfer device directly from Staff A to Staff B without central storage return.
                </Text>
              </Pressable>
            </View>

            {/* Quick Summary of Active Holdings */}
            <View style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statBoxTitle, { color: colors.foreground }]}>
                Custody Fleet Overview
              </Text>
              <View style={styles.statBoxRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: colors.primary }]}>
                    {assets.filter((a) => a.status === "in_use").length}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    In Active Use
                  </Text>
                </View>

                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: "#10B981" }]}>
                    {assets.filter((a) => a.status === "available").length}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    Available in Stock
                  </Text>
                </View>

                <View style={styles.statItem}>
                  <Text style={[styles.statNumber, { color: "#F59E0B" }]}>
                    {assets.filter((a) => a.status === "maintenance").length}
                  </Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                    In Maintenance
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── 3. LIFECYCLE (ONBOARD / OFFBOARD) SEGMENT ─────── */}
        {segment === "lifecycle" && (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          >
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              Staff Lifecycle Workflows
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Automated multi-asset bundle provisioning and structured clearance retrieval.
            </Text>

            <View style={{ gap: 16 }}>
              {/* Onboarding Card */}
              <View
                style={[
                  styles.lifecycleCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.lifecycleIcon, { backgroundColor: "#10B9811A" }]}>
                  <Feather name="user-plus" size={28} color="#10B981" />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={[styles.lifecycleTitle, { color: colors.foreground }]}>
                    New Hire Onboarding Provisioning
                  </Text>
                  <Text style={[styles.lifecycleDesc, { color: colors.mutedForeground }]}>
                    Issue tailored hardware bundles (Lounge Ops, VIP Host, IT Support) to incoming personnel with a unified digital handover slip.
                  </Text>
                  <Pressable
                    onPress={() => router.push("/operations/onboarding")}
                    style={({ pressed }) => [
                      styles.lifecycleBtn,
                      { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={styles.lifecycleBtnText}>Launch Onboarding Wizard</Text>
                    <Feather name="arrow-right" size={16} color="#FFFFFF" style={{ marginLeft: 6 }} />
                  </Pressable>
                </View>
              </View>

              {/* Offboarding Card */}
              <View
                style={[
                  styles.lifecycleCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={[styles.lifecycleIcon, { backgroundColor: "#EF44441A" }]}>
                  <Feather name="user-minus" size={28} color="#EF4444" />
                </View>
                <View style={{ flex: 1, marginLeft: 16 }}>
                  <Text style={[styles.lifecycleTitle, { color: colors.foreground }]}>
                    Departing Employee Offboarding
                  </Text>
                  <Text style={[styles.lifecycleDesc, { color: colors.mutedForeground }]}>
                    Aggregate all active devices, inspect return condition & accessories, wipe/route units, and issue an official IT Clearance Certificate.
                  </Text>
                  <Pressable
                    onPress={() => router.push("/operations/offboarding")}
                    style={({ pressed }) => [
                      styles.lifecycleBtn,
                      { backgroundColor: colors.secondary, opacity: pressed ? 0.85 : 1 },
                    ]}
                  >
                    <Text style={[styles.lifecycleBtnText, { color: colors.foreground }]}>
                      Launch Offboarding Wizard
                    </Text>
                    <Feather name="arrow-right" size={16} color={colors.foreground} style={{ marginLeft: 6 }} />
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        )}

        {/* ── 4. MAINTENANCE SEGMENT ────────────────────────── */}
        {segment === "maintenance" && (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          >
            {/* Top KPI Cards */}
            <View style={styles.statBoxRow}>
              <View
                style={[
                  styles.maintKpiCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statNumber, { color: "#F59E0B" }]}>
                  {activeMaintenanceJobs.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                  Active Service Jobs
                </Text>
              </View>

              <View
                style={[
                  styles.maintKpiCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statNumber, { color: colors.primary }]}>
                  {formatRupees(totalMaintenanceCost)}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                  Total Repair Spend
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
                Service & Repair Logs
              </Text>
              <Pressable
                onPress={() => router.push("/operations/action?mode=maintenance")}
                style={[styles.smallBtn, { backgroundColor: colors.primary }]}
              >
                <Feather name="plus" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.smallBtnText}>Log Service</Text>
              </Pressable>
            </View>

            {maintenance.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Feather name="tool" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyBoxText, { color: colors.mutedForeground }]}>
                  No maintenance records logged yet.
                </Text>
              </View>
            ) : (
              maintenance.map((m) => (
                <View
                  key={m.id}
                  style={[
                    styles.maintCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.maintCardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.maintAssetName, { color: colors.foreground }]}>
                        {m.assetName}
                      </Text>
                      <Text style={[styles.maintVendor, { color: colors.mutedForeground }]}>
                        Vendor: {m.vendor} • {m.serviceType.replace("_", " ")}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.maintStatusPill,
                        {
                          backgroundColor:
                            m.status === "completed"
                              ? "#10B9811A"
                              : m.status === "in_progress"
                              ? "#F59E0B1A"
                              : colors.secondary,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.maintStatusText,
                          {
                            color:
                              m.status === "completed"
                                ? "#10B981"
                                : m.status === "in_progress"
                                ? "#F59E0B"
                                : colors.mutedForeground,
                          },
                        ]}
                      >
                        {m.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.maintDesc, { color: colors.foreground }]}>
                    {m.issueDescription}
                  </Text>

                  {m.resolutionNotes && (
                    <Text style={[styles.maintResolution, { color: colors.mutedForeground }]}>
                      Resolution: {m.resolutionNotes}
                    </Text>
                  )}

                  <View
                    style={[
                      styles.maintFooter,
                      { borderTopColor: colors.border },
                    ]}
                  >
                    <Text style={[styles.maintDate, { color: colors.mutedForeground }]}>
                      Scheduled: {m.scheduledDate} {m.completedDate ? `• Closed: ${m.completedDate}` : ""}
                    </Text>
                    <Text style={[styles.maintCost, { color: colors.primary }]}>
                      Cost: {formatRupees(m.cost)}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        )}

        {/* ── 5. WARRANTY RADAR SEGMENT ─────────────────────── */}
        {segment === "warranty" && (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          >
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              Warranty Expiration Radar
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Monitor AMC contracts, OEM AppleCare/Dell ProSupport, and upcoming expirations.
            </Text>

            {/* Radar Stat Strip */}
            <View style={styles.statBoxRow}>
              <View
                style={[
                  styles.maintKpiCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statNumber, { color: "#F59E0B" }]}>
                  {expiringWarranties.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                  Expiring in ≤30 Days
                </Text>
              </View>

              <View
                style={[
                  styles.maintKpiCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.statNumber, { color: colors.destructive }]}>
                  {expiredWarranties.length}
                </Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
                  Warranty Expired
                </Text>
              </View>
            </View>

            {/* Expiry Alerts List */}
            <Text style={[styles.subSectionTitle, { color: colors.foreground, marginTop: 16 }]}>
              Urgent Attention Required
            </Text>

            {expiringWarranties.length === 0 && expiredWarranties.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Feather name="shield" size={32} color="#10B981" />
                <Text style={[styles.emptyBoxText, { color: colors.mutedForeground, marginTop: 8 }]}>
                  All enterprise assets have valid, active warranty coverage!
                </Text>
              </View>
            ) : (
              [...expiringWarranties, ...expiredWarranties].map(({ asset, warranty }) => (
                <Pressable
                  key={asset.id}
                  onPress={() => router.push(`/asset/${asset.id}`)}
                  style={[
                    styles.warrantyCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={styles.warrantyCardTop}>
                      <Text style={[styles.warrantyAssetName, { color: colors.foreground }]}>
                        {asset.name}
                      </Text>
                      <View
                        style={[
                          styles.warrantyPill,
                          {
                            backgroundColor:
                              warranty.status === "expiring_soon"
                                ? "#F59E0B1A"
                                : "#EF44441A",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.warrantyPillText,
                            {
                              color:
                                warranty.status === "expiring_soon"
                                  ? "#F59E0B"
                                  : "#EF4444",
                            },
                          ]}
                        >
                          {warranty.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.warrantyDetailsText, { color: colors.mutedForeground }]}>
                      {asset.id} • S/N: {asset.serialNumber} • Holder: {asset.assignee || "In Stock"}
                    </Text>
                    <Text style={[styles.warrantyExpiryDate, { color: colors.mutedForeground }]}>
                      Expiry Date: {asset.warrantyExpiry}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.mutedForeground} style={{ marginLeft: 8 }} />
                </Pressable>
              ))
            )}
          </ScrollView>
        )}

        {/* ── 6. HANDOVER SLIPS ARCHIVE SEGMENT ─────────────── */}
        {segment === "handovers" && (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          >
            <Text style={[styles.sectionHeading, { color: colors.foreground }]}>
              Signed Digital Handover Slips
            </Text>
            <Text style={[styles.sectionSub, { color: colors.mutedForeground }]}>
              Verified custody slips, equipment receipts, and digital signatures.
            </Text>

            {handovers.length === 0 ? (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Feather name="file-text" size={32} color={colors.mutedForeground} />
                <Text style={[styles.emptyBoxText, { color: colors.mutedForeground, marginTop: 8 }]}>
                  No handover slips generated yet. Slips are automatically created on assignment, transfer, or clearance.
                </Text>
              </View>
            ) : (
              handovers.map((slip) => (
                <Pressable
                  key={slip.id}
                  onPress={() => router.push(`/operations/handover?id=${slip.id}`)}
                  style={[
                    styles.slipCard,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <View style={styles.slipCardHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.slipIdText, { color: colors.primary }]}>
                        {slip.id}
                      </Text>
                      <Text style={[styles.slipTypeText, { color: colors.foreground }]}>
                        {slip.type.toUpperCase()} • {slip.toPerson}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.signBadge,
                        {
                          backgroundColor: slip.signatureSvgData
                            ? "#10B9811A"
                            : "#F59E0B1A",
                        },
                      ]}
                    >
                      <Feather
                        name={slip.signatureSvgData ? "check-circle" : "clock"}
                        size={12}
                        color={slip.signatureSvgData ? "#10B981" : "#F59E0B"}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.signBadgeText,
                          {
                            color: slip.signatureSvgData ? "#10B981" : "#F59E0B",
                          },
                        ]}
                      >
                        {slip.signatureSvgData ? "Signed" : "Pending Sign"}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.slipDetails, { color: colors.mutedForeground }]}>
                    {slip.assetDetails.length} {slip.assetDetails.length === 1 ? "Asset" : "Assets"} ({slip.assetDetails.map((a) => a.name).join(", ")})
                  </Text>
                  <Text style={[styles.slipDate, { color: colors.mutedForeground }]}>
                    Issued on {new Date(slip.issuedAt).toLocaleDateString("en-IN")} by {slip.issuedBy}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  screenTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  screenSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  quickActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  quickActionBtnText: {
    color: "#FFFFFF",
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  segmentsScroll: {
    gap: 8,
    paddingVertical: 4,
  },
  segmentPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  segmentText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  body: {
    flex: 1,
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  deptScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  deptBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  deptBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  employeeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  employeeCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
  empTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  empName: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  assetCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  assetCountText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  empDesignation: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  empContact: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  empLocation: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  empCardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 10,
  },
  expandBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  expandBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginRight: 4,
  },
  empActionGroup: {
    flexDirection: "row",
    gap: 8,
  },
  empActionPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    gap: 4,
  },
  empActionPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  heldAssetsBox: {
    marginTop: 10,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
  },
  noHeldText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    padding: 6,
    textAlign: "center",
  },
  heldAssetItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heldAssetName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  heldAssetSerial: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  sectionSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginBottom: 16,
  },
  actionGrid: {
    gap: 12,
    marginBottom: 20,
  },
  actionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  actionCardTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  actionCardDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  statBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  statBoxTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  statBoxRow: {
    flexDirection: "row",
    gap: 12,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
  },
  statNumber: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    textAlign: "center",
  },
  lifecycleCard: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  lifecycleIcon: {
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  lifecycleTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  lifecycleDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 18,
  },
  lifecycleBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  lifecycleBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  maintKpiCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    alignItems: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 20,
    marginBottom: 12,
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  smallBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  maintCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  maintCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  maintAssetName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  maintVendor: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  maintStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  maintStatusText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  maintDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    lineHeight: 18,
  },
  maintResolution: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    fontStyle: "italic",
  },
  maintFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    paddingTop: 8,
  },
  maintDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  maintCost: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  subSectionTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  warrantyCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  warrantyCardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  warrantyAssetName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  warrantyPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  warrantyPillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  warrantyDetailsText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  warrantyExpiryDate: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  slipCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  slipCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  slipIdText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  slipTypeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginTop: 2,
  },
  signBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  signBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  slipDetails: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
  },
  slipDate: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  emptyBox: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 12,
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  emptyBoxText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    textAlign: "center",
  },
});
