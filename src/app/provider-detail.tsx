import { useLocalSearchParams } from 'expo-router';

import { ProviderDetail } from '@/components/ProviderDetail';

export default function ProviderDetailPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProviderDetail id={id} />;
}
