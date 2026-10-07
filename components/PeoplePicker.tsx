import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { Info, Search, User, X } from "@/components/LucideIcon";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { DirectoryUser, pickerModeFor, searchDirectoryUsers } from "@/lib/directory";
import { isNetworkOnline } from "@/lib/offlineQueue";

export interface PersonValue {
  name: string;
  email: string;
}

interface Props {
  value: PersonValue;
  onChange: (next: PersonValue) => void;
  nameLabel: string;
  emailLabel: string;
}

/**
 * "Assigned to" + email, picked from Azure AD. The email comes from the
 * directory and is read-only. Falls back to manual entry only when the
 * directory cannot be searched (Demo Mode, offline, permission not granted).
 */
export function PeoplePicker({ value, onChange, nameLabel, emailLabel }: Props) {
  const colors = useColors();
  const { user, getValidAccessToken } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [lastErrorStatus, setLastErrorStatus] = useState<number | null>(null);
  const [lastErrorWasNetwork, setLastErrorWasNetwork] = useState(false);
  const [editing, setEditing] = useState(!value.name);
  const abortRef = useRef<AbortController | null>(null);

  const mode = pickerModeFor({
    isDemo: user?.isDemo,
    hasToken: !!user?.accessToken && !user?.isDemo,
    online: isNetworkOnline(),
    lastErrorStatus,
    lastErrorWasNetwork,
  });

  // Debounced directory search; stale requests are aborted.
  useEffect(() => {
    if (mode !== "directory" || !editing) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const token = (await getValidAccessToken()) || user?.accessToken;
        if (!token) {
          setLastErrorStatus(401);
          return;
        }
        const found = await searchDirectoryUsers(token, q, controller.signal);
        if (!controller.signal.aborted) setResults(found);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.warn("Directory search unavailable, switching to manual entry:", err);
        if (err?.statusCode) setLastErrorStatus(err.statusCode);
        else setLastErrorWasNetwork(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, mode, editing, getValidAccessToken, user?.accessToken]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground },
  ];
  const labelStyle = [styles.label, { color: colors.foreground }];

  if (mode === "manual") {
    return (
      <View style={{ gap: 16 }}>
        <View style={[styles.note, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Info size={14} color={colors.mutedForeground} strokeWidth={1.8} />
          <Text style={[styles.noteText, { color: colors.mutedForeground }]}>
            {user?.isDemo
              ? "Demo Mode: directory search is off — enter details manually."
              : "Directory search unavailable — enter details manually."}
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>{nameLabel}</Text>
          <TextInput
            value={value.name}
            onChangeText={(name) => onChange({ ...value, name })}
            placeholder="Person or team"
            placeholderTextColor={colors.mutedForeground}
            style={inputStyle}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={labelStyle}>{emailLabel}</Text>
          <TextInput
            value={value.email}
            onChangeText={(email) => onChange({ ...value, email })}
            placeholder="name@encalm.com"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            style={inputStyle}
          />
        </View>
      </View>
    );
  }

  const pick = (u: DirectoryUser) => {
    onChange({ name: u.name, email: u.email });
    setEditing(false);
    setQuery("");
    setResults([]);
  };

  const startChange = () => {
    // Clear both together so an email is never left paired with another name.
    onChange({ name: "", email: "" });
    setEditing(true);
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 6 }}>
        <Text style={labelStyle}>{nameLabel}</Text>
        {!editing && value.name ? (
          <View style={[styles.selected, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <User size={16} color={colors.primary} strokeWidth={1.8} />
            <Text style={[styles.selectedName, { color: colors.foreground }]} numberOfLines={1}>
              {value.name}
            </Text>
            <Pressable onPress={startChange} hitSlop={8} accessibilityLabel="Change assignee">
              <X size={16} color={colors.mutedForeground} strokeWidth={2} />
            </Pressable>
          </View>
        ) : (
          <View>
            <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Search size={16} color={colors.mutedForeground} strokeWidth={1.8} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search Azure AD by name or email"
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.searchInput, { color: colors.foreground }]}
              />
              {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
            </View>
            {query.trim().length >= 2 && !searching ? (
              <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {results.length === 0 ? (
                  <Text style={[styles.empty, { color: colors.mutedForeground }]}>
                    No one in the directory matches “{query.trim()}”.
                  </Text>
                ) : (
                  results.map((u, i) => (
                    <Pressable
                      key={u.id}
                      onPress={() => pick(u)}
                      style={({ pressed }) => [
                        styles.option,
                        i < results.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[styles.optionName, { color: colors.foreground }]}>{u.name}</Text>
                      <Text style={[styles.optionMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {[u.jobTitle, u.department].filter(Boolean).join(" · ") || u.email}
                      </Text>
                      {u.jobTitle || u.department ? (
                        <Text style={[styles.optionMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
                          {u.email}
                        </Text>
                      ) : null}
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
          </View>
        )}
      </View>

      <View style={{ gap: 6 }}>
        <Text style={labelStyle}>{emailLabel}</Text>
        <View style={[styles.readonly, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Text style={[styles.readonlyText, { color: value.email ? colors.foreground : colors.mutedForeground }]}>
            {value.email || "Filled in from Azure AD"}
          </Text>
        </View>
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
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  menu: { marginTop: 8, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  option: { paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  optionName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  optionMeta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  empty: { paddingHorizontal: 14, paddingVertical: 12, fontSize: 13, fontFamily: "Inter_400Regular" },
  selected: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectedName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  readonly: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  readonlyText: { fontSize: 15, fontFamily: "Inter_400Regular" },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
});
