import React from "react";
import { Pressable, StyleSheet, Linking, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const WHATSAPP_NUMBER = "923261605570";
const DEFAULT_MESSAGE = "Hi! I have a question about AFTER PAY.";

export default function WhatsAppButton() {
  const insets = useSafeAreaInsets();
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);

  const openWhatsApp = () => {
    const encoded = encodeURIComponent(DEFAULT_MESSAGE);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
    Linking.openURL(url);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        { bottom: bottomPad + 80 },
        pressed && styles.pressed,
      ]}
      onPress={openWhatsApp}
    >
      <Ionicons name="logo-whatsapp" size={28} color="#fff" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
    elevation: 8,
    boxShadow: "0px 4px 12px rgba(0,0,0,0.25)",
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.95 }],
  },
});
