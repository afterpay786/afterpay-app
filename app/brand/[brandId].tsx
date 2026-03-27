import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  Dimensions,
  Platform,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { brands, formatPrice } from "@/lib/data";
import { useProducts } from "@/lib/use-products";
import ProductCard from "@/components/ProductCard";

const BRAND_BANNER_DATA: Record<string, { gradient: readonly [string, string]; tagline: string; subtitle: string; image: string; badge: string }> = {
  samsung: { gradient: ["#1428A0", "#0D47A1"], tagline: "Galaxy Series 2026", subtitle: "AI-powered smartphones with stunning cameras", image: "https://images.priceoye.pk/samsung-galaxy-s25-ultra-pakistan-priceoye-bbrjh-500x500.webp", badge: "UP TO 22% OFF" },
  apple: { gradient: ["#1C1C1E", "#3A3A3C"], tagline: "iPhone 17 Series", subtitle: "The most powerful iPhone lineup ever", image: "https://images.priceoye.pk/apple-iphone-16-pro-max-pakistan-priceoye-e44qm-500x500.webp", badge: "NEW LAUNCH" },
  xiaomi: { gradient: ["#FF6900", "#FF8C00"], tagline: "Xiaomi 15 & Redmi Series", subtitle: "Leica cameras. Unmatched performance.", image: "https://images.priceoye.pk/xiaomi-15-ultra-pakistan-priceoye-1r3ac-500x500.webp", badge: "BEST VALUE" },
  infinix: { gradient: ["#0ABAB5", "#00897B"], tagline: "Zero & Note Series", subtitle: "Style meets innovation at great prices", image: "https://images.priceoye.pk/infinix-zero-40-5g-pakistan-priceoye-g9q8r-500x500.webp", badge: "TRENDING" },
  tecno: { gradient: ["#0072CE", "#0288D1"], tagline: "Camon & Spark Series", subtitle: "Camera excellence for everyone", image: "https://images.priceoye.pk/tecno-camon-40-premier-5g-pakistan-priceoye-vdsol-500x500.webp", badge: "HOT DEALS" },
  oppo: { gradient: ["#1B7340", "#2E7D32"], tagline: "Find X & Reno Series", subtitle: "Hasselblad cameras. Master every shot.", image: "https://images.priceoye.pk/oppo-find-x8-pro-pakistan-priceoye-u6zox-500x500.webp", badge: "SPECIAL OFFER" },
  vivo: { gradient: ["#415FFF", "#5C6BC0"], tagline: "X & V Series", subtitle: "ZEISS optics. Professional photography.", image: "https://images.priceoye.pk/vivo-x-fold-5-pakistan-priceoye-v2ldf-500x500.webp", badge: "FLAGSHIP" },
  realme: { gradient: ["#F5C518", "#FFA000"], tagline: "GT & Number Series", subtitle: "Dare to leap. Performance redefined.", image: "https://images.priceoye.pk/realme-gt-7-pro-pakistan-priceoye-qogsw-500x500.webp", badge: "VALUE KING" },
  nothing: { gradient: ["#000000", "#333333"], tagline: "Phone 3 & 2a Series", subtitle: "Glyph Interface. Pure innovation.", image: "https://images.priceoye.pk/nothing-phone-3-pakistan-priceoye-g9nby-500x500.webp", badge: "INNOVATIVE" },
  honor: { gradient: ["#0071C5", "#1976D2"], tagline: "Magic & X Series", subtitle: "AI-powered magic in every frame", image: "https://images.priceoye.pk/honor-magic-7-pro-pakistan-priceoye-5agc7-500x500.webp", badge: "AI POWERED" },
  itel: { gradient: ["#E53935", "#C62828"], tagline: "S & P Series", subtitle: "Affordable smartphones for everyone", image: "https://images.priceoye.pk/itel-s25-ultra-pakistan-priceoye-0n8dv-500x500.webp", badge: "BUDGET KING" },
  motorola: { gradient: ["#1A237E", "#283593"], tagline: "Edge Series", subtitle: "Hello Moto. Innovation since 1928.", image: "https://images.priceoye.pk/motorola-edge-50-fusion-pakistan-priceoye-7gfwk-500x500.webp", badge: "CLASSIC" },
};

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

const SORT_OPTIONS = [
  { key: "newest", label: "Newest First" },
  { key: "price_low", label: "Price: Low to High" },
  { key: "price_high", label: "Price: High to Low" },
  { key: "rating", label: "Highest Rated" },
  { key: "discount", label: "Biggest Discount" },
];

const PRICE_RANGES = [
  { key: "all", label: "All" },
  { key: "under15k", label: "Under 15K", max: 15000 },
  { key: "15k-25k", label: "15K-25K", min: 15000, max: 25000 },
  { key: "25k-50k", label: "25K-50K", min: 25000, max: 50000 },
  { key: "50k-100k", label: "50K-100K", min: 50000, max: 100000 },
  { key: "100k-200k", label: "100K-200K", min: 100000, max: 200000 },
  { key: "above200k", label: "200K+", min: 200000 },
];

