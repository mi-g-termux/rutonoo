// api/payment.ts  ── v7 SELF-CONTAINED (zero lib/ imports)
// Works on Vercel, Netlify Functions, Render, cPanel, VPS — everywhere.
// No relative imports outside api/. All gateway code is inlined here.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';

// ── Helpers ──────────────────────────────────────────────────────────────────
function origin(req: VercelRequest): string {
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  return `${proto}://${req.headers.host}`;
}
function ok(res: VercelResponse, body: unknown) { return res.status(200).json(body); }
function fail(res: VercelResponse, status: number, msg: string, extra?: object) {
  return res.status(status).json({ success: false, error: msg, ...extra });
}
function norm(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v || '';
  return String(s).trim().toLowerCase();
}
function env(k: string): string { return String(process.env[k] || '').trim(); }

// ── bKash ─────────────────────────────────────────────────────────────────────
function bkashBase(sandbox: boolean) {
  return sandbox
    ? 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout'
    : 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout';
}
async function bkashToken(appKey: string, appSecret: string, username: string, password: string, sandbox: boolean): Promise<string> {
  const r = await fetch(`${bkashBase(sandbox)}/token/grant`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', username, password },
    body: JSON.stringify({ app_key: appKey, app_secret: appSecret }),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!d.id_token) throw new Error(d.statusMessage || `bKash token failed (${r.status})`);
  return d.id_token as string;
}
async function bkashCreatePayment(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const amount = body.amount;
  const orderId = body.orderId || `QF-${Date.now()}`;
  const callbackURL = body.callbackURL || body.callbackUrl;
  if (!amount || !callbackURL) return fail(res, 400, 'amount and callbackURL required');
  const appKey   = body.appKey    || env('BKASH_APP_KEY');
  const appSecret = body.appSecret || env('BKASH_APP_SECRET');
  const username  = body.username  || env('BKASH_USERNAME');
  const password  = body.password  || env('BKASH_PASSWORD');
  const sandbox   = body.sandboxMode !== false && env('BKASH_SANDBOX') !== 'false';
  if (!appKey || !appSecret || !username || !password)
    return fail(res, 400, 'Missing bKash credentials');
  try {
    const token = await bkashToken(appKey, appSecret, username, password, sandbox);
    const r = await fetch(`${bkashBase(sandbox)}/create`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: token, 'X-APP-Key': appKey },
      body: JSON.stringify({
        mode: '0011', payerReference: orderId, callbackURL,
        amount: Number(amount).toFixed(2), currency: 'BDT', intent: 'sale', merchantInvoiceNumber: orderId,
      }),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!d.bkashURL) return fail(res, 502, d.statusMessage || 'bKash create failed');
    return ok(res, { success: true, bkashURL: d.bkashURL, paymentID: d.paymentID });
  } catch (e: any) { return fail(res, 500, e.message); }
}
async function bkashExecutePayment(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const paymentID = body.paymentID || body.paymentId || (req.query.paymentID as string);
  if (!paymentID) return fail(res, 400, 'paymentID required');
  const appKey   = body.appKey   || env('BKASH_APP_KEY');
  const appSecret = body.appSecret || env('BKASH_APP_SECRET');
  const username  = body.username  || env('BKASH_USERNAME');
  const password  = body.password  || env('BKASH_PASSWORD');
  const sandbox   = body.sandboxMode !== false && env('BKASH_SANDBOX') !== 'false';
  if (!appKey) return fail(res, 400, 'Missing bKash credentials');
  try {
    const token = await bkashToken(appKey, appSecret, username, password, sandbox);
    const r = await fetch(`${bkashBase(sandbox)}/execute`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: token, 'X-APP-Key': appKey },
      body: JSON.stringify({ paymentID }),
    });
    const d: any = await r.json().catch(() => ({}));
    if (d.transactionStatus !== 'Completed')
      return fail(res, 502, d.statusMessage || 'bKash execute failed', { transactionStatus: d.transactionStatus });
    return ok(res, { success: true, paymentID: d.paymentID, transactionId: d.trxID, amount: d.amount });
  } catch (e: any) { return fail(res, 500, e.message); }
}

// ── Nagad ─────────────────────────────────────────────────────────────────────
const NAGAD_PUB_KEY =
  '-----BEGIN PUBLIC KEY-----\n' +
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAty2hOpfNUS4NLFNwhJsy\n' +
  'JCfsLisFqcU8RcZGtUE/9SqLNCBR5GoxFAyx0RBfDOyOXyVlAj4nBjBKLi63rGzG\n' +
  'a04L+y4SLZjzukWZSrkXa3kcMtH2QQ1JcSf1hEt+gNW1u/m+ZHrXnXjg1JG9wKjN\n' +
  '/0HHTtA9rIa9XwIDAQAB\n' +
  '-----END PUBLIC KEY-----';
