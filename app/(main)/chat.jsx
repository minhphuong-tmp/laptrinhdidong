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
import CallManager from '../../services/callManager';
import {
    deleteConversation,
    getConversationById,
    getMessages,
    markConversationAsRead,
    sendMessage,
    uploadMediaFile
} from '../../services/chatService';

const ChatScreen = () => {
    const { conversationId } = useLocalSearchParams();
    const { user } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const [conversation, setConversation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [playingVideo, setPlayingVideo] = useState(null);
    const videoRefs = useRef({});
    const [messageText, setMessageText] = useState('');
    const flatListRef = useRef(null);
    const [imageLoading, setImageLoading] = useState({});

    useEffect(() => {
        if (conversationId) {
            // Reset states when entering conversation
            setImageLoading({});
            setPlayingVideo(null);

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

                    // Scroll to bottom for new messages
                    setTimeout(() => {
                        flatListRef.current?.scrollToEnd({ animated: true });
                    }, 200);

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

            // Reset image loading states when loading messages
            setImageLoading({});

            // Pre-mark images as loaded if they're from cache
            const imageMessages = res.data.filter(msg => msg.message_type === 'image');
            const preLoadedImages = {};
            imageMessages.forEach(msg => {
                preLoadedImages[msg.id] = false; // Mark as already loaded
            });
            setImageLoading(preLoadedImages);

            // Scroll to bottom after loading messages
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 300);
        }
    };


    const markAsRead = async () => {
        if (user?.id) {
            const result = await markConversationAsRead(conversationId, user.id);
            if (result.success) {
                console.log('Marked as read');
            }
        }
    };

    const handleImageLoadStart = (messageId) => {
        // Only show loading if not already loaded
        setImageLoading(prev => {
            if (prev[messageId] === false) return prev; // Already loaded
            return { ...prev, [messageId]: true };
        });
    };

    const handleImageLoadEnd = (messageId) => {
        setImageLoading(prev => ({ ...prev, [messageId]: false }));
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
                const image = result.assets[0];

                // Kiểm tra kích thước file (10MB cho ảnh)
                if (image.fileSize && image.fileSize > 10 * 1024 * 1024) {
                    Alert.alert('Lỗi', 'Ảnh quá lớn. Vui lòng chọn ảnh nhỏ hơn 10MB');
                    return;
                }

                console.log('Selected image:', image);
                await sendMediaMessage(image, 'image');
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
                quality: 0.05, // Giảm quality cực thấp để nén mạnh nhất
                videoMaxDuration: 30, // Giới hạn 30 giây
            });

            if (!result.canceled && result.assets[0]) {
                const video = result.assets[0];

                // Kiểm tra kích thước file (30MB)
                if (video.fileSize && video.fileSize > 30 * 1024 * 1024) {
                    Alert.alert('Lỗi', 'Video quá lớn. Vui lòng chọn video nhỏ hơn 30MB');
                    return;
                }

                console.log('Selected video:', {
                    uri: video.uri,
                    fileSize: video.fileSize,
                    fileSizeMB: video.fileSize ? (video.fileSize / (1024 * 1024)).toFixed(2) + 'MB' : 'Unknown',
                    duration: video.duration,
                    width: video.width,
                    height: video.height
                });
                await sendMediaMessage(video, 'video');
            }
        } catch (error) {
            console.error('Error picking video:', error);
            Alert.alert('Lỗi', 'Không thể chọn video');
        }
    };

    const sendMediaMessage = async (file, type) => {
        if (!file || uploading) return;

        setUploading(true);
        console.log('Sending', type, 'message...');

        try {
            // Tạo timeout cho upload (60 giây)
            const uploadPromise = uploadMediaFile(file, type);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Upload timeout')), 60000)
            );

            const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);

            if (!uploadResult.success) {
                Alert.alert('Lỗi', uploadResult.msg || 'Không thể upload file');
                setUploading(false);
                return;
            }

            // Gửi tin nhắn với file_url
            const messageResult = await sendMessage({
                conversation_id: conversationId,
                sender_id: user.id,
                content: type === 'image' ? '📷 Hình ảnh' : '🎥 Video',
                message_type: type,
                file_url: uploadResult.data.file_url
            });

            if (messageResult.success) {
                console.log('Media message sent successfully');

                // Thêm tin nhắn vào danh sách ngay lập tức
                const newMessage = {
                    ...messageResult.data,
                    sender: {
                        id: user.id,
                        name: user.name,
                        image: user.image
                    }
                };
                setMessages(prev => [...prev, newMessage]);

                // Scroll to bottom with longer delay for media
                setTimeout(() => {
                    flatListRef.current?.scrollToEnd({ animated: true });
                }, 500);
            } else {
                Alert.alert('Lỗi', messageResult.msg || 'Không thể gửi tin nhắn');
            }
        } catch (error) {
            console.error('Error sending media message:', error);
            if (error.message === 'Upload timeout') {
                Alert.alert('Lỗi', 'Upload quá lâu. Vui lòng thử lại với video nhỏ hơn');
            } else {
                Alert.alert('Lỗi', 'Không thể gửi tin nhắn: ' + error.message);
            }
        } finally {
            setUploading(false);
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

    const getOtherUserId = () => {
        if (!conversation) return null;

        if (conversation.type === 'group') {
            return null; // Group calls not supported yet
        }

        const otherMember = conversation.conversation_members?.find(
            member => member.user_id !== user.id
        );
        return otherMember?.user_id || null;
    };

    const handleVoiceCall = async () => {
        console.log('🔊 handleVoiceCall started - BEFORE TRY');
        try {
            console.log('🔊 handleVoiceCall started - INSIDE TRY');
            const otherUserId = getOtherUserId();
            console.log('🔊 otherUserId:', otherUserId);

            if (!otherUserId) {
                console.log('❌ No otherUserId found');
                Alert.alert('Lỗi', 'Không thể xác định người nhận cuộc gọi');
                return;
            }

            console.log('🔊 Starting voice call...');
            console.log('🔊 CallManager:', CallManager);
            console.log('🔊 user.id:', user?.id);
            console.log('🔊 conversationId:', conversationId);

            // Check if CallManager is initialized
            if (!CallManager.currentUserId) {
                console.log('❌ CallManager not initialized, initializing now...');
                try {
                    const initResult = await CallManager.initialize(user.id, {
                        onIncomingCall: (call) => {
                            console.log('📞 Incoming call:', call);
                        },
                        onCallEnded: (call) => {
                            console.log('📞 Call ended:', call);
                        }
                    });
                    console.log('🔊 CallManager init result:', initResult);
                } catch (initError) {
                    console.error('❌ CallManager init error:', initError);
                    Alert.alert('Lỗi', 'Không thể khởi tạo CallManager: ' + initError.message);
                    return;
                }
            }

            console.log('🔊 About to call CallManager.startCall...');
            const result = await CallManager.startCall(conversationId, otherUserId, 'voice');
            console.log('🔊 CallManager.startCall result:', result);

            if (result.success) {
                console.log('✅ CallManager.startCall SUCCESS - Opening call...');
                try {
                    if (result.webrtcCall) {
                        console.log('🔊 Using real WebRTC call screen');
                        router.push({
                            pathname: '/realCallScreen',
                            params: {
                                conversationId: conversationId,
                                otherUserId: otherUserId,
                                callType: 'voice',
                                isIncoming: false,
                                callerName: getConversationName(),
                                callerAvatar: getConversationAvatar()
                            }
                        });
                    } else if (result.webCall) {
                        console.log('🌐 Using web call screen');
                        router.push({
                            pathname: '/webCallScreen',
                            params: {
                                conversationId: conversationId,
                                otherUserId: otherUserId,
                                callType: 'voice',
                                isIncoming: false,
                                callerName: getConversationName(),
                                callerAvatar: getConversationAvatar()
                            }
                        });
                    } else {
                        console.log('🔊 Using default call screen');
                        router.push({
                            pathname: '/callScreen',
                            params: {
                                conversationId: conversationId,
                                otherUserId: otherUserId,
                                callType: 'voice',
                                isIncoming: false,
                                callerName: getConversationName(),
                                callerAvatar: getConversationAvatar()
                            }
                        });
                    }
                } catch (navigationError) {
                    console.error('❌ Navigation error:', navigationError);
                    Alert.alert('Lỗi', 'Không thể mở màn hình gọi điện');
                }
            } else {
                console.error('❌ CallManager.startCall FAILED:', result.error);
                Alert.alert('Lỗi', result.error || 'Không thể bắt đầu cuộc gọi');
            }
        } catch (error) {
            console.error('❌ Voice call error:', error);
            console.error('❌ Error stack:', error.stack);
            console.error('❌ Error details:', {
                message: error.message,
                name: error.name,
                code: error.code
            });
            Alert.alert('Lỗi chi tiết', `Lỗi: ${error.message}\nTên: ${error.name}\nCode: ${error.code}`);
        }
    };

    const handleVideoCall = async () => {
        try {
            const otherUserId = getOtherUserId();
            if (!otherUserId) {
                Alert.alert('Lỗi', 'Không thể xác định người nhận cuộc gọi');
                return;
            }

            console.log('📹 Starting video call...');
            const result = await CallManager.startCall(conversationId, otherUserId, 'video');

            if (result.success) {
                console.log('✅ CallManager.startCall SUCCESS - Opening call...');
                try {
                    if (result.webrtcCall) {
                        console.log('📹 Using real WebRTC call screen');
                        router.push({
                            pathname: '/realCallScreen',
                            params: {
                                conversationId: conversationId,
                                otherUserId: otherUserId,
                                callType: 'video',
                                isIncoming: false,
                                callerName: getConversationName(),
                                callerAvatar: getConversationAvatar()
                            }
                        });
                    } else {
                        console.log('🌐 Using web call screen');
                        router.push({
                            pathname: '/webCallScreen',
                            params: {
                                conversationId: conversationId,
                                otherUserId: otherUserId,
                                callType: 'video',
                                isIncoming: false,
                                callerName: getConversationName(),
                                callerAvatar: getConversationAvatar()
                            }
                        });
                    }
                } catch (navigationError) {
                    console.error('❌ Navigation error:', navigationError);
                    Alert.alert('Lỗi', 'Không thể mở màn hình gọi video');
                }
            } else {
                console.error('❌ CallManager.startCall FAILED:', result.error);
                Alert.alert('Lỗi', result.error || 'Không thể bắt đầu cuộc gọi video');
            }
        } catch (error) {
            console.error('❌ Video call error:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi bắt đầu cuộc gọi video');
        }
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
                        {message.message_type === 'image' ? (
                            <View style={styles.imageContainer}>
                                {imageLoading[message.id] && (
                                    <View style={styles.imageLoadingOverlay}>
                                        <Loading size="small" />
                                    </View>
                                )}
                                <Image
                                    source={{ uri: message.file_url }}
                                    style={styles.messageImage}
                                    resizeMode="cover"
                                    onLoadStart={() => handleImageLoadStart(message.id)}
                                    onLoad={() => {
                                        handleImageLoadEnd(message.id);
                                        console.log('Image loaded successfully:', message.file_url);
                                    }}
                                    onError={(error) => {
                                        handleImageLoadEnd(message.id);
                                        console.log('Image load error:', error);
                                        console.log('Image URL:', message.file_url);
                                    }}
                                />
                            </View>
                        ) : message.message_type === 'video' ? (
                            <TouchableOpacity
                                style={styles.videoContainer}
                                onPress={() => {
                                    const videoId = message.id;
                                    console.log('Video pressed, current playing:', playingVideo, 'videoId:', videoId);

                                    if (playingVideo === videoId) {
                                        // Pause video
                                        console.log('Pausing video');
                                        setPlayingVideo(null);
                                        videoRefs.current[videoId]?.pauseAsync();
                                    } else {
                                        // Play video
                                        console.log('Playing video');
                                        setPlayingVideo(videoId);
                                        videoRefs.current[videoId]?.playAsync();
                                    }
                                }}
                            >
                                <Video
                                    ref={(ref) => {
                                        if (ref) {
                                            videoRefs.current[message.id] = ref;
                                            console.log('Video ref set for:', message.id);
                                        }
                                    }}
                                    source={{ uri: message.file_url }}
                                    style={styles.messageVideo}
                                    useNativeControls={true}
                                    resizeMode="cover"
                                    shouldPlay={playingVideo === message.id}
                                    onPlaybackStatusUpdate={(status) => {
                                        console.log('Video status:', status.isPlaying, 'for video:', message.id);
                                    }}
                                    isLooping={false}
                                    onError={(error) => {
                                        console.log('Video load error:', error);
                                        console.log('Video URL:', message.file_url);
                                    }}
                                    onLoad={() => {
                                        console.log('Video loaded successfully:', message.file_url);
                                        console.log('Video message type:', message.message_type);
                                        console.log('Video file_url exists:', !!message.file_url);
                                    }}
                                />
                                {playingVideo !== message.id && (
                                    <View style={styles.playButtonOverlay}>
                                        <Text style={styles.playButtonText}>▶</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ) : (
                            <View style={[
                                styles.messageBubble,
                                isOwn ? styles.ownBubble : styles.otherBubble
                            ]}>

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
                        )}

                        {/* Thời gian cho ảnh và video */}
                        {(message.message_type === 'image' || message.message_type === 'video') && (
                            <Text style={[
                                styles.messageTime,
                                isOwn ? styles.ownTime : styles.otherTime,
                                { marginTop: hp(0.5) }
                            ]}>
                                {moment(message.created_at).format('HH:mm')}
                                {message.is_edited && ' (đã chỉnh sửa)'}
                            </Text>
                        )}
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
                        <TouchableOpacity
                            style={[styles.headerActionButton, styles.callButton]}
                            onPress={handleVoiceCall}
                        >
                            <Icon name="call" size={hp(2.5)} color={theme.colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.headerActionButton, styles.videoCallButton]}
                            onPress={handleVideoCall}
                        >
                            <Icon name="video" size={hp(2.5)} color={theme.colors.primary} />
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
                    onContentSizeChange={() => {
                        // Delay scroll for media messages
                        setTimeout(() => {
                            flatListRef.current?.scrollToEnd({ animated: true });
                        }, 100);
                    }}
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
                                disabled={sending || uploading}
                            >
                                {sending ? (
                                    <Loading size="small" />
                                ) : (
                                    <Icon
                                        name="send"
                                        size={hp(2.2)}
                                        color="white"
                                    />
                                )}
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.inputActions}>
                                <TouchableOpacity
                                    style={[styles.inputActionButton, uploading && styles.disabledButton]}
                                    onPress={handleImagePicker}
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <Loading size="small" />
                                    ) : (
                                        <Icon name="image" size={hp(2.5)} color={theme.colors.textSecondary} />
                                    )}
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.inputActionButton, uploading && styles.disabledButton]}
                                    onPress={handleVideoPicker}
                                    disabled={uploading}
                                >
                                    {uploading ? (
                                        <Loading size="small" />
                                    ) : (
                                        <Icon name="video" size={hp(2.5)} color={theme.colors.textSecondary} />
                                    )}
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
    callButton: {
        backgroundColor: theme.colors.primary + '15', // 15% opacity
        borderRadius: theme.radius.full,
        padding: wp(2.5),
        marginLeft: wp(2),
    },
    videoCallButton: {
        backgroundColor: theme.colors.primary + '15', // 15% opacity
        borderRadius: theme.radius.full,
        padding: wp(2.5),
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
    imageContainer: {
        position: 'relative',
        width: wp(60),
        height: hp(30),
        borderRadius: theme.radius.lg,
    },
    messageImage: {
        width: '100%',
        height: '100%',
        borderRadius: theme.radius.lg,
        backgroundColor: 'transparent',
    },
    imageLoadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: theme.radius.lg,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1,
    },
    videoContainer: {
        position: 'relative',
        width: wp(60),
        height: hp(30),
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
    },
    messageVideo: {
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
    },
    playButtonOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: theme.radius.lg,
    },
    playButtonText: {
        fontSize: 40,
        color: 'white',
        fontWeight: 'bold',
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
    disabledButton: {
        opacity: 0.5,
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