import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { checkE2ECapability } from '../utils/e2eCapability';

class DeviceService {
    constructor() {
        this.deviceId = null;
        this.devicePrivateKey = null;
        this.currentUserId = null; // Track user ID của private key hiện tại
    }

    // Generate device ID: device_${timestamp}_${random}
    generateDeviceId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `device_${timestamp}_${random}`;
    }

    // Detect device name tự động
    async getDeviceName() {
        try {
            // Có thể dùng expo-device nếu cài, nhưng tạm dùng Platform
            const platform = Platform.OS;
            const version = Platform.Version;

            if (platform === 'ios') {
                return `iPhone ${version}`;
            } else if (platform === 'android') {
                return `Android ${version}`;
            } else if (platform === 'web') {
                return 'Web Browser';
            }
            return `${platform} Device`;
        } catch (error) {
            return 'Unknown Device';
        }
    }

    // Generate RSA key pair (2048-bit)
    // Note: Trong production nên dùng thư viện chuyên dụng như node-forge hoặc @noble/curves
    async generateKeyPair() {
        try {
            // Sử dụng Web Crypto API nếu có (cho web)
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                const keyPair = await window.crypto.subtle.generateKey(
                    {
                        name: 'RSA-OAEP',
                        modulusLength: 2048,
                        publicExponent: new Uint8Array([1, 0, 1]),
                        hash: 'SHA-256'
                    },
                    true,
                    ['encrypt', 'decrypt']
                );

                // Export keys
                const publicKeyPem = await this.exportKey(keyPair.publicKey, 'spki');
                const privateKeyPem = await this.exportKey(keyPair.privateKey, 'pkcs8');

                return {
                    publicKey: publicKeyPem,
                    privateKey: privateKeyPem
                };
            }

            // React Native: Dùng react-native-quick-crypto (cần rebuild app)
            // Lưu ý: react-native-quick-crypto không hoạt động với Expo Go
            // Cần rebuild app: npx expo prebuild && npx expo run:android
            try {
                const crypto = require('react-native-quick-crypto');

                if (!crypto || !crypto.generateKeyPairSync) {
                    throw new Error('react-native-quick-crypto not properly installed. Please rebuild the app.');
                }

                // react-native-quick-crypto sử dụng generateKeyPairSync
                const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
                    modulusLength: 2048,
                    publicKeyEncoding: {
                        type: 'spki',
                        format: 'pem'
                    },
                    privateKeyEncoding: {
                        type: 'pkcs8',
                        format: 'pem'
                    }
                });

                return { publicKey, privateKey };
            } catch (e) {
                console.error('Error generating key pair with react-native-quick-crypto:', e);
                // Tạm thời throw error để user biết cần rebuild
                throw new Error('E2E Encryption requires native build. Please rebuild the app with: npx expo prebuild && npx expo run:android');
            }
        } catch (error) {
            console.error('Error generating key pair:', error);
            throw error;
        }
    }

    // Helper: Export key to PEM format (cho Web Crypto API)
    async exportKey(key, format) {
        const exported = await window.crypto.subtle.exportKey(format, key);
        const exportedAsString = this.arrayBufferToBase64(exported);
        const exportedAsBase64 = exportedAsString.match(/.{1,64}/g).join('\n');
        const header = format === 'spki'
            ? '-----BEGIN PUBLIC KEY-----\n'
            : '-----BEGIN PRIVATE KEY-----\n';
        const footer = format === 'spki'
            ? '\n-----END PUBLIC KEY-----'
            : '\n-----END PRIVATE KEY-----';
        return header + exportedAsBase64 + footer;
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Lấy hoặc tạo device ID
    // FIX: Đảm bảo deviceId chỉ được tạo DUY NHẤT 1 lần cho mỗi app cài đặt
    // QUAN TRỌNG: 
    // - Không bao giờ regenerate deviceId nếu đã tồn tại trong SecureStore
    // - Không được gọi generateDeviceId() ở bất kỳ đâu khác ngoài hàm này
    // - deviceId phải luôn cố định, không thay đổi sau khi unlock PIN hoặc reload app
    async getOrCreateDeviceId() {
        // Bước 1: Kiểm tra cache trong memory (nhanh nhất)
        if (this.deviceId) {
            return this.deviceId;
        }

        try {
            const isE2EAvailable = await checkE2ECapability();
            let deviceId = null;

            // Bước 2: Kiểm tra SecureStore/AsyncStorage (source of truth)
            if (isE2EAvailable) {
                // Dev Client: Dùng SecureStore
                deviceId = await SecureStore.getItemAsync('device_id');
                if (deviceId) {
                    // Cache vào memory
                    this.deviceId = deviceId;
                    return deviceId;
                }
            } else {
                // Expo Go: Dùng AsyncStorage (fallback, không an toàn)
                deviceId = await AsyncStorage.getItem('device_id');
                if (deviceId) {
                    // Cache vào memory
                    this.deviceId = deviceId;
                    return deviceId;
                }
            }

            // Bước 3: Chưa có deviceId trong storage → tạo mới (CHỈ LẦN ĐẦU TIÊN)
            // Đây là lần DUY NHẤT generateDeviceId() được gọi
            deviceId = this.generateDeviceId();

            // Lưu vào storage ngay lập tức
            if (isE2EAvailable) {
                await SecureStore.setItemAsync('device_id', deviceId);
            } else {
                await AsyncStorage.setItem('device_id', deviceId);
            }

            // Cache vào memory
            this.deviceId = deviceId;

            return deviceId;
        } catch (error) {
            console.error('[DeviceService] ERROR: Cannot get or create device ID:', error);
            console.error('[DeviceService] Error stack:', error.stack);
            throw error;
        }
    }

    // Lấy hoặc tạo private key cho device
    // QUAN TRỌNG: Không bao giờ regenerate privateKey nếu đã tồn tại
    async getOrCreatePrivateKey(userId) {
        // CRITICAL: Kiểm tra xem private key trong memory có đúng cho user hiện tại không
        // Nếu userId thay đổi, cần load lại key mới từ SecureStore
        if (this.devicePrivateKey && this.currentUserId === userId) {
            return this.devicePrivateKey;
        }
        
        // User khác hoặc chưa có key → clear cache và load lại
        if (this.currentUserId !== userId) {
            this.devicePrivateKey = null;
            this.currentUserId = userId;
        }

        try {
            const isE2EAvailable = await checkE2ECapability();
            if (!isE2EAvailable) {
                throw new Error('E2E encryption not available. Please use development build.');
            }

            const deviceId = await this.getOrCreateDeviceId();
            const keyName = `device_private_key_${userId}_${deviceId}`;

            let privateKey = await SecureStore.getItemAsync(keyName);

            let publicKey = null;
            if (!privateKey) {
                // Generate key pair
                const keyPair = await this.generateKeyPair();
                publicKey = keyPair.publicKey;
                privateKey = keyPair.privateKey;

                // Lưu private key vào SecureStore
                await SecureStore.setItemAsync(keyName, privateKey);

                // Register device lên server với public key
                const deviceName = await this.getDeviceName();
                await this.registerDevice(userId, deviceId, publicKey, deviceName);
                
                console.log('🔑 [KEY_PAIR_CREATED] New key pair generated:');
                console.log('  - Device ID:', deviceId);
                console.log('  - User ID:', userId);
                console.log('  - Private Key (first 50 chars):', privateKey.substring(0, 50) + '...');
                console.log('  - Public Key (first 50 chars):', publicKey.substring(0, 50) + '...');
            } else {
                // Đã có private key, kiểm tra public key trong database
                try {
                    const { data: device } = await supabase
                        .from('user_devices')
                        .select('public_key')
                        .eq('user_id', userId)
                        .eq('device_id', deviceId)
                        .single();
                    
                    if (device && device.public_key) {
                        publicKey = device.public_key;
                        console.log('🔑 [KEY_PAIR_LOADED] Existing key pair loaded:');
                        console.log('  - Device ID:', deviceId);
                        console.log('  - User ID:', userId);
                        console.log('  - Private Key (first 50 chars):', privateKey.substring(0, 50) + '...');
                        console.log('  - Public Key (first 50 chars):', publicKey.substring(0, 50) + '...');
                    } else {
                        // Private key tồn tại nhưng public key không có trong database
                        // Tạo lại key pair mới và lưu cả 2
                        console.warn('⚠️ [KEY_PAIR_LOADED] Private key exists but public key not found in database. Regenerating key pair...');
                        
                        // Generate key pair mới
                        const keyPair = await this.generateKeyPair();
                        const newPublicKey = keyPair.publicKey;
                        const newPrivateKey = keyPair.privateKey;
                        
                        // Lưu private key mới vào SecureStore (thay thế cũ)
                        await SecureStore.setItemAsync(keyName, newPrivateKey);
                        privateKey = newPrivateKey; // Update privateKey để return
                        
                        // Register device với public key mới
                        const deviceName = await this.getDeviceName();
                        await this.registerDevice(userId, deviceId, newPublicKey, deviceName);
                        
                        publicKey = newPublicKey;
                        console.log('✅ [KEY_PAIR_REGENERATED] Key pair regenerated and saved:');
                        console.log('  - Device ID:', deviceId);
                        console.log('  - User ID:', userId);
                        console.log('  - Private Key (first 50 chars):', privateKey.substring(0, 50) + '...');
                        console.log('  - Public Key (first 50 chars):', publicKey.substring(0, 50) + '...');
                    }
                } catch (error) {
                    // Nếu không fetch được hoặc không có device → tạo lại key pair
                    console.warn('⚠️ [KEY_PAIR_LOADED] Could not fetch public key from database. Regenerating key pair...', error.message);
                    
                    try {
                        // Generate key pair mới
                        const keyPair = await this.generateKeyPair();
                        const newPublicKey = keyPair.publicKey;
                        const newPrivateKey = keyPair.privateKey;
                        
                        // Lưu private key mới vào SecureStore (thay thế cũ)
                        await SecureStore.setItemAsync(keyName, newPrivateKey);
                        privateKey = newPrivateKey; // Update privateKey để return
                        
                        // Register device với public key mới
                        const deviceName = await this.getDeviceName();
                        await this.registerDevice(userId, deviceId, newPublicKey, deviceName);
                        
                        publicKey = newPublicKey;
                        console.log('✅ [KEY_PAIR_REGENERATED] Key pair regenerated and saved:');
                        console.log('  - Device ID:', deviceId);
                        console.log('  - User ID:', userId);
                        console.log('  - Private Key (first 50 chars):', privateKey.substring(0, 50) + '...');
                        console.log('  - Public Key (first 50 chars):', publicKey.substring(0, 50) + '...');
                    } catch (regenerateError) {
                        console.error('❌ [KEY_PAIR_REGENERATED] Failed to regenerate key pair:', regenerateError);
                        // Vẫn return privateKey cũ nếu regenerate thất bại
                    }
                }
            }

            // Validate privateKey không null
            if (!privateKey || privateKey.length === 0) {
                throw new Error('Private key is null or empty after loading');
            }

            // Cache private key vào memory và lưu userId
            this.devicePrivateKey = privateKey;
            this.currentUserId = userId;
            return privateKey;
        } catch (error) {
            console.error('[DeviceService] Error getting private key:', error);
            throw error;
        }
    }

    // Register device lên server
    async registerDevice(userId, deviceId, publicKey, deviceName) {
        try {
            const { error } = await supabase
                .from('user_devices')
                .upsert({
                    user_id: userId,
                    device_id: deviceId,
                    public_key: publicKey,
                    device_name: deviceName,
                    key_type: 'RSA',
                    last_active_at: new Date().toISOString()
                }, {
                    onConflict: 'user_id,device_id'
                });

            if (error) {
                console.error('Error registering device:', error);
                throw error;
            }

            return { success: true };
        } catch (error) {
            console.error('Error in registerDevice:', error);
            throw error;
        }
    }

    // Lấy public key của device khác
    async getDevicePublicKey(userId, deviceId) {
        try {
            const { data, error } = await supabase
                .from('user_devices')
                .select('public_key')
                .eq('user_id', userId)
                .eq('device_id', deviceId)
                .single();

            if (error) {
                throw error;
            }

            return data?.public_key;
        } catch (error) {
            console.error('Error getting device public key:', error);
            throw error;
        }
    }

    // Lấy tất cả devices của user
    async getUserDevices(userId) {
        try {
            const { data, error } = await supabase
                .from('user_devices')
                .select('device_id, device_name, created_at, last_active_at')
                .eq('user_id', userId)
                .order('last_active_at', { ascending: false });

            if (error) {
                throw error;
            }

            return data || [];
        } catch (error) {
            console.error('Error getting user devices:', error);
            throw error;
        }
    }

    // Lấy tất cả private keys của user (tất cả devices)
    // Dùng để thử decrypt với tất cả keys khi không biết message được encrypt với key nào
    async getAllPrivateKeysForUser(userId) {
        try {
            const isE2EAvailable = await checkE2ECapability();
            if (!isE2EAvailable) {
                return [];
            }

            // Lấy tất cả devices của user
            const devices = await this.getUserDevices(userId);
            if (!devices || devices.length === 0) {
                return [];
            }

            // Lấy private key cho từng device
            const privateKeys = [];
            for (const device of devices) {
                try {
                    const keyName = `device_private_key_${userId}_${device.device_id}`;
                    const privateKey = await SecureStore.getItemAsync(keyName);
                    if (privateKey) {
                        privateKeys.push({
                            deviceId: device.device_id,
                            privateKey: privateKey
                        });
                    }
                } catch (error) {
                    // Ignore nếu không lấy được key của device này
                    if (__DEV__) {
                        console.warn(`[getAllPrivateKeysForUser] Could not get private key for device ${device.device_id}:`, error.message);
                    }
                }
            }

            return privateKeys;
        } catch (error) {
            console.error('Error getting all private keys for user:', error);
            return [];
        }
    }

    // Lấy tất cả devices hợp lệ của recipient (có public_key, không bị revoked)
    async getValidRecipientDevices(userId) {
        try {
            let query = supabase
                .from('user_devices')
                .select('device_id, public_key, device_name, last_active_at, created_at')
                .eq('user_id', userId)
                .not('public_key', 'is', null);

            // Lấy tất cả devices có public_key (không filter revoked vì không có chức năng này)
            const { data, error } = await query;

            if (error) {
                throw error;
            }

            // Filter devices có public_key hợp lệ
            const validDevices = (data || []).filter(device => 
                device.public_key && 
                typeof device.public_key === 'string' &&
                device.public_key.trim().length > 0 &&
                device.public_key.includes('BEGIN PUBLIC KEY')
            );

            return validDevices;
        } catch (error) {
            console.error('Error getting valid recipient devices:', error);
            throw error;
        }
    }


    // Update last active time
    async updateLastActive(userId) {
        try {
            const deviceId = await this.getOrCreateDeviceId();

            await supabase
                .from('user_devices')
                .update({ last_active_at: new Date().toISOString() })
                .eq('user_id', userId)
                .eq('device_id', deviceId);
        } catch (error) {
            console.error('Error updating last active:', error);
        }
    }

    // Force re-register device (xóa private key cũ và tạo mới)
    // WARNING: Điều này sẽ làm mất khả năng giải mã các tin nhắn cũ (forward secrecy)
    async forceReRegisterDevice(userId) {
        try {
            const isE2EAvailable = await checkE2ECapability();
            if (!isE2EAvailable) {
                throw new Error('E2E encryption not available. Please use development build.');
            }

            const deviceId = await this.getOrCreateDeviceId();
            const keyName = `device_private_key_${userId}_${deviceId}`;

            // Xóa private key cũ từ cache
            this.devicePrivateKey = null;

            // Xóa private key từ SecureStore
            try {
                await SecureStore.deleteItemAsync(keyName);
            } catch (e) {
                // Ignore nếu không thể xóa
            }

            // Generate key pair mới
            const { publicKey, privateKey: newPrivateKey } = await this.generateKeyPair();

            // Lưu private key mới vào SecureStore
            await SecureStore.setItemAsync(keyName, newPrivateKey);
            this.devicePrivateKey = newPrivateKey;

            // Register device mới lên server với public key mới
            const deviceName = await this.getDeviceName();
            await this.registerDevice(userId, deviceId, publicKey, deviceName);

            return { success: true, deviceId, publicKey };
        } catch (error) {
            console.error('Error force re-registering device:', error);
            throw error;
        }
    }

    // Xóa device (khi logout hoặc xóa device)
    async removeDevice(userId, deviceId) {
        try {
            const { error } = await supabase
                .from('user_devices')
                .delete()
                .eq('user_id', userId)
                .eq('device_id', deviceId);

            if (error) {
                throw error;
            }

            // Xóa private key từ SecureStore (nếu có)
            try {
                const isE2EAvailable = await checkE2ECapability();
                if (isE2EAvailable) {
                    const keyName = `device_private_key_${userId}_${deviceId}`;
                    await SecureStore.deleteItemAsync(keyName);
                }
            } catch (e) {
                // Ignore nếu không có SecureStore
            }

            return { success: true };
        } catch (error) {
            console.error('Error removing device:', error);
            throw error;
        }
    }
}

export default new DeviceService();
