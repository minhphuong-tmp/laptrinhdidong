# 📋 CHECKLIST: Thumbnail Preview cho Upload Media

## 🎯 Mục tiêu
Hiển thị thumbnail preview ngay khi bắt đầu upload để tạo cảm giác upload nhanh hơn cho người dùng.

---

## ✅ Đã hoàn thành

### 1. ✅ Cài đặt thư viện
- [x] `expo-image-manipulator` - Để resize image thành thumbnail
- [x] `react-native-create-thumbnail` - Để tạo thumbnail từ video

**Command đã chạy:**
```bash
npx expo install expo-image-manipulator
npm install react-native-create-thumbnail
```

---

### 2. ✅ Tạo functions trong `services/chunkService.js`

#### `createThumbnailFromFile(fileUri, type)`
- Tạo thumbnail từ image hoặc video
- Image: Resize về width 300px với `expo-image-manipulator`
- Video: Lấy frame tại giây thứ 1 với `react-native-create-thumbnail`
- Return: `{ uri, width, height }`

#### `uploadThumbnail(thumbnailUri, fileId, type)`
- Upload thumbnail lên Supabase Storage
- Path: `thumbnails/{fileId}.jpg`
- Return: `{ success, thumbnailUrl, error }`

---

### 3. ✅ Update `uploadChunksParallel()` trong `services/chunkService.js`

**Thay đổi:**
- Thêm parameter `fileType` và `onPreviewReady`
- Tạo và upload thumbnail TRƯỚC khi upload chunks
- Gọi `onPreviewReady(thumbnailUrl)` khi thumbnail đã sẵn sàng
- Không block upload nếu thumbnail fail

**Flow:**
1. Tạo thumbnail từ file
2. Upload thumbnail lên Storage
3. Gọi `onPreviewReady` với thumbnail URL
4. Tiếp tục upload chunks như bình thường

---

### 4. ✅ Update `uploadMediaFile()` trong `services/chatService.js`

**Thay đổi:**
- Thêm parameter `onPreviewReady = null`
- Truyền `fileType` và `onPreviewReady` vào `uploadChunksParallel()`

**Chỉ áp dụng cho files >= 5MB (chunk upload)**

---

### 5. ✅ Update `sendMediaMessage()` trong `app/(main)/chat.jsx`

**Thay đổi:**
- Tạo `handlePreviewReady` callback
- Tạo optimistic message với `is_preview: true` và `thumbnail_url`
- Thêm preview message vào UI ngay khi nhận thumbnail
- Xóa preview message khi:
  - Upload thành công → thay thế bằng final message
  - Upload fail → xóa preview message
  - Gửi message fail → xóa preview message

**Preview message structure:**
```javascript
{
    id: `preview_${Date.now()}`,
    conversation_id: conversationId,
    sender_id: user.id,
    content: type === 'image' ? '📷 Hình ảnh' : '🎥 Video',
    message_type: type,
    file_url: thumbnailUrl,
    thumbnail_url: thumbnailUrl,
    is_preview: true,
    created_at: new Date().toISOString(),
    sender: { ... }
}
```

---

### 6. ✅ Update UI `renderMessage()` trong `app/(main)/chat.jsx`

**Thay đổi:**

#### Image:
- Check `message.is_preview`
- Dùng `message.thumbnail_url || message.file_url` nếu là preview
- Hiển thị overlay "Đang tải lên..." nếu là preview

#### Video:
- Check `message.is_preview`
- Nếu preview: Hiển thị `Image` với thumbnail + overlay "Đang tải lên..."
- Nếu không preview: Hiển thị `Video` như bình thường
- Không cho phép play video nếu đang là preview

#### Styles:
- Thêm `previewOverlay`: Overlay với background rgba(0,0,0,0.5)
- Thêm `previewText`: Text "Đang tải lên..." màu trắng

---

## 📊 Kết quả

### Lợi ích:
1. ✅ **Perceived Performance**: Người dùng thấy preview ngay (< 1s) → cảm giác upload nhanh hơn
2. ✅ **Better UX**: Biết được file đang upload, không phải chờ đợi mù quáng
3. ✅ **Non-blocking**: Thumbnail fail không ảnh hưởng đến upload chunks

### Flow hoàn chỉnh:
```
User chọn file (> 5MB)
    ↓
Tạo thumbnail (< 1s)
    ↓
Upload thumbnail (< 1s)
    ↓
Hiển thị preview message với thumbnail (NGAY LẬP TỨC)
    ↓
Upload chunks song song (background)
    ↓
Merge chunks trên server
    ↓
Thay thế preview bằng final message với full file URL
```

---

## 🧪 Testing Checklist

- [ ] Upload image < 5MB → Không có preview (direct upload)
- [ ] Upload image >= 5MB → Có preview thumbnail
- [ ] Upload video >= 5MB → Có preview thumbnail
- [ ] Preview hiển thị ngay (< 2s)
- [ ] Preview được thay thế bằng final message khi upload xong
- [ ] Preview bị xóa nếu upload fail
- [ ] Thumbnail fail không block upload chunks
- [ ] Video preview không cho phép play

---

## 📝 Notes

- Thumbnail size: ~50-100KB (nhanh upload)
- Thumbnail path: `thumbnails/{fileId}.jpg`
- Preview chỉ áp dụng cho files >= 5MB (chunk upload)
- Files < 5MB upload trực tiếp, không có preview

---

**Hoàn thành:** 2025-01-XX





