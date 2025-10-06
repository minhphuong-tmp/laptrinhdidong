import { Platform } from 'react-native';

// Mock Supabase cho web để tránh lỗi
const createMockSupabase = () => {
    return {
        auth: {
            signIn: () => Promise.resolve({ data: { user: null }, error: null }),
            signUp: () => Promise.resolve({ data: { user: null }, error: null }),
            signOut: () => Promise.resolve({ error: null }),
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
            startAutoRefresh: () => { },
            stopAutoRefresh: () => { },
        },
        from: () => ({
            select: () => ({ data: [], error: null }),
            insert: () => ({ data: [], error: null }),
            update: () => ({ data: [], error: null }),
            delete: () => ({ data: [], error: null }),
        }),
        channel: () => ({
            on: () => ({ subscribe: () => ({ unsubscribe: () => { } }) }),
            subscribe: () => ({ unsubscribe: () => { } }),
        }),
    };
};

// Sử dụng mock cho web, real Supabase cho mobile
let supabase;
if (Platform.OS === 'web') {
    supabase = createMockSupabase();
} else {
    // Import real Supabase cho mobile
    const { createClient } = require('@supabase/supabase-js');
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const { supabaseAnonKey, supabaseUrl } = require('../constants/index');

    supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            storage: AsyncStorage,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    });
}

export { supabase };

