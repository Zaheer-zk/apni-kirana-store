import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import { colors, fontSize } from '@/constants/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

function makeIcon(focusedName: IoniconName, unfocusedName: IoniconName) {
  return function TabIcon({ color, focused }: { color: string; focused: boolean }) {
    return (
      <Ionicons
        name={focused ? focusedName : unfocusedName}
        size={24}
        color={color}
      />
    );
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          backgroundColor: colors.card,
          height: Platform.OS === 'ios' ? 84 : 64,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontSize: fontSize.xs - 1,
          fontWeight: '600',
          marginTop: -2,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: makeIcon('home', 'home-outline'),
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          title: 'Deliveries',
          tabBarIcon: makeIcon('cube', 'cube-outline'),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: makeIcon('wallet', 'wallet-outline'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: makeIcon('person', 'person-outline'),
        }}
      />
    </Tabs>
  );
}
