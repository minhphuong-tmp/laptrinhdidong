import { createClient } from '@supabase/supabase-js';

// Supabase configuration - sử dụng cùng với mobile app
const supabaseUrl = 'https://oqtlakdvlmkaalymgrwd.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xdGxha2R2bG1rYWFseW1ncndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4MzA3MTYsImV4cCI6MjA2NDQwNjcxNn0.FeGpQzJon_remo0_-nQ3e4caiWjw5un9p7rK3EcJfjY'

console.log('Creating Supabase client with URL:', supabaseUrl);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
    }
})

console.log('Supabase client created:', supabase);

// Test connection
console.log('Testing Supabase connection...');
supabase.from('users').select('count').then(result => {
    console.log('Supabase connection test SUCCESS:', result);
}).catch(err => {
    console.error('Supabase connection test FAILED:', err);
});

// Test auth
console.log('Testing Supabase auth...');
supabase.auth.getSession().then(result => {
    console.log('Supabase auth test:', result);
}).catch(err => {
    console.error('Supabase auth test failed:', err);
});
