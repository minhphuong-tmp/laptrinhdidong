import { Video } from 'expo-av';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
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

    const [callStatus, setCallStatus] = useState(isIncoming ? 'ringing' : 'connecting');
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

    // Initialize call
    useEffect(() => {
        initializeCall();

        return () => {
            // Cleanup on unmount
            if (callStatus === 'connected') {
                endCall();
            }
        };
    }, []);

    const initializeCall = async () => {
        try {
            if (isIncoming && callId) {
                // Answer incoming call
                const callResult = await CallManager.answerCall(callId);
                if (!callResult.success) {
                    Alert.alert('Lỗi', 'Không thể trả lời cuộc gọi');
                    return;
                }
            } else if (conversationId) {
                // Call already started from chat.jsx, just get the status
                console.log('Call already started, getting status...');
            }

            // Get local stream
            const callStatus = CallManager.getCallStatus();
            setLocalStream(callStatus.hasLocalStream);
            setIsRecording(callStatus.hasLocalStream && callStatus.localStream?.real);

            setCallStatus('connected');
        } catch (error) {
            console.error('Call initialization error:', error);
            Alert.alert('Lỗi', 'Không thể khởi tạo cuộc gọi');
        }
    };

    const answerCall = async () => {
        setCallStatus('connecting');
        await initializeCall();
    };

    const endCall = async () => {
        try {
            await CallManager.endCall();
            setCallStatus('ended');

            // Navigate back after a short delay
            setTimeout(() => {
                router.back();
            }, 500);
        } catch (error) {
            console.error('End call error:', error);
            router.back();
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

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const renderCallContent = () => {
        if (callType === 'video' && !isVideoMuted) {
            return (
                <View style={styles.videoContainer}>
                    {/* Local video - only show if it's a real video stream */}
                    {localStream && localStream.type === 'video' && localStream.toURL && (
                        <Video
                            style={styles.localVideo}
                            source={{ uri: localStream.toURL() }}
                            useNativeControls={false}
                            resizeMode="cover"
                            shouldPlay={true}
                            isLooping={false}
                        />
                    )}

                    {/* Remote video - only show if it's a real video stream */}
                    {remoteStream && remoteStream.type === 'video' && remoteStream.toURL && (
                        <Video
                            style={styles.remoteVideo}
                            source={{ uri: remoteStream.toURL() }}
                            useNativeControls={false}
                            resizeMode="cover"
                            shouldPlay={true}
                            isLooping={false}
                        />
                    )}
                </View>
            );
        }

        // Voice call or video muted - show avatar
        return (
            <View style={styles.avatarContainer}>
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
            </View>
        );
    };

    return (
        <ScreenWrapper bg="black">
            <View style={styles.container}>
                {/* Call content */}
                {renderCallContent()}

                {/* Call info */}
                <View style={styles.callInfo}>
                    <Text style={styles.callerName}>{callerName}</Text>
                    <Text style={styles.callStatus}>
                        {callStatus === 'ringing' && 'Đang gọi...'}
                        {callStatus === 'connecting' && 'Đang kết nối...'}
                        {callStatus === 'connected' && formatDuration(callDuration)}
                        {callStatus === 'ended' && 'Cuộc gọi kết thúc'}
                    </Text>
                    {isRecording && (
                        <Text style={styles.recordingStatus}>
                            🎤 Đang ghi âm
                        </Text>
                    )}
                </View>

                {/* Call controls */}
                <View style={styles.controls}>
                    {callStatus === 'ringing' && isIncoming && (
                        <>
                            <TouchableOpacity
                                style={[styles.controlButton, styles.declineButton]}
                                onPress={endCall}
                            >
                                <Icon name="call" size={hp(3)} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.controlButton, styles.answerButton]}
                                onPress={answerCall}
                            >
                                <Icon name="call" size={hp(3)} color="white" />
                            </TouchableOpacity>
                        </>
                    )}

                    {callStatus === 'connected' && (
                        <>
                            <TouchableOpacity
                                style={[styles.controlButton, isMuted ? styles.mutedButton : styles.normalButton]}
                                onPress={toggleMute}
                            >
                                <Icon name={isMuted ? "micOff" : "mic"} size={hp(2.5)} color="white" />
                            </TouchableOpacity>

                            {callType === 'video' && (
                                <TouchableOpacity
                                    style={[styles.controlButton, isVideoMuted ? styles.mutedButton : styles.normalButton]}
                                    onPress={toggleVideo}
                                >
                                    <Icon name={isVideoMuted ? "videoOff" : "video"} size={hp(2.5)} color="white" />
                                </TouchableOpacity>
                            )}

                            <TouchableOpacity
                                style={[styles.controlButton, styles.normalButton]}
                                onPress={toggleSpeaker}
                            >
                                <Icon name={isSpeakerOn ? "speaker" : "speakerOff"} size={hp(2.5)} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.controlButton, styles.declineButton]}
                                onPress={endCall}
                            >
                                <Icon name="call" size={hp(2.5)} color="white" />
                            </TouchableOpacity>
                        </>
                    )}
                </View>
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
    },
    localVideo: {
        position: 'absolute',
        top: hp(2),
        right: wp(4),
        width: wp(25),
        height: hp(15),
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
    },
    remoteVideo: {
        flex: 1,
        width: '100%',
        height: '100%',
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
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingBottom: hp(4),
        gap: wp(6),
    },
    controlButton: {
        width: hp(6),
        height: hp(6),
        borderRadius: hp(3),
        justifyContent: 'center',
        alignItems: 'center',
    },
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
