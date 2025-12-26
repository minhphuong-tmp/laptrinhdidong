import { useLocalSearchParams, useRouter } from 'expo-router';
import moment from 'moment';
import React, { useEffect, useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { notificationService } from '../../services/notificationService';

const Notifications = () => {
    const router = useRouter();
    const { highlightNotificationId } = useLocalSearchParams();
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState('Tất cả');
    const [notificationCount, setNotificationCount] = useState(0);
    const [highlightedId, setHighlightedId] = useState(null);
    const flatListRef = useRef(null);

    const filters = ['Tất cả', 'Sự kiện', 'Thông báo', 'Nhắc nhở', 'Cập nhật'];

    // Helper function để format thời gian
    const formatTimeAgo = (dateString) => {
        if (!dateString) return 'Vừa xong';
        const now = moment();
        const notificationDate = moment(dateString);
        const diffInSeconds = now.diff(notificationDate, 'seconds');

        if (diffInSeconds < 60) {
            return 'Vừa xong';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} phút trước`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} giờ trước`;
        } else if (diffInSeconds < 2592000) {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} ngày trước`;
        } else {
            const months = Math.floor(diffInSeconds / 2592000);
            return `${months} tháng trước`;
        }
    };

    // Map type từ database sang UI type
    const mapTypeToUIType = (dbType) => {
        switch (dbType) {
            case 'event_reminder':
            case 'meeting':
            case 'workshop':
            case 'activity':
                return 'event';
            case 'club_announcement':
                return 'announcement';
            case 'system':
                return 'update';
            default:
                return 'announcement';
        }
    };

    // Map type sang priority
    const getPriorityFromType = (type) => {
        switch (type) {
            case 'event_reminder':
            case 'meeting':
                return 'high';
            case 'club_announcement':
                return 'medium';
            case 'system':
            case 'update':
                return 'low';
            default:
                return 'medium';
        }
    };

    useEffect(() => {
        if (user?.id) {
            loadNotifications();
        }
    }, [user?.id]);

    // Set highlighted notification khi có param
    useEffect(() => {
        if (highlightNotificationId) {
            setHighlightedId(highlightNotificationId);
            // Set filter về 'Tất cả' để đảm bảo notification hiển thị
            setSelectedFilter('Tất cả');
            // Tự động remove highlight sau 3 giây
            const timer = setTimeout(() => {
                setHighlightedId(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [highlightNotificationId]);

    // Scroll đến highlighted notification khi load xong
    useEffect(() => {
        if (highlightedId && notifications.length > 0 && flatListRef.current && !loading) {
            // Đợi một chút để FlatList render xong
            setTimeout(() => {
                const filteredNotifications = getFilteredNotifications();
                const index = filteredNotifications.findIndex(n => String(n.id) === String(highlightedId));

                if (index !== -1) {
                    try {
                        flatListRef.current?.scrollToIndex({
                            index: index,
                            animated: true,
                            viewPosition: 0.5
                        });
                    } catch (error) {
                        console.log('Error scrolling to highlighted notification:', error);
                        // Fallback: scroll to offset
                        setTimeout(() => {
                            flatListRef.current?.scrollToOffset({
                                offset: index * 100, // Estimate item height
                                animated: true,
                            });
                        }, 100);
                    }
                }
            }, 800);
        }
    }, [highlightedId, notifications.length, loading, selectedFilter]);

    const loadNotifications = async (useCache = true) => {
        try {
            setLoading(true);
            if (!user?.id) {
                console.log('No user ID available');
                return;
            }

            // Load từ cache trước (nếu có)
            let fromCache = false;
            if (useCache) {
                const { loadClubNotificationsCache } = require('../../utils/cacheHelper');
                const cacheStartTime = Date.now();
                const cached = await loadClubNotificationsCache(user.id);
                if (cached && cached.data && cached.data.length > 0) {
                    fromCache = true;
                    const dataSize = JSON.stringify(cached.data).length;
                    const dataSizeKB = (dataSize / 1024).toFixed(2);
                    const loadTime = Date.now() - cacheStartTime;
                    console.log('Load dữ liệu từ cache: notifications (CLB)');
                    console.log(`- Dữ liệu đã load: ${cached.data.length} notifications (${dataSizeKB} KB)`);
                    console.log(`- Tổng thời gian load: ${loadTime} ms`);
                    // Transform và hiển thị ngay
                    const transformedData = cached.data.map(notification => {
                        const dbType = notification.type;
                        const uiType = mapTypeToUIType(dbType);
                        const priority = getPriorityFromType(dbType);
                        return {
                            id: notification.id,
                            type: uiType,
                            title: notification.title || 'Thông báo CLB',
                            content: notification.content || notification.message || 'Không có nội dung',
                            time: formatTimeAgo(notification.created_at || notification.createdAt),
                            isRead: notification.isRead || notification.is_read || false,
                            priority: priority,
                            originalType: dbType,
                            sender: notification.sender || null
                        };
                    });
                    setNotifications(transformedData);
                    setLoading(false);
                }
            }

            if (!fromCache) {
                console.log('Load dữ liệu từ CSDL: notifications (CLB)');
            }
            // Lấy thông báo CLB từ database
            const data = await notificationService.getClubNotifications(user.id, false);

            // Transform data để phù hợp với UI
            const transformedData = data.map(notification => {
                // Xử lý cả camelCase và snake_case
                const dbType = notification.type;
                const uiType = mapTypeToUIType(dbType);
                const priority = getPriorityFromType(dbType);

                return {
                    id: notification.id,
                    type: uiType,
                    title: notification.title || 'Thông báo CLB',
                    content: notification.content || notification.message || 'Không có nội dung',
                    time: formatTimeAgo(notification.created_at || notification.createdAt),
                    isRead: notification.isRead || notification.is_read || false,
                    priority: priority,
                    originalType: dbType,
                    sender: notification.sender || null
                };
            });

            setNotifications(transformedData);
        } catch (error) {
            console.error('Error loading notifications:', error);
            Alert.alert('Lỗi', 'Không thể tải thông báo CLB');
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

    const markAsRead = async (notificationId) => {
        if (!user?.id) return;

        try {
            // Mark as read trong database
            const result = await notificationService.markClubNotificationAsRead(notificationId, user.id);

            if (!result.success) {
                console.log('Failed to mark club notification as read:', result.message);
            }

            // Update local state
            setNotifications(prev =>
                prev.map(notification =>
                    notification.id === notificationId
                        ? { ...notification, isRead: true }
                        : notification
                )
            );
        } catch (error) {
            console.error('Error marking notification as read:', error);
            // Vẫn update UI local state
            setNotifications(prev =>
                prev.map(notification =>
                    notification.id === notificationId
                        ? { ...notification, isRead: true }
                        : notification
                )
            );
        }
    };

    const markAllAsRead = async () => {
        if (!user?.id) return;

        try {
            // Mark tất cả unread notifications
            const unreadNotifications = notifications.filter(n => !n.isRead);

            await Promise.all(
                unreadNotifications.map(n =>
                    notificationService.markClubNotificationAsRead(n.id, user.id)
                )
            );

            // Update local state
            setNotifications(prev =>
                prev.map(notification => ({ ...notification, isRead: true }))
            );
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            // Vẫn update UI local state
            setNotifications(prev =>
                prev.map(notification => ({ ...notification, isRead: true }))
            );
        }
    };

    const renderNotification = ({ item }) => {
        const isHighlighted = highlightedId && String(item.id) === String(highlightedId);

        return (
            <TouchableOpacity
                style={[
                    styles.notificationCard,
                    !item.isRead && styles.unreadCard,
                    isHighlighted && styles.highlightedCard
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
    };

    const filteredNotifications = getFilteredNotifications();
    // Đếm số thông báo CLB chưa đọc (cho phần statistics)
    const unreadCount = notifications.filter(n => !n.isRead).length;

    // Load personal notifications count for header (giống như trang home)
    const loadPersonalNotificationCount = async () => {
        if (!user?.id) return;

        try {
            const data = await notificationService.getPersonalNotifications(user.id);
            // Đếm số thông báo chưa đọc (filter isRead = false)
            const unreadCount = data.filter(notification => !(notification.isRead || notification.is_read)).length;
            setNotificationCount(unreadCount);
        } catch (error) {
            console.log('Error loading personal notification count:', error);
            setNotificationCount(0);
        }
    };

    useEffect(() => {
        if (!user?.id) return;

        // Load initial count
        loadPersonalNotificationCount();

        // Setup realtime subscription để cập nhật count khi có thay đổi
        const notificationChannel = supabase
            .channel(`notifications-count-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `receiverId=eq.${user.id}`
            }, (payload) => {
                console.log('🔔 [Notifications] New notification received (realtime):', payload);
                // Reload count khi có notification mới
                loadPersonalNotificationCount();
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `receiverId=eq.${user.id}`
            }, (payload) => {
                console.log('🔔 [Notifications] Notification updated (realtime):', payload);
                // Reload count khi có notification được update (mark as read)
                loadPersonalNotificationCount();
            })
            .subscribe((status) => {
                console.log('🔔 [Notifications] Notification channel status:', status);
            });

        return () => {
            console.log('🔔 [Notifications] Cleaning up notification subscription');
            notificationChannel.unsubscribe();
        };
    }, [user?.id]);

    return (
        <View style={styles.container}>
            {/* App Header */}
            <AppHeader
                notificationCount={notificationCount}
                onNotificationPress={() => router.push('personalNotifications')}
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
                        ref={flatListRef}
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
                        onScrollToIndexFailed={(info) => {
                            console.log('Scroll to index failed:', info);
                            // Fallback: scroll to offset
                            setTimeout(() => {
                                flatListRef.current?.scrollToOffset({
                                    offset: info.averageItemLength * info.index,
                                    animated: true,
                                });
                            }, 100);
                        }}
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
    highlightedCard: {
        backgroundColor: '#FFF9E6',
        borderWidth: 2,
        borderColor: theme.colors.primary,
        ...theme.shadows.medium,
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