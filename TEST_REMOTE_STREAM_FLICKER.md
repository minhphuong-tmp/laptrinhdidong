# Test Script: Reproduce Remote Stream Flicker

## Mục tiêu
Tái hiện lỗi remoteStream bị clear khi call đang active, dẫn đến UI flicker.

## Kịch bản test

### Bước 1: Start Call (Caller)
1. Mở app trên device A (Caller)
2. Chọn một conversation
3. Nhấn nút video call
4. Quan sát logs trong console

### Bước 2: Answer Call (Receiver)
1. Trên device B (Receiver), nhận cuộc gọi
2. Nhấn Accept
3. Quan sát logs trong console

### Bước 3: Trigger Renegotiation
Chọn một trong các cách sau:

**Option A: Toggle Camera**
- Trên device A hoặc B, tắt camera rồi bật lại
- Quan sát logs trong khoảng ±10 giây

**Option B: Simulate Network Fluctuation**
- Tắt WiFi tạm thời (2-3 giây) rồi bật lại
- Quan sát logs trong khoảng ±10 giây

**Option C: Toggle Video Mute**
- Trên device A hoặc B, mute video rồi unmute
- Quan sát logs trong khoảng ±10 giây

## Capture Logs

### Filter Logs
Tìm các log có chứa:
- `🚨 REMOTE STREAM ACTION`
- `⚠️ remoteStream bị clear khi call đang active`
- `📹 Remote stream temporarily null`

### Thời gian capture
- Bắt đầu: 5 giây trước khi trigger renegotiation
- Kết thúc: 10 giây sau khi trigger renegotiation

### Log Format
Mỗi log entry sẽ có format:
```json
{
  "time": "2024-01-01T12:00:00.000Z",
  "file": "services/webRTCService.js",
  "function": "clearRemoteStream",
  "action": "CLEAR",
  "reason": "...",
  "oldId": "...",
  "newId": null,
  "callStatus": "connected",
  "force": false,
  "callerStack": "..."
}
```

## Phân tích kết quả

### Nếu thấy log `⚠️ remoteStream bị clear khi call đang active`:
- Đây là nguyên nhân gây flicker
- Kiểm tra `callerStack` để xác định chỗ nào gọi clear
- Kiểm tra `reason` để hiểu lý do

### Nếu không thấy warning nhưng vẫn flicker:
- Kiểm tra logs `📹 Remote stream temporarily null`
- Kiểm tra xem có chỗ nào gọi `setRemoteStream(null)` trực tiếp không
- Kiểm tra xem có chỗ nào gọi `setStableRemoteStreamState(null)` khi call chưa ended không

## Expected Behavior
- Không có log `⚠️ remoteStream bị clear khi call đang active` khi call đang connected
- Stable stream được giữ lại khi remoteStream tạm thời null
- Chỉ clear khi `callStatus === 'ended'`


