import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Product } from "./data";

export interface CartItem {
  product: Product;
  quantity: number;
  selectedVariant?: { label: string; price: number };
}

interface CartContextValue {
  items: CartItem[];
  addToCart: (product: Product, variant?: { label: string; price: number }) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getItemCount: () => number;
  getTotal: () => number;
  isInCart: (productId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = "@afterpay_cart";

function getItemPrice(item: CartItem): number {
  return item.selectedVariant?.price || item.product.price;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(CART_KEY).then((data) => {
      if (data) {
        try {
          setItems(JSON.parse(data));
        } catch {}
      }
    });
  }, []);

  const persist = useCallback((newItems: CartItem[]) => {
    setItems(newItems);
    AsyncStorage.setItem(CART_KEY, JSON.stringify(newItems));
  }, []);

  const addToCart = useCallback(
    (product: Product, variant?: { label: string; price: number }) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.product.id === product.id);
        let next: CartItem[];
        if (existing) {
          next = prev.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + 1, selectedVariant: variant || i.selectedVariant }
              : i
          );
        } else {
          next = [...prev, { product, quantity: 1, selectedVariant: variant }];
        }
        AsyncStorage.setItem(CART_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const removeFromCart = useCallback(
    (productId: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.product.id !== productId);
        AsyncStorage.setItem(CART_KEY, JSON.stringify(next));
        return next;
      });
    },
    []
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number) => {
      if (quantity <= 0) {
        removeFromCart(productId);
        return;
      }
      setItems((prev) => {
        const next = prev.map((i) =>
          i.product.id === productId ? { ...i, quantity } : i
        );
        AsyncStorage.setItem(CART_KEY, JSON.stringify(next));
        return next;
      });
    },
    [removeFromCart]
  );

  const clearCart = useCallback(() => {
    persist([]);
  }, [persist]);

  const getItemCount = useCallback(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items]
  );

  const getTotal = useCallback(
    () => items.reduce((sum, i) => sum + getItemPrice(i) * i.quantity, 0),
    [items]
  );

  const isInCart = useCallback(
    (productId: string) => items.some((i) => i.product.id === productId),
    [items]
  );

  const value = useMemo(
    () => ({
      items,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getItemCount,
      getTotal,
      isInCart,
    }),
    [items, addToCart, removeFromCart, updateQuantity, clearCart, getItemCount, getTotal, isInCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

export { getItemPrice };