function nagadEncrypt(data: string, pubKey: string): string {
  return crypto.publicEncrypt({ key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING }, Buffer.from(data)).toString('base64');
}
function nagadSign(data: string, privKey: string): string {
  const s = crypto.createSign('SHA256'); s.update(data); s.end(); return s.sign(privKey, 'base64');
}
function asPem(key: string, label: 'PUBLIC' | 'PRIVATE'): string {
  if (key.includes('-----BEGIN')) return key.replace(/\\n/g, '\n');
  return `-----BEGIN ${label} KEY-----\n${key}\n-----END ${label} KEY-----`;
}
async function nagadCreatePayment(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, orderId } = body;
  const callbackUrl = body.callbackUrl || `${origin(req)}/?nagad=callback&orderId=${orderId}`;
  if (!amount || !orderId) return fail(res, 400, 'amount and orderId required');
  const merchantId   = body.merchantId    || env('NAGAD_MERCHANT_ID');
  const privateKeyRaw = body.privateKey   || env('NAGAD_PRIVATE_KEY');
  const isSandbox     = body.sandboxMode !== false && env('NAGAD_SANDBOX') !== 'false';
  if (!merchantId || !privateKeyRaw) return fail(res, 400, 'Missing NAGAD_MERCHANT_ID or NAGAD_PRIVATE_KEY');
  const base = isSandbox
    ? 'https://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs'
    : 'https://api.mynagad.com/api/dfs';
  const privKey = asPem(privateKeyRaw, 'PRIVATE');
  const pubKey  = body.publicKey ? asPem(body.publicKey, 'PUBLIC') : NAGAD_PUB_KEY;
  try {
    const datetime = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const challenge = crypto.randomBytes(20).toString('hex');
    const sensitive = { merchantId, datetime, orderId, challenge };
    const enc = nagadEncrypt(JSON.stringify(sensitive), pubKey);
    const sig = nagadSign(JSON.stringify(sensitive), privKey);
    const initR = await fetch(`${base}/check-out/initialize/${merchantId}/${orderId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KM-IP-V4': (req.headers['x-forwarded-for'] as string) || '127.0.0.1',
        'X-KM-Client-Type': 'PC_WEB', 'X-KM-Api-Version': 'v-0.2.0',
      },
      body: JSON.stringify({ dateTime: datetime, sensitiveData: enc, signature: sig }),
    });
    const initJ: any = await initR.json().catch(() => ({}));
    if (!initJ?.sensitiveData) return fail(res, 502, initJ?.reason || 'Nagad init failed');
    const cSens = { merchantId, orderId, amount: String(amount), currencyCode: '050', challenge };
    const cEnc  = nagadEncrypt(JSON.stringify(cSens), pubKey);
    const cSig  = nagadSign(JSON.stringify(cSens), privKey);
    const confR = await fetch(`${base}/check-out/complete/${initJ.paymentReferenceId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sensitiveData: cEnc, signature: cSig, merchantCallbackURL: callbackUrl }),
    });
    const confJ: any = await confR.json().catch(() => ({}));
    if (!confJ?.callBackUrl) return fail(res, 502, confJ?.reason || 'Nagad confirm failed');
    return ok(res, { success: true, callBackUrl: confJ.callBackUrl, orderId });
  } catch (e: any) { return fail(res, 500, e.message); }
}
async function nagadVerifyPayment(req: VercelRequest, res: VercelResponse) {
  const refId = (req.query.payment_ref_id as string) || req.body?.paymentRefId || req.body?.payment_ref_id;
  if (!refId) return fail(res, 400, 'paymentRefId required');
  const isSandbox = env('NAGAD_SANDBOX') !== 'false';
  const base = isSandbox
    ? 'https://sandbox.mynagad.com:10080/remote-payment-gateway-1.0/api/dfs'
    : 'https://api.mynagad.com/api/dfs';
  const r = await fetch(`${base}/verify/payment/${refId}`).catch(() => null);
  if (!r) return fail(res, 502, 'Nagad verify unreachable');
  const j: any = await r.json().catch(() => ({}));
  return ok(res, { success: j?.status === 'Success' || j?.statusCode === '000', raw: j });
}

