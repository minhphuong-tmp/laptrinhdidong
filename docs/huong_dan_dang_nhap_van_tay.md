# Hướng Dẫn Đăng Nhập Bằng Vân Tay

## Tổng Quan
Ứng dụng hiện đã hỗ trợ đăng nhập bằng sinh trắc học (vân tay/Face ID/Touch ID) để tăng tính bảo mật và tiện lợi cho người dùng.

## Các Thay Đổi Đã Thực Hiện

### 1. Cài Đặt Package
```bash
npm install expo-local-authentication
```

### 2. File Đã Chỉnh Sửa

#### `app/login.jsx`
- Thêm import `expo-local-authentication` và `AsyncStorage`
- Thêm state để kiểm tra khả dụng của sinh trắc học
- Thêm hàm `checkBiometricAvailability()` - kiểm tra thiết bị có hỗ trợ vân tay không
- Thêm hàm `checkSavedCredentials()` - kiểm tra đã lưu thông tin đăng nhập chưa
- Cập nhật hàm `onSubmit()` - lưu email và password sau khi đăng nhập thành công
- Thêm hàm `loginWithBiometric()` - xử lý đăng nhập bằng vân tay
- Thêm UI nút đăng nhập bằng vân tay (chỉ hiển thị khi điều kiện thỏa mãn)

#### `app.json`
- **iOS**: Thêm `NSFaceIDUsageDescription` trong `infoPlist` để sử dụng Face ID/Touch ID
- **Android**: Thêm permissions:
  - `android.permission.USE_BIOMETRIC`
  - `android.permission.USE_FINGERPRINT`

#### `assets/icons/Fingerprint.jsx`
- Tạo icon vân tay mới để hiển thị trên nút

#### `assets/icons/index.jsx`
- Import và đăng ký icon fingerprint

## Cách Hoạt Động

### Luồng Đăng Nhập

1. **Lần đầu tiên**: Người dùng phải đăng nhập bằng email/password
   - Sau khi đăng nhập thành công, thông tin được lưu vào AsyncStorage
   
2. **Lần sau**: Nút "Đăng nhập bằng vân tay" sẽ xuất hiện nếu:
   - Thiết bị hỗ trợ sinh trắc học (`hasHardwareAsync()`)
   - Người dùng đã đăng ký vân tay trên thiết bị (`isEnrolledAsync()`)
   - Đã có thông tin đăng nhập được lưu từ lần trước

3. **Xác thực sinh trắc học**:
   - Người dùng nhấn nút vân tay
   - Hệ thống yêu cầu xác thực bằng vân tay/Face ID
   - Nếu thành công, tự động đăng nhập với thông tin đã lưu
   - Nếu thất bại, có thể sử dụng mật khẩu thiết bị (fallback)

### Bảo Mật

- Mật khẩu được lưu trong AsyncStorage (cần cân nhắc mã hóa trong production)
- Nếu thông tin đăng nhập không còn hợp lệ, sẽ tự động xóa và yêu cầu đăng nhập lại
- Người dùng có thể hủy xác thực sinh trắc học bất cứ lúc nào

## Kiểm Tra và Chạy Ứng Dụng

### Trên Android:
```bash
npx expo run:android
```

### Trên iOS:
```bash
npx expo run:ios
```

### Development Mode:
```bash
npx expo start
```

## Lưu Ý Quan Trọng

### Để Test Trên Thiết Bị Thật:
1. **Android**: 
   - Thiết bị phải có cảm biến vân tay
   - Đã đăng ký ít nhất một vân tay trong Settings
   
2. **iOS**:
   - Thiết bị hỗ trợ Touch ID hoặc Face ID
   - Đã thiết lập Face ID/Touch ID trong Settings

### Để Test Trên Emulator:
- **Android Emulator**: Có thể giả lập vân tay qua Extended Controls
- **iOS Simulator**: Có thể test Face ID/Touch ID bằng menu Features > Face ID/Touch ID

## Cải Tiến Trong Tương Lai

1. **Mã hóa thông tin**: Sử dụng `expo-secure-store` thay vì AsyncStorage để bảo mật hơn
2. **Tùy chọn bật/tắt**: Cho phép người dùng chọn có muốn sử dụng sinh trắc học không
3. **Hỗ trợ nhiều tài khoản**: Lưu và chọn tài khoản khi có nhiều người dùng
4. **Timeout session**: Yêu cầu xác thực lại sau một khoảng thời gian

## Troubleshooting

### Nút vân tay không hiện?
- Kiểm tra thiết bị có hỗ trợ sinh trắc học không
- Kiểm tra đã đăng ký vân tay/Face ID chưa
- Kiểm tra đã đăng nhập bằng password ít nhất một lần chưa

### Lỗi "Biometric authentication failed"?
- Vân tay không khớp - thử lại
- Thiết bị không nhận dạng được - sử dụng fallback password

### Lỗi "No active session"?
- Thông tin đăng nhập đã hết hạn
- Đăng nhập lại bằng email/password

### Lỗi "Property 'supabaseUrl' doesn't exist" sau khi đăng nhập?
- Đây là lỗi trong component PostCard (không liên quan đến vân tay)
- Đã được sửa bằng cách xóa dòng console.log debug
- Reload lại app bằng cách nhấn `r` trong Expo hoặc shake device để reload

## Demo Video
[Thêm link video demo khi sẵn sàng]

