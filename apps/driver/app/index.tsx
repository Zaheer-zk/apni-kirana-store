import { Redirect } from 'expo-router';
import { useDriverStore } from '@/store/driver.store';

export default function Index() {
  const accessToken = useDriverStore((s) => s.accessToken);
  return accessToken ? (
    <Redirect href="/(tabs)/dashboard" />
  ) : (
    <Redirect href="/(auth)/login" />
  );
}
