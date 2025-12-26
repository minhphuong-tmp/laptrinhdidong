# Critical UI Bug Fix - Self Message Hiển Thị Border Trắng (Không Có Text)

## 📋 Tổng quan

Đã fix bug nghiêm trọng: Self message (tin nhắn do thiết bị hiện tại gửi) hiển thị bubble với border nhưng không có text bên trong.

---

## 🚨 Triệu chứng (Đã xác nhận)

- Bubble message **CÓ HIỂN THỊ KHUNG** (border / background)
- Nhưng **KHÔNG CÓ TEXT BÊN TRONG**
- Xảy ra cả khi:
  - Tin nhắn encrypted
  - Tin nhắn plaintext
  - Realtime message

---

## 🔍 Nguyên nhân gốc

### 1. Text đang render `undefined | null | ""`

**Vấn đề**:
- Logic render có thể return `undefined` hoặc `null`
- React Native vẫn render bubble nhưng text trống
- Không có guard để đảm bảo text luôn có giá trị

### 2. Thứ tự if/else đang sai

**Vấn đề**:
- Logic không tách riêng self message
- Self message có thể rơi vào nhánh không có text
- Không có fallback đặc biệt cho self message

### 3. Helper function không validate đủ

**Vấn đề**:
- `getSafeDisplayText()` có thể return `undefined` hoặc empty string
- Không check `typeof` và `trim()` đầy đủ

---

## 🔧 Fixes đã áp dụng

### A. Tách riêng logic self message (Rất quan trọng)

**Trước**:
```javascript
// Không phân biệt self message
if (hasUiOptimisticText) { ... }
if (hasRuntimePlainText) { ... }
if (canRender) { ... }
// Có thể rơi vào nhánh trống
```

**Sau**:
```javascript
// FIX CRITICAL UI BUG: Tách riêng logic self message
const isSelfMessage = message.sender_device_id === currentDeviceId;

if (isSelfMessage) {
    // Self message KHÔNG BAO GIỜ được trống
    if (hasUiOptimisticText) {
        return <Text>{message.ui_optimistic_text}</Text>;
    }
    if (hasRuntimePlainText) {
        return <Text>{message.runtime_plain_text}</Text>;
    }
    if (canRender && message.content?.trim()) {
        return <Text>{message.content}</Text>;
    }
    // Fallback: Self message luôn có text
    return <Text>Đang gửi...</Text>;
}

// Non-self message logic
```

**Đảm bảo**:
- ✅ Self message **KHÔNG BAO GIỜ** trống
- ✅ Có fallback "Đang gửi..." cho self message
- ✅ Tách riêng logic xử lý

### B. Ép buộc text luôn có giá trị (Guard render)

**Trước**:
```javascript
const displayText = getSafeDisplayText(message, currentDeviceId);
return <Text>{displayText}</Text>; // Có thể là undefined/null
```

**Sau**:
```javascript
const displayText = getSafeDisplayText(message, currentDeviceId);

// FIX CRITICAL UI BUG: Guard render - không render undefined/null/empty
if (!displayText || typeof displayText !== 'string' || displayText.trim() === '') {
    // ASSERT để bắt bug
    if (__DEV__) {
        console.error('[UI BUG] Empty displayText', {
            messageId: message.id,
            isSelfMessage,
            // ... debug info
        });
    }
    
    // Fallback: luôn có text
    return <View>...</View>; // "Đã mã hóa đầu cuối"
}

// Display text hợp lệ
return <Text>{displayText}</Text>;
```

**Đảm bảo**:
- ✅ Không bao giờ render `undefined` hoặc `null`
- ✅ Không bao giờ render empty string
- ✅ Có assert để debug trong dev mode

### C. Cải thiện helper function

**Trước**:
```javascript
export const getSafeDisplayText = (msg, currentDeviceId) => {
    if (msg.ui_optimistic_text !== null && msg.ui_optimistic_text !== undefined) {
        return msg.ui_optimistic_text; // Có thể là empty string
    }
    // ...
};
```

