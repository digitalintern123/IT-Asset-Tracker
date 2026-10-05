import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, View } from "react-native";

import { AssetForm } from "@/components/AssetForm";
import { useAssets } from "@/contexts/AssetContext";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  openAssignmentEmail,
  sendAssetAssignedNotification,
} from "@/lib/notify";

export default function NewAssetScreen() {
  const colors = useColors();
  const router = useRouter();
  const { addAsset } = useAssets();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <AssetForm
        submitLabel="Create asset"
        submitting={submitting}
        onSubmit={async ({ input, assigneeEmail }) => {
          setSubmitting(true);
          try {
            const asset = await addAsset(input);
            const fromName = user?.name ?? "Asset Tracker";
            if (asset.assignee && asset.status === "in_use") {
              await sendAssetAssignedNotification(asset, fromName);
              if (assigneeEmail) {
                if (Platform.OS === "web") {
                  router.replace(`/asset/${asset.id}`);
                  await openAssignmentEmail(asset, assigneeEmail, fromName);
                  return;
                }
                Alert.alert(
                  "Notify assignee?",
                  `Send ${asset.assignee} an email about this assignment?`,
                  [
                    { text: "Skip", style: "cancel" },
                    {
                      text: "Send email",
                      onPress: () =>
                        openAssignmentEmail(asset, assigneeEmail, fromName),
                    },
                  ],
                );
              }
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
