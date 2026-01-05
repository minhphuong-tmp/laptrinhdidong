import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { supabase } from '../lib/supabase';
import { loadDocumentsCache } from '../utils/cacheHelper';

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
                tags: doc.tags || []
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

    // Upload file tài liệu lên Supabase Storage
    uploadDocumentFile: async (fileUri, uploaderId, fileName) => {
        try {
            // Đọc file thành base64
            const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
                encoding: 'base64',
            });

            // Decode base64 thành array buffer
            const fileData = decode(fileBase64);

            // Tạo đường dẫn: documents/<uploader_id>/<file_name>
            const filePath = `documents/${uploaderId}/${fileName}`;

            // Upload lên bucket 'upload' (bucket mặc định)
            const bucketName = 'upload';

            console.log('Uploading document to bucket:', bucketName, 'with path:', filePath);

            const { data, error } = await supabase
                .storage
                .from(bucketName)
                .upload(filePath, fileData, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: 'application/octet-stream'
                });

            if (error) {
                console.log('Document upload error:', error);
                return { success: false, msg: 'Không thể tải lên tài liệu: ' + error.message };
            }

            console.log('Document upload success:', data);
            return { success: true, data: data.path };
        } catch (error) {
            console.log('Document upload error:', error);
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


