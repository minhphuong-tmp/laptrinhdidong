# E2EE Render Architecture Fix - Tiêu Chuẩn Hiển Thị Text (Bắt Buộc)

## 📋 Tổng quan

Đã sửa lại hoàn toàn logic render message và last message theo **tiêu chuẩn hiển thị text bắt buộc**, loại bỏ dependency vào flag `is_encrypted` không đáng tin.

---

## 🎯 Tiêu chuẩn hiển thị text (Bắt buộc)

### CHỈ render plaintext khi:

1. **Có `runtime_plain_text`** (đã decrypt, device ID match)
2. **HOẶC có `ui_optimistic_text`** (self message vừa gửi)
3. **HOẶC message được xác định chắc chắn là plaintext**:
   - Không có metadata encryption (`encrypted_aes_key`, `encrypted_aes_key_by_pin`)
   - Content không phải ciphertext format
   - Content không rỗng

### Mọi trường hợp còn lại:

- **KHÔNG** render `content` trực tiếp
- Render label cố định: **"Đã mã hóa đầu cuối"**
- **KHÔNG BAO GIỜ** render bubble trống

---

## 🔧 Thay đổi chính

### A. Tạo Helper Functions mới (`utils/messageValidation.js`)

#### 1. `canRenderPlaintext(msg, currentDeviceId)`

**Mục đích**: Kiểm tra message có ĐƯỢC PHÉP render plaintext không

**Logic**:
- ✅ Có `runtime_plain_text` và device ID match → ĐƯỢC PHÉP
- ✅ Có `ui_optimistic_text` → ĐƯỢC PHÉP
- ✅ Không có metadata encryption + không phải ciphertext format + content không rỗng → ĐƯỢC PHÉP
- ❌ Tất cả trường hợp còn lại → KHÔNG ĐƯỢC PHÉP

#### 2. `getSafeDisplayText(msg, currentDeviceId)`

**Mục đích**: Lấy text an toàn để hiển thị

**Thứ tự**:
1. `ui_optimistic_text`
2. `runtime_plain_text` (nếu device ID match)
3. Plaintext content (nếu `canRenderPlaintext` return true)
4. **"Đã mã hóa đầu cuối"** (fallback)

---

### B. Sửa Logic Render Message (`chat.jsx`)

#### Trước:
```javascript
if (message.is_encrypted === true || message.decryption_error === true) {
    // Hiển thị "Đã mã hóa đầu cuối"
} else {
    // Render content trực tiếp → CÓ THỂ LÀ CIPHERTEXT!
}
```

#### Sau:
```javascript
// 1. ui_optimistic_text
if (hasUiOptimisticText) {
    return message.ui_optimistic_text;
}

// 2. runtime_plain_text
if (hasRuntimePlainText) {
    return message.runtime_plain_text;
}

// 3. Kiểm tra có được phép render plaintext không
if (canRenderPlaintext(message, currentDeviceId)) {
    return message.content;
}

// 4. Tất cả trường hợp còn lại → label "Đã mã hóa đầu cuối"
return "Đã mã hóa đầu cuối";
```

**Đảm bảo**:
- ✅ Không bao giờ render ciphertext
- ✅ Không bao giờ render bubble trống
- ✅ Không phụ thuộc `is_encrypted` flag

---

### C. Sửa Logic Last Message (`chatList.jsx`)

#### `resolveLastMessageText()`:

**Trước**:
```javascript
if (!lastMessage.is_encrypted) {
    return lastMessage.content; // CÓ THỂ LÀ CIPHERTEXT!
}
```

**Sau**:
```javascript
// Sử dụng decryptedMessages (đã decrypt trong processLastMessages)
if (decryptedMessages[conversationId] && ...) {
    return decryptedMessages[conversationId];
}

// Check runtime_plain_text trong snapshot
if (lastMessage.runtime_plain_text && ...) {
    return lastMessage.runtime_plain_text;
}

// Sử dụng helper để lấy text an toàn
return getSafeDisplayText(lastMessage, null);
```

#### `getLastMessageContent()`:

**Trước**:
```javascript
if (!lastMessage.is_encrypted) {
    return lastMessage.content; // CÓ THỂ LÀ CIPHERTEXT!
}
```

**Sau**:
```javascript
// Kiểm tra có được phép render plaintext không
if (canRenderPlaintext(lastMessage, null)) {
    return lastMessage.content;
}

// Nếu encrypted và là sender_copy → decrypt
if (lastMessage.is_sender_copy === true && isActuallyEncrypted) {
    // Decrypt và return runtime_plain_text
}

// Tất cả trường hợp còn lại → label
return 'Đã mã hóa đầu cuối';
```

**Đảm bảo**:
- ✅ Không render content trực tiếp nếu không chắc chắn
- ✅ Không phụ thuộc `is_encrypted` flag
- ✅ Sử dụng `isMessageActuallyEncrypted()` để check

---

## ✅ Kết quả

### Trước khi fix:
- ❌ Message bubble: hiển thị khung trắng (ciphertext không được detect)
- ❌ Last message: hiển thị ciphertext
- ❌ Logic render: phụ thuộc `is_encrypted` flag (không đáng tin)

### Sau khi fix:
- ✅ Message bubble: **KHÔNG BAO GIỜ** trống (có fallback label)
- ✅ Last message: **KHÔNG** hiển thị ciphertext
- ✅ Logic render: **KHÔNG** phụ thuộc `is_encrypted` flag
- ✅ Sử dụng helper functions để check chính xác
- ✅ Tiêu chuẩn hiển thị text rõ ràng, bắt buộc

---

## 📝 Notes

### Không được dùng `is_encrypted` làm điều kiện chính:

**Lý do**:
- Flag này không đáng tin
- Có message: `is_encrypted=false` nhưng `content` là ciphertext
- Dùng `is_encrypted` → UI render ciphertext → bug

**Giải pháp**:
- Sử dụng `isMessageActuallyEncrypted()` (check metadata + format)
- Sử dụng `canRenderPlaintext()` để check có được phép render không
- Sử dụng `getSafeDisplayText()` để lấy text an toàn

### Render Logic Thứ tự (Bắt buộc):

1. `ui_optimistic_text` (self message vừa gửi)
2. `runtime_plain_text` (đã decrypt, device ID match)
3. Plaintext content (chỉ khi `canRenderPlaintext` return true)
4. **"Đã mã hóa đầu cuối"** (fallback - KHÔNG BAO GIỜ render bubble trống)

---

## 🚫 Cấm tuyệt đối

- ❌ Render `content` trực tiếp mà không check
- ❌ Dùng `is_encrypted` flag làm điều kiện chính
- ❌ Render bubble trống
- ❌ Assume `content` là plaintext

---

## ✅ Được phép

- ✅ Render `runtime_plain_text` (đã verify device ID)
- ✅ Render `ui_optimistic_text`
- ✅ Render plaintext content (chỉ sau khi `canRenderPlaintext` return true)
- ✅ Render label "Đã mã hóa đầu cuối" (fallback)











