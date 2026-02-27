/**
 * Semblance License Worker — Cloudflare Worker
 *
 * Handles Stripe webhooks, generates Ed25519-signed license keys,
 * and delivers them via Resend email.
 *
 * Routes:
 *   POST /webhook  — Stripe webhook handler
 *   GET  /verify/:key — License key verification (future web dashboard)
 *   POST /revoke   — Subscription cancellation handler
 *   POST /portal   — Create Stripe Billing Portal session for subscription management
 *   GET  /thanks   — Post-checkout thank-you page
 *
 * Environment secrets:
 *   STRIPE_WEBHOOK_SECRET — Stripe webhook signing secret
 *   STRIPE_API_KEY — Stripe API key (for line item lookup)
 *   LICENSE_SIGNING_KEY — Ed25519 private key PEM
 *   RESEND_API_KEY — Resend email API key
 *   RESEND_FROM_EMAIL — Sender email address
 *
 * KV Namespace:
 *   LICENSES — Stores license records keyed by Stripe customer ID
 *
 * KV Special Keys:
 *   "founding_seat_counter" — Atomic counter for founding member seat numbers (1–500)
 */

interface Env {
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_API_KEY: string;
  LICENSE_SIGNING_KEY: string;
  RESEND_API_KEY: string;
  RESEND_FROM_EMAIL: string;
  LICENSES: KVNamespace;
}

interface LicenseRecord {
  key: string;
  tier: string;
  email: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  seat?: number;
}

// ─── Product ID → Tier Mapping ──────────────────────────────────────────
// These are the live Stripe product IDs created for Semblance.

const PRODUCT_TIER_MAP: Record<string, 'digital-representative' | 'lifetime' | 'founding'> = {
  'prod_U3Rh6qu0KJWryy': 'digital-representative',  // Digital Representative Monthly
  'prod_U3Rh7qdxl8ucIL': 'lifetime',                 // Digital Representative Lifetime
  'prod_U3RhNRzimJU24D': 'founding',                  // Founding Member
};

const MAX_FOUNDING_SEATS = 500;

// ─── Crypto Helpers ───────────────────────────────────────────────────────

function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlEncodeString(str: string): string {
  return base64urlEncode(new TextEncoder().encode(str));
}

async function importEd25519PrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryStr = atob(pemBody);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return crypto.subtle.importKey('pkcs8', bytes.buffer, { name: 'Ed25519' }, false, ['sign']);
}

async function sha256Hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── License Key Generation ──────────────────────────────────────────────

interface GenerateKeyOptions {
  tier: 'digital-representative' | 'lifetime' | 'founding';
  email: string;
  expiresAt: string | null;
  seat?: number;
  privateKey: CryptoKey;
}

async function generateLicenseKey(opts: GenerateKeyOptions): Promise<string> {
  const header = base64urlEncodeString(JSON.stringify({ alg: 'EdDSA', typ: 'LIC' }));

  const emailHash = await sha256Hex(opts.email.toLowerCase().trim());

  const payloadObj: Record<string, unknown> = {
    tier: opts.tier,
    sub: emailHash,
  };
  if (opts.expiresAt) {
    payloadObj.exp = opts.expiresAt;
  }
  if (opts.seat !== undefined) {
    payloadObj.seat = opts.seat;
  }

  const payload = base64urlEncodeString(JSON.stringify(payloadObj));
  const signingInput = new TextEncoder().encode(`${header}.${payload}`);

  const signatureBuffer = await crypto.subtle.sign('Ed25519', opts.privateKey, signingInput);
  const signature = base64urlEncode(signatureBuffer);

  return `sem_${header}.${payload}.${signature}`;
}

// ─── Founding Seat Counter ──────────────────────────────────────────────

async function allocateFoundingSeat(kv: KVNamespace): Promise<number | null> {
  const current = await kv.get('founding_seat_counter');
  const nextSeat = current ? parseInt(current, 10) + 1 : 1;

  if (nextSeat > MAX_FOUNDING_SEATS) {
    return null; // Sold out
  }

  await kv.put('founding_seat_counter', String(nextSeat));
  return nextSeat;
}

