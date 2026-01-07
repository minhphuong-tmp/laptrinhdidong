// Supabase Edge Function: Get Presigned URLs for Chunk Upload (FIXED)
// Fix: Canonical URI phải match với URL path thực tế

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
  filePath?: string;
}

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

async function hmacSha256Hex(key: string | Uint8Array, data: string): Promise<string> {
  const hash = await hmacSha256(key, data);
  return Array.from(hash)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  
  const hash = await crypto.subtle.digest("SHA-256", dataBytes);
  const hashArray = Array.from(new Uint8Array(hash));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 🔧 FIX: Tạo S3 presigned URL với canonical URI khớp URL thực tế
 * Supabase S3: URL có /storage/v1/s3 → canonical URI cũng phải có
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
  
  // Parse endpoint
  const endpointUrl = new URL(endpoint);
  const host = endpointUrl.host;
  
  // 🔧 FIX: Encode key từng segment
  const encodedKey = key.split("/").map(part => encodeURIComponent(part)).join("/");
  
  // 🔧 CRITICAL FIX: Canonical URI phải GIỐNG với URL path
  // URL thực tế: /storage/v1/s3/{bucket}/{key}
  // → Canonical URI: /storage/v1/s3/{bucket}/{key}
  const canonicalUri = `/storage/v1/s3/${bucket}/${encodedKey}`;
  
  console.log(`[Presigned URL] Bucket: ${bucket}`);
  console.log(`[Presigned URL] Key: ${key}`);
  console.log(`[Presigned URL] Canonical URI: ${canonicalUri}`);
  
  // Credential
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;
  
  // Query params (sorted)
  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`
  ].sort();
  const canonicalQueryString = queryParams.join("&");
  
  // Canonical headers (only host)
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";
  
  // Canonical request (6 lines)
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");
  
  console.log(`[Presigned URL] Canonical request:\n${canonicalRequest}`);
  
  // String to sign
  const canonicalRequestHash = await sha256Hex(canonicalRequest);
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;
  
  console.log(`[Presigned URL] String to sign:\n${stringToSign}`);
  
  // Calculate signature
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "s3");
  const kSigning = await hmacSha256(kService, "aws4_request");
  const signature = await hmacSha256Hex(kSigning, stringToSign);
  
  // Build presigned URL
  const baseEndpoint = `${endpointUrl.protocol}//${endpointUrl.host}`;
  const presignedUrl = `${baseEndpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  
  console.log(`[Presigned URL] Generated: ${presignedUrl.substring(0, 150)}...`);
  
  return presignedUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      fileId,
      totalChunks,
      bucketName,
      filePath,
    }: GetPresignedUrlsRequest = await req.json();

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

    // Get credentials
    const s3AccessKeyId = Deno.env.get("S3_ACCESS_KEY_ID") ?? "8ae5bd796da71d0d22804b754e36e71f";
    const s3SecretAccessKey = Deno.env.get("S3_SECRET_ACCESS_KEY") ?? "a17bb2f377f01ce36fd1f5a768dfd84b2e05bc7bf4ba0f31f399b5ed71062a87";
    const s3Endpoint = Deno.env.get("S3_ENDPOINT") ?? "https://oqtlakdvlmkaalymgrwd.storage.supabase.co";
    const s3Region = "us-east-1"; // Supabase yêu cầu us-east-1

    if (!s3AccessKeyId || !s3SecretAccessKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "S3 credentials not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[Get Presigned URLs] fileId: ${fileId}, totalChunks: ${totalChunks}, bucket: ${bucketName}`);

    const presignedUrls: string[] = [];
    
    // Single file upload
    if (totalChunks === 1 && filePath) {
      console.log(`[Get Presigned URLs] Creating presigned URL for: ${filePath}`);
      
      const presignedUrl = await createS3PresignedUrl(
        s3AccessKeyId,
        s3SecretAccessKey,
        s3Region,
        bucketName,
        filePath,
        s3Endpoint,
        3600
      );

      presignedUrls.push(presignedUrl);
    } else {
      // Multiple chunks
      const chunksPath = `temp/chunks/${fileId}`;

      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = `${chunksPath}/chunk_${i}`;
        console.log(`[Get Presigned URLs] Creating presigned URL for chunk ${i + 1}/${totalChunks}`);

        const presignedUrl = await createS3PresignedUrl(
          s3AccessKeyId,
          s3SecretAccessKey,
          s3Region,
          bucketName,
          chunkPath,
          s3Endpoint,
          3600
        );

        presignedUrls.push(presignedUrl);
      }
    }

    console.log(`[Get Presigned URLs] ✅ Created ${presignedUrls.length} presigned URL(s)`);

    return new Response(
      JSON.stringify({
        success: true,
        urls: presignedUrls,
        fileId: fileId,
        totalChunks: totalChunks,
        bucketName: bucketName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("[Get Presigned URLs] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});