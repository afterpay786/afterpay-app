# How to Build Your AAB File — Simple Steps

## What is this?
The AAB file is what you upload to Google Play Store.
The build happens automatically on GitHub's servers (FREE, no installation needed on your phone or computer).

---

## What you need
- A phone or computer with internet
- 30 minutes of time
- Gmail account (you already have one!)

---

## STEP 1 — Create a Free GitHub Account (5 minutes)

1. Go to **github.com** on your phone/computer
2. Click **"Sign up"** (top right)
3. Enter your email, create a password, choose a username
4. Verify your email
5. Done! ✅

---

## STEP 2 — Connect This Project to GitHub (3 minutes)

Do this inside Replit:

1. Look at the **left side panel** in Replit
2. Click the **Git icon** (looks like a branch/fork symbol)
3. Click **"Connect to GitHub"**
4. It will ask you to authorize Replit — click **"Authorize"**
5. Click **"Create a new GitHub repository"**
6. Name it: `after-pay-app`
7. Click **"Create and push"**
8. Done! Your code is now on GitHub ✅

---

## STEP 3 — Run the Build (2 minutes to START, 25 minutes to FINISH)

1. Go to **github.com** and open your repository (`after-pay-app`)
2. Click the **"Actions"** tab at the top
3. On the left, click **"Build Android AAB for Google Play"**
4. Click the **"Run workflow"** button (right side, green/grey button)
5. Click **"Run workflow"** again to confirm
6. You'll see a yellow circle — this means it's building ⏳

---

## STEP 4 — Download Your AAB File (after 25-30 minutes)

1. The yellow circle turns **green ✅** when done
2. Click on the completed build run
3. Scroll down to **"Artifacts"**
4. Click **"AFTER-PAY-Android-Release"** to download a ZIP file
5. Open the ZIP — inside you'll find:
   - **`AFTER-PAY-v1.0.aab`** ← This is your AAB file for Google Play
   - **`afterpay-release.jks`** ← SAVE THIS FILE SAFELY (you need it for future updates)

---

## STEP 5 — Upload to Google Play Console

1. Go to **play.google.com/console**
2. Open your app
3. Go to **Release → Production** (or "Internal testing" to test first)
4. Click **"Create new release"**
5. Click **"Upload"** and select **`AFTER-PAY-v1.0.aab`**
6. When asked about "App Signing" — click **"Use Google Play App Signing"** ✅
7. Add release notes: `First release of AFTER PAY`
8. Click **Save → Review → Start rollout**

---

## Important Notes

⚠️ **Save the `afterpay-release.jks` file** — Keep it in a safe place (Google Drive, email to yourself).
You MUST use this same file for every future update. If you lose it, you cannot update the app.

⏱️ After uploading, Google reviews the app in **3–7 business days**.

🎉 Once approved, your app is LIVE on Google Play Store!

---

## If something goes wrong

If the build fails (red ❌), click on the failed run, read the error message, and share it here — I'll fix it immediately.

---

## Summary of what I set up for you

- ✅ Package name: `com.afterpayapp.pk` (unique)
- ✅ Android version code: 1
- ✅ Permissions: Only what your app needs (Camera/Location blocked)
- ✅ Privacy Policy: Live at your deployed URL
- ✅ Terms of Use: Live at your deployed URL
- ✅ Auto-build script: GitHub Actions (you just click a button)
- ✅ Auto-signing: The keystore is created automatically during build
- ✅ Target Android 15 (required by Google from 2025)
