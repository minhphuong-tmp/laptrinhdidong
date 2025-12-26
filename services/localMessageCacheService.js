import * as SecureStore from 'expo-secure-store';

const CACHE_PREFIX = 'local_message_cache_';

/**
 * LocalMessageCacheService - Quản lý local encrypted plaintext cache
 * 
 * INVARIANT:
 * - Chỉ lưu plaintext của messages do device hiện tại gửi
 * - Encrypt bằng DeviceKey (gắn với OS/SecureStore)
 * - KHÔNG dùng PIN, KHÔNG dùng ConversationKey
 * - Mục đích: Khôi phục nội dung tin nhắn sau reload app (chưa nhập PIN)
 */
class LocalMessageCacheService {
    /**
     * ✅ SERVER-SIDE ENCRYPTION: Lưu plaintext vào local cache theo client_message_id
     * @param {string} clientMessageId - UUID từ client, ổn định qua reload
     * @param {string} plainText 
     * @param {string} senderDeviceId 
     * @param {string} userId 
     */
    async savePlaintext(clientMessageId, plainText, senderDeviceId, userId) {
        try {
            if (!plainText || typeof plainText !== 'string' || plainText.trim() === '') {
                console.warn(`[LocalMessageCache] Invalid plaintext for client_message_id ${clientMessageId}`);
                return;
            }

            // Lưu vào SecureStore theo client_message_id (ổn định, không đổi sau reload)
            const storageKey = CACHE_PREFIX + clientMessageId;
            
            // Format: JSON string với sender_device_id để verify khi load
            const cacheData = JSON.stringify({
                plaintext: plainText,
                sender_device_id: senderDeviceId,
                timestamp: Date.now()
            });

            await SecureStore.setItemAsync(storageKey, cacheData);
            console.log(`[LocalMessageCache] Saved encrypted plaintext for client_message_id ${clientMessageId} (device: ${senderDeviceId})`);
        } catch (error) {
            console.error(`[LocalMessageCache] Error saving plaintext for client_message_id ${clientMessageId}:`, error);
        }
    }

    /**
     * ✅ SERVER-SIDE ENCRYPTION: Load plaintext từ local cache theo client_message_id
     * @param {string} clientMessageId - UUID từ client, ổn định qua reload
     * @param {string} currentDeviceId 
     * @returns {Promise<string|null>} Plaintext hoặc null nếu không có
     */
    async loadPlaintext(clientMessageId, currentDeviceId) {
        try {
            const storageKey = CACHE_PREFIX + clientMessageId;
            const cachedData = await SecureStore.getItemAsync(storageKey);

            if (!cachedData) {
                return null;
            }

            // Parse cached data
            const parsed = JSON.parse(cachedData);
            
            // INVARIANT: Chỉ return plaintext nếu sender_device_id === currentDeviceId
            if (parsed.sender_device_id !== currentDeviceId) {
                console.warn(`[LocalMessageCache] client_message_id ${clientMessageId} sender_device_id (${parsed.sender_device_id}) !== currentDeviceId (${currentDeviceId})`);
                return null;
            }

            console.log(`[LocalMessageCache] Loaded plaintext from cache for client_message_id ${clientMessageId}`);
            return parsed.plaintext;
        } catch (error) {
            console.error(`[LocalMessageCache] Error loading plaintext for client_message_id ${clientMessageId}:`, error);
            return null;
        }
    }

    /**
     * ✅ SERVER-SIDE ENCRYPTION: Xóa plaintext khỏi cache theo client_message_id
     * @param {string} clientMessageId 
     */
    async deletePlaintext(clientMessageId) {
        try {
            const storageKey = CACHE_PREFIX + clientMessageId;
            await SecureStore.deleteItemAsync(storageKey);
            console.log(`[LocalMessageCache] Deleted plaintext cache for client_message_id ${clientMessageId}`);
        } catch (error) {
            console.error(`[LocalMessageCache] Error deleting plaintext cache for client_message_id ${clientMessageId}:`, error);
        }
    }

    /**
     * ✅ SERVER-SIDE ENCRYPTION: Load tất cả plaintexts cho một conversation theo client_message_id
     * @param {string} conversationId 
     * @param {string} currentDeviceId 
     * @param {Array<{id: string, client_message_id?: string}>} messages - Messages với client_message_id
     * @returns {Promise<Map<string, string>>} Map<messageId, plaintext>
     */
    async loadAllPlaintexts(conversationId, currentDeviceId, messages) {
        const plaintextMap = new Map();
        
        try {
            // Load từng message theo client_message_id (ổn định, không đổi sau reload)
            const loadPromises = messages.map(async (msg) => {
                // Ưu tiên dùng client_message_id, fallback về message.id nếu không có
                const clientMessageId = msg.client_message_id || msg.id;
                const plaintext = await this.loadPlaintext(clientMessageId, currentDeviceId);
                if (plaintext) {
                    // Map theo message.id để dễ dùng trong UI
                    plaintextMap.set(msg.id, plaintext);
                }
            });

            await Promise.all(loadPromises);
            console.log(`[LocalMessageCache] Loaded ${plaintextMap.size} plaintexts from cache for conversation ${conversationId}`);
        } catch (error) {
            console.error(`[LocalMessageCache] Error loading all plaintexts for conversation ${conversationId}:`, error);
        }

        return plaintextMap;
    }
}

export default new LocalMessageCacheService();


