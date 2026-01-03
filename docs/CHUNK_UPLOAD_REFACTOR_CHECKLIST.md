# Checklist: Refactor Toàn Bộ Luồng Upload Ảnh/Video (Binary Only)

## 🚨 CORE RULES (BẮT BUỘC TUÂN THỦ)

- ❌ **KHÔNG BASE64** - Loại bỏ hoàn toàn base64
- ✅ **CHỈ DÙNG BINARY** - Blob / Uint8Array / ArrayBuffer
- ✅ **File ≤ 5MB**: Upload trực tiếp 1 Blob
- ✅ **File > 5MB**: Chia chunk và upload song song
- ✅ **Tối ưu memory**: Không giữ toàn bộ file trong RAM
- ✅ **Chunk upload song song**: Giới hạn MAX_PARALLEL_UPLOADS
- ✅ **Server merge streaming**: Merge chunks theo thứ tự, append từng chunk

---

## 🔄 LUỒNG MỚI (CHUẨN)

```
sendMediaMessage()
 └─ uploadMediaFile(file)
      ├─ if file.size <= 5MB
      │     └─ uploadBlob(file.uri) → Binary upload
      └─ else
            └─ uploadChunkParallel(file.uri)
                   ├─ fetch(uri) → Blob
                   ├─ blob.slice(start, end) → Chunk
                   ├─ upload chunk (binary, parallel)
                   ├─ GC chunk
                   └─ repeat (parallel, max 10)
            └─ gọi Edge Function merge-chunks
            └─ trả về final media URL
```

---

## ✅ CHECKLIST CHI TIẾT

### 📁 1. SERVICES/CHUNKSERVICE.JS (MỚI – BẮT BUỘC TÁCH RIÊNG)

#### 1.1. Tạo File Mới
- [ ] **Tạo `services/chunkService.js`**
  - File mới chứa toàn bộ logic chunk upload
  - **KHÔNG** đặt logic chunk trong `chatService.js`
  - Export các functions cần thiết

#### 1.2. Binary File Loader
- [x] **Tạo `getFileBlob(fileUri): Promise<Blob>`** ✅ ĐÃ HOÀN THÀNH
  - Dùng `fetch(fileUri).then(res => res.blob())`
  - **❌ KHÔNG** dùng `readAsStringAsync` với base64
  - **❌ KHÔNG** dùng string
  - Trả về Blob trực tiếp
  - **File**: `services/chatService.js` (tạm thời, sẽ chuyển sang chunkService.js sau)

#### 1.3. Chunk Metadata Calculator
- [x] **Tạo `getChunkMetadata(fileSize, chunkSize)`** ✅ ĐÃ HOÀN THÀNH
  - Chỉ tính toán metadata: `{ index, start, end, size }`
  - **❌ KHÔNG** đọc file
  - **❌ KHÔNG** tạo chunk data
  - Trả về array of metadata
  - **File**: `services/chatService.js` (tạm thời, sẽ chuyển sang chunkService.js sau)

#### 1.4. Upload Single Chunk (Binary)
- [ ] **Tạo `uploadSingleChunk(blobChunk, fileId, chunkIndex, totalChunks)`**
  - `blobChunk`: Blob slice (từ `blob.slice(start, end)`)
  - Upload trực tiếp Blob lên Supabase Storage
  - Path: `temp/chunks/{fileId}/chunk_{index}`
  - Upload binary, **❌ KHÔNG** encode base64
  - Retry 3 lần với exponential backoff
  - Trả về path của chunk đã upload
  - **File**: `services/chunkService.js`

#### 1.5. Upload Chunks Song Song (Parallel)
- [ ] **Tạo `uploadChunksParallel(fileUri, fileId, onProgress)`**
  - Load file thành Blob: `await getFileBlob(fileUri)`
  - Tính toán chunk metadata: `getChunkMetadata(fileSize, chunkSize)`
  - Dùng `blob.slice(start, end)` cho từng chunk
  - Upload song song với Promise pool / semaphore
  - Giới hạn `MAX_PARALLEL_UPLOADS` (10 chunks)
  - **❌ KHÔNG** lưu chunks vào array
  - Sau upload xong chunk → release reference để GC
  - Callback `onProgress(progress)` để update UI (0-80%)
  - **File**: `services/chunkService.js`

