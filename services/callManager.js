import { supabase } from '../lib/supabase';
import RealWebRTCService from './realWebRTCService';
import WebRTCService from './webRTCService';

class CallManager {
    constructor() {
        this.currentUserId = null;
        this.callChannel = null;
        this.onIncomingCall = null;
        this.onCallEnded = null;
        this.onCallAnswered = null;
        this.isListening = false;
        this.useAgora = false; // Disable Agora for Expo Go
        this.useRealWebRTC = false; // Disable real WebRTC for Expo Go (không support react-native-webrtc)
        this.useMock = false; // NO MOCK EVER
        this.useWebCall = false; // Disable WebView call
        this.useStream = false; // Stream removed
        this.useMockStream = false; // Mock Stream removed
        this.useVideoCall = true; // Enable video call

        // Subscription & Reconnect State
        this.subscriptionAttempts = 0;
        this.maxSubscriptionAttempts = 5;
        this.reconnectTimer = null;
        this.isSubscribed = false;
        this.hasVoiceMessageListener = false;
        this.voiceMessageDebounceTimer = null;
        this.pendingVoiceMessages = [];
        this.currentCallId = null;
        this.currentCallStatus = null;
    }

    // Initialize call manager
    async initialize(userId, callbacks = {}) {
        try {
            this.currentUserId = userId;
            // Only set callbacks if provided, don't overwrite existing ones
            if (callbacks.onIncomingCall) {
                this.onIncomingCall = callbacks.onIncomingCall;
            }
            if (callbacks.onCallEnded) {
                this.onCallEnded = callbacks.onCallEnded;
            }
            if (callbacks.onCallAnswered) {
                this.onCallAnswered = callbacks.onCallAnswered;
            }

            // Initialize WebRTC service
            if (this.useRealWebRTC) {
                this.webrtcService = new RealWebRTCService();
                const result = await this.webrtcService.initialize(userId);
                if (!result.success) {
                    console.error('Real WebRTC initialization failed:', result.error);
                    return { success: false, error: 'WebRTC initialization failed' };
                }
            } else if (this.useVideoCall) {
                this.webrtcService = new WebRTCService();
                const result = await this.webrtcService.initialize(userId);
                if (!result.success) {
                    console.error('WebRTC initialization failed:', result.error);
                    return { success: false, error: 'WebRTC initialization failed' };
                }
            } else if (this.useWebCall) {
                // No initialization needed for WebView call
            } else if (this.useAgora) {
                console.error('Agora support removed');
                return { success: false, error: 'Agora not supported' };
            } else {
                return { success: false, error: 'No call service available' };
            }

            // Start listening for incoming calls
            this.startListening();

            return { success: true };
        } catch (error) {
            console.error('Call Manager initialization error:', error);
            return { success: false, error: error.message };
        }
    }

    // Calculate exponential backoff delay
    getBackoffDelay(attempt) {
        return Math.min(2000 * Math.pow(2, attempt), 32000); // 2s, 4s, 8s, 16s, 32s max
    }

    // Auto-reconnect state for voice message channel
    voiceMessageReconnectAttempts = 0;
    maxVoiceMessageReconnectAttempts = 5;
    voiceMessageReconnectTimer = null;
    voiceMessageChannel = null;

    // Calculate exponential backoff delay for voice message channel
    getVoiceMessageBackoffDelay(attempt) {
        return Math.min(2000 * Math.pow(2, attempt), 32000); // 2s, 4s, 8s, 16s, 32s max
    }

    // Handle voice message channel error with auto-reconnect
    handleVoiceMessageChannelError() {
        if (this.voiceMessageReconnectAttempts >= this.maxVoiceMessageReconnectAttempts) {
            // Max attempts reached, silently stop retrying
            return;
        }

        // Clear existing timer
        if (this.voiceMessageReconnectTimer) {
            clearTimeout(this.voiceMessageReconnectTimer);
        }

        const delay = this.getVoiceMessageBackoffDelay(this.voiceMessageReconnectAttempts);
        this.voiceMessageReconnectAttempts += 1;

        // Auto-reconnect after delay (silent, no logging)
        this.voiceMessageReconnectTimer = setTimeout(() => {
            this.voiceMessageReconnectTimer = null;
            if (this.currentUserId) {
                // Reset flag to allow re-subscription
                this.hasVoiceMessageListener = false;
                this.setupVoiceMessageListener();
            }
        }, delay);
    }

