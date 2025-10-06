import { Platform } from 'react-native';

// Web storage adapter cho Supabase
const createWebStorage = () => {
  return {
    getItem: (key) => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return Promise.resolve(window.localStorage.getItem(key));
        }
      } catch (error) {
        console.log('localStorage getItem error:', error);
      }
      return Promise.resolve(null);
    },
    setItem: (key, value) => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } catch (error) {
        console.log('localStorage setItem error:', error);
      }
      return Promise.resolve();
    },
    removeItem: (key) => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(key);
        }
      } catch (error) {
        console.log('localStorage removeItem error:', error);
      }
      return Promise.resolve();
    },
  };
};

// Sử dụng localStorage cho web, AsyncStorage cho mobile
let storage;
if (Platform.OS === 'web') {
  storage = createWebStorage();
} else {
  // Dynamic import AsyncStorage chỉ khi cần (mobile)
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  storage = AsyncStorage;
}

export { storage };
