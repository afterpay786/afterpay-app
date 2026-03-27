import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { CartItem } from "./cart-context";
import { apiRequest } from "./query-client";

export interface DeliveryInfo {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  notes: string;
}

export type PaymentMethod = "cod" | "jazzcash" | "easypaisa" | "card" | "bank_transfer" | "bnpl";

export type OrderStatus = "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";

export type PaymentStatus = "unpaid" | "pending" | "paid" | "failed";

export type PaymentOption = "full" | "advance";

export interface BankTransferInfo {
  cnic: string;
  accountTitle: string;
  accountNumber: string;
  paymentProof?: string;
}

export interface BnplDocuments {
  cnicFront?: string;
  cnicBack?: string;
  tasdeeqApp?: string;
  bankCheque?: string;
  bankStatements?: string[];
  applicationForm?: string;
}

export interface Order {
  id: string;
  items: CartItem[];
  deliveryInfo: DeliveryInfo;
  paymentMethod: PaymentMethod;
  paymentOption: PaymentOption;
  bankTransferInfo?: BankTransferInfo;
  bnplDocuments?: BnplDocuments;
  subtotal: number;
  deliveryFee: number;
  advanceAmount: number;
  total: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  createdAt: string;
  estimatedDelivery: string;
  estimatedDeliveryEnd: string;
  openParcel: boolean;
}

interface JazzCashPaymentData {
  paymentUrl: string;
  formFields: Record<string, string>;
  txnRefNo: string;
}

export const ADVANCE_AMOUNT = 5000;

interface OrderContextValue {
  orders: Order[];
  currentDeliveryInfo: DeliveryInfo;
  setCurrentDeliveryInfo: (info: DeliveryInfo) => void;
  selectedPaymentMethod: PaymentMethod;
  setSelectedPaymentMethod: (method: PaymentMethod) => void;
  paymentOption: PaymentOption;
  setPaymentOption: (option: PaymentOption) => void;
  bankTransferInfo: BankTransferInfo;
  setBankTransferInfo: (info: BankTransferInfo) => void;
  bnplDocuments: BnplDocuments;
  setBnplDocuments: (docs: BnplDocuments) => void;
  openParcel: boolean;
  setOpenParcel: (val: boolean) => void;
  placeOrder: (items: CartItem[], subtotal: number) => Order;
  getOrder: (id: string) => Order | undefined;
  savedAddresses: DeliveryInfo[];
  saveAddress: (info: DeliveryInfo) => void;
  initiateJazzCashPayment: (orderId: string, amount: number) => Promise<JazzCashPaymentData>;
  updateOrderPaymentStatus: (orderId: string, status: PaymentStatus) => void;
  checkPaymentStatus: (orderId: string) => Promise<PaymentStatus>;
}

const OrderContext = createContext<OrderContextValue | null>(null);

const ORDERS_KEY = "@afterpay_orders";
const ADDRESSES_KEY = "@afterpay_addresses";
const DELIVERY_FEE = 149;
const OPEN_PARCEL_FEE = 300;

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

export { CITIES, DELIVERY_FEE, OPEN_PARCEL_FEE };

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string; description: string }[] = [
  { id: "cod", label: "Cash on Delivery", icon: "cash-outline", description: "Pay when you receive your order" },
  { id: "jazzcash", label: "JazzCash", icon: "phone-portrait-outline", description: "Pay via JazzCash mobile wallet" },
  { id: "easypaisa", label: "EasyPaisa", icon: "wallet-outline", description: "Pay via EasyPaisa mobile wallet" },
  { id: "card", label: "Credit/Debit Card", icon: "card-outline", description: "Visa, Mastercard accepted" },
  { id: "bank_transfer", label: "Bank Transfer", icon: "business-outline", description: "Direct bank transfer" },
  { id: "bnpl", label: "Installments (BNPL)", icon: "calendar-outline", description: "Buy now, pay in easy installments" },
];

export { PAYMENT_METHODS };

function getEstimatedDeliveryRange(city: string): { start: string; end: string } {
  const now = new Date();
  const startDays = 2;
  const endDays = startDays + 1;
  const startDate = new Date(now.getTime() + startDays * 24 * 60 * 60 * 1000);
  const endDate = new Date(now.getTime() + endDays * 24 * 60 * 60 * 1000);
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  return {
    start: startDate.toLocaleDateString("en-PK", options),
    end: endDate.toLocaleDateString("en-PK", options),
  };
}

const emptyDelivery: DeliveryInfo = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  notes: "",
};