#### 1.6. Merge Chunks (Gọi Edge Function)
- [ ] **Tạo `mergeChunksOnServer(fileId, totalChunks, finalPath, fileType)`**
  - Gọi Supabase Edge Function `merge-chunks`
  - Truyền: `fileId`, `totalChunks`, `finalPath`, `fileType`
  - Server merge theo thứ tự: chunk_0 → chunk_n
  - Server append streaming (không load toàn bộ)
  - Đợi merge hoàn tất (polling hoặc await)
  - Trả về final public URL
  - **File**: `services/chunkService.js`

#### 1.7. Wrapper API
- [ ] **Tạo `uploadMediaFileChunked(file, type, onProgress)`**
  - Wrapper function điều phối toàn bộ flow
  - Flow:
    1. Tạo `fileId` unique
    2. Check file size: `file.fileSize <= 5MB`?
    3. Nếu ≤ 5MB: Upload Blob trực tiếp (không chunk)
    4. Nếu > 5MB:
       - `uploadChunksParallel(file.uri, fileId, onProgress)`
       - `mergeChunksOnServer(fileId, totalChunks, finalPath, type)`
    5. Trả về media URL
  - Callback `onProgress(progress)` để update UI (0-100%)
  - **File**: `services/chunkService.js`

#### 1.8. Constants & Config
- [ ] **Định nghĩa constants**
  - `CHUNK_SIZE = 2 * 1024 * 1024` (2MB)
  - `MAX_PARALLEL_UPLOADS = 10` (cố định cho file > 5MB)
  - `CHUNK_UPLOAD_THRESHOLD = 5 * 1024 * 1024` (5MB)
  - `CHUNK_RETRY_ATTEMPTS = 3`
  - **File**: `services/chunkService.js`

#### 1.9. Export Functions
- [ ] **Export các functions**
  - `uploadMediaFileChunked`
  - `getFileBlob`
  - `getChunkMetadata`
  - `uploadSingleChunk`
  - `uploadChunksParallel`
  - `mergeChunksOnServer`
  - Constants: `CHUNK_SIZE`, `MAX_PARALLEL_UPLOADS`, `CHUNK_UPLOAD_THRESHOLD`
  - **File**: `services/chunkService.js`

---

### 📁 2. SERVICES/CHATSERVICE.JS (CẬP NHẬT)

#### 2.1. ❌ XÓA HOÀN TOÀN
- [x] **Xóa `splitFileIntoChunks()` cũ** - Đã refactor dùng Blob ✅
- [x] **Xóa `extractChunkFromBase64()`** - Đã xóa ✅
- [x] **Xóa logic base64 trong splitFileIntoChunks** ✅
  - Đã thay `readAsStringAsync` với base64 → `fetch().blob()`
  - Đã xóa `decode(base64)`
  - Đã xóa encode/decode base64
  - **File**: `services/chatService.js` ✅
- [x] **Xóa logic base64 trong uploadMediaFile (file < 5MB)** ✅ ĐÃ HOÀN THÀNH
  - Đã thay `readAsStringAsync` với base64 → `getFileBlob()` (fetch().blob())
  - Đã xóa `decode(base64)`
  - Đã thay bằng `fileBlob.arrayBuffer()` để upload
  - **File**: `services/chatService.js` ✅

#### 2.2. ✅ CẬP NHẬT
- [ ] **Import chunkService**
  ```javascript
  import { uploadMediaFileChunked } from './chunkService';
  ```
  - **File**: `services/chatService.js`

- [ ] **Cập nhật `uploadMediaFile()` - Binary Only**
  - Check file size: `file.fileSize <= CHUNK_UPLOAD_THRESHOLD`
  - Nếu ≤ 5MB: Upload Blob trực tiếp (không base64)
  - Nếu > 5MB: Gọi `uploadMediaFileChunked(file, type, onProgress)`
  - **❌ KHÔNG** dùng base64 cho file nhỏ
  - **❌ KHÔNG** dùng `readAsStringAsync` với base64
  - Dùng `fetch(file.uri).blob()` cho file nhỏ
  - **File**: `services/chatService.js`

