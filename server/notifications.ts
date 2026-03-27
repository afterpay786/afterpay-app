import { db } from "./db";
import { notifications, orders, customers } from "@shared/schema";
import { eq, desc, and, sql } from "drizzle-orm";

export type NotificationType =
  | "order_placed"
  | "order_processing"
  | "order_shipped"
  | "order_delivered"
  | "order_cancelled"
  | "payment_received"
  | "payment_reminder";

interface NotificationData {
  customerPhone: string;
  customerEmail?: string;
  orderId: string;
  type: NotificationType;
  title: string;
  message: string;
}

function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/[\s\-\(\)]/g, "");
  if (cleaned.startsWith("03")) {
    cleaned = "92" + cleaned.substring(1);
  }
  if (!cleaned.startsWith("+")) {
    cleaned = "+" + cleaned;
  }
  return cleaned;
}

export function generateWhatsAppLink(phone: string, message: string): string {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  const encodedMessage = encodeURIComponent(message);
  return `https://wa.me/${formattedPhone.replace("+", "")}?text=${encodedMessage}`;
}

function formatItemDetails(items: any[]): { summary: string; whatsappSummary: string } {
  if (!items || items.length === 0) return { summary: "", whatsappSummary: "" };
  const lines: string[] = [];
  const waLines: string[] = [];
  items.forEach((item: any, i: number) => {
    const name = item.name || "Phone";
    const color = item.selectedColor || "";
    const storage = item.selectedStorage || "";
    const qty = item.quantity || 1;
    const parts = [name];
    if (color) parts.push(color);
    if (storage) parts.push(storage);
    const detail = parts.join(" | ");
    lines.push(`${detail}${qty > 1 ? ` x${qty}` : ""}`);
    waLines.push(`📱 *${name}*${color ? `\n   🎨 Color: ${color}` : ""}${storage ? `\n   💾 Variant: ${storage}` : ""}${qty > 1 ? `\n   📦 Qty: ${qty}` : ""}`);
  });
  return {
    summary: lines.join(", "),
    whatsappSummary: waLines.join("\n"),
  };
}