// ── SSLCommerz ────────────────────────────────────────────────────────────────
const _sslPending = new Set<string>();
async function sslcommerzCreatePayment(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, orderId, customer = {}, productName = 'Order' } = body;
  if (!amount || !orderId) return fail(res, 400, 'amount and orderId required');
  const oid = String(orderId);
  if (_sslPending.has(oid)) return fail(res, 429, 'Already processing this order');
  _sslPending.add(oid);
  try {
    const storeId   = body.storeId   || body.sslCommerzStoreId   || env('SSLCZ_STORE_ID');
    const storePass = body.storePass || body.sslCommerzStorePassword || env('SSLCZ_STORE_PASSWORD');
    const sandbox   = body.sandboxMode !== false && env('SSLCZ_SANDBOX') !== 'false';
    if (!storeId || !storePass) return fail(res, 400, 'Missing SSLCommerz store credentials (SSLCZ_STORE_ID / SSLCZ_STORE_PASSWORD)');
    const base = sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
    const o = origin(req);
    const form = new URLSearchParams({
      store_id: storeId, store_passwd: storePass,
      total_amount: Number(amount).toFixed(2), currency: 'BDT', tran_id: oid,
      success_url: `${o}/api/sslcommerz/ipn?status=success&orderId=${encodeURIComponent(oid)}`,
      fail_url:    `${o}/api/sslcommerz/ipn?status=fail&orderId=${encodeURIComponent(oid)}`,
      cancel_url:  `${o}/api/sslcommerz/ipn?status=cancel&orderId=${encodeURIComponent(oid)}`,
      ipn_url:     `${o}/api/sslcommerz/ipn`,
      cus_name:    String(customer.name    || 'Customer'),
      cus_email:   String(customer.email   || 'noreply@example.com'),
      cus_phone:   String(customer.phone   || '01700000000'),
      cus_add1:    String(customer.address || 'N/A'),
      cus_city:    String(customer.city    || 'Dhaka'),
      cus_country: String(customer.country || 'Bangladesh'),
      shipping_method: 'NO', product_name: String(productName).slice(0, 100),
      product_category: 'general', product_profile: 'general',
      num_of_item: '1', value_a: oid,
    });
    const r = await fetch(`${base}/gwprocess/v4/api.php`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const text = await r.text();
    let j: any;
    try { j = JSON.parse(text); } catch { return fail(res, 502, `SSLCommerz returned non-JSON: ${text.slice(0, 120)}`); }
    if (j?.status !== 'SUCCESS' || !j?.GatewayPageURL)
      return fail(res, 502, j?.failedreason || j?.status || 'SSLCommerz session failed');
    return ok(res, { success: true, redirectUrl: j.GatewayPageURL, sessionkey: j.sessionkey });
  } catch (e: any) { return fail(res, 500, e.message); }
  finally { setTimeout(() => _sslPending.delete(oid), 30_000); }
}
async function sslcommerzIpn(req: VercelRequest, res: VercelResponse) {
  const body = req.method === 'POST' ? (req.body || {}) : {};
  const qs   = req.query;
  const status  = String(body.status  || qs.status  || 'unknown');
  const orderId = String(body.tran_id || qs.orderId || body.value_a || '');
  const valId   = String(body.val_id  || qs.val_id  || '');
  let verified = false;
  if (valId) {
    try {
      const storeId   = env('SSLCZ_STORE_ID');
      const storePass = env('SSLCZ_STORE_PASSWORD');
      const sandbox   = env('SSLCZ_SANDBOX') !== 'false';
      const base = sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
      const vr = await fetch(`${base}/validator/api/validationserverAPI.php?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePass)}&format=json`);
      if (vr.ok) { const vj: any = await vr.json().catch(() => ({})); verified = vj?.status === 'VALID' || vj?.status === 'VALIDATED'; }
    } catch { /* ignore */ }
  }
  const flag = status === 'success' ? (verified ? 'success' : 'fail') : status;
  // Include val_id in redirect so frontend can verify the transaction
  const redirectUrl = new URL('/', origin(req));
  redirectUrl.searchParams.set('sslcz', flag);
  redirectUrl.searchParams.set('orderId', orderId);
  if (valId) redirectUrl.searchParams.set('val_id', valId);
  return res.redirect(302, redirectUrl.toString());
}

