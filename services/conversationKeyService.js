import * as SecureStore from 'expo-secure-store';
import encryptionService from './encryptionService';
import pinService from './pinService';

const CONVERSATION_KEY_PREFIX = 'conversation_key_';
const CONVERSATION_KEY_ENCRYPTED_PREFIX = 'conversation_key_encrypted_';

/**
 * ConversationKeyService - DEPRECATED - Không còn sử dụng
 * 
 * Kiến trúc cũ đã được thay thế bằng encryptedForReceiver và encryptedForSync
 * Service này được giữ lại để tránh crash nhưng luôn return null
 */
class ConversationKeyService {
    constructor() {
        this.keyCache = new Map();
        console.warn('[ConversationKeyService] DEPRECATED - This service is no longer used. Use encryptedForReceiver/encryptedForSync instead.');
    }

    /**
     * Generate ConversationKey mới cho conversation
     * @returns {Promise<Uint8Array>} ConversationKey (32 bytes AES-256)
     */
    async generateConversationKey() {
        return await encryptionService.generateAESKey();
    }

    /**
     * Lưu ConversationKey vào cache và (nếu có PIN) vào SecureStore
     * @param {string} conversationId 
     * @param {Uint8Array} conversationKey - Plain ConversationKey
     * @param {boolean} requirePin - Nếu true, yêu cầu PIN unlock. Nếu false, chỉ cache trong memory
     */
    async saveConversationKey(conversationId, conversationKey, requirePin = false) {
        try {
            // LUÔN cache plain key trong memory (cho device hiện tại đọc ngay)
            this.keyCache.set(conversationId, conversationKey);
            console.log(`[ConversationKeyService] Cached ConversationKey in memory for conversation ${conversationId}`);

            // Nếu có PIN unlock → encrypt và lưu vào SecureStore (cho device khác / cold start)
            const masterUnlockKey = pinService.getMasterUnlockKey();
            if (masterUnlockKey) {
                try {
                    // Encrypt ConversationKey bằng masterUnlockKey (PIN-derived key)
                    // Format: "iv:ciphertext" (base64)
                    const encryptedKey = await encryptionService.encryptAESKeyWithMasterKey(conversationKey, masterUnlockKey);

                    // Lưu vào SecureStore
                    const storageKey = CONVERSATION_KEY_ENCRYPTED_PREFIX + conversationId;
                    await SecureStore.setItemAsync(storageKey, encryptedKey);

                    console.log(`[ConversationKeyService] Saved encrypted ConversationKey to SecureStore for conversation ${conversationId}`);
                } catch (encryptError) {
                    // Nếu encrypt fail (PIN chưa unlock) → chỉ cache trong memory
                    console.log(`[ConversationKeyService] PIN not unlocked, only caching in memory for conversation ${conversationId}`);
                }
            } else if (requirePin) {
                // Nếu requirePin = true nhưng PIN chưa unlock → throw error
                throw new Error('PIN chưa được setup hoặc unlock');
            } else {
                // Không require PIN → chỉ cache trong memory (OK)
                console.log(`[ConversationKeyService] No PIN unlock, only caching in memory for conversation ${conversationId}`);
            }
        } catch (error) {
            console.error('[ConversationKeyService] Error saving ConversationKey:', error);
            throw error;
        }
    }

    /**
     * Lấy ConversationKey (ưu tiên cache, sau đó decrypt từ PIN-encrypted storage)
     * @param {string} conversationId 
     * @returns {Promise<Uint8Array|null>} ConversationKey hoặc null nếu không có
     */
    async getConversationKey(conversationId) {
        // DEPRECATED: Kiến trúc cũ không còn được sử dụng
        // Luôn return null để tránh crash
        if (__DEV__) {
            console.warn(`[ConversationKeyService] getConversationKey() called but service is DEPRECATED. Conversation: ${conversationId}`);
        }
        return null;
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
     * Lấy hoặc tạo ConversationKey cho conversation
     * Device hiện tại có quyền tạo và cache key ngay (không cần PIN)
     * @param {string} conversationId 
     * @returns {Promise<Uint8Array>} ConversationKey
     */
    async getOrCreateConversationKey(conversationId) {
        // DEPRECATED: Kiến trúc cũ không còn được sử dụng
        // Luôn return null để tránh crash
        if (__DEV__) {
            console.warn(`[ConversationKeyService] getOrCreateConversationKey() called but service is DEPRECATED. Conversation: ${conversationId}`);
        }
        return null;
    }

    /**
     * Xóa ConversationKey khỏi cache (khi PIN lock)
     */
    clearKeyCache() {
        this.keyCache.clear();
        console.log('[ConversationKeyService] Cleared ConversationKey cache');
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
