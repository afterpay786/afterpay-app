# AFTER PAY — Google Play Store Submission Guide

## What's Already Done (In-Code)
- ✅ Package name: `com.afterpayapp.pk` (unique, Play Store ready)
- ✅ Android versionCode: `1` (increments automatically with each build)
- ✅ Target SDK: `35` (Android 15 — required by Google from Aug 2025)
- ✅ Min SDK: `24` (Android 7.0 — covers 98%+ of active devices)
- ✅ Permissions: Only what the app actually uses declared
- ✅ Blocked unused permissions: Camera, Location, Contacts (prevents rejection)
- ✅ Adaptive icon: Configured with green background
- ✅ Splash screen: Green (#4EA97A) with logo
- ✅ Privacy Policy URL: `https://your-domain.replit.app/privacy-policy`
- ✅ Terms of Use URL: `https://your-domain.replit.app/terms`
- ✅ EAS Build configuration: `eas.json` created (production = AAB format)
- ✅ App scheme: `afterpay://` (unique deep link)

---

## Step 1 — Set Up EAS Build (One-Time)

Do this on your personal computer (not Replit):

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to your Expo account (create one free at expo.dev if needed)
eas login

# Link your project to EAS (run inside the project folder)
eas init
```

After `eas init`, it gives you a **Project ID**. Copy it and replace
`REPLACE_WITH_YOUR_EAS_PROJECT_ID` in `app.json` → `extra.eas.projectId`.

---

## Step 2 — Build the AAB File

```bash
# Build the production AAB (Android App Bundle)
eas build --platform android --profile production
```

- Build takes **10–20 minutes** in EAS cloud
- You'll get an email when it's done
- Download the `.aab` file from https://expo.dev/builds
- EAS automatically creates and manages your signing keystore — no manual work needed

---

## Step 3 — Google Play Console Setup

### 3.1 Developer Account
- Go to https://play.google.com/console
- Complete your developer account (pay the one-time **$25 USD** fee)
- Fill in your name, address, and phone number

### 3.2 Create New App
1. Click **"Create app"**
2. App name: `AFTER PAY`
3. Default language: `English (United Kingdom)` or Urdu
4. App or game: **App**
5. Free or paid: **Free**

---

## Step 4 — Store Listing (Required Assets)

### App Icon (MANDATORY)
- Size: **512 × 512 px**
- Format: PNG (no alpha/transparency)
- Already in your project at `assets/images/icon.png` — resize to 512×512

### Feature Graphic (MANDATORY)
- Size: **1024 × 500 px**
- Format: JPG or PNG
- This is the banner shown at top of your Play Store listing
- Design it with your AFTER PAY logo on the green (#4EA97A) background

### Screenshots (MANDATORY — minimum 2, recommended 4–8)
- Take screenshots on a phone or use an Android emulator
- Minimum size: 320px on shortest side, 3840px on longest
- Required for: Phone (must have 2+ screenshots)
- Show your best screens: Home, Product Page, Checkout, My Orders

### Short Description (80 chars max)
```
Pakistan's #1 Buy Now, Pay Later mobile phone store.
```

### Full Description (4000 chars max)
```
AFTER PAY is Pakistan's leading Buy Now, Pay Later (BNPL) mobile phone 
e-commerce platform. Shop the latest smartphones from Samsung, Apple, 
Oppo, Vivo, Xiaomi, Tecno, Infinix, Realme, and more — on easy monthly 
installments.

🛒 SHOP WITH EASE
Browse 400+ mobile phones with full specs, multiple color options, and 
storage variants. Compare prices and find your perfect phone.

💳 BUY NOW, PAY LATER
Apply for BNPL installment plans with 6, 9, or 12-month tenure options. 
Use our built-in EMI Calculator to see your exact monthly payment before 
you commit.

🚀 FAST DELIVERY
Nationwide delivery in 3–5 business days. Open Parcel option available — 
inspect before you pay!

💰 MULTIPLE PAYMENT OPTIONS
Cash on Delivery, JazzCash, EasyPaisa, Credit/Debit Card, Bank Transfer, 
and installment plans.

⭐ FEATURES
• Live product data synced daily from Pakistan's largest price comparison site
• Detailed spec sheets for every phone
• Multi-angle photo gallery with per-color images
• Flash deals and daily offers
• Real-time order tracking
• Wishlist and cart management
• Secure admin panel

🔒 SAFE & SECURE
Your data is encrypted and never sold. We use bank-grade security for all 
transactions.

Download AFTER PAY today and get the smartphone you want — on your terms!
```

---

## Step 5 — Content Rating

In Play Console → **App content** → **Content rating**:
- Category: **Shopping**
- Answer all questions honestly (this app has no violence, adult content, gambling)
- You'll receive a rating like **Everyone** or **PEGI 3**

---

## Step 6 — Data Safety Form

In Play Console → **App content** → **Data safety**:

| Data Type | Collected? | Shared? | Required? | Encrypted? |
|-----------|-----------|---------|-----------|-----------|
| Name | ✅ Yes | ✅ (delivery partner) | ✅ Yes | ✅ Yes |
| Phone number | ✅ Yes | ✅ (delivery partner) | ✅ Yes | ✅ Yes |
| Address | ✅ Yes | ✅ (delivery partner) | ✅ Yes | ✅ Yes |
| Payment info | ✅ Yes (method only) | ✅ (payment processor) | ✅ Yes | ✅ Yes |
| Purchase history | ✅ Yes | ❌ No | ✅ Yes | ✅ Yes |
| Photos/Files | ✅ Yes (BNPL docs) | ❌ No | ✅ Yes | ✅ Yes |
| Device identifiers | ✅ Yes | ❌ No | ❌ No | ✅ Yes |

- **User data can be deleted**: ✅ Yes (via contacting support@afterpay.pk)
- **Data encrypted in transit**: ✅ Yes
- **Follows Google Play Families Policy**: ✅ No (not for children)

---

## Step 7 — Privacy Policy URL

In Play Console → **Store listing** → **Privacy policy**:
```
https://YOUR-DEPLOYED-DOMAIN.replit.app/privacy-policy
```

---

## Step 8 — Upload the AAB

1. Go to **Release** → **Production** (or start with **Internal testing**)
2. Click **"Create new release"**
3. Upload your `.aab` file downloaded from EAS
4. Add release notes: `Initial release of AFTER PAY v1.0.0`
5. Click **"Save"** → **"Review release"** → **"Start rollout"**

---

## Step 9 — Review Timeline

- Google reviews new apps in **3–7 business days**
- You'll receive an email when approved or if changes are needed
- Common rejection reasons (already handled):
  - ✅ No privacy policy → Fixed
  - ✅ Wrong package name → Fixed (`com.afterpayapp.pk`)
  - ✅ Missing permissions declaration → Fixed
  - ✅ Location declared but not used → Blocked

---

## Quick Checklist Before Submitting

- [ ] EAS account created at expo.dev
- [ ] `eas init` run and Project ID added to app.json
- [ ] AAB built with `eas build --platform android --profile production`
- [ ] 512×512 app icon ready
- [ ] 1024×500 feature graphic ready
- [ ] At least 4 phone screenshots ready
- [ ] Privacy Policy URL pasted in Play Console
- [ ] Data safety form completed
- [ ] Content rating completed
- [ ] Developer account verified ($25 fee paid)