export default function BrandScreen() {
  const { brandId } = useLocalSearchParams<{ brandId: string }>();
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const [sortBy, setSortBy] = useState("newest");
  const [showSort, setShowSort] = useState(false);
  const [priceRange, setPriceRange] = useState("all");

  const brand = brands.find((b) => b.id === brandId);
  const brandName = brand?.name || brandId || "";

  const range = PRICE_RANGES.find((r) => r.key === priceRange);
  const apiParams = useMemo(() => {
    const p: { brand?: string; minPrice?: number; maxPrice?: number; sort?: string; limit?: number } = { brand: brandName, limit: 500, sort: sortBy };
    if (range && range.key !== "all") {
      if (range.min) p.minPrice = range.min;
      if (range.max) p.maxPrice = range.max;
    }
    return p;
  }, [brandName, sortBy, priceRange]);

  const { data } = useProducts(apiParams);
  const brandProducts = data?.products || [];

  const { data: allBrandData } = useProducts({ brand: brandName, limit: 500 });
  const totalCount = allBrandData?.total || brandProducts.length;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </Pressable>
          <View style={styles.headerTitleArea}>
            <Text style={styles.headerTitle}>{brandName} Mobiles</Text>
            <Text style={styles.headerSub}>
              {totalCount} products available
            </Text>
          </View>
          <Pressable
            style={styles.searchBtn}
            onPress={() => router.push("/search")}
          >
            <Ionicons name="search" size={20} color={Colors.white} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.priceChipsRow}
        style={styles.priceChipsScroll}
      >
        {PRICE_RANGES.map((range) => (
          <Pressable
            key={range.key}
            style={[
              styles.priceChip,
              priceRange === range.key && styles.priceChipActive,
            ]}
            onPress={() => setPriceRange(range.key)}
          >
            <Text
              style={[
                styles.priceChipText,
                priceRange === range.key && styles.priceChipTextActive,
              ]}
            >
              {range.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.filtersRow}>
        <Pressable
          style={styles.filterBtn}
          onPress={() => {
            if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setShowSort(true);
          }}
        >
          <Ionicons name="swap-vertical-outline" size={16} color={Colors.text} />
          <Text style={styles.filterBtnText}>Sort By</Text>
        </Pressable>
        <Text style={styles.resultCount}>{brandProducts.length} results</Text>
      </View>

      {brandProducts.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="phone-portrait-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No products found</Text>
          <Text style={styles.emptyDesc}>
            Try a different price range
          </Text>
        </View>
      ) : (
        <FlatList
          data={brandProducts}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!brandProducts.length}
          ListHeaderComponent={() => {
            const bannerInfo = BRAND_BANNER_DATA[brandId || ""];
            if (!bannerInfo) return null;
            const allBrandProducts = allBrandData?.products || brandProducts;
            const lowestPrice = allBrandProducts.length > 0 ? Math.min(...allBrandProducts.map(p => p.price)) : 0;
            const flagshipImage = allBrandProducts.length > 0 ? allBrandProducts[0].image : bannerInfo.image;
            return (
              <View style={styles.brandBanner}>
                <LinearGradient
                  colors={[...bannerInfo.gradient]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.brandBannerGradient}
                >
                  <View style={styles.brandBannerText}>
                    <View style={styles.brandBannerBadge}>
                      <Text style={styles.brandBannerBadgeText}>{bannerInfo.badge}</Text>
                    </View>
                    <Text style={styles.brandBannerTitle}>{bannerInfo.tagline}</Text>
                    <Text style={styles.brandBannerSub}>{bannerInfo.subtitle}</Text>
                    <Text style={styles.brandBannerPrice}>Starting from {formatPrice(lowestPrice)}</Text>
                  </View>
                  <View style={styles.brandBannerImageWrap}>
                    <View style={styles.brandBannerImageGlow} />
                    <Image
                      source={{ uri: flagshipImage }}
                      style={styles.brandBannerImage}
                      contentFit="contain"
                    />
                  </View>
                </LinearGradient>
              </View>
            );
          }}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <ProductCard product={item} />
            </View>
          )}
        />
      )}

      <Modal
        visible={showSort}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSort(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowSort(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Sort By</Text>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={[
                  styles.modalOption,
                  sortBy === opt.key && styles.modalOptionActive,
                ]}
                onPress={() => {
                  setSortBy(opt.key);
                  setShowSort(false);
                }}
              >
                <Text
                  style={[
                    styles.modalOptionText,
                    sortBy === opt.key && styles.modalOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {sortBy === opt.key && (
                  <Ionicons name="checkmark" size={20} color={Colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  headerTitleArea: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter_800ExtraBold",
    color: Colors.white,
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
  },
  searchBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  priceChipsScroll: {
    backgroundColor: Colors.background,
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  priceChipsRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center",
  },
  priceChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  priceChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priceChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  priceChipTextActive: {
    color: Colors.white,
    fontFamily: "Inter_700Bold",
  },
  filtersRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterBtnText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  resultCount: {
    flex: 1,
    textAlign: "right",
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
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
    paddingBottom: 40,
  },
  columnWrapper: {
    gap: 12,
  },
  gridItem: {
    width: CARD_WIDTH,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: "center",
    marginVertical: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 12,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  modalOptionActive: {
    backgroundColor: Colors.primary + "10",
  },
  modalOptionText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  modalOptionTextActive: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  brandBanner: {
    marginBottom: 16,
    borderRadius: 14,
    overflow: "hidden",
  },
  brandBannerGradient: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    minHeight: 120,
  },
  brandBannerText: {
    flex: 1,
  },
  brandBannerBadge: {
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 6,
  },
  brandBannerBadgeText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
    letterSpacing: 0.5,
  },
  brandBannerTitle: {
    fontSize: 16,
    fontFamily: "Inter_800ExtraBold",
    color: "#FFF",
    marginBottom: 3,
  },
  brandBannerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.85)",
    marginBottom: 6,
  },
  brandBannerPrice: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFD700",
  },
  brandBannerImageWrap: {
    width: 100,
    height: 110,
    alignItems: "center",
    justifyContent: "center",
  },
  brandBannerImageGlow: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  brandBannerImage: {
    width: 95,
    height: 105,
  },
});
