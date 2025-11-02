# Tên Kỹ Thuật Tối Ưu: SQL COUNT thay vì Load Data

## Tên chính thức:

### 1. **Aggregate Pushdown** / **Push Down Aggregation**
- **Tiếng Việt**: Đẩy phép tổng hợp xuống database
- **Ý nghĩa**: Thay vì tính toán ở client (JavaScript), đẩy việc tính toán xuống database
- **Kỹ thuật**: Sử dụng các hàm aggregate (COUNT, SUM, AVG, etc.) ở database level

### 2. **Query Projection Optimization**
- **Tiếng Việt**: Tối ưu projection của query
- **Ý nghĩa**: Chỉ select những gì cần thiết, tránh select dư thừa
- **Ví dụ**: SELECT COUNT(*) thay vì SELECT * rồi đếm

### 3. **Over-fetching Prevention**
- **Tiếng Việt**: Ngăn chặn fetch quá nhiều data
- **Ý nghĩa**: Tránh tải dữ liệu không cần thiết về client
- **Ví dụ**: Chỉ cần số 0 nhưng load 87 messages

### 4. **Server-side Aggregation**
- **Tiếng Việt**: Tổng hợp phía server
- **Ý nghĩa**: Tính toán ở database server thay vì client
- **Lợi ích**: Database có index, tối ưu hơn

---

## Các kỹ thuật liên quan:

### **1. Data Transfer Optimization**
- Giảm lượng data transfer qua mạng
- Từ 87 objects (10 KB) → 1 số (4 bytes)

### **2. Network Optimization**
- Tối ưu băng thông mạng
- Giảm latency

### **3. Memory Optimization**
- Giảm memory footprint
- Không cần lưu 87 objects trong RAM

### **4. Computation at Source**
- Tính toán tại nguồn (database)
- Thay vì tính toán ở client

---

## Trong ngữ cảnh đề tài của bạn:

### **Đề tài: Tối ưu bộ nhớ (Memory Optimization)**

Kỹ thuật này có thể được phân loại vào:

1. **Query Optimization** - Tối ưu truy vấn
   - Aggregate Pushdown
   - Query Projection Optimization

2. **Data Transfer Optimization** - Tối ưu transfer dữ liệu
   - Over-fetching Prevention
   - Network Optimization

3. **Memory Optimization** - Tối ưu bộ nhớ
   - Giảm data load về RAM
   - Reduce Memory Footprint

---

## Tên đầy đủ cho báo cáo:

**"Tối ưu truy vấn database bằng Aggregate Pushdown và Over-fetching Prevention trong ứng dụng React Native"**

**Tiếng Anh:**
**"Database Query Optimization using Aggregate Pushdown and Over-fetching Prevention in React Native Application"**

---

## Các kỹ thuật tương tự:

### **1. SELECT chỉ cần thiết**
```sql
-- Thay vì:
SELECT * FROM messages;

-- Nên:
SELECT id, content FROM messages;
```

### **2. LIMIT kết quả**
```sql
-- Thay vì load tất cả:
SELECT * FROM messages;

-- Nên:
SELECT * FROM messages LIMIT 50;
```

### **3. Pagination**
```sql
-- Thay vì load tất cả:
SELECT * FROM messages;

-- Nên:
SELECT * FROM messages LIMIT 20 OFFSET 0;
```

### **4. Database Indexes**
- Tạo index để query nhanh hơn
- `CREATE INDEX idx_conversation_id ON messages(conversation_id);`

---

## Tài liệu tham khảo:

1. **Aggregate Pushdown Pattern**
   - Database Query Optimization
   - Distributed Systems Best Practices

2. **Over-fetching vs Under-fetching**
   - GraphQL concepts
   - REST API optimization

3. **Query Optimization Techniques**
   - Database performance tuning
   - SQL optimization


