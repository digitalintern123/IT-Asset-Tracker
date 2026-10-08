import { ShieldOff, X } from "@/components/LucideIcon";
import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";

import { AssetForm } from "@/components/AssetForm";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { goBack } from "@/lib/navigation";
import {
  sendAssetAssignedNotification,
} from "@/lib/notify";

export default function NewAssetScreen() {
  const colors = useColors();
  const router = useRouter();
  const { addAsset } = useAssets();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  if (user?.permissions && !user.permissions.canCreateAsset) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.background,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <ShieldOff
          size={48}
          color={colors.destructive}
          strokeWidth={1.8}
          style={{ marginBottom: 16 }}
        />
        <Text
          style={{
            fontSize: 20,
            fontFamily: "Inter_700Bold",
            color: colors.foreground,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          Permission Denied
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontFamily: "Inter_400Regular",
            color: colors.mutedForeground,
            textAlign: "center",
            marginBottom: 24,
            maxWidth: 360,
            lineHeight: 20,
          }}
        >
          Your account role ({user.role?.toUpperCase() || "VIEWER"}) does not have
          permission to register new assets. Please contact an IT Administrator.
        </Text>
        <Pressable
          onPress={() => goBack(router)}
          style={{
            backgroundColor: colors.primary,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontFamily: "Inter_600SemiBold" }}>
            Go Back
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: "New asset",
          headerLeft: () => (
            <Pressable
              onPress={() => goBack(router)}
              hitSlop={8}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 7,
                paddingHorizontal: 14,
                marginLeft: Platform.OS === "web" ? 16 : 8,
                borderRadius: 50,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <X
                size={15}
                color={colors.foreground}
                strokeWidth={2}
                style={{ marginRight: 5 }}
              />
              <Text
                style={{
                  color: colors.foreground,
                  fontFamily: "Inter_600SemiBold",
                  fontSize: 13,
                }}
              >
                Cancel
              </Text>
            </Pressable>
          ),
          headerRight: () => null,
        }}
      />
      <AssetForm
        submitLabel="Create asset"
        submitting={submitting}
        onSubmit={async ({ input, assigneeEmail }) => {
          setSubmitting(true);
          try {
            const asset = await addAsset(input, { assigneeEmail: assigneeEmail || undefined });
            const fromName = user?.name ?? "Asset Tracker";
            if (asset.assignee && asset.status === "in_use") {
              await sendAssetAssignedNotification(asset, fromName);
            }
            router.replace(`/asset/${asset.id}`);
          } catch (err: any) {
            const msg = err?.message || "Failed to create asset in SharePoint.";
            if (Platform.OS === "web") {
              window.alert(`Error: ${msg}`);
            } else {
              Alert.alert("Error Creating Asset", msg);
            }
          } finally {
            setSubmitting(false);
          }
        }}
      />
    </View>
  );
}
