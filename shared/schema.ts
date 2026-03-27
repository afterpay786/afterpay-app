import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const scrapedProducts = pgTable("scraped_products", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand").notNull(),
  slug: text("slug").notNull(),
  price: integer("price").notNull(),
  originalPrice: integer("original_price").notNull().default(0),
  discount: integer("discount").notNull().default(0),
  rating: real("rating").notNull().default(0),
  reviews: integer("reviews").notNull().default(0),
  image: text("image").notNull(),
  images: jsonb("images").notNull().default(sql`'[]'::jsonb`),
  specs: jsonb("specs").notNull().default(sql`'[]'::jsonb`),
  specifications: jsonb("specifications").notNull().default(sql`'{}'::jsonb`),
  description: text("description").notNull().default(""),
  productDescription: text("product_description").notNull().default(""),
  summaryHighlights: jsonb("summary_highlights").notNull().default(sql`'[]'::jsonb`),
  fastDelivery: boolean("fast_delivery").notNull().default(false),
  inStock: boolean("in_stock").notNull().default(true),
  category: text("category").notNull().default("smartphones"),
  colors: jsonb("colors").notNull().default(sql`'[]'::jsonb`),
  storageOptions: jsonb("storage_options").notNull().default(sql`'[]'::jsonb`),
  highlights: jsonb("highlights").notNull().default(sql`'[]'::jsonb`),
  priceoye_url: text("priceoye_url").notNull(),
  isNewArrival: boolean("is_new_arrival").default(false),
  lastScrapedAt: timestamp("last_scraped_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ScrapedProduct = typeof scrapedProducts.$inferSelect;

export const scrapeLog = pgTable("scrape_log", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  status: text("status").notNull().default("running"),
  totalProducts: integer("total_products").notNull().default(0),
  scrapedProducts: integer("scraped_products_count").notNull().default(0),
  newProducts: integer("new_products").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  message: text("message").default(""),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export type ScrapeLog = typeof scrapeLog.$inferSelect;

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryCity: text("delivery_city").notNull(),
  deliveryNotes: text("delivery_notes").default(""),
  paymentMethod: text("payment_method").notNull(),
  subtotal: integer("subtotal").notNull(),
  deliveryFee: integer("delivery_fee").notNull(),
  total: integer("total").notNull(),
  status: text("status").notNull().default("confirmed"),
  openParcel: boolean("open_parcel").default(false),
  estimatedDelivery: text("estimated_delivery").notNull(),
  items: jsonb("items").notNull(),
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  paymentOption: text("payment_option").default("full"),
  bankTransferInfo: jsonb("bank_transfer_info"),
  bnplDocuments: jsonb("bnpl_documents"),
  jazzcashTxnRef: text("jazzcash_txn_ref"),
  jazzcashResponseCode: text("jazzcash_response_code"),
  jazzcashRrn: text("jazzcash_rrn"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const customers = pgTable("customers", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull(),
  password: text("password").notNull(),
  city: text("city").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Customer = typeof customers.$inferSelect;

export type Order = typeof orders.$inferSelect;
export type InsertOrder = typeof orders.$inferInsert;

export const notifications = pgTable("notifications", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  customerPhone: text("customer_phone").notNull(),
  customerEmail: text("customer_email").default(""),
  orderId: text("order_id").default(""),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  whatsappSent: boolean("whatsapp_sent").default(false),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Notification = typeof notifications.$inferSelect;
