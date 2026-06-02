import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useDocumentContext } from '../../context/DocumentContext';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import UploadSuccessModal from '../../components/UploadSuccessModal';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { documentService } from '../../services/documentService';
import uploadResumeService from '../../services/uploadResumeService';

const UploadDocument = () => {
    const { user } = useAuth();
    const router = useRouter();
    const { addNewDocument, updateDocument } = useDocumentContext();

    // Form state
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [category, setCategory] = useState('Lý thuyết');
    const [tags, setTags] = useState('');
    const [isPublic, setIsPublic] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState(''); // 'uploading', 'processing', 'completed'
    const [uploadSuccessModal, setUploadSuccessModal] = useState({ visible: false, title: '', message: '' });

    const categories = ['Lý thuyết', 'Thực hành', 'Video', 'Thi cử'];

    const handlePickDocument = async () => {
        // Fallback cho Web
        if (Platform.OS === 'web') {
            Alert.alert('Thông báo', 'Tính năng chọn file không hỗ trợ trên Web. Vui lòng sử dụng ứng dụng di động.');
            return;
        }

        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                multiple: false,
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const file = result.assets[0];

                // Kiểm tra kích thước file (100MB)
                if (file.size && file.size > 100 * 1024 * 1024) {
                    Alert.alert('Lỗi', 'File quá lớn. Vui lòng chọn file nhỏ hơn 100MB');
                    return;
                }

                setSelectedFile(file);
                setError('');
            }
        } catch (error) {
            console.error('Error picking document:', error);
            Alert.alert('Lỗi', 'Không thể chọn file: ' + (error.message || 'Unknown error'));
        }
    };

    const getFileExtension = (fileName) => {
        if (!fileName) return 'pdf';
        const parts = fileName.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'pdf';
    };

    const formatFileSize = (bytes) => {
        if (!bytes) return 'N/A';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    };

    const handleUpload = async () => {
        // Validation
        if (!title.trim()) {
            setError('Vui lòng nhập tiêu đề tài liệu');
            return;
        }

        if (!selectedFile) {
            setError('Vui lòng chọn file tài liệu');
            return;
        }

        if (!user) {
            Alert.alert('Lỗi', 'Bạn cần đăng nhập để tải lên tài liệu');
            return;
        }

        setLoading(true);
        setError('');
        setUploadProgress(0);
        setUploadStatus('uploading');

        // Track thời gian bắt đầu upload
        const uploadStartTime = Date.now();

        try {
            // 1. Parse tags từ string thành array
            const fileExtension = getFileExtension(selectedFile.name);
            const fileName = `${Date.now()}_${selectedFile.name}`;
            const fileSize = selectedFile.size || 0;
            const tagsArray = tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);


            // 2. Tạo document record NGAY (trước khi upload) để user có thể quay lại sử dụng app
            const isChunked = fileSize >= 5 * 1024 * 1024; // >= 5MB
            const documentData = {
                title: title.trim(),
                description: description.trim(),
                category: category,
                file_type: fileExtension,
                file_size: fileSize,
                file_path: isChunked ? 'processing' : '', // Tạm thời, sẽ update sau
                tags: tagsArray,
                is_public: isPublic,
                processing_status: isChunked ? 'processing' : 'pending' // 'processing' nếu chunk upload, 'pending' nếu file nhỏ
            };

            const createResult = await documentService.addDocument(documentData);
            if (!createResult.success) {
                setError(createResult.msg || 'Không thể tạo bản ghi tài liệu');
                setLoading(false);
                setUploadStatus('');
                return;
            }

            const savedDocumentId = createResult.data?.id;
            const savedDocument = createResult.data;

            // Format document data để thêm vào state ngay (giống format từ getAllDocuments)
            const newDocumentData = {
                id: savedDocument.id,
                title: savedDocument.title,
                type: savedDocument.file_type || 'pdf',
                size: savedDocument.file_size ? `${(savedDocument.file_size / 1024 / 1024).toFixed(1)} MB` : 'N/A',
                uploadDate: new Date(savedDocument.upload_date || savedDocument.created_at).toLocaleDateString('vi-VN'),
                uploader: user?.name || 'N/A',
                downloads: savedDocument.download_count || 0,
                category: savedDocument.category || 'Lý thuyết',
                description: savedDocument.description || '',
                filePath: savedDocument.file_path,
                rating: savedDocument.rating || 0,
                tags: savedDocument.tags || [],
                processingStatus: savedDocument.processing_status || 'completed'
            };

            // Thêm document vào context ngay (không cần AsyncStorage)
            addNewDocument(newDocumentData);

            // 3. Nếu là file lớn (chunk upload), lưu state và cho user quay lại ngay
            if (isChunked) {
                // Bắt đầu upload ở background (không await)
                documentService.uploadDocumentFile(
                    selectedFile.uri,
                    user.id,
                    fileName,
                    fileSize,
                    (progress) => {
                        // Progress callback (không cần update UI vì user đã quay lại)
                    },
                    // Callback khi merge xong (chỉ cho file lớn)
                    async (fileUrl, finalPath) => {
                        // Update document file_path và processing_status sau khi merge xong
                        if (savedDocumentId) {
                            try {
                                await documentService.updateDocumentFilePath(savedDocumentId, finalPath);
                                // Update document trong context để UI cập nhật ngay
                                updateDocument(savedDocumentId, {
                                    filePath: finalPath,
                                    processingStatus: 'completed'
                                });
                            } catch (updateError) {
                                console.log('📄 [Document Upload] ⚠️ Không thể update file_path:', updateError.message);
                            }
                        }
                    }
                ).catch(async (error) => {
                    // Nếu upload fail, update document status thành 'failed'
                    console.error('📄 [Document Upload] ❌ Upload failed:', error);
                    if (savedDocumentId) {
                        await documentService.updateDocumentProcessingStatus(savedDocumentId, 'failed');
                    }
                });

                // Update metadata trong upload state với documentId
                const currentState = uploadResumeService.currentUploadState;
                if (currentState) {
                    currentState.metadata = {
                        ...currentState.metadata,
                        documentId: savedDocumentId,
                        title: title.trim(),
                        description: description.trim(),
                        category: category,
                        fileType: fileExtension,
                        tags: tagsArray,
                        isPublic: isPublic
                    };
                    await uploadResumeService.saveUploadState();
                }

                // Log thời gian từ lúc bắt đầu đến khi lưu xong state và hiển thị modal
                const timeToShowModal = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
                console.log(`Thời gian lưu STATE: ${timeToShowModal}s`);

                // Hiển thị modal và cho user quay lại ngay
                setLoading(false);
                setUploadSuccessModal({
                    visible: true,
                    title: 'Đã bắt đầu upload',
                    message: 'Tài liệu đã được thêm vào danh sách. File đang được tải lên và xử lý ở background. Bạn có thể tiếp tục sử dụng ứng dụng.'
                });
                return; // Dừng ở đây, upload sẽ chạy ở background
            }

            // 4. Nếu là file nhỏ, upload bình thường và đợi kết quả
            const uploadResult = await documentService.uploadDocumentFile(
                selectedFile.uri,
                user.id,
                fileName,
                fileSize,
                (progress) => {
                    // Update progress
                    setUploadProgress(progress);
                    if (progress < 80) {
                        setUploadStatus('uploading');
                    } else if (progress < 100) {
                        setUploadStatus('processing');
                    } else {
                        setUploadStatus('completed');
                    }
                },
                null // File nhỏ không có merge callback
            );

            if (!uploadResult.success) {
                setError(uploadResult.msg || 'Không thể tải lên file');
                setLoading(false);
                setUploadStatus('');
                return;
            }

            // 5. Update file_path cho document (file nhỏ upload xong ngay)
            if (savedDocumentId) {
                await documentService.updateDocumentFilePath(savedDocumentId, uploadResult.data);
            }

            // 6. File nhỏ upload xong hoàn toàn
            setUploadStatus('completed');
            setUploadProgress(100);
            
            // Hiển thị modal thành công
            setUploadSuccessModal({
                visible: true,
                title: 'Thành công',
                message: 'Đã tải lên tài liệu thành công!'
            });
        } catch (error) {
            console.error('Error uploading document:', error);
            setError('Có lỗi xảy ra: ' + error.message);
            setLoading(false);
            setUploadStatus('');
        }
    };

    return (
        <View style={styles.container}>
            <Header title="Tải lên tài liệu" showBackButton />

            <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Title Input */}
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Tiêu đề *</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Nhập tiêu đề tài liệu"
                        placeholderTextColor={theme.colors.textSecondary}
                        value={title}
                        onChangeText={setTitle}
                        editable={!loading}
                    />
                </View>

                {/* Description Input */}
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Mô tả</Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Nhập mô tả tài liệu (tùy chọn)"
                        placeholderTextColor={theme.colors.textSecondary}
                        value={description}
                        onChangeText={setDescription}
                        multiline
                        numberOfLines={4}
                        editable={!loading}
                    />
                </View>

                {/* Category Select */}
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Danh mục</Text>
                    <View style={styles.categoryContainer}>
                        {categories.map((cat) => (
                            <TouchableOpacity
                                key={cat}
                                style={[
                                    styles.categoryButton,
                                    category === cat && styles.categoryButtonActive
                                ]}
                                onPress={() => setCategory(cat)}
                                disabled={loading}
                            >
                                <Text
                                    style={[
                                        styles.categoryText,
                                        category === cat && styles.categoryTextActive
                                    ]}
                                >
                                    {cat}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* Tags Input */}
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Thẻ (cách nhau bởi dấu phẩy)</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Ví dụ: math, code, algorithm"
                        placeholderTextColor={theme.colors.textSecondary}
                        value={tags}
                        onChangeText={setTags}
                        editable={!loading}
                    />
                </View>

                {/* Public/Private Toggle */}
                <View style={styles.inputContainer}>
                    <TouchableOpacity
                        style={styles.checkboxContainer}
                        onPress={() => setIsPublic(!isPublic)}
                        disabled={loading}
                    >
                        <View style={[
                            styles.checkbox,
                            isPublic && styles.checkboxChecked
                        ]}>
                            {isPublic && <Icon name="check" size={hp(1.5)} color="white" />}
                        </View>
                        <Text style={styles.checkboxLabel}>Công khai (mọi người có thể xem)</Text>
                    </TouchableOpacity>
                </View>

                {/* File Picker */}
                <View style={styles.inputContainer}>
                    <Text style={styles.label}>File tài liệu *</Text>
                    <TouchableOpacity
                        style={styles.filePickerButton}
                        onPress={handlePickDocument}
                        disabled={loading}
                    >
                        <Icon name="file-text" size={hp(2.5)} color={theme.colors.primary} />
                        <Text style={styles.filePickerText}>
                            {selectedFile ? 'Đã chọn file' : 'Chọn file tài liệu'}
                        </Text>
                    </TouchableOpacity>

                    {selectedFile && (
                        <View style={styles.fileInfo}>
                            <View style={styles.fileInfoRow}>
                                <Icon name="file-text" size={hp(2)} color={theme.colors.textSecondary} />
                                <Text style={styles.fileName} numberOfLines={1}>
                                    {selectedFile.name}
                                </Text>
                            </View>
                            <Text style={styles.fileSize}>
                                {formatFileSize(selectedFile.size)}
                            </Text>
                            <TouchableOpacity
                                style={styles.removeFileButton}
                                onPress={() => setSelectedFile(null)}
                                disabled={loading}
                            >
                                <Icon name="close" size={hp(1.5)} color={theme.colors.error} />
                                <Text style={styles.removeFileText}>Xóa</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Upload Progress */}
                {loading && uploadStatus ? (
                    <View style={styles.progressContainer}>
                        <View style={styles.progressHeader}>
                            <Text style={styles.progressStatus}>
                                {uploadStatus === 'uploading' && '📤 Đang tải lên...'}
                                {uploadStatus === 'processing' && '⚙️ Đang xử lý...'}
                                {uploadStatus === 'completed' && '✅ Hoàn tất'}
                            </Text>
                            <Text style={styles.progressPercent}>{uploadProgress}%</Text>
                        </View>
                        <View style={styles.progressBarContainer}>
                            <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
                        </View>
                        {uploadStatus === 'processing' && (
                            <Text style={styles.progressNote}>
                                Chunks đã tải lên thành công. File đang được gộp ở background...
                            </Text>
                        )}
                    </View>
                ) : null}

                {/* Error Message */}
                {error ? (
                    <View style={styles.errorContainer}>
                        <Icon name="bell" size={hp(2)} color={theme.colors.error} />
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                {/* Upload Button */}
                <TouchableOpacity
                    style={[styles.uploadButton, loading && styles.uploadButtonDisabled]}
                    onPress={handleUpload}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator size="small" color="white" />
                    ) : (
                        <>
                            <Icon name="plus" size={hp(2)} color="white" />
                            <Text style={styles.uploadButtonText}>Tải lên tài liệu</Text>
                        </>
                    )}
                </TouchableOpacity>
                    </ScrollView>

                    {/* Upload Success Modal */}
                    <UploadSuccessModal
                        visible={uploadSuccessModal.visible}
                        title={uploadSuccessModal.title}
                        message={uploadSuccessModal.message}
                        onClose={() => {
                            // Đóng modal và navigate ngay lập tức
                            setUploadSuccessModal({ visible: false, title: '', message: '' });
                            // Navigate ngay, không cần đợi modal đóng
                            router.replace('/(main)/documents');
                        }}
                    />
                </View>
            );
        };

        const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 35,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        paddingBottom: hp(10),
    },
    inputContainer: {
        marginBottom: hp(2),
    },
    label: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(1),
    },
    input: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        fontSize: hp(1.6),
        color: theme.colors.text,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadows.small,
    },
    textArea: {
        height: hp(10),
        textAlignVertical: 'top',
    },
    categoryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: wp(2),
    },
    categoryButton: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.background,
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...theme.shadows.small,
    },
    categoryButtonActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    categoryText: {
        fontSize: hp(1.5),
        color: theme.colors.text,
        fontWeight: theme.fonts.medium,
    },
    categoryTextActive: {
        color: 'white',
        fontWeight: theme.fonts.semiBold,
    },
    checkboxContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        width: hp(2.5),
        height: hp(2.5),
        borderRadius: theme.radius.sm,
        borderWidth: 2,
        borderColor: theme.colors.border,
        marginRight: wp(2),
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    checkboxLabel: {
        fontSize: hp(1.5),
        color: theme.colors.text,
        flex: 1,
    },
    filePickerButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        paddingVertical: hp(2),
        paddingHorizontal: wp(4),
        borderWidth: 2,
        borderColor: theme.colors.primary,
        borderStyle: 'dashed',
        ...theme.shadows.small,
    },
    filePickerText: {
        fontSize: hp(1.6),
        color: theme.colors.primary,
        fontWeight: theme.fonts.semiBold,
        marginLeft: wp(2),
    },
    fileInfo: {
        marginTop: hp(1),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.md,
        padding: wp(3),
        ...theme.shadows.small,
    },
    fileInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(0.5),
    },
    fileName: {
        fontSize: hp(1.5),
        color: theme.colors.text,
        marginLeft: wp(2),
        flex: 1,
    },
    fileSize: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
        marginLeft: hp(3),
    },
    removeFileButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: hp(1),
        alignSelf: 'flex-start',
    },
    removeFileText: {
        fontSize: hp(1.4),
        color: theme.colors.error,
        marginLeft: wp(1),
        fontWeight: theme.fonts.medium,
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.error + '20',
        borderRadius: theme.radius.md,
        padding: wp(3),
        marginBottom: hp(2),
    },
    errorText: {
        fontSize: hp(1.5),
        color: theme.colors.error,
        marginLeft: wp(2),
        flex: 1,
    },
    uploadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.md,
        paddingVertical: hp(2),
        paddingHorizontal: wp(4),
        marginTop: hp(2),
        ...theme.shadows.medium,
    },
    uploadButtonDisabled: {
        opacity: 0.6,
    },
    uploadButtonText: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semiBold,
        color: 'white',
        marginLeft: wp(2),
    },
    progressContainer: {
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.md,
        padding: wp(4),
        marginBottom: hp(2),
        ...theme.shadows.small,
    },
    progressHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: hp(1),
    },
    progressStatus: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },
    progressPercent: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.primary,
    },
    progressBarContainer: {
        height: hp(0.8),
        backgroundColor: theme.colors.border,
        borderRadius: theme.radius.full,
        overflow: 'hidden',
        marginBottom: hp(0.5),
    },
    progressBar: {
        height: '100%',
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.full,
    },
    progressNote: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
        marginTop: hp(0.5),
    },
});

export default UploadDocument;

