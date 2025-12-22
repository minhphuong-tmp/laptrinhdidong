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
    // State để trigger processLastMessages lại sau khi pre-cache ConversationKeys hoàn thành
    const [conversationKeysCached, setConversationKeysCached] = useState(0);
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
                                is_encrypted,
                                encryption_version,
                                is_sender_copy,
                                sender_device_id,
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
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:300', message: 'realtime message received', data: { conversationId: newMessage.conversation_id, messageId: messageWithSender.id, isEncrypted: messageWithSender.is_encrypted, encryptionVersion: messageWithSender.encryption_version, isSenderCopy: messageWithSender.is_sender_copy, senderId: messageWithSender.sender_id, isSelfMessage: messageWithSender.sender_id === user.id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'Y' }) }).catch(() => { });
                            // #endregion
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
                                            sender_id: newMessage.sender_id,
                                            is_encrypted: newMessage.is_encrypted,
                                            encryption_version: newMessage.encryption_version,
                                            is_sender_copy: newMessage.is_sender_copy,
                                            sender_device_id: newMessage.sender_device_id
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

            // CRITICAL FIX: Pre-cache ConversationKeys cho self messages để tránh delay khi decrypt
            // Chạy async, không block UI, nhưng trigger processLastMessages lại sau khi hoàn thành
            const preCacheConversationKeys = async () => {
                try {
                    const conversationKeyService = require('../../services/conversationKeyService').default;
                    const encryptionService = require('../../services/encryptionService').default;

                    // Tìm tất cả conversations có self messages đã encrypted
                    const selfEncryptedConversations = res.data.filter(conv => {
                        const lastMessage = conv.lastMessage;
                        return lastMessage &&
                            lastMessage.sender_id === user.id &&
                            lastMessage.message_type === 'text' &&
                            lastMessage.is_encrypted === true &&
                            lastMessage.encryption_version >= 3;
                    });

                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:437', message: 'pre-caching ConversationKeys for self messages', data: { conversationsCount: selfEncryptedConversations.length, conversationIds: selfEncryptedConversations.map(c => c.id) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'AA' }) }).catch(() => { });
                    // #endregion

                    // Pre-cache ConversationKeys cho tất cả self messages
                    await Promise.all(
                        selfEncryptedConversations.map(async (conv) => {
                            try {
                                // Kiểm tra xem đã có trong cache chưa
                                if (!conversationKeyService.keyCache.has(conv.id)) {
                                    // Thử lấy từ DB (encryptionService.getOrCreateConversationKey lưu trong DB, không cần PIN)
                                    const conversationKey = await encryptionService.getOrCreateConversationKey(conv.id, user.id);

                                    // Nếu lấy được từ DB, cache lại vào conversationKeyService
                                    if (conversationKey) {
                                        await conversationKeyService.saveConversationKey(conv.id, conversationKey, false);
                                        // #region agent log
                                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:465', message: 'pre-cached ConversationKey for self message', data: { conversationId: conv.id, messageId: conv.lastMessage?.id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'AA' }) }).catch(() => { });
                                        // #endregion
                                    }
                                }
                            } catch (error) {
                                // Silent error - không block UI
                            }
                        })
                    );

                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:477', message: 'pre-caching ConversationKeys completed', data: { conversationsCount: selfEncryptedConversations.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'AA' }) }).catch(() => { });
                    // #endregion

                    // CRITICAL: Trigger processLastMessages lại sau khi pre-cache hoàn thành
                    // Điều này đảm bảo rằng ConversationKeys đã có trong cache khi decrypt
                    // Sử dụng setTimeout để đảm bảo state đã được update
                    setTimeout(() => {
                        setConversationKeysCached(prev => prev + 1);
                    }, 50);
                } catch (error) {
                    // Silent error - không block UI
                }
            };

            // Chạy pre-cache ngay, không block UI
            preCacheConversationKeys();

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
                encryption_version: lastMessage.encryption_version,
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

        // #region agent log
        const isSelfMessage = lastMessage.sender_id === user?.id;
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:570', message: 'getLastMessageContent entry', data: { conversationId, messageId: lastMessage.id, messageType: lastMessage.message_type, isSelfMessage, senderId: lastMessage.sender_id, userId: user?.id, isEncrypted: lastMessage.is_encrypted, isSenderCopy: lastMessage.is_sender_copy, senderDeviceId: lastMessage.sender_device_id, contentLength: lastMessage.content?.length, contentPreview: lastMessage.content?.substring(0, 30) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'J' }) }).catch(() => { });
        // #endregion

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

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:607', message: 'getLastMessageContent text message check', data: { conversationId, messageId: lastMessage.id, isSelfMessage, isActuallyEncrypted, canRender, isEncrypted: lastMessage.is_encrypted, isSenderCopy: lastMessage.is_sender_copy }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'K' }) }).catch(() => { });
        // #endregion

        // CRITICAL FIX: Nếu là self message và đã encrypted, LUÔN decrypt bất kể canRender
        // Vì self messages LUÔN decrypt được (không cần PIN)
        const shouldDecryptSelf = isSelfMessage && lastMessage.is_encrypted === true;

        // Nếu chắc chắn là plaintext VÀ không phải self message encrypted → return content
        if (canRender && !shouldDecryptSelf) {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:613', message: 'getLastMessageContent returning plaintext', data: { conversationId, messageId: lastMessage.id, isSelfMessage, content: lastMessage.content?.substring(0, 50) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'K' }) }).catch(() => { });
            // #endregion
            return lastMessage.content;
        }

        // Nếu không chắc chắn là plaintext → chỉ decrypt nếu là sender_copy và encrypted
        // KHÔNG BAO GIỜ return content trực tiếp nếu không chắc chắn

        // FIX E2EE BUG GIAI ĐOẠN 2: Nếu là sender copy và encrypted, decrypt runtime
        // lastMessage là snapshot → không có runtime_plain_text từ trước
        // PHẢI decrypt lại mỗi lần (KHÔNG cache)
        // CRITICAL FIX: Nếu là self message (sender_id === user.id), LUÔN decrypt bất kể is_sender_copy
        const shouldDecrypt = shouldDecryptSelf ||
            (lastMessage.is_sender_copy === true && lastMessage.is_encrypted === true);

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:623', message: 'getLastMessageContent decrypt check', data: { conversationId, messageId: lastMessage.id, isSelfMessage, isSenderCopy: lastMessage.is_sender_copy, isEncrypted: lastMessage.is_encrypted, shouldDecrypt }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'L' }) }).catch(() => { });
        // #endregion

        if (shouldDecrypt) {
            try {
                const deviceService = require('../../services/deviceService').default;
                const currentDeviceId = await deviceService.getOrCreateDeviceId();
                const senderDeviceId = lastMessage.sender_device_id;

                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:625', message: 'getLastMessageContent before decrypt', data: { conversationId, messageId: lastMessage.id, isSelfMessage, isEncrypted: lastMessage.is_encrypted, contentLength: lastMessage.content?.length, contentPreview: lastMessage.content?.substring(0, 30), hasRuntimePlainText: !!lastMessage.runtime_plain_text, decryptedOnDeviceId: lastMessage.decrypted_on_device_id, currentDeviceId, senderDeviceId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'M' }) }).catch(() => { });
                // #endregion

                // Chưa có runtime_plain_text (vì là snapshot) → decrypt runtime
                const isFromCurrentDevice = senderDeviceId === currentDeviceId;

                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:641', message: 'getLastMessageContent device check', data: { conversationId, messageId: lastMessage.id, isSelfMessage, isFromCurrentDevice, senderDeviceId, currentDeviceId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'M' }) }).catch(() => { });
                // #endregion

                // CRITICAL FIX: Nếu là self message (sender_id === user.id), LUÔN decrypt bất kể device ID
                // Vì self message có thể được gửi từ thiết bị khác nhưng vẫn là của chính mình
                if (isFromCurrentDevice || isSelfMessage) {
                    // Tin nhắn từ thiết bị của chính mình HOẶC là self message → decrypt luôn (không cần PIN)
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:643', message: 'getLastMessageContent decrypting self message', data: { conversationId, messageId: lastMessage.id, isSelfMessage, isFromCurrentDevice, encryptionVersion: lastMessage.encryption_version }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'N' }) }).catch(() => { });
                    // #endregion

                    // CRITICAL FIX: Nếu là encryption_version >= 3, dùng ConversationKey thay vì DeviceKey
                    // Với self messages, ConversationKey PHẢI có trong cache (đã được tạo khi gửi message)
                    // Nếu không có trong cache, có thể là cache bị clear → cần tạo lại hoặc lấy từ DB
                    let decryptedContent = null;
                    if (lastMessage.encryption_version >= 3) {
                        // New architecture: Dùng ConversationKey
                        const conversationKeyService = require('../../services/conversationKeyService').default;

                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:674', message: 'getLastMessageContent getting ConversationKey', data: { conversationId, messageId: lastMessage.id, isSelfMessage, encryptionVersion: lastMessage.encryption_version }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'Q' }) }).catch(() => { });
                        // #endregion

                        // Với self messages, LUÔN dùng getOrCreateConversationKey (không cần PIN nếu có trong cache)
                        // getOrCreateConversationKey sẽ:
                        // 1. Thử lấy từ cache (không cần PIN) - ConversationKey PHẢI có trong cache vì đã được tạo khi gửi message
                        // 2. Nếu không có trong cache → thử lấy từ SecureStore (cần PIN)
                        // 3. Nếu không có trong SecureStore → tạo mới (device hiện tại có quyền tạo)
                        // CRITICAL: Với self messages, ConversationKey PHẢI có trong cache hoặc SecureStore
                        // Nếu không có, có thể là bug hoặc cache bị clear → sẽ tạo key mới (nhưng key này sẽ khác với key cũ)
                        // Tuy nhiên, trong thực tế, ConversationKey LUÔN có trong cache khi gửi message
                        // FALLBACK: Nếu conversationKeyService không có key, thử dùng encryptionService.getOrCreateConversationKey (lấy từ DB)
                        let conversationKey = await conversationKeyService.getOrCreateConversationKey(conversationId);

                        // #region agent log
                        const conversationKeyServiceInternal = require('../../services/conversationKeyService').default;
                        const hasInCache = conversationKeyServiceInternal.keyCache?.has(conversationId);
                        const cacheSize = conversationKeyServiceInternal.keyCache?.size || 0;
                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:682', message: 'getLastMessageContent ConversationKey result', data: { conversationId, messageId: lastMessage.id, isSelfMessage, hasConversationKey: !!conversationKey, conversationKeyLength: conversationKey?.length, hasInCache, cacheSize }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'Q' }) }).catch(() => { });
                        // #endregion

                        // CRITICAL: Với self messages, nếu ConversationKey không có trong cache,
                        // thử lấy từ DB (encryptionService.getOrCreateConversationKey) trước khi fallback
                        // Vì ConversationKey có thể được lưu trong DB (encrypted bằng RSA) và không cần PIN
                        if (!conversationKey && isSelfMessage) {
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:700', message: 'getLastMessageContent ConversationKey not found, trying DB', data: { conversationId, messageId: lastMessage.id, isSelfMessage, encryptionVersion: lastMessage.encryption_version }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'Z' }) }).catch(() => { });
                            // #endregion
                            try {
                                // Thử lấy từ DB (encryptionService.getOrCreateConversationKey lưu trong DB, không cần PIN)
                                conversationKey = await encryptionService.getOrCreateConversationKey(conversationId, user.id);

                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:707', message: 'getLastMessageContent DB ConversationKey result', data: { conversationId, messageId: lastMessage.id, isSelfMessage, hasConversationKey: !!conversationKey, conversationKeyLength: conversationKey?.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'Z' }) }).catch(() => { });
                                // #endregion

                                // Nếu lấy được từ DB, cache lại vào conversationKeyService
                                if (conversationKey) {
                                    await conversationKeyService.saveConversationKey(conversationId, conversationKey, false);
                                }
                            } catch (error) {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:712', message: 'getLastMessageContent DB ConversationKey error', data: { conversationId, messageId: lastMessage.id, isSelfMessage, error: error.message }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'Z' }) }).catch(() => { });
                                // #endregion
                            }
                        }

                        if (conversationKey) {
                            decryptedContent = await encryptionService.decryptMessageWithConversationKey(
                                lastMessage.content,
                                conversationKey
                            );
                        }
                    }

                    // Fallback: Nếu không có ConversationKey hoặc encryption_version < 3, dùng DeviceKey
                    if (!decryptedContent) {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:694', message: 'getLastMessageContent fallback to DeviceKey', data: { conversationId, messageId: lastMessage.id, isSelfMessage, encryptionVersion: lastMessage.encryption_version }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'Q' }) }).catch(() => { });
                        // #endregion
                        decryptedContent = await encryptionService.decryptMessageWithDeviceKey(
                            lastMessage.content,
                            user.id,
                            senderDeviceId,
                            lastMessage.encrypted_aes_key_by_pin || null
                        );
                    }

                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:651', message: 'getLastMessageContent decrypt result', data: { conversationId, messageId: lastMessage.id, isSelfMessage, decryptedContent: decryptedContent?.substring(0, 50), decryptedContentLength: decryptedContent?.length, hasDecryptedContent: !!decryptedContent, decryptedContentType: typeof decryptedContent }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'N' }) }).catch(() => { });
                    // #endregion

                    if (decryptedContent && typeof decryptedContent === 'string' && decryptedContent.trim() !== '') {
                        // FIX E2EE BUG GIAI ĐOẠN 2: Lưu vào runtime_plain_text (snapshot local)
                        // KHÔNG ghi đè content, KHÔNG mutate message object gốc
                        lastMessage.runtime_plain_text = decryptedContent;
                        lastMessage.decrypted_on_device_id = currentDeviceId;
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:657', message: 'getLastMessageContent returning decrypted content', data: { conversationId, messageId: lastMessage.id, isSelfMessage, decryptedContent: decryptedContent?.substring(0, 50) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'N' }) }).catch(() => { });
                        // #endregion
                        return decryptedContent;
                    } else {
                        // #region agent log
                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:680', message: 'getLastMessageContent decrypt failed for self message', data: { conversationId, messageId: lastMessage.id, isSelfMessage, decryptedContent, decryptedContentType: typeof decryptedContent }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'P' }) }).catch(() => { });
                        // #endregion
                        // CRITICAL FIX: Với self messages, nếu decrypt thất bại, return null thay vì undefined
                        // Caller sẽ xử lý (giữ lại giá trị cũ nếu có)
                        // KHÔNG return ciphertext hoặc placeholder
                        return null;
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

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:749', message: 'processLastMessages entry', data: { conversationsCount: conversations.length, userId: user?.id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
            // #endregion

            const deviceService = require('../../services/deviceService').default;
            const currentDeviceId = await deviceService.getOrCreateDeviceId();

            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:753', message: 'processLastMessages currentDeviceId', data: { currentDeviceId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
            // #endregion

            const processedMap = {};
            await Promise.all(
                conversations.map(async (conversation) => {
                    const lastMessage = getLastMessage(conversation);
                    if (lastMessage) {
                        // #region agent log
                        const isSelfMessage = lastMessage.sender_id === user?.id;
                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:758', message: 'processLastMessages processing message', data: { conversationId: conversation.id, messageId: lastMessage.id, messageType: lastMessage.message_type, isSelfMessage, senderId: lastMessage.sender_id, userId: user?.id, isEncrypted: lastMessage.is_encrypted, isSenderCopy: lastMessage.is_sender_copy, senderDeviceId: lastMessage.sender_device_id, currentDeviceId, isFromCurrentDevice: lastMessage.sender_device_id === currentDeviceId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'G' }) }).catch(() => { });
                        // #endregion

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
                        } else if (lastMessage.message_type === 'text' && isSelfMessage && lastMessage.is_encrypted === true) {
                            // CRITICAL FIX: Xử lý self messages đã mã hóa
                            // Self messages LUÔN decrypt được (không cần PIN)
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:802', message: 'processLastMessages self encrypted message', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, senderDeviceId: lastMessage.sender_device_id, currentDeviceId, isFromCurrentDevice: lastMessage.sender_device_id === currentDeviceId, hasExistingDecrypted: !!decryptedMessages[conversation.id], existingDecrypted: decryptedMessages[conversation.id]?.substring(0, 50) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'O' }) }).catch(() => { });
                            // #endregion
                            try {
                                const content = await getLastMessageContent(lastMessage, conversation.id);
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:807', message: 'processLastMessages self decrypt result', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, content: content?.substring(0, 50), contentLength: content?.length, isPlaceholder: content === 'Đã mã hóa đầu cuối', isNull: content === null, isUndefined: content === undefined }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'O' }) }).catch(() => { });
                                // #endregion
                                // CRITICAL FIX: Với self messages, nếu decrypt thất bại (return null, undefined, hoặc placeholder),
                                // KHÔNG update decryptedMessages để giữ lại giá trị cũ (nếu có)
                                // Vì self messages LUÔN decrypt được, nếu thất bại thì có lỗi (có thể do cache bị clear)
                                if (content && content !== 'Đã mã hóa đầu cuối' && content !== null && content !== undefined) {
                                    processedMap[conversation.id] = content;
                                } else if (decryptedMessages[conversation.id] && decryptedMessages[conversation.id] !== 'Đã mã hóa đầu cuối') {
                                    // Giữ lại giá trị cũ nếu decrypt thất bại
                                    processedMap[conversation.id] = decryptedMessages[conversation.id];
                                    // #region agent log
                                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:815', message: 'processLastMessages self decrypt failed, keeping old value', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, oldValue: decryptedMessages[conversation.id]?.substring(0, 50) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'O' }) }).catch(() => { });
                                    // #endregion
                                } else {
                                    // Không có giá trị cũ → KHÔNG set vào processedMap (để giữ lại giá trị cũ trong decryptedMessages)
                                    // Chỉ set placeholder nếu thực sự không có giá trị cũ
                                    // #region agent log
                                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:820', message: 'processLastMessages self decrypt failed, not updating processedMap', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, hasExistingDecrypted: !!decryptedMessages[conversation.id] }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'O' }) }).catch(() => { });
                                    // #endregion
                                }
                            } catch (error) {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:812', message: 'processLastMessages self decrypt error', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, error: error.message, hasExistingDecrypted: !!decryptedMessages[conversation.id] }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'O' }) }).catch(() => { });
                                // #endregion
                                // CRITICAL FIX: Với self messages, nếu decrypt throw error,
                                // KHÔNG update decryptedMessages để giữ lại giá trị cũ (nếu có)
                                if (decryptedMessages[conversation.id] && decryptedMessages[conversation.id] !== 'Đã mã hóa đầu cuối') {
                                    processedMap[conversation.id] = decryptedMessages[conversation.id];
                                } else {
                                    processedMap[conversation.id] = 'Đã mã hóa đầu cuối';
                                }
                            }
                        } else if (lastMessage.is_sender_copy === true && lastMessage.is_encrypted === true) {
                            // Xử lý sender_copy encrypted messages (không phải self)
                            // getLastMessageContent sẽ tự động decrypt nếu là từ thiết bị hiện tại (không cần PIN)
                            // hoặc từ thiết bị khác nhưng đã nhập PIN
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:817', message: 'processLastMessages sender_copy encrypted', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, senderDeviceId: lastMessage.sender_device_id, currentDeviceId, isFromCurrentDevice: lastMessage.sender_device_id === currentDeviceId }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H' }) }).catch(() => { });
                            // #endregion
                            try {
                                const content = await getLastMessageContent(lastMessage, conversation.id);
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:822', message: 'processLastMessages decrypt result', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, content: content?.substring(0, 50), contentLength: content?.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H' }) }).catch(() => { });
                                // #endregion
                                processedMap[conversation.id] = content;
                            } catch (error) {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:827', message: 'processLastMessages decrypt error', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, error: error.message }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'H' }) }).catch(() => { });
                                // #endregion
                                processedMap[conversation.id] = 'Đã mã hóa đầu cuối';
                            }
                        } else {
                            // Các messages khác (plaintext, receiver messages, etc.)
                            // getLastMessageContent sẽ xử lý đúng
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:832', message: 'processLastMessages other messages', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, messageType: lastMessage.message_type, isEncrypted: lastMessage.is_encrypted, isSenderCopy: lastMessage.is_sender_copy }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'I' }) }).catch(() => { });
                            // #endregion
                            try {
                                const content = await getLastMessageContent(lastMessage, conversation.id);
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:835', message: 'processLastMessages other messages result', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, content: content?.substring(0, 50), contentLength: content?.length }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'I' }) }).catch(() => { });
                                // #endregion
                                processedMap[conversation.id] = content;
                            } catch (error) {
                                // #region agent log
                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:838', message: 'processLastMessages other messages error', data: { conversationId: conversation.id, messageId: lastMessage.id, isSelfMessage, error: error.message }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'I' }) }).catch(() => { });
                                // #endregion
                                processedMap[conversation.id] = lastMessage.content || 'Chưa có tin nhắn';
                            }
                        }
                    }
                })
            );
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:796', message: 'processLastMessages completed', data: { processedMapKeys: Object.keys(processedMap), processedMapValues: Object.entries(processedMap).map(([k, v]) => ({ k, v: v?.substring(0, 50) })).slice(0, 5), existingDecryptedKeys: Object.keys(decryptedMessages).slice(0, 5) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'F' }) }).catch(() => { });
            // #endregion
            // CRITICAL FIX: Merge processedMap với decryptedMessages hiện tại thay vì thay thế hoàn toàn
            // Điều này đảm bảo các giá trị cũ không bị mất nếu không được xử lý trong lần này
            setDecryptedMessages(prev => {
                const merged = { ...prev, ...processedMap };
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:965', message: 'processLastMessages merging decryptedMessages', data: { prevKeys: Object.keys(prev).slice(0, 5), processedKeys: Object.keys(processedMap).slice(0, 5), mergedKeys: Object.keys(merged).slice(0, 5) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'W' }) }).catch(() => { });
                // #endregion
                return merged;
            });
        };

        processLastMessages();
    }, [conversations, user?.id, isPinEntered, conversationKeysCached]); // Thêm conversationKeysCached vào dependencies để re-process sau khi pre-cache hoàn thành

    // #region agent log - Track conversations changes
    useEffect(() => {
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:949', message: 'conversations state changed', data: { conversationsCount: conversations?.length, conversationsIds: conversations?.map(c => c.id).slice(0, 5) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'V' }) }).catch(() => { });
    }, [conversations]);
    // #endregion

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

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:815', message: 'resolveLastMessageText entry', data: { conversationId, messageId: lastMessage.id, messageType: lastMessage.message_type, senderId: lastMessage.sender_id, userId: user?.id, isSelfMessage: lastMessage.sender_id === user?.id, isEncrypted: lastMessage.is_encrypted, isSenderCopy: lastMessage.is_sender_copy, senderDeviceId: lastMessage.sender_device_id, hasDecryptedMessages: !!decryptedMessages[conversationId], decryptedMessagesValue: decryptedMessages[conversationId]?.substring(0, 50), hasRuntimePlainText: !!lastMessage.runtime_plain_text, runtimePlainText: lastMessage.runtime_plain_text?.substring(0, 50) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'A' }) }).catch(() => { });
        // #endregion

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

            // #region agent log
            const isSelfMessage = lastMessage.sender_id === user?.id;
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:853', message: 'resolveLastMessageText text message check', data: { conversationId, messageId: lastMessage.id, isSelfMessage, hasDecryptedMessages: !!decryptedMessages[conversationId], decryptedMessagesValue: decryptedMessages[conversationId]?.substring(0, 50), hasRuntimePlainText: !!lastMessage.runtime_plain_text, runtimePlainText: lastMessage.runtime_plain_text?.substring(0, 50), decryptedOnDeviceId: lastMessage.decrypted_on_device_id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'B' }) }).catch(() => { });
            // #endregion

            // CRITICAL FIX: Ưu tiên decryptedMessages cho self messages
            // Nếu là self message và đã có decryptedMessages, LUÔN sử dụng nó (kể cả nếu là "Đã mã hóa đầu cuối")
            // Vì self messages LUÔN decrypt được, nếu vẫn là "Đã mã hóa đầu cuối" thì có lỗi
            if (decryptedMessages[conversationId]) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:858', message: 'resolveLastMessageText using decryptedMessages', data: { conversationId, messageId: lastMessage.id, isSelfMessage, decryptedMessagesValue: decryptedMessages[conversationId]?.substring(0, 50), isPlaceholder: decryptedMessages[conversationId] === 'Đã mã hóa đầu cuối' }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'C' }) }).catch(() => { });
                // #endregion
                // Nếu là self message và vẫn là placeholder → có lỗi decrypt, nhưng vẫn return để không crash
                // Nếu không phải self message → chỉ return nếu không phải placeholder
                if (isSelfMessage || decryptedMessages[conversationId] !== 'Đã mã hóa đầu cuối') {
                    return decryptedMessages[conversationId];
                }
            }

            // CRITICAL FIX: Với self messages đã encrypted, KHÔNG fallback sang getSafeDisplayText
            // Vì getSafeDisplayText có thể return ciphertext nếu không có runtime_plain_text
            // Thay vào đó, return placeholder để đảm bảo không hiển thị ciphertext
            if (isSelfMessage && lastMessage.is_encrypted === true) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:867', message: 'resolveLastMessageText self encrypted message without decryptedMessages', data: { conversationId, messageId: lastMessage.id, isSelfMessage, hasDecryptedMessages: !!decryptedMessages[conversationId] }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'X' }) }).catch(() => { });
                // #endregion
                // Với self messages, nếu không có decryptedMessages, có thể là chưa được xử lý
                // Return placeholder để đảm bảo không hiển thị ciphertext
                return 'Đã mã hóa đầu cuối';
            }

            // Check runtime_plain_text trong snapshot (nếu có)
            // runtime_plain_text chỉ được set sau khi decrypt trong getLastMessageContent
            // và chỉ khi device ID match → an toàn để render
            if (lastMessage.runtime_plain_text &&
                lastMessage.decrypted_on_device_id) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:865', message: 'resolveLastMessageText using runtime_plain_text', data: { conversationId, messageId: lastMessage.id, isSelfMessage, runtimePlainText: lastMessage.runtime_plain_text?.substring(0, 50), decryptedOnDeviceId: lastMessage.decrypted_on_device_id }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run1', hypothesisId: 'D' }) }).catch(() => { });
                // #endregion
                // runtime_plain_text đã được verify device ID trong getLastMessageContent
                return lastMessage.runtime_plain_text;
            }

            // Sử dụng helper để lấy text an toàn
            // Helper sẽ check: runtime_plain_text → ui_optimistic_text → plaintext (nếu chắc chắn) → label
            // Không cần deviceId vì helper sẽ fallback về label nếu không chắc chắn
            const displayText = getSafeDisplayText(lastMessage, null);
            
            // CRITICAL FIX: Kiểm tra displayText có phải ciphertext không
            // Nếu là ciphertext → return placeholder
            const { detectCiphertextFormat } = require('../../utils/messageValidation');
            const isDisplayTextCiphertext = displayText ? detectCiphertextFormat(displayText) : false;
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/e8f8c902-036e-4310-861c-abe174d99074', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:1183', message: 'resolveLastMessageText using getSafeDisplayText', data: { conversationId, messageId: lastMessage.id, isSelfMessage, displayText: displayText?.substring(0, 100), displayTextLength: displayText?.length, isDisplayTextCiphertext, isEncrypted: lastMessage.is_encrypted, isSenderCopy: lastMessage.is_sender_copy, hasRuntimePlainText: !!lastMessage.runtime_plain_text, contentPreview: lastMessage.content?.substring(0, 100), isContentCiphertext: lastMessage.content ? detectCiphertextFormat(lastMessage.content) : false }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run7', hypothesisId: 'U' }) }).catch(() => { });
            // #endregion
            
            // CRITICAL FIX: Nếu displayText là ciphertext → return placeholder
            if (isDisplayTextCiphertext) {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/e8f8c902-036e-4310-861c-abe174d99074', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:1190', message: 'resolveLastMessageText detected ciphertext in displayText, using placeholder', data: { conversationId, messageId: lastMessage.id, displayTextPreview: displayText.substring(0, 100), isDisplayTextCiphertext: true }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run7', hypothesisId: 'U' }) }).catch(() => { });
                // #endregion
                return 'Đã mã hóa đầu cuối';
            }
            
            // CRITICAL FIX: Nếu message is_encrypted === true và displayText không phải placeholder → return placeholder
            if (lastMessage.is_encrypted === true && displayText !== 'Đã mã hóa đầu cuối') {
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/e8f8c902-036e-4310-861c-abe174d99074', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:1197', message: 'resolveLastMessageText message is encrypted but displayText is not placeholder, using placeholder', data: { conversationId, messageId: lastMessage.id, isEncrypted: true, displayTextPreview: displayText?.substring(0, 100) }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run7', hypothesisId: 'U' }) }).catch(() => { });
                // #endregion
                return 'Đã mã hóa đầu cuối';
            }
            
            // Fallback: Kiểm tra xem có vẻ là ciphertext không (dài, có ký tự Base64)
            if (displayText && displayText.length > 200) {
                const base64CharCount = (displayText.match(/[A-Za-z0-9+/=]/g) || []).length;
                const base64Ratio = base64CharCount / displayText.length;
                if (base64Ratio > 0.8 && displayText.includes(':')) {
                    // #region agent log
                    fetch('http://127.0.0.1:7242/ingest/e8f8c902-036e-4310-861c-abe174d99074', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ location: 'chatList.jsx:1205', message: 'resolveLastMessageText detected possible ciphertext (long base64-like), using placeholder', data: { conversationId, messageId: lastMessage.id, displayTextLength: displayText.length, base64Ratio, hasColon: displayText.includes(':') }, timestamp: Date.now(), sessionId: 'debug-session', runId: 'run7', hypothesisId: 'U' }) }).catch(() => { });
                    // #endregion
                    return 'Đã mã hóa đầu cuối';
                }
            }
            
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
                                unreadCount > 0 && styles.unreadMessage,
                                displayContent === 'Đã mã hóa đầu cuối' && styles.encryptedLastMessage
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
    encryptedLastMessage: {
        color: theme.colors.textSecondary || '#888',
        fontStyle: 'italic',
    },
});
