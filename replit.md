# AFTER PAY - Mobile Selling App

## Overview
AFTER PAY is a mobile phone e-commerce application designed for the Pakistani market, similar to Priceoye. It facilitates the online selling of mobile phones, aiming to capture market share with its user-friendly interface and comprehensive feature set. The project's vision is to become a leading platform for mobile phone sales in Pakistan, offering a seamless shopping experience, diverse product range, and reliable delivery/payment options.

## User Preferences
I prefer iterative development with clear communication at each stage. Before making any major architectural changes or implementing complex features, please ask for my approval. I appreciate detailed explanations for significant design choices or technical challenges.

## System Architecture
The application is built with Expo (React Native) for the frontend, utilizing Expo Router for file-based routing and React Context for state management (Cart, Wishlist, Orders, Admin) with AsyncStorage for persistence. The backend is an Express TypeScript server. Styling incorporates a custom soft green theme (`#4EA97A`) and the Inter Google Font. Product data is managed via a PostgreSQL database using Drizzle ORM, with React Query hooks for API interaction and a local `lib/data.ts` as a fallback.

**Key Features:**
- **Product Display**: Home screen with brand chips, banners, price filters, and product grids. Detailed product pages include multi-angle image galleries (per-color large/medium/small images from Priceoye), color variants, storage/RAM options, ratings, share functionality, Priceoye-style structured specification tables (Display, Camera, Battery, Memory, Performance, Connectivity, General Features), rich product descriptions, and a features highlights section.
- **Search & Filtering**: Comprehensive search with price range filters and sorting options.
- **Shopping & Wishlist**: Standard shopping cart with quantity controls and a wishlist feature.
- **Brand Pages**: Dedicated pages for each brand with product listings and promotional content.
- **Checkout Flow**: A 3-step checkout process (Delivery Info → Payment Method → Order Review) with multiple payment options (COD, JazzCash, EasyPaisa, Credit/Debit Card, Bank Transfer, BNPL), city-specific delivery, and an "Open Parcel" option.
- **Order Management**: Order success screen, "My Orders" history with status tracking (Confirmed/Processing/Shipped/Delivered), and detailed order views.
- **Admin Panel**: Hidden, in-app admin panel for order management (list, detail, status updates) and analytics, secured with email OTP 2FA and cryptographic session tokens (24hr expiry). Only OTP-verified devices can access admin endpoints.
- **Promotional Elements**: Auto-scrolling hero banners, flash sale countdowns, brand promo strips, trust badges, category deals, and mid-page brand ads.
- **Account Management**: User account features including delivery address management (CRUD), payment methods information, notification preferences, and help/support options.
- **BNPL Document Upload**: Comprehensive installment application system requiring CNIC front/back, Tasdeeq App screenshot, Bank Cheque, 3-month bank statements, and downloadable AFTER PAY Application Form PDF. Accepts JPG/JPEG formats with upload/remove functionality.
- **Installment Plan Calculator (EMI)**: A tap-able "EMI" tab on every product detail page opens a bottom-sheet modal calculator. Supports 3 tenures (6M/9M/12M) and 4 advance payment options (None/5%/10%/15%) — both % label and PKR amount shown simultaneously. Results shown as a full receipt-style table: Product, Category, Cash Price, On X Months (total), Advance Paid (PKR + %), Per/Month Installment, Start Month (auto-computed: nearest upcoming 1st of month), End Month, Duration. Backend endpoint `/api/installment-calculator` computes amounts server-side using confidential markup rates (6M=30%, 9M=36%, 12M=47% — hidden from UI, never exposed client-side). Start date always lands on the 1st of the next calendar month. End date = Start + (tenure-1) months.
- **Hidden Retail Price Markup**: Every scraped Priceoye price has a confidential, tier-based markup applied before storing in the database. Tiers: ≤25k +Rs800, 25.1k–30k +Rs1,200, 30.1k–40k +Rs1,400, 40.1k–80k +Rs1,700, 80.1k–120k +Rs2,700, 120.1k–200k +Rs9,000, 200.1k–800k +Rs20,000. Applied to main price, original price, and all storage option prices via `applyPriceMarkup()` in `server/scraper.ts`. Never exposed to clients. Applied automatically on every scrape and via a one-time DB migration for all existing products.
- **Data Synchronization & Health**: Automated scraping of product data from Priceoye global `/mobiles/` page (up to 20 pages / 400 products). Scraper uses retry logic (3 retries with exponential backoff), rotating User-Agent headers, and 30s timeout per request. Advanced parser with 6-priority product name extraction, Next.js `__NEXT_DATA__` support, 4-tier spec fallback (JSON → Next.js → HTML table → dl/dd), image deduplication, per-product quality scoring (0-100). Data source logged per-product (window.product_data vs HTML fallback). Price changes logged clearly (▲/▼). Self-healing general health audit + dedicated Priceoye Scraper Audit system.
- **Dedicated Scraper Audit System** (`server/scraper-audit.ts`): Standalone 25+ check audit engine specifically for the Priceoye data pipeline. Covers 10 categories: Engine (recency, consecutive failures, error rate), Names (slug-format, short, blank), Prices (zero, floor, ceiling, variant), Images (main, gallery, URL format, color, duplicates), Specs (missing tables, thin entries), Descriptions, Variants (colors, storage), Filters (keypad phone detection), Brands (core coverage, depth), Freshness (stale >2 days), Output (count, JSON vs HTML-fallback ratio). All auto-fixable checks run fixes immediately. Health score 0-100 computed from check results. Admin panel "Scraper" tab shows score gauge, summary, category-grouped checklist, live stats, and scrape history timeline. API endpoints: POST `/api/admin/scraper-audit/run`, GET `/api/admin/scraper-audit/result`, POST `/api/admin/scraper-audit/fix-all`.

**UI/UX Decisions:**
- **Color Scheme**: Primary soft green (`#4EA97A`) with accent rose (`#F43F5E`).
- **Typography**: Inter Google Font for consistent branding.
- **Design Patterns**: Priceoye-style UI elements for familiar user experience, including specific badge designs (e.g., "Official Online Retailer," "Fast Delivery," star ratings).
- **Navigation**: Tab-based navigation for core sections (Home, Brands, Cart, Wishlist, Account) and stack navigation for detailed views like product pages and checkout flow.
- **Dynamic Content**: Auto-scrolling banners, promotional strips, and dynamic content rendering for a rich user interface.

## External Dependencies
- **PostgreSQL**: Primary database for storing product, order, and user data.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.
- **Expo (React Native)**: Frontend framework for mobile application development.
- **Express**: Backend framework for building the API server.
- **React Query**: For efficient data fetching, caching, and state management with API calls.
- **AsyncStorage**: For client-side data persistence (Cart, Wishlist, Orders, Admin context).
- **JazzCash API**: Integrated for secure online payment processing (sandbox mode currently).
- **Google Fonts (Inter)**: For typography.
- **`expo-clipboard`**: For copy-to-clipboard functionality.
- **Native Share API**: For app sharing functionality.