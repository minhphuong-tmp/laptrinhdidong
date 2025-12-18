# Fix Auto Scroll và Last Message Display

## 📋 Tổng quan

Đã fix 2 vấn đề chính:
1. **Auto Scroll trong Chat Screen** - Đảm bảo luôn đứng ở tin nhắn cuối khi vào chat
2. **Last Message Display trong Conversation List** - Hiển thị đúng theo trạng thái PIN và thiết bị

---

## 🔧 PHẦN A: AUTO SCROLL (CHAT SCREEN)

### Vấn đề trước đây:
- ❌ Không đứng sẵn ở tin nhắn cuối khi vào chat
- ❌ Scroll chạy khi layout chưa render xong
- ❌ Sau khi decrypt message (đổi height item) thì scroll bị lệch
- ❌ FlatList render từ đầu danh sách nên scrollToEnd không chính xác

### Giải pháp đã áp dụng:

#### 1. **Sử dụng InteractionManager + requestAnimationFrame**

```javascript
const handleScrollToEnd = () => {
    if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
    }

    // Sử dụng InteractionManager để đợi tất cả interactions hoàn thành
    // Sau đó dùng requestAnimationFrame để đảm bảo layout đã render xong
    InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
            if (!isUserScrollingRef.current && isNearBottom && flatListRef.current) {
                flatListRef.current.scrollToEnd({ animated: true });
            }
        });
    });
};
```

**Lý do**:
- `InteractionManager.runAfterInteractions()`: Đợi tất cả animations/interactions hoàn thành
- `requestAnimationFrame()`: Đảm bảo scroll chạy sau khi layout render xong
- Đảm bảo scroll chính xác xuống cuối, kể cả khi decrypt làm thay đổi height

#### 2. **onContentSizeChange trigger scroll**

```javascript
<FlatList
    onContentSizeChange={handleScrollToEnd}
    // ...
/>
```

**Lý do**:
- `onContentSizeChange` trigger khi FlatList content size thay đổi
- Đảm bảo scroll sau khi:
  - Messages load xong (content size thay đổi)
  - Messages decrypt xong (height item thay đổi)
  - Messages mới đến (content size thay đổi)

#### 3. **Reset flags khi vào chat**

```javascript
useEffect(() => {
    if (messages.length > 0 && !loading) {
        // Reset flag khi messages thay đổi (cho phép auto scroll)
        isUserScrollingRef.current = false;
        setIsNearBottom(true); // Reset về true - đảm bảo scroll xuống cuối
        
        handleScrollToEnd();
    }
}, [messages, loading]);
```

**Lý do**:
- Reset flags khi messages load xong
- Đảm bảo scroll xuống cuối khi vào chat lần đầu

---

## 🔧 PHẦN B: LAST MESSAGE DISPLAY (CONVERSATION LIST)

### Logic mới:

#### 1. **Check sender_device_id trước khi check PIN**

```javascript
const getLastMessageContent = async (lastMessage, conversationId) => {
    // ...
    
    if (lastMessage.is_sender_copy === true && lastMessage.is_encrypted === true) {
        const deviceService = require('../../services/deviceService').default;
        const currentDeviceId = await deviceService.getOrCreateDeviceId();
        const senderDeviceId = lastMessage.sender_device_id;

        // QUAN TRỌNG: Check sender_device_id trước khi check PIN
        const isFromCurrentDevice = senderDeviceId === currentDeviceId;

        if (isFromCurrentDevice) {
            // Tin nhắn từ thiết bị của chính mình → decrypt luôn (không cần PIN)
            const decryptedContent = await encryptionService.decryptMessageWithDeviceKey(...);
            if (decryptedContent) {
                lastMessage.plainText = decryptedContent;
                return decryptedContent;
            }
        } else {
            // Tin nhắn từ thiết bị khác → cần PIN
            const isUnlocked = pinService.isUnlocked();
            if (!isUnlocked) {
                return 'Đã mã hóa đầu cuối';
            }
            // Đã nhập PIN → decrypt
            const decryptedContent = await encryptionService.decryptMessageWithDeviceKey(...);
            if (decryptedContent) {
                lastMessage.plainText = decryptedContent;
                return decryptedContent;
            }
        }
        
        return 'Đã mã hóa đầu cuối';
    }
};
```

**Logic**:
1. **Tin nhắn từ thiết bị của chính mình** (`sender_device_id === currentDeviceId`):
   - ✅ Decrypt luôn (không cần PIN)
   - ✅ Hiển thị plain text

