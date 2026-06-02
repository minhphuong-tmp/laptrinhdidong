# Troubleshooting APK Installation

## Lỗi: "Ứng dụng chưa được cài đặt"

### Bước 1: Kiểm tra logcat
Kết nối thiết bị qua USB và chạy:
```bash
adb logcat | grep -i "package\|install\|error"
```

Hoặc xem log chi tiết khi cài:
```bash
adb logcat *:E
```

### Bước 2: Kiểm tra APK
1. Tải lại APK từ link EAS Build
2. Kiểm tra kích thước file (không được 0 KB)
3. Thử tải bằng trình duyệt khác (Chrome, Firefox)

### Bước 3: Kiểm tra quyền cài đặt
1. Vào **Settings** → **Apps** → **Special access** → **Install unknown apps**
2. Bật quyền cho ứng dụng bạn dùng để mở APK (Chrome, File Manager, etc.)
3. Thử cài lại

### Bước 4: Xóa hoàn toàn ứng dụng cũ
```bash
adb uninstall com.phuongtmp.laptrinhdidong
```

### Bước 5: Build local để test
Nếu EAS Build vẫn lỗi, thử build local:
```bash
npx expo prebuild --clean
cd android
./gradlew assembleDebug
```

APK sẽ ở: `android/app/build/outputs/apk/debug/app-debug.apk`

### Bước 6: Kiểm tra thiết bị
- Android version >= 6.0 (API 23)
- Đủ dung lượng trống (ít nhất 100MB)
- Không có ứng dụng khác cùng package name

### Bước 7: Kiểm tra signing
Nếu vẫn lỗi, có thể do signing key. Thử build với keystore mới:
```bash
npx eas build --platform android --profile development --clear-cache
```


