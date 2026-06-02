import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
// import { RTCView } from 'react-native-webrtc'; // Commented: không support trong Expo Go
import Icon from '../../assets/icons';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { hp, wp } from '../../helpers/common';
import RealWebRTCService from '../../services/realWebRTCService';

const { width, height } = Dimensions.get('window');

export default function RealCallScreen() {
    const router = useRouter();
    const { conversationId, otherUserId, callType, isIncoming, callerName, callerAvatar } = useLocalSearchParams();

    const [callDuration, setCallDuration] = useState(0);
    const [isConnected, setIsConnected] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
    const [localStream, setLocalStream] = useState(null);
    const [remoteStream, setRemoteStream] = useState(null);

    const callIntervalRef = useRef(null);
    const webrtcServiceRef = useRef(null);

    useEffect(() => {
        console.log('RealCallScreen opened with params:', {
            conversationId,
            otherUserId,
            callType,
            isIncoming,
            callerName
        });

        initializeCall();

        return () => {
            if (callIntervalRef.current) {
                clearInterval(callIntervalRef.current);
            }
            if (webrtcServiceRef.current) {
                webrtcServiceRef.current.endCall();
            }
        };
    }, []);

    const initializeCall = async () => {
        try {
            // Initialize WebRTC service
            webrtcServiceRef.current = new RealWebRTCService();

            // Set up event listeners
            webrtcServiceRef.current.onLocalStream = (stream) => {
                console.log('Local stream received');
                setLocalStream(stream);
            };

            webrtcServiceRef.current.onRemoteStream = (stream) => {
                console.log('Remote stream received');
                setRemoteStream(stream);
                setIsConnected(true);
            };

            webrtcServiceRef.current.onCallEnded = () => {
                console.log('Call ended');
                handleEndCall();
            };

            // Start call duration timer
            callIntervalRef.current = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);

            if (isIncoming === 'true') {
                // Answer incoming call
                const result = await webrtcServiceRef.current.answerCall(conversationId, otherUserId);
                if (!result.success) {
                    Alert.alert('Lỗi', 'Không thể trả lời cuộc gọi');
                    router.back();
                }
            } else {
                // Start outgoing call
                const result = await webrtcServiceRef.current.startCall(conversationId, otherUserId, callType);
                if (!result.success) {
                    Alert.alert('Lỗi', 'Không thể bắt đầu cuộc gọi');
                    router.back();
                }
            }
        } catch (error) {
            console.error('Error initializing call:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi khởi tạo cuộc gọi');
            router.back();
        }
    };

    const formatDuration = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    };

    const handleToggleMute = () => {
        if (webrtcServiceRef.current) {
            const newMuteState = !isMuted;
            webrtcServiceRef.current.toggleMute(newMuteState);
            setIsMuted(newMuteState);
        }
    };

    const handleToggleVideo = () => {
        if (webrtcServiceRef.current) {
            const newVideoState = !isVideoEnabled;
            webrtcServiceRef.current.toggleVideo(newVideoState);
            setIsVideoEnabled(newVideoState);
        }
    };

    const handleEndCall = () => {
        Alert.alert(
            'Kết thúc cuộc gọi',
            'Bạn có chắc chắn muốn kết thúc cuộc gọi này?',
            [
                {
                    text: 'Hủy',
                    style: 'cancel'
                },
                {
                    text: 'Kết thúc',
                    onPress: () => {
                        console.log('Ending call...');
                        if (webrtcServiceRef.current) {
                            webrtcServiceRef.current.endCall();
                        }
                        router.back();
                    }
                }
            ]
        );
    };

    return (
        <ScreenWrapper>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Icon name="arrowLeft" size={hp(2.5)} color={theme.colors.white} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
                    </Text>
                    <View style={styles.placeholder} />
                </View>

                {/* Video Container */}
                <View style={styles.videoContainer}>
                    {/* Remote Video - Commented: RTCView không support trong Expo Go */}
                    {remoteStream && (
                        <View style={styles.remoteVideo}>
                            <Text style={{ color: 'white' }}>Video không khả dụng trong Expo Go</Text>
                        </View>
                    )}

                    {/* Local Video - Commented: RTCView không support trong Expo Go */}
                    {localStream && isVideoEnabled && (
                        <View style={styles.localVideo}>
                            <Text style={{ color: 'white', fontSize: 10 }}>Local Video</Text>
                        </View>
                    )}

                    {/* Call Info Overlay */}
                    <View style={styles.callInfoOverlay}>
                        <Text style={styles.callerName}>{callerName || 'Người gọi'}</Text>
                        <Text style={styles.callStatus}>
                            {isConnected ? formatDuration(callDuration) : 'Đang kết nối...'}
                        </Text>
                    </View>
                </View>

                {/* Call Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity
                        style={[styles.controlButton, isMuted ? styles.mutedButton : styles.muteButton]}
                        onPress={handleToggleMute}
                    >
                        <Icon name="call" size={hp(2.5)} color={theme.colors.white} />
                    </TouchableOpacity>

                    {callType === 'video' && (
                        <TouchableOpacity
                            style={[styles.controlButton, !isVideoEnabled ? styles.disabledButton : styles.videoButton]}
                            onPress={handleToggleVideo}
                        >
                            <Icon name="video" size={hp(2.5)} color={theme.colors.white} />
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={[styles.controlButton, styles.endCallButton]}
                        onPress={handleEndCall}
                    >
                        <Icon name="close" size={hp(2.5)} color={theme.colors.white} />
                    </TouchableOpacity>
                </View>
            </View>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        backgroundColor: theme.colors.darkBackground,
    },
    backButton: {
        padding: wp(1),
    },
    headerTitle: {
        fontSize: hp(2.2),
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    placeholder: {
        width: hp(3),
    },
    videoContainer: {
        flex: 1,
        position: 'relative',
        backgroundColor: theme.colors.darkBackground,
    },
    remoteVideo: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    localVideo: {
        position: 'absolute',
        top: hp(2),
        right: wp(4),
        width: wp(25),
        height: hp(15),
        borderRadius: wp(2),
        borderWidth: 2,
        borderColor: theme.colors.white,
    },
    callInfoOverlay: {
        position: 'absolute',
        top: hp(4),
        left: wp(4),
        right: wp(4),
        alignItems: 'center',
    },
    callerName: {
        fontSize: hp(2.5),
        fontWeight: 'bold',
        color: theme.colors.white,
        marginBottom: hp(1),
    },
    callStatus: {
        fontSize: hp(2),
        color: theme.colors.white,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: hp(3),
        paddingHorizontal: wp(4),
        backgroundColor: theme.colors.darkBackground,
    },
    controlButton: {
        width: hp(6),
        height: hp(6),
        borderRadius: hp(3),
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: wp(2),
    },
    muteButton: {
        backgroundColor: theme.colors.gray,
    },
    mutedButton: {
        backgroundColor: theme.colors.red,
    },
    videoButton: {
        backgroundColor: theme.colors.primary,
    },
    disabledButton: {
        backgroundColor: theme.colors.gray,
        opacity: 0.5,
    },
    endCallButton: {
        backgroundColor: theme.colors.red,
    },
});
