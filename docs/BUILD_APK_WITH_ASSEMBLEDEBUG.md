# 🔧 Build APK với `assembleDebug`

## ⚠️ QUAN TRỌNG: Phải chạy `prebuild` trước!

Khi build bằng `./gradlew assembleDebug`, bạn **PHẢI** chạy `npx expo prebuild` trước để sync native modules vào Android project.

---

## 📋 Workflow đúng

### Bước 1: Prebuild (BẮT BUỘC)

```bash
# Chạy prebuild để sync native modules
npx expo prebuild --clean
```

**Lưu ý:** 
- `--clean` sẽ xóa và tạo lại native folders
- Nếu không chạy bước này, native modules sẽ KHÔNG được build vào APK

### Bước 2: Build APK

```bash
# Vào thư mục android
cd android

# Clean build (tùy chọn, nhưng nên làm)
./gradlew clean

# Build APK debug
./gradlew assembleDebug
```

### Bước 3: Tìm APK

APK sẽ được tạo tại:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🚀 Lệnh nhanh (All-in-one)

### Windows (PowerShell):
```powershell
# Prebuild
npx expo prebuild --clean

# Build APK
cd android
.\gradlew clean
.\gradlew assembleDebug
cd ..
```

### Linux/Mac:
```bash
# Prebuild
npx expo prebuild --clean

# Build APK
cd android
./gradlew clean
./gradlew assembleDebug
cd ..
```

---

## 🔄 Nếu đã có native folders

Nếu bạn đã có `android/` folder và chỉ muốn sync modules mới:

```bash
# Sync mà không xóa (nhanh hơn)
npx expo prebuild

# Sau đó build
cd android
./gradlew clean
./gradlew assembleDebug
```

---

## 🧹 Clean build hoàn toàn (nếu vẫn lỗi)

```bash
# 1. Clean Expo
npx expo prebuild --clean

# 2. Clean Android
cd android
./gradlew clean
rm -rf .gradle
rm -rf app/build
cd ..

# 3. Rebuild
cd android
./gradlew assembleDebug
```

---

## ✅ Checklist

- [ ] Chạy `npx expo prebuild --clean` trước khi build
- [ ] Chạy `./gradlew clean` để clean build
- [ ] Chạy `./gradlew assembleDebug` để build APK
- [ ] Kiểm tra APK tại `android/app/build/outputs/apk/debug/app-debug.apk`
- [ ] Test upload file lớn (> 5MB) để verify native modules

---

## 🔍 Verify Native Modules đã được build

Sau khi build xong, test upload file lớn và check log:

**✅ Nếu thành công:**
```
📷 [Thumbnail] ✅ Thumbnail created (resized): file://...
```

**❌ Nếu fail:**
```
ERROR [Error: Cannot find native module 'ExpoImageManipulator']
```

Nếu vẫn lỗi → Chạy lại `npx expo prebuild --clean` và rebuild.

---

## 💡 Lưu ý

1. **Luôn chạy `prebuild` trước `assembleDebug`** - Đây là bước QUAN TRỌNG nhất
2. **`prebuild --clean`** sẽ xóa và tạo lại native folders → Đảm bảo sync đúng
3. **Nếu thêm/sửa native modules** → Phải chạy `prebuild` lại
4. **Không cần chạy `prebuild` mỗi lần build** - Chỉ cần khi:
   - Thêm native module mới
   - Cập nhật Expo SDK
   - Thay đổi app.json/app.config.js

---

**Cập nhật:** 2025-01-XX





