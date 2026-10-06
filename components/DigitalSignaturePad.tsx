import React, { useRef, useState } from "react";
import {
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Feather } from "@expo/vector-icons";

import { useColors } from "@/hooks/useColors";

interface Point {
  x: number;
  y: number;
}

interface DigitalSignaturePadProps {
  onSave: (svgPathData: string) => void;
  onClear?: () => void;
  height?: number;
}

export function DigitalSignaturePad({
  onSave,
  onClear,
  height = 180,
}: DigitalSignaturePadProps) {
  const colors = useColors();
  const [paths, setPaths] = useState<string[]>([]);
  const currentPathRef = useRef<string>("");
  const isDrawingRef = useRef<boolean>(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        isDrawingRef.current = true;
        currentPathRef.current = `M ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        setPaths((prev) => [...prev, currentPathRef.current]);
      },
      onPanResponderMove: (evt) => {
        if (!isDrawingRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        currentPathRef.current += ` L ${locationX.toFixed(1)} ${locationY.toFixed(1)}`;
        setPaths((prev) => {
          const next = [...prev];
          next[next.length - 1] = currentPathRef.current;
          return next;
        });
      },
      onPanResponderRelease: () => {
        isDrawingRef.current = false;
        if (currentPathRef.current) {
          // notify parent with combined path data
          setPaths((latest) => {
            onSave(latest.join(" "));
            return latest;
          });
        }
      },
    })
  ).current;

  const handleClear = () => {
    setPaths([]);
    currentPathRef.current = "";
    onSave("");
    onClear?.();
  };

  const handleUndo = () => {
    setPaths((prev) => {
      const next = prev.slice(0, -1);
      onSave(next.join(" "));
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.canvasBox,
          {
            height,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Svg style={StyleSheet.absoluteFill}>
          {paths.map((p, idx) => (
            <Path
              key={idx}
              d={p}
              stroke={colors.foreground}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>

        {paths.length === 0 && (
          <View style={styles.placeholder} pointerEvents="none">
            <Feather name="edit-3" size={24} color={colors.mutedForeground} style={{ opacity: 0.5 }} />
            <Text style={[styles.placeholderText, { color: colors.mutedForeground }]}>
              Sign here with finger or mouse
            </Text>
            <View style={[styles.signLine, { borderBottomColor: colors.border }]} />
          </View>
        )}
      </View>

      <View style={styles.btnRow}>
        <Pressable
          onPress={handleUndo}
          disabled={paths.length === 0}
          style={({ pressed }) => [
            styles.ctrlBtn,
            {
              backgroundColor: colors.secondary,
              opacity: paths.length === 0 ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="rotate-ccw" size={14} color={colors.foreground} style={{ marginRight: 4 }} />
          <Text style={[styles.ctrlBtnText, { color: colors.foreground }]}>Undo</Text>
        </Pressable>

        <Pressable
          onPress={handleClear}
          disabled={paths.length === 0}
          style={({ pressed }) => [
            styles.ctrlBtn,
            {
              backgroundColor: colors.secondary,
              opacity: paths.length === 0 ? 0.4 : pressed ? 0.7 : 1,
            },
          ]}
        >
          <Feather name="trash-2" size={14} color={colors.destructive} style={{ marginRight: 4 }} />
          <Text style={[styles.ctrlBtnText, { color: colors.destructive }]}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  canvasBox: {
    width: "100%",
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  placeholderText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
    opacity: 0.7,
  },
  signLine: {
    width: 220,
    borderBottomWidth: 1,
    marginTop: 18,
    opacity: 0.4,
  },
  btnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  ctrlBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  ctrlBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
});
