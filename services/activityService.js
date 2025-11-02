import { supabase } from '../lib/supabase';

export const activityService = {
    // Lấy tất cả hoạt động
    getAllActivities: async () => {
        try {
            const { data, error } = await supabase
                .from('activities')
                .select(`
                    *,
                    participants:activity_participants(
                        id,
                        activity_id,
                        user_id,
                        registered_at,
                        user:users(id, name, image)
                    ),
                    organizer:users!organizer_id(id, name, image)
                `)
                .order('start_date', { ascending: false });

            if (error) {
                console.log('Error fetching activities:', error);
                return { success: false, msg: error.message, data: [] };
            }

            console.log('Activities data from database:', data);
            return { success: true, data: data || [] };
        } catch (error) {
            console.log('Error in getAllActivities:', error);
            return { success: false, msg: error.message, data: [] };
        }
    },

    // Lấy hoạt động theo ID
    getActivityById: async (activityId) => {
        try {
            const { data, error } = await supabase
                .from('activities')
                .select(`
                    *,
                    participants:activity_participants(
                        id,
                        activity_id,
                        user_id,
                        registered_at,
                        user:users(id, name, image)
                    ),
                    organizer:users!organizer_id(id, name, image)
                `)
                .eq('id', activityId)
                .single();

            if (error) {
                console.log('Error fetching activity:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: data };
        } catch (error) {
            console.log('Error in getActivityById:', error);
            return { success: false, msg: error.message };
        }
    },

    // Tham gia hoạt động
    joinActivity: async (activityId, userId) => {
        try {
            const { data, error } = await supabase
                .from('activity_participants')
                .insert({
                    activity_id: activityId,
                    user_id: userId,
                    registered_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) {
                console.log('Error joining activity:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: data };
        } catch (error) {
            console.log('Error in joinActivity:', error);
            return { success: false, msg: error.message };
        }
    },

    // Rời khỏi hoạt động
    leaveActivity: async (activityId, userId) => {
        try {
            const { error } = await supabase
                .from('activity_participants')
                .delete()
                .eq('activity_id', activityId)
                .eq('user_id', userId);

            if (error) {
                console.log('Error leaving activity:', error);
                return { success: false, msg: error.message };
            }

            return { success: true };
        } catch (error) {
            console.log('Error in leaveActivity:', error);
            return { success: false, msg: error.message };
        }
    },

    // Tạo hoạt động mới
    createActivity: async (activityData) => {
        try {
            const { data, error } = await supabase
                .from('activities')
                .insert(activityData)
                .select()
                .single();

            if (error) {
                console.log('Error creating activity:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: data };
        } catch (error) {
            console.log('Error in createActivity:', error);
            return { success: false, msg: error.message };
        }
    },

    // Cập nhật hoạt động
    updateActivity: async (activityId, updateData) => {
        try {
            const { data, error } = await supabase
                .from('activities')
                .update(updateData)
                .eq('id', activityId)
                .select()
                .single();

            if (error) {
                console.log('Error updating activity:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data: data };
        } catch (error) {
            console.log('Error in updateActivity:', error);
            return { success: false, msg: error.message };
        }
    },

    // Xóa hoạt động
    deleteActivity: async (activityId) => {
        try {
            const { error } = await supabase
                .from('activities')
                .delete()
                .eq('id', activityId);

            if (error) {
                console.log('Error deleting activity:', error);
                return { success: false, msg: error.message };
            }

            return { success: true };
        } catch (error) {
            console.log('Error in deleteActivity:', error);
            return { success: false, msg: error.message };
        }
    }
};
