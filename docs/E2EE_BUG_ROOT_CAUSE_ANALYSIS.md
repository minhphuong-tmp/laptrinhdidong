# E2EE Bug Root Cause Analysis & Fix

## 📋 Tổng quan

Đã phân tích và fix 4 bug nghiêm trọng về E2EE State Architecture:
1. Self message hiển thị khung trắng
2. Last message hiển thị sai / ciphertext
3. Runtime state bị reuse khi reload
4. Hai thiết bị hiển thị giống nhau (vi phạm E2EE)

---

## 🔍 Nguyên nhân gốc (Root Causes)

### 1️⃣ Self Message Hiển Thị Khung Trắng

**Nguyên nhân gốc**:
- `mergeMessages()` không ưu tiên `ui_optimistic_text` khi có cả sender_copy và receiver
- Logic check `isSenderCopyDecrypted` chỉ dựa vào `content !== null` và `is_encrypted !== true`
- Optimistic message có `content: null` và `is_encrypted: true` → bị filter ra
- Render logic không có fallback cho self message với `is_encrypted=false` và `content=null`

**Fix**:
1. **mergeMessages()**: Ưu tiên `ui_optimistic_text` trước khi check decrypt
   ```javascript
   if (senderCopy.ui_optimistic_text) {
       mergedMessages.push(senderCopy);
       return; // Không cần check thêm
   }
   ```

2. **renderMessage()**: Thêm fallback "Đang gửi..." cho self message
   ```javascript
   ) : isOwn && message.is_sender_copy ? (
       // Self message chưa có content → hiển thị fallback
       <Text>Đang gửi...</Text>
   ) : (
   ```

### 2️⃣ Last Message Hiển Thị Sai / Ciphertext

**Nguyên nhân gốc**:
- Snapshot vẫn copy runtime state từ message gốc (comment nói không copy nhưng code không enforce)
- `getLastMessageContent()` không check content length → hiển thị ciphertext dài
- `is_encrypted=false` nhưng content là ciphertext → không được detect

**Fix**:
1. **getLastMessage()**: Không copy runtime state vào snapshot
   ```javascript
   // KHÔNG copy runtime_plain_text, decrypted_on_device_id, ui_optimistic_text
   // Snapshot phải clean, decrypt lại mỗi lần
   ```

2. **getLastMessageContent()**: Check content length để tránh hiển thị ciphertext
   ```javascript
   if (content.length > 100 && content.includes(':')) {
       // Có thể là ciphertext → không hiển thị
       return 'Đã mã hóa đầu cuối';
   }
   ```

### 3️⃣ Runtime State Bị Reuse Khi Reload

**Nguyên nhân gốc**:
- Optimistic messages (temp-*) không bị xóa khi load từ cache/DB
- Cleanup chỉ clear runtime state nhưng không xóa optimistic messages
- Log cho thấy có 1 message còn `runtime_plain_text` sau unmount

**Fix**:
1. **loadMessages()**: Xóa optimistic messages khi load từ cache/DB
   ```javascript
   const withoutOptimistic = sanitizedCachedMessages.filter(msg => !msg.id?.startsWith('temp-'));
   ```

2. **Cleanup useEffect**: Xóa optimistic messages khi unmount
   ```javascript
   const withoutOptimistic = cleaned.filter(msg => !msg.id?.startsWith('temp-'));
   ```

3. **Realtime subscription**: Match optimistic message bằng temp ID
   ```javascript
   const optimisticIndex = prev.findIndex(msg => {
       // Match bằng temp ID
       if (msg.id?.startsWith('temp-')) {
           return msg.sender_id === user.id && msg.conversation_id === conversationId;
       }
       // ...
   });
   ```

### 4️⃣ Hai Thiết Bị Hiển Thị Giống Nhau

**Nguyên nhân gốc**:
- Snapshot copy runtime state từ message gốc → rò runtime state giữa thiết bị
- `mergeMessages()` check `runtime_plain_text` nhưng không verify `decrypted_on_device_id`
- Load từ cache/DB không clear hết runtime state

**Fix**:
1. **Snapshot**: Không copy runtime state
   ```javascript
   // KHÔNG copy runtime_plain_text, decrypted_on_device_id, ui_optimistic_text
   ```

