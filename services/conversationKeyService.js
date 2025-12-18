import * as SecureStore from 'expo-secure-store';
import encryptionService from './encryptionService';
import pinService from './pinService';

const CONVERSATION_KEY_PREFIX = 'conversation_key_';
const CONVERSATION_KEY_ENCRYPTED_PREFIX = 'conversation_key_encrypted_';

/**
 * ConversationKeyService - Quản lý ConversationKey cho mỗi conversation
 * 
 * Mỗi conversation có 1 ConversationKey (AES-256)
 * ConversationKey được mã hóa bằng PIN của user và lưu local
 */
class ConversationKeyService {
    // Cache ConversationKey trong memory sau khi decrypt (Map<conversationId, Uint8Array>)
    constructor() {
        this.keyCache = new Map();
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
        try {
            // ƯU TIÊN: Kiểm tra cache trước (device hiện tại có quyền đọc ngay)
            if (this.keyCache.has(conversationId)) {
                const cachedKey = this.keyCache.get(conversationId);
                console.log(`[ConversationKeyService] Found ConversationKey in cache for conversation ${conversationId}`);
                return cachedKey;
            }

            // Nếu không có trong cache → thử decrypt từ SecureStore (cần PIN unlock)
            // Kiểm tra PIN đã unlock chưa
            if (!pinService.isUnlocked()) {
                console.log(`[ConversationKeyService] PIN not unlocked, no ConversationKey in cache for ${conversationId}`);
                return null;
            }

            const masterUnlockKey = pinService.getMasterUnlockKey();
            if (!masterUnlockKey) {
                console.log(`[ConversationKeyService] No master unlock key, cannot decrypt ConversationKey for ${conversationId}`);
                return null;
            }

            // Lấy encrypted key từ SecureStore
            const storageKey = CONVERSATION_KEY_ENCRYPTED_PREFIX + conversationId;
            const encryptedKey = await SecureStore.getItemAsync(storageKey);

            if (!encryptedKey) {
                console.log(`[ConversationKeyService] No encrypted ConversationKey found in SecureStore for ${conversationId}`);
                return null;
            }

            // Decrypt ConversationKey bằng masterUnlockKey
            const conversationKey = await encryptionService.decryptAESKeyWithMasterKey(encryptedKey, masterUnlockKey);

            if (!conversationKey || conversationKey.length !== 32) {
                console.error(`[ConversationKeyService] Invalid ConversationKey decrypted for ${conversationId}`);
                return null;
            }

            // Cache plain key trong memory (để lần sau không cần PIN)
            this.keyCache.set(conversationId, conversationKey);

            console.log(`[ConversationKeyService] Decrypted ConversationKey from SecureStore for conversation ${conversationId}`);
            return conversationKey;
        } catch (error) {
            console.error(`[ConversationKeyService] Error getting ConversationKey for ${conversationId}:`, error);
            return null;
        }
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
        let conversationKey = await this.getConversationKey(conversationId);

        if (!conversationKey) {
            // Generate ConversationKey mới
            conversationKey = await this.generateConversationKey();
            // Lưu vào cache (không require PIN) - device hiện tại có quyền đọc ngay
            // Nếu có PIN unlock → cũng lưu vào SecureStore (cho device khác / cold start)
            await this.saveConversationKey(conversationId, conversationKey, false);
            console.log(`[ConversationKeyService] Created new ConversationKey for conversation ${conversationId}`);
        }

        return conversationKey;
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
