# Hướng dẫn Setup S3 Credentials cho Presigned URL

## 🎯 Mục tiêu
Cấu hình S3 credentials để tạo presigned URLs trực tiếp, bypass Supabase API và tăng tốc độ upload.

## 📋 Bước 1: Lấy S3 Credentials từ Supabase Dashboard

### Cách 1: Từ Supabase Dashboard
1. Vào **Supabase Dashboard** → Project của bạn
2. Vào **Settings** → **API**
3. Tìm phần **"S3 Access Keys"** hoặc **"Storage S3 Credentials"**
4. Click **"Generate new key"** hoặc **"Create Access Key"**
5. Copy **Access Key ID** và **Secret Access Key**
6. ⚠️ **Lưu Secret Access Key ngay** - chỉ hiển thị 1 lần!

### Cách 2: Từ Supabase CLI
```bash
supabase storage s3-keys create
```

## 📋 Bước 2: Thêm S3 Credentials vào Edge Function Secrets

### Trên Supabase Dashboard:
1. Vào **Edge Functions** → **get-presigned-urls**
2. Vào **Settings** → **Secrets**
3. Thêm các secrets sau:
   - `S3_ACCESS_KEY_ID`: Access Key ID của bạn
   - `S3_SECRET_ACCESS_KEY`: Secret Access Key của bạn
   - `S3_ENDPOINT`: `https://oqtlakdvlmkaalymgrwd.storage.supabase.co/storage/v1/s3` (đã có sẵn)
   - `S3_REGION`: `ap-southeast-1` (đã có sẵn)

### Hoặc dùng CLI:
```bash
supabase secrets set S3_ACCESS_KEY_ID=your_access_key_id
supabase secrets set S3_SECRET_ACCESS_KEY=your_secret_access_key
supabase secrets set S3_ENDPOINT=https://oqtlakdvlmkaalymgrwd.storage.supabase.co/storage/v1/s3
supabase secrets set S3_REGION=ap-southeast-1
```

## 📋 Bước 3: Deploy Edge Function

### Trên Supabase Dashboard:
1. Vào **Edge Functions** → **get-presigned-urls**
2. Copy code từ `supabase/functions/get-presigned-urls/index.ts`
3. Paste và **Deploy**

### Hoặc dùng CLI:
```bash
supabase functions deploy get-presigned-urls
```

## ✅ Kiểm tra

Sau khi deploy, test upload document:
1. Upload file >= 5MB
2. Kiểm tra log trong Edge Function:
   - `[Get Presigned URLs] Creating S3 presigned URLs...`
   - `[Get Presigned URLs] ✅ Created S3 presigned URL for chunk...`
3. Kiểm tra presigned URL format:
   - Phải là S3 endpoint trực tiếp (không phải Supabase API)
   - Format: `https://oqtlakdvlmkaalymgrwd.storage.supabase.co/storage/v1/s3/...`

## 🚨 Lưu ý bảo mật

- ⚠️ **KHÔNG commit S3 credentials vào Git**
- ⚠️ **Chỉ dùng trong Edge Function** (server-side)
- ⚠️ **Không expose ra client**
- ⚠️ **Rotate keys định kỳ**

## 📊 Kết quả mong đợi

### Trước (Supabase API):
- Tốc độ: ~93 KB/s
- File 15MB: ~107 giây

### Sau (S3 Presigned URL trực tiếp):
- Tốc độ: 3-10 MB/s (tùy mạng)
- File 15MB: ~2-5 giây
- **Nhanh hơn 20-50 lần!**

## 🔧 Troubleshooting

### Lỗi: "S3 credentials not configured"
- Kiểm tra secrets đã được set chưa
- Kiểm tra tên secrets đúng: `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`

### Lỗi: "Access Denied"
- Kiểm tra Access Key có quyền truy cập bucket không
- Kiểm tra bucket name đúng không

### Lỗi: "Invalid endpoint"
- Kiểm tra `S3_ENDPOINT` đúng format không
- Kiểm tra `forcePathStyle: true` trong S3Client config





