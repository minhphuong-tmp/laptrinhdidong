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
  console.log('Index component rendering...');
  const router = useRouter();
  const { user, loading } = useAuth();

  React.useEffect(() => {
    console.log('Index useEffect running...');
    console.log('Auth state:', { user: !!user, loading });

    if (!loading) {
      if (user) {
        console.log('User already logged in, navigating to home...');
        router.replace('/(main)/home');
      } else {
        console.log('No user, navigating to welcome...');
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