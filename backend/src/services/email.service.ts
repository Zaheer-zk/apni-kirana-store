// =====================================================================================
// Email dispatch — pluggable provider with a safe dev default.
//
// EMAIL_PROVIDER=CONSOLE  (default in dev) → logs the email (and any link) to
//                                            the backend console
//               =RESEND   (recommended)    → Resend HTTP API (resend.com)
//
// Required env when EMAIL_PROVIDER=RESEND:
//   RESEND_API_KEY   — API key from the Resend dashboard (starts with "re_")
//   EMAIL_FROM       — verified sender, e.g. "Apni Kirana Store <noreply@yourdomain.com>"
//                      (defaults to Resend's shared onboarding sender)
//
// Add a provider: implement SendEmailFn, register it in PROVIDERS, set
// EMAIL_PROVIDER. Callers never need to know which provider is active.
// =====================================================================================

import { config } from '../config/env';

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

type SendEmailFn = (msg: EmailMessage) => Promise<void>;

const DEFAULT_FROM = 'Apni Kirana Store <onboarding@resend.dev>';

const consoleProvider: SendEmailFn = async (msg) => {
  console.log(
    `[Email] (console) → ${msg.to}\n  Subject: ${msg.subject}\n  ${msg.text.replace(/\n/g, '\n  ')}`,
  );
};

// Resend — https://resend.com — free tier 3,000 emails/month, 100/day.
const resendProvider: SendEmailFn = async (msg) => {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    throw new Error('RESEND_API_KEY env var is required for EMAIL_PROVIDER=RESEND');
  }
  const from = process.env['EMAIL_FROM'] || DEFAULT_FROM;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!res.ok) {
    throw new Error(`Resend responded ${res.status}: ${await res.text().catch(() => '')}`);
  }
};

const PROVIDERS: Record<string, SendEmailFn> = {
  CONSOLE: consoleProvider,
  RESEND: resendProvider,
};

/**
 * Sends a transactional email via the configured provider. In development a
 * provider failure falls back to the console so the dev flow keeps working.
 */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const provider = (
    process.env['EMAIL_PROVIDER'] ?? (config.nodeEnv === 'production' ? 'RESEND' : 'CONSOLE')
  )
    .toUpperCase()
    .trim();
  const fn = PROVIDERS[provider];
  if (!fn) {
    console.warn(`[Email] Unknown EMAIL_PROVIDER="${provider}", falling back to CONSOLE`);
    await consoleProvider(msg);
    return;
  }
  try {
    await fn(msg);
  } catch (err) {
    console.error(`[Email] ${provider} send failed:`, (err as Error).message);
    if (config.nodeEnv === 'development') {
      await consoleProvider(msg);
      return;
    }
    throw err;
  }
}

/**
 * Notifies every active admin that a STORE has just registered and is
 * awaiting approval. Best-effort: provider failures are logged and swallowed
 * (registration must not 500 because the email pipeline is down). Triggered
 * from POST /stores/register.
 */
