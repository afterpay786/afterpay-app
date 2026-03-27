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
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { brands } from "@/lib/data";
import { useAllProducts } from "@/lib/use-products";

const brandColors: Record<string, string> = {
  samsung: "#1428A0",
  apple: "#333333",
  infinix: "#F7941E",
  oppo: "#1BA855",
  xiaomi: "#FF6900",
  tecno: "#0066FF",
  vivo: "#415FFF",
  realme: "#F5C518",
  nothing: "#000000",
  honor: "#00A4EF",
  itel: "#E60012",
  motorola: "#5C2D91",
};

const brandLogos: Record<string, string> = {
  samsung: "S",
  apple: "",
  infinix: "X",
  oppo: "O",
  xiaomi: "Mi",
  tecno: "T",
  vivo: "V",
  realme: "R",
  nothing: "N",
  honor: "H",
  itel: "i",
  motorola: "M",
};

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);

  const { data: allData } = useAllProducts();
  const allProducts = allData?.products || [];

  const getMinPrice = (brandId: string) => {
    const brandProds = allProducts.filter(
      (p) => p.brand.toLowerCase() === brandId.toLowerCase()
    );
    if (brandProds.length === 0) return 0;
    return Math.min(...brandProds.map((p) => p.price));
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Brands</Text>
        <Text style={styles.headerSub}>Browse by your favorite brand</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {brands.map((brand) => {
            const count = allProducts.filter(
              (p) => p.brand.toLowerCase() === brand.id.toLowerCase()
            ).length;
            const color = brandColors[brand.id] || Colors.primary;
            const minPrice = getMinPrice(brand.id);

            return (
              <Pressable
                key={brand.id}
                style={({ pressed }) => [
                  styles.brandCard,
                  pressed && styles.pressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/brand/[brandId]",
                    params: { brandId: brand.id },
                  })
                }
              >
                <View style={[styles.brandLogo, { backgroundColor: color }]}>
                  {brand.id === "apple" ? (
                    <Ionicons name="logo-apple" size={24} color={Colors.white} />
                  ) : (
                    <Text style={styles.brandLogoText}>{brandLogos[brand.id] || brand.name[0]}</Text>
                  )}
                </View>
                <Text style={styles.brandName}>{brand.name}</Text>
                <Text style={styles.brandCount}>{count} Phones</Text>
                <View style={styles.brandPriceRow}>
                  <Text style={styles.brandStarting}>Starting from</Text>
                  <Text style={styles.brandMinPrice}>
                    Rs {Math.round(minPrice / 1000)}K
                  </Text>
                </View>
                <View style={styles.brandArrow}>
                  <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
            <View style={styles.infoTextArea}>
              <Text style={styles.infoTitle}>Official Online Retailer</Text>
              <Text style={styles.infoDesc}>All phones are PTA approved with warranty</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="car" size={20} color={Colors.primary} />
            <View style={styles.infoTextArea}>
              <Text style={styles.infoTitle}>Free Delivery Nationwide</Text>
              <Text style={styles.infoDesc}>Fast delivery across Pakistan</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="swap-horizontal" size={20} color={Colors.primary} />
            <View style={styles.infoTextArea}>
              <Text style={styles.infoTitle}>7 Day Easy Return</Text>
              <Text style={styles.infoDesc}>Hassle-free return policy</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  brandCard: {
    width: "47.5%",
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    position: "relative",
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  brandLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  brandLogoText: {
    fontSize: 18,
    fontFamily: "Inter_800ExtraBold",
    color: Colors.white,
  },
  brandName: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 2,
  },
  brandCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  brandPriceRow: {
    alignItems: "center",
  },
  brandStarting: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textLight,
  },
  brandMinPrice: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  brandArrow: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  infoCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    marginTop: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoTextArea: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  infoDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
});
