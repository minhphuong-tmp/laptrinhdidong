import { supabase } from "../lib/supabase";

// ===== MEDIA UPLOAD =====
export const uploadMediaFile = async (file, type = 'image') => {
    const uploadMetrics = {
        startTime: Date.now(),
        fileSize: file.fileSize || 0,
        type: type,
        steps: {}
    };

    try {
        // Tạo tên file unique
        const fileExt = file.uri.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
        const folderName = type === 'image' ? 'images' : 'videos';
        const filePath = `${folderName}/${fileName}`;

        // Upload file bằng Supabase client (theo cách imageService.js)

        // Đọc file thành base64 (theo cách imageService.js)
        const FileSystem = require('expo-file-system');
        const { decode } = require('base64-arraybuffer');

        // === METRICS: Đo thời gian đọc file ===
        const readStartTime = Date.now();
        const fileBase64 = await FileSystem.readAsStringAsync(file.uri, {
            encoding: FileSystem.EncodingType.Base64,
        });
        uploadMetrics.steps.readFileTime = Date.now() - readStartTime;
        uploadMetrics.steps.base64Size = fileBase64.length;

        // === METRICS: Đo thời gian decode ===
        const decodeStartTime = Date.now();
        const fileData = decode(fileBase64); // array buffer
        uploadMetrics.steps.decodeTime = Date.now() - decodeStartTime;
        uploadMetrics.steps.arrayBufferSize = fileData.byteLength;
        uploadMetrics.memoryOverhead = fileData.byteLength - uploadMetrics.fileSize;

        console.log('📊 [Upload Metrics] Starting upload for:', type);
        console.log('📊 [Upload Metrics] Original file size:', (uploadMetrics.fileSize / 1024 / 1024).toFixed(2), 'MB');
        console.log('📊 [Upload Metrics] Base64 size:', (uploadMetrics.steps.base64Size / 1024 / 1024).toFixed(2), 'MB');
        console.log('📊 [Upload Metrics] ArrayBuffer size:', (uploadMetrics.steps.arrayBufferSize / 1024 / 1024).toFixed(2), 'MB');
        console.log('📊 [Upload Metrics] Memory overhead:', (uploadMetrics.memoryOverhead / 1024 / 1024).toFixed(2), 'MB');
        console.log('📊 [Upload Metrics] Read file time:', uploadMetrics.steps.readFileTime, 'ms');
        console.log('📊 [Upload Metrics] Decode time:', uploadMetrics.steps.decodeTime, 'ms');

        // === METRICS: Đo thời gian upload ===
        const uploadStartTime = Date.now();
        const { data, error } = await supabase.storage
            .from('media')
            .upload(filePath, fileData, {
                cacheControl: '3600',
                upsert: false,
                contentType: type === 'image' ? 'image/*' : 'video/*'
            });
        uploadMetrics.steps.uploadTime = Date.now() - uploadStartTime;

        if (error) {
            console.log('Upload error:', error);
            uploadMetrics.endTime = Date.now();
            uploadMetrics.totalTime = uploadMetrics.endTime - uploadMetrics.startTime;
            console.log('📊 [Upload Metrics] Total failed time:', uploadMetrics.totalTime, 'ms');
            return { success: false, msg: `Upload failed: ${error.message}`, metrics: uploadMetrics };
        }

        // Lấy public URL
        const { data: urlData } = supabase.storage
            .from('media')
            .getPublicUrl(filePath);

        const publicUrl = urlData.publicUrl;

        uploadMetrics.endTime = Date.now();
        uploadMetrics.totalTime = uploadMetrics.endTime - uploadMetrics.startTime;
        uploadMetrics.uploadSpeed = uploadMetrics.steps.arrayBufferSize / (uploadMetrics.steps.uploadTime / 1000); // bytes/second

        console.log('📊 [Upload Metrics] Upload time:', uploadMetrics.steps.uploadTime, 'ms');
        console.log('📊 [Upload Metrics] Upload speed:', (uploadMetrics.uploadSpeed / 1024 / 1024).toFixed(2), 'MB/s');
        console.log('📊 [Upload Metrics] Total time:', uploadMetrics.totalTime, 'ms');
        console.log('=========== KẾT THÚC ĐO METRICS UPLOAD ===========');

        return {
            success: true,
            data: {
                file_url: publicUrl,
                file_path: filePath,
                file_name: fileName,
                file_size: file.fileSize || 0,
                mime_type: file.mimeType || (type === 'image' ? 'image/jpeg' : 'video/mp4')
            },
            metrics: uploadMetrics
        };
    } catch (error) {
        console.log('Upload media error:', error);
        uploadMetrics.endTime = Date.now();
        uploadMetrics.totalTime = uploadMetrics.endTime - uploadMetrics.startTime;
        uploadMetrics.error = error.message;
        console.log('📊 [Upload Metrics] Error - Total time:', uploadMetrics.totalTime, 'ms');
        return { success: false, msg: 'Không thể upload file', metrics: uploadMetrics };
    }
};

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