    // Setup voice message listener (persistent, even after call ended)
    setupVoiceMessageListener() {
        if (!this.currentUserId) {
            return;
        }

        // Unsubscribe from existing channel if any
        if (this.voiceMessageChannel) {
            try {
                supabase.removeChannel(this.voiceMessageChannel);
            } catch (e) {
                // Ignore errors when removing channel
            }
            this.voiceMessageChannel = null;
        }

        const channelName = `voice-messages-${this.currentUserId}`;

        this.voiceMessageChannel = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `sender_id=neq.${this.currentUserId}`
            }, async (payload) => {
                const message = payload.new;
                if (message.type === 'voice' || message.type === 'audio') {
                    // Debounce handler (200ms)
                    if (this.voiceMessageDebounceTimer) {
                        clearTimeout(this.voiceMessageDebounceTimer);
                    }

                    this.voiceMessageDebounceTimer = setTimeout(() => {
                        this.handleVoiceMessage(message);
                        this.voiceMessageDebounceTimer = null;
                    }, 200);
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    this.hasVoiceMessageListener = true;
                    this.voiceMessageReconnectAttempts = 0; // Reset on successful subscription
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    this.hasVoiceMessageListener = false;
                    // Auto-reconnect silently (no error logging)
                    this.handleVoiceMessageChannelError();
                } else if (status === 'CLOSED') {
                    this.hasVoiceMessageListener = false;
                    // Auto-reconnect on close if still needed
                    if (this.currentUserId) {
                        this.voiceMessageReconnectAttempts = 0; // Reset attempts for close event
                        this.handleVoiceMessageChannelError();
                    }
                }
            });
    }

    // Handle voice message (render if call active or has pending messages)
    handleVoiceMessage(message) {
        const shouldRender = this.currentCallStatus !== 'ended' || this.pendingVoiceMessages.length > 0;

        if (shouldRender) {
            // Add to pending if call ended, otherwise render immediately
            if (this.currentCallStatus === 'ended') {
                this.pendingVoiceMessages.push(message);
            } else {
                // Render immediately
                // TODO: Trigger UI update for voice message
            }
        }
    }

    // Start listening for incoming calls with stable subscription
    startListening() {
        if (this.isListening || !this.currentUserId) {
            return;
        }

        this.isListening = true;
        this.subscriptionAttempts = 0;
        this.subscribeToCallChannel();
        this.setupVoiceMessageListener();
    }

    // Subscribe to call channel with exponential backoff retry
    subscribeToCallChannel() {
        if (!this.currentUserId) {
            console.error('Cannot subscribe: no currentUserId');
            return;
        }

        // Clear existing channel if any
        if (this.callChannel) {
            try {
                supabase.removeChannel(this.callChannel);
            } catch (e) {
                // Ignore
            }
            this.callChannel = null;
        }

        const channelName = `calls-${this.currentUserId}`;

        this.callChannel = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'call_requests',
                filter: `receiver_id=eq.${this.currentUserId}`
            }, async (payload) => {
                // Fetch full call data with caller info
                try {
                    const { data: callData, error } = await supabase
                        .from('call_requests')
                        .select(`
                            *,
                            caller:users!call_requests_caller_id_fkey(id, name, image),
                            receiver:users!call_requests_receiver_id_fkey(id, name, image)
                        `)
                        .eq('id', payload.new.id)
                        .single();

                    if (error) {
                        console.error('Error fetching call data:', error);
                        if (this.onIncomingCall) {
                            this.onIncomingCall(payload.new);
                        }
                    } else {
                        if (this.onIncomingCall) {
                            this.onIncomingCall(callData);
                        }
                    }
                } catch (fetchError) {
                    console.error('Error fetching call data:', fetchError);
                    if (this.onIncomingCall) {
                        this.onIncomingCall(payload.new);
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'call_requests',
                filter: `caller_id=eq.${this.currentUserId}`
            }, async (payload) => {
                this.currentCallId = payload.new.id;
                this.currentCallStatus = payload.new.status;

                if (payload.new.status === 'answered') {
                    if (this.onCallAnswered) {
                        try {
                            this.onCallAnswered(payload.new);
                        } catch (callbackError) {
                            console.error('Error in onCallAnswered callback:', callbackError);
                        }
                    }
                } else if (payload.new.status === 'declined' || payload.new.status === 'ended') {
                    if (this.onCallEnded) {
                        try {
                            this.onCallEnded(payload.new);
                        } catch (callbackError) {
                            console.error('Error in onCallEnded callback:', callbackError);
                        }
                    }
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'call_requests',
                filter: `receiver_id=eq.${this.currentUserId}`
            }, async (payload) => {
                this.currentCallId = payload.new.id;
                this.currentCallStatus = payload.new.status;

                if (payload.new.status === 'ended') {
                    if (this.onCallEnded) {
                        try {
                            this.onCallEnded(payload.new);
                        } catch (callbackError) {
                            console.error('Error in onCallEnded callback:', callbackError);
                        }
                    }
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    this.isSubscribed = true;
                    this.subscriptionAttempts = 0;
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    this.isSubscribed = false;
                    this.subscriptionAttempts += 1;
                    // Auto-reconnect silently (no error logging)
                    this.handleSubscriptionError();
                } else if (status === 'CLOSED') {
                    this.isSubscribed = false;
                    this.handleChannelClose();
                }
            });
    }

    // Handle subscription error with exponential backoff retry (silent)
    handleSubscriptionError() {
        if (this.subscriptionAttempts >= this.maxSubscriptionAttempts) {
            // Max attempts reached, silently stop retrying
            return;
        }

        const delay = this.getBackoffDelay(this.subscriptionAttempts - 1);

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        // Auto-reconnect after delay (silent, no error logging)
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.currentUserId) {
                this.subscribeToCallChannel();
            }
        }, delay);
    }

    // Handle channel close - auto reconnect
    handleChannelClose() {
        if (!this.isListening) {
            return; // Don't reconnect if we stopped listening intentionally
        }

        this.subscriptionAttempts = 0; // Reset attempts for close event
        this.handleSubscriptionError();
    }

    // Stop listening for calls
    stopListening() {
        // Clear reconnect timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.voiceMessageReconnectTimer) {
            clearTimeout(this.voiceMessageReconnectTimer);
            this.voiceMessageReconnectTimer = null;
        }

        // Unsubscribe from call channel
        if (this.callChannel) {
            try {
                this.callChannel.unsubscribe();
                supabase.removeChannel(this.callChannel);
            } catch (e) {
                // Ignore error removing call channel
            }
            this.callChannel = null;
        }

        // Unsubscribe from voice message channel
        if (this.voiceMessageChannel) {
            try {
                this.voiceMessageChannel.unsubscribe();
                supabase.removeChannel(this.voiceMessageChannel);
            } catch (e) {
                // Ignore error removing voice message channel
            }
            this.voiceMessageChannel = null;
        }

        this.isListening = false;
        this.isSubscribed = false;
        this.hasVoiceMessageListener = false;
        this.subscriptionAttempts = 0;
    }

    // Update call status (called from callScreen)
    updateCallStatus(callId, status) {
        this.currentCallId = callId;
        this.currentCallStatus = status;

        // Cleanup when call ended
        if (status === 'ended') {
            // Clear voice message debounce timer
            if (this.voiceMessageDebounceTimer) {
                clearTimeout(this.voiceMessageDebounceTimer);
                this.voiceMessageDebounceTimer = null;
            }

            // Process pending voice messages
            if (this.pendingVoiceMessages.length > 0) {
                // TODO: Render pending messages
                this.pendingVoiceMessages = [];
            }

            // Note: Don't clear stable channel - keep voice message listener active
        }
    }

    // Start a call
    async startCall(conversationId, otherUserId, callType = 'voice') {
        try {
            // If otherUserId is not provided, we need to get it from conversation
            if (!otherUserId && conversationId) {
                // This will be handled by the caller (chat.jsx) who has access to conversation data
                return { success: false, error: 'otherUserId is required' };
            }

            // Auto-initialize if not initialized yet
            if (!this.currentUserId) {
                return { success: false, error: 'CallManager not initialized. Please initialize first.' };
            }

            // Ensure listening is started to receive call status updates
            if (!this.isListening) {
                this.startListening();
            }

            // Auto-initialize webrtcService if needed
            if ((this.useRealWebRTC || this.useVideoCall) && !this.webrtcService) {
                if (this.useVideoCall) {
                    this.webrtcService = new WebRTCService();
                    const initResult = await this.webrtcService.initialize(this.currentUserId);
                    if (!initResult.success) {
                        console.error('Failed to auto-initialize WebRTC service:', initResult.error);
                        return { success: false, error: 'Failed to initialize WebRTC service' };
                    }
                } else if (this.useRealWebRTC) {
                    this.webrtcService = new RealWebRTCService();
                    const initResult = await this.webrtcService.initialize(this.currentUserId);
                    if (!initResult.success) {
                        console.error('Failed to auto-initialize Real WebRTC service:', initResult.error);
                        return { success: false, error: 'Failed to initialize WebRTC service' };
                    }
                }
            }

            if (this.useRealWebRTC) {
                // Use Real WebRTC service
                if (!this.webrtcService) {
                    console.error('❌ WebRTC service not initialized');
                    return { success: false, error: 'WebRTC service not initialized' };
                }
                const result = await this.webrtcService.startCall(conversationId, otherUserId, callType);
                if (result.success) {
                    if (result.webCall) {
                        // Use web call instead of WebRTC
                        return {
                            success: true,
                            webCall: true,
                            conversationId: conversationId,
                            otherUserId: otherUserId,
                            callType: callType
                        };
                    } else {
                        // Skip database call request for now, go directly to WebRTC
                        return {
                            success: true,
                            data: {
                                id: `call_${Date.now()}`,
                                callerId: this.currentUserId,
                                receiverId: otherUserId,
                                conversationId: conversationId,
                                callType: callType,
                                status: 'initiated'
                            },
                            webrtcCall: true
                        };
                    }
                } else {
                    return result;
                }
            } else if (this.useVideoCall) {
                // Use WebRTC service for video/voice calls
                if (!this.webrtcService) {
                    console.error('❌ WebRTC service not initialized');
                    return { success: false, error: 'WebRTC service not initialized' };
                }
                const result = await this.webrtcService.startCall(conversationId, otherUserId, callType);
                if (result.success) {
                    // Store callId for tracking
                    const callId = result.callId;
                    if (callId && this.webrtcService) {
                        this.webrtcService.currentCallId = callId;
                    }
                    // Update call status
                    this.updateCallStatus(callId, 'connecting');
                    // Navigate to call screen
                    return {
                        success: true,
                        data: result.data,
                        callId: callId, // Include callId in response
                        conversationId: conversationId,
                        otherUserId: otherUserId,
                        callType: callType
                    };
                } else {
                    return result;
                }
            } else if (this.useWebCall) {
                // Skip database call request for web call
                return {
                    success: true,
                    data: {
                        id: `web_call_${Date.now()}`,
                        callerId: this.currentUserId,
                        receiverId: otherUserId,
                        conversationId: conversationId,
                        callType: callType,
                        status: 'initiated'
                    },
                    webCall: true
                };
            } else {
                return { success: false, error: 'No call service available' };
            }
        } catch (error) {
            console.error('Start call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Answer a call
    async answerCall(callId) {
        try {
            let result;
            if (this.useRealWebRTC) {
                // Use Real WebRTC service
                if (!this.webrtcService) {
                    console.error('❌ WebRTC service not initialized');
                    return { success: false, error: 'WebRTC service not initialized' };
                }
                result = await this.webrtcService.answerCall(callId);
            } else if (this.useVideoCall) {
                // Use WebRTC service for video/voice calls
                if (!this.webrtcService) {
                    console.error('❌ WebRTC service not initialized');
                    return { success: false, error: 'WebRTC service not initialized' };
                }
                result = await this.webrtcService.answerCall(callId);
            } else if (this.useWebCall) {
                // Web call - answer immediately
                result = { success: true, webCall: true };
            } else {
                return { success: false, error: 'No call service available' };
            }

            // Update call status if answer successful
            if (result.success && callId) {
                this.updateCallStatus(callId, 'answered');
            }

            return result;
        } catch (error) {
            console.error('Answer call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Decline a call
    async declineCall(callId) {
        try {
            const { declineCall } = await import('./callService');
            const result = await declineCall(callId);
            return result;
        } catch (error) {
            console.error('Decline call error:', error);
            return { success: false, error: error.message };
        }
    }

    // End a call
    async endCall() {
        try {
            let result;
            if (this.useRealWebRTC || this.useVideoCall) {
                if (!this.webrtcService) {
                    return { success: false, error: 'WebRTC service not initialized' };
                }

                if (typeof this.webrtcService.endCall !== 'function') {
                    return { success: false, error: 'webrtcService.endCall is not a function' };
                }

                result = await this.webrtcService.endCall();
            } else if (this.useWebCall) {
                result = { success: true };
            } else {
                return { success: false, error: 'No call service available' };
            }

            // Update call status if end successful
            if (result.success && this.currentCallId) {
                this.updateCallStatus(this.currentCallId, 'ended');
            }

            return result;
        } catch (error) {
            console.error('End call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get active call
    async getActiveCall() {
        try {
            const { getActiveCall } = await import('./callService');
            const result = await getActiveCall(this.currentUserId);
            return result;
        } catch (error) {
            console.error('Get active call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Mute/Unmute audio
    async muteAudio(mute = true) {
        try {
            if (!this.webrtcService) {
                console.error('WebRTC service not initialized');
                return { success: false, error: 'WebRTC service not initialized' };
            }
            const result = await this.webrtcService.muteAudio(mute);
            return result;
        } catch (error) {
            console.error('Mute audio error:', error);
            return { success: false, error: error.message };
        }
    }

    // Mute/Unmute video
    async muteVideo(mute = true) {
        try {
            if (!this.webrtcService) {
                console.error('WebRTC service not initialized');
                return { success: false, error: 'WebRTC service not initialized' };
            }
            const result = await this.webrtcService.muteVideo(mute);
            return result;
        } catch (error) {
            console.error('Mute video error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get call status
    getCallStatus() {
        if (!this.webrtcService) {
            console.error('WebRTC service not initialized');
            return {
                isConnected: false,
                hasLocalStream: false,
                hasRemoteStream: false,
                localStream: null,
                remoteStream: null
            };
        }
        return this.webrtcService.getStatus();
    }

    // Mark call as answered (called when receiver answers)
    markCallAsAnswered() {
        if (this.webrtcService && this.webrtcService.markAsAnswered) {
            this.webrtcService.markAsAnswered();
        }
    }

    // Get current call ID
    getCurrentCallId() {
        if (this.webrtcService && this.webrtcService.currentCallId) {
            return this.webrtcService.currentCallId;
        }
        return null;
    }

    // Cleanup
    async destroy() {
        try {
            // Clear all timers
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            if (this.voiceMessageDebounceTimer) {
                clearTimeout(this.voiceMessageDebounceTimer);
                this.voiceMessageDebounceTimer = null;
            }

            // Stop listening (will cleanup call channel)
            this.stopListening();

            // Clear voice message listener
            if (this.hasVoiceMessageListener) {
                // Note: Voice message channel cleanup handled by Supabase
                this.hasVoiceMessageListener = false;
            }

            // Clear pending messages
            this.pendingVoiceMessages = [];

            // Destroy WebRTC service
            if (this.webrtcService) {
                await this.webrtcService.destroy();
            }

            // Reset state
            this.currentCallId = null;
            this.currentCallStatus = null;
            this.subscriptionAttempts = 0;
            this.isSubscribed = false;

            return { success: true };
        } catch (error) {
            console.error('Destroy error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
export default new CallManager();
