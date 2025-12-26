# Migration: get_conversation_key RPC Function

## Mục đích

Tạo Supabase RPC function `get_conversation_key(conversation_id uuid)` để frontend lấy ConversationKey cho mô hình **Khóa nội dung phía thiết bị (Client-side Privacy Lock)**.

## Files

1. **`get_conversation_key_complete.sql`** ⭐ **RECOMMENDED**: File SQL hoàn chỉnh, tự động thêm column và tạo function (chạy 1 lần)
2. **`add_conversation_key_column.sql`**: Chỉ thêm column `conversation_key` vào bảng `conversations` (nếu chưa có)
3. **`get_conversation_key_function.sql`**: Chỉ tạo RPC function `get_conversation_key`

## Cách chạy

### ⭐ Option 1: Chạy file hoàn chỉnh (RECOMMENDED)

1. Mở Supabase Dashboard → SQL Editor
2. Copy toàn bộ nội dung file `get_conversation_key_complete.sql`
3. Paste vào SQL Editor và chạy (Run)

### Option 2: Chạy từng file riêng

1. Mở Supabase Dashboard → SQL Editor
2. Chạy file `add_conversation_key_column.sql` trước
3. Sau đó chạy file `get_conversation_key_function.sql`

### Option 2: Sử dụng Supabase CLI

```bash
# Nếu dùng Supabase CLI
supabase db push
```

## Function Details

### Input
- `conversation_id` (uuid): ID của conversation

### Output
- JSON object: `{ "conversation_key": "base64_string" }`

### Security
- Function sử dụng `SECURITY DEFINER` để chạy với quyền của function owner
- Kiểm tra `auth.uid()` phải là member của conversation
- Chỉ grant execute cho `authenticated` users

### Behavior
- ✅ Nếu user không authenticated → raise exception
- ✅ Nếu user không phải member → raise exception
- ✅ Nếu conversation không tồn tại → raise exception
- ✅ Nếu conversation chưa có key → raise exception
- ✅ Nếu thành công → return `conversation_key` (base64 string)

## Schema Changes

### Bảng `conversations`
- Thêm column `conversation_key` (text, nullable)
- Lưu ConversationKey (plaintext) dạng base64 string
- Backend quản lý và tạo key này khi init conversation

## Notes

- Function **KHÔNG** init conversation
- Function **KHÔNG** tạo key mới
- Function **KHÔNG** mutate dữ liệu
- Function chỉ **đọc** và trả về key hiện có

## Testing

Sau khi chạy migration, test function:

```sql
-- Test với conversation_id hợp lệ
SELECT public.get_conversation_key('your-conversation-id-here');
```

## Frontend Usage

Frontend đã được cấu hình để gọi function này:

```javascript
const { data, error } = await supabase
    .rpc('get_conversation_key', { conversation_id: conversationId });

if (data?.conversation_key) {
    // Convert base64 to Uint8Array
    const conversationKey = Uint8Array.from(
        atob(data.conversation_key), 
        c => c.charCodeAt(0)
    );
}
```

