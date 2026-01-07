import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { supabase } from '../lib/supabase';
import { loadDocumentsCache } from '../utils/cacheHelper';
import { supabaseUrl } from '../constants/index';
import { 
    CHUNK_UPLOAD_THRESHOLD, 
    uploadChunksParallel 
} from './chunkService';
import uploadResumeService from './uploadResumeService';

export const documentService = {
    // Lấy tất cả tài liệu
    getAllDocuments: async (userId = null, useCache = true) => {
        try {
            // Check cache trước nếu có userId
            if (useCache && userId) {
                const cached = await loadDocumentsCache(userId);
                if (cached && cached.data) {
                    return { success: true, data: cached.data, fromCache: true };
                }
            }

            const { data, error } = await supabase
                .from('documents')
                .select(`
                    *,
                    uploader:users(id, name, image)
                `)
                .eq('is_public', true)
                .order('created_at', { ascending: false });

            if (error) {
                console.log('Error fetching documents:', error);
                return { success: false, msg: error.message, data: [] };
            }

            // Transform data để match với UI
            const transformedData = data.map(doc => ({
                id: doc.id,
                title: doc.title,
                type: doc.file_type || 'pdf',
                size: doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : 'N/A',
                uploadDate: new Date(doc.upload_date).toLocaleDateString('vi-VN'),
                uploader: doc.uploader?.name || 'N/A',
                downloads: doc.download_count || 0,
                category: doc.category || 'Lý thuyết',
                description: doc.description || '',
                filePath: doc.file_path,
                rating: doc.rating || 0,
                tags: doc.tags || [],
                processingStatus: doc.processing_status || 'completed' // Thêm processing_status
            }));

            // Removed: Không tự động cache ở đây, chỉ cache khi prefetch
            // Cache chỉ được tạo trong prefetchService.js

            return { success: true, data: transformedData, fromCache: false };
        } catch (error) {
            console.log('Error in getAllDocuments:', error);
            return { success: false, msg: error.message, data: [] };
        }
    },

    // Lấy tài liệu theo ID
    getDocumentById: async (documentId) => {
        try {
            const { data, error } = await supabase
                .from('documents')
                .select(`
                    *,
                    uploader:users(id, name, image)
                `)
                .eq('id', documentId)
                .single();

            if (error) {
                console.log('Error fetching document:', error);
                return { success: false, msg: error.message };
            }

            const transformedData = {
                id: data.id,
                title: data.title,
                type: data.file_type || 'pdf',
                size: data.file_size ? `${(data.file_size / 1024 / 1024).toFixed(1)} MB` : 'N/A',
                uploadDate: new Date(data.upload_date).toLocaleDateString('vi-VN'),
                uploader: data.uploader?.name || 'N/A',
                uploaderId: data.uploader_id, // Thêm uploader_id
                downloads: data.download_count || 0,
                category: data.category || 'Lý thuyết',
                description: data.description || '',
                filePath: data.file_path,
                rating: data.rating || 0,
                tags: data.tags || []
            };

            return { success: true, data: transformedData };
        } catch (error) {
            console.log('Error in getDocumentById:', error);
            return { success: false, msg: error.message };
        }
    },

    // Upload file tài liệu lên Supabase Storage (hỗ trợ chunk upload cho file > 5MB)
    uploadDocumentFile: async (fileUri, uploaderId, fileName, fileSize = 0, onProgress = null, onMergeComplete = null) => {
        try {

            // Tạo đường dẫn: documents/<uploader_id>/<file_name>
            const filePath = `documents/${uploaderId}/${fileName}`;
            const bucketName = 'media'; // Documents dùng bucket 'media' (cùng với images/videos)

            // Kiểm tra file size để quyết định upload method
            if (fileSize >= CHUNK_UPLOAD_THRESHOLD) {
                // File >= 5MB: Dùng chunk upload

                // Tạo fileId unique cho folder chunks
                const fileId = `${Date.now()}_${Math.random().toString(36).substring(2)}`;

                // Tính toán số chunks
                const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
                const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

                // Lưu upload state vào AsyncStorage (để resume nếu user thoát app)
                // Metadata sẽ được truyền từ UploadDocument.jsx qua onMergeComplete callback
                await uploadResumeService.saveChunkUploadState({
                    fileId: fileId,
                    fileUri: fileUri,
                    fileSize: fileSize,
                    fileName: fileName,
                    uploaderId: uploaderId,
                    totalChunks: totalChunks,
                    uploadedChunks: [], // Chưa upload chunk nào
                    finalPath: filePath,
                    metadata: {} // Sẽ được update sau khi tạo document record
                });

                // MIME type mặc định cho documents
                const mimeType = 'application/octet-stream';

                // Upload chunks song song
                const uploadResult = await uploadChunksParallel({
                    fileUri: fileUri,
                    fileId: fileId,
                    fileSize: fileSize,
                    mimeType: mimeType,
                    fileType: null, // Documents không có thumbnail preview
                    onProgress: onProgress,
                    // Callback khi mỗi chunk upload xong để update state ngay
                    onChunkUploaded: async (uploadedChunk) => {
                        await uploadResumeService.updateUploadedChunks([uploadedChunk]);
                    }
                });

                if (!uploadResult.success) {
                    console.log('📄 [Document Upload] ❌ Chunk upload failed:', uploadResult.error);
                    // Giữ lại state để retry sau
                    return { 
                        success: false, 
                        msg: uploadResult.error || 'Không thể tải lên file',
                        isChunked: true
                    };
                }

                // Update state với chunks đã upload
                await uploadResumeService.updateUploadedChunks(uploadResult.uploadedChunks);

                // Merge chunks trên server
                const mergeResult = await documentService.mergeDocumentChunksOnServer({
                    fileId: fileId,
                    totalChunks: uploadResult.uploadedChunks.length,
                    finalPath: filePath,
                    onProgress: onProgress
                });

                if (!mergeResult.success) {
                    console.log('📄 [Document Upload] ❌ Merge failed:', mergeResult.error);
                    // Giữ lại state để retry merge sau
                    return { 
                        success: false, 
                        msg: mergeResult.error || 'Không thể merge chunks',
                        isChunked: true
                    };
                }

                // Gọi callback khi merge xong
                if (onMergeComplete && typeof onMergeComplete === 'function') {
                    try {
                        await onMergeComplete(mergeResult.publicUrl, mergeResult.fileUrl);
                    } catch (callbackError) {
                        console.log('📄 [Document Upload] ⚠️ Merge complete callback error:', callbackError.message);
                    }
                }

                // Clear upload state vì đã upload xong
                await uploadResumeService.clearUploadState();

                return { 
                    success: true, 
                    data: mergeResult.fileUrl,
                    isChunked: true
                };
            } else {
                // File < 5MB: Upload trực tiếp (dùng binary, không base64)
                console.log('📄 [Document Upload] File < 5MB, upload trực tiếp');

                // Load file thành Blob (binary, không base64)
                const response = await fetch(fileUri);
                const blob = await response.blob();
                
                // Convert Blob thành Uint8Array (React Native không hỗ trợ blob.arrayBuffer())
                let fileData;
                try {
                    if (typeof FileReader !== 'undefined') {
                        // Browser/Web: Dùng FileReader
                        fileData = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => {
                                const arrayBuffer = reader.result;
                                resolve(new Uint8Array(arrayBuffer));
                            };
                            reader.onerror = reject;
                            reader.readAsArrayBuffer(blob);
                        });
                    } else {
                        // React Native: Dùng fetch để convert Blob → Response → ArrayBuffer → Uint8Array
                        const blobResponse = await fetch(blob);
                        const arrayBuffer = await blobResponse.arrayBuffer();
                        fileData = new Uint8Array(arrayBuffer);
                    }
                } catch (convertError) {
                    console.log('📄 [Document Upload] ❌ Không thể convert Blob:', convertError);
                    return { 
                        success: false, 
                        msg: `Không thể đọc file: ${convertError.message}` 
                    };
                }

                // Update progress nếu có callback
                if (onProgress && typeof onProgress === 'function') {
                    try {
                        onProgress(50); // 50% - đã load file
                    } catch (e) {}
                }

                const { data, error } = await supabase
                    .storage
                    .from(bucketName)
                    .upload(filePath, fileData, {
                        cacheControl: '3600',
                        upsert: false,
                        contentType: 'application/octet-stream'
                    });

                if (error) {
                    console.log('📄 [Document Upload] ❌ Upload error:', error);
                    return { success: false, msg: 'Không thể tải lên tài liệu: ' + error.message };
                }

                // Update progress 100%
                if (onProgress && typeof onProgress === 'function') {
                    try {
                        onProgress(100);
                    } catch (e) {}
                }

                return { 
                    success: true, 
                    data: data.path,
                    isChunked: false
                };
            }
        } catch (error) {
            console.log('📄 [Document Upload] ❌ Error:', error);
            return { success: false, msg: 'Không thể tải lên tài liệu: ' + error.message };
        }
    },

    // Merge document chunks trên server bằng Edge Function
    mergeDocumentChunksOnServer: async ({
        fileId,
        totalChunks,
        finalPath,
        onProgress = null
    }) => {
        const startTime = Date.now();


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
            console.log(`[Merge Document Chunks] Calling Edge Function: ${edgeFunctionUrl}`);

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
                    finalPath: finalPath
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
            console.log(`[Merge Document Chunks] Merge thành công! (${(mergeTime / 1000).toFixed(2)}s)`);
            console.log(`[Merge Document Chunks] Final URL: ${result.fileUrl}`);

            return {
                success: true,
                fileUrl: result.fileUrl,
                publicUrl: result.publicUrl || result.fileUrl
            };

        } catch (error) {
            console.log(`[Merge Document Chunks] Merge error:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    },

    // Cập nhật file_path của document sau khi merge chunks xong
    updateDocumentFilePath: async (documentId, filePath) => {
        try {
            const { data, error } = await supabase
                .from('documents')
                .update({
                    file_path: filePath,
                    processing_status: 'completed',
                    updated_at: new Date().toISOString()
                })
                .eq('id', documentId)
                .select()
                .single();

            if (error) {
                console.log('📄 [Update Document Path] ❌ Error:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.log('📄 [Update Document Path] ❌ Error:', error);
            return { success: false, msg: error.message };
        }
    },

    // Cập nhật processing_status của document
    updateDocumentProcessingStatus: async (documentId, status) => {
        try {
            const { data, error } = await supabase
                .from('documents')
                .update({
                    processing_status: status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', documentId)
                .select()
                .single();

            if (error) {
                console.log('📄 [Update Document Status] ❌ Error:', error);
                return { success: false, msg: error.message };
            }

            console.log('📄 [Update Document Status] ✅ Updated processing_status:', status);
            return { success: true, data };
        } catch (error) {
            console.log('📄 [Update Document Status] ❌ Error:', error);
            return { success: false, msg: error.message };
        }
    },

    // Thêm tài liệu mới
    addDocument: async (documentData) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { success: false, msg: 'User not authenticated' };
            }

            const { data, error } = await supabase
                .from('documents')
                .insert({
                    title: documentData.title,
                    description: documentData.description || '',
                    category: documentData.category || 'Lý thuyết',
                    file_type: documentData.file_type || 'pdf',
                    file_size: documentData.file_size || 0,
                    file_path: documentData.file_path,
                    uploader_id: user.id,
                    upload_date: new Date().toISOString(),
                    download_count: 0,
                    rating: 0,
                    tags: documentData.tags || [],
                    is_public: documentData.is_public !== false
                })
                .select()
                .single();

            if (error) {
                console.log('Error adding document:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.log('Error in addDocument:', error);
            return { success: false, msg: error.message };
        }
    },

    // Cập nhật tài liệu
    updateDocument: async (documentId, updateData) => {
        try {
            const { data, error } = await supabase
                .from('documents')
                .update({
                    title: updateData.title,
                    description: updateData.description,
                    category: updateData.category,
                    tags: updateData.tags,
                    is_public: updateData.is_public,
                    updated_at: new Date().toISOString()
                })
                .eq('id', documentId)
                .select()
                .single();

            if (error) {
                console.log('Error updating document:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.log('Error in updateDocument:', error);
            return { success: false, msg: error.message };
        }
    },

    // Xóa tài liệu
    deleteDocument: async (documentId) => {
        try {
            const { error } = await supabase
                .from('documents')
                .delete()
                .eq('id', documentId);

            if (error) {
                console.log('Error deleting document:', error);
                return { success: false, msg: error.message };
            }

            return { success: true };
        } catch (error) {
            console.log('Error in deleteDocument:', error);
            return { success: false, msg: error.message };
        }
    },

    // Tìm kiếm tài liệu
    searchDocuments: async (searchText, filters = {}) => {
        try {
            let query = supabase
                .from('documents')
                .select(`
                    *,
                    uploader:users(id, name, image)
                `)
                .eq('is_public', true);

            // Tìm kiếm theo text
            if (searchText) {
                query = query.or(`title.ilike.%${searchText}%,description.ilike.%${searchText}%,category.ilike.%${searchText}%`);
            }

            // Filter theo category
            if (filters.category && filters.category !== 'Tất cả') {
                query = query.eq('category', filters.category);
            }

            // Filter theo file_type
            if (filters.fileType && filters.fileType !== 'Tất cả') {
                query = query.eq('file_type', filters.fileType);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                console.log('Error searching documents:', error);
                return { success: false, msg: error.message, data: [] };
            }

            // Transform data
            const transformedData = data.map(doc => ({
                id: doc.id,
                title: doc.title,
                type: doc.file_type || 'pdf',
                size: doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : 'N/A',
                uploadDate: new Date(doc.upload_date).toLocaleDateString('vi-VN'),
                uploader: doc.uploader?.name || 'N/A',
                downloads: doc.download_count || 0,
                category: doc.category || 'Lý thuyết',
                description: doc.description || '',
                filePath: doc.file_path,
                rating: doc.rating || 0,
                tags: doc.tags || []
            }));

            return { success: true, data: transformedData };
        } catch (error) {
            console.log('Error in searchDocuments:', error);
            return { success: false, msg: error.message, data: [] };
        }
    },

    // Tăng lượt tải
    incrementDownload: async (documentId) => {
        try {
            const { data, error } = await supabase
                .from('documents')
                .update({
                    download_count: supabase.raw('download_count + 1')
                })
                .eq('id', documentId)
                .select('download_count')
                .single();

            if (error) {
                console.log('Error incrementing download:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: data.download_count };
        } catch (error) {
            console.log('Error in incrementDownload:', error);
            return { success: false, msg: error.message };
        }
    },

    // Đánh giá tài liệu
    rateDocument: async (documentId, rating) => {
        try {
            const { data, error } = await supabase
                .from('documents')
                .update({
                    rating: rating
                })
                .eq('id', documentId)
                .select('rating')
                .single();

            if (error) {
                console.log('Error rating document:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: data.rating };
        } catch (error) {
            console.log('Error in rateDocument:', error);
            return { success: false, msg: error.message };
        }
    },

    // Download file tài liệu về local storage
    downloadDocumentFile: async (fileUrl, fileName, onProgress = null) => {
        try {
            // Kiểm tra FileSystem có sẵn không
            if (!FileSystem) {
                console.error('FileSystem is not available');
                return { success: false, msg: 'FileSystem không khả dụng' };
            }

            // Tạo đường dẫn lưu file - thử documentDirectory trước, fallback về cacheDirectory
            let documentsDir = FileSystem.documentDirectory;
            
            if (!documentsDir) {
                documentsDir = FileSystem.cacheDirectory;
            }
            
            if (!documentsDir) {
                console.error('FileSystem.documentDirectory and cacheDirectory are both null');
                console.error('FileSystem object:', FileSystem);
                return { success: false, msg: 'Không thể truy cập thư mục lưu trữ. Vui lòng kiểm tra quyền truy cập.' };
            }

            // Tạo tên file với timestamp để tránh trùng lặp
            const timestamp = Date.now();
            const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const localFileName = `${timestamp}_${sanitizedFileName}`;
            const localFilePath = `${documentsDir}${localFileName}`;

            // Kiểm tra URL có hợp lệ không bằng cách fetch HEAD request
            try {
                const headResponse = await fetch(fileUrl, { method: 'HEAD' });
                if (!headResponse.ok) {
                    console.error('URL not accessible:', headResponse.status, headResponse.statusText);
                    return { success: false, msg: `Không thể truy cập file. Lỗi: ${headResponse.status} ${headResponse.statusText}` };
                }
                const contentLength = headResponse.headers.get('content-length');
            } catch (fetchError) {
                console.warn('Could not check URL with HEAD request:', fetchError.message);
                // Tiếp tục download dù không check được
            }

            // Download file với progress callback
            const downloadResult = await FileSystem.downloadAsync(
                fileUrl,
                localFilePath,
                {
                    // Có thể thêm headers nếu cần
                }
            );

            if (!downloadResult || !downloadResult.uri) {
                return { success: false, msg: 'Download thất bại: Không nhận được file' };
            }

            // Kiểm tra file size sau khi download
            const downloadedFileInfo = await FileSystem.getInfoAsync(downloadResult.uri);

            if (!downloadedFileInfo.exists) {
                return { success: false, msg: 'Download thất bại: File không tồn tại sau khi tải' };
            }

            if (downloadedFileInfo.size === 0) {
                return { success: false, msg: 'Download thất bại: File có kích thước 0 byte. Có thể URL không đúng hoặc file không tồn tại.' };
            }

            // Cảnh báo nếu file quá nhỏ (có thể là HTML error page)
            if (downloadedFileInfo.size < 100) {
                console.warn('File size is very small:', downloadedFileInfo.size, 'bytes. May be an error page.');
                // Đọc một phần file để kiểm tra xem có phải HTML không
                try {
                    const fileContent = await FileSystem.readAsStringAsync(downloadResult.uri, { length: 100 });
                    if (fileContent.includes('<html') || fileContent.includes('<!DOCTYPE')) {
                        return { success: false, msg: 'Download thất bại: URL trả về trang lỗi thay vì file. Vui lòng kiểm tra lại URL.' };
                    }
                } catch (readError) {
                    console.warn('Could not read file to check:', readError.message);
                }
            }

            return {
                success: true,
                localUri: downloadResult.uri,
                fileName: localFileName,
                originalFileName: fileName
            };
        } catch (error) {
            console.error('Error downloading document file:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            return { success: false, msg: `Lỗi khi tải file: ${error.message || 'Unknown error'}` };
        }
    },

    // Lưu file vào Media Library (để có thể mở bằng ứng dụng khác)
    saveToMediaLibrary: async (fileUri, fileName, fileType = 'video') => {
        try {
            // Request permissions
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                return { 
                    success: false, 
                    msg: 'Cần quyền truy cập thư viện để lưu file. Vui lòng cấp quyền trong Cài đặt.' 
                };
            }

            // Kiểm tra xem file có tồn tại không và có size > 0
            const fileInfo = await FileSystem.getInfoAsync(fileUri);
            if (!fileInfo.exists) {
                return { success: false, msg: 'File không tồn tại' };
            }

            if (fileInfo.size === 0) {
                return { success: false, msg: 'File có kích thước 0 byte, không thể lưu' };
            }

            console.log('File info before saving:', {
                uri: fileUri,
                exists: fileInfo.exists,
                size: fileInfo.size,
                fileName: fileName
            });

            // Đợi một chút để đảm bảo file đã được ghi hoàn toàn
            await new Promise(resolve => setTimeout(resolve, 500));

            // Kiểm tra lại file size sau khi đợi
            const fileInfoAfterWait = await FileSystem.getInfoAsync(fileUri);
            if (fileInfoAfterWait.size === 0) {
                return { success: false, msg: 'File có kích thước 0 byte sau khi tải, vui lòng thử lại' };
            }

            console.log('File info after wait:', {
                size: fileInfoAfterWait.size,
                sizeBefore: fileInfo.size
            });

            // Lưu vào Media Library
            // createAssetAsync sẽ tự động xử lý metadata cho video
            const asset = await MediaLibrary.createAssetAsync(fileUri);

            if (!asset || !asset.id) {
                return { success: false, msg: 'Không thể tạo asset trong Media Library' };
            }

            console.log('File saved to Media Library:', {
                id: asset.id,
                uri: asset.uri,
                filename: asset.filename,
                mediaType: asset.mediaType,
                duration: asset.duration,
                width: asset.width,
                height: asset.height
            });

            // Kiểm tra xem asset có metadata đầy đủ không
            if (fileType === 'video' && asset.duration === 0) {
                console.warn('Video saved but duration is 0, may need time to process');
            }

            return {
                success: true,
                assetUri: asset.uri,
                id: asset.id,
                duration: asset.duration,
                width: asset.width,
                height: asset.height
            };
        } catch (error) {
            console.error('Error saving to Media Library:', error);
            console.error('Error details:', JSON.stringify(error, null, 2));
            return { success: false, msg: `Lỗi khi lưu vào thư viện: ${error.message || 'Unknown error'}` };
        }
    }
};


