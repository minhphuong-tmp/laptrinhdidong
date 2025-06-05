import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

// Fix cho Supabase realtime

// Polyfill AppState cho Supabase
if (typeof global.addEventListener === 'undefined') {
    global.addEventListener = () => { };
    global.removeEventListener = () => { };
}

// Export để có thể import
export { };
