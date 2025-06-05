import '../polyfill.js';
import '../supabase-polyfill.js';

import Loading from '@/components/Loading.jsx';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

const index = () => {
  const router = useRouter();
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Loading />
    </View>
  );
};

export default index;