function getOrderNotificationMessage(type: NotificationType, orderId: string, extra?: Record<string, any>): { title: string; message: string; whatsappMsg: string } {
  const shortId = orderId.substring(0, 12);
  const { summary: itemSummary, whatsappSummary: waItemSummary } = formatItemDetails(extra?.items || []);

  switch (type) {
    case "order_placed":
      return {
        title: "Order Confirmed! ✅",
        message: `Your order ${shortId} has been placed successfully.${itemSummary ? ` Items: ${itemSummary}.` : ""} We're preparing it for shipment. Thank you for shopping with AFTER PAY!`,
        whatsappMsg: `🛒 *AFTER PAY - Order Confirmed!*\n\nDear Customer,\n\nYour order *${shortId}* has been placed successfully!\n\n📦 Status: Confirmed\n💰 Total: Rs ${extra?.total?.toLocaleString() || "N/A"}\n🚚 Estimated Delivery: ${extra?.estimatedDelivery || "2-3 working days"}\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\nThank you for choosing AFTER PAY! We'll keep you updated on your order status.\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
    case "order_processing":
      return {
        title: "Order Being Processed 📦",
        message: `Your order ${shortId} is now being processed.${itemSummary ? ` Items: ${itemSummary}.` : ""} It will be shipped soon.`,
        whatsappMsg: `📦 *AFTER PAY - Order Update*\n\nDear Customer,\n\nYour order *${shortId}* is now being *processed*!\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\nOur team is preparing your package. It will be shipped soon.\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
    case "order_shipped":
      return {
        title: "Order Dispatched! 🚚",
        message: `Great news! Your order ${shortId} has been dispatched.${itemSummary ? ` Items: ${itemSummary}.` : ""} It's on its way to you.`,
        whatsappMsg: `🚚 *AFTER PAY - Order Dispatched!*\n\nDear Customer,\n\nYour order *${shortId}* has been *shipped* and is on its way!\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\n📍 Delivery Address: ${extra?.address || "Your registered address"}\n📅 Expected: ${extra?.estimatedDelivery || "2-3 working days"}\n\nPlease keep your phone available for the delivery person.\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
    case "order_delivered":
      return {
        title: "Order Delivered! 🎉",
        message: `Your order ${shortId} has been delivered successfully.${itemSummary ? ` Items: ${itemSummary}.` : ""} Enjoy your new phone!`,
        whatsappMsg: `🎉 *AFTER PAY - Order Delivered!*\n\nDear Customer,\n\nYour order *${shortId}* has been *delivered* successfully!\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\nWe hope you love your purchase. If you have any questions, don't hesitate to reach out.\n\n⭐ Please rate your experience!\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
    case "order_cancelled":
      return {
        title: "Order Cancelled ❌",
        message: `Your order ${shortId} has been cancelled.${itemSummary ? ` Items: ${itemSummary}.` : ""} If you didn't request this, please contact support.`,
        whatsappMsg: `❌ *AFTER PAY - Order Cancelled*\n\nDear Customer,\n\nYour order *${shortId}* has been *cancelled*.\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\nIf this was not requested by you, please contact our support team immediately.\n\n📞 WhatsApp: +92 300 1234567\n📧 Email: afterpay786@gmail.com\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
    case "payment_received": {
      const isAdvance = extra?.paymentOption === "advance";
      const advanceAmt = 5000;
      const totalAmt = extra?.total || 0;
      const remainingAmt = totalAmt - advanceAmt;

      if (isAdvance) {
        return {
          title: "Advance Payment Received! 💰",
          message: `Your advance payment of Rs ${advanceAmt.toLocaleString()} for order ${shortId} has been received & verified.${itemSummary ? ` Items: ${itemSummary}.` : ""} Remaining Rs ${remainingAmt.toLocaleString()} to be paid on delivery (COD).`,
          whatsappMsg: `💰 *AFTER PAY - Advance Payment Confirmed!*\n\nDear Customer,\n\nYour *advance payment* for order *${shortId}* has been *received and verified* by our team.\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\n✅ Payment Status: Advance Received\n💵 Advance Paid: Rs ${advanceAmt.toLocaleString()}\n💰 Remaining (COD): Rs ${remainingAmt.toLocaleString()}\n🧾 Order Total: Rs ${totalAmt.toLocaleString()}\n\nYour order will be processed and shipped shortly. Please pay the remaining amount on delivery.\n\nThank you for your payment!\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
        };
      }

      return {
        title: "Payment Received! 💰",
        message: `Your full payment of Rs ${totalAmt.toLocaleString()} for order ${shortId} has been received & verified.${itemSummary ? ` Items: ${itemSummary}.` : ""} Thank you!`,
        whatsappMsg: `💰 *AFTER PAY - Payment Confirmed!*\n\nDear Customer,\n\nYour payment for order *${shortId}* has been *received and verified* by our team.\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\n✅ Payment Status: Paid\n💵 Amount: Rs ${totalAmt.toLocaleString()}\n\nYour order will be processed and shipped shortly.\n\nThank you for your payment!\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
    }
    case "payment_reminder":
      return {
        title: "Payment Reminder ⏰",
        message: `Reminder: Please complete your payment for order ${shortId} to avoid cancellation.${itemSummary ? ` Items: ${itemSummary}.` : ""}`,
        whatsappMsg: `⏰ *AFTER PAY - Payment Reminder*\n\nDear Customer,\n\nThis is a friendly reminder to complete your payment for order *${shortId}*.\n\n🛍️ *Order Items:*\n${waItemSummary || "N/A"}\n\nPlease make the payment within 4 hours to avoid order cancellation.\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
    default:
      return {
        title: "AFTER PAY Update",
        message: `Update regarding your order ${shortId}.`,
        whatsappMsg: `📱 *AFTER PAY*\n\nUpdate regarding your order *${shortId}*.\n\n_AFTER PAY - Your Trusted Mobile Store_ 🏬`,
      };
  }
}

export async function sendOrderNotification(
  type: NotificationType,
  orderId: string,
  extra?: Record<string, any>
): Promise<{ success: boolean; notificationId?: string; whatsappLink?: string }> {
  try {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) return { success: false };

    const { title, message, whatsappMsg } = getOrderNotificationMessage(type, orderId, {
      total: order.total,
      estimatedDelivery: order.estimatedDelivery,
      address: `${order.deliveryAddress}, ${order.deliveryCity}`,
      paymentOption: order.paymentOption,
      items: order.items,
      ...extra,
    });

    const [notification] = await db.insert(notifications).values({
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      orderId,
      type,
      title,
      message,
    }).returning();

    const whatsappLink = generateWhatsAppLink(order.customerPhone, whatsappMsg);

    console.log(`[Notifications] ${type} notification created for order ${orderId} | Phone: ${order.customerPhone}`);
    console.log(`[Notifications] WhatsApp: ${whatsappLink}`);

    return {
      success: true,
      notificationId: notification.id,
      whatsappLink,
    };
  } catch (error) {
    console.error("[Notifications] Error sending notification:", error);
    return { success: false };
  }
}

// ── Admin Order Alert: email + WhatsApp on every new order ───────────────────
const ADMIN_ALERT_EMAIL = "afterpay786@gmail.com";
const GMAIL_SENDER = "afterpay786@gmail.com";

function buildAdminOrderEmailHtml(order: any): string {
  const items = Array.isArray(order.items) ? order.items : [];
  const pkTime = new Date().toLocaleString("en-PK", {
    timeZone: "Asia/Karachi",
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });

  const rowStyle = 'padding:8px 12px;border:1px solid #e5e7eb;';
  const labelStyle = `${rowStyle}color:#6B7280;font-size:13px;white-space:nowrap;`;
  const valueStyle = `${rowStyle}font-size:13px;color:#111827;`;

  const itemRows = items.map((item: any) => `
    <tr>
      <td style="${rowStyle}font-size:13px;">${item.name || "Phone"}</td>
      <td style="${rowStyle}font-size:13px;text-align:center;">${item.selectedColor || "—"}</td>
      <td style="${rowStyle}font-size:13px;text-align:center;">${item.selectedStorage || "—"}</td>
      <td style="${rowStyle}font-size:13px;text-align:center;">${item.quantity || 1}</td>
      <td style="${rowStyle}font-size:13px;text-align:right;font-weight:600;">Rs ${(item.price || 0).toLocaleString()}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:#4EA97A;padding:28px 24px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:-0.3px;">🛒 New Order Received</h1>
    <p style="color:#d0f0e2;margin:6px 0 0;font-size:13px;">AFTER PAY · Admin Notification · ${pkTime} PKT</p>
  </td></tr>

  <tr><td style="padding:24px 24px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr style="background:#f9fafb;"><td colspan="2" style="padding:10px 12px;font-weight:700;font-size:13px;color:#4EA97A;border-bottom:1px solid #e5e7eb;">Order Summary</td></tr>
      <tr><td style="${labelStyle}">Order ID</td><td style="${valueStyle}font-family:monospace;font-weight:600;">${order.id}</td></tr>
      <tr style="background:#f9fafb;"><td style="${labelStyle}">Payment Method</td><td style="${valueStyle}">${order.paymentMethod || "N/A"}</td></tr>
      <tr><td style="${labelStyle}">Subtotal</td><td style="${valueStyle}">Rs ${(order.subtotal || 0).toLocaleString()}</td></tr>
      <tr style="background:#f9fafb;"><td style="${labelStyle}">Delivery Fee</td><td style="${valueStyle}">Rs ${(order.deliveryFee || 0).toLocaleString()}</td></tr>
      <tr><td style="${labelStyle}">Total</td><td style="padding:8px 12px;border:1px solid #e5e7eb;font-size:20px;font-weight:700;color:#4EA97A;">Rs ${(order.total || 0).toLocaleString()}</td></tr>
      ${order.openParcel ? `<tr style="background:#fef9c3;"><td style="${labelStyle}">Open Parcel</td><td style="${valueStyle}font-weight:600;color:#D97706;">✅ Requested</td></tr>` : ""}
      ${order.estimatedDelivery ? `<tr style="background:#f9fafb;"><td style="${labelStyle}">Est. Delivery</td><td style="${valueStyle}">${order.estimatedDelivery}</td></tr>` : ""}
    </table>
  </td></tr>

  <tr><td style="padding:0 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr style="background:#EFF6FF;"><td colspan="2" style="padding:10px 12px;font-weight:700;font-size:13px;color:#2563EB;border-bottom:1px solid #e5e7eb;">Customer Details</td></tr>
      <tr><td style="${labelStyle}">Name</td><td style="${valueStyle}font-weight:600;">${order.customerName || "N/A"}</td></tr>
      <tr style="background:#f9fafb;"><td style="${labelStyle}">Phone</td><td style="${valueStyle}">${order.customerPhone || "N/A"}</td></tr>
      ${order.customerEmail ? `<tr><td style="${labelStyle}">Email</td><td style="${valueStyle}">${order.customerEmail}</td></tr>` : ""}
      <tr ${order.customerEmail ? 'style="background:#f9fafb;"' : ""}><td style="${labelStyle}">City</td><td style="${valueStyle}">${order.deliveryCity || "N/A"}</td></tr>
      <tr ${order.customerEmail ? "" : 'style="background:#f9fafb;"'}><td style="${labelStyle}">Address</td><td style="${valueStyle}">${order.deliveryAddress || "N/A"}</td></tr>
      ${order.deliveryNotes ? `<tr style="background:#fef9c3;"><td style="${labelStyle}">Delivery Notes</td><td style="${valueStyle}color:#D97706;">${order.deliveryNotes}</td></tr>` : ""}
    </table>
  </td></tr>

  ${items.length > 0 ? `<tr><td style="padding:0 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:16px;">
      <tr style="background:#F5F3FF;"><td colspan="5" style="padding:10px 12px;font-weight:700;font-size:13px;color:#7C3AED;border-bottom:1px solid #e5e7eb;">Order Items</td></tr>
      <tr style="background:#f9fafb;">
        <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;font-size:12px;color:#6B7280;">Product</th>
        <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6B7280;">Color</th>
        <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6B7280;">Variant</th>
        <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:center;font-size:12px;color:#6B7280;">Qty</th>
        <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:right;font-size:12px;color:#6B7280;">Price</th>
      </tr>
      ${itemRows}
    </table>
  </td></tr>` : ""}

  ${order.bankTransferInfo ? `<tr><td style="padding:0 24px;">
    <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;font-weight:700;color:#D97706;font-size:14px;">⚠️ Bank Transfer Pending Verification</p>
      <p style="margin:6px 0 0;font-size:12px;color:#92400E;">This customer selected bank transfer. Please verify the payment before processing.</p>
    </div>
  </td></tr>` : ""}

  ${order.bnplDocuments ? `<tr><td style="padding:0 24px;">
    <div style="background:#F5F3FF;border:1px solid #C4B5FD;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0;font-weight:700;color:#7C3AED;font-size:14px;">📋 BNPL Application Documents Submitted</p>
      <p style="margin:6px 0 0;font-size:12px;color:#5B21B6;">Review documents in the admin panel before approving the installment plan.</p>
    </div>
  </td></tr>` : ""}

  <tr><td style="padding:16px 24px 28px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#9CA3AF;">Log in to your AFTER PAY admin panel to view and manage this order.</p>
    <p style="margin:12px 0 0;font-size:12px;font-weight:700;color:#4EA97A;">AFTER PAY — Your Trusted Mobile Store 🏬</p>
  </td></tr>
</table>
</body></html>`;
}

export async function sendAdminOrderAlert(order: any): Promise<void> {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  const shortId = (order.id || "").substring(0, 12);

  if (!appPassword) {
    console.log("[AdminAlert] GMAIL_APP_PASSWORD not set — email notification skipped");
    return;
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.default.createTransport({
      service: "gmail",
      auth: { user: GMAIL_SENDER, pass: appPassword },
    });
    await transporter.sendMail({
      from: `"AFTER PAY Orders" <${GMAIL_SENDER}>`,
      to: ADMIN_ALERT_EMAIL,
      subject: `🛒 New Order #${shortId} | Rs ${(order.total || 0).toLocaleString()} | ${order.customerName || "Customer"}`,
      html: buildAdminOrderEmailHtml(order),
    });
    console.log(`[AdminAlert] ✉️ Email sent to ${ADMIN_ALERT_EMAIL} for order ${order.id}`);
  } catch (err: any) {
    console.error(`[AdminAlert] Email failed: ${err.message}`);
  }
}

export async function getCustomerNotifications(phone: string): Promise<any[]> {
  try {
    const cleanPhone = phone.replace(/[\s\-]/g, "");
    const result = await db.select().from(notifications)
      .where(sql`REPLACE(REPLACE(${notifications.customerPhone}, ' ', ''), '-', '') = ${cleanPhone}`)
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return result;
  } catch (error) {
    console.error("[Notifications] Error fetching notifications:", error);
    return [];
  }
}

export async function markNotificationsRead(phone: string): Promise<void> {
  try {
    const cleanPhone = phone.replace(/[\s\-]/g, "");
    await db.update(notifications)
      .set({ read: true })
      .where(sql`REPLACE(REPLACE(${notifications.customerPhone}, ' ', ''), '-', '') = ${cleanPhone}`);
  } catch (error) {
    console.error("[Notifications] Error marking notifications read:", error);
  }
}

export async function getUnreadCount(phone: string): Promise<number> {
  try {
    const cleanPhone = phone.replace(/[\s\-]/g, "");
    const [result] = await db.select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(
        sql`REPLACE(REPLACE(${notifications.customerPhone}, ' ', ''), '-', '') = ${cleanPhone}`,
        eq(notifications.read, false)
      ));
    return Number(result.count);
  } catch (error) {
    return 0;
  }
}
