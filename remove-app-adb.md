# Xóa ứng dụng bằng ADB

## Bước 1: Cài ADB (nếu chưa có)
1. Tải Android Platform Tools: https://developer.android.com/tools/releases/platform-tools
2. Giải nén vào thư mục (ví dụ: `C:\adb`)
3. Thêm vào PATH hoặc chạy từ thư mục đó

## Bước 2: Bật USB Debugging trên điện thoại
1. Vào **Settings** → **About phone**
2. Nhấn 7 lần vào **Build number** để bật Developer options
3. Vào **Settings** → **Developer options**
4. Bật **USB debugging**

## Bước 3: Kết nối và xóa
```bash
# Kết nối điện thoại qua USB
adb devices

# Xóa ứng dụng
adb uninstall com.phuongtmp.laptrinhdidong

# Hoặc xóa cả dữ liệu
adb shell pm clear com.phuongtmp.laptrinhdidong
```

## Bước 4: Cài lại APK
Sau khi xóa, thử cài lại APK mới.


