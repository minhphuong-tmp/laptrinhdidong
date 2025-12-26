import { supabase } from '../lib/supabase';
import { checkE2ECapability } from '../utils/e2eCapability';

class PinService {
    constructor() {
        // Master unlock key được lưu trong memory (không lưu storage)
        this.masterUnlockKey = null;
        this.pinUnlocked = false;
    }

    // Generate random salt (16 bytes)
    async generateSalt() {
        try {
            // Sử dụng Web Crypto API nếu có
            if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
                const salt = new Uint8Array(16);
                window.crypto.getRandomValues(salt);
                return this.uint8ArrayToBase64(salt);
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');
                const saltBytes = crypto.randomBytes(16);
                return saltBytes.toString('base64');
            } catch (e) {
                // Fallback: Dùng react-native-get-random-values
                const { getRandomValues } = require('react-native-get-random-values');
                const salt = new Uint8Array(16);
                getRandomValues(salt);
                return this.uint8ArrayToBase64(salt);
            }
        } catch (error) {
            console.error('Error generating salt:', error);
            throw error;
        }
    }

    // Convert Uint8Array to base64
    uint8ArrayToBase64(uint8Array) {
        try {
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(uint8Array).toString('base64');
            }
            const chunkSize = 8192;
            let binary = '';
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, Array.from(chunk));
            }
            return btoa(binary);
        } catch (error) {
            console.error('Error converting Uint8Array to base64:', error);
            const array = Array.from(uint8Array);
            const binary = String.fromCharCode.apply(null, array);
            return btoa(binary);
        }
    }

    // Hash PIN với salt (SHA-256)
    async hashPin(pin, salt) {
        try {
            // Sử dụng Web Crypto API nếu có
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                const encoder = new TextEncoder();
                const data = encoder.encode(pin + salt);
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');
                const hash = crypto.createHash('sha256');
                hash.update(pin + salt);
                return hash.digest('hex');
            } catch (e) {
                throw new Error('Crypto library not available for PIN hashing');
            }
        } catch (error) {
            console.error('Error hashing PIN:', error);
            throw error;
        }
    }

    // Derive master unlock key từ PIN (PBKDF2) - alias cho deriveUnlockKey
    async deriveMasterUnlockKey(pin, salt) {
        return await this.deriveUnlockKey(pin, salt);
    }

    // Derive unlock key từ PIN (PBKDF2)
    async deriveUnlockKey(pin, salt) {
        try {
            // Sử dụng Web Crypto API nếu có
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                const encoder = new TextEncoder();
                const keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(pin),
                    { name: 'PBKDF2' },
                    false,
                    ['deriveBits', 'deriveKey']
                );

                const saltBuffer = this.base64ToUint8Array(salt);
                const derivedBits = await window.crypto.subtle.deriveBits(
                    {
                        name: 'PBKDF2',
                        salt: saltBuffer,
                        iterations: 100000,
                        hash: 'SHA-256'
                    },
                    keyMaterial,
                    256 // 32 bytes = 256 bits
                );

                return new Uint8Array(derivedBits);
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');
                const saltBuffer = Buffer.from(salt, 'base64');
                const key = crypto.pbkdf2Sync(pin, saltBuffer, 100000, 32, 'sha256');
                return new Uint8Array(key);
            } catch (e) {
                throw new Error('Crypto library not available for key derivation');
            }
        } catch (error) {
            console.error('Error deriving unlock key:', error);
            throw error;
        }
    }

    // Convert base64 to Uint8Array
    base64ToUint8Array(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    // Generate random master unlock key (32 bytes)
    async generateMasterUnlockKey() {
        try {
            // Sử dụng Web Crypto API nếu có
            if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
                const key = new Uint8Array(32);
                window.crypto.getRandomValues(key);
                return key;
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');
                const keyBytes = crypto.randomBytes(32);
                return new Uint8Array(keyBytes);
            } catch (e) {
                // Fallback: Dùng react-native-get-random-values
                const { getRandomValues } = require('react-native-get-random-values');
                const key = new Uint8Array(32);
                getRandomValues(key);
                return key;
            }
        } catch (error) {
            console.error('Error generating master unlock key:', error);
            throw error;
        }
    }

    // Set PIN (hash PIN với salt, lưu lên server trong user_security)
    async setPin(pin, userId) {
        try {
            if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
                throw new Error('PIN must be exactly 6 digits');
            }

            if (!userId) {
                throw new Error('userId is required');
            }

            const isE2EAvailable = await checkE2ECapability();
            if (!isE2EAvailable) {
                throw new Error('E2E encryption not available. Please use development build.');
            }

            // 1. Tạo pin_salt (16 bytes random)
            const pinSalt = await this.generateSalt();

            // 2. Hash PIN với salt: SHA-256(PIN + salt)
            const pinHash = await this.hashPin(pin, pinSalt);

            // 3. Lưu lên server trong user_security table
            const { error } = await supabase
                .from('user_security')
                .upsert({
                    user_id: userId,
                    pin_salt: pinSalt,
                    pin_hash: pinHash,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id'
                });

            if (error) {
                console.error('Error saving PIN to server:', error);
                throw new Error(`Failed to save PIN: ${error.message}`);
            }

            // 4. Generate và cache master unlock key trong memory (không lưu storage)
            // Master unlock key được derive từ PIN khi unlock
            const masterUnlockKey = await this.generateMasterUnlockKey();
            this.masterUnlockKey = masterUnlockKey;
            this.pinUnlocked = true;

            return { success: true, masterUnlockKey };
        } catch (error) {
            console.error('Error setting PIN:', error);
            throw error;
        }
    }

    // Get PIN info từ server (user_security table)
    async getPinInfo(userId) {
        try {
            if (!userId) {
                return null;
            }

            const { data, error } = await supabase
                .from('user_security')
                .select('pin_salt, pin_hash')
                .eq('user_id', userId)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // Không tìm thấy record
                    return null;
                }
                console.error('Error getting PIN info:', error);
                return null;
            }

            return data;
        } catch (error) {
            console.error('Error getting PIN info:', error);
            return null;
        }
    }

    // Kiểm tra PIN đã được thiết lập chưa (từ server - user_security table)
    async isPinSet(userId) {
        try {
            if (!userId) {
                return false;
            }

            const pinInfo = await this.getPinInfo(userId);
            return pinInfo !== null && pinInfo.pin_hash !== null && pinInfo.pin_hash.length > 0;
        } catch (error) {
            console.error('Error checking if PIN is set:', error);
            return false;
        }
    }

    // Unlock với PIN (verify PIN hash, derive master unlock key)
    async unlockWithPin(pin, userId) {
        try {
            if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
                return { success: false, error: 'PIN phải có đúng 6 số' };
            }

            if (!userId) {
                return { success: false, error: 'userId is required' };
            }

            const isE2EAvailable = await checkE2ECapability();
            if (!isE2EAvailable) {
                return { success: false, error: 'E2E encryption not available' };
            }

            // 1. Lấy PIN info từ server (user_security table)
            const pinInfo = await this.getPinInfo(userId);
            if (!pinInfo || !pinInfo.pin_hash || !pinInfo.pin_salt) {
                return { success: false, error: 'PIN chưa được thiết lập' };
            }

            const { pin_salt, pin_hash } = pinInfo;

            // 2. Verify PIN: Hash PIN nhập vào và so sánh với pin_hash trong DB
            const inputPinHash = await this.hashPin(pin, pin_salt);
            if (inputPinHash !== pin_hash) {
                return { success: false, error: 'PIN không đúng' };
            }

            // 3. PIN đúng → Derive master unlock key từ PIN: PBKDF2(PIN, salt, 100k, 32 bytes)
            // Master unlock key được derive từ PIN, không lưu trong DB
            const masterUnlockKey = await this.deriveUnlockKey(pin, pin_salt);

            // Validate: master unlock key phải đúng 32 bytes
            if (!masterUnlockKey || masterUnlockKey.length !== 32) {
                return { success: false, error: 'Lỗi khi tạo master unlock key' };
            }

            // 4. Cache master unlock key trong memory (không lưu storage)
            this.masterUnlockKey = masterUnlockKey;
            this.pinUnlocked = true;

            return { success: true, masterUnlockKey };
        } catch (error) {
            console.error('Error unlocking with PIN:', error);
            return { success: false, error: error.message || 'Lỗi khi mở khóa PIN' };
        }
    }

    // Lock (xóa unlock key khỏi memory)
    lock() {
        this.masterUnlockKey = null;
        this.pinUnlocked = false;

        // Clear ConversationKey cache khi PIN lock (bảo mật)
        try {
            const conversationKeyService = require('./conversationKeyService').default;
            conversationKeyService.clearKeyCache();
        } catch (error) {
            // Ignore error nếu conversationKeyService chưa được import
            console.log('[PinService] Could not clear ConversationKey cache:', error.message);
        }
    }

    // Lấy master unlock key (nếu đã unlock)
    getMasterUnlockKey() {
        if (!this.pinUnlocked || !this.masterUnlockKey) {
            return null;
        }
        return this.masterUnlockKey;
    }

    // Kiểm tra đã unlock chưa
    isUnlocked() {
        return this.pinUnlocked && this.masterUnlockKey !== null;
    }

    // Clear PIN (xóa trên server - user_security table)
    async clearPin(userId) {
        try {
            if (!userId) {
                throw new Error('userId is required');
            }

            const { error } = await supabase
                .from('user_security')
                .delete()
                .eq('user_id', userId);

            if (error) {
                throw error;
            }

            this.lock();
            return { success: true };
        } catch (error) {
            console.error('Error clearing PIN:', error);
            throw error;
        }
    }
}

export default new PinService();

