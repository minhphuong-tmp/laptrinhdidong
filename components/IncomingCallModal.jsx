import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Modal,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';
import Avatar from './Avatar';

const { width, height } = Dimensions.get('window');

const IncomingCallModal = ({
    visible,
    callData,
    onAnswer,
    onDecline
}) => {
    const [callDuration, setCallDuration] = useState(0);
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const durationInterval = useRef(null);

    // Pulse animation
    useEffect(() => {
        if (visible) {
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

            // Start call duration timer
            durationInterval.current = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        } else {
            setCallDuration(0);
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
    }, [visible]);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (!visible || !callData) return null;

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType="fade"
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                {/* Background blur effect */}
                <View style={styles.background} />

                {/* Call content */}
                <View style={styles.content}>
                    {/* Caller avatar */}
                    <Animated.View style={[
                        styles.avatarContainer,
                        { transform: [{ scale: pulseAnim }] }
                    ]}>
                        <Avatar
                            uri={callData.caller?.image}
                            size={hp(15)}
                            rounded={theme.radius.full}
                        />
                    </Animated.View>

                    {/* Caller info */}
                    <View style={styles.callerInfo}>
                        <Text style={styles.callerName}>
                            {callData.caller?.name || 'Unknown'}
                        </Text>
                        <Text style={styles.callType}>
                            {callData.call_type === 'video' ? '📹 Video call' : '📞 Voice call'}
                        </Text>
                        {callDuration > 0 && (
                            <Text style={styles.duration}>
                                {formatDuration(callDuration)}
                            </Text>
                        )}
                    </View>

                    {/* Call controls */}
                    <View style={styles.controls}>
                        <TouchableOpacity
                            style={[styles.controlButton, styles.declineButton]}
                            onPress={onDecline}
                        >
                            <Icon name="phone" size={hp(3)} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.controlButton, styles.answerButton]}
                            onPress={onAnswer}
                        >
                            <Icon name="phone" size={hp(3)} color="white" />
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    background: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: wp(8),
    },
    avatarContainer: {
        marginBottom: hp(4),
    },
    callerInfo: {
        alignItems: 'center',
        marginBottom: hp(6),
    },
    callerName: {
        fontSize: hp(3),
        fontWeight: theme.fonts.bold,
        color: 'white',
        marginBottom: hp(1),
    },
    callType: {
        fontSize: hp(2),
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: hp(0.5),
    },
    duration: {
        fontSize: hp(1.8),
        color: 'rgba(255, 255, 255, 0.6)',
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: wp(8),
    },
    controlButton: {
        width: hp(7),
        height: hp(7),
        borderRadius: hp(3.5),
        justifyContent: 'center',
        alignItems: 'center',
    },
    answerButton: {
        backgroundColor: theme.colors.success,
    },
    declineButton: {
        backgroundColor: theme.colors.error,
    },
});

export default IncomingCallModal;