#### 2.3. Upload Blob Trực Tiếp (File ≤ 5MB)
- [x] **Cập nhật `uploadMediaFile()` - Upload Blob trực tiếp** ✅ ĐÃ HOÀN THÀNH
  - Load file thành Blob: `await getFileBlob(fileUri)`
  - Convert Blob thành ArrayBuffer: `await fileBlob.arrayBuffer()`
  - Upload ArrayBuffer trực tiếp lên Supabase Storage
  - **❌ KHÔNG** encode base64
  - **❌ KHÔNG** decode base64
  - Upload binary trực tiếp
  - Trả về public URL
  - **File**: `services/chatService.js` ✅

---

### 📁 3. APP/(MAIN)/CHAT.JSX (UI)

#### 3.1. Cập Nhật sendMediaMessage
- [x] **Xóa test code chia chunk** ✅ ĐÃ HOÀN THÀNH
- [ ] **Cập nhật `sendMediaMessage()`**
  - Gọi `uploadMediaFile(file, type)` (đã có binary logic)
  - Truyền callback `onProgress` để update UI
  - **File**: `app/(main)/chat.jsx`

#### 3.2. Thêm Progress UI
- [ ] **Thêm state cho upload progress**
  ```javascript
  const [uploadProgress, setUploadProgress] = useState(0);
  ```
  - **File**: `app/(main)/chat.jsx`

- [ ] **Thêm Progress Bar Component**
  - Hiển thị progress bar khi đang upload
  - Hiển thị % và tốc độ upload
  - Update realtime khi upload song song
  - **File**: `app/(main)/chat.jsx`

- [ ] **Update progress trong callback**
  ```javascript
  onProgress={(progress) => setUploadProgress(progress)}
  ```
  - **File**: `app/(main)/chat.jsx`

---

### 📁 4. SUPABASE EDGE FUNCTION - MERGE-CHUNKS

#### 4.1. Tạo Edge Function
- [ ] **Tạo file `supabase/functions/merge-chunks/index.ts`**
  - TypeScript Edge Function
  - **File**: `supabase/functions/merge-chunks/index.ts`

#### 4.2. Implement Merge Logic (Streaming)
- [ ] **Nhận parameters từ request**
  - `fileId`: ID của file
  - `totalChunks`: Tổng số chunks
  - `finalPath`: Path cuối cùng của file đã merge
  - `fileType`: 'image' hoặc 'video'

- [ ] **Download và merge chunks theo thứ tự (streaming)**
  - **❌ KHÔNG** download tất cả chunks vào memory
  - Download chunk_0 → append vào output buffer/file → GC
  - Download chunk_1 → append vào output buffer/file → GC
  - Lặp lại cho tất cả chunks theo thứ tự (chunk_0 → chunk_n)
  - **Stream append** từng chunk vào output file/buffer
  - Chỉ giữ 1 chunk trong memory tại một thời điểm

- [ ] **Upload file đã merge**
  - Upload output file/buffer lên `finalPath` trong bucket `media`
  - Set content-type phù hợp
  - **❌ KHÔNG** cần load toàn bộ file vào memory

- [ ] **Cleanup temp chunks**
  - Xóa từng chunk sau khi đã append (hoặc xóa tất cả sau khi merge xong)
  - Xóa folder temp nếu rỗng

- [ ] **Trả về kết quả**
  - Trả về public URL của file đã merge
  - Trả về error nếu có

#### 4.3. Error Handling
- [ ] **Xử lý lỗi download chunk**
- [ ] **Xử lý lỗi merge**
- [ ] **Xử lý lỗi upload**
- [ ] **Xử lý lỗi cleanup**

---

### 📁 5. ERROR HANDLING & CLEANUP

#### 5.1. Error Handling
- [ ] **Xử lý lỗi load Blob**
  - Retry với exponential backoff
  - Log chi tiết để debug

- [ ] **Xử lý lỗi upload chunk**
  - Retry từng chunk riêng lẻ (retry ngay tại chỗ)
  - **❌ KHÔNG** lưu chunk vào array để retry sau
  - Nếu retry fail, cleanup temp chunks đã upload

- [ ] **Xử lý lỗi merge**
  - Cleanup temp chunks nếu merge fail
  - Cleanup output file/buffer nếu có
  - Trả về error message rõ ràng

