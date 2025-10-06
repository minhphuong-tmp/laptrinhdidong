import { supabase } from "../lib/supabase";

// ===== CONVERSATIONS =====
export const createConversation = async (data) => {
    try {
        const { data: conversation, error } = await supabase
            .from('conversations')
            .insert(data)
            .select()
            .single();

        if (error) {
            console.log('createConversation error:', error);
            return { success: false, msg: 'Không thể tạo cuộc trò chuyện' };
        }

        return { success: true, data: conversation };
    } catch (error) {
        console.log('createConversation error:', error);
        return { success: false, msg: 'Không thể tạo cuộc trò chuyện' };
    }
};

export const getConversations = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('conversation_members')
            .select(`
                conversation_id,
                last_read_at,
                conversation:conversations(
                    id,
                    name,
                    type,
                    created_at,
                    updated_at,
                    created_by
                )
            `)
            .eq('user_id', userId);

        if (error) {
            console.log('getConversations error:', error);
            return { success: false, msg: 'Không thể lấy danh sách cuộc trò chuyện' };
        }

        // Lấy tin nhắn cuối và thông tin thành viên cho mỗi conversation
        const conversationsWithMessages = await Promise.all(
            data.map(async (item) => {
                // Lấy tin nhắn cuối
                const { data: lastMessage } = await supabase
                    .from('messages')
                    .select(`
                        id,
                        content,
                        message_type,
                        file_url,
                        created_at,
                        sender_id,
                        sender:users(id, name, image)
                    `)
                    .eq('conversation_id', item.conversation_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single();

                // Lấy thông tin tất cả thành viên của conversation
                const { data: members } = await supabase
                    .from('conversation_members')
                    .select(`
                        user_id,
                        last_read_at,
                        is_admin,
                        user:users(id, name, image)
                    `)
                    .eq('conversation_id', item.conversation_id);

                return {
                    ...item.conversation,
                    conversation_members: members || [],
                    messages: lastMessage ? [lastMessage] : []
                };
            })
        );

        // Sắp xếp theo updated_at của conversation
        conversationsWithMessages.sort((a, b) =>
            new Date(b.updated_at) - new Date(a.updated_at)
        );

        return { success: true, data: conversationsWithMessages };
    } catch (error) {
        console.log('getConversations error:', error);
        return { success: false, msg: 'Không thể lấy danh sách cuộc trò chuyện' };
    }
};

