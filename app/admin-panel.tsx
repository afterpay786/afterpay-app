import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  Modal,
  RefreshControl,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { queryClient } from "@/lib/query-client";
import Colors from "@/constants/colors";
import { useAdmin } from "@/lib/admin-context";
import { formatPrice } from "@/lib/data";
import { getApiUrl } from "@/lib/query-client";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

interface AdminOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryNotes: string;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: string;
  openParcel: boolean;
  estimatedDelivery: string;
  items: OrderItem[];
  createdAt: string;
  paymentOption?: string;
  advanceAmount?: number;
  paymentStatus?: string;
  bankTransferInfo?: {
    cnic: string;
    accountTitle: string;
    accountNumber: string;
    paymentProof?: string;
  };
  bnplDocuments?: {
    cnicFront?: string;
    cnicBack?: string;
    tasdeeqApp?: string;
    bankCheque?: string;
    bankStatements?: string[];
    applicationForm?: string;
  };
}

interface Stats {
  totalOrders: number;
  totalRevenue: number;
  statusCounts: Record<string, number>;
  paymentCounts: Record<string, number>;
  cityCounts: Record<string, number>;
}

interface AdminProduct {
  id: string;
  name: string;
  brand: string;
  slug: string;
  price: number;
  originalPrice: number;
  discount: number;
  rating: number;
  reviews: number;
  image: string;
  images: string[];
  specs: { label: string; value: string }[];
  description: string;
  fastDelivery: boolean;
  inStock: boolean;
  colors: { name: string; hex: string; image: string; images: string[]; soldOut: boolean }[];
  storageOptions: { label: string; price: number }[];
  highlights: any[];
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#3B82F6",
  processing: "#F59E0B",
  shipped: "#8B5CF6",
  delivered: "#10B981",
  cancelled: "#EF4444",
};

const PAYMENT_LABELS: Record<string, string> = {
  cod: "Cash on Delivery",
  jazzcash: "JazzCash",
  easypaisa: "EasyPaisa",
  card: "Credit/Debit Card",
  bank_transfer: "Bank Transfer",
  bnpl: "Installments",
};

