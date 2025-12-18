import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY_PREFIX = 'messages_cache_';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 phút

/**
 * Lấy cache key cho conversation
 */
const getCacheKey = (conversationId) => `${CACHE_KEY_PREFIX}${conversationId}`;

/**
 * Kiểm tra message có thực sự encrypted hay không - CHỈ dựa vào METADATA, KHÔNG dựa vào format content
 */
const isMessageEncrypted = (msg) => {
    if (!msg) return false;

    // Siết chặt điều kiện: Flag true PHẢI có key hợp lệ
    if (msg.is_encrypted === true) {
        // Kiểm tra key hợp lệ (không phải string rỗng, không phải object rỗng)
        const hasValidKey = 
            (typeof msg.encrypted_aes_key === 'string' && msg.encrypted_aes_key.length > 0) ||
            (typeof msg.encrypted_aes_key_by_pin === 'string' && msg.encrypted_aes_key_by_pin.length > 0) ||
            (msg.encrypted_key_by_device && typeof msg.encrypted_key_by_device === 'object' && Object.keys(msg.encrypted_key_by_device).length > 0);
        
        if (hasValidKey) {
            return true;
        } else {
            // Flag true nhưng không có key hợp lệ → self-heal thành plaintext
            console.warn('[E2EE Debug] Message có is_encrypted=true nhưng không có key hợp lệ:', {
                id: msg.id,
                is_encrypted: msg.is_encrypted,
                encrypted_aes_key: msg.encrypted_aes_key,
                encrypted_aes_key_by_pin: msg.encrypted_aes_key_by_pin,
                encrypted_key_by_device: msg.encrypted_key_by_device,
                message_type: msg.message_type,
                is_sender_copy: msg.is_sender_copy
            });
            msg.is_encrypted = false;
            return false;
        }
    }

    // Fallback cho legacy / multi-device E2EE - chỉ nếu có key hợp lệ
    const hasValidKey = 
        (typeof msg.encrypted_aes_key === 'string' && msg.encrypted_aes_key.length > 0) ||
        (typeof msg.encrypted_aes_key_by_pin === 'string' && msg.encrypted_aes_key_by_pin.length > 0) ||
        (msg.encrypted_key_by_device && typeof msg.encrypted_key_by_device === 'object' && Object.keys(msg.encrypted_key_by_device).length > 0);
    
    if (hasValidKey) {
        return true;
    }

    return false;
};

/**
 * Lưu messages vào cache
 * QUAN TRỌNG: Không lưu decryptedContent, chỉ lưu encrypted content
 */
export const saveMessagesCache = async (conversationId, messages) => {
    try {
        const cacheKey = getCacheKey(conversationId);
        // Loại bỏ decryptedContent và isDecrypted trước khi lưu cache
        const messagesToCache = messages.map(msg => {
            // Nếu message đã được decrypt, chỉ lưu encrypted content
            if (msg.is_encrypted === true || msg.encrypted_aes_key || msg.encrypted_aes_key_by_pin) {
                // Giữ nguyên encrypted content, loại bỏ decryptedContent
                const { decryptedContent, isDecrypted, ...msgToCache } = msg;
                // Đảm bảo content là encrypted content (không phải decrypted)
                if (msg.is_encrypted === false && msg.decryption_error === false) {
                    // Nếu message đã decrypt thành công, không lưu vào cache
                    // Hoặc lưu với encrypted content gốc nếu có
                    return msgToCache;
                }
                return msgToCache;
            }
            // Message không encrypted → lưu bình thường
            const { decryptedContent, isDecrypted, ...msgToCache } = msg;
            return msgToCache;
        });
        const cacheData = {
            messages: messagesToCache,
            timestamp: Date.now()
        };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        console.log('💾 [Cache] Lỗi khi lưu messages cache:', error);
    }
};

/**
 * Load messages từ cache
 * QUAN TRỌNG: Reset decryption state khi load từ cache
 */
export const loadMessagesCache = async (conversationId) => {
    try {
        const cacheKey = getCacheKey(conversationId);
        const cachedData = await AsyncStorage.getItem(cacheKey);

        if (!cachedData) {
            // No cache
            return null;
        }

        const { messages, timestamp } = JSON.parse(cachedData);
        const age = Date.now() - timestamp;

        // Kiểm tra cache còn hiệu lực không (5 phút)
        if (age > CACHE_EXPIRY_MS) {
            // Cache expired
            await AsyncStorage.removeItem(cacheKey); // Xóa cache cũ
            return null;
        }

        // Reset decryption state CHỈ cho messages đã encrypted
        const resetMessages = messages.map(msg => {
            // TRACE: Log raw message từ cache
            if (msg.message_type === 'text') {
                console.log('[TRACE] loadMessagesCache', {
                    stage: 'loadMessagesCache_CACHE',
                    id: msg.id,
                    is_encrypted: msg.is_encrypted,
                    is_sender_copy: msg.is_sender_copy,
                    content_preview: msg.content ? msg.content.substring(0, 50) : null,
                });
            }
            
            // FIX E: sender_copy → KHÔNG set is_encrypted = false, chỉ dùng nội bộ
            if (msg.is_sender_copy === true) {
                // sender_copy → giữ nguyên metadata, reset decryption state
                const processed = {
                    ...msg,
                    decryptedContent: null,
                    isDecrypted: false,
                    // KHÔNG thay đổi is_encrypted (giữ nguyên từ cache)
                    // Giữ nguyên encrypted_aes_key, encrypted_aes_key_by_pin, content (encrypted)
                };
                
                // TRACE: Log processed sender copy
                if (msg.message_type === 'text') {
                    console.log('[TRACE] loadMessagesCache', {
                        stage: 'loadMessagesCache_PROCESSED_SENDER_COPY',
                        id: processed.id,
                        is_encrypted: processed.is_encrypted,
                        is_sender_copy: processed.is_sender_copy,
                        decryptedContent: processed.decryptedContent,
                        content_preview: processed.content ? processed.content.substring(0, 50) : null,
                    });
                }
                
                return processed;
            }
            
            // Plaintext message (receiver) → BẮT BUỘC set isDecrypted = true và decryptedContent = content
            // Self-healing: Ép thành plaintext nếu flag sai
            const processed = {
                ...msg,
                decryptedContent: msg.content || null,
                isDecrypted: true,
                is_encrypted: false // Đảm bảo flag đúng
                // Giữ nguyên content vì đây là tin nhắn thường
            };
            
            // TRACE: Log processed plaintext
            if (msg.message_type === 'text') {
                console.log('[TRACE] loadMessagesCache', {
                    stage: 'loadMessagesCache_PROCESSED_PLAINTEXT',
                    id: processed.id,
                    is_encrypted: processed.is_encrypted,
                    is_sender_copy: processed.is_sender_copy,
                    decryptedContent: processed.decryptedContent ? processed.decryptedContent.substring(0, 50) : null,
                    content_preview: processed.content ? processed.content.substring(0, 50) : null,
                });
            }
            
            return processed;
        });

        return resetMessages;
    } catch (error) {
        // Silent on cache load error
        return null;
    }
};

/**
 * Xóa cache của conversation
 */
export const clearMessagesCache = async (conversationId) => {
    try {
        const cacheKey = getCacheKey(conversationId);
        await AsyncStorage.removeItem(cacheKey);
    } catch (error) {
        // Silent on cache clear error
    }
};


