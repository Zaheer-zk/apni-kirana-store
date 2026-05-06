import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Header } from '@/components/Header';
import { colors, fontSize, radius, shadow, spacing } from '@/constants/theme';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: 'How long does delivery take?',
    a: 'Most orders are delivered in 20–40 minutes. Actual time depends on your distance from the store and rider availability.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'You can pay using Cash on Delivery, UPI, debit/credit cards, and supported online wallets. Online payments unlock instant order confirmation.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'You can cancel a pending order from the Orders tab before the store accepts it. Once accepted, please contact support to cancel.',
  },
  {
    q: 'How do I add a delivery address?',
    a: 'Go to Profile → My Addresses → Add new address. You can pin a location on the map or use your current GPS location.',
  },
  {
    q: 'What if items are missing?',
    a: 'If anything is missing or wrong, tap "Report issue" on the order page within 24 hours. Our team will investigate and refund eligible items.',
  },
  {
    q: 'How do I become a delivery partner?',
    a: 'Visit the Driver app on the Play Store / App Store, sign up with your phone number, complete the KYC, and start accepting deliveries.',
  },
  {
    q: 'Are there delivery charges?',
    a: 'Delivery charges depend on distance and order size. The exact fee is shown at checkout before you pay.',
  },
  {
    q: 'Can I change my delivery address after ordering?',
    a: 'No, once placed the delivery address is locked. Cancel and re-order with the right address if needed.',
  },
];

const SUPPORT_PHONE = '+91 1800-200-1234';
const SUPPORT_EMAIL = 'support@apnikirana.in';
const SUPPORT_WHATSAPP = '+91 90000 12345';

export default function HelpScreen() {
  const [query, setQuery] = useState('');
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    return FAQS.filter(
      (f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q),
    );
  }, [query]);

  function callPhone() {
    const url = `tel:${SUPPORT_PHONE.replace(/\s|-/g, '')}`;
    Linking.openURL(url).catch(() => {});
  }
  function emailUs() {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {});
  }
  function whatsapp() {
    const num = SUPPORT_WHATSAPP.replace(/\s|\+/g, '');
    Linking.openURL(`https://wa.me/${num}`).catch(() => {});
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header title="Help & Support" />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FAQs"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* FAQs */}
        <Text style={styles.sectionTitle}>Frequently asked questions</Text>
        <View style={styles.faqList}>
          {filtered.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No matching questions.</Text>
            </View>
          ) : (
            filtered.map((item, idx) => {
              const isOpen = openIndex === idx;
              return (
                <View key={item.q} style={styles.faqItem}>
                  <TouchableOpacity
                    style={styles.faqHead}
                    activeOpacity={0.7}
                    onPress={() => setOpenIndex(isOpen ? null : idx)}
                  >
                    <Text style={styles.faqQ} numberOfLines={3}>
                      {item.q}
                    </Text>
                    <Ionicons
                      name={isOpen ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </TouchableOpacity>
                  {isOpen ? (
                    <Text style={styles.faqA}>{item.a}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </View>

        {/* Contact us */}
        <Text style={styles.sectionTitle}>Contact us</Text>
        <View style={styles.contactCard}>
          <TouchableOpacity style={styles.contactRow} activeOpacity={0.7} onPress={callPhone}>
            <View style={[styles.contactIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="call" size={18} color={colors.primary} />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactTitle}>Call us</Text>
              <Text style={styles.contactValue}>{SUPPORT_PHONE}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.contactRow} activeOpacity={0.7} onPress={emailUs}>
            <View style={[styles.contactIcon, { backgroundColor: colors.infoLight }]}>
              <Ionicons name="mail" size={18} color={colors.info} />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactTitle}>Email</Text>
              <Text style={styles.contactValue}>{SUPPORT_EMAIL}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.contactRow, { borderBottomWidth: 0 }]}
            activeOpacity={0.7}
            onPress={whatsapp}
          >
            <View style={[styles.contactIcon, { backgroundColor: colors.successLight }]}>
              <Ionicons name="logo-whatsapp" size={18} color={colors.success} />
            </View>
            <View style={styles.contactText}>
              <Text style={styles.contactTitle}>WhatsApp</Text>
              <Text style={styles.contactValue}>{SUPPORT_WHATSAPP}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.footnote}>
          Average response time: under 30 minutes ({Platform.OS === 'ios' ? 'iOS' : 'Android'} app)
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    paddingVertical: spacing.sm,
  },
  sectionTitle: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    fontSize: fontSize.xs,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  faqList: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.small,
  },
  faqItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  faqHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  faqQ: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 20,
  },
  faqA: {
    marginTop: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
  },
  contactCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.small,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: {
    flex: 1,
  },
  contactTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  contactValue: {
    marginTop: 2,
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  footnote: {
    marginTop: spacing.lg,
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
});
