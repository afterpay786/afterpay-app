import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  Animated,
  Alert,
  KeyboardAvoidingView,
  Share,
  Linking,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { useOrders } from "@/lib/order-context";
import { useAdmin } from "@/lib/admin-context";
import { useCustomer } from "@/lib/customer-context";
import { getApiUrl } from "@/lib/query-client";
import * as Clipboard from "expo-clipboard";

interface MenuItemProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  badge?: string;
  badgeColor?: string;
}

function MenuItem({ icon, label, subtitle, onPress, badge, badgeColor }: MenuItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.menuItem, pressed && styles.menuPressed]}
      onPress={onPress}
    >
      <View style={styles.menuIcon}>
        <Ionicons name={icon} size={20} color={Colors.primary} />
      </View>
      <View style={styles.menuInfo}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle && <Text style={styles.menuSub}>{subtitle}</Text>}
      </View>
      {badge ? (
        <View style={[styles.menuBadge, badgeColor ? { backgroundColor: badgeColor } : {}]}>
          <Text style={styles.menuBadgeText}>{badge}</Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
    </Pressable>
  );
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const router = useRouter();
  const { orders } = useOrders();
  const { isAdmin, login: adminLogin, verifyOTP, logout: adminLogout } = useAdmin();
  const { customer, isLoggedIn, register, login: customerLogin, logout: customerLogout } = useCustomer();

  const [tapCount, setTapCount] = useState(0);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSessionId, setOtpSessionId] = useState("");
  const [otpWhatsappLink, setOtpWhatsappLink] = useState("");
  const tapTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authFullName, setAuthFullName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleVersionTap = () => {
    if (isAdmin) {
      router.push("/admin-panel");
      return;
    }

    const newCount = tapCount + 1;
    setTapCount(newCount);

    if (tapTimeout.current) clearTimeout(tapTimeout.current);
    tapTimeout.current = setTimeout(() => setTapCount(0), 2000);

    if (newCount >= 5) {
      setTapCount(0);
      setShowAdminLogin(true);
      setAdminPassword("");
      setLoginError("");
    }
  };

  const handleAdminLogin = async () => {
    if (otpStep) {
      if (!otpCode.trim() || otpCode.length !== 6) {
        setLoginError("Please enter the 6-digit OTP code");
        return;
      }
      setLoggingIn(true);
      setLoginError("");
      const success = await verifyOTP(otpSessionId, otpCode);
      setLoggingIn(false);
      if (success) {
        setShowAdminLogin(false);
        setAdminPassword("");
        setOtpCode("");
        setOtpStep(false);
        setOtpSessionId("");
        setOtpWhatsappLink("");
        router.push("/admin-panel");
      } else {
        setLoginError("Invalid or expired OTP code");
        Animated.sequence([
          Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]).start();
      }
      return;
    }

    if (!adminPassword.trim()) {
      setLoginError("Please enter the admin password");
      return;
    }
    setLoggingIn(true);
    setLoginError("");
    const result = await adminLogin(adminPassword);
    setLoggingIn(false);
    if (result.success && result.requiresOTP && result.sessionId) {
      setOtpStep(true);
      setOtpSessionId(result.sessionId);
      setOtpWhatsappLink(result.whatsappLink || "");
      setLoginError("");
    } else if (result.success && !result.requiresOTP) {
      setShowAdminLogin(false);
      setAdminPassword("");
      router.push("/admin-panel");
    } else {
      setLoginError("Incorrect password");
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
      ]).start();
    }
  };

  const handleCustomerAuth = async () => {
    setAuthError("");
    if (authMode === "register") {
      if (!authFullName.trim() || !authEmail.trim() || !authPhone.trim() || !authPassword.trim()) {
        setAuthError("All fields are required");
        return;
      }
    } else {
      if (!authEmail.trim() || !authPassword.trim()) {
        setAuthError("Email and password are required");
        return;
      }
    }
    setAuthLoading(true);
    let result;
    if (authMode === "register") {
      result = await register(authFullName.trim(), authEmail.trim(), authPhone.trim(), authPassword);
    } else {
      result = await customerLogin(authEmail.trim(), authPassword);
    }
    setAuthLoading(false);
    if (result.success) {
      setShowAuthModal(false);
      resetAuthForm();
    } else {
      setAuthError(result.error || "Something went wrong");
    }
  };

  const resetAuthForm = () => {
    setAuthFullName("");
    setAuthEmail("");
    setAuthPhone("");
    setAuthPassword("");
    setAuthError("");
    setShowPassword(false);
  };

  const openAuthModal = (mode: "login" | "register") => {
    resetAuthForm();
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  const getShareUrl = () => {
    const baseUrl = getApiUrl();
    return `${baseUrl}download`;
  };

  const handleShareApp = async () => {
    try {
      await Share.share({
        title: "AFTER PAY - Buy Now Pay Later",
        message: `Check out AFTER PAY - Pakistan's best mobile phone marketplace! Shop 146+ phones from top brands at amazing prices with Buy Now Pay Later option.\n\nDownload now: ${getShareUrl()}`,
      });
    } catch {}
  };

  const handleShareWhatsApp = () => {
    const shareText = `📱 *AFTER PAY - Buy Now Pay Later*\n\nPakistan's best mobile phone marketplace! 🇵🇰\n\n✅ 146+ Phones from top brands\n💳 Buy Now Pay Later\n🚚 Free Delivery Nationwide\n🛡️ 100% PTA Approved\n💰 Best Prices Guaranteed\n\n👉 Download the app now:\n${getShareUrl()}\n\n_Shop smart. Shop AFTER PAY!_ 🏬`;
    Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareText)}`);
  };

  const handleShareSMS = () => {
    const msg = encodeURIComponent(`AFTER PAY - Pakistan's best mobile phone app! 146+ phones, best prices, free delivery. Download: ${getShareUrl()}`);
    Linking.openURL(`sms:?body=${msg}`);
  };

  const handleCopyLink = async () => {
    try {
      await Clipboard.setStringAsync(getShareUrl());
      Alert.alert("Link Copied!", "App download link has been copied to your clipboard.");
    } catch {
      Alert.alert("Share Link", getShareUrl());
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 12 }]}>
        <Text style={styles.headerTitle}>Account</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {isLoggedIn && customer ? (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: Colors.white }}>{customer.fullName.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{customer.fullName}</Text>
              <Text style={styles.profileEmail}>{customer.email}</Text>
            </View>
            <Pressable onPress={customerLogout} style={styles.logoutChip}>
              <Ionicons name="log-out-outline" size={16} color={Colors.accent} />
            </Pressable>
          </View>
        ) : (
          <Pressable style={styles.profileCard} onPress={() => openAuthModal("login")}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={32} color={Colors.white} />
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>Welcome to AFTER PAY</Text>
              <Text style={styles.profileEmail}>Sign in for best experience</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        )}

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>My Account</Text>
          <MenuItem
            icon="bag-handle-outline"
            label="My Orders"
            subtitle={orders.length > 0 ? `${orders.length} order${orders.length > 1 ? "s" : ""}` : "Track your orders"}
            onPress={() => router.push("/orders")}
          />
          <MenuItem icon="location-outline" label="Delivery Address" subtitle="Manage addresses" onPress={() => router.push("/delivery-address")} />
          <MenuItem icon="card-outline" label="Payment Methods" subtitle="Cards & accounts" onPress={() => router.push("/payment-methods")} />
        </View>

        {isAdmin && (
          <View style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>Admin</Text>
            <MenuItem
              icon="shield-checkmark"
              label="Admin Panel"
              subtitle="Manage orders & analytics"
              onPress={() => router.push("/admin-panel")}
              badge="ADMIN"
              badgeColor="#3B82F6"
            />
            <MenuItem
              icon="log-out-outline"
              label="Logout Admin"
              subtitle="Exit admin mode"
              onPress={adminLogout}
            />
          </View>
        )}

        <View style={styles.menuSection}>
          <Text style={styles.menuSectionTitle}>Settings</Text>
          <MenuItem icon="notifications-outline" label="Notifications" subtitle="Manage alerts" onPress={() => router.push("/notifications")} />
          <MenuItem icon="language-outline" label="Language" subtitle="English" onPress={() => Alert.alert("Language", "Currently only English is available. More languages coming soon!")} />
          <MenuItem icon="help-circle-outline" label="Help & Support" subtitle="FAQs & contact" onPress={() => router.push("/help-support")} />
          <MenuItem icon="information-circle-outline" label="About" subtitle="Version 1.0.0" onPress={() => Alert.alert("AFTER PAY", "Version 1.0.0\n\nYour trusted mobile marketplace in Pakistan.\n\nBuy Now Pay Later")} />
        </View>

        <View style={styles.shareCard}>
          <View style={styles.shareCardHeader}>
            <View style={styles.shareCardIcon}>
              <Ionicons name="gift-outline" size={24} color={Colors.white} />
            </View>
            <View style={styles.shareCardText}>
              <Text style={styles.shareCardTitle}>Invite Friends</Text>
              <Text style={styles.shareCardSub}>Share AFTER PAY with friends & family</Text>
            </View>
          </View>
          <View style={styles.shareButtons}>
            <Pressable style={({ pressed }) => [styles.shareBtn, styles.shareBtnWhatsapp, pressed && { opacity: 0.85 }]} onPress={handleShareWhatsApp}>
              <Ionicons name="logo-whatsapp" size={20} color="#fff" />
              <Text style={styles.shareBtnText}>WhatsApp</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.shareBtn, styles.shareBtnSms, pressed && { opacity: 0.85 }]} onPress={handleShareSMS}>
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>SMS</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.shareBtn, styles.shareBtnCopy, pressed && { opacity: 0.85 }]} onPress={handleCopyLink}>
              <Ionicons name="copy-outline" size={18} color="#fff" />
              <Text style={styles.shareBtnText}>Copy</Text>
            </Pressable>
          </View>
          <Pressable style={({ pressed }) => [styles.shareMainBtn, pressed && { opacity: 0.9 }]} onPress={handleShareApp}>
            <Ionicons name="share-social" size={20} color={Colors.white} />
            <Text style={styles.shareMainBtnText}>Share App Link</Text>
          </Pressable>
        </View>

        <Pressable onPress={handleVersionTap} style={styles.footer} testID="admin-trigger">
          <Text style={styles.footerText} testID="version-text">AFTER PAY v1.0.0</Text>
          <Text style={styles.footerSub}>Your trusted mobile marketplace</Text>
          {isAdmin && (
            <View style={styles.adminIndicator}>
              <Ionicons name="shield-checkmark" size={12} color="#FFD700" />
              <Text style={styles.adminIndicatorText}>Admin Mode Active</Text>
            </View>
          )}
        </Pressable>

        <View style={{ height: 100 }} />
      </ScrollView>

      {showAuthModal && (
        <View style={styles.loginOverlay}>
          <Pressable style={styles.loginBackdrop} onPress={() => setShowAuthModal(false)} />
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%", alignItems: "center" }}>
            <View style={[styles.loginCard, { maxWidth: 360, width: "90%" }]}>
              <View style={styles.loginHeader}>
                <View style={styles.loginIconCircle}>
                  <Ionicons name={authMode === "login" ? "person" : "person-add"} size={28} color={Colors.white} />
                </View>
                <Text style={styles.loginTitle}>{authMode === "login" ? "Sign In" : "Create Account"}</Text>
                <Text style={styles.loginSubtitle}>{authMode === "login" ? "Welcome back! Enter your details" : "Join AFTER PAY today"}</Text>
              </View>

              {authMode === "register" && (
                <View style={styles.loginInputGroup}>
                  <TextInput
                    style={[styles.loginInput, authError && !authFullName.trim() ? styles.loginInputError : {}]}
                    placeholder="Full Name"
                    placeholderTextColor={Colors.textLight}
                    value={authFullName}
                    onChangeText={(t) => { setAuthFullName(t); setAuthError(""); }}
                    autoCapitalize="words"
                  />
                </View>
              )}

              <View style={styles.loginInputGroup}>
                <TextInput
                  style={[styles.loginInput, authError && !authEmail.trim() ? styles.loginInputError : {}]}
                  placeholder="Email Address"
                  placeholderTextColor={Colors.textLight}
                  value={authEmail}
                  onChangeText={(t) => { setAuthEmail(t); setAuthError(""); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {authMode === "register" && (
                <View style={styles.loginInputGroup}>
                  <TextInput
                    style={[styles.loginInput, authError && !authPhone.trim() ? styles.loginInputError : {}]}
                    placeholder="Phone Number (03XX XXXXXXX)"
                    placeholderTextColor={Colors.textLight}
                    value={authPhone}
                    onChangeText={(t) => { setAuthPhone(t); setAuthError(""); }}
                    keyboardType="phone-pad"
                  />
                </View>
              )}

              <View style={[styles.loginInputGroup, { position: "relative" }]}>
                <TextInput
                  style={[styles.loginInput, authError && !authPassword.trim() ? styles.loginInputError : {}, { paddingRight: 48 }]}
                  placeholder="Password"
                  placeholderTextColor={Colors.textLight}
                  secureTextEntry={!showPassword}
                  value={authPassword}
                  onChangeText={(t) => { setAuthPassword(t); setAuthError(""); }}
                  onSubmitEditing={handleCustomerAuth}
                  returnKeyType="done"
                />
                <Pressable style={{ position: "absolute", right: 14, top: 14 }} onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={Colors.textLight} />
                </Pressable>
              </View>

              {authError ? <Text style={styles.loginErrorText}>{authError}</Text> : null}

              <Pressable
                style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.9 }, authLoading && { opacity: 0.7 }]}
                onPress={handleCustomerAuth}
                disabled={authLoading}
              >
                {authLoading ? (
                  <ActivityIndicator color={Colors.white} size="small" />
                ) : (
                  <Text style={styles.loginBtnText}>{authMode === "login" ? "Sign In" : "Create Account"}</Text>
                )}
              </Pressable>

              <Pressable onPress={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>
                <Text style={styles.authSwitchText}>
                  {authMode === "login" ? "Don't have an account? " : "Already have an account? "}
                  <Text style={{ color: Colors.primary, fontFamily: "Inter_600SemiBold" }}>{authMode === "login" ? "Sign Up" : "Sign In"}</Text>
                </Text>
              </Pressable>

              <Pressable style={styles.loginCancel} onPress={() => setShowAuthModal(false)}>
                <Text style={styles.loginCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}

      {showAdminLogin && (
        <View style={styles.loginOverlay}>
          <Pressable style={styles.loginBackdrop} onPress={() => { setShowAdminLogin(false); setOtpStep(false); setOtpCode(""); }} />
          <Animated.View style={[styles.loginCard, { transform: [{ translateX: shakeAnim }] }]}>
            <View style={styles.loginHeader}>
              <View style={styles.loginIconCircle}>
                <Ionicons name={otpStep ? "key" : "shield-checkmark"} size={28} color={Colors.white} />
              </View>
              <Text style={styles.loginTitle}>{otpStep ? "Enter OTP" : "Admin Access"}</Text>
              <Text style={styles.loginSubtitle}>{otpStep ? "Check your email for the 6-digit code" : "Enter admin password to continue"}</Text>
            </View>

            <View style={styles.loginInputGroup}>
              {otpStep ? (
                <TextInput
                  style={[styles.loginInput, loginError ? styles.loginInputError : {}, { textAlign: "center", fontSize: 24, letterSpacing: 8 }]}
                  placeholder="000000"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="number-pad"
                  maxLength={6}
                  value={otpCode}
                  onChangeText={(t) => { setOtpCode(t.replace(/[^0-9]/g, "")); setLoginError(""); }}
                  onSubmitEditing={handleAdminLogin}
                  returnKeyType="done"
                  autoFocus
                />
              ) : (
                <TextInput
                  style={[styles.loginInput, loginError ? styles.loginInputError : {}]}
                  placeholder="Enter password"
                  placeholderTextColor={Colors.textLight}
                  secureTextEntry
                  value={adminPassword}
                  onChangeText={(t) => { setAdminPassword(t); setLoginError(""); }}
                  onSubmitEditing={handleAdminLogin}
                  returnKeyType="done"
                  autoFocus
                />
              )}
              {loginError ? <Text style={styles.loginErrorText}>{loginError}</Text> : null}
            </View>

            <Pressable
              style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.9 }, loggingIn && { opacity: 0.7 }]}
              onPress={handleAdminLogin}
              disabled={loggingIn}
            >
              {loggingIn ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <Text style={styles.loginBtnText}>{otpStep ? "Verify OTP" : "Continue"}</Text>
              )}
            </Pressable>

            {otpStep && otpWhatsappLink ? (
              <Pressable
                style={[styles.loginBtn, { backgroundColor: "#25D366", marginTop: 10 }]}
                onPress={() => Linking.openURL(otpWhatsappLink)}
              >
                <Ionicons name="logo-whatsapp" size={18} color={Colors.white} style={{ marginRight: 6 }} />
                <Text style={styles.loginBtnText}>Get OTP via WhatsApp</Text>
              </Pressable>
            ) : null}

            {otpStep && (
              <Pressable style={styles.loginCancel} onPress={() => { setOtpStep(false); setOtpCode(""); setLoginError(""); setOtpWhatsappLink(""); }}>
                <Text style={[styles.loginCancelText, { color: Colors.primary }]}>Back to Password</Text>
              </Pressable>
            )}

            <Pressable style={styles.loginCancel} onPress={() => { setShowAdminLogin(false); setOtpStep(false); setOtpCode(""); setOtpWhatsappLink(""); }}>
              <Text style={styles.loginCancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      )}
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
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  menuSection: {
    marginBottom: 20,
  },
  menuSectionTitle: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  menuPressed: {
    opacity: 0.9,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  menuInfo: {
    flex: 1,
  },
  menuLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  menuSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  menuBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
  },
  menuBadgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
    letterSpacing: 0.5,
  },
  footer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textLight,
  },
  footerSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textLight,
    marginTop: 2,
  },
  adminIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    backgroundColor: "#1E293B",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  adminIndicatorText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    color: "#FFD700",
  },
  loginOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 100,
  },
  loginBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  loginCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 24,
    width: "85%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  loginHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  loginIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  loginTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  loginSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 4,
  },
  loginInputGroup: {
    marginBottom: 16,
  },
  loginInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  loginInputError: {
    borderColor: Colors.accent,
  },
  loginErrorText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.accent,
    marginTop: 6,
    marginLeft: 4,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    marginBottom: 12,
  },
  loginBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  loginCancel: {
    alignItems: "center",
    paddingVertical: 8,
  },
  loginCancelText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  logoutChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.accent + "15",
    alignItems: "center",
    justifyContent: "center",
  },
  authSwitchText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 8,
  },
  shareCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.primary + "20",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  shareCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  shareCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  shareCardText: {
    flex: 1,
  },
  shareCardTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    marginBottom: 2,
  },
  shareCardSub: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  shareButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  shareBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  shareBtnWhatsapp: {
    backgroundColor: "#25D366",
  },
  shareBtnSms: {
    backgroundColor: "#3B82F6",
  },
  shareBtnCopy: {
    backgroundColor: "#6B7280",
  },
  shareBtnText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  shareMainBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
  },
  shareMainBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
});
