import * as SecureStore from 'expo-secure-store';

const CONVERSATION_KEY_PREFIX = 'conversation_key_';
const CONVERSATION_KEY_ENCRYPTED_PREFIX = 'conversation_key_encrypted_';

/**
 * ConversationKeyService - Quản lý ConversationKey cho mỗi conversation
 * 
 * INVARIANT:
 * - ConversationKey (plaintext) CHỈ tồn tại trong memory (RAM)
 * - ConversationKey (plaintext) CHỈ được decrypt SAU KHI user nhập PIN
 * - ConversationKey KHÔNG BAO GIỜ được lưu vào SecureStore/AsyncStorage (plaintext)
 * - Reload app → ConversationKey mất → phải nhập PIN lại
 */
class ConversationKeyService {
    // Cache ConversationKey (plaintext) trong memory sau khi decrypt (Map<conversationId, Uint8Array>)
    // INVARIANT: Chỉ cache sau khi decrypt từ SecureStore (sau khi PIN unlock)
    constructor() {
        this.keyCache = new Map();
    }

    /**
     * @deprecated KHÔNG SỬ DỤNG: ConversationKey chỉ lưu trong RAM, không lưu vào SecureStore
     * Lưu EncryptedConversationKey từ backend vào SecureStore
     * INVARIANT: KHÔNG decrypt ngay, chỉ lưu encrypted key
     * @param {string} conversationId 
     * @param {string} encryptedConversationKey - Encrypted key từ backend (base64 string)
     */
    async saveEncryptedConversationKey(conversationId, encryptedConversationKey) {
        try {
            if (!encryptedConversationKey || typeof encryptedConversationKey !== 'string') {
                console.warn(`[ConversationKeyService] Invalid encryptedConversationKey for conversation ${conversationId}`);
                return;
            }

            // Lưu encrypted key vào SecureStore (KHÔNG decrypt)
            const storageKey = CONVERSATION_KEY_ENCRYPTED_PREFIX + conversationId;
            await SecureStore.setItemAsync(storageKey, encryptedConversationKey);

            console.log(`[ConversationKeyService] Saved encryptedConversationKey to SecureStore for conversation ${conversationId} (NOT decrypted)`);
        } catch (error) {
            console.error('[ConversationKeyService] Error saving encryptedConversationKey:', error);
            throw error;
        }
    }

    /**
     * ✅ CLIENT-SIDE DECRYPTION: Lưu ConversationKey vào memory cache (CHỈ memory, KHÔNG SecureStore)
     * CHỈ gọi sau khi nhập PIN thành công và decrypt encrypted_conversation_key ở client
     * @param {string} conversationId 
     * @param {Uint8Array} conversationKey 
     */
    cacheInMemoryOnly(conversationId, conversationKey) {
        if (!conversationKey || conversationKey.length !== 32) {
            console.error(`[ConversationKeyService] Invalid ConversationKey for ${conversationId}`);
            return;
        }
        this.keyCache.set(conversationId, conversationKey);
        console.log(`[ConversationKeyService] Cached ConversationKey in memory for conversation ${conversationId}`);
    }

    /**
     * ✅ CLIENT-SIDE DECRYPTION: Lấy ConversationKey từ memory cache
     * CHỈ return từ cache (memory), KHÔNG đọc từ SecureStore
     * @param {string} conversationId 
     * @returns {Uint8Array|null} ConversationKey hoặc null nếu không có trong cache
     */
    getFromCache(conversationId) {
        if (this.keyCache.has(conversationId)) {
            return this.keyCache.get(conversationId);
        }
        return null;
    }

    /**
     * @deprecated Sử dụng getFromCache() thay thế
     * CLIENT-SIDE DECRYPTION: ConversationKey CHỈ tồn tại trong memory, không đọc từ SecureStore
     */
    async getConversationKey(conversationId) {
        return this.getFromCache(conversationId);
    }

    /**
     * Kiểm tra ConversationKey đã tồn tại chưa
     * @param {string} conversationId 
     * @returns {Promise<boolean>}
     */
    async hasConversationKey(conversationId) {
        try {
            const storageKey = CONVERSATION_KEY_ENCRYPTED_PREFIX + conversationId;
            const encryptedKey = await SecureStore.getItemAsync(storageKey);
            return !!encryptedKey;
        } catch (error) {
            console.error(`[ConversationKeyService] Error checking ConversationKey for ${conversationId}:`, error);
            return false;
        }
    }

    /**
     * DEPRECATED: getOrCreateConversationKey - KHÔNG ĐƯỢC DÙNG
     * INVARIANT: ConversationKey KHÔNG BAO GIỜ được tạo local
     * ConversationKey CHỈ được fetch từ backend (encrypted) và decrypt sau khi PIN unlock
     * 
     * @deprecated Sử dụng getConversationKey() thay thế
     */
    async getOrCreateConversationKey(conversationId) {
        console.warn(`[ConversationKeyService] getOrCreateConversationKey is deprecated. Use getConversationKey() instead.`);
        // Chỉ return nếu đã có trong cache (đã decrypt)
        return await this.getConversationKey(conversationId);
    }

    /**
     * Xóa ConversationKey khỏi cache (khi PIN lock)
     */
    /**
     * ✅ CLIENT-SIDE DECRYPTION: Clear memory cache
     * Gọi khi app background hoặc logout
     */
    clearKeyCache() {
        this.keyCache.clear();
        console.log('[ConversationKeyService] Cleared ConversationKey cache from memory');
    }

    /**
     * ✅ CLIENT-SIDE DECRYPTION: Clear cache khi app background
     * ConversationKey CHỈ tồn tại trong memory, clear khi app không active
     */
    clearOnAppBackground() {
        this.clearKeyCache();
    }

    /**
     * Xóa ConversationKey khỏi storage (khi xóa conversation)
     * @param {string} conversationId 
     */
    async deleteConversationKey(conversationId) {
        try {
            const storageKey = CONVERSATION_KEY_ENCRYPTED_PREFIX + conversationId;
            await SecureStore.deleteItemAsync(storageKey);
            this.keyCache.delete(conversationId);
            console.log(`[ConversationKeyService] Deleted ConversationKey for conversation ${conversationId}`);
        } catch (error) {
            console.error(`[ConversationKeyService] Error deleting ConversationKey for ${conversationId}:`, error);
        }
    }
}

export default new ConversationKeyService();
