import { BlurView } from 'expo-blur';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { RTCView } from 'react-native-webrtc';
import Icon from '../../assets/icons';
import Avatar from '../../components/Avatar';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import CallManager from '../../services/callManager';

const { width, height } = Dimensions.get('window');

const CallScreen = () => {
    const router = useRouter();
    const { user } = useAuth();
    const {
        callType = 'voice', // 'voice' or 'video'
        conversationId = null,
        callId = null,
        isIncoming = false,
        callerName = 'Unknown',
        callerAvatar = null
    } = useLocalSearchParams();

    // Normalize isIncoming to boolean (could be string "true" from navigation)
    const isIncomingCall = isIncoming === true || isIncoming === 'true' || isIncoming === '1';

    const [callStatus, setCallStatus] = useState(isIncomingCall ? 'ringing' : 'connecting');
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoMuted, setIsVideoMuted] = useState(callType === 'voice');
    const [isSpeakerOn, setIsSpeakerOn] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);
    const [isRecording, setIsRecording] = useState(false);

    const durationRef = useRef(0);
    const durationInterval = useRef(null);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const pollingInterval = useRef(null);
    const lastRemoteStreamId = useRef(null);
    const remoteStreamDebounceTimer = useRef(null);

    // STABLE REMOTE STREAM: Cache stream cuối cùng hợp lệ để tránh flicker
    const stableRemoteStreamRef = useRef(null);
    const [stableRemoteStreamState, setStableRemoteStreamState] = useState(null);

    // NETWORK DROP DETECTION & RECONNECT
    const networkDropStartTime = useRef(null);
    const reconnectAttempts = useRef(0);
    const reconnectTimer = useRef(null);
    const MAX_RECONNECT_ATTEMPTS = 3;
    const RECONNECT_INTERVAL_MS = 2000; // 2 seconds
    const NETWORK_DROP_THRESHOLD_MS = 2000; // 2 seconds

    // Helper function: Kiểm tra có nên giữ stable stream không
    function shouldKeepStableStream(currentCallStatus, currentRemoteStream) {
        // Giữ stable stream nếu: call chưa ended VÀ remoteStream tạm thời null
        return currentCallStatus !== 'ended' && !currentRemoteStream;
    }

    function commitStableRemoteStream(stream) {
        const newId = stream?.id;
        if (!newId) {
            console.log("📹 commitStableRemoteStream: stream has no ID, skipping");
            return;
        }
        if (stableRemoteStreamRef.current?.id === newId) {
            console.log("📹 commitStableRemoteStream: same stream ID, skipping", newId);
            return;
        }

        const oldId = stableRemoteStreamRef.current?.id || null;
        stableRemoteStreamRef.current = stream;
        setStableRemoteStreamState(stream);
        console.log("📹 commitStableRemoteStream: committed", {
            oldId: oldId,
            newId: newId,
            hasStableStream: !!stableRemoteStreamRef.current,
            stableStreamId: stableRemoteStreamRef.current?.id
        });
    }

    // Helper function: Clear stable stream với logging và validation
    function clearStableStreamIfAllowed(reason, currentCallStatus) {
        if (currentCallStatus !== 'ended') {
            console.warn("❌ WRONG CLEAR? stable stream cleared here", {
                file: "app/(main)/callScreen.jsx",
                function: reason,
                callStatus: currentCallStatus,
                remoteStreamIdBefore: stableRemoteStreamRef.current?.id
            });
            console.trace();
            return false; // Không được clear
        }

        // Chỉ clear khi call đã ended
        console.log("✅ Clearing stable stream (call ended):", reason);
        stableRemoteStreamRef.current = null;
        setStableRemoteStreamState(null);
        return true;
    }

    // Pulse animation for ringing
    useEffect(() => {
        if (callStatus === 'ringing') {
            const pulse = () => {
                Animated.sequence([
                    Animated.timing(pulseAnim, {
                        toValue: 1.2,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                    Animated.timing(pulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        useNativeDriver: true,
                    }),
                ]).start(() => pulse());
            };
            pulse();
        }
    }, [callStatus]);

    // Call duration timer
    useEffect(() => {
        if (callStatus === 'connected') {
            durationInterval.current = setInterval(() => {
                durationRef.current += 1;
                setCallDuration(durationRef.current);
            }, 1000);
        } else {
            if (durationInterval.current) {
                clearInterval(durationInterval.current);
                durationInterval.current = null;
            }
        }

        return () => {
            if (durationInterval.current) {
                clearInterval(durationInterval.current);
            }
        };
    }, [callStatus]);

    // Initialize call and set up listener
    useEffect(() => {
        // Set up listeners FIRST, before initializing call
        if (!isIncomingCall && conversationId) {
            console.log('📞 Setting up onCallAnswered listener for outgoing call');
            const handleCallAnswered = (call) => {
                console.log('📞📞📞 onCallAnswered callback triggered!', call);
                console.log('📞 Call data:', call);
                // Stop polling when call is answered
                if (pollingInterval.current) {
                    clearInterval(pollingInterval.current);
                    pollingInterval.current = null;
                    console.log('📞 Polling stopped');
                }
                CallManager.markCallAsAnswered();
                setCallStatus('connected');
                console.log('✅ Call status updated to connected via listener');
            };
            CallManager.onCallAnswered = handleCallAnswered;
            console.log('✅ onCallAnswered listener set:', !!CallManager.onCallAnswered);
        }

        // Set up onCallEnded listener for both incoming and outgoing calls
        const handleCallEnded = async (call) => {
            console.log('📞📞📞 onCallEnded callback triggered!', call);

            // If call was declined, only save message if we are the receiver (the one who declined)
            // The receiver already saved the message in rejectCall, so we don't need to save it again here
            // This prevents duplicate messages and ensures the message appears on the correct side
            if (call?.status === 'declined') {
                // Check if we are the receiver (the one who declined)
                const isReceiver = call?.receiver_id === user?.id;
                if (isReceiver) {
                    // Receiver already saved message in rejectCall, no need to save again
                    console.log('📞 Call declined by receiver, message already saved in rejectCall');
                } else {
                    // Caller side: don't save message here, receiver already saved it
                    console.log('📞 Call declined by receiver, caller side - no message needed');
                }
            }

            setCallStatus('ended');
            // Stop polling
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
                pollingInterval.current = null;
            }
            // Navigation will be handled by useEffect when callStatus changes to 'ended'
        };
        CallManager.onCallEnded = handleCallEnded;
        console.log('✅ onCallEnded listener set:', !!CallManager.onCallEnded);

        // Setup stream update with debounce (STABLE_MS = 500ms)
        const STABLE_MS = 500;
        const streamUpdateInterval = setInterval(() => {
            const callStatusData = CallManager.getCallStatus();
            if (!callStatusData) return;

            // Update local stream if changed
            if (callStatusData.localStream !== localStream) {
                setLocalStream(callStatusData.localStream);
            }

            // CRITICAL: Kiểm tra có nên giữ stable stream không - CHỈ 1 BLOCK DUY NHẤT
            if (shouldKeepStableStream(callStatus, callStatusData.remoteStream)) {
                console.log("📹 [POLLING] Remote stream temporarily null – KEEPING stable stream", {
                    callStatus: callStatus,
                    hasStableStream: !!stableRemoteStreamRef.current,
                    stableStreamId: stableRemoteStreamRef.current?.id
                });

                // Detect network drop: call connected but remoteStream missing
                if (callStatus === 'connected' && stableRemoteStreamRef.current) {
                    const now = Date.now();
                    if (!networkDropStartTime.current) {
                        networkDropStartTime.current = now;
                        console.warn("⚠️ [NETWORK] Remote stream missing, possible network drop detected", {
                            callStatus: callStatus,
                            stableStreamId: stableRemoteStreamRef.current?.id,
                            hasStableStream: !!stableRemoteStreamRef.current
                        });
                    } else {
                        const dropDuration = now - networkDropStartTime.current;
                        if (dropDuration >= NETWORK_DROP_THRESHOLD_MS && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
                            // Trigger reconnect
                            if (!reconnectTimer.current) {
                                console.log("🔄 [RECONNECT] Attempting to reconnect remote stream", {
                                    dropDuration: dropDuration,
                                    attempt: reconnectAttempts.current + 1,
                                    maxAttempts: MAX_RECONNECT_ATTEMPTS
                                });
                                attemptReconnect();
                            }
                        }
                    }
                }
                return; // Giữ nguyên stable stream, không làm gì
            } else {
                // Remote stream is back - reset network drop tracking
                if (networkDropStartTime.current) {
                    const dropDuration = Date.now() - networkDropStartTime.current;
                    console.log("✅ [NETWORK] Remote stream recovered", {
                        dropDuration: dropDuration,
                        stableStreamId: stableRemoteStreamRef.current?.id
                    });
                    networkDropStartTime.current = null;
                    reconnectAttempts.current = 0;
                    if (reconnectTimer.current) {
                        clearTimeout(reconnectTimer.current);
                        reconnectTimer.current = null;
                    }
                }
            }

            // ✅ Chỉ clear khi call thật sự kết thúc ở cả UI lẫn database
            if (callStatusData?.status === 'ended' && callStatus === 'ended') {
                console.log("📹 [POLLING] CLEARING stable stream because call ended");

                // Clear debounce timer
                if (remoteStreamDebounceTimer.current) {
                    clearTimeout(remoteStreamDebounceTimer.current);
                    remoteStreamDebounceTimer.current = null;
                }

                // Clear reconnect timer and reset network drop tracking
                if (reconnectTimer.current) {
                    clearTimeout(reconnectTimer.current);
                    reconnectTimer.current = null;
                }
                networkDropStartTime.current = null;
                reconnectAttempts.current = 0;

                // Validate và clear stable stream
                if (clearStableStreamIfAllowed('streamUpdateInterval: call ended', callStatus)) {
                    console.log("📹 [POLLING] Stable stream cleared", {
                        oldId: stableRemoteStreamRef.current?.id || null,
                        callStatus: callStatus
                    });
                    setRemoteStream(null);
                    lastRemoteStreamId.current = null;

                    // Call clearRemoteStream on service
                    if (CallManager.webrtcService?.clearRemoteStream) {
                        CallManager.webrtcService.clearRemoteStream('callScreen: call ended (polling)', { force: true });
                    }
                }
                return;
            }

            // Nếu call chưa ended, xử lý remote stream
            if (!callStatusData.remoteStream) {
                // Remote stream null nhưng call chưa ended - đã được xử lý ở shouldKeepStableStream
                return;
            }

            const newRemoteStream = callStatusData.remoteStream;
            const newStreamId = newRemoteStream?.id;

            // CRITICAL: Chỉ nhận stream có VIDEO TRACK
            const videoTracks = newRemoteStream?.getVideoTracks?.() || [];
            const hasVideoTrack = videoTracks.length > 0;

            if (!hasVideoTrack) {
                // Stream chưa có video - giữ nguyên stable stream cũ
                console.log("📹 [POLLING] Waiting for video track, keeping stable stream", {
                    streamId: newStreamId,
                    stableStreamId: stableRemoteStreamRef.current?.id,
                    hasStableStream: !!stableRemoteStreamRef.current
                });

                // Also detect network drop if call is connected but no video track
                if (callStatus === 'connected' && stableRemoteStreamRef.current) {
                    const now = Date.now();
                    if (!networkDropStartTime.current) {
                        networkDropStartTime.current = now;
                        console.warn("⚠️ [NETWORK] Remote stream has no video track, possible network drop", {
                            callStatus: callStatus,
                            stableStreamId: stableRemoteStreamRef.current?.id
                        });
                    }
                }
                return;
            }

            // Reset network drop tracking when stream with video is detected
            if (networkDropStartTime.current) {
                const dropDuration = Date.now() - networkDropStartTime.current;
                console.log("✅ [NETWORK] Remote stream with video recovered", {
                    dropDuration: dropDuration,
                    streamId: newStreamId,
                    stableStreamId: stableRemoteStreamRef.current?.id
                });
                networkDropStartTime.current = null;
                reconnectAttempts.current = 0;
                if (reconnectTimer.current) {
                    clearTimeout(reconnectTimer.current);
                    reconnectTimer.current = null;
                }
            }

            // CRITICAL: Chỉ update stableRemoteStream khi stream ID thật sự thay đổi
            if (newStreamId && newStreamId !== stableRemoteStreamRef.current?.id) {
                // Stream ID mới - commit to stable stream
                console.log("📹 [POLLING] New stream ID detected, committing to stable", {
                    oldId: stableRemoteStreamRef.current?.id,
                    newId: newStreamId
                });
                commitStableRemoteStream(newRemoteStream);

                // Clear existing debounce timer
                if (remoteStreamDebounceTimer.current) {
                    clearTimeout(remoteStreamDebounceTimer.current);
                    remoteStreamDebounceTimer.current = null;
                }

                // Debounce: only commit after STABLE_MS of stability
                remoteStreamDebounceTimer.current = setTimeout(() => {
                    // Double check stream ID hasn't changed during debounce
                    if (stableRemoteStreamRef.current?.id === newStreamId && stableRemoteStreamRef.current) {
                        console.log("📹 [DEBOUNCE] Remote stream updated (stable)", {
                            oldId: lastRemoteStreamId.current,
                            newId: newStreamId,
                            stableStreamId: stableRemoteStreamRef.current?.id
                        });
                        setRemoteStream(stableRemoteStreamRef.current);
                        lastRemoteStreamId.current = newStreamId;
                    }
                    remoteStreamDebounceTimer.current = null;
                }, STABLE_MS);
            } else if (!stableRemoteStreamRef.current && newStreamId) {
                // Lần đầu nhận remote stream có video - commit immediately (không debounce)
                console.log("📹 [POLLING] First remote stream with video, committing immediately", {
                    streamId: newStreamId
                });
                commitStableRemoteStream(newRemoteStream);
                setRemoteStream(newRemoteStream);
                lastRemoteStreamId.current = newStreamId;
            }
            // Nếu cùng stream ID, không update state để tránh re-render
        }, 1000); // Update every 1000ms (1s)

        // Reconnect function for network recovery
        const attemptReconnect = async () => {
            if (reconnectAttempts.current >= MAX_RECONNECT_ATTEMPTS) {
                console.warn("⚠️ [RECONNECT] Max reconnect attempts reached", {
                    attempts: reconnectAttempts.current,
                    maxAttempts: MAX_RECONNECT_ATTEMPTS
                });
                return;
            }

            reconnectAttempts.current += 1;
            console.log("🔄 [RECONNECT] Attempting reconnect", {
                attempt: reconnectAttempts.current,
                maxAttempts: MAX_RECONNECT_ATTEMPTS
            });

            try {
                // Try to get remote stream from CallManager
                const callStatusData = CallManager.getCallStatus();
                if (callStatusData?.remoteStream) {
                    const recoveredStream = callStatusData.remoteStream;
                    const videoTracks = recoveredStream?.getVideoTracks?.() || [];
                    if (videoTracks.length > 0) {
                        console.log("✅ [RECONNECT] Remote stream recovered successfully", {
                            streamId: recoveredStream?.id,
                            attempt: reconnectAttempts.current
                        });
                        // Reset tracking
                        networkDropStartTime.current = null;
                        reconnectAttempts.current = 0;
                        if (reconnectTimer.current) {
                            clearTimeout(reconnectTimer.current);
                            reconnectTimer.current = null;
                        }
                        // Commit recovered stream
                        if (recoveredStream?.id !== stableRemoteStreamRef.current?.id) {
                            commitStableRemoteStream(recoveredStream);
                            setRemoteStream(recoveredStream);
                            lastRemoteStreamId.current = recoveredStream?.id;
                        }
                        return;
                    }
                }

                // If still no stream, schedule next retry
                if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
                    reconnectTimer.current = setTimeout(() => {
                        reconnectTimer.current = null;
                        attemptReconnect();
                    }, RECONNECT_INTERVAL_MS);
                } else {
                    console.error("❌ [RECONNECT] Failed to recover remote stream after all attempts", {
                        attempts: reconnectAttempts.current
                    });
                }
            } catch (error) {
                console.error("❌ [RECONNECT] Reconnect error:", error);
                // Schedule next retry if attempts remain
                if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
                    reconnectTimer.current = setTimeout(() => {
                        reconnectTimer.current = null;
                        attemptReconnect();
                    }, RECONNECT_INTERVAL_MS);
                }
            }
        };

        // Initialize call after listeners are set
        initializeCall();

        return () => {
            clearInterval(streamUpdateInterval);
            // Clear pending debounce timer
            if (remoteStreamDebounceTimer.current) {
                clearTimeout(remoteStreamDebounceTimer.current);
                remoteStreamDebounceTimer.current = null;
            }
            // Clear reconnect timer
            if (reconnectTimer.current) {
                clearTimeout(reconnectTimer.current);
                reconnectTimer.current = null;
            }
            // Reset network drop tracking
            networkDropStartTime.current = null;
            reconnectAttempts.current = 0;
            // CRITICAL: Chỉ clear stable stream khi component unmount VÀ call đã ended
            // Không clear nếu call vẫn đang active (tránh mất stream khi navigate tạm thời)
            if (callStatus === 'ended') {
                console.log("📹 [CLEANUP] Component unmounting, clearing stable stream (call ended)", {
                    stableStreamId: stableRemoteStreamRef.current?.id || null,
                    hasStableStream: !!stableRemoteStreamRef.current
                });

                // Validate và clear stable stream
                if (clearStableStreamIfAllowed('useEffect cleanup: component unmount', callStatus)) {
                    setRemoteStream(null);
                    lastRemoteStreamId.current = null;
                }
            } else {
                console.log("📹 [CLEANUP] Component unmounting, KEEPING stable stream (call still active)", {
                    callStatus: callStatus,
                    hasStableStream: !!stableRemoteStreamRef.current,
                    stableStreamId: stableRemoteStreamRef.current?.id
                });
            }
            // Cleanup on unmount
            if (callStatus === 'connected') {
                endCall();
            }
            // Cleanup listener
            if (CallManager.onCallAnswered) {
                CallManager.onCallAnswered = null;
            }
            // Cleanup polling
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
                pollingInterval.current = null;
            }
        };
    }, []);

    const initializeCall = async () => {
        try {
            if (isIncomingCall && callId) {
                // Answer incoming call
                console.log('📞 Answering incoming call, callId:', callId);
                console.log('📞 Current callStatus before answer:', callStatus);
                const callResult = await CallManager.answerCall(callId);
                if (!callResult.success) {
                    Alert.alert('Lỗi', 'Không thể trả lời cuộc gọi');
                    return;
                }
                // Incoming call: answer immediately, so set connected
                console.log('📞 Call answered successfully, setting status to connected');
                setCallStatus('connected');
                console.log('✅ CallStatus set to connected for incoming call');

                // Get local stream for incoming call
                const callStatusData = CallManager.getCallStatus();
                setLocalStream(callStatusData.hasLocalStream);
                setIsRecording(callStatusData.hasLocalStream && callStatusData.localStream?.real);

                // DO NOT start polling for incoming calls - they are already answered
                console.log('📞 Incoming call answered, no polling needed');
            } else if (conversationId) {
                // Outgoing call: wait for receiver to answer
                console.log('📞 Call started, waiting for receiver to answer...');
                console.log('📞 Setting callStatus to ringing...');
                setCallStatus('ringing'); // Show ringing status
                console.log('📞 CallStatus should be ringing now');

                // Get local stream
                const callStatusData = CallManager.getCallStatus();
                setLocalStream(callStatusData.hasLocalStream);
                setIsRecording(callStatusData.hasLocalStream && callStatusData.localStream?.real);

                // Verify listener is set
                console.log('📞 Verifying onCallAnswered listener is set:', !!CallManager.onCallAnswered);

                // Start polling to check call status (only for outgoing calls)
                console.log('📞 Starting polling for outgoing call...');
                startPollingCallStatus();
            }
        } catch (error) {
            console.error('Call initialization error:', error);
            Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
        }
    };

    // Polling to check call status
    const startPollingCallStatus = () => {
        // Only poll if outgoing call (not incoming)
        if (isIncomingCall) {
            console.log('📞 Skipping polling for incoming call');
            return;
        }

        // Try to get callId from multiple sources
        let currentCallId = callId;
        if (!currentCallId) {
            currentCallId = CallManager.getCurrentCallId();
        }
        if (!currentCallId && conversationId) {
            // Try to get from conversation - query latest call request
            // This will be set up in the polling itself
        }

        if (!currentCallId) {
            console.log('⚠️ No callId available for polling, will try to get from conversation');
        } else {
            console.log('📞 Starting polling for call status, callId:', currentCallId);
        }

        pollingInterval.current = setInterval(async () => {
            try {
                // Double check - should not poll for incoming calls
                if (isIncomingCall) {
                    console.log('⚠️ Polling should not run for incoming calls, stopping...');
                    if (pollingInterval.current) {
                        clearInterval(pollingInterval.current);
                        pollingInterval.current = null;
                    }
                    return;
                }

                const { supabase } = require('../../lib/supabase');

                // If no callId, try to get from conversation
                let callIdToCheck = currentCallId;
                if (!callIdToCheck && conversationId && user?.id) {
                    const { data: callData, error: queryError } = await supabase
                        .from('call_requests')
                        .select('id, status, caller_id, receiver_id')
                        .eq('conversation_id', conversationId)
                        .or(`caller_id.eq.${user.id},receiver_id.eq.${user.id}`)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();

                    if (queryError && queryError.code !== 'PGRST116') {
                        console.log('Polling query error:', queryError);
                    }

                    if (callData) {
                        callIdToCheck = callData.id;
                        console.log('📞 Polling: Found callId from conversation:', callIdToCheck, 'Status:', callData.status);
                    }
                }

                if (!callIdToCheck) {
                    return; // Still no callId, skip this check
                }

                const { data, error } = await supabase
                    .from('call_requests')
                    .select('id, status')
                    .eq('id', callIdToCheck)
                    .single();

                if (error) {
                    if (error.code !== 'PGRST116') { // Not "no rows found"
                        console.log('Polling error:', error);
                    }
                    return;
                }

                if (data) {
                    console.log('📞 Polling: Call status check - ID:', data.id, 'Status:', data.status, 'Current UI status:', callStatus);

                    // Only update if status is 'ringing' and database says 'answered'
                    // Don't update if already 'connected' or 'ended'
                    if (data.status === 'answered' && callStatus === 'ringing') {
                        console.log('📞📞📞 Polling detected call answered! Updating UI...');
                        if (pollingInterval.current) {
                            clearInterval(pollingInterval.current);
                            pollingInterval.current = null;
                        }
                        CallManager.markCallAsAnswered();
                        setCallStatus('connected');
                        console.log('✅ Polling: UI status updated to connected');
                    } else if (data.status === 'declined' || data.status === 'ended') {
                        console.log('📞 Polling detected call declined/ended');
                        if (pollingInterval.current) {
                            clearInterval(pollingInterval.current);
                            pollingInterval.current = null;
                        }
                        // End the call on caller side
                        if (callStatus !== 'ended') {
                            CallManager.endCall().catch(err => {
                                console.error('Error ending call after decline:', err);
                            });
                        }
                        setCallStatus('ended');
                    }
                    // Don't update if status is already 'connected' - avoid overriding
                }
            } catch (error) {
                console.error('Polling error:', error);
            }
        }, 1000); // Check every 1 second
    };

    // Handle callStatus changes
    useEffect(() => {
        // When call ends, navigate back
        if (callStatus === 'ended') {
            // Navigate back after a delay
            const timer = setTimeout(() => {
                try {
                    if (router.canGoBack()) {
                        router.back();
                    } else {
                        // If can't go back, navigate to home
                        router.replace('/(main)/home');
                    }
                } catch (error) {
                    // Ignore navigation errors
                }
            }, 500);

            return () => clearTimeout(timer);
        }
    }, [callStatus]);

    const answerCall = async () => {
        console.log('📞 answerCall button pressed');
        console.log('📞 Current callStatus before answer:', callStatus);
        setCallStatus('connecting');
        await initializeCall();
        console.log('📞 answerCall completed, callStatus should be connected');
    };

    const endCall = async () => {
        try {
            await CallManager.endCall();
            setCallStatus('ended');
            // Navigation will be handled by useEffect when callStatus changes to 'ended'
        } catch (error) {
            console.error('End call error:', error);
            setCallStatus('ended');
            // Navigation will be handled by useEffect when callStatus changes to 'ended'
        }
    };

    const rejectCall = async () => {
        try {
            // If it's an incoming call that's still ringing, decline it
            if (isIncomingCall && callStatus === 'ringing' && callId) {
                console.log('📞 Declining incoming call:', callId);
                const result = await CallManager.declineCall(callId);
                if (result.success) {
                    console.log('✅ Call declined successfully');

                    // Save call declined message to conversation
                    // Get conversation_id from result if not in params
                    const convId = result.data?.conversation_id || conversationId;
                    if (convId && user?.id) {
                        try {
                            console.log('💬 Saving call declined message from receiver side...', {
                                conversation_id: convId,
                                sender_id: user.id,
                                call_type: result.data?.call_type || callType
                            });
                            const { sendMessage } = await import('../../services/chatService');
                            const callTypeValue = result.data?.call_type || callType || 'voice';
                            const declineResult = await sendMessage({
                                conversation_id: convId,
                                sender_id: user.id,
                                content: JSON.stringify({
                                    type: 'call_declined',
                                    call_type: callTypeValue
                                }),
                                message_type: 'call_declined'
                            });
                            if (declineResult.success) {
                                console.log('✅ Call declined message saved to conversation:', declineResult.data?.id);
                            } else {
                                console.log('❌ Failed to save call declined message:', declineResult.msg);
                            }
                        } catch (error) {
                            console.log('❌ Error saving call declined message:', error);
                        }
                    } else {
                        console.log('⚠️ Cannot save call declined message - missing info:', {
                            conversationId: convId,
                            userId: user?.id
                        });
                    }

                    setCallStatus('ended');
                } else {
                    console.error('❌ Failed to decline call:', result.error);
                    // Fallback to endCall
                    await CallManager.endCall();
                    setCallStatus('ended');
                }
            } else {
                // For other cases, just end the call
                await endCall();
            }
        } catch (error) {
            console.error('Reject call error:', error);
            // Fallback to endCall
            await endCall();
        }
    };

    const toggleMute = async () => {
        const result = await CallManager.muteAudio(!isMuted);
        if (result.success) {
            setIsMuted(!isMuted);
        }
    };

    const toggleVideo = async () => {
        if (callType === 'voice') return;

        const result = await CallManager.muteVideo(!isVideoMuted);
        if (result.success) {
            setIsVideoMuted(!isVideoMuted);
        }
    };

    const toggleSpeaker = () => {
        // TODO: Implement speaker toggle
        setIsSpeakerOn(!isSpeakerOn);
    };

    const switchCamera = async () => {
        if (callType === 'voice') return;
        const result = await CallManager.switchCamera();
        if (!result.success) {
            console.error('Switch camera error:', result.error);
        }
    };

    // Log when remote stream changes
    useEffect(() => {
        if (remoteStream) {
            let videoTracksInfo = [];
            let audioTracksInfo = [];
            try {
                if (remoteStream.getVideoTracks) {
                    const videoTracks = remoteStream.getVideoTracks();
                    videoTracksInfo = videoTracks.map(t => ({
                        id: t.id,
                        enabled: t.enabled,
                        readyState: t.readyState,
                        muted: t.muted
                    }));
                }
                if (remoteStream.getAudioTracks) {
                    const audioTracks = remoteStream.getAudioTracks();
                    audioTracksInfo = audioTracks.map(t => ({
                        id: t.id,
                        enabled: t.enabled,
                        readyState: t.readyState,
                        muted: t.muted
                    }));
                }
            } catch (e) {
                // Ignore
            }

            const streamURL = getStreamURL(remoteStream);
            console.log('📹 Remote stream state updated:', {
                hasId: !!remoteStream.id,
                streamId: remoteStream.id,
                hasStreamId: !!remoteStream._streamId,
                streamIdValue: remoteStream._streamId,
                hasToURL: !!remoteStream.toURL,
                streamURL: streamURL,
                hasGetTracks: !!remoteStream.getTracks,
                videoTracks: videoTracksInfo,
                audioTracks: audioTracksInfo,
                callStatus: callStatus,
                callType: callType
            });
        } else {
            console.log('📹 Remote stream is null, callStatus:', callStatus);
        }
    }, [remoteStream, callStatus, callType]);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Helper function to get stream URL
    const getStreamURL = (stream) => {
        if (!stream) return null;

        // For react-native-webrtc, RTCView needs the stream ID
        // Try stream.toURL() first (preferred method)
        if (stream.toURL && typeof stream.toURL === 'function') {
            try {
                const url = stream.toURL();
                // Ensure it's a string
                if (url && typeof url === 'string' && url.length > 0) {
                    return url;
                }
            } catch (e) {
                // Fall through
            }
        }

        // Fallback to stream.id (must be string)
        if (stream.id && typeof stream.id === 'string') {
            return stream.id;
        }

        // Fallback to _streamId (must be string)
        if (stream._streamId && typeof stream._streamId === 'string') {
            return stream._streamId;
        }

        return null;
    };

    // CRITICAL: UI render phải dùng stableRemoteStream, không dùng remoteStream trực tiếp
    // stableRemoteStream luôn giữ stream cũ cho UI, chỉ update khi stream ID thay đổi
    const displayRemoteStream = useMemo(() => {
        return (
            stableRemoteStreamState ||
            stableRemoteStreamRef.current ||
            remoteStream // fallback
        );
    }, [stableRemoteStreamState, remoteStream]);

    // CRITICAL: Chỉ tính remoteStreamURL khi stream ID thay đổi, không tính khi object reference thay đổi
    const remoteStreamURL = useMemo(() => {
        if (!displayRemoteStream) return null;
        return getStreamURL(displayRemoteStream);
    }, [displayRemoteStream?.id]);
    const localStreamURL = useMemo(() => getStreamURL(localStream), [localStream?.id, localStream?._streamId]);

    // Check if remote stream has video tracks - dùng displayRemoteStream (stable)
    const hasRemoteVideoTracks = useMemo(() => {
        if (!displayRemoteStream) {
            console.log('📹 hasRemoteVideoTracks: no remote stream');
            return false;
        }
        try {
            if (displayRemoteStream.getVideoTracks) {
                const videoTracks = displayRemoteStream.getVideoTracks();
                const hasTracks = videoTracks && videoTracks.length > 0;
                console.log('📹 hasRemoteVideoTracks:', hasTracks, 'tracks:', videoTracks?.length, 'trackIds:', videoTracks?.map(t => t.id));
                return hasTracks;
            }
        } catch (e) {
            console.log('📹 Error checking video tracks:', e);
        }
        return false;
    }, [displayRemoteStream]);

    const renderCallContent = () => {
        // Video call - show video streams
        if (callType === 'video') {
            // Show remote video if stream exists (even if not fully connected yet)
            // CRITICAL: Dùng displayRemoteStream (stable) thay vì remoteStream
            const hasRemoteVideo = displayRemoteStream && (callStatus === 'connected' || callStatus === 'connecting');
            const hasLocalVideo = localStream && !isVideoMuted && (callStatus === 'connected' || callStatus === 'connecting');

            // Show remote video if stream URL exists and we have video tracks
            const shouldShowRemoteVideo = hasRemoteVideo && displayRemoteStream && remoteStreamURL && hasRemoteVideoTracks;

            console.log('📹 Render check:', {
                hasRemoteVideo,
                hasRemoteStream: !!displayRemoteStream,
                hasStableStream: !!stableRemoteStreamRef.current,
                stableStreamId: stableRemoteStreamRef.current?.id,
                hasRemoteStreamURL: !!remoteStreamURL,
                remoteStreamURL,
                hasRemoteVideoTracks,
                shouldShowRemoteVideo,
                callStatus
            });

            return (
                <View style={styles.videoContainer}>
                    {/* Remote video - full screen */}
                    {shouldShowRemoteVideo && remoteStreamURL ? (
                        <RTCView
                            key={`remote-${displayRemoteStream?.id || stableRemoteStreamRef.current?.id || remoteStreamURL}`}
                            streamURL={remoteStreamURL}
                            style={styles.remoteVideoFullScreen}
                            objectFit="cover"
                            mirror={false}
                            zOrder={0}
                            playsinline={true}
                        />
                    ) : (
                        // Show avatar and info when no remote video or not connected
                        <View style={styles.remoteVideoPlaceholder}>
                            <Avatar
                                uri={callerAvatar || user?.image}
                                size={hp(18)}
                                rounded={theme.radius.full}
                            />
                            {callStatus === 'ringing' && isIncomingCall && (
                                <>
                                    <Text style={styles.incomingCallName}>{callerName}</Text>
                                    <Text style={styles.incomingCallType}>Cuộc gọi video</Text>
                                </>
                            )}
                            {(callStatus === 'ringing' && !isIncomingCall) && (
                                <>
                                    <Text style={styles.incomingCallName}>{callerName}</Text>
                                    <Text style={styles.incomingCallType}>Đang gọi...</Text>
                                </>
                            )}
                            {callStatus === 'connecting' && (
                                <View style={styles.connectingContainer}>
                                    <ActivityIndicator size="large" color="white" />
                                    <Text style={styles.connectingText}>Đang kết nối...</Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* Local video - thumbnail in top right corner */}
                    {hasLocalVideo && localStream && localStreamURL ? (
                        <View style={styles.localVideoThumbnail}>
                            <RTCView
                                streamURL={localStreamURL}
                                style={styles.localVideoThumbnailVideo}
                                objectFit="cover"
                                mirror={true}
                                zOrder={1}
                            />
                        </View>
                    ) : null}
                </View>
            );
        }

        // Voice call - show avatar
        return (
            <View style={styles.avatarContainer}>
                {callStatus === 'connecting' ? (
                    <View style={styles.connectingContainer}>
                        <ActivityIndicator size="large" color={theme.colors.primary} />
                        <Text style={styles.connectingText}>Đang kết nối...</Text>
                    </View>
                ) : (
                    <>
                        <Animated.View style={[
                            styles.avatarWrapper,
                            callStatus === 'ringing' && { transform: [{ scale: pulseAnim }] }
                        ]}>
                            <Avatar
                                uri={callerAvatar || user?.image}
                                size={hp(15)}
                                rounded={theme.radius.full}
                            />
                        </Animated.View>

                        {callStatus === 'ringing' && (
                            <View style={styles.ringingIndicator}>
                                <View style={styles.ringingDot} />
                                <View style={[styles.ringingDot, styles.ringingDot2]} />
                                <View style={[styles.ringingDot, styles.ringingDot3]} />
                            </View>
                        )}
                    </>
                )}
            </View>
        );
    };

    const handleCallBack = () => {
        // Navigate to call screen with same parameters
        router.push({
            pathname: '/callScreen',
            params: {
                callType: callType,
                conversationId: conversationId,
                isIncoming: false,
                callerName: callerName,
                callerAvatar: callerAvatar
            }
        });
    };

    return (
        <ScreenWrapper bg="black">
            <View style={styles.container}>
                {/* Call content */}
                {renderCallContent()}

                {/* Call info - only show for voice call or when video is muted/not connected */}
                {(callType === 'voice' || (callType === 'video' && (callStatus !== 'connected' || isVideoMuted))) && (
                    <View style={styles.callInfo}>
                        {callType === 'video' && callStatus === 'ringing' && isIncomingCall ? null : (
                            <>
                                <Text style={styles.callerName}>{callerName}</Text>
                                <Text style={styles.callStatus}>
                                    {callStatus === 'ringing' && (isIncomingCall ? 'Đang gọi đến...' : 'Đang gọi...')}
                                    {callStatus === 'connecting' && 'Đang kết nối...'}
                                    {callStatus === 'connected' && formatDuration(callDuration)}
                                    {callStatus === 'ended' && 'Cuộc gọi kết thúc'}
                                </Text>
                                {isRecording && (
                                    <Text style={styles.recordingStatus}>
                                        🎤 Đang ghi âm
                                    </Text>
                                )}
                            </>
                        )}
                    </View>
                )}

                {/* Duration overlay for video call when connected */}
                {callType === 'video' && callStatus === 'connected' && !isVideoMuted && (
                    <View style={styles.videoCallDurationOverlay}>
                        <Text style={styles.videoCallDurationText}>{formatDuration(callDuration)}</Text>
                    </View>
                )}

                {/* Call controls */}
                <BlurView intensity={20} tint="dark" style={styles.controlsBlur}>
                    <View style={styles.controls}>
                        {callStatus === 'ringing' && isIncomingCall && (
                            <>
                                <TouchableOpacity
                                    style={[styles.controlButton, styles.controlButtonMessenger, styles.declineButtonMessenger]}
                                    onPress={rejectCall}
                                >
                                    <Icon name="call" size={hp(3.5)} color="white" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.controlButton, styles.controlButtonMessenger, styles.answerButtonMessenger]}
                                    onPress={answerCall}
                                >
                                    <Icon name="call" size={hp(3.5)} color="white" />
                                </TouchableOpacity>
                            </>
                        )}

                        {(callStatus === 'ringing' || callStatus === 'connecting') && !isIncomingCall && (
                            <>
                                <TouchableOpacity
                                    style={[styles.controlButton, styles.controlButtonMessenger, styles.endCallButtonMessenger]}
                                    onPress={endCall}
                                >
                                    <Icon name="call" size={hp(3.5)} color="white" />
                                </TouchableOpacity>
                            </>
                        )}

                        {callStatus === 'connected' && (
                            <>
                                <TouchableOpacity
                                    style={[styles.controlButton, styles.controlButtonMessenger, isMuted ? styles.mutedButtonMessenger : styles.normalButtonMessenger]}
                                    onPress={toggleMute}
                                >
                                    <Icon name={isMuted ? "micOff" : "mic"} size={hp(2.8)} color="white" />
                                </TouchableOpacity>

                                {callType === 'video' && (
                                    <>
                                        <TouchableOpacity
                                            style={[styles.controlButton, styles.controlButtonMessenger, isVideoMuted ? styles.mutedButtonMessenger : styles.normalButtonMessenger]}
                                            onPress={toggleVideo}
                                        >
                                            <Icon name={isVideoMuted ? "videoOff" : "video"} size={hp(2.8)} color="white" />
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.controlButton, styles.controlButtonMessenger, styles.normalButtonMessenger]}
                                            onPress={switchCamera}
                                        >
                                            <Icon name="camera" size={hp(2.8)} color="white" />
                                        </TouchableOpacity>
                                    </>
                                )}

                                <TouchableOpacity
                                    style={[styles.controlButton, styles.controlButtonMessenger, styles.normalButtonMessenger]}
                                    onPress={toggleSpeaker}
                                >
                                    <Icon name={isSpeakerOn ? "speaker" : "speakerOff"} size={hp(2.8)} color="white" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.controlButton, styles.controlButtonMessenger, styles.endCallButtonMessenger]}
                                    onPress={endCall}
                                >
                                    <Icon name="call" size={hp(3.5)} color="white" />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </BlurView>
            </View>
        </ScreenWrapper>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'space-between',
    },

    // Video container
    videoContainer: {
        flex: 1,
        position: 'relative',
        backgroundColor: '#000',
    },
    remoteVideoFullScreen: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    remoteVideoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000',
        gap: hp(2),
    },
    incomingCallName: {
        fontSize: hp(3.5),
        fontWeight: theme.fonts.bold,
        color: 'white',
        marginTop: hp(2),
    },
    incomingCallType: {
        fontSize: hp(2),
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: hp(0.5),
    },
    localVideoThumbnail: {
        position: 'absolute',
        top: hp(2),
        right: wp(4),
        width: wp(28),
        height: hp(20),
        borderRadius: 18, // 16-20px as requested (18px = ~hp(2.2))
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(255, 255, 255, 0.3)',
        backgroundColor: '#000',
    },
    localVideoThumbnailVideo: {
        width: '100%',
        height: '100%',
    },
    localVideoThumbnailPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    connectingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        gap: hp(2),
    },
    connectingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        gap: hp(1.5),
    },
    connectingText: {
        color: 'white',
        fontSize: hp(1.8),
        fontWeight: theme.fonts.medium,
    },
    videoCallDurationOverlay: {
        position: 'absolute',
        top: hp(3),
        left: wp(4),
        paddingHorizontal: wp(3),
        paddingVertical: hp(0.8),
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: theme.radius.full,
    },
    videoCallDurationText: {
        color: 'white',
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
    },

    // Avatar container
    avatarContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    avatarWrapper: {
        marginBottom: hp(2),
    },
    ringingIndicator: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginTop: -hp(2),
        marginLeft: -wp(10),
        width: wp(20),
        height: hp(4),
    },
    ringingDot: {
        position: 'absolute',
        width: wp(3),
        height: wp(3),
        borderRadius: wp(1.5),
        backgroundColor: theme.colors.primary,
        opacity: 0.6,
    },
    ringingDot2: {
        left: wp(6),
        animationDelay: '0.2s',
    },
    ringingDot3: {
        left: wp(12),
        animationDelay: '0.4s',
    },

    // Call info
    callInfo: {
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingBottom: hp(2),
    },
    callerName: {
        fontSize: hp(3),
        fontWeight: theme.fonts.bold,
        color: 'white',
        marginBottom: hp(1),
    },
    callStatus: {
        fontSize: hp(2),
        color: 'rgba(255,255,255,0.7)',
    },
    recordingStatus: {
        fontSize: hp(1.5),
        color: theme.colors.primary,
        marginTop: hp(0.5),
        textAlign: 'center',
        fontWeight: '600',
    },

    // Controls
    controlsBlur: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        paddingBottom: hp(4),
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: wp(3),
    },
    controlButton: {
        width: hp(6.5),
        height: hp(6.5),
        borderRadius: theme.radius.full,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlButtonMessenger: {
        borderRadius: theme.radius.full,
        overflow: 'hidden',
    },
    normalButtonMessenger: {
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    mutedButtonMessenger: {
        backgroundColor: 'rgba(255, 59, 48, 0.8)', // Red when muted
    },
    answerButtonMessenger: {
        backgroundColor: 'rgba(52, 199, 89, 0.9)', // Green for answer (Messenger style)
        width: hp(7),
        height: hp(7),
    },
    declineButtonMessenger: {
        backgroundColor: 'rgba(255, 59, 48, 0.9)', // Red for decline
        width: hp(7),
        height: hp(7),
    },
    endCallButtonMessenger: {
        backgroundColor: 'rgba(255, 59, 48, 0.9)', // Red for end call
        width: hp(7.5),
        height: hp(7.5),
    },
    // Legacy styles (keep for backward compatibility)
    normalButton: {
        backgroundColor: 'rgba(255,255,255,0.2)',
    },
    mutedButton: {
        backgroundColor: theme.colors.error,
    },
    answerButton: {
        backgroundColor: theme.colors.success,
    },
    declineButton: {
        backgroundColor: theme.colors.error,
    },
});

export default CallScreen;
