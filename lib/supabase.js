import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { supabaseAnonKey, supabaseUrl } from '../constants/index';

console.log('supabaseUrl: ', supabaseUrl);
console.log('supabaseAnonKey: ', supabaseAnonKey);
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {

    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
    global: {
        fetch: fetch.bind(globalThis), // Dùng fetch thay vì ws
    },
});