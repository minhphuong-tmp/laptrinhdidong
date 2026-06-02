# 🔧 Hướng dẫn Rebuild Native Modules

## Vấn đề
Sau khi cài `expo-image-manipulator` hoặc `react-native-create-thumbnail`, app bị lỗi:
```
ERROR [Error: Cannot find native module 'ExpoImageManipulator']
```

## ✅ Giải pháp: Rebuild App đúng cách

### Bước 1: Clear cache và dependencies

```bash
# Clear Metro bundler cache
npx expo start --clear

# Hoặc nếu dùng npm
rm -rf node_modules
npm install

# Clear Expo cache
npx expo start -c
```

### Bước 2: Prebuild native code (QUAN TRỌNG)

```bash
# Tạo native folders (android/ios) nếu chưa có
npx expo prebuild --clean

# Hoặc nếu đã có native folders, chỉ cần sync
npx expo prebuild
```

**Lưu ý:** `prebuild` sẽ tạo/sync native code cho tất cả Expo modules, bao gồm `expo-image-manipulator`.

### Bước 3: Rebuild app

#### Android:
```bash
# Cách 1: Dùng Expo CLI (tự động prebuild)
npx expo run:android

# Cách 2: Build APK trực tiếp với Gradle
# ⚠️ QUAN TRỌNG: Phải chạy prebuild trước!
npx expo prebuild --clean
cd android
./gradlew clean
./gradlew assembleDebug
```

**Lưu ý:** Nếu build bằng `assembleDebug`, **PHẢI** chạy `npx expo prebuild --clean` trước. Xem chi tiết: `docs/BUILD_APK_WITH_ASSEMBLEDEBUG.md`

#### iOS:
```bash
npx expo run:ios
```

### Bước 4: Nếu vẫn lỗi - Clean build hoàn toàn

```bash
# Android
cd android
./gradlew clean
rm -rf .gradle
rm -rf app/build
cd ..
npx expo prebuild --clean
npx expo run:android

# iOS
cd ios
rm -rf build
rm -rf Pods
pod install
cd ..
npx expo prebuild --clean
npx expo run:ios
```

---

## 🛡️ Code đã được bảo vệ

Code hiện tại đã được sửa để **KHÔNG crash** nếu native module chưa được build:

- ✅ Try-catch khi require module
- ✅ Try-catch khi gọi native function
- ✅ Fallback về local file URI nếu có lỗi
- ✅ Preview vẫn hiển thị được (dùng local URI)

**App sẽ chạy được ngay, không cần rebuild!**

---

## 📝 Checklist Rebuild

- [ ] Clear Metro cache: `npx expo start --clear`
- [ ] Chạy `npx expo prebuild --clean`
- [ ] Rebuild app: `npx expo run:android` hoặc `npx expo run:ios`
- [ ] Test upload file lớn (> 5MB)
- [ ] Kiểm tra log xem có dùng native module không

---

## 🔍 Kiểm tra Native Module đã được build chưa

Sau khi rebuild, check log khi upload file:

**Nếu có native module:**
```
✅ [Thumbnail] expo-image-manipulator loaded
📷 [Thumbnail] ✅ Thumbnail created (resized): file://...
```

**Nếu chưa có (fallback):**
```
⚠️ [Thumbnail] ImageManipulator không khả dụng: ...
📷 [Thumbnail] ✅ Dùng local URI trực tiếp: file://...
```

---

## 💡 Lưu ý

1. **Không cần rebuild ngay**: App vẫn chạy được với fallback (local URI)
2. **Rebuild để tối ưu**: Native module sẽ resize/compress thumbnail → nhỏ hơn, upload nhanh hơn
3. **EAS Build**: Nếu dùng EAS Build, native modules sẽ tự động được build

---

**Cập nhật:** 2025-01-XX

