import { useFocusEffect, useRouter } from 'expo-router';
import moment from 'moment';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../../assets/icons';
import Avatar from '../../components/Avatar';
import GroupAvatar from '../../components/GroupAvatar';
import Loading from '../../components/Loading';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import { deleteConversation, getConversations } from '../../services/chatService';
import encryptionService from '../../services/encryptionService';
import pinService from '../../services/pinService';
import { loadFromCache } from '../../utils/cacheHelper';
import performanceMetrics from '../../utils/performanceMetrics';

const ChatList = () => {
    const { user } = useAuth();
    const router = useRouter();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [decryptedMessages, setDecryptedMessages] = useState({}); // Cache decrypted messages
    // State quản lý PIN: track xem user đã nhập PIN chưa để hiển thị last message đúng
    const [isPinEntered, setIsPinEntered] = useState(false);
    const subscriptionRef = useRef(null);
    const loadTimeRef = useRef(null);
    const logHasRun = useRef(false);
    const metricsLogged = useRef(false); // Flag riêng để track đã log metrics chưa
    const isLoadingRef = useRef(false); // Flag để tránh load trùng

    // Sync PIN state với pinService - check khi mount và khi app state thay đổi
    useEffect(() => {
        const checkPinStatus = () => {
            const isUnlocked = pinService.isUnlocked();
            setIsPinEntered(isUnlocked);
        };

        // Check ngay khi mount
        checkPinStatus();

        // Listen app state changes để sync PIN khi user nhập PIN ở màn hình khác
        const subscription = AppState.addEventListener('change', (nextAppState) => {
            if (nextAppState === 'active') {
                checkPinStatus();
            }
        });

        return () => {
            subscription?.remove();
        };
    }, []);

    // Listen focus để check PIN status khi quay lại màn hình này
    useFocusEffect(
        useCallback(() => {
            const isUnlocked = pinService.isUnlocked();
            setIsPinEntered(isUnlocked);
        }, [])
    );

    useEffect(() => {
        // useEffect luôn load lần đầu tiên
        if (!loadTimeRef.current && user?.id) {
            isLoadingRef.current = true;
            loadTimeRef.current = Date.now();
            logHasRun.current = false;
            metricsLogged.current = false;
            performanceMetrics.reset();
            performanceMetrics.trackRender('ChatList-Mount');

            // === CACHE FIRST: Load từ cache chung (prefetch) ngay, show UI tức thì ===
            const cacheStartTime = Date.now();
            loadFromCache(`conversations_cache_${user.id}`).then(async (cached) => {
                if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
                    const dataSize = JSON.stringify(cached.data).length;
                    const dataSizeKB = (dataSize / 1024).toFixed(2);
                    const loadTime = Date.now() - cacheStartTime;
                    console.log('Load dữ liệu từ cache: chatList');
                    // Đếm tổng số messages từ tất cả conversations
                    let totalMessagesCount = 0;
                    if (cached.data.length > 0) {
                        try {
                            const { supabase } = require('../../lib/supabase');
                            // Đếm tổng số messages từ tất cả conversations
                            const conversationIds = cached.data.map(c => c.id);
                            if (conversationIds.length > 0) {
                                const { count } = await supabase
                                    .from('messages')
                                    .select('*', { count: 'exact', head: true })
                                    .in('conversation_id', conversationIds);
                                totalMessagesCount = count || 0;
                            }
                        } catch (e) {

                        }
                    }

                    console.log(`- Dữ liệu đã load: ${cached.data.length} conversations và ${totalMessagesCount} messages`);
                    console.log(`- Tổng thời gian load: ${loadTime} ms`);
                    setConversations(cached.data);
                    setLoading(false);


                    // Fetch chỉ conversations mới (sau updated_at của cache)
                    try {
                        const { getNewConversations } = require('../../services/chatService');
                        const latestConversationTime = cached.data[0].updated_at;
                        const cacheIds = cached.data.map(c => c.id);
                        const newConversations = await getNewConversations(user.id, latestConversationTime, cacheIds);
                        const newCount = newConversations ? newConversations.length : 0;
                        console.log(`Load từ CSDL: ${newCount} conversations`);

                        // Load tin nhắn mới từ CSDL cho conversation cuối cùng (nếu có)
                        if (cached.data.length > 0) {
                            try {
                                const { getNewMessages } = require('../../services/chatService');
                                const lastConversation = cached.data[0];
                                // Lấy created_at của tin nhắn cuối cùng trong cache (nếu có)
                                // Nếu không có lastMessage trong cache, lấy updated_at của conversation
                                const lastMessageTime = lastConversation.lastMessage?.created_at || lastConversation.updated_at;

                                // Chỉ load nếu có timestamp hợp lệ
                                if (lastMessageTime) {
                                    // Load tin nhắn mới từ CSDL
                                    const newMessages = await getNewMessages(lastConversation.id, user.id, lastMessageTime, []);
                                    const newMessagesCount = newMessages ? newMessages.length : 0;

                                    // Luôn log số lượng tin nhắn từ CSDL (kể cả 0)
                                    console.log(`Load tin nhắn từ CSDL: ${newMessagesCount} messages`);

                                    if (newMessagesCount > 0) {
                                        // Cập nhật lastMessage cho conversation cuối cùng
                                        if (newMessages.length > 0) {
                                            const latestNewMessage = newMessages[newMessages.length - 1]; // Message cuối cùng là mới nhất
                                            const updatedConversations = cached.data.map(conv => {
                                                if (conv.id === lastConversation.id) {
                                                    return {
                                                        ...conv,
                                                        lastMessage: latestNewMessage,
                                                        updated_at: latestNewMessage.created_at
                                                    };
                                                }
                                                return conv;
                                            });
                                            setConversations(updatedConversations);
                                        }
                                    }
                                }
                            } catch (error) {
                                // Silent
                            }
                        }

                        if (newConversations && newConversations.length > 0) {
                            // Filter: không có trong cache VÀ có updated_at > cache latest time
                            const existingIds = new Set(cached.data.map(c => c.id));
                            const uniqueNewConversations = newConversations.filter(c => {
                                const cTime = new Date(c.updated_at).getTime();
                                const cacheLatestTime = new Date(latestConversationTime).getTime();
                                return !existingIds.has(c.id) && cTime > cacheLatestTime;
                            });

                            if (uniqueNewConversations.length > 0) {
                                const totalCount = uniqueNewConversations.length + cached.data.length;
                                console.log(`Cache: ${cached.data.length} conversations`);
                                console.log(`Tổng dữ liệu: ${totalCount} conversations`);

                                // Gộp conversations mới với cache cũ để hiển thị (KHÔNG update cache)
                                const mergedData = [...uniqueNewConversations, ...cached.data].sort((a, b) =>
                                    new Date(b.updated_at) - new Date(a.updated_at)
                                );
                                setConversations(mergedData);
                            } else {
                                console.log(`Tổng dữ liệu: ${cached.data.length} conversations`);
                            }
                        } else {
                            console.log(`Tổng dữ liệu: ${cached.data.length} conversations`);
                        }
                    } catch (error) {
                        console.error('[ChatList] Lỗi khi fetch conversations mới:', error);
                        console.log(`Load từ CSDL: 0 conversations`);
                        console.log(`Tổng dữ liệu: ${cached.data.length} conversations`);
                    }
                } else {
                    // Không có cache, giữ loading = true để show loading screen
                    console.log('Load dữ liệu từ CSDL: chatList');
                    // Load toàn bộ từ CSDL
                    loadConversations().finally(() => {
                        isLoadingRef.current = false;
                    });
                }
            });
        }
    }, [user?.id]);

    // Refresh khi quay lại màn hình chat list
    useFocusEffect(
        useCallback(() => {
            // CHỈ reload im lặng nếu đã có loadTimeRef (đã load từ useEffect)
            // KHÔNG load mới nếu chưa có loadTimeRef (để useEffect load)
            if (loadTimeRef.current && !isLoadingRef.current) {
                // Đã load rồi, chỉ reload conversations mới (tương tự như notification)
                const refreshConversations = async () => {
                    try {
                        const { loadFromCache } = require('../../utils/cacheHelper');
                        const cached = await loadFromCache(`conversations_cache_${user.id}`);
                        if (cached && cached.data && Array.isArray(cached.data) && cached.data.length > 0) {
                            const { getNewConversations } = require('../../services/chatService');
                            const latestConversationTime = cached.data[0].updated_at;
                            const cacheIds = cached.data.map(c => c.id);
                            const newConversations = await getNewConversations(user.id, latestConversationTime, cacheIds);

                            if (newConversations && newConversations.length > 0) {
                                const existingIds = new Set(cached.data.map(c => c.id));
                                const uniqueNewConversations = newConversations.filter(c => {
                                    const cTime = new Date(c.updated_at).getTime();
                                    const cacheLatestTime = new Date(latestConversationTime).getTime();
                                    return !existingIds.has(c.id) && cTime > cacheLatestTime;
                                });

                                if (uniqueNewConversations.length > 0) {
                                    const mergedData = [...uniqueNewConversations, ...cached.data].sort((a, b) =>
                                        new Date(b.updated_at) - new Date(a.updated_at)
                                    );
                                    setConversations(mergedData);
                                }
                            }
                        } else {
                            // Không có cache, load toàn bộ
                            loadConversations(false);
                        }
                    } catch (error) {
                        // Silent
                    }
                };
                refreshConversations();
            }
            // Nếu chưa có loadTimeRef, không làm gì (để useEffect load)
        }, [user?.id])
    );

    // Realtime subscription để cập nhật tin nhắn mới
    useEffect(() => {
        if (!user?.id) return;

        // Cleanup existing subscription first
        if (subscriptionRef.current) {
            subscriptionRef.current.unsubscribe();
            subscriptionRef.current = null;
        }


        const channel = supabase
            .channel(`chat-list-updates-${user.id}`) // Unique channel name
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            }, async (payload) => {
                // Cập nhật unread count và lastMessage cho conversation cụ thể
                const newMessage = payload.new;
                if (newMessage && newMessage.conversation_id) {
                    // Fetch đầy đủ thông tin message với sender
                    try {
                        const { data: messageWithSender } = await supabase
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
                            .eq('id', newMessage.id)
                            .single();

                        if (messageWithSender) {
                            // Tìm conversation member để lấy last_read_at
                            const { data: memberData } = await supabase
                                .from('conversation_members')
                                .select('last_read_at')
                                .eq('conversation_id', newMessage.conversation_id)
                                .eq('user_id', user.id)
                                .single();

                            // Tính lại unread count từ database
                            const lastReadAt = memberData?.last_read_at || new Date(0).toISOString();
                            const { count: unreadCount } = await supabase
                                .from('messages')
                                .select('*', { count: 'exact', head: true })
                                .eq('conversation_id', newMessage.conversation_id)
                                .gt('created_at', lastReadAt)
                                .neq('sender_id', user.id);

                            // FIX E2EE: Luôn dùng sender_copy message (nếu có) để getLastMessageContent xử lý decrypt đúng
                            // Không ưu tiên receiver message vì khi ở thiết bị khác, receiver message là plaintext (không đúng)
                            // getLastMessageContent sẽ tự động decrypt nếu là từ thiết bị hiện tại hoặc đã nhập PIN
                            setConversations(prevConversations => {
                                const updatedConversations = prevConversations.map(conv => {
                                    if (conv.id === newMessage.conversation_id) {
                                        return {
                                            ...conv,
                                            unreadCount: unreadCount || 0,
                                            lastMessage: messageWithSender, // Luôn dùng sender_copy, getLastMessageContent sẽ xử lý
                                            updated_at: newMessage.created_at
                                        };
                                    }
                                    return conv;
                                });

                                // Sắp xếp lại theo updated_at (conversation có tin nhắn mới lên đầu)
                                return updatedConversations.sort((a, b) =>
                                    new Date(b.updated_at) - new Date(a.updated_at)
                                );
                            });
                        }
                    } catch (error) {
                        // Silent error - fallback: chỉ cập nhật lastMessage nếu không fetch được
                        setConversations(prevConversations => {
                            const updatedConversations = prevConversations.map(conv => {
                                if (conv.id === newMessage.conversation_id) {
                                    const isFromCurrentUser = newMessage.sender_id === user.id;
                                    const newUnreadCount = isFromCurrentUser
                                        ? conv.unreadCount || 0
                                        : (conv.unreadCount || 0) + 1;

                                    return {
                                        ...conv,
                                        unreadCount: newUnreadCount,
                                        lastMessage: {
                                            id: newMessage.id,
                                            content: newMessage.content,
                                            message_type: newMessage.message_type,
                                            file_url: newMessage.file_url,
                                            created_at: newMessage.created_at,
                                            sender_id: newMessage.sender_id
                                        },
                                        updated_at: newMessage.created_at
                                    };
                                }
                                return conv;
                            });

                            return updatedConversations.sort((a, b) =>
                                new Date(b.updated_at) - new Date(a.updated_at)
                            );
                        });
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'conversation_members'
            }, async (payload) => {
                // Khi last_read_at được cập nhật, cập nhật unread count cho conversation
                const updatedMember = payload.new;
                if (updatedMember && updatedMember.conversation_id && updatedMember.user_id === user.id) {
                    // Tính lại unread count từ database
                    try {
                        const { count: unreadCount } = await supabase
                            .from('messages')
                            .select('*', { count: 'exact', head: true })
                            .eq('conversation_id', updatedMember.conversation_id)
                            .gt('created_at', updatedMember.last_read_at || new Date(0).toISOString())
                            .neq('sender_id', user.id);

                        setConversations(prevConversations =>
                            prevConversations.map(conv =>
                                conv.id === updatedMember.conversation_id
                                    ? { ...conv, unreadCount: unreadCount || 0 }
                                    : conv
                            )
                        );
                    } catch (error) {
                        // Silent error
                    }
                }
            })
            .subscribe((status) => {
            });

        subscriptionRef.current = channel;

        return () => {
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
                subscriptionRef.current = null;
            }
        };
    }, [user?.id]);

    const loadConversations = async (showLoading = true) => {
        if (!user?.id) {
            isLoadingRef.current = false;
            return;
        }

        if (showLoading) {
            setLoading(true);
        }

        performanceMetrics.trackRender('ChatList-LoadStart');
        const apiStartTime = Date.now();
        // Chỉ log metrics cho lần đầu tiên (chưa log bao giờ)
        const res = await getConversations(user.id, { logMetrics: !metricsLogged.current });

        if (showLoading) {
            setLoading(false);
        }

        if (res.success) {
            // === METRICS: Tính thời gian API (chỉ khi success) ===
            const apiTime = Date.now() - apiStartTime;

            // === METRICS: Track network data ===
            // Estimate: Mỗi conversation khoảng 2KB JSON
            const estimatedSize = res.data.length * 2048;
            performanceMetrics.trackNetworkRequest(estimatedSize, 'download');

            setConversations(res.data);
            performanceMetrics.trackRender('ChatList-SetConversations');

            // Chỉ log khi load lần đầu (showLoading = true), không log khi realtime update (showLoading = false)
            if (showLoading) {
                // Đếm tổng số messages từ tất cả conversations
                let totalMessagesCount = 0;
                if (res.data.length > 0) {
                    try {
                        const conversationIds = res.data.map(c => c.id);
                        if (conversationIds.length > 0) {
                            const { count } = await supabase
                                .from('messages')
                                .select('*', { count: 'exact', head: true })
                                .in('conversation_id', conversationIds);
                            totalMessagesCount = count || 0;
                        }
                    } catch (e) {
                        // Silent
                    }
                }

                console.log(`Load từ CSDL: ${res.data.length} conversations`);
                console.log(`Load tin nhắn từ CSDL: ${totalMessagesCount} messages`);
                console.log(`Tổng dữ liệu: ${res.data.length} conversations và ${totalMessagesCount} messages`);
            }

            // Không save cache ở đây - chỉ cache khi prefetch (background)

            // === METRICS: Chỉ log đầy đủ cho lần đầu tiên ===
            const totalTime = loadTimeRef.current ? Date.now() - loadTimeRef.current : 0;
            if (totalTime > 0 && !logHasRun.current && !metricsLogged.current) {
                // === METRICS: Log metrics đơn giản ===
                let dataSize = 0;
                let dataUnit = 'KB';

                if (res.metrics?.data?.dataTransfer?.total) {
                    dataSize = res.metrics.data.dataTransfer.total / 1024; // Convert bytes to KB
                    if (dataSize >= 1024) {
                        dataSize = dataSize / 1024; // Convert to MB
                        dataUnit = 'MB';
                    }
                }

                console.log(`- Tổng thời gian load: ${totalTime} ms`);

                logHasRun.current = true;
                metricsLogged.current = true; // Đánh dấu đã log metrics
            }
            // Lần sau chỉ reload im lặng, không log gì
        }
    };

    const deleteConversationHandler = async (conversation) => {
        if (!user?.id) return;

        // Kiểm tra quyền admin cho nhóm
        if (conversation.type === 'group') {
            const currentMember = conversation.conversation_members?.find(
                member => member.user_id === user.id
            );
            if (!currentMember?.is_admin) {
                Alert.alert('Lỗi', 'Chỉ admin mới có thể xóa nhóm');
                return;
            }
        }

        // Hiển thị confirm dialog
        Alert.alert(
            'Xóa cuộc trò chuyện',
            conversation.type === 'group'
                ? 'Bạn có chắc chắn muốn xóa nhóm này? Hành động này không thể hoàn tác.'
                : 'Bạn có chắc chắn muốn xóa cuộc trò chuyện này? Hành động này không thể hoàn tác.',
            [
                {
                    text: 'Hủy',
                    style: 'cancel'
                },
                {
                    text: 'Xóa',
                    style: 'destructive',
                    onPress: async () => {
                        const res = await deleteConversation(conversation.id, user.id);

                        if (res.success) {
                            Alert.alert('Thành công', res.msg);
                            loadConversations(); // Reload danh sách
                        } else {
                            Alert.alert('Lỗi', res.msg);
                        }
                    }
                }
            ]
        );
    };

    const getLastMessage = (conversation) => {
        // Chỉ dùng lastMessage từ query (không còn messages array nữa)
        if (conversation.lastMessage) {
            // FIX E2EE BUG GIAI ĐOẠN 2: Tạo snapshot, KHÔNG reuse message object
            // Đảm bảo không rò runtime state giữa chat và conversation list
            const lastMessage = conversation.lastMessage;
            const deviceService = require('../../services/deviceService').default;
            let currentDeviceId = null;
            // Lấy currentDeviceId sync nếu có thể (hoặc async trong getLastMessageContent)

            // FIX ROOT CAUSE: Tạo snapshot với chỉ các field cần thiết
            // TUYỆT ĐỐI KHÔNG copy runtime state từ message gốc
            // Đảm bảo snapshot không reuse runtime state giữa các thiết bị
            const snapshot = {
                id: lastMessage.id,
                conversation_id: lastMessage.conversation_id,
                sender_id: lastMessage.sender_id,
                sender_device_id: lastMessage.sender_device_id,
                message_type: lastMessage.message_type,
                is_encrypted: lastMessage.is_encrypted,
                is_sender_copy: lastMessage.is_sender_copy,
                content: lastMessage.content, // Ciphertext - bất biến
                encrypted_aes_key: lastMessage.encrypted_aes_key,
                encrypted_aes_key_by_pin: lastMessage.encrypted_aes_key_by_pin,
                created_at: lastMessage.created_at,
                // KHÔNG copy runtime_plain_text, decrypted_on_device_id, ui_optimistic_text
                // Snapshot phải clean, decrypt lại mỗi lần
            };

            return snapshot;
        }
        return { content: 'Chưa có tin nhắn', type: 'text' };
    };

    const formatCallDuration = (duration) => {
        if (duration === null || duration === undefined) return '';
        if (duration < 60) {
            return `${duration} giây`;
        } else {
            const mins = Math.floor(duration / 60);
            const secs = duration % 60;
            if (secs === 0) {
                return `${mins} phút`;
            }
            return `${mins} phút ${secs} giây`;
        }
    };

    const getLastMessageContent = async (lastMessage, conversationId) => {
        if (!lastMessage || !user?.id) {
            return lastMessage?.content || 'Chưa có tin nhắn';
        }

        // Xử lý call_end messages
        if (lastMessage.message_type === 'call_end') {
            try {
                const callData = typeof lastMessage.content === 'string'
                    ? JSON.parse(lastMessage.content)
                    : lastMessage.content;
                const callType = callData?.call_type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
                return callType;
            } catch {
                return 'Cuộc gọi thoại';
            }
        }

        // Xử lý call_declined messages
        if (lastMessage.message_type === 'call_declined') {
            try {
                const callData = typeof lastMessage.content === 'string'
                    ? JSON.parse(lastMessage.content)
                    : lastMessage.content;
                const callType = callData?.call_type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi nhỡ';
                return `${callType} • Đã từ chối`;
            } catch {
                return 'Cuộc gọi nhỡ • Đã từ chối';
            }
        }

        // TIÊU CHUẨN HIỂN THỊ: Chỉ return plaintext khi chắc chắn
        // Nếu không phải text message → return content (media messages thường là URL/metadata)
        if (lastMessage.message_type !== 'text') {
            return lastMessage.content || 'Chưa có tin nhắn';
        }

        // Text message: Kiểm tra xem có phải encrypted không (KHÔNG dùng is_encrypted flag)
        const { isMessageActuallyEncrypted, canRenderPlaintext } = require('../../utils/messageValidation');
        const isActuallyEncrypted = isMessageActuallyEncrypted(lastMessage);
        const canRender = canRenderPlaintext(lastMessage, null);

        // Nếu chắc chắn là plaintext → return content
        if (canRender) {
            return lastMessage.content;
        }

        // Nếu không chắc chắn là plaintext → chỉ decrypt nếu là sender_copy và encrypted
        // KHÔNG BAO GIỜ return content trực tiếp nếu không chắc chắn

        // FIX E2EE BUG GIAI ĐOẠN 2: Nếu là sender copy và encrypted, decrypt runtime
        // lastMessage là snapshot → không có runtime_plain_text từ trước
        // PHẢI decrypt lại mỗi lần (KHÔNG cache)
        if (lastMessage.is_sender_copy === true && lastMessage.is_encrypted === true) {
            try {
                const deviceService = require('../../services/deviceService').default;
                const currentDeviceId = await deviceService.getOrCreateDeviceId();
                const senderDeviceId = lastMessage.sender_device_id;

                // DEBUG LOG: Log trước khi decrypt
                console.log('[LAST_MESSAGE_DECRYPT]');
                console.log(`conversationId=${conversationId}`);
                console.log(`lastMessage.id=${lastMessage.id}`);
                console.log(`is_encrypted=${lastMessage.is_encrypted}`);
                console.log(`content_length=${lastMessage.content ? lastMessage.content.length : 0}`);
                console.log(`runtime_plain_text=${lastMessage.runtime_plain_text ? 'YES' : 'NO'}`);
                console.log(`decrypted_on_device_id=${lastMessage.decrypted_on_device_id || 'undefined'}`);
                console.log(`currentDeviceId=${currentDeviceId}`);
                console.log(`sender_device_id=${senderDeviceId}`);

                // Chưa có runtime_plain_text (vì là snapshot) → decrypt runtime
                const isFromCurrentDevice = senderDeviceId === currentDeviceId;

                if (isFromCurrentDevice) {
                    // Tin nhắn từ thiết bị của chính mình → decrypt luôn (không cần PIN)
                    const decryptedContent = await encryptionService.decryptMessageWithDeviceKey(
                        lastMessage.content,
                        user.id,
                        senderDeviceId,
                        lastMessage.encrypted_aes_key_by_pin || null
                    );

                    if (decryptedContent && decryptedContent.trim() !== '') {
                        // FIX E2EE BUG GIAI ĐOẠN 2: Lưu vào runtime_plain_text (snapshot local)
                        // KHÔNG ghi đè content, KHÔNG mutate message object gốc
                        lastMessage.runtime_plain_text = decryptedContent;
                        lastMessage.decrypted_on_device_id = currentDeviceId;
                        return decryptedContent;
                    }
                } else {
                    // Tin nhắn từ THIẾT BỊ KHÁC → cần PIN để decrypt
                    const isUnlocked = pinService.isUnlocked();

                    if (!isUnlocked) {
                        // Chưa nhập PIN → hiển thị "Đã mã hóa đầu cuối"
                        const displayText = 'Đã mã hóa đầu cuối';
                        console.log(`DISPLAY_TEXT=${displayText}`);
                        return displayText;
                    }

                    // Đã nhập PIN → decrypt
                    const decryptedContent = await encryptionService.decryptMessageWithDeviceKey(
                        lastMessage.content,
                        user.id,
                        senderDeviceId,
                        lastMessage.encrypted_aes_key_by_pin || null
                    );

                    if (decryptedContent && decryptedContent.trim() !== '') {
                        // FIX E2EE BUG GIAI ĐOẠN 2: Lưu vào runtime_plain_text (snapshot local)
                        // KHÔNG ghi đè content, KHÔNG mutate message object gốc
                        lastMessage.runtime_plain_text = decryptedContent;
                        lastMessage.decrypted_on_device_id = currentDeviceId;
                        const displayText = decryptedContent;
                        console.log(`DISPLAY_TEXT=${displayText.substring(0, 50)}...`);
                        return displayText;
                    }
                }

                // Không decrypt được → hiển thị "Đã mã hóa đầu cuối"
                const displayText = 'Đã mã hóa đầu cuối';
                console.log(`DISPLAY_TEXT=${displayText}`);
                return displayText;
            } catch (error) {
                console.log('Error decrypting last message:', error.message);
                const displayText = 'Đã mã hóa đầu cuối';
                console.log(`DISPLAY_TEXT=${displayText}`);
                return displayText;
            }
        }

        // Tất cả trường hợp còn lại → không chắc chắn là plaintext
        // KHÔNG BAO GIỜ return content trực tiếp → return label
        return 'Đã mã hóa đầu cuối';
    };

    const getConversationName = (conversation) => {
        if (conversation.type === 'group') {
            return conversation.name || 'Nhóm chat';
        }

        // Chat 1-1: lấy tên của user khác
        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user?.name || 'Người dùng';
    };

    const getConversationAvatar = (conversation) => {
        if (conversation.type === 'group') {
            return null; // Có thể thêm avatar nhóm sau
        }

        // Chat 1-1: lấy avatar của user khác
        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user?.image || null;
    };

    const getUnreadCount = (conversation) => {
        // Dùng unreadCount từ SQL COUNT query (đã tối ưu)
        // Không cần tính lại từ messages nữa
        return conversation.unreadCount || 0;
    };

    const formatTime = (timestamp) => {
        const now = moment();
        const messageTime = moment(timestamp);

        if (now.diff(messageTime, 'days') > 0) {
            return messageTime.format('DD/MM');
        }
        return messageTime.format('HH:mm');
    };

    // FIX E2EE BUG GIAI ĐOẠN 2: Decrypt và format last messages khi conversations thay đổi
    // lastMessage là snapshot → không có runtime state từ trước
    useEffect(() => {
        const processLastMessages = async () => {
            if (!conversations.length || !user?.id) return;

            const deviceService = require('../../services/deviceService').default;
            const currentDeviceId = await deviceService.getOrCreateDeviceId();

            const processedMap = {};
            await Promise.all(
                conversations.map(async (conversation) => {
                    const lastMessage = getLastMessage(conversation);
                    if (lastMessage) {
                        // Xử lý call_end, call_declined messages
                        if (lastMessage.message_type === 'call_end' || lastMessage.message_type === 'call_declined') {
                            try {
                                const content = await getLastMessageContent(lastMessage, conversation.id);
                                processedMap[conversation.id] = content;
                            } catch (error) {
                                // Fallback
                                if (lastMessage.message_type === 'call_end') {
                                    processedMap[conversation.id] = 'Cuộc hội thoại';
                                } else {
                                    processedMap[conversation.id] = 'Cuộc gọi nhỡ • Đã từ chối';
                                }
                            }
                        } else if (lastMessage.is_sender_copy === true && lastMessage.is_encrypted === true) {
                            // Xử lý sender_copy encrypted messages
                            // getLastMessageContent sẽ tự động decrypt nếu là từ thiết bị hiện tại (không cần PIN)
                            // hoặc từ thiết bị khác nhưng đã nhập PIN
                            try {
                                const content = await getLastMessageContent(lastMessage, conversation.id);
                                processedMap[conversation.id] = content;
                            } catch (error) {
                                processedMap[conversation.id] = 'Đã mã hóa đầu cuối';
                            }
                        } else {
                            // Các messages khác (plaintext, receiver messages, etc.)
                            // getLastMessageContent sẽ xử lý đúng
                            try {
                                const content = await getLastMessageContent(lastMessage, conversation.id);
                                processedMap[conversation.id] = content;
                            } catch (error) {
                                processedMap[conversation.id] = lastMessage.content || 'Chưa có tin nhắn';
                            }
                        }
                    }
                })
            );
            setDecryptedMessages(processedMap);
        };

        processLastMessages();
    }, [conversations, user?.id, isPinEntered]); // Thêm isPinEntered vào dependencies để re-process khi PIN thay đổi

    /**
     * Resolve last message text để hiển thị trong Conversation List
     * 
     * Logic:
     * 1. Nếu lastMessage từ THIẾT BỊ CỦA CHÍNH MÌNH (sender_device_id === currentDeviceId):
     *    → Decrypt và hiển thị plain text (KHÔNG cần PIN)
     * 
     * 2. Nếu lastMessage từ THIẾT BỊ KHÁC:
     *    - Chưa nhập PIN → "Đã mã hóa đầu cuối"
     *    - Đã nhập PIN → Decrypt và hiển thị plain text
     * 
     * 3. Tuyệt đối không hiển thị ciphertext
     */
    const resolveLastMessageText = (lastMessage, conversationId) => {
        if (!lastMessage) return 'Chưa có tin nhắn';

        // TIÊU CHUẨN HIỂN THỊ LAST MESSAGE:
        // Không render trực tiếp content, chỉ trả về runtime_plain_text hoặc label

        // Xử lý call_end và call_declined messages
        if (lastMessage.message_type === 'call_end' || lastMessage.message_type === 'call_declined') {
            // Sử dụng decryptedMessages nếu đã có (đã được xử lý trong useEffect)
            if (decryptedMessages[conversationId]) {
                return decryptedMessages[conversationId];
            }
            // Fallback: format ngay tại đây
            try {
                const callData = typeof lastMessage.content === 'string'
                    ? JSON.parse(lastMessage.content)
                    : lastMessage.content;
                if (lastMessage.message_type === 'call_end') {
                    const callType = callData?.call_type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
                    return callType;
                } else {
                    const callType = callData?.call_type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi nhỡ';
                    return `${callType} • Đã từ chối`;
                }
            } catch {
                return lastMessage.message_type === 'call_end' ? 'Cuộc gọi thoại' : 'Cuộc gọi nhỡ • Đã từ chối';
            }
        }

        // Xử lý media messages
        if (lastMessage.message_type === 'image') {
            return '📷 Hình ảnh';
        }
        if (lastMessage.message_type === 'video') {
            return '🎥 Video';
        }

        // Xử lý text messages - CHỈ render khi có runtime_plain_text hoặc chắc chắn là plaintext
        if (lastMessage.message_type === 'text') {
            const { getSafeDisplayText } = require('../../utils/messageValidation');

            // Sử dụng decryptedMessages nếu đã decrypt thành công (từ processLastMessages)
            // decryptedMessages được set trong processLastMessages với device ID check
            if (decryptedMessages[conversationId] && decryptedMessages[conversationId] !== 'Đã mã hóa đầu cuối') {
                return decryptedMessages[conversationId];
            }

            // Check runtime_plain_text trong snapshot (nếu có)
            // runtime_plain_text chỉ được set sau khi decrypt trong getLastMessageContent
            // và chỉ khi device ID match → an toàn để render
            if (lastMessage.runtime_plain_text &&
                lastMessage.decrypted_on_device_id) {
                // runtime_plain_text đã được verify device ID trong getLastMessageContent
                return lastMessage.runtime_plain_text;
            }

            // Sử dụng helper để lấy text an toàn
            // Helper sẽ check: runtime_plain_text → ui_optimistic_text → plaintext (nếu chắc chắn) → label
            // Không cần deviceId vì helper sẽ fallback về label nếu không chắc chắn
            const displayText = getSafeDisplayText(lastMessage, null);
            return displayText;
        }

        // Fallback: không phải text → hiển thị content hoặc label
        // Với message không phải text, content thường là metadata (URL, JSON) → an toàn để hiển thị
        return lastMessage.content || 'Chưa có tin nhắn';
    };

    const renderConversation = ({ item: conversation }) => {
        // Track render performance
        performanceMetrics.trackRender(`Conversation-${conversation.id}`);

        const lastMessage = getLastMessage(conversation);
        const unreadCount = getUnreadCount(conversation);

        // Resolve last message text theo logic mới
        const displayContent = resolveLastMessageText(lastMessage, conversation.id);

        return (
            <Pressable
                style={styles.conversationItem}
                onPress={() => router.push({
                    pathname: 'chat',
                    params: { conversationId: conversation.id }
                })}
            >
                {conversation.type === 'group' ? (
                    <GroupAvatar
                        members={conversation.conversation_members || []}
                        size={hp(6)}
                    />
                ) : (
                    <Avatar
                        uri={getConversationAvatar(conversation)}
                        size={hp(6)}
                        rounded={true}
                    />
                )}

                <View style={styles.conversationContent}>
                    <View style={styles.conversationHeader}>
                        <Text style={styles.conversationName} numberOfLines={1}>
                            {getConversationName(conversation)}
                        </Text>
                        <Text style={styles.messageTime}>
                            {formatTime(conversation.updated_at)}
                        </Text>
                    </View>

                    <View style={styles.messagePreview}>
                        <Text
                            style={[
                                styles.lastMessage,
                                unreadCount > 0 && styles.unreadMessage
                            ]}
                            numberOfLines={1}
                        >
                            {lastMessage.message_type === 'image' ? '📷 Hình ảnh' :
                                lastMessage.message_type === 'video' ? '🎥 Video' :
                                    lastMessage.message_type === 'emoji' ? displayContent :
                                        displayContent || 'Chưa có tin nhắn'}
                        </Text>

                        {unreadCount > 0 && (
                            <View style={styles.unreadBadge}>
                                <Text style={styles.unreadCount}>
                                    {unreadCount > 99 ? '99+' : unreadCount}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Nút xóa - chỉ hiện khi không có tin nhắn unread */}
                {unreadCount === 0 && (
                    <Pressable
                        style={styles.deleteButton}
                        onPress={(e) => {
                            e.stopPropagation(); // Ngăn không cho trigger onPress của conversationItem
                            deleteConversationHandler(conversation);
                        }}
                    >
                        <Icon name="delete" size={hp(2.5)} color={theme.colors.error || '#ff4444'} />
                    </Pressable>
                )}
            </Pressable>
        );
    };

    if (loading) {
        return (
            <ScreenWrapper bg="white">
                <View style={styles.loadingContainer}>
                    <Loading />
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper bg={theme.colors.background}>
            <View style={styles.container}>
                {/* Messenger Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Pressable
                            style={styles.backButton}
                            onPress={() => router.back()}
                        >
                            <Icon name="arrowLeft" size={hp(2.5)} color={theme.colors.text} />
                        </Pressable>
                        <Text style={styles.title}>Chats</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <Pressable style={styles.headerIcon}>
                            <Icon name="video" size={hp(2.5)} color={theme.colors.text} />
                        </Pressable>
                        <Pressable
                            style={styles.newChatButton}
                            onPress={() => router.push('newChat')}
                        >
                            <Icon name="plus" size={hp(2.5)} color={theme.colors.text} />
                        </Pressable>
                    </View>
                </View>

                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchBar}>
                        <Icon name="search" size={hp(2)} color={theme.colors.textSecondary} />
                        <Text style={styles.searchPlaceholder}>Tìm kiếm</Text>
                    </View>
                </View>

                {/* Conversations List */}
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderConversation}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContainer}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Icon
                                name="chat"
                                size={hp(8)}
                                color={theme.colors.textLight}
                            />
                            <Text style={styles.emptyText}>
                                Chưa có cuộc trò chuyện nào
                            </Text>
                            <Text style={styles.emptySubtext}>
                                Bắt đầu trò chuyện với bạn bè
                            </Text>
                        </View>
                    }
                />
            </View>
        </ScreenWrapper>
    );
};