2. **Tin nhắn từ thiết bị khác** (`sender_device_id !== currentDeviceId`):
   - Chưa nhập PIN → "Đã mã hóa đầu cuối"
   - Đã nhập PIN → Decrypt và hiển thị plain text

#### 2. **Hàm resolveLastMessageText()**

```javascript
const resolveLastMessageText = (lastMessage, conversationId) => {
    if (!lastMessage) return 'Chưa có tin nhắn';

    // Xử lý call_end, call_declined
    if (lastMessage.message_type === 'call_end' || lastMessage.message_type === 'call_declined') {
        // ...
    }

    // Xử lý media
    if (lastMessage.message_type === 'image') return '📷 Hình ảnh';
    if (lastMessage.message_type === 'video') return '🎥 Video';

    // Xử lý text
    if (lastMessage.message_type === 'text') {
        // Không encrypted → hiển thị content
        if (!lastMessage.is_encrypted) {
            return lastMessage.content || 'Chưa có tin nhắn';
        }

        // Encrypted sender_copy
        if (lastMessage.is_encrypted && lastMessage.is_sender_copy) {
            // Sử dụng decryptedMessages nếu đã decrypt
            if (decryptedMessages[conversationId] && decryptedMessages[conversationId] !== 'Đã mã hóa đầu cuối') {
                return decryptedMessages[conversationId];
            }
            // Có plainText → hiển thị
            if (lastMessage.plainText) {
                return lastMessage.plainText;
            }
            // Chưa decrypt → "Đã mã hóa đầu cuối"
            return 'Đã mã hóa đầu cuối';
        }

        // Receiver message (plaintext)
        return lastMessage.content || 'Chưa có tin nhắn';
    }

    // Fallback: check ciphertext format
    const content = lastMessage.content || 'Chưa có tin nhắn';
    if (lastMessage.is_encrypted && content.length > 50 && content.includes(':')) {
        return 'Đã mã hóa đầu cuối'; // Không hiển thị ciphertext
    }
    return content;
};
```

**Đảm bảo**:
- ✅ Không bao giờ hiển thị ciphertext
- ✅ Hiển thị đúng theo logic thiết bị và PIN
- ✅ Fallback an toàn

#### 3. **processLastMessages() check device ID**

```javascript
const processLastMessages = async () => {
    const deviceService = require('../../services/deviceService').default;
    const currentDeviceId = await deviceService.getOrCreateDeviceId();

    await Promise.all(
        conversations.map(async (conversation) => {
            const lastMessage = getLastMessage(conversation);
            if (lastMessage.is_encrypted && lastMessage.is_sender_copy) {
                const isFromCurrentDevice = lastMessage.sender_device_id === currentDeviceId;
                
                // Thiết bị khác và chưa PIN → không decrypt
                if (!isFromCurrentDevice && !pinService.isUnlocked()) {
                    processedMap[conversation.id] = 'Đã mã hóa đầu cuối';
                } else {
                    // Decrypt (thiết bị của mình hoặc đã nhập PIN)
                    const content = await getLastMessageContent(lastMessage, conversation.id);
                    if (content !== 'Đã mã hóa đầu cuối') {
                        lastMessage.plainText = content;
                    }
                    processedMap[conversation.id] = content;
                }
            }
        })
    );
};
```

---

## ✅ Kết quả

### Auto Scroll:
- ✅ Luôn đứng ở tin nhắn cuối khi vào chat
- ✅ Scroll chính xác sau khi decrypt (không bị lệch)
- ✅ Không interrupt user khi scroll tay
- ✅ Hoạt động tốt trên thiết bị yếu

### Last Message Display:
- ✅ Tin nhắn từ thiết bị của chính mình → hiển thị plain text (không cần PIN)
- ✅ Tin nhắn từ thiết bị khác, chưa PIN → "Đã mã hóa đầu cuối"
- ✅ Tin nhắn từ thiết bị khác, đã PIN → plain text
- ✅ Không bao giờ hiển thị ciphertext

---

## 📝 Notes

### Thresholds có thể điều chỉnh:
- `distanceFromEnd < 100`: Có thể tăng lên 150px nếu muốn auto scroll rộng hơn
- `windowSize={5}`: Có thể tăng lên 10 nếu thiết bị mạnh hơn

### Bảo mật:
- ✅ Logic chỉ ảnh hưởng UI display
- ✅ Không thay đổi encryption/decryption logic
- ✅ Không lưu plain text vào DB
- ✅ Chỉ decrypt khi cần thiết (thiết bị của mình hoặc đã nhập PIN)












