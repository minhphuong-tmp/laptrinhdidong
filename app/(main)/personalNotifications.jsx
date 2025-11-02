import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import UserAvatar from '../../components/UserAvatar';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { notificationService } from '../../services/notificationService';

const PersonalNotifications = () => {
    const router = useRouter();
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [notificationCount, setNotificationCount] = useState(0);

    // Helper function để format thời gian
    const formatTimeAgo = (dateString) => {
        const now = new Date();
        const notificationDate = new Date(dateString);
        const diffInSeconds = Math.floor((now - notificationDate) / 1000);

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

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async () => {
        try {
            setLoading(true);
            if (!user?.id) {
                console.log('No user ID available');
                return;
            }

            const data = await notificationService.getPersonalNotifications(user.id);

            // Transform data để phù hợp với UI
            const transformedData = data.map(notification => {
                // Parse message JSON để lấy thông tin chi tiết (postId, commentId)
                let parsedData = {};
                try {
                    // Thử parse từ message field
                    if (notification.message) {
                        parsedData = JSON.parse(notification.message);
                    }
                } catch (e) {
                    console.log('Error parsing notification message:', e);
                    console.log('Notification:', notification);
                }

                // Xác định type dựa trên title
                let type = 'notification';
                if (notification.title.includes('thích')) type = 'like';
                else if (notification.title.includes('bình luận')) type = 'comment';
                else if (notification.title.includes('gắn thẻ')) type = 'tag';
                else if (notification.title.includes('theo dõi')) type = 'follow';

                // Tạo title với tên thật
                let title = notification.title;
                if (notification.sender?.name) {
                    // Thay thế "Đã bình luận" thành "Tên đã bình luận"
                    if (title.includes('Đã bình luận')) {
                        title = title.replace('Đã bình luận', `${notification.sender.name} đã bình luận`);
                    }
                    // Thay thế "Đã thích" thành "Tên đã thích"
                    else if (title.includes('Đã thích')) {
                        title = title.replace('Đã thích', `${notification.sender.name} đã thích`);
                    }
                    // Thay thế "Đã gắn thẻ" thành "Tên đã gắn thẻ"
                    else if (title.includes('Đã gắn thẻ')) {
                        title = title.replace('Đã gắn thẻ', `${notification.sender.name} đã gắn thẻ`);
                    }
                    // Thay thế "Đã theo dõi" thành "Tên đã theo dõi"
                    else if (title.includes('Đã theo dõi')) {
                        title = title.replace('Đã theo dõi', `${notification.sender.name} đã theo dõi`);
                    }
                    // Fallback: thay thế tên cố định
                    else {
                        title = title.replace('Phương', notification.sender.name);
                        title = title.replace('Minh', notification.sender.name);
                        title = title.replace('Nguyễn Văn A', notification.sender.name);
                    }
                }

                return {
                    id: notification.id,
                    type: type,
                    title: title,
                    description: parsedData.postId ? `Bài viết #${parsedData.postId}` : (notification.content || 'Không có nội dung'),
                    time: formatTimeAgo(notification.created_at),
                    isRead: notification.is_read || false,
                    postId: parsedData.postId || null,
                    commentId: parsedData.commentId || null,
                    user: {
                        id: notification.sender?.id || notification.sender_id || 'system',
                        name: notification.sender?.name || (notification.sender_id ? 'Người dùng' : 'Hệ thống'),
                        image: notification.sender?.image || null
                    }
                };
            });

            setNotifications(transformedData);

            // Cập nhật notificationCount dựa trên số thông báo chưa đọc
            const unreadCount = transformedData.filter(n => !n.isRead).length;
            setNotificationCount(unreadCount);
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

    const getFilteredNotifications = () => {
        if (selectedFilter === 'all') {
            return notifications;
        }
        return notifications.filter(notification => notification.type === selectedFilter);
    };

    const handleNotificationPress = async (notification) => {
        try {
            // Đánh dấu thông báo đã đọc
            const result = await notificationService.markAsRead(notification.id);

            if (!result.success) {
            }

            // Cập nhật state local
            setNotifications(prev =>
                prev.map(n =>
                    n.id === notification.id
                        ? { ...n, isRead: true }
                        : n
                )
            );

            // Giảm số thông báo chưa đọcma
            setNotificationCount(prev => Math.max(0, prev - 1));

            // Điều hướng đến bài viết nếu có postId
            if (notification.postId) {
                // Lưu postId vào AsyncStorage để home có thể đọc (convert to string)
                await AsyncStorage.setItem('scrollToPostId', String(notification.postId));
                if (notification.commentId) {
                    await AsyncStorage.setItem('scrollToCommentId', String(notification.commentId));
                }

                // Quay về home
                router.back();

                Alert.alert(
                    'Chuyển đến bài viết',
                    notification.commentId
                        ? `Đang chuyển đến bình luận trong bài viết #${notification.postId}`
                        : `Đang chuyển đến bài viết #${notification.postId}`,
                    [{ text: 'OK' }]
                );
            } else {
                // Nếu không có postId, chỉ đánh dấu đã đọc
                Alert.alert(
                    'Thông báo',
                    'Thông báo đã được đánh dấu đã đọc',
                    [{ text: 'OK' }]
                );
            }
        } catch (error) {
            console.error('Error handling notification press:', error);
            // Vẫn cập nhật UI local state ngay cả khi có lỗi
            setNotifications(prev =>
                prev.map(n =>
                    n.id === notification.id
                        ? { ...n, isRead: true }
                        : n
                )
            );
            setNotificationCount(prev => Math.max(0, prev - 1));

            // Thử lưu postId nếu có (với error handling)
            if (notification.postId) {
                try {
                    await AsyncStorage.setItem('scrollToPostId', String(notification.postId));
                    if (notification.commentId) {
                        await AsyncStorage.setItem('scrollToCommentId', String(notification.commentId));
                    }
                    router.back();
                } catch (storageError) {
                    console.log('Error saving to AsyncStorage:', storageError);
                    router.back();
                }
            }

            Alert.alert('Thông báo', 'Thông báo đã được đánh dấu đã đọc');
        }
    };

    const getNotificationIcon = (type) => {
        switch (type) {
            case 'like':
                return 'heart';
            case 'comment':
                return 'message-circle';
            case 'tag':
                return 'user-plus';
            case 'follow':
                return 'user-check';
            default:
                return 'bell';
        }
    };

    const getNotificationIconColor = (type) => {
        switch (type) {
            case 'like':
                return '#FF6B6B';
            case 'comment':
                return '#4ECDC4';
            case 'tag':
                return '#FFEAA7';
            case 'follow':
                return '#A8E6CF';
            default:
                return theme.colors.primary;
        }
    };

    const markAsRead = async (notificationId) => {
        try {
            await notificationService.markAsRead(notificationId);
            setNotifications(prev =>
                prev.map(notification =>
                    notification.id === notificationId
                        ? { ...notification, isRead: true }
                        : notification
                )
            );
        } catch (error) {
            console.error('Error marking notification as read:', error);
            Alert.alert('Lỗi', 'Không thể đánh dấu đã đọc');
        }
    };

    const renderNotification = ({ item }) => (
        <TouchableOpacity
            style={[
                styles.notificationItem,
                !item.isRead && styles.unreadItem
            ]}
            onPress={() => handleNotificationPress(item)}
        >
            <View style={styles.notificationAvatar}>
                <UserAvatar
                    user={item.user}
                    size={hp(5)}
                    rounded={theme.radius.full}
                />
            </View>
            <View style={styles.notificationContent}>
                <View style={styles.notificationHeader}>
                    <Text style={styles.notificationTitle}>{item.title}</Text>
                    <Text style={styles.notificationTime}>{item.time}</Text>
                </View>
                <Text style={styles.notificationDescription}>{item.description}</Text>
                <View style={styles.notificationFooter}>
                    <View style={styles.notificationType}>
                        <Icon
                            name={getNotificationIcon(item.type)}
                            size={hp(1.5)}
                            color={getNotificationIconColor(item.type)}
                        />
                        <Text style={styles.typeText}>
                            {item.type === 'like' ? 'Thích' :
                                item.type === 'comment' ? 'Bình luận' :
                                    item.type === 'tag' ? 'Gắn thẻ' :
                                        item.type === 'follow' ? 'Theo dõi' : 'Khác'}
                        </Text>
                    </View>
                    {!item.isRead && <View style={styles.unreadDot} />}
                </View>
            </View>
        </TouchableOpacity>
    );

    const filteredNotifications = getFilteredNotifications();

    return (
        <View style={styles.container}>
            {/* Facebook-style Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Icon name="arrow-left" size={hp(2.5)} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Thông báo cá nhân</Text>
                <TouchableOpacity style={styles.settingsButton}>
                    <Icon name="settings" size={hp(2.5)} color={theme.colors.text} />
                </TouchableOpacity>
            </View>

            {/* Facebook-style Filter Tabs */}
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[styles.tab, selectedFilter === 'all' && styles.activeTab]}
                    onPress={() => setSelectedFilter('all')}
                >
                    <Text style={[styles.tabText, selectedFilter === 'all' && styles.activeTabText]}>
                        Tất cả
                    </Text>
                    {selectedFilter === 'all' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, selectedFilter === 'like' && styles.activeTab]}
                    onPress={() => setSelectedFilter('like')}
                >
                    <Text style={[styles.tabText, selectedFilter === 'like' && styles.activeTabText]}>
                        Thích
                    </Text>
                    {selectedFilter === 'like' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, selectedFilter === 'comment' && styles.activeTab]}
                    onPress={() => setSelectedFilter('comment')}
                >
                    <Text style={[styles.tabText, selectedFilter === 'comment' && styles.activeTabText]}>
                        Bình luận
                    </Text>
                    {selectedFilter === 'comment' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, selectedFilter === 'tag' && styles.activeTab]}
                    onPress={() => setSelectedFilter('tag')}
                >
                    <Text style={[styles.tabText, selectedFilter === 'tag' && styles.activeTabText]}>
                        Gắn thẻ
                    </Text>
                    {selectedFilter === 'tag' && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
            </View>

            {/* Facebook-style Notifications List */}
            <FlatList
                data={filteredNotifications}
                keyExtractor={(item, index) => `notification-${item.id}-${index}`}
                renderItem={renderNotification}
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
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        paddingTop: hp(4),
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    backButton: {
        padding: wp(2),
    },
    headerTitle: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },
    settingsButton: {
        padding: wp(2),
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: hp(1.5),
        position: 'relative',
    },
    activeTab: {
        // Active tab styling
    },
    tabText: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },
    activeTabText: {
        color: theme.colors.primary,
        fontWeight: theme.fonts.bold,
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 3,
        backgroundColor: theme.colors.primary,
        borderRadius: 1.5,
    },
    notificationsList: {
        paddingBottom: hp(2),
    },
    notificationItem: {
        flexDirection: 'row',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    unreadItem: {
        backgroundColor: '#F8F9FA',
    },
    notificationAvatar: {
        marginRight: wp(3),
    },
    notificationContent: {
        flex: 1,
    },
    notificationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: hp(0.5),
    },
    notificationTitle: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        flex: 1,
        marginRight: wp(2),
    },
    notificationTime: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
    },
    notificationDescription: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        lineHeight: hp(2),
        marginBottom: hp(1),
    },
    notificationFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    notificationType: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    typeText: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
        marginLeft: wp(1),
    },
    unreadDot: {
        width: hp(1),
        height: hp(1),
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.primary,
    },
});

export default PersonalNotifications;