export default ChatList;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: wp(4),
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Messenger Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        ...theme.shadows.small,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(3),
    },
    backButton: {
        padding: wp(2),
        marginRight: wp(2),
    },
    title: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },
    headerIcon: {
        padding: wp(2),
    },
    newChatButton: {
        padding: wp(2),
    },

    // Search Bar
    searchContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        backgroundColor: theme.colors.background,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },
    searchPlaceholder: {
        fontSize: hp(1.6),
        color: theme.colors.textSecondary,
        marginLeft: wp(2),
    },
    listContainer: {
        paddingVertical: hp(1),
    },
    conversationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(4),
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        position: 'relative',
    },
    conversationContent: {
        flex: 1,
        marginLeft: wp(3),
    },
    conversationHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: hp(0.5),
    },
    conversationName: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        flex: 1,
    },
    messageTime: {
        fontSize: hp(1.4),
        color: theme.colors.textLight,
        marginTop: hp(0.5),
        marginRight: wp(10), // Dịch sang trái để tránh nút xóa
    },
    messagePreview: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    lastMessage: {
        fontSize: hp(1.6),
        color: theme.colors.textLight,
        flex: 1,
    },
    unreadMessage: {
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
    },
    unreadBadge: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.full,
        minWidth: hp(2.5),
        height: hp(2.5),
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(1),
        marginTop: hp(-4), // Chỉnh cao hơn 1 chút
    },
    unreadCount: {
        color: 'white',
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: hp(10),
    },
    emptyText: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginTop: hp(2),
    },
    emptySubtext: {
        fontSize: hp(1.6),
        color: theme.colors.textLight,
        marginTop: hp(1),
    },
    deleteButton: {
        position: 'absolute',
        right: wp(-0.5), // Dịch sang phải hơn
        top: hp(1.8),
        padding: hp(1),
        borderRadius: theme.radius.lg,
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
    },
});
