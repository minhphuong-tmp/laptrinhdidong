# Quick Setup: Thêm S3 Credentials vào Edge Function

## 🔑 S3 Credentials của bạn

- **Access Key ID**: `8ae5bd796da71d0d22804b754e36e71f`
- **Secret Access Key**: `a17bb2f377f01ce36fd1f5a768dfd84b2e05bc7bf4ba0f31f399b5ed71062a87`
- **Endpoint**: `https://oqtlakdvlmkaalymgrwd.storage.supabase.co/storage/v1/s3`
- **Region**: `ap-southeast-1`

## 📋 Cách thêm vào Edge Function Secrets

### Option 1: Trên Supabase Dashboard (Khuyến nghị)

1. Vào **Supabase Dashboard** → Project của bạn
2. Vào **Edge Functions** → **get-presigned-urls**
3. Click **Settings** (hoặc **Secrets**)
4. Thêm các secrets sau:

   ```
   S3_ACCESS_KEY_ID = 8ae5bd796da71d0d22804b754e36e71f
   S3_SECRET_ACCESS_KEY = a17bb2f377f01ce36fd1f5a768dfd84b2e05bc7bf4ba0f31f399b5ed71062a87
   S3_ENDPOINT = https://oqtlakdvlmkaalymgrwd.storage.supabase.co/storage/v1/s3
   S3_REGION = ap-southeast-1
   ```

5. Click **Save** hoặc **Deploy**

### Option 2: Dùng Supabase CLI

```bash
# Set secrets
supabase secrets set S3_ACCESS_KEY_ID=8ae5bd796da71d0d22804b754e36e71f
supabase secrets set S3_SECRET_ACCESS_KEY=a17bb2f377f01ce36fd1f5a768dfd84b2e05bc7bf4ba0f31f399b5ed71062a87
supabase secrets set S3_ENDPOINT=https://oqtlakdvlmkaalymgrwd.storage.supabase.co/storage/v1/s3
supabase secrets set S3_REGION=ap-southeast-1

# Deploy function
supabase functions deploy get-presigned-urls
```

## ✅ Kiểm tra

Sau khi thêm secrets và deploy:

1. Test upload document (file >= 5MB)
2. Kiểm tra log trong Edge Function:
   - `[Get Presigned URLs] Creating S3 presigned URLs...`
   - `[Get Presigned URLs] ✅ Created S3 presigned URL for chunk...`
3. Kiểm tra presigned URL format:
   - Phải là S3 endpoint trực tiếp
   - Format: `https://oqtlakdvlmkaalymgrwd.storage.supabase.co/storage/v1/s3/...`

## 🚨 Lưu ý bảo mật

- ⚠️ **KHÔNG commit credentials vào Git**
- ⚠️ **Đã thêm vào `.gitignore`** (nếu có file chứa credentials)
- ⚠️ **Chỉ dùng trong Edge Function** (server-side)
- ⚠️ **Không expose ra client**

## 📊 Kết quả mong đợi

### Trước (Supabase API):
- Tốc độ: ~93 KB/s
- File 15MB: ~107 giây

### Sau (S3 Presigned URL trực tiếp):
- Tốc độ: 3-10 MB/s (tùy mạng)
- File 15MB: ~2-5 giây
- **Nhanh hơn 20-50 lần!**







