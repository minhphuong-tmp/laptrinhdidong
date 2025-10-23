import { supabase } from '../lib/supabase';
import RealWebRTCService from './realWebRTCService';
import WebRTCService from './webRTCService';

class CallManager {
    constructor() {
        this.currentUserId = null;
        this.callChannel = null;
        this.onIncomingCall = null;
        this.onCallEnded = null;
        this.isListening = false;
        this.useAgora = false; // Disable Agora for Expo Go
        this.useRealWebRTC = true; // Enable real WebRTC
        this.useMock = false; // NO MOCK EVER
        this.useWebCall = false; // Disable WebView call
        this.useStream = false; // Stream removed
        this.useMockStream = false; // Mock Stream removed
        this.useVideoCall = true; // Enable video call
    }

    // Initialize call manager
    async initialize(userId, callbacks = {}) {
        try {
            this.currentUserId = userId;
            this.onIncomingCall = callbacks.onIncomingCall;
            this.onCallEnded = callbacks.onCallEnded;

            // Initialize WebRTC service
            if (this.useRealWebRTC) {
                console.log('🔊 Using Real WebRTC service');
                this.webrtcService = new RealWebRTCService();
                const result = await this.webrtcService.initialize(userId);
                if (!result.success) {
                    console.error('❌ Real WebRTC initialization failed:', result.error);
                    return { success: false, error: 'WebRTC initialization failed' };
                }
            } else if (this.useWebCall) {
                console.log('🌐 Using WebView call for Expo Go');
                // No initialization needed for WebView call
            } else if (this.useAgora) {
                console.error('❌ Agora support removed');
                return { success: false, error: 'Agora not supported' };
            } else {
                console.error('❌ No call service available');
                return { success: false, error: 'No call service available' };
            }

            // Start listening for incoming calls
            this.startListening();

            console.log('Call Manager initialized for user:', userId);
            return { success: true };
        } catch (error) {
            console.error('Call Manager initialization error:', error);
            return { success: false, error: error.message };
        }
    }

    // Start listening for incoming calls
    startListening() {
        if (this.isListening || !this.currentUserId) return;

        this.isListening = true;
        this.callChannel = supabase
            .channel(`calls-${this.currentUserId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'call_requests',
                filter: `receiver_id=eq.${this.currentUserId}`
            }, async (payload) => {
                console.log('=== INCOMING CALL ===');
                console.log('Call request:', payload.new);

                if (this.onIncomingCall) {
                    this.onIncomingCall(payload.new);
                }
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'call_requests',
                filter: `caller_id=eq.${this.currentUserId},receiver_id=eq.${this.currentUserId}`
            }, async (payload) => {
                console.log('=== CALL STATUS UPDATE ===');
                console.log('Call update:', payload.new);

                if (payload.new.status === 'ended' && this.onCallEnded) {
                    this.onCallEnded(payload.new);
                }
            })
            .subscribe((status) => {
                console.log('Call channel status:', status);
            });
    }

    // Stop listening for calls
    stopListening() {
        if (this.callChannel) {
            this.callChannel.unsubscribe();
            this.callChannel = null;
        }
        this.isListening = false;
    }

    // Start a call
    async startCall(conversationId, otherUserId, callType = 'voice') {
        try {
            console.log(`🔊 CallManager.startCall called with:`, {
                conversationId,
                otherUserId,
                callType,
                currentUserId: this.currentUserId
            });

            // If otherUserId is not provided, we need to get it from conversation
            if (!otherUserId && conversationId) {
                // This will be handled by the caller (chat.jsx) who has access to conversation data
                return { success: false, error: 'otherUserId is required' };
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
                        console.log('🔊 Skipping database call request, going directly to WebRTC');
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
                // Video call disabled
                return { success: false, error: 'Video call is currently disabled' };
            } else if (this.useWebCall) {
                // Skip database call request for web call
                console.log('🌐 Using web call without database');
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
                console.error('❌ No call service available');
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
            return { success: false, error: 'Answer call is not supported in current setup' };
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
            const service = this.useRealWebRTC ? RealWebRTCService : WebRTCService;
            const result = await service.endCall();
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
            const service = this.useRealWebRTC ? RealWebRTCService : WebRTCService;
            const result = await service.muteAudio(mute);
            return result;
        } catch (error) {
            console.error('Mute audio error:', error);
            return { success: false, error: error.message };
        }
    }

    // Mute/Unmute video
    async muteVideo(mute = true) {
        try {
            const service = this.useRealWebRTC ? RealWebRTCService : WebRTCService;
            const result = await service.muteVideo(mute);
            return result;
        } catch (error) {
            console.error('Mute video error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get call status
    getCallStatus() {
        const service = this.useRealWebRTC ? RealWebRTCService : WebRTCService;
        return service.getStatus();
    }

    // Cleanup
    async destroy() {
        try {
            this.stopListening();
            await WebRTCService.destroy();
            console.log('Call Manager destroyed');
            return { success: true };
        } catch (error) {
            console.error('Destroy error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
export default new CallManager();
