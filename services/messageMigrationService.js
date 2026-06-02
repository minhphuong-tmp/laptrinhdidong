import { supabase } from '../lib/supabase';
import encryptionService from './encryptionService';
import pinService from './pinService';

/**
 * Migration service để thêm PIN layer cho messages cũ
 * 
 * Logic:
 * 1. Khi decrypt thành công một message, check xem có encryptedAESKeyByPin trong content string không
 * 2. Nếu có nhưng chưa có trong DB → extract và lưu vào DB
 * 3. Hoặc nếu decrypt được bằng DeviceKey (device hiện tại), re-encrypt với PIN layer và lưu vào DB
 */
class MessageMigrationService {
    /**
     * Migrate message: Thêm PIN layer vào DB nếu message có thể decrypt được
     * @param {Object} message - Message object
     * @param {string} userId - User ID
     * @param {string} decryptedContent - Plaintext đã decrypt được (nếu có)
     * @returns {Promise<boolean>} - True nếu migration thành công
     */
    async migrateMessageWithPinLayer(message, userId, decryptedContent = null) {
        try {
            // Chỉ migrate sender_copy messages đã encrypted
            if (!message.is_sender_copy || !message.is_encrypted || message.message_type !== 'text') {
                return false;
            }

            // Nếu đã có encrypted_aes_key_by_pin trong DB → không cần migrate
            if (message.encrypted_aes_key_by_pin) {
                return false;
            }

            // Check PIN đã unlock chưa
            if (!pinService.isUnlocked()) {
                return false;
            }

            // Check user đã có PIN chưa
            const isPinSet = await pinService.isPinSet(userId);
            if (!isPinSet) {
                return false;
            }

            // Parse encrypted content để check có encryptedAESKeyByPin trong content string không
            const parsed = encryptionService.parseEncryptedData(message.content);
            if (!parsed || !parsed.encryptedContent) {
                return false;
            }

            // Nếu có encryptedAESKeyByPin trong content string (3-part format)
            // → Extract và lưu vào DB
            // Điều này cho phép decrypt messages từ device khác nếu chúng có PIN layer trong content
            if (parsed.encryptedAESKeyByPin) {
                try {
                    // Decode base64 để lấy lại format "iv:cipher"
                    // parsed.encryptedAESKeyByPin là base64 string của "iv:cipher" format
                    const decoded = Buffer.from(parsed.encryptedAESKeyByPin, 'base64').toString('utf-8');

                    console.log(`[MessageMigration] Attempting to extract PIN layer from message ${message.id}`);

                    // Update database
                    const { error } = await supabase
                        .from('messages')
                        .update({
                            encrypted_aes_key_by_pin: decoded,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', message.id);

                    if (error) {
                        console.error('[MessageMigration] Error updating message:', error);
                        return false;
                    }

                    console.log(`[MessageMigration] ✓ Migrated message ${message.id} - extracted PIN layer from content`);
                    return true;
                } catch (error) {
                    console.error('[MessageMigration] Error extracting PIN layer:', error);
                    return false;
                }
            }

            // Nếu không có PIN layer trong content, nhưng có thể decrypt được bằng DeviceKey (device hiện tại)
            // → Re-encrypt với PIN layer
            // CHỈ làm điều này cho messages từ device hiện tại (có thể decrypt bằng device key)
            const deviceService = require('./deviceService').default;
            const currentDeviceId = await deviceService.getOrCreateDeviceId();

            if (message.sender_device_id === currentDeviceId && decryptedContent) {
                // Message từ device hiện tại và đã decrypt được
                // → Extract AES key từ encrypted content và re-encrypt với PIN layer
                try {
                    // Decrypt AES key bằng device private key
                    const privateKey = await deviceService.getOrCreatePrivateKey(userId);
                    if (!privateKey || !parsed.encryptedAESKey) {
                        return false;
                    }

                    // Decrypt AES key
                    // parsed.encryptedAESKey đã là base64 string (như format từ DB)
                    const aesKey = await encryptionService.decryptAESKeyWithRSA(parsed.encryptedAESKey, privateKey);
                    if (!aesKey || aesKey.length !== 32) {
                        return false;
                    }

                    // Encrypt AES key với master unlock key (PIN layer)
                    const masterUnlockKey = pinService.getMasterUnlockKey();
                    if (!masterUnlockKey) {
                        return false;
                    }

                    const encryptedAESKeyByPin = await encryptionService.encryptAESKeyWithMasterKey(aesKey, masterUnlockKey);

                    // Update database
                    const { error } = await supabase
                        .from('messages')
                        .update({
                            encrypted_aes_key_by_pin: encryptedAESKeyByPin,
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', message.id);

                    if (error) {
                        console.error('[MessageMigration] Error updating message with new PIN layer:', error);
                        return false;
                    }

                    console.log(`[MessageMigration] ✓ Migrated message ${message.id} - added PIN layer`);
                    return true;
                } catch (error) {
                    console.error('[MessageMigration] Error adding PIN layer:', error);
                    return false;
                }
            }

            return false;
        } catch (error) {
            console.error('[MessageMigration] Error in migrateMessageWithPinLayer:', error);
            return false;
        }
    }
}

export default new MessageMigrationService();






