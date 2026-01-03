
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { supabase } from '../lib/supabase';
import { answerCall, createCallRequest, endCall } from './callService';

// Import WebRTC (works in development build)
let RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, MediaStream, MediaStreamTrack;
let getUserMedia, createLocalTracks, mediaDevices;
let isWebRTCAvailable = false;

try {
    const WebRTC = require('react-native-webrtc');
    RTCPeerConnection = WebRTC.RTCPeerConnection;
    RTCSessionDescription = WebRTC.RTCSessionDescription;
    RTCIceCandidate = WebRTC.RTCIceCandidate;
    MediaStream = WebRTC.MediaStream;
    MediaStreamTrack = WebRTC.MediaStreamTrack;

    // Try different ways to get getUserMedia
    getUserMedia = WebRTC.getUserMedia || WebRTC.mediaDevices?.getUserMedia;
    createLocalTracks = WebRTC.createLocalTracks;
    mediaDevices = WebRTC.mediaDevices;

    // If getUserMedia is not directly available, try mediaDevices.getUserMedia
    if (!getUserMedia && mediaDevices && mediaDevices.getUserMedia) {
        getUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
    }

    // If still not available, try to create it from RTCPeerConnection
    if (!getUserMedia && RTCPeerConnection) {
        // In react-native-webrtc, we might need to use a different approach
        // Check if there's a global navigator.mediaDevices or use createLocalTracks
        console.log('⚠️ getUserMedia not found, will use createLocalTracks or alternative method');
    }

    isWebRTCAvailable = true;
    console.log('✅ WebRTC modules loaded successfully');
    console.log('✅ getUserMedia available:', !!getUserMedia);
    console.log('✅ createLocalTracks available:', !!createLocalTracks);
    console.log('✅ mediaDevices available:', !!mediaDevices);
} catch (error) {
    console.warn('⚠️ WebRTC not available:', error.message);
    isWebRTCAvailable = false;
}

class WebRTCService {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        // Auto-reconnect state for signaling channel
        this.signalingReconnectAttempts = 0;
        this.maxSignalingReconnectAttempts = 5;
        this.signalingReconnectTimer = null;
        this.isSignalingSubscribed = false;
        this.localStream = null;
        // remoteStream được quản lý bởi updateRemoteStream/clearRemoteStream
        // Khởi tạo null - không cần log vì đây là constructor
        this.remoteStream = null;
        this.isConnected = false;
        this.currentChannel = null;
        this.currentUserId = null;
        this.otherUserId = null;
        this.recording = null;
        this.camera = null;
        this.isVideoEnabled = false;
        this.onRemoteStream = null; // Callback when remote stream is received
        this.pendingIceCandidates = []; // Store ICE candidates received before remote description is set
        this.pendingOutgoingIceCandidates = []; // Store ICE candidates to send when otherUserId is available
        this.isEndingCall = false; // Flag to prevent multiple call-ended handling
        this.isCallAnswered = false; // Flag to track if call has been answered
        this.pendingRemoteAudioTracks = []; // Store remote audio tracks to enable when connection established
        this.remoteStreamId = null; // Track remote stream ID to prevent duplicate sets
        this.lastCallbackStreamId = null; // Track stream ID that triggered callback to prevent duplicate callbacks
        this.peerConnectionId = null; // Track peer connection ID for debugging
        this.callStatus = null; // Track call status for clearRemoteStream

