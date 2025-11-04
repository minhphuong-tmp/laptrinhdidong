import { supabase } from '../lib/supabase';
import { answerCall, endCall } from './callService';

// Import WebRTC (will work in development build)
// Commented: react-native-webrtc không support trong Expo Go
let RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream, MediaStreamTrack;
let getUserMedia, createLocalTracks;
let isWebRTCAvailable = false;

try {
    // const WebRTC = require('react-native-webrtc'); // Commented: không support trong Expo Go
    // RTCPeerConnection = WebRTC.RTCPeerConnection;
    // RTCSessionDescription = WebRTC.RTCSessionDescription;
    // RTCIceCandidate = WebRTC.RTCIceCandidate;
    // MediaStream = WebRTC.MediaStream;
    // MediaStreamTrack = WebRTC.MediaStreamTrack;
    // getUserMedia = WebRTC.getUserMedia;
    // createLocalTracks = WebRTC.createLocalTracks;
    // isWebRTCAvailable = true;
    // console.log('WebRTC modules loaded successfully');
    console.log('WebRTC disabled for Expo Go');
    isWebRTCAvailable = false;
} catch (error) {
    console.log('WebRTC not available, using mock:', error.message);
    isWebRTCAvailable = false;
}

class RealWebRTCService {
    constructor() {
        this.currentUserId = null;
        this.otherUserId = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isConnected = false;
        this.currentChannel = null;
        this.currentCallId = null;
        this.callDuration = 0;
        this.isVideoEnabled = false;
        this.isAudioEnabled = true;

        // Signaling channel
        this.signalingChannel = null;

        // STUN servers
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
    }

    static getInstance() {
        if (!RealWebRTCService.instance) {
            RealWebRTCService.instance = new RealWebRTCService();
        }
        return RealWebRTCService.instance;
    }

    // Initialize WebRTC service
    async initialize(userId) {
        try {
            this.currentUserId = userId;

            if (!isWebRTCAvailable || !RTCPeerConnection) {
                console.log('WebRTC not available, using mock mode');
                return { success: true, mock: true };
            }

            // Setup signaling channel
            this.setupSignalingChannel();

            console.log('Real WebRTC Service initialized for user:', userId);
            return { success: true, mock: false };
        } catch (error) {
            console.error('WebRTC initialization error:', error);
            return { success: false, error: error.message };
        }
    }

