import crypto from "crypto";

const SANDBOX_URL = "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";
const LIVE_URL = "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/";

interface JazzCashConfig {
  merchantId: string;
  password: string;
  integritySalt: string;
  returnUrl: string;
  environment: "sandbox" | "live";
}

function getConfig(returnUrl: string): JazzCashConfig {
  const merchantId = process.env.JAZZCASH_MERCHANT_ID;
  const password = process.env.JAZZCASH_PASSWORD;
  const integritySalt = process.env.JAZZCASH_INTEGRITY_SALT;

  if (!merchantId || !password || !integritySalt) {
    throw new Error("JazzCash credentials not configured. Set JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, and JAZZCASH_INTEGRITY_SALT.");
  }

  return {
    merchantId,
    password,
    integritySalt,
    returnUrl,
    environment: (process.env.JAZZCASH_ENVIRONMENT || "live") as "sandbox" | "live",
  };
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}${s}`;
}

function generateSecureHash(integritySalt: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  const hashString = integritySalt + "&" + sortedKeys.map(k => params[k]).join("&");
  return crypto.createHmac("sha256", integritySalt).update(hashString).digest("hex");
}

export interface JazzCashPaymentRequest {
  orderId: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  description: string;
}

export interface JazzCashPaymentResponse {
  paymentUrl: string;
  formFields: Record<string, string>;
  txnRefNo: string;
}

export function createPaymentRequest(
  req: JazzCashPaymentRequest,
  baseUrl: string
): JazzCashPaymentResponse {
  const config = getConfig(`${baseUrl}/api/jazzcash/callback`);
  const now = new Date();
  const expiry = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const txnDateTime = formatDate(now);
  const txnExpiryDateTime = formatDate(expiry);
  const txnRefNo = "T" + txnDateTime + Math.floor(Math.random() * 1000);
  const amountInPaisa = String(req.amount * 100);

  const params: Record<string, string> = {
    pp_Amount: amountInPaisa,
    pp_BankID: "TBANK",
    pp_BillReference: req.orderId,
    pp_Description: req.description,
    pp_Language: "EN",
    pp_MerchantID: config.merchantId,
    pp_Password: config.password,
    pp_ProductID: "RETL",
    pp_ReturnURL: config.returnUrl,
    pp_SubMerchantID: "",
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: txnDateTime,
    pp_TxnExpiryDateTime: txnExpiryDateTime,
    pp_TxnRefNo: txnRefNo,
    pp_TxnType: "MWALLET",
    pp_Version: "1.1",
    ppmpf_1: req.customerPhone,
    ppmpf_2: req.customerEmail,
    ppmpf_3: req.customerName,
    ppmpf_4: req.orderId,
    ppmpf_5: "",
  };

  const secureHash = generateSecureHash(config.integritySalt, params);
  params.pp_SecureHash = secureHash;

  const paymentUrl = config.environment === "sandbox" ? SANDBOX_URL : LIVE_URL;

  return {
    paymentUrl,
    formFields: params,
    txnRefNo,
  };
}

export function verifyCallback(params: Record<string, string>): {
  isValid: boolean;
  isSuccess: boolean;
  responseCode: string;
  responseMessage: string;
  txnRefNo: string;
  billReference: string;
  rrn: string;
  amount: number;
} {
  const config = getConfig("");
  const receivedHash = params.pp_SecureHash || "";

  const verifyParams: Record<string, string> = {};
  for (const key of Object.keys(params).sort()) {
    if (key !== "pp_SecureHash" && params[key] !== "") {
      verifyParams[key] = params[key];
    }
  }

  const computedHash = generateSecureHash(config.integritySalt, verifyParams);
  const isValid = computedHash.toLowerCase() === receivedHash.toLowerCase();

  const responseCode = params.pp_ResponseCode || "";
  const isSuccess = responseCode === "000";

  return {
    isValid,
    isSuccess,
    responseCode,
    responseMessage: params.pp_ResponseMessage || "",
    txnRefNo: params.pp_TxnRefNo || "",
    billReference: params.pp_BillReference || "",
    rrn: params.pp_RetreivalReferenceNo || "",
    amount: parseInt(params.pp_Amount || "0") / 100,
  };
}
