
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import { answerCall, createCallRequest, endCall } from './callService';

class WebRTCService {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.isConnected = false;
        this.currentChannel = null;
        this.currentUserId = null;
        this.otherUserId = null;
        this.recording = null;
        this.camera = null;
        this.isVideoEnabled = false;

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

            // Mock initialization for testing
            console.log('WebRTC Service initialized for user:', userId);
            return { success: true };
        } catch (error) {
            console.error('WebRTC initialization error:', error);
            return { success: false, error: error.message };
        }
    }

    // Start a call
    async startCall(conversationId, otherUserId, callType = 'voice') {
        try {
            this.currentChannel = conversationId;
            this.otherUserId = otherUserId;

            console.log(`Starting ${callType} call to ${otherUserId} in conversation ${conversationId}`);

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

            // Set audio mode for recording
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    staysActiveInBackground: true,
                });
                console.log('Audio mode set successfully');
            } catch (audioModeError) {
                console.log('Failed to set audio mode:', audioModeError);
            }

            // Create real audio recording
            try {
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
                    web: {
                        mimeType: 'audio/webm',
                        bitsPerSecond: 128000,
                    },
                });

                await recording.startAsync();
                this.recording = recording;

                // Create local stream with audio and video
                this.localStream = {
                    type: callType === 'video' ? 'video' : 'audio',
                    recording: recording,
                    real: true,
                    hasVideo: this.isVideoEnabled,
                    hasAudio: true
                };
                console.log(`Real ${callType} stream started`);
            } catch (audioError) {
                console.log('Audio recording failed, using mock:', audioError);
                // Fallback to mock if real audio fails
                this.localStream = { type: 'audio', mock: true };
            }

            this.isConnected = true;
            console.log('Call started successfully');

            return { success: true, callId: this.currentCallId };
        } catch (error) {
            console.error('Start call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Answer a call
    async answerCall(callId) {
        try {
            console.log(`Answering call ${callId}`);

            // Cập nhật call status trong database
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

            // Set audio mode for recording
            try {
                await Audio.setAudioModeAsync({
                    allowsRecordingIOS: true,
                    playsInSilentModeIOS: true,
                    shouldDuckAndroid: true,
                    playThroughEarpieceAndroid: false,
                    staysActiveInBackground: true,
                });
                console.log('Audio mode set successfully for answer');
            } catch (audioModeError) {
                console.log('Failed to set audio mode for answer:', audioModeError);
            }

            // Create real audio recording
            try {
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
                    web: {
                        mimeType: 'audio/webm',
                        bitsPerSecond: 128000,
                    },
                });

                await recording.startAsync();
                this.recording = recording;

                // Create local stream with audio and video
                this.localStream = {
                    type: 'audio', // Default to audio for answer, will be updated if video
                    recording: recording,
                    real: true,
                    hasVideo: false, // Will be updated if video call
                    hasAudio: true
                };
                console.log('Real audio recording started for answer');
            } catch (audioError) {
                console.log('Audio recording failed, using mock:', audioError);
                // Fallback to mock if real audio fails
                this.localStream = { type: 'audio', mock: true };
            }

            this.isConnected = true;
            console.log('Call answered successfully');

            return { success: true };
        } catch (error) {
            console.error('Answer call error:', error);
            return { success: false, error: error.message };
        }
    }

    // Mute/Unmute audio
    async muteAudio(mute = true) {
        try {
            if (this.recording) {
                if (mute) {
                    await this.recording.pauseAsync();
                    console.log('Audio recording paused');
                } else {
                    await this.recording.startAsync();
                    console.log('Audio recording resumed');
                }
            } else {
                console.log(`Audio ${mute ? 'muted' : 'unmuted'} (mock)`);
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

            if (this.localStream) {
                this.localStream.hasVideo = !mute;
                this.localStream.type = this.isVideoEnabled ? 'video' : 'audio';
            }

            console.log(`Video ${mute ? 'muted' : 'unmuted'} (${this.isVideoEnabled ? 'enabled' : 'disabled'})`);
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
            // Stop audio recording
            if (this.recording) {
                try {
                    await this.recording.stopAndUnloadAsync();
                    console.log('Audio recording stopped');
                } catch (recordingError) {
                    console.log('Error stopping recording:', recordingError);
                }
                this.recording = null;
            }

            // Cập nhật call status trong database
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

            console.log('Call ended');
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
            isVideoEnabled: this.isVideoEnabled,
            hasVideo: this.localStream?.hasVideo || false,
            hasAudio: this.localStream?.hasAudio || false
        };
    }

    // Cleanup
    async destroy() {
        try {
            await this.endCall();
            console.log('WebRTC Service destroyed');
            return { success: true };
        } catch (error) {
            console.error('Destroy error:', error);
            return { success: false, error: error.message };
        }
    }
}

// Export singleton instance
export default new WebRTCService();