// ─── Stripe Helpers ─────────────────────────────────────────────────────

async function verifyStripeSignature(
  body: string,
  signatureHeader: string,
  secret: string
): Promise<boolean> {
  const parts = signatureHeader.split(',');
  const timestampPart = parts.find((p) => p.startsWith('t='));
  const signaturePart = parts.find((p) => p.startsWith('v1='));

  if (!timestampPart || !signaturePart) return false;

  const timestamp = timestampPart.slice(2);
  const expectedSig = signaturePart.slice(3);

  // Check timestamp is within 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const signedPayload = `${timestamp}.${body}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return computedSig === expectedSig;
}

/**
 * Fetch the product ID from a checkout session's line items via Stripe API.
 */
async function getProductIdFromSession(sessionId: string, apiKey: string): Promise<string | null> {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}/line_items?limit=1`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );

  if (!response.ok) return null;

  const data = (await response.json()) as {
    data: Array<{ price: { product: string } }>;
  };

  return data.data?.[0]?.price?.product ?? null;
}

/**
 * Fetch a customer's email from Stripe API.
 */
async function getCustomerEmail(customerId: string, apiKey: string): Promise<string | null> {
  const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { email?: string };
  return data.email ?? null;
}

// ─── Email Delivery ──────────────────────────────────────────────────────

async function sendLicenseEmail(
  apiKey: string,
  fromEmail: string,
  toEmail: string,
  licenseKey: string,
  tier: string,
  seat?: number
): Promise<void> {
  const tierLabel =
    tier === 'founding' ? `Founding Member #${seat ?? '?'} (Lifetime)` :
    tier === 'lifetime' ? 'Lifetime' :
    'Digital Representative';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject: `Your Semblance ${tierLabel} License`,
      html: `
        <div style="font-family: 'DM Sans', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #A8B4C0; background-color: #0B0E11;">
          <h1 style="font-family: 'Fraunces', serif; font-weight: 300; color: #EEF1F4; font-size: 28px; margin-bottom: 8px;">Welcome to Semblance</h1>
          <p style="color: #6ECFA3; font-size: 14px; margin-bottom: 32px;">${tierLabel} Access</p>

          <p style="line-height: 1.6; margin-bottom: 24px;">Your license key is below. Semblance will automatically detect this email and activate your license when you connect your email account.</p>

          <div style="background: #111518; border: 1px solid #1E2227; border-radius: 8px; padding: 20px; margin-bottom: 24px; font-family: 'DM Mono', monospace; font-size: 13px; word-break: break-all; color: #6ECFA3;">
            SEMBLANCE_LICENSE_KEY:${licenseKey}
          </div>

          <p style="line-height: 1.6; margin-bottom: 16px;">You can also activate manually:</p>
          <ol style="line-height: 1.8; margin-bottom: 24px;">
            <li>Open Semblance</li>
            <li>Go to Settings</li>
            <li>Paste your license key in the activation field</li>
          </ol>

          <p style="line-height: 1.6; margin-bottom: 8px;">Or use this deep link:</p>
          <a href="semblance://activate?key=${encodeURIComponent(licenseKey)}" style="color: #6ECFA3; text-decoration: underline;">Activate in Semblance</a>

          <hr style="border: none; border-top: 1px solid #1E2227; margin: 32px 0;" />
          <p style="font-size: 12px; color: #5E6B7C;">Your intelligence. Your device. Your rules.</p>
          <p style="font-size: 12px; color: #5E6B7C;">Semblance — semblance.run</p>
        </div>
      `,
      text: `Welcome to Semblance — ${tierLabel} Access\n\nYour license key:\nSEMBLANCE_LICENSE_KEY:${licenseKey}\n\nActivate: semblance://activate?key=${encodeURIComponent(licenseKey)}\n\nOr paste the key manually in Settings > License.\n\nYour intelligence. Your device. Your rules.\nSemblance — semblance.run`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error: ${response.status} ${errorText}`);
  }
}

// ─── Route Handlers ──────────────────────────────────────────────────────

async function handleWebhook(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const valid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body) as {
    type: string;
    data: { object: Record<string, unknown> };
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const sessionId = session.id as string;
      const customerId = session.customer as string;
      const mode = session.mode as string;

      // Get customer email — try session fields first, fall back to Stripe API
      let customerEmail =
        (session.customer_email as string) ||
        ((session.customer_details as Record<string, unknown> | undefined)?.email as string) ||
        '';

      if (!customerEmail && customerId) {
        customerEmail = (await getCustomerEmail(customerId, env.STRIPE_API_KEY)) ?? '';
      }

      // Idempotency: check if we already processed this customer
      const existing = await env.LICENSES.get(`customer:${customerId}`);
      if (existing) {
        const existingRecord = JSON.parse(existing) as LicenseRecord;
        if (!existingRecord.revoked) {
          // Already has an active license — don't generate a duplicate
          return new Response('OK', { status: 200 });
        }
      }

      // Determine tier from the product in the line items (not metadata)
      const productId = await getProductIdFromSession(sessionId, env.STRIPE_API_KEY);
      let tier: 'digital-representative' | 'lifetime' | 'founding';
      let expiresAt: string | null = null;
      let seat: number | undefined;

      if (productId && PRODUCT_TIER_MAP[productId]) {
        tier = PRODUCT_TIER_MAP[productId];
      } else if (mode === 'subscription') {
        tier = 'digital-representative';
      } else {
        tier = 'lifetime';
      }

      if (tier === 'founding') {
        const allocatedSeat = await allocateFoundingSeat(env.LICENSES);
        if (allocatedSeat === null) {
          // Founding seats sold out — refund via Stripe and notify customer
          // For now, fall back to lifetime tier
          tier = 'lifetime';
        } else {
          seat = allocatedSeat;
        }
      }

      if (tier === 'digital-representative') {
        // Monthly subscription — expires in 35 days (5-day grace period)
        const expDate = new Date();
        expDate.setDate(expDate.getDate() + 35);
        expiresAt = expDate.toISOString();
      }
      // founding and lifetime keys have no expiry

      const privateKey = await importEd25519PrivateKey(env.LICENSE_SIGNING_KEY);
      const licenseKey = await generateLicenseKey({
        tier,
        email: customerEmail,
        expiresAt,
        seat,
        privateKey,
      });

      // Store license record in KV
      const record: LicenseRecord = {
        key: licenseKey,
        tier,
        email: customerEmail,
        stripeCustomerId: customerId,
        stripeSubscriptionId: session.subscription as string | undefined,
        createdAt: new Date().toISOString(),
        expiresAt,
        revoked: false,
        seat,
      };

      await env.LICENSES.put(`customer:${customerId}`, JSON.stringify(record));
      await env.LICENSES.put(`key:${licenseKey}`, JSON.stringify(record));

      // Configure invoice settings for monthly subscriptions
      if (tier === 'digital-representative' && session.subscription) {
        try {
          await fetch(
            `https://api.stripe.com/v1/subscriptions/${session.subscription as string}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${env.STRIPE_API_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                'collection_method': 'charge_automatically',
                'description': 'Semblance Digital Representative — Monthly',
              }).toString(),
            }
          );
        } catch {
          // Non-critical — invoice settings default is acceptable
        }
      }

      // Send license key via email — failure here should NOT cause a 500
      // (key is already stored in KV, customer can request resend)
      if (customerEmail) {
        try {
          await sendLicenseEmail(
            env.RESEND_API_KEY,
            env.RESEND_FROM_EMAIL,
            customerEmail,
            licenseKey,
            tier,
            seat
          );
        } catch (emailErr) {
          console.error('Email delivery failed (key stored in KV):', emailErr);
        }
      }

      return new Response('OK', { status: 200 });
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;

      const recordJson = await env.LICENSES.get(`customer:${customerId}`);
      if (recordJson) {
        const record = JSON.parse(recordJson) as LicenseRecord;
        record.revoked = true;
        await env.LICENSES.put(`customer:${customerId}`, JSON.stringify(record));
        if (record.key) {
          await env.LICENSES.put(`key:${record.key}`, JSON.stringify(record));
        }
      }

      return new Response('OK', { status: 200 });
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const customerId = subscription.customer as string;
      const status = subscription.status as string;

      if (status === 'active') {
        // Subscription renewed — generate a fresh key with new 35-day expiry
        const recordJson = await env.LICENSES.get(`customer:${customerId}`);
        if (recordJson) {
          const record = JSON.parse(recordJson) as LicenseRecord;

          const expDate = new Date();
          expDate.setDate(expDate.getDate() + 35);
          const newExpiresAt = expDate.toISOString();

          // Generate a new key with the extended expiry
          const privateKey = await importEd25519PrivateKey(env.LICENSE_SIGNING_KEY);
          const newKey = await generateLicenseKey({
            tier: 'digital-representative',
            email: record.email,
            expiresAt: newExpiresAt,
            privateKey,
          });

          // Remove old key entry, store new one
          if (record.key) {
            await env.LICENSES.delete(`key:${record.key}`);
          }

          record.key = newKey;
          record.expiresAt = newExpiresAt;
          record.revoked = false;

          await env.LICENSES.put(`customer:${customerId}`, JSON.stringify(record));
          await env.LICENSES.put(`key:${newKey}`, JSON.stringify(record));

          // Email the renewed key
          if (record.email) {
            try {
              await sendLicenseEmail(
                env.RESEND_API_KEY,
                env.RESEND_FROM_EMAIL,
                record.email,
                newKey,
                'digital-representative'
              );
            } catch (emailErr) {
              console.error('Renewal email failed (key stored in KV):', emailErr);
            }
          }
        }
      }

      return new Response('OK', { status: 200 });
    }

    default:
      return new Response('OK', { status: 200 });
  }
}

