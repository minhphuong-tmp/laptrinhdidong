import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import moment from 'moment';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    AppState,
    FlatList,
    Image,
    InteractionManager,
    KeyboardAvoidingView,
    Modal,
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
import pinService from '../../services/pinService';
import { canRenderPlaintext, getSafeDisplayText } from '../../utils/messageValidation';
import performanceMetrics from '../../utils/performanceMetrics';

// Component for call declined message
const CallDeclinedMessage = ({ message, conversationId, conversation, getOtherUserId, router, currentUserId }) => {
    const getCallType = () => {
        try {
            const callData = typeof message.content === 'string'
                ? JSON.parse(message.content)
                : message.content;
            return callData?.call_type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi nhỡ';
        } catch {
            return 'Cuộc gọi nhỡ';
        }
    };

    const isOwn = message.sender_id === currentUserId;

    return (
        <View style={[
            styles.bubbleWrapper,
            isOwn ? styles.ownBubbleWrapper : styles.otherBubbleWrapper
        ]}>
            <View style={[
                styles.messageBubble,
                styles.otherBubble
            ]}>
                <View style={styles.callEndInline}>
                    <Icon name="call" size={hp(1.8)} color={theme.colors.text} />
                    <Text style={[
                        styles.callEndTypeInline,
                        styles.otherText
                    ]}>
                        {getCallType()}
                    </Text>
                </View>

                <View style={styles.callEndBottomRow}>
                    <Text style={[
                        styles.messageTime,
                        styles.otherTime,
                        styles.callEndTimeInline
                    ]}>
                        {moment(message.created_at).format('HH:mm')}
                    </Text>
                    <Text style={[
                        styles.callEndDurationInline,
                        styles.otherText
                    ]}>
                        Đã từ chối
                    </Text>
                    <TouchableOpacity
                        style={styles.callBackButtonInline}
                        onPress={() => {
                            const otherUserId = getOtherUserId();
                            if (otherUserId) {
                                try {
                                    const callData = typeof message.content === 'string'
                                        ? JSON.parse(message.content)
                                        : message.content;
                                    router.push({
                                        pathname: '/callScreen',
                                        params: {
                                            callType: callData?.call_type || 'voice',
                                            conversationId: conversationId,
                                            isIncoming: false,
                                            callerName: conversation?.otherUser?.name || 'Unknown',
                                            callerAvatar: conversation?.otherUser?.image
                                        }
                                    });
                                } catch (e) {
                                    console.log('Error navigating to call:', e);
                                }
                            }
                        }}
                    >
                        <Text style={styles.callBackTextInline}>Gọi lại</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

// Component for call end message
const CallEndMessage = ({ message, conversationId, conversation, getOtherUserId, router, currentUserId }) => {
    const [callDuration, setCallDuration] = useState(null);

    useEffect(() => {
        // Try to get actual duration from call_requests table
        const fetchCallDuration = async () => {
            try {
                // Parse call data from message
                const callData = typeof message.content === 'string'
                    ? JSON.parse(message.content)
                    : message.content;

                // First, try to use duration from message content (most accurate)
                // This duration was saved when the call ended
                if (callData?.duration && callData.duration > 0) {
                    setCallDuration(callData.duration);
                    return;
                }

                // If message content doesn't have duration or it's 0, query database
                // Compare message.created_at (when call ended) with call_requests.ended_at
                const messageTime = new Date(message.created_at);
                const startTime = new Date(messageTime.getTime() - 300000); // 5 minutes before (wider range)
                const endTime = new Date(messageTime.getTime() + 300000); // 5 minutes after

                const { data: callRequests, error } = await supabase
                    .from('call_requests')
                    .select('duration, call_type, answered_at, ended_at, created_at, id')
                    .eq('conversation_id', conversationId)
                    .not('ended_at', 'is', null) // Only get calls that have ended
                    .gte('ended_at', startTime.toISOString())
                    .lte('ended_at', endTime.toISOString())
                    .order('ended_at', { ascending: false })
                    .limit(10); // Get more calls to find the best match

                if (!error && callRequests && callRequests.length > 0) {
                    // Find the call that matches the message time most closely
                    // Compare with ended_at instead of created_at
                    let bestMatch = callRequests[0];
                    let minTimeDiff = Math.abs(new Date(bestMatch.ended_at).getTime() - messageTime.getTime());

                    for (const call of callRequests) {
                        if (call.ended_at) {
                            const timeDiff = Math.abs(new Date(call.ended_at).getTime() - messageTime.getTime());
                            if (timeDiff < minTimeDiff) {
                                minTimeDiff = timeDiff;
                                bestMatch = call;
                            }
                        }
                    }

                    console.log('📞 Found matching call:', {
                        callId: bestMatch.id,
                        ended_at: bestMatch.ended_at,
                        messageTime: messageTime.toISOString(),
                        timeDiffSeconds: minTimeDiff / 1000
                    });

                    let actualDuration = bestMatch.duration || 0;

                    // Always recalculate from timestamps if available (more accurate)
                    if (bestMatch.answered_at && bestMatch.ended_at) {
                        const answeredTime = new Date(bestMatch.answered_at);
                        const endedTime = new Date(bestMatch.ended_at);
                        const calculatedDuration = Math.floor((endedTime.getTime() - answeredTime.getTime()) / 1000);
                        if (calculatedDuration >= 0) { // Allow 0 duration (call ended immediately)
                            actualDuration = calculatedDuration;
                            console.log('📞 Calculated duration from timestamps:', actualDuration, 'seconds', {
                                answered_at: bestMatch.answered_at,
                                ended_at: bestMatch.ended_at
                            });
                        }
                    }

                    if (actualDuration >= 0) { // Allow 0 duration
                        console.log('📞 Using duration from database:', actualDuration, 'seconds');
                        setCallDuration(actualDuration);
                    } else {
                        console.log('⚠️ Duration is negative, using 0');
                        setCallDuration(0);
                    }
                } else {
                    // Fallback to duration from message content (even if 0)
                    setCallDuration(callData?.duration || 0);
                }
            } catch (e) {
                console.log('Error fetching call duration:', e);
                // Fallback to duration from message content
                try {
                    const callData = typeof message.content === 'string'
                        ? JSON.parse(message.content)
                        : message.content;
                    setCallDuration(callData?.duration || 0);
                } catch {
                    setCallDuration(0);
                }
            }
        };

        fetchCallDuration();
    }, [message, conversationId]);

    const formatDuration = (duration) => {
        if (duration === null) return '...';
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

    const getCallType = () => {
        try {
            const callData = typeof message.content === 'string'
                ? JSON.parse(message.content)
                : message.content;
            return callData?.call_type === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
        } catch {
            return 'Cuộc gọi thoại';
        }
    };

    const isOwn = message.sender_id === currentUserId;

    return (
        <View style={[
            styles.bubbleWrapper,
            isOwn ? styles.ownBubbleWrapper : styles.otherBubbleWrapper
        ]}>
            <View style={[
                styles.messageBubble,
                styles.otherBubble
            ]}>
                <View style={styles.callEndInline}>
                    <Icon name="call" size={hp(1.8)} color={theme.colors.text} />
                    <Text style={[
                        styles.callEndTypeInline,
                        styles.otherText
                    ]}>
                        {getCallType()}
                    </Text>
                </View>

                <View style={styles.callEndBottomRow}>
                    <Text style={[
                        styles.messageTime,
                        styles.otherTime,
                        styles.callEndTimeInline
                    ]}>
                        {moment(message.created_at).format('HH:mm')}
                    </Text>
                    <Text style={[
                        styles.callEndDurationInline,
                        styles.otherText
                    ]}>
                        {formatDuration(callDuration)}
                    </Text>
                    <TouchableOpacity
                        style={styles.callBackButtonInline}
                        onPress={() => {
                            const otherUserId = getOtherUserId();
                            if (otherUserId) {
                                try {
                                    const callData = typeof message.content === 'string'
                                        ? JSON.parse(message.content)
                                        : message.content;
                                    router.push({
                                        pathname: '/callScreen',
                                        params: {
                                            callType: callData?.call_type || 'voice',
                                            conversationId: conversationId,
                                            isIncoming: false,
                                            callerName: conversation?.otherUser?.name || 'Unknown',
                                            callerAvatar: conversation?.otherUser?.image
                                        }
                                    });
                                } catch (e) {
                                    console.log('Error navigating to call:', e);
                                }
                            }
                        }}
                    >
                        <Text style={styles.callBackTextInline}>Gọi lại</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const ChatScreen = () => {
    const { conversationId } = useLocalSearchParams();
    const { user } = useAuth();
    const router = useRouter();
    const [messages, setMessages] = useState([]);
    const messagesRef = useRef([]); // Ref để lưu messages hiện tại cho decryptAllMessages
    const [conversation, setConversation] = useState(null);

    // Sync messagesRef với messages state
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [playingVideo, setPlayingVideo] = useState(null);
    const videoRefs = useRef({});
    const [messageText, setMessageText] = useState('');
    const [pinUnlocked, setPinUnlocked] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [showSetupPinModal, setShowSetupPinModal] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinConfirmInput, setPinConfirmInput] = useState('');
    const [pinError, setPinError] = useState('');
    const [isPinSet, setIsPinSet] = useState(false);
    const flatListRef = useRef(null);
    // Track xem user có đang scroll tay không - ngăn auto scroll khi user đang tương tác
    const isUserScrollingRef = useRef(false);
    // Track vị trí scroll để chỉ auto scroll khi user gần cuối danh sách (< 100px)
    const [isNearBottom, setIsNearBottom] = useState(true);
    // Ref để lưu timeout cho debounce scroll - tránh gọi scrollToEnd nhiều lần liên tiếp
    const scrollTimeoutRef = useRef(null);
    const [imageLoading, setImageLoading] = useState({});
    const loadTimeRef = useRef(null);
    const logHasRun = useRef(false);
    const messageLoadLogHasRun = useRef(false);
    const initialMessageCount = useRef(null);
    const loadedImageIds = useRef(new Set());
    const loadedVideoIds = useRef(new Set());
    const imagesToLoad = useRef(new Set());
    const videosToLoad = useRef(new Set());
    const imageLoadTimes = useRef([]); // Lưu thời gian load từng ảnh
    const videoLoadTimes = useRef([]); // Lưu thời gian load từng video

    // === Thời gian load toàn màn chat (from mount to load xong list) ===
    useEffect(() => {
        if (messages.length > 0 && !loading && loadTimeRef.current && !messageLoadLogHasRun.current) {
            messageLoadLogHasRun.current = true;
        }
    }, [messages, loading]);

    useEffect(() => {
        if (conversationId) {
            // Reset states when entering conversation
            setImageLoading({});
            setPlayingVideo(null);
            // Reset scroll flag khi vào conversation mới - cho phép auto scroll
            isUserScrollingRef.current = false;
            setIsNearBottom(true); // Reset về true khi vào conversation mới - đảm bảo scroll xuống cuối

            // Clear messages state trước khi load để tránh conflict khi merge
            setMessages([]);

            loadConversation();
            loadMessages();
            markAsRead();
        }

        // Cleanup: Clear messages khi unmount để tránh conflict khi vào lại
        return () => {
            if (conversationId) {
                messagesRef.current = [];
                setMessages([]);
            }
        };
    }, [conversationId]);

    useEffect(() => {
        if (!conversationId) return;

        const handleRealtimeMessage = async (message) => {
            // Lấy device ID hiện tại
            const deviceService = require('../../services/deviceService').default;
            const deviceId = await deviceService.getOrCreateDeviceId();

            // Nếu là tin nhắn mình gửi:
            // - Chỉ nhận sender copy (is_sender_copy = true) để decrypt và hiển thị
            // - Bỏ qua receiver message (is_sender_copy = false) vì đã được thêm từ sendMessageHandler
            // - Ngoại trừ call_end và call_declined messages: luôn hiển thị (không cần decrypt)
            if (message.sender_id === user.id) {
                // Call_end and call_declined messages không cần decrypt, hiển thị trực tiếp
                if (message.message_type === 'call_end' || message.message_type === 'call_declined') {
                    // Fetch đầy đủ thông tin sender cho tin nhắn mới
                    const { data: messageWithSender, error } = await supabase
                        .from('messages')
                        .select(`
                            *,
                            sender:users(id, name, image)
                        `)
                        .eq('id', message.id)
                        .single();

                    if (error) {
                        return; // Bỏ qua nếu không fetch được
                    }

                    // FIX: Tuyệt đối không push message vào state nếu message đó đã tồn tại (check id)
                    setMessages(prev => {
                        const existingIndex = prev.findIndex(msg => msg.id === messageWithSender.id);
                        let newMessages;
                        if (existingIndex !== -1) {
                            // Đã có → merge với existing message, PRESERVE runtime_plain_text
                            const existingMessage = prev[existingIndex];
                            newMessages = [...prev];

                            // CRITICAL: Preserve runtime_plain_text từ existing message nếu có
                            if (existingMessage.runtime_plain_text && !messageWithSender.runtime_plain_text) {
                                newMessages[existingIndex] = {
                                    ...messageWithSender,
                                    runtime_plain_text: existingMessage.runtime_plain_text,
                                    is_encrypted: false
                                };
                                console.log(`[REALTIME_MERGE] Preserved runtime_plain_text for message ${messageWithSender.id} from existing message`);
                            } else {
                                newMessages[existingIndex] = messageWithSender;
                            }
                            newMessages = mergeMessages(newMessages);
                        } else {
                            // Chưa có → thêm vào (chỉ khi thực sự là message mới)
                            newMessages = mergeMessages([...prev, messageWithSender]);
                        }

                        // CRITICAL: Sync messagesRef ngay lập tức
                        messagesRef.current = newMessages;
                        return newMessages;
                    });

                    return;
                }

                // Nhận sender copy từ mọi device (cả device hiện tại và device khác)
                if (message.is_sender_copy === true) {
                    const senderDeviceId = message.sender_device_id;
                    const isFromCurrentDevice = senderDeviceId === deviceId;

                    // Fetch đầy đủ thông tin sender cho tin nhắn mới
                    const { data: messageWithSender, error } = await supabase
                        .from('messages')
                        .select(`
                            *,
                            sender:users(id, name, image)
                        `)
                        .eq('id', message.id)
                        .single();

                    if (error) {
                        return; // Bỏ qua nếu không fetch được
                    }

                    // NEW ARCHITECTURE: Decrypt bằng ConversationKey
                    // ConversationKey có thể có trong cache (device hiện tại) hoặc cần PIN unlock (device khác)
                    let decryptedMessage = messageWithSender;
                    // CRITICAL: CHỈ decrypt messages có encryption_version >= 3 (ConversationKey architecture)
                    // Messages cũ (v1/v2) được mã hóa bằng DeviceKey, KHÔNG thể decrypt bằng ConversationKey
                    if (messageWithSender.is_encrypted === true &&
                        messageWithSender.message_type === 'text' &&
                        messageWithSender.encryption_version != null &&
                        messageWithSender.encryption_version >= 3) { // CHỈ decrypt v3+ (phải check != null)
                        try {
                            const conversationKeyService = require('../../services/conversationKeyService').default;
                            const encryptionService = require('../../services/encryptionService').default;

                            // Lấy ConversationKey (ưu tiên cache, sau đó decrypt từ SecureStore nếu có PIN)
                            const conversationKey = await conversationKeyService.getConversationKey(conversationId);

                            if (conversationKey) {
                                // Decrypt bằng ConversationKey
                                const decryptedContent = await encryptionService.decryptMessageWithConversationKey(
                                    messageWithSender.content,
                                    conversationKey
                                );

                                if (decryptedContent && decryptedContent.trim() !== '') {
                                    decryptedMessage = {
                                        ...messageWithSender,
                                        runtime_plain_text: decryptedContent,
                                        decryption_error: false
                                    };
                                } else {
                                    // Không decrypt được → giữ nguyên encrypted
                                    decryptedMessage = {
                                        ...messageWithSender,
                                        runtime_plain_text: undefined,
                                        decryption_error: true
                                    };
                                }
                            } else {
                                // Không có ConversationKey → giữ nguyên encrypted (sẽ hiển thị placeholder)
                                decryptedMessage = {
                                    ...messageWithSender,
                                    runtime_plain_text: undefined,
                                    decryption_error: false
                                };
                            }
                        } catch (decryptError) {
                            console.error(`[REALTIME] Error decrypting message ${messageWithSender.id} (v${messageWithSender.encryption_version}):`, decryptError.message);
                            decryptedMessage = {
                                ...messageWithSender,
                                runtime_plain_text: undefined,
                                decryption_error: true
                            };
                        }
                    } else if (messageWithSender.is_encrypted === true &&
                        messageWithSender.message_type === 'text' &&
                        (messageWithSender.encryption_version == null || messageWithSender.encryption_version < 3)) {
                        // Message cũ (v1/v2) - không thể decrypt bằng ConversationKey
                        // Giữ nguyên encrypted, hiển thị placeholder
                        if (__DEV__) {
                            console.log(`[REALTIME] Skip legacy message ${messageWithSender.id} (encryption_version=${messageWithSender.encryption_version}, requires DeviceKey, not ConversationKey)`);
                        }
                        decryptedMessage = {
                            ...messageWithSender,
                            runtime_plain_text: undefined,
                            decryption_error: true
                        };
                    }

                    // Device-local plaintext authority: sender_copy và optimistic tồn tại độc lập
                    setMessages(prev => {
                        // #region agent log
                        const matchingOptimistic = prev.find(optMsg => optMsg.id?.startsWith('temp-') && optMsg.sender_id === decryptedMessage.sender_id);
                        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:549',message:'handleRealtimeMessage sender copy',data:{messageId:decryptedMessage.id,hasRuntimePlainText:!!decryptedMessage.runtime_plain_text,runtimePlainTextLength:decryptedMessage.runtime_plain_text?.length,hasMatchingOptimistic:!!matchingOptimistic,optimisticUiOptimisticText:matchingOptimistic?.ui_optimistic_text?.substring(0,20)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
                        // #endregion
                        // Kiểm tra message đã tồn tại chưa
                        const existingIndex = prev.findIndex(msg => msg.id === decryptedMessage.id);
                        let newMessages;

                        if (existingIndex !== -1) {
                            // Đã có → merge với existing message, PRESERVE runtime_plain_text
                            const existingMessage = prev[existingIndex];
                            newMessages = [...prev];

                            // CRITICAL: Preserve runtime_plain_text từ existing message nếu có
                            // runtime_plain_text là runtime-only data, không được overwrite từ server/realtime
                            if (existingMessage.runtime_plain_text && !decryptedMessage.runtime_plain_text) {
                                // Existing message đã có runtime_plain_text → preserve nó
                                newMessages[existingIndex] = {
                                    ...decryptedMessage,
                                    runtime_plain_text: existingMessage.runtime_plain_text,
                                    is_encrypted: false // Đã decrypt
                                };
                                console.log(`[REALTIME_MERGE] Preserved runtime_plain_text for message ${decryptedMessage.id} from existing message`);
                            } else if (decryptedMessage.runtime_plain_text) {
                                // New message có runtime_plain_text → dùng nó
                                newMessages[existingIndex] = decryptedMessage;
                            } else {
                                // Không có runtime_plain_text ở cả hai → dùng new message
                                newMessages[existingIndex] = decryptedMessage;
                            }

                            // FIX JUMPING: Không remove optimistic message ở đây nữa
                            // mergeMessages sẽ tự động ẩn optimistic khi có sender_copy với runtime_plain_text
                            // Việc này tránh thay đổi array length đột ngột gây jumping
                            newMessages = mergeMessages(newMessages);
                        } else {
                            // Chưa có → thêm sender_copy vào state
                            // Với inverted FlatList, message mới nhất phải ở index 0 → unshift vào đầu array
                            newMessages = mergeMessages([decryptedMessage, ...prev]);

                            // FIX JUMPING: Không remove optimistic message ở đây nữa
                            // mergeMessages sẽ tự động ẩn optimistic khi có sender_copy với runtime_plain_text
                            // Việc này tránh thay đổi array length đột ngột gây jumping
                        }

                        // CRITICAL: Sync messagesRef ngay lập tức
                        messagesRef.current = newMessages;
                        return newMessages;
                    });

                }
                // Bỏ qua receiver message (is_sender_copy = false) nếu là tin nhắn mình gửi
                // (dù từ device nào, vì đã có sender copy message)
                return;
            }

            // Nếu là tin nhắn từ người khác: chỉ nhận receiver message (is_sender_copy = false)
            // Call_end and call_declined messages luôn hiển thị (không cần decrypt)
            if (message.is_sender_copy === false || message.message_type === 'call_end' || message.message_type === 'call_declined') {
                // Fetch đầy đủ thông tin sender cho tin nhắn mới
                const { data: messageWithSender, error } = await supabase
                    .from('messages')
                    .select(`
                        *,
                        sender:users(id, name, image)
                    `)
                    .eq('id', message.id)
                    .single();

                if (error) {
                    // Fallback: sử dụng message nếu không fetch được
                    // FIX: Tuyệt đối không push message vào state nếu message đó đã tồn tại (check id)
                    setMessages(prev => {
                        const existingIndex = prev.findIndex(msg => msg.id === message.id);
                        let newMessages;
                        if (existingIndex !== -1) {
                            // Đã có → merge với existing message, PRESERVE runtime_plain_text
                            const existingMessage = prev[existingIndex];
                            const tempMessages = [...prev];

                            // CRITICAL: Preserve runtime_plain_text từ existing message nếu có
                            if (existingMessage.runtime_plain_text && !message.runtime_plain_text) {
                                tempMessages[existingIndex] = {
                                    ...message,
                                    runtime_plain_text: existingMessage.runtime_plain_text,
                                    is_encrypted: false
                                };
                                console.log(`[REALTIME_MERGE] Preserved runtime_plain_text for message ${message.id} from existing message`);
                            } else {
                                tempMessages[existingIndex] = message;
                            }
                            newMessages = mergeMessages(tempMessages);
                        } else {
                            // Chưa có → thêm vào (chỉ khi thực sự là message mới)
                            // FIX JUMPING: Với inverted FlatList, message mới nhất phải ở index 0 → thêm vào ĐẦU array
                            newMessages = mergeMessages([message, ...prev]);
                        }

                        // CRITICAL: Sync messagesRef ngay lập tức
                        messagesRef.current = newMessages;
                        return newMessages;
                    });
                    return;
                }

                // Receiver messages là plaintext, không cần decrypt
                // FIX: Tuyệt đối không push message vào state nếu message đó đã tồn tại (check id)
                setMessages(prev => {
                    const existingIndex = prev.findIndex(msg => msg.id === messageWithSender.id);
                    let newMessages;
                    if (existingIndex !== -1) {
                        // Đã có → merge với existing message, PRESERVE runtime_plain_text
                        const existingMessage = prev[existingIndex];
                        const tempMessages = [...prev];

                        // CRITICAL: Preserve runtime_plain_text từ existing message nếu có
                        // runtime_plain_text là runtime-only data, không được overwrite từ server/realtime
                        if (existingMessage.runtime_plain_text && !messageWithSender.runtime_plain_text) {
                            // Existing message đã có runtime_plain_text → preserve nó
                            tempMessages[existingIndex] = {
                                ...messageWithSender,
                                runtime_plain_text: existingMessage.runtime_plain_text,
                                is_encrypted: false // Đã decrypt
                            };
                            console.log(`[REALTIME_MERGE] Preserved runtime_plain_text for message ${messageWithSender.id} from existing message`);
                        } else if (messageWithSender.runtime_plain_text) {
                            // New message có runtime_plain_text → dùng nó
                            tempMessages[existingIndex] = messageWithSender;
                        } else {
                            // Không có runtime_plain_text ở cả hai → dùng new message
                            tempMessages[existingIndex] = messageWithSender;
                        }
                        newMessages = mergeMessages(tempMessages);
                    } else {
                        // Chưa có → thêm vào (chỉ khi thực sự là message mới)
                        // FIX JUMPING: Với inverted FlatList, message mới nhất phải ở index 0 → thêm vào ĐẦU array
                        newMessages = mergeMessages([messageWithSender, ...prev]);
                    }

                    // CRITICAL: Sync messagesRef ngay lập tức
                    messagesRef.current = newMessages;
                    return newMessages;
                });

                // Mark as read
                markAsRead();
            }
        };

        const channel = supabase
            .channel(`messages-${conversationId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, async (payload) => {
                await handleRealtimeMessage(payload.new);
            })
            .subscribe();

        return () => {
            channel.unsubscribe();
        };
    }, [conversationId]);

    useEffect(() => {
        if (conversationId) {
            loadTimeRef.current = Date.now();
            logHasRun.current = false;
            messageLoadLogHasRun.current = false;
            initialMessageCount.current = null;
            // Reset scroll flag khi vào chat mới - cho phép auto scroll
            isUserScrollingRef.current = false;
            setIsNearBottom(true); // Reset về true khi vào chat mới
            loadedImageIds.current = new Set(); // Reset khi vào chat mới
            loadedVideoIds.current = new Set();
            imagesToLoad.current = new Set();
            videosToLoad.current = new Set();
            imageLoadTimes.current = [];
            videoLoadTimes.current = [];

            // Reset performance metrics khi vào chat mới
            performanceMetrics.reset();
            performanceMetrics.trackRender('ChatScreen-Mount');
        }
    }, [conversationId]);

    /**
     * Hàm scroll đến tin nhắn mới nhất (index 0 trong inverted FlatList)
     * 
     * Mục đích:
     * - Scroll đến tin nhắn mới nhất khi có message mới (KHÔNG dùng cho initial load)
     * - Với inverted FlatList, scrollToOffset({ offset: 0 }) = scroll đến tin nhắn mới nhất
     * - Debounce tránh scroll nhiều lần liên tiếp
     * - Sử dụng InteractionManager + requestAnimationFrame để đảm bảo scroll chính xác
     * 
     * Được gọi từ:
     * - onContentSizeChange: khi FlatList content size thay đổi (tin nhắn mới đến / decrypt xong)
     * - useEffect [messages]: khi messages thay đổi (tin nhắn mới đến)
     * 
     * LƯU Ý: Không scroll cho initial load vì inverted FlatList tự động ở cuối (tin nhắn mới nhất)
     */
    const handleScrollToEnd = () => {
        // Clear timeout cũ nếu có (debounce) - tránh gọi scroll nhiều lần liên tiếp
        if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
        }

        // Sử dụng InteractionManager để đợi tất cả interactions hoàn thành
        // Sau đó dùng requestAnimationFrame để đảm bảo layout đã render xong
        InteractionManager.runAfterInteractions(() => {
            // requestAnimationFrame đảm bảo scroll chạy sau khi layout render xong
            requestAnimationFrame(() => {
                // Chỉ scroll nếu:
                // 1. User không đang scroll tay
                // 2. User đang ở gần tin nhắn mới nhất (< 100px)
                // 3. FlatList ref tồn tại
                // Với inverted FlatList, scrollToOffset({ offset: 0 }) = scroll đến tin nhắn mới nhất
                if (!isUserScrollingRef.current && isNearBottom && flatListRef.current) {
                    flatListRef.current.scrollToOffset({ offset: 0, animated: true });
                }
            });
        });
    };

    // Bỏ auto scroll - để FlatList tự nhiên, không scroll khi có message mới

    // Ghi nhận message đầu tiên để xác định phải chờ bao nhiêu media
    useEffect(() => {
        if (
            messages.length > 0 &&
            !loading &&
            initialMessageCount.current === null &&
            !logHasRun.current
        ) {
            // Lấy danh sách id media phải chờ (lần đầu render)
            imagesToLoad.current = new Set(messages.filter(msg => msg.message_type === 'image').map(msg => msg.id));
            videosToLoad.current = new Set(messages.filter(msg => msg.message_type === 'video').map(msg => msg.id));
            initialMessageCount.current = messages.length;
        }
    }, [messages, loading, conversationId]);

    function checkAllMediaLoadedAndLog() {
        // DEBUG trạng thái snapshot mỗi lần gọi

        const imagesDone = Array.from(imagesToLoad.current).every(id => loadedImageIds.current.has(id));
        const videosDone = Array.from(videosToLoad.current).every(id => loadedVideoIds.current.has(id));
        // DEBUG log điều kiện trigger block tổng

        if (
            loadTimeRef.current &&
            initialMessageCount.current !== null &&
            imagesDone &&
            videosDone &&
            !logHasRun.current
        ) {
            const end = Date.now();
            const totalTime = end - loadTimeRef.current;
            const avgImageTime = imagesToLoad.current.size > 0
                ? Array.from(loadedImageIds.current).length * 100 / imagesToLoad.current.size // Estimate
                : 0;

            console.log('=========== CHỈ SỐ HIỆU NĂNG CHAT ===========');
            console.log('Tổng thời gian load (messages + media):', totalTime, 'ms');
            console.log('Số messages:', initialMessageCount.current);
            console.log('Số ảnh:', imagesToLoad.current.size);
            console.log('Số video:', videosToLoad.current.size);
            if (totalTime > 0 && initialMessageCount.current > 0) {
                console.log('Trung bình thời gian/message:', (totalTime / initialMessageCount.current).toFixed(2), 'ms');
            }
            loadTimeRef.current = null;
            logHasRun.current = true;

        }
    }

    const loadConversation = async () => {
        const res = await getConversationById(conversationId);
        if (res.success) {
            setConversation(res.data);
        }
    };

    // Sync pinUnlocked và isPinSet với pinService (từ server)
    useEffect(() => {
        const checkPinStatus = async () => {
            if (!user?.id) return;

            const isUnlocked = pinService.isUnlocked();
            setPinUnlocked(isUnlocked);

            // Check PIN từ server
            const pinSet = await pinService.isPinSet(user.id);
            setIsPinSet(pinSet);
        };
        checkPinStatus();
    }, [user?.id]);

    // Reset pinUnlocked khi app background/close
    useEffect(() => {
        const handleAppStateChange = (nextAppState) => {
            if (nextAppState === 'background' || nextAppState === 'inactive') {
                pinService.lock();
                setPinUnlocked(false);
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription?.remove();
        };
    }, []);

    // CRITICAL: Re-decrypt messages khi ConversationKey trở nên available
    // Trigger khi: conversationId thay đổi HOẶC pinUnlocked thay đổi
    useEffect(() => {
        if (!conversationId) return;

        // Chờ một chút để đảm bảo messages đã được load
        const timeoutId = setTimeout(async () => {
            const conversationKeyService = require('../../services/conversationKeyService').default;
            const conversationKey = await conversationKeyService.getConversationKey(conversationId);

            if (conversationKey && messagesRef.current.length > 0) {
                console.log(`[USE_EFFECT_DECRYPT] ConversationKey available, re-decrypting messages for conversation ${conversationId}`);
                await decryptAllMessages();
            }
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [conversationId, pinUnlocked]);

    // FIX: Merge messages - Chỉ hiển thị MỘT bản, ưu tiên sender_copy nếu decrypt được
    // Nếu sender_copy decrypt thất bại → hiển thị receiver_message
    // FIX LỖI 2: mergeMessages cần device ID để check sender_copy
    // Lấy device ID một lần và cache trong ref để tránh gọi nhiều lần
    const currentDeviceIdRef = useRef(null);
    useEffect(() => {
        const deviceService = require('../../services/deviceService').default;
        deviceService.getOrCreateDeviceId().then(id => {
            currentDeviceIdRef.current = id;
        }).catch(() => { });
    }, []);

    const mergeMessages = (messages) => {
        if (!messages || messages.length === 0) return messages;

        // CRITICAL: Build map of existing messages by id to preserve runtime_plain_text
        // runtime_plain_text là RUNTIME-ONLY FIELD, TUYỆT ĐỐI KHÔNG ĐƯỢC MẤT khi merge
        // Nếu có nhiều messages với cùng id, ưu tiên message có runtime_plain_text
        const existingMessageMap = new Map();
        messages.forEach(msg => {
            if (msg.id) {
                const existing = existingMessageMap.get(msg.id);
                // Nếu chưa có entry, hoặc existing không có runtime_plain_text nhưng msg có → update
                if (!existing || (!existing.runtime_plain_text && msg.runtime_plain_text)) {
                    existingMessageMap.set(msg.id, msg);
                }
            }
        });

        // FIX DUPLICATE: Filter duplicate và ẩn optimistic khi có sender_copy với runtime_plain_text
        const seen = new Set();
        const mergedMessages = [];

        // Tìm tất cả sender_copy messages (bất kể đã decrypt hay chưa) để filter receiver tương ứng
        // Nguyên tắc E2EE: Nếu có sender_copy → chỉ hiển thị sender_copy, không hiển thị receiver
        const senderCopyMessageIds = new Set();
        messages.forEach(msg => {
            if (!msg.id?.startsWith('temp-') && msg.is_sender_copy === true) {
                senderCopyMessageIds.add(msg.id);
            }
        });

        // CRITICAL E2EE FIX: Chỉ ẩn receiver message khi sender_copy ĐÃ CÓ runtime_plain_text
        // Nguyên tắc: plaintext > encrypted
        // Receiver plaintext luôn được ưu tiên hiển thị hơn sender_copy encrypted
        const receiverMessageIdsToHide = new Set();
        messages.forEach(msg => {
            // CHỈ xử lý sender_copy ĐÃ CÓ runtime_plain_text (đã decrypt)
            if (msg.is_sender_copy === true &&
                !msg.id?.startsWith('temp-') &&
                msg.runtime_plain_text) { // CRITICAL: Chỉ ẩn receiver khi sender_copy đã decrypt
                // Tìm receiver message tương ứng (cùng sender, conversation, thời gian gần nhau)
                messages.forEach(otherMsg => {
                    if (otherMsg.is_sender_copy === false &&
                        otherMsg.sender_id === msg.sender_id &&
                        otherMsg.conversation_id === msg.conversation_id) {
                        // So sánh thời gian (chênh lệch < 2 giây để chính xác hơn, tránh filter nhầm)
                        const timeDiff = Math.abs(
                            new Date(msg.created_at).getTime() - new Date(otherMsg.created_at).getTime()
                        );
                        if (timeDiff < 2000) {
                            receiverMessageIdsToHide.add(otherMsg.id);
                        }
                    }
                });
            }
        });

        // DEBUG: Log để kiểm tra filter
        if (__DEV__ && receiverMessageIdsToHide.size > 0) {
            console.log('[MERGE_MESSAGES] Filtering receiver messages:', {
                totalReceiverToHide: receiverMessageIdsToHide.size,
                receiverIds: Array.from(receiverMessageIdsToHide).slice(0, 5)
            });
        }

        messages.forEach(msg => {
            // Filter duplicate theo id
            if (seen.has(msg.id)) {
                // CRITICAL: Nếu message đã được thêm, preserve runtime_plain_text nếu có
                const existingMsg = mergedMessages.find(m => m.id === msg.id);
                if (existingMsg && msg.runtime_plain_text && !existingMsg.runtime_plain_text) {
                    // New message có runtime_plain_text mà existing không có → update
                    const index = mergedMessages.findIndex(m => m.id === msg.id);
                    mergedMessages[index] = {
                        ...existingMsg,
                        runtime_plain_text: msg.runtime_plain_text,
                        is_encrypted: false
                    };
                    console.log(`[MERGE_MESSAGES] Preserved runtime_plain_text for duplicate message ${msg.id}`);
                } else if (existingMsg && existingMsg.runtime_plain_text && !msg.runtime_plain_text) {
                    // Existing có runtime_plain_text mà new không có → giữ existing
                    // Không cần làm gì, existing đã có runtime_plain_text
                }
                return;
            }

            // Nếu là optimistic message và đã có sender_copy tương ứng với runtime_plain_text → không thêm vào
            if (msg.id?.startsWith('temp-')) {
                // Tìm sender_copy tương ứng (cùng sender, conversation, thời gian gần nhau)
                const hasDecryptedSenderCopy = messages.some(otherMsg => {
                    if (otherMsg.id?.startsWith('temp-')) return false;
                    if (!otherMsg.is_sender_copy || !otherMsg.runtime_plain_text) return false;
                    if (otherMsg.sender_id !== msg.sender_id || otherMsg.conversation_id !== msg.conversation_id) return false;
                    // So sánh thời gian (chênh lệch < 5 giây) - optimistic thường được tạo trước sender_copy một chút
                    const timeDiff = Math.abs(
                        new Date(msg.created_at).getTime() - new Date(otherMsg.created_at).getTime()
                    );
                    return timeDiff < 5000;
                });
                // #region agent log
                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:982',message:'mergeMessages optimistic check',data:{optimisticId:msg.id,hasDecryptedSenderCopy,hasUiOptimisticText:!!msg.ui_optimistic_text,uiOptimisticText:msg.ui_optimistic_text?.substring(0,20)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                // #endregion
                if (hasDecryptedSenderCopy) {
                    // Đã có sender_copy với runtime_plain_text → bỏ qua optimistic
                    return;
                }
            }

            // CRITICAL E2EE FIX: Chỉ ẩn receiver message khi sender_copy ĐÃ CÓ runtime_plain_text
            // Nguyên tắc: plaintext > encrypted
            // Nếu sender_copy chưa decrypt (không có runtime_plain_text) → GIỮ receiver message
            if (msg.is_sender_copy === false && receiverMessageIdsToHide.has(msg.id)) {
                // Đã có sender_copy với runtime_plain_text → bỏ qua receiver message
                // (receiverMessageIdsToHide chỉ chứa IDs của receiver messages tương ứng với sender_copy đã decrypt)
                return;
            }

            // NEW ARCHITECTURE: CHỈ push message khi có text renderable hoặc is_encrypted=true
            // Không push message không có text + không có encrypted placeholder
            const hasRenderableText = msg.runtime_plain_text ||
                msg.ui_optimistic_text ||
                (msg.message_type === 'text' && !msg.is_encrypted && msg.content) ||
                (msg.message_type !== 'text'); // Non-text messages (image, video, etc.)

            const hasEncryptedPlaceholder = msg.is_encrypted === true && msg.message_type === 'text';

            if (hasRenderableText || hasEncryptedPlaceholder) {
                seen.add(msg.id);

                // CRITICAL: Preserve runtime_plain_text từ existing message nếu có
                // Nếu existingMessageMap có message với cùng id và có runtime_plain_text → merge vào
                const existingMsg = existingMessageMap.get(msg.id);
                let finalMsg = msg;

                if (existingMsg && existingMsg.runtime_plain_text && !msg.runtime_plain_text) {
                    // Existing message có runtime_plain_text mà new message không có → preserve nó
                    finalMsg = {
                        ...msg,
                        runtime_plain_text: existingMsg.runtime_plain_text,
                        is_encrypted: false // Đã decrypt
                    };
                    if (__DEV__) {
                        console.log(`[MERGE_MESSAGES] runtime_plain_text preserved for message ${msg.id}`);
                    }
                } else if (msg.runtime_plain_text) {
                    // New message đã có runtime_plain_text → dùng nó
                    finalMsg = msg;
                }
                
                // CRITICAL: Preserve ui_optimistic_text từ optimistic message nếu sender_copy chưa decrypt
                // Nếu finalMsg là sender_copy chưa decrypt và có optimistic tương ứng → preserve ui_optimistic_text
                if (finalMsg.is_sender_copy && !finalMsg.runtime_plain_text && !finalMsg.ui_optimistic_text) {
                    const matchingOptimistic = messages.find(optMsg => 
                        optMsg.id?.startsWith('temp-') &&
                        optMsg.sender_id === finalMsg.sender_id &&
                        optMsg.conversation_id === finalMsg.conversation_id &&
                        optMsg.ui_optimistic_text
                    );
                    if (matchingOptimistic) {
                        const timeDiff = Math.abs(
                            new Date(finalMsg.created_at).getTime() - new Date(matchingOptimistic.created_at).getTime()
                        );
                        if (timeDiff < 5000) {
                            finalMsg = {
                                ...finalMsg,
                                ui_optimistic_text: matchingOptimistic.ui_optimistic_text
                            };
                            // #region agent log
                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:1041',message:'mergeMessages preserved ui_optimistic_text',data:{messageId:finalMsg.id,uiOptimisticText:finalMsg.ui_optimistic_text?.substring(0,20)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                            // #endregion
                        }
                    }
                }

                // #region agent log
                if (finalMsg.id?.startsWith('temp-') || (finalMsg.is_sender_copy && !finalMsg.runtime_plain_text)) {
                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:1042',message:'mergeMessages final message',data:{messageId:finalMsg.id,hasUiOptimisticText:!!finalMsg.ui_optimistic_text,uiOptimisticText:finalMsg.ui_optimistic_text?.substring(0,20),hasRuntimePlainText:!!finalMsg.runtime_plain_text,hasContent:!!finalMsg.content,contentLength:finalMsg.content?.length,isEncrypted:finalMsg.is_encrypted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
                }
                // #endregion
                mergedMessages.push(finalMsg);
            }
        });

        // FIX SCROLL BUG: KHÔNG sort lại toàn bộ messages - giữ thứ tự hiện tại
        // Messages phải được thêm đúng thứ tự ngay từ khi add vào state
        // Với inverted FlatList, message mới nhất phải ở index 0
        // Sort chỉ được thực hiện khi loadMessages() (initial load), không phải mỗi lần merge

        // FIX: Log để debug duplicate và filter
        const duplicateCheck = new Set(mergedMessages.map(m => m.id));
        if (duplicateCheck.size !== mergedMessages.length) {
            console.warn('[Chat] WARNING: Duplicate messages detected after merge!', {
                total: mergedMessages.length,
                unique: duplicateCheck.size
            });
        }

        // DEBUG: Log để kiểm tra số lượng messages
        if (__DEV__) {
            const originalCount = messages.length;
            const mergedCount = mergedMessages.length;
            if (originalCount !== mergedCount) {
                console.log('[MERGE_MESSAGES] Messages filtered:', {
                    original: originalCount,
                    merged: mergedCount,
                    filtered: originalCount - mergedCount,
                    senderCopyCount: Array.from(messages).filter(m => m.is_sender_copy === true && !m.id?.startsWith('temp-')).length,
                    receiverCount: Array.from(messages).filter(m => m.is_sender_copy === false).length,
                    receiverFiltered: receiverMessageIdsToHide.size
                });
            }
        }

        return mergedMessages;
    };

    const loadMessages = async () => {
        // Load từ cache trước (nếu có)
        const { loadMessagesCache } = require('../../utils/messagesCache');
        const cacheStartTime = Date.now();
        const cachedMessages = await loadMessagesCache(conversationId);
        if (cachedMessages && cachedMessages.length > 0) {
            const dataSize = JSON.stringify(cachedMessages).length;
            const dataSizeKB = (dataSize / 1024).toFixed(2);
            const loadTime = Date.now() - cacheStartTime;
            console.log('Load dữ liệu từ cache: messages');
            console.log(`- Dữ liệu đã load: ${cachedMessages.length} messages (${dataSizeKB} KB)`);
            console.log(`- Tổng thời gian load: ${loadTime} ms`);
            // Log tin nhắn cuối cùng từ cache
            if (cachedMessages.length > 0) {
                const lastCachedMessage = cachedMessages[cachedMessages.length - 1];
                const lastMessageContent = lastCachedMessage.content || lastCachedMessage.message_type || 'Không có nội dung';
                const lastMessageTime = lastCachedMessage.created_at ? new Date(lastCachedMessage.created_at).toLocaleString('vi-VN') : 'N/A';
                console.log(`- Tin nhắn cuối từ cache: "${lastMessageContent.substring(0, 50)}" (${lastMessageTime})`);
            }

            // FIX E2EE BUG GIAI ĐOẠN 2: Clear TOÀN BỘ runtime decrypted state khi load từ DB/cache
            // Message từ DB phải được treat như CHƯA TỪNG DECRYPT
            // Không được assume message đã từng decrypt
            const sanitizedCachedMessages = cachedMessages.map(msg => {
                // Clear runtime state cho TẤT CẢ messages (không chỉ sender_copy)
                const { runtime_plain_text, decrypted_on_device_id, ui_optimistic_text, ...cleanMessage } = msg;
                return {
                    ...cleanMessage,
                    // Đảm bảo runtime state bị clear
                    runtime_plain_text: undefined,
                    decrypted_on_device_id: undefined,
                    ui_optimistic_text: undefined // Clear ui_optimistic_text
                };
            });

            // DEBUG LOG: Log 3 messages cuối sau khi sanitize
            const last3Messages = sanitizedCachedMessages.slice(-3);
            console.log('[LOAD_MESSAGES_FROM_CACHE]');
            console.log(`Total messages: ${sanitizedCachedMessages.length}`);
            last3Messages.forEach((msg, idx) => {
                console.log(`[Message ${sanitizedCachedMessages.length - 3 + idx + 1}]`);
                console.log(`id=${msg.id}`);
                console.log(`is_encrypted=${msg.is_encrypted}`);
                console.log(`content_length=${msg.content ? msg.content.length : 0}`);
                console.log(`runtime_plain_text=${msg.runtime_plain_text ? 'YES' : 'NO'}`);
                console.log(`decrypted_on_device_id=${msg.decrypted_on_device_id || 'undefined'}`);
            });

            // FIX ROOT CAUSE: Xóa optimistic messages (temp-*) từ cache
            // NHƯNG giữ lại optimistic messages từ state hiện tại (user đang gửi tin nhắn)
            const withoutOptimistic = sanitizedCachedMessages.filter(msg => !msg.id?.startsWith('temp-'));

            // Merge messages để tránh duplicate
            // QUAN TRỌNG: Giữ lại optimistic messages từ state hiện tại
            // FIX SCROLL BUG: Sort cached messages trước khi merge (chỉ sort khi load initial)
            const sortedCached = [...withoutOptimistic].sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                return timeB - timeA; // DESC: mới nhất trước
            });

            // NEW ARCHITECTURE: Decrypt bằng ConversationKey
            // ConversationKey có thể có trong cache (device hiện tại) hoặc cần PIN unlock (device khác)
            const conversationKeyService = require('../../services/conversationKeyService').default;
            const encryptionService = require('../../services/encryptionService').default;

            // Lấy ConversationKey (ưu tiên cache, sau đó decrypt từ SecureStore nếu có PIN)
            const conversationKey = await conversationKeyService.getConversationKey(conversationId);

            const decryptPromises = sortedCached.map(async (msg) => {
                // CRITICAL: CHỈ decrypt messages có encryption_version >= 3 (ConversationKey architecture)
                // Messages cũ (v1/v2) được mã hóa bằng DeviceKey, KHÔNG thể decrypt bằng ConversationKey
                if (msg.is_encrypted === true &&
                    msg.message_type === 'text' &&
                    conversationKey &&
                    !msg.runtime_plain_text &&
                    msg.encryption_version != null &&
                    msg.encryption_version >= 3) { // CHỈ decrypt v3+ (phải check != null để tránh null/undefined)

                    try {
                        const decryptedContent = await encryptionService.decryptMessageWithConversationKey(
                            msg.content,
                            conversationKey
                        );

                        if (decryptedContent && decryptedContent.trim() !== '') {
                            return {
                                ...msg,
                                runtime_plain_text: decryptedContent,
                                decryption_error: false
                            };
                        }
                    } catch (error) {
                        console.error('Error decrypting message in loadMessages:', error);
                    }
                }
                // Skip messages cũ (v1/v2) - không thể decrypt bằng ConversationKey
                // Giữ nguyên encrypted, hiển thị placeholder
                return msg;
            });

            const decryptedCached = await Promise.all(decryptPromises);

            // Vì đã clear messages state trước khi load, không cần merge với prev
            setMessages(mergeMessages(decryptedCached));
            setLoading(false);

            // Fetch messages mới từ DB sau khi load cache để đảm bảo có messages mới nhất
            // (realtime subscription có thể bỏ lỡ messages nếu app không active)
            try {
                const { getNewMessages } = require('../../services/chatService');
                // Lấy thời gian của message mới nhất từ cache (đã sort DESC, mới nhất ở index 0)
                const latestCachedTime = decryptedCached.length > 0
                    ? decryptedCached[0].created_at
                    : null;

                if (latestCachedTime) {
                    const newMessages = await getNewMessages(conversationId, user.id, latestCachedTime);
                    if (newMessages && newMessages.length > 0) {
                        // Sanitize và decrypt messages mới tương tự như load từ DB
                        const sanitizedNew = newMessages.map(msg => {
                            const { runtime_plain_text, decrypted_on_device_id, ui_optimistic_text, ...cleanMessage } = msg;
                            return {
                                ...cleanMessage,
                                runtime_plain_text: undefined,
                                decrypted_on_device_id: undefined,
                                ui_optimistic_text: undefined
                            };
                        });

                        // NEW ARCHITECTURE: Decrypt bằng ConversationKey
                        // ConversationKey có thể có trong cache (device hiện tại) hoặc cần PIN unlock (device khác)
                        const conversationKeyService = require('../../services/conversationKeyService').default;
                        const encryptionService = require('../../services/encryptionService').default;

                        // Lấy ConversationKey (ưu tiên cache, sau đó decrypt từ SecureStore nếu có PIN)
                        const conversationKey = await conversationKeyService.getConversationKey(conversationId);

                        const decryptPromises = sanitizedNew.map(async (msg) => {
                            // CRITICAL: CHỈ decrypt messages có encryption_version >= 3 (ConversationKey architecture)
                            // Messages cũ (v1/v2) được mã hóa bằng DeviceKey, KHÔNG thể decrypt bằng ConversationKey
                            if (msg.is_encrypted === true &&
                                msg.message_type === 'text' &&
                                conversationKey &&
                                !msg.runtime_plain_text &&
                                msg.encryption_version != null &&
                                msg.encryption_version >= 3) { // CHỈ decrypt v3+ (phải check != null)
                                try {
                                    const decryptedContent = await encryptionService.decryptMessageWithConversationKey(
                                        msg.content,
                                        conversationKey
                                    );
                                    if (decryptedContent && decryptedContent.trim() !== '') {
                                        return {
                                            ...msg,
                                            runtime_plain_text: decryptedContent,
                                            decryption_error: false
                                        };
                                    }
                                } catch (error) {
                                    console.error('Error decrypting new message:', error);
                                }
                            }
                            // Skip messages cũ (v1/v2) - không thể decrypt bằng ConversationKey
                            // Giữ nguyên encrypted, hiển thị placeholder
                            return msg;
                        });

                        const decryptedNew = await Promise.all(decryptPromises);
                        // getNewMessages trả về từ cũ đến mới (đã reverse), nhưng state sort DESC (mới nhất trước)
                        // Reverse lại để có messages mới nhất trước, rồi prepend vào state
                        const reversedNew = [...decryptedNew].reverse();
                        // Merge messages mới vào state (prepend vì là messages mới hơn)
                        // CRITICAL: Preserve runtime_plain_text từ existing messages
                        setMessages(prev => {
                            // Tạo map để preserve runtime_plain_text từ existing messages
                            const existingMap = new Map();
                            prev.forEach(msg => {
                                if (msg.runtime_plain_text) {
                                    existingMap.set(msg.id, msg.runtime_plain_text);
                                }
                            });

                            // Merge và preserve runtime_plain_text
                            const merged = [...reversedNew, ...prev].map(msg => {
                                const existingPlaintext = existingMap.get(msg.id);
                                if (existingPlaintext && !msg.runtime_plain_text) {
                                    return {
                                        ...msg,
                                        runtime_plain_text: existingPlaintext,
                                        is_encrypted: false
                                    };
                                }
                                return msg;
                            });

                            const finalMerged = mergeMessages(merged);
                            // CRITICAL: Sync messagesRef ngay lập tức
                            messagesRef.current = finalMerged;
                            return finalMerged;
                        });
                    }
                }
            } catch (error) {
                console.error('Error fetching new messages after cache load:', error);
            }
        } else {
            // Không có cache, load toàn bộ từ CSDL
            console.log('Load dữ liệu từ CSDL: messages');
            setLoading(true);
            performanceMetrics.trackRender('ChatScreen-LoadMessages');

            const res = await getMessages(conversationId, user.id, 1000, 0); // Load 1000 messages để đảm bảo load đủ
            setLoading(false);

            if (res.success) {
                // FIX E2EE BUG GIAI ĐOẠN 2: Clear TOÀN BỘ runtime decrypted state khi load từ DB
                // Message từ DB phải được treat như CHƯA TỪNG DECRYPT
                const sanitizedMessages = res.data.map(msg => {
                    // Clear runtime state cho TẤT CẢ messages
                    const { runtime_plain_text, decrypted_on_device_id, ui_optimistic_text, ...cleanMessage } = msg;
                    return {
                        ...cleanMessage,
                        // Đảm bảo runtime state bị clear
                        runtime_plain_text: undefined,
                        decrypted_on_device_id: undefined,
                        ui_optimistic_text: undefined // Clear ui_optimistic_text
                    };
                });

                // DEBUG LOG: Log 3 messages cuối sau khi sanitize
                const last3Messages = sanitizedMessages.slice(-3);
                console.log('[LOAD_MESSAGES_FROM_DB]');
                console.log(`Total messages: ${sanitizedMessages.length}`);
                last3Messages.forEach((msg, idx) => {
                    console.log(`[Message ${sanitizedMessages.length - 3 + idx + 1}]`);
                    console.log(`id=${msg.id}`);
                    console.log(`is_encrypted=${msg.is_encrypted}`);
                    console.log(`content_length=${msg.content ? msg.content.length : 0}`);
                    console.log(`runtime_plain_text=${msg.runtime_plain_text ? 'YES' : 'NO'}`);
                    console.log(`decrypted_on_device_id=${msg.decrypted_on_device_id || 'undefined'}`);
                });

                // FIX ROOT CAUSE: Xóa optimistic messages (temp-*) khi load từ DB
                // Đảm bảo không có optimistic message nào tồn tại sau khi reload
                const withoutOptimistic = sanitizedMessages.filter(msg => !msg.id?.startsWith('temp-'));

                // FIX SCROLL BUG: Sort messages trước khi set (chỉ sort khi load initial)
                const sortedMessages = [...withoutOptimistic].sort((a, b) => {
                    const timeA = new Date(a.created_at).getTime();
                    const timeB = new Date(b.created_at).getTime();
                    return timeB - timeA; // DESC: mới nhất trước
                });

                // NEW ARCHITECTURE: Decrypt bằng ConversationKey
                // ConversationKey có thể có trong cache (device hiện tại) hoặc cần PIN unlock (device khác)
                const conversationKeyService = require('../../services/conversationKeyService').default;
                const encryptionService = require('../../services/encryptionService').default;

                // Lấy ConversationKey (ưu tiên cache, sau đó decrypt từ SecureStore nếu có PIN)
                const conversationKey = await conversationKeyService.getConversationKey(conversationId);

                const decryptPromises = sortedMessages.map(async (msg) => {
                    // CRITICAL: CHỈ decrypt messages có encryption_version >= 3 (ConversationKey architecture)
                    // Messages cũ (v1/v2) được mã hóa bằng DeviceKey, KHÔNG thể decrypt bằng ConversationKey
                    if (msg.is_encrypted === true &&
                        msg.message_type === 'text' &&
                        conversationKey &&
                        !msg.runtime_plain_text &&
                        msg.encryption_version != null &&
                        msg.encryption_version >= 3) { // CHỈ decrypt v3+ (phải check != null)

                        try {
                            const decryptedContent = await encryptionService.decryptMessageWithConversationKey(
                                msg.content,
                                conversationKey
                            );

                            if (decryptedContent && decryptedContent.trim() !== '') {
                                return {
                                    ...msg,
                                    runtime_plain_text: decryptedContent,
                                    decryption_error: false
                                };
                            }
                        } catch (error) {
                            console.error('Error decrypting message in loadMessages:', error);
                        }
                    }
                    // Skip messages cũ (v1/v2) - không thể decrypt bằng ConversationKey
                    // Giữ nguyên encrypted, hiển thị placeholder
                    return msg;
                });

                const decryptedMessages = await Promise.all(decryptPromises);

                // Vì đã clear messages state trước khi load, không cần merge với prev
                setMessages(mergeMessages(decryptedMessages));

                // === METRICS: Track network data ===
                const estimatedSize = res.data.length * 500;
                performanceMetrics.trackNetworkRequest(estimatedSize, 'download');

                console.log(`Load từ CSDL: ${res.data.length} messages`);
                // Log tin nhắn cuối cùng từ CSDL
                if (res.data.length > 0) {
                    const lastMessage = res.data[res.data.length - 1];
                    const lastMessageContent = lastMessage.content || lastMessage.message_type || 'Không có nội dung';
                    const lastMessageTime = lastMessage.created_at ? new Date(lastMessage.created_at).toLocaleString('vi-VN') : 'N/A';
                    console.log(`- Tin nhắn cuối từ CSDL: "${lastMessageContent.substring(0, 50)}" (${lastMessageTime})`);
                }
                performanceMetrics.trackRender('ChatScreen-SetMessages');

                // Không save cache ở đây - chỉ cache khi prefetch (background)

                // Reset image loading states when loading messages
                setImageLoading({});

                // Pre-mark images as loaded if they're from cache
                const imageMessages = res.data.filter(msg => msg.message_type === 'image');
                const preLoadedImages = {};
                imageMessages.forEach(msg => {
                    preLoadedImages[msg.id] = false; // Mark as already loaded
                });
                setImageLoading(preLoadedImages);

            }
        }
    };

    const markAsRead = async () => {
        if (user?.id) {
            const result = await markConversationAsRead(conversationId, user.id);
            if (result.success) {
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

    const onPressSetupPin = () => {
        setShowSetupPinModal(true);
        setPinInput('');
        setPinConfirmInput('');
        setPinError('');
    };

    const onPressUnlockPin = () => {
        setShowPinModal(true);
        setPinInput('');
        setPinError('');
    };

    const handleSetupPin = async () => {
        if (!pinInput || pinInput.length !== 6 || !/^\d{6}$/.test(pinInput)) {
            setPinError('Vui lòng nhập đúng 6 số');
            return;
        }

        if (!pinConfirmInput || pinConfirmInput.length !== 6 || !/^\d{6}$/.test(pinConfirmInput)) {
            setPinError('Vui lòng xác nhận đúng 6 số');
            return;
        }

        if (pinInput !== pinConfirmInput) {
            setPinError('PIN xác nhận không khớp');
            return;
        }

        try {
            if (!user?.id) {
                setPinError('Không tìm thấy thông tin người dùng');
                return;
            }

            await pinService.setPin(pinInput, user.id);
            setIsPinSet(true);
            setShowSetupPinModal(false);
            setPinInput('');
            setPinConfirmInput('');
            setPinError('');
            Alert.alert('Thành công', 'PIN đã được thiết lập. Bạn có thể dùng PIN này trên tất cả thiết bị.');
        } catch (error) {
            setPinError(error.message || 'Lỗi khi thiết lập PIN');
            console.error('Error setting PIN:', error);
        }
    };

    // Decrypt lại tất cả messages hiện tại khi ConversationKey trở nên available
    // ConversationKey có thể có trong cache (device hiện tại) hoặc cần PIN unlock (device khác)
    const decryptAllMessages = async () => {
        if (!conversationId) {
            console.log('[DECRYPT_ALL_MESSAGES] No conversationId');
            return;
        }

        const conversationKeyService = require('../../services/conversationKeyService').default;
        const encryptionService = require('../../services/encryptionService').default;

        // Lấy ConversationKey (ưu tiên cache, sau đó decrypt từ SecureStore nếu có PIN)
        const conversationKey = await conversationKeyService.getConversationKey(conversationId);
        if (!conversationKey) {
            console.log(`[DECRYPT_ALL_MESSAGES] Không có ConversationKey cho conversation ${conversationId} (có thể cần PIN unlock)`);
            return; // Không có ConversationKey → không thể decrypt
        }

        // Lấy messages hiện tại từ ref (đã được sync với state)
        const currentMessages = messagesRef.current;
        console.log(`[DECRYPT_ALL_MESSAGES] Bắt đầu decrypt ${currentMessages.length} messages bằng ConversationKey`);

        // Decrypt TẤT CẢ encrypted messages (không phân biệt device, sender_copy, etc.)
        let decryptedCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        let legacyMessageCount = 0; // Đếm messages cũ (v1/v2) bị skip
        const decryptPromises = currentMessages.map(async (msg) => {
            // CRITICAL: CHỈ decrypt messages có encryption_version >= 3 (ConversationKey architecture)
            // Messages cũ (v1/v2) được mã hóa bằng DeviceKey, KHÔNG thể decrypt bằng ConversationKey
            if (msg.is_encrypted === true &&
                msg.message_type === 'text' &&
                msg.encryption_version != null &&
                msg.encryption_version >= 3) { // CHỈ decrypt v3+ (phải check != null để tránh null/undefined)
                
                // CRITICAL: Validate runtime_plain_text hiện tại
                // Nếu runtime_plain_text có vẻ là ciphertext (chứa ký tự nhị phân, quá ngắn với base64 chars) → decrypt lại
                let shouldDecrypt = !msg.runtime_plain_text; // Chưa có → decrypt
                
                if (msg.runtime_plain_text) {
                    // Đã có runtime_plain_text → kiểm tra xem có phải ciphertext không
                    const plaintext = msg.runtime_plain_text;
                    
                    // Kiểm tra ký tự nhị phân (non-printable)
                    const binaryCharMatches = plaintext.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFD]/g);
                    const hasReplacementChar = plaintext.includes('\uFFFD');
                    const binaryCharCount = binaryCharMatches ? binaryCharMatches.length : 0;
                    const hasBinaryChars = hasReplacementChar || binaryCharCount >= 2;
                    
                    // Kiểm tra base64-like (ngắn + có ký tự đặc biệt)
                    const hasBase64SpecialChars = plaintext.includes('+') || plaintext.includes('/') || plaintext.includes('=');
                    const isShortBase64Like = plaintext.length <= 10 && hasBase64SpecialChars;
                    
                    // CRITICAL: Nếu runtime_plain_text quá ngắn (<= 4 ký tự) VÀ message vẫn encrypted
                    // → có thể là ciphertext chưa được decrypt đúng
                    // Plaintext hợp lệ thường >= 1 ký tự, nhưng nếu quá ngắn và vẫn encrypted → nghi ngờ
                    const isVeryShortAndEncrypted = plaintext.length <= 4 && msg.is_encrypted === true;
                    
                    // Nếu có dấu hiệu là ciphertext → decrypt lại
                    if (hasBinaryChars || isShortBase64Like || isVeryShortAndEncrypted) {
                        if (__DEV__) {
                            console.log(`[DECRYPT_ALL_MESSAGES] Re-decrypting message ${msg.id} (runtime_plain_text looks like ciphertext):`, {
                                length: plaintext.length,
                                preview: plaintext.substring(0, 20),
                                hasBinaryChars,
                                isShortBase64Like,
                                isVeryShortAndEncrypted,
                                is_encrypted: msg.is_encrypted
                            });
                        }
                        shouldDecrypt = true;
                    }
                }
                
                if (!shouldDecrypt) {
                    // Đã có runtime_plain_text hợp lệ → giữ nguyên
                    return msg;
                }

                try {
                    // Decrypt bằng ConversationKey
                    const decryptedContent = await encryptionService.decryptMessageWithConversationKey(
                        msg.content,
                        conversationKey
                    );

                    if (decryptedContent && decryptedContent.trim() !== '') {
                        decryptedCount++;
                        const decryptedMsg = {
                            ...msg,
                            runtime_plain_text: decryptedContent,
                            is_encrypted: false, // Đánh dấu đã decrypt thành công
                            decryption_error: false
                        };
                        console.log(`[DECRYPT_ALL_MESSAGES] ✓ Decrypted message ${msg.id}, has runtime_plain_text: ${!!decryptedMsg.runtime_plain_text}`);
                        return decryptedMsg;
                    } else {
                        skippedCount++;
                        if (__DEV__) {
                            console.log(`[DECRYPT_ALL_MESSAGES] ✗ Cannot decrypt message ${msg.id} (decryptedContent empty)`, {
                                messageId: msg.id,
                                hasContent: !!msg.content,
                                contentLength: msg.content?.length,
                                encryptionVersion: msg.encryption_version,
                                isEncrypted: msg.is_encrypted,
                                messageType: msg.message_type,
                                hadRuntimePlainText: !!msg.runtime_plain_text,
                                oldRuntimePlainTextLength: msg.runtime_plain_text?.length
                            });
                        } else {
                            console.log(`[DECRYPT_ALL_MESSAGES] ✗ Cannot decrypt message ${msg.id} (decryptedContent empty)`);
                        }
                        // Không decrypt được → giữ nguyên message (sẽ hiển thị placeholder)
                        // CRITICAL: Clear runtime_plain_text cũ nếu có (có thể là ciphertext)
                        if (msg.runtime_plain_text) {
                            return {
                                ...msg,
                                runtime_plain_text: undefined,
                                decryption_error: true
                            };
                        }
                        return msg;
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`[DECRYPT_ALL_MESSAGES] ✗ Error decrypting message ${msg.id} (v${msg.encryption_version}):`, error.message);
                    return msg; // Giữ nguyên message nếu có lỗi
                }
            }

            // Skip messages cũ (v1/v2) hoặc không có encryption_version - không thể decrypt bằng ConversationKey
            if (msg.is_encrypted === true && msg.message_type === 'text' &&
                (msg.encryption_version == null || msg.encryption_version < 3)) {
                legacyMessageCount++;
                if (legacyMessageCount <= 5) { // Chỉ log 5 messages đầu để tránh spam
                    console.log(`[DECRYPT_ALL_MESSAGES] → Skip legacy message ${msg.id} (encryption_version=${msg.encryption_version}, requires DeviceKey, not ConversationKey)`);
                }
                return msg; // Giữ nguyên encrypted, hiển thị placeholder
            }

            // Message không cần decrypt (đã có runtime_plain_text hoặc không encrypted)
            if (msg.runtime_plain_text) {
                console.log(`[DECRYPT_ALL_MESSAGES] → Skip message ${msg.id} (already has runtime_plain_text)`);
            }
            return msg; // Giữ nguyên message nếu không cần decrypt
        });

        // Chờ tất cả decrypt xong rồi update state một lần
        // QUAN TRỌNG: Tạo array mới (immutable) để React detect state change
        const decryptedMessages = await Promise.all(decryptPromises);

        // Log summary
        if (legacyMessageCount > 0) {
            console.log(`[DECRYPT_ALL_MESSAGES] Summary: ${decryptedCount} decrypted, ${skippedCount} skipped, ${errorCount} errors, ${legacyMessageCount} legacy messages (v1/v2/null) skipped`);
        } else {
            console.log(`[DECRYPT_ALL_MESSAGES] Summary: ${decryptedCount} decrypted, ${skippedCount} skipped, ${errorCount} errors`);
        }

        // Log một vài messages đầu để xác nhận
        if (__DEV__) {
            const messagesWithPlaintext = decryptedMessages.filter(m => m.runtime_plain_text);
            messagesWithPlaintext.slice(0, 3).forEach((msg, idx) => {
                console.log(`[DECRYPT_ALL_MESSAGES] Message ${idx + 1} has runtime_plain_text:`, {
                    id: msg.id,
                    hasRuntimePlainText: !!msg.runtime_plain_text,
                    runtimePlainTextLength: msg.runtime_plain_text?.length || 0,
                    is_encrypted: msg.is_encrypted
                });
            });
        }

        // QUAN TRỌNG: setState với array mới (immutable) để trigger re-render
        // CRITICAL: Sync messagesRef ngay lập tức để tránh desync
        const finalMessages = [...decryptedMessages];
        messagesRef.current = finalMessages;
        setMessages(finalMessages);

        // DEV: Log để verify sync
        if (__DEV__) {
            const runtimePlaintextCount = finalMessages.filter(m => m.runtime_plain_text).length;
            console.log('[DECRYPT_ALL_MESSAGES_STATE_SYNC]', {
                stateCount: finalMessages.length,
                refCount: messagesRef.current.length,
                runtimePlaintextCount: runtimePlaintextCount,
                refMatchesState: messagesRef.current.length === finalMessages.length
            });
        }
    };

    const handlePinSubmit = async () => {
        if (!pinInput || pinInput.length !== 6 || !/^\d{6}$/.test(pinInput)) {
            setPinError('Vui lòng nhập đúng 6 số');
            return;
        }

        try {
            if (!user?.id) {
                setPinError('Không tìm thấy thông tin người dùng');
                return;
            }

            const result = await pinService.unlockWithPin(pinInput, user.id);
            if (result.success) {
                setPinUnlocked(true);
                setShowPinModal(false);
                setPinInput('');
                setPinError('');
                // Decrypt lại messages hiện tại mà không reload (tránh jumping)
                await decryptAllMessages();
            } else {
                setPinError(result.error || 'PIN không đúng');
            }
        } catch (error) {
            setPinError('Lỗi khi xác thực PIN');
            console.error('Error unlocking with PIN:', error);
        }
    };

    const sendMessageHandler = async () => {
        if (!messageText.trim() || sending) return;

        const plainText = messageText.trim();
        setSending(true);

        // Device-local plaintext authority: Optimistic message với ui_optimistic_text
        const deviceService = require('../../services/deviceService').default;
        const currentDeviceId = await deviceService.getOrCreateDeviceId();
        const tempMessageId = `temp-${Date.now()}-${Math.random()}`;
        const optimisticMessage = {
            id: tempMessageId,
            conversation_id: conversationId,
            sender_id: user.id,
            content: null,
            message_type: 'text',
            is_encrypted: true,
            is_sender_copy: true,
            sender_device_id: currentDeviceId,
            created_at: new Date().toISOString(),
            ui_optimistic_text: plainText, // UI-only field - hiển thị ngay
            sender: { id: user.id, name: user.name, image: user.image }
        };

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:1710',message:'sendMessageHandler optimistic message created',data:{tempMessageId,plainText,hasUiOptimisticText:!!optimisticMessage.ui_optimistic_text,uiOptimisticTextLength:optimisticMessage.ui_optimistic_text?.length,content:optimisticMessage.content,isEncrypted:optimisticMessage.is_encrypted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion

        // Thêm optimistic message vào state ngay để hiển thị
        // Với inverted FlatList, message mới nhất phải ở index 0 → unshift vào đầu array
        setMessages(prev => {
            const newMessages = mergeMessages([optimisticMessage, ...prev]);
            // #region agent log
            const mergedOptimistic = newMessages.find(m => m.id === tempMessageId);
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:1737',message:'after mergeMessages optimistic',data:{tempMessageId,foundInMerged:!!mergedOptimistic,hasUiOptimisticText:!!mergedOptimistic?.ui_optimistic_text,uiOptimisticTextLength:mergedOptimistic?.ui_optimistic_text?.length,hasContent:!!mergedOptimistic?.content,contentLength:mergedOptimistic?.content?.length,isEncrypted:mergedOptimistic?.is_encrypted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            // CRITICAL: Sync messagesRef ngay lập tức
            messagesRef.current = newMessages;
            return newMessages;
        });

        const res = await sendMessage({
            conversation_id: conversationId,
            sender_id: user.id,
            content: plainText,
            message_type: 'text'
        });

        setSending(false);

        if (res.success) {
            // sendMessage() tạo 2 messages: receiver (plaintext) và sender copy (encrypted)
            // Realtime subscription sẽ nhận sender copy message và decrypt
            // Khi đó sẽ gỡ ui_optimistic_text và set runtime_plain_text
            setMessageText('');

            // CRITICAL: Sau khi send message, ConversationKey có thể đã được tạo/cache
            // Re-decrypt messages để đảm bảo messages mới được decrypt ngay
            setTimeout(async () => {
                await decryptAllMessages();
            }, 200);
        } else {
            // Nếu gửi thất bại → xóa optimistic message
            setMessages(prev => {
                return prev.filter(msg => msg.id !== tempMessageId);
            });
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
        performanceMetrics.trackRender('ChatScreen-UploadStart');
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

            // === METRICS: Track upload network ===
            if (uploadResult.metrics) {
                const metrics = uploadResult.metrics;
                performanceMetrics.trackNetworkRequest(metrics.steps.arrayBufferSize, 'upload');
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
                performanceMetrics.trackRender('ChatScreen-UploadSuccess');

                // Thêm tin nhắn vào danh sách ngay lập tức
                const newMessage = {
                    ...messageResult.data,
                    sender: {
                        id: user.id,
                        name: user.name,
                        image: user.image
                    }
                };
                // Với inverted FlatList, message mới nhất phải ở index 0 → unshift vào đầu array
                setMessages(prev => {
                    const newMessages = mergeMessages([newMessage, ...prev]);
                    // CRITICAL: Sync messagesRef ngay lập tức
                    messagesRef.current = newMessages;
                    return newMessages;
                });
                performanceMetrics.trackRender('ChatScreen-AddMessage');

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
                console.log('[Chat] No otherUserId found');
                Alert.alert('Lỗi', 'Không thể xác định người nhận cuộc gọi');
                return;
            }

            console.log('🔊 Starting voice call...');
            console.log('🔊 CallManager:', CallManager);
            console.log('🔊 user.id:', user?.id);
            console.log('🔊 conversationId:', conversationId);

            // Check if CallManager is initialized
            if (!CallManager.currentUserId || !CallManager.webrtcService) {
                console.log('[Chat] CallManager not initialized, initializing now...');
                try {
                    const initResult = await CallManager.initialize(user.id, {
                        onIncomingCall: (call) => {
                            console.log('📞 Incoming call:', call);
                        },
                        onCallEnded: (call) => {
                            console.log('📞 Call ended:', call);
                        },
                        onCallAnswered: (call) => {
                            console.log('📞 Call answered:', call);
                        }
                    });
                    console.log('🔊 CallManager init result:', initResult);
                    if (!initResult.success) {
                        console.error('❌ CallManager initialization failed:', initResult.error);
                        Alert.alert('Lỗi', 'Không thể khởi tạo CallManager: ' + (initResult.error || 'Unknown error'));
                        return;
                    }
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
                console.log('[Chat] CallManager.startCall SUCCESS - Opening call...');
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
                                callId: result.callId || result.data?.id || null, // Pass callId
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
                console.log('[Chat] CallManager.startCall SUCCESS - Opening call...');
                try {
                    // Always use the new call screen for video calls
                    console.log('📹 Using video call screen');
                    router.push({
                        pathname: '/callScreen',
                        params: {
                            conversationId: conversationId,
                            callId: result.callId || result.data?.id || null,
                            otherUserId: otherUserId,
                            callType: 'video',
                            isIncoming: false,
                            callerName: getConversationName(),
                            callerAvatar: getConversationAvatar()
                        }
                    });
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
        // Track render performance
        performanceMetrics.trackRender(`Message-${message.id}`);

        const isOwn = message.sender_id === user.id;
        const isGroup = conversation?.type === 'group';

        // FIX E2EE BUG GIAI ĐOẠN 2: Check UI state theo thứ tự bắt buộc
        // 1. ui_optimistic_text (self message vừa gửi)
        // 2. runtime_plain_text (đã decrypt)
        // 3. is_encrypted (hiển thị "Đã mã hóa đầu cuối")
        // 4. content (plaintext message)
        const deviceService = require('../../services/deviceService').default;
        const currentDeviceId = currentDeviceIdRef.current;

        // FIX: Degrade gracefully khi currentDeviceId === null
        // Self message detection: Khi deviceId null, fallback detect bằng ui_optimistic_text hoặc sender_id
        // Lý do: Self message KHÔNG BAO GIỜ được render trắng, cần detect được ngay cả khi chưa có deviceId
        let isSelfMessage = false;
        if (currentDeviceId !== null && currentDeviceId !== undefined) {
            // Có deviceId → check strict (sender_device_id === currentDeviceId)
            isSelfMessage = message.sender_device_id === currentDeviceId;
        } else {
            // Không có deviceId → fallback detect self message bằng:
            // 1. ui_optimistic_text tồn tại (self message vừa gửi)
            // 2. HOẶC sender_id === currentUser.id (tin nhắn từ user hiện tại)
            const hasUiOptimisticTextFallback = message.ui_optimistic_text &&
                typeof message.ui_optimistic_text === 'string' &&
                message.ui_optimistic_text.trim() !== '';
            const isFromCurrentUser = message.sender_id === user.id;
            isSelfMessage = hasUiOptimisticTextFallback || isFromCurrentUser;
        }

        const hasUiOptimisticText = message.ui_optimistic_text &&
            typeof message.ui_optimistic_text === 'string' &&
            message.ui_optimistic_text.trim() !== '';
        
        // #region agent log
        if (message.id?.startsWith('temp-') || (message.is_sender_copy && !message.runtime_plain_text)) {
            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:2191',message:'renderMessage hasUiOptimisticText check',data:{messageId:message.id,uiOptimisticText:message.ui_optimistic_text,uiOptimisticTextType:typeof message.ui_optimistic_text,hasUiOptimisticText,isTemp:message.id?.startsWith('temp-'),isSenderCopy:message.is_sender_copy,hasRuntimePlainText:!!message.runtime_plain_text},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        }
        // #endregion

        // FIX: Khi currentDeviceId === null, bỏ qua device ID match check
        // Lý do: Nếu đã có runtime_plain_text trong RAM, được phép hiển thị (không nhất thiết phải match deviceId khi chưa có deviceId)
        // CRITICAL FIX: Không check decrypted_on_device_id cho runtime_plain_text - nếu có runtime_plain_text thì hiển thị
        // decrypted_on_device_id chỉ dùng để track, không dùng để restrict display
        let hasRuntimePlainText = false;
        if (message.runtime_plain_text &&
            typeof message.runtime_plain_text === 'string' &&
            message.runtime_plain_text.trim() !== '') {
            // Nếu có runtime_plain_text → luôn hiển thị (không check device ID)
            hasRuntimePlainText = true;
        }

        // TIÊU CHUẨN HIỂN THỊ TEXT (BẮT BUỘC):
        // Chỉ render plaintext khi có runtime_plain_text/ui_optimistic_text hoặc chắc chắn là plaintext
        // Mọi trường hợp còn lại → render label "Đã mã hóa đầu cuối"

        // FIX JUMPING: Nếu là optimistic message nhưng đã có sender_copy với runtime_plain_text trong messages array
        // thì không render optimistic này (để tránh duplicate)
        // Note: Không thể check trực tiếp trong renderMessage, nhưng optimistic sẽ được mergeMessages xử lý

        // === Đo thời gian tải ẢNH & VIDEO từng cái ===
        let imageLoadStart = null;
        let videoLoadStart = null;

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
                                    onLoadStart={() => {
                                        handleImageLoadStart(message.id);
                                        imageLoadStart = Date.now();
                                    }}
                                    onLoad={() => {
                                        handleImageLoadEnd(message.id);
                                        const loaded = Date.now();
                                        if (!loadedImageIds.current.has(message.id) && imageLoadStart) {
                                            const loadTime = loaded - imageLoadStart;
                                            loadedImageIds.current.add(message.id);
                                            // Lưu thời gian load thay vì log ngay
                                            imageLoadTimes.current.push({ id: message.id, time: loadTime });
                                            checkAllMediaLoadedAndLog();
                                        }
                                    }}
                                    onError={(error) => {
                                        handleImageLoadEnd(message.id);
                                        if (!loadedImageIds.current.has(message.id)) {
                                            loadedImageIds.current.add(message.id);

                                            checkAllMediaLoadedAndLog();
                                        }
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
                                        }
                                    }}
                                    source={{ uri: message.file_url }}
                                    style={styles.messageVideo}
                                    useNativeControls={true}
                                    resizeMode="cover"
                                    shouldPlay={playingVideo === message.id}
                                    onPlaybackStatusUpdate={(status) => {
                                    }}
                                    isLooping={false}
                                    onError={(error) => {
                                    }}
                                    onLoadStart={() => {
                                        videoLoadStart = Date.now();
                                    }}
                                    onLoad={() => {
                                        const loaded = Date.now();
                                        if (!loadedVideoIds.current.has(message.id) && videoLoadStart) {
                                            const loadTime = loaded - videoLoadStart;
                                            loadedVideoIds.current.add(message.id);
                                            // Lưu thời gian load thay vì log ngay
                                            videoLoadTimes.current.push({ id: message.id, time: loadTime });
                                            checkAllMediaLoadedAndLog();
                                        }
                                    }}
                                />
                                {playingVideo !== message.id && (
                                    <View style={styles.playButtonOverlay}>
                                        <Text style={styles.playButtonText}>▶</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ) : message.message_type === 'call_end' ? (
                            <CallEndMessage
                                message={message}
                                conversationId={conversationId}
                                conversation={conversation}
                                getOtherUserId={getOtherUserId}
                                router={router}
                                currentUserId={user.id}
                            />
                        ) : message.message_type === 'call_declined' ? (
                            <CallDeclinedMessage
                                message={message}
                                conversationId={conversationId}
                                conversation={conversation}
                                getOtherUserId={getOtherUserId}
                                router={router}
                                currentUserId={user.id}
                            />
                        ) : (() => {
                            // NEW ARCHITECTURE: ƯU TIÊN TUYỆT ĐỐI runtime_plain_text
                            // Nếu có runtime_plain_text → LUÔN render plaintext, KHÔNG BAO GIỜ render placeholder
                            if (message.runtime_plain_text &&
                                typeof message.runtime_plain_text === 'string' &&
                                message.runtime_plain_text.trim() !== '') {
                                console.log(`[RENDER_MESSAGE] Message ${message.id} has runtime_plain_text, length: ${message.runtime_plain_text.length}`);
                                // Có runtime_plain_text → render bubble với plaintext (bỏ qua placeholder check)
                            }
                            // CRITICAL FIX: KHÔNG return placeholder View riêng biệt ở đây
                            // Placeholder sẽ được render BÊN TRONG message bubble thông qua checkDisplayText logic

                            // Check xem có phải "Đã mã hóa đầu cuối" không - nếu có thì render riêng, không có messageBubble
                            let checkDisplayText = null;
                            if (message.message_type === 'text') {
                                if (isSelfMessage) {
                                    // Self message: check ui_optimistic_text, runtime_plain_text, content
                                    if (!hasUiOptimisticText && !hasRuntimePlainText) {
                                        const canRender = canRenderPlaintext(message, currentDeviceId);
                                        if (!canRender || !message.content || typeof message.content !== 'string' || message.content.trim() === '') {
                                            checkDisplayText = 'Đã mã hóa đầu cuối';
                                        }
                                    }
                                } else {
                                    // Non-self message
                                    checkDisplayText = getSafeDisplayText(message, currentDeviceId);
                                }
                            }

                            // Nếu checkDisplayText là "Đã mã hóa đầu cuối" NHƯNG đã có runtime_plain_text → bỏ qua placeholder
                            if (checkDisplayText === 'Đã mã hóa đầu cuối' && message.runtime_plain_text) {
                                // Đã có runtime_plain_text → không render placeholder, tiếp tục render bubble
                                checkDisplayText = null;
                            }

                            // CRITICAL FIX: KHÔNG return placeholder View riêng biệt ở đây
                            // Placeholder sẽ được render BÊN TRONG message bubble thông qua checkDisplayText
                            // Nếu checkDisplayText === 'Đã mã hóa đầu cuối', nó sẽ được render như text bình thường trong bubble

                            // CRITICAL FIX: Kiểm tra self message không có text → không render cả message bubble
                            if (isSelfMessage && message.message_type === 'text') {
                                if (!hasUiOptimisticText && !hasRuntimePlainText) {
                                    const canRender = canRenderPlaintext(message, currentDeviceId);
                                    if (!canRender || !message.content || typeof message.content !== 'string' || message.content.trim() === '') {
                                        // Self message không có text → không render cả message bubble
                                        return null;
                                    }
                                }
                            }

                            return (
                                <View style={[
                                    styles.messageBubble,
                                    // Optimistic message (có ui_optimistic_text) → LUÔN dùng bubble bình thường, KHÔNG BAO GIỜ dùng encryptedBubbleOwn
                                    isOwn ? styles.ownBubble : styles.otherBubble
                                ]}>
                                    {message.message_type === 'text' ? (() => {
                                        // Optimistic message → LUÔN dùng text style bình thường (màu trắng cho own, màu đen cho other)
                                        const textColorStyle = isOwn ? styles.ownText : styles.otherText;

                                        // FIX CRITICAL UI BUG: Tách riêng logic self message
                                        // Self message KHÔNG BAO GIỜ được trống
                                        if (isSelfMessage) {
                                            // Ưu tiên: ui_optimistic_text
                                            // #region agent log
                                            if (message.id?.startsWith('temp-')) {
                                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:2406',message:'renderMessage self message',data:{messageId:message.id,hasUiOptimisticText,uiOptimisticText:message.ui_optimistic_text?.substring(0,20),hasRuntimePlainText,runtimePlainText:message.runtime_plain_text?.substring(0,20),hasContent:!!message.content,contentLength:message.content?.length,contentPreview:message.content?.substring(0,20),isEncrypted:message.is_encrypted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                            }
                                            // #endregion
                                            if (hasUiOptimisticText) {
                                                // #region agent log
                                                if (message.id?.startsWith('temp-')) {
                                                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:2418',message:'renderMessage rendering ui_optimistic_text',data:{messageId:message.id,renderedText:message.ui_optimistic_text?.substring(0,20)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                                }
                                                // #endregion
                                                return (
                                                    <Text style={[
                                                        styles.messageText,
                                                        textColorStyle
                                                    ]}>
                                                        {message.ui_optimistic_text}
                                                    </Text>
                                                );
                                            }

                                            // Thứ hai: runtime_plain_text (đã decrypt)
                                            if (hasRuntimePlainText) {
                                                // #region agent log
                                                if (message.id?.startsWith('temp-')) {
                                                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:2430',message:'renderMessage rendering runtime_plain_text',data:{messageId:message.id,renderedText:message.runtime_plain_text?.substring(0,20)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                                }
                                                // #endregion
                                                return (
                                                    <Text style={[
                                                        styles.messageText,
                                                        textColorStyle
                                                    ]}>
                                                        {message.runtime_plain_text}
                                                    </Text>
                                                );
                                            }

                                            // Fallback: Self message luôn có text
                                            // Nếu chưa decrypt được → hiển thị "Đang gửi..." hoặc "Đã mã hóa đầu cuối"
                                            const canRender = canRenderPlaintext(message, currentDeviceId);

                                            // #region agent log
                                            if (message.id?.startsWith('temp-')) {
                                                fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:2443',message:'renderMessage fallback check',data:{messageId:message.id,canRender,hasContent:!!message.content,contentLength:message.content?.length,contentPreview:message.content?.substring(0,20),isEncrypted:message.is_encrypted},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                            }
                                            // #endregion

                                            // CRITICAL: TUYỆT ĐỐI không render content nếu message đã encrypted
                                            // Chỉ render content khi message KHÔNG encrypted (plaintext message)
                                            if (canRender && 
                                                message.is_encrypted !== true &&
                                                message.content &&
                                                typeof message.content === 'string' &&
                                                message.content.trim() !== '') {
                                                // #region agent log
                                                if (message.id?.startsWith('temp-')) {
                                                    fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:2479',message:'renderMessage rendering content (plaintext)',data:{messageId:message.id,renderedText:message.content?.substring(0,20),isEncrypted:message.is_encrypted,contentLength:message.content?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                                }
                                                // #endregion
                                                return (
                                                    <Text style={[
                                                        styles.messageText,
                                                        textColorStyle
                                                    ]}>
                                                        {message.content}
                                                    </Text>
                                                );
                                            }

                                            // Self message chưa có text → return null để không render text
                                            // CRITICAL: Self message đang gửi (có ui_optimistic_text) đã được xử lý ở trên
                                            // Nếu đến đây nghĩa là không có ui_optimistic_text, runtime_plain_text, hoặc content
                                            // → Return null để không render text (message bubble sẽ không có text nhưng vẫn có thời gian)
                                            // #region agent log
                                            fetch('http://127.0.0.1:7242/ingest/2005ce12-4d3c-49aa-9010-db0a71992420',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'chat.jsx:2503',message:'renderMessage returning null (no text for self message)',data:{messageId:message.id,isTemp:message.id?.startsWith('temp-'),hasUiOptimisticText,hasRuntimePlainText,hasContent:!!message.content,contentLength:message.content?.length,isEncrypted:message.is_encrypted,canRender},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
                                            // #endregion
                                            return null;
                                        }

                                        // Non-self message: Sử dụng checkDisplayText đã được tính toán ở trên
                                        // checkDisplayText có thể là: plaintext, "Đã mã hóa đầu cuối", hoặc null
                                        const displayText = checkDisplayText || getSafeDisplayText(message, currentDeviceId);

                                        // FIX CRITICAL UI BUG: Guard render - không render undefined/null/empty
                                        // CRITICAL: Đảm bảo displayText luôn là string hợp lệ trước khi render
                                        if (!displayText || typeof displayText !== 'string') {
                                            // ASSERT để bắt bug
                                            if (__DEV__) {
                                                console.error('[UI BUG] Invalid displayText', {
                                                    messageId: message.id,
                                                    isSelfMessage,
                                                    hasUiOptimisticText,
                                                    hasRuntimePlainText,
                                                    content: message.content?.substring(0, 50),
                                                    is_encrypted: message.is_encrypted,
                                                    sender_device_id: message.sender_device_id,
                                                    currentDeviceId,
                                                    checkDisplayText,
                                                    displayText,
                                                    displayTextType: typeof displayText
                                                });
                                            }

                                            // Fallback: luôn có text
                                            return (
                                                <Text style={[
                                                    styles.messageText,
                                                    isOwn ? styles.ownText : styles.otherText
                                                ]}>
                                                    Đã mã hóa đầu cuối
                                                </Text>
                                            );
                                        }

                                        // CRITICAL: Đảm bảo displayText là string hợp lệ (không rỗng)
                                        const safeDisplayText = displayText.trim() === '' ? 'Đã mã hóa đầu cuối' : displayText;

                                        // Display text hợp lệ (có thể là plaintext hoặc "Đã mã hóa đầu cuối")
                                        // CRITICAL: Render như text bình thường trong bubble, KHÔNG render placeholder View riêng biệt
                                        return (
                                            <Text style={[
                                                styles.messageText,
                                                isOwn ? styles.ownText : styles.otherText
                                            ]}>
                                                {safeDisplayText}
                                            </Text>
                                        );
                                    })() : null}

                                    <Text style={[
                                        styles.messageTime,
                                        isOwn ? styles.ownTime : styles.otherTime,
                                        { alignSelf: 'flex-end' } // Căn thời gian sang bên phải
                                    ]}>
                                        {moment(message.created_at).format('HH:mm')}
                                        {message.is_edited && ' (đã chỉnh sửa)'}
                                    </Text>
                                </View>
                            );
                        })()}

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
            </View >
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

                {/* E2E Encryption Notice - Chỉ hiển thị cho direct chat */}
                {conversation?.type === 'direct' && (
                    <View style={styles.encryptionNotice}>
                        <Ionicons name="lock-closed-outline" size={16} color="#555" />
                        <View style={styles.encryptionNoticeContent}>
                            <Text style={styles.encryptionNoticeText}>
                                🔒 Tin nhắn được mã hóa đầu cuối.{'\n'}
                                Chỉ bạn mới mở khóa để đọc đầy đủ.
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.pinUnlockButton}
                            onPress={isPinSet ? onPressUnlockPin : onPressSetupPin}
                        >
                            <Text style={styles.pinUnlockButtonText}>
                                {pinUnlocked ? '🔓 Đã mở khóa (PIN)' : (isPinSet ? '🔒 Nhập PIN' : 'Thiết lập PIN')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* PIN Setup Modal */}
                <Modal
                    visible={showSetupPinModal}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowSetupPinModal(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Thiết lập PIN</Text>
                            <Text style={styles.modalSubtitle}>Nhập 6 số PIN để mở khóa đọc tin nhắn từ thiết bị khác</Text>

                            <TextInput
                                style={styles.pinInput}
                                value={pinInput}
                                onChangeText={(text) => {
                                    setPinInput(text.replace(/[^0-9]/g, '').slice(0, 6));
                                    setPinError('');
                                }}
                                placeholder="Nhập PIN (6 số)"
                                placeholderTextColor={theme.colors.textSecondary}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry
                                autoFocus
                            />

                            <TextInput
                                style={[styles.pinInput, { marginTop: hp(1.5) }]}
                                value={pinConfirmInput}
                                onChangeText={(text) => {
                                    setPinConfirmInput(text.replace(/[^0-9]/g, '').slice(0, 6));
                                    setPinError('');
                                }}
                                placeholder="Xác nhận PIN (6 số)"
                                placeholderTextColor={theme.colors.textSecondary}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry
                            />

                            {pinError ? (
                                <Text style={styles.pinErrorText}>{pinError}</Text>
                            ) : null}

                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonCancel]}
                                    onPress={() => {
                                        setShowSetupPinModal(false);
                                        setPinInput('');
                                        setPinConfirmInput('');
                                        setPinError('');
                                    }}
                                >
                                    <Text style={styles.modalButtonCancelText}>Hủy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSubmit]}
                                    onPress={handleSetupPin}
                                    disabled={pinInput.length !== 6 || pinConfirmInput.length !== 6}
                                >
                                    <Text style={styles.modalButtonSubmitText}>Lưu PIN</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* PIN Unlock Modal */}
                <Modal
                    visible={showPinModal}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowPinModal(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>Nhập PIN để mở khóa</Text>
                            <Text style={styles.modalSubtitle}>Nhập 6 số PIN để đọc tin nhắn từ thiết bị khác</Text>

                            <TextInput
                                style={styles.pinInput}
                                value={pinInput}
                                onChangeText={(text) => {
                                    setPinInput(text.replace(/[^0-9]/g, '').slice(0, 6));
                                    setPinError('');
                                }}
                                placeholder="000000"
                                placeholderTextColor={theme.colors.textSecondary}
                                keyboardType="number-pad"
                                maxLength={6}
                                secureTextEntry
                                autoFocus
                            />

                            {pinError ? (
                                <Text style={styles.pinErrorText}>{pinError}</Text>
                            ) : null}

                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonCancel]}
                                    onPress={() => {
                                        setShowPinModal(false);
                                        setPinInput('');
                                        setPinError('');
                                    }}
                                >
                                    <Text style={styles.modalButtonCancelText}>Hủy</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSubmit]}
                                    onPress={handlePinSubmit}
                                    disabled={pinInput.length !== 6}
                                >
                                    <Text style={styles.modalButtonSubmitText}>Mở khóa</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Messages */}
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => item.id}
                    renderItem={renderMessage}
                    // Bỏ extraData để FlatList tự động detect changes từ data prop
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContainer}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    // FIX LỖI 1: Chuyển sang inverted mode để auto scroll xuống cuối ngay khi vào chat
                    // inverted={true} → tin nhắn mới nằm ở index 0, list mở ra là ở cuối ngay lập tức
                    // Không cần scrollToEnd cho initial load nữa
                    inverted={true}
                    // FIX SCROLL BUG: Tắt maintainVisibleContentPosition vì conflict với inverted FlatList
                    // maintainVisibleContentPosition gây nhảy về vị trí cũ thay vì giữ ở tin nhắn mới nhất
                    // maintainVisibleContentPosition={{
                    //     minIndexForVisible: 0
                    // }}
                    // Tối ưu cho thiết bị yếu: giảm số lượng render để cải thiện performance
                    initialNumToRender={20} // Render 20 items ban đầu
                    maxToRenderPerBatch={10} // Render tối đa 10 items mỗi batch
                    windowSize={5} // Giảm từ 10 xuống 5 để tiết kiệm memory (thiết bị yếu)
                    // FIX JUMPING: Tắt removeClippedSubviews để tránh FlatList nhảy vị trí khi có message mới
                    removeClippedSubviews={false}
                    // Bỏ auto scroll - để FlatList tự nhiên, không scroll khi có message mới
                    // Track vị trí scroll để quyết định auto scroll (chỉ cho message mới, không cho initial load)
                    // Với inverted FlatList, scroll position tính từ đầu (index 0 = tin nhắn mới nhất)
                    // Chỉ auto scroll khi user gần đầu (< 100px) để tránh interrupt user đang xem tin nhắn cũ
                    onScroll={(event) => {
                        const { contentOffset } = event.nativeEvent;
                        // Với inverted FlatList, contentOffset.y = 0 nghĩa là ở tin nhắn mới nhất
                        // User được coi là "gần đầu" (tin nhắn mới) nếu contentOffset.y < 100px
                        setIsNearBottom(contentOffset.y < 100);
                    }}
                    scrollEventThrottle={16} // Throttle scroll event mỗi 16ms (60fps) để không lag
                    // Handler khi user bắt đầu scroll tay - ngăn auto scroll
                    onScrollBeginDrag={() => {
                        // User bắt đầu scroll tay → set flag để ngăn auto scroll
                        // Điều này tránh interrupt user khi họ đang scroll để xem tin nhắn cũ
                        isUserScrollingRef.current = true;
                    }}
                    // Handler khi user thả tay sau khi scroll (có thể còn momentum)
                    onScrollEndDrag={() => {
                        // Reset flag sau 500ms (giảm từ 1000ms) để cho phép auto scroll lại nhanh hơn
                        // Delay 500ms đủ để momentum scroll kết thúc nhưng không quá lâu
                        setTimeout(() => {
                            isUserScrollingRef.current = false;
                        }, 500);
                    }}
                    // Handler khi momentum scroll kết thúc hoàn toàn
                    onMomentumScrollEnd={() => {
                        // Reset flag sau 500ms (giảm từ 1000ms) để cho phép auto scroll lại nhanh hơn
                        // Đảm bảo reset flag sau khi scroll hoàn toàn dừng
                        setTimeout(() => {
                            isUserScrollingRef.current = false;
                        }, 500);
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
        borderRadius: theme.radius.xl,
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
    encryptedTextOwn: {
        color: theme.colors.text, // Màu đen/theme text cho encrypted bubble (nền trắng)
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
    encryptionNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: '#f7f7f7',
        borderRadius: 12,
        marginHorizontal: wp(4),
        marginVertical: hp(1),
    },
    encryptionNoticeContent: {
        flex: 1,
        marginLeft: wp(2),
    },
    encryptionNoticeText: {
        fontSize: hp(1.3),
        color: '#555',
        lineHeight: hp(1.8),
    },
    encryptionNoticeLink: {
        color: theme.colors.primary,
        textDecorationLine: 'underline',
    },
    pinUnlockButton: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(3),
        paddingVertical: hp(0.8),
        borderRadius: 6,
        marginLeft: wp(2),
    },
    pinUnlockButtonText: {
        color: 'white',
        fontSize: hp(1.3),
        fontWeight: '600',
    },
    // PIN Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: wp(6),
        width: wp(85),
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: hp(2),
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: hp(0.5),
        textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        marginBottom: hp(3),
        textAlign: 'center',
    },
    pinInput: {
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        padding: hp(1.5),
        fontSize: hp(2.5),
        textAlign: 'center',
        letterSpacing: wp(2),
        marginBottom: hp(1),
        backgroundColor: theme.colors.backgroundSecondary,
    },
    pinErrorText: {
        color: '#FF6B6B',
        fontSize: hp(1.3),
        textAlign: 'center',
        marginBottom: hp(1),
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: hp(2),
    },
    modalButton: {
        flex: 1,
        paddingVertical: hp(1.5),
        borderRadius: 8,
        alignItems: 'center',
    },
    modalButtonCancel: {
        backgroundColor: theme.colors.backgroundSecondary,
        marginRight: wp(2),
    },
    modalButtonCancelText: {
        color: theme.colors.text,
        fontSize: hp(1.5),
        fontWeight: '600',
    },
    modalButtonSubmit: {
        backgroundColor: theme.colors.primary,
        marginLeft: wp(2),
    },
    modalButtonSubmitText: {
        color: 'white',
        fontSize: hp(1.5),
        fontWeight: '600',
    },
    encryptedBubbleOwn: {
        backgroundColor: '#FFFFFF',
        borderBottomRightRadius: theme.radius.sm,
        maxWidth: wp(70),
        borderWidth: 1,
        borderColor: '#D0D0D0',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    encryptedBubbleOther: {
        backgroundColor: '#FFFFFF',
        borderBottomLeftRadius: theme.radius.sm,
        maxWidth: wp(70),
        borderWidth: 1,
        borderColor: '#D0D0D0',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1,
        },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    decryptionErrorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(0.8),
        paddingHorizontal: wp(2),
        backgroundColor: '#FFFFFF', // Nền trắng - override background từ parent messageBubble
        borderRadius: wp(2),
        marginVertical: hp(0.2),
        marginHorizontal: wp(-1), // Che phần padding của parent để background trắng hiển thị đầy đủ
        borderWidth: 1,
        borderColor: '#E0E0E0', // Border xám nhẹ giống tin nhắn bình thường, phù hợp với chữ đỏ nền trắng
    },
    decryptionErrorText: {
        fontSize: hp(1.5),
        color: '#FF0000', // Chữ đỏ
        marginLeft: wp(1.5),
        fontStyle: 'italic',
        fontWeight: '400',
    },
    callEndInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(1.5),
        marginBottom: hp(0.5),
    },
    callEndTypeInline: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
    },
    callEndBottomRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(2),
        marginTop: hp(0.3),
    },
    callEndDurationInline: {
        fontSize: hp(1.5),
        fontWeight: theme.fonts.normal,
    },
    callBackButtonInline: {
        backgroundColor: 'transparent',
        paddingHorizontal: 0,
        paddingVertical: 0,
    },
    callBackTextInline: {
        fontSize: hp(1.5),
        fontWeight: theme.fonts.medium,
        color: theme.colors.error || '#FF3B30',
    },
    callEndTimeInline: {
        marginTop: 0,
    },
    callMessageBubbleOwn: {
        backgroundColor: theme.colors.primary,
        borderBottomRightRadius: theme.radius.sm,
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        borderBottomLeftRadius: theme.radius.xl,
    },
    callMessageBubbleOther: {
        backgroundColor: theme.colors.backgroundSecondary,
        borderBottomLeftRadius: theme.radius.sm,
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        borderBottomRightRadius: theme.radius.xl,
    },
    callMessageTextOwn: {
        color: 'white',
    },
    callMessageTextOther: {
        color: theme.colors.text,
    },
    callMessageTimeOwn: {
        color: 'rgba(255, 255, 255, 0.7)',
    },
    callMessageTimeOther: {
        color: theme.colors.textLight || '#999999',
    },
});