# Fix E2EE State Architecture - Phase 2

## 📋 Tổng quan

Đã fix bug E2EE State Architecture giai đoạn 2:
- **Vấn đề**: Self message hiển thị trống, last message sai khi có tin nhắn mới, 2 thiết bị hiển thị giống nhau
- **Giải pháp**: Thêm `ui_optimistic_text` cho self message, sửa logic render, dùng snapshot cho last message

---

## 🔧 Bug hiện tại

### Vấn đề:
1. ❌ Tin nhắn do chính thiết bị gửi → UI hiển thị TRỐNG
2. ❌ Last message ngoài conversation → Đúng lúc đầu, sai khi có tin nhắn mới
3. ❌ Quay ra / vào lại → 2 thiết bị lại hiển thị giống nhau

### Nguyên nhân gốc:
- `runtime_plain_text` bị clear / chưa được set đúng thời điểm
- Không có cơ chế hiển thị tạm cho self message
- `lastMessage` đang reuse message object → rò runtime state
- Không phân biệt message runtime của CHAT vs message snapshot cho CONVERSATION LIST

---

## 🔧 Giải pháp

### A. Fix Self Message (Rất quan trọng)

**Khi gửi tin nhắn từ thiết bị hiện tại**:
```javascript
// Thêm ui_optimistic_text ngay khi gửi
const optimisticMessage = {
    id: `temp-${Date.now()}-${Math.random()}`,
    conversation_id: conversationId,
    sender_id: user.id,
    content: null, // Ciphertext sẽ được set sau
    message_type: 'text',
    is_encrypted: true,
    is_sender_copy: true,
    sender_device_id: currentDeviceId,
    created_at: new Date().toISOString(),
    ui_optimistic_text: plainText, // UI-only field - hiển thị ngay
    sender: { id: user.id, name: user.name, image: user.image }
};

// Thêm vào state ngay để hiển thị
setMessages(prev => mergeMessages([...prev, optimisticMessage]));
```

**Khi message được confirm từ server**:
```javascript
// Realtime subscription nhận sender copy message
// Gỡ ui_optimistic_text và set runtime_plain_text
decryptedMessage = {
    ...messageWithSender,
    runtime_plain_text: decryptedContent,
    decrypted_on_device_id: deviceId,
    ui_optimistic_text: undefined, // Gỡ ui_optimistic_text
    decryption_error: false
};

// Tìm và gỡ optimistic message
const optimisticIndex = prev.findIndex(msg => 
    msg.ui_optimistic_text && 
    msg.sender_id === user.id &&
    Math.abs(new Date(msg.created_at).getTime() - new Date(decryptedMessage.created_at).getTime()) < 5000
);
```

**Đảm bảo**: Self message KHÔNG BAO GIỜ TRỐNG

### B. Render Message (Thứ tự bắt buộc)

**Thứ tự check**:
```javascript
{hasUiOptimisticText ? (
    // 1. ui_optimistic_text tồn tại → HIỂN THỊ ui_optimistic_text
    <Text>{message.ui_optimistic_text}</Text>
) : hasRuntimePlainText ? (
    // 2. runtime_plain_text và device ID match → HIỂN THỊ runtime_plain_text
    <Text>{message.runtime_plain_text}</Text>
) : (message.is_encrypted === true || message.decryption_error === true) ? (
    // 3. is_encrypted === true → HIỂN THỊ "Đã mã hóa đầu cuối"
    <Text>Đã mã hóa đầu cuối</Text>
) : (
    // 4. Plaintext message → HIỂN THỊ content
    <Text>{message.content}</Text>
)}
```

**TUYỆT ĐỐI KHÔNG ĐẢO THỨ TỰ**

### C. Last Message ngoài Conversation (Fix triệt để)

**Tạo snapshot, KHÔNG reuse message object**:
```javascript
const getLastMessage = (conversation) => {
    if (conversation.lastMessage) {
        // Tạo snapshot với chỉ các field cần thiết
        const snapshot = {
            id: lastMessage.id,
            conversation_id: lastMessage.conversation_id,
            sender_id: lastMessage.sender_id,
            sender_device_id: lastMessage.sender_device_id,
            message_type: lastMessage.message_type,
            is_encrypted: lastMessage.is_encrypted,
            is_sender_copy: lastMessage.is_sender_copy,
            content: lastMessage.content, // Ciphertext - bất biến
            encrypted_aes_key: lastMessage.encrypted_aes_key,
            encrypted_aes_key_by_pin: lastMessage.encrypted_aes_key_by_pin,
            created_at: lastMessage.created_at,
            // CHỈ copy runtime_plain_text nếu decrypted_on_device_id === currentDeviceId
        };
        
        return snapshot;
    }
    return { content: 'Chưa có tin nhắn', type: 'text' };
};
```

