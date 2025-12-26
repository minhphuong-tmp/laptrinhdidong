/**
 * Helper functions để validate message content
 * Dùng để detect ciphertext format và đảm bảo không render ciphertext ra UI
 */

/**
 * Kiểm tra content có phải là ciphertext format không
 * Format hợp lệ:
 * - 2 parts: encryptedAESKey:encryptedContent
 * - 3 parts: encryptedAESKey:encryptedAESKeyByPIN:encryptedContent
 * 
 * @param {string} content - Content cần check
 * @returns {boolean} true nếu là ciphertext format
 */
export const detectCiphertextFormat = (content) => {
    if (!content || typeof content !== 'string') return false;

    // Ciphertext AES256 + IV luôn dài, tối thiểu 32 chars
    if (content.length < 32) return false;

    const parts = content.split(':');

    // Chỉ chấp nhận 2 hoặc 3 parts
    if (parts.length !== 2 && parts.length !== 3) return false;

    // Base64 pattern chỉ cho phép 0-2 dấu = ở cuối
    const base64Pattern = /^[A-Za-z0-9+/]+={0,2}$/;

    return parts.every(part => {
        // Mỗi part phải đủ dài (IV + cipher tối thiểu ~24 chars)
        if (part.length < 24 || !base64Pattern.test(part)) {
            return false;
        }

        // Validate Base64 bằng cách thử decode
        try {
            const decoded = atob(part);
            // Kiểm tra decoded length hợp lý (không quá ngắn)
            if (decoded.length < 16) {
                return false;
            }
            return true;
        } catch {
            return false;
        }
    });
};

/**
 * Kiểm tra message có thực sự bị encrypt không
 * Ưu tiên check metadata trước, format sau
 * 
 * @param {object} msg - Message object
 * @returns {boolean} true nếu message bị encrypt
 */
export const isMessageActuallyEncrypted = (msg) => {
    if (!msg) return false;

    // 1. Ưu tiên: Check metadata (bằng chứng chắc chắn)
    if (msg.encrypted_aes_key || msg.encrypted_aes_key_by_pin) {
        return true;
    }

    // 2. Check flag is_encrypted
    if (msg.is_encrypted === true) {
        return true;
    }

    // 3. Fallback: Check format content (chỉ khi có content)
    if (msg.content && typeof msg.content === 'string') {
        return detectCiphertextFormat(msg.content);
    }

    return false;
};

/**
 * Kiểm tra message đã được decrypt thành công chưa
 * 
 * @param {object} msg - Message object
 * @returns {boolean} true nếu message đã decrypt
 */
export const isMessageDecrypted = (msg) => {
    if (!msg) return false;

    // 1. Có runtime_plain_text → đã decrypt
    if (msg.runtime_plain_text !== null && msg.runtime_plain_text !== undefined) {
        return true;
    }

    // 2. Có ui_optimistic_text → đã có text để hiển thị (tạm thời)
    if (msg.ui_optimistic_text !== null && msg.ui_optimistic_text !== undefined) {
        return true;
    }

    // 3. is_encrypted = false VÀ không phải ciphertext format
    if (!msg.is_encrypted && msg.content && typeof msg.content === 'string') {
        // Đảm bảo không có metadata encryption
        if (!msg.encrypted_aes_key && !msg.encrypted_aes_key_by_pin) {
            // Và content không phải ciphertext format
            if (!detectCiphertextFormat(msg.content)) {
                // Và content không rỗng
                if (msg.content.trim() !== '') {
                    return true;
                }
            }
        }
    }

    return false;
};

/**
 * TIÊU CHUẨN HIỂN THỊ TEXT (NEW ARCHITECTURE: ConversationKey)
 * Kiểm tra message có ĐƯỢC PHÉP render plaintext không
 * 
 * CHỈ TRẢ VỀ TRUE KHI:
 * 1. Có runtime_plain_text (đã decrypt bằng ConversationKey)
 * 2. HOẶC có ui_optimistic_text (self message vừa gửi)
 * 3. HOẶC message KHÔNG encrypted (plaintext message)
 * 
 * KHÔNG phân biệt device - ConversationKey là nguồn decrypt duy nhất
 * 
 * @param {object} msg - Message object
 * @param {string|null} currentDeviceId - Current device ID (deprecated, giữ lại để backward compatibility)
 * @returns {boolean} true nếu được phép render plaintext
 */
export const canRenderPlaintext = (msg, currentDeviceId) => {
    if (!msg) return false;

    // 1. Có runtime_plain_text → ĐƯỢC PHÉP (đã decrypt bằng ConversationKey)
    if (msg.runtime_plain_text !== null &&
        msg.runtime_plain_text !== undefined &&
        typeof msg.runtime_plain_text === 'string' &&
        msg.runtime_plain_text.trim() !== '') {
        return true;
    }

    // 2. Có ui_optimistic_text → ĐƯỢC PHÉP (self message vừa gửi)
    if (msg.ui_optimistic_text !== null && msg.ui_optimistic_text !== undefined) {
        return true;
    }

    // 3. Message KHÔNG encrypted → ĐƯỢC PHÉP render plaintext
    if (msg.is_encrypted !== true) {
        // Content không rỗng
        if (msg.content && typeof msg.content === 'string' && msg.content.trim() !== '') {
            return true;
        }
    }

    // Tất cả trường hợp còn lại → KHÔNG được render plaintext
    return false;
};

/**
 * Lấy text an toàn để hiển thị cho message (NEW ARCHITECTURE: ConversationKey)
 * FIX CRITICAL UI BUG: Đảm bảo luôn return string hợp lệ (không undefined/null/empty)
 * 
 * KHÔNG phân biệt device - ConversationKey là nguồn decrypt duy nhất
 * 
 * @param {object} msg - Message object
 * @param {string|null} currentDeviceId - Current device ID (deprecated, giữ lại để backward compatibility)
 * @returns {string} Text an toàn để hiển thị (luôn là string hợp lệ)
 */
export const getSafeDisplayText = (msg, currentDeviceId) => {
    if (!msg) return 'Đã mã hóa đầu cuối';

    // 1. Ưu tiên: ui_optimistic_text (đảm bảo là string hợp lệ)
    if (msg.ui_optimistic_text !== null &&
        msg.ui_optimistic_text !== undefined &&
        typeof msg.ui_optimistic_text === 'string' &&
        msg.ui_optimistic_text.trim() !== '') {
        return msg.ui_optimistic_text;
    }

    // 2. runtime_plain_text (đã decrypt bằng ConversationKey)
    if (msg.runtime_plain_text !== null &&
        msg.runtime_plain_text !== undefined &&
        typeof msg.runtime_plain_text === 'string' &&
        msg.runtime_plain_text.trim() !== '') {
        return msg.runtime_plain_text;
    }

    // 3. Kiểm tra có được phép render plaintext không (message không encrypted)
    if (canRenderPlaintext(msg, currentDeviceId)) {
        // FIX CRITICAL UI BUG: Đảm bảo content là string hợp lệ
        if (msg.content &&
            typeof msg.content === 'string' &&
            msg.content.trim() !== '') {
            return msg.content;
        }

        // Content không hợp lệ → fallback
        return 'Đã mã hóa đầu cuối';
    }

    // 4. Tất cả trường hợp còn lại → label cố định
    // Đảm bảo luôn return string hợp lệ
    return 'Đã mã hóa đầu cuối';
};











