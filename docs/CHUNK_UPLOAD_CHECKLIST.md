# Checklist: Thay Đổi Toàn Bộ Luồng Chunk Upload

## 📋 Tổng Quan

Thay đổi từ upload file nguyên bản → upload theo chunks với streaming và parallel uploads.

## 🚨 CORE RULES (BẮT BUỘC):
- **KHÔNG BASE64 trong upload** - Chỉ dùng binary/ArrayBuffer trực tiếp
- **KHÔNG lưu danh sách chunks vào array** - Không tạo array chứa tất cả chunks
- **Read tuần tự, upload song song có giới hạn** - Đọc từng chunk một, upload song song nhưng tối đa MAX_PARALLEL_UPLOADS chunks
- **Tối đa N chunks trong memory cùng lúc** - N = MAX_PARALLEL_UPLOADS (cố định 10 cho file > 5MB), chỉ giữ chunks đang upload
- **Chunk upload xong → GC ngay** - Chunk upload xong → xóa khỏi memory ngay → có thể đọc chunk tiếp theo
- **Download chunks theo thứ tự** - Trên server, download và merge chunks theo thứ tự (chunk_0, chunk_1, ...)
- **Stream append từng chunk vào output buffer/file** - Trên server, append từng chunk vào file output, không load toàn bộ vào memory
- **KHÔNG giữ toàn bộ file trong memory** - Tối đa N chunks trong memory (N = MAX_PARALLEL_UPLOADS)
- **chatService không chứa logic chunk** - Tách ra service riêng (chunkService.js)
- **Chunk reader trả binary, không string** - Trả về ArrayBuffer/Uint8Array, không phải base64 string

---

## 🔄 Luồng Hiện Tại vs Luồng Mới

### Luồng Hiện Tại:
```
1. splitFileIntoChunks() - Chỉ để test/log (đọc toàn bộ file → base64)
2. uploadMediaFile() - Đọc lại file → base64 → decode toàn bộ → upload toàn bộ
```

### Luồng Mới:
```
1. ChunkReader đọc file theo chunks (streaming) - đọc từng chunk, trả binary
2. Đọc tuần tự từng chunk → upload song song (tối đa 10 chunks cho file > 5MB)
3. Chunk upload xong → GC ngay → có thể đọc chunk tiếp theo
4. Merge chunks trên server (Edge Function) - download theo thứ tự, stream append
5. Trả về URL file đã merge
```

**Điểm khác biệt:**
- ❌ KHÔNG dùng base64
- ❌ KHÔNG lưu danh sách chunks vào array
- ✅ Đọc tuần tự (1 chunk tại một thời điểm)
- ✅ Upload song song có giới hạn (tối đa 10 chunks cho file > 5MB)
- ✅ Tối đa 10 chunks trong memory cùng lúc (cho file > 5MB)
- ✅ Chunk upload xong → GC ngay → có thể đọc chunk tiếp theo
- ✅ Download và merge tuần tự trên server
- ✅ Stream append (không load toàn bộ vào memory)
- ✅ Logic chunk tách riêng service

---

## ✅ CHECKLIST CHI TIẾT

### 📁 1. SERVICES/CHUNKSERVICE.JS (MỚI - Tách riêng)

#### 1.1. Tạo File Mới
- [ ] **Tạo `services/chunkService.js`**
  - File mới chứa toàn bộ logic chunk upload
  - **KHÔNG** đặt trong `chatService.js`

#### 1.2. Tạo ChunkReader Class/Module
- [ ] **Tạo `ChunkReader` class**
  - Đọc file theo chunks tuần tự (streaming)
  - **Trả về binary (ArrayBuffer/Uint8Array)**, KHÔNG phải base64 string
  - Chỉ giữ 1 chunk trong memory tại một thời điểm
  - **File**: `services/chunkService.js`

- [ ] **Method `readChunk(fileUri, start, end)`**
  - Đọc file từ byte `start` đến `end`
  - Trả về `Promise<ArrayBuffer>` hoặc `Promise<Uint8Array>`
  - **KHÔNG** trả về base64 string
  - Sử dụng native file APIs (react-native-fs hoặc expo-file-system với offset)
  - **File**: `services/chunkService.js`

