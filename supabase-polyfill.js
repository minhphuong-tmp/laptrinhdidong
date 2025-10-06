import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';

// Fix cho Supabase realtime

// Polyfill AppState cho Supabase (chỉ cho mobile)
if (Platform.OS !== 'web' && typeof global.addEventListener === 'undefined') {
    global.addEventListener = () => { };
    global.removeEventListener = () => { };
}

// Web polyfills - xử lý server-side rendering
if (Platform.OS === 'web') {
    // Polyfill cho window
    if (typeof global.window === 'undefined') {
        global.window = global;
    }
    
    // Polyfill cho localStorage
    if (typeof global.localStorage === 'undefined') {
        global.localStorage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            clear: () => {},
            length: 0,
            key: () => null,
        };
    }
    
    // Polyfill cho document
    if (typeof global.document === 'undefined') {
        global.document = {
            createElement: () => ({}),
            getElementById: () => null,
            querySelector: () => null,
            addEventListener: () => {},
            removeEventListener: () => {},
        };
    }
}

// Export để có thể import
export { };
