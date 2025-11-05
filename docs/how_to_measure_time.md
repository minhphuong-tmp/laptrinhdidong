# Cách Đo Thời Gian Trong Code

## 📐 PHƯƠNG PHÁP CHÍNH: `Date.now()`

Tất cả đều dùng **`Date.now()`** để đo thời gian (milliseconds).

---

## 1. 📋 CHAT LIST - Đo thời gian load conversations

### File: `app/(main)/chatList.jsx`

```javascript
// === BƯỚC 1: Bắt đầu đo (khi mount) ===
useEffect(() => {
    if (!loadTimeRef.current && user?.id) {
        loadTimeRef.current = Date.now(); // 🎯 BẮT ĐẦU ĐO
        console.log('=========== BẮT ĐẦU ĐO TỐC ĐỘ CHAT LIST ===========');
        
        // Load conversations...
    }
}, [user?.id]);

// === BƯỚC 2: Đo thời gian API riêng ===
const loadConversations = async () => {
    const apiStartTime = Date.now(); // 🎯 BẮT ĐẦU ĐO API
    
    const res = await getConversations(user.id);
    
    const apiTime = Date.now() - apiStartTime; // ⏱️ TÍNH THỜI GIAN API
    
    // === BƯỚC 3: Tính tổng thời gian ===
    const totalTime = loadTimeRef.current 
        ? Date.now() - loadTimeRef.current  // ⏱️ TỔNG THỜI GIAN
        : 0;
    
    console.log('⏱️ Tổng thời gian load:', totalTime, 'ms');
    console.log('⏱️ Thời gian API:', apiTime, 'ms');
}
```

**Kết quả:**
- `totalTime`: Thời gian từ khi mount đến khi load xong
- `apiTime`: Chỉ thời gian gọi API

---

## 2. 💬 CHAT SCREEN - Đo thời gian load messages + media

### File: `app/(main)/chat.jsx`

```javascript
// === BƯỚC 1: Bắt đầu đo (khi vào chat) ===
useEffect(() => {
    if (conversationId) {
        loadTimeRef.current = Date.now(); // 🎯 BẮT ĐẦU ĐO
        console.log('=========== BẮT ĐẦU ĐO TỐC ĐỘ CHAT ===========');
    }
}, [conversationId]);

// === BƯỚC 2: Kiểm tra khi tất cả media đã load ===
function checkAllMediaLoadedAndLog() {
    if (
        loadTimeRef.current &&           // Đã bắt đầu đo
        imagesDone &&                    // Tất cả ảnh đã load
        videosDone &&                    // Tất cả video đã load
        !logHasRun.current                // Chưa log
    ) {
        const end = Date.now();
        const totalTime = end - loadTimeRef.current; // ⏱️ TÍNH THỜI GIAN
        
        console.log('⏱️ Tổng thời gian load (messages + media):', totalTime, 'ms');
        
        logHasRun.current = true;
        loadTimeRef.current = null; // Reset
    }
}
```

**Đặc biệt:**
- Đợi tất cả ảnh và video load xong mới tính tổng thời gian
- Dùng `Set` để track từng media item đã load chưa

---

## 3. 🔧 CHAT SERVICE - Đo thời gian từng bước query

### File: `services/chatService.js`

