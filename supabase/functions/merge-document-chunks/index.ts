// Supabase Edge Function: Merge Document Chunks
// Merge các chunks của documents đã upload thành file hoàn chỉnh
// Documents dùng bucket "media" (cùng bucket với images/videos, phân biệt bằng folder path)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MergeDocumentChunksRequest {
  fileId: string;
  totalChunks: number;
  finalPath: string;
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
      finalPath,
    }: MergeDocumentChunksRequest = await req.json();

    // Validate input
    if (!fileId || !totalChunks || !finalPath) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: fileId, totalChunks, finalPath",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Supabase configuration missing",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Documents dùng bucket "media" (cùng bucket với images/videos, phân biệt bằng folder path)
    const bucketName = "media";

    console.log(`[Merge Document Chunks] Starting merge for fileId: ${fileId}, totalChunks: ${totalChunks}`);
    console.log(`[Merge Document Chunks] Using bucket: ${bucketName}`);
    console.log(`[Merge Document Chunks] Final path: ${finalPath}`);

    // Download chunks theo thứ tự và merge (streaming)
    const chunksPath = `temp/chunks/${fileId}`;
    const chunks: Uint8Array[] = [];

    // Download tất cả chunks theo thứ tự
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${chunksPath}/chunk_${i}`;
      console.log(`[Merge Document Chunks] Downloading chunk ${i + 1}/${totalChunks} from bucket "${bucketName}": ${chunkPath}`);

      try {
        const { data: chunkData, error: downloadError } = await supabase.storage
          .from(bucketName)
          .download(chunkPath);

        if (downloadError) {
          console.error(`[Merge Document Chunks] Error downloading chunk ${i}:`, downloadError);
          console.error(`[Merge Document Chunks] Error details:`, JSON.stringify(downloadError, null, 2));
          console.error(`[Merge Document Chunks] Bucket: ${bucketName}, Path: ${chunkPath}`);
          
          return new Response(
            JSON.stringify({
              success: false,
              error: `Failed to download chunk ${i}: ${downloadError.message || JSON.stringify(downloadError)}`,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        if (!chunkData) {
          console.error(`[Merge Document Chunks] Chunk ${i} data is null or undefined`);
          return new Response(
            JSON.stringify({
              success: false,
              error: `Chunk ${i} data is null or undefined`,
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        // Convert Blob to Uint8Array
        const arrayBuffer = await chunkData.arrayBuffer();
        chunks.push(new Uint8Array(arrayBuffer));
        console.log(`[Merge Document Chunks] ✅ Downloaded chunk ${i + 1}/${totalChunks} (${chunks[i].length} bytes)`);
      } catch (error) {
        console.error(`[Merge Document Chunks] Exception downloading chunk ${i}:`, error);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Exception downloading chunk ${i}: ${error.message || JSON.stringify(error)}`,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Merge chunks: Calculate total size and create merged buffer
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`[Merge Document Chunks] Merging ${totalChunks} chunks, total size: ${totalSize} bytes`);

    const mergedBuffer = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < chunks.length; i++) {
      mergedBuffer.set(chunks[i], offset);
      offset += chunks[i].length;
    }

    console.log(`[Merge Document Chunks] ✅ Merged buffer created (${mergedBuffer.length} bytes)`);

    // Upload merged file to final path
    console.log(`[Merge Document Chunks] Uploading merged file to: ${finalPath}`);

    // Documents dùng content type application/octet-stream
    const contentType = "application/octet-stream";

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(finalPath, mergedBuffer, {
        cacheControl: "3600",
        upsert: true,
        contentType: contentType,
      });

    if (uploadError) {
      console.error(`[Merge Document Chunks] Error uploading merged file:`, uploadError);
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to upload merged file: ${uploadError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[Merge Document Chunks] ✅ Merged file uploaded successfully: ${finalPath}`);

    // Cleanup: Delete temporary chunks
    console.log(`[Merge Document Chunks] Cleaning up temporary chunks...`);
    const chunkPathsToDelete = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkPathsToDelete.push(`${chunksPath}/chunk_${i}`);
    }

    const { error: deleteError } = await supabase.storage
      .from(bucketName)
      .remove(chunkPathsToDelete);

    if (deleteError) {
      console.warn(`[Merge Document Chunks] ⚠️ Warning: Failed to cleanup chunks:`, deleteError);
      // Không return error vì merge đã thành công
    } else {
      console.log(`[Merge Document Chunks] ✅ Cleaned up ${totalChunks} temporary chunks`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucketName).getPublicUrl(finalPath);

    console.log(`[Merge Document Chunks] ✅ Merge completed successfully! Public URL: ${publicUrl}`);

    return new Response(
      JSON.stringify({
        success: true,
        fileUrl: finalPath,
        publicUrl: publicUrl,
        message: `Successfully merged ${totalChunks} chunks into ${finalPath}`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[Merge Document Chunks] Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