- [ ] **Method `getChunkMetadata(file, chunkSize)`**
  - Tính toán số chunks cần thiết
  - Tạo metadata cho từng chunk (index, start, end, size)
  - **Không đọc file**, chỉ tính toán
  - Trả về array of metadata
  - **File**: `services/chunkService.js`

#### 1.3. Tạo Hàm Upload Chunk (Binary)
- [ ] **Tạo `uploadSingleChunk(chunkData, chunkIndex, fileId, totalChunks)`**
  - `chunkData`: ArrayBuffer hoặc Uint8Array (binary, KHÔNG base64)
  - Upload 1 chunk lên Supabase Storage
  - Path: `temp/chunks/{fileId}/chunk_{index}`
  - Upload trực tiếp binary, KHÔNG encode base64
  - Trả về path của chunk đã upload
  - Có retry logic (3 lần với exponential backoff)
  - **File**: `services/chunkService.js`

#### 1.4. Tạo Hàm Upload Song Song Có Giới Hạn (Binary)
- [ ] **Tạo `uploadChunksParallel(chunkReader, chunkMetadata, fileId, onProgress)`**
  - Đọc tuần tự từng chunk từ `chunkReader`
  - Upload song song nhưng tối đa **10 chunks** (cố định cho file > 5MB)
  - **KHÔNG** lưu chunks vào array (chỉ giữ chunks đang upload)
  - Tối đa **10 chunks** trong memory cùng lúc (cho file > 5MB)
  - Chunk upload xong → GC ngay → có thể đọc chunk tiếp theo
  - Sử dụng semaphore/queue để giới hạn số lượng uploads song song (max 10)
  - Callback `onProgress(progress)` để update UI (0-80%)
  - Retry logic cho từng chunk nếu fail (retry ngay tại chỗ, không lưu lại)
  - **File**: `services/chunkService.js`

#### 1.5. Tạo Hàm Merge Chunks (Gọi Edge Function)
- [ ] **Tạo `mergeChunksOnServer(fileId, chunkPaths, finalPath, fileType)`**
  - Gọi Supabase Edge Function `merge-chunks`
  - Truyền: fileId, chunkPaths[], finalPath, fileType
  - Đợi merge hoàn tất (polling hoặc await)
  - Trả về URL file đã merge
  - **File**: `services/chunkService.js`

#### 1.6. Tạo Wrapper Function
- [ ] **Tạo `uploadMediaFileChunked(file, type, onProgress)`**
  - Wrapper function điều phối toàn bộ flow
  - Flow:
    1. Tạo fileId unique
    2. Tính toán chunks metadata (không đọc file)
    3. Tạo ChunkReader instance
    4. Đọc tuần tự từng chunk → upload song song (tối đa 10 chunks cho file > 5MB)
    5. Chunk upload xong → GC ngay → có thể đọc chunk tiếp theo
    6. **KHÔNG** lưu chunks vào array (chỉ giữ chunks đang upload)
    7. Tối đa 10 chunks trong memory cùng lúc (cho file > 5MB)
    8. Gọi Edge Function merge
    9. Trả về URL
  - Callback `onProgress(progress)` để update UI (0-100%)
  - **File**: `services/chunkService.js`

#### 1.7. Export Functions
- [ ] **Export các hàm mới**
  - `uploadMediaFileChunked`
  - `ChunkReader` (class hoặc factory function)
  - `uploadSingleChunk`
  - `uploadChunksParallel` (upload song song có giới hạn)
  - `mergeChunksOnServer`
  - **File**: `services/chunkService.js`

---

### 📁 2. SERVICES/CHATSERVICE.JS (Cập nhật)

#### 2.1. Xóa/Bỏ Code Cũ
- [ ] **Xóa hàm `splitFileIntoChunks()` hiện tại** (đọc toàn bộ file → base64)
- [ ] **Xóa hàm `extractChunkFromBase64()`** (không cần nữa)
- [ ] **Xóa export `splitFileIntoChunks`** từ chatService.js

#### 2.2. Import Chunk Service
- [ ] **Import `uploadMediaFileChunked` từ `chunkService.js`**
  - `import { uploadMediaFileChunked } from './chunkService'`
  - **File**: `services/chatService.js`

