import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in redirect to home
  React.useEffect(() => {
    if (user) router.replace("/");
  }, [user]);

  const handleSignIn = async () => {
    setError(null);
    setBusy(true);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    try {
      await signIn();
      if (Platform.OS !== "web") {
        router.replace("/");
      }
      // On web, redirect happens via window.location.href in AuthContext
    } catch (e: any) {
      setError("Sign in failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <LinearGradient
      colors={[colors.brandNavyDeep, colors.brandNavy, "#1B2A57"]}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brandRow}>
          <View style={styles.logoWrap}>
            <Image
              source={require("@/assets/brand/encalm-logo.png")}
              style={{ width: 36, height: 36 }}
              resizeMode="contain"
            />
          </View>
          <View>
            <Text style={styles.brandName}>ENCALM</Text>
            <Text style={[styles.brandTag, { color: colors.brandGoldSoft }]}>
              Asset Tracker
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 36, gap: 8 }}>
          <Text style={styles.welcome}>Welcome</Text>
          <Text style={styles.subtitle}>
            Sign in with your Encalm Microsoft 365 account to manage your assets.
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.12)" },
          ]}
        >
          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={14} color="#F8B5B5" />
              <Text style={styles.error}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSignIn}
            disabled={busy}
            style={({ pressed }) => [
              styles.signInBtn,
              {
                backgroundColor: colors.brandGold,
                opacity: busy ? 0.7 : pressed ? 0.9 : 1,
              },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#1A1408" size="small" />
            ) : (
              <View style={styles.msIcon}>
                <View style={[styles.msSquare, { backgroundColor: "#F25022" }]} />
                <View style={[styles.msSquare, { backgroundColor: "#7FBA00" }]} />
                <View style={[styles.msSquare, { backgroundColor: "#00A4EF" }]} />
                <View style={[styles.msSquare, { backgroundColor: "#FFB900" }]} />
              </View>
            )}
            <Text style={styles.signInLabel}>
              {busy ? "Signing in..." : "Sign in with Microsoft"}
            </Text>
          </Pressable>

          <View style={styles.secureNote}>
            <Feather name="shield" size={12} color={colors.brandGoldSoft} />
            <Text style={[styles.secureText, { color: colors.brandGoldSoft }]}>
              Secured by Microsoft Azure AD — your Encalm credentials are never stored locally.
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          By signing in you agree to your organization's IT policies.
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  logoWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(205,164,94,0.4)",
  },
  brandName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    letterSpacing: 5,
  },
  brandTag: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 1.6,
    marginTop: 2,
    textTransform: "uppercase",
  },
  welcome: {
    color: "#FFFFFF",
    fontSize: 36,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
  },
  subtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    maxWidth: 320,
  },
  card: {
    marginTop: 28,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  error: {
    color: "#F8B5B5",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 15,
    borderRadius: 14,
  },
  msIcon: {
    width: 18,
    height: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
  },
  msSquare: {
    width: 8,
    height: 8,
  },
  signInLabel: {
    color: "#1A1408",
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  secureNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 16,
  },
  secureText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    flex: 1,
    lineHeight: 16,
  },
  footer: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: "auto",
    paddingTop: 32,
  },
});
