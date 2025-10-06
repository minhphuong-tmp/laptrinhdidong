// Polyfill window trước khi import bất kỳ thứ gì
if (typeof global !== 'undefined' && typeof global.window === 'undefined') {
  global.window = global;
}

if (typeof global !== 'undefined' && typeof global.localStorage === 'undefined') {
  global.localStorage = {
    getItem: () => null,
    setItem: () => { },
    removeItem: () => { },
    clear: () => { },
    length: 0,
    key: () => null,
  };
}

import '../lib/webPolyfills.js';
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