import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * LocalMessagePlaintextService
 * Quản lý plaintext của tin nhắn (đã gửi và nhận được) trong localStorage
 * Key format: msg_{messageId} → plaintext
 * 
 * Lưu ý: localStorage có thể bị XSS, nhưng chấp nhận được cho dự án cá nhân
 */
class LocalMessagePlaintextService {
    /**
     * Lưu plaintext của tin nhắn vào localStorage
     * @param {string} messageId - Message ID
     * @param {string} plaintext - Plaintext của tin nhắn
     * @param {object} metadata - Metadata của tin nhắn (conversation_id, sender_id, created_at, message_type, etc.)
     * @returns {Promise<boolean>} True nếu lưu thành công
     */
    async saveMessagePlaintext(messageId, plaintext, metadata = {}) {
        try {
            if (!messageId || !plaintext) {
                console.warn('[LocalMessagePlaintext] Invalid input:', { messageId, hasPlaintext: !!plaintext });
                return false;
            }

            const key = `msg_${messageId}`;
            const data = {
                plaintext,
                ...metadata,
                saved_at: new Date().toISOString()
            };
            await AsyncStorage.setItem(key, JSON.stringify(data));
            
            // Log để verify đã lưu thành công
            const verifyData = await AsyncStorage.getItem(key);
            if (verifyData) {
                console.log(`[LocalMessagePlaintext] ✅ Đã lưu thành công vào localStorage:`, {
                    messageId: messageId,
                    key: key,
                    conversationId: metadata.conversation_id,
                    plaintextLength: plaintext.length,
                    plaintextPreview: plaintext.substring(0, 50),
                    savedAt: data.saved_at
                });
            } else {
                console.error(`[LocalMessagePlaintext] ❌ Lưu thất bại - không tìm thấy data sau khi save: messageId=${messageId}`);
            }
            return true;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error saving plaintext:', error);
            return false;
        }
    }

    /**
     * Lấy plaintext của tin nhắn từ localStorage
     * @param {string} messageId - Message ID
     * @returns {Promise<string|null>} Plaintext hoặc null nếu không tìm thấy
     */
    async getMessagePlaintext(messageId) {
        try {
            if (!messageId) {
                return null;
            }

            const key = `msg_${messageId}`;
            const dataStr = await AsyncStorage.getItem(key);
            
            if (!dataStr) {
                return null;
            }

            // Backward compatibility: nếu là string cũ (chỉ có plaintext) → trả về luôn
            try {
                const data = JSON.parse(dataStr);
                if (typeof data === 'object' && data.plaintext) {
                    // Format mới (có metadata)
                    if (__DEV__) {
                        console.log(`[LocalMessagePlaintext] Retrieved plaintext for message ${messageId}`);
                    }
                    return data.plaintext;
                }
            } catch (e) {
                // Không phải JSON → format cũ (chỉ có plaintext)
                if (__DEV__) {
                    console.log(`[LocalMessagePlaintext] Retrieved plaintext (old format) for message ${messageId}`);
                }
                return dataStr;
            }
            
            return null;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error getting plaintext:', error);
            return null;
        }
    }

    /**
     * Lấy metadata của tin nhắn từ localStorage
     * @param {string} messageId - Message ID
     * @returns {Promise<object|null>} Metadata hoặc null nếu không tìm thấy
     */
    async getMessageMetadata(messageId) {
        try {
            if (!messageId) {
                return null;
            }

            const key = `msg_${messageId}`;
            const dataStr = await AsyncStorage.getItem(key);
            
            if (!dataStr) {
                return null;
            }

            try {
                const data = JSON.parse(dataStr);
                if (typeof data === 'object' && data.plaintext) {
                    // Format mới (có metadata)
                    const { plaintext, saved_at, ...metadata } = data;
                    return metadata;
                }
            } catch (e) {
                // Format cũ (chỉ có plaintext) → không có metadata
                return null;
            }
            
            return null;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error getting metadata:', error);
            return null;
        }
    }

    /**
     * Lấy tất cả tin nhắn đã gửi từ localStorage cho một conversation
     * @param {string} conversationId - Conversation ID
     * @param {string} currentUserId - Current user ID để filter sent messages
     * @param {string} currentDeviceId - Current device ID để filter (chỉ load tin nhắn từ device này, trừ khi PIN unlock)
     * @param {boolean} isPinUnlocked - Nếu true, load tin nhắn từ tất cả devices; nếu false, chỉ load từ device hiện tại
     * @returns {Promise<array>} Array of messages với plaintext và metadata
     */
    async getSentMessagesForConversation(conversationId, currentUserId = null, currentDeviceId = null, isPinUnlocked = false) {
        try {
            if (!conversationId) {
                return [];
            }

            const keys = await AsyncStorage.getAllKeys();
            const messageKeys = keys.filter(key => key.startsWith('msg_'));
            
            const messages = [];
            for (const key of messageKeys) {
                try {
                    const dataStr = await AsyncStorage.getItem(key);
                    if (!dataStr) continue;

                    // Backward compatibility: nếu là string cũ → skip (không có metadata)
                    let data;
                    try {
                        data = JSON.parse(dataStr);
                        if (typeof data !== 'object' || !data.plaintext) {
                            continue; // Format cũ hoặc không hợp lệ
                        }
                    } catch (e) {
                        continue; // Format cũ → skip
                    }

                    // Check conversation_id và sender_id (nếu có currentUserId)
                    if (data.conversation_id === conversationId) {
                        if (currentUserId && data.sender_id !== currentUserId) {
                            continue; // Không phải tin nhắn đã gửi
                        }
                        
                        const messageId = key.replace('msg_', '');
                        messages.push({
                            id: messageId,
                            plaintext: data.plaintext,
                            conversation_id: data.conversation_id,
                            sender_id: data.sender_id,
                            created_at: data.created_at,
                            message_type: data.message_type || 'text',
                            is_encrypted: data.is_encrypted !== false, // Default true
                            ...data // Include other metadata
                        });
                    }
                } catch (error) {
                    console.warn(`[LocalMessagePlaintext] Error parsing message ${key}:`, error);
                    continue;
                }
            }

            // Sort theo created_at (mới nhất trước)
            messages.sort((a, b) => {
                const timeA = new Date(a.created_at || 0).getTime();
                const timeB = new Date(b.created_at || 0).getTime();
                return timeB - timeA;
            });

            if (__DEV__) {
                console.log(`[LocalMessagePlaintext] Retrieved ${messages.length} sent messages for conversation ${conversationId}`);
            }

            return messages;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error getting sent messages:', error);
            return [];
        }
    }

