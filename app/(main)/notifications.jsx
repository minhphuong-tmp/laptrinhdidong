import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import AppHeader from '../../components/AppHeader';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';

const Notifications = () => {
    const router = useRouter();
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState('Tất cả');
    const [notificationCount, setNotificationCount] = useState(0);

    const filters = ['Tất cả', 'Sự kiện', 'Thông báo', 'Nhắc nhở', 'Cập nhật'];

    // Mock data - thay thế bằng API thật sau
    const mockNotifications = [
        {
            id: 1,
            type: 'event',
            title: 'Cuộc họp CLB tuần này',
            content: 'Thông báo cuộc họp CLB vào thứ 7 tuần này lúc 9h sáng tại phòng A101',
            time: '2 giờ trước',
            isRead: false,
            priority: 'high'
        },
        {
            id: 2,
            type: 'announcement',
            title: 'Cập nhật quy định CLB',
            content: 'CLB đã cập nhật một số quy định mới. Vui lòng đọc kỹ và tuân thủ.',
            time: '1 ngày trước',
            isRead: true,
            priority: 'medium'
        },
        {
            id: 3,
            type: 'reminder',
            title: 'Nhắc nhở nộp báo cáo',
            content: 'Các thành viên nhóm dự án A cần nộp báo cáo tiến độ trước ngày 25/12',
            time: '2 ngày trước',
            isRead: false,
            priority: 'high'
        },
        {
            id: 4,
            type: 'update',
            title: 'Cập nhật ứng dụng',
            content: 'Ứng dụng CLB đã được cập nhật phiên bản mới với nhiều tính năng hữu ích',
            time: '3 ngày trước',
            isRead: true,
            priority: 'low'
        },
        {
            id: 5,
            type: 'event',
            title: 'Workshop lập trình',
            content: 'Tham gia workshop "React Native từ cơ bản đến nâng cao" vào chủ nhật tuần sau',
            time: '4 ngày trước',
            isRead: false,
            priority: 'medium'
        }
    ];

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async () => {
        try {
            setLoading(true);
            // TODO: Thay thế bằng API thật
            await new Promise(resolve => setTimeout(resolve, 1000));
            setNotifications(mockNotifications);
        } catch (error) {
            console.error('Error loading notifications:', error);
            Alert.alert('Lỗi', 'Không thể tải thông báo');
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await loadNotifications();
        setRefreshing(false);
    };

    const handleFilterChange = (filter) => {
        setSelectedFilter(filter);
    };

    const getFilteredNotifications = () => {
        if (selectedFilter === 'Tất cả') {
            return notifications;
        }
        return notifications.filter(notification => {
            switch (selectedFilter) {
                case 'Sự kiện':
                    return notification.type === 'event';
                case 'Thông báo':
                    return notification.type === 'announcement';
                case 'Nhắc nhở':
                    return notification.type === 'reminder';
                case 'Cập nhật':
                    return notification.type === 'update';
                default:
                    return true;
            }
        });
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'event':
                return 'calendar';
            case 'announcement':
                return 'megaphone';
            case 'reminder':
                return 'alarm';
            case 'update':
                return 'refresh';
            default:
                return 'bell';
        }
    };

    const getPriorityColor = (priority) => {
        switch (priority) {
            case 'high':
                return '#FF4444';
            case 'medium':
                return '#FFA500';
            case 'low':
                return '#4CAF50';
            default:
                return theme.colors.primary;
        }
    };

    const markAsRead = (notificationId) => {
        setNotifications(prev =>
            prev.map(notification =>
                notification.id === notificationId
                    ? { ...notification, isRead: true }
                    : notification
            )
        );
    };

    const markAllAsRead = () => {
        setNotifications(prev =>
            prev.map(notification => ({ ...notification, isRead: true }))
        );
    };

    const renderNotification = ({ item }) => (
        <TouchableOpacity
            style={[
                styles.notificationCard,
                !item.isRead && styles.unreadCard
            ]}
            onPress={() => markAsRead(item.id)}
        >
            <View style={styles.notificationHeader}>
                <View style={styles.notificationIconContainer}>
                    <Icon
                        name={getNotificationIcon(item.type)}
                        size={hp(2.5)}
                        color={getPriorityColor(item.priority)}
                    />
                </View>
                <View style={styles.notificationContent}>
                    <View style={styles.notificationTitleRow}>
                        <Text style={[
                            styles.notificationTitle,
                            !item.isRead && styles.unreadTitle
                        ]}>
                            {item.title}
                        </Text>
                        {!item.isRead && <View style={styles.unreadDot} />}
                    </View>
                    <Text style={styles.notificationText} numberOfLines={2}>
                        {item.content}
                    </Text>
                    <Text style={styles.notificationTime}>
                        {item.time}
                    </Text>
                </View>
            </View>
        </TouchableOpacity>
    );

    const filteredNotifications = getFilteredNotifications();
    const unreadCount = notifications.filter(n => !n.isRead).length;

    // Update notification count for header
    useEffect(() => {
        setNotificationCount(unreadCount);
    }, [unreadCount]);

    return (
        <View style={styles.container}>
            {/* App Header */}
            <AppHeader
                notificationCount={notificationCount}
                showBackButton={false}
                onMenuPress={() => router.back()}
            />

            {/* Statistics */}
            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{notifications.length}</Text>
                    <Text style={styles.statLabel}>Tổng thông báo</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{notifications.filter(n => n.type === 'announcement').length}</Text>
                    <Text style={styles.statLabel}>Thông báo</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{notifications.filter(n => n.type === 'event').length}</Text>
                    <Text style={styles.statLabel}>Sự kiện</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{unreadCount}</Text>
                    <Text style={styles.statLabel}>Chưa đọc</Text>
                </View>
            </View>

            {/* Filter */}
            <View style={styles.filterContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterScrollContent}
                >
                    {filters.map((filter) => (
                        <TouchableOpacity
                            key={filter}
                            style={[
                                styles.filterButton,
                                selectedFilter === filter && styles.filterButtonActive
                            ]}
                            onPress={() => handleFilterChange(filter)}
                        >
                            <Text style={[
                                styles.filterText,
                                selectedFilter === filter && styles.filterTextActive
                            ]}>
                                {filter}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Notifications List */}
            <View style={styles.listContainer}>
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>Đang tải thông báo...</Text>
                    </View>
                ) : filteredNotifications.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Icon name="bell-off" size={hp(8)} color={theme.colors.textSecondary} />
                        <Text style={styles.emptyTitle}>Không có thông báo</Text>
                        <Text style={styles.emptyText}>
                            {selectedFilter === 'Tất cả'
                                ? 'Chưa có thông báo nào'
                                : `Không có thông báo loại "${selectedFilter}"`
                            }
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredNotifications}
                        renderItem={renderNotification}
                        keyExtractor={(item) => item.id.toString()}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl
                                refreshing={refreshing}
                                onRefresh={onRefresh}
                                colors={[theme.colors.primary]}
                                tintColor={theme.colors.primary}
                            />
                        }
                        contentContainerStyle={styles.notificationsList}
                    />
                )}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 35,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        backgroundColor: theme.colors.primary,
    },
    backButton: {
        padding: wp(2),
        marginRight: wp(2),
    },
    headerContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: 'white',
    },
    badgeContainer: {
        backgroundColor: '#FF4444',
        borderRadius: theme.radius.full,
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.3),
        marginLeft: wp(2),
    },
    badgeText: {
        color: 'white',
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
    },
    markAllButton: {
        padding: wp(2),
    },
    markAllText: {
        color: 'white',
        fontSize: hp(1.4),
        fontWeight: theme.fonts.medium,
    },
    disabledText: {
        opacity: 0.5,
    },
    statsContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statNumber: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
        marginBottom: hp(0.5),
    },
    statLabel: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
        textAlign: 'center',
    },
    filterContainer: {
        backgroundColor: 'white',
        paddingVertical: hp(1),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    filterScrollContent: {
        paddingHorizontal: wp(4),
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
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: hp(1.6),
        color: theme.colors.textSecondary,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(8),
    },
    emptyTitle: {
        fontSize: hp(2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginTop: hp(2),
    },
    emptyText: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginTop: hp(1),
    },
    notificationsList: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },
    notificationCard: {
        backgroundColor: 'white',
        borderRadius: theme.radius.medium,
        padding: wp(4),
        marginBottom: hp(1),
        ...theme.shadows.small,
    },
    unreadCard: {
        borderLeftWidth: 4,
        borderLeftColor: theme.colors.primary,
    },
    notificationHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    notificationIconContainer: {
        width: hp(4),
        height: hp(4),
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: wp(3),
    },
    notificationContent: {
        flex: 1,
    },
    notificationTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(0.5),
    },
    notificationTitle: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        flex: 1,
    },
    unreadTitle: {
        fontWeight: theme.fonts.bold,
    },
    unreadDot: {
        width: hp(1),
        height: hp(1),
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.primary,
        marginLeft: wp(2),
    },
    notificationText: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        lineHeight: hp(2),
        marginBottom: hp(0.5),
    },
    notificationTime: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
    },
});

export default Notifications;