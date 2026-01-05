import RNBlobUtil from 'react-native-blob-util';
import { supabaseUrl } from "../constants/index";
import { supabase } from "../lib/supabase";

// ===== CHUNK UPLOAD CONFIG =====
export const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk (tăng từ 5MB để giảm overhead convert)
export const MAX_PARALLEL_UPLOADS = 2; // Upload tối đa 2 chunks song song
export const CHUNK_UPLOAD_THRESHOLD = 5 * 1024 * 1024; // 5MB - file >= 5MB sẽ dùng chunk upload
export const CHUNK_RETRY_ATTEMPTS = 3; // Số lần retry khi upload chunk fail
export const CHUNK_RETRY_DELAY = 1000; // Delay giữa các lần retry (ms)

// ===== HELPER FUNCTIONS: CHUNK UPLOAD (BINARY ONLY - KHÔNG BASE64) =====

/**
 * Load react-native-create-thumbnail một cách an toàn, suppress mọi lỗi
 * @returns {any|null} Module nếu load thành công, null nếu có lỗi
 */
const safeRequireThumbnail = () => {
    // Suppress error handler tạm thời để không hiển thị ERROR
    const ErrorUtils = global.ErrorUtils;
    let originalHandler = null;
    
    // Override error handler tạm thời - không log gì cả
    if (ErrorUtils && ErrorUtils.setGlobalHandler) {
        originalHandler = ErrorUtils.getGlobalHandler();
        ErrorUtils.setGlobalHandler((error, isFatal) => {
            // Suppress lỗi hoàn toàn, không log gì
        });
    }
    
    try {
        // Thử load module - phải dùng string literal, không dùng biến
        const module = require('react-native-create-thumbnail');
        
        // Restore error handler
        if (ErrorUtils && ErrorUtils.setGlobalHandler && originalHandler) {
            ErrorUtils.setGlobalHandler(originalHandler);
        }
        
        return module;
    } catch (error) {
        // Restore error handler
        if (ErrorUtils && ErrorUtils.setGlobalHandler && originalHandler) {
            ErrorUtils.setGlobalHandler(originalHandler);
        }
        
        // Bắt mọi lỗi và return null - không log gì
        return null;
    }
};

/**
 * Tạo thumbnail từ image hoặc video
 * @param {string} fileUri - URI của file
 * @param {string} type - 'image' hoặc 'video'
 * @returns {Promise<{uri: string, width: number, height: number, isLocal: boolean}>}
 */