export async function sendNewStoreAwaitingApprovalEmail(opts: {
  toAdmins: Array<{ email: string; name: string | null }>;
  storeName: string;
  storeId: string;
  ownerName: string | null;
  ownerPhone: string | null;
  reviewLinkBase: string;
}): Promise<void> {
  if (opts.toAdmins.length === 0) return;
  const link = `${opts.reviewLinkBase}/stores/${opts.storeId}`;
  const subject = `New store awaiting approval — ${opts.storeName}`;
  const text =
    `A new store has registered on the platform and is waiting for review.\n\n` +
    `Store : ${opts.storeName}\n` +
    `Owner : ${opts.ownerName ?? '—'}${opts.ownerPhone ? ` (${opts.ownerPhone})` : ''}\n\n` +
    `Review and approve here:\n${link}\n\n` +
    `— Apni Kirana Store`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <h2 style="color:#16a34a">New store awaiting approval</h2>
      <p>A new store has registered on the platform and is waiting for review.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Store</td><td><strong>${escape(opts.storeName)}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Owner</td><td>${escape(opts.ownerName ?? '—')}${opts.ownerPhone ? ` (${escape(opts.ownerPhone)})` : ''}</td></tr>
      </table>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Review store</a>
      </p>
      <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br/><a href="${link}">${link}</a></p>
    </div>
  `;
  await Promise.allSettled(
    opts.toAdmins.map((a) => sendEmail({ to: a.email, subject, html, text })),
  ).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') {
        console.warn('[Email] new-store admin notification failed:', r.reason);
      }
    }
  });
}

/** Same idea as `sendNewStoreAwaitingApprovalEmail` but for a new DRIVER. */
export async function sendNewDriverAwaitingApprovalEmail(opts: {
  toAdmins: Array<{ email: string; name: string | null }>;
  driverName: string | null;
  driverPhone: string | null;
  driverId: string;
  vehicleType: string;
  vehicleNumber: string;
  reviewLinkBase: string;
}): Promise<void> {
  if (opts.toAdmins.length === 0) return;
  const link = `${opts.reviewLinkBase}/drivers/${opts.driverId}`;
  const subject = `New driver awaiting approval — ${opts.driverName ?? 'unnamed'}`;
  const text =
    `A new driver has registered on the platform and is waiting for review.\n\n` +
    `Driver  : ${opts.driverName ?? '—'}${opts.driverPhone ? ` (${opts.driverPhone})` : ''}\n` +
    `Vehicle : ${opts.vehicleType} — ${opts.vehicleNumber}\n\n` +
    `Review and approve here:\n${link}\n\n` +
    `— Apni Kirana Store`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <h2 style="color:#16a34a">New driver awaiting approval</h2>
      <p>A new driver has registered on the platform and is waiting for review.</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Driver</td><td><strong>${escape(opts.driverName ?? '—')}</strong>${opts.driverPhone ? ` (${escape(opts.driverPhone)})` : ''}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Vehicle</td><td>${escape(opts.vehicleType)} — ${escape(opts.vehicleNumber)}</td></tr>
      </table>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Review driver</a>
      </p>
      <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br/><a href="${link}">${link}</a></p>
    </div>
  `;
  await Promise.allSettled(
    opts.toAdmins.map((a) => sendEmail({ to: a.email, subject, html, text })),
  ).then((results) => {
    for (const r of results) {
      if (r.status === 'rejected') {
        console.warn('[Email] new-driver admin notification failed:', r.reason);
      }
    }
  });
}

/**
 * Notifies the store owner / driver that their account has been approved by
 * an admin and they can now log in to take orders.
 */
export async function sendAccountApprovedEmail(opts: {
  to: string;
  name: string | null;
  kind: 'STORE' | 'DRIVER';
  loginUrl: string;
}): Promise<void> {
  const greeting = opts.name ? `Hi ${opts.name},` : 'Hi,';
  const noun = opts.kind === 'STORE' ? 'store' : 'driver account';
  const subject = `Your ${noun} is approved`;
  const text =
    `${greeting}\n\n` +
    `Good news — your ${noun} on Apni Kirana Store has been approved by our team.\n` +
    `You can now sign in and start taking orders.\n\n` +
    `${opts.loginUrl}\n\n` +
    `— Apni Kirana Store`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
      <h2 style="color:#16a34a">You're approved!</h2>
      <p>${greeting}</p>
      <p>Good news — your ${noun} on Apni Kirana Store has been approved by our team. You can now sign in and start taking orders.</p>
      <p style="margin:24px 0">
        <a href="${opts.loginUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Sign in</a>
      </p>
      <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br/><a href="${opts.loginUrl}">${opts.loginUrl}</a></p>
    </div>
  `;
  await sendEmail({ to: opts.to, subject, html, text });
}

/** Minimal HTML escape for values rendered inside our email templates. */
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sends the password-reset email. `link` is the full URL (token embedded) the
 * user opens to choose a new password.
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string | null,
  link: string,
): Promise<void> {
  const greeting = name ? `Hi ${name},` : 'Hi,';
  const subject = 'Reset your Apni Kirana Store password';
  const text =
    `${greeting}\n\n` +
    `We received a request to reset your password. Open the link below to choose a new one:\n\n` +
    `${link}\n\n` +
    `This link expires in 1 hour. If you didn't request this, you can safely ignore this email.\n\n` +
    `— Apni Kirana Store`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
      <h2 style="color:#16a34a">Reset your password</h2>
      <p>${greeting}</p>
      <p>We received a request to reset your Apni Kirana Store password. Click the button below to choose a new one.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block">Reset password</a>
      </p>
      <p style="font-size:13px;color:#6b7280">Or paste this link into your browser:<br/><a href="${link}">${link}</a></p>
      <p style="font-size:13px;color:#6b7280">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
  await sendEmail({ to, subject, html, text });
}
