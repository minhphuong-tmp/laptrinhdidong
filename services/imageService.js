import * as FileSystem from 'expo-file-system/legacy';

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

        // Tất cả file đều được lưu trong bucket 'upload'
        // Path có thể là: /postImages/..., /postVideos/..., /documents/..., hoặc path khác
        // Cần loại bỏ dấu / đầu tiên nếu có để tránh double slash
        let cleanPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;

        // Tạo URL với bucket 'upload'
        return { uri: `${supabaseUrl}/storage/v1/object/public/upload/${cleanPath}` };
    }
    return null;
};

export const uploadFile = async (folderName, fileUri, isImage = true) => {
    try {
        let fileName = getFilePath(folderName, isImage);
        const fileBase64 = await FileSystem.readAsStringAsync(fileUri, {
            encoding: 'base64',
        });
        let imageData = decode(fileBase64); // array buffer

        // Sử dụng bucket 'upload' (bucket mặc định) cho tất cả
        // Phân biệt bằng folder path trong fileName
        let bucketName = 'upload'; // mặc định - bucket này luôn tồn tại

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