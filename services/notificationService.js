import { supabase } from '../lib/supabase';

export const notificationService = {
    // Lấy tất cả thông báo cá nhân của user
    async getPersonalNotifications(userId) {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select(`
                    *,
                    sender:users!sender_id(
                        id,
                        name,
                        image
                    )
                `)
                .eq('receiver_id', userId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching personal notifications:', error);
                throw error;
            }

            return data || [];
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
                .eq('receiver_id', userId)
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
                .eq('receiver_id', userId)
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
                .eq('receiver_id', userId)
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