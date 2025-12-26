/**
 * Utility để check xem E2E encryption có available không
 * - Dev Client: Có expo-secure-store và react-native-quick-crypto → E2E available
 * - Expo Go: Không có native modules → E2E không available
 * - Web: Có Web Crypto API → E2E available
 */

let isE2EAvailable = null; // Cache kết quả

export async function checkE2ECapability() {
    if (isE2EAvailable !== null) {
        return isE2EAvailable;
    }

    try {
        // Check SecureStore (native module)
        let secureStoreAvailable = false;
        try {
            const SecureStore = require('expo-secure-store');
            // Test xem có thể access được không
            await SecureStore.getItemAsync('__test__');
            secureStoreAvailable = true;
        } catch (e) {
            // SecureStore không available (Expo Go)
            secureStoreAvailable = false;
        }

        // Check crypto (native module hoặc Web Crypto)
        let cryptoAvailable = false;

        // Check Web Crypto API (cho web)
        if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
            cryptoAvailable = true;
        } else {
            // Check react-native-quick-crypto (cho React Native Dev Client)
            try {
                const crypto = require('react-native-quick-crypto');
                if (crypto && crypto.generateKeyPairSync) {
                    cryptoAvailable = true;
                }
            } catch (e) {
                cryptoAvailable = false;
            }
        }

        // E2E available nếu có cả SecureStore và Crypto
        isE2EAvailable = secureStoreAvailable && cryptoAvailable;

        return isE2EAvailable;
    } catch (error) {
        console.warn('Error checking E2E capability:', error);
        isE2EAvailable = false;
        return false;
    }
}

export function isE2EEnabled() {
    return isE2EAvailable === true;
}

export function resetE2ECapability() {
    isE2EAvailable = null;
}


