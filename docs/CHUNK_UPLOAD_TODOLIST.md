# 📋 TODOLIST: Chunk Upload cho Ảnh/Video trong Tin Nhắn

## 🎯 Mục tiêu
Tối ưu thời gian upload ảnh và video bằng cách chia file thành nhiều chunks nhỏ và upload song song (parallel), giảm memory overhead và tăng tốc độ upload.

---

## 🏗️ PHASE 1: Thiết kế & Setup

### ✅ Task 1: Phân tích và thiết kế kiến trúc
**Mô tả:** Xác định các thông số kỹ thuật và flow tổng thể

**Chi tiết:**
- [x] Xác định chunk size: 2MB (cân bằng) hoặc 5MB (nhanh hơn nhưng tốn memory hơn) → **Đã chọn: 2MB**
- [x] Xác định số lượng parallel uploads: 3-5 chunks cùng lúc → **Đã chọn: 3 chunks**
- [x] Thiết kế flow: Client chia chunks → Upload parallel → Edge Function merge → Trả về URL → **Đã thiết kế**
- [x] Quyết định cấu trúc thư mục temp: `temp/chunks/{fileId}/chunk_{index}` → **Đã quyết định**
- [x] Thiết kế API Edge Function: input/output format → **Đã thiết kế**

**✅ Hoàn thành:** 2024-12-XX

**File liên quan:**
- `services/chatService.js`
- `supabase/functions/merge-chunks/index.ts` (mới)

---

### ✅ Task 2: Tạo helper function chia file thành chunks
**Mô tả:** Tạo function để đọc file từng phần, tránh load toàn bộ vào memory

**Chi tiết:**
- [x] Tạo `readFileChunk(fileUri, start, end)`: đọc file từ offset start đến end → **Đã tạo `extractChunkFromBase64`**
- [x] Sử dụng `expo-file-system` với `readAsStringAsync` và offset/limit → **Đã implement**
- [x] Xử lý base64 encoding cho từng chunk → **Đã xử lý decode/encode**
- [x] Tính toán số lượng chunks dựa trên file size và chunk size → **Đã implement**
- [x] Tạo function `splitFileIntoChunks(file, chunkSize)`: trả về array chunks → **Đã tạo**

**✅ Hoàn thành:** 2024-12-XX

**Logging đã thêm:**
- Log file size (MB và bytes)
- Log số lượng chunks đã chia
- Log thông tin từng chunk (index, start, end, size)
- Log tổng kích thước chunks

**File liên quan:**
- `services/chatService.js` (thêm helper functions)

**Code mẫu:**
```javascript
const readFileChunk = async (fileUri, start, end) => {
  // Đọc file từ start đến end
  // Trả về base64 string của chunk
};

const splitFileIntoChunks = async (file, chunkSize = 2 * 1024 * 1024) => {
  // Tính số chunks
  // Đọc từng chunk
  // Trả về array chunks với metadata (index, start, end, data)
};
```

---

## 🔧 PHASE 2: Core Upload Logic

### ✅ Task 3: Tạo hàm upload single chunk
**Mô tả:** Upload 1 chunk lên Supabase Storage với tên file temp

**Chi tiết:**
- [ ] Tạo `uploadSingleChunk(chunkData, fileId, chunkIndex, type)`
- [ ] Upload lên path: `temp/chunks/{fileId}/chunk_{chunkIndex}`
- [ ] Xử lý error và retry logic cơ bản
- [ ] Trả về path của chunk đã upload
- [ ] Log progress cho từng chunk

**File liên quan:**
- `services/chatService.js`

**Code mẫu:**
```javascript
const uploadSingleChunk = async (chunkData, fileId, chunkIndex, type) => {
  const chunkPath = `temp/chunks/${fileId}/chunk_${chunkIndex}`;
  const { data, error } = await supabase.storage
    .from('media')
    .upload(chunkPath, chunkData, {
      contentType: type === 'image' ? 'image/*' : 'video/*'
    });
  return { success: !error, path: chunkPath, error };
};
```

---

### ✅ Task 4: Tạo hàm upload chunks parallel
**Mô tả:** Upload nhiều chunks song song với progress tracking

**Chi tiết:**
- [ ] Tạo `uploadChunksParallel(chunks, fileId, type, onProgress)`
- [ ] Upload 3-5 chunks cùng lúc (batch)
- [ ] Track progress: `(uploadedChunks / totalChunks) * 80` (80% cho upload)
- [ ] Gọi `onProgress` callback sau mỗi batch
- [ ] Xử lý Promise.all với error handling
- [ ] Trả về array paths của tất cả chunks đã upload

