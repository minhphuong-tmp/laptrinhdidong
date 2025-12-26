# Fix E2EE State Architecture Bug

## 📋 Tổng quan

Đã fix bug nghiêm trọng về kiến trúc state trong E2EE:
- **Vấn đề**: Plaintext đã decrypt đang bị ghi đè vào `message.content`, dẫn đến 2 thiết bị khác nhau hiển thị cùng nội dung
- **Giải pháp**: Tách biệt rõ ràng giữa message gốc (ciphertext) và runtime decrypted state

---

## 🔧 Nguyên nhân gốc

### Vấn đề:
- ❌ Khi decrypt, code đang ghi đè `message.content` thành plaintext
- ❌ Khi load lại từ DB/cache, plaintext cũ vẫn còn trong state
- ❌ Dẫn đến 2 thiết bị khác nhau hiển thị cùng nội dung (vi phạm E2EE)

### Nguyên tắc bắt buộc:
1. Message lấy từ DB **TUYỆT ĐỐI KHÔNG BAO GIỜ** bị mutate thành plaintext
2. Decrypt chỉ tồn tại ở **RUNTIME (RAM)**, KHÔNG lưu DB
3. Decrypt phải **GẮN VỚI DEVICE ID**
4. Khi thoát khỏi conversation → **PHẢI XÓA TOÀN BỘ** runtime decrypted state
5. Khi vào lại conversation → **PHẢI decrypt lại từ đầu** theo device ID và PIN

---

## 🔧 Giải pháp

### A. Thêm field runtime-only (không lưu DB)

```javascript
{
  content: "ciphertext",              // Bất biến từ DB - KHÔNG BAO GIỜ ghi đè
  is_encrypted: true,
  runtime_plain_text: "Hello",        // Runtime-only - chỉ tồn tại trong RAM
  decrypted_on_device_id: "deviceA"   // Track device đã decrypt
}
```

### B. Khi decrypt (realtime hoặc sau khi nhập PIN)

**TRƯỚC (SAI)**:
```javascript
decryptedMessage = {
    ...messageWithSender,
    content: decryptedContent,  // ❌ Ghi đè content (ciphertext)
    is_encrypted: false
};
```

**SAU (ĐÚNG)**:
```javascript
decryptedMessage = {
    ...messageWithSender,
    // GIỮ NGUYÊN content (ciphertext) - KHÔNG BAO GIỜ ghi đè
    runtime_plain_text: decryptedContent,  // ✅ Runtime-only field
    decrypted_on_device_id: deviceId,     // ✅ Track device
    decryption_error: false
    // GIỮ NGUYÊN is_encrypted, encrypted_aes_key, encrypted_aes_key_by_pin
};
```

### C. Khi loadMessages() / getMessages()

**Clear TOÀN BỘ runtime decrypted state**:
```javascript
const sanitizedMessages = res.data.map(msg => {
    // Clear runtime state cho TẤT CẢ messages
    const { runtime_plain_text, decrypted_on_device_id, ...cleanMessage } = msg;
    return {
        ...cleanMessage,
        // Đảm bảo runtime state bị clear
        runtime_plain_text: undefined,
        decrypted_on_device_id: undefined
    };
});
```

**Lý do**:
- Message từ DB phải được treat như **CHƯA TỪNG DECRYPT**
- Không được assume message đã từng decrypt
- Treat tất cả encrypted message là **CHƯA DECRYPT**

### D. Khi render message trong chat

**Check runtime_plain_text trước khi check is_encrypted**:
```javascript
// FIX E2EE BUG: Check runtime_plain_text trước
const hasRuntimePlainText = message.runtime_plain_text && 
                            message.decrypted_on_device_id === currentDeviceId;

{hasRuntimePlainText ? (
    // Có runtime_plain_text và device ID match → hiển thị plaintext
    <Text>{message.runtime_plain_text}</Text>
) : (message.is_encrypted === true || message.decryption_error === true) ? (
    // Không có runtime_plain_text → hiển thị "Đã mã hóa đầu cuối"
    <Text>Đã mã hóa đầu cuối</Text>
) : (
    // Plaintext message (không encrypted)
    <Text>{message.content}</Text>
)}
```

**Đảm bảo**:
- ✅ Chỉ hiển thị `runtime_plain_text` khi `decrypted_on_device_id === currentDeviceId`
- ✅ Tuyệt đối không render ciphertext

### E. Khi thoát khỏi conversation

**Cleanup useEffect**:
```javascript
useEffect(() => {
    if (conversationId) {
        loadMessages();
        // ...
    }

    // FIX E2EE BUG: Cleanup - Clear TOÀN BỘ runtime decrypted state khi thoát
    return () => {
        if (conversationId) {
            setMessages(prev => {
                return prev.map(msg => {
                    // Clear runtime state
                    const { runtime_plain_text, decrypted_on_device_id, ...cleanMessage } = msg;
                    return {
                        ...cleanMessage,
                        runtime_plain_text: undefined,
                        decrypted_on_device_id: undefined
                    };
                });
            });
        }
    };
}, [conversationId]);
```

### F. Last message ngoài conversation list

**Check runtime_plain_text trước khi decrypt**:
```javascript
// Check runtime_plain_text trước
const hasRuntimePlainText = lastMessage.runtime_plain_text && 
                            lastMessage.decrypted_on_device_id === currentDeviceId;

if (hasRuntimePlainText) {
    // Đã có runtime_plain_text và device ID match → dùng luôn
    return lastMessage.runtime_plain_text;
}

// Chưa có runtime_plain_text → decrypt runtime
// (chỉ decrypt nếu sender_device_id === currentDeviceId HOẶC pinService.isUnlocked())
```

**Đảm bảo**:
- ✅ Không cache plaintext dùng chung cho nhiều thiết bị
- ✅ Clear runtime state trước khi decrypt lại

---

## ✅ Kết quả

### Trước khi fix:
- ❌ Realtime message: hiển thị đúng
- ❌ Thoát ra vào lại: **SAI** (2 thiết bị hiển thị cùng nội dung)
- ❌ Last message: **SAI** khi có tin nhắn mới

### Sau khi fix:
- ✅ Realtime message: hiển thị đúng
- ✅ Thoát ra vào lại: **VẪN ĐÚNG** (mỗi thiết bị decrypt riêng)
- ✅ Thiết bị A và B: **HIỂN THỊ KHÁC NHAU** đúng theo E2EE
- ✅ Không rò rỉ plaintext giữa các thiết bị
- ✅ Không bao giờ hiển thị ciphertext ra UI

---

## 📝 Notes

### Runtime-only fields:
- `runtime_plain_text`: Plaintext đã decrypt (chỉ tồn tại trong RAM)
- `decrypted_on_device_id`: Device ID đã decrypt (để verify)

### Message gốc từ DB (bất biến):
- `content`: Ciphertext - **KHÔNG BAO GIỜ** ghi đè
- `is_encrypted`: Flag encryption
- `encrypted_aes_key`, `encrypted_aes_key_by_pin`: Keys

### Flow decrypt:
1. Load từ DB → Clear runtime state
2. Decrypt → Set `runtime_plain_text` và `decrypted_on_device_id`
3. Render → Check `runtime_plain_text` và device ID
4. Thoát conversation → Clear runtime state
5. Vào lại → Decrypt lại từ đầu

### Bảo mật:
- ✅ Message gốc từ DB không bao giờ bị mutate
- ✅ Runtime state chỉ tồn tại trong RAM
- ✅ Mỗi thiết bị decrypt riêng theo device ID và PIN
- ✅ Không reuse plaintext giữa các thiết bị












