import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { CartItem, getItemPrice } from "@/lib/cart-context";
import { formatPrice } from "@/lib/data";

interface CartItemCardProps {
  item: CartItem;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export default function CartItemCard({
  item,
  onUpdateQuantity,
  onRemove,
}: CartItemCardProps) {
  const haptic = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: item.product.image }}
          style={styles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {item.product.name}
        </Text>
        {item.selectedVariant && (
          <Text style={styles.variant}>{item.selectedVariant.label}</Text>
        )}
        <Text style={styles.price}>{formatPrice(getItemPrice(item))}</Text>
        <View style={styles.controls}>
          <View style={styles.quantityRow}>
            <Pressable
              onPress={() => {
                haptic();
                onUpdateQuantity(item.quantity - 1);
              }}
              style={styles.qtyBtn}
            >
              <Ionicons name="remove" size={14} color={Colors.text} />
            </Pressable>
            <Text style={styles.qtyText}>{item.quantity}</Text>
            <Pressable
              onPress={() => {
                haptic();
                onUpdateQuantity(item.quantity + 1);
              }}
              style={styles.qtyBtn}
            >
              <Ionicons name="add" size={14} color={Colors.text} />
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              haptic();
              onRemove();
            }}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.accent} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  imageWrap: {
    width: 90,
    height: 90,
    backgroundColor: "#FAFAFA",
    padding: 6,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  info: {
    flex: 1,
    padding: 10,
    justifyContent: "space-between",
  },
  name: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    lineHeight: 16,
  },
  variant: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  price: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginTop: 2,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 3,
  },
  quantityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  qtyBtn: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    minWidth: 18,
    textAlign: "center",
  },
});
