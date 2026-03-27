import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Image,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useOrders, Order, PAYMENT_METHODS } from "@/lib/order-context";
import { formatPrice } from "@/lib/data";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  confirmed: { label: "Confirmed", color: "#3B82F6", icon: "checkmark-circle" },
  processing: { label: "Processing", color: "#F59E0B", icon: "time" },
  shipped: { label: "Shipped", color: "#8B5CF6", icon: "airplane" },
  delivered: { label: "Delivered", color: Colors.primary, icon: "checkmark-done-circle" },
  cancelled: { label: "Cancelled", color: Colors.accent, icon: "close-circle" },
};

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.confirmed;
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString("en-PK", { month: "short", day: "numeric", year: "numeric" });
  const paymentLabel = PAYMENT_METHODS.find((m) => m.id === order.paymentMethod)?.label || "";

  return (
    <Pressable style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.9 }]} onPress={onPress}>
      <View style={styles.orderHeader}>
        <View>
          <Text style={styles.orderId}>{order.id}</Text>
          <Text style={styles.orderDate}>{dateStr}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.color + "15" }]}>
          <Ionicons name={status.icon} size={14} color={status.color} />
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.orderItems}>
        {order.items.slice(0, 3).map((item) => (
          <Image key={item.product.id} source={{ uri: item.product.image }} style={styles.orderItemImg} />
        ))}
        {order.items.length > 3 && (
          <View style={styles.moreItems}>
            <Text style={styles.moreItemsText}>+{order.items.length - 3}</Text>
          </View>
        )}
        <View style={styles.orderItemsInfo}>
          <Text style={styles.orderItemCount}>{order.items.reduce((s, i) => s + i.quantity, 0)} items</Text>
          <Text style={styles.orderTotal}>{formatPrice(order.total)}</Text>
        </View>
      </View>

      <View style={styles.orderFooter}>
        <View style={styles.orderFooterLeft}>
          <Ionicons name="card-outline" size={14} color={Colors.textLight} />
          <Text style={styles.orderPayment}>{paymentLabel}</Text>
        </View>
        <View style={styles.orderFooterRight}>
          <Text style={styles.orderDelivery}>Est: {order.estimatedDelivery}{(order as any).estimatedDeliveryEnd ? ` - ${(order as any).estimatedDeliveryEnd}` : ""}</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
        </View>
      </View>
    </Pressable>
  );
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const router = useRouter();
  const { orders } = useOrders();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>My Orders</Text>
        <View style={{ width: 36 }} />
      </View>

      {orders.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bag-outline" size={64} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptyDesc}>Your orders will appear here once you place them</Text>
          <Pressable
            style={({ pressed }) => [styles.shopBtn, pressed && { opacity: 0.9 }]}
            onPress={() => router.replace("/(tabs)")}
          >
            <Text style={styles.shopBtnText}>Start Shopping</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(insets.bottom, webBottomInset) + 20 }]}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!orders.length}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => router.push({ pathname: "/order-detail", params: { orderId: item.id } })}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center" },
  shopBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14, marginTop: 16 },
  shopBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  listContent: { padding: 16 },
  orderCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  orderHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 },
  orderId: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  orderDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 2 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  orderItems: { flexDirection: "row", alignItems: "center", marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  orderItemImg: { width: 44, height: 44, borderRadius: 8, backgroundColor: Colors.background, marginRight: 6 },
  moreItems: { width: 44, height: 44, borderRadius: 8, backgroundColor: Colors.background, alignItems: "center", justifyContent: "center", marginRight: 6 },
  moreItemsText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  orderItemsInfo: { flex: 1, alignItems: "flex-end" },
  orderItemCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  orderTotal: { fontSize: 16, fontFamily: "Inter_800ExtraBold", color: Colors.primary, marginTop: 2 },
  orderFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderFooterLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  orderPayment: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textLight },
  orderFooterRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  orderDelivery: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
});
