import { supabase } from '../lib/supabase';

export const documentService = {
    // Lấy tất cả tài liệu
    getAllDocuments: async () => {
        try {
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

            return { success: true, data: transformedData };
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
    }
};


