import { supabaseUrl } from '../constants/index';
import { supabase } from '../lib/supabase';
import { loadMembersCache } from '../utils/cacheHelper';

export const clubMemberService = {
    // Debug function để kiểm tra users table
    debugUsers: async () => {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('id, name, image, email')
                .limit(5);

            return { success: true, data };
        } catch (error) {
            return { success: false, msg: error.message };
        }
    },
    // Lấy tất cả thành viên CLB
    getAllMembers: async (userId = null, useCache = true) => {
        try {
            // Check cache trước nếu có userId
            if (useCache && userId) {
                const cached = await loadMembersCache(userId);
                if (cached && cached.data) {
                    return { success: true, data: cached.data, fromCache: true };
                }
            }

            // Fetch từ database
            const { data, error } = await supabase
                .from('clb_members')
                .select(`
                    *,
                    user:users(id, name, image, email, phoneNumber)
                `)
                .order('created_at', { ascending: false });

            if (error) {
                console.log('Error fetching club members:', error);
                return { success: false, msg: error.message, data: [] };
            }

            // Transform data để match với UI
            const transformedData = data.map(member => {
                // Xử lý avatar URL
                let avatarUrl = `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`;
                if (member.user?.image) {
                    if (member.user.image.startsWith('http')) {
                        // Đã là full URL
                        avatarUrl = member.user.image;
                    } else if (member.user.image.startsWith('profiles/')) {
                        avatarUrl = `${supabaseUrl}/storage/v1/object/public/upload/${member.user.image}`;
                    }
                }

                return {
                    id: member.id,
                    mssv: member.student_id,
                    name: member.user?.name || 'N/A',
                    email: member.user?.email || 'N/A',
                    major: member.major,
                    year: member.year,
                    role: member.role,
                    avatar: avatarUrl,
                    joinDate: new Date(member.join_date).toLocaleDateString('vi-VN'),
                    points: 0, // Chưa có trong DB, có thể thêm sau
                    status: 'offline', // Chưa có trong DB, có thể thêm sau
                    phone: member.phone || member.user?.phoneNumber || 'N/A'
                };
            });

            // Sắp xếp theo vai trò: Chủ nhiệm CLB -> Phó Chủ Nhiệm -> Thành viên
            transformedData.sort((a, b) => {
                const roleOrder = {
                    'Chủ nhiệm CLB': 1,
                    'Phó Chủ Nhiệm': 2,
                    'Thành viên': 3
                };

                const aOrder = roleOrder[a.role] || 999;
                const bOrder = roleOrder[b.role] || 999;

                if (aOrder !== bOrder) {
                    return aOrder - bOrder;
                }

                // Nếu cùng vai trò, sắp xếp theo tên
                return a.name.localeCompare(b.name);
            });

            // Removed: Không tự động cache ở đây, chỉ cache khi prefetch
            // Cache chỉ được tạo trong prefetchService.js

            return { success: true, data: transformedData, fromCache: false };
        } catch (error) {
            console.log('Error in getAllMembers:', error);
            return { success: false, msg: error.message, data: [] };
        }
    },

    // Lấy thành viên theo ID
    getMemberById: async (memberId) => {
        try {
            const { data, error } = await supabase
                .from('clb_members')
                .select(`
                    *,
                    user:users(id, name, image, email, phoneNumber)
                `)
                .eq('id', memberId)
                .single();

            if (error) {
                console.log('Error fetching member:', error);
                return { success: false, msg: error.message };
            }

            // Xử lý avatar URL
            let avatarUrl = 'https://via.placeholder.com/100';
            if (data.user?.image) {
                if (data.user.image.startsWith('http')) {
                    avatarUrl = data.user.image;
                } else if (data.user.image.startsWith('profiles/')) {
                    avatarUrl = `${supabaseUrl}/storage/v1/object/public/avatars/${data.user.image}`;
                }
            }

            const transformedData = {
                id: data.id,
                mssv: data.student_id,
                name: data.user?.name || 'N/A',
                email: data.user?.email || 'N/A',
                major: data.major,
                year: data.year,
                role: data.role,
                avatar: avatarUrl,
                joinDate: new Date(data.join_date).toLocaleDateString('vi-VN'),
                points: 0,
                status: 'offline',
                phone: data.phone || data.user?.phoneNumber || 'N/A'
            };

            return { success: true, data: transformedData };
        } catch (error) {
            console.log('Error in getMemberById:', error);
            return { success: false, msg: error.message };
        }
    },

    // Thêm thành viên mới
    addMember: async (memberData) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return { success: false, msg: 'User not authenticated' };
            }

            const { data, error } = await supabase
                .from('clb_members')
                .insert({
                    user_id: memberData.user_id || user.id,
                    student_id: memberData.student_id,
                    role: memberData.role || 'Thành viên',
                    major: memberData.major || 'Công nghệ thông tin',
                    year: memberData.year || '2024',
                    phone: memberData.phone,
                    join_date: new Date().toISOString()
                })
                .select()
                .single();

            if (error) {
                console.log('Error adding member:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.log('Error in addMember:', error);
            return { success: false, msg: error.message };
        }
    },

    // Cập nhật thành viên
    updateMember: async (memberId, updateData) => {
        try {
            const { data, error } = await supabase
                .from('clb_members')
                .update({
                    student_id: updateData.student_id,
                    role: updateData.role,
                    major: updateData.major,
                    year: updateData.year,
                    phone: updateData.phone,
                    updated_at: new Date().toISOString()
                })
                .eq('id', memberId)
                .select()
                .single();

            if (error) {
                console.log('Error updating member:', error);
                return { success: false, msg: error.message };
            }

            return { success: true, data };
        } catch (error) {
            console.log('Error in updateMember:', error);
            return { success: false, msg: error.message };
        }
    },

    // Xóa thành viên
    deleteMember: async (memberId) => {
        try {
            const { error } = await supabase
                .from('clb_members')
                .delete()
                .eq('id', memberId);

            if (error) {
                console.log('Error deleting member:', error);
                return { success: false, msg: error.message };
            }

            return { success: true };
        } catch (error) {
            console.log('Error in deleteMember:', error);
            return { success: false, msg: error.message };
        }
    },

    // Tìm kiếm thành viên
    searchMembers: async (searchText, filters = {}) => {
        try {
            let query = supabase
                .from('clb_members')
                .select(`
                    *,
                    user:users(id, name, image, email, phoneNumber)
                `);

            // Tìm kiếm theo text
            if (searchText) {
                query = query.or(`student_id.ilike.%${searchText}%,major.ilike.%${searchText}%,year.ilike.%${searchText}%`);
            }

            // Filter theo role
            if (filters.role && filters.role !== 'Tất cả') {
                query = query.eq('role', filters.role);
            }

            // Filter theo year
            if (filters.year && filters.year !== 'Tất cả') {
                query = query.eq('year', filters.year);
            }

            // Filter theo major
            if (filters.major && filters.major !== 'Tất cả') {
                query = query.eq('major', filters.major);
            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) {
                console.log('Error searching members:', error);
                return { success: false, msg: error.message, data: [] };
            }

            // Transform data
            const transformedData = data.map(member => {
                // Xử lý avatar URL
                let avatarUrl = `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`;
                if (member.user?.image) {
                    if (member.user.image.startsWith('http')) {
                        avatarUrl = member.user.image;
                    } else if (member.user.image.startsWith('profiles/')) {
                        avatarUrl = `${supabaseUrl}/storage/v1/object/public/upload/${member.user.image}`;
                    }
                }

                return {
                    id: member.id,
                    mssv: member.student_id,
                    name: member.user?.name || 'N/A',
                    email: member.user?.email || 'N/A',
                    major: member.major,
                    year: member.year,
                    role: member.role,
                    avatar: avatarUrl,
                    joinDate: new Date(member.join_date).toLocaleDateString('vi-VN'),
                    points: 0,
                    status: 'offline',
                    phone: member.phone || member.user?.phoneNumber || 'N/A'
                };
            });

            return { success: true, data: transformedData };
        } catch (error) {
            console.log('Error in searchMembers:', error);
            return { success: false, msg: error.message, data: [] };
        }
    }
};