**File liên quan:**
- `services/chatService.js`

**Code mẫu:**
```javascript
const uploadChunksParallel = async (chunks, fileId, type, onProgress) => {
  const MAX_PARALLEL = 3;
  const chunkPaths = [];
  
  for (let i = 0; i < chunks.length; i += MAX_PARALLEL) {
    const batch = chunks.slice(i, i + MAX_PARALLEL);
    const results = await Promise.all(
      batch.map((chunk, idx) => 
        uploadSingleChunk(chunk.data, fileId, i + idx, type)
      )
    );
    chunkPaths.push(...results.map(r => r.path));
    onProgress((chunkPaths.length / chunks.length) * 80);
  }
  
  return chunkPaths;
};
```

---

### ✅ Task 5: Tạo Supabase Edge Function merge-chunks
**Mô tả:** Merge tất cả chunks thành 1 file và upload lên vị trí cuối cùng

**Chi tiết:**
- [ ] Tạo `supabase/functions/merge-chunks/index.ts`
- [ ] Nhận input: `{ fileId, chunkPaths, finalPath, contentType }`
- [ ] Download tất cả chunks từ Storage
- [ ] Merge chunks thành 1 ArrayBuffer/Uint8Array
- [ ] Upload file đã merge lên `finalPath`
- [ ] Xóa tất cả temp chunks sau khi merge thành công
- [ ] Trả về public URL của file cuối cùng
- [ ] Error handling và cleanup nếu merge thất bại

**File liên quan:**
- `supabase/functions/merge-chunks/index.ts` (mới)
- `supabase/functions/merge-chunks/deno.json` (mới)

**Code mẫu:**
```typescript
serve(async (req) => {
  const { fileId, chunkPaths, finalPath, contentType } = await req.json();
  
  // 1. Download tất cả chunks
  const chunks = await Promise.all(
    chunkPaths.map(path => 
      supabase.storage.from('media').download(path)
    )
  );
  
  // 2. Merge chunks
  const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const mergedBuffer = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    mergedBuffer.set(chunk, offset);
    offset += chunk.length;
  }
  
  // 3. Upload merged file
  await supabase.storage.from('media').upload(finalPath, mergedBuffer, { contentType });
  
  // 4. Cleanup temp chunks
  await supabase.storage.from('media').remove(chunkPaths);
  
  // 5. Get public URL
  const { data } = supabase.storage.from('media').getPublicUrl(finalPath);
  return new Response(JSON.stringify({ url: data.publicUrl }));
});
```

---

### ✅ Task 6: Tạo hàm uploadMediaFileChunked (wrapper)
**Mô tả:** Function chính điều phối toàn bộ flow chunk upload

**Chi tiết:**
- [ ] Tạo `uploadMediaFileChunked(file, type, onProgress)`
- [ ] Tạo unique fileId cho session upload
- [ ] Gọi `splitFileIntoChunks` để chia file
- [ ] Gọi `uploadChunksParallel` để upload (progress 0-80%)
- [ ] Gọi Edge Function `merge-chunks` (progress 80-100%)
- [ ] Trả về kết quả giống `uploadMediaFile` (success, data, metrics)
- [ ] Error handling và cleanup nếu thất bại

**File liên quan:**
- `services/chatService.js`

**Code mẫu:**
```javascript
export const uploadMediaFileChunked = async (file, type = 'image', onProgress) => {
  const fileId = `${Date.now()}_${Math.random().toString(36).substring(2)}`;
  const folderName = type === 'image' ? 'images' : 'videos';
  const fileExt = file.uri.split('.').pop();
  const finalPath = `${folderName}/${fileId}.${fileExt}`;
  
  try {
    // 1. Chia file thành chunks
    onProgress?.(0);
    const chunks = await splitFileIntoChunks(file, CHUNK_SIZE);
    
    // 2. Upload chunks parallel
    const chunkPaths = await uploadChunksParallel(
      chunks, 
      fileId, 
      type, 
      (progress) => onProgress?.(progress * 0.8) // 0-80%
    );
    
    // 3. Merge chunks
    const mergeResult = await supabase.functions.invoke('merge-chunks', {
      body: { fileId, chunkPaths, finalPath, contentType: type === 'image' ? 'image/*' : 'video/*' }
    });
    onProgress?.(100);
    
    // 4. Trả về kết quả
    return {
      success: true,
      data: {
        file_url: mergeResult.data.url,
        file_path: finalPath,
        file_name: `${fileId}.${fileExt}`,
        file_size: file.fileSize || 0,
        mime_type: file.mimeType || (type === 'image' ? 'image/jpeg' : 'video/mp4')
      }
    };
  } catch (error) {
    // Cleanup temp chunks nếu lỗi
    return { success: false, msg: error.message };
  }
};
```

