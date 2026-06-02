# Phân Tích Vấn Đề Chia Chunk Upload Chậm

## Tình Huống Hiện Tại

### Môi Trường
- **Framework**: React Native với Expo SDK (Development Build - APK)
- **File System**: `expo-file-system` (có thể dùng native modules)
- **Storage**: Supabase Storage
- **File Test**: Video 15.20MB (15937757 bytes)
- **Lưu ý**: Đang chạy APK với dev client, không bị giới hạn Expo Go, có thể dùng native modules

### Flow Upload Hiện Tại

1. **Test Chia Chunk** (chỉ để log, không dùng thực tế):
   - Đọc toàn bộ file thành base64: **0.75s**
   - Decode toàn bộ base64 → ArrayBuffer (trong memory)
   - Slice ArrayBuffer thành 8 chunks (mỗi chunk 2MB)
   - Encode lại từng chunk thành base64
   - **Kết quả**: Chỉ để log, không upload

2. **Upload Thực Tế** (vẫn dùng cách cũ):
   - Đọc lại file thành base64: **0.55s** (đọc lại lần 2!)
   - Decode base64 → ArrayBuffer: **5.91s** (rất chậm!)
   - Upload toàn bộ file lên server: **19.48s**
   - **Tổng thời gian**: **84.52s**

### Vấn Đề Phát Hiện

#### 1. Đọc File 2 Lần
- Lần 1: Trong `splitFileIntoChunks()` - đọc toàn bộ file
- Lần 2: Trong `uploadMediaFile()` - đọc lại toàn bộ file
- **Tốn thời gian gấp đôi không cần thiết**

#### 2. Decode Base64 Rất Chậm
- File 15.20MB → Base64 string ~21MB
- Decode base64 → ArrayBuffer: **5.91s** (chiếm 7% tổng thời gian)
- Với file lớn hơn sẽ còn chậm hơn nhiều

#### 3. Memory Overhead Lớn
- Base64 string: ~21MB
- ArrayBuffer: ~15MB
- **Tổng memory**: ~36MB chỉ để xử lý 1 file 15MB
- Với file 50MB+ sẽ gây crash trên thiết bị yếu

#### 4. Chia Chunk Không Tối Ưu
```javascript
// Cách hiện tại:
1. Đọc toàn bộ file → base64 string
2. Decode toàn bộ base64 → ArrayBuffer
3. Slice ArrayBuffer thành chunks
4. Encode lại từng chunk → base64
```

**Vấn đề:**
- Phải decode toàn bộ file trước khi slice
- Tốn memory gấp đôi (base64 + ArrayBuffer)
- Không thể stream (phải load toàn bộ vào memory)

#### 5. Chia Chunk Chỉ Để Test, Không Dùng Thực Tế
- Code chia chunk nhưng vẫn upload file nguyên bản
- Chia chunk không có tác dụng tối ưu

### Code Hiện Tại

#### `splitFileIntoChunks()` trong `services/chatService.js`:
```javascript
const splitFileIntoChunks = async (file, chunkSize = CHUNK_SIZE) => {
    // Đọc toàn bộ file thành base64
    const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: 'base64',
    });
    
    // Decode toàn bộ base64 → ArrayBuffer
    const fileArrayBuffer = decode(fileBase64);
    const fileUint8Array = new Uint8Array(fileArrayBuffer);
    
    // Slice thành chunks
    for (let i = 0; i < totalChunks; i++) {
        const chunkUint8Array = fileUint8Array.slice(start, end);
        // Encode lại thành base64
        const chunkBase64 = btoa(binaryString);
        chunks.push({ data: chunkBase64, ... });
    }
}
```

#### `uploadMediaFile()` trong `services/chatService.js`:
```javascript
export const uploadMediaFile = async (file, type = 'image') => {
    // Đọc lại file (lần 2!)
    const fileBase64 = await FileSystem.readAsStringAsync(file.uri, {
        encoding: 'base64',
    });
    
    // Decode base64 → ArrayBuffer
    const fileData = decode(fileBase64);
    
    // Upload toàn bộ file
    await supabase.storage.from('media').upload(filePath, fileData, {...});
}
```

