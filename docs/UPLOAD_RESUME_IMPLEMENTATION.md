# 📋 Danh Sách Các Bước Thực Hiện: Resume Upload Khi App Quay Lại

## 🎯 Mục Tiêu
Tự động resume upload chunks khi người dùng quay lại ứng dụng, không cần NetInfo, chỉ dùng AppState listener.

---

## 📝 CÁC BƯỚC THỰC HIỆN

### **BƯỚC 1: Tạo Upload Resume Service**
**File:** `services/uploadResumeService.js`

**Nội dung:**
- Tạo class `UploadResumeService` với các methods:
  - `initialize()`: Load state từ AsyncStorage, setup AppState listener
  - `saveChunkUploadState()`: Lưu state khi bắt đầu upload (fileId, fileUri, totalChunks, metadata)
  - `updateUploadedChunks()`: Cập nhật danh sách chunks đã upload
  - `clearUploadState()`: Xóa state khi upload xong
  - `listChunksInStorage()`: List tất cả chunks trong storage folder
  - `resumeUpload()`: Logic chính để resume upload
  - `setupAppStateListener()`: Setup listener khi app active

**Key Storage Keys:**
- `pending_upload_state`: Lưu state upload hiện tại

---

### **BƯỚC 2: Thêm Hàm List Chunks Trong Storage**
**File:** `services/uploadResumeService.js`

**Function:** `listChunksInStorage(fileId)`

**Logic:**
1. Gọi Supabase Storage API: `list('temp/chunks/{fileId}/')`
2. Parse kết quả để lấy danh sách chunks: `chunk_0`, `chunk_1`, `chunk_2`, ...
3. Extract index từ tên file: `chunk_0` → index = 0
4. Return array: `[{index: 0, path: 'temp/chunks/xxx/chunk_0'}, ...]`

**Lưu ý:**
- Handle error nếu folder không tồn tại
- Filter chỉ lấy files có pattern `chunk_{number}`

---

### **BƯỚC 3: Implement Logic Resume Upload**
**File:** `services/uploadResumeService.js`

**Function:** `resumeUpload()`

**Các bước:**
1. Load state từ AsyncStorage
2. Check xem có state không → nếu không có thì return
3. List chunks trong storage: `listChunksInStorage(fileId)`
4. So sánh chunks:
   - Chunks trong storage: `[0, 1, 3, 5]`
   - Chunks cần upload: `[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]`
   - Chunks còn thiếu: `[2, 4, 6, 7, 8, 9]`
5. Upload chunks còn thiếu:
   - Load file thành Blob
   - Upload chỉ các chunks còn thiếu (cần modify hoặc tạo hàm mới)
6. Sau khi upload xong → merge chunks
7. Update database → clear state

---

### **BƯỚC 4: Tạo Hàm Upload Chunks Còn Thiếu**
**File:** `services/chunkService.js` hoặc `services/uploadResumeService.js`

**Function:** `uploadRemainingChunks(fileUri, fileId, remainingIndices, totalChunks, mimeType)`

**Logic:**
1. Load file thành Blob
2. Tính toán chunk metadata cho các indices còn lại
3. Upload song song các chunks còn thiếu (dùng logic tương tự `uploadChunksParallel`)
4. Return: `{success: true, uploadedChunks: [...]}`

**Lưu ý:**
- Có thể tái sử dụng `uploadSingleChunk` từ chunkService
- Chỉ upload chunks có index trong `remainingIndices`

---

### **BƯỚC 5: Cập Nhật documentService.uploadDocumentFile**
**File:** `services/documentService.js`

**Thay đổi:**
1. Import `uploadResumeService`
2. Khi bắt đầu chunk upload (file >= 5MB):
   - Gọi `uploadResumeService.saveChunkUploadState()` để lưu state
3. Sau mỗi chunk upload xong:
   - Gọi `uploadResumeService.updateUploadedChunks([newChunk])` để cập nhật
4. Sau khi merge xong:
   - Gọi `uploadResumeService.clearUploadState()` để xóa state

**Vị trí code:**
- Trong hàm `uploadDocumentFile`, phần chunk upload (sau dòng tạo fileId)

---

### **BƯỚC 6: Setup AppState Listener**
**File:** `services/uploadResumeService.js`

**Function:** `setupAppStateListener()`

**Logic:**
1. Dùng `AppState.addEventListener('change', callback)`
2. Khi `nextAppState === 'active'`:
   - Load lại state từ AsyncStorage
   - Gọi `resumeUpload()` nếu có state

**Lưu ý:**
- Lưu reference của listener để cleanup sau
- Check `isResuming` flag để tránh resume nhiều lần cùng lúc

---

