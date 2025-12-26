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

import Loading from '@/components/Loading.jsx';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

const index = () => {
  const router = useRouter();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    if (!loading) {
      if (user) {
        router.replace('/(main)/home');
      } else {
        router.replace('/welcome');
      }
    }
  }, [user, loading]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Loading />
    </View>
  );
};

export default index;