// ── Stripe ────────────────────────────────────────────────────────────────────
async function stripeCreatePaymentIntent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, currency = 'usd' } = body;
  if (!amount) return fail(res, 400, 'amount required');
  const secretKey = body.secretKey || env('STRIPE_SECRET_KEY');
  if (!secretKey) return fail(res, 400, 'Missing STRIPE_SECRET_KEY');
  const r = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      amount: String(Math.round(Number(amount) * 100)),
      currency: String(currency).toLowerCase(),
      'automatic_payment_methods[enabled]': 'true',
    }).toString(),
  });
  const d: any = await r.json().catch(() => ({}));
  if (d.error) return fail(res, 502, d.error.message);
  return ok(res, { success: true, clientSecret: d.client_secret, paymentIntentId: d.id });
}
async function stripeConfirmPayment(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { paymentIntentId, paymentMethodId } = body;
  if (!paymentIntentId || !paymentMethodId) return fail(res, 400, 'paymentIntentId and paymentMethodId required');
  const secretKey = body.secretKey || env('STRIPE_SECRET_KEY');
  if (!secretKey) return fail(res, 400, 'Missing STRIPE_SECRET_KEY');
  const r = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ payment_method: paymentMethodId }).toString(),
  });
  const d: any = await r.json().catch(() => ({}));
  if (d.error) return fail(res, 502, d.error.message);
  return ok(res, { success: true, status: d.status, transactionId: d.id });
}
async function stripeCreateCheckoutSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, currency = 'usd', orderId, productName = 'Order', customerEmail, successUrl, cancelUrl } = body;
  if (!amount || !successUrl || !cancelUrl) return fail(res, 400, 'amount, successUrl, cancelUrl required');
  const secretKey = body.secretKey || env('STRIPE_SECRET_KEY');
  if (!secretKey) return fail(res, 400, 'Missing STRIPE_SECRET_KEY');
  const p = new URLSearchParams({
    mode: 'payment', success_url: successUrl, cancel_url: cancelUrl,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': String(currency).toLowerCase(),
    'line_items[0][price_data][unit_amount]': String(Math.round(Number(amount) * 100)),
    'line_items[0][price_data][product_data][name]': String(productName).slice(0, 250),
  });
  if (customerEmail) p.set('customer_email', String(customerEmail));
  if (orderId) { p.set('client_reference_id', String(orderId)); p.set('metadata[orderId]', String(orderId)); }
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST', headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString(),
  });
  const d: any = await r.json().catch(() => ({}));
  if (d.error || !d.url) return fail(res, 502, d.error?.message || 'Stripe checkout session failed');
  return ok(res, { success: true, sessionId: d.id, url: d.url });
}

