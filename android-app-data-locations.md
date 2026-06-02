# Vị trí dữ liệu ứng dụng trên Android

## Các thư mục chứa dữ liệu ứng dụng:

### 1. `/data/data/com.phuongtmp.laptrinhdidong/` (Cần root)
- **Vị trí**: Internal storage, dữ liệu riêng tư của ứng dụng
- **Bao gồm**: Database, SharedPreferences, cache, files
- **Xóa**: Cần root hoặc dùng ADB với quyền root

### 2. `/data/app/com.phuongtmp.laptrinhdidong/` (Cần root)
- **Vị trí**: APK và dữ liệu cài đặt
- **Bao gồm**: APK file, native libraries, dex files
- **Xóa**: Cần root hoặc dùng ADB với quyền root

### 3. `/sdcard/Android/data/com.phuongtmp.laptrinhdidong/` (Không cần root)
- **Vị trí**: External storage, dữ liệu có thể truy cập
- **Bao gồm**: Cache, files, media files
- **Xóa**: Có thể xóa bằng File Manager

### 4. `/sdcard/Android/obb/com.phuongtmp.laptrinhdidong/` (Không cần root)
- **Vị trí**: OBB files (nếu có)
- **Bao gồm**: Expansion files
- **Xóa**: Có thể xóa bằng File Manager

## Cách xóa bằng File Manager (Không cần root):

1. Mở **File Manager** trên điện thoại
2. Vào **Internal Storage** hoặc **SD Card**
3. Tìm thư mục: `Android/data/com.phuongtmp.laptrinhdidong/`
4. Xóa thư mục này (nếu có)
5. Tìm thư mục: `Android/obb/com.phuongtmp.laptrinhdidong/`
6. Xóa thư mục này (nếu có)

## Cách xóa bằng ADB (Cần USB Debugging):

```bash
# Xóa dữ liệu external storage (không cần root)
adb shell rm -rf /sdcard/Android/data/com.phuongtmp.laptrinhdidong/
adb shell rm -rf /sdcard/Android/obb/com.phuongtmp.laptrinhdidong/

# Xóa dữ liệu internal (cần root hoặc dùng pm clear)
adb shell pm clear com.phuongtmp.laptrinhdidong
```

## Lưu ý:
- Thư mục `/data/data/` và `/data/app/` cần quyền root để truy cập
- Thư mục `/sdcard/Android/data/` có thể xóa bằng File Manager
- Sau khi xóa, khởi động lại điện thoại và thử cài lại APK