export function OrderProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [savedAddresses, setSavedAddresses] = useState<DeliveryInfo[]>([]);
  const [currentDeliveryInfo, setCurrentDeliveryInfo] = useState<DeliveryInfo>(emptyDelivery);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>("cod");
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("full");
  const [bankTransferInfo, setBankTransferInfo] = useState<BankTransferInfo>({ cnic: "", accountTitle: "", accountNumber: "" });
  const [bnplDocuments, setBnplDocuments] = useState<BnplDocuments>({});
  const [openParcel, setOpenParcel] = useState(false);

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ORDERS_KEY),
      AsyncStorage.getItem(ADDRESSES_KEY),
    ]).then(([ordersData, addressesData]) => {
      if (ordersData) {
        try { setOrders(JSON.parse(ordersData)); } catch {}
      }
      if (addressesData) {
        try { setSavedAddresses(JSON.parse(addressesData)); } catch {}
      }
    });
  }, []);

  const placeOrder = useCallback(
    (items: CartItem[], subtotal: number): Order => {
      const deliveryFee = DELIVERY_FEE + (openParcel ? OPEN_PARCEL_FEE : 0);
      const isCod = selectedPaymentMethod === "cod";
      const advanceAmt = paymentOption === "advance" ? ADVANCE_AMOUNT : 0;
      const deliveryRange = getEstimatedDeliveryRange(currentDeliveryInfo.city);
      const order: Order = {
        id: "AP-" + Crypto.randomUUID().slice(0, 8).toUpperCase(),
        items,
        deliveryInfo: currentDeliveryInfo,
        paymentMethod: selectedPaymentMethod,
        paymentOption,
        bankTransferInfo: selectedPaymentMethod === "bank_transfer" ? bankTransferInfo : undefined,
        bnplDocuments: selectedPaymentMethod === "bnpl" ? bnplDocuments : undefined,
        subtotal,
        deliveryFee,
        advanceAmount: advanceAmt,
        total: subtotal + deliveryFee,
        status: "confirmed",
        paymentStatus: isCod ? "unpaid" : "pending",
        createdAt: new Date().toISOString(),
        estimatedDelivery: deliveryRange.start,
        estimatedDeliveryEnd: deliveryRange.end,
        openParcel,
      };
      const newOrders = [order, ...orders];
      setOrders(newOrders);
      AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(newOrders));

      const orderPayload: any = {
        id: order.id,
        customerName: currentDeliveryInfo.fullName,
        customerPhone: currentDeliveryInfo.phone,
        customerEmail: currentDeliveryInfo.email,
        deliveryAddress: currentDeliveryInfo.address,
        deliveryCity: currentDeliveryInfo.city,
        deliveryNotes: currentDeliveryInfo.notes,
        paymentMethod: selectedPaymentMethod,
        paymentOption,
        bankTransferInfo: selectedPaymentMethod === "bank_transfer" ? {
          cnic: bankTransferInfo.cnic,
          accountTitle: bankTransferInfo.accountTitle,
          accountNumber: bankTransferInfo.accountNumber,
          paymentProof: bankTransferInfo.paymentProof || null,
        } : null,
        bnplDocuments: selectedPaymentMethod === "bnpl" ? bnplDocuments : null,
        subtotal,
        deliveryFee,
        total: order.total,
        status: "confirmed",
        openParcel,
        estimatedDelivery: order.estimatedDelivery,
        items: items.map(i => ({
          productId: i.product.id,
          name: i.product.name,
          price: i.product.price,
          quantity: i.quantity,
          image: i.product.images?.[0] || "",
          selectedColor: (i.product as any).selectedColor || i.product.colors?.[0]?.name || "",
          selectedStorage: (i.product as any).selectedStorage || i.product.storageOptions?.[0]?.label || "",
        })),
      };
      apiRequest("POST", "/api/orders", orderPayload)
        .then(() => console.log("Order synced to server:", order.id))
        .catch(err => console.error("Order sync error:", err));

      return order;
    },
    [currentDeliveryInfo, selectedPaymentMethod, paymentOption, bankTransferInfo, bnplDocuments, openParcel, orders]
  );

  const getOrder = useCallback(
    (id: string) => orders.find((o) => o.id === id),
    [orders]
  );

  const saveAddress = useCallback(
    (info: DeliveryInfo) => {
      const exists = savedAddresses.some(
        (a) => a.phone === info.phone && a.address === info.address
      );
      if (!exists) {
        const newAddresses = [info, ...savedAddresses].slice(0, 5);
        setSavedAddresses(newAddresses);
        AsyncStorage.setItem(ADDRESSES_KEY, JSON.stringify(newAddresses));
      }
    },
    [savedAddresses]
  );

  const initiateJazzCashPayment = useCallback(
    async (orderId: string, amount: number): Promise<JazzCashPaymentData> => {
      const order = orders.find(o => o.id === orderId);
      const res = await apiRequest("POST", "/api/jazzcash/initiate", {
        orderId,
        amount,
        customerName: order?.deliveryInfo.fullName || "",
        customerEmail: order?.deliveryInfo.email || "",
        customerPhone: order?.deliveryInfo.phone || "",
        description: `AFTER PAY Order ${orderId}`,
      });
      return res.json();
    },
    [orders]
  );

  const updateOrderPaymentStatus = useCallback(
    (orderId: string, status: PaymentStatus) => {
      const newOrders = orders.map(o =>
        o.id === orderId ? { ...o, paymentStatus: status } : o
      );
      setOrders(newOrders);
      AsyncStorage.setItem(ORDERS_KEY, JSON.stringify(newOrders));
    },
    [orders]
  );

  const checkPaymentStatus = useCallback(
    async (orderId: string): Promise<PaymentStatus> => {
      try {
        const res = await apiRequest("GET", `/api/jazzcash/status/${orderId}`);
        const data = await res.json();
        const status = data.paymentStatus as PaymentStatus;
        updateOrderPaymentStatus(orderId, status);
        return status;
      } catch {
        return "pending";
      }
    },
    [updateOrderPaymentStatus]
  );

  const value = useMemo(
    () => ({
      orders,
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
      getOrder,
      savedAddresses,
      saveAddress,
      initiateJazzCashPayment,
      updateOrderPaymentStatus,
      checkPaymentStatus,
    }),
    [orders, currentDeliveryInfo, selectedPaymentMethod, paymentOption, bankTransferInfo, bnplDocuments, openParcel, placeOrder, getOrder, savedAddresses, saveAddress, initiateJazzCashPayment, updateOrderPaymentStatus, checkPaymentStatus]
  );

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrders() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error("useOrders must be used within OrderProvider");
  return ctx;
}