// ── PayPal ────────────────────────────────────────────────────────────────────
async function ppToken(clientId: string, secret: string, sandbox: boolean) {
  const base = sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${clientId}:${secret}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d: any = await r.json().catch(() => ({}));
  if (!d.access_token) throw new Error(`PayPal token failed: ${d.error_description || r.status}`);
  return { token: d.access_token as string, base };
}
async function paypalCreateOrder(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, currency = 'USD' } = body;
  if (!amount) return fail(res, 400, 'amount required');
  const clientId     = body.clientId     || env('PAYPAL_CLIENT_ID');
  const clientSecret = body.clientSecret || env('PAYPAL_CLIENT_SECRET');
  const sandbox      = body.sandboxMode !== false && env('PAYPAL_SANDBOX') !== 'false';
  if (!clientId || !clientSecret) return fail(res, 400, 'Missing PayPal credentials');
  try {
    const { token, base } = await ppToken(clientId, clientSecret, sandbox);
    const o = origin(req);
    const r = await fetch(`${base}/v2/checkout/orders`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{ amount: { currency_code: String(currency).toUpperCase(), value: Number(amount).toFixed(2) } }],
        application_context: {
          return_url: `${o}/api/paypal/callback?status=success`,
          cancel_url: `${o}/api/paypal/callback?status=cancelled`,
        },
      }),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!d.id) return fail(res, 502, d.message || 'PayPal order creation failed');
    return ok(res, { success: true, orderId: d.id, approvalUrl: d.links?.find((l: any) => l.rel === 'approve')?.href });
  } catch (e: any) { return fail(res, 500, e.message); }
}
async function paypalCaptureOrder(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { orderId } = body;
  if (!orderId) return fail(res, 400, 'orderId required');
  const clientId     = body.clientId     || env('PAYPAL_CLIENT_ID');
  const clientSecret = body.clientSecret || env('PAYPAL_CLIENT_SECRET');
  const sandbox      = body.sandboxMode !== false && env('PAYPAL_SANDBOX') !== 'false';
  if (!clientId || !clientSecret) return fail(res, 400, 'Missing PayPal credentials');
  try {
    const { token, base } = await ppToken(clientId, clientSecret, sandbox);
    const r = await fetch(`${base}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const d: any = await r.json().catch(() => ({}));
    if (d.status === 'COMPLETED')
      return ok(res, { success: true, transactionId: d.purchase_units?.[0]?.payments?.captures?.[0]?.id });
    return fail(res, 502, d.message || 'PayPal capture failed');
  } catch (e: any) { return fail(res, 500, e.message); }
}
function paypalCallback(req: VercelRequest, res: VercelResponse) {
  const { token, status } = req.query;
  return res.redirect(302, `${origin(req)}/?paypal=${status === 'cancelled' ? 'cancelled' : 'approved'}&orderId=${token || ''}`);
}

// ── Razorpay ─────────────────────────────────────────────────────────────────
async function razorpayCreateOrder(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, currency = 'INR', orderId } = body;
  if (!amount) return fail(res, 400, 'amount required');
  const keyId     = body.keyId    || env('RAZORPAY_KEY_ID');
  const keySecret = body.keySecret || env('RAZORPAY_KEY_SECRET');
  if (!keyId || !keySecret) return fail(res, 400, 'Missing Razorpay credentials');
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64'), 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: Math.round(Number(amount) * 100), currency, receipt: String(orderId || `r_${Date.now()}`) }),
  });
  const d: any = await r.json().catch(() => ({}));
  if (!d.id) return fail(res, 502, d.error?.description || 'Razorpay order failed');
  return ok(res, { success: true, orderId: d.id, amount: d.amount, currency: d.currency, keyId });
}
async function razorpayVerifyPayment(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return fail(res, 400, 'Missing Razorpay signature fields');
  const keySecret = body.keySecret || env('RAZORPAY_KEY_SECRET');
  if (!keySecret) return fail(res, 400, 'Missing RAZORPAY_KEY_SECRET');
  const expected = crypto.createHmac('sha256', keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  const verified = expected.length === String(razorpay_signature).length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(razorpay_signature)));
  return ok(res, { success: verified, verified });
}

// ── Paytm ────────────────────────────────────────────────────────────────────
async function paytmInitiate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, orderId, customerId } = body;
  if (!amount || !orderId) return fail(res, 400, 'amount and orderId required');
  const mid = body.mid || env('PAYTM_MID');
  const key = body.key || env('PAYTM_KEY');
  if (!mid || !key) return fail(res, 400, 'Missing Paytm credentials (PAYTM_MID, PAYTM_KEY)');
  const sandbox = body.sandboxMode !== false && env('PAYTM_SANDBOX') !== 'false';
  const base = sandbox ? 'https://securegw-stage.paytm.in' : 'https://securegw.paytm.in';
  const callbackUrl = body.callbackUrl || `${origin(req)}/api/paytm/callback?orderId=${encodeURIComponent(orderId)}`;
  const txnBody = JSON.stringify({
    body: {
      requestType: 'Payment', mid, websiteName: 'WEBSTAGING',
      orderId, callbackUrl, txnAmount: { value: Number(amount).toFixed(2), currency: 'INR' },
      userInfo: { custId: customerId || 'CUST_' + Date.now() },
    },
  });
  const checksum = crypto.createHmac('sha256', key).update(txnBody).digest('base64');
  const r = await fetch(`${base}/theia/api/v1/initiateTransaction?mid=${mid}&orderId=${encodeURIComponent(orderId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-checksum': checksum },
    body: txnBody,
  });
  const d: any = await r.json().catch(() => ({}));
  const txnToken = d?.body?.txnToken;
  if (!txnToken) return fail(res, 502, d?.body?.resultInfo?.resultMsg || 'Paytm initiate failed');
  return ok(res, { success: true, txnToken, orderId, mid, base });
}
async function paytmCallback(req: VercelRequest, res: VercelResponse) {
  const orderId = (req.query.orderId as string) || req.body?.orderId || '';
  const status  = req.body?.STATUS || req.body?.status || 'UNKNOWN';
  return res.redirect(302, `${origin(req)}/?paytm=${status === 'TXN_SUCCESS' ? 'success' : 'fail'}&orderId=${encodeURIComponent(orderId)}`);
}

// ── UPI ──────────────────────────────────────────────────────────────────────
async function upiCreateIntent(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, orderId, note } = body;
  if (!amount || !orderId) return fail(res, 400, 'amount and orderId required');
  const upiId = body.upiId || env('UPI_ID');
  const payeeName = body.payeeName || env('UPI_PAYEE_NAME') || 'Store';
  if (!upiId) return fail(res, 400, 'Missing UPI ID');
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${Number(amount).toFixed(2)}&cu=INR&tn=${encodeURIComponent(note || `Order ${orderId}`)}&tr=${encodeURIComponent(orderId)}`;
  return ok(res, { success: true, upiLink, upiId, orderId });
}

// ── JazzCash ─────────────────────────────────────────────────────────────────
async function jazzcashInitiate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, orderId, customerPhone } = body;
  if (!amount || !orderId) return fail(res, 400, 'amount and orderId required');
  const mid     = body.mid     || env('JAZZCASH_MID');
  const password = body.password || env('JAZZCASH_PASSWORD');
  const hashKey  = body.hashKey  || env('JAZZCASH_HASH_KEY');
  if (!mid || !password || !hashKey) return fail(res, 400, 'Missing JazzCash credentials');
  const sandbox = body.sandboxMode !== false && env('JAZZCASH_SANDBOX') !== 'false';
  const base = sandbox
    ? 'https://sandbox.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction'
    : 'https://payments.jazzcash.com.pk/ApplicationAPI/API/2.0/Purchase/DoMWalletTransaction';
  const dt = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const exp = new Date(Date.now() + 24 * 3600_000).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const amt = String(Math.round(Number(amount) * 100)).padStart(10, '0');
  const hashStr = `${hashKey}&${dt}&${exp}&PKR&${orderId}&${mid}&${password}&${customerPhone || ''}&${amt}&MWALLET&${orderId}`;
  const hash = crypto.createHmac('sha256', hashKey).update(hashStr).digest('base64');
  const r = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pp_Amount: amt, pp_BillReference: orderId, pp_Description: `Order ${orderId}`,
      pp_Language: 'EN', pp_MerchantID: mid, pp_Password: password,
      pp_MobileNumber: customerPhone || '', pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: dt, pp_TxnExpiryDateTime: exp,
      pp_TxnRefNo: orderId, pp_TxnType: 'MWALLET', pp_SecureHash: hash,
    }),
  });
  const d: any = await r.json().catch(() => ({}));
  if (d?.pp_ResponseCode !== '000') return fail(res, 502, d?.pp_ResponseMessage || 'JazzCash initiate failed');
  return ok(res, { success: true, transactionId: d.pp_TxnRefNo, response: d });
}
async function jazzcashCallback(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const code = String(body.pp_ResponseCode || '');
  const orderId = String(body.pp_TxnRefNo || req.query.orderId || '');
  return res.redirect(302, `${origin(req)}/?jazzcash=${code === '000' ? 'success' : 'fail'}&orderId=${encodeURIComponent(orderId)}`);
}

// ── Easypaisa ─────────────────────────────────────────────────────────────────
async function easypaisaInitiate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, orderId, customerPhone } = body;
  if (!amount || !orderId) return fail(res, 400, 'amount and orderId required');
  const storeId  = body.storeId  || env('EASYPAISA_STORE_ID');
  const hashKey  = body.hashKey  || env('EASYPAISA_HASH_KEY');
  if (!storeId || !hashKey) return fail(res, 400, 'Missing Easypaisa credentials');
  const ts = Date.now();
  const amt = Number(amount).toFixed(2);
  const hashStr = `amount=${amt}&orderRefNum=${orderId}&paymentToken=&storeId=${storeId}&timeStamp=${ts}&token=&hashKey=${hashKey}`;
  const hash = crypto.createHash('sha256').update(hashStr).digest('hex').toUpperCase();
  const postbackUrl = body.postbackUrl || `${origin(req)}/api/easypaisa/callback`;
  const sandbox = body.sandboxMode !== false && env('EASYPAISA_SANDBOX') !== 'false';
  const base = 'https://easypaisa.com.pk/easypay/Index.jsf';
  const r = await fetch(base, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      storeId, amount: amt, orderRefNum: orderId, mobileAccountNo: customerPhone || '',
      emailAddress: '', paymentToken: '', timeStamp: String(ts),
      signature: hash, encryptedHashRequest: '', postBackURL: postbackUrl,
    }).toString(),
  });
  const text = await r.text().catch(() => '');
  if (r.status >= 400) return fail(res, 502, `Easypaisa error (HTTP ${r.status})`);
  return ok(res, { success: true, raw: text.slice(0, 500), orderId });
}
async function easypaisaCallback(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const status  = String(body.status  || req.query.status  || 'fail');
  const orderId = String(body.orderRefNum || req.query.orderId || '');
  return res.redirect(302, `${origin(req)}/?easypaisa=${status === '00' || status.toLowerCase() === 'success' ? 'success' : 'fail'}&orderId=${encodeURIComponent(orderId)}`);
}

// ── PayFast ─────────────────���─────────────────────────────────────────────────
async function payfastInitiate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');
  const body = req.body || {};
  const { amount, orderId, customerEmail, itemName = 'Order' } = body;
  if (!amount || !orderId) return fail(res, 400, 'amount and orderId required');
  const merchantId  = body.merchantId  || env('PAYFAST_MERCHANT_ID');
  const merchantKey = body.merchantKey || env('PAYFAST_MERCHANT_KEY');
  const passphrase  = body.passphrase  || env('PAYFAST_PASSPHRASE') || '';
  if (!merchantId || !merchantKey) return fail(res, 400, 'Missing PayFast credentials');
  const sandbox = body.sandboxMode !== false && env('PAYFAST_SANDBOX') !== 'false';
  const base = sandbox ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process';
  const o = origin(req);
  const data: Record<string, string> = {
    merchant_id: merchantId, merchant_key: merchantKey,
    return_url:  `${o}/?payfast=success&orderId=${encodeURIComponent(orderId)}`,
    cancel_url:  `${o}/?payfast=cancelled&orderId=${encodeURIComponent(orderId)}`,
    notify_url:  `${o}/api/payfast/ipn`,
    email_address: customerEmail || '',
    m_payment_id: orderId,
    amount: Number(amount).toFixed(2),
    item_name: String(itemName).slice(0, 100),
  };
  if (passphrase) data.passphrase = passphrase;
  const queryStr = Object.entries(data).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v).trim())}`).join('&');
  const signature = crypto.createHash('md5').update(queryStr).digest('hex');
  data.signature = signature;
  const form = Object.entries(data).map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, '&quot;')}">`).join('');
  const html = `<!DOCTYPE html><html><body><form id="pf" method="POST" action="${base}">${form}</form><script>document.getElementById('pf').submit();</script></body></html>`;
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
async function payfastCallback(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const orderId = String(body.m_payment_id || req.query.orderId || '');
  return res.redirect(302, `${origin(req)}/?payfast=success&orderId=${encodeURIComponent(orderId)}`);
}
async function payfastIpn(req: VercelRequest, res: VercelResponse) {
  const body = req.body || {};
  const orderId = String(body.m_payment_id || '');
  const status  = String(body.payment_status || '');
  console.log('[PayFast IPN]', { orderId, status });
  return res.status(200).send('OK');
}

