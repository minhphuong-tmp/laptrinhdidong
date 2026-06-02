# E2E Encryption - Final Checklist

## ✅ Đã hoàn thành

### 1. Dependencies & Configuration
- [x] `react-native-quick-crypto` đã được cài đặt (v0.7.17)
- [x] `react-native-get-random-values` đã được cài đặt (v1.11.0)
- [x] `expo-secure-store` đã được cài đặt (v15.0.7)
- [x] `expo-dev-client` đã được thêm vào `app.json` plugins
- [x] `expo-secure-store` đã được thêm vào `app.json` plugins
- [x] Polyfill `react-native-get-random-values` đã được import ở `app/_layout.jsx`

### 2. Database Schema
- [x] Bảng `user_devices` đã được tạo (lưu device info và public keys)
- [x] Bảng `conversation_keys` đã được tạo (lưu AES keys đã mã hóa cho từng device)
- [x] Columns `is_encrypted`, `encryption_algorithm`, `key_version` đã được thêm vào bảng `messages`

### 3. Core Services

#### `deviceService.js`
- [x] `generateDeviceId()` - Format: `device_${timestamp}_${random}`
- [x] `getDeviceName()` - Tự động detect device name
- [x] `generateKeyPair()` - RSA-2048 với Web Crypto API và `react-native-quick-crypto`
- [x] `getOrCreateDeviceId()` - Lưu trong SecureStore (dev client) hoặc AsyncStorage (fallback)
- [x] `getOrCreatePrivateKey()` - Lưu private key trong SecureStore
- [x] `registerDevice()` - Đăng ký device lên server với public key

#### `encryptionService.js`
- [x] `generateAESKey()` - Random 32 bytes với Web Crypto API và `react-native-quick-crypto`
- [x] `encryptAES()` - AES-256-GCM với Web Crypto API và `react-native-quick-crypto.subtle`
- [x] `decryptAES()` - AES-256-GCM với Web Crypto API và `react-native-quick-crypto.subtle`
- [x] `encryptAESKeyWithRSA()` - RSA-OAEP với Web Crypto API và `react-native-quick-crypto.subtle` (fallback: `publicEncrypt`)
- [x] `decryptAESKeyWithRSA()` - RSA-OAEP với Web Crypto API và `react-native-quick-crypto.subtle` (fallback: `privateDecrypt`)
- [x] `getOrCreateConversationKey()` - Forward secrecy: device mới tạo key mới
- [x] `encryptMessage()` - Mã hóa message content
- [x] `decryptMessage()` - Giải mã message content (trả về null nếu không decrypt được)

#### `chatService.js`
- [x] `sendMessage()` - Chỉ mã hóa cho direct chat, text messages
- [x] `getMessages()` - Giải mã messages khi load
- [x] `getNewMessages()` - Giải mã messages mới (đã sửa lỗi thiếu userId)

### 4. UI Components

#### `app/(main)/chat.jsx`
- [x] E2E Encryption Notice hiển thị cho direct chat
  - Icon khóa
  - Text: "Tin nhắn và cuộc gọi mới được bảo mật bằng tính năng mã hóa đầu cuối..."
  - Link "Tìm hiểu thêm"
- [x] Decryption error handling
  - Hiển thị icon khóa + text "Không thể giải mã tin nhắn này" khi decrypt fail
- [x] Realtime subscription decrypt incoming messages

### 5. Error Handling
- [x] Fallback gửi plaintext nếu encryption fail (với warning log)
- [x] Fallback về AsyncStorage nếu SecureStore không available (Expo Go)
- [x] Graceful degradation: App vẫn hoạt động nếu E2E không available

### 6. Forward Secrecy
- [x] Device mới tham gia conversation sẽ tạo AES key mới
- [x] Device mới chỉ thấy messages từ lúc tham gia (không decrypt được messages cũ)
- [x] `decryptMessage()` trả về `null` nếu không decrypt được (forward secrecy)

### 7. Build Configuration
- [x] `versionCode` đã được tăng lên 2
- [x] `versionName` đã được tăng lên "1.0.1"
- [x] `android/app/build.gradle` đã được cập nhật

## ⚠️ Cần rebuild Dev Client

**QUAN TRỌNG:** Dev client APK cần được rebuild để bao gồm native modules:
- `react-native-quick-crypto`
- `expo-secure-store`

### Build Command:
```bash
eas build --profile development --platform android
```

Hoặc build local:
```bash
npx expo prebuild
npx expo run:android
```

## 📝 Testing Checklist (Sau khi rebuild)

1. **Device Registration:**
   - [ ] Device ID được tạo và lưu trong SecureStore
   - [ ] RSA key pair được generate
   - [ ] Device được đăng ký lên server với public key

2. **Message Encryption:**
   - [ ] Gửi tin nhắn trong direct chat → được mã hóa
   - [ ] Gửi tin nhắn trong group chat → không mã hóa
   - [ ] Gửi media → không mã hóa (chỉ text messages)

3. **Message Decryption:**
   - [ ] Load messages cũ → được giải mã đúng
   - [ ] Tin nhắn mới từ realtime → được giải mã đúng
   - [ ] Tin nhắn cũ (is_encrypted = false) → hiển thị plaintext

4. **Forward Secrecy:**
   - [ ] Device mới tham gia → tạo AES key mới
   - [ ] Device mới chỉ thấy messages từ lúc tham gia
   - [ ] Messages cũ hiển thị "Không thể giải mã tin nhắn này"

5. **UI:**
   - [ ] E2E notice hiển thị đúng cho direct chat
   - [ ] Decryption error hiển thị đúng khi không decrypt được

6. **Error Handling:**
   - [ ] App vẫn hoạt động nếu E2E không available (Expo Go)
   - [ ] Warning log khi encryption fail
   - [ ] Fallback gửi plaintext khi encryption fail

## 🔍 Known Issues & Notes

1. **AES Encryption/Decryption:** Đã thêm hỗ trợ `react-native-quick-crypto.subtle` cho AES-GCM
2. **RSA Encryption/Decryption:** Đã thêm hỗ trợ `react-native-quick-crypto.subtle` với fallback về `publicEncrypt`/`privateDecrypt`
3. **Random Values:** Đã thêm polyfill `react-native-get-random-values` ở entry point
4. **getNewMessages:** Đã sửa lỗi thiếu tham số `userId`

## 🚀 Ready to Build!

Tất cả code đã được kiểm tra và sẵn sàng. Rebuild dev client APK để test E2E encryption.


