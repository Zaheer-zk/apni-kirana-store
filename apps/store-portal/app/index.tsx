import { Redirect } from 'expo-router';
import { useStorePortalStore } from '@/store/store.store';

export default function Index() {
  const accessToken = useStorePortalStore((s) => s.accessToken);
  return accessToken ? (
    <Redirect href="/(tabs)/dashboard" />
  ) : (
    <Redirect href="/(auth)/login" />
  );
}