async function handleVerify(key: string, env: Env): Promise<Response> {
  const recordJson = await env.LICENSES.get(`key:${key}`);
  if (!recordJson) {
    return Response.json({ valid: false, error: 'Key not found' }, { status: 404 });
  }

  const record = JSON.parse(recordJson) as LicenseRecord;

  if (record.revoked) {
    return Response.json({ valid: false, error: 'License revoked' }, { status: 403 });
  }

  if (record.expiresAt && new Date(record.expiresAt).getTime() <= Date.now()) {
    return Response.json({ valid: false, error: 'License expired' }, { status: 403 });
  }

  return Response.json({
    valid: true,
    tier: record.tier,
    expiresAt: record.expiresAt,
  });
}

async function handleRevoke(request: Request, env: Env): Promise<Response> {
  // Revoke endpoint requires Stripe webhook signature for authentication
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = await request.text();
  const valid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = JSON.parse(body) as { customerId?: string };
  if (!parsed.customerId) {
    return new Response('Missing customerId', { status: 400 });
  }

  const recordJson = await env.LICENSES.get(`customer:${parsed.customerId}`);
  if (!recordJson) {
    return new Response('Customer not found', { status: 404 });
  }

  const record = JSON.parse(recordJson) as LicenseRecord;
  record.revoked = true;
  await env.LICENSES.put(`customer:${parsed.customerId}`, JSON.stringify(record));
  if (record.key) {
    await env.LICENSES.put(`key:${record.key}`, JSON.stringify(record));
  }

  return Response.json({ success: true });
}

