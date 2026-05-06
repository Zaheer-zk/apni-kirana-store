import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not Found', headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <View style={styles.iconBox}>
            <Text style={{ fontSize: 48 }}>🏪</Text>
          </View>
          <Text style={styles.label}>404</Text>
          <Text style={styles.title}>Page not found</Text>
          <Text style={styles.subtitle}>
            This route doesn&apos;t exist in the store portal.
          </Text>
          <Link href="/(tabs)/dashboard" replace asChild>
            <Text style={styles.cta}>← Back to Dashboard</Text>
          </Link>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  iconBox: {
    width: 96, height: 96, borderRadius: 24, backgroundColor: '#DBEAFE',
    alignItems: 'center', justifyContent: 'center', marginBottom: 24,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#2563EB', letterSpacing: 1 },
  title: { marginTop: 8, fontSize: 24, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle: { marginTop: 12, fontSize: 16, color: '#6B7280', textAlign: 'center' },
  cta: { marginTop: 32, fontSize: 16, fontWeight: '600', color: '#2563EB' },
});
