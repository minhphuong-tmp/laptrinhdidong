import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const CallWeb = () => {
    const { callType, conversationId, callerName, callerAvatar } = useLocalSearchParams();
    const [webViewKey, setWebViewKey] = useState(0);

    // HTML content for Agora Web SDK
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agora Call</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            color: white;
            font-family: Arial, sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background: #1a1a1a;
            padding: 20px;
            text-align: center;
            border-bottom: 1px solid #333;
        }
        
        .caller-info {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
        }
        
        .avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: #4a90e2;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: bold;
        }
        
        .caller-name {
            font-size: 18px;
            font-weight: bold;
        }
        
        .call-type {
            font-size: 14px;
            color: #888;
            margin-top: 5px;
        }
        
        .video-container {
            flex: 1;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        #local-video {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 120px;
            height: 160px;
            border-radius: 10px;
            border: 2px solid #4a90e2;
            background: #333;
        }
        
        #remote-video {
            width: 100%;
            height: 100%;
            background: #222;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .controls {
            background: #1a1a1a;
            padding: 20px;
            display: flex;
            justify-content: center;
            gap: 20px;
            border-top: 1px solid #333;
        }
        
        .control-btn {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            border: none;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            cursor: pointer;
            transition: all 0.3s;
        }
        
        .mute-btn {
            background: #666;
        }
        
        .mute-btn.active {
            background: #e74c3c;
        }
        
        .video-btn {
            background: #666;
        }
        
        .video-btn.active {
            background: #e74c3c;
        }
        
        .hangup-btn {
            background: #e74c3c;
        }
        
        .status {
            text-align: center;
            padding: 10px;
            background: #2a2a2a;
            border-top: 1px solid #333;
        }
        
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            flex-direction: column;
            gap: 20px;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #333;
            border-top: 4px solid #4a90e2;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="caller-info">
            <div class="avatar">${callerName ? callerName.charAt(0).toUpperCase() : 'U'}</div>
            <div>
                <div class="caller-name">${callerName || 'Unknown'}</div>
                <div class="caller-type">${callType === 'video' ? 'Video Call' : 'Voice Call'}</div>
            </div>
        </div>
    </div>
    
    <div class="video-container">
        <div id="remote-video">
            <div class="loading">
                <div class="spinner"></div>
                <div>Connecting...</div>
            </div>
        </div>
        <div id="local-video"></div>
    </div>
    
    <div class="controls">
        <button class="control-btn mute-btn" id="mute-btn" onclick="toggleMute()">
            🎤
        </button>
        <button class="control-btn video-btn" id="video-btn" onclick="toggleVideo()">
            📹
        </button>
        <button class="control-btn hangup-btn" onclick="hangup()">
            📞
        </button>
    </div>
    
    <div class="status" id="status">
        Connecting to call...
    </div>

    <script src="https://download.agora.io/sdk/release/AgoraRTC_N-4.20.0.js"></script>
    <script>
        const APP_ID = 'dfb34240d26445a7bb9c18c9b4d682f4';
        const CHANNEL_NAME = 'call_${conversationId}';
        
        let client;
        let localTracks = {
            audioTrack: null,
            videoTrack: null
        };
        let isMuted = false;
        let isVideoEnabled = true;
        
        async function initAgora() {
            try {
                // Create Agora client
                client = AgoraRTC.createClient({
                    mode: 'rtc',
                    codec: 'vp8'
                });
                
                // Set up event listeners
                client.on('user-published', async (user, mediaType) => {
                    console.log('User published:', user.uid, mediaType);
                    await client.subscribe(user, mediaType);
                    
                    if (mediaType === 'video') {
                        const remoteVideoContainer = document.getElementById('remote-video');
                        remoteVideoContainer.innerHTML = '';
                        user.videoTrack.play(remoteVideoContainer);
                    }
                    
                    if (mediaType === 'audio') {
                        user.audioTrack.play();
                    }
                });
                
                client.on('user-unpublished', (user, mediaType) => {
                    console.log('User unpublished:', user.uid, mediaType);
                });
                
                client.on('user-left', (user) => {
                    console.log('User left:', user.uid);
                    const remoteVideoContainer = document.getElementById('remote-video');
                    remoteVideoContainer.innerHTML = '<div class="loading"><div class="spinner"></div><div>Waiting for user...</div></div>';
                });
                
                // Join channel
                await joinChannel();
                
            } catch (error) {
                console.error('Agora initialization failed:', error);
                document.getElementById('status').textContent = 'Failed to initialize call';
            }
        }
        
        async function joinChannel() {
            try {
                // Create local tracks
                localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
                localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
                
                // Join channel
                await client.join(APP_ID, CHANNEL_NAME, null, null);
                
                // Publish local tracks
                await client.publish([localTracks.audioTrack, localTracks.videoTrack]);
                
                // Display local video
                const localVideoContainer = document.getElementById('local-video');
                localTracks.videoTrack.play(localVideoContainer);
                
                document.getElementById('status').textContent = 'Connected to call';
                
            } catch (error) {
                console.error('Join channel failed:', error);
                document.getElementById('status').textContent = 'Failed to join call';
            }
        }
        
        function toggleMute() {
            if (localTracks.audioTrack) {
                isMuted = !isMuted;
                localTracks.audioTrack.setEnabled(!isMuted);
                
                const muteBtn = document.getElementById('mute-btn');
                muteBtn.classList.toggle('active', isMuted);
                muteBtn.textContent = isMuted ? '🔇' : '🎤';
                
                document.getElementById('status').textContent = isMuted ? 'Microphone muted' : 'Microphone unmuted';
            }
        }
        
        function toggleVideo() {
            if (localTracks.videoTrack) {
                isVideoEnabled = !isVideoEnabled;
                localTracks.videoTrack.setEnabled(isVideoEnabled);
                
                const videoBtn = document.getElementById('video-btn');
                videoBtn.classList.toggle('active', !isVideoEnabled);
                videoBtn.textContent = isVideoEnabled ? '📹' : '📷';
                
                document.getElementById('status').textContent = isVideoEnabled ? 'Video enabled' : 'Video disabled';
            }
        }
        
        async function hangup() {
            try {
                // Stop local tracks
                if (localTracks.audioTrack) {
                    localTracks.audioTrack.stop();
                    localTracks.audioTrack.close();
                }
                
                if (localTracks.videoTrack) {
                    localTracks.videoTrack.stop();
                    localTracks.videoTrack.close();
                }
                
                // Leave channel
                await client.leave();
                
                // Close window
                window.close();
                
            } catch (error) {
                console.error('Hangup failed:', error);
            }
        }
        
        // Initialize when page loads
        window.addEventListener('load', initAgora);
    </script>
</body>
</html>
    `;

    return (
        <View style={styles.container}>
            <WebView
                key={webViewKey}
                source={{ html: htmlContent }}
                style={styles.webview}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                onError={(error) => {
                    console.error('WebView error:', error);
                    Alert.alert('Lỗi', 'Không thể tải trang gọi điện');
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    webview: {
        flex: 1,
    },
});

export default CallWeb;


