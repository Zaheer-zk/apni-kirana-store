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