// ── Test Connection ───────────────────────────────────────────────────────────
async function testConnection(req: VercelRequest, res: VercelResponse) {
  const gateway = norm(req.query.gateway);
  const creds: any = req.body?.credentials || req.body || {};
  if (gateway === 'stripe') {
    const key = creds.secretKey || env('STRIPE_SECRET_KEY');
    if (!key) return ok(res, { success: false, error: 'Secret key required' });
    const r = await fetch('https://api.stripe.com/v1/balance', { headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) return ok(res, { success: true, message: 'Stripe credentials valid' });
    const d: any = await r.json().catch(() => ({}));
    return ok(res, { success: false, error: d?.error?.message || 'Invalid Stripe credentials' });
  }
  if (gateway === 'paypal') {
    const clientId = creds.clientId || env('PAYPAL_CLIENT_ID');
    const secret   = creds.clientSecret || env('PAYPAL_CLIENT_SECRET');
    const sandbox  = (creds.sandbox ?? 'true') !== 'false';
    if (!clientId || !secret) return ok(res, { success: false, error: 'Client ID and Secret required' });
    try {
      const { token } = await ppToken(clientId, secret, sandbox);
      return ok(res, { success: !!token, message: 'PayPal credentials valid' });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }
  if (gateway === 'sslcommerz') {
    const storeId   = creds.storeId   || env('SSLCZ_STORE_ID');
    const storePass = creds.storePass || env('SSLCZ_STORE_PASSWORD');
    const sandbox   = (creds.sandbox ?? 'true') !== 'false';
    if (!storeId || !storePass) return ok(res, { success: false, error: 'Store ID and Password required' });
    const base = sandbox ? 'https://sandbox.sslcommerz.com' : 'https://securepay.sslcommerz.com';
    try {
      const r = await fetch(`${base}/validator/api/validationserverAPI.php?val_id=test&store_id=${encodeURIComponent(storeId)}&store_passwd=${encodeURIComponent(storePass)}&v=1&format=json`);
      const d: any = await r.json().catch(() => ({}));
      if (d?.failedreason || (d?.status || '').toUpperCase() === 'FAILED') return ok(res, { success: false, error: d.failedreason || 'Invalid credentials' });
      return ok(res, { success: true, message: 'SSLCommerz credentials reachable' });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }
  if (gateway === 'razorpay') {
    const keyId     = creds.keyId     || env('RAZORPAY_KEY_ID');
    const keySecret = creds.keySecret || env('RAZORPAY_KEY_SECRET');
    if (!keyId || !keySecret) return ok(res, { success: false, error: 'Key ID and Secret required' });
    const r = await fetch('https://api.razorpay.com/v1/payments?count=1', {
      headers: { Authorization: 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64') },
    });
    if (r.ok) return ok(res, { success: true, message: 'Razorpay credentials valid' });
    const d: any = await r.json().catch(() => ({}));
    return ok(res, { success: false, error: d?.error?.description || 'Invalid Razorpay credentials' });
  }
  if (gateway === 'bkash') {
    const appKey    = creds.appKey    || env('BKASH_APP_KEY');
    const appSecret = creds.appSecret || env('BKASH_APP_SECRET');
    const username  = creds.username  || env('BKASH_USERNAME');
    const password  = creds.password  || env('BKASH_PASSWORD');
    const sandbox   = (creds.sandbox ?? 'true') !== 'false';
    if (!appKey || !appSecret || !username || !password) return ok(res, { success: false, error: 'All bKash credentials required' });
    try {
      const token = await bkashToken(appKey, appSecret, username, password, sandbox);
      return ok(res, { success: !!token, message: 'bKash credentials valid' });
    } catch (e: any) { return ok(res, { success: false, error: e.message }); }
  }
  return ok(res, { success: false, error: `Test connection not supported for gateway: ${gateway}` });
}

// ── Route Map ──────────────────────────────────────────────────────────────────
type Handler = (req: VercelRequest, res: VercelResponse) => unknown;
const ROUTES: Record<string, Record<string, Handler>> = {
  bkash:     { 'create-payment': bkashCreatePayment, 'execute-payment': bkashExecutePayment },
  nagad:     { 'create-payment': nagadCreatePayment,  'verify-payment':  nagadVerifyPayment },
  sslcommerz:{ 'create-payment': sslcommerzCreatePayment, 'ipn': sslcommerzIpn },
  stripe:    { 'create-payment-intent': stripeCreatePaymentIntent, 'confirm-payment': stripeConfirmPayment, 'create-checkout-session': stripeCreateCheckoutSession },
  paypal:    { 'create-order': paypalCreateOrder, 'capture-order': paypalCaptureOrder, 'callback': paypalCallback },
  razorpay:  { 'create-order': razorpayCreateOrder, 'verify-payment': razorpayVerifyPayment },
  paytm:     { 'initiate': paytmInitiate, 'callback': paytmCallback },
  upi:       { 'create-intent': upiCreateIntent },
  jazzcash:  { 'initiate': jazzcashInitiate, 'callback': jazzcashCallback },
  easypaisa: { 'initiate': easypaisaInitiate, 'callback': easypaisaCallback },
  payfast:   { 'initiate': payfastInitiate, 'callback': payfastCallback, 'ipn': payfastIpn },
};

// ── Main Handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.status(204).end();
    return;
  }

  const gateway = norm(req.query.gateway);
  const action  = norm(req.query.action);

  if (!gateway || !action) {
    res.status(400).json({ error: 'Missing ?gateway=&action=', available: Object.keys(ROUTES) });
    return;
  }

  // Special: test-connection
  if (action === 'test-connection') {
    try { await testConnection(req, res); } catch (e: any) { if (!res.headersSent) fail(res, 500, e?.message); }
    return;
  }

  const gr = ROUTES[gateway];
  if (!gr) { res.status(404).json({ error: `Unknown gateway: ${gateway}`, available: Object.keys(ROUTES) }); return; }

  const fn = gr[action];
  if (!fn) { res.status(404).json({ error: `Unknown action: ${action}`, available: Object.keys(gr) }); return; }

  try {
    await fn(req, res);
  } catch (e: any) {
    if (!res.headersSent) fail(res, 500, e?.message || 'Internal error');
  }
}
