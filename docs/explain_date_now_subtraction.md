# Giải Thích: Date.now() - apiStartTime

## 🔍 CÔNG THỨC:

```javascript
const apiStartTime = Date.now();        // Bắt đầu đo
await getConversations(...);            // Chờ API xong
const apiTime = Date.now() - apiStartTime; // Tính thời gian
```

## 📐 CÁCH HOẠT ĐỘNG:

### 1. `Date.now()` là gì?

`Date.now()` trả về số **milliseconds** từ ngày 1/1/1970 (Unix epoch)

**Ví dụ:**
```javascript
Date.now() // 1704123456789 (số rất lớn!)
```

### 2. Công thức đo thời gian:

```
Thời gian đã trôi qua = Thời điểm hiện tại - Thời điểm bắt đầu
```

```javascript
// Bước 1: Ghi nhận thời điểm BẮT ĐẦU
const start = Date.now(); // Ví dụ: 1000ms

// Bước 2: Thực hiện công việc
await doSomething(); // Mất thời gian...

// Bước 3: Ghi nhận thời điểm KẾT THÚC
const end = Date.now(); // Ví dụ: 1500ms

// Bước 4: Tính khoảng cách
const elapsed = end - start; // 1500 - 1000 = 500ms
```

---

## 🎯 VÍ DỤ THỰC TẾ:

### Code trong chatList.jsx:

```javascript
// Dòng 125: Ghi nhận thời điểm BẮT ĐẦU
const apiStartTime = Date.now(); 
// apiStartTime = 1704123456000 (ví dụ)

// Dòng 127: Chờ API xong (mất khoảng 2000ms)
const res = await getConversations(...);
// Trong lúc này, thời gian trôi qua 2000ms

// Dòng 128: Tính thời gian đã trôi qua
const apiTime = Date.now() - apiStartTime;
// Date.now() = 1704123458000 (lúc này)
// apiTime = 1704123458000 - 1704123456000 = 2000ms
```

---

## 🔄 TÓM TẮT:

| Bước | Code | Giá trị ví dụ | Giải thích |
|------|------|---------------|------------|
| **1. Bắt đầu** | `apiStartTime = Date.now()` | `1000` | Ghi nhận timestamp lúc bắt đầu |
| **2. Chờ API** | `await getConversations(...)` | - | API chạy, thời gian trôi qua |
| **3. Kết thúc** | `Date.now()` | `1500` | Timestamp lúc API xong |
| **4. Tính toán** | `apiTime = Date.now() - apiStartTime` | `500ms` | Khoảng cách = 1500 - 1000 |

---

## 💡 TẠI SAO DÙNG TRỪ?

**Vì đây là cách tính khoảng cách thời gian:**

```
Thời gian hiện tại - Thời gian trước đó = Khoảng cách
```

**Ví dụ đời thường:**
- Bắt đầu chạy: **10:00:00**
- Kết thúc chạy: **10:00:30**
- Thời gian chạy: **10:00:30 - 10:00:00 = 30 giây**

---

## ✅ KẾT LUẬN:

- `apiStartTime` = Thời điểm **BẮT ĐẦU** (lúc gọi API)
- `Date.now()` (sau API) = Thời điểm **KẾT THÚC** (lúc API xong)
- `Date.now() - apiStartTime` = **Khoảng thời gian đã trôi qua**

**KHÔNG phải "start - start" mà là "end - start"!**



