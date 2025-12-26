import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    ScrollView,
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

    const handleDownload = async (document) => {
        try {
            console.log('=== DOWNLOAD DEBUG ===');
            console.log('Document:', document);
            console.log('Document filePath:', document.filePath);

            // Tạo URL download từ Supabase Storage
            const fileUrl = `${supabaseUrl}/storage/v1/object/public/documents/documents/${document.filePath.replace('documents/', '')}`;
            console.log('Download URL:', fileUrl);

            // Mở URL trong browser để user tự download
            const canOpen = await Linking.canOpenURL(fileUrl);
            console.log('Can open URL:', canOpen);

            if (canOpen) {
                await Linking.openURL(fileUrl);
                Alert.alert(
                    'Đang mở tài liệu',
                    'Tài liệu đang được mở trong trình duyệt. Bạn có thể tải về từ đó.',
                    [{ text: 'OK', style: 'default' }]
                );
            } else {
                Alert.alert('Lỗi', 'Không thể mở tài liệu');
            }

        } catch (error) {
            console.error('Download error:', error);
            Alert.alert('Lỗi', `Không thể mở tài liệu: ${error.message}`);
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
