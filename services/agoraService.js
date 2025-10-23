import { ClientRole, RtcEngine } from 'react-native-agora';

class AgoraService {
    constructor() {
        this.engine = null;
        this.isInitialized = false;
        this.isJoined = false;
        this.channelName = null;
        this.uid = null;
        this.localVideoEnabled = true;
        this.localAudioEnabled = true;
    }

    async initialize(appId) {
        try {
            console.log('🎤 Initializing Agora with App ID:', appId);

            this.engine = await RtcEngine.create(appId);

            // Enable video
            await this.engine.enableVideo();

            // Enable audio
            await this.engine.enableAudio();

            // Set up event listeners
            this.setupEventListeners();

            this.isInitialized = true;
            console.log('✅ Agora initialized successfully');

            return { success: true };
        } catch (error) {
            console.error('❌ Agora initialization failed:', error);
            return { success: false, error: error.message };
        }
    }

    setupEventListeners() {
        // User joined channel
        this.engine.addListener('UserJoined', (uid, elapsed) => {
            console.log('👤 User joined:', uid);
        });

        // User left channel
        this.engine.addListener('UserOffline', (uid, reason) => {
            console.log('👤 User left:', uid, 'Reason:', reason);
        });

        // Local user joined channel
        this.engine.addListener('JoinChannelSuccess', (channel, uid, elapsed) => {
            console.log('✅ Joined channel successfully:', channel, 'UID:', uid);
            this.isJoined = true;
            this.channelName = channel;
            this.uid = uid;
        });

        // Local user left channel
        this.engine.addListener('LeaveChannel', (stats) => {
            console.log('👋 Left channel');
            this.isJoined = false;
            this.channelName = null;
            this.uid = null;
        });

        // Error occurred
        this.engine.addListener('Error', (err, msg) => {
            console.error('❌ Agora error:', err, msg);
        });
    }

    async joinChannel(channelName, uid = 0) {
        try {
            if (!this.isInitialized) {
                throw new Error('Agora not initialized');
            }

            console.log('🚪 Joining channel:', channelName, 'UID:', uid);

            const result = await this.engine.joinChannel(null, channelName, uid, {
                clientRoleType: ClientRole.Broadcaster,
                channelProfile: 0, // Communication profile
            });

            console.log('✅ Join channel result:', result);
            return { success: true };
        } catch (error) {
            console.error('❌ Join channel failed:', error);
            return { success: false, error: error.message };
        }
    }

    async leaveChannel() {
        try {
            if (!this.isInitialized || !this.isJoined) {
                return { success: true };
            }

            console.log('🚪 Leaving channel');
            await this.engine.leaveChannel();

            return { success: true };
        } catch (error) {
            console.error('❌ Leave channel failed:', error);
            return { success: false, error: error.message };
        }
    }

    async enableLocalVideo(enable) {
        try {
            if (!this.isInitialized) {
                throw new Error('Agora not initialized');
            }

            console.log('📹 Setting local video:', enable);
            await this.engine.enableLocalVideo(enable);
            this.localVideoEnabled = enable;

            return { success: true };
        } catch (error) {
            console.error('❌ Enable local video failed:', error);
            return { success: false, error: error.message };
        }
    }

    async enableLocalAudio(enable) {
        try {
            if (!this.isInitialized) {
                throw new Error('Agora not initialized');
            }

            console.log('🎤 Setting local audio:', enable);
            await this.engine.enableLocalAudio(enable);
            this.localAudioEnabled = enable;

            return { success: true };
        } catch (error) {
            console.error('❌ Enable local audio failed:', error);
            return { success: false, error: error.message };
        }
    }

    async switchCamera() {
        try {
            if (!this.isInitialized) {
                throw new Error('Agora not initialized');
            }

            console.log('🔄 Switching camera');
            await this.engine.switchCamera();

            return { success: true };
        } catch (error) {
            console.error('❌ Switch camera failed:', error);
            return { success: false, error: error.message };
        }
    }

    async destroy() {
        try {
            if (this.engine) {
                await this.engine.destroy();
                this.engine = null;
                this.isInitialized = false;
                this.isJoined = false;
                console.log('🗑️ Agora engine destroyed');
            }

            return { success: true };
        } catch (error) {
            console.error('❌ Destroy engine failed:', error);
            return { success: false, error: error.message };
        }
    }

    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isJoined: this.isJoined,
            channelName: this.channelName,
            uid: this.uid,
            localVideoEnabled: this.localVideoEnabled,
            localAudioEnabled: this.localAudioEnabled,
        };
    }
}

export default new AgoraService();