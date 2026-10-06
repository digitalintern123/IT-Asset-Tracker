import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AssetProvider } from "@/contexts/AssetContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

import { ITAMProvider } from "@/contexts/ITAMContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function AuthGate() {
  const { user, loaded } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!loaded) return;
    const inLogin = segments[0] === "login";
    if (!user && !inLogin) {
      router.replace("/login");
    } else if (user && inLogin) {
      router.replace("/");
    }
  }, [user, loaded, segments, router]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <AuthGate />
      <Stack screenOptions={{ headerBackTitle: "Back" }}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="asset/new"
          options={{ title: "New asset", presentation: "modal" }}
        />
        <Stack.Screen name="asset/[id]" options={{ title: "Asset" }} />
        <Stack.Screen
          name="scan"
          options={{ title: "Scan", presentation: "modal" }}
        />
        <Stack.Screen
          name="operations/action"
          options={{ title: "Custody Action", presentation: "modal" }}
        />
        <Stack.Screen
          name="operations/onboarding"
          options={{ title: "New Hire Onboarding", presentation: "modal" }}
        />
        <Stack.Screen
          name="operations/offboarding"
          options={{ title: "Employee Offboarding", presentation: "modal" }}
        />
        <Stack.Screen
          name="operations/handover"
          options={{ title: "Digital Handover Slip", presentation: "modal" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView>
            <KeyboardProvider>
              <AuthProvider>
                <AssetProvider>
                  <ITAMProvider>
                    <RootLayoutNav />
                  </ITAMProvider>
                </AssetProvider>
              </AuthProvider>
            </KeyboardProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
