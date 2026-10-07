import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandHeader } from "@/components/BrandHeader";
import { EmptyState } from "@/components/EmptyState";
import { FileText, LucideIcon, Package, TrendingUp } from "@/components/LucideIcon";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import {
  STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
  getCategoryIcon,
} from "@/constants/categories";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { useResponsive } from "@/hooks/useResponsive";
import { formatRupees } from "@/lib/currency";
import type { AssetStatus } from "@/types/asset";

function formatMoney(n: number): string {
  return formatRupees(n, { compact: true });
}

function daysUntil(dateStr: string): number {
  const t = new Date(dateStr).getTime();
  return Math.floor((t - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { assets } = useAssets();

  const totalValue = useMemo(
    () => assets.reduce((s, a) => s + (a.purchasePrice || 0), 0),
    [assets],
  );

  const statusCounts = useMemo(() => {
    const counts: Record<AssetStatus, number> = {
      new: 0,
      in_use: 0,
      available: 0,
      maintenance: 0,
      retired: 0,
    };
    for (const a of assets) counts[a.status] += 1;
    return counts;
  }, [assets]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assets) {
      map.set(a.category, (map.get(a.category) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [assets]);

  const expiringSoon = useMemo(() => {
    return assets
      .filter((a) => {
        if (!a.warrantyExpiry) return false;
        const d = daysUntil(a.warrantyExpiry);
        return d >= 0 && d <= 90;
      })
      .sort(
        (a, b) =>
          daysUntil(a.warrantyExpiry!) - daysUntil(b.warrantyExpiry!),
      )
      .slice(0, 4);
  }, [assets]);

  const recent = useMemo(
    () =>
      [...assets]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 4),
    [assets],
  );

  const { isDesktop } = useResponsive();
  const total = assets.length || 1;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        showsVerticalScrollIndicator={false}
      >
        <BrandHeader
          kicker="Overview"
          title="Dashboard"
          subtitle="Live snapshot of your inventory"
        />

        <View style={styles.containerWrap}>
          <View style={isDesktop ? styles.desktopGrid : undefined}>
            <View style={isDesktop ? styles.desktopColLeft : undefined}>
              <View style={isDesktop ? styles.heroWrapDesktop : styles.heroWrap}>
                <LinearGradient
                  colors={[colors.brandGold, "#B98A45"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.hero}
                >
                  <View style={styles.heroDecorCircle} />
                  <View style={styles.heroDecorCircle2} />
                  <Text style={styles.heroLabel}>Portfolio value</Text>
                  <Text style={styles.heroValue}>{formatMoney(totalValue)}</Text>
                  <View style={styles.heroFooter}>
                    <View style={styles.heroPill}>
                      <Package size={12} color="#FFFFFF" strokeWidth={2} />
                      <Text style={styles.heroPillText}>
                        {assets.length} assets
                      </Text>
                    </View>
                    <View style={styles.heroPill}>
                      <TrendingUp size={12} color="#FFFFFF" strokeWidth={2} />
                      <Text style={styles.heroPillText}>
                        {statusCounts.in_use} in use
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>

              <View style={isDesktop ? styles.rowDesktop : styles.row}>
                <StatCard
                  label={STATUS_LABELS.new}
                  value={statusCounts.new}
                  icon="box"
                  tint={STATUS_COLORS.new.dot}
                />
                <StatCard
                  label="Available"
                  value={statusCounts.available}
                  icon="check-circle"
                  tint={STATUS_COLORS.available.dot}
                />
                <StatCard
                  label="Maintenance"
                  value={statusCounts.maintenance}
                  icon="tool"
                  tint={STATUS_COLORS.maintenance.dot}
                />
                <StatCard
                  label={STATUS_LABELS.retired}
                  value={statusCounts.retired}
                  icon="alert-triangle"
                  tint={STATUS_COLORS.retired.dot}
                />
              </View>

              {user?.role === "admin" ? (
                <Pressable
                  onPress={() => router.push("/reports")}
                  style={({ pressed }) => [
                    styles.reportsLink,
                    { borderColor: colors.border, backgroundColor: colors.card, opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <FileText size={16} color={colors.primary} strokeWidth={1.8} />
                  <Text style={[styles.reportsLinkText, { color: colors.foreground }]}>
                    Report logs — device history, approvals and CSV export
                  </Text>
                </Pressable>
              ) : null}

              <Section title="Status breakdown" colors={colors} noPadding={isDesktop}>
          <View
            style={[
              styles.barCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.barTrack}>
              {STATUSES.map((s) => {
                const pct = (statusCounts[s] / total) * 100;
                if (pct <= 0) return null;
                return (
                  <View
                    key={s}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: STATUS_COLORS[s].dot,
                    }}
                  />
                );
              })}
            </View>
            <View style={styles.legendRow}>
              {STATUSES.map((s) => (
                <View key={s} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: STATUS_COLORS[s].dot },
                    ]}
                  />
                  <Text
                    style={[
                      styles.legendLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {STATUS_LABELS[s]} · {statusCounts[s]}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Section>

        <Section title="By category" colors={colors} noPadding={isDesktop}>
          <View
            style={[
              styles.listCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {categoryCounts.length === 0 ? (
              <EmptyState
                icon="grid"
                title="No categories yet"
                message="Add an asset to see breakdowns."
              />
            ) : (
              categoryCounts.map(([cat, count], i) => {
                const max = categoryCounts[0][1];
                const pct = (count / max) * 100;
                const icon = getCategoryIcon(cat);
                return (
                  <View
                    key={cat}
                    style={[
                      styles.catRow,
                      i < categoryCounts.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.catIcon,
                        { backgroundColor: colors.secondary },
                      ]}
                    >
                      <LucideIcon name={icon} size={14} color={colors.accent} strokeWidth={1.8} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.catTopRow}>
                        <Text
                          style={[
                            styles.catName,
                            { color: colors.foreground },
                          ]}
                        >
                          {cat}
                        </Text>
                        <Text
                          style={[
                            styles.catCount,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {count}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.catBarTrack,
                          { backgroundColor: colors.muted },
                        ]}
                      >
                        <LinearGradient
                          colors={[colors.brandGold, "#B98A45"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={[styles.catBarFill, { width: `${pct}%` }]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </Section>
            </View>

            <View style={isDesktop ? styles.desktopColRight : undefined}>
              <Section
                title="Warranty expiring"
                colors={colors}
                noPadding={isDesktop}
                style={isDesktop ? { marginTop: 0 } : undefined}
              >
          <View
            style={[
              styles.listCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {expiringSoon.length === 0 ? (
              <View style={{ paddingVertical: 28 }}>
                <EmptyState
                  icon="shield"
                  title="All good"
                  message="No warranties expire in the next 90 days."
                />
              </View>
            ) : (
              expiringSoon.map((a, i) => {
                const days = daysUntil(a.warrantyExpiry!);
                return (
                  <Pressable
                    key={a.id}
                    onPress={() => router.push(`/asset/${a.id}`)}
                    style={[
                      styles.expiringRow,
                      i < expiringSoon.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.expiringName,
                          { color: colors.foreground },
                        ]}
                      >
                        {a.name}
                      </Text>
                      <Text
                        style={[
                          styles.expiringMeta,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {a.warrantyExpiry}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.daysPill,
                        {
                          backgroundColor:
                            days <= 30
                              ? colors.destructive + "1F"
                              : colors.brandGold + "26",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.daysText,
                          {
                            color:
                              days <= 30
                                ? colors.destructive
                                : "#8B6A30",
                          },
                        ]}
                      >
                        {days}d
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        </Section>

        <Section title="Recently updated" colors={colors} noPadding={isDesktop}>
          <View
            style={[
              styles.listCard,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            {recent.length === 0 ? (
              <View style={{ paddingVertical: 28 }}>
                <EmptyState
                  icon="clock"
                  title="Nothing yet"
                  message="Recently changed assets will appear here."
                />
              </View>
            ) : (
              recent.map((a, i) => (
                <Pressable
                  key={a.id}
                  onPress={() => router.push(`/asset/${a.id}`)}
                  style={[
                    styles.recentRow,
                    i < recent.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.recentName,
                        { color: colors.foreground },
                      ]}
                    >
                      {a.name}
                    </Text>
                    <Text
                      style={[
                        styles.recentMeta,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {a.assignee || a.location || "Unassigned"}
                    </Text>
                  </View>
                  <StatusBadge status={a.status} />
                </Pressable>
              ))
            )}
          </View>
        </Section>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({
  title,
  colors,
  children,
  noPadding,
  style,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
  noPadding?: boolean;
  style?: any;
}) {
  return (
    <View style={[{ marginTop: 24, gap: 10 }, !noPadding && { paddingHorizontal: 20 }, style]}>
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  containerWrap: {
    width: "100%",
    maxWidth: 1180,
    alignSelf: "center",
  },
  desktopGrid: {
    flexDirection: "row",
    gap: 24,
    paddingHorizontal: 20,
    marginTop: 20,
    alignItems: "flex-start",
  },
  desktopColLeft: {
    flex: 1.15,
  },
  desktopColRight: {
    flex: 0.85,
  },
  heroWrap: {
    paddingHorizontal: 20,
    marginTop: 18,
  },
  heroWrapDesktop: {
    paddingHorizontal: 0,
    marginTop: 0,
  },
  rowDesktop: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
  },
  hero: {
    borderRadius: 24,
    padding: 22,
    overflow: "hidden",
    position: "relative",
  },
  heroDecorCircle: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.08)",
    top: -90,
    right: -60,
  },
  heroDecorCircle2: {
    position: "absolute",
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.06)",
    bottom: -50,
    left: -30,
  },
  heroLabel: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  heroValue: {
    color: "#FFFFFF",
    fontSize: 42,
    fontFamily: "Inter_700Bold",
    marginTop: 6,
    letterSpacing: -1,
  },
  heroFooter: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
  },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  heroPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  barCard: {
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  barTrack: {
    height: 12,
    borderRadius: 6,
    overflow: "hidden",
    flexDirection: "row",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  listCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  catIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  catTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  catName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  catCount: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  catBarTrack: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  catBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  expiringRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  expiringName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  expiringMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  daysPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  daysText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  recentName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  recentMeta: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  reportsLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 12,
  },
  reportsLinkText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
});
