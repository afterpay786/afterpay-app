import React, { useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  Platform,
  Alert,
  Image,
  KeyboardAvoidingView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import Colors from "@/constants/colors";
import { useCart, getItemPrice } from "@/lib/cart-context";
import { useOrders, CITIES, DELIVERY_FEE, OPEN_PARCEL_FEE, PAYMENT_METHODS, ADVANCE_AMOUNT, PaymentMethod, BnplDocuments } from "@/lib/order-context";
import { formatPrice } from "@/lib/data";
import { getApiUrl } from "@/lib/query-client";

const HBL_QR_CODE = require("@/assets/images/hbl-qr-code.png");

type Step = "delivery" | "payment" | "review";

const OPEN_PARCEL_CITIES = ["Islamabad", "Rawalpindi", "Lahore", "Karachi"];

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();
  const { items, getTotal, clearCart } = useCart();
  const {
    currentDeliveryInfo,
    setCurrentDeliveryInfo,
    selectedPaymentMethod,
    setSelectedPaymentMethod,
    paymentOption,
    setPaymentOption,
    bankTransferInfo,
    setBankTransferInfo,
    bnplDocuments,
    setBnplDocuments,
    openParcel,
    setOpenParcel,
    placeOrder,
    saveAddress,
    savedAddresses,
    initiateJazzCashPayment,
  } = useOrders();

  const [step, setStep] = useState<Step>("delivery");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCities, setShowCities] = useState(false);
  const [citySearch, setCitySearch] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [placing, setPlacing] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  const subtotal = getTotal();
  const deliveryFee = DELIVERY_FEE + (openParcel ? OPEN_PARCEL_FEE : 0);
  const total = subtotal + deliveryFee;
  const canOpenParcel = OPEN_PARCEL_CITIES.includes(currentDeliveryInfo.city);

  const filteredCities = citySearch
    ? CITIES.filter((c) => c.toLowerCase().includes(citySearch.toLowerCase()))
    : CITIES;

  const updateField = (field: string, value: string) => {
    setCurrentDeliveryInfo({ ...currentDeliveryInfo, [field]: value });
    if (errors[field]) {
      const newErrors = { ...errors };
      delete newErrors[field];
      setErrors(newErrors);
    }
  };

  const validateDelivery = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!currentDeliveryInfo.fullName.trim()) newErrors.fullName = "Name is required";
    if (!currentDeliveryInfo.phone.trim()) newErrors.phone = "Phone number is required";
    else if (!/^(03|92)\d{9,10}$/.test(currentDeliveryInfo.phone.replace(/[\s-]/g, "")))
      newErrors.phone = "Enter a valid Pakistani phone number";
    if (!currentDeliveryInfo.email.trim()) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(currentDeliveryInfo.email))
      newErrors.email = "Enter a valid email address";
    if (!currentDeliveryInfo.address.trim()) newErrors.address = "Address is required";
    if (!currentDeliveryInfo.city) newErrors.city = "Please select a city";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const goToPayment = () => {
    if (validateDelivery()) {
      setStep("payment");
      scrollRef.current?.scrollTo({ y: 0 });
    }
  };

  const goToReview = () => {
    setStep("review");
    scrollRef.current?.scrollTo({ y: 0 });
  };

  const handlePlaceOrder = async () => {
    if (placing || items.length === 0) return;
    setPlacing(true);
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    saveAddress(currentDeliveryInfo);
    if (currentDeliveryInfo.phone) {
      AsyncStorage.setItem("afterpay_customer_phone", currentDeliveryInfo.phone).catch(() => {});
    }
    const cartItems = [...items];
    const cartSubtotal = subtotal;
    const order = placeOrder(cartItems, cartSubtotal);
    const orderId = order.id;

    if (selectedPaymentMethod === "jazzcash") {
      try {
        await initiateJazzCashPayment(orderId, order.total);
        clearCart();

        const baseUrl = getApiUrl();
        const payFormUrl = `${baseUrl}api/jazzcash/pay-form/${orderId}`;

        if (Platform.OS === "web") {
          window.open(payFormUrl, "_blank");
        } else {
          await WebBrowser.openBrowserAsync(payFormUrl);
        }

        router.replace({ pathname: "/order-success", params: { orderId, paymentPending: "true" } });
      } catch (err) {
        console.error("JazzCash payment error:", err);
        clearCart();
        router.replace({ pathname: "/order-success", params: { orderId, paymentFailed: "true" } });
      }
    } else {
      setTimeout(() => {
        clearCart();
        router.replace({ pathname: "/order-success", params: { orderId } });
      }, 600);
    }
  };

  const stepIndex = step === "delivery" ? 0 : step === "payment" ? 1 : 2;

  const renderStepIndicator = () => (
    <View style={styles.stepBar}>
      {["Delivery", "Payment", "Review"].map((label, idx) => (
        <View key={label} style={styles.stepItem}>
          <View style={[styles.stepCircle, idx <= stepIndex && styles.stepCircleActive]}>
            {idx < stepIndex ? (
              <Ionicons name="checkmark" size={14} color={Colors.white} />
            ) : (
              <Text style={[styles.stepNum, idx <= stepIndex && styles.stepNumActive]}>{idx + 1}</Text>
            )}
          </View>
          <Text style={[styles.stepLabel, idx <= stepIndex && styles.stepLabelActive]}>{label}</Text>
          {idx < 2 && <View style={[styles.stepLine, idx < stepIndex && styles.stepLineActive]} />}
        </View>
      ))}
    </View>
  );

  const renderSavedAddresses = () => {
    if (savedAddresses.length === 0) return null;
    return (
      <View style={styles.savedSection}>
        <Text style={styles.savedTitle}>Saved Addresses</Text>
        {savedAddresses.map((addr, idx) => (
          <Pressable
            key={idx}
            style={({ pressed }) => [styles.savedCard, pressed && { opacity: 0.8 }]}
            onPress={() => {
              setCurrentDeliveryInfo(addr);
              setErrors({});
            }}
          >
            <Ionicons name="location" size={18} color={Colors.primary} />
            <View style={styles.savedInfo}>
              <Text style={styles.savedName}>{addr.fullName}</Text>
              <Text style={styles.savedAddr} numberOfLines={1}>{addr.address}, {addr.city}</Text>
              <Text style={styles.savedPhone}>{addr.phone}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.textLight} />
          </Pressable>
        ))}
      </View>
    );
  };

  const renderDeliveryStep = () => (
    <View>
      {renderSavedAddresses()}
      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Delivery Information</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Full Name *</Text>
          <TextInput
            style={[styles.input, errors.fullName && styles.inputError]}
            placeholder="Muhammad Ali"
            placeholderTextColor={Colors.textLight}
            value={currentDeliveryInfo.fullName}
            onChangeText={(v) => updateField("fullName", v)}
          />
          {errors.fullName && <Text style={styles.errorText}>{errors.fullName}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Phone Number *</Text>
          <TextInput
            style={[styles.input, errors.phone && styles.inputError]}
            placeholder="03XX XXXXXXX"
            placeholderTextColor={Colors.textLight}
            keyboardType="phone-pad"
            value={currentDeliveryInfo.phone}
            onChangeText={(v) => updateField("phone", v)}
          />
          {errors.phone && <Text style={styles.errorText}>{errors.phone}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Email Address *</Text>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            placeholder="your@email.com"
            placeholderTextColor={Colors.textLight}
            keyboardType="email-address"
            autoCapitalize="none"
            value={currentDeliveryInfo.email}
            onChangeText={(v) => updateField("email", v)}
          />
          {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Delivery Address *</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline, errors.address && styles.inputError]}
            placeholder="House/Flat No., Street, Area"
            placeholderTextColor={Colors.textLight}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={currentDeliveryInfo.address}
            onChangeText={(v) => updateField("address", v)}
          />
          {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>City *</Text>
          <Pressable
            style={[styles.input, styles.citySelect, errors.city && styles.inputError]}
            onPress={() => setShowCities(!showCities)}
          >
            <Text style={currentDeliveryInfo.city ? styles.cityText : styles.cityPlaceholder}>
              {currentDeliveryInfo.city || "Select your city"}
            </Text>
            <Ionicons name={showCities ? "chevron-up" : "chevron-down"} size={18} color={Colors.textLight} />
          </Pressable>
          {errors.city && <Text style={styles.errorText}>{errors.city}</Text>}
          {showCities && (
            <View style={styles.cityDropdown}>
              <TextInput
                style={styles.citySearchInput}
                placeholder="Search city..."
                placeholderTextColor={Colors.textLight}
                value={citySearch}
                onChangeText={setCitySearch}
              />
              <ScrollView style={styles.cityList} nestedScrollEnabled>
                {filteredCities.map((city) => (
                  <Pressable
                    key={city}
                    style={[styles.cityItem, currentDeliveryInfo.city === city && styles.cityItemActive]}
                    onPress={() => {
                      updateField("city", city);
                      setShowCities(false);
                      setCitySearch("");
                      if (!OPEN_PARCEL_CITIES.includes(city)) setOpenParcel(false);
                    }}
                  >
                    <Text style={[styles.cityItemText, currentDeliveryInfo.city === city && styles.cityItemTextActive]}>
                      {city}
                    </Text>
                    {currentDeliveryInfo.city === city && (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Order Notes (Optional)</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="Any special instructions..."
            placeholderTextColor={Colors.textLight}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            value={currentDeliveryInfo.notes}
            onChangeText={(v) => updateField("notes", v)}
          />
        </View>
      </View>

      <View style={styles.deliveryOptions}>
        <Text style={styles.sectionTitle}>Delivery Options</Text>
        <View style={styles.deliveryCard}>
          <View style={styles.deliveryRow}>
            <Ionicons name="bicycle-outline" size={22} color={Colors.primary} />
            <View style={styles.deliveryInfo}>
              <Text style={styles.deliveryLabel}>Standard Delivery</Text>
              <Text style={styles.deliverySub}>Rs. {DELIVERY_FEE} - All cities in Pakistan</Text>
            </View>
            <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
          </View>
        </View>

        {canOpenParcel && (
          <Pressable
            style={[styles.deliveryCard, openParcel && styles.deliveryCardActive]}
            onPress={() => setOpenParcel(!openParcel)}
          >
            <View style={styles.deliveryRow}>
              <Ionicons name="cube-outline" size={22} color={openParcel ? Colors.primary : Colors.textSecondary} />
              <View style={styles.deliveryInfo}>
                <Text style={styles.deliveryLabel}>Open Parcel Delivery</Text>
                <Text style={styles.deliverySub}>+Rs. {OPEN_PARCEL_FEE} - Check before paying</Text>
              </View>
              <View style={[styles.checkbox, openParcel && styles.checkboxActive]}>
                {openParcel && <Ionicons name="checkmark" size={14} color={Colors.white} />}
              </View>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setBankTransferInfo({ 
        ...bankTransferInfo, 
        paymentProof: `data:image/jpeg;base64,${result.assets[0].base64}` 
      });
    }
  };

  const pickBnplImage = async (field: keyof BnplDocuments) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const uri = `data:image/jpeg;base64,${result.assets[0].base64}`;
      storeBnplDoc(field, uri);
    }
  };

  const pickBnplPdf = async (field: keyof BnplDocuments) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
        const uri = `data:application/pdf;base64,${base64}`;
        storeBnplDoc(field, uri);
      }
    } catch (err) {
      Alert.alert("Error", "Could not pick document. Please try again.");
    }
  };

  const storeBnplDoc = (field: keyof BnplDocuments, uri: string) => {
    if (field === "bankStatements") {
      const existing = bnplDocuments.bankStatements || [];
      if (existing.length < 3) {
        setBnplDocuments({ ...bnplDocuments, bankStatements: [...existing, uri] });
      } else {
        Alert.alert("Limit Reached", "Maximum 3 bank statements allowed.");
      }
    } else {
      setBnplDocuments({ ...bnplDocuments, [field]: uri });
    }
  };

  const pickBnplDoc = async (field: keyof BnplDocuments) => {
    const supportsPdf = field === "bankStatements" || field === "applicationForm";
    if (supportsPdf) {
      Alert.alert(
        "Choose File Type",
        "Select the type of file to upload",
        [
          { text: "Photo (JPG/JPEG)", onPress: () => pickBnplImage(field) },
          { text: "PDF Document", onPress: () => pickBnplPdf(field) },
          { text: "Cancel", style: "cancel" },
        ]
      );
    } else {
      pickBnplImage(field);
    }
  };

  const removeBnplDoc = (field: keyof BnplDocuments, index?: number) => {
    if (field === "bankStatements" && index !== undefined) {
      const existing = bnplDocuments.bankStatements || [];
      setBnplDocuments({ ...bnplDocuments, bankStatements: existing.filter((_, i) => i !== index) });
    } else {
      setBnplDocuments({ ...bnplDocuments, [field]: undefined });
    }
  };

  const downloadApplicationForm = async () => {
    try {
      const baseUrl = getApiUrl();
      const fullUrl = `${baseUrl}api/bnpl/application-form`;

      if (Platform.OS === "web") {
        window.open(fullUrl, "_blank");
        return;
      }

      Alert.alert("Downloading...", "Please wait while the form downloads.");

      const fileUri = FileSystem.documentDirectory + "AFTER_PAY_Application_Form.pdf";
      const downloadResult = await FileSystem.downloadAsync(fullUrl, fileUri);

      if (downloadResult.status !== 200) {
        Alert.alert("Error", "Download failed. Please try again.");
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: "application/pdf",
          dialogTitle: "AFTER PAY Application Form",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Downloaded", "Form saved. Check your files app to find it.");
      }
    } catch (err) {
      console.error("PDF download error:", err);
      Alert.alert("Error", "Could not download the form. Please try again.");
    }
  };

  const renderDocUploadItem = (label: string, field: keyof BnplDocuments, icon: string, required: boolean = true) => {
    const value = field === "bankStatements" ? undefined : (bnplDocuments[field] as string | undefined);
    const isUploaded = !!value;
    const isPdf = value?.startsWith("data:application/pdf");
    const supportsPdf = field === "bankStatements" || field === "applicationForm";
    return (
      <View style={styles.bnplDocItem} key={field}>
        <View style={styles.bnplDocItemHeader}>
          <View style={[styles.bnplDocIcon, isUploaded && styles.bnplDocIconDone]}>
            <Ionicons name={icon as any} size={18} color={isUploaded ? Colors.white : Colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bnplDocLabel}>{label}{required ? " *" : ""}</Text>
            <Text style={styles.bnplDocHint}>{supportsPdf ? "JPG, JPEG or PDF accepted" : "JPG, JPEG accepted"}</Text>
          </View>
          {isUploaded ? (
            <View style={styles.bnplDocUploaded}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
              <Pressable onPress={() => removeBnplDoc(field)} style={styles.bnplDocRemove}>
                <Ionicons name="close-circle" size={18} color={Colors.accent} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={styles.bnplDocUploadBtn} onPress={() => pickBnplDoc(field)}>
              <Ionicons name="cloud-upload-outline" size={16} color={Colors.primary} />
              <Text style={styles.bnplDocUploadText}>Upload</Text>
            </Pressable>
          )}
        </View>
        {isUploaded && (
          isPdf ? (
            <View style={[styles.bnplDocPreview, { alignItems: "center", justifyContent: "center", backgroundColor: "#FEF3C7" }]}>
              <Ionicons name="document-text" size={32} color="#D97706" />
              <Text style={{ fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#D97706", marginTop: 4 }}>PDF Uploaded</Text>
            </View>
          ) : (
            <Image source={{ uri: value }} style={styles.bnplDocPreview} resizeMode="cover" />
          )
        )}
      </View>
    );
  };

  const renderBnplDocuments = () => (
    <View style={styles.bnplSection}>
      <LinearGradient
        colors={[Colors.primary, Colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.bnplHeader}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="document-text-outline" size={24} color={Colors.white} />
          <View>
            <Text style={styles.bnplHeaderTitle}>Installment Application</Text>
            <Text style={styles.bnplHeaderSub}>Upload required documents to proceed</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.bnplFormDownload}>
        <View style={{ flex: 1 }}>
          <Text style={styles.bnplFormTitle}>AFTER PAY Application Form</Text>
          <Text style={styles.bnplFormDesc}>Download, fill out, and upload the signed form</Text>
        </View>
        <Pressable style={styles.bnplDownloadBtn} onPress={downloadApplicationForm}>
          <Ionicons name="download-outline" size={18} color={Colors.white} />
          <Text style={styles.bnplDownloadText}>Download</Text>
        </Pressable>
      </View>

      <View style={styles.bnplDocsContainer}>
        <Text style={styles.bnplDocsTitle}>Required Documents</Text>
        
        {renderDocUploadItem("CNIC Front", "cnicFront", "card-outline")}
        {renderDocUploadItem("CNIC Back", "cnicBack", "card-outline")}
        {renderDocUploadItem("Tasdeeq App Screenshot", "tasdeeqApp", "phone-portrait-outline")}
        {renderDocUploadItem("Bank Cheque", "bankCheque", "receipt-outline")}
        
        <View style={styles.bnplDocItem}>
          <View style={styles.bnplDocItemHeader}>
            <View style={[styles.bnplDocIcon, (bnplDocuments.bankStatements?.length || 0) >= 3 && styles.bnplDocIconDone]}>
              <Ionicons name="documents-outline" size={18} color={(bnplDocuments.bankStatements?.length || 0) >= 3 ? Colors.white : Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bnplDocLabel}>Last 3 Months Bank Statement *</Text>
              <Text style={styles.bnplDocHint}>{bnplDocuments.bankStatements?.length || 0}/3 uploaded (JPG, JPEG or PDF)</Text>
            </View>
            {(bnplDocuments.bankStatements?.length || 0) < 3 && (
              <Pressable style={styles.bnplDocUploadBtn} onPress={() => pickBnplDoc("bankStatements")}>
                <Ionicons name="cloud-upload-outline" size={16} color={Colors.primary} />
                <Text style={styles.bnplDocUploadText}>Upload</Text>
              </Pressable>
            )}
          </View>
          {(bnplDocuments.bankStatements || []).map((stmt, i) => (
            <View key={i} style={styles.bnplStatementRow}>
              {stmt.startsWith("data:application/pdf") ? (
                <View style={[styles.bnplDocPreviewSmall, { alignItems: "center", justifyContent: "center", backgroundColor: "#FEF3C7" }]}>
                  <Ionicons name="document-text" size={20} color="#D97706" />
                </View>
              ) : (
                <Image source={{ uri: stmt }} style={styles.bnplDocPreviewSmall} resizeMode="cover" />
              )}
              <Text style={styles.bnplStatementLabel}>Month {i + 1}{stmt.startsWith("data:application/pdf") ? " (PDF)" : ""}</Text>
              <Pressable onPress={() => removeBnplDoc("bankStatements", i)} style={styles.bnplDocRemove}>
                <Ionicons name="close-circle" size={18} color={Colors.accent} />
              </Pressable>
            </View>
          ))}
        </View>

        {renderDocUploadItem("Signed Application Form", "applicationForm", "document-attach-outline")}
      </View>

      <View style={styles.bnplWhatsAppBox}>
        <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.bnplWhatsAppTitle}>Need Help?</Text>
          <Text style={styles.bnplWhatsAppDesc}>Contact us on WhatsApp for installment plan details and assistance.</Text>
        </View>
        <Pressable
          style={styles.bnplWhatsAppBtn}
          onPress={() => WebBrowser.openBrowserAsync("https://wa.me/923261605570?text=Hi%2C%20I%20am%20interested%20in%20installment%20plans%20for%20a%20phone%20purchase.")}
        >
          <Ionicons name="logo-whatsapp" size={16} color="#fff" />
          <Text style={styles.bnplWhatsAppBtnText}>WhatsApp</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderBankTransferDetails = () => (
    <View style={styles.bankTransferSection}>
      <LinearGradient
        colors={["#F97316", "#FB923C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.bankInfoCard}
      >
        <Text style={styles.bankInfoText}>Bank Name: HBL (Habib Bank Limited)</Text>
        <Text style={styles.bankInfoText}>Account No: 1178790158750</Text>
        <Text style={styles.bankInfoText}>Account Title: AFTER PAY</Text>
        <Text style={styles.bankInfoNote}>In case of non-payment, order will be cancelled after 4 hours.</Text>
        <Text style={styles.bankInfoNote}>Bank transfer payments made after 4 PM on Saturday or on Sunday will be verified on Monday.</Text>
      </LinearGradient>

      <View style={styles.qrSection}>
        <Text style={styles.qrTitle}>Scan QR Code to Pay</Text>
        <View style={styles.qrContainer}>
          <Image source={HBL_QR_CODE} style={styles.qrImage} resizeMode="contain" />
        </View>
        <Text style={styles.qrSubtext}>Scan with your banking app to transfer payment</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>CNIC</Text>
        <TextInput
          style={styles.input}
          placeholder="12345-1234567-1"
          placeholderTextColor={Colors.textLight}
          keyboardType="numeric"
          value={bankTransferInfo.cnic}
          onChangeText={(v) => setBankTransferInfo({ ...bankTransferInfo, cnic: v })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Account Title</Text>
        <TextInput
          style={styles.input}
          placeholder="Your account title"
          placeholderTextColor={Colors.textLight}
          value={bankTransferInfo.accountTitle}
          onChangeText={(v) => setBankTransferInfo({ ...bankTransferInfo, accountTitle: v })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Account Number</Text>
        <TextInput
          style={styles.input}
          placeholder="Your bank account number"
          placeholderTextColor={Colors.textLight}
          keyboardType="numeric"
          value={bankTransferInfo.accountNumber}
          onChangeText={(v) => setBankTransferInfo({ ...bankTransferInfo, accountNumber: v })}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Payment Proof (Screenshot)</Text>
        <Pressable 
          style={[styles.input, styles.uploadBtn]} 
          onPress={pickImage}
        >
          <Ionicons name="image-outline" size={20} color={Colors.primary} />
          <Text style={styles.uploadBtnText}>
            {bankTransferInfo.paymentProof ? "Screenshot Attached" : "Choose file"}
          </Text>
        </Pressable>
        {bankTransferInfo.paymentProof && (
          <View style={styles.proofPreviewContainer}>
            <Image 
              source={{ uri: bankTransferInfo.paymentProof }} 
              style={styles.proofPreview} 
            />
            <Pressable 
              style={styles.removeProof} 
              onPress={() => setBankTransferInfo({ ...bankTransferInfo, paymentProof: undefined })}
            >
              <Ionicons name="close-circle" size={20} color={Colors.accent} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );

  const renderPaymentOption = () => (
    <View style={styles.formSection}>
      <Text style={styles.sectionTitle}>Choose Payment Option</Text>
      <Pressable
        style={[styles.paymentOptionCard, paymentOption === "full" && styles.paymentOptionActive]}
        onPress={() => setPaymentOption("full")}
      >
        <View style={styles.paymentOptionInfo}>
          <Text style={[styles.paymentOptionLabel, paymentOption === "full" && styles.paymentOptionLabelActive]}>Full Payment</Text>
        </View>
        <View style={[styles.radio, paymentOption === "full" && styles.radioActive]}>
          {paymentOption === "full" && <View style={styles.radioDot} />}
        </View>
      </Pressable>

      <Pressable
        style={[styles.paymentOptionCard, paymentOption === "advance" && styles.paymentOptionActive]}
        onPress={() => setPaymentOption("advance")}
      >
        <View style={styles.paymentOptionInfo}>
          <Text style={[styles.paymentOptionLabel, paymentOption === "advance" && styles.paymentOptionLabelActive]}>
            Advance Payment ({formatPrice(ADVANCE_AMOUNT)})
          </Text>
          <Text style={styles.paymentOptionReason}>Reason: High Value item(s)</Text>
        </View>
        <View style={[styles.radio, paymentOption === "advance" && styles.radioActive]}>
          {paymentOption === "advance" && <View style={styles.radioDot} />}
        </View>
      </Pressable>
    </View>
  );

  const renderPaymentStep = () => (
    <View>
      <View style={styles.formSection}>
        <Text style={styles.sectionTitle}>Select Payment Method</Text>
        {PAYMENT_METHODS.map((method) => (
          <View key={method.id}>
            <Pressable
              style={[styles.paymentCard, selectedPaymentMethod === method.id && styles.paymentCardActive]}
              onPress={() => {
                setSelectedPaymentMethod(method.id);
              }}
            >
              <View style={[styles.paymentIcon, selectedPaymentMethod === method.id && styles.paymentIconActive]}>
                <Ionicons
                  name={method.icon as any}
                  size={22}
                  color={selectedPaymentMethod === method.id ? Colors.white : Colors.primary}
                />
              </View>
              <View style={styles.paymentInfo}>
                <Text style={[styles.paymentLabel, selectedPaymentMethod === method.id && styles.paymentLabelActive]}>
                  {method.label}
                </Text>
                <Text style={styles.paymentDesc}>{method.description}</Text>
                {method.id === "cod" && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularText}>Most Popular</Text>
                  </View>
                )}
                {method.id === "bnpl" && (
                  <Text style={styles.bnplNote}>Available for orders Rs. 10,000+{"\n"}Credit card required</Text>
                )}
              </View>
              <View style={[styles.radio, selectedPaymentMethod === method.id && styles.radioActive]}>
                {selectedPaymentMethod === method.id && <View style={styles.radioDot} />}
              </View>
            </Pressable>
            {method.id === "bnpl" && selectedPaymentMethod === "bnpl" && renderBnplDocuments()}
            {method.id === "bank_transfer" && selectedPaymentMethod === "bank_transfer" && renderBankTransferDetails()}
          </View>
        ))}
      </View>

      {renderPaymentOption()}

      <View style={styles.voucherSection}>
        <Text style={styles.sectionTitle}>Voucher Code</Text>
        <View style={styles.voucherRow}>
          <TextInput
            style={styles.voucherInput}
            placeholder="Enter voucher code"
            placeholderTextColor={Colors.textLight}
            value={voucherCode}
            onChangeText={setVoucherCode}
            autoCapitalize="characters"
          />
          <Pressable style={styles.voucherBtn}>
            <Text style={styles.voucherBtnText}>Apply</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  const getPaymentLabel = (id: PaymentMethod) => PAYMENT_METHODS.find((m) => m.id === id)?.label || "";

  const getDeliveryDateRange = () => {
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    return `${start.toLocaleDateString("en-PK", opts)} - ${end.toLocaleDateString("en-PK", opts)}`;
  };

  const renderReviewStep = () => (
    <View>
      <View style={styles.reviewSection}>
        <View style={styles.reviewHeader}>
          <Text style={styles.sectionTitle}>Order Items ({items.length})</Text>
        </View>
        {items.map((item) => (
          <View key={item.product.id}>
            <View style={styles.reviewItem}>
              <Image source={{ uri: item.product.image }} style={styles.reviewImg} />
              <View style={styles.reviewItemInfo}>
                <Text style={styles.reviewItemName} numberOfLines={2}>{item.product.name}</Text>
                {item.selectedVariant && (
                  <Text style={styles.reviewItemVariant}>{item.selectedVariant.label}</Text>
                )}
                <Text style={styles.reviewItemQty}>Qty: {item.quantity}</Text>
                <View style={styles.reviewPriceRow}>
                  <Text style={styles.reviewItemPrice}>{formatPrice(getItemPrice(item) * item.quantity)}</Text>
                  {item.product.discount > 0 && (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountBadgeText}>{item.product.discount}% OFF</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
            <View style={styles.estimatedDeliveryBanner}>
              <Ionicons name="car-outline" size={18} color="#F97316" />
              <Text style={styles.estimatedDeliveryText}>
                Estimated Delivery <Text style={styles.estimatedDeliveryDates}>{getDeliveryDateRange()}</Text>
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.reviewSection}>
        <View style={styles.reviewHeader}>
          <Text style={styles.sectionTitle}>Delivery Address</Text>
          <Pressable onPress={() => setStep("delivery")}>
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>
        <View style={styles.reviewCard}>
          <Text style={styles.reviewName}>{currentDeliveryInfo.fullName}</Text>
          <Text style={styles.reviewAddr}>{currentDeliveryInfo.address}</Text>
          <Text style={styles.reviewAddr}>{currentDeliveryInfo.city}</Text>
          <Text style={styles.reviewPhone}>{currentDeliveryInfo.phone}</Text>
          <Text style={styles.reviewPhone}>{currentDeliveryInfo.email}</Text>
        </View>
      </View>

      <View style={styles.reviewSection}>
        <View style={styles.reviewHeader}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          <Pressable onPress={() => setStep("payment")}>
            <Text style={styles.editLink}>Edit</Text>
          </Pressable>
        </View>
        <View style={styles.reviewCard}>
          <Text style={styles.reviewName}>{getPaymentLabel(selectedPaymentMethod)}</Text>
          <Text style={styles.reviewAddr}>
            {paymentOption === "full" ? "Full Payment" : `Advance Payment (${formatPrice(ADVANCE_AMOUNT)})`}
          </Text>
          {paymentOption === "advance" && (
            <Text style={styles.reviewAddrNote}>Remaining {formatPrice(total - ADVANCE_AMOUNT)} on delivery</Text>
          )}
          {openParcel && <Text style={styles.reviewAddr}>Open Parcel Delivery selected</Text>}
        </View>
      </View>

      <View style={styles.summarySection}>
        <Text style={styles.sectionTitle}>Order Summary</Text>
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</Text>
            <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Delivery Fee</Text>
            <Text style={styles.summaryValue}>Rs. {DELIVERY_FEE}</Text>
          </View>
          {openParcel && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Open Parcel Fee</Text>
              <Text style={styles.summaryValue}>Rs. {OPEN_PARCEL_FEE}</Text>
            </View>
          )}
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotal}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatPrice(total)}</Text>
          </View>
          {paymentOption === "advance" && (
            <>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={[styles.summaryLabel, { color: "#F97316", fontFamily: "Inter_600SemiBold" }]}>Advance Payment</Text>
                <Text style={[styles.summaryValue, { color: "#F97316", fontFamily: "Inter_700Bold" }]}>{formatPrice(ADVANCE_AMOUNT)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Remaining on Delivery</Text>
                <Text style={styles.summaryValue}>{formatPrice(total - ADVANCE_AMOUNT)}</Text>
              </View>
            </>
          )}
        </View>
      </View>

      <View style={styles.termsRow}>
        <Ionicons name="shield-checkmark" size={16} color={Colors.primary} />
        <Text style={styles.termsText}>
          By placing this order, you agree to AFTER PAY's Terms & Conditions and Privacy Policy.
        </Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <Pressable style={styles.backBtn} onPress={() => {
            if (step === "payment") setStep("delivery");
            else if (step === "review") setStep("payment");
            else router.back();
          }}>
            <Ionicons name="arrow-back" size={22} color={Colors.white} />
          </Pressable>
          <Text style={styles.headerTitle}>Checkout</Text>
          <View style={{ width: 36 }} />
        </View>

        {renderStepIndicator()}

        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {step === "delivery" && renderDeliveryStep()}
          {step === "payment" && renderPaymentStep()}
          {step === "review" && renderReviewStep()}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: bottomPad + 12 }]}>
          <View style={styles.footerPrice}>
            <Text style={styles.footerLabel}>Total</Text>
            <Text style={styles.footerTotal}>{formatPrice(total)}</Text>
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.nextBtn,
              pressed && styles.nextBtnPressed,
              step === "review" && styles.placeBtn,
              placing && { opacity: 0.6 },
            ]}
            onPress={() => {
              if (step === "delivery") goToPayment();
              else if (step === "payment") goToReview();
              else handlePlaceOrder();
            }}
            disabled={placing}
          >
            <Text style={styles.nextBtnText}>
              {step === "delivery" ? "Continue to Payment" : step === "payment" ? "Review Order" : placing ? (selectedPaymentMethod === "jazzcash" ? "Connecting to JazzCash..." : "Placing Order...") : (selectedPaymentMethod === "jazzcash" ? "Pay with JazzCash" : "Place Order")}
            </Text>
            {!placing && <Ionicons name={step === "review" ? "checkmark-circle" : "arrow-forward"} size={20} color={Colors.white} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.white },
  stepBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, paddingHorizontal: 24, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.borderLight, alignItems: "center", justifyContent: "center" },
  stepCircleActive: { backgroundColor: Colors.primary },
  stepNum: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.textLight },
  stepNumActive: { color: Colors.white },
  stepLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.textLight, marginLeft: 6 },
  stepLabelActive: { color: Colors.primary, fontFamily: "Inter_600SemiBold" },
  stepLine: { width: 30, height: 2, backgroundColor: Colors.borderLight, marginHorizontal: 8 },
  stepLineActive: { backgroundColor: Colors.primary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },
  savedSection: { marginBottom: 16 },
  savedTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 8 },
  savedCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight },
  savedInfo: { flex: 1, marginLeft: 10 },
  savedName: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  savedAddr: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 1 },
  savedPhone: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 1 },
  formSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 12 },
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, borderWidth: 1, borderColor: Colors.borderLight },
  inputError: { borderColor: Colors.accent },
  inputMultiline: { minHeight: 70, paddingTop: 12 },
  errorText: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.accent, marginTop: 4 },
  citySelect: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cityText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  cityPlaceholder: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textLight },
  cityDropdown: { backgroundColor: Colors.surface, borderRadius: 10, borderWidth: 1, borderColor: Colors.borderLight, marginTop: 4, overflow: "hidden" },
  citySearchInput: { paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  cityList: { maxHeight: 200 },
  cityItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  cityItemActive: { backgroundColor: Colors.primary + "10" },
  cityItemText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text },
  cityItemTextActive: { color: Colors.primary, fontFamily: "Inter_600SemiBold" },
  deliveryOptions: { marginBottom: 16 },
  deliveryCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight },
  deliveryCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  deliveryRow: { flexDirection: "row", alignItems: "center" },
  deliveryInfo: { flex: 1, marginLeft: 12 },
  deliveryLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  deliverySub: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  checkboxActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  paymentCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: Colors.borderLight },
  paymentCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  paymentIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.primary + "12", alignItems: "center", justifyContent: "center" },
  paymentIconActive: { backgroundColor: Colors.primary },
  paymentInfo: { flex: 1, marginLeft: 12 },
  paymentLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  paymentLabelActive: { color: Colors.primary },
  paymentDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  popularBadge: { backgroundColor: "#FEF3C7", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: "flex-start", marginTop: 4 },
  popularText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#D97706" },
  bnplNote: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 4 },
  bnplWhatsAppBox: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0FFF4", borderRadius: 10, padding: 14, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: "#C6F6D5" },
  bnplWhatsAppTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 2 },
  bnplWhatsAppDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 16 },
  bnplWhatsAppBtn: { flexDirection: "row", alignItems: "center", backgroundColor: "#25D366", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  bnplWhatsAppBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: "#fff" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  radioActive: { borderColor: Colors.primary },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.primary },
  voucherSection: { marginBottom: 16 },
  voucherRow: { flexDirection: "row", gap: 8 },
  voucherInput: { flex: 1, backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text, borderWidth: 1, borderColor: Colors.borderLight },
  voucherBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 20, justifyContent: "center" },
  voucherBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.white },
  reviewSection: { marginBottom: 20 },
  reviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  editLink: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  reviewItem: { flexDirection: "row", backgroundColor: Colors.surface, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: Colors.borderLight },
  reviewImg: { width: 60, height: 60, borderRadius: 8, backgroundColor: Colors.background },
  reviewItemInfo: { flex: 1, marginLeft: 10, justifyContent: "center" },
  reviewItemName: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  reviewItemVariant: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.primary, marginTop: 1 },
  reviewItemQty: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 2 },
  reviewItemPrice: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.primary, marginTop: 2 },
  reviewCard: { backgroundColor: Colors.surface, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: Colors.borderLight },
  reviewName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  reviewPriceRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  discountBadge: { backgroundColor: "#ECFDF5", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  discountBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#059669" },
  estimatedDeliveryBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#BFDBFE", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  estimatedDeliveryText: { fontSize: 13, fontFamily: "Inter_500Medium", color: "#374151" },
  estimatedDeliveryDates: { fontFamily: "Inter_700Bold", color: "#111827" },
  reviewAddr: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 3 },
  reviewAddrNote: { fontSize: 11, fontFamily: "Inter_500Medium", color: "#F97316", marginTop: 2 },
  reviewPhone: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 2 },
  bankTransferSection: { marginTop: 4, marginBottom: 10, paddingLeft: 4 },
  bankInfoCard: { borderRadius: 10, padding: 14, marginBottom: 14 },
  bankInfoText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#FFF", marginBottom: 2 },
  bankInfoNote: { fontSize: 11, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.9)", marginTop: 4, lineHeight: 16 },
  qrSection: { alignItems: "center", marginBottom: 14 },
  qrTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 10 },
  qrContainer: { width: 160, height: 160, backgroundColor: Colors.white, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.borderLight, padding: 10 },
  qrImage: { width: 140, height: 140 },
  qrSubtext: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 8 },
  paymentOptionCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.surface, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1.5, borderColor: Colors.borderLight },
  paymentOptionActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + "08" },
  paymentOptionInfo: { flex: 1 },
  paymentOptionLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.text },
  paymentOptionLabelActive: { color: Colors.primary },
  paymentOptionReason: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginTop: 3 },
  uploadBtn: { flexDirection: "row", alignItems: "center", gap: 10, borderStyle: "dashed", borderWidth: 1.5 },
  uploadBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  proofPreviewContainer: { marginTop: 10, width: "100%", height: 200, borderRadius: 10, overflow: "hidden", position: "relative" },
  proofPreview: { width: "100%", height: "100%" },
  removeProof: { position: "absolute", top: 10, right: 10, backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 12 },
  summarySection: { marginBottom: 16 },
  summaryCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: Colors.borderLight },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  summaryValue: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
  summaryDivider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 8 },
  summaryTotal: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.text },
  summaryTotalValue: { fontSize: 18, fontFamily: "Inter_800ExtraBold", color: Colors.primary },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4, marginBottom: 16 },
  termsText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary, lineHeight: 16 },
  footer: { backgroundColor: Colors.surface, borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 16, paddingTop: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  footerPrice: { minWidth: 90 },
  footerLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  footerTotal: { fontSize: 18, fontFamily: "Inter_800ExtraBold", color: Colors.text },
  nextBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14 },
  nextBtnPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  placeBtn: { backgroundColor: "#F97316" },
  nextBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  bnplSection: { marginTop: 4, marginBottom: 10 },
  bnplHeader: { borderRadius: 12, padding: 16, marginBottom: 12 },
  bnplHeaderTitle: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.white },
  bnplHeaderSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: "rgba(255,255,255,0.85)", marginTop: 2 },
  bnplFormDownload: { flexDirection: "row", alignItems: "center", backgroundColor: "#FEF3C7", borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#FDE68A" },
  bnplFormTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#92400E" },
  bnplFormDesc: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#A16207", marginTop: 2 },
  bnplDownloadBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  bnplDownloadText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.white },
  bnplDocsContainer: { backgroundColor: Colors.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.borderLight, marginBottom: 12 },
  bnplDocsTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: Colors.text, marginBottom: 12 },
  bnplDocItem: { marginBottom: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight, paddingBottom: 12 },
  bnplDocItemHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  bnplDocIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.primary + "15", alignItems: "center", justifyContent: "center" },
  bnplDocIconDone: { backgroundColor: Colors.primary },
  bnplDocLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text },
  bnplDocHint: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textLight, marginTop: 1 },
  bnplDocUploaded: { flexDirection: "row", alignItems: "center", gap: 6 },
  bnplDocRemove: { padding: 2 },
  bnplDocUploadBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: Colors.primary + "12", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: Colors.primary + "30" },
  bnplDocUploadText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.primary },
  bnplDocPreview: { width: "100%" as any, height: 120, borderRadius: 8, marginTop: 8 },
  bnplDocPreviewSmall: { width: 60, height: 60, borderRadius: 6 },
  bnplStatementRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, paddingLeft: 46 },
  bnplStatementLabel: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
});
