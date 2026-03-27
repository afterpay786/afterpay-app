import * as nodemailer from "nodemailer";
import { db } from "./db";
import { orders, customers, scrapedProducts } from "@shared/schema";
import { sql } from "drizzle-orm";

const BACKUP_EMAIL = "afterpay786@gmail.com";

function getTransporter() {
  const appPassword = process.env.GMAIL_APP_PASSWORD;
  if (!appPassword) {
    console.log("[Backup] GMAIL_APP_PASSWORD not set - email backup disabled");
    return null;
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: BACKUP_EMAIL,
      pass: appPassword,
    },
  });
}

export async function exportDatabaseBackup(): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> {
  try {
    console.log("[Backup] Starting database export...");

    const [allOrders, allCustomers, productCount] = await Promise.all([
      db.select().from(orders),
      db.select({
        id: customers.id,
        fullName: customers.fullName,
        email: customers.email,
        phone: customers.phone,
        city: customers.city,
        createdAt: customers.createdAt,
      }).from(customers),
      db.select({ count: sql<number>`count(*)` }).from(scrapedProducts),
    ]);

    const allProducts = await db.select({
      id: scrapedProducts.id,
      name: scrapedProducts.name,
      brand: scrapedProducts.brand,
      price: scrapedProducts.price,
      originalPrice: scrapedProducts.originalPrice,
      discount: scrapedProducts.discount,
      inStock: scrapedProducts.inStock,
      priceoye_url: scrapedProducts.priceoye_url,
      lastScrapedAt: scrapedProducts.lastScrapedAt,
    }).from(scrapedProducts);

    const backupData = {
      exportedAt: new Date().toISOString(),
      appName: "AFTER PAY",
      summary: {
        totalOrders: allOrders.length,
        totalCustomers: allCustomers.length,
        totalProducts: Number(productCount[0]?.count || 0),
      },
      orders: allOrders.map((o) => ({
        ...o,
        bankTransferInfo: o.bankTransferInfo
          ? { ...(o.bankTransferInfo as any), paymentProof: o.bankTransferInfo && (o.bankTransferInfo as any).paymentProof ? "[IMAGE_DATA_EXCLUDED]" : undefined }
          : null,
      })),
      customers: allCustomers,
      products: allProducts,
    };

    console.log(
      `[Backup] Export complete: ${allOrders.length} orders, ${allCustomers.length} customers, ${allProducts.length} products`
    );

    return { success: true, message: "Database exported successfully", data: backupData };
  } catch (error) {
    console.error("[Backup] Export error:", error);
    return { success: false, message: `Export failed: ${error}` };
  }
}

export async function sendBackupEmail(): Promise<{ success: boolean; message: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return { success: false, message: "Gmail App Password not configured. Set GMAIL_APP_PASSWORD in secrets." };
  }

  const exportResult = await exportDatabaseBackup();
  if (!exportResult.success || !exportResult.data) {
    return { success: false, message: exportResult.message };
  }

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-");
  const fileName = `afterpay-backup-${dateStr}_${timeStr}.json`;

  const jsonContent = JSON.stringify(exportResult.data, null, 2);
  const summary = exportResult.data.summary;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #4EA97A, #3d8a63); padding: 20px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">AFTER PAY - Database Backup</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Automated backup report</p>
      </div>
      <div style="background: #f8f9fa; padding: 20px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; font-size: 18px; margin-top: 0;">Backup Summary</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Date & Time</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #333;">${now.toLocaleString("en-PK", { timeZone: "Asia/Karachi" })} PKT</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Total Orders</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #4EA97A;">${summary.totalOrders}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Total Customers</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #4EA97A;">${summary.totalCustomers}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; color: #666;">Total Products</td>
            <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-weight: bold; color: #4EA97A;">${summary.totalProducts}</td>
          </tr>
        </table>
        <p style="color: #888; font-size: 12px; margin-top: 16px;">
          The full database backup is attached as a JSON file. Keep this email safe for data recovery.
        </p>
      </div>
      <div style="background: #333; padding: 12px; border-radius: 0 0 12px 12px; text-align: center;">
        <p style="color: #999; font-size: 11px; margin: 0;">AFTER PAY - Automated Backup System</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"AFTER PAY Backup" <${BACKUP_EMAIL}>`,
      to: BACKUP_EMAIL,
      subject: `AFTER PAY Backup - ${dateStr} | ${summary.totalOrders} Orders | ${summary.totalCustomers} Customers`,
      html: htmlBody,
      attachments: [
        {
          filename: fileName,
          content: jsonContent,
          contentType: "application/json",
        },
      ],
    });

    console.log(`[Backup] Email sent to ${BACKUP_EMAIL}`);
    return { success: true, message: `Backup sent to ${BACKUP_EMAIL}` };
  } catch (error: any) {
    console.error("[Backup] Email send error:", error);
    let errorMsg = `Failed to send email: ${error.message || error}`;
    if (error.code === "EAUTH") {
      errorMsg = "Gmail authentication failed. Check GMAIL_APP_PASSWORD in secrets. You need a Gmail App Password (not regular password).";
    }
    return { success: false, message: errorMsg };
  }
}
