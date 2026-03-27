import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Colors from "@/constants/colors";
import { useOrders, PAYMENT_METHODS } from "@/lib/order-context";
import { formatPrice } from "@/lib/data";

const TRACKING_STEPS = [
  { status: "confirmed", label: "Order Confirmed", icon: "checkmark-circle" as const },
  { status: "processing", label: "Processing", icon: "time" as const },
  { status: "shipped", label: "Shipped", icon: "airplane" as const },
  { status: "delivered", label: "Delivered", icon: "checkmark-done-circle" as const },
];

function getStepIndex(status: string): number {
  const idx = TRACKING_STEPS.findIndex((s) => s.status === status);
  return idx >= 0 ? idx : 0;
}

export default function OrderDetailScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const { getOrder } = useOrders();
  const order = getOrder(orderId || "");

  if (!order) {
    return (
      <View style={[styles.container, { paddingTop: topPad + 20 }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Order not found</Text>
          <Pressable style={styles.backBtnLg} onPress={() => router.back()}>
            <Text style={styles.backBtnLgText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const currentStep = getStepIndex(order.status);
  const paymentLabel = PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label || "";
  const dateStr = new Date(order.createdAt).toLocaleDateString("en-PK", {
    weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Order Details</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.orderIdCard}>
          <View>
            <Text style={styles.orderIdLabel}>Order ID</Text>
            <Text style={styles.orderIdValue}>{order.id}</Text>
          </View>
          <Text style={styles.orderDate}>{dateStr}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Tracking</Text>
          <View style={styles.trackingContainer}>
            {TRACKING_STEPS.map((step, idx) => {
              const isActive = idx <= currentStep;
              const isCurrent = idx === currentStep;
              return (
                <View key={step.status} style={styles.trackingStep}>
                  <View style={styles.trackingIndicator}>
                    <View style={[styles.trackingDot, isActive && styles.trackingDotActive, isCurrent && styles.trackingDotCurrent]}>
                      <Ionicons name={step.icon} size={16} color={isActive ? Colors.white : Colors.textLight} />
                    </View>
                    {idx < TRACKING_STEPS.length - 1 && (
                      <View style={[styles.trackingLine, idx < currentStep && styles.trackingLineActive]} />
                    )}
                  </View>
                  <View style={styles.trackingInfo}>
                    <Text style={[styles.trackingLabel, isActive && styles.trackingLabelActive]}>{step.label}</Text>
                    {isCurrent && <Text style={styles.trackingCurrent}>Current Status</Text>}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items ({order.items.length})</Text>
          {order.items.map((item) => (
            <View key={item.product.id} style={styles.itemCard}>
              <Image source={{ uri: item.product.image }} style={styles.itemImg} />
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.product.name}</Text>
                {item.selectedVariant && (
                  <Text style={styles.itemVariant}>{item.selectedVariant.label}</Text>
                )}
                <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
                <Text style={styles.itemPrice}>{formatPrice((item.selectedVariant?.price || item.product.price) * item.quantity)}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Ionicons name="person-outline" size={16} color={Colors.primary} />
              <Text style={styles.cardText}>{order.deliveryInfo.fullName}</Text>
            </View>
            <View style={styles.cardRow}>
              <Ionicons name="location-outline" size={16} color={Colors.primary} />
              <Text style={styles.cardText}>{order.deliveryInfo.address}, {order.deliveryInfo.city}</Text>
            </View>
            <View style={styles.cardRow}>
              <Ionicons name="call-outline" size={16} color={Colors.primary} />
              <Text style={styles.cardText}>{order.deliveryInfo.phone}</Text>
            </View>
            <View style={styles.cardRow}>
              <Ionicons name="mail-outline" size={16} color={Colors.primary} />
              <Text style={styles.cardText}>{order.deliveryInfo.email}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Details</Text>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <Ionicons name="card-outline" size={16} color={Colors.primary} />
              <Text style={styles.cardText}>{paymentLabel}</Text>
            </View>
            {order.openParcel && (
              <View style={styles.cardRow}>
                <Ionicons name="cube-outline" size={16} color="#D97706" />
                <Text style={[styles.cardText, { color: "#D97706" }]}>Open Parcel Delivery</Text>
              </View>
            )}
          </View>
        </View>

        {order.paymentMethod === "bnpl" && order.bnplDocuments && Object.keys(order.bnplDocuments).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BNPL Documents</Text>
            <View style={styles.card}>
              {[
                { key: "cnicFront" as const, label: "CNIC Front" },
                { key: "cnicBack" as const, label: "CNIC Back" },
                { key: "tasdeeqApp" as const, label: "Tasdeeq App Screenshot" },
                { key: "bankCheque" as const, label: "Bank Cheque" },
                { key: "applicationForm" as const, label: "Application Form" },
              ].map(({ key, label }) => {
                const val = (order.bnplDocuments as any)?.[key];
                return (
                  <View key={key} style={styles.bnplDocRow}>
                    <View style={styles.bnplDocHeader}>
                      <Text style={styles.bnplDocLabel}>{label}</Text>
                      {val ? (
                        <View style={styles.bnplDocBadge}>
                          <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                          <Text style={styles.bnplDocBadgeText}>Uploaded</Text>
                        </View>
                      ) : (
                        <View style={[styles.bnplDocBadge, { backgroundColor: "#FEF3C7" }]}>
                          <Ionicons name="time-outline" size={14} color="#D97706" />
                          <Text style={[styles.bnplDocBadgeText, { color: "#D97706" }]}>Pending</Text>
                        </View>
                      )}
                    </View>
                    {val && (
                      <Image source={{ uri: val }} style={styles.bnplDocImage} resizeMode="cover" />
                    )}
                  </View>
                );
              })}
              {(order.bnplDocuments as any)?.bankStatements?.length > 0 && (
                ((order.bnplDocuments as any).bankStatements as string[]).map((stmt: string, idx: number) => (
                  <View key={`stmt-${idx}`} style={styles.bnplDocRow}>
                    <View style={styles.bnplDocHeader}>
                      <Text style={styles.bnplDocLabel}>Bank Statement {idx + 1}</Text>
                      <View style={styles.bnplDocBadge}>
                        <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                        <Text style={styles.bnplDocBadgeText}>Uploaded</Text>
                      </View>
                    </View>
                    <Image source={{ uri: stmt }} style={styles.bnplDocImage} resizeMode="cover" />
                  </View>
                ))
              )}
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatPrice(order.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery Fee</Text>
              <Text style={styles.summaryValue}>Rs. {order.deliveryFee}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotal}>Total</Text>
              <Text style={styles.summaryTotalValue}>{formatPrice(order.total)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.helpCard}>
          <Ionicons name="headset-outline" size={20} color={Colors.primary} />
          <View style={styles.helpInfo}>
            <Text style={styles.helpTitle}>Need Help?</Text>
            <Text style={styles.helpDesc}>Contact us at 051-111-693-693 or hello@afterpay.pk</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 100 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  backBtnLg: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12 },
  backBtnLgText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  scrollContent: { padding: 16 },
  orderIdCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: Colors.primary + "10", borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.primary + "25" },
  orderIdLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.5 },
  orderIdValue: { fontSize: 18, fontFamily: "Inter_800ExtraBold", color: Colors.primary, marginTop: 2 },
  orderDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 10 },
  trackingContainer: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  trackingStep: { flexDirection: "row", minHeight: 56 },
  trackingIndicator: { alignItems: "center", width: 32 },
  trackingDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.borderLight, alignItems: "center", justifyContent: "center" },
  trackingDotActive: { backgroundColor: Colors.primary },
  trackingDotCurrent: { borderWidth: 3, borderColor: Colors.primary + "40" },
  trackingLine: { width: 2, flex: 1, backgroundColor: Colors.borderLight, marginVertical: 2 },
  trackingLineActive: { backgroundColor: Colors.primary },
  trackingInfo: { marginLeft: 12, paddingBottom: 12, justifyContent: "center" },
  trackingLabel: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textLight },
  trackingLabelActive: { color: Colors.text, fontFamily: "Inter_600SemiBold" },
  trackingCurrent: { fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.primary, marginTop: 2 },
  itemCard: { flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight },
  itemImg: { width: 60, height: 60, borderRadius: 8, backgroundColor: Colors.background },
  itemInfo: { flex: 1, marginLeft: 10, justifyContent: "center" },
  itemName: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  itemVariant: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.primary, marginTop: 1 },
  itemQty: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  itemPrice: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.primary, marginTop: 2 },
  card: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.borderLight, gap: 8 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, flex: 1 },
  summaryCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  summaryValue: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  summaryDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 8 },
  summaryTotal: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.text },
  summaryTotalValue: { fontSize: 18, fontFamily: "Inter_800ExtraBold", color: Colors.primary },
  helpCard: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.borderLight },
  helpInfo: { flex: 1 },
  helpTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  helpDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  bnplDocRow: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  bnplDocHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  bnplDocLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  bnplDocBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  bnplDocBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#16A34A" },
  bnplDocImage: { width: "100%" as any, height: 140, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight },
});
