import { supabase } from '../lib/supabase';

export const statsService = {
    // Lấy thống kê top users đăng nhiều bài nhất
    getTopUsers: async (timeFilter = 'all', limit = 10) => {
        try {
            let query = supabase
                .from('posts')
                .select(`
                    userId,
                    created_at,
                    user:users(id, name, image),
                    likes:postLikes(count),
                    comments(count)
                `);

            // Filter theo thời gian
            if (timeFilter !== 'all') {
                const days = timeFilter === '7d' ? 7 : timeFilter === '30d' ? 30 : null;
                if (days) {
                    const fromDate = new Date();
                    fromDate.setDate(fromDate.getDate() - days);
                    query = query.gte('created_at', fromDate.toISOString());
                }
            }

            const { data: posts, error } = await query;

            if (error) {
                console.log('Error fetching posts for stats:', error);
                return { success: false, msg: error.message };
            }

            // Nhóm theo user và tính toán thống kê
            const userStats = {};
            
            posts?.forEach(post => {
                const userId = post.userId;
                const user = post.user;
                
                if (!userStats[userId]) {
                    userStats[userId] = {
                        user: user,
                        postCount: 0,
                        totalLikes: 0,
                        totalComments: 0
                    };
                }
                
                userStats[userId].postCount += 1;
                userStats[userId].totalLikes += post.likes?.[0]?.count || 0;
                userStats[userId].totalComments += post.comments?.[0]?.count || 0;
            });

            // Chuyển thành array và sắp xếp theo số bài viết
            const sortedStats = Object.values(userStats)
                .sort((a, b) => b.postCount - a.postCount)
                .slice(0, limit);

            return { success: true, data: sortedStats };

        } catch (error) {
            console.log('Error in getTopUsers:', error);
            return { success: false, msg: error.message };
        }
    },

    // Lấy thống kê tổng quan
    getOverallStats: async (timeFilter = 'all') => {
        try {
            let query = supabase
                .from('posts')
                .select('id, created_at, userId');

            // Filter theo thời gian
            if (timeFilter !== 'all') {
                const days = timeFilter === '7d' ? 7 : timeFilter === '30d' ? 30 : null;
                if (days) {
                    const fromDate = new Date();
                    fromDate.setDate(fromDate.getDate() - days);
                    query = query.gte('created_at', fromDate.toISOString());
                }
            }

            const { data: posts, error } = await query;

            if (error) {
                console.log('Error fetching overall stats:', error);
                return { success: false, msg: error.message };
            }

            // Tính toán thống kê tổng quan
            const totalPosts = posts?.length || 0;
            const uniqueUsers = new Set(posts?.map(p => p.userId)).size;
            const avgPostsPerUser = uniqueUsers > 0 ? (totalPosts / uniqueUsers).toFixed(1) : 0;

            return {
                success: true,
                data: {
                    totalPosts,
                    activeUsers: uniqueUsers,
                    avgPostsPerUser
                }
            };

        } catch (error) {
            console.log('Error in getOverallStats:', error);
            return { success: false, msg: error.message };
        }
    }
};


