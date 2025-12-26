import { supabase } from '../lib/supabase';
import { loadClubNotificationsCache, loadPersonalNotificationsCache } from '../utils/cacheHelper';

export const notificationService = {
    // Lấy tất cả thông báo cá nhân của user
    async getPersonalNotifications(userId, useCache = true) {
        try {
            // Check cache trước
            if (useCache) {
                const cached = await loadPersonalNotificationsCache(userId);
                if (cached && cached.data) {
                    return cached.data;
                }
            }

            // Query notifications trước - lấy TẤT CẢ (không giới hạn)
            const { data: notifications, error: notificationsError } = await supabase
                .from('notifications')
                .select('*')
                .eq('receiverId', userId) // Dùng receiverId (camelCase) - đúng tên column trong database
                .order('created_at', { ascending: false })
                .limit(10000); // Lấy tối đa 10000 notifications để đảm bảo lấy hết

            if (notificationsError) {
                console.error('Error fetching personal notifications:', notificationsError);
                throw notificationsError;
            }

            // Nếu không có notifications, return ngay
            if (!notifications || notifications.length === 0) {
                return [];
            }

            // Lấy danh sách senderId unique
            const senderIds = [...new Set(notifications.map(n => n.senderId).filter(Boolean))];

            // Query users nếu có senderId
            let sendersMap = {};
            if (senderIds.length > 0) {
                const { data: senders, error: sendersError } = await supabase
                    .from('users')
                    .select('id, name, image')
                    .in('id', senderIds);

                if (!sendersError && senders) {
                    sendersMap = senders.reduce((acc, user) => {
                        acc[user.id] = user;
                        return acc;
                    }, {});
                }
            }

            // Map notifications với sender info
            const notificationsWithSender = notifications.map(notification => ({
                ...notification,
                sender: notification.senderId ? sendersMap[notification.senderId] || null : null
            }));

            // Removed: Không tự động cache ở đây, chỉ cache khi prefetch
            // Cache chỉ được tạo trong prefetchService.js

            return notificationsWithSender;
        } catch (error) {
            console.error('Error in getPersonalNotifications:', error);
            throw error;
        }
    },

    // Lấy chỉ notifications mới (sau một timestamp cụ thể)
    async getNewPersonalNotifications(userId, sinceTimestamp, excludeIds = []) {
        try {
            // Dùng gt (greater than) thay vì gte để chỉ lấy notifications MỚI HƠN timestamp
            const { data: notifications, error: notificationsError } = await supabase
                .from('notifications')
                .select('*')
                .eq('receiverId', userId)
                .gt('created_at', sinceTimestamp) // Chỉ lấy notifications MỚI HƠN timestamp
                .order('created_at', { ascending: false });

            // Filter thêm: loại bỏ các IDs đã có trong cache (để chắc chắn)
            if (notifications && notifications.length > 0 && excludeIds.length > 0) {
                return notifications.filter(n => !excludeIds.includes(n.id));
            }

            if (notificationsError) {
                console.error('Error fetching new personal notifications:', notificationsError);
                throw notificationsError;
            }

            // Nếu không có notifications mới, return ngay
            if (!notifications || notifications.length === 0) {
                return [];
            }

            // Lấy danh sách senderId unique
            const senderIds = [...new Set(notifications.map(n => n.senderId).filter(Boolean))];

            // Query users nếu có senderId
            let sendersMap = {};
            if (senderIds.length > 0) {
                const { data: senders, error: sendersError } = await supabase
                    .from('users')
                    .select('id, name, image')
                    .in('id', senderIds);

                if (!sendersError && senders) {
                    sendersMap = senders.reduce((acc, user) => {
                        acc[user.id] = user;
                        return acc;
                    }, {});
                }
            }

            // Map notifications với sender info
            const notificationsWithSender = notifications.map(notification => ({
                ...notification,
                sender: notification.senderId ? sendersMap[notification.senderId] || null : null
            }));

            return notificationsWithSender;
        } catch (error) {
            console.error('Error in getNewPersonalNotifications:', error);
            throw error;
        }
    },

    // Lấy thông báo CLB (tất cả user) từ bảng notifications_clb
    async getClubNotifications(userId = null, useCache = true) {
        try {
            // Check cache trước
            if (useCache && userId) {
                const cached = await loadClubNotificationsCache(userId);
                if (cached && cached.data) {
                    return cached.data;
                }
            }

            // Query từ bảng notifications_clb
            // Xử lý cả camelCase và snake_case cho column names
            let query = supabase
                .from('notifications_clb')
                .select(`
                    *,
                    sender:users(id, name, image)
                `)
                .order('created_at', { ascending: false });

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching club notifications:', error);
                throw error;
            }

            if (!data || data.length === 0) {
                return [];
            }

            // Nếu có userId, check read status từ bảng notifications_clb_reads
            if (userId) {
                const notificationIds = data.map(n => n.id);

                const { data: reads, error: readsError } = await supabase
                    .from('notifications_clb_reads')
                    .select('notification_clb_id, notificationClbId')
                    .eq('user_id', userId)
                    .in('notification_clb_id', notificationIds);

                if (!readsError && reads && reads.length > 0) {
                    // Xử lý cả camelCase và snake_case
                    const readIds = new Set();
                    reads.forEach(r => {
                        if (r.notification_clb_id) readIds.add(r.notification_clb_id);
                        if (r.notificationClbId) readIds.add(r.notificationClbId);
                    });

                    // Map isRead cho từng notification
                    return data.map(notification => ({
                        ...notification,
                        isRead: readIds.has(notification.id)
                    }));
                }
            }

            // Nếu không có userId hoặc không có reads, set isRead = false cho tất cả
            const result = data.map(notification => ({
                ...notification,
                isRead: false
            }));

            // Removed: Không tự động cache ở đây, chỉ cache khi prefetch
            // Cache chỉ được tạo trong prefetchService.js

            return result;
        } catch (error) {
            console.error('Error in getClubNotifications:', error);
            throw error;
        }
    },

    // Đánh dấu thông báo CLB đã đọc
    async markClubNotificationAsRead(notificationClbId, userId) {
        try {
            const { data, error } = await supabase
                .from('notifications_clb_reads')
                .upsert({
                    notification_clb_id: notificationClbId,
                    user_id: userId,
                    read_at: new Date().toISOString()
                }, {
                    onConflict: 'notification_clb_id,user_id'
                })
                .select()
                .single();

            if (error) {
                console.error('Error marking club notification as read:', error);
                return { success: false, message: error.message };
            }

            return { success: true, message: 'Club notification marked as read', data };
        } catch (error) {
            console.error('Error in markClubNotificationAsRead:', error);
            return { success: false, message: error.message };
        }
    },

    // Đánh dấu thông báo đã đọc
    async markAsRead(notificationId) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId)
                .select()
                .single();

            if (error) {
                console.error('Error marking notification as read:', error);
                return { success: false, message: error.message };
            }

            return { success: true, message: 'Notification marked as read', data };
        } catch (error) {
            console.error('Error in markAsRead:', error);
            return { success: false, message: error.message };
        }
    },

    // Đánh dấu tất cả thông báo đã đọc
    async markAllAsRead(userId) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('receiverId', userId) // Dùng receiverId (camelCase) - đúng tên column trong database
                .eq('is_read', false);

            if (error) {
                console.error('Error marking all notifications as read:', error);
                throw error;
            }

            console.log('All notifications marked as read for user:', userId);
            return true;
        } catch (error) {
            console.error('Error in markAllAsRead:', error);
            throw error;
        }
    },

    // Tạo thông báo mới
    async createNotification(notificationData) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .insert([notificationData])
                .select()
                .single();

            if (error) {
                console.error('❌ [NotificationService] Error creating notification:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('❌ [NotificationService] Error in createNotification:', error);
            throw error;
        }
    },

    // Đếm thông báo chưa đọc
    async getUnreadCount(userId) {
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('receiverId', userId) // Dùng receiverId (camelCase) - đúng tên column trong database
                .eq('is_read', false);

            if (error) {
                console.error('Error getting unread count:', error);
                throw error;
            }

            return count || 0;
        } catch (error) {
            console.error('Error in getUnreadCount:', error);
            throw error;
        }
    },

    // Lọc thông báo theo loại
    async getNotificationsByType(userId, type) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('receiverId', userId) // Sửa: receiverId thay vì receiver_id
                .eq('type', type)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching notifications by type:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            console.error('Error in getNotificationsByType:', error);
            throw error;
        }
    }
};