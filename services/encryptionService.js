import { Buffer } from 'buffer';
import { supabase } from '../lib/supabase';
import deviceService from './deviceService';
import pinService from './pinService';

class EncryptionService {
    constructor() {
        // Cache decrypted AES keys trong memory (Map<conversationId, aesKey>)
        this.keyCache = new Map();
    }

    // Parse encryptedData format - robust parsing để tránh lỗi "4 parts"
    parseEncryptedData(encryptedData) {
        if (!encryptedData || typeof encryptedData !== "string") return null;

        const parts = encryptedData.split(":");

        // Chỉ chấp nhận 2 hoặc 3 phần
        if (parts.length === 2) {
            return {
                encryptedAESKey: parts[0],
                encryptedAESKeyByPin: null,
                encryptedContent: parts[1],
            };
        }

        if (parts.length === 3) {
            return {
                encryptedAESKey: parts[0],
                encryptedAESKeyByPin: parts[1],
                encryptedContent: parts[2],
            };
        }

        // Format lỗi → không throw → chỉ return null
        return null;
    }


    // Generate random AES-256 key (32 bytes)
    async generateAESKey() {
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
                const key = crypto.randomBytes(32);
                return new Uint8Array(key);
            } catch (e) {
                // Fallback: Dùng react-native-get-random-values
                const { getRandomValues } = require('react-native-get-random-values');
                const key = new Uint8Array(32);
                getRandomValues(key);
                return key;
            }
        } catch (error) {
            console.error('Error generating AES key:', error);
            throw error;
        }
    }

    // Convert Uint8Array to base64 string
    uint8ArrayToBase64(uint8Array) {
        try {
            // React Native: Dùng Buffer nếu có
            if (typeof Buffer !== 'undefined') {
                return Buffer.from(uint8Array).toString('base64');
            }

            // Fallback: Dùng cách cũ nhưng an toàn hơn
            // Chia nhỏ để tránh lỗi "Can't apply() with non-object arguments list"
            const chunkSize = 8192; // 8KB chunks
            let binary = '';
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                binary += String.fromCharCode.apply(null, Array.from(chunk));
            }
            return btoa(binary);
        } catch (error) {
            console.error('Error converting Uint8Array to base64:', error);
            // Fallback: Dùng Array.from để convert
            const array = Array.from(uint8Array);
            const binary = String.fromCharCode.apply(null, array);
            return btoa(binary);
        }
    }

    // Convert base64 string to Uint8Array
    // CRITICAL: Sanitize và validate base64 trước khi decode để tránh lỗi "invalid character"
    // CRITICAL: Return null thay vì throw error để tránh crash app
    base64ToUint8Array(base64) {
        try {
            // Validate input
            if (!base64 || typeof base64 !== 'string') {
                if (__DEV__) {
                    console.warn('[EncryptionService] Invalid base64 input:', {
                        type: typeof base64,
                        value: base64
                    });
                }
                return null; // Return null thay vì throw
            }

            // Sanitize: Loại bỏ whitespace, newline, và các ký tự không hợp lệ
            // Base64 chỉ chứa: A-Z, a-z, 0-9, +, /, = (padding)
            let sanitized = base64.trim();

            // Loại bỏ whitespace và newline
            sanitized = sanitized.replace(/\s/g, '');
            sanitized = sanitized.replace(/\n/g, '');
            sanitized = sanitized.replace(/\r/g, '');

            // Validate base64 format (chỉ chứa ký tự hợp lệ)
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(sanitized)) {
                // Không phải base64 hợp lệ → return null
                if (__DEV__) {
                    console.warn('[EncryptionService] Invalid base64 format detected:', {
                        originalLength: base64.length,
                        sanitizedLength: sanitized.length,
                        firstChars: base64.substring(0, 50),
                        hasInvalidChars: !base64Regex.test(sanitized)
                    });
                }
                return null; // Return null thay vì throw
            }

            // Validate length (base64 phải có độ dài chia hết cho 4, hoặc có padding)
            const remainder = sanitized.length % 4;
            if (remainder !== 0) {
                // Thêm padding nếu thiếu
                sanitized += '='.repeat(4 - remainder);
            }

            // Decode base64 - CRITICAL: Wrap atob() trong try-catch riêng
            let binary;
            try {
                binary = atob(sanitized);
            } catch (atobError) {
                // atob() failed → không phải base64 hợp lệ
                if (__DEV__) {
                    console.warn('[EncryptionService] atob() failed (invalid base64):', {
                        error: atobError.message,
                        sanitizedLength: sanitized.length,
                        firstChars: sanitized.substring(0, 50)
                    });
                }
                return null; // Return null thay vì throw
            }

            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } catch (error) {
            // Log chi tiết để debug
            if (__DEV__) {
                console.error('[EncryptionService] Unexpected error in base64ToUint8Array:', {
                    error: error.message,
                    inputType: typeof base64,
                    inputLength: base64?.length,
                    firstChars: base64?.substring?.(0, 100)
                });
            }
            // CRITICAL: Return null thay vì throw để tránh crash app
            return null;
        }
    }

    // Encrypt message với AES-256-GCM
    async encryptAES(plaintext, aesKey) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(plaintext);

            // Generate random IV (12 bytes cho GCM)
            let iv;
            if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
                iv = new Uint8Array(12);
                window.crypto.getRandomValues(iv);
            } else {
                // React Native: Dùng react-native-quick-crypto
                try {
                    const crypto = require('react-native-quick-crypto');
                    const ivBytes = crypto.randomBytes(12);
                    iv = new Uint8Array(ivBytes);
                } catch (e) {
                    // Fallback: Dùng react-native-get-random-values
                    const { getRandomValues } = require('react-native-get-random-values');
                    iv = new Uint8Array(12);
                    getRandomValues(iv);
                }
            }

            // Sử dụng Web Crypto API nếu có
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                const cryptoKey = await window.crypto.subtle.importKey(
                    'raw',
                    aesKey,
                    { name: 'AES-GCM' },
                    false,
                    ['encrypt']
                );

                const encrypted = await window.crypto.subtle.encrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    cryptoKey,
                    data
                );

                // Combine IV + encrypted data
                const combined = new Uint8Array(iv.length + encrypted.byteLength);
                combined.set(iv, 0);
                combined.set(new Uint8Array(encrypted), iv.length);

                return this.uint8ArrayToBase64(combined);
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');

                if (crypto.subtle) {
                    // Sử dụng crypto.subtle (Web Crypto API compatible)
                    // Đảm bảo aesKey là ArrayBuffer
                    let keyBuffer;
                    if (aesKey instanceof Uint8Array) {
                        // Uint8Array → ArrayBuffer
                        keyBuffer = aesKey.buffer.slice(aesKey.byteOffset, aesKey.byteOffset + aesKey.byteLength);
                    } else if (aesKey instanceof ArrayBuffer) {
                        keyBuffer = aesKey;
                    } else {
                        // Convert sang Uint8Array rồi sang ArrayBuffer
                        const keyArray = new Uint8Array(aesKey);
                        keyBuffer = keyArray.buffer;
                    }

                    // Validate key length (AES-256 cần 32 bytes)
                    if (keyBuffer.byteLength !== 32) {
                        throw new Error(`Invalid AES key length: ${keyBuffer.byteLength} bytes. Expected 32 bytes for AES-256.`);
                    }

                    const cryptoKey = await crypto.subtle.importKey(
                        'raw',
                        keyBuffer,
                        { name: 'AES-GCM' },
                        false,
                        ['encrypt']
                    );

                    const encrypted = await crypto.subtle.encrypt(
                        {
                            name: 'AES-GCM',
                            iv: iv
                        },
                        cryptoKey,
                        data
                    );

                    // Combine IV + encrypted data
                    const combined = new Uint8Array(iv.length + encrypted.byteLength);
                    combined.set(iv, 0);
                    combined.set(new Uint8Array(encrypted), iv.length);

                    return this.uint8ArrayToBase64(combined);
                }

                throw new Error('react-native-quick-crypto.subtle is not available');
            } catch (e) {
                console.error('Error using react-native-quick-crypto for AES encryption:', e);
                throw new Error('Web Crypto API or react-native-quick-crypto required for AES encryption');
            }
        } catch (error) {
            console.error('Error encrypting with AES:', error);
            throw error;
        }
    }

    // Encrypt AES key với master unlock key (AES-256-GCM)
    // Input: aesKey (Uint8Array, 32 bytes), masterUnlockKey (Uint8Array, 32 bytes)
    // Output: base64 string format "iv:cipher" (IV 12 bytes + ciphertext)
    async encryptAESKeyWithMasterKey(aesKey, masterUnlockKey) {
        try {
            // Validate inputs
            if (!(aesKey instanceof Uint8Array) || aesKey.length !== 32) {
                throw new Error(`Invalid AES key: expected Uint8Array of length 32, got ${typeof aesKey}, length: ${aesKey?.length || 0}`);
            }
            if (!(masterUnlockKey instanceof Uint8Array) || masterUnlockKey.length !== 32) {
                throw new Error(`Invalid master unlock key: expected Uint8Array of length 32, got ${typeof masterUnlockKey}, length: ${masterUnlockKey?.length || 0}`);
            }

            // Convert AES key (32 bytes) sang base64 string để mã hóa
            const aesKeyBase64 = this.uint8ArrayToBase64(aesKey);
            const encoder = new TextEncoder();
            const data = encoder.encode(aesKeyBase64);

            // Generate random IV (12 bytes cho GCM)
            let iv;
            if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
                iv = new Uint8Array(12);
                window.crypto.getRandomValues(iv);
            } else {
                // React Native: Dùng react-native-quick-crypto
                try {
                    const crypto = require('react-native-quick-crypto');
                    const ivBytes = crypto.randomBytes(12);
                    iv = new Uint8Array(ivBytes);
                } catch (e) {
                    // Fallback: Dùng react-native-get-random-values
                    const { getRandomValues } = require('react-native-get-random-values');
                    iv = new Uint8Array(12);
                    getRandomValues(iv);
                }
            }

            // Sử dụng Web Crypto API nếu có
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                // Convert masterUnlockKey sang ArrayBuffer
                let keyBuffer;
                if (masterUnlockKey instanceof Uint8Array) {
                    keyBuffer = masterUnlockKey.buffer.slice(masterUnlockKey.byteOffset, masterUnlockKey.byteOffset + masterUnlockKey.byteLength);
                } else {
                    keyBuffer = masterUnlockKey;
                }

                const cryptoKey = await window.crypto.subtle.importKey(
                    'raw',
                    keyBuffer,
                    { name: 'AES-GCM' },
                    false,
                    ['encrypt']
                );

                const encrypted = await window.crypto.subtle.encrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    cryptoKey,
                    data
                );

                // Format: "iv:cipher" (base64)
                const ivBase64 = this.uint8ArrayToBase64(iv);
                const cipherBase64 = this.uint8ArrayToBase64(new Uint8Array(encrypted));
                return `${ivBase64}:${cipherBase64}`;
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');

                if (crypto.subtle) {
                    // Convert masterUnlockKey sang ArrayBuffer
                    let keyBuffer;
                    if (masterUnlockKey instanceof Uint8Array) {
                        keyBuffer = masterUnlockKey.buffer.slice(masterUnlockKey.byteOffset, masterUnlockKey.byteOffset + masterUnlockKey.byteLength);
                    } else if (masterUnlockKey instanceof ArrayBuffer) {
                        keyBuffer = masterUnlockKey;
                    } else {
                        const keyArray = new Uint8Array(masterUnlockKey);
                        keyBuffer = keyArray.buffer;
                    }

                    // Validate key length
                    if (keyBuffer.byteLength !== 32) {
                        throw new Error(`Invalid master unlock key length: ${keyBuffer.byteLength} bytes. Expected 32 bytes for AES-256.`);
                    }

                    const cryptoKey = await crypto.subtle.importKey(
                        'raw',
                        keyBuffer,
                        { name: 'AES-GCM' },
                        false,
                        ['encrypt']
                    );

                    const encrypted = await crypto.subtle.encrypt(
                        {
                            name: 'AES-GCM',
                            iv: iv
                        },
                        cryptoKey,
                        data
                    );

                    // Format: "iv:cipher" (base64)
                    const ivBase64 = this.uint8ArrayToBase64(iv);
                    const cipherBase64 = this.uint8ArrayToBase64(new Uint8Array(encrypted));
                    return `${ivBase64}:${cipherBase64}`;
                }

                throw new Error('react-native-quick-crypto.subtle is not available');
            } catch (e) {
                console.error('Error using react-native-quick-crypto for AES key encryption:', e);
                throw new Error('Web Crypto API or react-native-quick-crypto required for AES key encryption');
            }
        } catch (error) {
            console.error('Error encrypting AES key with master key:', error);
            throw error;
        }
    }

    // Decrypt AES key với master unlock key (AES-256-GCM)
    // Input: encryptedData (base64 string format "iv:cipher"), masterUnlockKey (Uint8Array, 32 bytes)
    // Output: Uint8Array (32 bytes) - AES key
    async decryptAESKeyWithMasterKey(encryptedData, masterUnlockKey) {
        try {
            // Validate inputs
            if (!encryptedData || typeof encryptedData !== 'string') {
                throw new Error(`Invalid encrypted data: expected string, got ${typeof encryptedData}`);
            }
            if (!(masterUnlockKey instanceof Uint8Array) || masterUnlockKey.length !== 32) {
                throw new Error(`Invalid master unlock key: expected Uint8Array of length 32, got ${typeof masterUnlockKey}, length: ${masterUnlockKey?.length || 0}`);
            }

            // Parse format "iv:cipher"
            const parts = encryptedData.split(':');
            if (parts.length !== 2) {
                throw new Error(`Invalid encrypted data format: expected "iv:cipher", got ${parts.length} parts`);
            }

            const ivBase64 = parts[0];
            const cipherBase64 = parts[1];

            // Convert base64 sang Uint8Array
            const iv = this.base64ToUint8Array(ivBase64);
            const encrypted = this.base64ToUint8Array(cipherBase64);

            // Validate IV length (12 bytes)
            if (iv.length !== 12) {
                throw new Error(`Invalid IV length: ${iv.length} bytes. Expected 12 bytes for AES-GCM.`);
            }

            // Sử dụng Web Crypto API nếu có
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                // Convert masterUnlockKey sang ArrayBuffer
                let keyBuffer;
                if (masterUnlockKey instanceof Uint8Array) {
                    keyBuffer = masterUnlockKey.buffer.slice(masterUnlockKey.byteOffset, masterUnlockKey.byteOffset + masterUnlockKey.byteLength);
                } else {
                    keyBuffer = masterUnlockKey;
                }

                const cryptoKey = await window.crypto.subtle.importKey(
                    'raw',
                    keyBuffer,
                    { name: 'AES-GCM' },
                    false,
                    ['decrypt']
                );

                const decrypted = await window.crypto.subtle.decrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    cryptoKey,
                    encrypted
                );

                // Decrypted data là base64 string của AES key
                const decoder = new TextDecoder();
                const aesKeyBase64 = decoder.decode(decrypted);

                // Convert base64 string sang Uint8Array (32 bytes)
                const aesKey = this.base64ToUint8Array(aesKeyBase64);

                // Validate AES key length
                if (aesKey.length !== 32) {
                    throw new Error(`Invalid decrypted AES key length: ${aesKey.length} bytes. Expected 32 bytes.`);
                }

                return aesKey;
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');

                // Convert masterUnlockKey sang ArrayBuffer
                let keyBuffer;
                if (masterUnlockKey instanceof Uint8Array) {
                    keyBuffer = masterUnlockKey.buffer.slice(masterUnlockKey.byteOffset, masterUnlockKey.byteOffset + masterUnlockKey.byteLength);
                } else if (masterUnlockKey instanceof ArrayBuffer) {
                    keyBuffer = masterUnlockKey;
                } else {
                    const keyArray = new Uint8Array(masterUnlockKey);
                    keyBuffer = keyArray.buffer;
                }

                // Validate key length
                if (keyBuffer.byteLength !== 32) {
                    throw new Error(`Invalid master unlock key length: ${keyBuffer.byteLength} bytes. Expected 32 bytes for AES-256.`);
                }

                const cryptoKey = await crypto.subtle.importKey(
                    'raw',
                    keyBuffer,
                    { name: 'AES-GCM' },
                    false,
                    ['decrypt']
                );

                // Convert encrypted data sang ArrayBuffer
                const encryptedBuffer = encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength);

                const decrypted = await crypto.subtle.decrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    cryptoKey,
                    encryptedBuffer
                );

                // Decrypted data là base64 string của AES key
                const decoder = new TextDecoder();
                const aesKeyBase64 = decoder.decode(decrypted);

                // Convert base64 string sang Uint8Array (32 bytes)
                const aesKey = this.base64ToUint8Array(aesKeyBase64);

                // Validate AES key length
                if (aesKey.length !== 32) {
                    throw new Error(`Invalid decrypted AES key length: ${aesKey.length} bytes. Expected 32 bytes.`);
                }

                return aesKey;
            } catch (e) {
                console.error('Error using react-native-quick-crypto for AES key decryption:', e);
                throw new Error(`AES key decryption failed: ${e.message}`);
            }
        } catch (error) {
            console.error('Error decrypting AES key with master key:', error);
            throw error;
        }
    }

    // Decrypt message với AES-256-GCM
    async decryptAES(encryptedBase64, aesKey) {
        try {
            // CRITICAL: base64ToUint8Array có thể return null nếu base64 không hợp lệ
            const combined = this.base64ToUint8Array(encryptedBase64);
            if (!combined) {
                // base64 không hợp lệ → return null thay vì throw
                if (__DEV__) {
                    console.warn('[EncryptionService] decryptAES: base64ToUint8Array returned null (invalid base64)');
                }
                return null;
            }

            // Extract IV (12 bytes đầu)
            const iv = combined.slice(0, 12);
            const encrypted = combined.slice(12);

            // Sử dụng Web Crypto API
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                const cryptoKey = await window.crypto.subtle.importKey(
                    'raw',
                    aesKey,
                    { name: 'AES-GCM' },
                    false,
                    ['decrypt']
                );

                const decrypted = await window.crypto.subtle.decrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv
                    },
                    cryptoKey,
                    encrypted
                );

                const decoder = new TextDecoder();
                return decoder.decode(decrypted);
            }

            // React Native: Dùng react-native-quick-crypto
            try {
                const crypto = require('react-native-quick-crypto');

                // Thử dùng createDecipheriv nếu có (có thể ổn định hơn subtle)
                if (crypto.createDecipheriv) {
                    const { Buffer } = require('buffer');

                    // Với AES-GCM, authentication tag (16 bytes) nằm ở cuối encrypted data
                    // Cần tách ra và set bằng setAuthTag()
                    if (encrypted.length < 16) {
                        throw new Error(`Invalid encrypted data length: ${encrypted.length} bytes. AES-GCM requires at least 16 bytes for authentication tag.`);
                    }

                    // Extract ciphertext và authentication tag
                    const tagLength = 16;
                    const ciphertext = encrypted.slice(0, encrypted.length - tagLength);
                    const authTag = encrypted.slice(encrypted.length - tagLength);

                    // Convert sang Buffer
                    const keyBuffer = aesKey instanceof Uint8Array
                        ? Buffer.from(aesKey)
                        : Buffer.from(aesKey);
                    const ivBuffer = Buffer.from(iv);
                    const ciphertextBuffer = Buffer.from(ciphertext);
                    const authTagBuffer = Buffer.from(authTag);

                    // Tạo decipher
                    const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, ivBuffer);

                    // Set authentication tag (QUAN TRỌNG: phải set trước khi decrypt)
                    decipher.setAuthTag(authTagBuffer);

                    // Decrypt
                    let decrypted = decipher.update(ciphertextBuffer, null, 'utf8');
                    decrypted += decipher.final('utf8');

                    return decrypted;
                }

                // Kiểm tra xem crypto.subtle có available không
                if (!crypto || !crypto.subtle) {
                    console.error('react-native-quick-crypto.subtle is not available');
                    console.error('Available crypto properties:', Object.keys(crypto || {}));
                    throw new Error('react-native-quick-crypto.subtle is not available. Please rebuild the app with: npx expo prebuild && npx expo run:android');
                }

                // Sử dụng crypto.subtle (Web Crypto API compatible)
                // Đảm bảo aesKey là ArrayBuffer
                let keyBuffer;
                if (aesKey instanceof Uint8Array) {
                    // Uint8Array → ArrayBuffer
                    keyBuffer = aesKey.buffer.slice(aesKey.byteOffset, aesKey.byteOffset + aesKey.byteLength);
                } else if (aesKey instanceof ArrayBuffer) {
                    keyBuffer = aesKey;
                } else {
                    // Convert sang Uint8Array rồi sang ArrayBuffer
                    const keyArray = new Uint8Array(aesKey);
                    keyBuffer = keyArray.buffer;
                }

                // Validate key length (AES-256 cần 32 bytes)
                if (keyBuffer.byteLength !== 32) {
                    throw new Error(`Invalid AES key length: ${keyBuffer.byteLength} bytes. Expected 32 bytes for AES-256.`);
                }

                const cryptoKey = await crypto.subtle.importKey(
                    'raw',
                    keyBuffer,
                    { name: 'AES-GCM' },
                    false,
                    ['decrypt']
                );

                // Đảm bảo IV và encrypted data đúng format
                // react-native-quick-crypto có thể yêu cầu format đặc biệt
                const ivArray = iv instanceof Uint8Array ? iv : new Uint8Array(iv);
                const encryptedArray = encrypted instanceof Uint8Array ? encrypted : new Uint8Array(encrypted);

                // Validate: Encrypted data phải có ít nhất 16 bytes (authentication tag)
                if (encryptedArray.length < 16) {
                    throw new Error(`Invalid encrypted data length: ${encryptedArray.length} bytes. AES-GCM requires at least 16 bytes for authentication tag.`);
                }

                // react-native-quick-crypto có thể yêu cầu Uint8Array thay vì ArrayBuffer
                // Tạo Uint8Array mới để đảm bảo không có vấn đề với buffer sharing
                const ivForDecrypt = new Uint8Array(ivArray);
                const encryptedForDecrypt = new Uint8Array(encryptedArray);


                // Convert sang ArrayBuffer cho crypto.subtle
                const ivBuffer = ivForDecrypt.buffer.slice(ivForDecrypt.byteOffset, ivForDecrypt.byteOffset + ivForDecrypt.byteLength);
                const encryptedBuffer = encryptedForDecrypt.buffer.slice(
                    encryptedForDecrypt.byteOffset,
                    encryptedForDecrypt.byteOffset + encryptedForDecrypt.byteLength
                );

                try {
                    // Thử với IV là Uint8Array (react-native-quick-crypto có thể yêu cầu TypedArray)
                    const decrypted = await crypto.subtle.decrypt(
                        {
                            name: 'AES-GCM',
                            iv: ivForDecrypt
                        },
                        cryptoKey,
                        encryptedBuffer
                    );

                    const decoder = new TextDecoder();
                    return decoder.decode(decrypted);
                } catch (decryptError) {
                    // Thử lại với IV là ArrayBuffer
                    try {
                        const decrypted = await crypto.subtle.decrypt(
                            {
                                name: 'AES-GCM',
                                iv: ivBuffer
                            },
                            cryptoKey,
                            encryptedBuffer
                        );
                        const decoder = new TextDecoder();
                        return decoder.decode(decrypted);
                    } catch (retryError) {
                        // Thử với cả IV và encrypted data đều là Uint8Array
                        try {
                            // Tạo ArrayBuffer từ Uint8Array
                            const encryptedArrayBuffer = encryptedForDecrypt.buffer.slice(
                                encryptedForDecrypt.byteOffset,
                                encryptedForDecrypt.byteOffset + encryptedForDecrypt.byteLength
                            );
                            const decrypted = await crypto.subtle.decrypt(
                                {
                                    name: 'AES-GCM',
                                    iv: ivForDecrypt
                                },
                                cryptoKey,
                                encryptedArrayBuffer
                            );
                            const decoder = new TextDecoder();
                            return decoder.decode(decrypted);
                        } catch (finalError) {
                            throw decryptError; // Throw original error
                        }
                    }
                }

            } catch (e) {
                console.error('Error using react-native-quick-crypto for AES decryption:', e);
                console.error('Error details:', e.message, e.stack);
                throw new Error(`AES decryption failed: ${e.message}`);
            }
        } catch (error) {
            console.error('Error decrypting with AES:', error);
            throw error;
        }
    }

    // Encrypt AES key với RSA public key
    async encryptAESKeyWithRSA(aesKey, publicKeyPem) {
        try {
            // Validate AES key
            if (!(aesKey instanceof Uint8Array) || aesKey.length !== 32) {
                throw new Error(`encryptAESKeyWithRSA: Invalid AES key length ${aesKey?.length || 0}`);
            }

            // Chuẩn hóa buffer
            const aesKeyBuffer = (aesKey.byteOffset === 0 && aesKey.byteLength === aesKey.buffer.byteLength)
                ? aesKey.buffer
                : aesKey.buffer.slice(aesKey.byteOffset, aesKey.byteOffset + aesKey.byteLength);

            // Sử dụng Web Crypto API
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                const publicKey = await this.importRSAPublicKey(publicKeyPem);

                const encrypted = await window.crypto.subtle.encrypt(
                    {
                        name: 'RSA-OAEP'
                    },
                    publicKey,
                    aesKeyBuffer
                );

                return this.uint8ArrayToBase64(new Uint8Array(encrypted));
            }

            // React Native: Dùng react-native-quick-crypto
            // LUÔN dùng publicEncrypt/privateDecrypt (không dùng crypto.subtle cho RSA)
            // Vì crypto.subtle không hỗ trợ pkcs8 cho private key
            try {
                const crypto = require('react-native-quick-crypto');

                if (!crypto.publicEncrypt) {
                    throw new Error('react-native-quick-crypto.publicEncrypt is not available');
                }

                // Dùng PKCS1 padding (không dùng OAEP vì publicEncrypt/privateDecrypt không hỗ trợ)
                const pkcs1Padding = crypto.constants?.RSA_PKCS1_PADDING || 1;

                // Đảm bảo aesKey là Uint8Array và đúng 32 bytes
                let inputBuffer;
                if (aesKey instanceof Uint8Array) {
                    inputBuffer = Buffer.from(aesKey);
                } else if (aesKey instanceof Buffer) {
                    inputBuffer = aesKey;
                } else {
                    throw new Error(`Invalid AES key type: ${typeof aesKey}, expected Uint8Array or Buffer`);
                }

                if (inputBuffer.length !== 32) {
                    throw new Error(`Invalid AES key length: ${inputBuffer.length} bytes, expected 32 bytes`);
                }


                const encrypted = crypto.publicEncrypt(
                    {
                        key: publicKeyPem,
                        padding: pkcs1Padding
                    },
                    inputBuffer
                );

                if (!encrypted || encrypted.length === 0) {
                    throw new Error('RSA encryption returned empty result');
                }

                if (encrypted.length !== 256) {
                }

                const encryptedBase64 = encrypted.toString('base64');
                return encryptedBase64;
            } catch (e) {
                throw new Error(`RSA encryption failed: ${e.message}`);
            }
        } catch (error) {
            console.error('Error encrypting AES key with RSA:', error);
            throw error;
        }
    }

    // Decrypt AES key với RSA private key
    async decryptAESKeyWithRSA(encryptedBase64, privateKeyPem) {
        try {
            // Sử dụng Web Crypto API
            if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
                const privateKey = await this.importRSAPrivateKey(privateKeyPem);
                const encrypted = this.base64ToUint8Array(encryptedBase64);

                const decrypted = await window.crypto.subtle.decrypt(
                    {
                        name: 'RSA-OAEP'
                    },
                    privateKey,
                    encrypted
                );

                const aesKeyBase64 = new TextDecoder().decode(decrypted);
                return this.base64ToUint8Array(aesKeyBase64);
            }

            // React Native: Dùng react-native-quick-crypto
            // LUÔN dùng privateDecrypt (không dùng crypto.subtle cho RSA)
            // Vì crypto.subtle không hỗ trợ pkcs8 cho private key
            try {
                const crypto = require('react-native-quick-crypto');

                if (!crypto.privateDecrypt) {
                    throw new Error('react-native-quick-crypto.privateDecrypt is not available');
                }

                // Validate private key format
                if (!privateKeyPem || !privateKeyPem.includes('BEGIN PRIVATE KEY') || !privateKeyPem.includes('END PRIVATE KEY')) {
                    throw new Error('Invalid private key format. Missing BEGIN/END PRIVATE KEY markers.');
                }

                // Validate encrypted data
                if (!encryptedBase64 || typeof encryptedBase64 !== 'string' || encryptedBase64.length === 0) {
                    throw new Error('Invalid encrypted data: empty or not a string');
                }

                const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');

                // Validate encrypted buffer
                if (!encryptedBuffer || encryptedBuffer.length === 0) {
                    throw new Error('Failed to decode encrypted data from base64');
                }


                // Thử decrypt với các padding khác nhau
                let decrypted;
                let usedPadding = null;
                let decryptError = null;

                // Thử với PKCS1 padding trước (giống như encrypt)
                try {
                    const pkcs1Padding = crypto.constants?.RSA_PKCS1_PADDING || 1;
                    decrypted = crypto.privateDecrypt(
                        {
                            key: privateKeyPem,
                            padding: pkcs1Padding
                        },
                        encryptedBuffer
                    );
                    usedPadding = 'PKCS1';

                    // Validate: Decrypted data phải có ít nhất 32 bytes (raw AES key)
                    // Hoặc có thể có padding ở đầu/cuối
                    if (decrypted.length < 32) {
                        decryptError = new Error(`Decrypted data too short: ${decrypted.length} bytes. Expected at least 32 bytes for AES key. This indicates key mismatch.`);
                        throw decryptError;
                    }
                } catch (e1) {
                    decryptError = e1;

                    // Thử không dùng padding
                    try {
                        decrypted = crypto.privateDecrypt(
                            {
                                key: privateKeyPem
                            },
                            encryptedBuffer
                        );
                        usedPadding = 'default';

                        if (decrypted.length < 32) {
                            decryptError = new Error(`Decrypted data too short: ${decrypted.length} bytes. Expected at least 32 bytes for AES key.`);
                            throw decryptError;
                        }
                    } catch (e2) {
                        throw new Error(`RSA decryption failed with all padding methods. PKCS1 error: ${e1.message}, Default error: ${e2.message}`);
                    }
                }

                // Khi encrypt, ta encrypt raw 32-byte AES key trực tiếp
                // Khi decrypt, kết quả sẽ là raw bytes (có thể có padding ở đầu/cuối)

                // Thử extract 32-byte AES key từ decrypted data
                // Có thể có padding ở đầu (null bytes hoặc random bytes)
                let aesKeyBytes = null;

                // Trường hợp 1: Đúng 32 bytes → đây là raw AES key
                if (decrypted.length === 32) {
                    aesKeyBytes = new Uint8Array(decrypted);
                }
                // Trường hợp 2: Nhiều hơn 32 bytes → có thể có padding ở đầu
                else if (decrypted.length > 32) {
                    // Thử lấy 32 bytes cuối cùng (padding thường ở đầu)
                    const last32Bytes = decrypted.slice(-32);
                    aesKeyBytes = new Uint8Array(last32Bytes);
                }
                // Trường hợp 3: Ít hơn 32 bytes → không hợp lệ (đã được check ở trên)
                else {
                    throw new Error(`Invalid decrypted key length: ${decrypted.length} bytes (expected at least 32 bytes)`);
                }

                // Validate: Phải đúng 32 bytes
                if (!aesKeyBytes || aesKeyBytes.length !== 32) {
                    throw new Error(`Failed to extract 32-byte AES key from decrypted data (got ${aesKeyBytes?.length || 0} bytes)`);
                }

                return aesKeyBytes;
            } catch (e) {
                throw new Error(`RSA decryption failed: ${e.message}`);
            }
        } catch (error) {
            console.error('Error decrypting AES key with RSA:', error);
            throw error;
        }
    }

    // Import RSA public key từ PEM
    async importRSAPublicKey(pemKey) {
        const pemHeader = '-----BEGIN PUBLIC KEY-----';
        const pemFooter = '-----END PUBLIC KEY-----';
        const pemContents = pemKey
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');
        const binaryDer = this.base64ToUint8Array(pemContents);

        return await window.crypto.subtle.importKey(
            'spki',
            binaryDer.buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            false,
            ['encrypt']
        );
    }

    // Import RSA private key từ PEM
    async importRSAPrivateKey(pemKey) {
        const pemHeader = '-----BEGIN PRIVATE KEY-----';
        const pemFooter = '-----END PRIVATE KEY-----';
        const pemContents = pemKey
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');
        const binaryDer = this.base64ToUint8Array(pemContents);

        return await window.crypto.subtle.importKey(
            'pkcs8',
            binaryDer.buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            false,
            ['decrypt']
        );
    }

    // Import RSA public key từ PEM cho React Native (dùng crypto.subtle)
    async importRSAPublicKeyForRN(pemKey, crypto) {
        const pemHeader = '-----BEGIN PUBLIC KEY-----';
        const pemFooter = '-----END PUBLIC KEY-----';
        const pemContents = pemKey
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');
        const binaryDer = this.base64ToUint8Array(pemContents);

        return await crypto.subtle.importKey(
            'spki',
            binaryDer.buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            false,
            ['encrypt']
        );
    }

    // Import RSA private key từ PEM cho React Native (dùng crypto.subtle)
    async importRSAPrivateKeyForRN(pemKey, crypto) {
        const pemHeader = '-----BEGIN PRIVATE KEY-----';
        const pemFooter = '-----END PRIVATE KEY-----';
        const pemContents = pemKey
            .replace(pemHeader, '')
            .replace(pemFooter, '')
            .replace(/\s/g, '');
        const binaryDer = this.base64ToUint8Array(pemContents);

        return await crypto.subtle.importKey(
            'pkcs8',
            binaryDer.buffer,
            {
                name: 'RSA-OAEP',
                hash: 'SHA-256'
            },
            false,
            ['decrypt']
        );
    }

    // Lấy hoặc tạo conversation key cho device hiện tại
    // Forward secrecy: Device mới sẽ có key mới, chỉ thấy tin nhắn từ lúc tham gia
    async getOrCreateConversationKey(conversationId, userId) {
        try {
            // Kiểm tra cache trước
            if (this.keyCache.has(conversationId)) {
                return this.keyCache.get(conversationId);
            }

            const deviceId = await deviceService.getOrCreateDeviceId();

            // Kiểm tra đã có key cho device này chưa
            const { data: existingKey, error: keyError } = await supabase
                .from('conversation_keys')
                .select('encrypted_key, key_version')
                .eq('conversation_id', conversationId)
                .eq('user_id', userId)
                .eq('device_id', deviceId)
                .order('key_version', { ascending: false })
                .limit(1)
                .single();

            if (existingKey && !keyError) {
                // Đã có key → Giải mã và cache
                try {
                    const privateKey = await deviceService.getOrCreatePrivateKey(userId);
                    const aesKey = await this.decryptAESKeyWithRSA(
                        existingKey.encrypted_key,
                        privateKey
                    );

                    // Validate key length
                    if (aesKey.length !== 32) {
                        throw new Error(`Invalid decrypted key length: ${aesKey.length} bytes, expected 32`);
                    }

                    this.keyCache.set(conversationId, aesKey);
                    return aesKey;
                } catch (decryptError) {
                    // Nếu không decrypt được (có thể do data cũ được encrypt bằng method khác)
                    // Forward secrecy: Tạo key mới cho device này
                    // Fall through để tạo key mới
                }
            }

            // Chưa có key → Tạo key mới (device mới tham gia)
            // Forward secrecy: Device mới chỉ thấy tin nhắn từ lúc này
            const newAESKey = await this.generateAESKey();

            // Đảm bảo device hiện tại đã được register
            await deviceService.getOrCreatePrivateKey(userId);

            // Lấy tất cả devices của cả 2 users trong conversation
            const { data: members } = await supabase
                .from('conversation_members')
                .select('user_id')
                .eq('conversation_id', conversationId);

            if (!members || members.length === 0) {
                throw new Error('No members found in conversation');
            }


            // Lấy tất cả devices của tất cả members
            const userIds = members.map(m => m.user_id);
            const { data: allDevices } = await supabase
                .from('user_devices')
                .select('user_id, device_id, public_key')
                .in('user_id', userIds);

            if (!allDevices || allDevices.length === 0) {
                throw new Error('No devices found for conversation members. Please ensure all users have registered devices.');
            }


            // Mã hóa AES key cho tất cả devices
            const keysToInsert = await Promise.all(
                allDevices.map(async (device) => {
                    const encryptedKey = await this.encryptAESKeyWithRSA(
                        newAESKey,
                        device.public_key
                    );

                    // Tìm key_version cao nhất hiện tại
                    const { data: maxVersion } = await supabase
                        .from('conversation_keys')
                        .select('key_version')
                        .eq('conversation_id', conversationId)
                        .eq('user_id', device.user_id)
                        .eq('device_id', device.device_id)
                        .order('key_version', { ascending: false })
                        .limit(1)
                        .single();

                    const keyVersion = (maxVersion?.key_version || 0) + 1;

                    return {
                        conversation_id: conversationId,
                        user_id: device.user_id,
                        device_id: device.device_id,
                        encrypted_key: encryptedKey,
                        key_version: keyVersion
                    };
                })
            );

            // Lưu vào database
            // Kiểm tra lại xem key đã tồn tại chưa (tránh race condition)
            const { error: insertError } = await supabase
                .from('conversation_keys')
                .insert(keysToInsert);

            if (insertError) {
                // Nếu lỗi duplicate key → có thể do race condition, thử lấy key hiện có
                if (insertError.code === '23505') {
                    // Thử lại query key hiện có
                    const { data: retryKey, error: retryError } = await supabase
                        .from('conversation_keys')
                        .select('encrypted_key, key_version')
                        .eq('conversation_id', conversationId)
                        .eq('user_id', userId)
                        .eq('device_id', deviceId)
                        .order('key_version', { ascending: false })
                        .limit(1)
                        .single();

                    if (retryKey && !retryError) {
                        try {
                            const privateKey = await deviceService.getOrCreatePrivateKey(userId);
                            const aesKey = await this.decryptAESKeyWithRSA(
                                retryKey.encrypted_key,
                                privateKey
                            );

                            if (aesKey.length === 32) {
                                this.keyCache.set(conversationId, aesKey);
                                return aesKey;
                            }
                        } catch (decryptError) {
                        }
                    }
                }
                throw insertError;
            }

            // Cache key
            this.keyCache.set(conversationId, newAESKey);
            return newAESKey;
        } catch (error) {
            console.error('Error getting conversation key:', error);
            throw error;
        }
    }

    // Encrypt message content
    async encryptMessage(content, conversationId, userId) {
        try {
            const aesKey = await this.getOrCreateConversationKey(conversationId, userId);
            const encrypted = await this.encryptAES(content, aesKey);
            return encrypted;
        } catch (error) {
            console.error('Error encrypting message:', error);
            throw error;
        }
    }

    // Decrypt message content
    async decryptMessage(encryptedContent, conversationId, userId) {
        try {
            // Đảm bảo device đã được register trước khi decrypt
            // Nếu chưa có device, sẽ tự động register
            await deviceService.getOrCreatePrivateKey(userId);

            // Lấy key hiện tại (hoặc tạo mới nếu chưa có)
            const aesKey = await this.getOrCreateConversationKey(conversationId, userId);
            const decrypted = await this.decryptAES(encryptedContent, aesKey);
            return decrypted;
        } catch (error) {
            console.error('Error decrypting message:', error);
            console.error('Error details:', error.message, error.stack);
            // Trả về null nếu không decrypt được (forward secrecy: device mới không có key cũ)
            return null;
        }
    }

    // Encrypt message với device-specific key (cho sender copy)
    // Tạo AES key riêng cho device, mã hóa bằng RSA public key của device
    async encryptMessageWithDeviceKey(content, userId, deviceId) {
        try {
            // Validate inputs
            if (!content || typeof content !== 'string') {
                throw new Error(`Invalid content: expected string, got ${typeof content}`);
            }
            if (!userId) {
                throw new Error('userId is required');
            }
            if (!deviceId) {
                throw new Error('deviceId is required');
            }

            // Lấy public key của device
            const { data: device, error: deviceError } = await supabase
                .from('user_devices')
                .select('public_key')
                .eq('user_id', userId)
                .eq('device_id', deviceId)
                .single();

            if (deviceError) {
                console.error('Error fetching device:', deviceError);
                throw new Error(`Device ${deviceId} not found for user ${userId}: ${deviceError.message}`);
            }

            if (!device || !device.public_key) {
                throw new Error(`Device ${deviceId} does not have a public key`);
            }

            // Validate public key format
            if (typeof device.public_key !== 'string' || !device.public_key.includes('BEGIN PUBLIC KEY')) {
                throw new Error(`Invalid public key format for device ${deviceId}`);
            }

            // Verify key pair trước khi mã hóa (để đảm bảo public key và private key khớp)
            try {
                const currentDeviceId = await deviceService.getOrCreateDeviceId();
                if (deviceId === currentDeviceId) {
                    // Nếu đang mã hóa cho device hiện tại, test key pair
                    const privateKey = await deviceService.getOrCreatePrivateKey(userId);
                    const keyPairValid = await this.testKeyPair(device.public_key, privateKey);
                    if (!keyPairValid) {
                        throw new Error('Public key and private key do not match. Device needs to be re-registered.');
                    } else {
                    }
                }
            } catch (testError) {
                // Nếu test thất bại, vẫn tiếp tục mã hóa (có thể là device khác)
            }

            // Tạo AES key mới cho message này
            const aesKey = await this.generateAESKey();

            // Validate AES key
            if (!aesKey || !(aesKey instanceof Uint8Array) || aesKey.length !== 32) {
                throw new Error(`Invalid AES key: expected Uint8Array of length 32, got ${typeof aesKey}, length: ${aesKey?.length || 0}`);
            }

            // Mã hóa AES key bằng RSA public key của device
            // encryptAESKeyWithRSA trả về base64 string
            let encryptedAESKeyBase64;
            try {
                encryptedAESKeyBase64 = await this.encryptAESKeyWithRSA(aesKey, device.public_key);
            } catch (rsaError) {
                console.error('Error in encryptAESKeyWithRSA:', rsaError);
                throw new Error(`Failed to encrypt AES key with RSA: ${rsaError.message}`);
            }

            // Validate encrypted AES key
            if (!encryptedAESKeyBase64 || typeof encryptedAESKeyBase64 !== 'string') {
                throw new Error(`Failed to encrypt AES key: got ${typeof encryptedAESKeyBase64}`);
            }

            // Mã hóa message content bằng AES key
            // encryptAES trả về base64 string (không phải Uint8Array)
            let encryptedContentBase64;
            try {
                encryptedContentBase64 = await this.encryptAES(content, aesKey);
            } catch (aesError) {
                console.error('Error in encryptAES:', aesError);
                throw new Error(`Failed to encrypt content with AES: ${aesError.message}`);
            }

            // Validate encrypted content (encryptAES trả về base64 string)
            if (!encryptedContentBase64 || typeof encryptedContentBase64 !== 'string') {
                throw new Error(`Failed to encrypt content: got ${typeof encryptedContentBase64}, expected string`);
            }

            // Kết hợp: encryptedAESKey + encryptedContent
            // Format: base64(encryptedAESKey) + ":" + base64(encryptedContent)
            let result = `${encryptedAESKeyBase64}:${encryptedContentBase64}`;
            let encryptedAESKeyByPIN = null;

            // FIX: LUÔN tạo PIN layer nếu user đã có PIN (isPinSet = true)
            // KHÔNG phụ thuộc vào trạng thái pinUnlocked tại thời điểm gửi
            try {
                const isPinSet = await pinService.isPinSet(userId);

                if (isPinSet) {
                    // User đã có PIN → cần derive master unlock key từ PIN để mã hóa
                    // Nếu chưa unlock, cần unlock trước (hoặc derive từ PIN)
                    let masterUnlockKey = pinService.getMasterUnlockKey();

                    if (!masterUnlockKey) {
                        // Chưa unlock → không thể tạo PIN layer
                        // Vẫn tiếp tục với format 2 phần
                    } else {
                        // Mã hóa AES key bằng master unlock key
                        // encryptedAESKeyByPIN có format "iv:cipher" (đã chứa dấu ':')
                        encryptedAESKeyByPIN = await this.encryptAESKeyWithMasterKey(aesKey, masterUnlockKey);

                        // FIX: Base64 encode encryptedAESKeyByPIN để tránh conflict với dấu ':' khi ghép chuỗi
                        // encryptedAESKeyByPIN có format "iv:cipher", cần encode để không bị split thành 4 parts
                        const encryptedAESKeyByPIN_encoded = this.uint8ArrayToBase64(
                            new TextEncoder().encode(encryptedAESKeyByPIN)
                        );

                        // Format mới: encryptedAESKey:encryptedAESKeyByPIN_encoded:encryptedContent
                        // encryptedAESKeyByPIN_encoded đã được base64 encode, không chứa dấu ':'
                        result = `${encryptedAESKeyBase64}:${encryptedAESKeyByPIN_encoded}:${encryptedContentBase64}`;
                    }
                }
            } catch (error) {
                // Nếu lỗi khi mã hóa bằng master unlock key, vẫn trả về format cũ (2 phần)
                // Điều này đảm bảo backward compatibility
            }

            // Return object để có thể lấy encryptedAESKeyByPIN riêng
            return {
                encryptedContent: result, // Format string (backward compatibility)
                encryptedAESKeyByPIN: encryptedAESKeyByPIN // Riêng để lưu vào DB
            };
        } catch (error) {
            console.error('Error encrypting message with device key:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                userId,
                deviceId,
                contentLength: content?.length
            });
            throw error;
        }
    }

    // Test RSA key pair: Encrypt với public key, decrypt với private key
    async testKeyPair(publicKeyPem, privateKeyPem) {
        try {
            // Tạo test data đúng 32 bytes
            const crypto = require('react-native-quick-crypto');
            const testData = crypto.randomBytes(32); // Tạo random 32 bytes


            const pkcs1Padding = crypto.constants?.RSA_PKCS1_PADDING || 1;

            // Encrypt với public key
            const encrypted = crypto.publicEncrypt(
                {
                    key: publicKeyPem,
                    padding: pkcs1Padding
                },
                testData
            );

            // Decrypt với private key
            const decrypted = crypto.privateDecrypt(
                {
                    key: privateKeyPem,
                    padding: pkcs1Padding
                },
                encrypted
            );

            // Verify: So sánh từng byte
            if (decrypted.length !== 32) {
                return false;
            }

            // So sánh từng byte
            for (let i = 0; i < 32; i++) {
                if (decrypted[i] !== testData[i]) {
                    return false;
                }
            }

            return true;
        } catch (error) {
            return false;
        }
    }

    // Decrypt message với device-specific key (cho sender copy)
    // encryptedData: content từ DB (format string: encryptedAESKey:encryptedContent hoặc encryptedAESKey:encryptedAESKeyByPIN:encryptedContent)
    // encryptedAESKeyByPin: encrypted_aes_key_by_pin từ DB (nếu có, format "iv:cipher" base64)
    async decryptMessageWithDeviceKey(encryptedData, userId, deviceId, encryptedAESKeyByPin = null) {
        try {
            // FIX: Validate encrypted data TRƯỚC KHI decrypt
            if (!encryptedData || typeof encryptedData !== 'string' || encryptedData.trim() === '') {
                return null;
            }

            let currentDeviceId;
            try {
                currentDeviceId = await deviceService.getOrCreateDeviceId();

                // Validate deviceId
                if (!deviceId) {
                    console.error('[EncryptionService] ERROR: sender_device_id is null or undefined');
                    return null;
                }
                if (!currentDeviceId) {
                    console.error('[EncryptionService] ERROR: currentDeviceId is null or undefined');
                    return null;
                }
            } catch (deviceIdError) {
                console.error('[EncryptionService] ERROR: Cannot get currentDeviceId:', deviceIdError);
                return null;
            }

            // So sánh deviceId chính xác (string comparison, strict equality)
            const isCurrentDevice = (deviceId === currentDeviceId);

            // Nếu sender_device_id === currentDeviceId → LUÔN gọi decryptWithCurrentDeviceKey()
            if (isCurrentDevice) {
                return await this.decryptWithCurrentDeviceKey(encryptedData, userId, deviceId);
            }

            // Nếu là device khác → cần PIN unlock hoặc fallback DeviceKey
            if (deviceId !== currentDeviceId) {
                // Parse encryptedData để lấy thông tin
                const parsed = this.parseEncryptedData(encryptedData);
                if (!parsed || !parsed.encryptedContent) {
                    // Invalid format → không thể decrypt
                    return null;
                }

                // Tuần tự decrypt:
                // 1. Nếu có encryptedAESKeyByPin → thử decrypt bằng PIN
                // 2. Nếu PIN decrypt failed → thử decrypt bằng DeviceKey
                // 3. Nếu DeviceKey decrypt failed → trả về null

                // Bước 1: Thử decrypt bằng PIN nếu có encryptedAESKeyByPin
                // Kiểm tra PIN đã unlock chưa
                if (pinService.isUnlocked()) {
                    // Ưu tiên encrypted_aes_key_by_pin từ DB
                    if (encryptedAESKeyByPin) {
                        try {
                            // encryptedAESKeyByPin từ DB đã là format "iv:cipher" (không cần decode)
                            const decrypted = await this.decryptWithMasterUnlockKeyFromDB(encryptedAESKeyByPin, parsed.encryptedContent, userId, deviceId);
                            if (decrypted !== null && decrypted && decrypted.trim() !== '') {
                                return decrypted; // PIN decrypt thành công
                            }
                        } catch (pinError) {
                            // PIN decrypt failed → tiếp tục fallback DeviceKey
                            console.log(`[decryptMessageWithDeviceKey] PIN decrypt error from DB for device ${deviceId}: ${pinError.message}`);
                        }
                    } else if (parsed.encryptedAESKeyByPin) {
                        // Thử decrypt từ format string (backward compatibility)
                        try {
                            const decrypted = await this.decryptWithMasterUnlockKey(encryptedData, userId, deviceId);
                            if (decrypted !== null && decrypted && decrypted.trim() !== '') {
                                return decrypted; // PIN decrypt thành công
                            }
                        } catch (pinError) {
                            // PIN decrypt failed → tiếp tục fallback DeviceKey
                            console.log(`[decryptMessageWithDeviceKey] PIN decrypt error from content string for device ${deviceId}: ${pinError.message}`);
                        }
                    }
                    // Nếu không có PIN layer → không thể decrypt bằng PIN (đây là limitation của E2EE)
                }

                // Bước 2: Fallback decrypt bằng DeviceKey (encryptedAESKey)
                // LƯU Ý: Chỉ có thể decrypt bằng DeviceKey nếu là từ device hiện tại
                // Messages từ device khác KHÔNG THỂ decrypt bằng DeviceKey vì không có private key của device đó
                // Đây là limitation của E2EE - chỉ có PIN layer mới cho phép decrypt cross-device
                if (parsed.encryptedAESKey && deviceId === currentDeviceId) {
                    // Chỉ thử DeviceKey nếu là từ device hiện tại (trường hợp này không nên xảy ra vì đã check ở trên)
                    // Nhưng giữ lại để đảm bảo logic đúng
                    try {
                        const senderPrivateKey = await deviceService.getOrCreatePrivateKey(userId);
                        if (senderPrivateKey) {
                            // Decrypt AES key bằng RSA private key
                            const aesKey = await this.decryptAESKeyWithRSA(parsed.encryptedAESKey, senderPrivateKey);
                            if (aesKey && aesKey.length === 32) {
                                // Decrypt content bằng AES key
                                const decrypted = await this.decryptAES(parsed.encryptedContent, aesKey);
                                if (decrypted !== null && decrypted && decrypted.trim() !== '') {
                                    return decrypted; // DeviceKey decrypt thành công
                                }
                            }
                        }
                    } catch (deviceKeyError) {
                        // DeviceKey decrypt failed → trả về null
                    }
                }
                // Nếu là từ device khác và không có PIN layer → không thể decrypt được
                // Đây là expected behavior của E2EE

                // Bước 3: Cả PIN và DeviceKey đều failed → trả về null
                return null;
            }

            return null;
        } catch (error) {
            // Chỉ log lỗi thực sự quan trọng, không log từ dữ liệu cũ
            // Error stack đã được xử lý bởi parseEncryptedData - không cần log lại
            // Trả về null nếu không decrypt được
            return null;
        }
    }

    // Decrypt với device key hiện tại (logic cũ - giữ nguyên)
    async decryptWithCurrentDeviceKey(encryptedData, userId, deviceId) {
        try {
            let privateKey;
            try {
                privateKey = await deviceService.getOrCreatePrivateKey(userId);
                if (!privateKey) {
                    console.error('[EncryptionService] ERROR: Private key is null');
                    return null;
                }
            } catch (privateKeyError) {
                console.error('[EncryptionService] ERROR: Cannot get privateKey:', privateKeyError);
                return null;
            }

            // Parse encryptedData - sử dụng hàm parseEncryptedData robust
            const parsed = this.parseEncryptedData(encryptedData);
            if (!parsed || !parsed.encryptedAESKey || !parsed.encryptedContent) {
                // Invalid format hoặc thiếu dữ liệu - không log để tránh spam console
                return null;
            }

            const encryptedAESKeyBase64 = parsed.encryptedAESKey;
            const encryptedContentBase64 = parsed.encryptedContent;

            // FIX: Validate encrypted data TRƯỚC KHI decrypt
            if (!encryptedAESKeyBase64 || !encryptedContentBase64) {
                return null;
            }
            // Device hiện tại không cần PIN layer, chỉ cần decrypt bằng RSA
            // Bỏ qua parsed.encryptedAESKeyByPin vì không dùng

            // Decrypt AES key bằng RSA private key
            let aesKey;
            try {
                aesKey = await this.decryptAESKeyWithRSA(encryptedAESKeyBase64, privateKey);
            } catch (decryptError) {
                // Nếu giải mã thất bại, test key pair để xem có phải do key không khớp không
                let keyPairTested = false;
                try {
                    let currentDeviceId = await deviceService.getOrCreateDeviceId();
                    let device, deviceError;
                    try {
                        const result = await supabase
                            .from('user_devices')
                            .select('public_key')
                            .eq('user_id', userId)
                            .eq('device_id', currentDeviceId)
                            .single();
                        device = result.data;
                        deviceError = result.error;
                    } catch (queryError) {
                        deviceError = queryError;
                        device = null;
                    }

                    if (deviceError) {
                    } else if (device && device.public_key) {
                        keyPairTested = true;
                        let keyPairValid = false;
                        try {
                            keyPairValid = await this.testKeyPair(device.public_key, privateKey);
                        } catch (testKeyPairError) {
                            keyPairValid = false;
                        }
                        if (!keyPairValid) {
                            try {
                                await deviceService.forceReRegisterDevice(userId);
                                return null;
                            } catch (reRegisterError) {
                                return null;
                            }
                        } else {
                            return null;
                        }
                    }
                } catch (testError) {
                    if (keyPairTested) {
                        try {
                            await deviceService.forceReRegisterDevice(userId);
                            return null;
                        } catch (reRegisterError) {
                            return null;
                        }
                    } else {
                        return null;
                    }
                }
                return null;
            }

            // Decrypt message content bằng AES key
            let decrypted;
            try {
                decrypted = await this.decryptAES(encryptedContentBase64, aesKey);
                if (!decrypted) {
                    return null;
                }
                return decrypted;
            } catch (aesError) {
                return null;
            }
        } catch (error) {
            // Lỗi từ dữ liệu cũ hoặc key không khớp - không log để tránh spam console
            // Chỉ log khi thực sự cần debug
            return null;
        }
    }

    // Decrypt với master unlock key từ DB (PIN unlock - cho device khác)
    // encryptedAESKeyByPin: encrypted_aes_key_by_pin từ DB (format "iv:cipher" base64)
    // encryptedContent: content từ DB (encrypted content base64)
    async decryptWithMasterUnlockKeyFromDB(encryptedAESKeyByPin, encryptedContent, userId, deviceId) {
        try {
            // Lấy master unlock key từ pinService
            const masterUnlockKey = pinService.getMasterUnlockKey();
            if (!masterUnlockKey) {
                return null;
            }

            // Decrypt AES key bằng master unlock key
            try {
                // decryptAESKeyWithMasterKey nhận format "iv:cipher" base64 và trả về Uint8Array (32 bytes)
                const aesKey = await this.decryptAESKeyWithMasterKey(encryptedAESKeyByPin, masterUnlockKey);

                // Validate: AES key phải đúng 32 bytes
                if (!aesKey || aesKey.length !== 32) {
                    // Invalid key length - có thể là dữ liệu cũ hoặc key không khớp
                    return null;
                }

                // Decrypt content bằng AES key
                const decrypted = await this.decryptAES(encryptedContent, aesKey);
                return decrypted;
            } catch (error) {
                // Lỗi từ dữ liệu cũ hoặc key không khớp
                return null;
            }
        } catch (error) {
            // Lỗi outer
            return null;
        }
    }

    // Decrypt với master unlock key từ format string (backward compatibility)
    // FIX: Ưu tiên encrypted_aes_key_by_pin từ DB, fallback về parse từ string
    async decryptWithMasterUnlockKey(encryptedData, userId, deviceId) {
        try {
            // Lấy master unlock key từ pinService
            const masterUnlockKey = pinService.getMasterUnlockKey();
            if (!masterUnlockKey) {
                return null;
            }

            // Parse encryptedData - sử dụng hàm parseEncryptedData robust
            const parsed = this.parseEncryptedData(encryptedData);
            if (!parsed) {
                // Invalid format từ dữ liệu cũ - không log để tránh spam console
                return null;
            }

            // FIX: Nếu không có encryptedAESKeyByPin (2-part format) → bỏ qua PIN decrypt
            // Return null để bỏ qua, nhưng không block fallback DeviceKey trong decryptMessageWithDeviceKey
            if (!parsed.encryptedAESKeyByPin) {
                return null; // Bỏ qua PIN decrypt, fallback sẽ thử DeviceKey
            }

            // Decrypt AES key bằng master unlock key
            try {
                // Base64 decode encryptedAESKeyByPIN_encoded để lấy lại format "iv:cipher"
                // encryptedAESKeyByPIN_encoded là base64 string của "iv:cipher"
                const decoder = new TextDecoder();
                const decodedBytes = this.base64ToUint8Array(parsed.encryptedAESKeyByPin);
                const encryptedAESKeyByPIN = decoder.decode(decodedBytes); // Phục hồi format "iv:cipher"

                // Decrypt AES key bằng master unlock key
                // decryptAESKeyWithMasterKey nhận format "iv:cipher" base64 và trả về Uint8Array (32 bytes)
                const aesKey = await this.decryptAESKeyWithMasterKey(encryptedAESKeyByPIN, masterUnlockKey);

                // Validate: AES key phải đúng 32 bytes
                if (!aesKey || aesKey.length !== 32) {
                    // Invalid key length từ dữ liệu cũ - không log để tránh spam console
                    return null;
                }

                // Decrypt content bằng AES key
                const decrypted = await this.decryptAES(parsed.encryptedContent, aesKey);
                return decrypted;
            } catch (error) {
                // Lỗi từ dữ liệu cũ hoặc key không khớp - không log để tránh spam console
                return null;
            }
        } catch (error) {
            // Lỗi từ dữ liệu cũ hoặc key không khớp - không log để tránh spam console
            return null;
        }
    }

    // ============================================
    // CONVERSATION KEY METHODS (New Architecture)
    // ============================================

    /**
     * Encrypt message content bằng ConversationKey
     * @param {string} content - Plaintext message content
     * @param {Uint8Array} conversationKey - ConversationKey (32 bytes AES-256)
     * @returns {Promise<string>} Encrypted content (base64)
     */
    async encryptMessageWithConversationKey(content, conversationKey) {
        try {
            if (!content || typeof content !== 'string') {
                throw new Error('Invalid content: expected string');
            }
            if (!(conversationKey instanceof Uint8Array) || conversationKey.length !== 32) {
                throw new Error('Invalid ConversationKey: expected Uint8Array of length 32');
            }

            // Encrypt content bằng ConversationKey (AES-GCM)
            const encrypted = await this.encryptAES(content, conversationKey);
            return encrypted; // Base64 string
        } catch (error) {
            console.error('[EncryptionService] Error encrypting message with ConversationKey:', error);
            throw error;
        }
    }

    /**
     * Decrypt message content bằng ConversationKey
     * @param {string} encryptedContent - Encrypted content (base64)
     * @param {Uint8Array} conversationKey - ConversationKey (32 bytes AES-256)
     * @returns {Promise<string>} Decrypted plaintext
     */
    async decryptMessageWithConversationKey(encryptedContent, conversationKey) {
        try {
            // Validate inputs
            if (!encryptedContent || typeof encryptedContent !== 'string' || encryptedContent.trim() === '') {
                return null;
            }
            if (!(conversationKey instanceof Uint8Array) || conversationKey.length !== 32) {
                if (__DEV__) {
                    console.warn('[EncryptionService] Invalid conversationKey:', {
                        isUint8Array: conversationKey instanceof Uint8Array,
                        length: conversationKey?.length
                    });
                }
                return null;
            }

            // Quick validation: Base64 string không nên quá ngắn (ít nhất phải có IV + một số ciphertext)
            // AES-GCM với IV 12 bytes + tag 16 bytes = tối thiểu 28 bytes raw = ~38 chars base64
            if (encryptedContent.length < 20) {
                if (__DEV__) {
                    console.warn('[EncryptionService] EncryptedContent too short (likely invalid):', {
                        length: encryptedContent.length,
                        preview: encryptedContent.substring(0, 50)
                    });
                }
                return null;
            }

            // CRITICAL: Validate base64 format TRƯỚC KHI decrypt để tránh crash
            // Base64 chỉ chứa: A-Z, a-z, 0-9, +, /, = (padding)
            const sanitized = encryptedContent.trim().replace(/\s/g, '').replace(/\n/g, '').replace(/\r/g, '');
            const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Regex.test(sanitized)) {
                // Không phải base64 hợp lệ → có thể là plaintext hoặc format khác
                if (__DEV__) {
                    console.warn('[EncryptionService] EncryptedContent is not valid base64 (likely plaintext or wrong format):', {
                        length: encryptedContent.length,
                        preview: encryptedContent.substring(0, 100),
                        firstChars: encryptedContent.substring(0, 50)
                    });
                }
                return null; // Không decrypt, trả về null
            }

            // Decrypt content bằng ConversationKey (AES-GCM)
            // decryptAES sẽ gọi base64ToUint8Array (đã có sanitize và validation)
            const decrypted = await this.decryptAES(encryptedContent, conversationKey);
            return decrypted;
        } catch (error) {
            // Log chi tiết để debug
            if (__DEV__) {
                console.error('[EncryptionService] Error decrypting message with ConversationKey:', {
                    error: error.message,
                    errorStack: error.stack,
                    contentLength: encryptedContent?.length,
                    contentPreview: encryptedContent?.substring?.(0, 100),
                    hasConversationKey: !!conversationKey,
                    keyLength: conversationKey?.length
                });
            } else {
                console.error('[EncryptionService] Error decrypting message with ConversationKey:', error.message);
            }
            // CRITICAL: Return null thay vì throw để tránh crash app
            return null;
        }
    }

    // Clear cache (khi logout)
    clearCache() {
        this.keyCache.clear();
    }
}

export default new EncryptionService();