### Yêu Cầu Tối Ưu

1. **Chỉ đọc file 1 lần**
2. **Đọc file theo chunks (streaming)** thay vì đọc toàn bộ
3. **Không decode toàn bộ file**, chỉ decode từng chunk khi cần
4. **Upload chunks song song** (parallel uploads)
5. **Merge chunks trên server** (Supabase Edge Function)
6. **Giảm memory footprint** xuống tối thiểu

### Câu Hỏi Cho ChatGPT

**Làm thế nào để tối ưu chunk upload trong React Native (Development Build) với các yêu cầu sau:**

1. Đọc file theo chunks (streaming) thay vì đọc toàn bộ vào memory?
   - Có thể dùng native file system APIs (react-native-fs, react-native-blob-util) hoặc tối ưu expo-file-system
2. Tránh decode toàn bộ base64, chỉ decode từng chunk khi cần?
3. Upload nhiều chunks song song (parallel) để tăng tốc độ?
4. Giảm memory footprint xuống tối thiểu (chỉ giữ 1-2 chunks trong memory)?
5. Xử lý file lớn (50MB+) mà không crash app?

**Ràng buộc:**
- Đang chạy Development Build (APK), không bị giới hạn Expo Go
- Có thể sử dụng native modules nếu cần (react-native-fs, react-native-blob-util, etc.)
- Có thể sử dụng `expo-file-system` hoặc native file system APIs
- Phải upload lên Supabase Storage
- Cần tương thích với React Native

---

## Vấn Đề 2: Voice Call Auto-Reconnect

### Tình Huống

Trong app React Native với Supabase Realtime, các channel subscription cho voice call bị lỗi khi mất kết nối:

```
ERROR  ❌ Signaling channel subscription error
ERROR  Call channel subscription error  
ERROR  Voice message channel subscription error
```

### Code Hiện Tại

#### `services/webRTCService.js`:
```javascript
.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
        console.error('❌ Signaling channel subscription error');
        // Chỉ log, không tự động reconnect
    }
});
```

#### `services/callManager.js`:
```javascript
// Voice message channel
.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
        console.error('Voice message channel subscription error');
        // Chỉ log, không tự động reconnect
    }
});

// Call channel
.subscribe((status) => {
    if (status === 'CHANNEL_ERROR') {
        this.isSubscribed = false;
        this.subscriptionAttempts += 1;
        console.error('Call channel subscription error');
        this.handleSubscriptionError(); // Có retry nhưng vẫn log error
    }
});
```

### Vấn Đề

1. **Log quá nhiều**: Mỗi lần mất kết nối đều log error, làm nhiễu console
2. **Không tự động reconnect**: Một số channel chỉ log, không tự động reconnect
3. **User experience**: Khi mất kết nối tạm thời, user phải restart app

### Yêu Cầu

1. **Tự động reconnect** khi channel bị lỗi
2. **Không log error** ra console (chỉ log debug nội bộ)
3. **Exponential backoff** khi retry
4. **Silent retry** - user không biết đang reconnect
5. **Max retry attempts** để tránh loop vô hạn

### Câu Hỏi Cho ChatGPT

**Làm thế nào để implement auto-reconnect cho Supabase Realtime channels trong React Native với các yêu cầu:**

1. Tự động reconnect khi channel bị `CHANNEL_ERROR` hoặc `TIMED_OUT`?
2. Không log error ra console (chỉ log debug nội bộ)?
3. Exponential backoff với max retry attempts?
4. Silent retry (user không biết đang reconnect)?
5. Xử lý các trường hợp: network disconnect, server restart, channel timeout?

**Ràng buộc:**
- Sử dụng Supabase Realtime JS client
- Tương thích với React Native
- Không làm gián đoạn user experience

