# Batch Query Optimization - Tối Ưu Query Batch

## Vấn Đề Hiện Tại:

Với 13 conversations, đang chạy:
- 13 queries lastMessage (1/conversation)
- 13 queries COUNT unread (1/conversation)
- 13 queries members (1/conversation)
= **39 queries tuần tự!**

Mỗi query mất ~50-200ms round-trip → Tổng ~2000-7800ms

## Giải Pháp: Batch Queries

### Batch 1: Lấy TẤT CẢ lastMessages trong 1 query
```sql
SELECT * FROM messages 
WHERE conversation_id IN ('id1', 'id2', ..., 'id13')
AND created_at = (SELECT MAX(created_at) FROM messages m2 WHERE m2.conversation_id = messages.conversation_id)
ORDER BY conversation_id, created_at DESC;
```

### Batch 2: Lấy TẤT CẢ members trong 1 query
```sql
SELECT * FROM conversation_members
WHERE conversation_id IN ('id1', 'id2', ..., 'id13');
```

### Batch 3: COUNT unread - Tối ưu song song
Vì mỗi conversation có `last_read_at` khác nhau, khó batch trực tiếp. 
Có thể:
- Dùng RPC function trong database
- Hoặc chạy COUNT queries song song (vẫn nhanh hơn tuần tự)

## Kết Quả Mong Đợi:

**Trước:**
- 39 queries tuần tự
- ~2000-7800ms

**Sau:**
- 2 batch queries + 13 COUNT queries song song
- ~500-1000ms (giảm 2-8 lần!)

## Kỹ Thuật:
1. **Query Batching** - Gộp nhiều queries thành 1
2. **Parallel Execution** - Chạy batch queries song song
3. **Reduce Round-trips** - Giảm số lần gọi database


