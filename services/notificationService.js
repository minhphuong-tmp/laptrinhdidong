import { supabase } from '../lib/supabase';

export const notificationService = {
    // Lấy tất cả thông báo cá nhân của user
    async getPersonalNotifications(userId) {
        try {
            // Query notifications trước
            const { data: notifications, error: notificationsError } = await supabase
                .from('notifications')
                .select('*')
                .eq('receiverId', userId) // Sửa: receiverId thay vì receiver_id
                .order('created_at', { ascending: false });

            if (notificationsError) {
                console.error('Error fetching personal notifications:', notificationsError);
                throw notificationsError;
            }

            // Nếu không có notifications, return ngay
            if (!notifications || notifications.length === 0) {
                return [];
            }

            // Lấy danh sách senderId unique
            const senderIds = [...new Set(notifications.map(n => n.senderId).filter(Boolean))]; // Sửa: senderId thay vì sender_id

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
                sender: notification.senderId ? sendersMap[notification.senderId] || null : null // Sửa: senderId thay vì sender_id
            }));

            return notificationsWithSender;
        } catch (error) {
            console.error('Error in getPersonalNotifications:', error);
            throw error;
        }
    },

    // Lấy thông báo CLB (tất cả user)
    async getClubNotifications() {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('type', 'club_announcement')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching club notifications:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            console.error('Error in getClubNotifications:', error);
            throw error;
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
                .eq('receiverId', userId) // Sửa: receiverId thay vì receiver_id
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
                console.error('Error creating notification:', error);
                throw error;
            }

            return data;
        } catch (error) {
            console.error('Error in createNotification:', error);
            throw error;
        }
    },

    // Đếm thông báo chưa đọc
    async getUnreadCount(userId) {
        try {
            const { count, error } = await supabase
                .from('notifications')
                .select('*', { count: 'exact', head: true })
                .eq('receiverId', userId) // Sửa: receiverId thay vì receiver_id
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