---

## 🛡️ PHASE 3: Error Handling & Retry

### ✅ Task 7: Thêm retry logic cho từng chunk
**Mô tả:** Retry tự động khi upload chunk thất bại

**Chi tiết:**
- [ ] Tạo `uploadSingleChunkWithRetry(chunkData, fileId, chunkIndex, type, maxRetries = 3)`
- [ ] Retry với exponential backoff: 1s, 2s, 4s
- [ ] Chỉ retry chunk lỗi, không retry toàn bộ
- [ ] Log số lần retry và kết quả
- [ ] Throw error nếu retry hết lần vẫn lỗi

**File liên quan:**
- `services/chatService.js`

**Code mẫu:**
```javascript
const uploadSingleChunkWithRetry = async (chunkData, fileId, chunkIndex, type, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await uploadSingleChunk(chunkData, fileId, chunkIndex, type);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(`[Retry] Retrying chunk ${chunkIndex}, attempt ${attempt + 1}/${maxRetries}`);
    }
  }
};
```

---

### ✅ Task 11: Xử lý error handling tổng thể
**Mô tả:** Cleanup và error messages rõ ràng

**Chi tiết:**
- [ ] Cleanup temp chunks nếu upload thất bại (gọi Edge Function cleanup hoặc xóa trực tiếp)
- [ ] Hiển thị error message rõ ràng cho user
- [ ] Log chi tiết để debug: file size, số chunks, chunks lỗi
- [ ] Xử lý timeout: nếu upload quá lâu (> 5 phút) thì cancel
- [ ] Xử lý network error: detect và retry toàn bộ nếu cần

**File liên quan:**
- `services/chatService.js`
- `app/(main)/chat.jsx`

---

## 📊 PHASE 4: Progress & UI

### ✅ Task 8: Thêm progress tracking chi tiết
**Mô tả:** Track progress cho từng bước và callback để update UI

**Chi tiết:**
- [ ] Progress cho đọc file: 0-10%
- [ ] Progress cho chia chunks: 10-15%
- [ ] Progress cho upload chunks: 15-80% (từng chunk)
- [ ] Progress cho merge: 80-100%
- [ ] Callback `onProgress(percent)` để update UI
- [ ] Log progress trong console để debug

**File liên quan:**
- `services/chatService.js`
- `app/(main)/chat.jsx`

---

### ✅ Task 9: Cập nhật sendMediaMessage trong chat.jsx
**Mô tả:** Sử dụng chunk upload và hiển thị progress bar

**Chi tiết:**
- [ ] Thay `uploadMediaFile` → `uploadMediaFileChunked` (cho file >= 5MB)
- [ ] Thêm state `uploadProgress` để track progress
- [ ] Hiển thị progress bar trong UI khi upload
- [ ] Update progress bar theo `onProgress` callback
- [ ] Ẩn progress bar khi upload xong
- [ ] Giữ nguyên logic gửi message sau khi upload

**File liên quan:**
- `app/(main)/chat.jsx`

**UI mẫu:**
```jsx
{uploading && (
  <View style={styles.progressContainer}>
    <ProgressBar progress={uploadProgress} />
    <Text>{uploadProgress}%</Text>
  </View>
)}
```

---

## ⚡ PHASE 5: Tối ưu & Hybrid

### ✅ Task 10: Thêm logic quyết định khi nào dùng chunk upload
**Mô tả:** Hybrid approach - file nhỏ upload trực tiếp, file lớn dùng chunk

**Chi tiết:**
- [ ] Xác định threshold: 5MB
- [ ] File < 5MB: dùng `uploadMediaFile` (như hiện tại)
- [ ] File ≥ 5MB: dùng `uploadMediaFileChunked`
- [ ] Tự động chọn method dựa trên `file.fileSize`
- [ ] Log method được chọn để debug

**File liên quan:**
- `services/chatService.js`
- `app/(main)/chat.jsx`

**Code mẫu:**
```javascript
const CHUNK_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB

const uploadResult = file.fileSize >= CHUNK_UPLOAD_THRESHOLD
  ? await uploadMediaFileChunked(file, type, onProgress)
  : await uploadMediaFile(file, type);
```

