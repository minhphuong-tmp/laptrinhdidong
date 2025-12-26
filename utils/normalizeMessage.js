/**
 * ✅ DATA CONTRACT: runtime_plain_text CHỈ TỒN TẠI DẠNG OBJECT
 * 
 * Format bắt buộc:
 * runtime_plain_text?: {
 *   text: string
 *   source: 'DECRYPTED' | 'DEVICE_KEY' | 'LOCAL_CACHE' | 'PLAINTEXT'
 * }
 * 
 * TUYỆT ĐỐI KHÔNG cho phép runtime_plain_text là string
 * 
 * QUY TẮC CỐT LÕI: MỌI message hiển thị trong UI BẮT BUỘC phải có runtime_plain_text
 */

/**
 * Normalize message để đảm bảo runtime_plain_text luôn là object format
 * ✅ CỬA DUY NHẤT cho message vào state
 * @param {object} msg - Message object
 * @returns {object} Normalized message
 */
export function normalizeMessage(msg) {
    if (!msg || typeof msg !== 'object') {
        return msg;
    }

    // ✅ III. FIX TẠI NGUỒN: Nếu plaintext message thiếu runtime_plain_text → auto inject
    // Áp dụng cho TẤT CẢ plaintext messages (không phân biệt self/receiver)
    if (
        msg.message_type === 'text' &&
        msg.is_encrypted === false &&
        !msg.runtime_plain_text
    ) {
        const plaintext = msg.content_preview ?? msg.content ?? '';
        if (plaintext && typeof plaintext === 'string' && plaintext.trim() !== '') {
            return {
                ...msg,
                runtime_plain_text: {
                    text: plaintext,
                    source: 'PLAINTEXT'
                }
            };
        }
    }

    // ✅ Nếu runtime_plain_text là string → ép thành object
    if (typeof msg.runtime_plain_text === 'string') {
        const text = msg.runtime_plain_text;
        // Infer source từ encryption_version
        const source = (msg.encryption_version != null && msg.encryption_version < 3) 
            ? 'DEVICE_KEY' 
            : 'LOCAL_CACHE';
        
        return {
            ...msg,
            runtime_plain_text: {
                text: text,
                source: source
            }
        };
    }

    // ✅ Nếu runtime_plain_text là object nhưng thiếu source → thêm source
    if (
        msg.runtime_plain_text &&
        typeof msg.runtime_plain_text === 'object' &&
        msg.runtime_plain_text.text &&
        !msg.runtime_plain_text.source
    ) {
        // Infer source từ encryption_version
        const source = (msg.encryption_version != null && msg.encryption_version < 3) 
            ? 'DEVICE_KEY' 
            : 'LOCAL_CACHE';
        
        return {
            ...msg,
            runtime_plain_text: {
                text: msg.runtime_plain_text.text,
                source: source
            }
        };
    }

    // ✅ Nếu runtime_plain_text là object nhưng thiếu text → clear
    if (
        msg.runtime_plain_text &&
        typeof msg.runtime_plain_text === 'object' &&
        !msg.runtime_plain_text.text
    ) {
        const { runtime_plain_text, ...rest } = msg;
        return rest;
    }

    return msg;
}

/**
 * Normalize array of messages
 * @param {array} messages - Array of message objects
 * @returns {array} Array of normalized messages
 */
export function normalizeMessages(messages) {
    if (!Array.isArray(messages)) {
        return messages;
    }
    return messages.map(msg => normalizeMessage(msg));
}

/**
 * Assert runtime_plain_text format (chỉ dùng trong dev)
 * ✅ VI. RENDER – CẤM EDGE CASE: Assert thay vì warn
 * @param {object} msg - Message object
 * @throws {Error} Nếu runtime_plain_text là string hoặc thiếu runtime_plain_text cho plaintext message
 */
export function assertRuntimePlainTextFormat(msg) {
    if (__DEV__ && msg) {
        // ✅ Assert: Plaintext message (is_encrypted = false) BẮT BUỘC phải có runtime_plain_text
        // Encrypted messages chưa decrypt → không cần runtime_plain_text (sẽ hiển thị placeholder)
        if (
            msg.message_type === 'text' && 
            msg.is_encrypted === false && 
            !msg.runtime_plain_text
        ) {
            throw new Error(
                `[FATAL] Plaintext message without runtime_plain_text detected: message ${msg.id}, content=${msg.content?.substring(0, 50)}`
            );
        }

        // ✅ Assert: Nếu có runtime_plain_text thì phải là object format
        if (msg.runtime_plain_text) {
            if (typeof msg.runtime_plain_text === 'string') {
                throw new Error(
                    `[FATAL] runtime_plain_text must be object, found string for message ${msg.id}`
                );
            }
            if (
                typeof msg.runtime_plain_text === 'object' &&
                (!msg.runtime_plain_text.text || !msg.runtime_plain_text.source)
            ) {
                throw new Error(
                    `[FATAL] runtime_plain_text object must have text and source for message ${msg.id}`
                );
            }
        }
    }
}