```javascript
export const getConversations = async (userId, options = {}) => {
    // === BƯỚC 1: Khởi tạo metrics object ===
    const metrics = {
        startTime: Date.now(),        // 🎯 BẮT ĐẦU ĐO TỔNG
        steps: {},                     // Lưu thời gian từng bước
        queries: {},                   // Đếm số queries
        data: {}                       // Thống kê data
    };
    
    try {
        // === BƯỚC 2: Đo từng bước query ===
        
        // Query 1: Initial query
        const step1Start = Date.now(); // 🎯 BẮT ĐẦU BƯỚC 1
        const { data, error } = await supabase
            .from('conversation_members')
            .select(...)
            .eq('user_id', userId);
        metrics.steps.initialQuery = Date.now() - step1Start; // ⏱️ THỜI GIAN BƯỚC 1
        
        // Query 2: Promise.all cho tất cả conversations
        const step2Start = Date.now(); // 🎯 BẮT ĐẦU BƯỚC 2
        const conversationsWithMessages = await Promise.all(
            data.map(async (item) => {
                // Đo thời gian từng query trong Promise.all
                const lastMsgStart = Date.now(); // 🎯 ĐO LAST MESSAGE
                const { data: lastMessage } = await supabase...;
                convMetrics.lastMessageTime = Date.now() - lastMsgStart; // ⏱️
                
                const allMsgStart = Date.now(); // 🎯 ĐO COUNT UNREAD
                const { count } = await supabase...;
                convMetrics.allMessagesTime = Date.now() - allMsgStart; // ⏱️
                
                const membersStart = Date.now(); // 🎯 ĐO MEMBERS
                const { data: members } = await supabase...;
                convMetrics.membersTime = Date.now() - membersStart; // ⏱️
                
                return {...};
            })
        );
        metrics.steps.promiseAll = Date.now() - step2Start; // ⏱️ THỜI GIAN BƯỚC 2
        
        // Query 3: Sort
        const step3Start = Date.now(); // 🎯 BẮT ĐẦU SORT
        conversationsWithMessages.sort(...);
        metrics.steps.sortTime = Date.now() - step3Start; // ⏱️ THỜI GIAN SORT
        
        // === BƯỚC 3: Tính tổng thời gian ===
        metrics.totalTime = Date.now() - metrics.startTime; // ⏱️ TỔNG THỜI GIAN
        
        // Log metrics
        console.log('⏱️ Tổng thời gian:', metrics.totalTime, 'ms');
        console.log('⏱️ Promise.all:', metrics.steps.promiseAll, 'ms');
        console.log('⏱️ Trung bình COUNT unread:', metrics.steps.avgAllMessagesTime, 'ms');
        
        return { success: true, data: cleanData, metrics };
    } catch (error) {
        metrics.totalTime = Date.now() - metrics.startTime; // ⏱️ VẪN TÍNH THỜI GIAN KHI LỖI
        return { success: false, metrics };
    }
};
```

**Đặc biệt:**
- Đo từng query riêng biệt trong `Promise.all`
- Tính trung bình, min, max cho các queries
- Track data transfer bằng `JSON.stringify().length`

---

## 📊 CÔNG THỨC TỔNG QUÁT:

```javascript
// === PATTERN CHUẨN ===

// 1. Bắt đầu đo
const startTime = Date.now();

// 2. Thực hiện công việc
await doSomething();

// 3. Tính thời gian
const elapsedTime = Date.now() - startTime;
console.log('Thời gian:', elapsedTime, 'ms');
```

---

## 🎯 CÁC CASE ĐẶC BIỆT:

### 1. **Đo nhiều bước lồng nhau:**
```javascript
const totalStart = Date.now();

const step1Start = Date.now();
await step1();
const step1Time = Date.now() - step1Start;

const step2Start = Date.now();
await step2();
const step2Time = Date.now() - step2Start;

const totalTime = Date.now() - totalStart;
```

### 2. **Đo trong Promise.all:**
```javascript
const promiseStart = Date.now();
const results = await Promise.all(
    items.map(async (item) => {
        const itemStart = Date.now();
        await processItem(item);
        return {
            data: item,
            time: Date.now() - itemStart
        };
    })
);
const promiseTime = Date.now() - promiseStart;
```

### 3. **Đo khi có điều kiện:**
```javascript
if (shouldMeasure) {
    const start = Date.now();
    await doWork();
    const time = Date.now() - start;
    console.log('Thời gian:', time, 'ms');
}
```

---

## ⚠️ LƯU Ý:

1. **`Date.now()` trả về milliseconds** (1000ms = 1 giây)
2. **Luôn reset `startTime`** khi bắt đầu đo mới
3. **Dùng `useRef`** để lưu thời gian giữa các renders (React)
4. **Tính thời gian cả khi lỗi** để đảm bảo metrics chính xác

---

## 📝 TÓM TẮT:

| Mục đích | Code |
|----------|------|
| **Bắt đầu đo** | `const start = Date.now();` |
| **Tính thời gian** | `const time = Date.now() - start;` |
| **Log kết quả** | `console.log('Thời gian:', time, 'ms');` |