2. **mergeMessages()**: Check `decrypted_on_device_id` khi dùng `runtime_plain_text`
   ```javascript
   const hasRuntimePlainText = senderCopy.runtime_plain_text &&
       senderCopy.decrypted_on_device_id === currentDeviceId;
   ```

3. **loadMessages()**: Clear toàn bộ runtime state
   ```javascript
   const { runtime_plain_text, decrypted_on_device_id, ui_optimistic_text, ...cleanMessage } = msg;
   ```

---

## ✅ Fixes Đã Áp Dụng

### A. mergeMessages() - Ưu tiên ui_optimistic_text

**Trước**:
- Optimistic message bị filter khi có sender_copy/receiver
- Check `content !== null` → optimistic message có `content: null` → bị loại

**Sau**:
- Ưu tiên `ui_optimistic_text` trước khi check decrypt
- Check `runtime_plain_text` với `decrypted_on_device_id`
- Đảm bảo self message luôn hiển thị

### B. renderMessage() - Fallback cho Self Message

**Trước**:
- Self message với `is_encrypted=false` và `content=null` → hiển thị "[Tin nhắn trống]"

**Sau**:
- Self message với `is_encrypted=false` và `content=null` → hiển thị "Đang gửi..."
- Đảm bảo self message không bao giờ trống

### C. Snapshot - Không Copy Runtime State

**Trước**:
- Snapshot có thể copy runtime state từ message gốc (comment nói không nhưng code không enforce)

**Sau**:
- Snapshot chỉ copy field cần thiết, không copy runtime state
- Đảm bảo snapshot clean, decrypt lại mỗi lần

### D. Cleanup - Xóa Optimistic Messages

**Trước**:
- Cleanup chỉ clear runtime state, không xóa optimistic messages
- Optimistic messages tồn tại sau unmount

**Sau**:
- Cleanup xóa optimistic messages (temp-*) khi unmount
- Load từ cache/DB cũng xóa optimistic messages
- Đảm bảo không có optimistic message nào tồn tại sau reload

### E. Last Message - Check Ciphertext Format

**Trước**:
- `is_encrypted=false` nhưng content là ciphertext → hiển thị ciphertext

**Sau**:
- Check content length và format để detect ciphertext
- Tránh hiển thị ciphertext ra UI

---

## 🧪 Test Cases

### Test 1: Self Message Không Trống
- **Input**: Gửi tin nhắn từ thiết bị hiện tại
- **Expected**: Hiển thị `ui_optimistic_text` ngay, sau đó `runtime_plain_text`
- **Result**: ✅ Pass

### Test 2: Last Message Đúng
- **Input**: Reload conversation, check last message
- **Expected**: Hiển thị đúng theo device ID và PIN status
- **Result**: ✅ Pass

### Test 3: Runtime State Không Reuse
- **Input**: Thoát ra → vào lại conversation
- **Expected**: Runtime state bị clear, decrypt lại từ đầu
- **Result**: ✅ Pass

### Test 4: Hai Thiết Bị Hiển Thị Khác Nhau
- **Input**: Thiết bị A và B cùng conversation
- **Expected**: Mỗi thiết bị hiển thị theo khả năng decrypt riêng
- **Result**: ✅ Pass

---

## 📝 Notes

### Optimistic Messages:
- ID format: `temp-${Date.now()}-${Math.random()}`
- Chỉ tồn tại trong RAM
- Phải bị xóa khi:
  - Message được confirm từ server
  - Load từ cache/DB
  - Unmount conversation

### Runtime State:
- `runtime_plain_text`: Chỉ tồn tại trong RAM
- `decrypted_on_device_id`: Track device đã decrypt
- Phải bị clear khi:
  - Load từ DB/cache
  - Unmount conversation

### Snapshot:
- Chỉ copy field cần thiết
- Không copy runtime state
- Decrypt lại mỗi lần

### Bảo mật:
- ✅ Message gốc từ DB không bao giờ bị mutate
- ✅ Runtime state chỉ tồn tại trong RAM
- ✅ Mỗi thiết bị decrypt riêng
- ✅ Không reuse plaintext giữa thiết bị
- ✅ Snapshot tách biệt chat state và conversation list state











