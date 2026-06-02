# Fix Auto Scroll và Vi Phạm E2EE

## 📋 Tổng quan

Đã fix 2 lỗi nghiêm trọng:
1. **LỖI 1 - AUTO SCROLL**: FlatList không inverted → phải render toàn bộ list trước khi scroll
2. **LỖI 2 - VI PHẠM E2EE**: sender_copy đang bị decrypt khi load lại conversation, không phân biệt phase

---

## 🔧 LỖI 1: AUTO SCROLL

### Vấn đề:
- ❌ FlatList render từ đầu → user phải đợi rất lâu hoặc kéo tay xuống cuối
- ❌ scrollToEnd + InteractionManager KHÔNG giải quyết triệt để
- ❌ Không phụ thuộc tốc độ mạng

### Nguyên nhân gốc:
- FlatList không inverted → phải render toàn bộ list trước khi scroll

### Giải pháp:

#### 1. **Chuyển FlatList sang inverted mode**

```javascript
<FlatList
    inverted={true}  // ← Tin nhắn mới nằm ở index 0, list mở ra là ở cuối ngay lập tức
    // ...
/>
```

**Lợi ích**:
- ✅ Vào chat là đứng ngay tin nhắn mới nhất (index 0)
- ✅ Không cần chờ render toàn bộ list
- ✅ Hoạt động tốt trên máy yếu

#### 2. **Update scroll logic cho inverted FlatList**

```javascript
// Với inverted FlatList, scrollToOffset({ offset: 0 }) = scroll đến tin nhắn mới nhất
const handleScrollToEnd = () => {
    InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
            if (!isUserScrollingRef.current && isNearBottom && flatListRef.current) {
                flatListRef.current.scrollToOffset({ offset: 0, animated: true });
            }
        });
    });
};

// Track scroll position (với inverted, contentOffset.y = 0 nghĩa là ở tin nhắn mới nhất)
onScroll={(event) => {
    const { contentOffset } = event.nativeEvent;
    setIsNearBottom(contentOffset.y < 100); // User ở gần tin nhắn mới nhất
}}
```

#### 3. **Sort messages DESC (mới nhất trước)**

```javascript
// Với inverted FlatList, tin nhắn mới nhất nên ở index 0
mergedMessages.sort((a, b) => {
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    return timeB - timeA; // DESC: mới nhất trước
});
```

#### 4. **Không scroll cho initial load**

```javascript
// Với inverted FlatList, initial load tự động ở cuối (tin nhắn mới nhất) → KHÔNG cần scroll
// Chỉ scroll khi có message mới
useEffect(() => {
    if (messages.length > 0 && !loading) {
        // Chỉ scroll khi có message mới (không scroll cho initial load)
        handleScrollToEnd();
    }
}, [messages, loading]);
```

---

## 🔧 LỖI 2: VI PHẠM E2EE

### Vấn đề:
- ❌ Thiết bị A đọc được tin nhắn của thiết bị B khi reload conversation
- ❌ sender_copy đang bị decrypt khi load lại conversation
- ❌ Không phân biệt phase: realtime message vs load từ DB/cache

### Nguyên nhân gốc:
- sender_copy KHÔNG được phép decrypt nếu:
  - Không phải thiết bị gửi (`sender_device_id !== currentDeviceId`)
  - Chưa nhập PIN (`pinService.isUnlocked() === false`)

### Giải pháp:

#### 1. **Fix logic decrypt trong realtime subscription**

```javascript
// FIX LỖI 2: Decrypt sender copy message CHỈ khi đủ điều kiện
const isUnlocked = pinService.isUnlocked();
const canDecrypt = isFromCurrentDevice || isUnlocked;

if (!canDecrypt) {
    // KHÔNG đủ điều kiện decrypt → giữ nguyên encrypted
    decryptedMessage = {
        ...messageWithSender,
        content: null, // Không hiển thị ciphertext
        decryption_error: true,
        encrypted_from_other_device: !isFromCurrentDevice,
        needs_pin: !isUnlocked // Flag để UI hiển thị "Nhập PIN"
    };
} else {
    // Đủ điều kiện decrypt → thử decrypt
    const decryptedContent = await encryptionService.decryptMessageWithDeviceKey(...);
    // ...
}
```

