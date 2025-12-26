/**
 * Migration Script: Fix encrypted_conversation_key format (Standalone)
 * 
 * Script này chạy độc lập, không phụ thuộc React Native modules
 * Chỉ dùng Node.js và Supabase client
 * 
 * Cách chạy:
 * node scripts/migrate_encrypted_conversation_key_standalone.js
 * 
 * Hoặc với PIN từ environment variable (PowerShell):
 * $env:MIGRATION_PIN="123456"; node scripts/migrate_encrypted_conversation_key_standalone.js
 */

const readline = require('readline');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Load Supabase config
// Note: constants/index.js uses ES module, so we need to read it directly
let supabaseUrl, supabaseAnonKey;
try {
    const fs = require('fs');
    const path = require('path');
    const constantsPath = path.join(__dirname, '../constants/index.js');
    const constantsContent = fs.readFileSync(constantsPath, 'utf8');
    
    // Extract values using regex (simple approach)
    const urlMatch = constantsContent.match(/supabaseUrl\s*=\s*['"]([^'"]+)['"]/);
    const keyMatch = constantsContent.match(/supabaseAnonKey\s*=\s*['"]([^'"]+)['"]/);
    
    if (!urlMatch || !keyMatch) {
        throw new Error('Could not parse constants file');
    }
    
    supabaseUrl = urlMatch[1];
    supabaseAnonKey = keyMatch[1];
} catch (e) {
    console.error('Error loading constants:', e.message);
    console.error('Please ensure constants/index.js exists and has supabaseUrl and supabaseAnonKey.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => {
        if (process.env.MIGRATION_PIN) {
            console.log(query + process.env.MIGRATION_PIN.replace(/./g, '*'));
            resolve(process.env.MIGRATION_PIN);
        } else {
            rl.question(query, resolve);
        }
    });
}

// Generate random 32 bytes (AES-256 key)
function generateConversationKey() {
    return crypto.randomBytes(32);
}

// Derive master unlock key từ PIN + salt (PBKDF2, 100k iterations, SHA-256)
function deriveMasterUnlockKey(pin, saltBase64) {
    const salt = Buffer.from(saltBase64, 'base64');
    return crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256');
}

// Hash PIN với salt (SHA-256) để verify
function hashPin(pin, salt) {
    return crypto.createHash('sha256').update(pin + salt).digest('hex');
}

// Encrypt AES key với master unlock key (AES-256-GCM)
// Format output: "iv_base64:cipher_base64" (GCM authTag được append vào ciphertext)
async function encryptAESKeyWithMasterKey(aesKey, masterUnlockKey) {
    // Generate random IV (12 bytes cho GCM)
    const iv = crypto.randomBytes(12);
    
    // Convert AES key (32 bytes) sang base64 string để mã hóa
    const aesKeyBase64 = aesKey.toString('base64');
    const data = Buffer.from(aesKeyBase64, 'utf8');
    
    // Encrypt với AES-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', masterUnlockKey, iv);
    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // Combine encrypted data + authTag (16 bytes) thành một ciphertext
    // Format: "iv_base64:cipher_base64" (ciphertext bao gồm encrypted + authTag)
    const ciphertext = Buffer.concat([encrypted, authTag]);
    return iv.toString('base64') + ':' + ciphertext.toString('base64');
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
            const { data: pinInfo, error: pinError } = await supabase
                .from('user_security')
                .select('pin_salt')
                .eq('user_id', userId)
                .single();
            
            if (pinError || !pinInfo || !pinInfo.pin_salt) {
                console.error(`[Migration] No salt found for conversation ${conversationId}`);
                return false;
            }
            salt = pinInfo.pin_salt;
        }

        // 2. Derive master unlock key từ PIN + salt
        const masterUnlockKey = deriveMasterUnlockKey(pin, salt);
        if (!masterUnlockKey || masterUnlockKey.length !== 32) {
            console.error(`[Migration] Failed to derive master unlock key for conversation ${conversationId}`);
            return false;
        }

        // 3. Generate conversation key mới (32 bytes)
        const conversationKey = generateConversationKey();

        // 4. Encrypt conversation key bằng master unlock key
        const encryptedConversationKey = await encryptAESKeyWithMasterKey(
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

        // 1. Lấy user hiện tại (cần login trước)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            console.error('Error: User not authenticated. Please login first.');
            console.log('Hint: You may need to set SUPABASE_ACCESS_TOKEN or login via Supabase CLI');
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
        const { data: pinInfo, error: pinError } = await supabase
            .from('user_security')
            .select('pin_salt, pin_hash')
            .eq('user_id', user.id)
            .single();

        if (pinError || !pinInfo || !pinInfo.pin_salt || !pinInfo.pin_hash) {
            console.error('Error: PIN chưa được thiết lập');
            process.exit(1);
        }

        const inputPinHash = hashPin(pin, pinInfo.pin_salt);
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
            // Format đúng: "iv:cipher" (có 1 dấu ':', 2 parts)
            // Format sai: không có dấu ':' hoặc chỉ có 1 phần
            const parts = conv.encrypted_conversation_key.split(':');
            return parts.length !== 2; // Phải đúng "iv:cipher" (2 parts)
        });

        if (conversationsToFix.length === 0) {
            console.log('✅ Không có conversation nào cần fix.');
            rl.close();
            process.exit(0);
        }

        console.log(`Found ${conversationsToFix.length} conversation(s) cần fix:\n`);
        conversationsToFix.forEach((conv, index) => {
            console.log(`${index + 1}. Conversation ID: ${conv.id}`);
            const preview = conv.encrypted_conversation_key.substring(0, 50);
            console.log(`   Current format: ${preview}${conv.encrypted_conversation_key.length > 50 ? '...' : ''}`);
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

