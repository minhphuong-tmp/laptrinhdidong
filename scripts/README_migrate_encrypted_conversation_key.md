# Migration Script: Fix encrypted_conversation_key Format

## Mục đích

Script này sửa format của `encrypted_conversation_key` trong bảng `conversations` từ format cũ (không có dấu ':') sang format chuẩn `"iv:cipher"`.

## Vấn đề

Một số conversation có `encrypted_conversation_key` không đúng format:
- Format chuẩn: `"iv_base64:cipher_base64"` (có dấu ':')
- Format cũ: chỉ có 1 phần (không có dấu ':')

Khi client-side decrypt, sẽ gặp lỗi:
```
Invalid encrypted data format: expected "iv:cipher", got 1 parts
```

## Cách sử dụng

### Bước 1: Kiểm tra conversations cần fix

Chạy SQL script trong Supabase Dashboard → SQL Editor:

```sql
-- File: supabase/migrations/check_encrypted_conversation_key_format.sql
```

Script này sẽ:
- Liệt kê tất cả conversations có `encrypted_conversation_key` không đúng format
- Hiển thị summary: số lượng conversations cần fix

### Bước 2: Chạy migration script

⚠️ **QUAN TRỌNG**: Sử dụng script **standalone** để tránh lỗi ES module:

#### Option 1: Chạy với interactive prompt (nhập PIN khi chạy)

```bash
node scripts/migrate_encrypted_conversation_key_standalone.js
```

Script sẽ:
1. Yêu cầu nhập PIN (6 số)
2. Verify PIN
3. Query tất cả conversations cần fix
4. Hiển thị danh sách
5. Yêu cầu xác nhận
6. Migrate từng conversation

#### Option 2: Chạy với PIN từ environment variable

**PowerShell (Windows):**
```powershell
$env:MIGRATION_PIN="123456"; node scripts/migrate_encrypted_conversation_key_standalone.js
```

**Bash (Linux/Mac):**
```bash
MIGRATION_PIN=123456 node scripts/migrate_encrypted_conversation_key_standalone.js
```

#### Option 3: Script cũ (có thể gặp lỗi ES module)

```bash
node scripts/migrate_encrypted_conversation_key.js
```

## Quy trình migration

Với mỗi conversation có format sai:

1. **Lấy salt**: Từ `conversations.salt` hoặc `user_security.pin_salt`
2. **Derive master unlock key**: Từ PIN + salt (PBKDF2, 100k iterations)
3. **Generate conversation key mới**: 32 bytes random (AES-256)
4. **Encrypt conversation key**: Bằng master unlock key (AES-GCM, IV 12 bytes)
5. **Lưu format "iv:cipher"**: Update vào `conversations.encrypted_conversation_key`

## Lưu ý

⚠️ **QUAN TRỌNG**:
- Script sẽ **generate conversation key mới** cho mỗi conversation có format sai
- Conversation key cũ sẽ **KHÔNG thể decrypt được** sau migration
- **KHÔNG ảnh hưởng** đến messages đã có (messages vẫn decrypt bằng conversation key cũ nếu đã có trong RAM)
- Chỉ ảnh hưởng khi **reload app** và **nhập PIN lại** → sẽ dùng conversation key mới

✅ **An toàn**:
- Script **KHÔNG xóa** conversation nào
- Script **KHÔNG thay đổi** content messages
- Chỉ update `encrypted_conversation_key` format

## Output mẫu

```
========================================
Migration: Fix encrypted_conversation_key format
========================================

Authenticated as: user@example.com

Nhập PIN để migrate (6 số): ******
PIN verified successfully.

Querying conversations...
Found 3 conversation(s) cần fix:

1. Conversation ID: abc-123-def
   Current format: old_format_without_colon...

2. Conversation ID: xyz-456-ghi
   Current format: another_old_format...

Bạn có muốn tiếp tục migrate? (yes/no): yes

Starting migration...

[Migration] Fixed encrypted_conversation_key for conversation abc-123-def
[Migration] Fixed encrypted_conversation_key for conversation xyz-456-ghi

========================================
Migration Summary:
✅ Success: 2
❌ Failed: 0
📊 Total: 2
========================================
```

## Troubleshooting

### Lỗi: "PIN không đúng"
- Đảm bảo PIN đúng 6 số
- Đảm bảo PIN đã được set trong `user_security` table

### Lỗi: "No salt found"
- Kiểm tra `conversations.salt` hoặc `user_security.pin_salt` có tồn tại không

### Lỗi: "Error encrypting AES key"
- Đảm bảo `react-native-quick-crypto` hoặc Web Crypto API available
- Kiểm tra dependencies đã được install

## Sau khi migration

1. ✅ Tất cả conversations đều có `encrypted_conversation_key` format `"iv:cipher"`
2. ✅ Client-side decrypt chạy bình thường
3. ✅ Không còn lỗi "Invalid encrypted data format"
4. ✅ PIN đúng → mở conversation → set conversationKey trong RAM
5. ✅ PIN sai → báo lỗi decrypt fail
6. ✅ Reload app → conversationKey mất → bắt nhập PIN lại

