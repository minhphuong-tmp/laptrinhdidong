import * as ImageManipulator from 'expo-image-manipulator';
import { createThumbnail } from 'react-native-create-thumbnail';
import { supabaseUrl } from "../constants/index";
import { supabase } from "../lib/supabase";

// ===== CHUNK UPLOAD CONFIG =====
export const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk (tăng từ 5MB để giảm số lượng chunks và overhead)
export const MAX_PARALLEL_UPLOADS = 15; // Upload tối đa 15 chunks song song (tăng từ 10 để tăng tốc độ upload)
export const CHUNK_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB - file >= 5MB sẽ dùng chunk upload
export const CHUNK_RETRY_ATTEMPTS = 3; // Số lần retry khi upload chunk fail
export const CHUNK_RETRY_DELAY = 1000; // Delay giữa các lần retry (ms)

// ===== HELPER FUNCTIONS: CHUNK UPLOAD (BINARY ONLY - KHÔNG BASE64) =====

/**
 * Tạo thumbnail từ image hoặc video
 * @param {string} fileUri - URI của file
 * @param {string} type - 'image' hoặc 'video'
 * @returns {Promise<{uri: string, width: number, height: number}>}
 */
export const createThumbnailFromFile = async (fileUri, type) => {
    const typeEmoji = type === 'video' ? '🎥' : '📷';
    console.log(`${typeEmoji} [Thumbnail] Đang tạo thumbnail...`);
    
    try {
        if (type === 'image') {
            // Image: Resize bằng expo-image-manipulator
            const manipResult = await ImageManipulator.manipulateAsync(
                fileUri,
                [{ resize: { width: 300 } }], // Resize về width 300px (giữ aspect ratio)
                { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
            );
            
            console.log(`${typeEmoji} [Thumbnail] ✅ Thumbnail created: ${manipResult.uri}`);
            return {
                uri: manipResult.uri,
                width: manipResult.width,
                height: manipResult.height
            };
        } else {
            // Video: Tạo thumbnail từ frame đầu tiên
            const thumbnail = await createThumbnail({
                url: fileUri,
                timeStamp: 1000, // Lấy frame tại giây thứ 1
                width: 300,
                height: 300
            });
            
            console.log(`${typeEmoji} [Thumbnail] ✅ Thumbnail created: ${thumbnail.path}`);
            return {
                uri: thumbnail.path,
                width: thumbnail.width || 300,
                height: thumbnail.height || 300
            };
        }
    } catch (error) {
        console.log(`${typeEmoji} [Thumbnail] ❌ Error creating thumbnail:`, error);
        throw error;
    }
};

/**
 * Upload thumbnail lên Supabase Storage
 * @param {string} thumbnailUri - URI của thumbnail (local)
 * @param {string} fileId - Unique ID của file
 * @param {string} type - 'image' hoặc 'video'
 * @returns {Promise<{success: boolean, thumbnailUrl?: string, error?: string}>}
 */
export const uploadThumbnail = async (thumbnailUri, fileId, type) => {
    const typeEmoji = type === 'video' ? '🎥' : '📷';
    console.log(`${typeEmoji} [Thumbnail] Đang upload thumbnail...`);
    
    try {
        // Đọc thumbnail thành ArrayBuffer
        const response = await fetch(thumbnailUri);
        const thumbnailData = await response.arrayBuffer();
        const thumbnailUint8Array = new Uint8Array(thumbnailData);
        
        // Upload lên Storage
        const thumbnailPath = `thumbnails/${fileId}.jpg`;
        const { data, error } = await supabase.storage
            .from('media')
            .upload(thumbnailPath, thumbnailUint8Array, {
                cacheControl: '3600',
                upsert: true,
                contentType: 'image/jpeg'
            });
        
        if (error) {
            throw error;
        }
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('media')
            .getPublicUrl(thumbnailPath);
        
        console.log(`${typeEmoji} [Thumbnail] ✅ Thumbnail uploaded: ${publicUrl}`);
        return {
            success: true,
            thumbnailUrl: publicUrl
        };
    } catch (error) {
        console.log(`${typeEmoji} [Thumbnail] ❌ Upload error:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Load file thành Blob (Binary Only - KHÔNG base64)
 * @param {string} fileUri - URI của file
 * @returns {Promise<Blob>} Blob object của file
 */
export const getFileBlob = async (fileUri) => {
    // Dùng fetch để load file thành Blob (KHÔNG base64)
    const response = await fetch(fileUri);
    const blob = await response.blob();
    return blob;
};

/**
 * Tính toán chunk metadata (KHÔNG đọc file)
 * @param {number} fileSize - Kích thước file (bytes)
 * @param {number} chunkSize - Kích thước mỗi chunk (bytes)
 * @returns {Array} Array các metadata chunks { index, start, end, size }
 */
export const getChunkMetadata = (fileSize, chunkSize = CHUNK_SIZE) => {
    const totalChunks = Math.ceil(fileSize / chunkSize);
    const chunks = [];

    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, fileSize);
        const size = end - start;

        chunks.push({
            index: i,
            start: start,
            end: end,
            size: size
        });
    }

    return chunks;
};

/**
 * Exponential backoff delay cho retry
 * @param {number} attempt - Số lần retry (0-based)
 * @returns {number} Delay time (ms)
 */
const getRetryDelay = (attempt) => {
    return CHUNK_RETRY_DELAY * Math.pow(2, attempt);
};

/**
 * Upload một chunk lên Supabase Storage (Binary Only - KHÔNG base64, KHÔNG arrayBuffer)
 * @param {Object} params - Parameters object
 * @param {Blob} params.blob - Blob gốc của file (đã fetch 1 lần)
 * @param {number} params.start - Byte start của chunk
 * @param {number} params.end - Byte end của chunk
 * @param {string} params.fileId - Unique ID của file (để tạo folder)
 * @param {number} params.chunkIndex - Index của chunk (0-based)
 * @param {number} params.totalChunks - Tổng số chunks
 * @param {string} params.mimeType - MIME type của file
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export const uploadSingleChunk = async ({
    blob,
    start,
    end,
    fileId,
    chunkIndex,
    totalChunks,
    mimeType
}) => {
    const chunkPath = `temp/chunks/${fileId}/chunk_${chunkIndex}`;
    const typeEmoji = '📦';

    // Slice chunk từ Blob gốc (KHÔNG dùng arrayBuffer, KHÔNG fetch lại)
    const blobChunk = blob.slice(start, end);
    const chunkSizeMB = (blobChunk.size / (1024 * 1024)).toFixed(2);

    console.log(`${typeEmoji} [Chunk Upload] Đang upload chunk ${chunkIndex + 1}/${totalChunks} (${chunkSizeMB} MB)...`);

    // Convert Blob chunk thành Uint8Array (Supabase Storage React Native cần Uint8Array, không hỗ trợ Blob)
    // KHÔNG dùng arrayBuffer(), dùng FileReader để convert
    let chunkData;
    try {
        if (typeof FileReader !== 'undefined') {
            // Browser/Web: Dùng FileReader
            chunkData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const arrayBuffer = reader.result;
                    resolve(new Uint8Array(arrayBuffer));
                };
                reader.onerror = reject;
                reader.readAsArrayBuffer(blobChunk);
            });
        } else {
            // React Native: Dùng fetch để convert Blob → Response → ArrayBuffer → Uint8Array
            // KHÔNG fetch lại file, chỉ convert Blob chunk đã slice
            const response = await fetch(blobChunk);
            const arrayBuffer = await response.arrayBuffer();
            chunkData = new Uint8Array(arrayBuffer);
        }
    } catch (convertError) {
        console.log(`${typeEmoji} [Chunk Upload] ❌ Không thể convert Blob chunk:`, convertError);
        return {
            success: false,
            error: `Cannot convert Blob chunk: ${convertError.message}`,
            path: chunkPath
        };
    }

    // Retry logic với exponential backoff
    let lastError = null;
    for (let attempt = 0; attempt < CHUNK_RETRY_ATTEMPTS; attempt++) {
        try {
            const uploadStartTime = Date.now();

            // Upload Uint8Array (Supabase Storage React Native hỗ trợ Uint8Array)
            const { data, error } = await supabase.storage
                .from('media')
                .upload(chunkPath, chunkData, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: mimeType || 'application/octet-stream'
                });

            const uploadTime = Date.now() - uploadStartTime;

            if (error) {
                lastError = error;
                console.log(`${typeEmoji} [Chunk Upload] Chunk ${chunkIndex + 1}/${totalChunks} upload fail (attempt ${attempt + 1}/${CHUNK_RETRY_ATTEMPTS}):`, error.message);

                // Nếu không phải lần retry cuối, đợi rồi retry
                if (attempt < CHUNK_RETRY_ATTEMPTS - 1) {
                    const delay = getRetryDelay(attempt);
                    console.log(`${typeEmoji} [Chunk Upload] Retry sau ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Lần retry cuối cùng cũng fail
                return {
                    success: false,
                    error: error.message,
                    path: chunkPath
                };
            }

            // Upload thành công
            console.log(`${typeEmoji} [Chunk Upload] ✅ Chunk ${chunkIndex + 1}/${totalChunks} upload thành công (${(uploadTime / 1000).toFixed(2)}s)`);
            return {
                success: true,
                path: chunkPath
            };
        } catch (error) {
            lastError = error;
            console.log(`${typeEmoji} [Chunk Upload] Chunk ${chunkIndex + 1}/${totalChunks} upload error (attempt ${attempt + 1}/${CHUNK_RETRY_ATTEMPTS}):`, error.message);

            // Nếu không phải lần retry cuối, đợi rồi retry
            if (attempt < CHUNK_RETRY_ATTEMPTS - 1) {
                const delay = getRetryDelay(attempt);
                console.log(`${typeEmoji} [Chunk Upload] Retry sau ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Lần retry cuối cùng cũng fail
            return {
                success: false,
                error: error.message,
                path: chunkPath
            };
        }
    }

    // Tất cả retry đều fail
    return {
        success: false,
        error: lastError?.message || 'Unknown error',
        path: chunkPath
    };
};

/**
 * Promise Pool để giới hạn số lượng concurrent uploads
 * @param {Array} items - Array các items cần xử lý
 * @param {Function} fn - Function xử lý mỗi item (async)
 * @param {number} limit - Số lượng concurrent tối đa
 * @returns {Promise<Array>} Array kết quả của tất cả items
 */
const promisePool = async (items, fn, limit) => {
    const results = [];
    const executing = [];

    for (const item of items) {
        const promise = Promise.resolve().then(() => fn(item));
        results.push(promise);

        if (limit <= items.length) {
            const e = promise.then(() => executing.splice(executing.indexOf(e), 1));
            executing.push(e);

            if (executing.length >= limit) {
                await Promise.race(executing);
            }
        }
    }

    return Promise.all(results);
};

/**
 * Upload tất cả chunks song song (Parallel Upload với giới hạn MAX_PARALLEL_UPLOADS)
 * @param {Object} params - Parameters object
 * @param {string} params.fileUri - URI của file
 * @param {string} params.fileId - Unique ID của file
 * @param {number} params.fileSize - Kích thước file (bytes)
 * @param {string} params.mimeType - MIME type của file
 * @param {string} params.fileType - Loại file ('image' hoặc 'video')
 * @param {Function} params.onProgress - Callback để update progress (0-80%)
 * @param {Function} params.onPreviewReady - Callback khi thumbnail preview đã sẵn sàng
 * @returns {Promise<{success: boolean, uploadedChunks?: Array, error?: string}>}
 */
export const uploadChunksParallel = async ({
    fileUri,
    fileId,
    fileSize,
    mimeType,
    fileType = null,
    onProgress = null,
    onPreviewReady = null
}) => {
    const typeEmoji = '📦';
    const startTime = Date.now();

    console.log(`${typeEmoji} [Chunk Upload Parallel] Bắt đầu upload song song...`);
    console.log(`${typeEmoji} [Chunk Upload Parallel] File size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);

    // Validate onProgress callback
    const progressCallback = typeof onProgress === 'function' ? onProgress : null;
    const previewCallback = typeof onPreviewReady === 'function' ? onPreviewReady : null;

    // Tạo và upload thumbnail TRƯỚC (ưu tiên) để hiển thị preview ngay
    if (previewCallback && fileType) {
        try {
            console.log(`${typeEmoji} [Chunk Upload Parallel] Đang tạo thumbnail preview...`);
            const thumbnail = await createThumbnailFromFile(fileUri, fileType);
            const uploadThumbnailResult = await uploadThumbnail(thumbnail.uri, fileId, fileType);
            
            if (uploadThumbnailResult.success) {
                // Gọi callback với thumbnail URL
                previewCallback(uploadThumbnailResult.thumbnailUrl);
                console.log(`${typeEmoji} [Chunk Upload Parallel] ✅ Preview ready: ${uploadThumbnailResult.thumbnailUrl}`);
            } else {
                console.log(`${typeEmoji} [Chunk Upload Parallel] ⚠️ Thumbnail upload failed: ${uploadThumbnailResult.error}`);
            }
        } catch (thumbnailError) {
            console.log(`${typeEmoji} [Chunk Upload Parallel] ⚠️ Thumbnail error:`, thumbnailError.message);
            // Không block upload nếu thumbnail fail
        }
    }

    // 1. Load file thành Blob MỘT LẦN DUY NHẤT
    console.log(`${typeEmoji} [Chunk Upload Parallel] Đang load file thành Blob (1 lần duy nhất)...`);
    const loadBlobStartTime = Date.now();
    const fileBlob = await getFileBlob(fileUri);
    const loadBlobTime = Date.now() - loadBlobStartTime;
    console.log(`${typeEmoji} [Chunk Upload Parallel] ✅ Load Blob xong (${(loadBlobTime / 1000).toFixed(2)}s), size: ${(fileBlob.size / (1024 * 1024)).toFixed(2)} MB`);

    // 2. Tính toán chunk metadata
    const chunksMetadata = getChunkMetadata(fileSize, CHUNK_SIZE);
    const totalChunks = chunksMetadata.length;
    console.log(`${typeEmoji} [Chunk Upload Parallel] Tổng số chunks: ${totalChunks}`);
    console.log(`${typeEmoji} [Chunk Upload Parallel] Upload song song tối đa ${MAX_PARALLEL_UPLOADS} chunks cùng lúc`);

    // 3. Tạo array các tasks để upload (KHÔNG lưu chunk data, chỉ metadata)
    const uploadTasks = chunksMetadata.map((chunkMeta) => {
        return async () => {
            // Upload chunk này
            const result = await uploadSingleChunk({
                blob: fileBlob,
                start: chunkMeta.start,
                end: chunkMeta.end,
                fileId: fileId,
                chunkIndex: chunkMeta.index,
                totalChunks: totalChunks,
                mimeType: mimeType
            });

            // Release reference để GC (chunk đã upload xong)
            // Note: blobChunk trong uploadSingleChunk sẽ được GC sau khi function return

            return {
                chunkIndex: chunkMeta.index,
                result: result
            };
        };
    });

    // 4. Upload song song với Promise Pool (giới hạn MAX_PARALLEL_UPLOADS)
    const uploadedChunks = [];
    let completedCount = 0;
    let hasError = false;
    let firstError = null;

    try {
        // Chạy upload tasks với Promise Pool
        const results = await promisePool(
            uploadTasks,
            async (task) => {
                const taskResult = await task();

                // Update progress (0-80% cho upload chunks)
                completedCount++;
                const progress = Math.floor((completedCount / totalChunks) * 80);
                if (progressCallback) {
                    try {
                        progressCallback(progress);
                    } catch (progressError) {
                        console.log(`${typeEmoji} [Chunk Upload Parallel] ⚠️ Progress callback error:`, progressError.message);
                    }
                }

                // Check kết quả
                if (taskResult.result.success) {
                    uploadedChunks.push({
                        index: taskResult.chunkIndex,
                        path: taskResult.result.path
                    });
                    console.log(`${typeEmoji} [Chunk Upload Parallel] ✅ Progress: ${completedCount}/${totalChunks} chunks (${progress}%)`);
                } else {
                    hasError = true;
                    if (!firstError) {
                        firstError = taskResult.result.error;
                    }
                    console.log(`${typeEmoji} [Chunk Upload Parallel] ❌ Chunk ${taskResult.chunkIndex + 1}/${totalChunks} upload fail: ${taskResult.result.error}`);
                }

                return taskResult;
            },
            MAX_PARALLEL_UPLOADS
        );

        const totalTime = Date.now() - startTime;

        // 5. Kiểm tra kết quả
        if (hasError) {
            console.log(`${typeEmoji} [Chunk Upload Parallel] ❌ Upload fail! Một số chunks upload không thành công`);
            console.log(`${typeEmoji} [Chunk Upload Parallel] Thành công: ${uploadedChunks.length}/${totalChunks} chunks`);
            return {
                success: false,
                error: firstError || 'Một số chunks upload không thành công',
                uploadedChunks: uploadedChunks.sort((a, b) => a.index - b.index)
            };
        }

        // Sort chunks theo index trước khi log và return
        const sortedChunks = uploadedChunks.sort((a, b) => a.index - b.index);

        // Tất cả chunks upload thành công
        console.log(`${typeEmoji} [Chunk Upload Parallel] ✅ Tất cả ${totalChunks} chunks upload thành công! (${(totalTime / 1000).toFixed(2)}s)`);
        console.log(`${typeEmoji} [Chunk Upload Parallel] Uploaded chunks (sorted):`, sortedChunks.map(c => c.index).join(', '));
        console.log(`${typeEmoji} [Chunk Upload Parallel] Chunk paths:`, sortedChunks.map(c => c.path).join(', '));

        // Update progress 80% (chunks upload xong, còn 20% cho merge)
        if (progressCallback) {
            try {
                progressCallback(80);
            } catch (progressError) {
                console.log(`${typeEmoji} [Chunk Upload Parallel] ⚠️ Progress callback error:`, progressError.message);
            }
        }

        return {
            success: true,
            uploadedChunks: sortedChunks // Đã sort ở trên
        };

    } catch (error) {
        console.log(`${typeEmoji} [Chunk Upload Parallel] ❌ Upload error:`, error.message);
        const sortedChunks = uploadedChunks.sort((a, b) => a.index - b.index);
        return {
            success: false,
            error: error.message,
            uploadedChunks: sortedChunks
        };
    }
};

/**
 * Merge chunks trên server bằng Edge Function (Streaming Merge)
 * @param {Object} params - Parameters object
 * @param {string} params.fileId - Unique ID của file
 * @param {number} params.totalChunks - Tổng số chunks
 * @param {string} params.finalPath - Đường dẫn cuối cùng của file (ví dụ: 'videos/final_video.mp4')
 * @param {string} params.fileType - Loại file ('image' hoặc 'video')
 * @param {Function} params.onProgress - Callback để update progress (80-100%)
 * @returns {Promise<{success: boolean, fileUrl?: string, error?: string}>}
 */
export const mergeChunksOnServer = async ({
    fileId,
    totalChunks,
    finalPath,
    fileType,
    onProgress = null
}) => {
    const typeEmoji = '🔗';
    const startTime = Date.now();

    console.log(`${typeEmoji} [Merge Chunks] Bắt đầu merge ${totalChunks} chunks trên server...`);
    console.log(`${typeEmoji} [Merge Chunks] File ID: ${fileId}`);
    console.log(`${typeEmoji} [Merge Chunks] Final path: ${finalPath}`);

    // Validate onProgress callback
    const progressCallback = typeof onProgress === 'function' ? onProgress : null;

    try {
        // Update progress 80% (bắt đầu merge)
        if (progressCallback) {
            try {
                progressCallback(80);
            } catch (progressError) {
                console.log(`${typeEmoji} [Merge Chunks] ⚠️ Progress callback error:`, progressError.message);
            }
        }

        // Lấy session để có Authorization header
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        // Gọi Edge Function merge-chunks
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/merge-chunks`;
        console.log(`${typeEmoji} [Merge Chunks] Calling Edge Function: ${edgeFunctionUrl}`);

        const mergeStartTime = Date.now();
        const headers = {
            'Content-Type': 'application/json',
        };

        // Thêm Authorization header nếu có token
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Gọi Edge Function với timeout (5 phút cho file lớn)
        const fetchPromise = fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                fileId: fileId,
                totalChunks: totalChunks,
                finalPath: finalPath,
                fileType: fileType
            })
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Merge timeout: Edge Function không phản hồi sau 5 phút')), 300000); // 5 phút
        });

        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
                // Nếu không parse được JSON, dùng status text
                const text = await response.text().catch(() => '');
                if (text) {
                    errorMessage = text;
                }
            }

            // Kiểm tra nếu function chưa được deploy
            if (response.status === 404) {
                throw new Error(`Edge Function 'merge-chunks' chưa được deploy. Vui lòng deploy function trước khi sử dụng. Xem hướng dẫn: docs/DEPLOY_MERGE_CHUNKS_EDGE_FUNCTION.md`);
            }

            throw new Error(errorMessage);
        }

        const result = await response.json();
        const mergeTime = Date.now() - mergeStartTime;

        if (!result.success) {
            throw new Error(result.error || 'Merge failed on server');
        }

        // Update progress 100% (merge xong)
        if (progressCallback) {
            try {
                progressCallback(100);
            } catch (progressError) {
                console.log(`${typeEmoji} [Merge Chunks] ⚠️ Progress callback error:`, progressError.message);
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`${typeEmoji} [Merge Chunks] ✅ Merge thành công! (${(mergeTime / 1000).toFixed(2)}s)`);
        console.log(`${typeEmoji} [Merge Chunks] Final URL: ${result.fileUrl}`);
        console.log(`${typeEmoji} [Merge Chunks] Tổng thời gian (upload + merge): ${(totalTime / 1000).toFixed(2)}s`);

        return {
            success: true,
            fileUrl: result.fileUrl,
            publicUrl: result.publicUrl || result.fileUrl
        };

    } catch (error) {
        console.log(`${typeEmoji} [Merge Chunks] ❌ Merge error:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

