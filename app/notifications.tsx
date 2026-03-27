import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Animated,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

const STORAGE_KEY = "afterpay_notifications";
const PHONE_KEY = "afterpay_customer_phone";

interface NotificationPref {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  defaultValue: boolean;
}

const PREFS: NotificationPref[] = [
  {
    id: "orderUpdates",
    title: "Order Updates",
    description: "Get notified about order status changes",
    icon: "bag-handle-outline",
    defaultValue: true,
  },
  {
    id: "promotions",
    title: "Promotions & Deals",
    description: "Receive special offers and discounts",
    icon: "pricetag-outline",
    defaultValue: true,
  },
  {
    id: "priceDrops",
    title: "Price Drop Alerts",
    description: "Alert when wishlist item prices drop",
    icon: "trending-down-outline",
    defaultValue: false,
  },
  {
    id: "newArrivals",
    title: "New Arrivals",
    description: "Notify about new phone launches",
    icon: "phone-portrait-outline",
    defaultValue: true,
  },
];

interface ServerNotification {
  id: string;
  orderId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

const TYPE_ICONS: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  order_placed: { name: "bag-check", color: "#16A34A", bg: "#DCFCE7" },
  order_processing: { name: "time", color: "#D97706", bg: "#FEF3C7" },
  order_shipped: { name: "airplane", color: "#7C3AED", bg: "#EDE9FE" },
  order_delivered: { name: "checkmark-done-circle", color: "#059669", bg: "#D1FAE5" },
  order_cancelled: { name: "close-circle", color: "#DC2626", bg: "#FEE2E2" },
  payment_received: { name: "wallet", color: "#2563EB", bg: "#DBEAFE" },
  payment_reminder: { name: "alarm", color: "#EA580C", bg: "#FED7AA" },
};

