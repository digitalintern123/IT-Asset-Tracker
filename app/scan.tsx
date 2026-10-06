import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import jsQRModule from "jsqr";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAssets } from "@/contexts/AssetContext";
import { useColors } from "@/hooks/useColors";

function parseScan(raw: string): { id?: string; serial?: string } {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      return { id: obj.id, serial: obj.serial };
    }
  } catch {
    // not JSON — treat as raw serial / id
  }
  return { serial: raw, id: raw };
}

// ── Web QR Scanner using browser camera + jsQR ─────────────────────────
function WebQRScanner({
  onScan,
  scanError,
}: {
  onScan: (data: string) => void;
  scanError: string | null;
}) {
  const colors = useColors();
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const rafRef = useRef<number>(0);
  const handledRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let isActive = true;

    async function start() {
      try {
        if (!navigator?.mediaDevices?.getUserMedia) {
          setCamError("Camera API is not supported on this browser or origin is not secure (HTTPS required).");
          return;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });

        if (!isActive || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await videoRef.current.play();
        if (isActive) {
          setReady(true);
          tick();
        }
      } catch (err) {
        if (!isActive) return;
        setCamError(
          "Camera access denied. Please allow camera access in your browser settings and refresh."
        );
      }
    }

    function tick() {
      if (!isActive) return;
      const jsQR = jsQRModule;
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });
          if (code && code.data && !handledRef.current) {
            handledRef.current = true;
            onScanRef.current(code.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      isActive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (camError) {
    return (
      <View style={[styles.permWrap, { backgroundColor: colors.background }]}>
        <Feather name="camera-off" size={32} color={colors.mutedForeground} />
        <Text style={[styles.permTitle, { color: colors.foreground }]}>
          Camera unavailable
        </Text>
        <Text style={[styles.permMsg, { color: colors.mutedForeground }]}>
          {camError}
        </Text>
        <Pressable
          onPress={() => window.history.back()}
          style={({ pressed }) => [
            styles.permBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={[styles.permBtnLabel, { color: colors.primaryForeground }]}>
            Back to Assets
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
      {/* @ts-ignore – web only element */}
      <video
        ref={videoRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
        muted
        playsInline
      />
      {/* @ts-ignore – web only element */}
      <canvas ref={canvasRef} style={{ display: "none" }} />

      {/* Overlay */}
      <View style={[styles.overlay, { paddingTop: 80 }]}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        <Text style={styles.helper}>
          {scanError ?? (ready ? "Point camera at an asset QR code" : "Starting camera…")}
        </Text>
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────
export default function ScanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { assets } = useAssets();
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  const handleScan = useCallback(
    (data: string) => {
      if (handledRef.current) return;
      handledRef.current = true;

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const { id, serial } = parseScan(data);
      const match =
        (id && assets.find((a) => a.id === id)) ||
        (serial &&
          assets.find(
            (a) =>
              a.serialNumber?.trim().toLowerCase() ===
              serial?.trim().toLowerCase()
          ));

      if (match) {
        router.replace(`/asset/${match.id}`);
      } else {
        setError(`No asset found for "${data}".`);
        setTimeout(() => {
          handledRef.current = false;
          setError(null);
        }, 2500);
      }
    },
    [assets, router]
  );

  // ── Web: use browser camera ──────────────────────────────────────────
  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen
          options={{
            title: "Scan asset",
            headerLeft: () => (
              <Pressable
                onPress={() => router.back()}
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
                <Feather name="x" size={15} color={colors.foreground} style={{ marginRight: 5 }} />
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
          }}
        />
        <WebQRScanner onScan={handleScan} scanError={error} />
      </View>
    );
  }

  // ── Native: use expo-camera ──────────────────────────────────────────
  if (!permission) {
    return (
      <View style={[styles.permWrap, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: "Scan asset",
            headerLeft: () => (
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>
                  Cancel
                </Text>
              </Pressable>
            ),
          }}
        />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.permWrap, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            title: "Scan asset",
            headerLeft: () => (
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_500Medium" }}>
                  Cancel
                </Text>
              </Pressable>
            ),
          }}
        />
        <Feather name="camera" size={32} color={colors.primary} />
        <Text style={[styles.permTitle, { color: colors.foreground }]}>
          Camera access needed
        </Text>
        <Text style={[styles.permMsg, { color: colors.mutedForeground }]}>
          Allow camera access to scan asset QR codes.
        </Text>
        <Pressable
          onPress={requestPermission}
          style={({ pressed }) => [
            styles.permBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text
            style={[
              styles.permBtnLabel,
              { color: colors.primaryForeground },
            ]}
          >
            Grant access
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.permBtn,
            { backgroundColor: colors.muted, opacity: pressed ? 0.85 : 1, marginTop: 4 },
          ]}
        >
          <Text
            style={[
              styles.permBtnLabel,
              { color: colors.mutedForeground },
            ]}
          >
            Cancel
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Stack.Screen
        options={{
          title: "Scan asset",
          headerTransparent: true,
          headerTintColor: "#fff",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Feather name="x" size={24} color="#FFFFFF" />
            </Pressable>
          ),
        }}
      />
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr", "code128", "code39", "ean13", "pdf417"],
        }}
        onBarcodeScanned={({ data }) => handleScan(data)}
      />
      <View style={[styles.overlay, { paddingTop: insets.top + 60 }]}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
        </View>
        <Text style={styles.helper}>
          {error ?? "Point camera at an asset QR code"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  permWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  permTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    marginTop: 6,
  },
  permMsg: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 300,
  },
  permBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  permBtnLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 24,
  },
  frame: {
    width: 260,
    height: 260,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 36,
    height: 36,
    borderColor: "#fff",
  },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 8,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 8,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 8,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 8,
  },
  helper: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
