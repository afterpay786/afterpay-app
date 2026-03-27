import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Linking,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

const CONTACT_OPTIONS = [
  {
    id: "whatsapp",
    title: "WhatsApp",
    subtitle: "Chat with us",
    icon: "logo-whatsapp" as keyof typeof Ionicons.glyphMap,
    color: "#25D366",
    url: "https://wa.me/923261605570",
  },
  {
    id: "email",
    title: "Email",
    subtitle: "support@afterpay.pk",
    icon: "mail-outline" as keyof typeof Ionicons.glyphMap,
    color: "#3B82F6",
    url: "mailto:support@afterpay.pk",
  },
  {
    id: "phone",
    title: "Phone",
    subtitle: "0326-1605570",
    icon: "call-outline" as keyof typeof Ionicons.glyphMap,
    color: Colors.primary,
    url: "tel:03261605570",
  },
];

const FAQS = [
  {
    question: "How do I place an order?",
    answer:
      "Browse products, add to cart, proceed to checkout, fill delivery details, select payment method, and confirm your order.",
  },
  {
    question: "What payment methods are accepted?",
    answer:
      "We accept Cash on Delivery, JazzCash, EasyPaisa, Credit/Debit Cards, Bank Transfer, and Buy Now Pay Later installments.",
  },
  {
    question: "How long does delivery take?",
    answer:
      "Standard delivery takes 3-5 business days nationwide. Express delivery is available in major cities.",
  },
  {
    question: "What is your return policy?",
    answer:
      "We offer a 7-day return policy for all products. Items must be in original condition with packaging.",
  },
  {
    question: "How can I track my order?",
    answer:
      "Go to My Orders in your account to see real-time order status and tracking updates.",
  },
  {
    question: "Is Cash on Delivery available?",
    answer:
      "Yes, COD is available nationwide with a standard delivery fee of Rs. 149.",
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const animHeight = useRef(new Animated.Value(0)).current;

  const toggle = useCallback(() => {
    Animated.timing(animHeight, {
      toValue: expanded ? 0 : 1,
      duration: 250,
      useNativeDriver: false,
    }).start();
    setExpanded(!expanded);
  }, [expanded, animHeight]);

  const maxHeight = animHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 150],
  });

  const rotate = animHeight.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.faqCard}>
      <Pressable style={styles.faqHeader} onPress={toggle}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
        </Animated.View>
      </Pressable>
      <Animated.View style={{ maxHeight, overflow: "hidden" }}>
        <Text style={styles.faqAnswer}>{answer}</Text>
      </Animated.View>
    </View>
  );
}

export default function HelpSupportScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Contact Us</Text>

        {CONTACT_OPTIONS.map((option) => (
          <Pressable
            key={option.id}
            style={({ pressed }) => [styles.contactCard, pressed && { opacity: 0.9 }]}
            onPress={() => Linking.openURL(option.url)}
          >
            <View style={[styles.contactIcon, { backgroundColor: option.color + "15" }]}>
              <Ionicons name={option.icon} size={22} color={option.color} />
            </View>
            <View style={styles.contactInfo}>
              <Text style={styles.contactTitle}>{option.title}</Text>
              <Text style={styles.contactSubtitle}>{option.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
          </Pressable>
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>FAQs</Text>

        {FAQS.map((faq, idx) => (
          <FAQItem key={idx} question={faq.question} answer={faq.answer} />
        ))}

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Legal</Text>

        <Pressable
          style={({ pressed }) => [styles.contactCard, pressed && { opacity: 0.9 }]}
          onPress={() => Linking.openURL(`${getApiUrl()}/privacy-policy`)}
        >
          <View style={[styles.contactIcon, { backgroundColor: "#4EA97A15" }]}>
            <Ionicons name="shield-checkmark-outline" size={22} color="#4EA97A" />
          </View>
          <View style={styles.contactInfo}>
            <Text style={styles.contactTitle}>Privacy Policy</Text>
            <Text style={styles.contactSubtitle}>How we collect and use your data</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={Colors.textLight} />
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.contactCard, pressed && { opacity: 0.9 }]}
          onPress={() => Linking.openURL(`${getApiUrl()}/terms`)}
        >
          <View style={[styles.contactIcon, { backgroundColor: "#3B82F615" }]}>
            <Ionicons name="document-text-outline" size={22} color="#3B82F6" />
          </View>
          <View style={styles.contactInfo}>
            <Text style={styles.contactTitle}>Terms of Use</Text>
            <Text style={styles.contactSubtitle}>Rules and conditions for using AFTER PAY</Text>
          </View>
          <Ionicons name="open-outline" size={18} color={Colors.textLight} />
        </Pressable>

        <View style={styles.versionSection}>
          <Text style={styles.versionText}>App Version 1.0.0</Text>
          <Text style={[styles.versionText, { marginTop: 4, fontSize: 11 }]}>
            © 2025 AFTER PAY. All rights reserved.
          </Text>
        </View>
      </ScrollView>
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
  contactCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  contactIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  contactInfo: { flex: 1 },
  contactTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 2 },
  contactSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  faqCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: "hidden",
  },
  faqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  faqQuestion: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1, marginRight: 12 },
  faqAnswer: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  versionSection: {
    alignItems: "center",
    paddingVertical: 24,
  },
  versionText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.textLight },
});
