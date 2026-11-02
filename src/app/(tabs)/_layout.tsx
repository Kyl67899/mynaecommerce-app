import { Tabs } from 'expo-router';
import { Icon, type IconName } from '@/components/Icon';
import { useCart } from '@/context/CartContext';
import { colors } from '@/lib/theme';

const tab = (icon: IconName) => {
  const TabIcon = ({ color, focused }: { color: unknown; focused: boolean }) => (
    <Icon name={icon} color={String(color)} strokeWidth={focused ? 2.2 : 1.8} />
  );
  TabIcon.displayName = `TabIcon(${icon})`;
  return TabIcon;
};

export default function TabsLayout() {
  const { count } = useCart();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tab('home') }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: tab('grid') }} />
      <Tabs.Screen name="scan" options={{ title: 'Skin scan', tabBarIcon: tab('scan') }} />
      <Tabs.Screen
        name="cart"
        options={{
          title: 'Bag',
          tabBarIcon: tab('bag'),
          tabBarBadge: count > 0 ? count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.accent, fontSize: 11 },
        }}
      />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: tab('user') }} />
    </Tabs>
  );
}