// ─── Subscription Management ────────────────────────────────────────────

async function handlePortalSession(request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  let parsed: { licenseKey?: string };

  try {
    parsed = JSON.parse(body) as { licenseKey?: string };
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!parsed.licenseKey) {
    return Response.json({ error: 'Missing licenseKey' }, { status: 400 });
  }

  // Look up the license record to get the Stripe customer ID
  const recordJson = await env.LICENSES.get(`key:${parsed.licenseKey}`);
  if (!recordJson) {
    return Response.json({ error: 'License not found' }, { status: 404 });
  }

  const record = JSON.parse(recordJson) as LicenseRecord;
  if (!record.stripeCustomerId) {
    return Response.json({ error: 'No Stripe customer associated with this license' }, { status: 400 });
  }

  // Create a Stripe Billing Portal session
  const portalResponse = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_API_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      customer: record.stripeCustomerId,
      return_url: 'https://semblance.run',
    }).toString(),
  });

  if (!portalResponse.ok) {
    const errText = await portalResponse.text();
    console.error('Stripe portal session error:', errText);
    return Response.json({ error: 'Failed to create billing portal session' }, { status: 500 });
  }

  const portalData = (await portalResponse.json()) as { url: string };
  return Response.json({ url: portalData.url });
}

// ─── Thank You Page ─────────────────────────────────────────────────────

