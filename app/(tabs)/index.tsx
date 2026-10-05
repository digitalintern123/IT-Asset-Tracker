import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
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

import { AssetCard } from "@/components/AssetCard";
import { BrandHeader } from "@/components/BrandHeader";
import { EmptyState } from "@/components/EmptyState";
import { STATUSES, STATUS_LABELS } from "@/constants/categories";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import type { AssetStatus } from "@/types/asset";

type Filter = "all" | AssetStatus;

export default function AssetsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { assets, loaded } = useAssets();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => {
      if (filter !== "all" && a.status !== filter) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        a.assignee.toLowerCase().includes(q) ||
        a.location.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
      );
    });
  }, [assets, query, filter]);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: assets.length },
    ...STATUSES.map((s) => ({
      key: s as Filter,
      label: STATUS_LABELS[s],
      count: assets.filter((a) => a.status === s).length,
    })),
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <BrandHeader
        kicker="Inventory"
        title="Assets"
        subtitle={`${assets.length} tracked across the organization`}
        right={
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Pressable
              onPress={() => {
                if (Platform.OS !== "web") {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.push("/scan");
              }}
              style={({ pressed }) => [
                styles.iconBtn,
                {
                  backgroundColor: "rgba(255,255,255,0.10)",
                  borderColor: "rgba(255,255,255,0.18)",
                  opacity: pressed ? 0.8 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              <Feather name="maximize" size={18} color="#FFFFFF" />
            </Pressable>
            {user?.permissions?.canCreateAsset ? (
              <Pressable
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }
                  router.push("/asset/new");
                }}
                style={({ pressed }) => [
                  styles.iconBtn,
                  {
                    backgroundColor: colors.brandGold,
                    borderColor: colors.brandGold,
                    opacity: pressed ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                  },
                ]}
              >
                <Feather name="plus" size={20} color={colors.brandNavyDeep} />
              </Pressable>
            ) : null}
          </View>
        }
      />

      <View style={styles.searchWrap}>
        <View
          style={[
            styles.search,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name, serial, assignee…"
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {filters.map((f) => {
            const active = f.key === filter;
            return (
              <Pressable
                key={f.key}
                onPress={() => {
                  if (Platform.OS !== "web") {
                    Haptics.selectionAsync();
                  }
                  setFilter(f.key);
                }}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: active ? colors.brandNavy : colors.card,
                    borderColor: active ? colors.brandNavy : colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterLabel,
                    {
                      color: active ? colors.brandGoldSoft : colors.foreground,
                    },
                  ]}
                >
                  {f.label}
                </Text>
                <View
                  style={[
                    styles.countPill,
                    {
                      backgroundColor: active
                        ? "rgba(205,164,94,0.20)"
                        : colors.secondary,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.countText,
                      {
                        color: active
                          ? colors.brandGoldSoft
                          : colors.mutedForeground,
                      },
                    ]}
                  >
                    {f.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AssetCard asset={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        contentContainerStyle={{
          padding: 20,
          paddingTop: 4,
          paddingBottom: insets.bottom + 100,
        }}
        ListEmptyComponent={
          loaded ? (
            <EmptyState
              icon={query || filter !== "all" ? "search" : "package"}
              title={
                query || filter !== "all" ? "No matches" : "No assets yet"
              }
              message={
                query || filter !== "all"
                  ? "Try a different search or filter."
                  : "Tap the + button to add your first asset."
              }
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  searchWrap: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingVertical: 0,
  },
  filtersRow: {
    gap: 8,
    paddingVertical: 2,
    paddingRight: 16,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  countPill: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 999,
    minWidth: 20,
    alignItems: "center",
  },
  countText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
});