export const createThumbnailFromFile = async (fileUri, type) => {
    const typeEmoji = type === 'video' ? '🎥' : '📷';
    
    if (type === 'image') {
        // Image: Dùng expo-image-manipulator
        try {
            const ImageManipulator = require('expo-image-manipulator');
            
            if (!ImageManipulator || typeof ImageManipulator.manipulateAsync !== 'function') {
                // Fallback: dùng fileUri trực tiếp - không log gì
                return {
                    uri: fileUri,
                    width: 300,
                    height: 300,
                    isLocal: true
                };
            }
            
            const manipResult = await ImageManipulator.manipulateAsync(
                fileUri,
                [{ resize: { width: 300 } }], // Resize về width 300px (giữ aspect ratio)
                { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
            );
            
            console.log(`${typeEmoji} [Thumbnail] ✅ Thumbnail created (resized): ${manipResult.uri}`);
            return {
                uri: manipResult.uri,
                width: manipResult.width,
                height: manipResult.height,
                isLocal: true
            };
        } catch (error) {
            // Fallback: dùng fileUri trực tiếp - không log gì
            return {
                uri: fileUri,
                width: 300,
                height: 300,
                isLocal: true
            };
        }
    } else {
        // Video: Dùng react-native-create-thumbnail
        try {
            // Lazy load module để tránh lỗi khi Metro analyze code trong prebuild
            // Sử dụng helper function để bắt mọi lỗi có thể xảy ra
            let thumbnailModule = null;
            
            // Sử dụng safeRequireThumbnail để load module an toàn
            thumbnailModule = safeRequireThumbnail();
            
            if (!thumbnailModule) {
                // Fallback: dùng fileUri trực tiếp - không log gì
                return {
                    uri: fileUri,
                    width: 300,
                    height: 300,
                    isLocal: true
                };
            }
            
            // Try multiple ways to access createThumbnail function
            let createThumbnailFn;
            try {
                // Try different export patterns
                if (typeof thumbnailModule.createThumbnail === 'function') {
                    createThumbnailFn = thumbnailModule.createThumbnail;
                } else if (thumbnailModule.default && typeof thumbnailModule.default.createThumbnail === 'function') {
                    createThumbnailFn = thumbnailModule.default.createThumbnail;
                } else if (typeof thumbnailModule.default === 'function') {
                    createThumbnailFn = thumbnailModule.default;
                } else if (typeof thumbnailModule === 'function') {
                    createThumbnailFn = thumbnailModule;
                }
            } catch (accessError) {
                // Fallback: dùng fileUri trực tiếp - không log gì
                return {
                    uri: fileUri,
                    width: 300,
                    height: 300,
                    isLocal: true
                };
            }
            
            if (!createThumbnailFn || typeof createThumbnailFn !== 'function') {
                // Fallback: dùng fileUri trực tiếp - không log gì
                return {
                    uri: fileUri,
                    width: 300,
                    height: 300,
                    isLocal: true
                };
            }
            
            // Thử tạo thumbnail, bắt mọi lỗi có thể xảy ra
            let thumbnail;
            try {
                thumbnail = await createThumbnailFn({
                    url: fileUri,
                    timeStamp: 1000, // Lấy frame tại giây thứ 1
                    width: 300,
                    height: 300
                });
            } catch (createError) {
                // Fallback: dùng fileUri trực tiếp - không log gì
                return {
                    uri: fileUri,
                    width: 300,
                    height: 300,
                    isLocal: true
                };
            }
            
            if (!thumbnail || !thumbnail.path) {
                // Fallback: dùng fileUri trực tiếp - không log gì
                return {
                    uri: fileUri,
                    width: 300,
                    height: 300,
                    isLocal: true
                };
            }
            
            console.log(`${typeEmoji} [Thumbnail] ✅ Thumbnail created: ${thumbnail.path}`);
            return {
                uri: thumbnail.path,
                width: thumbnail.width || 300,
                height: thumbnail.height || 300,
                isLocal: true
            };
        } catch (error) {
            // Bắt mọi lỗi còn lại - không log gì, chỉ return fallback
            return {
                uri: fileUri,
                width: 300,
                height: 300,
                isLocal: true
            };
        }
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
 * Upload một chunk với presigned URL (PUT request trực tiếp lên S3 - nhanh hơn nhiều)
 * Upload trực tiếp từ base64 string (KHÔNG cần file tạm)
 * @param {Object} params - Parameters object
 * @param {Blob} params.blob - Blob gốc của file (đã fetch 1 lần)
 * @param {number} params.start - Byte start của chunk
 * @param {number} params.end - Byte end của chunk
 * @param {number} params.chunkIndex - Index của chunk (0-based)
 * @param {number} params.totalChunks - Tổng số chunks
 * @param {string} params.presignedUrl - Presigned URL cho chunk này
 * @param {string} params.mimeType - MIME type của file
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export const uploadSingleChunkWithPresignedUrl = async ({
    blob,
    start,
    end,
    chunkIndex,
    totalChunks,
    presignedUrl,
    mimeType
}) => {
    const typeEmoji = '🚀';
    
    // Slice chunk từ Blob gốc
    const chunkStartTime = Date.now();
    const blobChunk = blob.slice(start, end);
    const chunkSizeMB = (blobChunk.size / (1024 * 1024)).toFixed(2);

    console.log(`${typeEmoji} [Presigned Upload] Đang upload chunk ${chunkIndex + 1}/${totalChunks} (${chunkSizeMB} MB) với presigned URL...`);

    // Convert Blob chunk thành ArrayBuffer
    const convertToArrayBufferStartTime = Date.now();
    let chunkData;
    let convertToArrayBufferTime = 0;
    try {
        if (typeof FileReader !== 'undefined') {
            // Browser/Web: Dùng FileReader
            chunkData = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    resolve(reader.result); // ArrayBuffer
                };
                reader.onerror = reject;
                reader.readAsArrayBuffer(blobChunk);
            });
        } else {
            // React Native: Dùng fetch để convert Blob → Response → ArrayBuffer
            const response = await fetch(blobChunk);
            chunkData = await response.arrayBuffer(); // ArrayBuffer
        }
        convertToArrayBufferTime = Date.now() - convertToArrayBufferStartTime;
        console.log(`${typeEmoji} [Presigned Upload] ⏱️ Convert Blob → ArrayBuffer: ${(convertToArrayBufferTime / 1000).toFixed(2)}s`);
    } catch (convertError) {
        console.log(`${typeEmoji} [Presigned Upload] ❌ Không thể convert Blob chunk:`, convertError);
        return {
            success: false,
            error: `Cannot convert Blob chunk: ${convertError.message}`
        };
    }

    // Retry logic với exponential backoff
    let lastError = null;
    
    for (let attempt = 0; attempt < CHUNK_RETRY_ATTEMPTS; attempt++) {
        try {
            const uploadStartTime = Date.now();
            
            console.log(`${typeEmoji} [Presigned Upload] Bắt đầu PUT request chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempt + 1}/${CHUNK_RETRY_ATTEMPTS})...`);
            console.log(`${typeEmoji} [Presigned Upload] Chunk size: ${chunkData.byteLength} bytes (${(chunkData.byteLength / (1024 * 1024)).toFixed(2)} MB)`);
            
            // ✅ DEBUG LOGGING
            console.log(`${typeEmoji} [Presigned Upload] Using presigned URL: ${presignedUrl.substring(0, 120)}...`);

            // ✅ TỐI ƯU: Upload trực tiếp từ base64 string (KHÔNG cần file tạm)
            // RNBlobUtil.fetch() có thể nhận base64 string trực tiếp → giảm I/O overhead
            // RNBlobUtil không dùng Transfer-Encoding: chunked, gửi Content-Length thật → S3 proxy CHẤP NHẬN
            const convertToBase64StartTime = Date.now();
            const { Buffer } = require('buffer');
            const base64String = Buffer.from(chunkData).toString('base64');
            const convertToBase64Time = Date.now() - convertToBase64StartTime;
            console.log(`${typeEmoji} [Presigned Upload] ⏱️ Convert ArrayBuffer → Base64: ${(convertToBase64Time / 1000).toFixed(2)}s (${(base64String.length / 1024).toFixed(2)} KB)`);

            // Upload trực tiếp từ base64 string (KHÔNG cần file tạm)
            // RNBlobUtil.fetch() sẽ tự động encode base64 → binary khi upload
            // ✅ GIẢI PHÁP: KHÔNG set headers gì cả
            // Presigned URL chỉ ký host header → RNBlobUtil muốn thêm headers gì cứ để nó thêm
            const networkUploadStartTime = Date.now();
            const uploadResponse = await RNBlobUtil.fetch(
                'PUT',
                presignedUrl,
                {},  // ✅ Để trống - KHÔNG set headers gì cả
                base64String // Upload trực tiếp từ base64 string (không cần wrap file)
            );
            const networkUploadTime = Date.now() - networkUploadStartTime;
            const uploadTime = Date.now() - uploadStartTime;
            
            console.log(`${typeEmoji} [Presigned Upload] ⏱️ Network upload (PUT request): ${(networkUploadTime / 1000).toFixed(2)}s`);
            const status = uploadResponse.info().status;

            // ✅ KHÔNG cần cleanup file tạm vì upload trực tiếp từ base64 string

            if (status < 200 || status >= 300) {
                let errorMessage = `HTTP ${status}`;
                try {
                    const responseText = await uploadResponse.text();
                    if (responseText) {
                        errorMessage = responseText;
                    }
                } catch (e) {
                    // Ignore
                }
                
                // Kiểm tra nếu presigned URL hết hạn (403 hoặc 401)
                if (status === 403 || status === 401) {
                    throw new Error(`Presigned URL expired or invalid: ${errorMessage}`);
                }

                lastError = new Error(errorMessage);
                console.log(`${typeEmoji} [Presigned Upload] ❌ Chunk ${chunkIndex + 1}/${totalChunks} upload fail (attempt ${attempt + 1}/${CHUNK_RETRY_ATTEMPTS}):`, errorMessage);

                // Nếu không phải lần retry cuối, đợi rồi retry
                if (attempt < CHUNK_RETRY_ATTEMPTS - 1) {
                    const delay = getRetryDelay(attempt);
                    console.log(`${typeEmoji} [Presigned Upload] Retry sau ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                // Lần retry cuối cùng cũng fail
                return {
                    success: false,
                    error: errorMessage
                };
            }

            // ✅ Upload thành công
            const totalChunkTime = Date.now() - chunkStartTime;
            console.log(`${typeEmoji} [Presigned Upload] ✅ Chunk ${chunkIndex + 1}/${totalChunks} upload thành công`);
            console.log(`${typeEmoji} [Presigned Upload] ⏱️ Tổng thời gian chunk: ${(totalChunkTime / 1000).toFixed(2)}s (Convert: ${((convertToArrayBufferTime + convertToBase64Time) / 1000).toFixed(2)}s, Network: ${(networkUploadTime / 1000).toFixed(2)}s)`);
            
            return {
                success: true,
                path: `temp/chunks/${chunkIndex}` // Path tương đối
            };

        } catch (error) {
            // ✅ Sửa error handling để log đúng error message
            let errorMessage;
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (error && typeof error === 'object' && error.errorMessage) {
                errorMessage = error.errorMessage;
            } else {
                errorMessage = String(error);
            }
            
            lastError = error instanceof Error ? error : new Error(errorMessage);
            console.log(`${typeEmoji} [Presigned Upload] ❌ Chunk ${chunkIndex + 1}/${totalChunks} upload error (attempt ${attempt + 1}/${CHUNK_RETRY_ATTEMPTS}):`, errorMessage);

            // Kiểm tra nếu presigned URL hết hạn
            if (errorMessage.includes('Presigned URL expired') || errorMessage.includes('expired')) {
                return {
                    success: false,
                    error: 'Presigned URL expired. Please get new presigned URLs.',
                    needsNewPresignedUrls: true
                };
            }

            // Nếu không phải lần retry cuối, đợi rồi retry
            if (attempt < CHUNK_RETRY_ATTEMPTS - 1) {
                const delay = getRetryDelay(attempt);
                console.log(`${typeEmoji} [Presigned Upload] Retry sau ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }

            // Lần retry cuối cùng cũng fail
            return {
                success: false,
                error: errorMessage || 'Unknown error occurred'
            };
        }
    }

    // Không bao giờ đến đây, nhưng để TypeScript happy
    return {
        success: false,
        error: lastError?.message || 'Unknown error occurred'
    };
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
 * @param {string} params.bucketName - Bucket name (default: 'media')
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
export const uploadSingleChunk = async ({
    blob,
    start,
    end,
    fileId,
    chunkIndex,
    totalChunks,
    mimeType,
    bucketName = 'media'
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
            
            console.log(`${typeEmoji} [Chunk Upload] Bắt đầu upload chunk ${chunkIndex + 1}/${totalChunks} lên bucket "${bucketName}" (attempt ${attempt + 1}/${CHUNK_RETRY_ATTEMPTS})...`);
            console.log(`${typeEmoji} [Chunk Upload] Chunk path: ${chunkPath}`);
            console.log(`${typeEmoji} [Chunk Upload] Chunk size: ${chunkData.length} bytes (${(chunkData.length / (1024 * 1024)).toFixed(2)} MB)`);

            // Upload Uint8Array (Supabase Storage React Native hỗ trợ Uint8Array)
            const uploadPromise = supabase.storage
                .from(bucketName)
                .upload(chunkPath, chunkData, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: mimeType || 'application/octet-stream'
                });

            // Thêm timeout cho upload (5 phút)
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Upload timeout: Chunk upload mất quá 5 phút')), 300000);
            });

            const { data, error } = await Promise.race([uploadPromise, timeoutPromise]);

            const uploadTime = Date.now() - uploadStartTime;

            if (error) {
                lastError = error;
                console.log(`${typeEmoji} [Chunk Upload] ❌ Chunk ${chunkIndex + 1}/${totalChunks} upload fail (attempt ${attempt + 1}/${CHUNK_RETRY_ATTEMPTS}):`, error);
                console.log(`${typeEmoji} [Chunk Upload] Error details:`, JSON.stringify(error, null, 2));

                // Kiểm tra nếu là lỗi bucket không tồn tại
                if (error.message && (error.message.includes('Bucket not found') || error.message.includes('does not exist'))) {
                    console.log(`${typeEmoji} [Chunk Upload] ❌ Bucket "${bucketName}" không tồn tại hoặc không có quyền truy cập!`);
                    return {
                        success: false,
                        error: `Bucket "${bucketName}" không tồn tại hoặc không có quyền. Vui lòng kiểm tra cấu hình Supabase Storage.`,
                        path: chunkPath
                    };
                }

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
                console.log(`[Promise Pool] Đạt limit ${limit}, đợi một promise hoàn thành...`);
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
    onPreviewReady = null,
    bucketName = null
}) => {
    const typeEmoji = '📦';
    const startTime = Date.now();

    // Xác định bucket name dựa vào fileType nếu không được chỉ định
    // Documents và media đều dùng bucket "media" (phân biệt bằng folder path)
    const targetBucket = bucketName || 'media';

    console.log(`${typeEmoji} [Chunk Upload Parallel] Bắt đầu upload song song...`);
    console.log(`${typeEmoji} [Chunk Upload Parallel] File size: ${(fileSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`${typeEmoji} [Chunk Upload Parallel] Using bucket: ${targetBucket}`);

    // Validate onProgress callback
    const progressCallback = typeof onProgress === 'function' ? onProgress : null;
    const previewCallback = typeof onPreviewReady === 'function' ? onPreviewReady : null;

    // Tạo và upload thumbnail TRƯỚC (ưu tiên) để hiển thị preview ngay
    // Bọc trong try-catch để không làm dừng upload chunks nếu có lỗi
    if (previewCallback && fileType) {
        try {
            console.log(`${typeEmoji} [Chunk Upload Parallel] Đang tạo thumbnail preview...`);
            const thumbnail = await createThumbnailFromFile(fileUri, fileType);
            
            // Upload thumbnail lên server
            const uploadThumbnailResult = await uploadThumbnail(thumbnail.uri, fileId, fileType);
            
            if (uploadThumbnailResult.success) {
                // Gọi callback với thumbnail URL từ server
                previewCallback(uploadThumbnailResult.thumbnailUrl);
                console.log(`${typeEmoji} [Chunk Upload Parallel] ✅ Preview ready: ${uploadThumbnailResult.thumbnailUrl}`);
            } else {
                // Nếu upload fail, vẫn dùng local URI để preview
                previewCallback(thumbnail.uri);
            }
        } catch (thumbnailError) {
            // Nếu có lỗi, bỏ qua thumbnail và tiếp tục upload chunks
            // Không log gì để không làm nhiễu log
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

    // 3. Lấy presigned URLs cho tất cả chunks (TRƯỚC KHI upload)
    console.log(`${typeEmoji} [Chunk Upload Parallel] Lấy presigned URLs cho ${totalChunks} chunks...`);
    const getPresignedUrlsStartTime = Date.now();
    const presignedUrlsResult = await getPresignedUrlsForChunks({
        fileId: fileId,
        totalChunks: totalChunks,
        bucketName: targetBucket
    });
    const getPresignedUrlsTime = Date.now() - getPresignedUrlsStartTime;

    if (!presignedUrlsResult.success || !presignedUrlsResult.urls || presignedUrlsResult.urls.length !== totalChunks) {
        const errorMsg = presignedUrlsResult.error || 'Failed to get presigned URLs';
        console.log(`${typeEmoji} [Chunk Upload Parallel] ❌ Không thể lấy presigned URLs: ${errorMsg}`);
        return {
            success: false,
            error: `Failed to get presigned URLs: ${errorMsg}`,
            uploadedChunks: []
        };
    }

    const presignedUrls = presignedUrlsResult.urls;
    console.log(`${typeEmoji} [Chunk Upload Parallel] ✅ Lấy ${presignedUrls.length} presigned URLs thành công! (${(getPresignedUrlsTime / 1000).toFixed(2)}s)`);

    // 4. Tạo array các tasks để upload với presigned URLs
    const uploadTasks = chunksMetadata.map((chunkMeta) => {
        return async () => {
            // Upload chunk này với presigned URL
            const presignedUrl = presignedUrls[chunkMeta.index];
            if (!presignedUrl) {
                return {
                    chunkIndex: chunkMeta.index,
                    result: {
                        success: false,
                        error: `Presigned URL not found for chunk ${chunkMeta.index}`
                    }
                };
            }

            const result = await uploadSingleChunkWithPresignedUrl({
                blob: fileBlob,
                start: chunkMeta.start,
                end: chunkMeta.end,
                chunkIndex: chunkMeta.index,
                totalChunks: totalChunks,
                presignedUrl: presignedUrl,
                mimeType: mimeType
            });

            // Release reference để GC (chunk đã upload xong)
            // Note: blobChunk trong uploadSingleChunkWithPresignedUrl sẽ được GC sau khi function return

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
        console.log(`${typeEmoji} [Chunk Upload Parallel] Bắt đầu upload ${totalChunks} chunks với Promise Pool (max ${MAX_PARALLEL_UPLOADS} concurrent)...`);
        const uploadChunksStartTime = Date.now();
        
        // Chạy upload tasks với Promise Pool
        const results = await promisePool(
            uploadTasks,
            async (task) => {
                try {
                    console.log(`${typeEmoji} [Chunk Upload Parallel] Bắt đầu execute task...`);
                    const taskResult = await task();
                    console.log(`${typeEmoji} [Chunk Upload Parallel] Task completed, result:`, taskResult.result.success ? 'SUCCESS' : 'FAILED');

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
                } catch (taskError) {
                    console.log(`${typeEmoji} [Chunk Upload Parallel] ❌ Task execution error:`, taskError);
                    console.log(`${typeEmoji} [Chunk Upload Parallel] Task error stack:`, taskError.stack);
                    throw taskError;
                }
            },
            MAX_PARALLEL_UPLOADS
        );
        
        console.log(`${typeEmoji} [Chunk Upload Parallel] Promise Pool completed, results count: ${results.length}`);

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
        const uploadChunksTime = Date.now() - uploadChunksStartTime;
        const totalUploadTime = Date.now() - loadBlobStartTime;
        console.log(`${typeEmoji} [Chunk Upload Parallel] ✅ Tất cả ${totalChunks} chunks upload thành công!`);
        console.log(`${typeEmoji} [Chunk Upload Parallel] ⏱️ Tổng thời gian upload chunks: ${(uploadChunksTime / 1000).toFixed(2)}s`);
        console.log(`${typeEmoji} [Chunk Upload Parallel] ⏱️ Tổng thời gian (load + get URLs + upload): ${(totalUploadTime / 1000).toFixed(2)}s`);
        console.log(`${typeEmoji} [Chunk Upload Parallel] ⏱️ Breakdown: Load Blob: ${(loadBlobTime / 1000).toFixed(2)}s, Get Presigned URLs: ${(getPresignedUrlsTime / 1000).toFixed(2)}s, Upload Chunks: ${(uploadChunksTime / 1000).toFixed(2)}s`);
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
 * Merge document chunks trên server bằng Edge Function (Streaming Merge)
 * @param {Object} params - Parameters object
 * @param {string} params.fileId - Unique ID của file
 * @param {number} params.totalChunks - Tổng số chunks
 * @param {string} params.finalPath - Đường dẫn cuối cùng của file (ví dụ: 'documents/user_id/file.pdf')
 * @param {Function} params.onProgress - Callback để update progress (80-100%)
 * @returns {Promise<{success: boolean, fileUrl?: string, error?: string}>}
 */
export const mergeDocumentChunksOnServer = async ({
    fileId,
    totalChunks,
    finalPath,
    bucketName = 'media',
    onProgress = null
}) => {
    const typeEmoji = '📄';
    const startTime = Date.now();

    console.log(`${typeEmoji} [Merge Document Chunks] Bắt đầu merge ${totalChunks} chunks trên server...`);
    console.log(`${typeEmoji} [Merge Document Chunks] File ID: ${fileId}`);
    console.log(`${typeEmoji} [Merge Document Chunks] Final path: ${finalPath}`);
    console.log(`${typeEmoji} [Merge Document Chunks] Using bucket: ${bucketName}`);

    // Validate onProgress callback
    const progressCallback = typeof onProgress === 'function' ? onProgress : null;

    try {
        // Update progress 80% (bắt đầu merge)
        if (progressCallback) {
            try {
                progressCallback(80);
            } catch (progressError) {
                console.log(`${typeEmoji} [Merge Document Chunks] ⚠️ Progress callback error:`, progressError.message);
            }
        }

        // Lấy session để có Authorization header
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        // Gọi Edge Function merge-document-chunks
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/merge-document-chunks`;
        console.log(`${typeEmoji} [Merge Document Chunks] Calling Edge Function: ${edgeFunctionUrl}`);

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
                bucketName: bucketName
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
                throw new Error(`Edge Function 'merge-document-chunks' chưa được deploy. Vui lòng deploy function trước khi sử dụng.`);
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
                console.log(`${typeEmoji} [Merge Document Chunks] ⚠️ Progress callback error:`, progressError.message);
            }
        }

        const totalTime = Date.now() - startTime;
        console.log(`${typeEmoji} [Merge Document Chunks] ✅ Merge thành công!`);
        console.log(`${typeEmoji} [Merge Document Chunks] ⏱️ Thời gian merge: ${(mergeTime / 1000).toFixed(2)}s`);
        console.log(`${typeEmoji} [Merge Document Chunks] Final URL: ${result.fileUrl}`);
        console.log(`${typeEmoji} [Merge Document Chunks] ⏱️ Tổng thời gian (merge): ${(totalTime / 1000).toFixed(2)}s`);

        return {
            success: true,
            fileUrl: result.fileUrl,
            publicUrl: result.publicUrl || result.fileUrl
        };

    } catch (error) {
        console.log(`${typeEmoji} [Merge Document Chunks] ❌ Merge error:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Lấy presigned URLs cho chunks từ Edge Function
 * @param {Object} params - Parameters object
 * @param {string} params.fileId - Unique ID của file
 * @param {number} params.totalChunks - Tổng số chunks
 * @param {string} params.bucketName - Bucket name ('media' hoặc 'upload')
 * @returns {Promise<{success: boolean, urls?: Array<string>, error?: string}>}
 */
/**
 * Lấy presigned URL cho single file (không chunk) - dùng để test
 * @param {Object} params - Parameters object
 * @param {string} params.fileId - Unique ID của file
 * @param {string} params.filePath - Path của file trong bucket (ví dụ: documents/userId/fileName)
 * @param {string} params.bucketName - Bucket name (default: 'media')
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export const getPresignedUrlForSingleFile = async ({
    fileId,
    filePath,
    bucketName = 'media'
}) => {
    const typeEmoji = '🔗';
    console.log(`${typeEmoji} [Get Presigned URL] Bắt đầu lấy presigned URL cho single file...`);
    console.log(`${typeEmoji} [Get Presigned URL] File ID: ${fileId}`);
    console.log(`${typeEmoji} [Get Presigned URL] File path: ${filePath}`);
    console.log(`${typeEmoji} [Get Presigned URL] Bucket: ${bucketName}`);

    try {
        // Lấy session để có Authorization header
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        // Gọi Edge Function get-presigned-urls
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/get-presigned-urls`;
        console.log(`${typeEmoji} [Get Presigned URL] Calling Edge Function: ${edgeFunctionUrl}`);

        const headers = {
            'Content-Type': 'application/json',
        };

        // Thêm Authorization header nếu có token
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Gọi Edge Function với timeout (30 giây)
        const fetchPromise = fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                fileId: fileId,
                totalChunks: 1, // Single file = 1 chunk
                bucketName: bucketName,
                filePath: filePath // Path cho single file
            })
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Get presigned URL timeout: Edge Function không phản hồi sau 30 giây')), 30000);
        });

        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorText = await response.text();
                if (errorText) {
                    errorMessage = errorText;
                }
            } catch (e) {
                // Ignore
            }
            console.log(`${typeEmoji} [Get Presigned URL] ❌ Error: ${errorMessage}`);
            return {
                success: false,
                error: errorMessage
            };
        }

        const result = await response.json();
        
        if (!result.success || !result.urls || result.urls.length === 0) {
            const errorMsg = result.error || 'Failed to get presigned URL';
            console.log(`${typeEmoji} [Get Presigned URL] ❌ Error: ${errorMsg}`);
            return {
                success: false,
                error: errorMsg
            };
        }

        const presignedUrl = result.urls[0];
        console.log(`${typeEmoji} [Get Presigned URL] ✅ Lấy presigned URL thành công!`);
        console.log(`${typeEmoji} [Get Presigned URL] URL preview: ${presignedUrl.substring(0, 120)}...`);

        return {
            success: true,
            url: presignedUrl
        };
    } catch (error) {
        const errorMessage = error.message || String(error);
        console.log(`${typeEmoji} [Get Presigned URL] ❌ Exception: ${errorMessage}`);
        return {
            success: false,
            error: errorMessage
        };
    }
};

