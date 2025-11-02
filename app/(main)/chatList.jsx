import { useFocusEffect, useRouter } from 'expo-router';
import moment from 'moment';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
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
import { loadConversationsCache, saveConversationsCache } from '../../utils/conversationCache';
import performanceMetrics from '../../utils/performanceMetrics';

const ChatList = () => {
    const { user } = useAuth();
    const router = useRouter();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const subscriptionRef = useRef(null);
    const loadTimeRef = useRef(null);
    const logHasRun = useRef(false);
    const metricsLogged = useRef(false); // Flag riêng để track đã log metrics chưa
    const isLoadingRef = useRef(false); // Flag để tránh load trùng

    useEffect(() => {
        // useEffect luôn load lần đầu tiên
        if (!loadTimeRef.current && user?.id) {
            isLoadingRef.current = true;
            loadTimeRef.current = Date.now();
            logHasRun.current = false;
            metricsLogged.current = false;
            performanceMetrics.reset();
            performanceMetrics.trackRender('ChatList-Mount');
            console.log('=========== BẮT ĐẦU ĐO TỐC ĐỘ CHAT LIST (CACHE FIRST) ===========');

            // === CACHE FIRST: Load từ cache ngay, show UI tức thì ===
            loadConversationsCache(user.id).then((cachedConversations) => {
                if (cachedConversations && cachedConversations.length > 0) {
                    console.log('⚡ [Cache First] Hiển thị cache ngay:', cachedConversations.length, 'conversations');
                    setConversations(cachedConversations);
                    setLoading(false); // Hide loading ngay khi có cache
                } else {
                    console.log('⚡ [Cache First] Không có cache, sẽ đợi fetch từ API');
                    // Không có cache, giữ loading = true để show loading screen
                }
            });

            // === Fetch fresh data ở background ===
            loadConversations().finally(() => {
                isLoadingRef.current = false;
            });
        }
    }, [user?.id]);

    // Refresh khi quay lại màn hình chat list
    useFocusEffect(
        useCallback(() => {
            // CHỈ reload im lặng nếu đã có loadTimeRef (đã load từ useEffect)
            // KHÔNG load mới nếu chưa có loadTimeRef (để useEffect load)
            if (loadTimeRef.current && !isLoadingRef.current) {
                // Đã load rồi, chỉ reload im lặng (không log metrics)
                loadConversations(false);
            }
            // Nếu chưa có loadTimeRef, không làm gì (để useEffect load)
        }, [])
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
            }, (payload) => {
                // Reload không hiển thị loading để tránh UI bị reload
                loadConversations(false);
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'conversation_members'
            }, (payload) => {
                // Reload để cập nhật unread count
                loadConversations(false);
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
        const apiTime = Date.now() - apiStartTime;

        if (showLoading) {
            setLoading(false);
        }

        if (res.success) {
            // === METRICS: Track network data ===
            // Estimate: Mỗi conversation khoảng 2KB JSON
            const estimatedSize = res.data.length * 2048;
            performanceMetrics.trackNetworkRequest(estimatedSize, 'download');

            setConversations(res.data);
            performanceMetrics.trackRender('ChatList-SetConversations');

            // === CACHE: Lưu conversations vào cache ===
            if (user?.id) {
                saveConversationsCache(user.id, res.data);
            }

            // === METRICS: Chỉ log đầy đủ cho lần đầu tiên ===
            const totalTime = loadTimeRef.current ? Date.now() - loadTimeRef.current : 0;
            if (totalTime > 0 && !logHasRun.current && !metricsLogged.current) {
                // === METRICS: Log metrics quan trọng để so sánh ===
                console.log('=========== CHỈ SỐ HIỆU NĂNG CHAT LIST (CACHE FIRST + SQL COUNT) ===========');
                console.log('⏱️ Tổng thời gian load:', totalTime, 'ms');
                console.log('⏱️ Thời gian API:', apiTime, 'ms');
                console.log('📊 Số conversations:', res.data.length);
                if (res.metrics) {
                    console.log('📊 Tổng queries:', res.metrics.queries.total);
                    console.log('📊 Messages load:', res.metrics.data.totalMessagesLoaded, 'messages (KHÔNG load allMessages nữa!)');
                    console.log('📊 Data transfer tổng:', (res.metrics.data.dataTransfer.total / 1024).toFixed(2), 'KB');
                    console.log('📊 Data transfer COUNT unread:', (res.metrics.data.dataTransfer.allMessages / 1024).toFixed(2), 'KB', '← ĐÃ GIẢM!');
                }
                console.log('⚡ [Cache First] UI đã hiển thị từ cache trước đó (0ms)');
                console.log('=========== KẾT THÚC ĐO TỐC ĐỘ CHAT LIST ===========');

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
            return conversation.lastMessage;
        }
        return { content: 'Chưa có tin nhắn', type: 'text' };
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

    const renderConversation = ({ item: conversation }) => {
        // Track render performance
        performanceMetrics.trackRender(`Conversation-${conversation.id}`);

        const lastMessage = getLastMessage(conversation);
        const unreadCount = getUnreadCount(conversation);

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
                                    lastMessage.message_type === 'emoji' ? lastMessage.content :
                                        lastMessage.content || 'Chưa có tin nhắn'}
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
