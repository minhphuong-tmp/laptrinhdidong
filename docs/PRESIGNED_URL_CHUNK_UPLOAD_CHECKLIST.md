# Checklist: Implement Presigned URL cho Chunk Upload

## 🎯 Mục tiêu
Chuyển từ `supabase.storage.upload()` sang Presigned URL + PUT trực tiếp để tăng tốc độ upload từ ~130 KB/s lên 3-10 MB/s.

---

## 📋 DANH SÁCH CÁC VIỆC CẦN LÀM

### 🔧 PHASE 1: SETUP & INFRASTRUCTURE

#### 1.1. Tạo Edge Function `get-presigned-urls`
- [ ] **Tạo file mới**: `supabase/functions/get-presigned-urls/index.ts`
- [ ] **Implement logic tạo presigned URLs**:
  - Nhận `fileId`, `totalChunks`, `bucketName`
  - Tạo presigned URL cho từng chunk path: `temp/chunks/{fileId}/chunk_{i}`
  - Trả về array presigned URLs
- [ ] **Xử lý error**: Nếu không tạo được presigned URL
- [ ] **Set expiration**: 1 giờ (đủ cho upload)
- [ ] **Deploy Edge Function** lên Supabase

#### 1.2. Kiểm tra Supabase Storage API
- [ ] **Verify** `createSignedUploadUrl()` có sẵn trong Supabase Storage API
- [ ] **Test** tạo presigned URL thủ công để verify
- [ ] **Kiểm tra** permissions cho Edge Function (Service Role Key)

---

### 💻 PHASE 2: CLIENT-SIDE IMPLEMENTATION

#### 2.1. Tạo function lấy Presigned URLs
- [ ] **Tạo function** `getPresignedUrlsForChunks()` trong `chunkService.js`
- [ ] **Gọi Edge Function** `get-presigned-urls`
- [ ] **Xử lý response**: Parse array presigned URLs
- [ ] **Error handling**: Retry nếu fail

#### 2.2. Cập nhật `uploadSingleChunk` để dùng Presigned URL
- [ ] **Thay thế** `supabase.storage.upload()` bằng `fetch(presignedUrl, PUT)`
- [ ] **Upload trực tiếp** lên S3 với PUT request
- [ ] **Headers**: `Content-Type: application/octet-stream`
- [ ] **Body**: Uint8Array chunk data
- [ ] **Xử lý response**: Check status 200 OK

#### 2.3. Cập nhật `uploadChunksParallel`
- [ ] **Lấy presigned URLs** trước khi upload chunks
- [ ] **Truyền presigned URLs** vào `uploadSingleChunk`
- [ ] **Xử lý presigned URL expiration**: Lấy lại nếu hết hạn
- [ ] **Error handling**: Retry với presigned URL mới nếu cần

---

### 🔄 PHASE 3: ERROR HANDLING & RETRY

#### 3.1. Xử lý Presigned URL expiration
- [ ] **Detect** khi presigned URL hết hạn (403/401 error)
- [ ] **Lấy lại** presigned URLs nếu hết hạn
- [ ] **Retry** upload với presigned URL mới

#### 3.2. Retry logic cho PUT requests
- [ ] **Retry** nếu PUT request fail (network error, timeout)
- [ ] **Exponential backoff** cho retry
- [ ] **Max retries**: 3 lần
- [ ] **Log** retry attempts để debug

#### 3.3. Error messages rõ ràng
- [ ] **Phân biệt** lỗi network vs lỗi presigned URL
- [ ] **Thông báo** lỗi cụ thể cho user
- [ ] **Log** chi tiết để debug

---

### 📊 PHASE 4: PROGRESS TRACKING

#### 4.1. Cập nhật progress callback
- [ ] **Track progress** cho từng PUT request
- [ ] **Update progress** khi PUT request hoàn thành
- [ ] **Calculate** tổng progress (0-80% cho upload chunks)

#### 4.2. Progress UI
- [ ] **Hiển thị** progress bar trong UI
- [ ] **Update realtime** khi upload chunks
- [ ] **Show** tốc độ upload (MB/s)

---

### 🧪 PHASE 5: TESTING

#### 5.1. Unit Tests
- [ ] **Test** `getPresignedUrlsForChunks()` function
- [ ] **Test** `uploadSingleChunk()` với presigned URL
- [ ] **Test** error handling (expired URL, network error)

#### 5.2. Integration Tests
- [ ] **Test** upload file nhỏ (< 5MB) - không chunk
- [ ] **Test** upload file trung bình (5-20MB) - 2-4 chunks
- [ ] **Test** upload file lớn (> 20MB) - nhiều chunks
- [ ] **Test** với mạng chậm
- [ ] **Test** với mạng bị ngắt (resume)

