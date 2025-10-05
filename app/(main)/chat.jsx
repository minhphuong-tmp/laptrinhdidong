import { Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Avatar from '../../components/Avatar';
import GroupAvatar from '../../components/GroupAvatar';
import Loading from '../../components/Loading';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import {
    deleteConversation,
    getConversationById,
    getMessages,
    markConversationAsRead,
    sendMessage
} from '../../services/chatService';

const ChatScreen = () => {
    const { conversationId } = useLocalSearchParams();
    const { user } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [conversation, setConversation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [messageText, setMessageText] = useState('');
    const flatListRef = useRef(null);

    useEffect(() => {
        if (conversationId) {
            loadConversation();
            loadMessages();
            markAsRead();
        }
    }, [conversationId]);

    useEffect(() => {
        if (!conversationId) return;

        console.log('Setting up realtime subscription for conversation:', conversationId);

        const channel = supabase
            .channel(`messages-${conversationId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, async (payload) => {
                console.log('=== REALTIME MESSAGE RECEIVED ===');
                console.log('Payload:', payload);
                console.log('New message:', payload.new);
                console.log('Current user ID:', user.id);
                console.log('Message sender ID:', payload.new.sender_id);

                // Chỉ thêm tin nhắn nếu không phải từ user hiện tại
                if (payload.new.sender_id !== user.id) {
                    console.log('Adding message from other user');

                    // Fetch đầy đủ thông tin sender cho tin nhắn mới
                    const { data: messageWithSender, error } = await supabase
                        .from('messages')
                        .select(`
                            *,
                            sender:users(id, name, image)
                        `)
                        .eq('id', payload.new.id)
                        .single();

                    if (error) {
                        console.log('Error fetching message with sender:', error);
                        // Fallback: sử dụng payload.new nếu không fetch được
                        setMessages(prev => [...prev, payload.new]);
                    } else {
                        console.log('Message with sender:', messageWithSender);
                        setMessages(prev => [...prev, messageWithSender]);
                    }

                    markAsRead();
                } else {
                    console.log('Ignoring own message (already added)');
                }
            })
            .subscribe((status) => {
                console.log('Messages channel status:', status);
            });

        return () => {
            console.log('Unsubscribing from messages channel');
            channel.unsubscribe();
        };
    }, [conversationId]);

    const loadConversation = async () => {
        const res = await getConversationById(conversationId);
        if (res.success) {
            setConversation(res.data);
        }
    };

    const loadMessages = async () => {
        setLoading(true);
        const res = await getMessages(conversationId);
        setLoading(false);

        if (res.success) {
            setMessages(res.data);
        }
    };


    const markAsRead = async () => {
        if (user?.id) {
            await markConversationAsRead(conversationId, user.id);
        }
    };

    const sendMessageHandler = async () => {
        if (!messageText.trim() || sending) return;

        setSending(true);
        const res = await sendMessage({
            conversation_id: conversationId,
            sender_id: user.id,
            content: messageText.trim(),
            message_type: 'text'
        });

        setSending(false);

        if (res.success) {
            // Thêm tin nhắn vào danh sách ngay lập tức để test
            const newMessage = {
                ...res.data,
                sender: {
                    id: user.id,
                    name: user.name,
                    image: user.image
                }
            };
            setMessages(prev => [...prev, newMessage]);
            setMessageText('');

            // Scroll to bottom
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    };

    const deleteConversationHandler = async () => {
        if (!conversationId || !user?.id) return;

        // Hiển thị confirm dialog
        Alert.alert(
            'Xóa cuộc trò chuyện',
            conversation?.type === 'group'
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
                        const res = await deleteConversation(conversationId, user.id);

                        if (res.success) {
                            Alert.alert('Thành công', res.msg);
                            router.back(); // Quay lại chat list
                        } else {
                            Alert.alert('Lỗi', res.msg);
                        }
                    }
                }
            ]
        );
    };

    const getConversationName = () => {
        if (!conversation) return '';

        if (conversation.type === 'group') {
            return conversation.name || 'Nhóm chat';
        }

        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user?.name || 'Người dùng';
    };

    const getConversationAvatar = () => {
        if (!conversation) return null;

        if (conversation.type === 'group') {
            return null; // Có thể thêm avatar nhóm sau
        }

        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user?.image || null;
    };

    const renderMessage = ({ item: message }) => {
        const isOwn = message.sender_id === user.id;
        const isGroup = conversation?.type === 'group';

        return (
            <View style={[
                styles.messageContainer,
                isOwn ? styles.ownMessage : styles.otherMessage
            ]}>
                {isGroup && !isOwn && (
                    <View style={styles.groupMessageHeader}>
                        <Avatar
                            uri={message.sender?.image}
                            size={hp(3)}
                            rounded={theme.radius.md}
                        />
                        <Text style={styles.senderName}>
                            {message.sender?.name}
                        </Text>
                    </View>
                )}

                <View style={[
                    styles.messageBubble,
                    isOwn ? styles.ownBubble : styles.otherBubble
                ]}>
                    {message.message_type === 'image' && (
                        <Image
                            source={{ uri: message.file_url }}
                            style={styles.messageImage}
                            resizeMode="cover"
                        />
                    )}

                    {message.message_type === 'video' && (
                        <Video
                            source={{ uri: message.file_url }}
                            style={styles.messageVideo}
                            useNativeControls
                            resizeMode="cover"
                        />
                    )}

                    {message.message_type === 'text' && (
                        <Text style={[
                            styles.messageText,
                            isOwn ? styles.ownText : styles.otherText
                        ]}>
                            {message.content}
                        </Text>
                    )}

                    <Text style={[
                        styles.messageTime,
                        isOwn ? styles.ownTime : styles.otherTime
                    ]}>
                        {moment(message.created_at).format('HH:mm')}
                        {message.is_edited && ' (đã chỉnh sửa)'}
                    </Text>
                </View>
            </View>
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
        <ScreenWrapper bg="white">
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Icon name="arrowLeft" size={hp(2.5)} color={theme.colors.text} />
                    </TouchableOpacity>

                    <View style={styles.headerInfo}>
                        {conversation?.type === 'group' ? (
                            <GroupAvatar
                                members={conversation.conversation_members || []}
                                size={hp(4)}
                            />
                        ) : (
                            <Avatar
                                uri={getConversationAvatar()}
                                size={hp(4)}
                                rounded={theme.radius.lg}
                            />
                        )}
                        <View style={styles.headerText}>
                            <Text style={styles.headerTitle}>{getConversationName()}</Text>
                            <Text style={styles.headerSubtitle}>
                                {conversation?.type === 'group' ? 'Nhóm' : 'Trực tiếp'}
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity>
                        <Icon name="threeDotsHorizontal" size={hp(2.5)} color={theme.colors.text} />
                    </TouchableOpacity>
                </View>

                {/* Messages */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContainer}
                    showsVerticalScrollIndicator={false}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                />

                {/* Input */}
                <View style={styles.inputContainer}>
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.textInput}
                            value={messageText}
                            onChangeText={setMessageText}
                            placeholder="Nhập tin nhắn..."
                            placeholderTextColor={theme.colors.textLight}
                            multiline
                            maxLength={1000}
                        />

                        <TouchableOpacity
                            style={styles.sendButton}
                            onPress={sendMessageHandler}
                            disabled={sending || !messageText.trim()}
                        >
                            {sending ? (
                                <Loading size="small" />
                            ) : (
                                <Icon
                                    name="send"
                                    size={hp(2.5)}
                                    color={messageText.trim() ? theme.colors.primary : theme.colors.textLight}
                                />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
};

export default ChatScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.gray,
    },
    headerInfo: {
        flex: 1,
        marginLeft: wp(3),
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerText: {
        marginLeft: wp(2),
        flex: 1,
    },
    headerTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
    },
    headerSubtitle: {
        fontSize: hp(1.4),
        color: theme.colors.textLight,
    },
    messagesList: {
        flex: 1,
    },
    messagesContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },
    messageContainer: {
        marginVertical: hp(0.5),
    },
    ownMessage: {
        alignItems: 'flex-end',
    },
    otherMessage: {
        alignItems: 'flex-start',
    },
    groupMessageHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(0.5),
    },
    senderName: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        marginLeft: wp(2),
    },
    messageBubble: {
        maxWidth: wp(70),
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
        borderRadius: theme.radius.xl,
    },
    ownBubble: {
        backgroundColor: theme.colors.primary,
        borderBottomRightRadius: theme.radius.sm,
    },
    otherBubble: {
        backgroundColor: theme.colors.gray,
        borderBottomLeftRadius: theme.radius.sm,
    },
    messageText: {
        fontSize: hp(1.6),
        lineHeight: hp(2.2),
    },
    ownText: {
        color: 'white',
    },
    otherText: {
        color: theme.colors.text,
    },
    messageImage: {
        width: wp(60),
        height: hp(30),
        borderRadius: theme.radius.lg,
        marginBottom: hp(0.5),
    },
    messageVideo: {
        width: wp(60),
        height: hp(30),
        borderRadius: theme.radius.lg,
        marginBottom: hp(0.5),
    },
    messageTime: {
        fontSize: hp(1.2),
        marginTop: hp(0.5),
    },
    ownTime: {
        color: 'rgba(255,255,255,0.7)',
    },
    otherTime: {
        color: theme.colors.textLight,
    },
    inputContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        borderTopWidth: 1,
        borderTopColor: theme.colors.gray,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.gray,
        borderRadius: theme.radius.xl,
        paddingHorizontal: wp(3),
        paddingVertical: hp(0.8),
        minHeight: hp(5),
    },
    textInput: {
        flex: 1,
        fontSize: hp(1.6),
        color: theme.colors.text,
        maxHeight: hp(10),
        paddingVertical: hp(0.5),
        textAlignVertical: 'center',
    },
    sendButton: {
        marginLeft: wp(2),
        padding: hp(0.5),
    },
});