#### 2.3. Cập Nhật Hàm Cũ
- [x] **Cập nhật `uploadMediaFile()` - Hybrid Approach**
  - Check file size: `file.fileSize >= CHUNK_UPLOAD_THRESHOLD` (5MB)
  - Nếu >= 5MB: Chia chunks và log ra (chưa upload)
  - Nếu < 5MB: Giữ nguyên flow cũ (upload trực tiếp với base64)
  - Log file size ở đầu tiên
  - Log chi tiết các chunks đã chia
  - **File**: `services/chatService.js` ✅ ĐÃ HOÀN THÀNH

---

### 📁 3. APP/(MAIN)/CHAT.JX

#### 2.1. Cập Nhật sendMediaMessage
- [x] **Xóa test code chia chunk**
  - Xóa dòng gọi `splitFileIntoChunks()` để test
  - **File**: `app/(main)/chat.jsx` ✅ ĐÃ HOÀN THÀNH

- [ ] **Cập nhật `sendMediaMessage()`**
  - Gọi `uploadMediaFile()` (đã có hybrid logic)
  - Truyền callback `onProgress` để update UI
  - **File**: `app/(main)/chat.jsx`

#### 2.2. Thêm Progress UI
- [ ] **Thêm state cho upload progress**
  - `const [uploadProgress, setUploadProgress] = useState(0)`
  - **File**: `app/(main)/chat.jsx`

- [ ] **Thêm Progress Bar Component**
  - Hiển thị progress bar khi đang upload
  - Hiển thị % và tốc độ upload
  - **File**: `app/(main)/chat.jsx`

- [ ] **Update progress trong callback**
  - `onProgress={(progress) => setUploadProgress(progress)}`
  - **File**: `app/(main)/chat.jsx`

---

### 📁 4. SUPABASE EDGE FUNCTION - MERGE-CHUNKS

#### 3.1. Tạo Edge Function
- [ ] **Tạo file `supabase/functions/merge-chunks/index.ts`**
  - TypeScript Edge Function
  - **File**: `supabase/functions/merge-chunks/index.ts`

#### 3.2. Implement Merge Logic (Streaming)
- [ ] **Nhận parameters từ request**
  - `fileId`: ID của file
  - `chunkPaths`: Array các path của chunks (theo thứ tự)
  - `finalPath`: Path cuối cùng của file đã merge
  - `fileType`: 'image' hoặc 'video'

- [ ] **Download và merge chunks theo thứ tự (streaming)**
  - **KHÔNG** download tất cả chunks vào memory
  - Download chunk_0 → append vào output buffer/file → GC
  - Download chunk_1 → append vào output buffer/file → GC
  - Lặp lại cho tất cả chunks theo thứ tự
  - **Stream append** từng chunk vào output file/buffer
  - Chỉ giữ 1 chunk trong memory tại một thời điểm

- [ ] **Upload file đã merge**
  - Upload output file/buffer lên `finalPath` trong bucket `media`
  - Set content-type phù hợp
  - **KHÔNG** cần load toàn bộ file vào memory

- [ ] **Cleanup temp chunks**
  - Xóa từng chunk sau khi đã append (hoặc xóa tất cả sau khi merge xong)
  - Xóa folder temp nếu rỗng

- [ ] **Trả về kết quả**
  - Trả về public URL của file đã merge
  - Trả về error nếu có

#### 3.3. Error Handling
- [ ] **Xử lý lỗi download chunk**
- [ ] **Xử lý lỗi merge**
- [ ] **Xử lý lỗi upload**
- [ ] **Xử lý lỗi cleanup**

---

### 📁 5. CONFIG & CONSTANTS

#### 4.1. Cập Nhật Constants
- [x] **Kiểm tra `CHUNK_SIZE`** (2MB) - có phù hợp không? ✅
- [x] **Set `MAX_PARALLEL_UPLOADS` = 10** (cố định cho file > 5MB) ✅
  - Đây là số lượng chunks tối đa trong memory cùng lúc
  - Đây là số lượng uploads song song tối đa
  - **Cố định 10 chunks** cho tất cả file lớn hơn 5MB