#### 5.3. Performance Tests
- [ ] **So sánh** tốc độ: presigned URL vs supabase.storage.upload
- [ ] **Measure** thời gian upload với presigned URL
- [ ] **Verify** tốc độ đạt 3-10 MB/s (tùy mạng)
- [ ] **Test** với nhiều chunks song song (20-30 chunks)

---

### 🔍 PHASE 6: VERIFICATION & OPTIMIZATION

#### 6.1. Verify Presigned URL flow
- [ ] **Verify** chunks upload thành công lên S3
- [ ] **Verify** merge chunks hoạt động đúng
- [ ] **Verify** final file có thể download được

#### 6.2. Optimize chunk size
- [ ] **Test** với chunk size khác nhau (2MB, 5MB, 10MB)
- [ ] **Tìm** chunk size tối ưu cho presigned URL
- [ ] **Update** `CHUNK_SIZE` nếu cần

#### 6.3. Optimize parallel uploads
- [ ] **Test** với `MAX_PARALLEL_UPLOADS` khác nhau (10, 20, 30)
- [ ] **Tìm** số lượng parallel tối ưu
- [ ] **Update** `MAX_PARALLEL_UPLOADS` nếu cần

---

### 📝 PHASE 7: DOCUMENTATION & CLEANUP

#### 7.1. Code cleanup
- [ ] **Xóa** code cũ dùng `supabase.storage.upload()` cho chunks
- [ ] **Giữ** code cũ cho file nhỏ (< 5MB) nếu cần
- [ ] **Update** comments và documentation

#### 7.2. Documentation
- [ ] **Document** luồng mới với presigned URL
- [ ] **Document** cách test và verify
- [ ] **Document** troubleshooting guide

---

## 🚨 LƯU Ý QUAN TRỌNG

### 1. Presigned URL Expiration
- Mặc định: 1 giờ
- Cần xử lý nếu upload mất quá 1 giờ
- Có thể tăng expiration nếu cần

### 2. Security
- Presigned URL chỉ upload được vào path đã chỉ định
- Validate `fileId` và `paths` trong Edge Function
- Không expose presigned URLs không cần thiết

### 3. Error Handling
- PUT request có thể fail → cần retry
- Presigned URL hết hạn → lấy lại
- Network error → retry với exponential backoff

### 4. Performance
- Presigned URL + PUT nhanh hơn nhiều
- Nhưng cần test với mạng thực tế
- Tốc độ phụ thuộc vào mạng (3-10 MB/s)

---

## 📊 KẾT QUẢ MONG ĐỢI

### Trước (supabase.storage.upload):
- Tốc độ: ~130 KB/s
- File 15MB: ~115 giây
- 2 chunks song song: ~67 giây

### Sau (Presigned URL + PUT):
- Tốc độ: 3-10 MB/s (tùy mạng)
- File 15MB: ~2-5 giây
- 2 chunks song song: ~2-3 giây

### Cải thiện:
- **Nhanh hơn 10-50 lần** (tùy mạng)
- **Chunk upload có ý nghĩa** với presigned URL
- **Parallel uploads** tận dụng bandwidth tốt hơn

---

## ✅ CHECKLIST SUMMARY

- [ ] **Edge Function**: 1 task
- [ ] **Client Implementation**: 3 tasks
- [ ] **Error Handling**: 3 tasks
- [ ] **Progress Tracking**: 2 tasks
- [ ] **Testing**: 3 categories
- [ ] **Verification**: 3 tasks
- [ ] **Documentation**: 2 tasks

**Tổng cộng**: ~20+ tasks cần hoàn thành

---

## 🎯 PRIORITY ORDER

### Phase 1: Core Implementation (Bắt buộc)
1. Tạo Edge Function `get-presigned-urls`
2. Cập nhật `uploadSingleChunk` để dùng presigned URL
3. Cập nhật `uploadChunksParallel` để lấy presigned URLs

### Phase 2: Error Handling (Quan trọng)
4. Xử lý presigned URL expiration
5. Retry logic cho PUT requests
6. Error messages rõ ràng

### Phase 3: Testing & Optimization (Cần thiết)
7. Test với file nhỏ/lớn
8. So sánh performance
9. Optimize chunk size và parallel uploads

### Phase 4: Documentation (Tùy chọn)
10. Code cleanup
11. Documentation

---

## 📝 NOTES

- **Presigned URL** là cách duy nhất để bypass Supabase SDK và tăng tốc độ
- **Chunk upload** chỉ có ý nghĩa khi đã dùng presigned URL
- **Test kỹ** với mạng thực tế để verify performance
- **Backup** code cũ để rollback nếu cần

