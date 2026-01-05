import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import { supabaseUrl } from '../../constants';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { documentService } from '../../services/documentService';
import { loadDocumentsCache } from '../../utils/cacheHelper';

const Documents = () => {
    const { user } = useAuth();
    const router = useRouter();
    // State cho dữ liệu từ database
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchText, setSearchText] = useState('');
    const [filteredDocuments, setFilteredDocuments] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('Tất cả');

    // Categories cho filter
    const categories = ['Tất cả', 'Lý thuyết', 'Thực hành', 'Video', 'Thi cử'];

    // Load dữ liệu từ database
    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async (useCache = true) => {
        setLoading(true);
        try {
            // Load từ cache trước (nếu có)
            let fromCache = false;
            if (useCache && user?.id) {
                const cacheStartTime = Date.now();
                const cached = await loadDocumentsCache(user.id);
                if (cached && cached.data && cached.data.length > 0) {
                    fromCache = true;
                    const dataSize = JSON.stringify(cached.data).length;
                    const dataSizeKB = (dataSize / 1024).toFixed(2);
                    const loadTime = Date.now() - cacheStartTime;
                    console.log('Load dữ liệu từ cache: documents');
                    console.log(`- Dữ liệu đã load: ${cached.data.length} documents (${dataSizeKB} KB)`);
                    console.log(`- Tổng thời gian load: ${loadTime} ms`);
                    // Có cache, hiển thị ngay
                    setDocuments(cached.data);
                    setFilteredDocuments(cached.data);
                    setLoading(false);
                    // Fetch fresh data ở background
                }
            }

            if (!fromCache) {
                console.log('💾 Load dữ liệu từ CSDL: documents');
            }
            const result = await documentService.getAllDocuments(user?.id, false);
            if (result.success) {
                setDocuments(result.data);
                setFilteredDocuments(result.data);
            } else {
                console.error('Error loading documents:', result.msg);
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (text) => {
        setSearchText(text);
        applyFilters(text, selectedCategory);
    };

    const handleCategoryFilter = (category) => {
        setSelectedCategory(category);
        applyFilters(searchText, category);
    };

    const handlePreview = async (document) => {
        try {
            console.log('=== PREVIEW DEBUG ===');
            console.log('Document:', document);
            console.log('Document filePath:', document.filePath);

            // Tạo URL preview từ Supabase Storage
            // Bucket là 'upload', path là documents/uploader_id/file_name
            const fileUrl = `${supabaseUrl}/storage/v1/object/public/upload/${document.filePath}`;
            console.log('Preview URL:', fileUrl);

            // Mở URL trong browser để preview
            const canOpen = await Linking.canOpenURL(fileUrl);
            console.log('Can open URL:', canOpen);

            if (canOpen) {
                await Linking.openURL(fileUrl);
                Alert.alert(
                    'Đang mở tài liệu',
                    'Tài liệu đang được mở trong trình duyệt.',
                    [{ text: 'OK', style: 'default' }]
                );
            } else {
                Alert.alert('Lỗi', 'Không thể mở tài liệu');
            }

        } catch (error) {
            console.error('Preview error:', error);
            Alert.alert('Lỗi', `Không thể mở tài liệu: ${error.message}`);
        }
    };

    const handleDownload = async (document) => {
        try {
            console.log('=== DOWNLOAD DEBUG ===');
            console.log('Document:', document);
            console.log('Document filePath:', document.filePath);
            
            // Lấy thông tin document đầy đủ từ database để có uploader_id chính xác
            const fullDocumentInfo = await documentService.getDocumentById(document.id);
            let actualUploaderId = null;
            if (fullDocumentInfo.success && fullDocumentInfo.data) {
                actualUploaderId = fullDocumentInfo.data.uploaderId;
                console.log('Full document info from DB:', fullDocumentInfo.data);
                console.log('Actual uploader_id:', actualUploaderId);
            }

            // Tạo URL download từ Supabase Storage
            // Bucket là 'upload', path có thể là:
            // - documents/uploader_id/file_name (format mới)
            // - documents/file_name (format cũ, thiếu uploader_id)
            let filePath = document.filePath;
            
            // Nếu filePath không bắt đầu bằng 'documents/', thêm vào
            if (!filePath.startsWith('documents/')) {
                filePath = `documents/${filePath}`;
            }
            
            // Kiểm tra xem filePath có chứa uploader_id không (có 2 dấu / sau documents/)
            const pathParts = filePath.split('/');
            let fileUrl = `${supabaseUrl}/storage/v1/object/public/upload/${filePath}`;
            
            console.log('=== DOWNLOAD URL DEBUG ===');
            console.log('Supabase URL:', supabaseUrl);
            console.log('Original filePath:', document.filePath);
            console.log('Processed filePath:', filePath);
            console.log('Path parts:', pathParts);
            console.log('Full download URL:', fileUrl);
            
            // Test URL bằng cách fetch HEAD
            let urlFound = false;
            try {
                let testResponse = await fetch(fileUrl, { method: 'HEAD' });
                console.log('URL test response:', {
                    status: testResponse.status,
                    statusText: testResponse.statusText,
                    contentType: testResponse.headers.get('content-type'),
                    contentLength: testResponse.headers.get('content-length')
                });
                
                if (testResponse.ok) {
                    urlFound = true;
                } else if (testResponse.status === 400 && pathParts.length === 2) {
                    // Thử các format khác nhau
                    const fileName = pathParts[1];
                    const alternatives = [];
                    
                    // 1. Thử với uploader_id từ database
                    if (actualUploaderId) {
                        alternatives.push(`documents/${actualUploaderId}/${fileName}`);
                    }
                    
                    // 2. Thử với user.id hiện tại
                    if (user?.id && user.id !== actualUploaderId) {
                        alternatives.push(`documents/${user.id}/${fileName}`);
                    }
                    
                    // 3. Thử file trực tiếp trong bucket (không có folder documents/)
                    alternatives.push(fileName);
                    
                    // 4. Thử file trực tiếp trong documents/ (đã có)
                    // alternatives.push(filePath); // Đã thử rồi
                    
                    console.log('Thử các URL thay thế:', alternatives);
                    
                    for (const altPath of alternatives) {
                        const alternativeUrl = `${supabaseUrl}/storage/v1/object/public/upload/${altPath}`;
                        console.log('Thử URL:', alternativeUrl);
                        
                        try {
                            const altResponse = await fetch(alternativeUrl, { method: 'HEAD' });
                            if (altResponse.ok) {
                                console.log('✅ URL thay thế thành công:', alternativeUrl);
                                filePath = altPath;
                                fileUrl = alternativeUrl;
                                urlFound = true;
                                break;
                            } else {
                                console.log('❌ URL thay thế lỗi:', altResponse.status);
                            }
                        } catch (altError) {
                            console.log('❌ URL thay thế exception:', altError.message);
                        }
                    }
                }
                
                if (!urlFound) {
                    Alert.alert('Lỗi', `Không thể truy cập file. File có thể không tồn tại hoặc URL không đúng. Vui lòng kiểm tra lại.`);
                    return;
                }
            } catch (urlError) {
                console.error('URL test error:', urlError);
                Alert.alert('Lỗi', `Không thể kiểm tra URL: ${urlError.message}`);
                return;
            }

            // Lấy tên file từ filePath hoặc title (dùng filePath đã được xử lý)
            const fileName = filePath.split('/').pop() || `${document.title}.${document.type}`;

            // Download file về local storage (dùng fileUrl đã được xử lý/cập nhật)
            const downloadResult = await documentService.downloadDocumentFile(fileUrl, fileName);

            if (!downloadResult.success) {
                Alert.alert('Lỗi', downloadResult.msg || 'Không thể tải tài liệu');
                return;
            }

            // Tăng lượt download sau khi download thành công
            await documentService.incrementDownload(document.id);

            // Kiểm tra xem có phải video không để lưu vào Media Library
            const isVideo = document.type === 'mp4' || document.type === 'video' || 
                          fileName.toLowerCase().endsWith('.mp4') || 
                          fileName.toLowerCase().endsWith('.mov') ||
                          fileName.toLowerCase().endsWith('.avi') ||
                          fileName.toLowerCase().endsWith('.mkv');
            let mediaLibraryResult = null;

            if (isVideo) {
                // Tự động lưu video vào Media Library
                console.log('Saving video to Media Library:', downloadResult.localUri);
                mediaLibraryResult = await documentService.saveToMediaLibrary(
                    downloadResult.localUri,
                    downloadResult.originalFileName,
                    'video'
                );

                if (mediaLibraryResult.success) {
                    const durationInfo = mediaLibraryResult.duration > 0 
                        ? ` (${Math.floor(mediaLibraryResult.duration)}s)` 
                        : '';
                    Alert.alert(
                        'Tải thành công',
                        `Video "${document.title}"${durationInfo} đã được tải và lưu vào thư viện. Bạn có thể mở xem bằng ứng dụng video.`,
                        [{ text: 'OK' }]
                    );
                    return;
                } else {
                    // Nếu lưu vào Media Library thất bại, vẫn hiển thị option mở file
                    console.log('Failed to save to Media Library:', mediaLibraryResult.msg);
                    Alert.alert(
                        'Tải thành công',
                        `Video "${document.title}" đã được tải về máy. ${mediaLibraryResult.msg || 'Không thể lưu vào thư viện, nhưng bạn vẫn có thể mở file.'}`,
                        [{ text: 'OK' }]
                    );
                    return;
                }
            }

            // Hiển thị alert với option mở/share file (cho file không phải video hoặc lưu Media Library thất bại)
            Alert.alert(
                'Tải thành công',
                `Tài liệu "${document.title}" đã được tải về máy.`,
                [
                    {
                        text: 'Mở file',
                        onPress: async () => {
                            try {
                                // Dùng Share từ react-native để mở/share file
                                await Share.share({
                                    url: downloadResult.localUri,
                                    message: `Tài liệu: ${document.title}`
                                });
                            } catch (error) {
                                console.error('Error sharing file:', error);
                                // Fallback: thử mở bằng Linking nếu Share không hoạt động
                                try {
                                    await Linking.openURL(downloadResult.localUri);
                                } catch (linkError) {
                                    Alert.alert('Lỗi', 'Không thể mở file. File đã được lưu tại: ' + downloadResult.localUri);
                                }
                            }
                        }
                    },
                    {
                        text: 'OK',
                        style: 'cancel'
                    }
                ]
            );

        } catch (error) {
            console.error('Download error:', error);
            Alert.alert('Lỗi', `Không thể tải tài liệu: ${error.message}`);
        }
    };

    const applyFilters = (search, category) => {
        let filtered = documents;

        // Filter by search text
        if (search.trim() !== '') {
            filtered = filtered.filter(doc =>
                doc.title.toLowerCase().includes(search.toLowerCase()) ||
                doc.category.toLowerCase().includes(search.toLowerCase()) ||
                doc.type.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Filter by category
        if (category !== 'Tất cả') {
            filtered = filtered.filter(doc => doc.category === category);
        }

        setFilteredDocuments(filtered);
    };

    const handleUploadDocument = () => {
        router.push('/(main)/UploadDocument');
    };

    const getFileIcon = (type) => {
        switch (type) {
            case 'pdf': return 'image';
            case 'pptx': return 'image';
            case 'zip': return 'image';
            case 'docx': return 'image';
            default: return 'image';
        }
    };

    const getFileColor = (type) => {
        switch (type) {
            case 'pdf': return '#F44336';
            case 'pptx': return '#FF9800';
            case 'zip': return '#9C27B0';
            case 'docx': return '#2196F3';
            default: return theme.colors.textSecondary;
        }
    };

    const getCategoryColor = (category) => {
        switch (category) {
            case 'Lý thuyết': return '#4CAF50';
            case 'Thực hành': return '#FF9800';
            case 'Video': return '#2196F3';
            case 'Thi cử': return '#F44336';
            default: return theme.colors.textSecondary;
        }
    };

    const renderDocument = ({ item, index }) => (
        <View style={styles.documentCard}>
            <View style={styles.documentHeader}>
                <View style={styles.fileIcon}>
                    <Icon name={getFileIcon(item.type)} size={hp(2.5)} color={getFileColor(item.type)} />
                </View>
                <View style={styles.documentInfo}>
                    <Text style={styles.documentTitle}>{item.title}</Text>
                    <View style={styles.documentMeta}>
                        <Text style={styles.documentSize}>{item.size}</Text>
                        <Text style={styles.documentDate}>{item.uploadDate}</Text>
                    </View>
                </View>
                <View style={styles.documentActions}>
                    <TouchableOpacity
                        style={styles.downloadButton}
                        onPress={() => handleDownload(item)}
                    >
                        <Icon name="download" size={hp(1.8)} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.downloadButton}
                        onPress={() => handlePreview(item)}
                    >
                        <Icon name="eye" size={hp(1.8)} color={theme.colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>
            <View style={styles.documentFooter}>
                <View style={styles.documentInfo}>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Người đăng:</Text>
                        <Text style={styles.infoValue}>{item.uploader}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Ngày đăng:</Text>
                        <Text style={styles.infoValue}>{item.uploadDate}</Text>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.infoLabel}>Lượt tải:</Text>
                        <Text style={styles.infoValue}>{item.downloads} lượt</Text>
                    </View>
                </View>
                <View style={styles.categoryBadge}>
                    <View style={[styles.categoryBadgeInner, { backgroundColor: getCategoryColor(item.category) }]}>
                        <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                </View>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.container}>
                <Header title="Tài liệu CLB" showBackButton />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={styles.loadingText}>Đang tải dữ liệu...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Header title="Tài liệu CLB" showBackButton />

            <ScrollView
                style={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchInputContainer}>
                        <Icon name="search" size={hp(2)} color={theme.colors.textSecondary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Tìm kiếm tài liệu..."
                            placeholderTextColor={theme.colors.textSecondary}
                            value={searchText}
                            onChangeText={handleSearch}
                        />
                        {searchText.length > 0 && (
                            <TouchableOpacity onPress={() => handleSearch('')}>
                                <Icon name="close" size={hp(2)} color={theme.colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Upload Button */}
                <View style={styles.uploadContainer}>
                    <TouchableOpacity style={styles.uploadButton} onPress={handleUploadDocument}>
                        <Icon name="plus" size={hp(2.5)} color="white" />
                        <Text style={styles.uploadButtonText}>Tải lên tài liệu</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{filteredDocuments.length}</Text>
                        <Text style={styles.statLabel}>Kết quả tìm kiếm</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{filteredDocuments.reduce((sum, d) => sum + d.downloads, 0)}</Text>
                        <Text style={styles.statLabel}>Lượt tải</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{filteredDocuments.filter(d => d.type === 'pdf').length}</Text>
                        <Text style={styles.statLabel}>PDF</Text>
                    </View>
                </View>

                <View style={styles.filterContainer}>
                    {categories.map((category) => (
                        <TouchableOpacity
                            key={category}
                            style={[
                                styles.filterButton,
                                selectedCategory === category && styles.filterButtonActive
                            ]}
                            onPress={() => handleCategoryFilter(category)}
                        >
                            <Text style={[
                                styles.filterText,
                                selectedCategory === category && styles.filterTextActive
                            ]}>
                                {category}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Documents List */}
                <View style={styles.documentsListContainer}>
                    {filteredDocuments.map((document, index) => (
                        <View key={document.id}>
                            {renderDocument({ item: document, index })}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 35, // Giống trang home và notifications
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(5),
    },

    loadingText: {
        fontSize: hp(2),
        color: theme.colors.textSecondary,
        marginTop: hp(2),
        fontFamily: theme.fonts.regular,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: hp(10),
    },
    searchContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        paddingHorizontal: wp(3),
        paddingVertical: hp(1.5),
        ...theme.shadows.small,
    },
    searchInput: {
        flex: 1,
        fontSize: hp(1.5),
        color: theme.colors.text,
        marginLeft: wp(2),
    },
    uploadContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },
    uploadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.primary,
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(4),
        borderRadius: theme.radius.md,
        ...theme.shadows.small,
    },
    uploadButtonText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: 'white',
        marginLeft: wp(2),
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: theme.colors.background,
        paddingVertical: hp(2),
        marginHorizontal: wp(4),
        marginVertical: hp(1),
        borderRadius: theme.radius.md,
        ...theme.shadows.small,
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
    },
    statLabel: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        marginTop: hp(0.5),
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: wp(4),
        marginBottom: hp(1),
    },
    filterButton: {
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.full,
        marginRight: wp(2),
        ...theme.shadows.small,
    },
    filterButtonActive: {
        backgroundColor: theme.colors.primary,
    },
    filterText: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        fontWeight: theme.fonts.medium,
    },
    filterTextActive: {
        color: 'white',
        fontWeight: theme.fonts.bold,
    },
    listContainer: {
        paddingHorizontal: wp(4),
        paddingBottom: hp(10),
    },
    documentsListContainer: {
        paddingHorizontal: wp(4),
    },
    documentCard: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        padding: wp(4),
        marginBottom: hp(1.5),
        ...theme.shadows.small,
    },
    documentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(1.5),
    },
    fileIcon: {
        width: hp(5),
        height: hp(5),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: wp(3),
    },
    documentInfo: {
        flex: 1,
    },
    documentTitle: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(0.5),
    },
    documentMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    documentSize: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
        marginRight: wp(2),
    },
    documentDate: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
    },
    documentActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(2),
    },
    downloadButton: {
        padding: wp(2),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
    },
    documentFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: hp(1.5),
        paddingTop: hp(1.5),
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    documentInfo: {
        flex: 1,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(0.5),
    },
    infoLabel: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
        width: wp(20),
    },
    infoValue: {
        fontSize: hp(1.2),
        color: theme.colors.text,
        fontWeight: theme.fonts.semiBold,
        flex: 1,
    },
    categoryBadge: {
        alignItems: 'flex-end',
    },
    categoryBadgeInner: {
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.5),
        borderRadius: theme.radius.sm,
    },
    categoryText: {
        fontSize: hp(1.2),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
});

export default Documents;
