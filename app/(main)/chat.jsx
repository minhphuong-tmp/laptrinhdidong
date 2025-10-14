import { Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
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

    const handleImagePicker = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.7,
            });

            if (!result.canceled && result.assets[0]) {
                // TODO: Upload image và gửi tin nhắn
                console.log('Selected image:', result.assets[0].uri);
                Alert.alert('Thông báo', 'Chức năng gửi ảnh đang được phát triển');
            }
        } catch (error) {
            console.error('Error picking image:', error);
            Alert.alert('Lỗi', 'Không thể chọn ảnh');
        }
    };

    const handleVideoPicker = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                allowsEditing: true,
                quality: 0.7,
            });

            if (!result.canceled && result.assets[0]) {
                // TODO: Upload video và gửi tin nhắn
                console.log('Selected video:', result.assets[0].uri);
                Alert.alert('Thông báo', 'Chức năng gửi video đang được phát triển');
            }
        } catch (error) {
            console.error('Error picking video:', error);
            Alert.alert('Lỗi', 'Không thể chọn video');
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

                <View style={[
                    styles.messageRow,
                    isOwn ? styles.ownMessage : styles.otherMessage
                ]}>
                    {!isOwn && (
                        <Avatar
                            uri={message.sender?.image}
                            size={hp(3)}
                            rounded={true}
                        />
                    )}

                    <View style={[
                        styles.bubbleWrapper,
                        isOwn ? styles.ownBubbleWrapper : styles.otherBubbleWrapper
                    ]}>
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
        <ScreenWrapper bg={theme.colors.background}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
            >
                {/* Messenger Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Icon name="arrowLeft" size={hp(2.5)} color={theme.colors.text} />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.headerInfo}>
                        {conversation?.type === 'group' ? (
                            <GroupAvatar
                                members={conversation.conversation_members || []}
                                size={hp(4)}
                            />
                        ) : (
                            <Avatar
                                uri={getConversationAvatar()}
                                size={hp(4)}
                                rounded={theme.radius.full}
                            />
                        )}
                        <View style={styles.headerText}>
                            <Text style={styles.headerTitle}>{getConversationName()}</Text>
                            <Text style={styles.headerSubtitle}>
                                {conversation?.type === 'group' ? 'Nhóm' : 'Đang hoạt động'}
                            </Text>
                        </View>
                    </TouchableOpacity>

                    <View style={styles.headerActions}>
                        <TouchableOpacity style={styles.headerActionButton}>
                            <Icon name="video" size={hp(2.5)} color={theme.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerActionButton}>
                            <Icon name="phone" size={hp(2.5)} color={theme.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.headerActionButton}>
                            <Icon name="threeDotsHorizontal" size={hp(2.5)} color={theme.colors.text} />
                        </TouchableOpacity>
                    </View>
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
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                />

                {/* Messenger Input */}
                <View style={styles.inputContainer}>
                    <View style={styles.inputWrapper}>
                        <View style={styles.textInputContainer}>
                            <TextInput
                                style={styles.textInput}
                                value={messageText}
                                onChangeText={setMessageText}
                                placeholder="Nhập tin nhắn..."
                                placeholderTextColor={theme.colors.textSecondary}
                                multiline
                                maxLength={1000}
                            />
                        </View>

                        {messageText.trim() ? (
                            <TouchableOpacity
                                style={styles.sendButton}
                                onPress={sendMessageHandler}
                                disabled={sending}
                            >
                                {sending ? (
                                    <Loading size="small" />
                                ) : (
                                    <Icon
                                        name="send"
                                        size={hp(2.2)}
                                        color={theme.colors.primary}
                                    />
                                )}
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.inputActions}>
                                <TouchableOpacity
                                    style={styles.inputActionButton}
                                    onPress={handleImagePicker}
                                >
                                    <Icon name="image" size={hp(2.5)} color={theme.colors.textSecondary} />
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.inputActionButton}
                                    onPress={handleVideoPicker}
                                >
                                    <Icon name="video" size={hp(2.5)} color={theme.colors.textSecondary} />
                                </TouchableOpacity>
                            </View>
                        )}
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
        backgroundColor: theme.colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
    },

    // Messenger Header
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        ...theme.shadows.small,
    },
    backButton: {
        padding: wp(2),
        marginRight: wp(2),
    },
    headerInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerText: {
        marginLeft: wp(3),
        flex: 1,
    },
    headerTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
    },
    headerSubtitle: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    headerActionButton: {
        padding: wp(2),
        marginLeft: wp(1),
    },

    // Messages
    messagesList: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    messagesContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        paddingBottom: hp(2),
    },
    messageContainer: {
        marginVertical: hp(0.7),
    },
    ownMessage: {
        alignItems: 'flex-end',
    },
    otherMessage: {
        alignItems: 'flex-start',
    },
    bubbleWrapper: {
        flex: 1,
    },
    ownBubbleWrapper: {
        alignItems: 'flex-end',
    },
    otherBubbleWrapper: {
        alignItems: 'flex-start',
        marginLeft: 4,
    },
    otherBubble: {
        backgroundColor: theme.colors.backgroundSecondary,
        borderBottomLeftRadius: theme.radius.sm,
        maxWidth: wp(70),
        marginTop: 10,
    },
    messageRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    senderName: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        marginLeft: wp(8), // Căn với bong bóng chat
        marginBottom: hp(0.3),
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
        maxWidth: wp(70),
    },
    otherBubble: {
        backgroundColor: theme.colors.backgroundSecondary,
        borderBottomLeftRadius: theme.radius.sm,
        maxWidth: wp(70),
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
    // Messenger Input
    inputContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
        paddingHorizontal: wp(3),
        paddingVertical: hp(0.8),
        minHeight: hp(5),
    },
    inputActionButton: {
        padding: wp(2),
        marginRight: wp(1),
    },
    textInputContainer: {
        flex: 1,
        marginHorizontal: wp(1),
    },
    textInput: {
        fontSize: hp(1.6),
        color: theme.colors.text,
        maxHeight: hp(10),
        paddingVertical: hp(1.2),
        textAlignVertical: 'center',
    },
    inputActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    sendButton: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.full,
        width: hp(4),
        height: hp(4),
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: wp(2),
    },
});