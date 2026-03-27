import React, { memo } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { Product, formatPrice } from "@/lib/data";
import { useWishlist } from "@/lib/wishlist-context";
import { router } from "expo-router";

interface ProductCardProps {
  product: Product;
  width?: number;
}

function ProductCardInner({ product, width }: ProductCardProps) {
  const { isInWishlist, toggleWishlist } = useWishlist();
  const wishlisted = isInWishlist(product.id);

  const handlePress = () => {
    router.push({ pathname: "/product/[id]", params: { id: product.id } });
  };

  const handleWishlist = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleWishlist(product);
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        width ? { width } : { flex: 1 },
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
      testID={`product-${product.id}`}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: product.image }}
          style={styles.image}
          contentFit="contain"
          transition={150}
          cachePolicy="memory-disk"
          recyclingKey={product.id}
        />
        <Pressable style={styles.heartButton} onPress={handleWishlist}>
          <Ionicons
            name={wishlisted ? "heart" : "heart-outline"}
            size={16}
            color={wishlisted ? Colors.accent : Colors.textLight}
          />
        </Pressable>
        {product.discount > 0 && (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{product.discount}% OFF</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={10} color={Colors.star} />
          <Text style={styles.rating}>{product.rating}</Text>
          <Text style={styles.reviews}>{product.reviews} Reviews</Text>
        </View>
        <Text style={styles.name} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.priceRow}>
          {(product.storageOptions?.length ?? 0) > 1 ? (
            <Text style={styles.price}>From {formatPrice(product.price)}</Text>
          ) : (
            <Text style={styles.price}>{formatPrice(product.price)}</Text>
          )}
        </View>
        {product.originalPrice > product.price && (
          <Text style={styles.originalPrice}>
            {formatPrice(product.originalPrice)}
          </Text>
        )}
        {product.fastDelivery && (
          <View style={styles.deliveryBadge}>
            <Ionicons name="flash" size={8} color={Colors.white} />
            <Text style={styles.deliveryText}>Fast Delivery</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const ProductCard = memo(ProductCardInner, (prev, next) => {
  return prev.product.id === next.product.id && prev.width === next.width;
});

export default ProductCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  pressed: {
    opacity: 0.95,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: "#FAFAFA",
    position: "relative",
    padding: 8,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  heartButton: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  discountBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: Colors.discount,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  discountText: {
    color: Colors.white,
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  info: {
    padding: 8,
    paddingTop: 6,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: 3,
  },
  rating: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  reviews: {
    fontSize: 9,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
  },
  name: {
    fontSize: 11.5,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
    marginBottom: 3,
    lineHeight: 15,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  price: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  originalPrice: {
    fontSize: 10,
    color: Colors.textLight,
    textDecorationLine: "line-through",
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  deliveryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    backgroundColor: Colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: "flex-start",
    marginTop: 4,
  },
  deliveryText: {
    color: Colors.white,
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
  },
});