    // Setup Supabase Realtime for signaling
    setupSignalingChannel() {
        if (!this.currentUserId) return;

        this.signalingChannel = supabase
            .channel(`webrtc-signaling-${this.currentUserId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'webrtc_signaling',
                filter: `receiver_id=eq.${this.currentUserId}`
            }, async (payload) => {
                console.log('Received signaling data:', payload.new);
                await this.handleSignalingData(payload.new);
            })
            .subscribe();
    }

    // Handle incoming signaling data
    async handleSignalingData(data) {
        try {
            const { type, sdp, candidate, callId } = data;

            switch (type) {
                case 'offer':
                    await this.handleOffer(sdp, callId);
                    break;
                case 'answer':
                    await this.handleAnswer(sdp);
                    break;
                case 'ice-candidate':
                    await this.handleIceCandidate(candidate);
                    break;
                case 'call-ended':
                    await this.handleCallEnded();
                    break;
            }
        } catch (error) {
            console.error('Error handling signaling data:', error);
        }
    }

    // Send signaling data
    async sendSignalingData(receiverId, type, data) {
        try {
            // Check if currentUserId is available
            if (!this.currentUserId) {
                console.warn('currentUserId is null, skipping signaling data');
                return;
            }

            const { error } = await supabase
                .from('webrtc_signaling')
                .insert({
                    sender_id: this.currentUserId,
                    receiver_id: receiverId,
                    type: type,
                    data: data,
                    created_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error sending signaling data:', error);
            } else {
                console.log('Signaling data sent successfully');
            }
        } catch (error) {
            console.error('Error sending signaling data:', error);
        }
    }

    // Start a call
    async startCall(conversationId, otherUserId, callType = 'voice') {
        try {
            this.currentChannel = conversationId;
            this.otherUserId = otherUserId;
            this.isVideoEnabled = callType === 'video';

            console.log(`Starting real ${callType} call to ${otherUserId}`);

            // Check if WebRTC is available
            if (!isWebRTCAvailable || !RTCPeerConnection) {
                console.log('WebRTC not available, falling back to web call');
                return {
                    success: true,
                    webCall: true,
                    error: null,
                    message: 'Using web call instead of WebRTC'
                };
            }

            console.log('WebRTC is available, starting real call...');

            // Skip database call request for now
            console.log('🔊 Skipping database call request for WebRTC');
            const callResult = {
                success: true,
                data: {
                    id: `webrtc_call_${Date.now()}`,
                    callerId: this.currentUserId,
                    receiverId: otherUserId,
                    conversationId: conversationId,
                    callType: callType,
                    status: 'initiated'
                }
            };

            this.currentCallId = callResult.data.id;

            // Get user media
            await this.getUserMedia();

            // Create peer connection
            await this.createPeerConnection();

            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            // Send offer to receiver
            await this.sendSignalingData(otherUserId, 'offer', {
                sdp: offer.sdp,
                callId: this.currentCallId
            });

            this.isConnected = true;
            console.log('Real call started successfully');

            return { success: true, callId: this.currentCallId };
        } catch (error) {
            console.error('Start call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Answer a call
    async answerCall(callId) {
        try {
            console.log(`Answering real call ${callId}`);

            // Update call status in database
            const answerResult = await answerCall(callId);
            if (!answerResult.success) {
                return { success: false, error: answerResult.msg };
            }

            this.currentCallId = callId;
            this.currentChannel = answerResult.data.conversation_id;
            this.otherUserId = answerResult.data.caller_id;
            this.isVideoEnabled = answerResult.data.call_type === 'video';

            // Get user media
            await this.getUserMedia();

            // Create peer connection
            await this.createPeerConnection();

            this.isConnected = true;
            console.log('Real call answered successfully');

            return { success: true };
        } catch (error) {
            console.error('Answer call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get user media (microphone and camera)
    async getUserMedia() {
        try {
            if (!getUserMedia) {
                console.log('getUserMedia not available, using mock');
                this.localStream = { type: 'audio', mock: true };
                return;
            }

            const constraints = {
                audio: true,
                video: this.isVideoEnabled ? {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                } : false
            };

            const stream = await getUserMedia(constraints);
            this.localStream = stream;

            console.log('Real user media obtained:', {
                audio: stream.getAudioTracks().length > 0,
                video: stream.getVideoTracks().length > 0
            });
        } catch (error) {
            console.error('Error getting user media:', error);
            this.localStream = { type: 'audio', mock: true };
        }
    }

    // Create peer connection
    async createPeerConnection() {
        try {
            if (!RTCPeerConnection) {
                console.log('RTCPeerConnection not available');
                return;
            }

            this.peerConnection = new RTCPeerConnection(this.configuration);

            // Add local stream to peer connection
            if (this.localStream && this.localStream.getTracks) {
                this.localStream.getTracks().forEach(track => {
                    this.peerConnection.addTrack(track, this.localStream);
                });
            }

            // Handle remote stream
            this.peerConnection.ontrack = (event) => {
                console.log('Received remote stream');
                this.remoteStream = event.streams[0];
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    this.sendSignalingData(this.otherUserId, 'ice-candidate', {
                        candidate: event.candidate
                    });
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                if (this.peerConnection) {
                    console.log('Connection state:', this.peerConnection.connectionState);
                    if (this.peerConnection.connectionState === 'connected') {
                        console.log('WebRTC connection established!');
                    }
                }
            };

            console.log('Peer connection created');
        } catch (error) {
            console.error('Error creating peer connection:', error);
        }
    }

    // Handle incoming offer
    async handleOffer(sdp, callId) {
        try {
            if (!this.peerConnection) {
                await this.createPeerConnection();
            }

            const offer = new RTCSessionDescription({ type: 'offer', sdp });
            await this.peerConnection.setRemoteDescription(offer);

            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            await this.sendSignalingData(this.otherUserId, 'answer', {
                sdp: answer.sdp
            });

            console.log('Offer handled and answer sent');
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    // Handle incoming answer
    async handleAnswer(sdp) {
        try {
            const answer = new RTCSessionDescription({ type: 'answer', sdp });
            await this.peerConnection.setRemoteDescription(answer);
            console.log('Answer handled');
        } catch (error) {
            console.error('Error handling answer:', error);
        }
    }

    // Handle ICE candidate
    async handleIceCandidate(candidate) {
        try {
            if (this.peerConnection && this.peerConnection.remoteDescription) {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('ICE candidate added');
            }
        } catch (error) {
            console.error('Error handling ICE candidate:', error);
        }
    }

    // Handle call ended
    async handleCallEnded() {
        try {
            await this.endCall();
            console.log('Call ended by remote party');
        } catch (error) {
            console.error('Error handling call ended:', error);
        }
    }

    // Mute/Unmute audio
    async muteAudio(mute = true) {
        try {
            this.isAudioEnabled = !mute;

            if (this.localStream && this.localStream.getAudioTracks) {
                this.localStream.getAudioTracks().forEach(track => {
                    track.enabled = !mute;
                });
            }

            console.log(`Audio ${mute ? 'muted' : 'unmuted'}`);
            return { success: true, muted: mute };
        } catch (error) {
            console.error('Mute audio error:', error);
            return { success: false, error: error.message };
        }
    }

    // Mute/Unmute video
    async muteVideo(mute = true) {
        try {
            this.isVideoEnabled = !mute;

            if (this.localStream && this.localStream.getVideoTracks) {
                this.localStream.getVideoTracks().forEach(track => {
                    track.enabled = !mute;
                });
            }

            console.log(`Video ${mute ? 'muted' : 'unmuted'}`);
            return { success: true, muted: mute };
        } catch (error) {
            console.error('Mute video error:', error);
            return { success: false, error: error.message };
        }
    }

    // Switch camera
    async switchCamera() {
        try {
            if (this.localStream && this.localStream.getVideoTracks) {
                const videoTrack = this.localStream.getVideoTracks()[0];
                if (videoTrack) {
                    // Switch camera by changing facingMode
                    const newConstraints = {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: videoTrack.getSettings().facingMode === 'user' ? 'environment' : 'user'
                    };

                    // This would require recreating the stream
                    console.log('Camera switch requested');
                }
            }
            return { success: true };
        } catch (error) {
            console.error('Switch camera error:', error);
            return { success: false, error: error.message };
        }
    }

    // End call
    async endCall() {
        try {
            // Send call ended signal
            if (this.otherUserId) {
                await this.sendSignalingData(this.otherUserId, 'call-ended', {});
            }

            // Close peer connection
            if (this.peerConnection) {
                this.peerConnection.close();
                this.peerConnection = null;
            }

            // Stop local stream
            if (this.localStream && this.localStream.getTracks) {
                this.localStream.getTracks().forEach(track => {
                    track.stop();
                });
            }

            // Update call status in database
            if (this.currentCallId) {
                const endResult = await endCall(this.currentCallId, this.callDuration || 0);
                if (!endResult.success) {
                    console.log('Failed to update call status:', endResult.msg);
                }
            }

            // Cleanup
            this.localStream = null;
            this.remoteStream = null;
            this.isConnected = false;
            this.currentChannel = null;
            this.otherUserId = null;
            this.currentCallId = null;
            this.callDuration = 0;
            this.isVideoEnabled = false;
            this.isAudioEnabled = true;

            console.log('Real call ended');
            return { success: true };
        } catch (error) {
            console.error('End call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get local stream
    getLocalStream() {
        return this.localStream;
    }

    // Get remote stream
    getRemoteStream() {
        return this.remoteStream;
    }

    // Get connection status
    getStatus() {
        return {
            isConnected: this.isConnected,
            currentChannel: this.currentChannel,
            currentUserId: this.currentUserId,
            otherUserId: this.otherUserId,
            hasLocalStream: !!this.localStream,
            hasRemoteStream: !!this.remoteStream,
            localStream: this.localStream,
            remoteStream: this.remoteStream,
            isVideoEnabled: this.isVideoEnabled,
            hasVideo: this.isVideoEnabled,
            hasAudio: this.isAudioEnabled
        };
    }

    // Cleanup
    async destroy() {
        try {
            await this.endCall();

            if (this.signalingChannel) {
                this.signalingChannel.unsubscribe();
                this.signalingChannel = null;
            }

            console.log('Real WebRTC Service destroyed');
            return { success: true };
        } catch (error) {
            console.error('Destroy error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export class
export default RealWebRTCService;