function CustomToggle({
  value,
  onToggle,
}: {
  value: boolean;
  onToggle: () => void;
}) {
  const [animValue] = useState(new Animated.Value(value ? 1 : 0));

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value, animValue]);

  const bgColor = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [Colors.borderLight, Colors.primary],
  });

  const thumbPosition = animValue.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 22],
  });

  return (
    <Pressable onPress={onToggle}>
      <Animated.View style={[styles.toggle, { backgroundColor: bgColor }]}>
        <Animated.View style={[styles.toggleThumb, { transform: [{ translateX: thumbPosition }] }]} />
      </Animated.View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();

  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<"notifications" | "settings">("notifications");

  const [phone, setPhone] = useState<string | null>(null);
  const [serverNotifs, setServerNotifs] = useState<ServerNotification[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadSettings = useCallback(async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSettings(JSON.parse(stored));
    } else {
      const defaults: Record<string, boolean> = {};
      PREFS.forEach((p) => (defaults[p.id] = p.defaultValue));
      setSettings(defaults);
    }
    setLoaded(true);
  }, []);

  const loadPhone = useCallback(async () => {
    try {
      const savedPhone = await AsyncStorage.getItem(PHONE_KEY);
      if (savedPhone) {
        setPhone(savedPhone);
        return savedPhone;
      }
    } catch {}
    return null;
  }, []);

  const fetchNotifications = useCallback(async (phoneNum: string) => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/notifications?phone=${encodeURIComponent(phoneNum)}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setServerNotifs(data);
        fetch(`${baseUrl}api/notifications/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phoneNum }),
        }).catch(() => {});
      }
    } catch {}
    setNotifsLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
    loadPhone().then((p) => {
      if (p) fetchNotifications(p);
      else setNotifsLoading(false);
    });
  }, [loadSettings, loadPhone, fetchNotifications]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (phone) await fetchNotifications(phone);
    setRefreshing(false);
  };

  const toggleSetting = async (id: string) => {
    const updated = { ...settings, [id]: !settings[id] };
    setSettings(updated);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString("en-PK", { day: "numeric", month: "short" });
  };

  if (!loaded) return null;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, activeTab === "notifications" && styles.tabItemActive]}
          onPress={() => setActiveTab("notifications")}
        >
          <Ionicons name="notifications" size={16} color={activeTab === "notifications" ? Colors.primary : Colors.textLight} />
          <Text style={[styles.tabText, activeTab === "notifications" && styles.tabTextActive]}>Updates</Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === "settings" && styles.tabItemActive]}
          onPress={() => setActiveTab("settings")}
        >
          <Ionicons name="settings" size={16} color={activeTab === "settings" ? Colors.primary : Colors.textLight} />
          <Text style={[styles.tabText, activeTab === "settings" && styles.tabTextActive]}>Preferences</Text>
        </Pressable>
      </View>

      {activeTab === "notifications" ? (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {notifsLoading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : serverNotifs.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Ionicons name="notifications-outline" size={48} color={Colors.textLight} />
              </View>
              <Text style={styles.emptyTitle}>
                {phone ? "All Caught Up!" : "No Notifications Yet"}
              </Text>
              <Text style={styles.emptySubtitle}>
                {phone
                  ? "You'll receive updates here when your order status changes or payment is confirmed."
                  : "Place an order to start receiving notifications about your order status and payment updates."}
              </Text>
            </View>
          ) : (
            serverNotifs.map((n) => {
              const typeInfo = TYPE_ICONS[n.type] || { name: "notifications" as keyof typeof Ionicons.glyphMap, color: Colors.primary, bg: Colors.primary + "15" };
              return (
                <Pressable
                  key={n.id}
                  style={[styles.realNotifCard, !n.read && styles.realNotifUnread]}
                  onPress={() => {
                    if (n.orderId) {
                      router.push({ pathname: "/order-detail", params: { orderId: n.orderId } });
                    }
                  }}
                >
                  <View style={[styles.realNotifIcon, { backgroundColor: typeInfo.bg }]}>
                    <Ionicons name={typeInfo.name} size={22} color={typeInfo.color} />
                  </View>
                  <View style={styles.realNotifContent}>
                    <View style={styles.realNotifHeaderRow}>
                      <Text style={styles.realNotifTitle} numberOfLines={1}>{n.title}</Text>
                      <Text style={styles.realNotifTime}>{formatDate(n.createdAt)}</Text>
                    </View>
                    <Text style={styles.realNotifMessage} numberOfLines={3}>{n.message}</Text>
                    {n.orderId && (
                      <View style={styles.realNotifOrderRow}>
                        <Ionicons name="receipt-outline" size={12} color={Colors.primary} />
                        <Text style={styles.realNotifOrderId}>{n.orderId.substring(0, 14)}</Text>
                      </View>
                    )}
                  </View>
                  {!n.read && <View style={styles.unreadDot} />}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Notification Preferences</Text>

          {PREFS.map((pref) => (
            <View key={pref.id} style={styles.prefCard}>
              <View style={styles.prefIcon}>
                <Ionicons name={pref.icon} size={20} color={Colors.primary} />
              </View>
              <View style={styles.prefInfo}>
                <Text style={styles.prefTitle}>{pref.title}</Text>
                <Text style={styles.prefDesc}>{pref.description}</Text>
              </View>
              <CustomToggle value={!!settings[pref.id]} onToggle={() => toggleSetting(pref.id)} />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  tabBar: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  tabItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabItemActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textLight },
  tabTextActive: { color: Colors.primary, fontFamily: "Inter_600SemiBold" },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  sectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  prefCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  prefIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  prefInfo: { flex: 1, marginRight: 12 },
  prefTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 2 },
  prefDesc: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  emptyState: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.borderLight, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20 },
  realNotifCard: {
    flexDirection: "row",
    padding: 14,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  realNotifUnread: { backgroundColor: "#F0FDF4", borderColor: Colors.primary + "30" },
  realNotifIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  realNotifContent: { flex: 1 },
  realNotifHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  realNotifTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1 },
  realNotifTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textLight, marginLeft: 8 },
  realNotifMessage: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 18 },
  realNotifOrderRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  realNotifOrderId: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.primary },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },
});
