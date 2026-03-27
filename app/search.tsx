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
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { formatPrice } from "@/lib/data";
import { useProducts } from "@/lib/use-products";
import ProductCard from "@/components/ProductCard";
import SearchHeader from "@/components/SearchHeader";

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
  { key: "all", label: "All Prices" },
  { key: "under15k", label: "Under 15K", max: 15000 },
  { key: "15k-25k", label: "15K - 25K", min: 15000, max: 25000 },
  { key: "25k-50k", label: "25K - 50K", min: 25000, max: 50000 },
  { key: "50k-100k", label: "50K - 100K", min: 50000, max: 100000 },
  { key: "100k-200k", label: "100K - 200K", min: 100000, max: 200000 },
  { key: "above200k", label: "200K+", min: 200000 },
];

export default function SearchScreen() {
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [priceFilter, setPriceFilter] = useState("all");
  const [showSort, setShowSort] = useState(false);

  const range = PRICE_RANGES.find((r) => r.key === priceFilter);
  const apiParams = useMemo(() => {
    const p: { search?: string; minPrice?: number; maxPrice?: number; sort?: string; limit?: number } = { limit: 500 };
    if (query.trim()) p.search = query.trim();
    if (range && range.key !== "all") {
      if (range.min) p.minPrice = range.min;
      if (range.max) p.maxPrice = range.max;
    }
    p.sort = sortBy;
    return p;
  }, [query, sortBy, priceFilter]);

  const { data, isLoading } = useProducts(apiParams);
  const results = data?.products || [];

  return (
    <View style={styles.container}>
      <SearchHeader
        value={query}
        onChangeText={setQuery}
        editable
        showBack
        onBack={() => router.back()}
        placeholder="Search phones, brands..."
      />

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
              priceFilter === range.key && styles.priceChipActive,
            ]}
            onPress={() => setPriceFilter(range.key)}
          >
            <Text
              style={[
                styles.priceChipText,
                priceFilter === range.key && styles.priceChipTextActive,
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
        <Text style={styles.resultCount}>{results.length} results</Text>
      </View>

      {results.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No results found</Text>
          <Text style={styles.emptyDesc}>
            Try searching with different keywords or filters
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!results.length}
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
                  <Ionicons
                    name="checkmark"
                    size={20}
                    color={Colors.primary}
                  />
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
  priceChipsScroll: {
    backgroundColor: Colors.white,
    maxHeight: 48,
  },
  priceChipsRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    alignItems: "center",
  },
  priceChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  priceChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priceChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  priceChipTextActive: {
    color: Colors.white,
    fontFamily: "Inter_600SemiBold",
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
    backgroundColor: Colors.surface,
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
});
