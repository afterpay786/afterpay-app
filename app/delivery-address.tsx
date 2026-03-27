import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Colors from "@/constants/colors";

const CITIES = [
  "Abbottabad", "Adezai", "Ahmedpur East", "Aliabad (Hunza)", "Arif Wala", "Attock",
  "Bahawalnagar", "Bahawalpur", "Bannu", "Battagram", "Bhakkar", "Bhalwal", "Bhimbar", "Buner",
  "Chaman", "Chakwal", "Charsadda", "Chilas", "Chiniot", "Chitral",
  "Dadu", "Dera Ghazi Khan", "Dera Ismail Khan", "Digri", "Dir",
  "Faisalabad", "Fateh Jang",
  "Ghotki", "Gilgit", "Gojra", "Gujar Khan", "Gujranwala", "Gujrat",
  "Hafizabad", "Haripur", "Hassan Abdal", "Hub", "Hyderabad",
  "Islamabad",
  "Jacobabad", "Jhang", "Jhelum",
  "Kamalia", "Karachi", "Kasur", "Khairpur", "Khanewal", "Khanpur", "Kharian", "Khuzdar", "Kohat", "Kotri",
  "Lahore", "Lakki Marwat", "Larkana", "Layyah", "Lodhran", "Loralai",
  "Malakand", "Mandi Bahauddin", "Mansehra", "Mardan", "Mastung", "Mianwali", "Mingora", "Mirpur", "Mirpur Khas", "Multan", "Muzaffarabad", "Muzaffargarh",
  "Narowal", "Naushahro Feroze", "Nawabshah", "Nowshera",
  "Okara",
  "Pakpattan", "Peshawar",
  "Quetta",
  "Rahim Yar Khan", "Rajanpur", "Rawalpindi",
  "Sahiwal", "Sanghar", "Sargodha", "Sheikhupura", "Shikarpur", "Sialkot", "Sibi", "Sukkur", "Swabi", "Swat",
  "Tando Adam", "Tando Allahyar", "Tank", "Taxila", "Thatta", "Toba Tek Singh", "Turbat",
  "Umerkot",
  "Wah Cantt", "Wazirabad",
  "Zhob",
];

const STORAGE_KEY = "afterpay_addresses";

interface Address {
  id: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  isDefault: boolean;
}

