# Hướng dẫn Build APK Local

## Bước 1: Prebuild (tạo native code)
```bash
npx expo prebuild --clean --platform android
```

## Bước 2: Build APK
```bash
cd android
.\gradlew assembleDebug
```

## Bước 3: Tìm APK
APK sẽ ở: `android/app/build/outputs/apk/debug/app-debug.apk`

## Bước 4: Copy APK sang điện thoại
- Copy file `app-debug.apk` sang điện thoại
- Cài đặt bằng File Manager

## Lưu ý:
- Cần có Android SDK và Java JDK đã cài đặt
- Build local có thể mất 5-10 phút
- APK local sẽ nhỏ hơn (khoảng 50-80 MB) vì không có debug symbols


