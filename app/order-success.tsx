import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useOrders, PAYMENT_METHODS, PaymentStatus } from "@/lib/order-context";
import { formatPrice } from "@/lib/data";

export default function OrderSuccessScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();
  const { orderId, paymentPending, paymentFailed } = useLocalSearchParams<{ orderId: string; paymentPending?: string; paymentFailed?: string }>();
  const { getOrder, checkPaymentStatus } = useOrders();
  const order = getOrder(orderId || "");
  const [paymentChecking, setPaymentChecking] = useState(false);
  const [localPaymentStatus, setLocalPaymentStatus] = useState<PaymentStatus | null>(null);

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 60, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (order && order.paymentMethod === "jazzcash" && (paymentPending === "true" || order.paymentStatus === "pending")) {
      const interval = setInterval(async () => {
        setPaymentChecking(true);
        const status = await checkPaymentStatus(order.id);
        setLocalPaymentStatus(status);
        setPaymentChecking(false);
        if (status === "paid" || status === "failed") {
          clearInterval(interval);
        }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [order?.id]);

  const effectivePaymentStatus = localPaymentStatus || order?.paymentStatus || (paymentFailed === "true" ? "failed" : "unpaid");

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: topPad + 20 }]}>
        <Text style={styles.errorText}>Order not found</Text>
        <Pressable style={styles.homeBtn} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.homeBtnText}>Go Home</Text>
        </Pressable>
      </View>
    );
  }

  const paymentLabel = PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label || "";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: topPad + 20, paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.successIcon, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.iconCircle}>
            <Ionicons name="checkmark-circle" size={72} color={Colors.primary} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.successContent, { opacity: fadeAnim }]}>
          <Text style={styles.successTitle}>Order Confirmed!</Text>
          <Text style={styles.successSub}>
            Thank you for shopping with AFTER PAY. Your order has been placed successfully.
          </Text>

          <View style={styles.orderIdCard}>
            <Text style={styles.orderIdLabel}>Order ID</Text>
            <Text style={styles.orderIdValue}>{order.id}</Text>
          </View>

          {order.paymentMethod === "jazzcash" && (
            <View style={[
              styles.paymentStatusBanner,
              effectivePaymentStatus === "paid" && styles.paymentBannerPaid,
              effectivePaymentStatus === "failed" && styles.paymentBannerFailed,
              effectivePaymentStatus === "pending" && styles.paymentBannerPending,
            ]}>
              <View style={styles.paymentStatusRow}>
                {effectivePaymentStatus === "pending" && paymentChecking ? (
                  <ActivityIndicator size="small" color="#D97706" />
                ) : (
                  <Ionicons
                    name={effectivePaymentStatus === "paid" ? "checkmark-circle" : effectivePaymentStatus === "failed" ? "close-circle" : "time"}
                    size={22}
                    color={effectivePaymentStatus === "paid" ? "#059669" : effectivePaymentStatus === "failed" ? "#DC2626" : "#D97706"}
                  />
                )}
                <View style={styles.paymentStatusInfo}>
                  <Text style={[
                    styles.paymentStatusTitle,
                    effectivePaymentStatus === "paid" && { color: "#059669" },
                    effectivePaymentStatus === "failed" && { color: "#DC2626" },
                    effectivePaymentStatus === "pending" && { color: "#D97706" },
                  ]}>
                    {effectivePaymentStatus === "paid" ? "Payment Received" : effectivePaymentStatus === "failed" ? "Payment Failed" : "Payment Pending"}
                  </Text>
                  <Text style={styles.paymentStatusDesc}>
                    {effectivePaymentStatus === "paid"
                      ? "Your JazzCash payment has been confirmed."
                      : effectivePaymentStatus === "failed"
                      ? "Payment could not be processed. You can pay via Cash on Delivery."
                      : "Waiting for JazzCash payment confirmation..."}
                  </Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="location-outline" size={20} color={Colors.primary} />
                <View style={styles.infoTextGroup}>
                  <Text style={styles.infoLabel}>Delivery To</Text>
                  <Text style={styles.infoValue}>{order.deliveryInfo.city}</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="time-outline" size={20} color={Colors.primary} />
                <View style={styles.infoTextGroup}>
                  <Text style={styles.infoLabel}>Est. Delivery</Text>
                  <Text style={styles.infoValue}>{order.estimatedDelivery}{order.estimatedDeliveryEnd ? ` - ${order.estimatedDeliveryEnd}` : ""}</Text>
                </View>
              </View>
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="card-outline" size={20} color={Colors.primary} />
                <View style={styles.infoTextGroup}>
                  <Text style={styles.infoLabel}>Payment</Text>
                  <Text style={styles.infoValue}>{paymentLabel}</Text>
                </View>
              </View>
              <View style={styles.infoItem}>
                <Ionicons name="pricetag-outline" size={20} color={Colors.primary} />
                <View style={styles.infoTextGroup}>
                  <Text style={styles.infoLabel}>Total</Text>
                  <Text style={styles.infoValueBold}>{formatPrice(order.total)}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.itemsCard}>
            <Text style={styles.itemsTitle}>Items Ordered ({order.items.length})</Text>
            {order.items.map((item) => (
              <View key={item.product.id} style={styles.itemRow}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.product.name}{item.selectedVariant ? ` (${item.selectedVariant.label})` : ""}
                </Text>
                <Text style={styles.itemQtyPrice}>x{item.quantity} - {formatPrice((item.selectedVariant?.price || item.product.price) * item.quantity)}</Text>
              </View>
            ))}
          </View>

          <View style={styles.deliveryCard}>
            <Ionicons name="person-outline" size={18} color={Colors.primary} />
            <View style={styles.deliveryDetails}>
              <Text style={styles.deliveryName}>{order.deliveryInfo.fullName}</Text>
              <Text style={styles.deliveryAddr}>{order.deliveryInfo.address}, {order.deliveryInfo.city}</Text>
              <Text style={styles.deliveryPhone}>{order.deliveryInfo.phone}</Text>
            </View>
          </View>

          {order.openParcel && (
            <View style={styles.openParcelBanner}>
              <Ionicons name="cube-outline" size={18} color="#D97706" />
              <Text style={styles.openParcelText}>Open Parcel Delivery - You can inspect the package before paying</Text>
            </View>
          )}

          <View style={styles.noteCard}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
            <Text style={styles.noteText}>
              You will receive an SMS & email confirmation shortly. Our team will call you to verify the order. Make your unboxing video for your protection.
            </Text>
          </View>

          <View style={styles.btnGroup}>
            <Pressable
              style={({ pressed }) => [styles.trackBtn, pressed && { opacity: 0.9 }]}
              onPress={() => router.replace({ pathname: "/orders" })}
            >
              <Ionicons name="location" size={18} color={Colors.primary} />
              <Text style={styles.trackBtnText}>Track My Orders</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.homeBtn, pressed && { opacity: 0.9 }]}
              onPress={() => router.replace("/(tabs)")}
            >
              <Ionicons name="home" size={18} color={Colors.white} />
              <Text style={styles.homeBtnText}>Continue Shopping</Text>
            </Pressable>
          </View>
        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { paddingHorizontal: 20, alignItems: "center" },
  errorText: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary, textAlign: "center", marginBottom: 20 },
  successIcon: { marginBottom: 16, alignItems: "center" },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  successContent: { width: "100%", alignItems: "center" },
  successTitle: { fontSize: 24, fontFamily: "Inter_800ExtraBold", color: Colors.text, marginBottom: 8 },
  successSub: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20, marginBottom: 20, paddingHorizontal: 20 },
  orderIdCard: { backgroundColor: Colors.primary + "10", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24, alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: Colors.primary + "25", width: "100%" },
  orderIdLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  orderIdValue: { fontSize: 22, fontFamily: "Inter_800ExtraBold", color: Colors.primary, letterSpacing: 1 },
  infoCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, width: "100%", marginBottom: 16, borderWidth: 1, borderColor: Colors.borderLight },
  infoRow: { flexDirection: "row", justifyContent: "space-between" },
  infoItem: { flexDirection: "row", alignItems: "center", flex: 1, gap: 8 },
  infoTextGroup: {},
  infoLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight, textTransform: "uppercase", letterSpacing: 0.3 },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 2 },
  infoValueBold: { fontSize: 14, fontFamily: "Inter_800ExtraBold", color: Colors.primary, marginTop: 2 },
  infoDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 12 },
  itemsCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, width: "100%", marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  itemsTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 10 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  itemName: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.text, marginRight: 8 },
  itemQtyPrice: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  deliveryCard: { flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 12, padding: 14, width: "100%", marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight, gap: 10 },
  deliveryDetails: { flex: 1 },
  deliveryName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  deliveryAddr: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  deliveryPhone: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 2 },
  openParcelBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12, width: "100%", marginBottom: 12 },
  openParcelText: { flex: 1, fontSize: 11, fontFamily: "Inter_500Medium", color: "#92400E" },
  paymentStatusBanner: { width: "100%", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1 },
  paymentBannerPaid: { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" },
  paymentBannerFailed: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
  paymentBannerPending: { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" },
  paymentStatusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  paymentStatusInfo: { flex: 1 },
  paymentStatusTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  paymentStatusDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#666", lineHeight: 16 },
  noteCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: Colors.primary + "08", borderRadius: 10, padding: 12, width: "100%", marginBottom: 20 },
  noteText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 17 },
  btnGroup: { width: "100%", gap: 10 },
  trackBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 2, borderColor: Colors.primary, borderRadius: 12, paddingVertical: 14, backgroundColor: Colors.surface },
  trackBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
  homeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14 },
  homeBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
});
