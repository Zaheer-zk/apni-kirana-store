'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  LifeBuoy,
  Mail,
  MessageCircle,
  Phone,
} from 'lucide-react';
import { Card, CardContent } from '@aks/ui/components/card';
import { AppHeader } from '@/components/AppHeader';
import { RequireAuth } from '@/components/RequireAuth';

// Mirrors apps/driver/app/profile/help.tsx — same FAQ entries, same contact
// channels. Drivers should see identical guidance whichever surface they
// open. The "Chat with admin" CTA links to /support (a separate screen so
// the actual chat thread doesn't get buried inside a long FAQ page).

interface FaqEntry {
  q: string;
  a: string;
}

const FAQS: FaqEntry[] = [
  {
    q: 'How do I receive delivery requests?',
    a: 'Make sure you are online from the dashboard toggle and have location permission enabled. When a nearby order is available, an incoming-offer card pops up — you have a short window to accept it before it goes to the next driver.',
  },
  {
    q: "What's the dropoff OTP?",
    a: 'When you reach the customer, ask them for their 4-digit OTP and enter it in the app to confirm delivery. This proves the order was handed over correctly.',
  },
  {
    q: 'When do I get paid?',
    a: 'Earnings are calculated per delivery and paid out weekly to your registered bank account. You can view pending and completed payouts in the Earnings tab.',
  },
  {
    q: "What if a customer isn't reachable?",
    a: 'Try calling the customer using the in-app call button. If they remain unreachable for 5+ minutes after arrival, contact support to mark the order as undeliverable.',
  },
  {
    q: 'How is my rating calculated?',
    a: 'Your rating is the average of star ratings from customers after each completed delivery. Be polite, on-time and careful with packages to improve your rating.',
  },
  {
    q: 'What if an order is cancelled mid-delivery?',
    a: 'You will still receive partial earnings for confirmed cancellations after pickup. The order will close automatically and you can accept the next request.',
  },
  {
    q: 'How do I update my vehicle info?',
    a: 'Vehicle details (type, number, license) can only be updated by support to keep our records compliant. Reach out via the contact options below.',
  },
  {
    q: "Why didn't I get the order I was offered?",
    a: "If you didn't accept within the timeout window, the order is offered to the next nearest driver. Stay online and keep the app foregrounded to maximise matches.",
  },
];

const SUPPORT_PHONE = '+911800XXXXXXX';
const SUPPORT_PHONE_DISPLAY = '+91 1800-XXX-XXXX';
const SUPPORT_EMAIL = 'drivers@apnikirana.in';
const SUPPORT_WHATSAPP = '911800XXXXXXX';

export default function HelpPage() {
  return (
    <RequireAuth>
      <div className="flex min-h-screen flex-col bg-gray-50">
        <AppHeader />
        <main className="page-shell flex-1 py-6">
          <Inner />
        </main>
      </div>
    </RequireAuth>
  );
}

function Inner() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <LifeBuoy className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Help &amp; FAQs</h1>
          <p className="text-sm text-gray-500">
            Common questions about the driver flow. Still stuck? Reach support below.
          </p>
        </div>
      </header>

      {/* Quick CTA — chat with admin */}
      <Link
        href="/support"
        className="block rounded-2xl border border-primary/30 bg-primary/5 p-5 transition hover:bg-primary/10"
      >
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary p-3 text-primary-foreground">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">Chat with admin</h2>
            <p className="mt-1 text-sm text-gray-600">
              Send a message and an admin will reply during business hours. Faster than
              email for delivery-specific issues.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </Link>

      {/* FAQ */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Frequently asked
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            {FAQS.map((f) => (
              <FaqRow key={f.q} entry={f} />
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Direct contact */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Other ways to reach us
        </h2>
        <Card>
          <CardContent className="p-0 divide-y divide-gray-100">
            <ContactRow
              icon={<Phone className="h-5 w-5" />}
              tint="bg-emerald-50 text-emerald-700"
              label="Call support"
              value={SUPPORT_PHONE_DISPLAY}
              href={`tel:${SUPPORT_PHONE}`}
            />
            <ContactRow
              icon={<MessageCircle className="h-5 w-5" />}
              tint="bg-emerald-50 text-emerald-700"
              label="WhatsApp"
              value="Message us on WhatsApp"
              href={`https://wa.me/${SUPPORT_WHATSAPP}`}
              external
            />
            <ContactRow
              icon={<Mail className="h-5 w-5" />}
              tint="bg-blue-50 text-blue-700"
              label="Email"
              value={SUPPORT_EMAIL}
              href={`mailto:${SUPPORT_EMAIL}`}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function FaqRow({ entry }: { entry: FaqEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="block w-full px-4 py-4 text-left transition hover:bg-gray-50"
      aria-expanded={open}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-900">{entry.q}</p>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </div>
      {open ? <p className="mt-2 text-sm leading-relaxed text-gray-600">{entry.a}</p> : null}
    </button>
  );
}

function ContactRow({
  icon,
  tint,
  label,
  value,
  href,
  external,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className="flex items-center gap-3 px-4 py-4 transition hover:bg-gray-50"
    >
      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${tint}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-gray-900">{value}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-gray-400" />
    </a>
  );
}
