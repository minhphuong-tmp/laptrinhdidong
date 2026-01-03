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
    splitFileIntoChunks,
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

            // NEW ARCHITECTURE: Không còn is_sender_copy, xử lý dựa trên sender_id
            // Nếu là tin nhắn mình gửi: lấy từ localStorage hoặc decrypt với PIN
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

                // NEW ARCHITECTURE: Xử lý tin nhắn đã gửi (không còn check is_sender_copy)
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

                // NEW ARCHITECTURE: Decrypt tin nhắn đã gửi
                let decryptedMessage = messageWithSender;
                if (messageWithSender.is_encrypted === true && messageWithSender.message_type === 'text') {
                    // Nếu có PIN unlock → decrypt với master key từ encrypted_for_sync
                    if (pinUnlocked) {
                        try {
                            const pinService = require('../../services/pinService').default;
                            const encryptionService = require('../../services/encryptionService').default;
                            const pinData = await pinService.fetchPinFromDatabase(user.id);
                            if (pinData && pinData.pin && pinData.pinSalt) {
                                const masterKey = await pinService.deriveUnlockKey(pinData.pin, pinData.pinSalt);
                                if (messageWithSender.encrypted_for_sync && masterKey) {
                                    const plaintext = await encryptionService.decryptForSync(messageWithSender.encrypted_for_sync, masterKey);
                                    if (plaintext && plaintext.trim() !== '') {
                                        console.log(`[REALTIME] ✓ Decrypted sent message ${messageWithSender.id} with master key (PIN)`);
                                        decryptedMessage = {
                                            ...messageWithSender,
                                            runtime_plain_text: plaintext,
                                            hasValidPlaintext: true,
                                            decryption_error: false
                                        };
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`[REALTIME] ✗ Error decrypting sent message ${messageWithSender.id} with master key:`, error);
                        }
                    }

                    // Không load từ localStorage - chỉ decrypt với PIN hoặc hiển thị placeholder
                    if (!decryptedMessage.runtime_plain_text) {
                        decryptedMessage = {
                            ...messageWithSender,
                            runtime_plain_text: undefined,
                            hasValidPlaintext: false,
                            decryption_error: false
                        };
                    }
                }

                // Device-local plaintext authority: sender_copy và optimistic tồn tại độc lập
                setMessages(prev => {
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

                // Tin nhắn mình gửi đã được xử lý → return
                return;
            }

            // NEW ARCHITECTURE: Tin nhắn từ người khác (sender_id !== user.id)
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
                console.error(`[REALTIME] Error fetching message ${message.id}:`, error);
                return; // Bỏ qua nếu không fetch được
            }

            // Call_end and call_declined messages không cần decrypt, hiển thị trực tiếp
            if (messageWithSender.message_type === 'call_end' || messageWithSender.message_type === 'call_declined') {
                // FIX: Tuyệt đối không push message vào state nếu message đó đã tồn tại (check id)
                setMessages(prev => {
                    const existingIndex = prev.findIndex(msg => msg.id === messageWithSender.id);
                    let newMessages;
                    if (existingIndex !== -1) {
                        // Đã có → merge với existing message, PRESERVE runtime_plain_text
                        const existingMessage = prev[existingIndex];
                        const tempMessages = [...prev];

                        // CRITICAL: Preserve runtime_plain_text từ existing message nếu có
                        if (existingMessage.runtime_plain_text && !messageWithSender.runtime_plain_text) {
                            tempMessages[existingIndex] = {
                                ...messageWithSender,
                                runtime_plain_text: existingMessage.runtime_plain_text,
                                is_encrypted: false
                            };
                            console.log(`[REALTIME_MERGE] Preserved runtime_plain_text for message ${messageWithSender.id} from existing message`);
                        } else {
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
                return;
            }

            // Tin nhắn nhận được: Decrypt với private key của device hiện tại
            let decryptedReceivedMessage = messageWithSender;
            if (messageWithSender.is_encrypted === true && messageWithSender.message_type === 'text' && messageWithSender.encrypted_for_receiver) {
                try {
                    const encryptionService = require('../../services/encryptionService').default;
                    const deviceService = require('../../services/deviceService').default;
                    const privateKey = await deviceService.getOrCreatePrivateKey(user.id);
                    const currentDeviceId = await deviceService.getOrCreateDeviceId();

                    if (privateKey && currentDeviceId) {
                        const plaintext = await encryptionService.decryptForReceiver(messageWithSender.encrypted_for_receiver, currentDeviceId, privateKey);
                        if (plaintext && plaintext.trim() !== '') {
                            console.log(`[REALTIME] ✓ Decrypted received message ${messageWithSender.id} with private key, plaintext length: ${plaintext.length}`);
                            decryptedReceivedMessage = {
                                ...messageWithSender,
                                runtime_plain_text: plaintext,
                                hasValidPlaintext: true,
                                decryption_error: false
                            };
                        } else {
                            console.warn(`[REALTIME] ✗ Failed to decrypt received message ${messageWithSender.id}: plaintext is empty or null - không hiển thị tin nhắn này`);
                            // Không decrypt được → không thêm vào state (return sớm)
                            return;
                        }
                    } else {
                        console.warn(`[REALTIME] ✗ No private key available for decrypting received message ${messageWithSender.id} - không hiển thị tin nhắn này`);
                        // Không có private key → không thêm vào state (return sớm)
                        return;
                    }
                } catch (error) {
                    console.error(`[REALTIME] ✗ Error decrypting received message ${messageWithSender.id}:`, error);
                    console.error(`[REALTIME] Error details:`, {
                        messageId: messageWithSender.id,
                        hasEncryptedForReceiver: !!messageWithSender.encrypted_for_receiver,
                        encryptedForReceiverLength: messageWithSender.encrypted_for_receiver?.length || 0
                    });
                }
            } else {
                // Tin nhắn encrypted nhưng không có encrypted_for_receiver hoặc không phải text
                // Nếu là encrypted text message nhưng không có encrypted_for_receiver → không hiển thị
                if (messageWithSender.is_encrypted === true && messageWithSender.message_type === 'text' && !messageWithSender.encrypted_for_receiver) {
                    console.warn(`[REALTIME] Received encrypted text message ${messageWithSender.id} without encrypted_for_receiver - không hiển thị tin nhắn này`);
                    return; // Không thêm vào state
                }
                // Tin nhắn không encrypted hoặc không phải text → tiếp tục xử lý bình thường
            }

            // FIX: Tuyệt đối không push message vào state nếu message đó đã tồn tại (check id)
            // CHỈ thêm vào state nếu decrypt thành công (có runtime_plain_text)
            if (!decryptedReceivedMessage.runtime_plain_text && decryptedReceivedMessage.is_encrypted === true && decryptedReceivedMessage.message_type === 'text') {
                console.warn(`[REALTIME] Received encrypted message ${decryptedReceivedMessage.id} without plaintext - không hiển thị tin nhắn này`);
                return; // Không thêm vào state
            }

            setMessages(prev => {
                const existingIndex = prev.findIndex(msg => msg.id === messageWithSender.id);
                let newMessages;
                if (existingIndex !== -1) {
                    // Đã có → merge với existing message, PRESERVE runtime_plain_text
                    const existingMessage = prev[existingIndex];
                    const tempMessages = [...prev];

                    // CRITICAL: Preserve runtime_plain_text từ existing message nếu có
                    // runtime_plain_text là runtime-only data, không được overwrite từ server/realtime
                    if (existingMessage.runtime_plain_text && !decryptedReceivedMessage.runtime_plain_text) {
                        // Existing message đã có runtime_plain_text → preserve nó
                        tempMessages[existingIndex] = {
                            ...decryptedReceivedMessage,
                            runtime_plain_text: existingMessage.runtime_plain_text,
                            is_encrypted: false // Đã decrypt
                        };
                        console.log(`[REALTIME_MERGE] Preserved runtime_plain_text for message ${decryptedReceivedMessage.id} from existing message`);
                    } else if (decryptedReceivedMessage.runtime_plain_text) {
                        // New message có runtime_plain_text → dùng nó
                        tempMessages[existingIndex] = decryptedReceivedMessage;
                    } else {
                        // Không có runtime_plain_text ở cả hai → dùng new message
                        tempMessages[existingIndex] = decryptedReceivedMessage;
                    }
                    newMessages = mergeMessages(tempMessages);
                } else {
                    // Chưa có → thêm vào (chỉ khi thực sự là message mới)
                    // FIX JUMPING: Với inverted FlatList, message mới nhất phải ở index 0 → thêm vào ĐẦU array
                    newMessages = mergeMessages([decryptedReceivedMessage, ...prev]);
                }

                // CRITICAL: Sync messagesRef ngay lập tức
                messagesRef.current = newMessages;
                return newMessages;
            });

            // Mark as read
            markAsRead();
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

    // DEPRECATED: ConversationKey architecture không còn được sử dụng
    // Re-decrypt messages khi PIN unlock (dùng encryptedForSync thay vì ConversationKey)
    useEffect(() => {
        if (!conversationId) return;

        // Chờ một chút để đảm bảo messages đã được load
        const timeoutId = setTimeout(async () => {
            if (pinUnlocked && messagesRef.current.length > 0) {
                console.log(`[USE_EFFECT_DECRYPT] PIN unlocked, re-decrypting messages for conversation ${conversationId}`);
                await decryptAllMessages();
            }
        }, 100);

        return () => clearTimeout(timeoutId);
    }, [conversationId, pinUnlocked]);

    // Merge messages: Chỉ filter duplicate đơn giản
    const mergeMessages = (messages) => {
        if (!messages || messages.length === 0) return messages;

        // Filter duplicate đơn giản: chỉ giữ message đầu tiên với mỗi id
        const seen = new Set();
        const mergedMessages = [];

        messages.forEach(msg => {
            if (!msg.id || seen.has(msg.id)) {
                return; // Bỏ qua message không có id hoặc đã có
            }
            seen.add(msg.id);
            mergedMessages.push(msg);
        });

        return mergedMessages;
    };

    const loadMessages = async () => {
        const localMessagePlaintextService = require('../../utils/localMessagePlaintextService').default;
        const encryptionService = require('../../services/encryptionService').default;
        const deviceService = require('../../services/deviceService').default;
        const pinService = require('../../services/pinService').default;

        setLoading(true);
        performanceMetrics.trackRender('ChatScreen-LoadMessages');


        const isPinUnlockedState = pinService.isUnlocked() || pinUnlocked;
        let masterKey = null;
        if (isPinUnlockedState) {
            try {
                const pinData = await pinService.fetchPinFromDatabase(user.id);
                if (pinData && pinData.pin && pinData.pinSalt) {
                    masterKey = await pinService.deriveUnlockKey(pinData.pin, pinData.pinSalt);
                    console.log('[LOAD_MESSAGES] ✓ PIN unlocked - Loading ALL messages from DB');
                }
            } catch (error) {
                console.error('[LOAD_MESSAGES] Error getting master key:', error);
            }
        }
        //PIN đã mở
        if (isPinUnlockedState && masterKey) {
            // PIN UNLOCKED: Load TẤT CẢ messages từ DB
            console.log('[LOAD_MESSAGES] Loading ALL messages from DB (PIN unlocked)');
            const res = await getMessages(conversationId, user.id, 1000, 0, true); // Load cả sent messages

            setLoading(false);

            if (res.success && res.data && Array.isArray(res.data)) {
                // Xử lý TẤT CẢ messages: decrypt received bằng private key, decrypt sent bằng master key
                let privateKey = null;
                try {
                    privateKey = await deviceService.getOrCreatePrivateKey(user.id);
                } catch (error) {
                    console.error('[LOAD_MESSAGES] Error getting private key:', error);
                }

                let allMessages = [];
                try {
                    const messagesPromise = res.data.map(async (msg) => {
                        try {
                            const isSentMessage = msg.sender_id === user.id;
                            const isTextMessage = msg.message_type === 'text';
                            const isEncrypted = msg.is_encrypted === true;

                            // Tin nhắn NHẬN ĐƯỢC: Decrypt với private key
                            if (!isSentMessage && isTextMessage && isEncrypted && msg.encrypted_for_receiver && privateKey) {
                                try {
                                    const currentDeviceId = await deviceService.getOrCreateDeviceId();
                                    if (!currentDeviceId) {
                                        return null; // Không có device ID → không hiển thị
                                    }
                                    const plaintext = await encryptionService.decryptForReceiver(msg.encrypted_for_receiver, currentDeviceId, privateKey);
                                    if (plaintext && plaintext.trim() !== '') {
                                        return {
                                            ...msg,
                                            runtime_plain_text: plaintext,
                                            hasValidPlaintext: true,
                                            decryption_error: false
                                        };
                                    }
                                    // Decrypt thất bại → return null để filter ra
                                    return null;
                                } catch (error) {
                                    // Decrypt failed → return null để filter ra
                                    return null;
                                }
                            }
                            //nếu PIN đã nhập mở
                            // Tin nhắn ĐÃ GỬI: Decrypt với master key (PIN)
                            if (isSentMessage && isTextMessage && isEncrypted && msg.encrypted_for_sync && masterKey) {
                                try {
                                    const plaintext = await encryptionService.decryptForSync(msg.encrypted_for_sync, masterKey);
                                    if (plaintext && plaintext.trim() !== '') {
                                        console.log(`[LOAD_MESSAGES] ✓ Decrypted sent message ${msg.id} with master key (PIN) from DB`);
                                        return {
                                            ...msg,
                                            runtime_plain_text: plaintext,
                                            hasValidPlaintext: true,
                                            decryption_error: false
                                        };
                                    }
                                    // Decrypt thất bại → return null để filter ra
                                    return null;
                                } catch (error) {
                                    console.error(`[LOAD_MESSAGES] ✗ Error decrypting sent message ${msg.id} with master key:`, error);
                                    // Decrypt error → return null để filter ra
                                    return null;
                                }
                            }

                            // Tin nhắn không encrypted hoặc không phải text → giữ nguyên (hiển thị bình thường)
                            return msg;
                        } catch (error) {
                            console.error(`[LOAD_MESSAGES] ✗ Error processing message ${msg?.id}:`, error);
                            return null;
                        }
                    });

                    const messagesResult = await Promise.all(messagesPromise);
                    // Filter ra các message không decrypt được (null)
                    allMessages = Array.isArray(messagesResult) ? messagesResult.filter(msg => msg !== null) : [];
                } catch (error) {
                    console.error('[LOAD_MESSAGES] ✗ Error in Promise.all:', error);
                    allMessages = [];
                }

                // Sort theo created_at (mới nhất trước)
                const sortedMessages = allMessages.sort((a, b) => {
                    const timeA = new Date(a.created_at).getTime();
                    const timeB = new Date(b.created_at).getTime();
                    return timeB - timeA; // DESC: mới nhất trước
                });

                setMessages(mergeMessages(sortedMessages));

                console.log(`[LOAD_MESSAGES] PIN unlocked: ${allMessages.length} total messages from DB`);

                // === METRICS: Track network data ===
                const estimatedSize = res.data.length * 500;
                performanceMetrics.trackNetworkRequest(estimatedSize, 'download');
                performanceMetrics.trackRender('ChatScreen-SetMessages');

                // Reset image loading states when loading messages
                setImageLoading({});
            } else {
                // res.data không hợp lệ hoặc không phải array
                console.error('[LOAD_MESSAGES] Invalid response data:', {
                    success: res.success,
                    hasData: !!res.data,
                    isArray: Array.isArray(res.data),
                    dataType: typeof res.data
                });
                setMessages([]);
            }
            return; // Kết thúc function sớm nếu PIN unlocked
        }


        //KHI PIN CHƯA MỞ
        // 1. Load tin nhắn NHẬN ĐƯỢC từ DB
        const res = await getMessages(conversationId, user.id, 1000, 0); // Chỉ lấy tin nhắn nhận được

        // 2. Load tin nhắn ĐÃ GỬI:
        //    - Text message: từ localStorage (bảo mật)
        //    - Ảnh/video: từ DB (không cần localStorage)

        // 2a. Load text messages từ localStorage
        const sentMessagesFromLocal = await localMessagePlaintextService.getSentMessagesForConversation(
            conversationId,
            user.id
        );

        // 2b. Query text messages từ DB (dựa vào localStorage)
        const sentTextMessageIds = sentMessagesFromLocal
            .filter(msg => msg.message_type === 'text')
            .map(msg => msg.id);
        let sentTextMessagesFromDB = [];
        if (sentTextMessageIds.length > 0) {
            const { data: dbTextMessages, error: dbTextError } = await supabase
                .from('messages')
                .select(`
                    *,
                    sender:users(id, name, image)
                `)
                .eq('conversation_id', conversationId)
                .in('id', sentTextMessageIds)
                .eq('sender_id', user.id);

            if (!dbTextError && dbTextMessages) {
                sentTextMessagesFromDB = dbTextMessages;
            }
        }

        // 2c. Query ảnh/video đã gửi trực tiếp từ DB (không cần localStorage)
        const { data: sentMediaMessagesFromDB, error: dbMediaError } = await supabase
            .from('messages')
            .select(`
                *,
                sender:users(id, name, image)
            `)
            .eq('conversation_id', conversationId)
            .eq('sender_id', user.id)
            .in('message_type', ['image', 'video']);

        if (dbMediaError) {
            console.error('[LOAD_MESSAGES] Error loading media messages from DB:', dbMediaError);
        }

        setLoading(false);

        if (res.success) {
            // 4. Xử lý tin nhắn NHẬN ĐƯỢC: Decrypt với private key
            let privateKey = null;
            try {
                privateKey = await deviceService.getOrCreatePrivateKey(user.id);
            } catch (error) {
                console.error('[LOAD_MESSAGES] Error getting private key:', error);
            }

            const receivedMessages = (await Promise.all(res.data.map(async (msg) => {
                const isTextMessage = msg.message_type === 'text';

                // Decrypt tin nhắn nhận được bằng private key
                if (isTextMessage && msg.is_encrypted && msg.encrypted_for_receiver && privateKey) {
                    try {
                        const currentDeviceId = await deviceService.getOrCreateDeviceId();
                        if (!currentDeviceId) {
                            return null; // Không có device ID → không hiển thị
                        }
                        const plaintext = await encryptionService.decryptForReceiver(msg.encrypted_for_receiver, currentDeviceId, privateKey);
                        if (plaintext && plaintext.trim() !== '') {
                            return {
                                ...msg,
                                runtime_plain_text: plaintext,
                                hasValidPlaintext: true,
                                decryption_error: false
                            };
                        }
                        // Decrypt thất bại → return null để filter ra
                        return null;
                    } catch (error) {
                        // Decrypt failed → return null để filter ra
                        return null;
                    }
                }

                // Tin nhắn không encrypted hoặc không phải text → giữ nguyên (hiển thị bình thường)
                return msg;
            }))).filter(msg => msg !== null); // Filter ra các message không decrypt được

            // 5. Xử lý tin nhắn ĐÃ GỬI:
            //    - Text message: Lấy plaintext từ localStorage và merge với data từ DB
            //    - Ảnh/video: Lấy trực tiếp từ DB (không cần localStorage)

            // 5a. Xử lý text messages (từ localStorage)
            const sentTextMessages = sentTextMessagesFromDB.map(dbMsg => {
                // Tìm plaintext từ localStorage
                const localMsg = sentMessagesFromLocal.find(m => m.id === dbMsg.id);
                if (localMsg && localMsg.plaintext) {
                    return {
                        ...dbMsg,
                        runtime_plain_text: localMsg.plaintext,
                        hasValidPlaintext: true,
                        decryption_error: false
                    };
                }
                // Không có trong localStorage → không hiển thị (return null để filter sau)
                return null;
            }).filter(msg => msg !== null); // Chỉ giữ messages có trong localStorage

            // 5b. Xử lý ảnh/video (từ DB, không cần localStorage)
            const sentMediaMessages = (sentMediaMessagesFromDB || []).map(dbMsg => {
                // Ảnh/video không cần decrypt, giữ nguyên từ DB
                return dbMsg;
            });

            // 5c. Merge text và media messages
            const sentMessages = [...sentTextMessages, ...sentMediaMessages];

            // 6. Merge received và sent messages
            const allMessages = [...receivedMessages, ...sentMessages];

            // 7. Sort theo created_at (mới nhất trước)
            const sortedMessages = allMessages.sort((a, b) => {
                const timeA = new Date(a.created_at).getTime();
                const timeB = new Date(b.created_at).getTime();
                return timeB - timeA; // DESC: mới nhất trước
            });

            setMessages(mergeMessages(sortedMessages));

            console.log(`[LOAD_MESSAGES] PIN locked: ${receivedMessages.length} received from DB, ${sentTextMessages.length} text sent from localStorage, ${sentMediaMessages.length} media sent from DB`);

            // === METRICS: Track network data ===
            const estimatedSize = res.data.length * 500;
            performanceMetrics.trackNetworkRequest(estimatedSize, 'download');
            performanceMetrics.trackRender('ChatScreen-SetMessages');

            // Reset image loading states when loading messages
            setImageLoading({});
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

    // NEW ARCHITECTURE: Decrypt messages với PIN unlock
    const decryptAllMessages = async () => {
        if (!conversationId) {
            console.log('[DECRYPT_ALL_MESSAGES] No conversationId');
            return;
        }

        const localMessagePlaintextService = require('../../utils/localMessagePlaintextService').default;
        const encryptionService = require('../../services/encryptionService').default;
        const deviceService = require('../../services/deviceService').default;
        const pinService = require('../../services/pinService').default;

        const currentMessages = messagesRef.current;
        console.log(`[DECRYPT_ALL_MESSAGES] Processing ${currentMessages.length} messages`);

        // Lấy private key để decrypt tin nhắn nhận được
        let privateKey = null;
        try {
            privateKey = await deviceService.getOrCreatePrivateKey(user.id);
            // Update last_active_at để đảm bảo device này là device active nhất
            await deviceService.updateLastActive(user.id);
        } catch (error) {
            console.error('[DECRYPT_ALL_MESSAGES] Error getting private key:', error);
        }

        // Lấy master key từ PIN (nếu đã unlock) - dùng state pinUnlocked thay vì pinService.isUnlocked()
        let masterKey = null;
        const isPinUnlocked = pinUnlocked; // Dùng state thay vì pinService.isUnlocked()
        if (isPinUnlocked) {
            try {
                const pinData = await pinService.fetchPinFromDatabase(user.id);
                if (pinData && pinData.pin && pinData.pinSalt) {
                    masterKey = await pinService.deriveUnlockKey(pinData.pin, pinData.pinSalt);
                    console.log('[DECRYPT_ALL_MESSAGES] ✓ Master key derived from PIN');
                }
            } catch (error) {
                console.error('[DECRYPT_ALL_MESSAGES] Error getting master key:', error);
            }
        }

        // CHỈ decrypt messages hiện tại, KHÔNG load lại từ DB
        // loadMessages() đã load từ DB rồi, không cần load lại
        const sortedAllMessages = [...currentMessages];

        const updatedMessagesRaw = await Promise.all(sortedAllMessages.map(async (msg) => {
            // CRITICAL: Nếu đã có runtime_plain_text → giữ nguyên (không decrypt lại)
            // Điều này đảm bảo không làm mất plaintext đã decrypt trước đó
            if (msg.runtime_plain_text && typeof msg.runtime_plain_text === 'string' && msg.runtime_plain_text.trim() !== '') {
                return msg;
            }

            const isSentMessage = msg.sender_id === user.id;
            const isEncrypted = msg.is_encrypted === true;
            const isTextMessage = msg.message_type === 'text';

            // TIN NHẮN ĐÃ GỬI: 
            // - Ưu tiên: Load plaintext từ localStorage (device đã gửi tin nhắn này)
            // - Nếu không có trong localStorage và có PIN unlock → thử decrypt với encrypted_for_sync (từ DB)
            // - Nếu không có cả 2 → KHÔNG hiển thị placeholder (tin nhắn từ thiết bị hiện tại luôn có trong localStorage)
            if (isSentMessage && isEncrypted && isTextMessage) {
                let plaintext = null;

                // Debug: Log message info trước khi load
                if (__DEV__) {
                    console.log(`[DECRYPT_ALL_MESSAGES] 🔍 Processing sent message:`, {
                        messageId: msg.id,
                        hasRuntimePlainText: !!(msg.runtime_plain_text && typeof msg.runtime_plain_text === 'string' && msg.runtime_plain_text.trim() !== ''),
                        currentRuntimePlainText: msg.runtime_plain_text?.substring(0, 50) || 'null'
                    });
                }

                // 1. Ưu tiên: Load từ localStorage (device đã gửi tin nhắn này)
                try {
                    const localMessagePlaintextService = require('../../utils/localMessagePlaintextService').default;
                    const localData = await localMessagePlaintextService.getMessagePlaintext(msg.id);
                    if (localData && localData.plaintext) {
                        plaintext = localData.plaintext;
                        console.log(`[DECRYPT_ALL_MESSAGES] ✓ Loaded sent message ${msg.id} plaintext from localStorage:`, {
                            messageId: msg.id,
                            plaintextLength: plaintext.length,
                            plaintextPreview: plaintext.substring(0, 50)
                        });
                    } else {
                        console.warn(`[DECRYPT_ALL_MESSAGES] ⚠️ Sent message ${msg.id} not found in localStorage - should always be there`);
                    }
                } catch (error) {
                    console.error(`[DECRYPT_ALL_MESSAGES] ✗ Error loading sent message ${msg.id} from localStorage:`, error);
                }

                // 2. Nếu không có trong localStorage và có PIN unlock → thử decrypt từ DB
                if (!plaintext && isPinUnlocked && masterKey && msg.encrypted_for_sync) {
                    try {
                        plaintext = await encryptionService.decryptForSync(msg.encrypted_for_sync, masterKey);
                        if (plaintext && plaintext.trim() !== '') {
                            console.log(`[DECRYPT_ALL_MESSAGES] ✓ Decrypted sent message ${msg.id} with master key (PIN) from DB`);
                        } else {
                            plaintext = null; // Reset nếu decrypt thất bại
                        }
                    } catch (error) {
                        console.error(`[DECRYPT_ALL_MESSAGES] ✗ Error decrypting sent message ${msg.id} with master key:`, error);
                        plaintext = null; // Reset nếu có lỗi
                    }
                }

                // Trả về message với plaintext (từ localStorage hoặc DB)
                if (plaintext && plaintext.trim() !== '') {
                    return {
                        ...msg,
                        runtime_plain_text: plaintext,
                        hasValidPlaintext: true,
                        decryption_error: false
                    };
                } else {
                    // Không có plaintext → return null để filter ra (không hiển thị)
                    return null;
                }
            }

            // TIN NHẮN NHẬN ĐƯỢC: Decrypt với private key của device hiện tại
            if (!isSentMessage && isTextMessage) {
                // Nếu có encrypted_for_receiver → decrypt
                if (msg.is_encrypted && msg.encrypted_for_receiver && privateKey) {
                    try {
                        const currentDeviceId = await deviceService.getOrCreateDeviceId();
                        if (!currentDeviceId) {
                            return null; // Không có device ID → không hiển thị
                        }
                        const plaintext = await encryptionService.decryptForReceiver(msg.encrypted_for_receiver, currentDeviceId, privateKey);
                        if (plaintext && plaintext.trim() !== '') {
                            console.log(`[DECRYPT_ALL_MESSAGES] ✓ Decrypted received message ${msg.id} with private key, plaintext length: ${plaintext.length}`);
                            return {
                                ...msg,
                                runtime_plain_text: plaintext,
                                hasValidPlaintext: true,
                                decryption_error: false
                            };
                        }
                        // Decrypt thất bại → return null để filter ra
                        return null;
                    } catch (error) {
                        // Decrypt failed → return null để filter ra
                        return null;
                    }
                }

                // Nếu có content (plaintext, không encrypted) → hiển thị trực tiếp
                if (msg.content && typeof msg.content === 'string' && msg.content.trim() !== '') {
                    return {
                        ...msg,
                        runtime_plain_text: msg.content,
                        hasValidPlaintext: true,
                        decryption_error: false,
                        is_encrypted: false
                    };
                }

                // Không decrypt được → return null để filter ra
                return null;
            }

            // Tin nhắn không encrypted hoặc không phải text → giữ nguyên (hiển thị bình thường)
            return msg;
        }));

        // Filter ra các message không decrypt được (null)
        const updatedMessages = updatedMessagesRaw.filter(msg => msg !== null);

        // Update state với messages đã decrypt (đã filter)
        const finalMessages = [...updatedMessages];
        messagesRef.current = finalMessages;
        setMessages(finalMessages);

        const sentWithPlaintext = finalMessages.filter(m => m.sender_id === user.id && m.runtime_plain_text).length;
        const receivedWithPlaintext = finalMessages.filter(m => m.sender_id !== user.id && m.runtime_plain_text).length;
        console.log(`[DECRYPT_ALL_MESSAGES] Completed:`);
        console.log(`  - PIN unlocked: ${isPinUnlocked}`);
        console.log(`  - Sent messages with plaintext: ${sentWithPlaintext}`);
        console.log(`  - Received messages with plaintext: ${receivedWithPlaintext}`);

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

                // Reload lại cuộc trò chuyện từ DB (PIN unlocked → load tất cả từ DB)
                console.log('[HANDLE_PIN_SUBMIT] PIN unlocked - Reloading messages from DB...');
                await loadMessages();
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
            created_at: new Date().toISOString(),
            ui_optimistic_text: plainText, // UI-only field - hiển thị ngay
            sender: { id: user.id, name: user.name, image: user.image }
        };

        // DEBUG LOG: Log optimistic message trước khi insert vào state
        // TEST: Tắt tạm để kiểm tra performance
        // console.log('[SEND_MESSAGE]');
        // console.log(`tempMessageId=${optimisticMessage.id}`);
        // console.log(`is_encrypted=${optimisticMessage.is_encrypted}`);
        // console.log(`content_length=${optimisticMessage.content ? optimisticMessage.content.length : 0}`);
        // console.log(`ui_optimistic_text=${optimisticMessage.ui_optimistic_text ? 'YES' : 'NO'}`);
        // console.log(`runtime_plain_text=${optimisticMessage.runtime_plain_text ? 'YES' : 'NO'}`);
        // console.log(`sender_device_id=${optimisticMessage.sender_device_id}`);

        // Thêm optimistic message vào state ngay để hiển thị
        // Với inverted FlatList, message mới nhất phải ở index 0 → unshift vào đầu array
        setMessages(prev => {
            const newMessages = mergeMessages([optimisticMessage, ...prev]);
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

        if (res.success && res.data) {
            // Load plaintext từ localStorage cho tin nhắn vừa gửi
            const localMessagePlaintextService = require('../../utils/localMessagePlaintextService').default;
            let plaintextFromLocal = null;
            try {
                const localData = await localMessagePlaintextService.getMessagePlaintext(res.data.id);
                if (localData && localData.plaintext) {
                    plaintextFromLocal = localData.plaintext;
                    console.log(`[SEND_MESSAGE] ✅ Đã load plaintext từ localStorage cho message ${res.data.id}:`, {
                        messageId: res.data.id,
                        plaintextLength: plaintextFromLocal.length,
                        plaintextPreview: plaintextFromLocal.substring(0, 50)
                    });
                } else {
                    console.warn(`[SEND_MESSAGE] ⚠️ Không tìm thấy plaintext trong localStorage cho message ${res.data.id}`);
                }
            } catch (error) {
                console.error(`[SEND_MESSAGE] ❌ Lỗi khi load plaintext từ localStorage:`, error);
            }

            // Thay thế optimistic message bằng message thật từ DB
            // CRITICAL: Xóa optimistic message và thêm real message để tránh duplicate key
            setMessages(prev => {
                // Tìm optimistic message để lấy ui_optimistic_text làm fallback
                const optimisticMsg = prev.find(msg => msg.id === tempMessageId);
                const optimisticText = optimisticMsg?.ui_optimistic_text;

                // Xóa optimistic message (temp-id) và thêm real message
                const filtered = prev.filter(msg => msg.id !== tempMessageId);
                const realMessage = {
                    ...res.data,
                    // Ưu tiên plaintextFromLocal, nếu không có thì dùng optimisticText
                    runtime_plain_text: plaintextFromLocal || optimisticText || undefined,
                    hasValidPlaintext: !!(plaintextFromLocal || optimisticText),
                    decryption_error: false
                };

                console.log(`[SEND_MESSAGE] 🔄 Thay thế optimistic message:`, {
                    messageId: res.data.id,
                    hasPlaintextFromLocal: !!plaintextFromLocal,
                    hasOptimisticText: !!optimisticText,
                    finalRuntimePlainText: realMessage.runtime_plain_text?.substring(0, 50)
                });

                // Với inverted FlatList, message mới nhất phải ở index 0
                const updated = mergeMessages([realMessage, ...filtered]);
                messagesRef.current = updated;
                return updated;
            });

            setMessageText('');

            // Re-check localStorage cho tất cả messages (để đảm bảo plaintext được load)
            setTimeout(async () => {
                await decryptAllMessages();
            }, 500); // Tăng delay để đảm bảo localStorage đã được lưu
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
                quality: 0.7,
            });

            if (!result.canceled && result.assets[0]) {
                const video = result.assets[0];

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
            console.error('Error details:', JSON.stringify(error, null, 2));
            Alert.alert('Lỗi', `Không thể chọn video: ${error.message || 'Unknown error'}`);
        }
    };

    const sendMediaMessage = async (file, type) => {
        if (!file || uploading) return;

        setUploading(true);
        performanceMetrics.trackRender('ChatScreen-UploadStart');
        const uploadStartTime = Date.now();
        console.log(`🚀 [Upload] Bắt đầu upload ${type}...`);
        console.log(`📦 [Upload] File size: ${file.fileSize ? (file.fileSize / (1024 * 1024)).toFixed(2) + 'MB' : 'Unknown'}`);

        try {
            // TEST: Chia file thành chunks để log (ngay cả khi file nhỏ)
            console.log(`🧪 [Test Chunk] Bắt đầu test chia chunks...`);
            try {
                const chunks = await splitFileIntoChunks(file);
                console.log(`🧪 [Test Chunk] Test chia chunks hoàn tất: ${chunks.length} chunks`);
            } catch (chunkError) {
                console.error(`🧪 [Test Chunk] Lỗi khi test chia chunks:`, chunkError);
            }

            // Tạo timeout cho upload (không giới hạn thời gian, nhưng giữ timeout để tránh treo)
            const uploadPromise = uploadMediaFile(file, type);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Upload timeout')), 300000) // 5 phút
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
                const totalUploadTime = Date.now() - uploadStartTime;
                const totalSeconds = (totalUploadTime / 1000).toFixed(2);
                console.log('✅ [Upload] Media message sent successfully');
                console.log(`⏱️ [Upload] Tổng thời gian upload: ${totalSeconds}s (${totalUploadTime}ms)`);
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
            const totalTime = Date.now() - uploadStartTime;
            const totalTimeSeconds = (totalTime / 1000).toFixed(2);
            console.error('❌ [Upload] Error sending media message:', error);
            console.log(`⏱️ [Upload] Tổng thời gian (lỗi): ${totalTimeSeconds}s (${totalTime}ms)`);
            if (error.message === 'Upload timeout') {
                Alert.alert('Lỗi', 'Upload quá lâu. Vui lòng thử lại');
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
        // Detect self message bằng sender_id
        const isSelfMessage = message.sender_id === user.id;

        const hasUiOptimisticText = message.ui_optimistic_text &&
            typeof message.ui_optimistic_text === 'string' &&
            message.ui_optimistic_text.trim() !== '';

        // Check runtime_plain_text: Nếu có thì hiển thị
        let hasRuntimePlainText = false;
        if (message.runtime_plain_text &&
            typeof message.runtime_plain_text === 'string' &&
            message.runtime_plain_text.trim() !== '') {
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
                            // Nếu có runtime_plain_text → LUÔN render plaintext
                            // Tin nhắn nhận được: KHÔNG hiển thị placeholder, chỉ hiển thị nếu có plaintext thật
                            // Tin nhắn đã gửi: KHÔNG hiển thị placeholder (luôn có trong localStorage)
                            if (message.runtime_plain_text &&
                                typeof message.runtime_plain_text === 'string' &&
                                message.runtime_plain_text.trim() !== '') {
                                // Có runtime_plain_text → render bubble với plaintext
                            }
                            // Không có runtime_plain_text: tiếp tục render bubble (không hiển thị placeholder cho tin nhắn đã gửi)

                            // Check display text (chỉ cho tin nhắn đã gửi)
                            // Tin nhắn nhận được: không check placeholder, chỉ hiển thị nếu có plaintext thật
                            let checkDisplayText = null;
                            if (message.message_type === 'text') {
                                if (isSelfMessage) {
                                    // Self message: check ui_optimistic_text, runtime_plain_text, content
                                    if (!hasUiOptimisticText && !hasRuntimePlainText) {
                                        const canRender = canRenderPlaintext(message, null);
                                        if (!canRender || !message.content || typeof message.content !== 'string' || message.content.trim() === '') {
                                            checkDisplayText = 'Đã mã hóa đầu cuối';
                                        }
                                    }
                                } else {
                                    // Non-self message: chỉ lấy text thật, không check placeholder
                                    checkDisplayText = getSafeDisplayText(message, null);
                                }
                            }

                            // KHÔNG hiển thị placeholder cho tin nhắn đã gửi (luôn có trong localStorage)
                            // Placeholder chỉ hiển thị cho tin nhắn từ thiết bị khác (khi sync từ cloud)
                            // Nhưng với kiến trúc hiện tại, tin nhắn đã gửi luôn có trong localStorage
                            // Nên không cần hiển thị placeholder

                            // Tin nhắn nhận được: đã decrypt trong loadMessages, luôn có plaintext
                            // Không cần check và return null

                            return (
                                <View style={[
                                    styles.messageBubble,
                                    // Optimistic message (có ui_optimistic_text) → LUÔN dùng bubble bình thường, KHÔNG BAO GIỜ dùng encryptedBubbleOwn
                                    isOwn ? styles.ownBubble : styles.otherBubble
                                ]}>

                                    {message.message_type === 'text' && (
                                        <>
                                            {/* FIX CRITICAL UI BUG: Ép buộc text luôn có giá trị - KHÔNG BAO GIỜ render undefined/null/empty */}
                                            {(() => {
                                                // Optimistic message → LUÔN dùng text style bình thường (màu trắng cho own, màu đen cho other)
                                                const textColorStyle = isOwn ? styles.ownText : styles.otherText;

                                                // FIX CRITICAL UI BUG: Tách riêng logic self message
                                                // Self message KHÔNG BAO GIỜ được trống
                                                if (isSelfMessage) {
                                                    // Ưu tiên: ui_optimistic_text
                                                    // DEBUG: Log để xác định white bubble bug
                                                    if (__DEV__ && message.id?.startsWith('temp-')) {
                                                        console.log('[RENDER_OPTIMISTIC]', {
                                                            id: message.id,
                                                            ui_optimistic_text: message.ui_optimistic_text,
                                                            ui_optimistic_text_type: typeof message.ui_optimistic_text,
                                                            ui_optimistic_text_length: message.ui_optimistic_text?.length,
                                                            hasUiOptimisticText,
                                                            isSelfMessage,
                                                            currentDeviceId: null
                                                        });
                                                    }
                                                    if (hasUiOptimisticText) {
                                                        return (
                                                            <Text style={[
                                                                styles.messageText,
                                                                textColorStyle
                                                            ]}>
                                                                {message.ui_optimistic_text}
                                                            </Text>
                                                        );
                                                    }

                                                    // Thứ hai: runtime_plain_text (đã decrypt hoặc từ localStorage)
                                                    if (hasRuntimePlainText) {
                                                        return (
                                                            <Text style={[
                                                                styles.messageText,
                                                                textColorStyle
                                                            ]}>
                                                                {message.runtime_plain_text}
                                                            </Text>
                                                        );
                                                    }

                                                    // Debug: Log nếu không có text
                                                    if (__DEV__ && !hasUiOptimisticText && !hasRuntimePlainText) {
                                                        console.warn('[RENDER_SELF_MESSAGE] ⚠️ Self message không có text:', {
                                                            messageId: message.id,
                                                            hasUiOptimisticText,
                                                            hasRuntimePlainText,
                                                            runtime_plain_text: message.runtime_plain_text,
                                                            content: message.content,
                                                            is_encrypted: message.is_encrypted
                                                        });
                                                    }

                                                    // Fallback: Self message luôn có text
                                                    // Nếu chưa decrypt được → hiển thị "Đang gửi..." hoặc "Đã mã hóa đầu cuối"
                                                    const canRender = canRenderPlaintext(message, null);

                                                    // DEBUG: Log để xác định white bubble bug
                                                    // TEST: Tắt tạm để kiểm tra performance
                                                    // if (__DEV__ && message.id?.startsWith('temp-')) {
                                                    //     console.log('[RENDER_SELF_FALLBACK]', {
                                                    //         id: message.id,
                                                    //         canRender,
                                                    //         content: message.content,
                                                    //         content_type: typeof message.content,
                                                    //         is_encrypted: message.is_encrypted,
                                                    //         hasUiOptimisticText,
                                                    //         hasRuntimePlainText
                                                    //     });
                                                    // }

                                                    if (canRender && message.content &&
                                                        typeof message.content === 'string' &&
                                                        message.content.trim() !== '') {
                                                        return (
                                                            <Text style={[
                                                                styles.messageText,
                                                                textColorStyle
                                                            ]}>
                                                                {message.content}
                                                            </Text>
                                                        );
                                                    }

                                                    // Self message chưa có text → return null (không hiển thị gì)
                                                    return null;
                                                }

                                                // Non-self message: Sử dụng helper để lấy text an toàn
                                                const displayText = getSafeDisplayText(message, null);

                                                // FIX CRITICAL UI BUG: Guard render - không render undefined/null/empty
                                                if (!displayText || typeof displayText !== 'string' || displayText.trim() === '') {
                                                    // Tin nhắn nhận được: không hiển thị placeholder, chỉ hiển thị nếu có plaintext thật
                                                    // Tin nhắn đã gửi: KHÔNG hiển thị placeholder (luôn có trong localStorage)
                                                    // Nếu không có displayText, thử dùng content hoặc không hiển thị gì
                                                    if (isSelfMessage) {
                                                        // Tin nhắn đã gửi không có text: có thể chưa load từ localStorage
                                                        // Không hiển thị placeholder, không hiển thị gì (sẽ được load sau)
                                                        return null;
                                                    }
                                                    // Tin nhắn nhận được: luôn hiển thị (đã decrypt trong loadMessages)
                                                    // Nếu không có displayText, dùng content hoặc empty string
                                                    const fallbackText = message.content || '';
                                                    if (fallbackText) {
                                                        return (
                                                            <Text style={[
                                                                styles.messageText,
                                                                isOwn ? styles.ownText : styles.otherText
                                                            ]}>
                                                                {fallbackText}
                                                            </Text>
                                                        );
                                                    }
                                                    // Nếu không có gì cả, không hiển thị
                                                    return null;
                                                }

                                                // Display text hợp lệ (không còn check "Đã mã hóa đầu cuối" ở đây nữa vì đã xử lý ở trên)

                                                // Plaintext hợp lệ → render text
                                                return (
                                                    <Text style={[
                                                        styles.messageText,
                                                        isOwn ? styles.ownText : styles.otherText
                                                    ]}>
                                                        {displayText}
                                                    </Text>
                                                );
                                            })()}
                                        </>
                                    )}

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
