# Hướng Dẫn Deploy Edge Function merge-chunks

## Vấn đề
Edge Function `merge-chunks` chưa được deploy lên Supabase, gây ra lỗi:
```
Requested function was not found
```

## Giải pháp

### Cách 1: Deploy bằng Supabase CLI (Khuyến nghị)

1. **Cài đặt Supabase CLI** (nếu chưa có):
   ```bash
   npm install -g supabase
   ```

2. **Login vào Supabase**:
   ```bash
   supabase login
   ```

3. **Link project** (nếu chưa link):
   ```bash
   supabase link --project-ref oqtlakdvlmkaalymgrwd
   ```

4. **Deploy Edge Function**:
   ```bash
   supabase functions deploy merge-chunks
   ```

5. **Verify deployment**:
   - Vào Supabase Dashboard → Edge Functions
   - Kiểm tra function `merge-chunks` đã có trong danh sách

### Cách 2: Deploy qua Supabase Dashboard

1. Vào [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project của bạn
3. Vào **Edge Functions** → **Create new function**
4. Tên function: `merge-chunks`
5. Copy nội dung từ `supabase/functions/merge-chunks/index.ts`
6. Paste vào editor
7. Click **Deploy**

### Cách 3: Deploy bằng Git (nếu dùng Supabase Git integration)

1. Commit code:
   ```bash
   git add supabase/functions/merge-chunks
   git commit -m "Add merge-chunks Edge Function"
   git push
   ```

2. Supabase sẽ tự động deploy (nếu đã setup auto-deploy)

## Kiểm tra sau khi deploy

1. **Test Edge Function**:
   ```bash
   curl -X POST https://oqtlakdvlmkaalymgrwd.supabase.co/functions/v1/merge-chunks \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_ANON_KEY" \
     -d '{
       "fileId": "test",
       "totalChunks": 1,
       "finalPath": "test/test.mp4",
       "fileType": "video"
     }'
   ```

2. **Kiểm tra logs**:
   - Vào Supabase Dashboard → Edge Functions → merge-chunks → Logs
   - Xem logs để debug nếu có lỗi

## Lưu ý

- Edge Function cần có quyền truy cập Supabase Storage
- Service Role Key được dùng trong Edge Function để có full access
- Function sẽ tự động cleanup temp chunks sau khi merge

## Troubleshooting

### Lỗi: "Requested function was not found"
- **Nguyên nhân**: Function chưa được deploy
- **Giải pháp**: Deploy function theo hướng dẫn trên

### Lỗi: "Permission denied" khi merge
- **Nguyên nhân**: Service Role Key không đúng hoặc thiếu
- **Giải pháp**: Kiểm tra environment variables trong Supabase Dashboard

### Lỗi: "Chunk not found"
- **Nguyên nhân**: Chunks chưa được upload hoặc path sai
- **Giải pháp**: Kiểm tra chunks đã upload thành công chưa