export const getPresignedUrlsForChunks = async ({
    fileId,
    totalChunks,
    bucketName = 'media'
}) => {
    const typeEmoji = '🔗';
    const startTime = Date.now();

    console.log(`${typeEmoji} [Get Presigned URLs] Bắt đầu lấy presigned URLs...`);
    console.log(`${typeEmoji} [Get Presigned URLs] File ID: ${fileId}`);
    console.log(`${typeEmoji} [Get Presigned URLs] Total chunks: ${totalChunks}`);
    console.log(`${typeEmoji} [Get Presigned URLs] Bucket: ${bucketName}`);

    try {
        // Lấy session để có Authorization header
        const { data: { session } } = await supabase.auth.getSession();
        const authToken = session?.access_token;

        // Gọi Edge Function get-presigned-urls
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/get-presigned-urls`;
        console.log(`${typeEmoji} [Get Presigned URLs] Calling Edge Function: ${edgeFunctionUrl}`);

        const headers = {
            'Content-Type': 'application/json',
        };

        // Thêm Authorization header nếu có token
        if (authToken) {
            headers['Authorization'] = `Bearer ${authToken}`;
        }

        // Gọi Edge Function với timeout (30 giây)
        const fetchPromise = fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                fileId: fileId,
                totalChunks: totalChunks,
                bucketName: bucketName
            })
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Get presigned URLs timeout: Edge Function không phản hồi sau 30 giây')), 30000);
        });

        const response = await Promise.race([fetchPromise, timeoutPromise]);

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
                const text = await response.text().catch(() => '');
                if (text) {
                    errorMessage = text;
                }
            }

            // Kiểm tra nếu function chưa được deploy
            if (response.status === 404) {
                throw new Error(`Edge Function 'get-presigned-urls' chưa được deploy. Vui lòng deploy function trước khi sử dụng.`);
            }

            throw new Error(errorMessage);
        }

        const result = await response.json();
        const elapsedTime = Date.now() - startTime;

        if (!result.success) {
            throw new Error(result.error || 'Failed to get presigned URLs');
        }

        console.log(`${typeEmoji} [Get Presigned URLs] ✅ Lấy presigned URLs thành công! (${(elapsedTime / 1000).toFixed(2)}s)`);
        console.log(`${typeEmoji} [Get Presigned URLs] Số lượng URLs: ${result.urls?.length || 0}`);
        
        // Log từng presigned URL để test
        if (result.urls && result.urls.length > 0) {
            console.log(`${typeEmoji} [Get Presigned URLs] Presigned URLs:`);
            result.urls.forEach((url, index) => {
                console.log(`${typeEmoji} [Get Presigned URLs]   Chunk ${index + 1}: ${url.substring(0, 100)}...`);
            });
        }

        return {
            success: true,
            urls: result.urls || [],
            fileId: result.fileId,
            totalChunks: result.totalChunks,
            bucketName: result.bucketName
        };

    } catch (error) {
        console.log(`${typeEmoji} [Get Presigned URLs] ❌ Error:`, error.message);
        return {
            success: false,
            error: error.message
        };
    }
};

/**
 * Merge chunks trên server bằng Edge Function (Streaming Merge) - Cho media (image/video)
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

