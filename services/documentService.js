import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import RNBlobUtil from 'react-native-blob-util';
import { supabase } from '../lib/supabase';
import { loadDocumentsCache } from '../utils/cacheHelper';
import {
    CHUNK_UPLOAD_THRESHOLD,
    getPresignedUrlForSingleFile,
    mergeDocumentChunksOnServer,
    uploadChunksParallel
} from './chunkService';

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
                console.log('Error details:', JSON.stringify(error, null, 2));
                return { success: false, msg: error.message || `error code: ${error.code || 'unknown'}`, data: [] };
            }

            // Transform data để match với UI
            const transformedData = (data || []).map(doc => {
                try {
                    // Xử lý upload_date: có thể là upload_date hoặc created_at
                    const uploadDate = doc.upload_date || doc.created_at;
                    return {
                        id: doc.id,
                        title: doc.title,
                        type: doc.file_type || 'pdf',
                        size: doc.file_size ? `${(doc.file_size / 1024 / 1024).toFixed(1)} MB` : 'N/A',
                        uploadDate: uploadDate ? new Date(uploadDate).toLocaleDateString('vi-VN') : 'N/A',
                        uploader: doc.uploader?.name || 'N/A',
                        downloads: doc.download_count || 0,
                        category: doc.category || 'Lý thuyết',
                        description: doc.description || '',
                        filePath: doc.file_path,
                        rating: doc.rating || 0,
                        tags: doc.tags || [],
                        isProcessing: doc.processing_status === 'processing'
                    };
                } catch (transformError) {
                    console.log('Error transforming document:', doc.id, transformError);
                    return null;
                }
            }).filter(doc => doc !== null); // Loại bỏ các document transform fail

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
                tags: data.tags || [],
                isProcessing: data.processing_status === 'processing'
            };

            return { success: true, data: transformedData };
        } catch (error) {
            console.log('Error in getDocumentById:', error);
            return { success: false, msg: error.message };
        }
    },

    // Upload file tài liệu lên Supabase Storage (với chunk upload cho file lớn)
    uploadDocumentFile: async (fileUri, uploaderId, fileName, fileSize = 0, onProgress = null, onMergeComplete = null) => {
        try {
            // Documents dùng bucket "media" (cùng bucket với images/videos, phân biệt bằng folder path)
            const bucketName = 'media';
            const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(2);
            
            console.log('📄 [Document Upload] Bắt đầu upload tài liệu:', fileName);
            console.log(`📄 [Document Upload] File size: ${fileSizeMB} MB (${fileSize} bytes)`);
            console.log(`📄 [Document Upload] Using bucket: ${bucketName}`);

            // Validate onProgress callback
            const progressCallback = typeof onProgress === 'function' ? onProgress : null;

            // Check file size để quyết định upload method
            if (fileSize >= CHUNK_UPLOAD_THRESHOLD) {
                // File >= 5MB: Chia chunks và upload song song
                console.log('📄 [Document Upload] File >= 5MB, sẽ dùng chunk upload');

                // Tạo fileId unique cho folder chunks
                const fileId = `${Date.now()}_${Math.random().toString(36).substring(2)}`;
                console.log(`📄 [Document Upload] File ID: ${fileId}`);

                // Upload chunks song song với presigned URLs (tự động lấy presigned URLs trong uploadChunksParallel)
                const uploadResult = await uploadChunksParallel({
                    fileUri: fileUri,
                    fileId: fileId,
                    fileSize: fileSize,
                    mimeType: 'application/octet-stream',
                    fileType: 'document', // Để phân biệt với image/video
                    bucketName: bucketName, // Documents dùng bucket "media" (cùng với images/videos)
                    onProgress: (progress) => {
                        // Update progress (0-80% cho upload chunks)
                        if (progressCallback) {
                            try {
                                progressCallback(progress);
                            } catch (progressError) {
                                console.log('📄 [Document Upload] ⚠️ Progress callback error:', progressError.message);
                            }
                        }
                    }
                });

                if (!uploadResult.success) {
                    console.log(`📄 [Document Upload] ❌ Upload chunks fail: ${uploadResult.error}`);
                    return { 
                        success: false, 
                        msg: 'Không thể tải lên tài liệu: ' + uploadResult.error 
                    };
                }

                // Upload chunks thành công - return ngay (không đợi merge)
                // Tạo đường dẫn cuối cùng
                const finalPath = `documents/${uploaderId}/${fileName}`;
                
                // Gọi merge ở background (KHÔNG await - fire and forget hoàn toàn)
                const totalChunks = uploadResult.uploadedChunks.length;
                
                // Merge ở background (fire and forget - KHÔNG có progress callback để không block UI)
                mergeDocumentChunksOnServer({
                    fileId: fileId,
                    totalChunks: totalChunks,
                    finalPath: finalPath,
                    bucketName: bucketName,
                    onProgress: null // Không gọi progress callback để không block UI
                }).then((mergeResult) => {
                    if (mergeResult.success) {
                        console.log(`📄 [Document Upload] ✅ Merge thành công ở background: ${mergeResult.fileUrl}`);
                        // Gọi callback nếu có (để update document record)
                        if (onMergeComplete && typeof onMergeComplete === 'function') {
                            try {
                                onMergeComplete(mergeResult.fileUrl, finalPath);
                            } catch (callbackError) {
                                console.log('📄 [Document Upload] ⚠️ onMergeComplete callback error:', callbackError.message);
                            }
                        }
                    } else {
                        console.log(`📄 [Document Upload] ❌ Merge fail ở background: ${mergeResult.error}`);
                    }
                }).catch((error) => {
                    console.log('📄 [Document Upload] ❌ Merge error ở background:', error.message);
                });

                // Return ngay với file_path tạm thời (chunks path) hoặc final path
                // Người dùng có thể tiếp tục dùng app
                return { 
                    success: true, 
                    data: finalPath, // Trả về final path (sẽ có sau khi merge xong)
                    isChunked: true,
                    fileId: fileId,
                    totalChunks: totalChunks
                };
            } else {
                // File < 5MB: Upload với presigned URL dùng react-native-blob-util
                // ✅ GIẢI PHÁP: react-native-blob-util không dùng Transfer-Encoding: chunked
                // Gửi Content-Length thật → S3 proxy CHẤP NHẬN
                console.log('📄 [Document Upload] File < 5MB, upload với presigned URL (RNBlobUtil)');

                // Tạo đường dẫn: documents/<uploader_id>/<file_name>
                const filePath = `documents/${uploaderId}/${fileName}`;
                const fileId = `single_${Date.now()}_${Math.random().toString(36).substring(2)}`;

                console.log('📄 [Document Upload] Uploading to bucket:', bucketName, 'with path:', filePath);

                // Update progress 30% (đang lấy presigned URL)
                if (progressCallback) {
                    try {
                        progressCallback(30);
                    } catch (progressError) {
                        // Ignore
                    }
                }

                // 1. Lấy presigned URL cho single file
                const presignedResult = await getPresignedUrlForSingleFile({
                    fileId: fileId,
                    filePath: filePath,
                    bucketName: bucketName
                });

                if (!presignedResult.success || !presignedResult.url) {
                    console.log('📄 [Document Upload] ❌ Không thể lấy presigned URL:', presignedResult.error);
                    return { success: false, msg: 'Không thể lấy presigned URL: ' + presignedResult.error };
                }

                const presignedUrl = presignedResult.url;
                console.log('📄 [Document Upload] ✅ Lấy presigned URL thành công');

                // Update progress 50% (đang upload)
                if (progressCallback) {
                    try {
                        progressCallback(50);
                    } catch (progressError) {
                        // Ignore
                    }
                }

                // 2. Upload với presigned URL dùng react-native-blob-util
                // ✅ RNBlobUtil.fetch() - không dùng Transfer-Encoding: chunked, gửi Content-Length thật
                console.log('📄 [Document Upload] Bắt đầu upload với presigned URL (RNBlobUtil)...');
                
                const uploadStartTime = Date.now();
                
                try {
                    // RNBlobUtil.fetch() upload trực tiếp từ fileUri
                    // ✅ GIẢI PHÁP: KHÔNG set headers gì cả
                    // Presigned URL chỉ ký host header → RNBlobUtil muốn thêm headers gì cứ để nó thêm
                    const uploadResponse = await RNBlobUtil.fetch(
                        'PUT',
                        presignedUrl,
                        {},  // ✅ Để trống - KHÔNG set headers gì cả
                        RNBlobUtil.wrap(fileUri) // Wrap fileUri để upload trực tiếp từ file
                    );

                    const uploadTime = Date.now() - uploadStartTime;
                    const status = uploadResponse.info().status;

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
                        console.log('📄 [Document Upload] ❌ Upload error:', errorMessage);
                        return { success: false, msg: 'Không thể tải lên tài liệu: ' + errorMessage };
                    }

                    // Update progress 100% (upload xong)
                    if (progressCallback) {
                        try {
                            progressCallback(100);
                        } catch (progressError) {
                            // Ignore
                        }
                    }

                    console.log(`📄 [Document Upload] ✅ Upload thành công với presigned URL (RNBlobUtil)! (${(uploadTime / 1000).toFixed(2)}s)`);
                    return { 
                        success: true, 
                        data: filePath,
                        isChunked: false,
                        usedPresignedUrl: true
                    };
                } catch (error) {
                    console.log('📄 [Document Upload] ❌ Upload error:', error);
                    return { success: false, msg: 'Không thể tải lên tài liệu: ' + (error.message || String(error)) };
                }
            }
        } catch (error) {
            console.log('📄 [Document Upload] ❌ Upload error:', error);
            return { success: false, msg: 'Không thể tải lên tài liệu: ' + error.message };
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
                    is_public: documentData.is_public !== false,
                    processing_status: documentData.processing_status || 'completed'
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

    // Cập nhật file_path của tài liệu (sau khi merge chunks xong)
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
                console.log('Error updating document file_path:', error);
                return { success: false, msg: error.message };
            }

            console.log('📄 [Document Upload] ✅ Updated document file_path và processing_status:', filePath);
            return { success: true, data };
        } catch (error) {
            console.log('Error in updateDocumentFilePath:', error);
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
            console.log('FileSystem.documentDirectory:', documentsDir);
            
            if (!documentsDir) {
                documentsDir = FileSystem.cacheDirectory;
                console.log('FileSystem.cacheDirectory:', documentsDir);
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

            console.log('Downloading file from:', fileUrl);
            console.log('Saving to:', localFilePath);
            console.log('Using directory:', documentsDir === FileSystem.documentDirectory ? 'documentDirectory' : 'cacheDirectory');

            // Kiểm tra URL có hợp lệ không bằng cách fetch HEAD request
            try {
                const headResponse = await fetch(fileUrl, { method: 'HEAD' });
                if (!headResponse.ok) {
                    console.error('URL not accessible:', headResponse.status, headResponse.statusText);
                    return { success: false, msg: `Không thể truy cập file. Lỗi: ${headResponse.status} ${headResponse.statusText}` };
                }
                const contentLength = headResponse.headers.get('content-length');
                if (contentLength) {
                    console.log('Expected file size:', contentLength, 'bytes');
                }
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

            console.log('Download completed:', downloadResult.uri);

            // Kiểm tra file size sau khi download
            const downloadedFileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
            console.log('Downloaded file info:', {
                exists: downloadedFileInfo.exists,
                size: downloadedFileInfo.size,
                uri: downloadResult.uri
            });

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


