/**
 * Migration Script: Fix encrypted_conversation_key format
 * 
 * Mục đích:
 * - Kiểm tra tất cả conversations có encrypted_conversation_key không đúng format "iv:cipher"
 * - Generate conversation key mới và encrypt bằng master unlock key (từ PIN)
 * - Lưu lại format "iv:cipher"
 * 
 * Cách chạy:
 * node scripts/migrate_encrypted_conversation_key.js
 */

const readline = require('readline');
const { supabase } = require('../lib/supabase');
const encryptionService = require('../services/encryptionService').default;
const pinService = require('../services/pinService').default;

// Support both readline and environment variable
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => {
        // Check if PIN is provided via environment variable
        if (process.env.MIGRATION_PIN) {
            console.log(query + process.env.MIGRATION_PIN.replace(/./g, '*'));
            resolve(process.env.MIGRATION_PIN);
        } else {
            rl.question(query, resolve);
        }
    });
}

async function generateConversationKey() {
    try {
        const crypto = require('react-native-quick-crypto');
        const keyBytes = crypto.randomBytes(32);
        return new Uint8Array(keyBytes);
    } catch (e) {
        // Fallback
        const { getRandomValues } = require('react-native-get-random-values');
        const key = new Uint8Array(32);
        getRandomValues(key);
        return key;
    }
}

async function migrateConversationKey(conversationId, userId, pin) {
    try {
        // 1. Lấy salt từ conversation hoặc user_security
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('salt')
            .eq('id', conversationId)
            .single();

        if (convError) {
            console.error(`[Migration] Error fetching conversation ${conversationId}:`, convError);
            return false;
        }

        let salt = conversation?.salt;
        if (!salt) {
            const pinInfo = await pinService.getPinInfo(userId);
            if (!pinInfo || !pinInfo.pin_salt) {
                console.error(`[Migration] No salt found for conversation ${conversationId}`);
                return false;
            }
            salt = pinInfo.pin_salt;
        }

        // 2. Derive master unlock key từ PIN + salt
        const masterUnlockKey = await pinService.deriveUnlockKey(pin, salt);
        if (!masterUnlockKey || masterUnlockKey.length !== 32) {
            console.error(`[Migration] Failed to derive master unlock key for conversation ${conversationId}`);
            return false;
        }

        // 3. Generate conversation key mới (32 bytes)
        const conversationKey = await generateConversationKey();

        // 4. Encrypt conversation key bằng master unlock key
        const encryptedConversationKey = await encryptionService.encryptAESKeyWithMasterKey(
            conversationKey,
            masterUnlockKey
        );

        // 5. Update database
        const { error: updateError } = await supabase
            .from('conversations')
            .update({ encrypted_conversation_key: encryptedConversationKey })
            .eq('id', conversationId);

        if (updateError) {
            console.error(`[Migration] Error updating conversation ${conversationId}:`, updateError);
            return false;
        }

        console.log(`[Migration] Fixed encrypted_conversation_key for conversation ${conversationId}`);
        return true;
    } catch (error) {
        console.error(`[Migration] Exception for conversation ${conversationId}:`, error);
        return false;
    }
}

async function main() {
    try {
        console.log('========================================');
        console.log('Migration: Fix encrypted_conversation_key format');
        console.log('========================================\n');

        // 1. Lấy user hiện tại
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.error('Error: User not authenticated. Please login first.');
            process.exit(1);
        }

        console.log(`Authenticated as: ${user.email}\n`);

        // 2. Yêu cầu nhập PIN
        const pin = await question('Nhập PIN để migrate (6 số): ');
        if (!pin || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
            console.error('Error: PIN phải có đúng 6 số');
            process.exit(1);
        }

        // 3. Verify PIN
        const pinInfo = await pinService.getPinInfo(user.id);
        if (!pinInfo || !pinInfo.pin_salt || !pinInfo.pin_hash) {
            console.error('Error: PIN chưa được thiết lập');
            process.exit(1);
        }

        const inputPinHash = await pinService.hashPin(pin, pinInfo.pin_salt);
        if (inputPinHash !== pinInfo.pin_hash) {
            console.error('Error: PIN không đúng');
            process.exit(1);
        }

        console.log('PIN verified successfully.\n');

        // 4. Query tất cả conversations cần fix
        console.log('Querying conversations...');
        const { data: conversations, error: queryError } = await supabase
            .from('conversations')
            .select('id, encrypted_conversation_key, created_by')
            .not('encrypted_conversation_key', 'is', null);

        if (queryError) {
            console.error('Error querying conversations:', queryError);
            process.exit(1);
        }

        // 5. Filter conversations có format sai
        const conversationsToFix = conversations.filter(conv => {
            if (!conv.encrypted_conversation_key || conv.encrypted_conversation_key.trim() === '') {
                return false;
            }
            // Format đúng: "iv:cipher" (có dấu ':')
            return !conv.encrypted_conversation_key.includes(':');
        });

        if (conversationsToFix.length === 0) {
            console.log('✅ Không có conversation nào cần fix.');
            rl.close();
            process.exit(0);
        }

        console.log(`Found ${conversationsToFix.length} conversation(s) cần fix:\n`);
        conversationsToFix.forEach((conv, index) => {
            console.log(`${index + 1}. Conversation ID: ${conv.id}`);
            console.log(`   Current format: ${conv.encrypted_conversation_key.substring(0, 50)}...`);
        });

        // 6. Confirm
        const confirm = await question('\nBạn có muốn tiếp tục migrate? (yes/no): ');
        if (confirm.toLowerCase() !== 'yes') {
            console.log('Migration cancelled.');
            rl.close();
            process.exit(0);
        }

        // 7. Migrate từng conversation
        console.log('\nStarting migration...\n');
        let successCount = 0;
        let failCount = 0;

        for (const conv of conversationsToFix) {
            const success = await migrateConversationKey(conv.id, user.id, pin);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        // 8. Summary
        console.log('\n========================================');
        console.log('Migration Summary:');
        console.log(`✅ Success: ${successCount}`);
        console.log(`❌ Failed: ${failCount}`);
        console.log(`📊 Total: ${conversationsToFix.length}`);
        console.log('========================================');

        rl.close();
        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error);
        rl.close();
        process.exit(1);
    }
}

// Run migration
main();

