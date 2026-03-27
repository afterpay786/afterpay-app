import { useQuery } from "@tanstack/react-query";
import { getApiUrl } from "./query-client";
import { fetch } from "expo/fetch";
import { Product, products as localProducts, brands, formatPrice, searchProducts as localSearch, sortProducts as localSort, getProductsByBrand as localGetByBrand } from "./data";

export { brands, formatPrice };

const SORT_MAP: Record<string, string> = {
  price_low: "price_asc",
  price_high: "price_desc",
  rating: "rating",
  newest: "newest",
  discount: "newest",
};

async function fetchProducts(params?: { brand?: string; search?: string; minPrice?: number; maxPrice?: number; sort?: string; page?: number; limit?: number }): Promise<{ products: Product[]; total: number }> {
  try {
    const baseUrl = getApiUrl();
    const url = new URL("/api/products", baseUrl);
    if (params?.brand) url.searchParams.set("brand", params.brand);
    if (params?.search) url.searchParams.set("search", params.search);
    if (params?.minPrice) url.searchParams.set("minPrice", String(params.minPrice));
    if (params?.maxPrice) url.searchParams.set("maxPrice", String(params.maxPrice));
    if (params?.sort) {
      const apiSort = SORT_MAP[params.sort] || params.sort;
      url.searchParams.set("sort", apiSort);
    }
    if (params?.page) url.searchParams.set("page", String(params.page));
    if (params?.limit) url.searchParams.set("limit", String(params.limit));
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error("API error");
    const data = await res.json();
    let products = data.products || [];
    if (params?.sort === "discount") {
      products = [...products].sort((a: Product, b: Product) => (b.discount || 0) - (a.discount || 0));
    }
    return { products, total: data.total || 0 };
  } catch (e) {
    console.log("[useProducts] API failed, using local data");
    let filtered = [...localProducts];
    if (params?.brand) filtered = filtered.filter(p => p.brand.toLowerCase() === params.brand!.toLowerCase());
    if (params?.search) filtered = localSearch(params.search);
    if (params?.minPrice) filtered = filtered.filter(p => p.price >= params.minPrice!);
    if (params?.maxPrice) filtered = filtered.filter(p => p.price <= params.maxPrice!);
    if (params?.sort) filtered = localSort(filtered, params.sort);
    return { products: filtered, total: filtered.length };
  }
}

async function fetchProduct(id: string): Promise<Product | null> {
  try {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}api/products/${id}`);
    if (!res.ok) throw new Error("Not found");
    return await res.json();
  } catch (e) {
    return localProducts.find(p => p.id === id) || null;
  }
}

export function useProducts(params?: { brand?: string; search?: string; minPrice?: number; maxPrice?: number; sort?: string; page?: number; limit?: number }) {
  return useQuery({
    queryKey: ["/api/products", params],
    queryFn: () => fetchProducts(params),
    staleTime: 30000,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: ["/api/products", id],
    queryFn: () => fetchProduct(id),
    staleTime: 30000,
    enabled: !!id,
  });
}

export function useAllProducts() {
  return useQuery({
    queryKey: ["/api/products/all"],
    queryFn: () => fetchProducts({ limit: 500 }),
    staleTime: 10 * 60 * 1000,
    gcTime: 20 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}
