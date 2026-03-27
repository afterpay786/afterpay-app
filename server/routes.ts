import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { db } from "./db";
import { orders, scrapedProducts, scrapeLog, customers } from "@shared/schema";
import * as crypto from "crypto";
import { eq, desc, sql, ilike, or, and } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { createPaymentRequest, verifyCallback } from "./jazzcash";
import { startScrape, getScrapeStatus, isScraping, previewCustomSearch, scrapeCustomQuery, extractSearchKeywords } from "./scraper";
import { sendBackupEmail, exportDatabaseBackup } from "./backup";
import { getScheduleInfo } from "./scheduler";
import { runHealthAudit, getLastAuditResult, isAuditRunning } from "./health-audit";
import { runScraperAudit, getLastScraperAudit, isScraperAuditRunning } from "./scraper-audit";
import { sendOrderNotification, sendAdminOrderAlert, getCustomerNotifications, markNotificationsRead, getUnreadCount, generateWhatsAppLink } from "./notifications";
import { notifications } from "@shared/schema";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "afterpay2026";
const ADMIN_WHATSAPP = "03261605570";
const otpStore: Map<string, { code: string; expiresAt: number }> = new Map();
const activeAdminSessions: Map<string, { createdAt: number; expiresAt: number }> = new Map();
const SESSION_DURATION = 24 * 60 * 60 * 1000;

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateSecureToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function cleanExpiredOTPs() {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (val.expiresAt < now) otpStore.delete(key);
  }
  for (const [key, val] of activeAdminSessions.entries()) {
    if (val.expiresAt < now) activeAdminSessions.delete(key);
  }
}

function requireAdminMiddleware(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = auth.slice(7);
  const session = activeAdminSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: "Session invalid or expired. Please login again." });
  }
  if (session.expiresAt < Date.now()) {
    activeAdminSessions.delete(token);
    return res.status(401).json({ error: "Session expired. Please login again." });
  }
  return next();
}