### **BƯỚC 7: Khởi Tạo Service Trong App**
**File:** `app/_layout.jsx` hoặc `app/(main)/UploadDocument.jsx`

**Option 1: Global (khuyến nghị)**
- Trong `_layout.jsx`:
  - Import `uploadResumeService`
  - `useEffect(() => { uploadResumeService.initialize(); }, [])`
  - Cleanup: `return () => { uploadResumeService.cleanup(); }`

**Option 2: Local (chỉ trong UploadDocument)**
- Trong `UploadDocument.jsx`:
  - `useEffect(() => { uploadResumeService.initialize(); }, [])`

---

### **BƯỚC 8: Xử Lý Edge Cases**

**8.1. File URI không còn hợp lệ:**
- Check file tồn tại trước khi resume
- Nếu không tồn tại → clear state và báo lỗi

**8.2. Chunks bị corrupt hoặc không đầy đủ:**
- Verify chunk size sau khi list
- Nếu chunk size không đúng → xóa và upload lại

**8.3. Max retry attempts:**
- Giới hạn số lần resume (ví dụ: 3 lần)
- Nếu quá max → clear state và báo lỗi

**8.4. Concurrent resume:**
- Dùng flag `isResuming` để tránh resume nhiều lần cùng lúc

---

### **BƯỚC 9: Testing**

**Test Cases:**
1. **Upload file lớn → thoát app giữa chừng → vào lại:**
   - Verify: Resume upload chunks còn lại
   - Verify: Merge chunks sau khi đủ
   - Verify: Update database

2. **Upload file lớn → thoát app khi đang upload chunk 5/10:**
   - Verify: Chỉ upload chunks 6-10 khi resume
   - Verify: Không upload lại chunks 1-5

3. **Upload file lớn → thoát app khi đã upload hết chunks nhưng chưa merge:**
   - Verify: Chỉ gọi merge, không upload lại chunks

4. **Upload file lớn → thoát app → xóa file gốc → vào lại:**
   - Verify: Clear state và báo lỗi file không tồn tại

5. **Upload nhiều files cùng lúc → thoát app:**
   - Verify: Chỉ resume file đang upload (state cuối cùng)

---

## 🔧 CẤU TRÚC STATE TRONG ASYNCSTORAGE

```json
{
  "type": "chunk_upload",
  "fileId": "1234567890_abc123",
  "fileUri": "file:///path/to/file.pdf",
  "fileSize": 15728640,
  "fileName": "document.pdf",
  "uploaderId": "user-uuid",
  "totalChunks": 8,
  "uploadedChunks": [
    {"index": 0, "path": "temp/chunks/1234567890_abc123/chunk_0"},
    {"index": 1, "path": "temp/chunks/1234567890_abc123/chunk_1"},
    {"index": 2, "path": "temp/chunks/1234567890_abc123/chunk_2"}
  ],
  "finalPath": "documents/user-uuid/document.pdf",
  "metadata": {
    "title": "Document Title",
    "description": "Description",
    "category": "Lý thuyết",
    "tags": ["tag1", "tag2"],
    "isPublic": true,
    "documentId": null // Sẽ được set sau khi tạo document record
  },
  "createdAt": 1234567890,
  "resumeAttempts": 0
}
```

---

## 📊 FLOW DIAGRAM

```
[User bắt đầu upload]
    ↓
[Lưu state vào AsyncStorage]
    ↓
[Upload chunks song song]
    ↓
[User thoát app giữa chừng]
    ↓
[App quay lại (AppState = 'active')]
    ↓
[Load state từ AsyncStorage]
    ↓
[List chunks trong storage]
    ↓
[So sánh: chunks cần vs chunks có]
    ↓
[Upload chunks còn thiếu]
    ↓
[Merge chunks khi đủ]
    ↓
[Update database]
    ↓
[Clear state]
```

---

## ✅ CHECKLIST

- [ ] Bước 1: Tạo uploadResumeService.js
- [ ] Bước 2: Thêm hàm listChunksInStorage
- [ ] Bước 3: Implement resumeUpload logic
- [ ] Bước 4: Tạo hàm uploadRemainingChunks
- [ ] Bước 5: Cập nhật documentService.uploadDocumentFile
- [ ] Bước 6: Setup AppState listener
- [ ] Bước 7: Khởi tạo service trong app
- [ ] Bước 8: Xử lý edge cases
- [ ] Bước 9: Testing

---

## 🚀 BẮT ĐẦU IMPLEMENT

Bắt đầu từ **Bước 1**: Tạo service cơ bản với các hàm initialize, save state, clear state.

Sau đó implement từng bước một, test sau mỗi bước để đảm bảo hoạt động đúng.