    /**
     * Lấy tất cả tin nhắn nhận được từ localStorage cho một conversation
     * @param {string} conversationId - Conversation ID
     * @param {string} currentUserId - Current user ID để filter received messages
     * @returns {Promise<array>} Array of messages với plaintext và metadata
     */
    async getReceivedMessagesForConversation(conversationId, currentUserId) {
        try {
            if (!conversationId || !currentUserId) {
                return [];
            }

            const keys = await AsyncStorage.getAllKeys();
            const messageKeys = keys.filter(key => key.startsWith('msg_'));
            
            const messages = [];
            for (const key of messageKeys) {
                try {
                    const dataStr = await AsyncStorage.getItem(key);
                    if (!dataStr) continue;

                    // Backward compatibility: nếu là string cũ → skip (không có metadata)
                    let data;
                    try {
                        data = JSON.parse(dataStr);
                        if (typeof data !== 'object' || !data.plaintext) {
                            continue; // Format cũ hoặc không hợp lệ
                        }
                    } catch (e) {
                        continue; // Format cũ → skip
                    }

                    // Check conversation_id và sender_id (phải khác currentUserId)
                    if (data.conversation_id === conversationId && data.sender_id !== currentUserId) {
                        const messageId = key.replace('msg_', '');
                        messages.push({
                            id: messageId,
                            plaintext: data.plaintext,
                            conversation_id: data.conversation_id,
                            sender_id: data.sender_id,
                            created_at: data.created_at,
                            message_type: data.message_type || 'text',
                            is_encrypted: data.is_encrypted !== false, // Default true
                            ...data // Include other metadata
                        });
                    }
                } catch (error) {
                    console.warn(`[LocalMessagePlaintext] Error parsing message ${key}:`, error);
                    continue;
                }
            }

            // Sort theo created_at (mới nhất trước)
            messages.sort((a, b) => {
                const timeA = new Date(a.created_at || 0).getTime();
                const timeB = new Date(b.created_at || 0).getTime();
                return timeB - timeA;
            });

            if (__DEV__) {
                console.log(`[LocalMessagePlaintext] Retrieved ${messages.length} received messages for conversation ${conversationId}`);
            }

            return messages;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error getting received messages:', error);
            return [];
        }
    }

    /**
     * Xóa plaintext của tin nhắn khỏi localStorage
     * @param {string} messageId - Message ID
     * @returns {Promise<boolean>} True nếu xóa thành công
     */
    async clearMessagePlaintext(messageId) {
        try {
            if (!messageId) {
                return false;
            }

            const key = `msg_${messageId}`;
            await AsyncStorage.removeItem(key);
            
            if (__DEV__) {
                console.log(`[LocalMessagePlaintext] Cleared plaintext for message ${messageId}`);
            }
            return true;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error clearing plaintext:', error);
            return false;
        }
    }

    /**
     * Xóa tất cả plaintext messages khỏi localStorage
     * @returns {Promise<boolean>} True nếu xóa thành công
     */
    async clearAllMessagePlaintext() {
        try {
            const keys = await AsyncStorage.getAllKeys();
            const messageKeys = keys.filter(key => key.startsWith('msg_'));
            
            if (messageKeys.length > 0) {
                await AsyncStorage.multiRemove(messageKeys);
                if (__DEV__) {
                    console.log(`[LocalMessagePlaintext] Cleared ${messageKeys.length} plaintext messages`);
                }
            }
            return true;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error clearing all plaintext:', error);
            return false;
        }
    }

    /**
     * Lấy tất cả message IDs có plaintext trong localStorage
     * @returns {Promise<string[]>} Array of message IDs
     */
    async getAllMessageIds() {
        try {
            const keys = await AsyncStorage.getAllKeys();
            const messageKeys = keys.filter(key => key.startsWith('msg_'));
            const messageIds = messageKeys.map(key => key.replace('msg_', ''));
            return messageIds;
        } catch (error) {
            console.error('[LocalMessagePlaintext] Error getting all message IDs:', error);
            return [];
        }
    }
}

export default new LocalMessagePlaintextService();
