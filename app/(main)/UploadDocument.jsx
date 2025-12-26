import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { documentService } from '../../services/documentService';

const UploadDocument = () => {
    const { user } = useAuth();
    const router = useRouter();

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

        try {
            // 1. Upload file lên Supabase Storage
            const fileExtension = getFileExtension(selectedFile.name);
            const fileName = `${Date.now()}_${selectedFile.name}`;

            console.log('Uploading file:', fileName);
            const uploadResult = await documentService.uploadDocumentFile(
                selectedFile.uri,
                user.id,
                fileName
            );

            if (!uploadResult.success) {
                setError(uploadResult.msg || 'Không thể tải lên file');
                setLoading(false);
                return;
            }

            // 2. Parse tags từ string thành array
            const tagsArray = tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag.length > 0);

            // 3. Tạo bản ghi trong bảng documents
            const documentData = {
                title: title.trim(),
                description: description.trim(),
                category: category,
                file_type: fileExtension,
                file_size: selectedFile.size || 0,
                file_path: uploadResult.data, // Đường dẫn từ upload
                tags: tagsArray,
                is_public: isPublic
            };

            console.log('Creating document record:', documentData);
            const createResult = await documentService.addDocument(documentData);

            if (!createResult.success) {
                setError(createResult.msg || 'Không thể tạo bản ghi tài liệu');
                setLoading(false);
                return;
            }

            // 4. Thành công - hiển thị thông báo và quay lại
            Alert.alert(
                'Thành công',
                'Đã tải lên tài liệu thành công!',
                [
                    {
                        text: 'OK',
                        onPress: () => {
                            router.back();
                        }
                    }
                ]
            );
        } catch (error) {
            console.error('Error uploading document:', error);
            setError('Có lỗi xảy ra: ' + error.message);
        } finally {
            setLoading(false);
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
                        <Icon name="file" size={hp(2.5)} color={theme.colors.primary} />
                        <Text style={styles.filePickerText}>
                            {selectedFile ? 'Đã chọn file' : 'Chọn file tài liệu'}
                        </Text>
                    </TouchableOpacity>

                    {selectedFile && (
                        <View style={styles.fileInfo}>
                            <View style={styles.fileInfoRow}>
                                <Icon name="file" size={hp(2)} color={theme.colors.textSecondary} />
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

                {/* Error Message */}
                {error ? (
                    <View style={styles.errorContainer}>
                        <Icon name="alert-circle" size={hp(2)} color={theme.colors.error} />
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
                            <Icon name="upload" size={hp(2)} color="white" />
                            <Text style={styles.uploadButtonText}>Tải lên tài liệu</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
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
});

export default UploadDocument;