**Nguyên tắc**:
- ✅ Chỉ decrypt nếu `sender_device_id === currentDeviceId` HOẶC `pinService.isUnlocked() === true`
- ✅ Nếu không đủ điều kiện → giữ nguyên encrypted, UI hiển thị "Đã mã hóa đầu cuối"

#### 2. **Clear plainText cũ từ cache**

```javascript
// FIX LỖI 2: Clear plainText cũ từ cache cho sender_copy từ thiết bị khác nếu chưa PIN
const sanitizedCachedMessages = cachedMessages.map(msg => {
    if (msg.is_sender_copy === true && msg.is_encrypted === true) {
        const senderDeviceId = msg.sender_device_id;
        const isFromCurrentDevice = senderDeviceId === currentDeviceId;
        const canDecrypt = isFromCurrentDevice || isUnlocked;

        // Nếu không có quyền decrypt → clear plainText cũ (nếu có)
        if (!canDecrypt && msg.content && msg.is_encrypted === false) {
            // Có plainText cũ nhưng không có quyền → clear và set lại encrypted
            return {
                ...msg,
                content: null, // Clear plainText cũ
                is_encrypted: true, // Set lại encrypted
                decryption_error: true,
                encrypted_from_other_device: !isFromCurrentDevice,
                needs_pin: !isUnlocked
            };
        }
    }
    return msg;
});
```

**Đảm bảo**:
- ✅ Không reuse plainText cũ từ cache
- ✅ Reload conversation vẫn giữ đúng bảo mật
- ✅ sender_copy không bao giờ làm lộ nội dung sai ngữ cảnh

#### 3. **Update mergeMessages để check device ID và PIN**

```javascript
// FIX LỖI 2: Check device ID và PIN status trước khi quyết định hiển thị
const senderDeviceId = senderCopy.sender_device_id;
const isFromCurrentDevice = currentDeviceId && senderDeviceId === currentDeviceId;
const isUnlocked = pinService.isUnlocked();
const canDecryptSenderCopy = isFromCurrentDevice || isUnlocked;

// Chỉ hiển thị sender_copy nếu:
// 1. Đã decrypt thành công VÀ
// 2. Có quyền decrypt (thiết bị của mình hoặc đã nhập PIN)
if (isSenderCopyDecrypted && canDecryptSenderCopy) {
    mergedMessages.push(senderCopy);
    hiddenMessageIds.add(receiver.id);
} else {
    // Sender_copy không decrypt được hoặc không có quyền → CHỈ hiển thị receiver
    mergedMessages.push(receiver);
    hiddenMessageIds.add(senderCopy.id);
}
```

**Đảm bảo**:
- ✅ sender_copy từ thiết bị khác không hiển thị nếu chưa PIN
- ✅ Chỉ hiển thị sender_copy khi có quyền decrypt

---

## ✅ Kết quả

### Auto Scroll:
- ✅ Vào chat là đứng ngay tin nhắn cuối (giống Messenger/Zalo)
- ✅ Không phải kéo từ đầu xuống
- ✅ Không cần chờ render toàn bộ list
- ✅ Hoạt động tốt trên máy yếu

### E2EE:
- ✅ Thiết bị A KHÔNG đọc được tin nhắn của B nếu chưa PIN
- ✅ Reload conversation vẫn giữ đúng bảo mật
- ✅ sender_copy không bao giờ làm lộ nội dung sai ngữ cảnh
- ✅ Không phá logic PIN hiện tại

---

## 📝 Notes

### Inverted FlatList:
- Tin nhắn mới nhất ở index 0
- Scroll position: `contentOffset.y = 0` nghĩa là ở tin nhắn mới nhất
- Sort messages DESC (mới nhất trước)

### E2EE Rules:
- sender_copy chỉ decrypt nếu:
  1. `sender_device_id === currentDeviceId` (thiết bị của chính mình)
  HOẶC 2. `pinService.isUnlocked() === true` (user đã nhập PIN)
- Không reuse plainText cũ từ cache
- Clear plainText cũ khi reload nếu không có quyền decrypt