export async function registerRoutes(app: Express): Promise<Server> {

  app.get("/api/products", async (req: Request, res: Response) => {
    try {
      const { brand, search, minPrice, maxPrice, sort, page = "1", limit = "500" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(500, Math.max(1, parseInt(limit as string)));
      const offset = (pageNum - 1) * limitNum;

      let conditions: any[] = [eq(scrapedProducts.inStock, true)];

      if (brand) {
        conditions.push(ilike(scrapedProducts.brand, brand as string));
      }
      if (search) {
        const s = `%${search}%`;
        conditions.push(
          or(
            ilike(scrapedProducts.name, s),
            ilike(scrapedProducts.brand, s)
          )
        );
      }
      if (minPrice) {
        conditions.push(sql`${scrapedProducts.price} >= ${parseInt(minPrice as string)}`);
      }
      if (maxPrice) {
        conditions.push(sql`${scrapedProducts.price} <= ${parseInt(maxPrice as string)}`);
      }

      const whereClause = conditions.reduce((acc, cond) => acc ? and(acc, cond) : cond);

      let orderBy: any = desc(scrapedProducts.createdAt);
      if (sort === "price_asc") orderBy = sql`${scrapedProducts.price} ASC`;
      if (sort === "price_desc") orderBy = sql`${scrapedProducts.price} DESC`;
      if (sort === "rating") orderBy = sql`${scrapedProducts.rating} DESC`;
      if (sort === "newest") orderBy = desc(scrapedProducts.createdAt);

      const [products, countResult] = await Promise.all([
        db.select().from(scrapedProducts).where(whereClause).orderBy(orderBy).limit(limitNum).offset(offset),
        db.select({ count: sql<number>`count(*)` }).from(scrapedProducts).where(whereClause),
      ]);

      res.json({
        products,
        total: Number(countResult[0].count),
        page: pageNum,
        totalPages: Math.ceil(Number(countResult[0].count) / limitNum),
      });
    } catch (err) {
      console.error("Error fetching products:", err);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.get("/api/products/new-arrivals", async (_req: Request, res: Response) => {
    try {
      const products = await db.select().from(scrapedProducts)
        .where(and(eq(scrapedProducts.isNewArrival, true), eq(scrapedProducts.inStock, true)))
        .orderBy(desc(scrapedProducts.createdAt))
        .limit(20);
      res.json(products);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch new arrivals" });
    }
  });

  app.get("/api/products/:id", async (req: Request, res: Response) => {
    try {
      const [product] = await db.select().from(scrapedProducts).where(eq(scrapedProducts.id, req.params.id));
      if (!product) return res.status(404).json({ error: "Product not found" });
      res.json(product);
    } catch (err) {
      console.error("Error fetching product:", err);
      res.status(500).json({ error: "Failed to fetch product" });
    }
  });

  app.get("/api/brands", async (_req: Request, res: Response) => {
    try {
      const result = await db.select({
        brand: scrapedProducts.brand,
        count: sql<number>`count(*)`,
        minPrice: sql<number>`min(${scrapedProducts.price})`,
      }).from(scrapedProducts).groupBy(scrapedProducts.brand).orderBy(sql`count(*) DESC`);

      res.json(result.map((r) => ({
        id: r.brand.toLowerCase(),
        name: r.brand,
        count: Number(r.count),
        startingPrice: r.minPrice,
        icon: "phone-portrait-outline",
      })));
    } catch (err) {
      console.error("Error fetching brands:", err);
      res.status(500).json({ error: "Failed to fetch brands" });
    }
  });

  app.post("/api/admin/scrape", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { brands } = req.body;
      const result = await startScrape(brands);
      res.json(result);
    } catch (err) {
      console.error("Error starting scrape:", err);
      res.status(500).json({ error: "Failed to start scrape" });
    }
  });

  app.get("/api/admin/scrape/status", requireAdminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const status = await getScrapeStatus();
      res.json({ isRunning: isScraping(), log: status });
    } catch (err) {
      res.status(500).json({ error: "Failed to get scrape status" });
    }
  });

  // AI keyword extraction: parse natural language into clean search keyword
  app.post("/api/admin/scrape/extract-keywords", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return res.status(400).json({ success: false, message: "Query must be at least 2 characters" });
      }
      const result = extractSearchKeywords(query.trim());
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Extraction failed" });
    }
  });

  // Custom scrape: search Priceoye for a model name and return listing preview (no DB changes)
  app.post("/api/admin/scrape/search-preview", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return res.status(400).json({ success: false, message: "Query must be at least 2 characters" });
      }
      const result = await previewCustomSearch(query.trim());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Preview failed" });
    }
  });

  // Custom scrape: search Priceoye, fetch detail pages, and save to DB
  app.post("/api/admin/scrape/custom", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { query, maxResults } = req.body;
      if (!query || typeof query !== "string" || query.trim().length < 2) {
        return res.status(400).json({ success: false, message: "Query must be at least 2 characters" });
      }
      const max = typeof maxResults === "number" && maxResults > 0 && maxResults <= 20 ? maxResults : 10;
      const result = await scrapeCustomQuery(query.trim(), max);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err?.message || "Custom scrape failed" });
    }
  });

  app.post("/api/admin/backup", requireAdminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const result = await sendBackupEmail();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: `Backup error: ${err.message}` });
    }
  });

  app.get("/api/admin/backup/download", requireAdminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const result = await exportDatabaseBackup();
      if (!result.success) {
        return res.status(500).json({ error: result.message });
      }
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=afterpay-backup-${new Date().toISOString().split("T")[0]}.json`);
      res.json(result.data);
    } catch (err) {
      res.status(500).json({ error: "Failed to export backup" });
    }
  });

  app.get("/api/admin/schedule", requireAdminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const info = getScheduleInfo();
      const scrapeStatus = await getScrapeStatus();
      res.json({ ...info, lastScrape: scrapeStatus });
    } catch (err) {
      res.status(500).json({ error: "Failed to get schedule info" });
    }
  });

  app.post("/api/orders", async (req: Request, res: Response) => {
    try {
      const {
        id, customerName, customerPhone, customerEmail,
        deliveryAddress, deliveryCity, deliveryNotes,
        paymentMethod, subtotal, deliveryFee, total,
        status, openParcel, estimatedDelivery, items,
        paymentOption, bankTransferInfo, bnplDocuments
      } = req.body;

      if (!id || !customerName || !customerPhone || !deliveryAddress || !deliveryCity || !paymentMethod || !items) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const [order] = await db.insert(orders).values({
        id,
        customerName,
        customerPhone,
        customerEmail: customerEmail || "",
        deliveryAddress,
        deliveryCity,
        deliveryNotes: deliveryNotes || "",
        paymentMethod,
        subtotal,
        deliveryFee,
        total,
        status: status || "confirmed",
        openParcel: openParcel || false,
        estimatedDelivery: estimatedDelivery || "",
        items,
        paymentOption: paymentOption || "full",
        bankTransferInfo: bankTransferInfo || null,
        bnplDocuments: bnplDocuments || null,
      }).returning();

      sendOrderNotification("order_placed", order.id, {
        total: order.total,
        estimatedDelivery: order.estimatedDelivery,
      }).catch(err => console.error("Order notification error:", err));

      // Notify admin via email + WhatsApp immediately on every new order
      sendAdminOrderAlert(order).catch(err => console.error("Admin alert error:", err));

      res.status(201).json(order);
    } catch (err: any) {
      if (err.code === "23505") {
        return res.status(200).json({ message: "Order already exists" });
      }
      console.error("Error creating order:", err);
      res.status(500).json({ error: "Failed to create order" });
    }
  });

  app.post("/api/jazzcash/initiate", async (req: Request, res: Response) => {
    try {
      const { orderId, amount, customerName, customerEmail, customerPhone, description } = req.body;
      if (!orderId || !amount) {
        return res.status(400).json({ error: "Missing orderId or amount" });
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
      const baseUrl = `${protocol}://${host}`;

      const payment = createPaymentRequest(
        { orderId, amount, customerName, customerEmail, customerPhone, description },
        baseUrl
      );

      await db.update(orders)
        .set({ jazzcashTxnRef: payment.txnRefNo, paymentStatus: "pending" })
        .where(eq(orders.id, orderId));

      res.json(payment);
    } catch (err) {
      console.error("JazzCash initiate error:", err);
      res.status(500).json({ error: "Failed to initiate payment" });
    }
  });

  app.post("/api/jazzcash/callback", async (req: Request, res: Response) => {
    try {
      console.log("JazzCash callback received:", JSON.stringify(req.body));
      const result = verifyCallback(req.body);
      const orderId = result.billReference;

      if (orderId) {
        const updateData: Record<string, string> = {
          jazzcashResponseCode: result.responseCode,
          jazzcashRrn: result.rrn,
        };

        if (result.isSuccess) {
          await db.update(orders)
            .set({ ...updateData, paymentStatus: "paid" } as any)
            .where(eq(orders.id, orderId));
        } else {
          await db.update(orders)
            .set({ ...updateData, paymentStatus: "failed" } as any)
            .where(eq(orders.id, orderId));
        }
      }

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
      const baseUrl = `${protocol}://${host}`;
      const redirectUrl = `${baseUrl}/api/jazzcash/result?orderId=${orderId}&status=${result.isSuccess ? "paid" : "failed"}&code=${result.responseCode}&message=${encodeURIComponent(result.responseMessage)}`;

      res.redirect(redirectUrl);
    } catch (err) {
      console.error("JazzCash callback error:", err);
      res.status(500).send("Payment processing error");
    }
  });

  app.get("/api/jazzcash/result", (req: Request, res: Response) => {
    const { orderId, status, code, message } = req.query;
    const isPaid = status === "paid";
    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment ${isPaid ? "Successful" : "Failed"}</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1);max-width:400px;width:90%}
