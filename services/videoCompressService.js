/**
 * Compress video để giảm chất lượng và đảm bảo tương thích
 * Sử dụng react-native-compressor để compress video thực sự
 * @param {object} videoFile - Video file object từ ImagePicker
 * @param {object} options - Options cho compression
 * @returns {Promise<{success: boolean, file?: object, needsCompress: boolean, error?: string}>}
 */
export const compressVideo = async (videoFile, options = {}) => {
    const {
        maxWidth = 720, // Giảm xuống 720p để đảm bảo tương thích
        maxHeight = 1280,
    } = options;

    try {
        console.log('🎥 [Video Compress] Bắt đầu compress video...');

        // Lấy thông tin video từ file object
        const width = videoFile.width || 0;
        const height = videoFile.height || 0;
        const videoUri = videoFile.uri;

        if (!videoUri) {
            console.log('🎥 [Video Compress] ⚠️ Không có video URI, dùng video gốc');
            return {
                success: true,
                file: videoFile,
                needsCompress: false
            };
        }

        console.log('🎥 [Video Compress] Video info:', {
            width: width,
            height: height,
            fileSize: videoFile.fileSize ? (videoFile.fileSize / (1024 * 1024)).toFixed(2) + 'MB' : 'Unknown',
            uri: videoUri.substring(0, 50) + '...'
        });

        // Kiểm tra xem có cần compress không
        const needsCompress = width > maxWidth || height > maxHeight;
        
        if (!needsCompress) {
            console.log('🎥 [Video Compress] ✅ Video không cần compress (resolution đã phù hợp)');
            return {
                success: true,
                file: videoFile,
                needsCompress: false
            };
        }

        console.log('🎥 [Video Compress] ⚠️ Video có resolution cao:', `${width}x${height}`, '→ Compress xuống 720p');

        // Tính toán resolution mới (giữ aspect ratio)
        const aspectRatio = width / height;
        let newWidth = maxWidth;
        let newHeight = maxHeight;

        if (width > height) {
            // Landscape
            newWidth = maxWidth;
            newHeight = Math.round(maxWidth / aspectRatio);
        } else {
            // Portrait
            newHeight = maxHeight;
            newWidth = Math.round(maxHeight * aspectRatio);
        }

        console.log('🎥 [Video Compress] Target resolution:', `${newWidth}x${newHeight}`);

        // Sử dụng react-native-compressor để compress video
        try {
            const { Video } = require('react-native-compressor');
            
            console.log('🎥 [Video Compress] Đang compress video...');
            const compressedUri = await Video.compress(videoUri, {
                compressionMethod: 'auto',
                minimumFileSizeForCompression: 0, // Compress tất cả video
                bitrate: 1000000, // 1Mbps bitrate
                maxSize: {
                    width: newWidth,
                    height: newHeight
                }
            });

            console.log('🎥 [Video Compress] ✅ Compress thành công!');
            console.log('🎥 [Video Compress] Compressed URI:', compressedUri.substring(0, 50) + '...');

            // Tạo file object mới với URI đã compress
            const compressedFile = {
                ...videoFile,
                uri: compressedUri,
                width: newWidth,
                height: newHeight,
                // File size có thể thay đổi sau khi compress
            };

            return {
                success: true,
                file: compressedFile,
                needsCompress: true,
                originalFile: videoFile
            };

        } catch (compressError) {
            console.log('🎥 [Video Compress] ❌ Lỗi khi compress video:', compressError.message);
            console.log('🎥 [Video Compress] 💡 Sử dụng video gốc');
            
            // Nếu compress fail, trả về video gốc
            return {
                success: false,
                error: compressError.message,
                file: videoFile, // Fallback về video gốc
                needsCompress: true,
                warning: `Không thể compress video: ${compressError.message}. Sử dụng video gốc.`
            };
        }

    } catch (error) {
        console.log('🎥 [Video Compress] ❌ Lỗi khi kiểm tra video:', error.message);
        return {
            success: false,
            error: error.message,
            file: videoFile, // Fallback về video gốc
            needsCompress: false
        };
    }
};

/**
 * Validate video format và resolution từ file object
 * @param {object} videoFile - Video file object từ ImagePicker
 * @returns {Promise<{isValid: boolean, needsCompress: boolean, resolution?: string, error?: string}>}
 */
export const validateVideo = async (videoFile) => {
    try {
        const width = videoFile.width || 0;
        const height = videoFile.height || 0;

        if (!width || !height) {
            return {
                isValid: false,
                needsCompress: false,
                error: 'Không thể lấy thông tin video'
            };
        }

        const resolution = `${width}x${height}`;
        const needsCompress = width > 720 || height > 1280;

        return {
            isValid: true,
            needsCompress: needsCompress,
            resolution: resolution,
            width: width,
            height: height
        };
    } catch (error) {
        return {
            isValid: false,
            needsCompress: false,
            error: error.message
        };
    }
};

