# Copy Code vào Edge Function merge-chunks

## Bước 1: Mở Supabase Dashboard

1. Vào [Supabase Dashboard](https://supabase.com/dashboard)
2. Chọn project của bạn
3. Vào **Edge Functions** → Tìm function **merge-chunks**

## Bước 2: Copy Code

Copy toàn bộ code từ file `supabase/functions/merge-chunks/index.ts` và paste vào editor trong Dashboard.

## Bước 3: Deploy

Click nút **Deploy** hoặc **Save** để lưu và deploy function.

## Bước 4: Kiểm tra

1. Vào tab **Logs** để xem logs
2. Test lại upload file > 5MB
3. Kiểm tra logs để verify merge thành công

## Lưu ý

- Function sẽ tự động có access đến Supabase Storage
- Service Role Key được tự động inject vào environment variables
- Không cần config thêm gì


