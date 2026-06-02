import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
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
import { supabase } from '../../lib/supabase';
import { notificationService } from '../../services/notificationService';

const PersonalNotifications = () => {
    const router = useRouter();
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [notificationCount, setNotificationCount] = useState(0);
    const subscriptionRef = useRef(null);

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

    // Setup realtime subscription để update notifications realtime
    useEffect(() => {
        if (!user?.id) return;



        // Cleanup existing subscriptions
        if (subscriptionRef.current) {
            if (subscriptionRef.current.channel) {
                subscriptionRef.current.channel.unsubscribe();
            }
            if (subscriptionRef.current.channelSnakeCase) {
                subscriptionRef.current.channelSnakeCase.unsubscribe();
            }
        }

        // Handler cho notification mới - chỉ cập nhật unread count, không động vào cache
        const handleNewNotification = async (payload) => {
            console.log(' [PersonalNotifications] Realtime: Có notification mới, chỉ cập nhật unread count...');

            // Chỉ tăng unread count, không động vào cache
            // Cache sẽ được cập nhật khi vào màn hình (fetch dữ liệu mới + merge với cache cũ)
            setNotificationCount(prevCount => {
                const newCount = prevCount + 1;
                console.log(`   Unread count: ${prevCount} → ${newCount}`);
                return newCount;
            });
        };

        // Thử subscription với receiverId (camelCase)
        const channel = supabase
            .channel(`personal-notifications-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `receiverId=eq.${user.id}`
            }, handleNewNotification)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `receiverId=eq.${user.id}`
            }, (payload) => {
                // Khi notification được update (mark as read), update local state ngay
                const isRead = payload.new?.isRead !== undefined ? payload.new.isRead : payload.new?.is_read;
                const oldIsRead = payload.old?.isRead !== undefined ? payload.old.isRead : payload.old?.is_read;

                if (isRead !== undefined) {
                    setNotifications(prev =>
                        prev.map(n =>
                            n.id === payload.new.id
                                ? { ...n, isRead: isRead }
                                : n
                        )
                    );
                    // Update count
                    if (isRead && !oldIsRead) {
                        // Đã đánh dấu đã đọc
                        setNotificationCount(prev => Math.max(0, prev - 1));
                    } else if (!isRead && oldIsRead) {
                        // Đã đánh dấu chưa đọc (ít khi xảy ra)
                        setNotificationCount(prev => prev + 1);
                    }
                } else {
                    // Nếu không có isRead trong payload, reload toàn bộ
                    loadNotifications();
                }
            })
            .subscribe();

        // Thử subscription với receiver_id (snake_case) nếu receiverId không hoạt động
        const channelSnakeCase = supabase
            .channel(`personal-notifications-snake-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `receiver_id=eq.${user.id}`
            }, handleNewNotification)
            .subscribe();

        subscriptionRef.current = { channel, channelSnakeCase };

        return () => {
            if (subscriptionRef.current) {
                if (subscriptionRef.current.channel) {
                    subscriptionRef.current.channel.unsubscribe();
                }
                if (subscriptionRef.current.channelSnakeCase) {
                    subscriptionRef.current.channelSnakeCase.unsubscribe();
                }
            }
        };
    }, [user?.id]);

    const loadNotifications = async (useCache = true) => {
        try {
            setLoading(true);
            if (!user?.id) {
                console.log('No user ID available');
                return;
            }

            // Load từ cache trước (nếu có)
            let fromCache = false;
            let cached = null;
            if (useCache) {
                const { loadPersonalNotificationsCache } = require('../../utils/cacheHelper');
                const cacheStartTime = Date.now();
                cached = await loadPersonalNotificationsCache(user.id);
                if (cached && cached.data && cached.data.length > 0) {
                    fromCache = true;
                    const dataSize = JSON.stringify(cached.data).length;
                    const dataSizeKB = (dataSize / 1024).toFixed(2);
                    const loadTime = Date.now() - cacheStartTime;
                    const cacheCount = cached.data.length;
                    console.log(`Load dữ liệu từ cache: personalNotifications (${cacheCount} notifications)`);
                    console.log(`- Dữ liệu đã load: ${cached.data.length} notifications (${dataSizeKB} KB)`);
                    console.log(`- Tổng thời gian load: ${loadTime} ms`);
                    // Có cache, hiển thị ngay
                    const transformedData = cached.data.map(notification => {
                        // Transform logic giống như bên dưới
                        let postId = notification.postId || null;
                        let commentId = notification.commentId || null;
                        if (!postId && !commentId && notification.message) {
                            try {
                                if (typeof notification.message === 'string' && notification.message.trim().startsWith('{')) {
                                    const parsedData = JSON.parse(notification.message);
                                    postId = parsedData.postId || null;
                                    commentId = parsedData.commentId || null;
                                }
                            } catch (e) {
                                // Silent
                            }
                        }
                        let type = 'notification';
                        if (notification.title && notification.title.includes('thích')) type = 'like';
                        else if (notification.title && notification.title.includes('bình luận')) type = 'comment';
                        else if (notification.title && notification.title.includes('gắn thẻ')) type = 'tag';
                        else if (notification.title && notification.title.includes('theo dõi')) type = 'follow';
                        const title = notification.title || 'Thông báo mới';
                        return {
                            id: notification.id,
                            type: type,
                            title: title,
                            description: postId ? `Bài viết #${postId}` : (notification.content || 'Không có nội dung'),
                            time: formatTimeAgo(notification.created_at),
                            isRead: notification.isRead || notification.is_read || false,
                            postId: postId,
                            commentId: commentId,
                            originalType: notification.type || type,
                            user: {
                                id: notification.sender?.id || notification.senderId || 'system',
                                name: notification.sender?.name || (notification.senderId ? 'Người dùng' : 'Hệ thống'),
                                image: notification.sender?.image || null
                            }
                        };
                    });
                    setNotifications(transformedData);
                    const unreadCount = transformedData.filter(n => !n.isRead).length;
                    setNotificationCount(unreadCount);
                    setLoading(false);
                }
            }

            // Fetch dữ liệu mới (chỉ fetch nếu có cache, hoặc fetch toàn bộ nếu không có cache)
            let data;
            if (fromCache && cached && cached.data && cached.data.length > 0) {
                const cacheCount = cached.data.length;
                const cacheAge = Date.now() - cached.timestamp;
                const cacheAgeSeconds = Math.floor(cacheAge / 1000);

                // Luôn fetch dữ liệu mới để merge với cache cũ
                const latestNotificationTime = cached.data[0].created_at;
                const cacheIds = cached.data.map(n => n.id);
                const cacheLatestTime = new Date(latestNotificationTime).getTime();

                try {
                    const newNotifications = await notificationService.getNewPersonalNotifications(user.id, latestNotificationTime, cacheIds);
                    const newCount = newNotifications ? newNotifications.length : 0;

                    // Luôn log số lượng từ CSDL (kể cả 0)
                    console.log(`Load từ CSDL: ${newCount} notifications`);

                    if (newNotifications && newNotifications.length > 0) {
                        // Filter: không có trong cache VÀ có created_at > cache latest time
                        const existingIds = new Set(cached.data.map(n => n.id));
                        const uniqueNewNotifications = newNotifications.filter(n => {
                            const nTime = new Date(n.created_at).getTime();
                            return !existingIds.has(n.id) && nTime > cacheLatestTime;
                        });

                        if (uniqueNewNotifications.length > 0) {
                            const totalCount = uniqueNewNotifications.length + cacheCount;
                            console.log(`Cache: ${cacheCount} notifications`);
                            console.log(`Tổng dữ liệu: ${totalCount} notifications`);

                            // Gộp notifications mới với cache cũ để hiển thị (KHÔNG update cache)
                            data = [...uniqueNewNotifications, ...cached.data].sort((a, b) =>
                                new Date(b.created_at) - new Date(a.created_at)
                            );
                        } else {
                            console.log(`Tổng dữ liệu: ${cacheCount} notifications`);
                            data = cached.data;
                        }
                    } else {
                        console.log(`Tổng dữ liệu: ${cacheCount} notifications`);
                        data = cached.data;
                    }
                } catch (error) {
                    console.error('[PersonalNotifications] Lỗi khi fetch dữ liệu mới:', error);
                    console.log(`Load từ CSDL: 0 notifications`);
                    console.log(`Tổng dữ liệu: ${cacheCount} notifications`);
                    data = cached.data;
                }
            } else {
                // Không có cache → fetch toàn bộ
                console.log('Load dữ liệu từ CSDL: personalNotifications');
                data = await notificationService.getPersonalNotifications(user.id, false);
                if (data && data.length > 0) {
                    console.log(`Load từ CSDL: ${data.length} notifications`);
                    console.log(`Tổng dữ liệu: ${data.length} notifications`);
                } else {
                    console.log(`Load từ CSDL: 0 notifications`);
                    console.log(`Tổng dữ liệu: 0 notifications`);
                }
            }

            // Transform data để phù hợp với UI
            const transformedData = data.map(notification => {
                // Debug: Log chỉ những field cần thiết (tránh log object quá lớn)
                if (notification.id) {

                }

                // Lấy postId và commentId từ notification
                // Ưu tiên: postId/commentId column > message field (fallback cho notification cũ)
                let postId = notification.postId || null;
                let commentId = notification.commentId || null;

                // Fallback: Nếu không có postId/commentId column, thử parse từ message (cho notification cũ)
                if (!postId && !commentId && notification.message) {
                    try {
                        if (typeof notification.message === 'string' && notification.message.trim().startsWith('{')) {
                            const parsedData = JSON.parse(notification.message);
                            postId = parsedData.postId || null;
                            commentId = parsedData.commentId || null;
                        }
                    } catch (e) {
                        console.log('🔔 [PersonalNotifications] Error parsing message (fallback):', e);
                    }
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

                // Debug log
                if (postId) {
                } else {
                }

                return {
                    id: notification.id,
                    type: type,
                    title: title,
                    description: postId ? `Bài viết #${postId}` : (notification.content || 'Không có nội dung'),
                    time: formatTimeAgo(notification.created_at),
                    isRead: notification.isRead || notification.is_read || false,
                    postId: postId,
                    commentId: commentId,
                    originalType: notification.type || type, // Lưu type gốc từ database, fallback về type đã xác định
                    user: {
                        id: notification.sender?.id || notification.senderId || 'system',
                        name: notification.sender?.name || (notification.senderId ? 'Người dùng' : 'Hệ thống'),
                        image: notification.sender?.image || null
                    }
                };
            });

            // Update UI với dữ liệu đã transform
            setNotifications(transformedData);
            // Luôn cập nhật notificationCount dựa trên số thông báo chưa đọc
            const unreadCount = transformedData.filter(n => !n.isRead).length;
            setNotificationCount(unreadCount);

            if (!fromCache) {
                setLoading(false);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
            if (!fromCache) {
                Alert.alert('Lỗi', 'Không thể tải thông báo');
                setLoading(false);
            }
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


            // Check nếu là thông báo về lịch CLB (club_announcement, event_reminder, meeting, workshop, activity)
            const isClubNotification = notification.originalType === 'club_announcement' ||
                notification.originalType === 'event_reminder' ||
                notification.originalType === 'meeting' ||
                notification.originalType === 'workshop' ||
                notification.originalType === 'activity' ||
                notification.title?.toLowerCase().includes('clb') ||
                notification.title?.toLowerCase().includes('lịch') ||
                notification.title?.toLowerCase().includes('sự kiện');

            // Nếu là thông báo CLB, navigate đến màn hình thông báo CLB
            if (isClubNotification) {
                // Đánh dấu đã đọc nếu chưa đọc
                if (!notification.isRead) {
                    const result = await notificationService.markAsRead(notification.id);
                    if (!result.success) {
                        console.log('Failed to mark notification as read:', result.message);
                    }

                    // Cập nhật state local
                    setNotifications(prev =>
                        prev.map(n =>
                            n.id === notification.id
                                ? { ...n, isRead: true }
                                : n
                        )
                    );

                    // Giảm số thông báo chưa đọc
                    setNotificationCount(prev => Math.max(0, prev - 1));
                }

                // Navigate đến màn hình thông báo CLB với highlight notification
                router.push({
                    pathname: 'notifications',
                    params: {
                        highlightNotificationId: String(notification.id)
                    }
                });
                return;
            }

            // Nếu đã đọc rồi, chỉ điều hướng nếu có postId (không mark lại)
            if (notification.isRead) {
                if (notification.postId) {
                    const params = {
                        postId: String(notification.postId)
                    };
                    if (notification.commentId) {
                        params.commentId = String(notification.commentId);
                    }
                    router.push({
                        pathname: 'postDetails',
                        params: params
                    });
                } else {
                    console.log('🔔 [PersonalNotifications] Already read but no postId, going back');
                    router.back();
                }
                return;
            }

            // Đánh dấu thông báo đã đọc
            const result = await notificationService.markAsRead(notification.id);

            if (!result.success) {
                console.log('Failed to mark notification as read:', result.message);
            }

            // Cập nhật state local ngay lập tức
            setNotifications(prev =>
                prev.map(n =>
                    n.id === notification.id
                        ? { ...n, isRead: true }
                        : n
                )
            );

            // Giảm số thông báo chưa đọc
            setNotificationCount(prev => Math.max(0, prev - 1));

            // Điều hướng đến bài viết nếu có postId (cho cả like và comment)
            if (notification.postId) {
                // Đợi một chút để đảm bảo database đã update xong
                await new Promise(resolve => setTimeout(resolve, 100));

                // Navigate trực tiếp đến postDetails screen
                // Nếu có commentId, sẽ scroll đến comment đó
                const params = {
                    postId: String(notification.postId)
                };
                if (notification.commentId) {
                    params.commentId = String(notification.commentId);
                }

                // Dùng pathname tương đối cho expo-router
                router.push({
                    pathname: 'postDetails',
                    params: params
                });
            } else {
                // Nếu không có postId, chỉ đánh dấu đã đọc và quay lại
                router.back();
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

            // Check nếu là thông báo CLB
            const isClubNotification = notification.originalType === 'club_announcement' ||
                notification.originalType === 'event_reminder' ||
                notification.originalType === 'meeting' ||
                notification.originalType === 'workshop' ||
                notification.originalType === 'activity' ||
                notification.title?.toLowerCase().includes('clb') ||
                notification.title?.toLowerCase().includes('lịch') ||
                notification.title?.toLowerCase().includes('sự kiện');

            if (isClubNotification) {
                router.push('notifications');
            } else if (notification.postId) {
                try {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    router.push({
                        pathname: 'postDetails',
                        params: {
                            postId: String(notification.postId),
                            ...(notification.commentId && { commentId: String(notification.commentId) })
                        }
                    });
                } catch (error) {
                    console.log('Error navigating to post:', error);
                    router.back();
                }
            } else {
                router.back();
            }
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