**Sau**:
```javascript
export const getSafeDisplayText = (msg, currentDeviceId) => {
    // 1. Ưu tiên: ui_optimistic_text (đảm bảo là string hợp lệ)
    if (msg.ui_optimistic_text !== null && 
        msg.ui_optimistic_text !== undefined &&
        typeof msg.ui_optimistic_text === 'string' &&
        msg.ui_optimistic_text.trim() !== '') {
        return msg.ui_optimistic_text;
    }

    // 2. runtime_plain_text (đảm bảo là string hợp lệ)
    if (msg.runtime_plain_text !== null &&
        msg.runtime_plain_text !== undefined &&
        typeof msg.runtime_plain_text === 'string' &&
        msg.runtime_plain_text.trim() !== '' &&
        msg.decrypted_on_device_id === currentDeviceId) {
        return msg.runtime_plain_text;
    }

    // 3. Plaintext (đảm bảo content là string hợp lệ)
    if (canRenderPlaintext(msg, currentDeviceId)) {
        if (msg.content && 
            typeof msg.content === 'string' && 
            msg.content.trim() !== '') {
            return msg.content;
        }
        return 'Đã mã hóa đầu cuối';
    }

    // 4. Fallback
    return 'Đã mã hóa đầu cuối';
};
```

**Đảm bảo**:
- ✅ Luôn check `typeof === 'string'`
- ✅ Luôn check `trim() !== ''`
- ✅ Luôn return string hợp lệ

### D. Validate hasUiOptimisticText và hasRuntimePlainText

**Trước**:
```javascript
const hasUiOptimisticText = message.ui_optimistic_text;
const hasRuntimePlainText = message.runtime_plain_text &&
    message.decrypted_on_device_id === currentDeviceId;
```

**Sau**:
```javascript
const hasUiOptimisticText = message.ui_optimistic_text && 
    typeof message.ui_optimistic_text === 'string' && 
    message.ui_optimistic_text.trim() !== '';

const hasRuntimePlainText = message.runtime_plain_text &&
    typeof message.runtime_plain_text === 'string' &&
    message.runtime_plain_text.trim() !== '' &&
    message.decrypted_on_device_id === currentDeviceId;
```

**Đảm bảo**:
- ✅ Không check truthy mà check type và content
- ✅ Tránh false positive với empty string

---

## ✅ Kết quả

### Trước khi fix:
- ❌ Self message: bubble có border nhưng text trống
- ❌ Không có guard để đảm bảo text luôn có giá trị
- ❌ Logic không tách riêng self message

### Sau khi fix:
- ✅ Self message: **LUÔN** có text (có fallback "Đang gửi...")
- ✅ Guard render: không bao giờ render `undefined/null/empty`
- ✅ Logic tách riêng: self message được xử lý đặc biệt
- ✅ Assert debug: log error trong dev mode nếu vẫn có empty text

---

## 📝 Notes

### Self Message Logic:

**Đặc biệt**:
- Self message = `sender_device_id === currentDeviceId`
- Self message **KHÔNG BAO GIỜ** được trống
- Fallback: "Đang gửi..." nếu chưa có text

**Thứ tự ưu tiên**:
1. `ui_optimistic_text` (nếu có)
2. `runtime_plain_text` (nếu có và device ID match)
3. `content` (nếu chắc chắn là plaintext)
4. **"Đang gửi..."** (fallback)

### Guard Render:

**Luôn check**:
- `!displayText` → empty/undefined/null
- `typeof displayText !== 'string'` → không phải string
- `displayText.trim() === ''` → empty string

**Nếu không pass**:
- Log error trong dev mode
- Return fallback UI (label "Đã mã hóa đầu cuối")

---

## 🚫 Cấm tuyệt đối

- ❌ Render `<Text>{undefined}</Text>`
- ❌ Render `<Text>{null}</Text>`
- ❌ Render `<Text>{""}</Text>`
- ❌ Self message không có text

---

## ✅ Được phép

- ✅ Render `<Text>{displayText}</Text>` (sau khi guard)
- ✅ Render fallback "Đang gửi..." cho self message
- ✅ Render label "Đã mã hóa đầu cuối" khi không decrypt được
- ✅ Log error trong dev mode để debug











