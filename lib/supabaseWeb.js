import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from '../constants/index';

// Tạo Supabase client riêng cho web
const createWebSupabaseClient = () => {
  // Web storage adapter
  const webStorage = {
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

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: webStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
};

// Tạo Supabase client riêng cho mobile
const createMobileSupabaseClient = () => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
};

// Export client phù hợp với platform
export const supabase = Platform.OS === 'web' 
  ? createWebSupabaseClient() 
  : createMobileSupabaseClient();

