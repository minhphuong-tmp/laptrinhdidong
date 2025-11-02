# Nghiên Cứu: Cách Facebook & Apps Chat Lớn Tối Ưu Chat List

## 🔥 CÁC KỸ THUẬT CHÍNH:

### 1. **Show Cached Data First (Ưu tiên cao nhất!)**
**Cách Facebook làm:**
- Khi mở app → Hiển thị **cache cũ** ngay lập tức (0ms)
- Load data mới ở **background** và update dần
- User thấy UI ngay, không phải đợi

**Cách implement:**
- Lưu conversations vào AsyncStorage/Realm
- Load từ cache trước
- Fetch API sau và merge/update

---

### 2. **Batch Queries + GraphQL**
**Facebook dùng:**
- **GraphQL** cho phép client request chính xác data cần
- **Batch requests** - gộp nhiều queries thành 1
- Giảm từ 39 queries → 1-3 queries

**Cách implement:**
- Batch members: 1 query cho tất cả conversations
- Batch lastMessages: Query messages mới nhất, group ở client

---

### 3. **Denormalization - Lưu sẵn trong DB**
**Facebook làm:**
- Lưu `last_message_text`, `last_message_time`, `unread_count` **trực tiếp trong `conversations` table**
- Không cần query `messages` table khi load list
- Update khi có message mới (via trigger hoặc code)

**Ví dụ:**
```sql
conversations table:
- id
- name
- last_message_text (denormalized)
- last_message_time (denormalized)
- unread_count (denormalized) ← SQL COUNT trigger
```

**Lợi ích:**
- Load chat list: Chỉ cần query `conversations` table (1 query!)
- Rất nhanh vì đã có sẵn

---

### 4. **Progressive Loading / Skeleton Screen**
- Hiển thị **skeleton/placeholder** ngay
- Load data từng phần (prioritize visible items)
- FlatList chỉ render items visible (virtualization)

---

### 5. **Optimistic UI Updates**
- Update UI ngay khi user thao tác
- Sync với server ở background
- Rollback nếu fail

---

### 6. **WebSocket cho Real-time**
- Nhận updates real-time
- Không cần poll/refresh
- Cập nhật unread count, last message tự động

---

## 🎯 ĐỀ XUẤT ÁP DỤNG (theo độ ưu tiên):

### **Priority 1: Show Cached Data First** ⭐⭐⭐
**Impact: Từ 2000ms → 0ms (hiển thị ngay)**

```javascript
// Load từ cache trước
const cachedData = await loadFromStorage();
setConversations(cachedData); // Show ngay!

// Fetch mới ở background
const freshData = await getConversations();
setConversations(freshData); // Update sau
```

---

### **Priority 2: Denormalization** ⭐⭐⭐
**Impact: Từ 39 queries → 1 query**

Thêm vào `conversations` table:
- `last_message_id`
- `last_message_text`
- `last_message_time`
- `unread_count`
- `last_message_sender_id`

**Trigger** update khi có message mới.

---

### **Priority 3: Batch Queries** ⭐⭐
**Impact: Giảm 50% số queries**

Gộp members query, optimize lastMessages query.

---

### **Priority 4: Progressive Loading** ⭐
Skeleton screen, lazy load images/avatars.

---

## 📊 SO SÁNH:

| Kỹ Thuật | Queries | Thời Gian | Độ Khó |
|----------|---------|-----------|--------|
| Hiện tại | 39 | 2000ms | - |
| + Cache First | 39 | 0ms (show) | Dễ |
| + Denormalization | 1-2 | 100-300ms | Trung bình |
| + Batch Queries | 3-5 | 500-800ms | Dễ |
| Tất cả kết hợp | 1-2 | 0ms (show) + 100ms (sync) | - |

---

## 🚀 KẾT LUẬN:

**Facebook nhanh vì:**
1. **Show cached data ngay** (không đợi API)
2. **Denormalization** (không query messages table)
3. **Batch queries** (gộp nhiều queries)
4. **Real-time updates** (WebSocket)

**Áp dụng ngay:**
1. ✅ Cache conversations trong AsyncStorage
2. ✅ Show cached data trước khi fetch
3. 🔄 (Sau) Denormalization trong database