- [x] **Kiểm tra `CHUNK_UPLOAD_THRESHOLD`** (5MB) - có phù hợp không? ✅
- [ ] **File**: `services/chunkService.js` (chuyển constants sang đây) - CHƯA LÀM (đang ở chatService.js)

#### 4.2. Thêm Config Mới (Nếu Cần)
- [ ] **Thêm `CHUNK_RETRY_ATTEMPTS`** (3 lần)
- [ ] **Thêm `CHUNK_RETRY_DELAY`** (exponential backoff)
- [ ] **Thêm `MERGE_POLLING_INTERVAL`** (check merge status)
- [ ] **File**: `services/chatService.js`

---

### 📁 6. ERROR HANDLING & CLEANUP

#### 6.1. Error Handling
- [ ] **Xử lý lỗi đọc file chunk**
  - Retry với exponential backoff
  - Log chi tiết để debug
  - **KHÔNG** lưu chunk vào array nếu retry

- [ ] **Xử lý lỗi upload chunk**
  - Retry từng chunk riêng lẻ (retry ngay tại chỗ)
  - **KHÔNG** lưu chunk vào array để retry sau
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

### 📁 7. TESTING

#### 7.1. Unit Tests
- [ ] **Test `ChunkReader.readChunk()`**
  - Test đọc chunk đầu tiên (trả về ArrayBuffer/Uint8Array)
  - Test đọc chunk giữa (trả về binary, không base64)
  - Test đọc chunk cuối (trả về binary)
  - Test với file lớn (50MB+)
  - Verify KHÔNG trả về base64 string

- [ ] **Test `uploadSingleChunk()`**
  - Test upload thành công (với binary data)
  - Test upload với ArrayBuffer
  - Test upload với Uint8Array
  - Test retry khi fail
  - Test với chunk lớn
  - Verify KHÔNG encode base64 trước khi upload

- [ ] **Test `uploadChunksParallel()`**
  - Test đọc tuần tự từng chunk
  - Test upload song song có giới hạn (tối đa 10 chunks cho file > 5MB)
  - Test chunk upload xong → GC ngay → đọc chunk tiếp theo
  - Test với file có nhiều chunks
  - Test retry logic (retry ngay tại chỗ, không lưu vào array)
  - Verify memory usage (tối đa 10 chunks trong memory cho file > 5MB)
  - Verify KHÔNG có array chứa chunks
  - Verify semaphore/queue hoạt động đúng (giới hạn uploads song song = 10)

#### 6.2. Integration Tests
- [ ] **Test toàn bộ flow với file nhỏ (< 5MB)**
  - Phải dùng upload trực tiếp (không chunk)

- [ ] **Test toàn bộ flow với file trung bình (5-20MB)**
  - Phải dùng chunk upload
  - Verify file upload thành công
  - Verify KHÔNG có array chứa chunks
  - Verify memory usage (tối đa 10 chunks trong memory)
  - Verify upload song song có giới hạn (không vượt quá 10 chunks)

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

---

### 📁 8. LOGGING & METRICS

#### 7.1. Logging
- [ ] **Log thời gian đọc từng chunk**
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

### 📁 9. DOCUMENTATION

#### 8.1. Code Comments
- [ ] **Comment tất cả functions mới**
- [ ] **Comment logic phức tạp**
- [ ] **Comment edge cases**

#### 8.2. README/Guide
- [ ] **Cập nhật README với flow mới**
- [ ] **Document cách sử dụng**
- [ ] **Document troubleshooting**

---

## 🎯 PRIORITY ORDER

### Phase 1: Core Functions (Bắt buộc)
1. ✅ Tạo `services/chunkService.js` - File mới tách riêng logic chunk
2. ✅ Tạo `ChunkReader` class - Đọc file theo chunks (trả binary, không base64)
3. ✅ Tạo `uploadSingleChunk()` - Upload 1 chunk (binary, không base64)
4. ✅ Tạo `uploadChunksParallel()` - Đọc tuần tự, upload song song có giới hạn (cố định 10 chunks cho file > 5MB)
5. ✅ Implement semaphore/queue để giới hạn uploads song song (max 10)
6. ✅ Tạo Edge Function `merge-chunks` - Merge streaming (download theo thứ tự, append từng chunk)
7. ✅ Tạo `uploadMediaFileChunked()` - Wrapper function