---

## 🧪 PHASE 6: Testing & Metrics

### ✅ Task 12: Test và tối ưu
**Mô tả:** Test với nhiều trường hợp khác nhau

**Chi tiết:**
- [ ] Test với file nhỏ (< 5MB): verify upload trực tiếp
- [ ] Test với file trung bình (5-20MB): verify chunk upload
- [ ] Test với file lớn (> 20MB): verify performance
- [ ] Test với mạng chậm: verify retry logic
- [ ] Test với mạng bị ngắt: verify error handling
- [ ] Test retry logic: simulate chunk upload lỗi
- [ ] So sánh thời gian upload: chunk vs non-chunk
- [ ] Test memory usage: verify không load toàn bộ file

**Test cases:**
1. Upload ảnh 2MB → Dùng upload trực tiếp
2. Upload ảnh 8MB → Dùng chunk upload (4 chunks x 2MB)
3. Upload video 30MB → Dùng chunk upload (15 chunks x 2MB)
4. Simulate chunk 3 lỗi → Verify retry 3 lần
5. Simulate network timeout → Verify cleanup

---

### ✅ Task 13: Thêm metrics và logging
**Mô tả:** Log chi tiết để theo dõi và so sánh performance

**Chi tiết:**
- [ ] Log thời gian upload từng chunk
- [ ] Log tổng thời gian upload
- [ ] Log tốc độ upload (MB/s)
- [ ] Log số lần retry
- [ ] Log memory usage (ước tính)
- [ ] So sánh với upload cũ: thời gian, memory, tốc độ
- [ ] Log số lượng chunks và chunk size

**File liên quan:**
- `services/chatService.js`

**Metrics mẫu:**
```javascript
const metrics = {
  fileSize: file.fileSize,
  chunkSize: CHUNK_SIZE,
  totalChunks: chunks.length,
  uploadTime: uploadEndTime - uploadStartTime,
  uploadSpeed: file.fileSize / (uploadTime / 1000), // MB/s
  retryCount: totalRetries,
  memoryPeak: chunkSize * MAX_PARALLEL, // Ước tính
  method: 'chunked' // hoặc 'direct'
};
```

---

## 🎯 Flow tổng thể

```
1. User chọn ảnh/video
   ↓
2. Kiểm tra file size
   - < 5MB → Upload trực tiếp (uploadMediaFile)
   - ≥ 5MB → Chunk upload (uploadMediaFileChunked)
   ↓
3. [Chunk Upload] Chia file thành chunks (2MB/chunk)
   ↓
4. [Chunk Upload] Upload chunks song song (3-5 chunks/lần)
   - Progress: 0-80%
   - Retry nếu lỗi
   ↓
5. [Chunk Upload] Gọi Edge Function merge-chunks
   - Progress: 80-100%
   ↓
6. Nhận URL file cuối cùng
   ↓
7. Gửi message với file_url
```

---

## 📝 Thứ tự ưu tiên

### 🔴 **Cao (Core functionality)**
1. Task 1: Thiết kế kiến trúc
2. Task 2: Helper function chia file
3. Task 3: Upload single chunk
4. Task 4: Upload parallel
5. Task 5: Edge Function merge
6. Task 6: Wrapper function

### 🟡 **Trung bình (Error handling & UI)**
7. Task 7: Retry logic
8. Task 8: Progress tracking
9. Task 9: Update UI
10. Task 11: Error handling

### 🟢 **Thấp (Tối ưu & Testing)**
11. Task 10: Hybrid approach
12. Task 12: Testing
13. Task 13: Metrics

---

## 📌 Notes

- **Chunk size**: Bắt đầu với 2MB, có thể điều chỉnh sau
- **Parallel uploads**: Bắt đầu với 3 chunks cùng lúc, test và tối ưu
- **Edge Function**: Cần deploy lên Supabase trước khi test
- **Backward compatibility**: Giữ `uploadMediaFile` cho file nhỏ
- **Memory**: Chunk upload giảm memory từ ~90MB xuống ~6MB (với 2MB chunks)

---

## ✅ Checklist hoàn thành

- [ ] Phase 1: Thiết kế & Setup
- [ ] Phase 2: Core Upload Logic
- [ ] Phase 3: Error Handling & Retry
- [ ] Phase 4: Progress & UI
- [ ] Phase 5: Tối ưu & Hybrid
- [ ] Phase 6: Testing & Metrics

---

**Ngày tạo:** 2024-12-XX  
**Cập nhật lần cuối:** 2024-12-XX

