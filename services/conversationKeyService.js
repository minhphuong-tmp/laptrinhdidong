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
     * @param {boolean} allowCreateNew - Nếu true, tạo key mới nếu không tìm thấy (cho self messages)
     * @returns {Promise<Uint8Array|null>} ConversationKey hoặc null nếu không có
     */
    async getConversationKey(conversationId, allowCreateNew = false) {
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
                // CRITICAL FIX: Với self messages, nếu không có trong cache và PIN chưa unlock,
                // có thể là cache bị clear. Với allowCreateNew = true, sẽ tạo key mới (nhưng key này sẽ khác với key cũ)
                // Tuy nhiên, với self messages, ConversationKey PHẢI có trong cache (đã được tạo khi gửi message)
                // Nếu không có, có thể là bug hoặc cache bị clear → return null để caller xử lý
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
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:152',message:'getOrCreateConversationKey entry',data:{conversationId,hasInCache:this.keyCache.has(conversationId),cacheSize:this.keyCache.size,pinUnlocked:pinService.isUnlocked()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
        // #endregion
        
        let conversationKey = await this.getConversationKey(conversationId);

        if (!conversationKey) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:157',message:'getOrCreateConversationKey key not found, checking SecureStore',data:{conversationId,pinUnlocked:pinService.isUnlocked()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
            // #endregion
            
            // CRITICAL: Trước khi tạo key mới, thử lấy từ SecureStore (có thể đã được lưu trước đó)
            // Nếu có trong SecureStore nhưng PIN chưa unlock, vẫn thử decrypt (có thể không thành công)
            // Nhưng ít nhất không tạo key mới ngay lập tức
            const storageKey = CONVERSATION_KEY_ENCRYPTED_PREFIX + conversationId;
            const encryptedKey = await SecureStore.getItemAsync(storageKey);
            
            if (encryptedKey) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:164',message:'getOrCreateConversationKey found in SecureStore',data:{conversationId,pinUnlocked:pinService.isUnlocked()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
                // #endregion
                
                // Có encrypted key trong SecureStore → thử decrypt
                // Nếu PIN chưa unlock, sẽ không decrypt được, nhưng ít nhất biết là key đã tồn tại
                if (pinService.isUnlocked()) {
                    const masterUnlockKey = pinService.getMasterUnlockKey();
                    if (masterUnlockKey) {
                        try {
                            conversationKey = await encryptionService.decryptAESKeyWithMasterKey(encryptedKey, masterUnlockKey);
                            if (conversationKey && conversationKey.length === 32) {
                                // Cache lại
                                this.keyCache.set(conversationId, conversationKey);
                                console.log(`[ConversationKeyService] Decrypted ConversationKey from SecureStore for conversation ${conversationId}`);
                                
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:177',message:'getOrCreateConversationKey decrypted from SecureStore',data:{conversationId,keyLength:conversationKey.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
                                // #endregion
                                
                                return conversationKey;
                            }
                        } catch (error) {
                            console.log(`[ConversationKeyService] Failed to decrypt ConversationKey from SecureStore: ${error.message}`);
                            
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:184',message:'getOrCreateConversationKey decrypt failed',data:{conversationId,error:error.message},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
                            // #endregion
                        }
                    }
                } else {
                    // PIN chưa unlock nhưng có encrypted key trong SecureStore
                    // CRITICAL FIX: Với self messages, ConversationKey PHẢI có trong cache (đã được tạo khi gửi message)
                    // Nếu cache bị clear và PIN chưa unlock, không thể decrypt từ SecureStore
                    // Nhưng không nên tạo key mới (key mới sẽ khác với key đã dùng để encrypt message)
                    // Vậy return null để caller xử lý (có thể fallback sang DeviceKey hoặc hiển thị placeholder)
                    // Tuy nhiên, trong thực tế, ConversationKey LUÔN có trong cache khi gửi message
                    // Nếu không có, có thể là bug hoặc cache bị clear → cần fix logic cache
                    console.log(`[ConversationKeyService] ConversationKey exists in SecureStore but PIN not unlocked for conversation ${conversationId}`);
                    
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:192',message:'getOrCreateConversationKey PIN not unlocked, returning null',data:{conversationId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
                    // #endregion
                    
                    // CRITICAL: Không return null ngay, mà throw error để caller biết là có lỗi
                    // Caller sẽ xử lý (có thể fallback sang DeviceKey hoặc hiển thị placeholder)
                    // Nhưng không tạo key mới vì key đã tồn tại
                    return null;
                }
            }
            
            // Không có trong SecureStore → Generate ConversationKey mới
            // CRITICAL: Chỉ tạo key mới nếu thực sự chưa có key (không có trong SecureStore)
            // Nếu có trong SecureStore nhưng PIN chưa unlock, không tạo key mới
            conversationKey = await this.generateConversationKey();
            // Lưu vào cache (không require PIN) - device hiện tại có quyền đọc ngay
            // Nếu có PIN unlock → cũng lưu vào SecureStore (cho device khác / cold start)
            await this.saveConversationKey(conversationId, conversationKey, false);
            console.log(`[ConversationKeyService] Created new ConversationKey for conversation ${conversationId}`);
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:201',message:'getOrCreateConversationKey created new key',data:{conversationId,keyLength:conversationKey.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
            // #endregion
        } else {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:205',message:'getOrCreateConversationKey found in cache',data:{conversationId,keyLength:conversationKey.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'U'})}).catch(()=>{});
            // #endregion
        }

        return conversationKey;
    }

    /**
     * Xóa ConversationKey khỏi cache (khi PIN lock)
     * CRITICAL: Với self messages, ConversationKey PHẢI có trong cache (đã được tạo khi gửi message)
     * Nếu clear cache, self messages sẽ không thể decrypt được (vì ConversationKey được lưu trong SecureStore encrypted bằng PIN)
     * Vậy KHÔNG clear cache khi PIN lock - để self messages vẫn có thể decrypt được
     */
    clearKeyCache() {
        // CRITICAL FIX: KHÔNG clear cache khi PIN lock
        // Vì với self messages, ConversationKey PHẢI có trong cache (đã được tạo khi gửi message)
        // Nếu clear cache, self messages sẽ không thể decrypt được
        // Cache sẽ được clear khi app close hoặc user logout (không phải khi PIN lock)
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'conversationKeyService.js:170',message:'clearKeyCache called but skipped (preserving for self messages)',data:{cacheSize:this.keyCache.size,conversationIds:Array.from(this.keyCache.keys())},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'T'})}).catch(()=>{});
        // #endregion
        // this.keyCache.clear();
        console.log('[ConversationKeyService] Skipped clearing ConversationKey cache (preserving for self messages)');
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
