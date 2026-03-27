import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "./query-client";

export interface CustomerProfile {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  createdAt: string;
}

interface CustomerContextValue {
  customer: CustomerProfile | null;
  token: string | null;
  isLoggedIn: boolean;
  loading: boolean;
  register: (fullName: string, email: string, phone: string, password: string, city?: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const CustomerContext = createContext<CustomerContextValue | null>(null);

const CUSTOMER_TOKEN_KEY = "@afterpay_customer_token";
const CUSTOMER_DATA_KEY = "@afterpay_customer_data";

export function CustomerProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(CUSTOMER_TOKEN_KEY),
      AsyncStorage.getItem(CUSTOMER_DATA_KEY),
    ]).then(([savedToken, savedData]) => {
      if (savedToken && savedData) {
        try {
          setToken(savedToken);
          setCustomer(JSON.parse(savedData));
        } catch {}
      }
      setLoading(false);
    });
  }, []);

  const register = useCallback(async (fullName: string, email: string, phone: string, password: string, city?: string) => {
    try {
      const res = await apiRequest("POST", "/api/customers/register", { fullName, email, phone, password, city });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        setCustomer(data.customer);
        await AsyncStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
        await AsyncStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(data.customer));
        return { success: true };
      }
      return { success: false, error: data.error || "Registration failed" };
    } catch (err: any) {
      const msg = err?.message || "Registration failed";
      if (msg.includes("409")) return { success: false, error: "An account with this email already exists" };
      return { success: false, error: msg };
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await apiRequest("POST", "/api/customers/login", { email, password });
      const data = await res.json();
      if (data.success) {
        setToken(data.token);
        setCustomer(data.customer);
        await AsyncStorage.setItem(CUSTOMER_TOKEN_KEY, data.token);
        await AsyncStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(data.customer));
        return { success: true };
      }
      return { success: false, error: data.error || "Login failed" };
    } catch (err: any) {
      const msg = err?.message || "Login failed";
      if (msg.includes("401")) return { success: false, error: "Invalid email or password" };
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(() => {
    setCustomer(null);
    setToken(null);
    AsyncStorage.removeItem(CUSTOMER_TOKEN_KEY);
    AsyncStorage.removeItem(CUSTOMER_DATA_KEY);
  }, []);

  return (
    <CustomerContext.Provider value={{ customer, token, isLoggedIn: !!customer, loading, register, login, logout }}>
      {children}
    </CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within CustomerProvider");
  return ctx;
}