const STATUSES = ["all", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const BRAND_LIST = ["Samsung", "Apple", "Infinix", "Tecno", "OPPO", "Vivo", "Xiaomi", "Realme", "Nothing", "Honor", "Itel", "Motorola"];

const EMPTY_PRODUCT: Partial<AdminProduct> = {
  name: "", brand: "Samsung", price: 0, originalPrice: 0, discount: 0,
  image: "", images: [], specs: [], description: "", fastDelivery: false,
  inStock: true, colors: [], storageOptions: [], highlights: [],
};

export default function AdminPanelScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();
  const { token, logout } = useAdmin();

  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [tab, setTab] = useState<"orders" | "stats" | "products" | "customers" | "health" | "scraper">("orders");

  const [backupLoading, setBackupLoading] = useState(false);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState<any>(null);

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [productBrandFilter, setProductBrandFilter] = useState("all");
  const [productsLoading, setProductsLoading] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [productForm, setProductForm] = useState<Record<string, any>>({ ...EMPTY_PRODUCT });
  const [savingProduct, setSavingProduct] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<string | null>(null);
  const [proofImageModal, setProofImageModal] = useState<string | null>(null);

  interface AdminCustomer {
    id: string;
    fullName: string;
    email: string;
    phone: string;
    city: string;
    createdAt: string;
  }
  const [customersList, setCustomersList] = useState<AdminCustomer[]>([]);
  const [customersTotal, setCustomersTotal] = useState(0);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);

  const [scraperAudit, setScraperAudit] = useState<any>(null);
  const [scraperAuditLoading, setScraperAuditLoading] = useState(false);
  const [scraperExpandedCategory, setScraperExpandedCategory] = useState<string | null>(null);

  // Custom scrape command state
  const [customQuery, setCustomQuery] = useState("");
  const [customPreviewLoading, setCustomPreviewLoading] = useState(false);
  const [customScrapeLoading, setCustomScrapeLoading] = useState(false);
  const [customPreviewResults, setCustomPreviewResults] = useState<any[] | null>(null);
  const [customScrapeResult, setCustomScrapeResult] = useState<any | null>(null);
  const [customMaxResults, setCustomMaxResults] = useState("10");
  const [aiExtractedKeyword, setAiExtractedKeyword] = useState<string | null>(null);

  // Voice recognition state (web: SpeechRecognition API; mobile: keyboard mic guidance)
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const [colorFormName, setColorFormName] = useState("");
  const [colorFormHex, setColorFormHex] = useState("#000000");
  const [colorFormImage, setColorFormImage] = useState("");
  const [storageFormLabel, setStorageFormLabel] = useState("");
  const [storageFormPrice, setStorageFormPrice] = useState("");
  const [specFormLabel, setSpecFormLabel] = useState("");
  const [specFormValue, setSpecFormValue] = useState("");
  const [imagesText, setImagesText] = useState("");

  const authHeaders = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const fetchOrders = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (searchQuery) params.set("search", searchQuery);
      params.set("limit", "50");
      const res = await fetch(`${baseUrl}api/admin/orders?${params}`, { headers: authHeaders });
      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      console.log("Fetch orders error:", err);
    }
  }, [token, statusFilter, searchQuery]);

  const fetchStats = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/stats`, { headers: authHeaders });
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.log("Fetch stats error:", err);
    }
  }, [token]);

  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    try {
      const baseUrl = getApiUrl();
      const params = new URLSearchParams();
      if (productSearch) params.set("search", productSearch);
      if (productBrandFilter !== "all") params.set("brand", productBrandFilter);
      params.set("limit", "50");
      const res = await fetch(`${baseUrl}api/admin/products?${params}`, { headers: authHeaders });
      const data = await res.json();
      setProducts(data.products || []);
      setProductsTotal(data.total || 0);
    } catch (err) {
      console.log("Fetch products error:", err);
    }
    setProductsLoading(false);
  }, [token, productSearch, productBrandFilter]);

  const fetchCustomers = useCallback(async () => {
    setCustomersLoading(true);
    try {
      const baseUrl = getApiUrl();
      const params = new URLSearchParams();
      if (customerSearch) params.set("search", customerSearch);
      params.set("limit", "50");
      const res = await fetch(`${baseUrl}api/admin/customers?${params}`, { headers: authHeaders });
      const data = await res.json();
      setCustomersList(data.customers || []);
      setCustomersTotal(data.total || 0);
    } catch (err) {
      console.log("Fetch customers error:", err);
    }
    setCustomersLoading(false);
  }, [token, customerSearch]);

  const downloadBnplDocument = async (dataUri: string, fileName: string) => {
    try {
      if (Platform.OS === "web") {
        const link = document.createElement("a");
        link.href = dataUri;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
      const base64Data = dataUri.split(",")[1];
      if (!base64Data) {
        Alert.alert("Error", "Invalid document data");
        return;
      }
      const isPdf = dataUri.startsWith("data:application/pdf");
      const mimeType = isPdf ? "application/pdf" : "image/jpeg";
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, base64Data, { encoding: FileSystem.EncodingType.Base64 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: `Save ${fileName}` });
      } else {
        Alert.alert("Saved", `Document saved to ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert("Error", "Failed to save document: " + (err.message || "Unknown error"));
    }
  };

  const triggerBackup = async () => {
    setBackupLoading(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/backup`, { method: "POST", headers: authHeaders });
      const data = await res.json();
      Alert.alert(data.success ? "Backup Sent" : "Backup Failed", data.message);
    } catch (err: any) {
      Alert.alert("Error", "Failed to trigger backup");
    }
    setBackupLoading(false);
  };

  const triggerScrape = async () => {
    setScrapeLoading(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/scrape`, { method: "POST", headers: authHeaders });
      const data = await res.json();
      Alert.alert(data.success ? "Scrape Started" : "Scrape Failed", data.message);
      pollScrapeStatus();
    } catch (err: any) {
      Alert.alert("Error", "Failed to trigger scrape");
    }
    setScrapeLoading(false);
  };

  const pollScrapeStatus = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/scrape/status`, { headers: authHeaders });
      const data = await res.json();
      setScrapeStatus(data);
      if (data.isRunning) {
        setTimeout(pollScrapeStatus, 5000);
      }
    } catch {}
  }, [token]);

  const fetchAuditResult = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/health-audit`, { headers: authHeaders });
      const data = await res.json();
      if (data.lastResult) setAuditResult(data.lastResult);
      setAuditRunning(data.running || false);
    } catch {}
  }, [token]);

  const triggerAudit = async (autoFix: boolean = true) => {
    setAuditLoading(true);
    setAuditRunning(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/health-audit`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ autoFix }),
      });
      const data = await res.json();
      if (data.running) {
        Alert.alert("In Progress", "Health audit is already running");
      } else {
        setAuditResult(data);
        const fixed = data.issuesSummary?.autoFixed || 0;
        const total = data.issuesSummary?.total || 0;
        Alert.alert(
          "Health Audit Complete",
          total === 0
            ? "All checks passed! No issues found."
            : `Found ${total} issues. ${fixed > 0 ? `Auto-fixed ${fixed}.` : ""}`
        );
      }
    } catch (err: any) {
      Alert.alert("Error", "Failed to run health audit");
    }
    setAuditLoading(false);
    setAuditRunning(false);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchOrders(), fetchStats()]);
    setLoading(false);
  }, [fetchOrders, fetchStats]);

  useEffect(() => { loadData(); }, [statusFilter]);
  useEffect(() => { if (tab === "products") fetchProducts(); }, [tab, productBrandFilter]);
  useEffect(() => { if (tab === "customers") fetchCustomers(); }, [tab]);

  useEffect(() => { if (tab === "stats") pollScrapeStatus(); }, [tab]);
  useEffect(() => { if (tab === "health") fetchAuditResult(); }, [tab]);
  useEffect(() => { if (tab === "scraper") fetchScraperAudit(); }, [tab]);

  const fetchScraperAudit = async () => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/scraper-audit/result`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        if (data.lastResult) setScraperAudit(data.lastResult);
      }
    } catch {}
  };

  const runScraperAuditFn = async (autoFix: boolean) => {
    setScraperAuditLoading(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/scraper-audit/run`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ autoFix }),
      });
      const data = await res.json();
      if (data.running) {
        Alert.alert("In Progress", "Scraper audit is already running");
      } else if (data.error) {
        Alert.alert("Error", data.error);
      } else {
        setScraperAudit(data);
        const score = data.healthScore ?? 0;
        const fixed = data.summary?.fixed ?? 0;
        Alert.alert(
          score >= 80 ? "Scraper Healthy ✓" : score >= 50 ? "Issues Found" : "Critical Issues",
          `Health Score: ${score}/100\n${data.summary?.pass}/${data.summary?.totalChecks} checks passed${fixed > 0 ? `\n${fixed} issues auto-fixed` : ""}`
        );
      }
    } catch (err: any) {
      Alert.alert("Error", "Failed to run scraper audit");
    }
    setScraperAuditLoading(false);
  };

  const startVoiceInput = () => {
    if (Platform.OS !== "web") {
      Alert.alert(
        "🎤 Voice Input",
        "Tap the microphone icon on your phone keyboard to speak your search. Your text will appear in the search box automatically.",
        [{ text: "Got it" }]
      );
      return;
    }
    const SpeechRecognition =
      typeof window !== "undefined" &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

    if (!SpeechRecognition) {
      Alert.alert("Not Supported", "Your browser does not support voice input. Please type your search query.");
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setCustomQuery(transcript);
      setCustomPreviewResults(null);
      setCustomScrapeResult(null);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const runCustomPreview = async () => {
    const q = customQuery.trim();
    if (q.length < 2) { Alert.alert("Enter a model name", "Type at least 2 characters to search"); return; }
    setCustomPreviewLoading(true);
    setCustomPreviewResults(null);
    setCustomScrapeResult(null);
    const baseUrl = getApiUrl();
    try {
      const res = await fetch(`${baseUrl}api/admin/scrape/search-preview`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (data.success) {
        setCustomPreviewResults(data.results);
        if (data.results.length === 0) Alert.alert("Not Found", `No products found for "${q}" on Priceoye`);
      } else {
        Alert.alert("Search Failed", data.message || "Could not reach Priceoye");
      }
    } catch (err: any) {
      Alert.alert("Error", "Search failed. Check your connection.");
    }
    setCustomPreviewLoading(false);
  };

  const runCustomScrape = async () => {
    const q = customQuery.trim();
    if (q.length < 2) { Alert.alert("Enter a model name", "Type at least 2 characters"); return; }
    const max = parseInt(customMaxResults, 10);
    if (isNaN(max) || max < 1 || max > 20) { Alert.alert("Invalid", "Max results must be between 1 and 20"); return; }
    const baseUrl = getApiUrl();

    // Step 1: AI keyword extraction
    let searchKeyword = q;
    let isNL = false;
    try {
      const exRes = await fetch(`${baseUrl}api/admin/scrape/extract-keywords`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (exRes.ok) {
        const ex = await exRes.json();
        if (ex.success && ex.keyword) {
          searchKeyword = ex.keyword;
          isNL = ex.isNaturalLanguage;
          setAiExtractedKeyword(isNL ? ex.keyword : null);
        }
      }
    } catch {}

    const confirmMsg = isNL
      ? `AI understood: searching for "${searchKeyword}"\n\nScrape Priceoye and add up to ${max} products to your store?`
      : `Scrape Priceoye for "${searchKeyword}" and add up to ${max} products to your store?`;

    Alert.alert("Confirm Scrape", confirmMsg, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Scrape & Add",
          style: "default",
          onPress: async () => {
            setCustomScrapeLoading(true);
            setCustomScrapeResult(null);
            try {
              const res = await fetch(`${baseUrl}api/admin/scrape/custom`, {
                method: "POST",
                headers: { ...authHeaders, "Content-Type": "application/json" },
                body: JSON.stringify({ query: searchKeyword, maxResults: max }),
              });
              const data = await res.json();
              setCustomScrapeResult(data);
              if (data.success) {
                // Invalidate all product caches so newly scraped items appear in the frontend immediately
                if (data.scraped > 0) {
                  queryClient.invalidateQueries({ queryKey: ["/api/products"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/products/all"] });
                }
                Alert.alert(
                  data.newProducts > 0 ? `✓ ${data.newProducts} New Product${data.newProducts !== 1 ? "s" : ""} Added` : "Scrape Complete",
                  `Found: ${data.found} · Saved: ${data.scraped} · New: ${data.newProducts} · Errors: ${data.errors}`
                );
              } else {
                Alert.alert("Scrape Failed", data.message || "Unknown error");
              }
            } catch (err: any) {
              Alert.alert("Error", "Scrape failed. Check your connection.");
            }
            setCustomScrapeLoading(false);
          },
        },
      ]
    );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (tab === "products") await fetchProducts();
    else if (tab === "customers") await fetchCustomers();
    else if (tab === "health") await fetchAuditResult();
    else if (tab === "scraper") await fetchScraperAudit();
    else { await Promise.all([fetchOrders(), fetchStats()]); pollScrapeStatus(); }
    setRefreshing(false);
  };

  const handleSearch = () => { fetchOrders(); };
  const handleProductSearch = () => { fetchProducts(); };

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/orders/${orderId}/status`, {
        method: "PATCH", headers: authHeaders, body: JSON.stringify({ status: newStatus }),
      });
      const updated = await res.json();
      const resolvedStatus = updated.status || newStatus;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: resolvedStatus } : o)));
      setSelectedOrder((prev) => prev && prev.id === orderId ? { ...prev, status: resolvedStatus } : prev);
      fetchStats();
    } catch (err) {
      Alert.alert("Error", "Failed to update order status");
    }
    setUpdatingStatus(false);
  };

  const [updatingPayment, setUpdatingPayment] = useState(false);

  const updatePaymentStatus = async (orderId: string, paymentStatus: string) => {
    setUpdatingPayment(true);
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/orders/${orderId}/payment-status`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ paymentStatus }),
      });
      const updated = await res.json();
      const newStatus = updated.paymentStatus || paymentStatus;
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, paymentStatus: newStatus } : o)));
      setSelectedOrder((prev) => prev && prev.id === orderId ? { ...prev, paymentStatus: newStatus } : prev);

      if (paymentStatus === "paid" && updated.whatsappLink) {
        Alert.alert(
          "Payment Marked as Paid",
          "Customer has been notified. Would you like to send a WhatsApp message as well?",
          [
            { text: "Not Now", style: "cancel" },
            { text: "Send WhatsApp", onPress: () => Linking.openURL(updated.whatsappLink) },
          ]
        );
      } else {
        Alert.alert("Updated", `Payment status set to ${paymentStatus}`);
      }
      fetchStats();
    } catch (err) {
      Alert.alert("Error", "Failed to update payment status");
    }
    setUpdatingPayment(false);
  };

  const sendWhatsAppNotification = async (orderId: string, type: string) => {
    try {
      const baseUrl = getApiUrl();
      const res = await fetch(`${baseUrl}api/admin/orders/${orderId}/whatsapp-link?type=${type}`, {
        headers: authHeaders,
      });
      const data = await res.json();
      if (data.whatsappLink) {
        Linking.openURL(data.whatsappLink);
      } else {
        Alert.alert("Error", "Could not generate WhatsApp link");
      }
    } catch (err) {
      Alert.alert("Error", "Failed to generate WhatsApp link");
    }
  };

  const openAddProduct = () => {
    setEditingProduct(null);
    setProductForm({ ...EMPTY_PRODUCT });
    setImagesText("");
    setShowProductForm(true);
  };

  const openEditProduct = (product: AdminProduct) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      brand: product.brand,
      price: product.price,
      originalPrice: product.originalPrice,
      discount: product.discount,
      image: product.image,
      images: product.images || [],
      specs: product.specs || [],
      description: product.description,
      fastDelivery: product.fastDelivery,
      inStock: product.inStock,
      colors: product.colors || [],
      storageOptions: product.storageOptions || [],
      highlights: product.highlights || [],
      rating: product.rating,
      reviews: product.reviews,
    });
    setImagesText((product.images || []).join("\n"));
    setShowProductForm(true);
  };

  const saveProduct = async () => {
    if (!productForm.name || !productForm.brand || !productForm.price) {
      Alert.alert("Missing Fields", "Name, brand, and price are required.");
      return;
    }
    setSavingProduct(true);
    try {
      const baseUrl = getApiUrl();
      const payload = {
        ...productForm,
        price: parseInt(String(productForm.price)) || 0,
        originalPrice: parseInt(String(productForm.originalPrice)) || parseInt(String(productForm.price)) || 0,
        discount: parseInt(String(productForm.discount)) || 0,
        images: imagesText.split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 0),
      };

      if (editingProduct) {
        await fetch(`${baseUrl}api/admin/products/${editingProduct.id}`, {
          method: "PUT", headers: authHeaders, body: JSON.stringify(payload),
        });
      } else {
        await fetch(`${baseUrl}api/admin/products`, {
          method: "POST", headers: authHeaders, body: JSON.stringify(payload),
        });
      }
      setShowProductForm(false);
      fetchProducts();
    } catch (err) {
      Alert.alert("Error", "Failed to save product");
    }
    setSavingProduct(false);
  };

  const deleteProduct = async (id: string) => {
    Alert.alert(
      "Delete Product",
      "Are you sure you want to delete this product? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            setDeletingProduct(id);
            try {
              const baseUrl = getApiUrl();
              await fetch(`${baseUrl}api/admin/products/${id}`, {
                method: "DELETE", headers: authHeaders,
              });
              setProducts(prev => prev.filter(p => p.id !== id));
              setProductsTotal(prev => prev - 1);
            } catch (err) {
              Alert.alert("Error", "Failed to delete product");
            }
            setDeletingProduct(null);
          },
        },
      ]
    );
  };

  const deleteOrder = async (id: string) => {
    Alert.alert(
      "Delete Order",
      "Are you sure you want to delete this order? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete", style: "destructive",
          onPress: async () => {
            try {
              const baseUrl = getApiUrl();
              const res = await fetch(`${baseUrl}api/admin/orders/${id}`, {
                method: "DELETE", headers: authHeaders,
              });
              const data = await res.json();
              if (res.ok) {
                setOrders(prev => prev.filter(o => o.id !== id));
                setShowDetail(false);
                setSelectedOrder(null);
                Alert.alert("Deleted", "Order removed successfully");
              } else {
                Alert.alert("Error", data.error || "Failed to delete order");
              }
            } catch (err) {
              Alert.alert("Error", "Failed to delete order");
            }
          },
        },
      ]
    );
  };

  const addColor = () => {
    if (!colorFormName) return;
    const newColors = [...(productForm.colors || []), {
      name: colorFormName, hex: colorFormHex, image: colorFormImage,
      images: colorFormImage ? [colorFormImage] : [], soldOut: false,
    }];
    setProductForm({ ...productForm, colors: newColors });
    setColorFormName(""); setColorFormHex("#000000"); setColorFormImage("");
  };

  const removeColor = (idx: number) => {
    const newColors = [...(productForm.colors || [])];
    newColors.splice(idx, 1);
    setProductForm({ ...productForm, colors: newColors });
  };

  const addStorage = () => {
    if (!storageFormLabel) return;
    const newStorage = [...(productForm.storageOptions || []), {
      label: storageFormLabel, price: parseInt(storageFormPrice) || 0,
    }];
    setProductForm({ ...productForm, storageOptions: newStorage });
    setStorageFormLabel(""); setStorageFormPrice("");
  };

  const removeStorage = (idx: number) => {
    const newStorage = [...(productForm.storageOptions || [])];
    newStorage.splice(idx, 1);
    setProductForm({ ...productForm, storageOptions: newStorage });
  };

  const addSpec = () => {
    if (!specFormLabel || !specFormValue) return;
    const newSpecs = [...(productForm.specs || []), { label: specFormLabel, value: specFormValue }];
    setProductForm({ ...productForm, specs: newSpecs });
    setSpecFormLabel(""); setSpecFormValue("");
  };

  const removeSpec = (idx: number) => {
    const newSpecs = [...(productForm.specs || [])];
    newSpecs.splice(idx, 1);
    setProductForm({ ...productForm, specs: newSpecs });
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const handleLogout = () => { logout(); router.back(); };

  const renderStatsCards = () => {
    if (!stats) return null;
    return (
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: "#EFF6FF" }]}>
          <Ionicons name="bag-handle" size={24} color="#3B82F6" />
          <Text style={styles.statValue}>{stats.totalOrders || 0}</Text>
          <Text style={styles.statLabel}>Total Orders</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "#F0FDF4" }]}>
          <Ionicons name="cash" size={24} color="#10B981" />
          <Text style={styles.statValue}>{formatPrice(stats.totalRevenue || 0)}</Text>
          <Text style={styles.statLabel}>Revenue</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "#FFF7ED" }]}>
          <Ionicons name="time" size={24} color="#F59E0B" />
          <Text style={styles.statValue}>{stats.statusCounts?.processing || 0}</Text>
          <Text style={styles.statLabel}>Processing</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: "#F5F3FF" }]}>
          <Ionicons name="airplane" size={24} color="#8B5CF6" />
          <Text style={styles.statValue}>{stats.statusCounts?.shipped || 0}</Text>
          <Text style={styles.statLabel}>Shipped</Text>
        </View>
      </View>
    );
  };

  const renderStatusBadge = (status: string) => (
    <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[status] || "#6B7280") + "18" }]}>
      <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[status] || "#6B7280" }]} />
      <Text style={[styles.statusText, { color: STATUS_COLORS[status] || "#6B7280" }]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Text>
    </View>
  );

  const renderOrderCard = (order: AdminOrder) => (
    <Pressable
      key={order.id}
      style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.9 }]}
      onPress={() => { setSelectedOrder(order); setShowDetail(true); }}
    >
      <View style={styles.orderCardHeader}>
        <Text style={styles.orderId}>{order.id}</Text>
        {renderStatusBadge(order.status)}
      </View>
      <View style={styles.orderCardBody}>
        <View style={styles.orderCardRow}>
          <Ionicons name="person-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.orderCardText}>{order.customerName}</Text>
        </View>
        <View style={styles.orderCardRow}>
          <Ionicons name="location-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.orderCardText}>{order.deliveryCity}</Text>
        </View>
        <View style={styles.orderCardRow}>
          <Ionicons name="call-outline" size={14} color={Colors.textSecondary} />
          <Text style={styles.orderCardText}>{order.customerPhone}</Text>
        </View>
      </View>
      <View style={styles.orderCardFooter}>
        <Text style={styles.orderCardDate}>{formatDate(order.createdAt)}</Text>
        <Text style={styles.orderCardTotal}>{formatPrice(order.total)}</Text>
      </View>
    </Pressable>
  );

  const renderFilters = () => (
    <View>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search orders..."
            placeholderTextColor={Colors.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery ? (
            <Pressable onPress={() => { setSearchQuery(""); setTimeout(fetchOrders, 100); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        {STATUSES.map((s) => (
          <Pressable key={s} style={[styles.filterChip, statusFilter === s && styles.filterChipActive]} onPress={() => setStatusFilter(s)}>
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );

  const renderStatsTab = () => {
    if (!stats) return <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />;
    return (
      <View style={styles.statsSection}>
        {renderStatsCards()}
        <View style={styles.statsBlock}>
          <Text style={styles.statsBlockTitle}>Orders by Status</Text>
          {Object.entries(stats.statusCounts).map(([status, count]) => (
            <View key={status} style={styles.statsRow}>
              {renderStatusBadge(status)}
              <Text style={styles.statsRowValue}>{count}</Text>
            </View>
          ))}
        </View>
        <View style={styles.statsBlock}>
          <Text style={styles.statsBlockTitle}>Payment Methods</Text>
          {Object.entries(stats.paymentCounts).map(([method, count]) => (
            <View key={method} style={styles.statsRow}>
              <Text style={styles.statsRowLabel}>{PAYMENT_LABELS[method] || method}</Text>
              <Text style={styles.statsRowValue}>{count}</Text>
            </View>
          ))}
        </View>
        <View style={styles.statsBlock}>
          <Text style={styles.statsBlockTitle}>Top Cities</Text>
          {Object.entries(stats.cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([city, count]) => (
            <View key={city} style={styles.statsRow}>
              <Text style={styles.statsRowLabel}>{city}</Text>
              <Text style={styles.statsRowValue}>{count}</Text>
            </View>
          ))}
        </View>

        <View style={styles.statsBlock}>
          <Text style={styles.statsBlockTitle}>Data Management</Text>

          <View style={styles.mgmtCard}>
            <View style={styles.mgmtCardHeader}>
              <View style={[styles.mgmtIcon, { backgroundColor: "#DBEAFE" }]}>
                <Ionicons name="cloud-upload-outline" size={20} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mgmtTitle}>Database Backup</Text>
                <Text style={styles.mgmtDesc}>Email backup to afterpay786@gmail.com</Text>
              </View>
            </View>
            <Text style={styles.mgmtSchedule}>Auto: Every 12 hours (12 AM & 12 PM PKT)</Text>
            <Pressable
              style={[styles.mgmtBtn, backupLoading && { opacity: 0.6 }]}
              onPress={triggerBackup}
              disabled={backupLoading}
            >
              {backupLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="mail-outline" size={16} color="#fff" />
                  <Text style={styles.mgmtBtnText}>Send Backup Now</Text>
                </>
              )}
            </Pressable>
          </View>

          <View style={styles.mgmtCard}>
            <View style={styles.mgmtCardHeader}>
              <View style={[styles.mgmtIcon, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="refresh-outline" size={20} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mgmtTitle}>Priceoye Data Sync</Text>
                <Text style={styles.mgmtDesc}>Refresh prices & images from Priceoye</Text>
              </View>
            </View>
            <Text style={styles.mgmtSchedule}>Auto: Every 12 hours (12:30 AM & 12:30 PM PKT)</Text>
            {scrapeStatus?.isRunning && scrapeStatus?.log?.message && (
              <View style={styles.scrapeProgress}>
                <ActivityIndicator size="small" color={Colors.primary} />
                <Text style={styles.scrapeProgressText} numberOfLines={1}>{scrapeStatus.log.message}</Text>
              </View>
            )}
            {scrapeStatus?.log && !scrapeStatus.isRunning && scrapeStatus.log.status === "completed" && (
              <Text style={styles.scrapeCompleted}>
                Last sync: {scrapeStatus.log.scrapedProducts}/{scrapeStatus.log.totalProducts} products updated
              </Text>
            )}
            <Pressable
              style={[styles.mgmtBtn, { backgroundColor: "#D97706" }, (scrapeLoading || scrapeStatus?.isRunning) && { opacity: 0.6 }]}
              onPress={triggerScrape}
              disabled={scrapeLoading || scrapeStatus?.isRunning}
            >
              {scrapeLoading || scrapeStatus?.isRunning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="sync-outline" size={16} color="#fff" />
                  <Text style={styles.mgmtBtnText}>Sync Now</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  const renderScraperTab = () => {
    const CATEGORY_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
      engine:    { label: "Engine",      icon: "cog",              color: "#7C3AED", bg: "#F5F3FF" },
      names:     { label: "Names",       icon: "text",             color: "#2563EB", bg: "#EFF6FF" },
      prices:    { label: "Prices",      icon: "cash",             color: "#059669", bg: "#F0FDF4" },
      images:    { label: "Images",      icon: "image",            color: "#0891B2", bg: "#ECFEFF" },
      specs:     { label: "Specs",       icon: "list",             color: "#D97706", bg: "#FFFBEB" },
      variants:  { label: "Variants",    icon: "color-palette",    color: "#DB2777", bg: "#FDF2F8" },
      filters:   { label: "Filters",     icon: "funnel",           color: "#DC2626", bg: "#FEF2F2" },
      brands:    { label: "Brands",      icon: "business",         color: "#4EA97A", bg: "#F0FDF4" },
      freshness: { label: "Freshness",   icon: "time",             color: "#9333EA", bg: "#FAF5FF" },
      output:    { label: "Output",      icon: "analytics",        color: "#0F766E", bg: "#F0FDFA" },
    };

    const scoreColor = (s: number) => s >= 80 ? "#16A34A" : s >= 55 ? "#D97706" : "#DC2626";
    const scoreBg = (s: number) => s >= 80 ? "#F0FDF4" : s >= 55 ? "#FFFBEB" : "#FEF2F2";
    const statusIcon = (status: string): any =>
      status === "pass" ? "checkmark-circle" : status === "fail" ? "close-circle" : "warning";
    const statusColor = (status: string) =>
      status === "pass" ? "#16A34A" : status === "fail" ? "#DC2626" : "#F59E0B";
    const severityBadgeColor = (sev: string) =>
      sev === "critical" ? "#DC2626" : sev === "warning" ? "#F59E0B" : "#6B7280";

    const score = scraperAudit?.healthScore ?? null;
    const stats = scraperAudit?.scraperStats;
    const checks = (scraperAudit?.checks ?? []) as any[];
    const summary = scraperAudit?.summary;
    const recentLogs = (scraperAudit?.recentLogs ?? []) as any[];

    // Group checks by category
    const byCategory: Record<string, any[]> = {};
    for (const check of checks) {
      if (!byCategory[check.category]) byCategory[check.category] = [];
      byCategory[check.category].push(check);
    }

    return (
      <View style={{ flex: 1, padding: 16 }}>

        {/* ── Custom Scrape Command ─────────────────────────────────── */}
        <View style={[styles.mgmtCard, { marginBottom: 12 }]}>
          <View style={styles.mgmtCardHeader}>
            <View style={[styles.mgmtIcon, { backgroundColor: "#E0F2FE" }]}>
              <Ionicons name="search" size={20} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mgmtTitle}>Custom Scrape Command</Text>
              <Text style={styles.mgmtDesc}>Search Priceoye by model name and add products to your store</Text>
            </View>
          </View>

          {/* Search input row */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TextInput
              style={{ flex: 1, height: 42, paddingHorizontal: 12, fontSize: 14, fontFamily: "Inter_400Regular",
                color: Colors.text, backgroundColor: "#F8FAFC", borderWidth: 1,
                borderColor: isListening ? "#0284C7" : "#E2E8F0", borderRadius: 10 }}
              placeholder={isListening ? "🎤 Listening..." : "e.g. Samsung Galaxy S24 Ultra"}
              placeholderTextColor={isListening ? "#0284C7" : Colors.textLight}
              value={customQuery}
              onChangeText={(t) => {
                setCustomQuery(t);
                setCustomPreviewResults(null);
                setCustomScrapeResult(null);
                setAiExtractedKeyword(null);
              }}
              onSubmitEditing={runCustomPreview}
              returnKeyType="search"
            />
            {/* Mic button */}
            <Pressable
              style={[styles.mgmtBtn, { paddingHorizontal: 13, backgroundColor: isListening ? "#DC2626" : "#6B7280" },
                (customPreviewLoading || customScrapeLoading) && { opacity: 0.5 }]}
              onPress={startVoiceInput}
              disabled={customPreviewLoading || customScrapeLoading}
            >
              <Ionicons name={isListening ? "stop-circle" : "mic"} size={18} color="#fff" />
            </Pressable>
            {/* Search button */}
            <Pressable
              style={[styles.mgmtBtn, { paddingHorizontal: 14, backgroundColor: "#0284C7" },
                (customPreviewLoading || customScrapeLoading) && { opacity: 0.5 }]}
              onPress={runCustomPreview}
              disabled={customPreviewLoading || customScrapeLoading}
            >
              {customPreviewLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="search" size={18} color="#fff" />}
            </Pressable>
          </View>
          {isListening && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingHorizontal: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#DC2626" }} />
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#DC2626" }}>
                Listening... Speak your model name now
              </Text>
            </View>
          )}

          {/* AI extracted keyword badge */}
          {aiExtractedKeyword && !customScrapeLoading && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingHorizontal: 4,
              backgroundColor: "#F0FDF4", borderRadius: 8, padding: 8, borderWidth: 1, borderColor: "#BBF7D0" }}>
              <Ionicons name="sparkles" size={13} color="#16A34A" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: "#16A34A" }}>
                AI understood: <Text style={{ fontFamily: "Inter_700Bold" }}>"{aiExtractedKeyword}"</Text>
              </Text>
            </View>
          )}

          {/* Max results + Scrape row */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>Max results:</Text>
            {["5", "10", "15", "20"].map(n => (
              <Pressable
                key={n}
                onPress={() => setCustomMaxResults(n)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
                  backgroundColor: customMaxResults === n ? "#0284C7" : "#F1F5F9",
                  borderWidth: customMaxResults === n ? 0 : 1, borderColor: "#E2E8F0",
                }}
              >
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: customMaxResults === n ? "#fff" : Colors.textSecondary }}>{n}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.mgmtBtn, { flex: 1, backgroundColor: "#16A34A" },
                (!customQuery.trim() || customScrapeLoading || customPreviewLoading) && { opacity: 0.5 }]}
              onPress={runCustomScrape}
              disabled={!customQuery.trim() || customScrapeLoading || customPreviewLoading}
            >
              {customScrapeLoading
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="cloud-download" size={15} color="#fff" />}
              <Text style={[styles.mgmtBtnText, { fontSize: 12 }]}>
                {customScrapeLoading ? "Scraping..." : "Scrape & Add"}
              </Text>
            </Pressable>
          </View>

          {/* Preview results list */}
          {customPreviewLoading && (
            <View style={{ alignItems: "center", paddingVertical: 16 }}>
              <ActivityIndicator size="small" color="#0284C7" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 6 }}>
                Searching Priceoye...
              </Text>
            </View>
          )}

          {customPreviewResults !== null && !customPreviewLoading && (
            <View style={{ marginTop: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary }}>
                  {customPreviewResults.length > 0 ? `${customPreviewResults.length} products found on Priceoye` : "No results found"}
                </Text>
                {customPreviewResults.length > 0 && (
                  <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight }}>
                    tap "Scrape & Add" to save
                  </Text>
                )}
              </View>
              {customPreviewResults.map((item: any, idx: number) => (
                <View key={idx} style={{
                  flexDirection: "row", alignItems: "center", gap: 10,
                  paddingVertical: 7, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: "#F1F5F9",
                }}>
                  <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#0284C7" }}>{idx + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text }} numberOfLines={1}>{item.name}</Text>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>{item.brand} · Rs {item.price?.toLocaleString()}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Scrape results summary */}
          {customScrapeResult && !customScrapeLoading && (
            <View style={{
              marginTop: 10, borderRadius: 10, padding: 12,
              backgroundColor: customScrapeResult.newProducts > 0 ? "#F0FDF4" : "#F8FAFC",
              borderWidth: 1, borderColor: customScrapeResult.newProducts > 0 ? "#BBF7D0" : "#E2E8F0",
            }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <Ionicons
                  name={customScrapeResult.newProducts > 0 ? "checkmark-circle" : "information-circle"}
                  size={16}
                  color={customScrapeResult.newProducts > 0 ? "#16A34A" : "#6B7280"}
                />
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", color: customScrapeResult.newProducts > 0 ? "#16A34A" : Colors.text }}>
                  {customScrapeResult.newProducts > 0 ? `${customScrapeResult.newProducts} New Products Added!` : "Scrape Complete"}
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {[
                  { label: "Found", val: customScrapeResult.found, color: "#3B82F6" },
                  { label: "Saved", val: customScrapeResult.scraped, color: "#16A34A" },
                  { label: "New", val: customScrapeResult.newProducts, color: "#7C3AED" },
                  { label: "Errors", val: customScrapeResult.errors, color: customScrapeResult.errors > 0 ? "#DC2626" : "#6B7280" },
                ].map(({ label, val, color }) => (
                  <View key={label} style={{ alignItems: "center", backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "#E2E8F0" }}>
                    <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color }}>{val}</Text>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>{label}</Text>
                  </View>
                ))}
              </View>
              {customScrapeResult.results?.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {(customScrapeResult.results as any[]).map((r: any, i: number) => (
                    <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 }}>
                      <Ionicons
                        name={r.error ? "close-circle" : r.isNew ? "add-circle" : "refresh-circle"}
                        size={13}
                        color={r.error ? "#DC2626" : r.isNew ? "#16A34A" : "#6B7280"}
                      />
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.text, flex: 1 }} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: r.error ? "#DC2626" : r.isNew ? "#16A34A" : "#6B7280" }}>
                        {r.error ? r.error : r.isNew ? "NEW" : "Updated"}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>

        {/* ── Header card ──────────────────────────────────────────── */}
        <View style={[styles.mgmtCard, { flexDirection: "row", alignItems: "center", gap: 14 }]}>
          <View style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center",
            backgroundColor: score === null ? "#F3F4F6" : scoreBg(score),
            borderWidth: 3, borderColor: score === null ? "#E5E7EB" : scoreColor(score) }}>
            {score !== null ? (
              <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: scoreColor(score) }}>{score}</Text>
            ) : (
              <Ionicons name="analytics-outline" size={28} color={Colors.textLight} />
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.mgmtTitle, { fontSize: 16 }]}>Priceoye Scraper Audit</Text>
            {score !== null ? (
              <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium",
                color: scoreColor(score) }}>
                {score >= 80 ? "Scraper is healthy" : score >= 55 ? "Issues need attention" : "Critical issues found"}
              </Text>
            ) : (
              <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>
                Run an audit to assess scraper health
              </Text>
            )}
            {scraperAudit && (
              <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 2 }}>
                {new Date(scraperAudit.timestamp).toLocaleString("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                {" · "}{Math.round(scraperAudit.duration / 1000)}s
              </Text>
            )}
          </View>
        </View>

        {/* ── Action buttons ────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <Pressable
            style={[styles.mgmtBtn, { flex: 1, backgroundColor: "#7C3AED" }, scraperAuditLoading && { opacity: 0.6 }]}
            onPress={() => runScraperAuditFn(true)}
            disabled={scraperAuditLoading}
          >
            {scraperAuditLoading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="shield-checkmark" size={16} color="#fff" />
                <Text style={styles.mgmtBtnText}>Run Audit & Fix All</Text>
              </>
            )}
          </Pressable>
          <Pressable
            style={[styles.mgmtBtn, { backgroundColor: "#374151", paddingHorizontal: 14 }, scraperAuditLoading && { opacity: 0.6 }]}
            onPress={() => runScraperAuditFn(false)}
            disabled={scraperAuditLoading}
          >
            <Ionicons name="eye" size={16} color="#fff" />
          </Pressable>
        </View>

        {/* ── Summary row ──────────────────────────────────────────── */}
        {summary && (
          <View style={[styles.mgmtCard, { flexDirection: "row", gap: 0, padding: 0, overflow: "hidden", marginBottom: 12 }]}>
            {[
              { label: "Passed", value: summary.pass, color: "#16A34A", bg: "#F0FDF4" },
              { label: "Failed", value: summary.fail, color: "#DC2626", bg: "#FEF2F2" },
              { label: "Warnings", value: summary.warning, color: "#F59E0B", bg: "#FFFBEB" },
              { label: "Fixed", value: summary.fixed, color: "#7C3AED", bg: "#F5F3FF" },
            ].map((item, idx) => (
              <View key={idx} style={{ flex: 1, alignItems: "center", paddingVertical: 12, backgroundColor: item.bg,
                borderRightWidth: idx < 3 ? 1 : 0, borderRightColor: "#E5E7EB" }}>
                <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: item.color }}>{item.value}</Text>
                <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>{item.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Scraper live stats ────────────────────────────────────── */}
        {stats && (
          <View style={[styles.mgmtCard, { marginBottom: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="pulse" size={16} color="#7C3AED" />
              <Text style={[styles.mgmtTitle, { fontSize: 13 }]}>Scraper Live Stats</Text>
              {stats.isScraping && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#F0FDF4",
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                  <ActivityIndicator size={10} color="#16A34A" />
                  <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#16A34A" }}>SCRAPING NOW</Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[
                { label: "Last Scrape", value: stats.lastScrapeTime ? new Date(stats.lastScrapeTime).toLocaleString("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "Never" },
                { label: "Status", value: stats.lastScrapeStatus.toUpperCase() },
                { label: "Hours Ago", value: stats.hoursSinceLast < 999 ? `${stats.hoursSinceLast.toFixed(1)}h` : "N/A" },
                { label: "Products", value: `${stats.lastScrapeProducts} (${stats.lastScrapeNew} new)` },
                { label: "Errors", value: `${stats.lastScrapeErrors}` },
                { label: "Total Runs", value: `${stats.totalRuns}` },
                { label: "Success Rate", value: stats.totalRuns > 0 ? `${Math.round((stats.successRuns / stats.totalRuns) * 100)}%` : "N/A" },
                { label: "Next ETA", value: `~${stats.nextScrapeEta}` },
              ].map((item, idx) => (
                <View key={idx} style={{ backgroundColor: "#F9FAFB", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: "45%" }}>
                  <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: Colors.textLight }}>{item.label}</Text>
                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text }}>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Checklist by category ─────────────────────────────────── */}
        {checks.length > 0 && Object.entries(CATEGORY_META).map(([catKey, catMeta]) => {
          const catChecks = byCategory[catKey] ?? [];
          if (catChecks.length === 0) return null;
          const catFailing = catChecks.filter(c => c.status !== "pass");
          const catPassed = catChecks.length - catFailing.length;
          const isExpanded = scraperExpandedCategory === catKey;
          const catStatus = catFailing.length === 0 ? "pass" : catChecks.some(c => c.severity === "critical" && c.status !== "pass") ? "fail" : "warning";

          return (
            <View key={catKey} style={[styles.mgmtCard, { marginBottom: 8 }]}>
              <Pressable
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                onPress={() => setScraperExpandedCategory(isExpanded ? null : catKey)}
              >
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: catMeta.bg,
                  alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={catMeta.icon} size={16} color={catMeta.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text }}>{catMeta.label}</Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>
                    {catPassed}/{catChecks.length} passed
                    {catFailing.length > 0 ? ` · ${catFailing.filter(c => c.fixed).length} fixed` : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name={statusIcon(catStatus)} size={20} color={statusColor(catStatus)} />
                  <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={16} color={Colors.textLight} />
                </View>
              </Pressable>

              {isExpanded && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10, gap: 8 }}>
                  {catChecks.map((check, idx) => (
                    <View key={idx} style={{ backgroundColor: check.status === "pass" ? "#F9FAFB" : check.status === "fail" ? "#FEF2F2" : "#FFFBEB",
                      borderRadius: 10, padding: 10, borderLeftWidth: 3,
                      borderLeftColor: statusColor(check.status) }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <Ionicons name={statusIcon(check.status)} size={16} color={statusColor(check.status)} />
                        <Text style={{ flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text }} numberOfLines={1}>
                          {check.title}
                        </Text>
                        {check.fixed && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0FDF4",
                            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                            <Ionicons name="checkmark-circle" size={11} color="#16A34A" />
                            <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: "#16A34A" }}>FIXED</Text>
                          </View>
                        )}
                        {check.severity !== "info" && check.status !== "pass" && (
                          <View style={{ backgroundColor: severityBadgeColor(check.severity) + "20",
                            paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: severityBadgeColor(check.severity), textTransform: "uppercase" }}>
                              {check.severity}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginLeft: 24 }}>
                        {check.detail}
                      </Text>
                      {check.description && check.status !== "pass" && (
                        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight, marginLeft: 24, marginTop: 2 }} numberOfLines={2}>
                          {check.description}
                        </Text>
                      )}
                      {check.fixNote ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: 24, marginTop: 4 }}>
                          <Ionicons name="information-circle-outline" size={12} color="#7C3AED" />
                          <Text style={{ fontSize: 10, fontFamily: "Inter_500Medium", color: "#7C3AED" }} numberOfLines={2}>{check.fixNote}</Text>
                        </View>
                      ) : null}
                      {check.affected > 0 && (
                        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight, marginLeft: 24, marginTop: 2 }}>
                          {check.affected} product{check.affected !== 1 ? "s" : ""} affected
                        </Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        {/* ── Recent scrape log timeline ────────────────────────────── */}
        {recentLogs.length > 0 && (
          <View style={[styles.mgmtCard, { marginBottom: 12 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Ionicons name="time" size={16} color="#7C3AED" />
              <Text style={[styles.mgmtTitle, { fontSize: 13 }]}>Recent Scrape History</Text>
            </View>
            {recentLogs.map((log: any, idx: number) => {
              const logStatusColor = log.status === "completed" ? "#16A34A" : log.status === "failed" ? "#DC2626" : "#F59E0B";
              const logStatusIcon: any = log.status === "completed" ? "checkmark-circle" : log.status === "failed" ? "close-circle" : "time";
              const duration = log.completedAt && log.startedAt
                ? Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 60000)
                : null;
              return (
                <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 8,
                  borderBottomWidth: idx < recentLogs.length - 1 ? 1 : 0, borderBottomColor: Colors.borderLight }}>
                  <Ionicons name={logStatusIcon} size={18} color={logStatusColor} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text, textTransform: "capitalize" }}>
                        {log.status}
                      </Text>
                      {log.scrapedProducts > 0 && (
                        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>
                          · {log.scrapedProducts} products ({log.newProducts} new)
                        </Text>
                      )}
                      {log.errors > 0 && (
                        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: "#DC2626" }}>
                          · {log.errors} errors
                        </Text>
                      )}
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight }}>
                        {new Date(log.startedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                      </Text>
                      {duration !== null && (
                        <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight }}>· {duration}m</Text>
                      )}
                    </View>
                    {log.message && log.status === "failed" && (
                      <Text style={{ fontSize: 10, fontFamily: "Inter_400Regular", color: "#DC2626", marginTop: 2 }} numberOfLines={2}>{log.message}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {!scraperAudit && !scraperAuditLoading && (
          <View style={[styles.mgmtCard, { alignItems: "center", paddingVertical: 32 }]}>
            <Ionicons name="analytics-outline" size={52} color={Colors.textLight} />
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text, marginTop: 12 }}>
              Scraper Health Unknown
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 6, textAlign: "center", lineHeight: 18 }}>
              Run the audit to check all 25+ scraper requirements:{"\n"}engine, prices, images, specs, variants, filters, brands & freshness.
            </Text>
            <Pressable
              style={[styles.mgmtBtn, { marginTop: 16, backgroundColor: "#7C3AED" }]}
              onPress={() => runScraperAuditFn(true)}
            >
              <Ionicons name="shield-checkmark" size={16} color="#fff" />
              <Text style={styles.mgmtBtnText}>Run Scraper Audit</Text>
            </Pressable>
          </View>
        )}

        {scraperAuditLoading && (
          <View style={[styles.mgmtCard, { alignItems: "center", paddingVertical: 32 }]}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 16 }}>
              Running 25+ Scraper Checks...
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 6, textAlign: "center" }}>
              Checking engine, prices, images, specs, variants, filters, brands & freshness
            </Text>
          </View>
        )}

        {scraperAudit?.issuesSummary?.total === 0 || (scraperAudit && summary?.fail === 0 && summary?.warning === 0) ? (
          <View style={[styles.mgmtCard, { alignItems: "center", paddingVertical: 20 }]}>
            <Ionicons name="shield-checkmark" size={44} color="#16A34A" />
            <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#16A34A", marginTop: 8 }}>
              Scraper 100% Healthy
            </Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4, textAlign: "center" }}>
              All {summary?.totalChecks} checks passed. The Priceoye scraper is running perfectly.
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderHealthTab = () => {
    const severityColor = (s: string) => s === "critical" ? "#DC2626" : s === "warning" ? "#F59E0B" : "#3B82F6";
    const severityBg = (s: string) => s === "critical" ? "#FEE2E2" : s === "warning" ? "#FEF3C7" : "#DBEAFE";
    const severityIcon = (s: string): any => s === "critical" ? "alert-circle" : s === "warning" ? "warning" : "information-circle";
    const checkIcon = (s: string): any => s === "pass" ? "checkmark-circle" : s === "fail" ? "close-circle" : "warning";
    const checkColor = (s: string) => s === "pass" ? "#16A34A" : s === "fail" ? "#DC2626" : "#F59E0B";

    return (
      <View style={{ flex: 1, padding: 16 }}>
        <View style={styles.mgmtCard}>
          <View style={styles.mgmtCardHeader}>
            <View style={[styles.mgmtIcon, { backgroundColor: "#FEE2E2" }]}>
              <Ionicons name="shield-checkmark-outline" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.mgmtTitle}>System Health Audit</Text>
              <Text style={styles.mgmtDesc}>Auto-detect & fix prices, images, variants, payments</Text>
            </View>
          </View>
          <Text style={styles.mgmtSchedule}>Auto: Every 6 hours (3 AM, 9 AM, 3 PM, 9 PM PKT)</Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              style={[styles.mgmtBtn, { flex: 1, backgroundColor: "#DC2626" }, (auditLoading || auditRunning) && { opacity: 0.6 }]}
              onPress={() => triggerAudit(true)}
              disabled={auditLoading || auditRunning}
            >
              {auditLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="shield-checkmark" size={16} color="#fff" />
                  <Text style={styles.mgmtBtnText}>Run Audit & Auto-Fix</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.mgmtBtn, { backgroundColor: "#6B7280", paddingHorizontal: 14 }, (auditLoading || auditRunning) && { opacity: 0.6 }]}
              onPress={() => triggerAudit(false)}
              disabled={auditLoading || auditRunning}
            >
              <Ionicons name="eye" size={16} color="#fff" />
            </Pressable>
          </View>
        </View>

        {auditResult && (
          <>
            <View style={[styles.mgmtCard, { marginTop: 12 }]}>
              <Text style={[styles.mgmtTitle, { marginBottom: 10 }]}>Audit Summary</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 10 }}>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: auditResult.issuesSummary.total === 0 ? "#16A34A" : "#DC2626" }}>
                    {auditResult.issuesSummary.total}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>Total Issues</Text>
                </View>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: "#DC2626" }}>
                    {auditResult.issuesSummary.critical}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>Critical</Text>
                </View>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: "#F59E0B" }}>
                    {auditResult.issuesSummary.warning}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>Warnings</Text>
                </View>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ fontSize: 24, fontFamily: "Inter_700Bold", color: "#16A34A" }}>
                    {auditResult.issuesSummary.autoFixed}
                  </Text>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary }}>Auto-Fixed</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.borderLight }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>
                  {auditResult.totalProducts} products | {auditResult.totalOrders} orders
                </Text>
                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary }}>
                  {Math.round(auditResult.duration / 1000)}s | {new Date(auditResult.timestamp).toLocaleString("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                </Text>
              </View>
            </View>

            <View style={[styles.mgmtCard, { marginTop: 12 }]}>
              <Text style={[styles.mgmtTitle, { marginBottom: 10 }]}>System Checks</Text>
              {auditResult.checks.map((check: any, idx: number) => (
                <View key={idx} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: idx < auditResult.checks.length - 1 ? 1 : 0, borderBottomColor: Colors.borderLight }}>
                  <Ionicons name={checkIcon(check.status)} size={18} color={checkColor(check.status)} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text }}>{check.name}</Text>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary }} numberOfLines={2}>{check.details}</Text>
                  </View>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: check.status === "pass" ? "#F0FDF4" : check.status === "fail" ? "#FEE2E2" : "#FEF3C7" }}>
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: checkColor(check.status), textTransform: "uppercase" }}>{check.status}</Text>
                  </View>
                </View>
              ))}
            </View>

            {auditResult.issues.length > 0 && (
              <View style={[styles.mgmtCard, { marginTop: 12 }]}>
                <Text style={[styles.mgmtTitle, { marginBottom: 10 }]}>Issues Detected</Text>
                {auditResult.issues.map((issue: any, idx: number) => (
                  <View key={idx} style={{ padding: 10, marginBottom: 8, borderRadius: 10, backgroundColor: severityBg(issue.severity), borderWidth: 1, borderColor: severityColor(issue.severity) + "30" }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Ionicons name={severityIcon(issue.severity)} size={16} color={severityColor(issue.severity)} />
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: severityColor(issue.severity), flex: 1 }} numberOfLines={1}>{issue.title}</Text>
                        {issue.fixing && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#FEF3C7", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                            <ActivityIndicator size={10} color="#F59E0B" />
                            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#F59E0B" }}>FIXING</Text>
                          </View>
                        )}
                        {issue.fixed && !issue.fixing && (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#F0FDF4", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                            <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                            <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#16A34A" }}>FIXED</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginLeft: 22 }} numberOfLines={3}>{issue.description}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginLeft: 22 }}>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: severityColor(issue.severity) + "20" }}>
                        <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", color: severityColor(issue.severity), textTransform: "uppercase" }}>{issue.severity}</Text>
                      </View>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: "#F3F4F6" }}>
                        <Text style={{ fontSize: 9, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, textTransform: "uppercase" }}>{issue.category}</Text>
                      </View>
                      {issue.affectedIds.length > 0 && (
                        <Text style={{ fontSize: 9, fontFamily: "Inter_400Regular", color: Colors.textLight }}>{issue.affectedIds.length} affected</Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {auditResult.issuesSummary.total === 0 && (
              <View style={[styles.mgmtCard, { marginTop: 12, alignItems: "center", paddingVertical: 24 }]}>
                <Ionicons name="shield-checkmark" size={48} color="#16A34A" />
                <Text style={{ fontSize: 16, fontFamily: "Inter_700Bold", color: "#16A34A", marginTop: 8 }}>All Systems Healthy</Text>
                <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4, textAlign: "center" }}>
                  No issues detected. Prices, images, variants, orders, and payments are all working correctly.
                </Text>
              </View>
            )}
          </>
        )}

        {!auditResult && !auditLoading && (
          <View style={[styles.mgmtCard, { marginTop: 12, alignItems: "center", paddingVertical: 24 }]}>
            <Ionicons name="shield-outline" size={48} color={Colors.textLight} />
            <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 8 }}>No Audit Results Yet</Text>
            <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 4, textAlign: "center" }}>
              Tap "Run Audit & Auto-Fix" to scan your entire system for issues and automatically fix them.
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderProductCard = (product: AdminProduct) => (
    <View key={product.id} style={styles.productCard}>
      <View style={styles.productCardTop}>
        {product.image ? (
          <Image source={{ uri: product.image }} style={styles.productCardImg} resizeMode="contain" />
        ) : (
          <View style={[styles.productCardImg, { backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="image-outline" size={24} color={Colors.textLight} />
          </View>
        )}
        <View style={styles.productCardInfo}>
          <Text style={styles.productCardName} numberOfLines={2}>{product.name}</Text>
          <Text style={styles.productCardBrand}>{product.brand}</Text>
          <View style={styles.productCardPriceRow}>
            <Text style={styles.productCardPrice}>{formatPrice(product.price)}</Text>
            {product.discount > 0 && (
              <View style={styles.productCardDiscBadge}>
                <Text style={styles.productCardDiscText}>{product.discount}% OFF</Text>
              </View>
            )}
          </View>
          <View style={styles.productCardMeta}>
            {product.colors.length > 0 && (
              <Text style={styles.productCardMetaText}>{product.colors.length} colors</Text>
            )}
            {product.storageOptions.length > 0 && (
              <Text style={styles.productCardMetaText}>{product.storageOptions.length} storage</Text>
            )}
            <View style={[styles.stockBadge, { backgroundColor: product.inStock ? "#DCFCE7" : "#FEE2E2" }]}>
              <Text style={[styles.stockBadgeText, { color: product.inStock ? "#16A34A" : "#DC2626" }]}>
                {product.inStock ? "In Stock" : "Out of Stock"}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.productCardActions}>
        <Pressable style={styles.editBtn} onPress={() => openEditProduct(product)}>
          <Ionicons name="create-outline" size={16} color={Colors.primary} />
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
        <Pressable
          style={styles.deleteBtn}
          onPress={() => deleteProduct(product.id)}
          disabled={deletingProduct === product.id}
        >
          {deletingProduct === product.id ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.deleteBtnText}>Delete</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );

  const renderProductsTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search products..."
            placeholderTextColor={Colors.textLight}
            value={productSearch}
            onChangeText={setProductSearch}
            onSubmitEditing={handleProductSearch}
            returnKeyType="search"
          />
          {productSearch ? (
            <Pressable onPress={() => { setProductSearch(""); setTimeout(fetchProducts, 100); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        <Pressable
          style={[styles.filterChip, productBrandFilter === "all" && styles.filterChipActive]}
          onPress={() => setProductBrandFilter("all")}
        >
          <Text style={[styles.filterChipText, productBrandFilter === "all" && styles.filterChipTextActive]}>All ({productsTotal})</Text>
        </Pressable>
        {BRAND_LIST.map((b) => (
          <Pressable
            key={b}
            style={[styles.filterChip, productBrandFilter === b && styles.filterChipActive]}
            onPress={() => setProductBrandFilter(b)}
          >
            <Text style={[styles.filterChipText, productBrandFilter === b && styles.filterChipTextActive]}>{b}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.productsHeaderRow}>
        <Text style={styles.productsCount}>{productsTotal} Products</Text>
        <Pressable style={styles.addProductBtn} onPress={openAddProduct}>
          <Ionicons name="add-circle" size={18} color={Colors.white} />
          <Text style={styles.addProductBtnText}>Add New</Text>
        </Pressable>
      </View>

      {productsLoading ? (
        <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={styles.ordersList}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {products.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Products Found</Text>
              <Text style={styles.emptySubtitle}>Add your first product or adjust filters</Text>
            </View>
          ) : (
            products.map(renderProductCard)
          )}
        </ScrollView>
      )}
    </View>
  );

  const renderCustomersTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search customers..."
            placeholderTextColor={Colors.textLight}
            value={customerSearch}
            onChangeText={setCustomerSearch}
            onSubmitEditing={() => fetchCustomers()}
            returnKeyType="search"
          />
          {customerSearch ? (
            <Pressable onPress={() => { setCustomerSearch(""); setTimeout(fetchCustomers, 100); }}>
              <Ionicons name="close-circle" size={18} color={Colors.textLight} />
            </Pressable>
          ) : null}
        </View>
      </View>
      <View style={styles.productsHeaderRow}>
        <Text style={styles.productsCount}>{customersTotal} Registered Users</Text>
      </View>
      {customersLoading ? (
        <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          style={styles.ordersList}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {customersList.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No Customers Yet</Text>
              <Text style={styles.emptySubtitle}>Registered customers will appear here</Text>
            </View>
          ) : (
            customersList.map((c) => (
              <View key={c.id} style={styles.customerCard}>
                <View style={styles.customerAvatar}>
                  <Text style={styles.customerAvatarText}>{c.fullName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.customerName}>{c.fullName}</Text>
                  <View style={styles.customerInfoRow}>
                    <Ionicons name="mail-outline" size={12} color={Colors.textLight} />
                    <Text style={styles.customerInfoText}>{c.email}</Text>
                  </View>
                  <View style={styles.customerInfoRow}>
                    <Ionicons name="call-outline" size={12} color={Colors.textLight} />
                    <Text style={styles.customerInfoText}>{c.phone}</Text>
                  </View>
                  {c.city ? (
                    <View style={styles.customerInfoRow}>
                      <Ionicons name="location-outline" size={12} color={Colors.textLight} />
                      <Text style={styles.customerInfoText}>{c.city}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.customerDate}>{formatDate(c.createdAt)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );

  const renderProductFormModal = () => (
    <Modal visible={showProductForm} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <View style={[styles.modalContent, { paddingTop: topPad + 8, paddingBottom: bottomPad + 16 }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowProductForm(false)} style={styles.modalClose}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
              <Text style={styles.modalTitle}>{editingProduct ? "Edit Product" : "Add New Product"}</Text>
              <Pressable
                onPress={saveProduct}
                style={[styles.saveBtn, savingProduct && { opacity: 0.6 }]}
                disabled={savingProduct}
              >
                {savingProduct ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Basic Info</Text>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Product Name *</Text>
                  <TextInput
                    style={styles.formInput}
                    value={productForm.name}
                    onChangeText={(t) => setProductForm({ ...productForm, name: t })}
                    placeholder="e.g. Samsung Galaxy S24 Ultra"
                    placeholderTextColor={Colors.textLight}
                  />
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Brand *</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {BRAND_LIST.map((b) => (
                        <Pressable
                          key={b}
                          style={[styles.brandChip, productForm.brand === b && styles.brandChipActive]}
                          onPress={() => setProductForm({ ...productForm, brand: b })}
                        >
                          <Text style={[styles.brandChipText, productForm.brand === b && styles.brandChipTextActive]}>{b}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </ScrollView>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formField, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Price (Rs) *</Text>
                    <TextInput
                      style={styles.formInput}
                      value={String(productForm.price || "")}
                      onChangeText={(t) => setProductForm({ ...productForm, price: t.replace(/[^0-9]/g, "") })}
                      placeholder="e.g. 149999"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.formField, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Original Price</Text>
                    <TextInput
                      style={styles.formInput}
                      value={String(productForm.originalPrice || "")}
                      onChangeText={(t) => setProductForm({ ...productForm, originalPrice: t.replace(/[^0-9]/g, "") })}
                      placeholder="e.g. 179999"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={[styles.formField, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Discount %</Text>
                    <TextInput
                      style={styles.formInput}
                      value={String(productForm.discount || "")}
                      onChangeText={(t) => setProductForm({ ...productForm, discount: t.replace(/[^0-9]/g, "") })}
                      placeholder="0"
                      placeholderTextColor={Colors.textLight}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.formField, { flex: 1 }]}>
                    <Text style={styles.formLabel}>Status</Text>
                    <View style={styles.toggleRow}>
                      <Pressable
                        style={[styles.toggleBtn, productForm.inStock && styles.toggleBtnActive]}
                        onPress={() => setProductForm({ ...productForm, inStock: true })}
                      >
                        <Text style={[styles.toggleBtnText, productForm.inStock && styles.toggleBtnTextActive]}>In Stock</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.toggleBtn, !productForm.inStock && { ...styles.toggleBtnActive, backgroundColor: "#DC2626" }]}
                        onPress={() => setProductForm({ ...productForm, inStock: false })}
                      >
                        <Text style={[styles.toggleBtnText, !productForm.inStock && styles.toggleBtnTextActive]}>Out of Stock</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>

                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Description</Text>
                  <TextInput
                    style={[styles.formInput, { minHeight: 60, textAlignVertical: "top" }]}
                    value={productForm.description}
                    onChangeText={(t) => setProductForm({ ...productForm, description: t })}
                    placeholder="Product description..."
                    placeholderTextColor={Colors.textLight}
                    multiline
                  />
                </View>

                <View style={styles.toggleRow}>
                  <Pressable
                    style={[styles.toggleBtn, productForm.fastDelivery && styles.toggleBtnActive]}
                    onPress={() => setProductForm({ ...productForm, fastDelivery: !productForm.fastDelivery })}
                  >
                    <Ionicons name={productForm.fastDelivery ? "checkmark-circle" : "ellipse-outline"} size={16} color={productForm.fastDelivery ? Colors.white : Colors.textSecondary} />
                    <Text style={[styles.toggleBtnText, productForm.fastDelivery && styles.toggleBtnTextActive]}>Fast Delivery</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Images</Text>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Main Image URL</Text>
                  <TextInput
                    style={styles.formInput}
                    value={productForm.image}
                    onChangeText={(t) => setProductForm({ ...productForm, image: t })}
                    placeholder="https://..."
                    placeholderTextColor={Colors.textLight}
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>Gallery Image URLs (one per line)</Text>
                  <TextInput
                    style={[styles.formInput, { minHeight: 80, textAlignVertical: "top" }]}
                    value={imagesText}
                    onChangeText={setImagesText}
                    placeholder={"https://image1.jpg\nhttps://image2.jpg"}
                    placeholderTextColor={Colors.textLight}
                    multiline
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Colors ({(productForm.colors || []).length})</Text>
                {(productForm.colors || []).map((c: any, idx: number) => (
                  <View key={idx} style={styles.listItem}>
                    <View style={[styles.colorSwatch, { backgroundColor: c.hex }]} />
                    <Text style={styles.listItemText}>{c.name}</Text>
                    {c.soldOut && <Text style={styles.soldOutBadge}>Sold Out</Text>}
                    <Pressable onPress={() => removeColor(idx)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color="#DC2626" />
                    </Pressable>
                  </View>
                ))}
                <View style={styles.addItemRow}>
                  <TextInput
                    style={[styles.formInput, { flex: 2 }]}
                    value={colorFormName}
                    onChangeText={setColorFormName}
                    placeholder="Color name"
                    placeholderTextColor={Colors.textLight}
                  />
                  <TextInput
                    style={[styles.formInput, { flex: 1 }]}
                    value={colorFormHex}
                    onChangeText={setColorFormHex}
                    placeholder="#hex"
                    placeholderTextColor={Colors.textLight}
                  />
                  <Pressable style={styles.addItemBtn} onPress={addColor}>
                    <Ionicons name="add" size={20} color={Colors.white} />
                  </Pressable>
                </View>
                <TextInput
                  style={[styles.formInput, { marginTop: 6 }]}
                  value={colorFormImage}
                  onChangeText={setColorFormImage}
                  placeholder="Color image URL (optional)"
                  placeholderTextColor={Colors.textLight}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Storage Options ({(productForm.storageOptions || []).length})</Text>
                {(productForm.storageOptions || []).map((s: any, idx: number) => (
                  <View key={idx} style={styles.listItem}>
                    <Text style={styles.listItemText}>{s.label}</Text>
                    {s.price > 0 && <Text style={styles.listItemSub}>+Rs {s.price}</Text>}
                    <Pressable onPress={() => removeStorage(idx)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color="#DC2626" />
                    </Pressable>
                  </View>
                ))}
                <View style={styles.addItemRow}>
                  <TextInput
                    style={[styles.formInput, { flex: 2 }]}
                    value={storageFormLabel}
                    onChangeText={setStorageFormLabel}
                    placeholder="e.g. 256GB - 12GB RAM"
                    placeholderTextColor={Colors.textLight}
                  />
                  <TextInput
                    style={[styles.formInput, { flex: 1 }]}
                    value={storageFormPrice}
                    onChangeText={setStorageFormPrice}
                    placeholder="Extra Rs"
                    placeholderTextColor={Colors.textLight}
                    keyboardType="numeric"
                  />
                  <Pressable style={styles.addItemBtn} onPress={addStorage}>
                    <Ionicons name="add" size={20} color={Colors.white} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.formSection}>
                <Text style={styles.formSectionTitle}>Specifications ({(productForm.specs || []).length})</Text>
                {(productForm.specs || []).map((s: any, idx: number) => (
                  <View key={idx} style={styles.listItem}>
                    <Text style={styles.listItemLabel}>{s.label}:</Text>
                    <Text style={styles.listItemText}>{s.value}</Text>
                    <Pressable onPress={() => removeSpec(idx)} style={styles.removeBtn}>
                      <Ionicons name="close-circle" size={20} color="#DC2626" />
                    </Pressable>
                  </View>
                ))}
                <View style={styles.addItemRow}>
                  <TextInput
                    style={[styles.formInput, { flex: 1 }]}
                    value={specFormLabel}
                    onChangeText={setSpecFormLabel}
                    placeholder="e.g. Display"
                    placeholderTextColor={Colors.textLight}
                  />
                  <TextInput
                    style={[styles.formInput, { flex: 1 }]}
                    value={specFormValue}
                    onChangeText={setSpecFormValue}
                    placeholder="e.g. 6.8 Inches"
                    placeholderTextColor={Colors.textLight}
                  />
                  <Pressable style={styles.addItemBtn} onPress={addSpec}>
                    <Ionicons name="add" size={20} color={Colors.white} />
                  </Pressable>
                </View>
              </View>

              <View style={{ height: 60 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  const renderOrderDetail = () => {
    if (!selectedOrder) return null;
    const o = selectedOrder;
    const itemsList = Array.isArray(o.items) ? o.items : [];
    return (
      <Modal visible={showDetail} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: topPad + 8, paddingBottom: bottomPad + 16 }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setShowDetail(false)} style={styles.modalClose}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
              <Text style={styles.modalTitle}>Order Details</Text>
              <View style={{ width: 36 }} />
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <View style={styles.detailSection}>
                <View style={styles.detailHeaderRow}>
                  <Text style={styles.detailOrderId}>{o.id}</Text>
                  {renderStatusBadge(o.status)}
                </View>
                <Text style={styles.detailDate}>{formatDate(o.createdAt)}</Text>
              </View>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Update Status</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.statusButtons}>
                    {["confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                      <Pressable
                        key={s}
                        style={[styles.statusBtn, o.status === s && styles.statusBtnActive, { borderColor: STATUS_COLORS[s] }, o.status === s && { backgroundColor: STATUS_COLORS[s] }]}
                        onPress={() => updateOrderStatus(o.id, s)}
                        disabled={updatingStatus || o.status === s}
                      >
                        {updatingStatus ? (
                          <ActivityIndicator size="small" color={o.status === s ? "#fff" : STATUS_COLORS[s]} />
                        ) : (
                          <Text style={[styles.statusBtnText, { color: o.status === s ? "#fff" : STATUS_COLORS[s] }]}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Payment Status</Text>
                <View style={styles.detailCard}>
                  <View style={styles.paymentStatusRow}>
                    <View style={[styles.paymentBadge, { backgroundColor: o.paymentStatus === "paid" ? "#DCFCE7" : o.paymentStatus === "pending" ? "#FEF3C7" : "#FEE2E2" }]}>
                      <Ionicons
                        name={o.paymentStatus === "paid" ? "checkmark-circle" : o.paymentStatus === "pending" ? "time" : "close-circle"}
                        size={16}
                        color={o.paymentStatus === "paid" ? "#16A34A" : o.paymentStatus === "pending" ? "#D97706" : "#DC2626"}
                      />
                      <Text style={[styles.paymentBadgeText, { color: o.paymentStatus === "paid" ? "#16A34A" : o.paymentStatus === "pending" ? "#D97706" : "#DC2626" }]}>
                        {(o.paymentStatus || "unpaid").toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.paymentToggleRow}>
                    {["unpaid", "pending", "paid"].map((ps) => (
                      <Pressable
                        key={ps}
                        style={[
                          styles.paymentToggleBtn,
                          o.paymentStatus === ps && styles.paymentToggleBtnActive,
                          o.paymentStatus === ps && { backgroundColor: ps === "paid" ? "#16A34A" : ps === "pending" ? "#D97706" : "#DC2626" },
                        ]}
                        onPress={() => updatePaymentStatus(o.id, ps)}
                        disabled={updatingPayment || o.paymentStatus === ps}
                      >
                        {updatingPayment ? (
                          <ActivityIndicator size="small" color={o.paymentStatus === ps ? "#fff" : "#666"} />
                        ) : (
                          <Text style={[styles.paymentToggleText, o.paymentStatus === ps && { color: "#fff" }]}>
                            {ps.charAt(0).toUpperCase() + ps.slice(1)}
                          </Text>
                        )}
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Send WhatsApp</Text>
                <View style={styles.detailCard}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.whatsappBtnsRow}>
                      <Pressable style={styles.whatsappBtn} onPress={() => sendWhatsAppNotification(o.id, "order_placed")}>
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                        <Text style={styles.whatsappBtnText}>Order Booked</Text>
                      </Pressable>
                      <Pressable style={styles.whatsappBtn} onPress={() => sendWhatsAppNotification(o.id, "order_shipped")}>
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                        <Text style={styles.whatsappBtnText}>Dispatched</Text>
                      </Pressable>
                      <Pressable style={styles.whatsappBtn} onPress={() => sendWhatsAppNotification(o.id, "order_delivered")}>
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                        <Text style={styles.whatsappBtnText}>Delivered</Text>
                      </Pressable>
                      <Pressable style={styles.whatsappBtn} onPress={() => sendWhatsAppNotification(o.id, "payment_received")}>
                        <Ionicons name="logo-whatsapp" size={16} color="#25D366" />
                        <Text style={styles.whatsappBtnText}>Payment OK</Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                </View>
              </View>

              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Customer</Text>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}><Ionicons name="person" size={16} color={Colors.primary} /><Text style={styles.detailValue}>{o.customerName}</Text></View>
                  <View style={styles.detailRow}><Ionicons name="call" size={16} color={Colors.primary} /><Text style={styles.detailValue}>{o.customerPhone}</Text></View>
                  <View style={styles.detailRow}><Ionicons name="mail" size={16} color={Colors.primary} /><Text style={styles.detailValue}>{o.customerEmail}</Text></View>
                </View>
              </View>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Delivery</Text>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}><Ionicons name="location" size={16} color={Colors.primary} /><Text style={styles.detailValue}>{o.deliveryAddress}, {o.deliveryCity}</Text></View>
                  <View style={styles.detailRow}><Ionicons name="calendar" size={16} color={Colors.primary} /><Text style={styles.detailValue}>Est. {o.estimatedDelivery}</Text></View>
                  {o.openParcel && (<View style={styles.detailRow}><Ionicons name="cube" size={16} color={Colors.warning} /><Text style={[styles.detailValue, { color: Colors.warning }]}>Open Parcel Delivery</Text></View>)}
                  {o.deliveryNotes ? (<View style={styles.detailRow}><Ionicons name="document-text" size={16} color={Colors.primary} /><Text style={styles.detailValue}>{o.deliveryNotes}</Text></View>) : null}
                </View>
              </View>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Payment</Text>
                <View style={styles.detailCard}>
                  <Text style={styles.detailValue}>{PAYMENT_LABELS[o.paymentMethod] || o.paymentMethod}</Text>
                  {o.paymentOption && o.paymentOption !== "full" && (
                    <Text style={[styles.detailValue, { color: Colors.warning, marginTop: 4 }]}>Advance Payment (Rs. {o.advanceAmount?.toLocaleString() || "5,000"})</Text>
                  )}
                  {o.paymentMethod === "bank_transfer" && o.bankTransferInfo && (
                    <View style={styles.bankTransferDetails}>
                      <Text style={styles.bankDetailsTitle}>Bank Transfer Details</Text>
                      <View style={styles.detailRow}><Ionicons name="card" size={16} color={Colors.primary} /><Text style={styles.detailValue}>CNIC: {o.bankTransferInfo.cnic || "N/A"}</Text></View>
                      <View style={styles.detailRow}><Ionicons name="person" size={16} color={Colors.primary} /><Text style={styles.detailValue}>Account Title: {o.bankTransferInfo.accountTitle || "N/A"}</Text></View>
                      <View style={styles.detailRow}><Ionicons name="wallet" size={16} color={Colors.primary} /><Text style={styles.detailValue}>Account No: {o.bankTransferInfo.accountNumber || "N/A"}</Text></View>
                      {o.bankTransferInfo.paymentProof ? (
                        <View style={styles.proofSection}>
                          <Text style={styles.proofLabel}>Payment Proof Screenshot:</Text>
                          <Pressable style={styles.proofImageContainer} onPress={() => setProofImageModal(o.bankTransferInfo?.paymentProof || null)}>
                            <Image source={{ uri: o.bankTransferInfo.paymentProof }} style={styles.proofImage} resizeMode="contain" />
                          </Pressable>
                        </View>
                      ) : (
                        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.accent, marginTop: 8 }}>No payment proof uploaded</Text>
                      )}
                    </View>
                  )}
                </View>
              </View>
              {o.paymentMethod === "bnpl" && o.bnplDocuments && Object.keys(o.bnplDocuments).length > 0 && (
                <View style={styles.detailSection}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <Text style={styles.detailSectionTitle}>BNPL Documents</Text>
                    <Pressable
                      style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 }}
                      onPress={async () => {
                        const docs = o.bnplDocuments!;
                        const items: { uri: string; name: string }[] = [];
                        if (docs.cnicFront) items.push({ uri: docs.cnicFront, name: `${o.id}_CNIC_Front.jpg` });
                        if (docs.cnicBack) items.push({ uri: docs.cnicBack, name: `${o.id}_CNIC_Back.jpg` });
                        if (docs.tasdeeqApp) items.push({ uri: docs.tasdeeqApp, name: `${o.id}_Tasdeeq_App.jpg` });
                        if (docs.bankCheque) items.push({ uri: docs.bankCheque, name: `${o.id}_Bank_Cheque.jpg` });
                        if (docs.applicationForm) items.push({ uri: docs.applicationForm, name: `${o.id}_Application_Form.jpg` });
                        docs.bankStatements?.forEach((s, i) => items.push({ uri: s, name: `${o.id}_Bank_Statement_${i + 1}.jpg` }));
                        for (const item of items) {
                          await downloadBnplDocument(item.uri, item.name);
                        }
                        if (items.length > 1) Alert.alert("Done", `${items.length} documents saved`);
                      }}
                    >
                      <Ionicons name="download-outline" size={14} color="#fff" />
                      <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" }}>Download All</Text>
                    </Pressable>
                  </View>
                  <View style={styles.detailCard}>
                    {[
                      { key: "cnicFront" as const, label: "CNIC Front", file: "CNIC_Front" },
                      { key: "cnicBack" as const, label: "CNIC Back", file: "CNIC_Back" },
                      { key: "tasdeeqApp" as const, label: "Tasdeeq App", file: "Tasdeeq_App" },
                      { key: "bankCheque" as const, label: "Bank Cheque", file: "Bank_Cheque" },
                      { key: "applicationForm" as const, label: "Application Form", file: "Application_Form" },
                    ].map(({ key, label, file }) => {
                      const val = o.bnplDocuments?.[key];
                      const isPdf = val?.startsWith("data:application/pdf");
                      const ext = isPdf ? "pdf" : "jpg";
                      return (
                        <View key={key} style={styles.bnplAdminDocItem}>
                          <View style={styles.bnplAdminDocHeader}>
                            <Text style={styles.bnplAdminDocLabel}>{label}</Text>
                            {val ? (
                              <View style={styles.bnplAdminDocBadge}>
                                <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                                <Text style={styles.bnplAdminDocBadgeText}>{isPdf ? "PDF" : "Image"}</Text>
                              </View>
                            ) : (
                              <View style={[styles.bnplAdminDocBadge, { backgroundColor: "#FEE2E2" }]}>
                                <Ionicons name="close-circle" size={14} color="#DC2626" />
                                <Text style={[styles.bnplAdminDocBadgeText, { color: "#DC2626" }]}>Not uploaded</Text>
                              </View>
                            )}
                          </View>
                          {val && (
                            <>
                              {isPdf ? (
                                <View style={[styles.bnplAdminDocImage, { alignItems: "center", justifyContent: "center", backgroundColor: "#FEF3C7" }]}>
                                  <Ionicons name="document-text" size={40} color="#D97706" />
                                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#D97706", marginTop: 6 }}>PDF Document</Text>
                                </View>
                              ) : (
                                <Pressable onPress={() => setProofImageModal(val)}>
                                  <Image source={{ uri: val }} style={styles.bnplAdminDocImage} resizeMode="cover" />
                                </Pressable>
                              )}
                              <View style={styles.bnplAdminDocActions}>
                                <Pressable style={styles.bnplDownloadBtn} onPress={() => downloadBnplDocument(val, `${o.id}_${file}.${ext}`)}>
                                  <Ionicons name="download-outline" size={16} color="#fff" />
                                  <Text style={styles.bnplDownloadBtnText}>Save to Device</Text>
                                </Pressable>
                                {!isPdf && (
                                  <Pressable style={styles.bnplViewBtn} onPress={() => setProofImageModal(val)}>
                                    <Ionicons name="expand-outline" size={16} color={Colors.primary} />
                                    <Text style={styles.bnplViewBtnText}>View Full</Text>
                                  </Pressable>
                                )}
                              </View>
                            </>
                          )}
                        </View>
                      );
                    })}
                    {o.bnplDocuments?.bankStatements && o.bnplDocuments.bankStatements.length > 0 && (
                      <View>
                        {o.bnplDocuments.bankStatements.map((stmt, idx) => {
                          const stmtIsPdf = stmt.startsWith("data:application/pdf");
                          const stmtExt = stmtIsPdf ? "pdf" : "jpg";
                          return (
                            <View key={idx} style={styles.bnplAdminDocItem}>
                              <View style={styles.bnplAdminDocHeader}>
                                <Text style={styles.bnplAdminDocLabel}>Bank Statement {idx + 1}</Text>
                                <View style={styles.bnplAdminDocBadge}>
                                  <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                                  <Text style={styles.bnplAdminDocBadgeText}>{stmtIsPdf ? "PDF" : "Image"}</Text>
                                </View>
                              </View>
                              {stmtIsPdf ? (
                                <View style={[styles.bnplAdminDocImage, { alignItems: "center", justifyContent: "center", backgroundColor: "#FEF3C7" }]}>
                                  <Ionicons name="document-text" size={40} color="#D97706" />
                                  <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#D97706", marginTop: 6 }}>PDF Document</Text>
                                </View>
                              ) : (
                                <Pressable onPress={() => setProofImageModal(stmt)}>
                                  <Image source={{ uri: stmt }} style={styles.bnplAdminDocImage} resizeMode="cover" />
                                </Pressable>
                              )}
                              <View style={styles.bnplAdminDocActions}>
                                <Pressable style={styles.bnplDownloadBtn} onPress={() => downloadBnplDocument(stmt, `${o.id}_Bank_Statement_${idx + 1}.${stmtExt}`)}>
                                  <Ionicons name="download-outline" size={16} color="#fff" />
                                  <Text style={styles.bnplDownloadBtnText}>Save to Device</Text>
                                </Pressable>
                                {!stmtIsPdf && (
                                  <Pressable style={styles.bnplViewBtn} onPress={() => setProofImageModal(stmt)}>
                                    <Ionicons name="expand-outline" size={16} color={Colors.primary} />
                                    <Text style={styles.bnplViewBtnText}>View Full</Text>
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              )}
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Items ({itemsList.length})</Text>
                {itemsList.map((item, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
                    </View>
                    <Text style={styles.itemPrice}>{formatPrice(item.price * item.quantity)}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Summary</Text>
                <View style={styles.detailCard}>
                  <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryVal}>{formatPrice(o.subtotal)}</Text></View>
                  <View style={styles.summaryLine}><Text style={styles.summaryLabel}>Delivery Fee</Text><Text style={styles.summaryVal}>{formatPrice(o.deliveryFee)}</Text></View>
                  <View style={[styles.summaryLine, styles.summaryTotal]}><Text style={styles.summaryTotalLabel}>Total</Text><Text style={styles.summaryTotalVal}>{formatPrice(o.total)}</Text></View>
                </View>
              </View>
              {(o.status === "delivered" || o.status === "cancelled") && (
                <View style={styles.detailSection}>
                  <Pressable
                    style={{ backgroundColor: "#FEE2E2", borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                    onPress={() => deleteOrder(o.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    <Text style={{ fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#DC2626" }}>Delete Order</Text>
                  </Pressable>
                </View>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Ionicons name="shield-checkmark" size={18} color="#FFD700" />
          <Text style={styles.headerTitle}>Admin Panel</Text>
        </View>
        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.white} />
        </Pressable>
      </View>

      <View style={styles.tabBar}>
        <Pressable style={[styles.tabItem, tab === "orders" && styles.tabItemActive]} onPress={() => setTab("orders")}>
          <Ionicons name="list" size={18} color={tab === "orders" ? Colors.primary : Colors.textLight} />
          <Text style={[styles.tabText, tab === "orders" && styles.tabTextActive]}>Orders</Text>
        </Pressable>
        <Pressable style={[styles.tabItem, tab === "products" && styles.tabItemActive]} onPress={() => setTab("products")}>
          <Ionicons name="cube" size={18} color={tab === "products" ? Colors.primary : Colors.textLight} />
          <Text style={[styles.tabText, tab === "products" && styles.tabTextActive]}>Products</Text>
        </Pressable>
        <Pressable style={[styles.tabItem, tab === "customers" && styles.tabItemActive]} onPress={() => setTab("customers")}>
          <Ionicons name="people" size={18} color={tab === "customers" ? Colors.primary : Colors.textLight} />
          <Text style={[styles.tabText, tab === "customers" && styles.tabTextActive]}>Customers</Text>
        </Pressable>
        <Pressable style={[styles.tabItem, tab === "health" && styles.tabItemActive]} onPress={() => setTab("health")}>
          <Ionicons name="shield-checkmark" size={18} color={tab === "health" ? Colors.primary : Colors.textLight} />
          <Text style={[styles.tabText, tab === "health" && styles.tabTextActive]}>Health</Text>
        </Pressable>
        <Pressable style={[styles.tabItem, tab === "scraper" && styles.tabItemActive]} onPress={() => setTab("scraper")}>
          <Ionicons name="cloud-download" size={18} color={tab === "scraper" ? "#7C3AED" : Colors.textLight} />
          <Text style={[styles.tabText, tab === "scraper" && { color: "#7C3AED", fontFamily: "Inter_700Bold" }]}>Scraper</Text>
        </Pressable>
        <Pressable style={[styles.tabItem, tab === "stats" && styles.tabItemActive]} onPress={() => { setTab("stats"); fetchStats(); }}>
          <Ionicons name="stats-chart" size={18} color={tab === "stats" ? Colors.primary : Colors.textLight} />
          <Text style={[styles.tabText, tab === "stats" && styles.tabTextActive]}>Stats</Text>
        </Pressable>
      </View>

      {tab === "orders" ? (
        <>
          {renderFilters()}
          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView
              style={styles.ordersList}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 20 }}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
            >
              {orders.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="bag-outline" size={48} color={Colors.textLight} />
                  <Text style={styles.emptyTitle}>No Orders Found</Text>
                  <Text style={styles.emptySubtitle}>{statusFilter !== "all" ? "Try a different filter" : "Orders will appear here"}</Text>
                </View>
              ) : (
                orders.map(renderOrderCard)
              )}
            </ScrollView>
          )}
        </>
      ) : tab === "products" ? (
        renderProductsTab()
      ) : tab === "customers" ? (
        renderCustomersTab()
      ) : tab === "health" ? (
        <ScrollView
          style={styles.ordersList}
          contentContainerStyle={{ paddingBottom: bottomPad + 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {renderHealthTab()}
        </ScrollView>
      ) : tab === "scraper" ? (
        <ScrollView
          style={styles.ordersList}
          contentContainerStyle={{ paddingBottom: bottomPad + 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#7C3AED" />}
        >
          {renderScraperTab()}
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.ordersList}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad + 20 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
          {renderStatsTab()}
        </ScrollView>
      )}

      {renderOrderDetail()}
      {renderProductFormModal()}

      {proofImageModal && (
        <Modal visible={!!proofImageModal} transparent animationType="fade">
          <Pressable style={styles.proofModalOverlay} onPress={() => setProofImageModal(null)}>
            <View style={styles.proofModalContent}>
              <Pressable style={styles.proofModalCloseBtn} onPress={() => setProofImageModal(null)}>
                <Ionicons name="close-circle" size={32} color="#fff" />
              </Pressable>
              <Image source={{ uri: proofImageModal }} style={styles.proofModalImage} resizeMode="contain" />
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  paymentStatusRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  paymentBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  paymentBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  paymentToggleRow: { flexDirection: "row", gap: 8 },
  paymentToggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: Colors.borderLight, backgroundColor: Colors.surface },
  paymentToggleBtnActive: { borderColor: "transparent" },
  paymentToggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  whatsappBtnsRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  whatsappBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#25D36630" },
  whatsappBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#166534" },
  bankTransferDetails: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  bankDetailsTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 8 },
  proofSection: { marginTop: 12 },
  proofLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 6 },
  proofImageContainer: { width: "100%", height: 200, borderRadius: 10, overflow: "hidden", backgroundColor: Colors.surface },
  proofImage: { width: "100%", height: "100%" },
  proofModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", justifyContent: "center", alignItems: "center" },
  proofModalContent: { width: "90%", height: "70%", justifyContent: "center", alignItems: "center" },
  proofModalCloseBtn: { position: "absolute", top: -40, right: 0, zIndex: 10 },
  proofModalImage: { width: "100%", height: "100%" },
  bnplAdminDocItem: { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  bnplAdminDocHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  bnplAdminDocLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  bnplAdminDocBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  bnplAdminDocBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#16A34A" },
  bnplAdminDocImage: { width: "100%" as any, height: 160, borderRadius: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.borderLight },
  bnplAdminDocActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  bnplDownloadBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: 10 },
  bnplDownloadBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  bnplViewBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: Colors.primary + "12", borderRadius: 8, paddingVertical: 10, borderWidth: 1, borderColor: Colors.primary + "30" },
  bnplViewBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  logoutBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
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
  tabText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textLight },
  tabTextActive: { color: Colors.primary, fontFamily: "Inter_600SemiBold" },
  searchRow: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, marginLeft: 8 },
  filterScroll: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  filterChipTextActive: { color: Colors.white },
  ordersList: { flex: 1 },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  orderCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  orderId: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.text },
  orderCardBody: { gap: 4, marginBottom: 10 },
  orderCardRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  orderCardText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  orderCardFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  orderCardDate: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textLight },
  orderCardTotal: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
  statusBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 12 },
  emptySubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  statCard: {
    width: "48%" as any,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    flexBasis: "47%",
    flexGrow: 1,
  },
  statValue: { fontSize: 18, fontFamily: "Inter_800ExtraBold", color: Colors.text, marginTop: 8 },
  statLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginTop: 2 },
  statsSection: { paddingTop: 12 },
  statsBlock: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.borderLight },
  statsBlockTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 12 },
  statsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  statsRowLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  statsRowValue: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.text },
  modalOverlay: { flex: 1, backgroundColor: Colors.background },
  modalContent: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: Colors.text },
  modalScroll: { flex: 1, paddingHorizontal: 16 },
  detailSection: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  detailHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailOrderId: { fontSize: 18, fontFamily: "Inter_800ExtraBold", color: Colors.text },
  detailDate: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 4 },
  detailSectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 10 },
  detailCard: { backgroundColor: Colors.surfaceAlt, borderRadius: 12, padding: 12, gap: 8 },
  detailRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailValue: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, flex: 1 },
  statusButtons: { flexDirection: "row", gap: 8 },
  statusBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  statusBtnActive: {},
  statusBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
  },
  itemInfo: { flex: 1, marginRight: 10 },
  itemName: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  itemQty: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  itemPrice: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.primary },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  summaryVal: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  summaryTotal: { borderTopWidth: 1, borderTopColor: Colors.borderLight, marginTop: 6, paddingTop: 8 },
  summaryTotalLabel: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  summaryTotalVal: { fontSize: 16, fontFamily: "Inter_800ExtraBold", color: Colors.primary },

  productCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  productCardTop: { flexDirection: "row", gap: 12 },
  productCardImg: { width: 70, height: 70, borderRadius: 10, backgroundColor: "#F5F5F5" },
  productCardInfo: { flex: 1 },
  productCardName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, lineHeight: 18 },
  productCardBrand: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  productCardPriceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  productCardPrice: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.primary },
  productCardDiscBadge: { backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  productCardDiscText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  productCardMeta: { flexDirection: "row", gap: 8, marginTop: 4, alignItems: "center", flexWrap: "wrap" },
  productCardMetaText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textLight },
  stockBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  stockBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  productCardActions: { flexDirection: "row", gap: 8, marginTop: 10, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: 10 },
  editBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: Colors.primary + "12", borderWidth: 1, borderColor: Colors.primary + "30" },
  editBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  deleteBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: "#DC262612", borderWidth: 1, borderColor: "#DC262630" },
  deleteBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#DC2626" },
  productsHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  productsCount: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  addProductBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addProductBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.white },
  saveBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, minWidth: 70, alignItems: "center" },
  saveBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.white },
  formSection: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  formSectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 12 },
  formField: { marginBottom: 12 },
  formLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary, marginBottom: 4 },
  formInput: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  formRow: { flexDirection: "row", gap: 10 },
  brandChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  brandChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  brandChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  brandChipTextActive: { color: Colors.white },
  toggleRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  toggleBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  toggleBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  toggleBtnTextActive: { color: Colors.white },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  listItemText: { flex: 1, fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  listItemLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  listItemSub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  soldOutBadge: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#DC2626", backgroundColor: "#FEE2E2", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  customerCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 12,
  },
  customerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  customerAvatarText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.white,
  },
  customerName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
    marginBottom: 2,
  },
  customerInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  customerInfoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  customerDate: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: Colors.textLight,
    position: "absolute",
    top: 14,
    right: 14,
  },
  mgmtCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  mgmtCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  mgmtIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  mgmtTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  mgmtDesc: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 1,
  },
  mgmtSchedule: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: Colors.primary,
    backgroundColor: "#F0FDF4",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  mgmtBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingVertical: 10,
    borderRadius: 8,
  },
  mgmtBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: "#fff",
  },
  scrapeProgress: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  scrapeProgressText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#92400E",
    flex: 1,
  },
  scrapeCompleted: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: "#16A34A",
    backgroundColor: "#F0FDF4",
    padding: 6,
    borderRadius: 6,
    marginBottom: 10,
  },
  colorSwatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderLight },
  removeBtn: { padding: 2 },
  addItemRow: { flexDirection: "row", gap: 6, alignItems: "center" },
  addItemBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.primary, alignItems: "center", justifyContent: "center" },
});