export const getConversations = async (userId, options = {}) => {
    const { logMetrics = true } = options; // Default: log metrics
    const metrics = {
        startTime: Date.now(),
        steps: {},
        queries: {
            initial: 0,
            lastMessages: 0,
            allMessages: 0,
            members: 0,
            total: 0
        },
        data: {
            conversationsCount: 0,
            totalMessagesLoaded: 0,
            totalMembersLoaded: 0,
            dataTransfer: {
                initialQuery: 0,      // bytes
                lastMessages: 0,      // bytes
                allMessages: 0,       // bytes
                members: 0,           // bytes
                total: 0              // bytes
            }
        }
    };

    try {
        // === BƯỚC 1: Query conversation_members ban đầu ===
        const step1Start = Date.now();
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
        metrics.steps.initialQuery = Date.now() - step1Start;
        metrics.queries.initial = 1;

        if (error) {
            console.log('getConversations error:', error);
            return { success: false, msg: 'Không thể lấy danh sách cuộc trò chuyện', metrics };
        }

        metrics.data.conversationsCount = data.length;
        // Estimate: mỗi conversation member ~200 bytes, với nested conversation ~300 bytes
        metrics.data.dataTransfer.initialQuery = JSON.stringify(data).length;

        // === BƯỚC 2: Promise.all cho tất cả conversations ===
        const step2Start = Date.now();
        const conversationsWithMessages = await Promise.all(
            data.map(async (item) => {
                const convMetrics = {
                    lastMessageTime: 0,
                    allMessagesTime: 0,
                    membersTime: 0,
                    messagesCount: 0
                };

                // === Lấy tin nhắn cuối ===
                const lastMsgStart = Date.now();
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
                convMetrics.lastMessageTime = Date.now() - lastMsgStart;
                metrics.queries.lastMessages++;
                // Estimate: mỗi lastMessage với sender info ~250 bytes
                if (lastMessage) {
                    metrics.data.dataTransfer.lastMessages += JSON.stringify(lastMessage).length;
                }

                // === ĐẾM unread messages bằng SQL COUNT (tối ưu) ===
                const allMsgStart = Date.now();
                const lastReadAt = item.last_read_at || new Date(0).toISOString();
                const { count: unreadCount, error: countError } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true }) // Chỉ COUNT, không load data
                    .eq('conversation_id', item.conversation_id)
                    .gt('created_at', lastReadAt)
                    .neq('sender_id', userId);
                convMetrics.allMessagesTime = Date.now() - allMsgStart;
                convMetrics.messagesCount = 0; // Không load messages nữa
                convMetrics.unreadCount = unreadCount || 0;
                metrics.queries.allMessages++;
                // Data transfer: chỉ 4 bytes (1 số int) thay vì hàng trăm KB
                metrics.data.dataTransfer.allMessages += 4; // Ước tính 4 bytes cho count
                if (countError) {
                    console.log('Count unread error for conversation', item.conversation_id, ':', countError);
                }

                // === Lấy thông tin thành viên ===
                const membersStart = Date.now();
                const { data: members } = await supabase
                    .from('conversation_members')
                    .select(`
                        user_id,
                        last_read_at,
                        is_admin,
                        user:users(id, name, image)
                    `)
                    .eq('conversation_id', item.conversation_id);
                convMetrics.membersTime = Date.now() - membersStart;
                metrics.queries.members++;
                metrics.data.totalMembersLoaded += members?.length || 0;
                // Estimate: mỗi member với user info ~150 bytes
                if (members) {
                    metrics.data.dataTransfer.members += JSON.stringify(members).length;
                }

                return {
                    ...item.conversation,
                    conversation_members: members || [],
                    unreadCount: convMetrics.unreadCount, // Thêm unreadCount từ COUNT query
                    lastMessage: lastMessage,
                    _metrics: convMetrics // Lưu metrics của từng conversation
                };
            })
        );
        metrics.steps.promiseAll = Date.now() - step2Start;

        // Tính tổng thời gian từng loại query
        const lastMsgTimes = conversationsWithMessages.map(c => c._metrics?.lastMessageTime || 0);
        const countUnreadTimes = conversationsWithMessages.map(c => c._metrics?.allMessagesTime || 0); // Giờ là COUNT query
        const membersTimes = conversationsWithMessages.map(c => c._metrics?.membersTime || 0);

        metrics.steps.avgLastMessageTime = lastMsgTimes.length > 0
            ? Math.round(lastMsgTimes.reduce((a, b) => a + b, 0) / lastMsgTimes.length)
            : 0;
        metrics.steps.avgAllMessagesTime = countUnreadTimes.length > 0
            ? Math.round(countUnreadTimes.reduce((a, b) => a + b, 0) / countUnreadTimes.length)
            : 0;
        metrics.steps.avgMembersTime = membersTimes.length > 0
            ? Math.round(membersTimes.reduce((a, b) => a + b, 0) / membersTimes.length)
            : 0;
        metrics.steps.maxAllMessagesTime = Math.max(...countUnreadTimes, 0);

        // === BƯỚC 3: Sắp xếp ===
        const step3Start = Date.now();
        conversationsWithMessages.sort((a, b) =>
            new Date(b.updated_at) - new Date(a.updated_at)
        );
        metrics.steps.sortTime = Date.now() - step3Start;

        // Remove _metrics trước khi return
        const cleanData = conversationsWithMessages.map(({ _metrics, ...rest }) => rest);

        metrics.queries.total = metrics.queries.initial + metrics.queries.lastMessages +
            metrics.queries.allMessages + metrics.queries.members;
        metrics.totalTime = Date.now() - metrics.startTime;

        // Tính tổng data transfer
        metrics.data.dataTransfer.total =
            metrics.data.dataTransfer.initialQuery +
            metrics.data.dataTransfer.lastMessages +
            metrics.data.dataTransfer.allMessages +
            metrics.data.dataTransfer.members;

        // Log metrics quan trọng để so sánh (chỉ log khi được yêu cầu)
        if (logMetrics) {
            console.log('=========== METRICS GET CONVERSATIONS (SQL COUNT OPTIMIZED) ===========');
            console.log('⏱️ Tổng thời gian:', metrics.totalTime, 'ms');
            console.log('⏱️ Promise.all (load conversations):', metrics.steps.promiseAll, 'ms');
            console.log('⏱️ Trung bình query COUNT unread:', metrics.steps.avgAllMessagesTime, 'ms', '← ĐÃ TỐI ƯU!');
            console.log('📊 Tổng số queries:', metrics.queries.total);
            console.log('📊 Messages đã load:', metrics.data.totalMessagesLoaded, 'messages (KHÔNG load allMessages nữa!)');
            console.log('📊 Data transfer:');
            console.log('   └─ Initial query:', (metrics.data.dataTransfer.initialQuery / 1024).toFixed(2), 'KB');
            console.log('   └─ LastMessages:', (metrics.data.dataTransfer.lastMessages / 1024).toFixed(2), 'KB');
            console.log('   └─ COUNT unread:', (metrics.data.dataTransfer.allMessages / 1024).toFixed(2), 'KB', '← GIẢM ĐÁNG KỂ!');
            console.log('   └─ Members:', (metrics.data.dataTransfer.members / 1024).toFixed(2), 'KB');
            console.log('   └─ Tổng:', (metrics.data.dataTransfer.total / 1024).toFixed(2), 'KB');
            console.log('=========== KẾT THÚC METRICS ===========');
        }

        return {
            success: true,
            data: cleanData,
            metrics
        };
    } catch (error) {
        console.log('getConversations error:', error);
        metrics.totalTime = Date.now() - metrics.startTime;
        metrics.error = error.message;
        return { success: false, msg: 'Không thể lấy danh sách cuộc trò chuyện', metrics };
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
