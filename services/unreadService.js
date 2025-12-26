import { supabase } from '../lib/supabase';

/**
 * Get unread messages count (không cache, luôn query fresh)
 * @param {string} userId - User ID
 * @returns {number} Total unread messages count
 */
export const getUnreadMessagesCount = async (userId) => {
    if (!userId) {
        return 0;
    }

    try {
        // Query từ conversation_members (không query unread_count vì có thể không có column)
        // Tính từ messages dựa trên last_read_at
        const { data, error } = await supabase
            .from('conversation_members')
            .select('last_read_at, conversation_id')
            .eq('user_id', userId);

        if (error) {
            console.log('❌ [Unread] Lỗi khi query conversation_members:', error);
            return 0;
        }

        if (!data || data.length === 0) {
            return 0;
        }

        // Nếu không có unread_count column, tính từ messages
        let totalUnread = 0;
        for (const member of data || []) {
            if (!member.conversation_id) {
                continue;
            }

            // Nếu không có last_read_at, đếm tất cả messages không phải của user
            if (!member.last_read_at) {
                const { count, error: countError } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', member.conversation_id)
                    .neq('sender_id', userId);

                if (!countError && count) {
                    totalUnread += count;
                }
            } else {
                // Đếm messages sau last_read_at
                const { count, error: countError } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', member.conversation_id)
                    .gt('created_at', member.last_read_at)
                    .neq('sender_id', userId);

                if (!countError && count) {
                    totalUnread += count;
                }
            }
        }

        return totalUnread;
    } catch (error) {
        console.log('❌ [Unread] Lỗi khi get unread messages count:', error);
        return 0;
    }
};

/**
 * Get unread notifications count (không cache, luôn query fresh)
 * @param {string} userId - User ID
 * @returns {number} Total unread notifications count
 */
export const getUnreadNotificationsCount = async (userId) => {
    if (!userId) {
        return 0;
    }

    try {
        // Query từ notifications
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('receiverId', userId)
            .eq('is_read', false);

        if (error) {
            console.log('❌ [Unread] Lỗi khi query notifications:', error);
            return 0;
        }

        return count || 0;
    } catch (error) {
        console.log('❌ [Unread] Lỗi khi get unread notifications count:', error);
        return 0;
    }
};

/**
 * Get all unread counts (messages + notifications)
 * @param {string} userId - User ID
 * @returns {Object} { messages: number, notifications: number }
 */
export const getAllUnreadCounts = async (userId) => {
    if (!userId) {
        return { messages: 0, notifications: 0 };
    }

    try {
        const [messages, notifications] = await Promise.all([
            getUnreadMessagesCount(userId),
            getUnreadNotificationsCount(userId)
        ]);

        return { messages, notifications };
    } catch (error) {
        console.log('❌ [Unread] Lỗi khi get all unread counts:', error);
        return { messages: 0, notifications: 0 };
    }
};

/**
 * Setup realtime subscription để update unread counts tự động
 * @param {string} userId - User ID
 * @param {Function} onUpdate - Callback khi có update (sẽ gọi lại getAllUnreadCounts)
 * @returns {Function} Cleanup function để unsubscribe
 */
export const setupRealtimeSubscription = (userId, onUpdate) => {
    if (!userId || !onUpdate) {
        return () => { };
    }

    // Subscribe to messages INSERT - khi có message mới
    // Đây là cách nhanh nhất để detect message mới
    const messagesChannel = supabase
        .channel(`unread-messages-insert-${userId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, async (payload) => {
            // Chỉ update nếu message không phải từ user hiện tại
            // (getUnreadMessagesCount sẽ tự động kiểm tra xem user có trong conversation không)
            if (payload.new.sender_id !== userId) {
                // Trigger update callback để reload unread count
                // getUnreadMessagesCount sẽ tự động filter chỉ messages cho user hiện tại
                onUpdate();
            }
        })
        .subscribe();

    // Subscribe to conversation_members changes (unread_count updates)
    // Khi có message mới, unread_count trong conversation_members sẽ được update
    const convChannel = supabase
        .channel(`unread-messages-${userId}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'conversation_members',
            filter: `user_id=eq.${userId}`
        }, (payload) => {
            // Trigger update callback
            onUpdate();
        })
        .subscribe();

    // Subscribe to notifications changes
    const notifChannel = supabase
        .channel(`unread-notifications-${userId}`)
        .on('postgres_changes', {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'notifications',
            filter: `receiverId=eq.${userId}`
        }, () => {
            // Trigger update callback
            onUpdate();
        })
        .subscribe();

    // Return cleanup function
    return () => {
        messagesChannel.unsubscribe();
        convChannel.unsubscribe();
        notifChannel.unsubscribe();
    };
};

export const unreadService = {
    getUnreadMessagesCount,
    getUnreadNotificationsCount,
    getAllUnreadCounts,
    setupRealtimeSubscription
};

