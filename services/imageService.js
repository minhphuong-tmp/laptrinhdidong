import * as FileSystem from 'expo-file-system';

import { decode } from 'base64-arraybuffer';
import { supabaseUrl } from '../constants';
import { supabase } from '../lib/supabase';

export const getUserImageSrc = (imagePath) => {
    if (imagePath) {
        const url = getSupabaseFileUrl(imagePath);
        return url;
    } else {
        // Use default avatar from Supabase Storage
        return { uri: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png` };
    }
};
export const downloadFile = async (url) => {
    try {
        const { uri } = await FileSystem.downloadAsync(url, getLocalFilePath(url));
        return uri;
    } catch (error) {
        return null;
    }
};

export const getLocalFilePath = (filePath) => {
    let fileName = filePath.split('/').pop();
    return `${FileSystem.documentDirectory}${fileName}`;
};
export const getSupabaseFileUrl = (filePath) => {
    if (filePath) {
        // Nếu đã là full URL thì trả về trực tiếp
        if (filePath.startsWith('http')) {
            return { uri: filePath };
        }

        // Xử lý các bucket khác nhau cho path
        if (filePath.includes('postImages/')) {
            // Ảnh bài viết từ bucket postImages
            return { uri: `${supabaseUrl}/storage/v1/object/public/postImages/${filePath}` };
        } else if (filePath.includes('postVideos/')) {
            // Video bài viết từ bucket postVideos  
            return { uri: `${supabaseUrl}/storage/v1/object/public/postVideos/${filePath}` };
        } else if (filePath.includes('documents/')) {
            // Tài liệu từ bucket documents
            return { uri: `${supabaseUrl}/storage/v1/object/public/documents/${filePath}` };
        } else if (filePath.startsWith('upload/')) {
            // File từ bucket upload
            return { uri: `${supabaseUrl}/storage/v1/object/public/${filePath}` };
        } else {
            // Mặc định là bucket upload
            return { uri: `${supabaseUrl}/storage/v1/object/public/upload/${filePath}` };
        }
    }
    return null;
};

export const uploadFile = async (folderName, fileUri, isImage = true) => {
    try {
        let fileName = getFilePath(folderName, isImage);
        const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        let imageData = decode(fileBase64); // array buffer

        // Xác định bucket dựa trên folderName
        let bucketName = 'upload'; // mặc định
        if (folderName === 'postImages' || folderName === 'postVideos') {
            bucketName = folderName;
        } else if (folderName === 'documents') {
            bucketName = 'documents';
        }

        console.log('Uploading to bucket:', bucketName, 'with path:', fileName);

        let { data, error } = await supabase
            .storage
            .from(bucketName)
            .upload(fileName, imageData, {
                cacheControl: '3600',
                upsert: false,
                contentType: isImage ? 'image/*' : 'video/*'
            });

        if (error) {
            console.log("file upload error: ", error);
            return { success: false, msg: "Không thể tải lên media" };
        }

        console.log("Upload success: ", data);
        return { success: true, data: data.path };
    } catch (error) {
        console.log("file upload error: ", error);
        return { success: false, msg: "Không thể tải lên media" };
    }
};
export const getFilePath = (folderName, isImage) => {
    return `/${folderName}/${new Date().getTime()}${isImage ? '.png' : '.mp4'}`;
};