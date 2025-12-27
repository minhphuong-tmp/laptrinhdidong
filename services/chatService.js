import { supabase } from "../lib/supabase";
import deviceService from "./deviceService";
import encryptionService from "./encryptionService";

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
        const FileSystem = require('expo-file-system/legacy');
        const { decode } = require('base64-arraybuffer');

        // === METRICS: Đo thời gian đọc file ===
        const readStartTime = Date.now();
        const fileBase64 = await FileSystem.readAsStringAsync(file.uri, {
            encoding: 'base64',
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
                // FIX E2EE: Luôn ưu tiên sender_copy để getLastMessageContent có thể decrypt đúng
                // Không ưu tiên receiver message vì khi ở thiết bị khác, receiver message là plaintext (không đúng)
                const lastMsgStart = Date.now();

                // Lấy message mới nhất - đơn giản: lấy message mới nhất bất kể sender_copy hay receiver
                // getLastMessageContent sẽ xử lý decrypt đúng cách
                const { data: latestMessage, error: msgError } = await supabase
                    .from('messages')
                    .select(`
                        id,
                        content,
                        message_type,
                        file_url,
                        created_at,
                        sender_id,
                        is_encrypted,
                        is_sender_copy,
                        sender_device_id,
                        encrypted_aes_key_by_pin,
                        sender:users(id, name, image)
                    `)
                    .eq('conversation_id', item.conversation_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(); // Dùng maybeSingle để tránh lỗi khi không có message

                const lastMessage = latestMessage || null;

                if (msgError && msgError.code !== 'PGRST116') { // PGRST116 = no rows returned
                    console.log('Error fetching last message:', msgError);
                }
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

        // Silence metrics logs to keep output minimal for Chat List; metrics are still returned

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

// Lấy chỉ conversations mới (sau một timestamp cụ thể)
export const getNewConversations = async (userId, sinceTimestamp, excludeIds = []) => {
    try {
        // Query tất cả conversation_members của user
        const { data: allMembers, error: membersError } = await supabase
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

        if (membersError) {
            console.error('Error fetching conversation members:', membersError);
            throw membersError;
        }

        if (!allMembers || allMembers.length === 0) {
            return [];
        }

        // Filter conversations có updated_at > sinceTimestamp
        const conversationMembers = allMembers.filter(item => {
            if (!item.conversation || !item.conversation.updated_at) return false;
            return new Date(item.conversation.updated_at).getTime() > new Date(sinceTimestamp).getTime();
        });

        if (!conversationMembers || conversationMembers.length === 0) {
            return [];
        }

        // Filter: loại bỏ các IDs đã có trong cache
        let filteredMembers = conversationMembers;
        if (excludeIds.length > 0) {
            filteredMembers = conversationMembers.filter(
                item => !excludeIds.includes(item.conversation_id)
            );
        }

        if (filteredMembers.length === 0) {
            return [];
        }

        // Load đầy đủ thông tin cho conversations mới (tương tự getConversations)
        const conversationsWithMessages = await Promise.all(
            filteredMembers.map(async (item) => {
                // Lấy tin nhắn cuối - đơn giản: lấy message mới nhất bất kể sender_copy hay receiver
                // getLastMessageContent sẽ xử lý decrypt đúng cách
                const { data: latestMessage, error: msgError } = await supabase
                    .from('messages')
                    .select(`
                        id,
                        content,
                        message_type,
                        file_url,
                        created_at,
                        sender_id,
                        is_encrypted,
                        is_sender_copy,
                        sender_device_id,
                        encrypted_aes_key,
                        encrypted_aes_key_by_pin,
                        sender:users(id, name, image)
                    `)
                    .eq('conversation_id', item.conversation_id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(); // Dùng maybeSingle để tránh lỗi khi không có message

                const lastMessage = latestMessage || null;

                if (msgError && msgError.code !== 'PGRST116') { // PGRST116 = no rows returned
                    console.log('Error fetching last message:', msgError);
                }

                // Đếm unread messages
                const lastReadAt = item.last_read_at || new Date(0).toISOString();
                const { count: unreadCount } = await supabase
                    .from('messages')
                    .select('*', { count: 'exact', head: true })
                    .eq('conversation_id', item.conversation_id)
                    .gt('created_at', lastReadAt)
                    .neq('sender_id', userId);

                // Lấy thông tin thành viên
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
                    unreadCount: unreadCount || 0,
                    lastMessage: lastMessage
                };
            })
        );

        // Sắp xếp theo updated_at
        conversationsWithMessages.sort((a, b) =>
            new Date(b.updated_at) - new Date(a.updated_at)
        );

        return conversationsWithMessages;
    } catch (error) {
        console.error('Error in getNewConversations:', error);
        throw error;
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

// ===== HELPER FUNCTIONS =====
/**
 * Kiểm tra message có thực sự encrypted hay không - CHỈ dựa vào METADATA, KHÔNG dựa vào format content
 * @deprecated Use isMessageActuallyEncrypted from utils/messageValidation.js instead
 */
const isMessageEncrypted = (msg) => {
    if (!msg) return false;

    // Siết chặt điều kiện: Flag true PHẢI có key hợp lệ
    if (msg.is_encrypted === true) {
        // Kiểm tra key hợp lệ (không phải string rỗng, không phải object rỗng)
        const hasValidKey =
            (typeof msg.encrypted_aes_key === 'string' && msg.encrypted_aes_key.length > 0) ||
            (typeof msg.encrypted_aes_key_by_pin === 'string' && msg.encrypted_aes_key_by_pin.length > 0) ||
            (msg.encrypted_key_by_device && typeof msg.encrypted_key_by_device === 'object' && Object.keys(msg.encrypted_key_by_device).length > 0);

        if (hasValidKey) {
            return true;
        } else {
            // Flag true nhưng không có key hợp lệ → self-heal thành plaintext
            console.warn('[E2EE Debug] Message có is_encrypted=true nhưng không có key hợp lệ:', {
                id: msg.id,
                is_encrypted: msg.is_encrypted,
                encrypted_aes_key: msg.encrypted_aes_key,
                encrypted_aes_key_by_pin: msg.encrypted_aes_key_by_pin,
                encrypted_key_by_device: msg.encrypted_key_by_device,
                message_type: msg.message_type,
                is_sender_copy: msg.is_sender_copy
            });
            msg.is_encrypted = false;
            return false;
        }
    }

    // Fallback cho legacy / multi-device E2EE - chỉ nếu có key hợp lệ
    const hasValidKey =
        (typeof msg.encrypted_aes_key === 'string' && msg.encrypted_aes_key.length > 0) ||
        (typeof msg.encrypted_aes_key_by_pin === 'string' && msg.encrypted_aes_key_by_pin.length > 0) ||
        (msg.encrypted_key_by_device && typeof msg.encrypted_key_by_device === 'object' && Object.keys(msg.encrypted_key_by_device).length > 0);

    if (hasValidKey) {
        return true;
    }

    return false;
};

// ===== MESSAGES =====
export const sendMessage = async (data) => {
    try {
        // Kiểm tra conversation type
        const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .select('type')
            .eq('id', data.conversation_id)
            .single();

        if (convError) {
            console.log('sendMessage convError:', convError);
            return { success: false, msg: 'Không thể lấy thông tin cuộc trò chuyện' };
        }

        // Chỉ áp dụng E2EE cho direct chat và text message
        if (conversation?.type === 'direct' && data.message_type === 'text') {
            try {
                // ===== NEW ARCHITECTURE: Encrypt với encryptedForReceiver và encryptedForSync =====
                const pinService = require('./pinService').default;
                const localMessagePlaintextService = require('../utils/localMessagePlaintextService').default;

                // 1. Lấy receiver ID từ conversation
                const { data: members, error: membersError } = await supabase
                    .from('conversation_members')
                    .select('user_id')
                    .eq('conversation_id', data.conversation_id);

                if (membersError || !members || members.length !== 2) {
                    throw new Error('Cannot get conversation members');
                }

                const receiverId = members.find(m => m.user_id !== data.sender_id)?.user_id;
                if (!receiverId) {
                    throw new Error('Cannot find receiver ID');
                }

                // 2. Tự động fetch PIN từ database (không cần unlock)
                const pinData = await pinService.fetchPinFromDatabase(data.sender_id);
                if (!pinData || !pinData.pin || !pinData.pinSalt) {
                    return { 
                        success: false, 
                        requiresPinSetup: true,
                        msg: 'Vui lòng thiết lập PIN để gửi tin nhắn mã hóa' 
                    };
                }

                // 3. Tạo master key từ PIN + salt (cho sync)
                const masterKey = await pinService.deriveUnlockKey(pinData.pin, pinData.pinSalt);
                if (!masterKey || masterKey.length !== 32) {
                    throw new Error('Failed to derive master key');
                }

                // 4. Lấy TẤT CẢ devices hợp lệ của receiver để encrypt cho mỗi device
                const deviceService = require('./deviceService').default;
                const validRecipientDevices = await deviceService.getValidRecipientDevices(receiverId);
                
                if (!validRecipientDevices || validRecipientDevices.length === 0) {
                    console.error('[sendMessage] Receiver has no valid devices. Receiver ID:', receiverId);
                    throw new Error('Receiver chưa có key pair. Vui lòng yêu cầu receiver đăng nhập lại để tạo key pair.');
                }

                // 5. Mã hóa cho receiver với TẤT CẢ devices (mỗi device có encrypted_key riêng)
                const encryptedForReceiver = await encryptionService.encryptForReceiver(
                    data.content,
                    validRecipientDevices.map(device => ({
                        device_id: device.device_id,
                        public_key: device.public_key
                    }))
                );

                // 6. Mã hóa cho sync (PIN-based)
                const encryptedForSync = await encryptionService.encryptForSync(
                    data.content,
                    masterKey
                );

                // Xóa content (plaintext) trước khi insert để không lưu vào DB
                const { content, ...dataWithoutContent } = data;
                
                const { data: message, error: messageError } = await supabase
                    .from('messages')
                    .insert({
                        ...dataWithoutContent,
                        content: null, // Không lưu plaintext vào DB
                        encrypted_for_receiver: encryptedForReceiver,
                        encrypted_for_sync: encryptedForSync,
                        is_encrypted: true,
                        encryption_algorithm: 'AES-256-GCM',
                    })
                    .select(`
                        *,
                        sender:users(id, name, image)
                    `)
                    .single();

                if (messageError) {
                    console.error('sendMessage error:', messageError);
                    return { success: false, msg: 'Không thể gửi tin nhắn' };
                }

                // 7. Lưu plaintext vào localStorage với metadata
                await localMessagePlaintextService.saveMessagePlaintext(message.id, data.content, {
                    conversation_id: data.conversation_id,
                    sender_id: data.sender_id,
                    created_at: message.created_at,
                    message_type: data.message_type || 'text',
                    is_encrypted: true
                });

                // 8. Cập nhật updated_at của conversation
                await supabase
                    .from('conversations')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', data.conversation_id);

                return { success: true, data: message };
            } catch (encryptError) {
                console.error('Error encrypting message:', encryptError);
                // Nếu mã hóa lỗi, gửi plaintext như bình thường (fallback)
                console.warn('Sending message as plaintext due to encryption error.');
            }
        }

        // Nếu không phải direct chat hoặc không phải text message → gửi như bình thường (1 message)
        const { data: message, error } = await supabase
            .from('messages')
            .insert({
                ...data,
                is_encrypted: false,
            })
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

export const getMessages = async (conversationId, userId, limit = 50, offset = 0, includeSentMessages = false) => {
    try {
        // Lấy device ID hiện tại
        const deviceId = await deviceService.getOrCreateDeviceId();

        // NEW ARCHITECTURE: 
        // - Nếu includeSentMessages = false: Chỉ query tin nhắn NHẬN được (sender_id !== userId)
        // - Nếu includeSentMessages = true: Query CẢ tin nhắn đã gửi và nhận được (để decrypt với PIN)
        let query = supabase
            .from('messages')
            .select(`
                *,
                sender:users(id, name, image),
                message_reads(
                    user_id,
                    read_at
                )
            `)
            .eq('conversation_id', conversationId);
        
        if (!includeSentMessages) {
            // Chỉ lấy tin nhắn nhận được
            query = query.neq('sender_id', userId);
        }
        // Nếu includeSentMessages = true → lấy tất cả (không filter sender_id)
        
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        // Include encrypted_aes_key_by_pin và encryption_version trong select
        // (Đã có trong * nhưng đảm bảo rõ ràng)

        if (error) {
            console.log('getMessages error:', error);
            return { success: false, msg: 'Không thể lấy tin nhắn' };
        }

        // Kiểm tra conversation type
        const { data: conversation } = await supabase
            .from('conversations')
            .select('type')
            .eq('id', conversationId)
            .single();

        // Trả về messages từ DB, không xử lý gì thêm (decrypt sẽ được thực hiện trong UI)
        return { success: true, data: data.reverse() }; // Reverse để hiển thị từ cũ đến mới
    } catch (error) {
        console.log('getMessages error:', error);
        return { success: false, msg: 'Không thể lấy tin nhắn' };
    }
};

// Lấy chỉ messages mới (sau một timestamp cụ thể)
export const getNewMessages = async (conversationId, userId, sinceTimestamp, excludeIds = []) => {
    try {
        // Lấy device ID hiện tại
        const deviceId = await deviceService.getOrCreateDeviceId();

        // NEW ARCHITECTURE: Chỉ query tin nhắn NHẬN được (sender_id !== userId)
        // Tin nhắn đã gửi sẽ được lấy từ localStorage, không query từ DB
        const { data: messages, error } = await supabase
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
            .gt('created_at', sinceTimestamp)
            .neq('sender_id', userId) // CHỈ lấy tin nhắn nhận được
            .order('created_at', { ascending: false });

        // Include encrypted_aes_key_by_pin và encryption_version trong select
        // (Đã có trong * nhưng đảm bảo rõ ràng)

        if (error) {
            console.error('Error fetching new messages:', error);
            throw error;
        }

        // Filter: loại bỏ các IDs đã có trong cache
        let filteredMessages = messages;
        if (messages && messages.length > 0 && excludeIds.length > 0) {
            filteredMessages = messages.filter(m => !excludeIds.includes(m.id));
        }

        if (!filteredMessages || filteredMessages.length === 0) {
            return [];
        }

        // Trả về messages từ DB, không xử lý gì thêm (decrypt sẽ được thực hiện trong UI)
        // Reverse để hiển thị từ cũ đến mới
        return filteredMessages.reverse();
    } catch (error) {
        console.error('Error in getNewMessages:', error);
        throw error;
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