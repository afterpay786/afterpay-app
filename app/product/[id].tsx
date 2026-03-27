import React, { useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  Pressable,
  Platform,
  Alert,
  Dimensions,
  Share,
  Modal,
  NativeSyntheticEvent,
  NativeScrollEvent,
  ViewToken,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useProduct, formatPrice } from "@/lib/use-products";
import { useCart } from "@/lib/cart-context";
import { useWishlist } from "@/lib/wishlist-context";
import { getApiUrl } from "@/lib/query-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const THUMB_SIZE = 72;
const GALLERY_HEIGHT = SCREEN_WIDTH * 0.9;

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const { addToCart } = useCart();
  const { isInWishlist, toggleWishlist } = useWishlist();
  const [activeImage, setActiveImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState(0);
  const [selectedStorage, setSelectedStorage] = useState(0);
  const [activeTab, setActiveTab] = useState("specs");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showEMIModal, setShowEMIModal] = useState(false);
  const [emiTenure, setEmiTenure] = useState<6 | 9 | 12>(6);
  const [emiAdvancePct, setEmiAdvancePct] = useState<0 | 5 | 10 | 15>(0);
  const [emiLoading, setEmiLoading] = useState(false);
  interface EMIResult {
    productName: string;
    price: number;
    tenure: number;
    tenureLabel: string;
    totalAmount: number;
    advancePercent: number;
    advanceAmount: number;
    remainingAmount: number;
    monthlyInstallment: number;
    startDate: string;
    endDate: string;
  }
  const [emiResult, setEmiResult] = useState<EMIResult | null>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const galleryListRef = useRef<FlatList>(null);

  const { data: product, isLoading } = useProduct(id || "");

  const colors = product?.colors || [];
  const storageOptions = product?.storageOptions || [];
  const highlights = product?.highlights || [];

  const currentGalleryImages = useMemo(() => {
    if (!product) return [];
    let baseImages: string[] = [];
    if (colors.length > 0 && colors[selectedColor]?.images && colors[selectedColor].images!.length > 0) {
      baseImages = [...colors[selectedColor].images!];
    } else {
      baseImages = product.images.length > 0 ? [...product.images] : [product.image];
    }
    if (baseImages.length < 2) {
      const mainImg = baseImages[0];
      const extraSources = colors
        .filter((_, i) => i !== selectedColor)
        .map((c) => c.images?.[0] || c.image)
        .filter((img) => !baseImages.includes(img));
      while (baseImages.length < 2 && extraSources.length > 0) {
        baseImages.push(extraSources.shift()!);
      }
      if (baseImages.length < 2 && product.image && !baseImages.includes(product.image)) {
        baseImages.push(product.image);
      }
    }
    const uniqueImages = [...new Set(baseImages)];
    return uniqueImages.length > 0 ? uniqueImages : [product.image];
  }, [selectedColor, colors, product]);

  const currentPrice = useMemo(() => {
    if (!product) return 0;
    if (storageOptions.length > 0 && typeof storageOptions[selectedStorage] === 'object' && storageOptions[selectedStorage] !== null) {
      const variantPrice = (storageOptions[selectedStorage] as { label: string; price: number }).price;
      if (variantPrice > 0) return variantPrice;
    }
    return product.price;
  }, [selectedStorage, storageOptions, product]);

  const currentOriginalPrice = useMemo(() => {
    if (!product) return 0;
    if (currentPrice !== product.price && product.originalPrice > 0) {
      const ratio = currentPrice / product.price;
      return Math.round(product.originalPrice * ratio);
    }
    return product.originalPrice;
  }, [currentPrice, product]);

  const mainImageWidth = useMemo(() => {
    return SCREEN_WIDTH - (THUMB_SIZE + 14);
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setActiveImage(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  if (isLoading) {
    return (
      <View style={[styles.notFound, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Product not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.goBack}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const wishlisted = isInWishlist(product.id);

  const handleColorSelect = (idx: number) => {
    if (colors[idx]?.soldOut) return;
    setSelectedColor(idx);
    setActiveImage(0);
    galleryListRef.current?.scrollToIndex({ index: 0, animated: false });
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const getSelectedVariant = () => {
    return storageOptions.length > 0 ? storageOptions[selectedStorage] as { label: string; price: number } : undefined;
  };

  const handleAddToCart = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const variant = getSelectedVariant();
    addToCart(product, variant);
    const variantLabel = variant ? ` (${variant.label})` : "";
    Alert.alert("Added to Cart", `${product.name}${variantLabel} has been added to your cart.`);
  };

  const handleBuyNow = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const variant = getSelectedVariant();
    addToCart(product, variant);
    router.push("/checkout");
  };

  const handleWishlist = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleWishlist(product);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${product.name} for ${formatPrice(currentPrice)} on AFTER PAY!`,
        title: product.name,
      });
    } catch (e) {}
  };

  const scrollToImage = (idx: number) => {
    setActiveImage(idx);
    galleryListRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  const handleMainScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = e.nativeEvent.contentOffset.y;
    setShowScrollTop(offsetY > 400);
  };

  const scrollToTop = () => {
    mainScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const calculateEMI = async (tenure: 6 | 9 | 12, advancePct: 0 | 5 | 10 | 15) => {
    if (!product) return;
    setEmiLoading(true);
    try {
      const apiUrl = new URL("/api/installment-calculator", getApiUrl());
      const response = await fetch(apiUrl.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price: currentPrice,
          tenure,
          productName: product.name,
          advancePercent: advancePct,
        }),
      });
      if (response.ok) {
        const data = await response.json();
        setEmiResult(data);
      }
    } catch {
      setEmiResult(null);
    } finally {
      setEmiLoading(false);
    }
  };

  const handleOpenEMI = () => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEMIModal(true);
    calculateEMI(emiTenure, emiAdvancePct);
  };

  const handleTenureChange = (tenure: 6 | 9 | 12) => {
    setEmiTenure(tenure);
    calculateEMI(tenure, emiAdvancePct);
  };

  const handleAdvanceChange = (pct: 0 | 5 | 10 | 15) => {
    setEmiAdvancePct(pct);
    calculateEMI(emiTenure, pct);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: topPad + 6 }]}>
        <Pressable onPress={() => router.back()} style={styles.topBtn} testID="back-button">
          <Ionicons name="arrow-back" size={22} color="#333" />
        </Pressable>
        <View style={styles.topBarRight}>
          <Pressable onPress={handleWishlist} style={styles.topBtn}>
            <Ionicons
              name={wishlisted ? "heart" : "heart-outline"}
              size={22}
              color={wishlisted ? "#F43F5E" : "#333"}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={mainScrollRef}
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
      >
        <View style={styles.imageSection}>
          <View style={styles.officialBadge}>
            <View style={styles.shieldTop}>
              <Text style={styles.officialBold}>OFFICIAL</Text>
            </View>
            <View style={styles.shieldBottom}>
              <Text style={styles.onlineText}>ONLINE</Text>
              <Text style={styles.retailerText}>RETAILER</Text>
            </View>
          </View>

          <View style={styles.imageGalleryRow}>
            <View style={styles.mainImageArea}>
              <FlatList
                ref={galleryListRef}
                data={currentGalleryImages}
                keyExtractor={(item, idx) => `slide-${selectedColor}-${idx}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                getItemLayout={(_, index) => ({
                  length: mainImageWidth,
                  offset: mainImageWidth * index,
                  index,
                })}
                scrollEnabled={!!currentGalleryImages.length}
                nestedScrollEnabled
                renderItem={({ item }) => (
                  <View style={[styles.gallerySlide, { width: mainImageWidth }]}>
                    <Image
                      source={{ uri: item }}
                      style={styles.mainImage}
                      contentFit="contain"
                      transition={200}
                    />
                  </View>
                )}
              />
              <View style={styles.imageCounter}>
                <Text style={styles.imageCounterText}>
                  {activeImage + 1} / {currentGalleryImages.length}
                </Text>
              </View>
            </View>

            <View style={styles.thumbColumn}>
              {currentGalleryImages.map((img, idx) => (
                <Pressable
                  key={`thumb-${selectedColor}-${idx}`}
                  style={[
                    styles.thumbItem,
                    idx === activeImage && styles.thumbItemActive,
                  ]}
                  onPress={() => scrollToImage(idx)}
                >
                  <Image
                    source={{ uri: img }}
                    style={styles.thumbImage}
                    contentFit="contain"
                    transition={100}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.details}>
          <Text style={styles.productName}>{product.name}</Text>

          <View style={styles.ratingRow}>
            <View style={styles.ratingBadge}>
              <View style={styles.starsContainer}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={star <= Math.floor(product.rating) ? "star" : star - 0.5 <= product.rating ? "star-half" : "star-outline"}
                    size={16}
                    color="#F59E0B"
                  />
                ))}
              </View>
              <Text style={styles.ratingText}>{product.rating}</Text>
              <Text style={styles.reviewDivider}>|</Text>
              <Text style={styles.reviewText}>{product.reviews} Reviews</Text>
            </View>
            {product.fastDelivery && (
              <View style={styles.fastDeliveryContainer}>
                <Text style={styles.fastWord}>Fast</Text>
                <View style={styles.deliveryBox}>
                  <Text style={styles.deliveryWord}>Delivery</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.priceSection}>
            <View style={styles.priceRow}>
              <Text style={styles.rsLabel}>Rs</Text>
              <Text style={styles.priceValue}>{currentPrice.toLocaleString()}</Text>
              {product.discount > 0 && (
                <>
                  <Text style={styles.originalPrice}>
                    Rs {currentOriginalPrice.toLocaleString()}
                  </Text>
                  <View style={styles.discountTag}>
                    <Text style={styles.discountTagText}>{product.discount}% OFF</Text>
                  </View>
                </>
              )}
              <View style={{ flex: 1 }} />
              <Pressable onPress={handleShare} style={styles.shareIcon}>
                <Ionicons name="share-social-outline" size={22} color="#999" />
              </Pressable>
            </View>
          </View>

          {colors.length > 0 && (
            <View style={styles.colorSection}>
              <Text style={styles.sectionLabel}>Colors</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.colorsScroll}>
                {colors.map((color, idx) => (
                  <Pressable
                    key={idx}
                    style={[
                      styles.colorCard,
                      idx === selectedColor && styles.colorCardSelected,
                    ]}
                    onPress={() => handleColorSelect(idx)}
                  >
                    {color.soldOut && (
                      <View style={styles.soldOutBadge}>
                        <Text style={styles.soldOutText}>Sold Out</Text>
                      </View>
                    )}
                    <View style={styles.colorImgWrap}>
                      <Image
                        source={{ uri: color.image }}
                        style={styles.colorImg}
                        contentFit="contain"
                        transition={100}
                      />
                    </View>
                    <Text
                      style={[
                        styles.colorLabel,
                        idx === selectedColor && styles.colorLabelActive,
                        color.soldOut && styles.colorLabelSoldOut,
                      ]}
                      numberOfLines={2}
                    >
                      {color.name}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {storageOptions.length > 0 && (
            <View style={styles.storageSection}>
              <Text style={styles.sectionLabel}>Storage / RAM</Text>
              <View style={styles.storageChips}>
                {storageOptions.map((opt, idx) => {
                  const label = typeof opt === 'string' ? opt : opt.label;
                  const optPrice = typeof opt === 'object' && opt !== null ? opt.price : null;
                  return (
                    <Pressable
                      key={idx}
                      style={[
                        styles.storageChip,
                        idx === selectedStorage && styles.storageChipActive,
                      ]}
                      onPress={() => setSelectedStorage(idx)}
                    >
                      <Text
                        style={[
                          styles.storageChipText,
                          idx === selectedStorage && styles.storageChipTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                      {optPrice !== null && optPrice > 0 && (
                        <Text
                          style={[
                            styles.storageChipPrice,
                            idx === selectedStorage && styles.storageChipPriceActive,
                          ]}
                        >
                          Rs {optPrice.toLocaleString()}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={styles.guaranteeRow}>
            <View style={styles.guaranteeItem}>
              <View style={[styles.guaranteeIcon, { backgroundColor: "#E8F5E9" }]}>
                <Ionicons name="shield-checkmark" size={18} color="#4CAF50" />
              </View>
              <Text style={styles.guaranteeText}>PTA{"\n"}Approved</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <View style={[styles.guaranteeIcon, { backgroundColor: "#FFF3E0" }]}>
                <Ionicons name="swap-horizontal" size={18} color="#FF9800" />
              </View>
              <Text style={styles.guaranteeText}>7 Day{"\n"}Return</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <View style={[styles.guaranteeIcon, { backgroundColor: "#E3F2FD" }]}>
                <Ionicons name="car-outline" size={18} color="#2196F3" />
              </View>
              <Text style={styles.guaranteeText}>Free{"\n"}Delivery</Text>
            </View>
            <View style={styles.guaranteeItem}>
              <View style={[styles.guaranteeIcon, { backgroundColor: "#F3E5F5" }]}>
                <Ionicons name="ribbon-outline" size={18} color="#9C27B0" />
              </View>
              <Text style={styles.guaranteeText}>Warranty{"\n"}Included</Text>
            </View>
          </View>

          {/* Prominent EMI/Installment Banner */}
          <Pressable style={styles.emiBanner} onPress={handleOpenEMI} testID="emi-banner">
            <View style={styles.emiBannerLeft}>
              <View style={styles.emiBannerIconWrap}>
                <Ionicons name="calculator" size={22} color="#FFF" />
              </View>
              <View>
                <Text style={styles.emiBannerTitle}>Pay in Easy Installments</Text>
                <Text style={styles.emiBannerSub}>
                  From{" "}
                  <Text style={styles.emiBannerPrice}>
                    Rs {Math.round(currentPrice * 1.30 / 6).toLocaleString()}
                  </Text>
                  /month · 0% Down Payment
                </Text>
              </View>
            </View>
            <View style={styles.emiBannerBadge}>
              <Text style={styles.emiBannerBadgeText}>Calculate</Text>
              <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
            </View>
          </Pressable>

          {highlights.length > 0 && (
            <View style={styles.highlightsSection}>
              <Text style={styles.tableTitle}>Highlights</Text>
              {highlights.map((hl, idx) => (
                <View key={idx} style={styles.highlightCard}>
                  <View style={styles.highlightIconWrap}>
                    <Ionicons name={hl.icon as any} size={28} color={Colors.primary} />
                  </View>
                  <View style={styles.highlightContent}>
                    <Text style={styles.highlightTitle}>{hl.title}</Text>
                    <Text style={styles.highlightDesc}>{hl.description}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {activeTab === "specs" && (
            <View style={styles.specsTable}>
              {product.specifications && Object.keys(product.specifications).length > 0 ? (
                Object.entries(product.specifications).map(([sectionName, fields]) => (
                  <View key={sectionName} style={styles.specSection}>
                    <View style={styles.specSectionHeader}>
                      <Ionicons
                        name={
                          sectionName.toLowerCase().includes("display") ? "phone-portrait-outline" :
                          sectionName.toLowerCase().includes("camera") ? "camera-outline" :
                          sectionName.toLowerCase().includes("battery") ? "battery-half-outline" :
                          sectionName.toLowerCase().includes("memory") || sectionName.toLowerCase().includes("storage") ? "hardware-chip-outline" :
                          sectionName.toLowerCase().includes("connect") || sectionName.toLowerCase().includes("network") ? "wifi-outline" :
                          sectionName.toLowerCase().includes("performance") || sectionName.toLowerCase().includes("processor") ? "speedometer-outline" :
                          sectionName.toLowerCase().includes("body") || sectionName.toLowerCase().includes("design") ? "tablet-portrait-outline" :
                          "list-outline"
                        }
                        size={16}
                        color={Colors.primary}
                      />
                      <Text style={styles.specSectionTitle}>{sectionName}</Text>
                    </View>
                    {Object.entries(fields).map(([key, value], idx) => (
                      <View key={key} style={[styles.specRow, idx % 2 === 0 && styles.specRowAlt]}>
                        <Text style={styles.specKey}>{key}</Text>
                        <Text style={styles.specVal}>{value}</Text>
                      </View>
                    ))}
                  </View>
                ))
              ) : (
                <>
                  <Text style={styles.tableTitle}>Specifications</Text>
                  {product.specs.map((spec, idx) => (
                    <View key={idx} style={[styles.specRow, idx % 2 === 0 && styles.specRowAlt]}>
                      <Text style={styles.specKey}>{spec.label}</Text>
                      <Text style={styles.specVal}>{spec.value}</Text>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}

          {activeTab === "review" && (
            <View style={styles.reviewSection}>
              <Text style={styles.tableTitle}>Reviews</Text>
              <View style={styles.reviewSummary}>
                <Text style={styles.reviewBigRating}>{product.rating}</Text>
                <View style={styles.reviewStars}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons key={s} name={s <= Math.floor(product.rating) ? "star" : "star-outline"} size={20} color="#F59E0B" />
                  ))}
                </View>
                <Text style={styles.reviewTotalText}>Based on {product.reviews} reviews</Text>
              </View>
            </View>
          )}

          {activeTab === "compare" && (
            <View style={styles.compareSection}>
              <Text style={styles.tableTitle}>Compare</Text>
              <Text style={styles.compareDesc}>Compare {product.name} with similar phones in this price range.</Text>
              <View style={styles.compareCard}>
                <Text style={styles.compareItem}>{product.name}</Text>
                <Text style={styles.comparePrice}>{formatPrice(product.price)}</Text>
              </View>
            </View>
          )}

          <View style={styles.descBlock}>
            <Text style={styles.tableTitle}>Description</Text>
            <Text style={styles.descText}>
              {product.productDescription
                ? product.productDescription.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
                : product.description}
            </Text>
          </View>

          <View style={{ height: 90 }} />
        </View>
      </ScrollView>

      {showScrollTop && (
        <Pressable style={styles.scrollTopBtn} onPress={scrollToTop}>
          <Ionicons name="arrow-up" size={22} color="#FFF" />
        </Pressable>
      )}

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, webBottomInset) + 4 }]}>
        {/* Row 1: Section tabs */}
        <View style={styles.bottomTabRow}>
          <Pressable
            style={[styles.bottomTab, activeTab === "specs" && styles.bottomTabActive]}
            onPress={() => setActiveTab("specs")}
          >
            <Ionicons name="list-outline" size={16} color={activeTab === "specs" ? Colors.primary : "#888"} />
            <Text style={[styles.bottomTabText, activeTab === "specs" && styles.bottomTabTextActive]}>Specs</Text>
          </Pressable>
          <Pressable
            style={[styles.bottomTab, activeTab === "review" && styles.bottomTabActive]}
            onPress={() => setActiveTab("review")}
          >
            <Ionicons name="star-outline" size={16} color={activeTab === "review" ? Colors.primary : "#888"} />
            <Text style={[styles.bottomTabText, activeTab === "review" && styles.bottomTabTextActive]}>Review</Text>
          </Pressable>
          <Pressable
            style={[styles.bottomTab, activeTab === "compare" && styles.bottomTabActive]}
            onPress={() => setActiveTab("compare")}
          >
            <Ionicons name="git-compare-outline" size={16} color={activeTab === "compare" ? Colors.primary : "#888"} />
            <Text style={[styles.bottomTabText, activeTab === "compare" && styles.bottomTabTextActive]}>Compare</Text>
          </Pressable>
          <Pressable
            style={[styles.bottomTab, styles.bottomTabEMI]}
            onPress={handleOpenEMI}
            testID="emi-tab-button"
          >
            <Ionicons name="calculator-outline" size={16} color={Colors.primary} />
            <Text style={[styles.bottomTabText, { color: Colors.primary, fontFamily: "Inter_700Bold" }]}>Installment</Text>
          </Pressable>
        </View>
        {/* Row 2: Action buttons */}
        <View style={styles.bottomButtons}>
          <Pressable
            style={({ pressed }) => [styles.cartButton, pressed && styles.cartButtonPressed]}
            onPress={handleAddToCart}
          >
            <Ionicons name="cart-outline" size={18} color="#FFF" />
            <Text style={styles.cartButtonText}>Add to Cart</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.buyNowButton, pressed && styles.cartButtonPressed]}
            onPress={handleBuyNow}
          >
            <Ionicons name="flash" size={16} color="#FFF" />
            <Text style={styles.cartButtonText}>Buy Now</Text>
          </Pressable>
        </View>
      </View>
      {/* EMI Calculator Modal */}
      <Modal
        visible={showEMIModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEMIModal(false)}
      >
        <Pressable style={styles.emiOverlay} onPress={() => setShowEMIModal(false)}>
          <Pressable style={[styles.emiSheet, { paddingBottom: Math.max(insets.bottom, 20) + 10 }]} onPress={() => {}}>
            {/* Handle bar */}
            <View style={styles.emiHandle} />

            {/* Header */}
            <View style={styles.emiHeader}>
              <View style={styles.emiHeaderLeft}>
                <View style={styles.emiIconBg}>
                  <Ionicons name="calculator" size={20} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emiTitle}>Installment Calculator</Text>
                  <Text style={styles.emiSubtitle} numberOfLines={1}>{product?.name}</Text>
                </View>
              </View>
              <Pressable onPress={() => setShowEMIModal(false)} style={styles.emiClose}>
                <Ionicons name="close" size={20} color="#555" />
              </Pressable>
            </View>

            {/* Tenure selector */}
            <Text style={styles.emiSectionLabel}>Select Tenure</Text>
            <View style={styles.emiTenureRow}>
              {([6, 9, 12] as const).map((t) => (
                <Pressable
                  key={t}
                  style={[styles.emiTenureBtn, emiTenure === t && styles.emiTenureBtnActive]}
                  onPress={() => handleTenureChange(t)}
                >
                  <Text style={[styles.emiTenureBtnText, emiTenure === t && styles.emiTenureBtnTextActive]}>
                    {t}M
                  </Text>
                  {emiTenure === t && (
                    <Ionicons name="checkmark-circle" size={12} color={Colors.primary} style={{ marginLeft: 3 }} />
                  )}
                </Pressable>
              ))}
            </View>

            {/* Advance selector */}
            <Text style={styles.emiSectionLabel}>Advance Payment (Optional)</Text>
            <View style={styles.emiAdvanceRow}>
              {([0, 5, 10, 15] as const).map((pct) => {
                const advAmt = emiResult ? Math.round(emiResult.totalAmount * pct / 100) : Math.round(currentPrice * pct / 100);
                return (
                  <Pressable
                    key={pct}
                    style={[styles.emiAdvanceBtn, emiAdvancePct === pct && styles.emiAdvanceBtnActive]}
                    onPress={() => handleAdvanceChange(pct)}
                  >
                    <Text style={[styles.emiAdvancePct, emiAdvancePct === pct && styles.emiAdvancePctActive]}>
                      {pct === 0 ? "None" : `${pct}%`}
                    </Text>
                    {pct > 0 && (
                      <Text style={[styles.emiAdvanceAmt, emiAdvancePct === pct && styles.emiAdvanceAmtActive]} numberOfLines={1}>
                        {`Rs ${advAmt.toLocaleString()}`}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Result table */}
            {emiLoading ? (
              <View style={styles.emiLoadingBox}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            ) : emiResult ? (
              <View style={styles.emiTable}>
                <View style={[styles.emiTableRow, styles.emiTableRowAlt]}>
                  <Text style={styles.emiTableKey}>Product</Text>
                  <Text style={styles.emiTableVal} numberOfLines={1}>{emiResult.productName}</Text>
                </View>
                <View style={styles.emiTableRow}>
                  <Text style={styles.emiTableKey}>Category</Text>
                  <Text style={styles.emiTableVal}>Mobiles</Text>
                </View>
                <View style={[styles.emiTableRow, styles.emiTableRowAlt]}>
                  <Text style={styles.emiTableKey}>Cash Price</Text>
                  <Text style={styles.emiTableVal}>{formatPrice(emiResult.price)}</Text>
                </View>
                <View style={styles.emiTableRow}>
                  <Text style={styles.emiTableKey}>On {emiResult.tenure} Months</Text>
                  <Text style={[styles.emiTableVal, { color: "#1A1A1A", fontFamily: "Inter_700Bold" }]}>{formatPrice(emiResult.totalAmount)}</Text>
                </View>
                <View style={[styles.emiTableRow, styles.emiTableRowAlt]}>
                  <Text style={styles.emiTableKey}>Advance Paid</Text>
                  <Text style={styles.emiTableVal}>
                    {emiResult.advanceAmount > 0
                      ? `${formatPrice(emiResult.advanceAmount)} (${emiResult.advancePercent}%)`
                      : formatPrice(0)}
                  </Text>
                </View>
                <View style={[styles.emiTableRow, { backgroundColor: "#F0FAF5" }]}>
                  <Text style={[styles.emiTableKey, { color: Colors.primary, fontFamily: "Inter_700Bold" }]}>Per/Month Installment</Text>
                  <Text style={[styles.emiTableVal, { color: Colors.primary, fontFamily: "Inter_800ExtraBold", fontSize: 15 }]}>{formatPrice(emiResult.monthlyInstallment)}</Text>
                </View>
                <View style={[styles.emiTableRow, styles.emiTableRowAlt]}>
                  <Text style={styles.emiTableKey}>Start Month</Text>
                  <Text style={styles.emiTableVal}>{emiResult.startDate}</Text>
                </View>
                <View style={styles.emiTableRow}>
                  <Text style={styles.emiTableKey}>End Month</Text>
                  <Text style={styles.emiTableVal}>{emiResult.endDate}</Text>
                </View>
                <View style={[styles.emiTableRow, styles.emiTableRowAlt, { borderBottomWidth: 0 }]}>
                  <Text style={styles.emiTableKey}>Duration</Text>
                  <Text style={styles.emiTableVal}>{emiResult.tenure} Months</Text>
                </View>
              </View>
            ) : null}

            {/* Info note */}
            <View style={styles.emiInfoRow}>
              <Ionicons name="information-circle-outline" size={14} color="#888" />
              <Text style={styles.emiInfoText}>Subject to AFTER PAY BNPL approval. Dates are indicative.</Text>
            </View>

            {/* Apply button */}
            <Pressable
              style={({ pressed }) => [styles.emiApplyBtn, pressed && { opacity: 0.9 }]}
              onPress={() => {
                setShowEMIModal(false);
                router.push("/checkout");
              }}
            >
              <Ionicons name="flash" size={16} color="#FFF" />
              <Text style={styles.emiApplyText}>Apply for Installment</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    color: "#333",
  },
  goBack: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  topBarRight: {
    flexDirection: "row",
    gap: 4,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  scrollView: {
    flex: 1,
  },
  imageSection: {
    backgroundColor: "#FFF",
    position: "relative",
    paddingTop: Platform.OS === "web" ? 80 : 50,
  },
  officialBadge: {
    position: "absolute",
    top: Platform.OS === "web" ? 85 : 55,
    left: 10,
    zIndex: 5,
    width: 62,
    alignItems: "center",
  },
  shieldTop: {
    backgroundColor: "#1E5FAD",
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 3,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    width: "100%",
    alignItems: "center",
  },
  officialBold: {
    fontSize: 9,
    fontFamily: "Inter_800ExtraBold",
    color: "#FFF",
    letterSpacing: 0.5,
  },
  shieldBottom: {
    backgroundColor: "#2B7BDB",
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 6,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    width: "100%",
    alignItems: "center",
  },
  onlineText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    color: "#E0F0FF",
    letterSpacing: 0.3,
  },
  retailerText: {
    fontSize: 8,
    fontFamily: "Inter_700Bold",
    color: "#E0F0FF",
    letterSpacing: 0.3,
  },
  imageGalleryRow: {
    flexDirection: "row",
    height: GALLERY_HEIGHT,
  },
  mainImageArea: {
    flex: 1,
    position: "relative",
    overflow: "hidden",
  },
  galleryScroll: {
    flex: 1,
  },
  gallerySlide: {
    height: GALLERY_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  mainImage: {
    width: "100%",
    height: GALLERY_HEIGHT,
    backgroundColor: "#FAFAFA",
  },
  imageCounter: {
    position: "absolute",
    bottom: 12,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  imageCounterText: {
    color: "#FFF",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  thumbColumn: {
    width: THUMB_SIZE + 14,
    paddingRight: 6,
    paddingLeft: 4,
    gap: 8,
    justifyContent: "flex-start",
    paddingTop: 6,
  },
  thumbItem: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    backgroundColor: "#FFF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  thumbItemActive: {
    borderColor: "#999",
    borderWidth: 2,
  },
  thumbImage: {
    width: THUMB_SIZE - 12,
    height: THUMB_SIZE - 12,
  },
  details: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  productName: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: "#222",
    lineHeight: 24,
    marginBottom: 10,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  ratingBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFBEB",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  starsContainer: {
    flexDirection: "row",
    gap: 1,
  },
  ratingText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#333",
    marginLeft: 5,
  },
  reviewDivider: {
    fontSize: 12,
    color: "#CCC",
    marginHorizontal: 5,
  },
  reviewText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#666",
  },
  fastDeliveryContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  fastWord: {
    fontSize: 12,
    fontFamily: "Inter_800ExtraBold",
    color: "#D4A017",
  },
  deliveryBox: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  deliveryWord: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
  priceSection: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0F0",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  rsLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "#333",
  },
  priceValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#222",
  },
  originalPrice: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: "#AAA",
    textDecorationLine: "line-through",
    marginLeft: 5,
  },
  discountTag: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    marginLeft: 6,
  },
  discountTagText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    color: "#2E7D32",
  },
  shareIcon: {
    padding: 6,
  },
  colorSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: "#333",
    marginBottom: 10,
  },
  colorsScroll: {
    gap: 10,
  },
  colorCard: {
    width: 100,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E5E5E5",
    borderRadius: 10,
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
    backgroundColor: "#FFF",
    position: "relative",
  },
  colorCardSelected: {
    borderColor: "#42A5F5",
    borderWidth: 2,
  },
  soldOutBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: "#999",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 6,
    zIndex: 2,
  },
  soldOutText: {
    fontSize: 8,
    fontFamily: "Inter_600SemiBold",
    color: "#FFF",
  },
  colorImgWrap: {
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  colorImg: {
    width: 52,
    height: 52,
  },
  colorLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#888",
    textAlign: "center",
    marginTop: 2,
    lineHeight: 14,
  },
  colorLabelActive: {
    color: "#333",
    fontFamily: "Inter_700Bold",
  },
  colorLabelSoldOut: {
    color: "#BBB",
  },
  storageSection: {
    marginBottom: 20,
  },
  storageChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  storageChip: {
    borderWidth: 1.5,
    borderColor: "#E5E5E5",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#FFF",
  },
  storageChipActive: {
    borderColor: Colors.primary,
    borderWidth: 2,
    backgroundColor: "#E8F5E9",
  },
  storageChipText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#777",
  },
  storageChipTextActive: {
    color: Colors.primary,
    fontFamily: "Inter_700Bold",
  },
  storageChipPrice: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: "#AAA",
    marginTop: 2,
  },
  storageChipPriceActive: {
    color: Colors.primary,
    fontFamily: "Inter_500Medium",
  },
  guaranteeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 16,
    marginBottom: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#F0F0F0",
  },
  guaranteeItem: {
    alignItems: "center",
    flex: 1,
    gap: 6,
  },
  guaranteeIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  guaranteeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "#777",
    textAlign: "center",
    lineHeight: 13,
  },
  emiBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0F2419",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  emiBannerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  emiBannerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emiBannerTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  emiBannerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#A8D5BC",
  },
  emiBannerPrice: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    color: "#5DD98C",
  },
  emiBannerBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 2,
  },
  emiBannerBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.primary,
  },
  highlightsSection: {
    marginBottom: 20,
  },
  highlightCard: {
    flexDirection: "row",
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    alignItems: "flex-start",
    gap: 14,
  },
  highlightIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
  },
  highlightContent: {
    flex: 1,
  },
  highlightTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#333",
    marginBottom: 3,
  },
  highlightDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#777",
    lineHeight: 16,
  },
  specsTable: {
    marginBottom: 20,
  },
  specSection: {
    marginBottom: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    overflow: "hidden",
  },
  specSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F8FAF9",
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F0",
  },
  specSectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#333",
  },
  tableTitle: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#333",
    marginBottom: 10,
  },
  specRow: {
    flexDirection: "row" as const,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F0F0F0",
  },
  specRowAlt: {
    backgroundColor: "#FCFCFC",
  },
  specKey: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#888",
  },
  specVal: {
    flex: 1.5,
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#333",
    lineHeight: 16,
  },
  reviewSection: {
    marginBottom: 20,
  },
  reviewSummary: {
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#FAFAFA",
    borderRadius: 12,
  },
  reviewBigRating: {
    fontSize: 34,
    fontFamily: "Inter_800ExtraBold",
    color: "#333",
    marginBottom: 5,
  },
  reviewStars: {
    flexDirection: "row",
    gap: 2,
    marginBottom: 8,
  },
  reviewTotalText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#888",
  },
  compareSection: {
    marginBottom: 20,
  },
  compareDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#888",
    marginBottom: 10,
  },
  compareCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compareItem: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#333",
    flex: 1,
  },
  comparePrice: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.primary,
  },
  descBlock: {
    marginBottom: 20,
  },
  descText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#777",
    lineHeight: 18,
  },
  scrollTopBtn: {
    position: "absolute",
    bottom: 80,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  bottomBar: {
    flexDirection: "column",
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#EEE",
    paddingTop: 6,
    paddingHorizontal: 8,
    gap: 6,
  },
  bottomTabRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  bottomTab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
    gap: 2,
  },
  bottomTabEMI: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 6,
    backgroundColor: "#F0FAF5",
    paddingHorizontal: 4,
  },
  bottomTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  bottomTabText: {
    fontSize: 9,
    fontFamily: "Inter_500Medium",
    color: "#888",
  },
  bottomTabTextActive: {
    color: Colors.primary,
    fontFamily: "Inter_600SemiBold",
  },
  bottomButtons: {
    flexDirection: "row",
    gap: 6,
  },
  cartButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#F97316",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buyNowButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cartButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  cartButtonText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
  // EMI Modal styles
  emiOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  emiSheet: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 10,
  },
  emiHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DDD",
    alignSelf: "center",
    marginBottom: 14,
  },
  emiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  emiHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  emiIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emiTitle: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#1A1A1A",
  },
  emiSubtitle: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#888",
    maxWidth: 230,
  },
  emiClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
  },
  emiSectionLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#555",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  emiTenureRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  emiTenureBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#DDD",
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: "#FAFAFA",
  },
  emiTenureBtnActive: {
    borderColor: Colors.primary,
    backgroundColor: "#F0FAF5",
  },
  emiTenureBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#888",
  },
  emiTenureBtnTextActive: {
    color: Colors.primary,
  },
  emiAdvanceRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 14,
  },
  emiAdvanceBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#E0E0E0",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: "#FAFAFA",
    minHeight: 52,
  },
  emiAdvanceBtnActive: {
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  emiAdvancePct: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: "#888",
  },
  emiAdvancePctActive: {
    color: "#D97706",
  },
  emiAdvanceAmt: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    color: "#AAA",
    marginTop: 2,
  },
  emiAdvanceAmtActive: {
    color: "#92400E",
  },
  emiLoadingBox: {
    height: 140,
    alignItems: "center",
    justifyContent: "center",
  },
  emiTable: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E8E8E8",
    marginBottom: 12,
  },
  emiTableRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#EFEFEF",
    backgroundColor: "#FFF",
  },
  emiTableRowAlt: {
    backgroundColor: "#F9F9F9",
  },
  emiTableKey: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: "#666",
    flex: 1,
  },
  emiTableVal: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#1A1A1A",
    maxWidth: 180,
    textAlign: "right" as const,
  },
  emiInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginBottom: 12,
  },
  emiInfoText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: "#888",
    flex: 1,
    lineHeight: 16,
  },
  emiApplyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
  },
  emiApplyText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFF",
  },
});
