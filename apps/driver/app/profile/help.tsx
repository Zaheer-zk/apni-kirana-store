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
import { Card } from '@/components/Card';
import { colors, fontSize, radius, spacing } from '@/constants/theme';

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

interface FaqItemProps {
  entry: FaqEntry;
  isLast?: boolean;
}

function FaqItem({ entry, isLast }: Readonly<FaqItemProps>) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => setOpen((v) => !v)}
        style={styles.faqItem}
      >
        <View style={styles.faqHeaderRow}>
          <Text style={styles.faqQuestion}>{entry.q}</Text>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        </View>
        {open && <Text style={styles.faqAnswer}>{entry.a}</Text>}
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </View>
  );
}

interface ContactRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg?: string;
  iconColor?: string;
  label: string;
  value: string;
  onPress: () => void;
  isLast?: boolean;
}

function ContactRow({
  icon,
  iconBg = colors.primaryLight,
  iconColor = colors.primary,
  label,
  value,
  onPress,
  isLast,
}: Readonly<ContactRowProps>) {
  return (
    <View>
      <TouchableOpacity
        style={styles.contactRow}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View style={[styles.contactIconBox, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={22} color={iconColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.contactLabel}>{label}</Text>
          <Text style={styles.contactValue}>{value}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {!isLast && <View style={styles.divider} />}
    </View>
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
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* FAQ Section */}
        <Text style={styles.sectionTitle}>Frequently asked questions</Text>
        <Card padding={0}>
          {FAQS.map((entry, idx) => (
            <FaqItem
              key={entry.q}
              entry={entry}
              isLast={idx === FAQS.length - 1}
            />
          ))}
        </Card>

        {/* Contact Section */}
        <Text style={styles.sectionTitle}>Need more help?</Text>
        <Card padding={0}>
          <ContactRow
            icon="call"
            iconBg={colors.primaryLight}
            iconColor={colors.primary}
            label="Call support"
            value={SUPPORT_PHONE_DISPLAY}
            onPress={() => openLink(`tel:${SUPPORT_PHONE}`)}
          />
          <ContactRow
            icon="mail"
            iconBg={colors.infoLight}
            iconColor={colors.info}
            label="Email us"
            value={SUPPORT_EMAIL}
            onPress={() => openLink(`mailto:${SUPPORT_EMAIL}`)}
          />
          <ContactRow
            icon="logo-whatsapp"
            iconBg={colors.successLight}
            iconColor={colors.success}
            label="WhatsApp"
            value="Chat with support"
            onPress={() => openLink(`https://wa.me/${SUPPORT_WHATSAPP}`)}
            isLast
          />
        </Card>

        <Text style={styles.footerNote}>
          We typically respond within a few hours during business hours.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxxl + spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.sm,
  },

  faqItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  faqHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  faqQuestion: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    paddingRight: spacing.md,
  },
  faqAnswer: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.gray600,
    lineHeight: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.lg,
  },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  contactIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  contactValue: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: '700',
    marginTop: 2,
  },

  footerNote: {
    marginTop: spacing.md,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