function handleThanks(): Response {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Semblance</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&family=DM+Mono&family=Fraunces:opsz,wght@9..144,300;9..144,400&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'DM Sans', system-ui, sans-serif;
      background: #0B0E11;
      color: #A8B4C0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 520px;
      padding: 60px 32px;
      text-align: center;
    }
    .logo {
      width: 48px;
      height: 48px;
      margin: 0 auto 32px;
      border-radius: 12px;
      background: linear-gradient(135deg, #6ECFA3 0%, #4BA882 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Fraunces', serif;
      font-size: 24px;
      color: #0B0E11;
      font-weight: 300;
    }
    h1 {
      font-family: 'Fraunces', serif;
      font-weight: 300;
      color: #EEF1F4;
      font-size: 32px;
      margin-bottom: 12px;
      letter-spacing: -0.02em;
    }
    .subtitle {
      color: #6ECFA3;
      font-size: 15px;
      margin-bottom: 40px;
    }
    .steps {
      text-align: left;
      background: #111518;
      border: 1px solid #1E2227;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 32px;
    }
    .steps h2 {
      font-size: 13px;
      font-weight: 500;
      color: #EEF1F4;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 16px;
    }
    .step {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 10px 0;
    }
    .step:not(:last-child) {
      border-bottom: 1px solid #1E2227;
    }
    .step-num {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #1A1F24;
      border: 1px solid #2A3038;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: #6ECFA3;
    }
    .step-text {
      font-size: 14px;
      line-height: 1.5;
      padding-top: 2px;
    }
    .note {
      font-size: 13px;
      color: #5E6B7C;
      line-height: 1.6;
    }
    .footer {
      margin-top: 48px;
      font-size: 12px;
      color: #3A4450;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">S</div>
    <h1>Thank you</h1>
    <p class="subtitle">Your purchase is confirmed.</p>

    <div class="steps">
      <h2>What happens next</h2>
      <div class="step">
        <span class="step-num">1</span>
        <span class="step-text">Check your email for your license key. It will arrive within a few minutes.</span>
      </div>
      <div class="step">
        <span class="step-num">2</span>
        <span class="step-text">Click the activation link in the email, or paste the key in Semblance &gt; Settings &gt; License.</span>
      </div>
      <div class="step">
        <span class="step-num">3</span>
        <span class="step-text">If you've connected your email account, Semblance will detect the license key automatically.</span>
      </div>
    </div>

    <p class="note">Your license key email contains a deep link and a manual activation code. If you don't see it within 10 minutes, check your spam folder.</p>

    <p class="footer">Your intelligence. Your device. Your rules.<br />Semblance &mdash; semblance.run</p>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ─── Worker Entry Point ──────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, stripe-signature',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      let response: Response;

      if (path === '/webhook' && request.method === 'POST') {
        response = await handleWebhook(request, env);
      } else if (path.startsWith('/verify/') && request.method === 'GET') {
        const key = decodeURIComponent(path.slice('/verify/'.length));
        response = await handleVerify(key, env);
      } else if (path === '/revoke' && request.method === 'POST') {
        response = await handleRevoke(request, env);
      } else if (path === '/portal' && request.method === 'POST') {
        response = await handlePortalSession(request, env);
      } else if (path === '/thanks' && request.method === 'GET') {
        response = handleThanks();
      } else {
        response = new Response('Not Found', { status: 404 });
      }

      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (err) {
      console.error('Worker error:', err);
      return new Response('Internal Server Error', { status: 500, headers: corsHeaders });
    }
  },
};
