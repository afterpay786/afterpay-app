import React, { useRef, useEffect, useState, useCallback, memo, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Platform,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { products, brands, formatPrice } from "@/lib/data";
import { useAllProducts } from "@/lib/use-products";
import ProductCard from "@/components/ProductCard";
import BrandChip from "@/components/BrandChip";
import SearchHeader from "@/components/SearchHeader";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;
const BANNER_WIDTH = SCREEN_WIDTH - 32;
const INITIAL_PRODUCTS = 20;
const LOAD_MORE_COUNT = 20;

const PRICE_CHIPS = [
  { label: "Under 15K", max: 15000 },
  { label: "15K - 25K", min: 15000, max: 25000 },
  { label: "25K - 50K", min: 25000, max: 50000 },
  { label: "50K - 100K", min: 50000, max: 100000 },
  { label: "100K+", min: 100000 },
];

const HERO_BANNERS = [
  {
    id: "hero1",
    gradient: ["#1A1A2E", "#16213E", "#0F3460"] as const,
    tag: "NEW ARRIVAL",
    tagColor: "#E94560",
    title: "Samsung Galaxy S25 Ultra",
    subtitle: "AI is here. Welcome to the era of Galaxy AI",
    price: 356999,
    originalPrice: 459999,
    image: "https://images.priceoye.pk/samsung-galaxy-s25-ultra-pakistan-priceoye-bbrjh-500x500.webp",
    brandId: "samsung",
    productId: "s1",
    features: ["200MP Camera", "Snapdragon 8 Elite", "Galaxy AI"],
  },
  {
    id: "hero2",
    gradient: ["#000000", "#1C1C1E", "#2C2C2E"] as const,
    tag: "FLAGSHIP",
    tagColor: "#007AFF",
    title: "iPhone 17 Pro Max",
    subtitle: "The most powerful iPhone ever",
    price: 529999,
    originalPrice: 609999,
    image: "https://images.priceoye.pk/apple-iphone-16-pro-max-pakistan-priceoye-e44qm-500x500.webp",
    brandId: "apple",
    productId: "a1",
    features: ["48MP Camera", "A18 Pro Chip", "Titanium Design"],
  },
  {
    id: "hero3",
    gradient: ["#FF6B35", "#F7931E", "#FFB627"] as const,
    tag: "BEST SELLER",
    tagColor: "#FFFFFF",
    title: "Xiaomi 15 Ultra",
    subtitle: "Leica optics. Unmatched performance.",
    price: 298399,
    originalPrice: 349999,
    image: "https://images.priceoye.pk/xiaomi-15-ultra-pakistan-priceoye-1r3ac-500x500.webp",
    brandId: "xiaomi",
    productId: "x1",
    features: ["Leica Camera", "Snapdragon 8 Elite", "5400mAh"],
  },
  {
    id: "hero4",
    gradient: ["#6C3483", "#8E44AD", "#BB8FCE"] as const,
    tag: "TRENDING",
    tagColor: "#F1C40F",
    title: "Nothing Phone 3",
    subtitle: "Glyph Interface 2.0. Pure innovation.",
    price: 310999,
    originalPrice: 349999,
    image: "https://images.priceoye.pk/nothing-phone-3-pakistan-priceoye-g9nby-500x500.webp",
    brandId: "nothing",
    productId: "n1",
    features: ["Glyph Interface", "Snapdragon 8s Gen 4", "50MP AI Camera"],
  },
  {
    id: "hero5",
    gradient: ["#1B4332", "#2D6A4F", "#52B788"] as const,
    tag: "SPECIAL OFFER",
    tagColor: "#FFD700",
    title: "OPPO Find X8 Pro",
    subtitle: "Hasselblad camera. Master every shot.",
    price: 259999,
    originalPrice: 299999,
    image: "https://images.priceoye.pk/oppo-find-x8-pro-pakistan-priceoye-u6zox-500x500.webp",
    brandId: "oppo",
    productId: "op1",
    features: ["Hasselblad Camera", "Dimensity 9400", "5800mAh"],
  },
];

const BRAND_PROMOS = [
  {
    id: "promo_samsung",
    brandId: "samsung",
    gradient: ["#1428A0", "#0D47A1"] as const,
    logo: "Samsung",
    tagline: "Galaxy Series 2026",
    subtitle: "Starting from Rs. 39,999",
    image: "https://images.priceoye.pk/samsung-galaxy-s25-ultra-pakistan-priceoye-c7mzk-500x500.webp",
    badge: "UP TO 22% OFF",
  },
  {
    id: "promo_apple",
    brandId: "apple",
    gradient: ["#1C1C1E", "#3A3A3C"] as const,
    logo: "Apple",
    tagline: "iPhone 17 Series",
    subtitle: "Starting from Rs. 219,999",
    image: "https://images.priceoye.pk/apple-iphone-16-pro-max-pakistan-priceoye-e44qm-500x500.webp",
    badge: "NEW LAUNCH",
  },
  {
    id: "promo_xiaomi",
    brandId: "xiaomi",
    gradient: ["#FF6900", "#FF8C00"] as const,
    logo: "Xiaomi",
    tagline: "Redmi & POCO Series",
    subtitle: "Starting from Rs. 29,199",
    image: "https://images.priceoye.pk/xiaomi-15-ultra-pakistan-priceoye-1r3ac-500x500.webp",
    badge: "BEST VALUE",
  },
];

const MID_BANNERS = [
  {
    id: "mid1",
    gradient: ["#E8F5E9", "#C8E6C9"] as const,
    icon: "shield-checkmark" as const,
    iconColor: "#2E7D32",
    title: "100% PTA Approved",
    subtitle: "All phones are officially approved by PTA Pakistan",
    textColor: "#1B5E20",
  },
  {
    id: "mid2",
    gradient: ["#FFF3E0", "#FFE0B2"] as const,
    icon: "car" as const,
    iconColor: "#E65100",
    title: "Free Nationwide Delivery",
    subtitle: "Free shipping on orders above Rs. 50,000",
    textColor: "#BF360C",
  },
  {
    id: "mid3",
    gradient: ["#E3F2FD", "#BBDEFB"] as const,
    icon: "refresh" as const,
    iconColor: "#1565C0",
    title: "7-Day Easy Returns",
    subtitle: "Hassle-free return policy on all products",
    textColor: "#0D47A1",
  },
  {
    id: "mid4",
    gradient: ["#F3E5F5", "#E1BEE7"] as const,
    icon: "card" as const,
    iconColor: "#7B1FA2",
    title: "Installment Plans",
    subtitle: "Buy now, pay later with easy installments",
    textColor: "#4A148C",
  },
];

const CATEGORY_DEALS = [
  { id: "cat1", label: "Budget Phones", subtitle: "Under Rs. 25,000", icon: "wallet-outline" as const, color: "#10B981", bgColor: "#ECFDF5" },
  { id: "cat2", label: "Camera Phones", subtitle: "Best cameras", icon: "camera-outline" as const, color: "#8B5CF6", bgColor: "#F5F3FF" },
  { id: "cat3", label: "Gaming Phones", subtitle: "High performance", icon: "game-controller-outline" as const, color: "#EF4444", bgColor: "#FEF2F2" },
  { id: "cat4", label: "5G Phones", subtitle: "Future ready", icon: "cellular-outline" as const, color: "#3B82F6", bgColor: "#EFF6FF" },
];

const TICKER_ITEMS = [
  { icon: "flash" as const, text: "Flash Sale Live - Up to 30% OFF!", color: "#EF4444" },
  { icon: "shield-checkmark" as const, text: "100% PTA Approved Phones", color: "#4EA97A" },
  { icon: "car" as const, text: "Free Delivery Nationwide", color: "#3B82F6" },
  { icon: "pricetag" as const, text: "Best Price Guarantee", color: "#F59E0B" },
  { icon: "card" as const, text: "Easy Installments Available", color: "#8B5CF6" },
  { icon: "star" as const, text: "Samsung S25 Ultra - Rs 356,999", color: "#1428A0" },
  { icon: "star" as const, text: "iPhone 17 Pro Max - Rs 529,999", color: "#000" },
  { icon: "refresh" as const, text: "7-Day Easy Returns", color: "#10B981" },
];

const showcaseBrands = [
  { id: "samsung", name: "Samsung", color: "#1428A0", phones: "22 Phones" },
  { id: "apple", name: "Apple", color: "#000000", phones: "13 Phones" },
  { id: "xiaomi", name: "Xiaomi", color: "#FF6900", phones: "24 Phones" },
  { id: "oppo", name: "OPPO", color: "#1B7340", phones: "14 Phones" },
  { id: "vivo", name: "Vivo", color: "#415FFF", phones: "13 Phones" },
  { id: "realme", name: "Realme", color: "#F5C518", phones: "16 Phones" },
  { id: "infinix", name: "Infinix", color: "#0ABAB5", phones: "10 Phones" },
  { id: "tecno", name: "Tecno", color: "#0072CE", phones: "9 Phones" },
  { id: "nothing", name: "Nothing", color: "#000000", phones: "7 Phones" },
  { id: "honor", name: "Honor", color: "#0071C5", phones: "9 Phones" },
];


const HeroBannerCarousel = memo(function HeroBannerCarousel() {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startAutoScroll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % HERO_BANNERS.length;
        scrollRef.current?.scrollTo({ x: next * (BANNER_WIDTH + 12), animated: true });
        return next;
      });
    }, 4000);
  }, []);

  useEffect(() => {
    startAutoScroll();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startAutoScroll]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (BANNER_WIDTH + 12));
    if (idx !== activeIndex && idx >= 0 && idx < HERO_BANNERS.length) {
      setActiveIndex(idx);
    }
  };

  return (
    <View style={heroStyles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={BANNER_WIDTH + 12}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={heroStyles.scrollContent}
        onScroll={handleScroll}
        onScrollBeginDrag={() => { if (intervalRef.current) clearInterval(intervalRef.current); }}
        onScrollEndDrag={startAutoScroll}
        scrollEventThrottle={64}
      >
        {HERO_BANNERS.map((banner) => (
          <Pressable
            key={banner.id}
            style={heroStyles.slide}
            onPress={() => router.push({ pathname: "/product/[id]", params: { id: banner.productId } })}
          >
            <LinearGradient
              colors={[...banner.gradient]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={heroStyles.gradient}
            >
              <View style={heroStyles.content}>
                <View style={heroStyles.textArea}>
                  <View style={[heroStyles.tag, { backgroundColor: banner.tagColor }]}>
                    <Text style={heroStyles.tagText}>{banner.tag}</Text>
                  </View>
                  <Text style={heroStyles.title} numberOfLines={2}>{banner.title}</Text>
                  <Text style={heroStyles.subtitle} numberOfLines={2}>{banner.subtitle}</Text>
                  <View style={heroStyles.priceRow}>
                    <Text style={heroStyles.price}>{formatPrice(banner.price)}</Text>
                    <Text style={heroStyles.originalPrice}>{formatPrice(banner.originalPrice)}</Text>
                  </View>
                  <View style={heroStyles.featuresRow}>
                    {banner.features.map((f) => (
                      <View key={f} style={heroStyles.featurePill}>
                        <Text style={heroStyles.featureText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={heroStyles.shopBtn}>
                    <Text style={heroStyles.shopBtnText}>Shop Now</Text>
                    <Ionicons name="arrow-forward" size={12} color="#FFF" />
                  </View>
                </View>
                <View style={heroStyles.imageArea}>
                  <View style={heroStyles.imageGlow} />
                  <Image
                    source={{ uri: banner.image }}
                    style={heroStyles.productImage}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>
      <View style={heroStyles.dots}>
        {HERO_BANNERS.map((b, i) => (
          <View
            key={b.id}
            style={[heroStyles.dot, i === activeIndex && heroStyles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
});

const BrandPromoStrip = memo(function BrandPromoStrip() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={promoStyles.scrollContent}
    >
      {BRAND_PROMOS.map((promo) => (
        <Pressable
          key={promo.id}
          style={promoStyles.card}
          onPress={() => router.push({ pathname: "/brand/[brandId]", params: { brandId: promo.brandId } })}
        >
          <LinearGradient
            colors={[...promo.gradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={promoStyles.gradient}
          >
            <View style={promoStyles.textArea}>
              <Text style={promoStyles.logo}>{promo.logo}</Text>
              <Text style={promoStyles.tagline}>{promo.tagline}</Text>
              <Text style={promoStyles.subtitle}>{promo.subtitle}</Text>
              <View style={promoStyles.badge}>
                <Text style={promoStyles.badgeText}>{promo.badge}</Text>
              </View>
            </View>
            <Image
              source={{ uri: promo.image }}
              style={promoStyles.image}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          </LinearGradient>
        </Pressable>
      ))}
    </ScrollView>
  );
});

const TrustBadges = memo(function TrustBadges() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={trustStyles.scrollContent}
    >
      {MID_BANNERS.map((item) => (
        <View key={item.id} style={trustStyles.card}>
          <LinearGradient
            colors={[...item.gradient]}
            style={trustStyles.gradient}
          >
            <View style={[trustStyles.iconCircle, { backgroundColor: item.iconColor + "20" }]}>
              <Ionicons name={item.icon} size={22} color={item.iconColor} />
            </View>
            <Text style={[trustStyles.title, { color: item.textColor }]}>{item.title}</Text>
            <Text style={[trustStyles.subtitle, { color: item.textColor + "BB" }]}>{item.subtitle}</Text>
          </LinearGradient>
        </View>
      ))}
    </ScrollView>
  );
});

const CategoryDeals = memo(function CategoryDeals() {
  return (
    <View style={catStyles.container}>
      {CATEGORY_DEALS.map((cat) => (
        <Pressable
          key={cat.id}
          style={[catStyles.card, { backgroundColor: cat.bgColor }]}
          onPress={() => router.push("/search")}
        >
          <View style={[catStyles.iconCircle, { backgroundColor: cat.color + "20" }]}>
            <Ionicons name={cat.icon} size={20} color={cat.color} />
          </View>
          <Text style={[catStyles.label, { color: cat.color }]}>{cat.label}</Text>
          <Text style={catStyles.subtitle}>{cat.subtitle}</Text>
        </Pressable>
      ))}
    </View>
  );
});

const FlashDealBanner = memo(function FlashDealBanner() {
  const [timeLeft, setTimeLeft] = useState(() => {
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    return Math.max(0, Math.floor((endOfDay.getTime() - now.getTime()) / 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
          const now = new Date();
          const endOfDay = new Date(now);
          endOfDay.setHours(23, 59, 59, 999);
          return Math.floor((endOfDay.getTime() - now.getTime()) / 1000);
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = String(Math.floor(timeLeft / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((timeLeft % 3600) / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");

  return (
    <Pressable
      style={flashStyles.container}
      onPress={() => router.push("/search")}
    >
      <LinearGradient
        colors={["#DC2626", "#EF4444", "#F87171"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={flashStyles.gradient}
      >
        <View style={flashStyles.leftArea}>
          <View style={flashStyles.flashRow}>
            <Ionicons name="flash" size={18} color="#FFD700" />
            <Text style={flashStyles.flashTitle}>Flash Sale</Text>
            <Ionicons name="flash" size={18} color="#FFD700" />
          </View>
          <Text style={flashStyles.flashSubtitle}>Up to 30% OFF on selected phones</Text>
          <View style={flashStyles.timerRow}>
            {[hours, minutes, seconds].map((t, i) => (
              <React.Fragment key={i}>
                <View style={flashStyles.timerBox}>
                  <Text style={flashStyles.timerText}>{t}</Text>
                </View>
                {i < 2 && <Text style={flashStyles.timerSep}>:</Text>}
              </React.Fragment>
            ))}
          </View>
        </View>
        <View style={flashStyles.shopArea}>
          <Text style={flashStyles.shopText}>SHOP NOW</Text>
          <Ionicons name="arrow-forward" size={14} color="#FFF" />
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const WhyChooseUs = memo(function WhyChooseUs() {
  const items = [
    { icon: "shield-checkmark" as const, title: "Genuine Products", desc: "100% authentic & PTA approved" },
    { icon: "pricetag" as const, title: "Best Prices", desc: "Lowest prices guaranteed" },
    { icon: "car" as const, title: "Fast Delivery", desc: "2-5 days nationwide" },
    { icon: "card" as const, title: "Easy Payment", desc: "COD & installments available" },
  ];

  return (
    <View style={whyStyles.container}>
      <Text style={whyStyles.heading}>Why Choose AFTER PAY?</Text>
      <View style={whyStyles.grid}>
        {items.map((item) => (
          <View key={item.title} style={whyStyles.card}>
            <View style={whyStyles.iconCircle}>
              <Ionicons name={item.icon} size={20} color={Colors.primary} />
            </View>
            <Text style={whyStyles.title}>{item.title}</Text>
            <Text style={whyStyles.desc}>{item.desc}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const BrandShowcase = memo(function BrandShowcase() {
  return (
    <View style={brandShowStyles.container}>
      <View style={brandShowStyles.header}>
        <Text style={brandShowStyles.heading}>Shop by Brand</Text>
        <Pressable onPress={() => router.push("/(tabs)/categories")} style={brandShowStyles.seeAll}>
          <Text style={brandShowStyles.seeAllText}>View All</Text>
          <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
        </Pressable>
      </View>
      <View style={brandShowStyles.grid}>
        {showcaseBrands.map((b) => (
          <Pressable
            key={b.id}
            style={brandShowStyles.card}
            onPress={() => router.push({ pathname: "/brand/[brandId]", params: { brandId: b.id } })}
          >
            <View style={[brandShowStyles.brandCircle, { backgroundColor: b.color + "15" }]}>
              <Text style={[brandShowStyles.brandInitial, { color: b.color }]}>
                {b.name.charAt(0)}
              </Text>
            </View>
            <Text style={brandShowStyles.brandName}>{b.name}</Text>
            <Text style={brandShowStyles.phoneCount}>{b.phones}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

const PromoTicker = memo(function PromoTicker() {
  const scrollX = useRef(new Animated.Value(0)).current;
  const tickerWidth = TICKER_ITEMS.length * 220;

  useEffect(() => {
    const animate = () => {
      scrollX.setValue(0);
      Animated.timing(scrollX, {
        toValue: -tickerWidth,
        duration: tickerWidth * 25,
        useNativeDriver: true,
      }).start(() => animate());
    };
    animate();
    return () => scrollX.stopAnimation();
  }, []);

  const allItems = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <View style={tickerStyles.container}>
      <LinearGradient
        colors={["#1B5E20", "#2E7D32", "#388E3C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={tickerStyles.gradient}
      >
        <Animated.View style={[tickerStyles.scrollRow, { transform: [{ translateX: scrollX }] }]}>
          {allItems.map((item, i) => (
            <View key={i} style={tickerStyles.item}>
              <Ionicons name={item.icon} size={12} color="#FFD700" />
              <Text style={tickerStyles.text}>{item.text}</Text>
              <Text style={tickerStyles.separator}>|</Text>
            </View>
          ))}
        </Animated.View>
      </LinearGradient>
    </View>
  );
});

function MidAd({ brandId, colors, brand, title, subtitle, ctaText, image, brandStyle }: {
  brandId: string;
  colors: readonly [string, string];
  brand: string;
  title: string;
  subtitle: string;
  ctaText: string;
  image: string;
  brandStyle?: object;
}) {
  return (
    <Pressable
      style={midAdStyles.container}
      onPress={() => router.push({ pathname: "/brand/[brandId]", params: { brandId } })}
    >
      <LinearGradient
        colors={[...colors]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={midAdStyles.gradient}
      >
        <View style={midAdStyles.textArea}>
          <Text style={[midAdStyles.brand, brandStyle]}>{brand}</Text>
          <Text style={midAdStyles.title}>{title}</Text>
          <Text style={midAdStyles.subtitle}>{subtitle}</Text>
          <View style={midAdStyles.cta}>
            <Text style={midAdStyles.ctaText}>{ctaText}</Text>
            <Ionicons name="arrow-forward" size={12} color="#FFF" />
          </View>
        </View>
        <Image
          source={{ uri: image }}
          style={midAdStyles.image}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </LinearGradient>
    </Pressable>
  );
}

const HorizontalProductList = memo(function HorizontalProductList({ data }: { data: typeof products }) {
  const renderItem = useCallback(({ item }: { item: (typeof products)[0] }) => (
    <ProductCard product={item} width={CARD_WIDTH} />
  ), []);
  return (
    <FlatList
      data={data}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.horizontalList}
      renderItem={renderItem}
      scrollEnabled={!!data.length}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={3}
    />
  );
});

type SectionItem =
  | { type: "brands" }
  | { type: "hero" }
  | { type: "priceChips" }
  | { type: "flash" }
  | { type: "topDeals"; data: (typeof products)[number][] }
  | { type: "brandPromo" }
  | { type: "trustBadges" }
  | { type: "categoryDeals" }
  | { type: "newArrivals"; data: any[]; isLive: boolean }
  | { type: "midAd1" }
  | { type: "budgetPhones"; data: (typeof products)[number][] }
  | { type: "midAd2" }
  | { type: "brandShowcase" }
  | { type: "premiumPhones"; data: (typeof products)[number][] }
  | { type: "midAd3" }
  | { type: "whyChoose" }
  | { type: "allPhonesHeader"; count: number }
  | { type: "productRow"; items: (typeof products)[number][] }
  | { type: "loadMore"; loaded: number; total: number }
  | { type: "bottomSpacer" };

export default function HomeScreen() {
  const { data: allData } = useAllProducts();
  // Use local data immediately (zero-delay render), switch to API data when available
  const apiProducts = allData?.products || [];
  const activeProducts = apiProducts.length > 0 ? apiProducts : products;

  const dealProducts = useMemo(() => activeProducts.filter((p) => p.discount >= 9), [activeProducts]);
  const budgetPhones = useMemo(() => activeProducts.filter((p) => p.price <= 30000).slice(0, 8), [activeProducts]);
  const premiumPhones = useMemo(() => activeProducts.filter((p) => p.price >= 200000).slice(0, 8), [activeProducts]);
  const newArrivals = useMemo(() => activeProducts.slice(0, 12), [activeProducts]);

  const [visibleCount, setVisibleCount] = useState(INITIAL_PRODUCTS);

  const productRows = useMemo(() => {
    const visible = activeProducts.slice(0, visibleCount);
    const rows: (typeof products)[number][][] = [];
    for (let i = 0; i < visible.length; i += 2) {
      rows.push(visible.slice(i, i + 2));
    }
    return rows;
  }, [activeProducts, visibleCount]);

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + LOAD_MORE_COUNT, activeProducts.length));
  }, [activeProducts.length]);

  // Keep a ref to loadMore so renderSection (which has zero deps) can always call the current version
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const sections = useMemo<SectionItem[]>(() => [
    { type: "brands" },
    { type: "hero" },
    { type: "priceChips" },
    { type: "flash" },
    { type: "topDeals", data: dealProducts },
    { type: "brandPromo" },
    { type: "trustBadges" },
    { type: "categoryDeals" },
    { type: "newArrivals", data: newArrivals, isLive: apiProducts.length > 0 },
    { type: "midAd1" },
    { type: "budgetPhones", data: budgetPhones },
    { type: "midAd2" },
    { type: "brandShowcase" },
    { type: "premiumPhones", data: premiumPhones },
    { type: "midAd3" },
    { type: "whyChoose" },
    { type: "allPhonesHeader", count: activeProducts.length },
    ...productRows.map((items) => ({ type: "productRow" as const, items })),
    ...(visibleCount < activeProducts.length ? [{ type: "loadMore" as const, loaded: visibleCount, total: activeProducts.length }] : []),
    { type: "bottomSpacer" },
  ], [dealProducts, budgetPhones, premiumPhones, newArrivals, productRows, visibleCount, activeProducts.length, apiProducts.length]);

  // renderSection has ZERO closure deps — all data comes through the item object.
  // This prevents FlatList from re-rendering every visible cell when state changes.
  const renderSection = useCallback(({ item }: { item: SectionItem }) => {
    switch (item.type) {
      case "brands":
        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandsRow}>
            {brands.map((brand) => (
              <BrandChip
                key={brand.id}
                name={brand.name}
                onPress={() => router.push({ pathname: "/brand/[brandId]", params: { brandId: brand.id } })}
              />
            ))}
          </ScrollView>
        );
      case "hero":
        return <HeroBannerCarousel />;
      case "priceChips":
        return (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.priceChipsRow}>
            {PRICE_CHIPS.map((chip) => (
              <Pressable key={chip.label} style={styles.priceChip} onPress={() => router.push("/search")}>
                <Text style={styles.priceChipText}>{chip.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        );
      case "flash":
        return <FlashDealBanner />;
      case "topDeals":
        return item.data.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="flame" size={18} color="#EF4444" />
                <Text style={styles.sectionTitle}>Top Deals</Text>
              </View>
              <Pressable onPress={() => router.push("/search")} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See All</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </Pressable>
            </View>
            <HorizontalProductList data={item.data} />
          </View>
        ) : null;
      case "brandPromo":
        return <BrandPromoStrip />;
      case "trustBadges":
        return <TrustBadges />;
      case "categoryDeals":
        return <CategoryDeals />;
      case "newArrivals":
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="sparkles" size={18} color="#F59E0B" />
                <Text style={styles.sectionTitle}>New Arrivals</Text>
                {item.isLive && (
                  <View style={{ backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, marginLeft: 6 }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#D97706" }}>LIVE</Text>
                  </View>
                )}
              </View>
              <Pressable onPress={() => router.push("/search")} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>View All</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </Pressable>
            </View>
            <HorizontalProductList data={item.data} />
          </View>
        );
      case "midAd1":
        return (
          <MidAd
            brandId="samsung"
            colors={["#1A1A2E", "#16213E"]}
            brand="SAMSUNG"
            title="Galaxy S25 Series"
            subtitle="The next generation of Galaxy AI"
            ctaText="Explore Collection"
            image="https://images.priceoye.pk/samsung-galaxy-s25-ultra-pakistan-priceoye-ra80n-500x500.webp"
          />
        );
      case "budgetPhones":
        return item.data.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="wallet" size={18} color="#10B981" />
                <Text style={styles.sectionTitle}>Budget Friendly</Text>
              </View>
              <Pressable onPress={() => router.push("/search")} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See All</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </Pressable>
            </View>
            <HorizontalProductList data={item.data} />
          </View>
        ) : null;
      case "midAd2":
        return (
          <MidAd
            brandId="apple"
            colors={["#000000", "#1C1C1E"]}
            brand="APPLE"
            title="iPhone 17 Series"
            subtitle="Designed to be loved"
            ctaText="Shop iPhones"
            image="https://images.priceoye.pk/apple-iphone-16-pro-max-pakistan-priceoye-e44qm-500x500.webp"
            brandStyle={{ letterSpacing: 2 }}
          />
        );
      case "brandShowcase":
        return <BrandShowcase />;
      case "premiumPhones":
        return item.data.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="diamond" size={18} color="#8B5CF6" />
                <Text style={styles.sectionTitle}>Premium Collection</Text>
              </View>
              <Pressable onPress={() => router.push("/search")} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>See All</Text>
                <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
              </Pressable>
            </View>
            <HorizontalProductList data={item.data} />
          </View>
        ) : null;
      case "midAd3":
        return (
          <MidAd
            brandId="xiaomi"
            colors={["#FF6900", "#FF8C00"]}
            brand="XIAOMI"
            title="Redmi & POCO"
            subtitle="Performance meets affordability"
            ctaText="View Range"
            image="https://images.priceoye.pk/xiaomi-15-ultra-pakistan-priceoye-1r3ac-500x500.webp"
          />
        );
      case "whyChoose":
        return <WhyChooseUs />;
      case "allPhonesHeader":
        return (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>All Mobile Phones in Pakistan 2026</Text>
            </View>
            <Text style={styles.sectionSubtext}>
              {item.count} results for Mobiles. Find a wide range of mobiles
              at the lowest rates, only at AFTER PAY.
            </Text>
          </View>
        );
      case "productRow":
        return (
          <View style={styles.productRowContainer}>
            {item.items.map((product) => (
              <View key={product.id} style={styles.gridItem}>
                <ProductCard product={product} />
              </View>
            ))}
            {item.items.length === 1 && <View style={styles.gridItem} />}
          </View>
        );
      case "loadMore":
        return (
          <Pressable style={styles.loadMoreBtn} onPress={() => loadMoreRef.current()}>
            <Text style={styles.loadMoreText}>
              Load More ({item.loaded} of {item.total})
            </Text>
            <Ionicons name="chevron-down" size={16} color={Colors.primary} />
          </Pressable>
        );
      case "bottomSpacer":
        return <View style={{ height: 100 }} />;
      default:
        return null;
    }
  }, []); // ZERO deps — FlatList never re-renders all cells due to renderSection changes

  const keyExtractor = useCallback((_: SectionItem, index: number) => `section-${index}`, []);

  return (
    <View style={styles.container}>
      <SearchHeader
        editable={false}
        onPress={() => router.push("/search")}
        showShare
      />
      <PromoTicker />
      <FlatList
        data={sections}
        renderItem={renderSection}
        keyExtractor={keyExtractor}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== "web"}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const heroStyles = StyleSheet.create({
  container: { marginBottom: 12 },
  scrollContent: { paddingHorizontal: 16, gap: 12 },
  slide: { width: BANNER_WIDTH, borderRadius: 16, overflow: "hidden" },
  gradient: { padding: 16, minHeight: 180 },
  content: { flexDirection: "row", alignItems: "center" },
  textArea: { flex: 1, paddingRight: 8 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginBottom: 6 },
  tagText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 0.5 },
  title: { fontSize: 17, fontFamily: "Inter_800ExtraBold", color: "#FFF", marginBottom: 3, lineHeight: 22 },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginBottom: 6, lineHeight: 15 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  price: { fontSize: 16, fontFamily: "Inter_800ExtraBold", color: "#FFD700" },
  originalPrice: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.5)", textDecorationLine: "line-through" },
  featuresRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 8 },
  featurePill: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  featureText: { fontSize: 8, fontFamily: "Inter_500Medium", color: "rgba(255,255,255,0.9)" },
  shopBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  shopBtnText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#FFF" },
  imageArea: { width: 120, height: 140, alignItems: "center", justifyContent: "center" },
  imageGlow: { position: "absolute", width: 100, height: 100, borderRadius: 50, backgroundColor: "rgba(255,255,255,0.1)" },
  productImage: { width: 110, height: 130 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { width: 20, borderRadius: 3, backgroundColor: Colors.primary },
});

const promoStyles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, gap: 10, paddingVertical: 12 },
  card: { width: SCREEN_WIDTH * 0.72, borderRadius: 14, overflow: "hidden" },
  gradient: { flexDirection: "row", alignItems: "center", padding: 14, minHeight: 110 },
  textArea: { flex: 1 },
  logo: { fontSize: 14, fontFamily: "Inter_800ExtraBold", color: "#FFF", letterSpacing: 1, marginBottom: 2 },
  tagline: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 2 },
  subtitle: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginBottom: 6 },
  badge: { backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 8, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 0.5 },
  image: { width: 80, height: 90 },
});

const trustStyles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 16, gap: 10, paddingBottom: 12 },
  card: { width: 160, borderRadius: 12, overflow: "hidden" },
  gradient: { padding: 12, minHeight: 110, alignItems: "center" },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  title: { fontSize: 11, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 3 },
  subtitle: { fontSize: 9, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 13 },
});

const catStyles = StyleSheet.create({
  container: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  card: { width: (SCREEN_WIDTH - 48) / 2, borderRadius: 12, padding: 14, alignItems: "center" },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  label: { fontSize: 12, fontFamily: "Inter_700Bold", marginBottom: 2 },
  subtitle: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});

const flashStyles = StyleSheet.create({
  container: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  gradient: { flexDirection: "row", alignItems: "center", padding: 14 },
  leftArea: { flex: 1 },
  flashRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 4 },
  flashTitle: { fontSize: 16, fontFamily: "Inter_800ExtraBold", color: "#FFF" },
  flashSubtitle: { fontSize: 10, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.9)", marginBottom: 6 },
  timerRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  timerBox: { backgroundColor: "rgba(0,0,0,0.3)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  timerText: { fontSize: 14, fontFamily: "Inter_800ExtraBold", color: "#FFF" },
  timerSep: { fontSize: 14, fontFamily: "Inter_800ExtraBold", color: "#FFF" },
  shopArea: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.2)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  shopText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#FFF", letterSpacing: 0.5 },
});

const midAdStyles = StyleSheet.create({
  container: { marginHorizontal: 16, borderRadius: 14, overflow: "hidden", marginBottom: 16 },
  gradient: { flexDirection: "row", alignItems: "center", padding: 16, minHeight: 120 },
  textArea: { flex: 1 },
  brand: { fontSize: 10, fontFamily: "Inter_700Bold", color: "rgba(255,255,255,0.6)", letterSpacing: 1.5, marginBottom: 3 },
  title: { fontSize: 17, fontFamily: "Inter_800ExtraBold", color: "#FFF", marginBottom: 2 },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.8)", marginBottom: 8 },
  cta: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  ctaText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#FFF" },
  image: { width: 90, height: 100 },
});

const whyStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginBottom: 20 },
  heading: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: (SCREEN_WIDTH - 48) / 2, backgroundColor: Colors.surface, borderRadius: 12, padding: 14, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center", marginBottom: 6 },
  title: { fontSize: 12, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 2, textAlign: "center" },
  desc: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center" },
});

const brandShowStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginBottom: 20 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  heading: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { width: (SCREEN_WIDTH - 64) / 5, alignItems: "center", paddingVertical: 10 },
  brandCircle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  brandInitial: { fontSize: 18, fontFamily: "Inter_800ExtraBold" },
  brandName: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: Colors.text, textAlign: "center" },
  phoneCount: { fontSize: 8, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
});

const tickerStyles = StyleSheet.create({
  container: { overflow: "hidden" },
  gradient: { paddingVertical: 6 },
  scrollRow: { flexDirection: "row", alignItems: "center" },
  item: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8 },
  text: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#FFF" },
  separator: { fontSize: 11, color: "rgba(255,255,255,0.4)", marginLeft: 6 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 20 },
  brandsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  priceChipsRow: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  priceChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border },
  priceChipText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.text },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  sectionSubtext: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 17, marginBottom: 10 },
  seeAllBtn: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  horizontalList: { gap: 12 },
  productRowContainer: { flexDirection: "row", paddingHorizontal: 16, gap: 12, marginBottom: 2 },
  gridItem: { width: CARD_WIDTH },
  loadMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadMoreText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
});
