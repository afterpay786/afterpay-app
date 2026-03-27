import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";

const PAYMENT_METHODS = [
  {
    id: "cod",
    title: "Cash on Delivery",
    icon: "cash-outline" as keyof typeof Ionicons.glyphMap,
    description: "Pay when you receive your order",
    badge: "Most Popular",
  },
  {
    id: "jazzcash",
    title: "JazzCash",
    icon: "phone-portrait-outline" as keyof typeof Ionicons.glyphMap,
    description: "Pay via JazzCash mobile wallet",
  },
  {
    id: "easypaisa",
    title: "EasyPaisa",
    icon: "phone-portrait-outline" as keyof typeof Ionicons.glyphMap,
    description: "Pay via EasyPaisa mobile wallet",
  },
  {
    id: "card",
    title: "Credit/Debit Card",
    icon: "card-outline" as keyof typeof Ionicons.glyphMap,
    description: "Visa, Mastercard accepted",
  },
  {
    id: "bank",
    title: "Bank Transfer",
    icon: "business-outline" as keyof typeof Ionicons.glyphMap,
    description: "Direct bank transfer",
  },
  {
    id: "bnpl",
    title: "Buy Now Pay Later",
    icon: "time-outline" as keyof typeof Ionicons.glyphMap,
    description: "Pay in installments",
  },
];

export default function PaymentMethodsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Available Payment Methods</Text>

        {PAYMENT_METHODS.map((method) => (
          <View key={method.id} style={styles.methodCard}>
            <View style={styles.methodIcon}>
              <Ionicons name={method.icon} size={22} color={Colors.primary} />
            </View>
            <View style={styles.methodInfo}>
              <View style={styles.methodTitleRow}>
                <Text style={styles.methodTitle}>{method.title}</Text>
                {method.badge && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{method.badge}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.methodDesc}>{method.description}</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
          </View>
        ))}

        <View style={styles.noteCard}>
          <Ionicons name="information-circle" size={20} color={Colors.primary} />
          <Text style={styles.noteText}>Payment method is selected during checkout</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  methodCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  methodInfo: { flex: 1, marginRight: 8 },
  methodTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  methodTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text },
  badge: {
    backgroundColor: Colors.primary + "15",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: Colors.primary, letterSpacing: 0.5 },
  methodDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  noteCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primary + "10",
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    gap: 10,
  },
  noteText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text, flex: 1 },
});
