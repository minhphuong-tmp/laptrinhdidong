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
        // CRITICAL: Loại bỏ TẤT CẢ runtime state trước khi lưu cache
        // Runtime state bao gồm: decryptedContent, isDecrypted, runtime_plain_text, decrypted_on_device_id, ui_optimistic_text
        const messagesToCache = messages.map(msg => {
            // Loại bỏ TẤT CẢ runtime state fields
            const {
                decryptedContent,
                isDecrypted,
                runtime_plain_text,
                decrypted_on_device_id,
                ui_optimistic_text,
                ...msgToCache
            } = msg;

            // #region agent log
            if (runtime_plain_text) {
                fetch('http://127.0.0.1:7242/ingest/e8f8c902-036e-4310-861c-abe174d99074', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'messagesCache.js:68', message: 'saveMessagesCache removing runtime_plain_text', data: { messageId: msg.id, hasRuntimePlainText: !!runtime_plain_text, isEncrypted: msg.is_encrypted, isSenderCopy: msg.is_sender_copy }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
            }
            // #endregion

            // Đảm bảo không có runtime state trong cached message
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

        // CRITICAL: Reset TẤT CẢ runtime state khi load từ cache
        // Runtime state bao gồm: decryptedContent, isDecrypted, runtime_plain_text, decrypted_on_device_id, ui_optimistic_text
        const resetMessages = messages.map(msg => {
            // #region agent log
            if (msg.runtime_plain_text) {
                fetch('http://127.0.0.1:7242/ingest/e8f8c902-036e-4310-861c-abe174d99074', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'messagesCache.js:118', message: 'loadMessagesCache found runtime_plain_text in cache', data: { messageId: msg.id, hasRuntimePlainText: !!msg.runtime_plain_text, runtimePlainTextLength: msg.runtime_plain_text?.length, isEncrypted: msg.is_encrypted, isSenderCopy: msg.is_sender_copy }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
            }
            // #endregion

            // Clear TẤT CẢ runtime state fields
            const {
                decryptedContent,
                isDecrypted,
                runtime_plain_text,
                decrypted_on_device_id,
                ui_optimistic_text,
                ...cleanMessage
            } = msg;

            // Đảm bảo runtime state bị clear hoàn toàn
            return {
                ...cleanMessage,
                // Explicitly set to undefined để đảm bảo không có runtime state
                runtime_plain_text: undefined,
                decrypted_on_device_id: undefined,
                ui_optimistic_text: undefined,
                decryptedContent: undefined,
                isDecrypted: undefined
            };
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