**Decrypt runtime (KHÔNG cache)**:
```javascript
// lastMessage là snapshot → không có runtime_plain_text từ trước
// PHẢI decrypt lại mỗi lần
if (isFromCurrentDevice) {
    // Decrypt luôn (không cần PIN)
    const decryptedContent = await encryptionService.decryptMessageWithDeviceKey(...);
    // Lưu vào runtime_plain_text (snapshot local)
    lastMessage.runtime_plain_text = decryptedContent;
    lastMessage.decrypted_on_device_id = currentDeviceId;
    return decryptedContent;
} else {
    // Cần PIN → decrypt nếu đã nhập PIN
    // ...
}
```

**Đảm bảo**:
- ✅ Không reuse message object từ chat state
- ✅ Snapshot chỉ có field cần thiết
- ✅ Decrypt runtime mỗi lần (không cache)

### D. Reload / Re-enter Conversation

**Clear TOÀN BỘ runtime state**:
```javascript
// Khi loadMessages()
const sanitizedMessages = res.data.map(msg => {
    const { runtime_plain_text, decrypted_on_device_id, ui_optimistic_text, ...cleanMessage } = msg;
    return {
        ...cleanMessage,
        runtime_plain_text: undefined,
        decrypted_on_device_id: undefined,
        ui_optimistic_text: undefined // Clear ui_optimistic_text
    };
});

// Khi thoát conversation (useEffect cleanup)
return () => {
    setMessages(prev => {
        return prev.map(msg => {
            const { runtime_plain_text, decrypted_on_device_id, ui_optimistic_text, ...cleanMessage } = msg;
            return {
                ...cleanMessage,
                runtime_plain_text: undefined,
                decrypted_on_device_id: undefined,
                ui_optimistic_text: undefined
            };
        });
    });
};
```

**Đảm bảo**:
- ✅ Treat toàn bộ encrypted message là CHƯA DECRYPT
- ✅ Decrypt lại theo device ID và PIN state

---

## ✅ Kết quả

### Trước khi fix:
- ❌ Self message: hiển thị TRỐNG
- ❌ Last message: đúng lúc đầu, sai khi có tin nhắn mới
- ❌ Quay ra vào lại: 2 thiết bị hiển thị giống nhau

### Sau khi fix:
- ✅ Self message: KHÔNG BAO GIỜ TRỐNG (dùng ui_optimistic_text)
- ✅ Realtime: đúng
- ✅ Quay ra vào lại: vẫn đúng
- ✅ Last message: đúng realtime + reload
- ✅ Thiết bị A và B: HIỂN THỊ KHÁC NHAU ĐÚNG E2EE
- ✅ Không rò plaintext
- ✅ Không render ciphertext

---

## 📝 Notes

### UI-only fields:
- `ui_optimistic_text`: Plaintext tạm cho self message (chỉ tồn tại trong RAM)
- `runtime_plain_text`: Plaintext đã decrypt (chỉ tồn tại trong RAM)
- `decrypted_on_device_id`: Device ID đã decrypt (để verify)

### Message gốc từ DB (bất biến):
- `content`: Ciphertext - **KHÔNG BAO GIỜ** ghi đè
- `is_encrypted`: Flag encryption
- `encrypted_aes_key`, `encrypted_aes_key_by_pin`: Keys

### Flow self message:
1. User gửi → Thêm `ui_optimistic_text` → Hiển thị ngay
2. Server confirm → Realtime nhận sender copy
3. Decrypt → Set `runtime_plain_text`, gỡ `ui_optimistic_text`
4. Render → Check `ui_optimistic_text` trước, sau đó `runtime_plain_text`

### Last message snapshot:
- Tạo snapshot mỗi lần `getLastMessage()`
- Không reuse message object từ chat state
- Decrypt runtime mỗi lần (không cache)
- Chỉ lưu `runtime_plain_text` vào snapshot local

### Bảo mật:
- ✅ Message gốc từ DB không bao giờ bị mutate
- ✅ Runtime state chỉ tồn tại trong RAM
- ✅ Mỗi thiết bị decrypt riêng theo device ID và PIN
- ✅ Không reuse plaintext giữa các thiết bị
- ✅ Snapshot tách biệt chat state và conversation list state












