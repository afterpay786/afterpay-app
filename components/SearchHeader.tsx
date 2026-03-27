import React from "react";
import { View, TextInput, StyleSheet, Pressable, Platform, Text, Share, Linking } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import * as Clipboard from "expo-clipboard";

interface SearchHeaderProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onPress?: () => void;
  editable?: boolean;
  placeholder?: string;
  showBack?: boolean;
  onBack?: () => void;
  showShare?: boolean;
}

const SHARE_MSG = (url: string) =>
  `📱 *AFTER PAY - Buy Now Pay Later*\n\nPakistan's best mobile phone marketplace! 🇵🇰\n\n✅ 146+ Phones from top brands\n💳 Buy Now Pay Later\n🚚 Free Delivery Nationwide\n💰 Best Prices Guaranteed\n\n👉 Download now:\n${url}\n\n_Shop smart. Shop AFTER PAY!_ 🏬`;

export default function SearchHeader({
  value,
  onChangeText,
  onPress,
  editable = true,
  placeholder = "Search mobiles...",
  showBack,
  onBack,
  showShare = false,
}: SearchHeaderProps) {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);

  const shareUrl = `${getApiUrl()}download`;

  const handleShare = async () => {
    try {
      await Share.share({
        title: "AFTER PAY",
        message: `Check out AFTER PAY - Pakistan's best mobile phone marketplace! 146+ phones, best prices & free delivery.\n\nDownload: ${shareUrl}`,
      });
    } catch {}
  };

  const handleWhatsApp = () => {
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(SHARE_MSG(shareUrl))}`);
  };

  const handleCopy = async () => {
    try { await Clipboard.setStringAsync(shareUrl); } catch {}
  };

  return (
    <View style={[styles.container, { paddingTop: topPad + 10 }]}>
      <View style={styles.row}>
        {showBack && (
          <Pressable onPress={onBack} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </Pressable>
        )}
        <View style={styles.logoArea}>
          <View style={styles.logoRow}>
            <View style={styles.logoBadge}>
              <Text style={styles.logoMainText}>AFTER PAY</Text>
            </View>
            <View style={styles.birdContainer}>
              <MaterialCommunityIcons name="bird" size={44} color={Colors.white} />
            </View>
          </View>
          <Text style={styles.logoTagline}>Buy Now Pay Later</Text>
        </View>
        {showShare && (
          <View style={styles.shareRow}>
            <Pressable style={({ pressed }) => [styles.waBtn, pressed && { opacity: 0.75 }]} onPress={handleWhatsApp}>
              <Ionicons name="logo-whatsapp" size={15} color="#fff" />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.copyBtn, pressed && { opacity: 0.75 }]} onPress={handleCopy}>
              <Ionicons name="copy-outline" size={14} color="#fff" />
            </Pressable>
            <Pressable style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]} onPress={handleShare}>
              <Ionicons name="gift" size={13} color="#F59E0B" />
              <Text style={styles.shareBtnLabel}>Invite</Text>
              <Ionicons name="chevron-forward" size={12} color={Colors.primary} />
            </Pressable>
          </View>
        )}
      </View>
      <Pressable
        style={styles.searchBar}
        onPress={onPress}
        disabled={editable}
      >
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        {editable ? (
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={Colors.textLight}
            autoFocus
            returnKeyType="search"
          />
        ) : (
          <Text style={styles.placeholder}>{placeholder}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  backBtn: {
    marginRight: 12,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  logoArea: {
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  logoBadge: {
    backgroundColor: Colors.white,
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 5,
    marginBottom: 3,
  },
  logoMainText: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    color: Colors.primary,
    letterSpacing: 2,
  },
  logoTagline: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "rgba(255,255,255,0.85)",
    letterSpacing: 0.5,
    marginLeft: 14,
    marginTop: 2,
  },
  birdContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  shareRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
    marginLeft: 12,
  },
  waBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#25D366",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 2px 6px rgba(37,211,102,0.4)",
  },
  copyBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    boxShadow: "0px 2px 8px rgba(0,0,0,0.15)",
  },
  shareBtnLabel: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    boxShadow: "0px 2px 8px rgba(0,0,0,0.08)",
  },
  input: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    padding: 0,
  },
  placeholder: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textLight,
  },
});
