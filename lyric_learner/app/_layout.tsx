import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0d0d0d' },
        animation: 'slide_from_right',
      }}
    />
  );
}
