// =====================================================================================
// SMS dispatch — pluggable provider with sane dev defaults.
//
// SMS_PROVIDER=CONSOLE   (default in dev)  → logs OTP to backend console
//             =TWOFACTOR (recommended for India dev/staging) → 2Factor.in (100/day free)
//             =MSG91     (recommended for India production) → MSG91 OTP route
//             =TWILIO    (international fallback)            → Twilio Messaging
//
// Add a new provider: implement `(phone, otp) => Promise<void>`, register it
// in PROVIDERS, set SMS_PROVIDER=YOUR_KEY in .env. The route layer never has
// to know which provider is in use.
// =====================================================================================

import twilio from 'twilio';
import { config } from '../config/env';

type SendOtpFn = (phone: string, otp: string) => Promise<void>;

const consoleProvider: SendOtpFn = async (phone, otp) => {
  console.log(`[OTP] Phone: ${phone} | OTP: ${otp}`);
};

const twilioProvider: SendOtpFn = async (phone, otp) => {
  const client = twilio(config.twilio.accountSid, config.twilio.authToken);
  await client.messages.create({
    body: `Your Apni Kirana Store OTP is ${otp}. Valid for 5 minutes.`,
    from: config.twilio.phoneNumber,
    to: `+91${phone}`,
  });
};

// 2Factor.in — POST /API/V1/{API_KEY}/SMS/{PHONE}/{OTP}/{TEMPLATE_NAME}
// Free tier: 100 OTP per day per account. Indian provider, DLT-compliant.
// Sign up: https://2factor.in — get API key from dashboard.
const twoFactorProvider: SendOtpFn = async (phone, otp) => {
  const apiKey = process.env['TWOFACTOR_API_KEY'];
  if (!apiKey) {
    throw new Error('TWOFACTOR_API_KEY env var is required for SMS_PROVIDER=TWOFACTOR');
  }
  const template = process.env['TWOFACTOR_TEMPLATE'] ?? 'OTP1';
  const url = `https://2factor.in/API/V1/${apiKey}/SMS/${encodeURIComponent(phone)}/${encodeURIComponent(otp)}/${encodeURIComponent(template)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`2Factor responded ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as { Status?: string; Details?: string };
  if (json.Status !== 'Success') {
    throw new Error(`2Factor send failed: ${json.Details ?? 'unknown error'}`);
  }
};

// MSG91 — Flow API. Free trial credits, then ~₹0.18 per OTP. DLT-compliant.
// Sign up: https://msg91.com — set MSG91_AUTH_KEY + MSG91_TEMPLATE_ID + MSG91_SENDER_ID.
const msg91Provider: SendOtpFn = async (phone, otp) => {
  const authKey = process.env['MSG91_AUTH_KEY'];
  const templateId = process.env['MSG91_TEMPLATE_ID'];
  if (!authKey || !templateId) {
    throw new Error('MSG91_AUTH_KEY and MSG91_TEMPLATE_ID are required for SMS_PROVIDER=MSG91');
  }
  // OTP API expects mobile in 91XXXXXXXXXX format
  const url = `https://control.msg91.com/api/v5/otp?template_id=${encodeURIComponent(templateId)}&mobile=91${encodeURIComponent(phone)}&otp=${encodeURIComponent(otp)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { authkey: authKey, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`MSG91 responded ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const json = (await res.json()) as { type?: string; message?: string };
  if (json.type !== 'success') {
    throw new Error(`MSG91 send failed: ${json.message ?? 'unknown error'}`);
  }
};

const PROVIDERS: Record<string, SendOtpFn> = {
  CONSOLE: consoleProvider,
  TWILIO: twilioProvider,
  TWOFACTOR: twoFactorProvider,
  MSG91: msg91Provider,
};

export async function sendSmsOtp(phone: string, otp: string): Promise<void> {
  const provider =
    (process.env['SMS_PROVIDER'] ?? (config.nodeEnv === 'development' ? 'CONSOLE' : 'TWILIO'))
      .toUpperCase()
      .trim();
  const fn = PROVIDERS[provider];
  if (!fn) {
    console.warn(`[SMS] Unknown SMS_PROVIDER="${provider}", falling back to CONSOLE`);
    await consoleProvider(phone, otp);
    return;
  }
  try {
    await fn(phone, otp);
  } catch (err) {
    console.error(`[SMS] ${provider} send failed:`, (err as Error).message);
    // In development, fall through to console so the dev flow keeps working.
    if (config.nodeEnv === 'development') {
      await consoleProvider(phone, otp);
      return;
    }
    throw err;
  }
}
