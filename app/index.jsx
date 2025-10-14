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
import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

const index = () => {
  console.log('Index component rendering...');
  const router = useRouter();

  // Đơn giản hóa: chỉ navigate đến welcome sau 1 giây
  React.useEffect(() => {
    console.log('Index useEffect running...');
    const timer = setTimeout(() => {
      console.log('Navigating to welcome...');
      router.replace('/welcome');
    }, 1000);

    return () => {
      console.log('Index cleanup...');
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Loading />
    </View>
  );
};

export default index;