#### 5.2. Cleanup Logic
- [ ] **Cleanup temp chunks khi upload fail**
  - Xóa tất cả chunks đã upload nếu có lỗi
  - Gọi cleanup function

- [ ] **Cleanup temp chunks khi merge fail**
  - Xóa chunks trong Edge Function nếu merge fail

---

### 📁 6. TESTING

#### 6.1. Unit Tests
- [ ] **Test `getFileBlob()`**
  - Test load file thành Blob
  - Verify KHÔNG có base64
  - Verify trả về Blob object

- [ ] **Test `getChunkMetadata()`**
  - Test tính toán metadata đúng
  - Verify KHÔNG đọc file

- [ ] **Test `uploadSingleChunk()`**
  - Test upload Blob chunk thành công
  - Test upload với Blob slice
  - Test retry khi fail
  - Verify KHÔNG encode base64

- [ ] **Test `uploadChunksParallel()`**
  - Test load Blob và slice chunks
  - Test upload song song có giới hạn (max 10)
  - Test với file có nhiều chunks
  - Test retry logic
  - Verify memory usage (tối đa 10 chunks)
  - Verify KHÔNG có array chứa chunks

#### 6.2. Integration Tests
- [ ] **Test toàn bộ flow với file nhỏ (< 5MB)**
  - Phải upload Blob trực tiếp (không chunk)
  - Verify KHÔNG có base64
  - Verify upload thành công

- [ ] **Test toàn bộ flow với file trung bình (5-20MB)**
  - Phải dùng chunk upload
  - Verify file upload thành công
  - Verify KHÔNG có base64
  - Verify KHÔNG có array chứa chunks
  - Verify memory usage (tối đa 10 chunks)

- [ ] **Test toàn bộ flow với file lớn (> 20MB)**
  - Phải dùng chunk upload
  - Verify không crash app
  - Verify memory usage (không tăng theo số chunks, tối đa 10 chunks)
  - Verify chunk upload xong → GC ngay
  - Verify server merge streaming (không load toàn bộ vào memory)

#### 6.3. Edge Cases
- [ ] **Test với mạng chậm**
  - Verify retry logic hoạt động
  - Verify progress update đúng

- [ ] **Test với mạng bị ngắt**
  - Verify cleanup temp chunks
  - Verify error message

- [ ] **Test với file corrupt**
  - Verify error handling

#### 6.4. Verify No Base64
- [ ] **Grep toàn bộ codebase**
  - Verify KHÔNG còn `readAsStringAsync` với base64
  - Verify KHÔNG còn `encode`/`decode` base64 cho file
  - Verify KHÔNG còn string xử lý file data

---

### 📁 7. LOGGING & METRICS

#### 7.1. Logging
- [ ] **Log thời gian load Blob**
- [ ] **Log thời gian slice chunks**
- [ ] **Log thời gian upload từng chunk**
- [ ] **Log tổng thời gian upload**
- [ ] **Log số lần retry**
- [ ] **Log memory usage**

#### 7.2. Metrics
- [ ] **So sánh performance với upload cũ**
  - Thời gian upload
  - Memory usage
  - Tốc độ upload

---

### 📁 8. DOCUMENTATION

#### 8.1. Code Comments
- [ ] **Comment tất cả functions mới**
- [ ] **Comment logic phức tạp**
- [ ] **Comment edge cases**
- [ ] **Comment về binary-only approach**

#### 8.2. README/Guide
- [ ] **Cập nhật README với flow mới**
- [ ] **Document cách sử dụng**
- [ ] **Document troubleshooting**
- [ ] **Document binary-only approach**

---

## 🎯 PRIORITY ORDER

### Phase 1: Core Binary Functions (Bắt buộc)
1. ✅ Tạo `services/chunkService.js` - File mới
2. ✅ Tạo `getFileBlob()` - Load file thành Blob (KHÔNG base64)
3. ✅ Tạo `getChunkMetadata()` - Tính toán metadata
4. ✅ Tạo `uploadSingleChunk()` - Upload Blob chunk (binary)
5. ✅ Tạo `uploadChunksParallel()` - Upload song song (Blob slice)
6. ✅ Tạo `uploadBlobDirect()` - Upload Blob trực tiếp cho file nhỏ
7. ✅ Tạo `uploadMediaFileChunked()` - Wrapper function