export const getConversationById = async (conversationId) => {
    try {
        const { data, error } = await supabase
            .from('conversations')
            .select(`
                *,
                conversation_members(
                    user_id,
                    last_read_at,
                    is_admin,
                    user:users(id, name, image)
                )
            `)
            .eq('id', conversationId)
            .single();

        if (error) {
            console.log('getConversationById error:', error);
            return { success: false, msg: 'Không thể lấy thông tin cuộc trò chuyện' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('getConversationById error:', error);
        return { success: false, msg: 'Không thể lấy thông tin cuộc trò chuyện' };
    }
};

// ===== CONVERSATION MEMBERS =====
export const addMemberToConversation = async (conversationId, userId) => {
    try {
        const { data, error } = await supabase
            .from('conversation_members')
            .insert({
                conversation_id: conversationId,
                user_id: userId
            })
            .select()
            .single();

        if (error) {
            console.log('addMemberToConversation error:', error);
            return { success: false, msg: 'Không thể thêm thành viên' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('addMemberToConversation error:', error);
        return { success: false, msg: 'Không thể thêm thành viên' };
    }
};

export const removeMemberFromConversation = async (conversationId, userId) => {
    try {
        const { error } = await supabase
            .from('conversation_members')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (error) {
            console.log('removeMemberFromConversation error:', error);
            return { success: false, msg: 'Không thể xóa thành viên' };
        }

        return { success: true };
    } catch (error) {
        console.log('removeMemberFromConversation error:', error);
        return { success: false, msg: 'Không thể xóa thành viên' };
    }
};

// ===== MESSAGES =====
export const sendMessage = async (data) => {
    try {
        const { data: message, error } = await supabase
            .from('messages')
            .insert(data)
            .select(`
                *,
                sender:users(id, name, image)
            `)
            .single();

        if (error) {
            console.log('sendMessage error:', error);
            return { success: false, msg: 'Không thể gửi tin nhắn' };
        }

        // Cập nhật updated_at của conversation
        await supabase
            .from('conversations')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', data.conversation_id);

        return { success: true, data: message };
    } catch (error) {
        console.log('sendMessage error:', error);
        return { success: false, msg: 'Không thể gửi tin nhắn' };
    }
};

export const getMessages = async (conversationId, limit = 50, offset = 0) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:users(id, name, image),
                message_reads(
                    user_id,
                    read_at
                )
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.log('getMessages error:', error);
            return { success: false, msg: 'Không thể lấy tin nhắn' };
        }

        return { success: true, data: data.reverse() }; // Reverse để hiển thị từ cũ đến mới
    } catch (error) {
        console.log('getMessages error:', error);
        return { success: false, msg: 'Không thể lấy tin nhắn' };
    }
};

export const markMessageAsRead = async (messageId, userId) => {
    try {
        const { data, error } = await supabase
            .from('message_reads')
            .upsert({
                message_id: messageId,
                user_id: userId,
                read_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) {
            console.log('markMessageAsRead error:', error);
            return { success: false, msg: 'Không thể đánh dấu đã đọc' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('markMessageAsRead error:', error);
        return { success: false, msg: 'Không thể đánh dấu đã đọc' };
    }
};

export const markConversationAsRead = async (conversationId, userId) => {
    try {
        // Cập nhật last_read_at của user trong conversation
        const { error } = await supabase
            .from('conversation_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('conversation_id', conversationId)
            .eq('user_id', userId);

        if (error) {
            console.log('markConversationAsRead error:', error);
            return { success: false, msg: 'Không thể đánh dấu đã đọc' };
        }

        return { success: true };
    } catch (error) {
        console.log('markConversationAsRead error:', error);
        return { success: false, msg: 'Không thể đánh dấu đã đọc' };
    }
};

export const editMessage = async (messageId, content) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .update({
                content,
                is_edited: true,
                edited_at: new Date().toISOString()
            })
            .eq('id', messageId)
            .select()
            .single();

        if (error) {
            console.log('editMessage error:', error);
            return { success: false, msg: 'Không thể chỉnh sửa tin nhắn' };
        }

        return { success: true, data };
    } catch (error) {
        console.log('editMessage error:', error);
        return { success: false, msg: 'Không thể chỉnh sửa tin nhắn' };
    }
};

export const deleteMessage = async (messageId) => {
    try {
        const { error } = await supabase
            .from('messages')
            .delete()
            .eq('id', messageId);

        if (error) {
            console.log('deleteMessage error:', error);
            return { success: false, msg: 'Không thể xóa tin nhắn' };
        }

        return { success: true };
    } catch (error) {
        console.log('deleteMessage error:', error);
        return { success: false, msg: 'Không thể xóa tin nhắn' };
    }
};

export const deleteConversation = async (conversationId, userId) => {
    try {
        // Kiểm tra xem user có phải admin của nhóm không
        const { data: memberData, error: memberError } = await supabase
            .from('conversation_members')
            .select('is_admin, conversation:conversations(type)')
            .eq('conversation_id', conversationId)
            .eq('user_id', userId)
            .single();

        if (memberError) {
            console.log('deleteConversation memberError:', memberError);
            return { success: false, msg: 'Không thể xóa cuộc trò chuyện' };
        }

        // Chỉ admin mới có thể xóa nhóm, hoặc có thể xóa cuộc trò chuyện 1-1
        if (memberData.conversation.type === 'group' && !memberData.is_admin) {
            return { success: false, msg: 'Chỉ admin mới có thể xóa nhóm' };
        }

        // Xóa tất cả messages trong conversation
        const { error: messagesError } = await supabase
            .from('messages')
            .delete()
            .eq('conversation_id', conversationId);

        if (messagesError) {
            console.log('deleteMessages error:', messagesError);
            return { success: false, msg: 'Không thể xóa tin nhắn' };
        }

        // Xóa tất cả conversation_members
        const { error: membersError } = await supabase
            .from('conversation_members')
            .delete()
            .eq('conversation_id', conversationId);

        if (membersError) {
            console.log('deleteMembers error:', membersError);
            return { success: false, msg: 'Không thể xóa thành viên' };
        }

        // Xóa conversation
        const { error: conversationError } = await supabase
            .from('conversations')
            .delete()
            .eq('id', conversationId);

        if (conversationError) {
            console.log('deleteConversation error:', conversationError);
            return { success: false, msg: 'Không thể xóa cuộc trò chuyện' };
        }

        return { success: true, msg: 'Đã xóa cuộc trò chuyện thành công' };
    } catch (error) {
        console.log('deleteConversation error:', error);
        return { success: false, msg: 'Không thể xóa cuộc trò chuyện' };
    }
};

// ===== UTILITY FUNCTIONS =====
export const createDirectConversation = async (userId1, userId2) => {
    try {
        // Kiểm tra xem đã có conversation giữa 2 user chưa
        const { data: existingConversation, error: checkError } = await supabase
            .from('conversations')
            .select(`
                id,
                conversation_members!inner(user_id)
            `)
            .eq('type', 'direct')
            .eq('conversation_members.user_id', userId1);

        if (checkError) {
            console.log('checkExistingConversation error:', checkError);
        }

        // Nếu đã có conversation, trả về
        if (existingConversation && existingConversation.length > 0) {
            for (const conv of existingConversation) {
                const { data: members } = await supabase
                    .from('conversation_members')
                    .select('user_id')
                    .eq('conversation_id', conv.id);

                if (members && members.length === 2 &&
                    members.some(m => m.user_id === userId1) &&
                    members.some(m => m.user_id === userId2)) {
                    return { success: true, data: { id: conv.id } };
                }
            }
        }

        // Tạo conversation mới
        const { data: conversation, error: createError } = await supabase
            .from('conversations')
            .insert({
                type: 'direct',
                created_by: userId1
            })
            .select()
            .single();

        if (createError) {
            console.log('createDirectConversation error:', createError);
            return { success: false, msg: 'Không thể tạo cuộc trò chuyện' };
        }

        // Thêm 2 user vào conversation
        await supabase
            .from('conversation_members')
            .insert([
                { conversation_id: conversation.id, user_id: userId1 },
                { conversation_id: conversation.id, user_id: userId2 }
            ]);

        return { success: true, data: conversation };
    } catch (error) {
        console.log('createDirectConversation error:', error);
        return { success: false, msg: 'Không thể tạo cuộc trò chuyện' };
    }
};

export const createGroupConversation = async (name, createdBy, memberIds) => {
    try {
        // Tạo conversation
        const { data: conversation, error: createError } = await supabase
            .from('conversations')
            .insert({
                name,
                type: 'group',
                created_by: createdBy
            })
            .select()
            .single();

        if (createError) {
            console.log('createGroupConversation error:', createError);
            return { success: false, msg: 'Không thể tạo nhóm' };
        }

        // Thêm các thành viên (bao gồm cả người tạo nhóm)
        const allMemberIds = [createdBy, ...memberIds];
        const members = allMemberIds.map(userId => ({
            conversation_id: conversation.id,
            user_id: userId,
            is_admin: userId === createdBy
        }));

        const { error: addMembersError } = await supabase
            .from('conversation_members')
            .insert(members);

        if (addMembersError) {
            console.log('addMembersError:', addMembersError);
            return { success: false, msg: 'Không thể thêm thành viên' };
        }

        return { success: true, data: conversation };
    } catch (error) {
        console.log('createGroupConversation error:', error);
        return { success: false, msg: 'Không thể tạo nhóm' };
    }
};

