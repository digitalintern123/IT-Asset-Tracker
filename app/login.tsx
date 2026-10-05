import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, signInDemo, user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If already signed in redirect to home
  React.useEffect(() => {
    if (user) router.replace("/");
  }, [user]);

  // If returning from Microsoft PKCE redirect, show loading state
  React.useEffect(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (
        window.location.search.includes("code=") ||
        (window.location.hash && window.location.hash.includes("code="))
      ) {
        setBusy(true);
      }
    }
  }, []);

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
      setError(e?.message || "Sign in failed. Please try again.");
      setBusy(false);
    }
  };

  const handleDemoSignIn = async () => {
    setError(null);
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    try {
      await signInDemo();
      router.replace("/");
    } catch (e: any) {
      setError("Failed to enter demo mode.");
    }
  };

  return (
    <LinearGradient
      colors={["#080E1F", "#0D1730", "#14224A", "#0D1730"]}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + (Platform.OS === "web" ? 50 : 30),
            paddingBottom: insets.bottom + 28,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.contentWrap}>
          {/* Centered Hero Brand Section */}
          <View style={styles.heroSection}>
            <View style={styles.logoFrame}>
              <Image
                source={require("@/assets/brand/encalm-logo.png")}
                style={styles.heroLogo}
                resizeMode="contain"
              />
            </View>

            <Text style={styles.brandTitle}>ENCALM HOSPITALITY</Text>
            <View style={styles.goldBadge}>
              <Text style={styles.goldBadgeText}>IT ASSET REGISTER</Text>
            </View>
            <Text style={styles.heroSubtitle}>
              Airport Lounges & Operations Hardware Management
            </Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardHeading}>Sign In</Text>
            <Text style={styles.cardSubtext}>
              Authenticate using your official Encalm Microsoft 365 credentials to access the asset database.
            </Text>

            {error ? (
              <View style={styles.errorRow}>
                <Feather name="alert-circle" size={15} color="#FF8A8A" />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            {/* Microsoft SSO Button */}
            <Pressable
              onPress={handleSignIn}
              disabled={busy}
              style={({ pressed }) => [
                styles.signInBtn,
                {
                  opacity: busy ? 0.75 : pressed ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color="#0D1730" size="small" />
              ) : (
                <View style={styles.msIcon}>
                  <View style={[styles.msSquare, { backgroundColor: "#F25022" }]} />
                  <View style={[styles.msSquare, { backgroundColor: "#7FBA00" }]} />
                  <View style={[styles.msSquare, { backgroundColor: "#00A4EF" }]} />
                  <View style={[styles.msSquare, { backgroundColor: "#FFB900" }]} />
                </View>
              )}
              <Text style={styles.signInLabel}>
                {busy ? "Authenticating with Microsoft..." : "Sign in with Microsoft 365"}
              </Text>
            </Pressable>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Explore in Demo Mode Button */}
            <Pressable
              onPress={handleDemoSignIn}
              disabled={busy}
              style={({ pressed }) => [
                styles.demoBtn,
                {
                  opacity: pressed ? 0.85 : 1,
                  transform: [{ scale: pressed ? 0.99 : 1 }],
                },
              ]}
            >
              <Feather name="eye" size={16} color="#D8B575" />
              <Text style={styles.demoBtnText}>Explore in Demo Mode</Text>
            </Pressable>
            <Text style={styles.demoCaption}>
              Preview lounge inventory & QR scanner without Microsoft 365 sign-in
            </Text>

            {/* Security Note */}
            <View style={styles.securityBox}>
              <Feather name="shield" size={14} color="#D8B575" />
              <View style={{ flex: 1 }}>
                <Text style={styles.securityTitle}>Protected by Microsoft Entra ID</Text>
                <Text style={styles.securityText}>
                  Multi-factor authentication enabled. Zero local passwords stored.
                </Text>
              </View>
            </View>
          </View>

          {/* Network Location Indicator */}
          <View style={styles.networkBadge}>
            <Feather name="map-pin" size={12} color="rgba(255,255,255,0.4)" />
            <Text style={styles.networkText}>
              DEL · HYD · GOA · Airport Lounges & Terminals
            </Text>
          </View>

          {/* Corporate Footer */}
          <Text style={styles.footer}>
            © {new Date().getFullYear()} Encalm Hospitality Pvt. Ltd. · Internal IT Systems
          </Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  contentWrap: {
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
  },
  heroSection: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoFrame: {
    width: 104,
    height: 104,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    borderWidth: 2,
    borderColor: "rgba(205, 164, 94, 0.7)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    shadowColor: "#CDA45E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
  },
  heroLogo: {
    width: 76,
    height: 62,
  },
  brandTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    letterSpacing: 4,
    textAlign: "center",
  },
  goldBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(205, 164, 94, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(205, 164, 94, 0.35)",
  },
  goldBadgeText: {
    color: "#D8B575",
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 2,
  },
  heroSubtitle: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 10,
    textAlign: "center",
    lineHeight: 18,
  },
  card: {
    width: "100%",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  cardHeading: {
    color: "#FFFFFF",
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  cardSubtext: {
    color: "rgba(255, 255, 255, 0.65)",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginTop: 6,
    marginBottom: 20,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255, 90, 90, 0.12)",
    borderColor: "rgba(255, 90, 90, 0.3)",
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  error: {
    color: "#FF8A8A",
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#CDA45E",
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: "#CDA45E",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
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
    color: "#0D1730",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
  },
  dividerText: {
    color: "rgba(255, 255, 255, 0.4)",
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1.5,
  },
  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(205, 164, 94, 0.1)",
    borderWidth: 1.5,
    borderColor: "rgba(205, 164, 94, 0.4)",
    paddingVertical: 13,
    borderRadius: 12,
  },
  demoBtnText: {
    color: "#D8B575",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.3,
  },
  demoCaption: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  securityBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "rgba(205, 164, 94, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(205, 164, 94, 0.2)",
    borderRadius: 10,
    padding: 12,
    marginTop: 18,
  },
  securityTitle: {
    color: "#E2C68E",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  securityText: {
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 15,
    marginTop: 2,
  },
  networkBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 24,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
  },
  networkText: {
    color: "rgba(255, 255, 255, 0.45)",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.5,
  },
  footer: {
    color: "rgba(255, 255, 255, 0.35)",
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 16,
  },
});
