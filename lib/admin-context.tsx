import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest } from "./query-client";

interface AdminContextValue {
  isAdmin: boolean;
  token: string | null;
  login: (password: string) => Promise<{ success: boolean; requiresOTP?: boolean; sessionId?: string; whatsappLink?: string }>;
  verifyOTP: (sessionId: string, otp: string) => Promise<boolean>;
  logout: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);
const ADMIN_TOKEN_KEY = "@afterpay_admin_token";

export function AdminProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(ADMIN_TOKEN_KEY).then((t) => {
      if (t) setToken(t);
    });
  }, []);

  const login = useCallback(async (password: string): Promise<{ success: boolean; requiresOTP?: boolean; sessionId?: string; whatsappLink?: string }> => {
    try {
      const res = await apiRequest("POST", "/api/admin/login", { password });
      const data = await res.json();
      if (data.requiresOTP) {
        return { success: true, requiresOTP: true, sessionId: data.sessionId, whatsappLink: data.whatsappLink };
      }
      if (data.success && data.token) {
        setToken(data.token);
        await AsyncStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        return { success: true };
      }
      return { success: false };
    } catch {
      return { success: false };
    }
  }, []);

  const verifyOTP = useCallback(async (sessionId: string, otp: string): Promise<boolean> => {
    try {
      const res = await apiRequest("POST", "/api/admin/verify-otp", { sessionId, otp });
      const data = await res.json();
      if (data.success && data.token) {
        setToken(data.token);
        await AsyncStorage.setItem(ADMIN_TOKEN_KEY, data.token);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    if (token) {
      try {
        await apiRequest("POST", "/api/admin/logout");
      } catch {}
    }
    setToken(null);
    AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
  }, [token]);

  const value = useMemo(
    () => ({ isAdmin: !!token, token, login, verifyOTP, logout }),
    [token, login, verifyOTP, logout]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}
