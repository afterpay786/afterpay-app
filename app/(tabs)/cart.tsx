import React from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/lib/data";
import CartItemCard from "@/components/CartItemCard";

export default function CartScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const router = useRouter();
  const { items, updateQuantity, removeFromCart, getTotal, clearCart } =
    useCart();
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  const handleCheckout = () => {
    router.push("/checkout");
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Shopping Cart</Text>
        <Text style={styles.headerSub}>
          {items.length} {items.length === 1 ? "item" : "items"}
        </Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="cart-outline" size={64} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptyDesc}>
            Browse products and add items to your cart
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item) => item.product.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!!items.length}
            renderItem={({ item }) => (
              <CartItemCard
                item={item}
                onUpdateQuantity={(qty) =>
                  updateQuantity(item.product.id, qty)
                }
                onRemove={() => removeFromCart(item.product.id)}
              />
            )}
          />
          <View
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, webBottomInset) + 90 },
            ]}
          >
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalPrice}>{formatPrice(getTotal())}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.checkoutBtn,
                pressed && styles.checkoutPressed,
              ]}
              onPress={handleCheckout}
            >
              <Ionicons name="bag-check" size={20} color={Colors.white} />
              <Text style={styles.checkoutText}>Checkout</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_800ExtraBold",
    color: Colors.white,
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginTop: 8,
  },
  emptyDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
  },
  footer: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  totalPrice: {
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    color: Colors.text,
  },
  checkoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
  },
  checkoutPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  checkoutText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
});
