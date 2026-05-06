import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface FaqEntry {
  q: string;
  a: string;
}

const FAQS: FaqEntry[] = [
  {
    q: 'How do I receive delivery requests?',
    a: 'Make sure you are online from the Dashboard toggle. When a nearby order is available, an incoming order modal will pop up — you have a short window to accept it.',
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
    q: 'Why didn’t I get the order I was offered?',
    a: 'If you didn’t accept within the timeout window, the order is offered to the next nearest driver. Stay online and keep the app foregrounded to maximize matches.',
  },
];

const SUPPORT_PHONE = '+911800XXXXXXX';
const SUPPORT_PHONE_DISPLAY = '+91 1800-XXX-XXXX';
const SUPPORT_EMAIL = 'drivers@apnikirana.in';
const SUPPORT_WHATSAPP = '911800XXXXXXX';

function FaqItem({ entry }: { entry: FaqEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => setOpen((v) => !v)}
      style={styles.faqItem}
    >
      <View style={styles.faqHeaderRow}>
        <Text style={styles.faqQuestion}>{entry.q}</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#6B7280"
        />
      </View>
      {open && <Text style={styles.faqAnswer}>{entry.a}</Text>}
    </TouchableOpacity>
  );
}

function ContactRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.contactRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.contactIconBox}>
        <Ionicons name={icon} size={22} color="#DC2626" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.contactLabel}>{label}</Text>
        <Text style={styles.contactValue}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
    </TouchableOpacity>
  );
}

export default function DriverHelpScreen() {
  const openLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Unable to open', 'Could not open this link on your device.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong opening the link.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* FAQ Section */}
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <View style={styles.faqCard}>
          {FAQS.map((entry, idx) => (
            <View key={entry.q}>
              <FaqItem entry={entry} />
              {idx < FAQS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Contact Section */}
        <Text style={styles.sectionTitle}>Need more help?</Text>
        <View style={styles.contactCard}>
          <ContactRow
            icon="call-outline"
            label="Call Support"
            value={SUPPORT_PHONE_DISPLAY}
            onPress={() => openLink(`tel:${SUPPORT_PHONE}`)}
          />
          <View style={styles.divider} />
          <ContactRow
            icon="mail-outline"
            label="Email Us"
            value={SUPPORT_EMAIL}
            onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
          />
          <View style={styles.divider} />
          <ContactRow
            icon="logo-whatsapp"
            label="WhatsApp"
            value="Chat with support"
            onPress={() => openLink(`https://wa.me/${SUPPORT_WHATSAPP}`)}
          />
        </View>

        <Text style={styles.footerNote}>
          We typically respond within a few hours during business hours.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    marginBottom: 10,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  faqItem: { paddingVertical: 14 },
  faqHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    paddingRight: 12,
  },
  faqAnswer: {
    marginTop: 10,
    fontSize: 14,
    color: '#4B5563',
    lineHeight: 20,
  },
  divider: { height: 1, backgroundColor: '#F3F4F6' },

  contactCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 14,
  },
  contactIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
  contactValue: { fontSize: 15, color: '#111827', fontWeight: '600', marginTop: 2 },

  footerNote: {
    marginTop: 24,
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});