### Phase 2: Integration (Quan trọng)
7. ✅ Xóa code cũ trong `chatService.js` (splitFileIntoChunks, extractChunkFromBase64)
8. ✅ Import và sử dụng `chunkService.js` trong `chatService.js`
9. ✅ Cập nhật `uploadMediaFile()` - Hybrid approach
10. ✅ Cập nhật `sendMediaMessage()` - Sử dụng flow mới
11. ✅ Thêm Progress UI - Hiển thị progress

### Phase 3: Error Handling (Cần thiết)
12. ✅ Retry logic cho chunks (trong chunkService)
13. ✅ Cleanup temp chunks
14. ✅ Error messages rõ ràng

### Phase 4: Optimization (Tùy chọn)
15. ✅ Metrics và logging
16. ✅ Performance optimization
17. ✅ Memory optimization (đảm bảo tối đa 10 chunks trong memory cho file > 5MB)
18. ✅ Tối ưu semaphore/queue để đảm bảo GC ngay sau khi upload xong

---

## 📝 NOTES

- **KHÔNG dùng base64**: Tất cả upload phải dùng binary (ArrayBuffer/Uint8Array)
- **KHÔNG lưu chunks vào array**: Chỉ giữ chunks đang upload, không lưu tất cả vào array
- **Tách service riêng**: Logic chunk phải ở `chunkService.js`, không ở `chatService.js`
- **Memory management**: Tối đa 10 chunks trong memory cùng lúc (cho file > 5MB)
- **Read tuần tự, upload song song có giới hạn**: Đọc từng chunk một, upload song song nhưng tối đa 10 chunks (cố định cho file > 5MB)
- **Chunk upload xong → GC ngay**: Chunk upload xong → xóa khỏi memory ngay → có thể đọc chunk tiếp theo
- **Semaphore/Queue**: Sử dụng semaphore hoặc queue để giới hạn số lượng uploads song song (max 10)
- **Server streaming**: Download và merge chunks theo thứ tự, stream append, không load toàn bộ vào memory
- **Không xóa code cũ ngay**: Giữ lại để rollback nếu cần
- **Test từng bước**: Test từng function trước khi integrate
- **Monitor memory**: Đảm bảo không crash app với file lớn, memory không tăng theo số chunks (tối đa N chunks)
- **Backup**: Commit code trước khi thay đổi lớn

---

## ✅ CHECKLIST SUMMARY

- [ ] **ChunkService (Mới)**: 7 tasks
- [ ] **ChatService (Cập nhật)**: 3 tasks
- [ ] **UI Layer**: 3 tasks
- [ ] **Edge Function**: 3 tasks
- [ ] **Config**: 2 tasks
- [ ] **Error Handling**: 2 tasks
- [ ] **Testing**: 3 categories
- [ ] **Logging**: 2 tasks
- [ ] **Documentation**: 2 tasks

**Tổng cộng**: ~27+ tasks cần hoàn thành

## 🚨 CORE RULES REMINDER

- ❌ **KHÔNG BASE64** trong upload - chỉ dùng binary
- ❌ **KHÔNG lưu chunks vào array** - không tạo array chứa tất cả chunks
- ✅ **Read tuần tự, upload song song có giới hạn** - đọc từng chunk một, upload song song tối đa 10 chunks (cố định cho file > 5MB)
- ✅ **Tối đa 10 chunks trong memory** - cố định 10 chunks cho file > 5MB
- ✅ **Chunk upload xong → GC ngay** - chunk upload xong → xóa khỏi memory ngay → có thể đọc chunk tiếp theo
- ✅ **Memory efficient** - tối đa 10 chunks trong memory cùng lúc, không tăng theo số chunks
- ✅ **Server streaming** - download và merge chunks theo thứ tự, stream append
- ✅ **Tách service** - logic chunk ở `chunkService.js`
- ✅ **Binary only** - chunk reader trả ArrayBuffer/Uint8Array

