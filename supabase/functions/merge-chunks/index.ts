// Supabase Edge Function: Merge Chunks
// Merge các chunks đã upload thành file hoàn chỉnh

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MergeChunksRequest {
  fileId: string;
  totalChunks: number;
  finalPath: string;
  fileType: string;
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
      fileType,
    }: MergeChunksRequest = await req.json();

    // Validate input
    if (!fileId || !totalChunks || !finalPath || !fileType) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required parameters: fileId, totalChunks, finalPath, fileType",
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

    console.log(`[Merge Chunks] Starting merge for fileId: ${fileId}, totalChunks: ${totalChunks}`);

    // Download chunks theo thứ tự và merge (streaming)
    const chunksPath = `temp/chunks/${fileId}`;
    const chunks: Uint8Array[] = [];

    // Download tất cả chunks theo thứ tự
    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = `${chunksPath}/chunk_${i}`;
      console.log(`[Merge Chunks] Downloading chunk ${i + 1}/${totalChunks}: ${chunkPath}`);

      const { data: chunkData, error: downloadError } = await supabase.storage
        .from("media")
        .download(chunkPath);

      if (downloadError) {
        console.error(`[Merge Chunks] Error downloading chunk ${i}:`, downloadError);
        return new Response(
          JSON.stringify({
            success: false,
            error: `Failed to download chunk ${i}: ${downloadError.message}`,
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
      console.log(`[Merge Chunks] ✅ Downloaded chunk ${i + 1}/${totalChunks} (${chunks[i].length} bytes)`);
    }

    // Merge chunks: Calculate total size and create merged buffer
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`[Merge Chunks] Merging ${totalChunks} chunks, total size: ${totalSize} bytes`);

    const mergedBuffer = new Uint8Array(totalSize);
    let offset = 0;

    for (let i = 0; i < chunks.length; i++) {
      mergedBuffer.set(chunks[i], offset);
      offset += chunks[i].length;
    }

    console.log(`[Merge Chunks] ✅ Merged buffer created (${mergedBuffer.length} bytes)`);

    // Upload merged file to final path
    console.log(`[Merge Chunks] Uploading merged file to: ${finalPath}`);

    // Determine content type based on file type
    const contentType =
      fileType === "image"
        ? "image/jpeg"
        : fileType === "video"
        ? "video/mp4"
        : "application/octet-stream";

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("media")
      .upload(finalPath, mergedBuffer, {
        cacheControl: "3600",
        upsert: true,
        contentType: contentType,
      });

    if (uploadError) {
      console.error(`[Merge Chunks] Error uploading merged file:`, uploadError);
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

    console.log(`[Merge Chunks] ✅ Merged file uploaded successfully: ${finalPath}`);

    // Cleanup: Delete temporary chunks
    console.log(`[Merge Chunks] Cleaning up temporary chunks...`);
    const chunkPathsToDelete = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkPathsToDelete.push(`${chunksPath}/chunk_${i}`);
    }

    const { error: deleteError } = await supabase.storage
      .from("media")
      .remove(chunkPathsToDelete);

    if (deleteError) {
      console.warn(`[Merge Chunks] ⚠️ Warning: Failed to cleanup chunks:`, deleteError);
      // Không return error vì merge đã thành công
    } else {
      console.log(`[Merge Chunks] ✅ Cleaned up ${totalChunks} temporary chunks`);
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("media").getPublicUrl(finalPath);

    console.log(`[Merge Chunks] ✅ Merge completed successfully! Public URL: ${publicUrl}`);

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
    console.error("[Merge Chunks] Error:", error);
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