.icon{font-size:64px;margin-bottom:16px}
h1{margin:0 0 8px;color:${isPaid ? "#4EA97A" : "#F43F5E"};font-size:22px}
p{color:#666;font-size:14px;line-height:1.5;margin:0 0 8px}
.order-id{font-size:18px;font-weight:700;color:${isPaid ? "#4EA97A" : "#333"};background:${isPaid ? "#4EA97A15" : "#f5f5f5"};padding:12px 24px;border-radius:10px;margin:16px 0;display:inline-block}
.msg{font-size:12px;color:#999;margin-top:8px}
.info{font-size:13px;color:#555;margin-top:12px}
</style></head>
<body><div class="card">
<div class="icon">${isPaid ? "✅" : "❌"}</div>
<h1>Payment ${isPaid ? "Successful!" : "Failed"}</h1>
<p>${isPaid ? "Your payment has been received successfully." : "Unfortunately, your payment could not be processed."}</p>
<div class="order-id">${orderId || "N/A"}</div>
${!isPaid ? `<p class="info">${decodeURIComponent(String(message || "Payment was not completed"))}</p>` : ""}
<p class="msg">You can close this page and return to the AFTER PAY app to view your order.</p>
</div></body></html>`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  });

  app.get("/api/jazzcash/pay-form/:orderId", async (req: Request, res: Response) => {
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, req.params.orderId));
      if (!order) return res.status(404).send("Order not found");

      const protocol = req.headers["x-forwarded-proto"] || "https";
      const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:5000";
      const baseUrl = `${protocol}://${host}`;

      const payment = createPaymentRequest(
        {
          orderId: order.id,
          amount: order.total,
          customerName: order.customerName,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          description: `AFTER PAY Order ${order.id}`,
        },
        baseUrl
      );

      await db.update(orders)
        .set({ jazzcashTxnRef: payment.txnRefNo, paymentStatus: "pending" })
        .where(eq(orders.id, order.id));

      const formFields = Object.entries(payment.formFields)
        .map(([k, v]) => `<input type="hidden" name="${k}" value="${v}">`)
        .join("\n");

      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Redirecting to JazzCash...</title>
<style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}
.card{text-align:center;padding:40px;background:white;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.1)}
.spinner{border:3px solid #f3f3f3;border-top:3px solid #4EA97A;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
h2{color:#333;margin:0 0 8px}p{color:#666;font-size:14px;margin:0}</style></head>
<body><div class="card">
<div class="spinner"></div>
<h2>Redirecting to JazzCash</h2>
<p>Please wait while we redirect you to the payment page...</p>
<form id="jcForm" method="POST" action="${payment.paymentUrl}">
${formFields}
</form>
<script>document.getElementById('jcForm').submit();</script>
</div></body></html>`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html);
    } catch (err) {
      console.error("JazzCash pay-form error:", err);
      res.status(500).send("Failed to create payment form");
    }
  });

  app.get("/api/jazzcash/status/:orderId", async (req: Request, res: Response) => {
    try {
      const [order] = await db.select({
        paymentStatus: orders.paymentStatus,
        jazzcashResponseCode: orders.jazzcashResponseCode,
        jazzcashRrn: orders.jazzcashRrn,
      }).from(orders).where(eq(orders.id, req.params.orderId));
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (err) {
      console.error("JazzCash status check error:", err);
      res.status(500).json({ error: "Failed to check payment status" });
    }
  });

  function hashPassword(password: string): string {
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  app.post("/api/customers/register", async (req: Request, res: Response) => {
    try {
      const { fullName, email, phone, password, city } = req.body;
      if (!fullName || !email || !phone || !password) {
        return res.status(400).json({ error: "Full name, email, phone, and password are required" });
      }
      const existing = await db.select().from(customers).where(eq(customers.email, email.toLowerCase()));
      if (existing.length > 0) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      const [customer] = await db.insert(customers).values({
        fullName,
        email: email.toLowerCase(),
        phone,
        password: hashPassword(password),
        city: city || "",
      }).returning();
      const token = Buffer.from(`customer:${customer.id}:${Date.now()}`).toString("base64");
      res.status(201).json({
        success: true,
        token,
        customer: { id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone, city: customer.city, createdAt: customer.createdAt },
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/customers/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      const [customer] = await db.select().from(customers).where(eq(customers.email, email.toLowerCase()));
      if (!customer || customer.password !== hashPassword(password)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const token = Buffer.from(`customer:${customer.id}:${Date.now()}`).toString("base64");
      res.json({
        success: true,
        token,
        customer: { id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone, city: customer.city, createdAt: customer.createdAt },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.get("/api/customers/me", async (req: Request, res: Response) => {
    try {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
      const decoded = Buffer.from(auth.slice(7), "base64").toString("utf-8");
      const parts = decoded.split(":");
      if (parts[0] !== "customer" || !parts[1]) return res.status(401).json({ error: "Unauthorized" });
      const [customer] = await db.select().from(customers).where(eq(customers.id, parts[1]));
      if (!customer) return res.status(404).json({ error: "Customer not found" });
      res.json({ id: customer.id, fullName: customer.fullName, email: customer.email, phone: customer.phone, city: customer.city, createdAt: customer.createdAt });
    } catch (err) {
      res.status(401).json({ error: "Unauthorized" });
    }
  });

  app.get("/api/admin/customers", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { search, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
      const offset = (pageNum - 1) * limitNum;

      let whereClause;
      if (search) {
        const s = `%${search}%`;
        whereClause = sql`(${customers.fullName} ILIKE ${s} OR ${customers.email} ILIKE ${s} OR ${customers.phone} ILIKE ${s})`;
      }

      const [allCustomers, countResult] = await Promise.all([
        whereClause
          ? db.select({ id: customers.id, fullName: customers.fullName, email: customers.email, phone: customers.phone, city: customers.city, createdAt: customers.createdAt }).from(customers).where(whereClause).orderBy(desc(customers.createdAt)).limit(limitNum).offset(offset)
          : db.select({ id: customers.id, fullName: customers.fullName, email: customers.email, phone: customers.phone, city: customers.city, createdAt: customers.createdAt }).from(customers).orderBy(desc(customers.createdAt)).limit(limitNum).offset(offset),
        whereClause
          ? db.select({ count: sql<number>`count(*)` }).from(customers).where(whereClause)
          : db.select({ count: sql<number>`count(*)` }).from(customers),
      ]);

      res.json({ customers: allCustomers, total: Number(countResult[0].count), page: pageNum });
    } catch (err) {
      console.error("Error fetching customers:", err);
      res.status(500).json({ error: "Failed to fetch customers" });
    }
  });

  app.post("/api/admin/login", async (req: Request, res: Response) => {
    const { password } = req.body;
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: "Invalid password" });
    }

    cleanExpiredOTPs();
    const otp = generateOTP();
    const sessionId = crypto.randomBytes(16).toString("hex");
    otpStore.set(sessionId, { code: otp, expiresAt: Date.now() + 5 * 60 * 1000 });

    console.log(`[Admin] OTP generated for admin login session ${sessionId}`);

    try {
      const nodemailer = await import("nodemailer");
      const appPassword = process.env.GMAIL_APP_PASSWORD;
      if (appPassword) {
        const transporter = nodemailer.default.createTransport({
          service: "gmail",
          auth: { user: "afterpay786@gmail.com", pass: appPassword },
        });
        await transporter.sendMail({
          from: '"AFTER PAY Admin" <afterpay786@gmail.com>',
          to: "afterpay786@gmail.com",
          subject: `Admin OTP: ${otp} - AFTER PAY`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 400px; margin: 0 auto; text-align: center;">
              <div style="background: linear-gradient(135deg, #4EA97A, #3d8a63); padding: 20px; border-radius: 12px 12px 0 0;">
                <h2 style="color: white; margin: 0;">AFTER PAY Admin</h2>
                <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Security Verification</p>
              </div>
              <div style="background: #f8f9fa; padding: 30px; border: 1px solid #e0e0e0;">
                <p style="color: #666; margin: 0 0 15px 0;">Your one-time verification code is:</p>
                <div style="background: white; border: 2px solid #4EA97A; border-radius: 12px; padding: 20px; margin: 0 auto; display: inline-block;">
                  <h1 style="color: #333; font-size: 36px; letter-spacing: 8px; margin: 0; font-family: monospace;">${otp}</h1>
                </div>
                <p style="color: #999; font-size: 12px; margin-top: 20px;">This code expires in 5 minutes.<br/>If you didn't request this, please ignore.</p>
              </div>
              <div style="background: #333; padding: 12px; border-radius: 0 0 12px 12px;">
                <p style="color: #999; font-size: 11px; margin: 0;">AFTER PAY Admin Security</p>
              </div>
            </div>
          `,
        });
        console.log(`[Admin] OTP sent via email for admin login`);
      }
    } catch (err) {
      console.error("[Admin] Failed to send OTP email:", err);
    }

    const whatsappMsg = `🔐 *AFTER PAY Admin OTP*\n\nYour verification code: *${otp}*\n\nThis code expires in 5 minutes.\n\n_Do not share this code with anyone._`;
    const whatsappLink = `https://wa.me/92${ADMIN_WHATSAPP.substring(1)}?text=${encodeURIComponent(whatsappMsg)}`;

    return res.json({ 
      success: true, 
      requiresOTP: true, 
      sessionId,
      whatsappLink,
      message: "OTP sent to your registered email" 
    });
  });

  app.post("/api/admin/verify-otp", (req: Request, res: Response) => {
    const { sessionId, otp } = req.body;
    if (!sessionId || !otp) {
      return res.status(400).json({ error: "Session ID and OTP required" });
    }

    const stored = otpStore.get(sessionId);
    if (!stored) {
      return res.status(401).json({ error: "Session expired. Please login again." });
    }

    if (stored.expiresAt < Date.now()) {
      otpStore.delete(sessionId);
      return res.status(401).json({ error: "OTP expired. Please login again." });
    }

    if (stored.code !== otp) {
      return res.status(401).json({ error: "Invalid OTP code" });
    }

    otpStore.delete(sessionId);
    const token = generateSecureToken();
    activeAdminSessions.set(token, {
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_DURATION,
    });
    return res.json({ success: true, token });
  });

  app.post("/api/admin/logout", (req: Request, res: Response) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith("Bearer ")) {
      const token = auth.slice(7);
      activeAdminSessions.delete(token);
    }
    return res.json({ success: true });
  });

  app.get("/api/admin/orders", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { status, search, page = "1", limit = "20" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string)));
      const offset = (pageNum - 1) * limitNum;

      let conditions: any[] = [];
      if (status && status !== "all") {
        conditions.push(eq(orders.status, status as string));
      }
      if (search) {
        const s = `%${search}%`;
        conditions.push(
          sql`(${orders.id} ILIKE ${s} OR ${orders.customerName} ILIKE ${s} OR ${orders.customerPhone} ILIKE ${s} OR ${orders.customerEmail} ILIKE ${s} OR ${orders.deliveryCity} ILIKE ${s})`
        );
      }

      const whereClause = conditions.length > 0
        ? conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions[1]}`
        : undefined;

      const [allOrders, countResult] = await Promise.all([
        whereClause
          ? db.select().from(orders).where(whereClause).orderBy(desc(orders.createdAt)).limit(limitNum).offset(offset)
          : db.select().from(orders).orderBy(desc(orders.createdAt)).limit(limitNum).offset(offset),
        whereClause
          ? db.select({ count: sql<number>`count(*)` }).from(orders).where(whereClause)
          : db.select({ count: sql<number>`count(*)` }).from(orders),
      ]);

      res.json({
        orders: allOrders,
        total: Number(countResult[0].count),
        page: pageNum,
        totalPages: Math.ceil(Number(countResult[0].count) / limitNum),
      });
    } catch (err) {
      console.error("Error fetching orders:", err);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.get("/api/admin/orders/:id", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id));
      if (!order) return res.status(404).json({ error: "Order not found" });
      res.json(order);
    } catch (err) {
      console.error("Error fetching order:", err);
      res.status(500).json({ error: "Failed to fetch order" });
    }
  });

  app.patch("/api/admin/orders/:id/status", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      const validStatuses = ["confirmed", "processing", "shipped", "delivered", "cancelled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }
      const [updated] = await db.update(orders).set({ status }).where(eq(orders.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Order not found" });

      const statusTypeMap: Record<string, string> = {
        processing: "order_processing",
        shipped: "order_shipped",
        delivered: "order_delivered",
        cancelled: "order_cancelled",
      };

      if (statusTypeMap[status]) {
        const result = await sendOrderNotification(statusTypeMap[status] as any, updated.id);
        return res.json({ ...updated, whatsappLink: result.whatsappLink });
      }

      res.json(updated);
    } catch (err) {
      console.error("Error updating order:", err);
      res.status(500).json({ error: "Failed to update order status" });
    }
  });

  app.get("/api/admin/stats", requireAdminMiddleware as any, async (_req: Request, res: Response) => {
    try {
      const allOrders = await db.select().from(orders);
      const totalOrders = allOrders.length;
      const totalRevenue = allOrders.reduce((sum, o) => sum + o.total, 0);
      const statusCounts: Record<string, number> = {};
      const paymentCounts: Record<string, number> = {};
      const cityCounts: Record<string, number> = {};

      allOrders.forEach((o) => {
        statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        paymentCounts[o.paymentMethod] = (paymentCounts[o.paymentMethod] || 0) + 1;
        cityCounts[o.deliveryCity] = (cityCounts[o.deliveryCity] || 0) + 1;
      });

      const recentOrders = allOrders
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5);

      res.json({
        totalOrders,
        totalRevenue,
        statusCounts,
        paymentCounts,
        cityCounts,
        recentOrders,
      });
    } catch (err) {
      console.error("Error fetching stats:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.get("/api/admin/products", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { brand, search, page = "1", limit = "50" } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit as string)));
      const offset = (pageNum - 1) * limitNum;

      let conditions: any[] = [];
      if (brand) conditions.push(ilike(scrapedProducts.brand, brand as string));
      if (search) {
        const s = `%${search}%`;
        conditions.push(or(ilike(scrapedProducts.name, s), ilike(scrapedProducts.brand, s), ilike(scrapedProducts.slug, s)));
      }

      const whereClause = conditions.length > 0
        ? conditions.reduce((acc, cond) => acc ? and(acc, cond) : cond)
        : undefined;

      const [products, countResult] = await Promise.all([
        whereClause
          ? db.select().from(scrapedProducts).where(whereClause).orderBy(desc(scrapedProducts.createdAt)).limit(limitNum).offset(offset)
          : db.select().from(scrapedProducts).orderBy(desc(scrapedProducts.createdAt)).limit(limitNum).offset(offset),
        whereClause
          ? db.select({ count: sql<number>`count(*)` }).from(scrapedProducts).where(whereClause)
          : db.select({ count: sql<number>`count(*)` }).from(scrapedProducts),
      ]);

      res.json({ products, total: Number(countResult[0].count), page: pageNum, totalPages: Math.ceil(Number(countResult[0].count) / limitNum) });
    } catch (err) {
      console.error("Error fetching admin products:", err);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

  app.post("/api/admin/products", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { name, brand, price, originalPrice, discount, image, images, colors, storageOptions, specs, description, fastDelivery, inStock, highlights } = req.body;
      if (!name || !brand || !price) {
        return res.status(400).json({ error: "Name, brand, and price are required" });
      }

      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const brandPrefix = brand.substring(0, 3).toLowerCase();
      const id = `${brandPrefix}_manual_${Date.now().toString(36)}`;

      const [product] = await db.insert(scrapedProducts).values({
        id,
        name,
        brand,
        slug,
        price: parseInt(price),
        originalPrice: parseInt(originalPrice) || parseInt(price),
        discount: parseInt(discount) || 0,
        rating: 0,
        reviews: 0,
        image: image || "",
        images: images || [],
        specs: specs || [],
        description: description || `${name} - Available at AFTER PAY with warranty.`,
        fastDelivery: fastDelivery || false,
        inStock: inStock !== false,
        category: "smartphones",
        colors: colors || [],
        storageOptions: storageOptions || [],
        highlights: highlights || [],
        priceoye_url: "",
      }).returning();

      res.status(201).json(product);
    } catch (err) {
      console.error("Error creating product:", err);
      res.status(500).json({ error: "Failed to create product" });
    }
  });

  app.put("/api/admin/products/:id", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { name, brand, price, originalPrice, discount, image, images, colors, storageOptions, specs, description, fastDelivery, inStock, highlights, rating, reviews } = req.body;

      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (brand !== undefined) updateData.brand = brand;
      if (price !== undefined) updateData.price = parseInt(price);
      if (originalPrice !== undefined) updateData.originalPrice = parseInt(originalPrice);
      if (discount !== undefined) updateData.discount = parseInt(discount);
      if (image !== undefined) updateData.image = image;
      if (images !== undefined) updateData.images = images;
      if (colors !== undefined) updateData.colors = colors;
      if (storageOptions !== undefined) updateData.storageOptions = storageOptions;
      if (specs !== undefined) updateData.specs = specs;
      if (description !== undefined) updateData.description = description;
      if (fastDelivery !== undefined) updateData.fastDelivery = fastDelivery;
      if (inStock !== undefined) updateData.inStock = inStock;
      if (highlights !== undefined) updateData.highlights = highlights;
      if (rating !== undefined) updateData.rating = parseFloat(rating);
      if (reviews !== undefined) updateData.reviews = parseInt(reviews);
      if (name) updateData.slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const [updated] = await db.update(scrapedProducts).set(updateData).where(eq(scrapedProducts.id, req.params.id)).returning();
      if (!updated) return res.status(404).json({ error: "Product not found" });
      res.json(updated);
    } catch (err) {
      console.error("Error updating product:", err);
      res.status(500).json({ error: "Failed to update product" });
    }
  });

  app.delete("/api/admin/products/:id", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const [deleted] = await db.delete(scrapedProducts).where(eq(scrapedProducts.id, req.params.id)).returning();
      if (!deleted) return res.status(404).json({ error: "Product not found" });
      res.json({ success: true, message: "Product deleted" });
    } catch (err) {
      console.error("Error deleting product:", err);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });

  app.patch("/api/admin/orders/:id/payment-status", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { paymentStatus } = req.body;
      const validStatuses = ["unpaid", "pending", "paid", "failed"];
      if (!validStatuses.includes(paymentStatus)) {
        return res.status(400).json({ error: "Invalid payment status" });
      }
      const [updated] = await db.update(orders)
        .set({ paymentStatus })
        .where(eq(orders.id, req.params.id))
        .returning();
      if (!updated) return res.status(404).json({ error: "Order not found" });

      if (paymentStatus === "paid") {
        const result = await sendOrderNotification("payment_received", updated.id, {
          total: updated.total,
          paymentOption: updated.paymentOption,
        });
        return res.json({ ...updated, whatsappLink: result.whatsappLink });
      }

      res.json(updated);
    } catch (err) {
      console.error("Error updating payment status:", err);
      res.status(500).json({ error: "Failed to update payment status" });
    }
  });

  app.delete("/api/admin/orders/:id", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id));
      if (!order) return res.status(404).json({ error: "Order not found" });
      if (order.status !== "delivered" && order.status !== "cancelled") {
        return res.status(400).json({ error: "Only delivered or cancelled orders can be deleted" });
      }
      await db.delete(orders).where(eq(orders.id, req.params.id));
      res.json({ success: true, message: "Order deleted successfully" });
    } catch (err) {
      console.error("Error deleting order:", err);
      res.status(500).json({ error: "Failed to delete order" });
    }
  });

  app.post("/api/admin/health-audit", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      if (isAuditRunning()) {
        return res.json({ running: true, message: "Health audit already in progress" });
      }
      const autoFix = req.body.autoFix !== false;
      const result = await runHealthAudit(autoFix);
      res.json(result);
    } catch (err) {
      console.error("Error running health audit:", err);
      res.status(500).json({ error: "Failed to run health audit" });
    }
  });

  app.get("/api/admin/health-audit", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const lastResult = getLastAuditResult();
      res.json({
        running: isAuditRunning(),
        lastResult,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to get audit status" });
    }
  });

  // ── Scraper-specific health audit ──────────────────────────────────────────
  app.post("/api/admin/scraper-audit/run", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      if (isScraperAuditRunning()) {
        return res.json({ running: true, message: "Scraper audit already in progress", lastResult: getLastScraperAudit() });
      }
      const autoFix = req.body.autoFix !== false;
      const result = await runScraperAudit(autoFix);
      res.json(result);
    } catch (err: any) {
      console.error("[ScraperAudit] Route error:", err);
      res.status(500).json({ error: `Scraper audit failed: ${err.message}` });
    }
  });

  app.get("/api/admin/scraper-audit/result", requireAdminMiddleware as any, async (_req: Request, res: Response) => {
    res.json({
      running: isScraperAuditRunning(),
      lastResult: getLastScraperAudit(),
    });
  });

  app.post("/api/admin/scraper-audit/fix-all", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      if (isScraperAuditRunning()) {
        return res.json({ running: true, message: "Audit in progress" });
      }
      const result = await runScraperAudit(true);
      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/orders/:id/notify", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { type } = req.body;
      const result = await sendOrderNotification(type, req.params.id);
      res.json(result);
    } catch (err) {
      console.error("Error sending notification:", err);
      res.status(500).json({ error: "Failed to send notification" });
    }
  });

  app.get("/api/admin/orders/:id/whatsapp-link", requireAdminMiddleware as any, async (req: Request, res: Response) => {
    try {
      const { type } = req.query;
      const [order] = await db.select().from(orders).where(eq(orders.id, req.params.id));
      if (!order) return res.status(404).json({ error: "Order not found" });

      const result = await sendOrderNotification(type as any || "order_placed", order.id);
      res.json({ whatsappLink: result.whatsappLink });
    } catch (err) {
      res.status(500).json({ error: "Failed to generate WhatsApp link" });
    }
  });

  app.get("/api/notifications", async (req: Request, res: Response) => {
    try {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: "Phone number required" });
      const result = await getCustomerNotifications(phone as string);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  app.post("/api/notifications/read", async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: "Phone number required" });
      await markNotificationsRead(phone);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to mark notifications read" });
    }
  });

  app.get("/api/notifications/unread-count", async (req: Request, res: Response) => {
    try {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: "Phone number required" });
      const count = await getUnreadCount(phone as string);
      res.json({ count });
    } catch (err) {
      res.status(500).json({ error: "Failed to get unread count" });
    }
  });

  // Installment plan calculator — markup rates are confidential (server-side only)
  const INSTALLMENT_CONFIG: Record<number, { markupRate: number; label: string }> = {
    6:  { markupRate: 0.30, label: "6 Months"  },
    9:  { markupRate: 0.36, label: "9 Months"  },
    12: { markupRate: 0.47, label: "12 Months" },
  };

  const VALID_ADVANCE_PERCENTS = [0, 5, 10, 15];

  function getInstallmentStartDate(): Date {
    const now = new Date();
    if (now.getDate() === 1) return new Date(now.getFullYear(), now.getMonth(), 1);
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  function formatInstallmentMonth(date: Date): string {
    const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `1st ${M[date.getMonth()]}, ${String(date.getFullYear()).slice(2)}`;
  }

  app.post("/api/installment-calculator", async (req: Request, res: Response) => {
    try {
      const { price, tenure, productName, advancePercent } = req.body;

      if (!price || !tenure) {
        return res.status(400).json({ error: "price and tenure are required" });
      }

      const numPrice = parseFloat(String(price));
      const numTenure = parseInt(String(tenure), 10);
      const advPct = VALID_ADVANCE_PERCENTS.includes(Number(advancePercent)) ? Number(advancePercent) : 0;

      if (isNaN(numPrice) || numPrice < 1000) {
        return res.status(400).json({ error: "Invalid price" });
      }

      const config = INSTALLMENT_CONFIG[numTenure];
      if (!config) {
        return res.status(400).json({ error: "Tenure must be 6, 9, or 12 months" });
      }

      const totalAmount      = Math.round(numPrice * (1 + config.markupRate));
      const advanceAmount    = Math.round(totalAmount * advPct / 100);
      const remainingAmount  = totalAmount - advanceAmount;
      const monthlyInstallment = Math.round(remainingAmount / numTenure);

      const startDate = getInstallmentStartDate();
      const endDate   = new Date(startDate.getFullYear(), startDate.getMonth() + numTenure - 1, 1);

      return res.json({
        productName:        productName || "Selected Model",
        price:              numPrice,
        tenure:             numTenure,
        tenureLabel:        config.label,
        totalAmount,
        advancePercent:     advPct,
        advanceAmount,
        remainingAmount,
        monthlyInstallment,
        startDate:          formatInstallmentMonth(startDate),
        endDate:            formatInstallmentMonth(endDate),
      });
    } catch (err) {
      return res.status(500).json({ error: "Calculation failed" });
    }
  });

  app.get("/api/bnpl/application-form", (_req: Request, res: Response) => {
    const formPath = path.resolve(process.cwd(), "server", "templates", "AFTER_PAY_Application_Form.pdf");
    if (fs.existsSync(formPath)) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "attachment; filename=AFTER_PAY_Application_Form.pdf");
      return res.sendFile(formPath);
    }
    res.status(404).json({ error: "Application form not found" });
  });

  app.get("/privacy-policy", (_req: Request, res: Response) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "privacy-policy.html");
    if (fs.existsSync(templatePath)) {
      const html = fs.readFileSync(templatePath, "utf-8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).send(html);
    } else {
      res.status(404).send("Privacy Policy not found");
    }
  });

  app.get("/terms", (_req: Request, res: Response) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "terms.html");
    if (fs.existsSync(templatePath)) {
      const html = fs.readFileSync(templatePath, "utf-8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.status(200).send(html);
    } else {
      res.status(404).send("Terms of Use not found");
    }
  });

  app.get("/admin", (_req: Request, res: Response) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "admin.html");
    if (fs.existsSync(templatePath)) {
      const html = fs.readFileSync(templatePath, "utf-8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(200).send(html);
    } else {
      res.status(404).send("Admin dashboard not found");
    }
  });

  app.get("/share-banner.png", (_req: Request, res: Response) => {
    const bannerPath = path.resolve(process.cwd(), "server", "templates", "afterpay-share-banner.png");
    if (fs.existsSync(bannerPath)) {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.sendFile(bannerPath);
    } else {
      res.status(404).send("Not found");
    }
  });

  const SERVER_VERSION = Date.now().toString();

  app.get("/api/version", (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.json({ version: SERVER_VERSION, timestamp: Date.now() });
  });

  const serveDownloadPage = (req: Request, res: Response) => {
    const templatePath = path.resolve(process.cwd(), "server", "templates", "download.html");
    if (fs.existsSync(templatePath)) {
      let html = fs.readFileSync(templatePath, "utf-8");
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      html = html.replaceAll("{{BASE_URL}}", baseUrl);
      html = html.replaceAll("{{CACHE_BUST}}", SERVER_VERSION);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.setHeader("X-Content-Version", SERVER_VERSION);
      res.setHeader("ETag", `"${SERVER_VERSION}"`);
      res.setHeader("Vary", "Accept-Encoding");
      res.status(200).send(html);
    } else {
      res.status(404).send("Download page not found");
    }
  };

  app.get("/download", serveDownloadPage);
  app.get("/app", serveDownloadPage);
  app.get("/install", serveDownloadPage);
  app.get("/get", serveDownloadPage);
  app.get("/get-app", serveDownloadPage);

  const httpServer = createServer(app);
  return httpServer;
}