        // STUN servers (free)
        this.configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
    }

    // Initialize socket connection
    async initialize(userId) {
        try {
            this.currentUserId = userId;

            if (!isWebRTCAvailable || !RTCPeerConnection) {
                console.warn('⚠️ WebRTC not available, will use fallback');
                return { success: true }; // Still return success, will use Audio.Recording as fallback
            }

            // Setup signaling channel
            this.setupSignalingChannel();

            return { success: true };
        } catch (error) {
            console.error('WebRTC initialization error:', error);
            return { success: false, error: error.message };
        }
    }

    // Calculate exponential backoff delay for signaling channel
    getSignalingBackoffDelay(attempt) {
        return Math.min(2000 * Math.pow(2, attempt), 32000); // 2s, 4s, 8s, 16s, 32s max
    }

    // Handle signaling channel error with auto-reconnect
    handleSignalingChannelError() {
        if (this.signalingReconnectAttempts >= this.maxSignalingReconnectAttempts) {
            // Max attempts reached, silently stop retrying
            return;
        }

        // Clear existing timer
        if (this.signalingReconnectTimer) {
            clearTimeout(this.signalingReconnectTimer);
        }

        const delay = this.getSignalingBackoffDelay(this.signalingReconnectAttempts);
        this.signalingReconnectAttempts += 1;

        // Auto-reconnect after delay (silent, no logging)
        this.signalingReconnectTimer = setTimeout(() => {
            this.signalingReconnectTimer = null;
            if (this.currentUserId) {
                this.setupSignalingChannel();
            }
        }, delay);
    }

    // Setup Supabase Realtime for signaling
    setupSignalingChannel() {
        if (!this.currentUserId) {
            return;
        }

        // Unsubscribe from existing channel if any
        if (this.signalingChannel) {
            try {
                supabase.removeChannel(this.signalingChannel);
            } catch (e) {
                // Ignore errors when removing channel
            }
        }

        const channelName = `webrtc-signaling-${this.currentUserId}`;

        this.signalingChannel = supabase
            .channel(channelName)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'webrtc_signaling',
                filter: `receiver_id=eq.${this.currentUserId}`
            }, async (payload) => {
                try {
                    if (!payload.new) {
                        return;
                    }
                    await this.handleSignalingData(payload.new);
                } catch (error) {
                    // Only log critical errors (not channel errors)
                    if (error.message && !error.message.includes('wrong state') && !error.message.includes('sdpMLineIndex')) {
                        // Silent error handling - no console.error
                    }
                }
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    this.isSignalingSubscribed = true;
                    this.signalingReconnectAttempts = 0; // Reset on successful subscription
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    this.isSignalingSubscribed = false;
                    // Auto-reconnect silently (no error logging)
                    this.handleSignalingChannelError();
                } else if (status === 'CLOSED') {
                    this.isSignalingSubscribed = false;
                    // Auto-reconnect on close if still needed
                    if (this.currentUserId) {
                        this.signalingReconnectAttempts = 0; // Reset attempts for close event
                        this.handleSignalingChannelError();
                    }
                }
            });

    }

    // Handle incoming signaling data
    async handleSignalingData(data) {
        try {
            // Ignore if we're ending call (to prevent processing old signals)
            if (this.isEndingCall) {
                return;
            }

            // Data structure from Supabase: 
            // { data: { sdp/candidate: {...} }, type: "answer"/"ice-candidate", sender_id, receiver_id, ... }
            const type = data.type;
            const dataField = data.data || {};
            const sdp = dataField.sdp || data.sdp;
            const candidate = dataField.candidate || data.candidate;
            const callId = dataField.callId || data.callId;

            // Set otherUserId from sender_id if not already set
            if (data.sender_id && !this.otherUserId) {
                this.otherUserId = data.sender_id;
            }

            if (!type) {
                return;
            }

            switch (type) {
                case 'offer':
                    // Only process offer if we don't have an active call
                    if (!this.peerConnection && !this.isEndingCall) {
                        if (!sdp) return;
                        await this.handleOffer(sdp, callId, data.sender_id);
                    }
                    break;
                case 'answer':
                    // Only process answer if we have a peer connection waiting for it
                    if (this.peerConnection && !this.isEndingCall) {
                        if (!sdp) return;
                        await this.handleAnswer(sdp);
                    }
                    break;
                case 'ice-candidate':
                    // Only process ICE candidates if we have a peer connection
                    if (this.peerConnection && !this.isEndingCall) {
                        if (!candidate) return;
                        await this.handleIceCandidate(candidate);
                    }
                    break;
                case 'call-ended':
                    // Only handle if we're actually in a call and not already ending
                    if (this.peerConnection && !this.isEndingCall) {
                        await this.handleCallEnded();
                    }
                    break;
            }
        } catch (error) {
            // Only log critical errors
            if (error.message && !error.message.includes('wrong state') && !error.message.includes('sdpMLineIndex')) {
                console.error('❌ Error handling signaling data:', error.message);
            }
        }
    }

    // Send signaling data
    async sendSignalingData(receiverId, type, data) {
        try {
            if (!this.currentUserId || !receiverId) {
                throw new Error('currentUserId and receiverId are required');
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
                throw error;
            }
        } catch (error) {
            // Only log critical errors
            if (error.message && !error.message.includes('23502')) {
                console.error('❌ Error sending signaling data:', error.message);
            }
            throw error;
        }
    }

    // Start a call
    async startCall(conversationId, otherUserId, callType = 'voice') {
        try {
            // Reset ending flag
            this.isEndingCall = false;
            // Reset call answered flag (caller starts, waiting for answer)
            this.isCallAnswered = false;
            // Set call status
            this.callStatus = 'connecting';

            // Clean up any existing peer connection first
            if (this.peerConnection) {
                console.log('📞 [startCall] Closing existing peer connection. PC ID:', this.peerConnectionId);
                try {
                    // Stop all tracks
                    if (this.localStream && this.localStream.getTracks) {
                        this.localStream.getTracks().forEach(track => track.stop());
                    }
                    if (this.remoteStream && this.remoteStream.getTracks) {
                        this.remoteStream.getTracks().forEach(track => track.stop());
                    }
                    this.peerConnection.close();
                } catch (e) {
                    // Ignore
                }
                this.peerConnection = null;
                this.peerConnectionId = null;
            }

            // -------- CRITICAL CLEANUP (safe) ----------
            const pc = this.peerConnection;
            let pcIsClosed = true;

            try {
                if (pc) {
                    const connState = pc.connectionState || pc.iceConnectionState || pc.signalingState;
                    if (connState && typeof connState === 'string') {
                        pcIsClosed = connState.toLowerCase() === 'closed';
                    } else {
                        pcIsClosed = !(this.isConnected || this.isCallAnswered);
                    }
                } else {
                    pcIsClosed = true;
                }
            } catch (e) {
                pcIsClosed = true;
            }

            // Hỗ trợ tuỳ chọn forceReset (tôi có thể truyền sau)
            const forceReset =
                typeof arguments[3] === 'object' &&
                arguments[3]?.forceReset === true;

            if (pcIsClosed || forceReset) {
                console.log('📞 startCall: clearing streams (pc closed or forceReset):', { pcIsClosed, forceReset });
                this.localStream = null;
                this.clearRemoteStream('startCall: pc closed or forceReset', { force: true });
                this.isConnected = false;
                this.pendingIceCandidates = [];
                this.pendingOutgoingIceCandidates = [];
            } else {
                console.log('📞 startCall: keeping existing remoteStream because peerConnection seems active', {
                    pcIsClosed,
                    isConnected: this.isConnected,
                    isCallAnswered: this.isCallAnswered
                });
            }
            // -------- end safe cleanup ----------

            this.currentChannel = conversationId;
            this.otherUserId = otherUserId;


            // Tạo call request trong database
            const callResult = await createCallRequest({
                callerId: this.currentUserId,
                receiverId: otherUserId,
                conversationId: conversationId,
                callType: callType
            });

            if (!callResult.success) {
                return { success: false, error: callResult.msg };
            }

            this.currentCallId = callResult.data.id;

            // Request permissions
            const { status: audioStatus } = await Audio.requestPermissionsAsync();
            if (audioStatus !== 'granted') {
                return { success: false, error: 'Audio permission denied' };
            }

            if (callType === 'video') {
                const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
                if (cameraStatus !== 'granted') {
                    return { success: false, error: 'Camera permission denied' };
                }

                // Initialize camera for video calls
                try {
                    const { Camera } = await import('expo-camera');
                    this.camera = Camera;
                    this.isVideoEnabled = true;
                    console.log('Camera initialized for video call');
                } catch (cameraError) {
                    console.log('Camera initialization failed:', cameraError);
                    this.isVideoEnabled = false;
                }
            }

            // Try to use WebRTC if available
            if (isWebRTCAvailable && RTCPeerConnection && (getUserMedia || createLocalTracks || mediaDevices)) {
                console.log('✅ Using WebRTC for real-time audio streaming');
                this.isVideoEnabled = callType === 'video';

                // Set audio mode for call
                // This allows both recording and playback for WebRTC
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    staysActiveInBackground: true,
                });
            } catch (audioModeError) {
                    console.log('Failed to set audio mode for call:', audioModeError);
                }

                try {
                    // BƯỚC 1: Luôn tạo localStream mới bằng getUserMedia trước
                    console.log('📞 Getting user media...');
                    await this.getUserMedia();
                    console.log('✅ User media obtained');

                    // BƯỚC 2: Create peer connection (có thể reuse nếu đã tồn tại)
                    console.log('📞 Creating peer connection...');
                    await this.createPeerConnection();
                    console.log('✅ Peer connection created');

                    // BƯỚC 3: Luôn addTrack vào peerConnection (kể cả khi reuse)
                    console.log('📞 Adding local tracks to peer connection...');
                    this._addLocalTracksToPeerConnection();
                    console.log('✅ Local tracks added to peer connection');

                    // Create offer
                    console.log('📞 Creating offer...');
                    const offer = await this.peerConnection.createOffer();
                    await this.peerConnection.setLocalDescription(offer);
                    console.log('✅ Offer created and local description set');

                    // Send offer to receiver
                    console.log('📞 Sending offer to receiver...');
                    await this.sendSignalingData(otherUserId, 'offer', {
                        sdp: offer.sdp,
                        callId: this.currentCallId
                    });
                    console.log('✅ WebRTC call started, offer sent');
                } catch (webrtcError) {
                    console.error('❌ WebRTC setup error:', webrtcError);
                    console.error('❌ Error details:', {
                        message: webrtcError.message,
                        name: webrtcError.name,
                        stack: webrtcError.stack
                    });
                    // Fallback to Audio.Recording instead of throwing
                    console.warn('⚠️ Falling back to Audio.Recording due to WebRTC error');
                    // Continue to fallback code below - don't return, let it fall through
                }
            }

            // Fallback to Audio.Recording if WebRTC not available or failed
            if (!this.localStream || !this.localStream.getTracks) {
                console.warn('⚠️ Using Audio.Recording fallback');
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    staysActiveInBackground: true,
                });

                const recording = new Audio.Recording();
                await recording.prepareToRecordAsync({
                    android: {
                        extension: '.m4a',
                        outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
                        audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
                        sampleRate: 44100,
                        numberOfChannels: 2,
                        bitRate: 128000,
                    },
                    ios: {
                        extension: '.m4a',
                        outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
                        audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
                        sampleRate: 44100,
                        numberOfChannels: 2,
                        bitRate: 128000,
                        linearPCMBitDepth: 16,
                        linearPCMIsBigEndian: false,
                        linearPCMIsFloat: false,
                    },
                });

                await recording.startAsync();
                this.recording = recording;
                this.localStream = {
                    type: callType === 'video' ? 'video' : 'audio',
                    recording: recording,
                    real: true,
                    hasVideo: false,
                    hasAudio: true
                };
            }

            // Don't set isConnected = true yet, wait for receiver to answer
            console.log('Call started successfully, waiting for receiver to answer...');

            return { success: true, callId: this.currentCallId };
        } catch (error) {
            console.error('❌ Start call error:', error);
            console.error('❌ Error stack:', error.stack);
            console.error('❌ Error details:', {
                message: error.message,
                name: error.name,
                code: error.code
            });

            // If call was created in database but WebRTC failed, still return success with callId
            if (this.currentCallId) {
                console.warn('⚠️ Call created in database but WebRTC failed, returning callId anyway');
                return {
                    success: true,
                    callId: this.currentCallId,
                    warning: 'WebRTC setup failed, using fallback'
                };
            }

            return { success: false, error: error.message || 'Không thể tạo cuộc gọi' };
        }
    }

    // Answer a call
    async answerCall(callId) {
        try {
            console.log(`Answering call ${callId}`);

            // Cập nhật call status trong database FIRST
            const answerResult = await answerCall(callId);
            if (!answerResult.success) {
                return { success: false, error: answerResult.msg };
            }

            this.currentCallId = callId;
            this.currentChannel = answerResult.data.conversation_id;
            this.otherUserId = answerResult.data.caller_id;

            // Request permissions
            const { status: audioStatus } = await Audio.requestPermissionsAsync();
            if (audioStatus !== 'granted') {
                return { success: false, error: 'Audio permission denied' };
            }

            // Set audio mode for call (allows both recording and playback)
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    staysActiveInBackground: true,
                });
            } catch (audioModeError) {
                console.log('Failed to set audio mode for answer:', audioModeError);
            }

            // Try to use WebRTC if available
            if (isWebRTCAvailable && RTCPeerConnection && (getUserMedia || createLocalTracks || mediaDevices)) {
                console.log('✅ Using WebRTC for real-time audio streaming (answer)');
                this.isVideoEnabled = answerResult.data.call_type === 'video';

                // BƯỚC 1: Luôn tạo localStream mới bằng getUserMedia trước
                console.log('📞 Getting user media...');
                await this.getUserMedia();
                console.log('✅ User media obtained');

                // BƯỚC 2: Create peer connection (có thể reuse nếu đã tồn tại)
                console.log('📞 Creating peer connection...');
                await this.createPeerConnection();
                console.log('✅ Peer connection created');

                // BƯỚC 3: Luôn addTrack vào peerConnection (kể cả khi reuse)
                console.log('📞 Adding local tracks to peer connection...');
                this._addLocalTracksToPeerConnection();
                console.log('✅ Local tracks added to peer connection');

                // Check if offer already exists (caller may have sent it before we answered)
                const { data: existingOffers } = await supabase
                    .from('webrtc_signaling')
                    .select('*')
                    .eq('sender_id', this.otherUserId)
                    .eq('receiver_id', this.currentUserId)
                    .eq('type', 'offer')
                    .order('created_at', { ascending: false })
                    .limit(1);

                // Mark call as answered AFTER peer connection is created
                this.isCallAnswered = true;
                console.log('✅ Call marked as answered (answerCall), enabling audio');

                // Ensure local audio is enabled (for speaking)
                if (this.localStream && this.localStream.getAudioTracks) {
                    const localAudioTracks = this.localStream.getAudioTracks();
                    console.log('🎤 Ensuring local audio enabled for speaking, tracks:', localAudioTracks.length);
                    localAudioTracks.forEach(track => {
                        track.enabled = true;
                        console.log('🎤 Local audio track enabled:', track.id);
                    });
                }

                // Set audio mode for call
                Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    staysActiveInBackground: true,
                }).then(() => {
                    console.log('✅ Audio mode set after answer');
                }).catch((e) => {
                    console.log('Failed to set audio mode:', e);
                });

                // Enable remote audio tracks now that call is answered
                // Do this immediately and also after a short delay to catch any tracks that arrive later
                this.enableRemoteAudioTracks();
                setTimeout(() => {
                    this.enableRemoteAudioTracks();
                }, 200);
                setTimeout(() => {
                    this.enableRemoteAudioTracks();
                }, 500);

                if (existingOffers && existingOffers.length > 0) {
                    const offerData = existingOffers[0];
                    console.log('📞 Found existing offer, handling it...');
                    // Pass sender_id from offerData
                    await this.handleOffer(offerData.data.sdp, offerData.data.callId, offerData.sender_id);
                } else {
                    console.log('✅ WebRTC call answered, waiting for offer from caller...');
                }
            } else {
                // Fallback to Audio.Recording
                console.warn('⚠️ WebRTC not available, using Audio.Recording fallback');
                console.warn('⚠️ isWebRTCAvailable:', isWebRTCAvailable);
                console.warn('⚠️ RTCPeerConnection:', !!RTCPeerConnection);
                console.warn('⚠️ getUserMedia:', !!getUserMedia);

                // Cleanup any existing recording first
                if (this.recording) {
                    try {
                        const status = await this.recording.getStatusAsync();
                        if (status.isRecording) {
                            await this.recording.stopAndUnloadAsync();
                        } else {
                            await this.recording.unloadAsync();
                        }
                        console.log('Cleaned up existing recording before answer');
                    } catch (cleanupError) {
                        console.log('Error cleaning up existing recording:', cleanupError);
                        try {
                            await this.recording.unloadAsync();
                        } catch (e) {
                            console.log('Error unloading recording:', e);
                        }
                    }
                    this.recording = null;
                    // Small delay to ensure cleanup is complete
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                const recording = new Audio.Recording();
                await recording.prepareToRecordAsync({
                    android: {
                        extension: '.m4a',
                        outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
                        audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
                        sampleRate: 44100,
                        numberOfChannels: 2,
                        bitRate: 128000,
                    },
                    ios: {
                        extension: '.m4a',
                        outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
                        audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
                        sampleRate: 44100,
                        numberOfChannels: 2,
                        bitRate: 128000,
                        linearPCMBitDepth: 16,
                        linearPCMIsBigEndian: false,
                        linearPCMIsFloat: false,
                    },
                });

                await recording.startAsync();
                this.recording = recording;
                this.localStream = {
                    type: 'audio',
                    recording: recording,
                    real: true,
                    hasVideo: false,
                    hasAudio: true
                };
            }

            this.isConnected = true;
            this.callStatus = 'connected';
            console.log('Call answered successfully');

            return { success: true };
        } catch (error) {
            console.error('Answer call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Get user media (microphone and optionally camera)
    async getUserMedia() {
        try {
            let stream = null;

            // Try createLocalTracks first (preferred method in react-native-webrtc)
            if (createLocalTracks) {
                console.log('📞 Using createLocalTracks to get user media...');
                try {
                    // createLocalTracks returns tracks directly, not a stream
                    const constraints = {
                        audio: true,
                        video: this.isVideoEnabled ? {
                            width: { ideal: 1280 },
                            height: { ideal: 720 },
                            facingMode: 'user'
                        } : false
                    };

                    console.log('📞 Calling createLocalTracks with constraints:', constraints);
                    const tracks = await createLocalTracks(constraints);
                    console.log('📞 createLocalTracks returned:', tracks);

                    // createLocalTracks might return an array of tracks or a single track
                    const trackArray = Array.isArray(tracks) ? tracks : [tracks];
                    console.log('📞 Track array length:', trackArray.length);

                    // Create MediaStream from tracks
                    if (MediaStream && trackArray.length > 0) {
                        stream = new MediaStream(trackArray);
                        console.log('✅ Stream created from tracks:', trackArray.length);
                        console.log('✅ Stream audio tracks:', stream.getAudioTracks().length);
                        console.log('✅ Stream video tracks:', stream.getVideoTracks().length);
                    } else {
                        throw new Error('Cannot create MediaStream from tracks. MediaStream: ' + !!MediaStream + ', tracks: ' + trackArray.length);
                    }
                } catch (createTracksError) {
                    console.error('❌ Error in createLocalTracks:', createTracksError);
                    console.error('❌ Error details:', {
                        message: createTracksError.message,
                        name: createTracksError.name,
                        stack: createTracksError.stack
                    });
                    throw createTracksError;
                }
            }
            // Fallback to getUserMedia if available
            else if (getUserMedia) {
                console.log('📞 Using getUserMedia to get user media...');
                const constraints = {
                    audio: true,
                    video: this.isVideoEnabled ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    } : false
                };

                stream = await getUserMedia(constraints);
            }
            // Fallback to mediaDevices.getUserMedia
            else if (mediaDevices && mediaDevices.getUserMedia) {
                console.log('📞 Using mediaDevices.getUserMedia to get user media...');
                const constraints = {
                    audio: true,
                    video: this.isVideoEnabled ? {
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                        facingMode: 'user'
                    } : false
                };

                stream = await mediaDevices.getUserMedia(constraints);
            }
            else {
                throw new Error('No method available to get user media. getUserMedia, createLocalTracks, and mediaDevices are all unavailable.');
            }

            if (!stream) {
                throw new Error('Failed to get user media stream');
            }

            this.localStream = stream;

            // Ensure audio tracks are enabled for sending
            if (stream.getAudioTracks) {
                const audioTracks = stream.getAudioTracks();
                audioTracks.forEach(track => {
                    track.enabled = true;
                });
            }

            console.log('✅ User media obtained:', {
                audio: stream.getAudioTracks ? stream.getAudioTracks().length > 0 : false,
                video: stream.getVideoTracks ? stream.getVideoTracks().length > 0 : false
            });
        } catch (error) {
            console.error('❌ Error getting user media:', error);
            throw error;
        }
    }

    // Helper function to enable all remote audio tracks
    enableRemoteAudioTracks() {
        if (!this.peerConnection) {
            console.warn('⚠️ Cannot enable remote audio: no peer connection');
            return;
        }

        // Only enable if call has been answered
        if (!this.isCallAnswered) {
            console.log('🔇 Cannot enable remote audio: call not answered yet');
            return;
        }

        console.log('🎵 Enabling all remote audio tracks...');
        console.log('🎵 Connection state:', this.peerConnection.connectionState);
        console.log('🎵 ICE connection state:', this.peerConnection.iceConnectionState);
        console.log('🎵 isCallAnswered:', this.isCallAnswered);

        // Enable from receivers
        const receivers = this.peerConnection.getReceivers();
        let enabledCount = 0;
        receivers.forEach((receiver) => {
            if (receiver.track && receiver.track.kind === 'audio') {
                console.log('🎵 Enabling remote audio track:', receiver.track.id, 'current enabled:', receiver.track.enabled, 'readyState:', receiver.track.readyState);
                receiver.track.enabled = true;
                enabledCount++;
                if (receiver.track._nativeTrack) {
                    receiver.track._nativeTrack.setEnabled(true);
                }
            }
        });

        // Enable from stream
        if (this.remoteStream && this.remoteStream.getAudioTracks) {
            const audioTracks = this.remoteStream.getAudioTracks();
            audioTracks.forEach(track => {
                console.log('🎵 Enabling audio track from stream:', track.id, 'current enabled:', track.enabled, 'readyState:', track.readyState);
                track.enabled = true;
                if (track._nativeTrack) {
                    track._nativeTrack.setEnabled(true);
                }
            });
        }

        // Enable any pending tracks
        if (this.pendingRemoteAudioTracks && this.pendingRemoteAudioTracks.length > 0) {
            this.pendingRemoteAudioTracks.forEach(track => {
                console.log('🎵 Enabling pending remote audio track:', track.id);
                track.enabled = true;
                if (track._nativeTrack) {
                    track._nativeTrack.setEnabled(true);
                }
            });
        }

        console.log('✅ All remote audio tracks enabled, count:', enabledCount);

        // Also ensure local audio is enabled
        if (this.localStream && this.localStream.getAudioTracks) {
            const localAudioTracks = this.localStream.getAudioTracks();
            localAudioTracks.forEach(track => {
                if (!track.enabled) {
                    console.log('🎤 Enabling local audio track:', track.id);
                    track.enabled = true;
                }
            });
        }

        // Set audio mode again to ensure it's correct
        Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            staysActiveInBackground: true,
        }).then(() => {
            console.log('✅ Audio mode set in enableRemoteAudioTracks');
        }).catch((e) => {
            console.log('Failed to set audio mode:', e);
        });
    }

    // Add local tracks to peer connection - LUÔN GỌI SAU createPeerConnection
    _addLocalTracksToPeerConnection() {
        if (!this.peerConnection) {
            console.warn('⚠️ Cannot add tracks: peerConnection is null');
            return;
        }

        if (!this.localStream || !this.localStream.getTracks) {
            console.warn('⚠️ No local stream or getTracks method available');
            return;
        }

        const tracks = this.localStream.getTracks();
        const audioTracks = tracks.filter(t => t.kind === 'audio');
        const videoTracks = tracks.filter(t => t.kind === 'video');

        console.log('📹 Adding local tracks to peer connection:', {
            total: tracks.length,
            audio: audioTracks.length,
            video: videoTracks.length,
            isVideoEnabled: this.isVideoEnabled,
            peerConnectionId: this.peerConnectionId
        });

        // Get existing sender tracks to avoid duplicates
        const existingSenders = this.peerConnection.getSenders();
        const existingTrackIds = new Set(existingSenders.map(s => s.track?.id).filter(Boolean));

        tracks.forEach(track => {
            // Skip if track already exists in peerConnection
            if (existingTrackIds.has(track.id)) {
                console.log(`📹 Track ${track.kind} (${track.id}) already exists in peerConnection, skipping`);
                return;
            }

            // Ensure local tracks are enabled before adding
            track.enabled = true;
            console.log(`📹 Adding ${track.kind} track to peer connection:`, track.id);
            try {
                this.peerConnection.addTrack(track, this.localStream);
            } catch (error) {
                console.error(`❌ Error adding ${track.kind} track:`, error);
            }
        });

        console.log('✅ Local tracks added to peer connection:', {
            audio: audioTracks.length,
            video: videoTracks.length
        });
    }

    // Create peer connection - CHỈ TẠO 1 LẦN, KHÔNG TẠO LẠI NẾU ĐÃ CÓ
    // LƯU Ý: addTrack phải được gọi riêng sau khi createPeerConnection() hoàn thành
    async createPeerConnection() {
        try {
            if (!RTCPeerConnection) {
                throw new Error('RTCPeerConnection not available');
            }

            // STRICT SINGLETON GUARD: Prevent multiple active peer connections
            // LƯU Ý: Guard này chỉ skip việc tạo peerConnection mới, KHÔNG skip addTrack
            if (this.peerConnection) {
                const connectionState = this.peerConnection.connectionState;
                const iceConnectionState = this.peerConnection.iceConnectionState;
                const isActiveState = connectionState !== 'closed' && connectionState !== 'failed' &&
                    iceConnectionState !== 'closed' && iceConnectionState !== 'failed' && iceConnectionState !== 'disconnected';

                if (isActiveState) {
                    console.log('📞 [SINGLETON GUARD] Peer connection already exists and is active. Reusing. PC ID:', this.peerConnectionId, 'State:', connectionState, 'ICE:', iceConnectionState);
                    // Return nhưng addTrack sẽ được gọi riêng sau đó
                    return; // Reuse existing peer connection
                }

                // Close existing peer connection if in bad state
                if (connectionState === 'closed' || connectionState === 'failed') {
                    console.log('📞 [SINGLETON GUARD] Closing existing peer connection (closed/failed). PC ID:', this.peerConnectionId, 'State:', connectionState);
                    try {
                        this.peerConnection.close();
                    } catch (e) {
                        console.log('📞 Error closing existing peer connection:', e);
                    }
                    this.peerConnection = null;
                    this.peerConnectionId = null;
                }
            }

            // Tạo peer connection mới
            this.peerConnection = new RTCPeerConnection(this.configuration);
            // Generate unique ID for this peer connection instance
            this.peerConnectionId = `pc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('📞 Created new peer connection. PC ID:', this.peerConnectionId);

            // Handle remote stream - CHỈ NHẬN STREAM CÓ VIDEO TRACK
            // CRITICAL: Chống spam - chỉ update khi stream ID thay đổi
            this.peerConnection.ontrack = (event) => {
                try {
                    // defensive logs
                    console.log('🎵 ontrack event:', {
                        peerConnectionId: this.peerConnectionId,
                        streams: event.streams?.length,
                        track: event.track?.kind,
                        trackId: event.track?.id
                    });

                    // ignore local tracks
                    const isLocalTrack = this.localStream && this.localStream.getTracks && this.localStream.getTracks().some(t => t.id === event.track.id);
                    if (isLocalTrack) {
                        console.log('⚠️ Ignoring local track in ontrack:', event.track.id);
                        return;
                    }

                    // Lấy incoming stream từ event.streams[0]
                    const incoming = event.streams?.[0];
                    if (!incoming) {
                        console.log('📹 ontrack - no incoming stream in event, ignore');
                        return;
                    }

                    // CRITICAL: Chỉ nhận stream có VIDEO TRACK và readyState === "live"
                    const videoTracks = incoming.getVideoTracks?.() || [];
                    const hasVideoTrack = videoTracks.length > 0;
                    const hasLiveVideoTrack = videoTracks.some(track => track.readyState === 'live');

                    if (!hasVideoTrack) {
                        console.log('📹 ontrack - ignoring audio-only stream (no video track):', incoming.id);
                        return;
                    }

                    if (!hasLiveVideoTrack) {
                        console.log('📹 ontrack - ignoring stream (video track not live):', incoming.id);
                        return;
                    }

                    const incomingId = incoming.id;
                    console.log('📹 ontrack - stream has live video track:', incomingId, 'videoTracks:', videoTracks.length);

                    // CRITICAL: Dùng updateRemoteStream API thay vì gán trực tiếp
                    this.updateRemoteStream(incoming, 'ontrack: incoming stream with video');

                } catch (err) {
                    console.error('❌ ontrack handler error:', err);
                }
            };

            // Helper function để enable remote tracks (audio/video)
            this._enableRemoteTracks = () => {
                if (!this.remoteStream) {
                    console.warn('⚠️ No remote stream to enable tracks');
                    return;
                }

                // Get all receivers to check for audio/video tracks
                const receivers = this.peerConnection.getReceivers();
                console.log('🎵 Total receivers:', receivers.length);

                receivers.forEach((receiver, index) => {
                    if (receiver.track) {
                        console.log(`🎵 Receiver ${index}:`, {
                            kind: receiver.track.kind,
                            id: receiver.track.id,
                            enabled: receiver.track.enabled,
                            readyState: receiver.track.readyState,
                            muted: receiver.track.muted
                        });
                    }
                });

                // Only enable remote audio if call has been answered
                let hasAudioTrack = false;

                // First, handle tracks from receivers (these are the actual remote tracks)
                receivers.forEach((receiver) => {
                    if (receiver.track && receiver.track.kind === 'audio') {
                        hasAudioTrack = true;
                        // ALWAYS disable first, then enable only if call answered
                        receiver.track.enabled = false;
                        if (receiver.track._nativeTrack) {
                            receiver.track._nativeTrack.setEnabled(false);
                        }

                        if (this.isCallAnswered) {
                            console.log('🎵 Enabling remote audio track from receiver (call answered):', receiver.track.id);
                            receiver.track.enabled = true;
                            // Force play the track
                            if (receiver.track._nativeTrack) {
                                receiver.track._nativeTrack.setEnabled(true);
                            }
                            // Store track reference for later enable when connection established
                            if (!this.pendingRemoteAudioTracks) {
                                this.pendingRemoteAudioTracks = [];
                            }
                            if (!this.pendingRemoteAudioTracks.includes(receiver.track)) {
                                this.pendingRemoteAudioTracks.push(receiver.track);
                            }
                        } else {
                            console.log('🔇 Disabling remote audio track from receiver (call not answered yet):', receiver.track.id);
                        }
                    }
                });

                // Also check stream for audio tracks
                if (this.remoteStream.getAudioTracks && this.remoteStream.getAudioTracks().length > 0) {
                    const audioTracks = this.remoteStream.getAudioTracks();
                    console.log('🎵 Found audio tracks in stream:', audioTracks.length);
                    audioTracks.forEach(track => {
                        // ALWAYS disable first, then enable only if call answered
                        track.enabled = false;
                        if (track._nativeTrack) {
                            track._nativeTrack.setEnabled(false);
                        }

                        if (this.isCallAnswered) {
                            console.log('🎵 Enabling audio track from stream (call answered):', track.id);
                            track.enabled = true;
                            // Force play the track
                            if (track._nativeTrack) {
                                track._nativeTrack.setEnabled(true);
                            }
                            // Store track reference for later enable when connection established
                            if (!this.pendingRemoteAudioTracks) {
                                this.pendingRemoteAudioTracks = [];
                            }
                            if (!this.pendingRemoteAudioTracks.includes(track)) {
                                this.pendingRemoteAudioTracks.push(track);
                            }
                        } else {
                            console.log('🔇 Disabling audio track from stream (call not answered yet):', track.id);
                        }
                    });
                    hasAudioTrack = true;
                }

                if (!hasAudioTrack) {
                    console.warn('⚠️ No audio tracks found in remote stream or receivers');
                } else {
                    if (this.isCallAnswered) {
                        console.log('✅ Remote audio tracks enabled (call answered)');

                        // Force enable audio mode for playback (async, don't await)
                        Audio.setAudioModeAsync({
                            allowsRecordingIOS: true,
                            playsInSilentModeIOS: true,
                            shouldDuckAndroid: true,
                            playThroughEarpieceAndroid: false,
                            staysActiveInBackground: true,
                        }).then(() => {
                            console.log('✅ Audio mode set for remote audio playback');
                        }).catch((audioModeError) => {
                            console.log('Failed to set audio mode for playback:', audioModeError);
                        });
                    } else {
                        console.log('🔇 Remote audio tracks disabled (waiting for call to be answered)');
                        // Ensure audio mode is set to prevent local audio from playing
                        Audio.setAudioModeAsync({
                            allowsRecordingIOS: true,
                            playsInSilentModeIOS: false,
                            shouldDuckAndroid: false,
                            playThroughEarpieceAndroid: false,
                            staysActiveInBackground: true,
                        }).catch(() => {
                            // Silently ignore
                        });
                    }
                }

                // Handle remote video if available
                // First, check receivers for video tracks (these are the actual remote tracks)
                let hasVideoTrack = false;
                receivers.forEach((receiver) => {
                    if (receiver.track && receiver.track.kind === 'video') {
                        hasVideoTrack = true;
                        console.log('📹 Found video track in receiver:', {
                            id: receiver.track.id,
                            enabled: receiver.track.enabled,
                            readyState: receiver.track.readyState,
                            muted: receiver.track.muted
                        });

                        // Enable video track
                        receiver.track.enabled = true;
                        if (receiver.track._nativeTrack) {
                            receiver.track._nativeTrack.setEnabled(true);
                        }
                    }
                });

                // Also check stream for video tracks
                if (this.remoteStream.getVideoTracks && this.remoteStream.getVideoTracks().length > 0) {
                    const videoTracks = this.remoteStream.getVideoTracks();
                    console.log('📹 Found video tracks in stream:', videoTracks.length);
                    videoTracks.forEach(track => {
                        console.log('📹 Video track:', {
                            id: track.id,
                            enabled: track.enabled,
                            readyState: track.readyState,
                            muted: track.muted
                        });
                        track.enabled = true;
                        if (track._nativeTrack) {
                            track._nativeTrack.setEnabled(true);
                        }
                    });
                    hasVideoTrack = true;
                }

                if (!hasVideoTrack) {
                    console.warn('⚠️ No video tracks found in remote stream or receivers');
                } else {
                    console.log('✅ Remote video tracks enabled');
                }
            };

            // Handle ICE candidates
            this.peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    if (this.otherUserId) {
                        this.sendSignalingData(this.otherUserId, 'ice-candidate', {
                            candidate: event.candidate
                        }).catch(() => {
                            // Silently ignore
                        });
                    } else {
                        // Store candidate to send later when otherUserId is available
                        if (!this.pendingOutgoingIceCandidates) {
                            this.pendingOutgoingIceCandidates = [];
                        }
                        this.pendingOutgoingIceCandidates.push({
                            candidate: event.candidate,
                            timestamp: Date.now()
                        });
                    }
                }
            };

            // Handle connection state changes
            this.peerConnection.onconnectionstatechange = () => {
                if (this.peerConnection) {
                    const state = this.peerConnection.connectionState;
                    console.log('🔗 Connection state changed:', state);

                    if (state === 'connected') {
                        this.isConnected = true;
                        console.log('✅ Connection established, ensuring audio is enabled');

                        // When connected, ensure audio tracks are enabled
                        setTimeout(() => {
                            // Always ensure local audio is enabled (for speaking)
                            if (this.localStream && this.localStream.getAudioTracks) {
                                this.localStream.getAudioTracks().forEach(track => {
                                    if (!track.enabled) {
                                        console.log('🎤 Enabling local audio track on connection:', track.id);
                                        track.enabled = true;
                                    }
                                });
                            }

                            // Also ensure local tracks in senders are enabled
                            if (this.peerConnection) {
                                const senders = this.peerConnection.getSenders();
                                senders.forEach(sender => {
                                    if (sender.track && sender.track.kind === 'audio' && !sender.track.enabled) {
                                        console.log('🎤 Enabling local audio sender track on connection:', sender.track.id);
                                        sender.track.enabled = true;
                                    }
                                });
                            }

                            // Set audio mode
                            Audio.setAudioModeAsync({
                                allowsRecordingIOS: true,
                                playsInSilentModeIOS: true,
                                shouldDuckAndroid: true,
                                playThroughEarpieceAndroid: false,
                                staysActiveInBackground: true,
                            }).then(() => {
                                console.log('✅ Audio mode set on connection');
                            }).catch((e) => {
                                console.log('Failed to set audio mode:', e);
                            });

                            // Enable remote audio only if call answered (for hearing)
                            if (this.isCallAnswered) {
                                console.log('✅ Connection established, enabling remote audio (call answered)');
                                // Use the helper function to enable all remote audio tracks
                                this.enableRemoteAudioTracks();
                            }
                        }, 200);
                    } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
                        this.isConnected = false;
                        if ((state === 'failed' || state === 'closed') && !this.isEndingCall) {
                            // Only handle call ended if not already ending
                            this.handleCallEnded();
                        }
                    }
                }
            };

            // Handle ICE connection state changes
            this.peerConnection.oniceconnectionstatechange = () => {
                if (this.peerConnection) {
                    const iceState = this.peerConnection.iceConnectionState;
                    console.log('🧊 ICE connection state changed:', iceState);

                    if (iceState === 'connected' || iceState === 'completed') {
                        this.isConnected = true;
                        console.log('✅ ICE connection established');

                        // When ICE connected, ensure audio tracks are enabled
                        setTimeout(() => {
                            // Always ensure local audio is enabled (for speaking)
                            if (this.localStream && this.localStream.getAudioTracks) {
                                this.localStream.getAudioTracks().forEach(track => {
                                    if (!track.enabled) {
                                        console.log('🎤 Enabling local audio track on ICE connection:', track.id);
                                        track.enabled = true;
                                    }
                                });
                            }

                            // Also ensure local tracks in senders are enabled
                            if (this.peerConnection) {
                                const senders = this.peerConnection.getSenders();
                                senders.forEach(sender => {
                                    if (sender.track && sender.track.kind === 'audio' && !sender.track.enabled) {
                                        console.log('🎤 Enabling local audio sender track on ICE connection:', sender.track.id);
                                        sender.track.enabled = true;
                                    }
                                });
                            }

                            // Set audio mode
                            Audio.setAudioModeAsync({
                                allowsRecordingIOS: true,
                                playsInSilentModeIOS: true,
                                shouldDuckAndroid: true,
                                playThroughEarpieceAndroid: false,
                                staysActiveInBackground: true,
                            }).then(() => {
                                console.log('✅ Audio mode set on ICE connection');
                            }).catch((e) => {
                                console.log('Failed to set audio mode:', e);
                            });

                            // Enable remote audio only if call answered (for hearing)
                            if (this.isCallAnswered) {
                                console.log('✅ ICE connection established, enabling remote audio (call answered)');
                                // Use the helper function to enable all remote audio tracks
                                this.enableRemoteAudioTracks();
                            }
                        }, 200);
                    } else if (iceState === 'failed' || iceState === 'disconnected' || iceState === 'closed') {
                        this.isConnected = false;
                    }
                }
            };

            console.log('✅ Peer connection created');
        } catch (error) {
            console.error('Error creating peer connection:', error);
            throw error;
        }
    }

    // Handle incoming offer
    async handleOffer(sdp, callId, senderId = null) {
        try {
            // Set otherUserId from senderId if provided and not already set
            if (senderId && !this.otherUserId) {
                this.otherUserId = senderId;
            }

            // If otherUserId is not set, try to get it from the call or from signaling data
            if (!this.otherUserId) {
                // Try from callId first
                if (callId) {
                    try {
                        const { data: callData } = await supabase
                            .from('calls')
                            .select('caller_id, receiver_id')
                            .eq('id', callId)
                            .single();

                        if (callData) {
                            this.otherUserId = callData.caller_id;
                        }
                    } catch (e) {
                        // Ignore
                    }
                }

                // If still not set, try to get from recent signaling data (offer sender)
                if (!this.otherUserId) {
                    try {
                        const { data: recentOffers } = await supabase
                            .from('webrtc_signaling')
                            .select('sender_id')
                            .eq('receiver_id', this.currentUserId)
                            .eq('type', 'offer')
                            .order('created_at', { ascending: false })
                            .limit(1);

                        if (recentOffers && recentOffers.length > 0) {
                            this.otherUserId = recentOffers[0].sender_id;
                        }
                    } catch (e) {
                        // Ignore
                    }
                }
            }

            // Send any pending outgoing ICE candidates now that otherUserId is set
            if (this.otherUserId && this.pendingOutgoingIceCandidates && this.pendingOutgoingIceCandidates.length > 0) {
                for (const pendingCandidate of this.pendingOutgoingIceCandidates) {
                    try {
                        await this.sendSignalingData(this.otherUserId, 'ice-candidate', {
                            candidate: pendingCandidate.candidate
                        });
                    } catch (e) {
                        // Ignore
                    }
                }
                this.pendingOutgoingIceCandidates = [];
            }

            // BƯỚC 1: Đảm bảo có localStream trước
            if (!this.localStream) {
                console.log('📞 Getting user media in handleOffer...');
                await this.getUserMedia();
                console.log('✅ User media obtained in handleOffer');
            }

            // BƯỚC 2: CRITICAL: Không tạo peer connection mới nếu đã có
            // Chỉ tạo nếu peer connection == null HOẶC state in ['failed','closed']
            if (!this.peerConnection) {
                await this.createPeerConnection();
            } else {
                const connectionState = this.peerConnection.connectionState;
                const iceConnectionState = this.peerConnection.iceConnectionState;
                const isActiveState = connectionState !== 'closed' && connectionState !== 'failed' &&
                    iceConnectionState !== 'closed' && iceConnectionState !== 'failed' && iceConnectionState !== 'disconnected';
                if (!isActiveState) {
                    // PC is in bad state, create new one
                    await this.createPeerConnection();
                } else {
                    console.log('📞 Reusing existing peer connection in handleOffer. State:', connectionState, 'ICE:', iceConnectionState);
                }
            }

            // BƯỚC 3: Luôn addTrack vào peerConnection (kể cả khi reuse)
            console.log('📞 Adding local tracks to peer connection in handleOffer...');
            this._addLocalTracksToPeerConnection();

            const offer = new RTCSessionDescription({ type: 'offer', sdp });
            await this.peerConnection.setRemoteDescription(offer);

            // Add any pending ICE candidates
            if (this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
                for (const candidate of this.pendingIceCandidates) {
                    try {
                        const iceCandidate = candidate.candidate ? candidate : { candidate: candidate };
                        // Ensure sdpMLineIndex and sdpMid are set
                        if (iceCandidate.sdpMLineIndex === undefined && !iceCandidate.sdpMid) {
                            iceCandidate.sdpMLineIndex = candidate.sdpMLineIndex ?? 0;
                            iceCandidate.sdpMid = candidate.sdpMid ?? '0';
                        }
                        if (iceCandidate.sdpMLineIndex === undefined && !iceCandidate.sdpMid) {
                            iceCandidate.sdpMLineIndex = 0;
                        }
                        if (!iceCandidate.sdpMid && iceCandidate.sdpMLineIndex === undefined) {
                            iceCandidate.sdpMid = '0';
                        }
                        await this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
                    } catch (e) {
                        // Silently ignore
                    }
                }
                this.pendingIceCandidates = [];
            }

            // Create answer
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);

            // NOTE: Do NOT set isCallAnswered here - it should only be set when user clicks answer button
            // Remote audio will be enabled when isCallAnswered becomes true (in answerCall)
            console.log('✅ Answer created, waiting for user to answer call before enabling audio');

            // Ensure local audio is enabled (for speaking) - ALWAYS enabled
            if (this.localStream && this.localStream.getAudioTracks) {
                const localAudioTracks = this.localStream.getAudioTracks();
                console.log('🎤 Ensuring local audio enabled for speaking, tracks:', localAudioTracks.length);
                localAudioTracks.forEach(track => {
                    track.enabled = true;
                    console.log('🎤 Local audio track enabled:', track.id, 'readyState:', track.readyState);
                });
            }

            // Also ensure local tracks in senders are enabled
            if (this.peerConnection) {
                const senders = this.peerConnection.getSenders();
                senders.forEach(sender => {
                    if (sender.track && sender.track.kind === 'audio') {
                        sender.track.enabled = true;
                        console.log('🎤 Local audio sender track enabled:', sender.track.id);
                    }
                });
            }

            // NOTE: Do NOT enable remote audio here - wait for user to click answer button
            // Remote audio will be enabled in answerCall() when isCallAnswered becomes true

            // Send answer to caller
            if (!this.otherUserId) {
                throw new Error('otherUserId is not set, cannot send answer');
            }
            await this.sendSignalingData(this.otherUserId, 'answer', {
                sdp: answer.sdp
            });
        } catch (error) {
            // Only log critical errors
            if (error.message && !error.message.includes('otherUserId is not set')) {
                console.error('❌ Error handling offer:', error.message);
            }
            throw error;
        }
    }

    // Handle incoming answer
    async handleAnswer(sdp) {
        try {
            // BƯỚC 1: Đảm bảo có localStream trước
            if (!this.localStream) {
                console.log('📞 Getting user media in handleAnswer...');
                await this.getUserMedia();
                console.log('✅ User media obtained in handleAnswer');
            }

            // BƯỚC 2: CRITICAL: Không tạo peer connection mới nếu đã có
            // Chỉ tạo nếu peer connection == null HOẶC state in ['failed','closed']
            if (!this.peerConnection) {
                console.error('❌ No peer connection when handling answer - this should not happen');
                // Chỉ tạo nếu thực sự không có (fallback)
                await this.createPeerConnection();
            } else {
                const connectionState = this.peerConnection.connectionState;
                const iceConnectionState = this.peerConnection.iceConnectionState;
                const isActiveState = connectionState !== 'closed' && connectionState !== 'failed' &&
                    iceConnectionState !== 'closed' && iceConnectionState !== 'failed' && iceConnectionState !== 'disconnected';
                if (!isActiveState) {
                    // PC is in bad state, create new one
                    await this.createPeerConnection();
                } else {
                    console.log('📞 Reusing existing peer connection in handleAnswer. State:', connectionState, 'ICE:', iceConnectionState);
                }
            }

            // BƯỚC 3: Luôn addTrack vào peerConnection (kể cả khi reuse)
            console.log('📞 Adding local tracks to peer connection in handleAnswer...');
            this._addLocalTracksToPeerConnection();

            // Check if we're in the right state to set remote description
            const currentState = this.peerConnection.signalingState;
            if (currentState === 'stable') {
                // Already have local and remote descriptions, skip
                return;
            }

            const answer = new RTCSessionDescription({ type: 'answer', sdp });
            await this.peerConnection.setRemoteDescription(answer);

            console.log('✅ Answer received and remote description set');

            // CRITICAL: Không tạo remote stream từ receivers ở đây
            // Remote stream sẽ được set từ ontrack event
            // Callback sẽ được trigger từ ontrack khi stream ID thay đổi

            // NOTE: Do NOT set isCallAnswered here - it should only be set when receiver clicks answer button
            // Remote audio will be enabled when isCallAnswered becomes true (set by receiver in answerCall)
            // For caller, we need to wait for receiver to actually answer (status = 'answered' in database)
            console.log('✅ Answer received, but waiting for receiver to answer call before enabling audio');

            // Ensure local audio is enabled (for speaking) - ALWAYS enabled
            if (this.localStream && this.localStream.getAudioTracks) {
                const localAudioTracks = this.localStream.getAudioTracks();
                console.log('🎤 Ensuring local audio enabled for speaking, tracks:', localAudioTracks.length);
                localAudioTracks.forEach(track => {
                    track.enabled = true;
                    console.log('🎤 Local audio track enabled:', track.id, 'readyState:', track.readyState);
                });
            }

            // Also ensure local tracks in senders are enabled
            if (this.peerConnection) {
                const senders = this.peerConnection.getSenders();
                senders.forEach(sender => {
                    if (sender.track && sender.track.kind === 'audio') {
                        sender.track.enabled = true;
                        console.log('🎤 Local audio sender track enabled:', sender.track.id);
                    }
                });
            }

            // NOTE: Do NOT enable remote audio here - wait for receiver to click answer button
            // Remote audio will be enabled when receiver calls answerCall() and sets isCallAnswered = true

            // CRITICAL: Không enable video tracks ở đây
            // Video tracks sẽ được enable trong ontrack event
            // Callback sẽ được trigger từ ontrack khi stream ID thay đổi

            // Add any pending ICE candidates
            if (this.pendingIceCandidates && this.pendingIceCandidates.length > 0) {
                for (const candidate of this.pendingIceCandidates) {
                    try {
                        const iceCandidate = candidate.candidate ? candidate : { candidate: candidate };
                        // Ensure sdpMLineIndex and sdpMid are set
                        if (iceCandidate.sdpMLineIndex === undefined && !iceCandidate.sdpMid) {
                            iceCandidate.sdpMLineIndex = candidate.sdpMLineIndex ?? 0;
                            iceCandidate.sdpMid = candidate.sdpMid ?? '0';
                        }
                        if (iceCandidate.sdpMLineIndex === undefined && !iceCandidate.sdpMid) {
                            iceCandidate.sdpMLineIndex = 0;
                        }
                        if (!iceCandidate.sdpMid && iceCandidate.sdpMLineIndex === undefined) {
                            iceCandidate.sdpMid = '0';
                        }
                        await this.peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
                    } catch (e) {
                        // Silently ignore
                    }
                }
                this.pendingIceCandidates = [];
            }
        } catch (error) {
            // Only log critical errors
            if (error.message && !error.message.includes('wrong state')) {
                console.error('❌ Error handling answer:', error.message);
            }
        }
    }

    // Handle ICE candidate
    async handleIceCandidate(candidate) {
        try {
            if (!this.peerConnection) {
                // Store candidate to add later when peer connection is created
                if (!this.pendingIceCandidates) {
                    this.pendingIceCandidates = [];
                }
                this.pendingIceCandidates.push(candidate);
                return;
            }

            // candidate might be nested
            const iceCandidate = candidate?.candidate ? candidate : { candidate: candidate };

            if (!iceCandidate || !iceCandidate.candidate) {
                return;
            }

            // Ensure sdpMLineIndex and sdpMid are set (required by react-native-webrtc)
            if (iceCandidate.sdpMLineIndex === undefined && iceCandidate.sdpMid === undefined) {
                iceCandidate.sdpMLineIndex = candidate.sdpMLineIndex ?? 0;
                iceCandidate.sdpMid = candidate.sdpMid ?? '0';
            }

            // At least one must be set
            if (iceCandidate.sdpMLineIndex === undefined && !iceCandidate.sdpMid) {
                iceCandidate.sdpMLineIndex = 0;
            }
            if (!iceCandidate.sdpMid && iceCandidate.sdpMLineIndex === undefined) {
                iceCandidate.sdpMid = '0';
            }

            if (!this.peerConnection.remoteDescription) {
                // Store candidate to add later
                if (!this.pendingIceCandidates) {
                    this.pendingIceCandidates = [];
                }
                this.pendingIceCandidates.push(iceCandidate);
                return;
            }

            const rtcCandidate = new RTCIceCandidate(iceCandidate);
            await this.peerConnection.addIceCandidate(rtcCandidate);
        } catch (error) {
            // Silently ignore ICE candidate errors (they're often non-critical)
        }
    }

    // Handle call ended (called when receiving call-ended signal from remote)
    async handleCallEnded() {
        try {
            // Prevent multiple call-ended handling
            if (this.isEndingCall) {
                return;
            }
            this.isEndingCall = true;

            // Don't send call-ended signal again (remote party already sent it)
            // Clear otherUserId immediately to prevent any signal sending
            const wasOtherUserId = this.otherUserId;
            this.otherUserId = null;

            // Cleanup WebRTC peer connection
            if (this.peerConnection) {
                console.log('📞 [handleCallEnded] Closing peer connection. PC ID:', this.peerConnectionId);
                try {
                    // Close all tracks
                    if (this.localStream && this.localStream.getTracks) {
                        this.localStream.getTracks().forEach(track => track.stop());
                    }
                    if (this.remoteStream && this.remoteStream.getTracks) {
                        this.remoteStream.getTracks().forEach(track => track.stop());
                    }
                    // Close peer connection
                    this.peerConnection.close();
                } catch (webrtcError) {
                    // Ignore
                }
                this.peerConnection = null;
                this.peerConnectionId = null;
            }

            // Stop audio recording (fallback)
            if (this.recording) {
                try {
                    await this.recording.stopAndUnloadAsync();
                } catch (recordingError) {
                    // Ignore
                }
                this.recording = null;
            }

            // Cập nhật call status trong database
            if (this.currentCallId) {
                try {
                    await endCall(this.currentCallId, this.callDuration || 0);
                } catch (e) {
                    // Ignore
                }
            }

            // Set call status to ended
            this.callStatus = 'ended';

            // Cleanup
            this.localStream = null;
            this.clearRemoteStream('handleCallEnded: call ended', { force: true });
            this.isConnected = false;
            this.currentChannel = null;
            this.currentCallId = null;
            this.callDuration = 0;
            this.pendingIceCandidates = [];
            this.pendingOutgoingIceCandidates = [];
            this.isCallAnswered = false;
            this.pendingRemoteAudioTracks = [];

            // Trigger callback
            if (this.onCallEnded) {
                this.onCallEnded();
            }

            this.isEndingCall = false;
        } catch (error) {
            this.isEndingCall = false;
            // Only log critical errors
            if (error.message && !error.message.includes('wrong state')) {
                console.error('Error handling call ended:', error.message);
            }
        }
    }

    // Mute/Unmute audio
    async muteAudio(mute = true) {
        try {
            if (this.localStream && this.localStream.getAudioTracks) {
                // WebRTC stream
                this.localStream.getAudioTracks().forEach(track => {
                    track.enabled = !mute;
                });
            } else if (this.recording) {
                // Audio.Recording fallback
                if (mute) {
                    await this.recording.pauseAsync();
                    console.log('Audio recording paused');
                } else {
                    await this.recording.startAsync();
                    console.log('Audio recording resumed');
                }
            } else {
                console.log(`Audio ${mute ? 'muted' : 'unmuted'}`);
            }
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
                // WebRTC stream
                this.localStream.getVideoTracks().forEach(track => {
                    track.enabled = !mute;
                });
                console.log(`Video ${mute ? 'muted' : 'unmuted'} (WebRTC)`);
            } else if (this.localStream) {
                // Fallback
                this.localStream.hasVideo = !mute;
                this.localStream.type = this.isVideoEnabled ? 'video' : 'audio';
                console.log(`Video ${mute ? 'muted' : 'unmuted'} (fallback)`);
            }

            return { success: true, muted: mute };
        } catch (error) {
            console.error('Mute video error:', error);
            return { success: false, error: error.message };
        }
    }

    // Switch camera (for video calls)
    async switchCamera() {
        try {
            // Camera switching not implemented yet
            console.log('Camera switched (not implemented)');
            return { success: true };
        } catch (error) {
            console.error('Switch camera error:', error);
            return { success: false, error: error.message };
        }
    }

    // End call
    async endCall() {
        try {
            // Prevent multiple endCall calls
            if (this.isEndingCall) {
                return { success: true };
            }
            this.isEndingCall = true;

            // Send call ended signal
            if (this.otherUserId) {
                try {
                    await this.sendSignalingData(this.otherUserId, 'call-ended', {});
                } catch (e) {
                    // Ignore signaling errors
                }
            }

            // Cleanup WebRTC peer connection
            if (this.peerConnection) {
                console.log('📞 [endCall] Closing peer connection. PC ID:', this.peerConnectionId);
                try {
                    // Close all tracks
                    if (this.localStream && this.localStream.getTracks) {
                        this.localStream.getTracks().forEach(track => track.stop());
                    }
                    if (this.remoteStream && this.remoteStream.getTracks) {
                        this.remoteStream.getTracks().forEach(track => track.stop());
                    }
                    // Close peer connection
                    this.peerConnection.close();
                } catch (webrtcError) {
                    // Ignore
                }
                this.peerConnection = null;
                this.peerConnectionId = null;
            }

            // Stop audio recording (fallback)
            if (this.recording) {
                try {
                    await this.recording.stopAndUnloadAsync();
                } catch (recordingError) {
                    // Ignore
                }
                this.recording = null;
            }

            // Cập nhật call status trong database
            let savedDuration = this.callDuration || 0;
            let callStatus = 'ended'; // Default status
            let isCaller = false; // Track if current user is the caller
            let conversationIdFromDb = null; // Store conversation_id from database

            console.log('📞 endCall() called, currentCallId:', this.currentCallId, 'currentUserId:', this.currentUserId);

            if (this.currentCallId) {
                try {
                    // Check current call status and caller_id before ending
                    const { supabase } = await import('../lib/supabase');
                    const { data: callData, error: callError } = await supabase
                        .from('call_requests')
                        .select('status, caller_id, answered_at, ended_at, duration, conversation_id')
                        .eq('id', this.currentCallId)
                        .single();

                    if (!callError && callData) {
                        callStatus = callData.status;
                        isCaller = callData.caller_id === this.currentUserId;
                        conversationIdFromDb = callData.conversation_id;
                        console.log('📞 Current call status before endCall:', callStatus, 'isCaller:', isCaller, 'conversationId:', conversationIdFromDb);

                        // Calculate duration from answered_at and ended_at if available
                        // This is more accurate than using this.callDuration
                        // Priority: 1) Calculate from answered_at and ended_at (if both exist), 2) Use existing duration, 3) Calculate from answered_at to now
                        if (callData.answered_at && callData.ended_at) {
                            // Both timestamps available - always calculate from them (most accurate)
                            const answeredTime = new Date(callData.answered_at);
                            const endedTime = new Date(callData.ended_at);
                            const calculatedDuration = Math.floor((endedTime.getTime() - answeredTime.getTime()) / 1000);
                            if (calculatedDuration >= 0) {
                                savedDuration = calculatedDuration;
                                console.log('📞 Calculated duration from answered_at and ended_at:', savedDuration, 'seconds', {
                                    answered_at: callData.answered_at,
                                    ended_at: callData.ended_at,
                                    calculated: savedDuration
                                });
                            } else {
                                console.log('⚠️ Calculated duration is negative, using existing duration');
                                savedDuration = callData.duration || savedDuration || 0;
                            }
                        } else if (callData.ended_at && callData.duration && callData.duration > 0) {
                            // Call already ended but no answered_at - use existing duration
                            savedDuration = callData.duration;
                            console.log('📞 Call already ended, using duration from database:', savedDuration, 'seconds');
                        } else if (callData.answered_at && !callData.ended_at) {
                            // Call not ended yet - calculate from answered_at to now
                            const answeredTime = new Date(callData.answered_at);
                            const endedTime = new Date(); // Current time
                            const calculatedDuration = Math.floor((endedTime.getTime() - answeredTime.getTime()) / 1000);
                            if (calculatedDuration >= 0) {
                                savedDuration = calculatedDuration;
                                console.log('📞 Calculated duration from answered_at to now:', savedDuration, 'seconds');
                            }
                        }

                        // If still 0, try using existing duration from database
                        if (savedDuration === 0 && callData.duration && callData.duration > 0) {
                            savedDuration = callData.duration;
                            console.log('📞 Using duration from database (fallback):', savedDuration, 'seconds');
                        }
                    } else {
                        console.log('⚠️ Error fetching call data or call not found:', callError);
                    }

                    // Only update to 'ended' if not already 'declined'
                    if (callStatus !== 'declined') {
                        const endCallResult = await endCall(this.currentCallId, savedDuration);
                        if (endCallResult.success && endCallResult.data?.duration) {
                            // Use the duration returned from endCall (which may be calculated from timestamps)
                            savedDuration = endCallResult.data.duration;
                            console.log('📞 Duration from endCall result:', savedDuration, 'seconds');
                        }
                    } else {
                        console.log('📞 Call already declined, skipping endCall update');
                    }
                } catch (e) {
                    console.log('Error ending call:', e);
                }
            } else {
                console.log('⚠️ No currentCallId, trying to find call from conversation...');
                // Try to find call from conversation if we have conversation_id
                if (this.currentChannel) {
                    try {
                        const { supabase } = await import('../lib/supabase');
                        const { data: callData, error: callError } = await supabase
                            .from('call_requests')
                            .select('id, status, caller_id, answered_at, ended_at, duration, conversation_id')
                            .eq('conversation_id', this.currentChannel)
                            .or(`caller_id.eq.${this.currentUserId},receiver_id.eq.${this.currentUserId}`)
                            .order('created_at', { ascending: false })
                            .limit(1)
                            .single();

                        if (!callError && callData) {
                            console.log('📞 Found call from conversation:', callData.id);
                            callStatus = callData.status;
                            isCaller = callData.caller_id === this.currentUserId;
                            conversationIdFromDb = callData.conversation_id;

                            // Calculate duration
                            if (callData.answered_at && callData.ended_at) {
                                const answeredTime = new Date(callData.answered_at);
                                const endedTime = new Date(callData.ended_at);
                                const calculatedDuration = Math.floor((endedTime.getTime() - answeredTime.getTime()) / 1000);
                                if (calculatedDuration > 0) {
                                    savedDuration = calculatedDuration;
                                    console.log('📞 Calculated duration from timestamps:', savedDuration, 'seconds');
                                }
                            } else if (callData.duration && callData.duration > 0) {
                                savedDuration = callData.duration;
                                console.log('📞 Using duration from database:', savedDuration, 'seconds');
                            }
                        }
                    } catch (e) {
                        console.log('Error finding call from conversation:', e);
                    }
                }
            }

            // Save call end message to conversation if we have the necessary info
            // Only save if:
            // 1. Call status is not 'declined' (declined calls already have call_declined message)
            // 2. Current user is the caller (call_end message should only appear on caller's side)
            // Get conversation_id from database if currentChannel is null
            let conversationIdForMessage = this.currentChannel || conversationIdFromDb;
            if (!conversationIdForMessage && this.currentCallId) {
                try {
                    const { supabase } = await import('../lib/supabase');
                    const { data: callData } = await supabase
                        .from('call_requests')
                        .select('conversation_id')
                        .eq('id', this.currentCallId)
                        .single();
                    if (callData?.conversation_id) {
                        conversationIdForMessage = callData.conversation_id;
                        console.log('📞 Retrieved conversation_id from database (fallback):', conversationIdForMessage);
                    }
                } catch (e) {
                    console.log('Error getting conversation_id:', e);
                }
            }

            console.log('📞 Checking conditions for saving call end message:', {
                conversationId: conversationIdForMessage,
                currentUserId: this.currentUserId,
                callStatus: callStatus,
                isCaller: isCaller,
                savedDuration: savedDuration,
                currentCallId: this.currentCallId
            });

            // Save message if: not declined, is caller, and we have conversation_id
            // Note: callStatus can be 'ended' (already ended by other party) or 'connecting' (still active)
            if (conversationIdForMessage && this.currentUserId && callStatus !== 'declined' && isCaller && savedDuration >= 0) {
                try {
                    console.log('💬 Saving call end message from caller:', {
                        conversation_id: conversationIdForMessage,
                        sender_id: this.currentUserId,
                        duration: savedDuration,
                        callType: this.isVideoEnabled ? 'video' : 'voice'
                    });

                    const { sendMessage } = await import('./chatService');
                    const callType = this.isVideoEnabled ? 'video' : 'voice';
                    const result = await sendMessage({
                        conversation_id: conversationIdForMessage,
                        sender_id: this.currentUserId,
                        content: JSON.stringify({
                            type: 'call_end',
                            call_type: callType,
                            duration: savedDuration
                        }),
                        message_type: 'call_end'
                    });
                    if (result.success) {
                        console.log('✅ Call end message saved to conversation:', result.data?.id);
                    } else {
                        console.log('❌ Failed to save call end message:', result.msg);
                    }
                } catch (error) {
                    console.log('❌ Error saving call end message:', error);
                }
            } else if (callStatus === 'declined') {
                console.log('📞 Call was declined, skipping call_end message (call_declined message already exists)');
            } else if (!isCaller) {
                console.log('📞 Current user is not the caller, skipping call_end message (only caller should save call_end)');
            } else {
                console.log('⚠️ Cannot save call end message - missing info:', {
                    conversationId: conversationIdForMessage,
                    currentUserId: this.currentUserId,
                    callStatus: callStatus,
                    isCaller: isCaller
                });
            }

            // Set call status to ended
            this.callStatus = 'ended';

            // Cleanup
            this.localStream = null;
            this.clearRemoteStream('endCall: call ended', { force: true });
            this.isConnected = false;
            this.currentChannel = null;
            this.otherUserId = null;
            this.currentCallId = null;
            this.callDuration = 0;
            this.pendingIceCandidates = [];
            this.pendingOutgoingIceCandidates = [];

            // Trigger callback
            if (this.onCallEnded) {
                this.onCallEnded();
            }

            this.isEndingCall = false;
            return { success: true };
        } catch (error) {
            this.isEndingCall = false;
            // Only log critical errors
            if (error.message && !error.message.includes('wrong state')) {
                console.error('End call error:', error.message);
            }
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

    // === ADD NEW CENTRAL STREAM MANAGEMENT API ===
    updateRemoteStream(stream, reason = 'unknown') {
        try {
            const incomingId = stream?.id || null;
            const oldId = this.remoteStream?.id || null;

            // Log chi tiết
            const callerStack = new Error().stack;
            console.log("🚨 REMOTE STREAM ACTION", {
                time: new Date().toISOString(),
                file: "services/webRTCService.js",
                function: "updateRemoteStream",
                action: "UPDATE",
                reason: reason || "<no-reason>",
                oldId: oldId,
                newId: incomingId,
                callStatus: this.callStatus,
                callerStack: callerStack
            });
            console.trace();

            if (incomingId && incomingId === this.remoteStreamId) {
                // Cùng stream ID - chỉ enable tracks
                this._enableRemoteTracksFromStream(stream);
                return;
            }
            const hasVideo =
                stream && typeof stream.getVideoTracks === 'function'
                && stream.getVideoTracks().length > 0;

            if (!hasVideo) {
                console.log('📞 updateRemoteStream: incoming stream has no video, ignoring');
                this._enableRemoteTracksFromStream(stream);
                return;
            }

            // Set remote stream
            console.log("🚨 REMOTE STREAM ACTION", {
                time: new Date().toISOString(),
                file: "services/webRTCService.js",
                function: "updateRemoteStream",
                action: "SET",
                reason: `updateRemoteStream: actual assignment (${reason})`,
                oldId: oldId,
                newId: incomingId,
                callStatus: this.callStatus
            });
            this.remoteStream = stream;
            this.remoteStreamId = incomingId;
            console.log('📞 updateRemoteStream: remote stream set ->', incomingId);

            if (
                typeof this.onRemoteStream === 'function' &&
                this.lastCallbackStreamId !== incomingId
            ) {
                this.onRemoteStream(stream);
                this.lastCallbackStreamId = incomingId;
            }
        } catch (e) {
            console.error('updateRemoteStream error:', e);
        }
    }

    clearRemoteStream(reason = 'unknown', { force = false } = {}) {
        try {
            const oldId = this.remoteStream?.id || null;

            // Log chi tiết trước khi clear
            const callerStack = new Error().stack;
            console.log("🚨 REMOTE STREAM ACTION", {
                time: new Date().toISOString(),
                file: "services/webRTCService.js",
                function: "clearRemoteStream",
                action: "CLEAR",
                reason: reason || "<no-reason>",
                oldId: oldId,
                newId: null,
                callStatus: this.callStatus,
                force: force,
                callerStack: callerStack
            });
            console.trace();

            // CRITICAL: Chặn clear khi call đang active (trừ khi force)
            if (!force && this.callStatus && this.callStatus !== 'ended') {
                console.warn("⚠️ remoteStream bị clear khi call đang active!", {
                    reason,
                    callStatus: this.callStatus,
                    force: force
                });
                console.trace();
                return false;
            }

            let pcIsClosed = true;
            try {
                pcIsClosed =
                    !this.peerConnection ||
                    this.peerConnection.connectionState === 'closed' ||
                    this.peerConnection.iceConnectionState === 'closed';
            } catch (e) {
                pcIsClosed = true;
            }

            if (force || pcIsClosed || this.callStatus === 'ended') {
                console.log('📞 clearRemoteStream: clearing', { force, pcIsClosed, reason });

                if (this.remoteStream?.getTracks) {
                    this.remoteStream.getTracks().forEach(t => {
                        try { t.stop(); } catch (e) { }
                    });
                }
                // CRITICAL: Gán null sau khi đã kiểm tra và log
                console.log("🚨 REMOTE STREAM ACTION", {
                    time: new Date().toISOString(),
                    file: "services/webRTCService.js",
                    function: "clearRemoteStream",
                    action: "SET",
                    reason: `clearRemoteStream: actual assignment (${reason})`,
                    oldId: oldId,
                    newId: null,
                    callStatus: this.callStatus,
                    force: force
                });
                this.remoteStream = null;
                this.remoteStreamId = null;
                this.lastCallbackStreamId = null;
                return true;
            } else {
                console.log('📞 clearRemoteStream: SKIP (PC active)', {
                    force,
                    pcState: this.peerConnection?.iceConnectionState,
                    callStatus: this.callStatus,
                    reason: reason
                });
                return false;
            }
        } catch (e) {
            console.error('clearRemoteStream error:', e);
            return false;
        }
    }

    _enableRemoteTracksFromStream(stream) {
        try {
            if (!stream) return;
            stream.getAudioTracks?.().forEach(t => (t.enabled = true));
            stream.getVideoTracks?.().forEach(t => (t.enabled = true));
        } catch (e) { }
    }
    // === END ADD ===

    // Mark call as answered (called when receiver answers - caller side)
    markAsAnswered() {
        this.isCallAnswered = true;
        this.isConnected = true;
        this.callStatus = 'connected';
        console.log('✅ Call marked as answered (markAsAnswered - caller side), enabling audio');

        // Set audio mode for call
        Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
            staysActiveInBackground: true,
        }).then(() => {
            console.log('✅ Audio mode set after markAsAnswered');
        }).catch((e) => {
            console.log('Failed to set audio mode:', e);
        });

        // Enable remote audio tracks now that call is answered
        // Call multiple times to catch tracks that arrive later
        this.enableRemoteAudioTracks();
        setTimeout(() => {
            this.enableRemoteAudioTracks();
        }, 100);
        setTimeout(() => {
            this.enableRemoteAudioTracks();
        }, 300);
        setTimeout(() => {
            this.enableRemoteAudioTracks();
        }, 500);

        // CRITICAL: Không enable video tracks ở đây
        // Video tracks đã được enable trong ontrack event
        // Chỉ trigger callback nếu stream ID thực sự thay đổi
        if (this.remoteStream && this.remoteStreamId && this.remoteStreamId !== this.lastCallbackStreamId && this.onRemoteStream) {
            console.log('📹 Triggering onRemoteStream callback in markAsAnswered (new stream ID):', this.remoteStreamId);
            this.lastCallbackStreamId = this.remoteStreamId;
            this.onRemoteStream(this.remoteStream);
        }
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
            remoteStream: this.remoteStream, // Include remote stream
            isVideoEnabled: this.isVideoEnabled,
            hasVideo: this.localStream?.hasVideo || false,
            hasAudio: this.localStream?.hasAudio || false
        };
    }

    // Cleanup
    async destroy() {
        try {
            await this.endCall();
            
            // Cleanup signaling channel reconnect timer
            if (this.signalingReconnectTimer) {
                clearTimeout(this.signalingReconnectTimer);
                this.signalingReconnectTimer = null;
            }
            
            // Remove signaling channel
            if (this.signalingChannel) {
                try {
                    supabase.removeChannel(this.signalingChannel);
                } catch (e) {
                    // Ignore errors
                }
                this.signalingChannel = null;
            }
            
            return { success: true };
        } catch (error) {
            // Silent error handling
            return { success: false, error: error.message };
        }
    }
}

// Export class (not instance) to allow creating new instances
export default WebRTCService;
