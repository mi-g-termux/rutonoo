# Fruitopia — Self-Hosted E-Commerce Store

A fully-featured, production-ready fruit / grocery e-commerce platform built with **React + Vite + TypeScript**. Supports **Supabase** and **Firebase** as backends. Ships with an in-browser Install Wizard so anyone can deploy without touching code.

**Works on:** Localhost · Render · cPanel · VPS · Vercel · Netlify

---

## Table of Contents

1. [Features](#features)
2. [Quick Start](#quick-start)
3. [Database Setup](#database-setup)
4. [Deployment](#deployment)
5. [Admin Panel Guide](#admin-panel-guide)
6. [Courier Integration](#courier-integration)
7. [Email / SMTP Setup](#email--smtp-setup)
8. [User Accounts](#user-accounts)
9. [Environment Variables](#environment-variables)
10. [Project Structure](#project-structure)
11. [Troubleshooting](#troubleshooting)

---

## Features

### Storefront
- Product catalog with categories, search, and filters
- Product variants (size, color, weight, etc.) with individual stock tracking
- Product image gallery (multiple images per product)
- Discount coupon / promo code system
- Customer reviews and ratings
- Guest checkout with automatic account creation
- COD (Cash on Delivery) and online payment support
- Real-time order tracking page for customers
- Newsletter subscription
- Pinned navigation categories

### Admin Panel
- **Products & Stock** — Add, edit, delete products; manage variants and stock quantities with atomic deduction (prevents overselling)
- **Client Orders** — View all orders, update delivery status, update payment status, delete records
- **Discount Coupons** — Create and manage promo codes with percentage or flat discounts
- **Moderation** — Approve or reject customer reviews
- **Subscribers** — View and export newsletter subscribers
- **Page Sections** — Edit homepage sections, hero banners, and featured content
- **CMS Settings** — Store name, logo, SMTP email, payment settings, delivery zones
- **Courier API** — Configure courier providers for automatic order dispatch
- **Backend** — Switch between Supabase and Firebase, import/export data

### Technical
- Dual-backend: Supabase (PostgreSQL) or Firebase (Firestore)
- Real-time sync via Supabase Realtime or Firebase listeners
- Atomic stock deduction — prevents race conditions on simultaneous orders
- 3-tier install check (server env → VITE vars → DB lock)
- Install Wizard with one-click SQL copy for Supabase setup
- Data import/export (JSON backup)
- TypeScript throughout

---

## Quick Start

```bash
# 1. Unzip the project and enter the directory
cd fruitopia

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
# Opens at http://localhost:3005

# 4. The Install Wizard opens automatically on first run
#    Choose Firebase or Supabase, enter credentials, click Save
#    The wizard never appears again after setup is complete
```

---

## Database Setup

### Option A — Supabase (Recommended)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → API** and copy:
   - **Project URL** — looks like `https://xxxx.supabase.co`
   - **anon / public key**
3. Go to **SQL Editor** and run the full schema below (or copy it from the Install Wizard):

```sql
-- Paste this entire block into Supabase SQL Editor and click Run

CREATE TABLE IF NOT EXISTS settings              (key TEXT PRIMARY KEY, value JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS products              (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS orders                (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS coupons               (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS categories            (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS newsletter            (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS reviews               (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS users                 (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS product_images        (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS product_variant_groups (id TEXT PRIMARY KEY, data JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS product_variants      (id TEXT PRIMARY KEY, data JSONB NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON settings              TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON products              TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON orders                TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON coupons               TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON categories            TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON newsletter            TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON reviews               TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON users                 TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_images        TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_variant_groups TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON product_variants      TO anon;

ALTER PUBLICATION supabase_realtime ADD TABLE settings;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

ALTER TABLE settings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter            ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variant_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read settings"         ON settings              FOR SELECT USING (true);
CREATE POLICY "public read products"         ON products              FOR SELECT USING (true);
CREATE POLICY "public read categories"       ON categories            FOR SELECT USING (true);
CREATE POLICY "public read reviews"          ON reviews               FOR SELECT USING (true);
CREATE POLICY "public read coupons"          ON coupons               FOR SELECT USING (true);
CREATE POLICY "public read product_images"   ON product_images        FOR SELECT USING (true);
CREATE POLICY "public read variant_groups"   ON product_variant_groups FOR SELECT USING (true);
CREATE POLICY "public read product_variants" ON product_variants      FOR SELECT USING (true);
CREATE POLICY "admin write settings"         ON settings   FOR INSERT WITH CHECK (true);
CREATE POLICY "admin update settings"        ON settings   FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "admin delete settings"        ON settings   FOR DELETE USING (true);
CREATE POLICY "admin write products"         ON products   FOR INSERT WITH CHECK (true);
CREATE POLICY "admin update products"        ON products   FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "admin delete products"        ON products   FOR DELETE USING (true);
CREATE POLICY "admin write categories"       ON categories FOR INSERT WITH CHECK (true);
CREATE POLICY "admin update categories"      ON categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "admin delete categories"      ON categories FOR DELETE USING (true);
CREATE POLICY "admin write coupons"          ON coupons    FOR INSERT WITH CHECK (true);
CREATE POLICY "admin update coupons"         ON coupons    FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "admin delete coupons"         ON coupons    FOR DELETE USING (true);
CREATE POLICY "anon write pimages"           ON product_images         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon write pvgroups"          ON product_variant_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon write pvariants"         ON product_variants       FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public create orders"         ON orders   FOR INSERT WITH CHECK (true);
CREATE POLICY "admin read orders"            ON orders   FOR SELECT USING (true);
CREATE POLICY "admin update orders"          ON orders   FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "admin delete orders"          ON orders   FOR DELETE USING (true);
CREATE POLICY "public create reviews"        ON reviews  FOR INSERT WITH CHECK (true);
CREATE POLICY "admin update reviews"         ON reviews  FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "admin delete reviews"         ON reviews  FOR DELETE USING (true);
CREATE POLICY "public create newsletter"     ON newsletter FOR INSERT WITH CHECK (true);
CREATE POLICY "admin read newsletter"        ON newsletter FOR SELECT USING (true);
CREATE POLICY "admin delete newsletter"      ON newsletter FOR DELETE USING (true);
CREATE POLICY "public write users"           ON users    FOR ALL USING (true) WITH CHECK (true);
```

4. Paste your **Project URL** and **anon key** into the Install Wizard and click Save.

### Option B — Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project
2. Enable **Firestore Database** (start in test mode or production mode)
3. Go to **Firestore → Rules** tab and paste these rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

4. Go to **Project Settings → General → Your apps → Web app** and copy the config values
5. Paste them into the Install Wizard

---

## Deployment

### Render (Recommended)

1. Push your project to a GitHub repository
2. Connect the repo to [render.com](https://render.com) as a **Web Service**
3. Set build and start commands:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Node version: `22`
4. Add environment variables in the Render dashboard (optional — the wizard can set them too):
   ```
   NODE_ENV=production
   PORT=10000
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```
5. Deploy. Open the Render URL, complete the Install Wizard once, and you are done.

### cPanel (Node.js App)

1. Upload the project folder to your server via File Manager or FTP
2. In cPanel, go to **Setup Node.js App**:
   - Node.js version: 18 or higher
   - Application mode: Production
   - Application root: your project folder path
   - Application startup file: `dist-server/server.js`
3. Open the cPanel terminal and run:
   ```bash
   npm install
   npm run build
   ```
4. Add environment variables:
   ```
   NODE_ENV=production
   PORT=3005
   ```
5. Start the app. Visit your domain to complete the Install Wizard.

### Vercel

> Note: Vercel has a read-only filesystem. The wizard cannot write `.env` directly.
> After the wizard, it shows you the exact env vars — paste them into Vercel's dashboard.

1. Import the project to [vercel.com](https://vercel.com)
2. Build settings are auto-detected from `vercel.json`
3. Run the wizard on first visit — copy the env vars it shows
4. Go to **Vercel → Project → Settings → Environment Variables** and paste them
5. Trigger a redeploy. The wizard will not appear again.

### Netlify

Same process as Vercel. Add env vars in **Netlify → Site → Environment Variables** and redeploy.

> Tip: For best results, run the Node.js backend on Render and deploy only the frontend on Netlify. Set `NODE_API_URL` in Netlify env vars to point to your Render service URL.

### VPS / Docker

```bash
npm install
npm run build
NODE_ENV=production npm start

# Or with PM2 for process management:
pm2 start dist-server/server.js --name fruitopia
pm2 save
pm2 startup
```

---

## Admin Panel Guide

Access the admin panel at `/?admin=1` or by clicking the lock icon in the navbar. Log in with the credentials you set during the Install Wizard.

### Products & Stock
- Add new products with name, price, category, description, and images
- Set stock quantity per product or per variant
- Stock is atomically deducted when an order is placed — no overselling possible
- Low stock is visually flagged in the product list
- Import products from CSV or export the catalog

### Client Orders
- View all incoming orders with full customer and item details
- Update **Delivery Status**: Pending → Processing → Confirmed → Shipped → Delivered / Cancelled
- Update **Payment Status**: Unpaid (COD) → Paid → Delivery Fee Paid
- Manually notify a courier for any specific order using the **Notify Courier** button (visible when a courier provider is configured)
- Delete order records permanently

### Discount Coupons
- Create coupon codes with percentage or flat-amount discounts
- Set minimum order value, expiry date, and usage limits
- View active and expired coupons

### Moderation
- Approve or reject customer-submitted product reviews
- Approved reviews appear on the storefront product pages

### Page Sections
- Edit the homepage hero banner, featured sections, and promotional blocks
- Control section visibility without touching code

### CMS Settings
- Store name, logo, contact details
- Delivery zones and fees
- Payment gateway settings
- SMTP email configuration
- Order notification email templates

### Courier API
See the [Courier Integration](#courier-integration) section below.

### Backend
- View current backend (Supabase or Firebase)
- Switch backend without losing data (use export/import)
- Export all store data as a JSON backup
- Import data from a previous JSON backup

---

## Courier Integration

The **Courier API** tab in the Admin Panel lets you connect your store to courier services for automatic order dispatch.

### Supported Providers

**Bangladesh:**
- **Pathao** — OAuth2 authentication, supports city/zone/area targeting
- **RedX** — API key authentication, sandbox mode available
- **eCourier** — API key + password + ID authentication
- **Steadfast** — API key + secret key authentication

**International:**
- **DHL Express** — Basic auth (API key + secret), account number required
- **FedEx** — OAuth2 (client ID + secret), account number required
- **Aramex** — REST JSON, username/password/account/PIN authentication

### How to Configure

1. Go to **Admin Panel → Courier API**
2. Toggle **Enable Courier Auto-dispatch** to ON
3. Select your **Courier Provider** from the dropdown
4. Enter your API credentials (get them from your courier account portal)
5. Select the **Auto-dispatch Trigger**:
   - **Manual only** — no automatic dispatch; you press the button per order
   - **COD** — courier is notified the moment a COD order is placed
   - **Full payment confirmed** — courier notified when admin marks payment as Paid
   - **Delivery fee paid** — courier notified when partial COD delivery fee is confirmed
6. Enable **Sandbox / Test mode** if you want to test without creating real parcels
7. Click **Save Courier Settings**

### Manual Dispatch Per Order

In the **Orders tab**, each order row shows a **Notify Courier** button (visible when a courier is configured and enabled). Press it to manually send that specific order to the courier API at any time. The tracking ID appears as a toast notification on success.

### API Endpoints Used

| Provider  | Endpoint |
|-----------|----------|
| Pathao    | `https://api-hermes.pathao.com/aladdin/api/v1/` |
| RedX      | `https://openapi.redx.com.bd/v1.0.0-beta/parcel` |
| eCourier  | `https://ecourier.com.bd/api/order-create` |
| Steadfast | `https://portal.steadfast.com.bd/public-api/v1/create_order` |
| DHL       | `https://express.api.dhl.com/mydhlapi/shipments` |
| FedEx     | `https://apis.fedex.com` |
| Aramex    | `https://ws.aramex.net/ShippingAPI.V2/Shipping/Service_1_0.svc/json/CreateShipments` |

Sandbox endpoints are used automatically when sandbox mode is toggled on.

---

## Email / SMTP Setup

Configure SMTP in **Admin Panel → CMS Settings → Email**.

| Setting   | Example value |
|-----------|---------------|
| SMTP Host | `smtp.gmail.com` |
| SMTP Port | `587` |
| SMTP User | `yourstore@gmail.com` |
| SMTP Pass | App Password (not your Google login password) |

**Gmail setup:**
1. Enable 2-Step Verification on your Google account
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create an App Password for "Mail"
4. Use that 16-character password as SMTP Pass

Emails sent by the store:
- Order confirmation to customer
- Order status change notifications
- Password setup email for auto-created accounts
- Newsletter confirmation (if enabled)

If SMTP is not configured, emails are silently skipped and the store continues to work normally.

---

## User Accounts

### Registration Rules
- One email = one account. Duplicate registrations are blocked at both the local cache level and the database level.
- The duplicate check happens before OTP is sent, so users get an immediate clear error message.

### Guest Checkout and Auto Account Creation
When a guest places an order:
1. The system checks if an account exists for that email (localStorage + DB)
2. **Existing account found** — order is linked to their account; profile is updated with new address or phone
3. **No account found** — a new account is created automatically (no password set yet)
4. A "Set your password" email is sent (requires SMTP to be configured)
5. The customer clicks the email link to set a password and gain full account access

### Admin Access
- Admin URL: `/?admin=1` or the lock icon in the navbar
- Credentials are set during the Install Wizard
- Password is hashed before storage

---

## Environment Variables

Copy `.env.example` to `.env` and fill in your values. These can also be set directly in your hosting platform dashboard.

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | For Supabase | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | For Supabase | Supabase public anon key |
| `VITE_FIREBASE_API_KEY` | For Firebase | Firebase Web API key |
| `VITE_FIREBASE_PROJECT_ID` | For Firebase | Firebase project ID |
| `VITE_FIREBASE_AUTH_DOMAIN` | For Firebase | `project.firebaseapp.com` |
| `VITE_FIREBASE_STORAGE_BUCKET` | For Firebase | `project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | For Firebase | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | For Firebase | Firebase app ID |
| `PORT` | Optional | Server port (default: `3005`) |
| `NODE_ENV` | Optional | `development` or `production` |
| `SMTP_HOST` | Optional | SMTP server hostname |
| `SMTP_PORT` | Optional | SMTP port (default: `587`) |
| `SMTP_USER` | Optional | SMTP username / email address |
| `SMTP_PASS` | Optional | SMTP password or App Password |

---

## Project Structure

```
fruitopia/
├── src/                           # React frontend (Vite + TypeScript)
│   ├── App.tsx                    # Root component — install gate + routing
│   ├── types.ts                   # Shared TypeScript types
│   ├── installStatus.ts           # 3-tier install check (server → VITE vars → DB lock)
│   ├── firebase.ts                # Firebase client + dynamic config
│   ├── supabase.ts                # Supabase client + dynamic config
│   ├── db.ts                      # Dual-backend data layer (Supabase / Firebase)
│   ├── firestore-service.ts       # Firebase-specific helpers
│   ├── context/
│   │   └── AppContext.tsx         # Global state, order logic, courier dispatch
│   ├── services/
│   │   └── courierService.ts      # Real courier API integrations (7 providers)
│   └── components/
│       ├── AdminPanel.tsx         # Full admin dashboard
│       ├── AdminSectionSettings.tsx # Homepage section editor
│       ├── InstallWizard.tsx      # First-run setup wizard
│       ├── StoreFront.tsx         # Customer-facing store
│       ├── OrderTrackerPage.tsx   # Live order tracking for customers
│       ├── FirebaseGate.tsx       # Firebase auth wrapper
│       └── Toast.tsx              # Toast notification system
├── server.ts                      # Express server (dev + production)
│   ├── GET  /api/install-status   # Returns installed:true if credentials exist
│   ├── POST /api/save-config      # Writes Firebase credentials to .env
│   ├── POST /api/save-supabase-config # Writes Supabase credentials to .env
│   ├── GET  /firebase-config.json # Serves Firebase config from env vars
│   └── GET  /supabase-config.json # Serves Supabase config from env vars
├── api/                           # Vercel serverless equivalents of server.ts routes
├── public/                        # Static assets
├── .env.example                   # Environment variable template
├── vercel.json                    # Vercel deployment config
├── netlify.toml                   # Netlify deployment config
└── render.yaml                    # Render deployment config
```

---

## Troubleshooting

### Install Wizard appears again in incognito or on another device

This happens when:
- The `.env` file was not written (common on Vercel / Netlify — use their env dashboard instead)
- The server was not restarted after a manual `.env` edit — restart with `npm run dev` or `pm2 restart all`
- The DB `install_lock` record is missing — re-run the wizard once to recreate it

### `.env` not saved after Install Wizard on Vercel / Netlify

Vercel and Netlify have read-only filesystems. The wizard will show you the exact env vars to copy. Add them in your hosting platform's environment variables dashboard and redeploy.

### On Render / cPanel / VPS — `.env` write fails

This is usually a file permissions issue. Fix with:
```bash
chmod 664 .env
# or create the file first:
touch .env && chmod 664 .env
```

### Stock goes negative / overselling

This is fixed in the current version. Stock deduction uses atomic transactions. If you see stock issues, make sure you are running the latest version and that the `product_variants` table exists in Supabase (re-run the SQL schema if needed).

### Courier dispatch fails

- Check that your API credentials are correct and not expired
- Make sure **Sandbox mode** is toggled correctly (ON for testing, OFF for live)
- For Pathao, verify your City ID, Zone ID, and Area ID are valid numbers from the Pathao merchant portal
- Tracking IDs and error messages are shown as toast notifications and logged to the browser console

### TypeScript errors in `api/` or `lib/`

These files are Vercel serverless functions that compile in Vercel's environment. They do not affect `npm run dev` or `npm run build` for the main application and can be safely ignored locally.

### Real-time sync not working

- **Supabase**: Make sure `supabase_realtime` publication is enabled for `settings` and `orders` tables (included in the SQL schema above)
- **Firebase**: Ensure Firestore security rules allow reads and writes
- Check the browser console for connection errors

---

## License

Apache-2.0
