/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { Text, View } from 'react-native';

jest.mock('expo-router', () => {
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  };
  return {
    router,
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    useSegments: () => [],
    usePathname: () => '/',
    Link: ({ children }: any) => React.createElement(React.Fragment, null, children),
    Redirect: () => null,
    Stack: Object.assign(
      ({ children }: any) => React.createElement(React.Fragment, null, children),
      { Screen: () => null }
    ),
    Tabs: Object.assign(
      ({ children }: any) => React.createElement(React.Fragment, null, children),
      { Screen: () => null }
    ),
    Slot: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 28.6, longitude: 77.2, accuracy: 10 },
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  Accuracy: { High: 4, Balanced: 3, BestForNavigation: 6 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => false),
  isTaskRegisteredAsync: jest.fn(async () => false),
  unregisterTaskAsync: jest.fn(async () => undefined),
  unregisterAllTasksAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('socket.io-client', () => {
  const socket = {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connected: false,
  };
  return { __esModule: true, io: jest.fn(() => socket), default: jest.fn(() => socket) };
});

jest.mock('axios', () => {
  const mockResponse = { data: { success: true, data: [] } };
  const instance = {
    get: jest.fn(async () => mockResponse),
    post: jest.fn(async () => mockResponse),
    put: jest.fn(async () => mockResponse),
    patch: jest.fn(async () => mockResponse),
    delete: jest.fn(async () => mockResponse),
    interceptors: {
      request: { use: jest.fn(), eject: jest.fn() },
      response: { use: jest.fn(), eject: jest.fn() },
    },
    defaults: { headers: { common: {} } },
  };
  return {
    __esModule: true,
    default: { ...instance, create: jest.fn(() => instance), isAxiosError: () => false },
    create: jest.fn(() => instance),
    isAxiosError: () => false,
  };
});

jest.mock('react-native-maps', () => {
  const MockMap = (props: any) => React.createElement(View, props, props.children);
  const MockMarker = (props: any) => React.createElement(View, props, props.children);
  return {
    __esModule: true,
    default: MockMap,
    Marker: MockMarker,
    PROVIDER_GOOGLE: 'google',
    PROVIDER_DEFAULT: 'default',
    Polyline: MockMarker,
  };
});

jest.mock('@expo/vector-icons', () => {
  const Icon = ({ name }: any) => React.createElement(Text, { testID: `icon-${name}` }, '');
  return {
    Ionicons: Icon,
    MaterialIcons: Icon,
    FontAwesome: Icon,
    Feather: Icon,
    AntDesign: Icon,
    MaterialCommunityIcons: Icon,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const Comp = ({ children }: any) => React.createElement(View, null, children);
  return {
    SafeAreaProvider: Comp,
    SafeAreaView: Comp,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  };
});

const origError = console.error;
console.error = (...args: any[]) => {
  const msg = args[0]?.toString?.() ?? '';
  if (msg.includes('not wrapped in act') || msg.includes('useNativeDriver')) return;
  origError(...args);
};