### Phase 2: Integration (Quan trọng)
8. ✅ Xóa toàn bộ base64 logic trong `chatService.js`
9. ✅ Import và sử dụng `chunkService.js` trong `chatService.js`
10. ✅ Cập nhật `uploadMediaFile()` - Binary only
11. ✅ Cập nhật `sendMediaMessage()` - Sử dụng flow mới
12. ✅ Thêm Progress UI - Hiển thị progress

### Phase 3: Server Merge (Cần thiết)
13. ✅ Tạo Edge Function `merge-chunks`
14. ✅ Implement merge streaming logic
15. ✅ Implement cleanup logic

### Phase 4: Error Handling (Cần thiết)
16. ✅ Retry logic cho chunks
17. ✅ Cleanup temp chunks
18. ✅ Error messages rõ ràng

### Phase 5: Testing & Optimization (Tùy chọn)
19. ✅ Unit tests
20. ✅ Integration tests
21. ✅ Verify no base64
22. ✅ Metrics và logging

---

## 📝 NOTES

- **❌ KHÔNG BASE64**: Tất cả upload phải dùng binary (Blob/Uint8Array)
- **✅ CHỈ DÙNG BINARY**: Blob cho file, Blob.slice() cho chunks
- **✅ Tách service riêng**: Logic chunk phải ở `chunkService.js`
- **✅ Memory efficient**: Tối đa 10 chunks trong memory cùng lúc
- **✅ Read tuần tự, upload song song**: Load Blob → slice → upload parallel
- **✅ Server streaming**: Download và merge chunks theo thứ tự, stream append
- **✅ File nhỏ**: Upload Blob trực tiếp (không chunk)
- **✅ File lớn**: Chunk upload song song → merge trên server
- **Không xóa code cũ ngay**: Giữ lại để rollback nếu cần
- **Test từng bước**: Test từng function trước khi integrate
- **Monitor memory**: Đảm bảo không crash app với file lớn
- **Backup**: Commit code trước khi thay đổi lớn

---

## ✅ CHECKLIST SUMMARY

- [ ] **ChunkService (Mới)**: 9 tasks
- [ ] **ChatService (Cập nhật)**: 3 tasks
- [ ] **UI Layer**: 3 tasks
- [ ] **Edge Function**: 3 tasks
- [ ] **Error Handling**: 2 tasks
- [ ] **Testing**: 4 categories
- [ ] **Logging**: 2 tasks
- [ ] **Documentation**: 2 tasks

**Tổng cộng**: ~28+ tasks cần hoàn thành

---

## 🚨 CORE RULES REMINDER

- ❌ **KHÔNG BASE64** - Loại bỏ hoàn toàn
- ✅ **CHỈ DÙNG BINARY** - Blob / Uint8Array / ArrayBuffer
- ✅ **File ≤ 5MB**: Upload Blob trực tiếp
- ✅ **File > 5MB**: Blob.slice() → chunk upload song song
- ✅ **Memory efficient**: Tối đa 10 chunks trong memory
- ✅ **Server streaming**: Merge chunks theo thứ tự, append từng chunk
- ✅ **Tách service**: Logic chunk ở `chunkService.js`

---

## ✅ ĐÃ HOÀN THÀNH

- [x] **Có logic check file size** (5MB threshold) ✅
- [x] **Có logging cho chunks** ✅
- [x] **Xóa test code trong sendMediaMessage** ✅
- [x] **Set MAX_PARALLEL_UPLOADS = 10** ✅
- [x] **Log file size và chunks cho cả image và video** ✅

## ❌ CHƯA HOÀN THÀNH

- [ ] **Tạo chunkService.js** - Chưa có
- [ ] **Loại bỏ base64** - Vẫn đang dùng base64
- [ ] **Dùng Blob thay vì base64** - Chưa implement
- [ ] **Upload chunks song song** - Chưa implement
- [ ] **Edge Function merge-chunks** - Chưa có
- [ ] **Upload Blob trực tiếp cho file nhỏ** - Vẫn dùng base64

