// Supabase Edge Function: Get Presigned URLs for Chunk Upload
// Dùng Supabase SDK createSignedUploadUrl (ổn định, mặc dù vẫn đi qua Supabase API)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GetPresignedUrlsRequest {
  fileId: string;
  totalChunks: number;
  bucketName: string;
}

/**
 * HMAC SHA256 (async)
 */
async function hmacSha256(key: string | Uint8Array, data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : new Uint8Array(key);
  const dataBytes = encoder.encode(data);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, dataBytes);
  return new Uint8Array(signature);
}

/**
 * HMAC SHA256 Hex (async)
 */
async function hmacSha256Hex(key: string | Uint8Array, data: string): Promise<string> {
  const hash = await hmacSha256(key, data);
  return Array.from(hash)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * SHA256 Hex (async)
 */
async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  
  const hash = await crypto.subtle.digest("SHA-256", dataBytes);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * URL encode (RFC 3986) - chỉ encode các ký tự đặc biệt, không encode /
 */
function uriEncode(str: string, encodeSlash: boolean = false): string {
  return encodeURIComponent(str)
    .replace(/%2F/g, encodeSlash ? "%2F" : "/")
    .replace(/[!'()*]/g, (c) => {
      return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
}

/**
 * Tạo S3 presigned URL bằng S3 Signature V4 (manual implementation)
 * Format: Path-style cho Supabase Storage
 */
async function createS3PresignedUrl(
  accessKeyId: string,
  secretAccessKey: string,
  region: string,
  bucket: string,
  key: string,
  endpoint: string,
  expiresIn: number = 3600
): Promise<string> {
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, "");
  const amzDate = dateStamp + "T" + now.toISOString().slice(11, 19).replace(/:/g, "") + "Z";
  
  // ⚠️ QUAN TRỌNG: Supabase Storage S3 là reverse proxy với prefix /storage/v1/s3
  // Endpoint phải KHÔNG có /storage/v1/s3 (chỉ domain)
  // Bucket phải BAO GỒM prefix /storage/v1/s3/{bucketName}
  
  // Parse endpoint để lấy host (loại bỏ /storage/v1/s3 nếu có)
  let endpointUrl: URL;
  if (endpoint.includes('/storage/v1/s3')) {
    // Loại bỏ /storage/v1/s3 khỏi endpoint
    const baseUrl = endpoint.replace('/storage/v1/s3', '');
    endpointUrl = new URL(baseUrl);
  } else {
    endpointUrl = new URL(endpoint);
  }
  const host = endpointUrl.host;
  
  // Key encoding: encode từng segment, giữ / nguyên
  const encodedKey = key.split("/").map(part => encodeURIComponent(part)).join("/");
  
  // ✅ QUAN TRỌNG: Canonical URI KHÔNG được có /storage/v1/s3 prefix
  // Canonical URI chỉ là: /{bucket}/{key}
  // Ví dụ: bucket = "media", key = "documents/xxx.pdf" → canonicalUri = "/media/documents/xxx.pdf"
  const canonicalUri = `/${bucket}/${encodedKey}`;
  
  // ⚠️ LƯU Ý: URL thực tế vẫn cần có /storage/v1/s3 prefix (sẽ thêm khi build presigned URL)
  // URL ≠ Canonical URI (đây là chỗ 99% người chết)
  
  console.log(`[Get Presigned URLs] Original bucket: ${bucket}`);
  console.log(`[Get Presigned URLs] Key: ${key}`);
  console.log(`[Get Presigned URLs] Encoded key: ${encodedKey}`);
  console.log(`[Get Presigned URLs] Canonical URI (KHÔNG có /storage/v1/s3): ${canonicalUri}`);
  
  // Credential scope
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  
  // Canonical query string (phải sort theo alphabet)
  // X-Amz-Credential phải encode đúng (encode cả / thành %2F)
  // Canonical query string (phải sort theo alphabet)
  // X-Amz-Credential phải encode đúng (encode cả / thành %2F)
  // ✅ GIẢI PHÁP: CHỈ ký host header - KHÔNG ký content-type hay headers khác
  // RNBlobUtil có thể tự thêm headers, nhưng presigned URL chỉ verify host header
  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`  // ✅ CHỈ ký host header
  ];
  // Sort query params theo alphabet
  queryParams.sort();
  const canonicalQueryString = queryParams.join("&");
  
  console.log(`[Get Presigned URLs] Canonical query string: ${canonicalQueryString}`);
  
  // Canonical headers (theo S3 spec: mỗi header một dòng, kết thúc bằng newline)
  // ✅ GIẢI PHÁP: CHỈ ký host header
  // KHÔNG ký content-type, content-length, hay headers khác
  // RNBlobUtil muốn thêm headers gì → cứ để nó thêm, presigned URL KHÔNG QUAN TÂM
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";  // ✅ CHỈ ký host header
  const payloadHash = "UNSIGNED-PAYLOAD";
  
  // Canonical request format (theo S3 Signature V4 spec):
  // HTTPMethod\n
  // CanonicalURI\n
  // CanonicalQueryString\n
  // CanonicalHeaders\n
  // SignedHeaders\n
  // HashedPayload
  // LƯU Ý: Không có empty line, mỗi phần cách nhau bằng \n
  const canonicalRequest = `PUT\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  // Debug: Log canonical request với newlines visible
  console.log(`[Get Presigned URLs] Canonical request (6 lines):`);
  const lines = canonicalRequest.split('\n');
  lines.forEach((line, idx) => {
    console.log(`  Line ${idx + 1}: "${line}"`);
  });
  
  // String to sign
  const algorithm = "AWS4-HMAC-SHA256";
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  
  console.log(`[Get Presigned URLs] String to sign:`, stringToSign);
  
  // Calculate signature
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "s3");
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = await hmacSha256Hex(kSigning, stringToSign);
  
  // Build presigned URL
  // ⚠️ QUAN TRỌNG: URL thực tế PHẢI có /storage/v1/s3 prefix
  // Nhưng canonical URI thì KHÔNG có prefix này
  // URL ≠ Canonical URI (đây là chỗ 99% người chết)
  const baseEndpoint = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const urlPath = `/storage/v1/s3${canonicalUri}`;  // ✅ Thêm /storage/v1/s3 vào URL thực tế
  const presignedUrl = `${baseEndpoint}${urlPath}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  
  console.log(`[Get Presigned URLs] Base endpoint: ${baseEndpoint}`);
  console.log(`[Get Presigned URLs] URL path (có /storage/v1/s3): ${urlPath}`);
  console.log(`[Get Presigned URLs] Canonical URI (KHÔNG có /storage/v1/s3): ${canonicalUri}`);
  console.log(`[Get Presigned URLs] Final presigned URL: ${presignedUrl.substring(0, 200)}...`);
  
  return presignedUrl;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const {
      fileId,
      totalChunks,
      bucketName,
      filePath, // Optional: cho single file upload (không chunk)
    }: GetPresignedUrlsRequest & { filePath?: string } = await req.json();

    // Validate input
    if (!fileId || !totalChunks || !bucketName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: fileId, totalChunks, bucketName",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get S3 credentials
    // ⚠️ WARNING: Hardcoded credentials chỉ để test. Sau khi test xong, nên xóa và dùng environment variables!
    const s3AccessKeyId = Deno.env.get("S3_ACCESS_KEY_ID") ?? "8ae5bd796da71d0d22804b754e36e71f";
    const s3SecretAccessKey = Deno.env.get("S3_SECRET_ACCESS_KEY") ?? "a17bb2f377f01ce36fd1f5a768dfd84b2e05bc7bf4ba0f31f399b5ed71062a87";
    // ⚠️ QUAN TRỌNG: Endpoint KHÔNG được có /storage/v1/s3 (chỉ domain)
    const s3Endpoint = Deno.env.get("S3_ENDPOINT") ?? "https://oqtlakdvlmkaalymgrwd.storage.supabase.co";
    // 🚨 BẮT BUỘC: Supabase S3 gateway CHỈ chấp nhận us-east-1 (không phải ap-southeast-1 hay region project)
    // Credential scope phải là: .../us-east-1/s3/aws4_request
    const s3Region = Deno.env.get("S3_REGION") ?? "us-east-1";

    if (!s3AccessKeyId || !s3SecretAccessKey) {
      console.error("[Get Presigned URLs] S3 credentials missing");
      return new Response(
        JSON.stringify({
          success: false,
          error: "S3 credentials not configured. Please set S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in Edge Function secrets.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[Get Presigned URLs] Creating S3 presigned URLs for fileId: ${fileId}, totalChunks: ${totalChunks}`);
    console.log(`[Get Presigned URLs] Using bucket: ${bucketName}`);
    console.log(`[Get Presigned URLs] S3 endpoint: ${s3Endpoint}`);
    console.log(`[Get Presigned URLs] S3 region: ${s3Region}`);
    console.log(`[Get Presigned URLs] S3 Access Key ID: ${s3AccessKeyId.substring(0, 10)}...`);

    const presignedUrls: string[] = [];
    
    // Nếu totalChunks = 1 và có filePath → single file upload (không chunk)
    if (totalChunks === 1 && filePath) {
      console.log(`[Get Presigned URLs] Creating S3 presigned URL for single file: ${filePath}`);
      
      try {
        const presignedUrl = await createS3PresignedUrl(
          s3AccessKeyId,
          s3SecretAccessKey,
          s3Region,
          bucketName,
          filePath,
          s3Endpoint,
          3600 // 1 hour expiration
        );

        if (!presignedUrl) {
          console.error(`[Get Presigned URLs] Presigned URL is null for single file`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to create presigned URL for single file: URL is null`,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        presignedUrls.push(presignedUrl);
        console.log(`[Get Presigned URLs] ✅ Created S3 presigned URL for single file`);
        console.log(`[Get Presigned URLs] URL preview: ${presignedUrl.substring(0, 150)}...`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[Get Presigned URLs] Exception creating S3 presigned URL for single file:`, errorMessage);
        console.error(`[Get Presigned URLs] Error stack:`, errorStack);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Exception creating presigned URL for single file: ${errorMessage}`,
            details: errorStack ? errorStack.substring(0, 500) : undefined,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Multiple chunks upload
      const chunksPath = `temp/chunks/${fileId}`;

      // Tạo S3 presigned URL cho từng chunk (manual signing - không dùng AWS SDK)
      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = `${chunksPath}/chunk_${i}`;
        console.log(`[Get Presigned URLs] Creating S3 presigned URL for chunk ${i + 1}/${totalChunks}: ${chunkPath}`);

      try {
        // Tạo presigned URL bằng S3 Signature V4 (manual)
        const presignedUrl = await createS3PresignedUrl(
          s3AccessKeyId,
          s3SecretAccessKey,
          s3Region,
          bucketName,
          chunkPath,
          s3Endpoint,
          3600 // 1 hour expiration
        );

        if (!presignedUrl) {
          console.error(`[Get Presigned URLs] Presigned URL is null for chunk ${i}`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to create presigned URL for chunk ${i}: URL is null`,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        presignedUrls.push(presignedUrl);
        console.log(`[Get Presigned URLs] ✅ Created S3 presigned URL for chunk ${i + 1}/${totalChunks}`);
        console.log(`[Get Presigned URLs] URL preview: ${presignedUrl.substring(0, 150)}...`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(`[Get Presigned URLs] Exception creating S3 presigned URL for chunk ${i}:`, errorMessage);
        console.error(`[Get Presigned URLs] Error stack:`, errorStack);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Exception creating presigned URL for chunk ${i}: ${errorMessage}`,
            details: errorStack ? errorStack.substring(0, 500) : undefined,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }
    }

    console.log(`[Get Presigned URLs] ✅ Successfully created ${presignedUrls.length} S3 presigned URL(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        urls: presignedUrls,
        fileId: fileId,
        totalChunks: totalChunks,
        bucketName: bucketName,
        message: `Successfully created ${presignedUrls.length} S3 presigned URLs`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[Get Presigned URLs] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("[Get Presigned URLs] Error stack:", errorStack);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage || "Unknown error occurred",
        details: errorStack ? errorStack.substring(0, 500) : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
