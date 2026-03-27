import React from "react";
import { Text, StyleSheet, Pressable, Platform } from "react-native";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";

interface BrandChipProps {
  name: string;
  selected?: boolean;
  onPress: () => void;
}

export default function BrandChip({ name, selected, onPress }: BrandChipProps) {
  const handlePress = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
    >
      <Text style={[styles.text, selected && styles.textSelected]}>
        {name}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: Colors.surfaceAlt,
    marginRight: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  text: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  textSelected: {
    color: Colors.white,
  },
});