export default function DeliveryAddressScreen() {
  const insets = useSafeAreaInsets();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const topPad = Math.max(insets.top, webTopInset);
  const webBottomInset = Platform.OS === "web" ? 34 : 0;
  const bottomPad = Math.max(insets.bottom, webBottomInset);
  const router = useRouter();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [showCities, setShowCities] = useState(false);

  const loadAddresses = useCallback(async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) setAddresses(JSON.parse(stored));
  }, []);

  useEffect(() => {
    loadAddresses();
  }, [loadAddresses]);

  const saveAddresses = async (newAddresses: Address[]) => {
    setAddresses(newAddresses);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(newAddresses));
  };

  const resetForm = () => {
    setFullName("");
    setPhone("");
    setAddressLine("");
    setCity("");
    setIsDefault(false);
    setEditingId(null);
    setShowCities(false);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (addr: Address) => {
    setEditingId(addr.id);
    setFullName(addr.fullName);
    setPhone(addr.phone);
    setAddressLine(addr.address);
    setCity(addr.city);
    setIsDefault(addr.isDefault);
    setShowCities(false);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!fullName.trim() || !phone.trim() || !addressLine.trim() || !city) return;

    let updated: Address[];
    if (editingId) {
      updated = addresses.map((a) =>
        a.id === editingId
          ? { ...a, fullName, phone, address: addressLine, city, isDefault }
          : isDefault
          ? { ...a, isDefault: false }
          : a
      );
    } else {
      const newAddr: Address = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        fullName,
        phone,
        address: addressLine,
        city,
        isDefault,
      };
      updated = isDefault
        ? [...addresses.map((a) => ({ ...a, isDefault: false })), newAddr]
        : [...addresses, newAddr];
    }

    await saveAddresses(updated);
    setModalVisible(false);
    resetForm();
  };

  const handleDelete = (id: string) => {
    Alert.alert("Delete Address", "Are you sure you want to delete this address?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const updated = addresses.filter((a) => a.id !== id);
          await saveAddresses(updated);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Delivery Address</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 20 }]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
          onPress={openAddModal}
        >
          <Ionicons name="add-circle" size={22} color={Colors.white} />
          <Text style={styles.addBtnText}>Add New Address</Text>
        </Pressable>

        {addresses.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="location-outline" size={64} color={Colors.textLight} />
            <Text style={styles.emptyTitle}>No addresses saved yet</Text>
            <Text style={styles.emptyDesc}>Add a delivery address to get started</Text>
          </View>
        ) : (
          addresses.map((addr) => (
            <View key={addr.id} style={styles.addressCard}>
              <View style={styles.addressTop}>
                <View style={styles.addressIcon}>
                  <Ionicons name="location" size={20} color={Colors.primary} />
                </View>
                <View style={styles.addressInfo}>
                  <View style={styles.addressNameRow}>
                    <Text style={styles.addressName}>{addr.fullName}</Text>
                    {addr.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.addressPhone}>{addr.phone}</Text>
                  <Text style={styles.addressText}>{addr.address}</Text>
                  <Text style={styles.addressCity}>{addr.city}</Text>
                </View>
              </View>
              <View style={styles.addressActions}>
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => openEditModal(addr)}
                >
                  <Ionicons name="create-outline" size={18} color={Colors.primary} />
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => handleDelete(addr.id)}
                >
                  <Ionicons name="trash-outline" size={18} color={Colors.accent} />
                  <Text style={[styles.actionText, { color: Colors.accent }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? "Edit Address" : "Add New Address"}
              </Text>
              <Pressable onPress={() => { setModalVisible(false); resetForm(); }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Muhammad Ali"
                  placeholderTextColor={Colors.textLight}
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="03XX XXXXXXX"
                  placeholderTextColor={Colors.textLight}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Address Line</Text>
                <TextInput
                  style={[styles.input, { height: 80, textAlignVertical: "top" }]}
                  placeholder="House/Flat No., Street, Area"
                  placeholderTextColor={Colors.textLight}
                  multiline
                  value={addressLine}
                  onChangeText={setAddressLine}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>City</Text>
                <Pressable
                  style={[styles.input, styles.citySelect]}
                  onPress={() => setShowCities(!showCities)}
                >
                  <Text style={city ? styles.cityText : styles.cityPlaceholder}>
                    {city || "Select your city"}
                  </Text>
                  <Ionicons
                    name={showCities ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={Colors.textLight}
                  />
                </Pressable>
                {showCities && (
                  <View style={styles.cityDropdown}>
                    {CITIES.map((c) => (
                      <Pressable
                        key={c}
                        style={[styles.cityItem, city === c && styles.cityItemActive]}
                        onPress={() => {
                          setCity(c);
                          setShowCities(false);
                        }}
                      >
                        <Text style={[styles.cityItemText, city === c && styles.cityItemTextActive]}>
                          {c}
                        </Text>
                        {city === c && <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              <Pressable
                style={styles.defaultToggle}
                onPress={() => setIsDefault(!isDefault)}
              >
                <Text style={styles.defaultToggleLabel}>Set as default address</Text>
                <View style={[styles.toggle, isDefault && styles.toggleActive]}>
                  <View style={[styles.toggleThumb, isDefault && styles.toggleThumbActive]} />
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.9 }]}
                onPress={handleSave}
              >
                <Text style={styles.saveBtnText}>{editingId ? "Update Address" : "Save Address"}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  addBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
    marginBottom: 16,
  },
  addBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: Colors.text, marginTop: 8 },
  emptyDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary, textAlign: "center" },
  addressCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressTop: { flexDirection: "row", marginBottom: 12 },
  addressIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.primary + "12",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  addressInfo: { flex: 1 },
  addressNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  addressName: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  defaultBadge: {
    backgroundColor: Colors.primary + "15",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  defaultBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: Colors.primary, letterSpacing: 0.5 },
  addressPhone: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textSecondary, marginBottom: 4 },
  addressText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.text, marginBottom: 2 },
  addressCity: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  addressActions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingTop: 12,
    gap: 16,
  },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "90%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text, marginBottom: 6 },
  input: {
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
  citySelect: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cityText: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.text },
  cityPlaceholder: { fontSize: 15, fontFamily: "Inter_400Regular", color: Colors.textLight },
  cityDropdown: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginTop: 6,
    maxHeight: 200,
  },
  cityItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  cityItemActive: { backgroundColor: Colors.primary + "10" },
  cityItemText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.text },
  cityItemTextActive: { fontFamily: "Inter_600SemiBold", color: Colors.primary },
  defaultToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingVertical: 8,
  },
  defaultToggleLabel: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.borderLight,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleActive: { backgroundColor: Colors.primary },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
  },
  toggleThumbActive: { alignSelf: "flex-end" },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 20,
  },
  saveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.white },
});
