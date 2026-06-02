import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    Alert,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    Linking
} from 'react-native';
import Icon from '../../assets/icons';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { hp, wp } from '../../helpers/common';

export default function WebCallScreen() {
    const router = useRouter();
    const {
        conversationId,
        otherUserId,
        callType,
        isIncoming = false,
        callerName = 'Người gọi',
        callerAvatar
    } = useLocalSearchParams();

    const [isConnected, setIsConnected] = useState(false);
    const [callDuration, setCallDuration] = useState(0);

    useEffect(() => {
        console.log('🌐 WebCallScreen opened with params:', {
            conversationId,
            otherUserId,
            callType,
            isIncoming,
            callerName
        });

        // Simulate call connection
        const timer = setTimeout(() => {
            setIsConnected(true);
            console.log('🌐 Web call connected');
        }, 2000);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isConnected) {
            const interval = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);

            return () => clearInterval(interval);
        }
    }, [isConnected]);

    const handleEndCall = () => {
        Alert.alert(
            'Kết thúc cuộc gọi',
            'Bạn có chắc chắn muốn kết thúc cuộc gọi?',
            [
                {
                    text: 'Hủy',
                    style: 'cancel'
                },
                {
                    text: 'Kết thúc',
                    style: 'destructive',
                    onPress: () => {
                        console.log('🌐 Web call ended');
                        router.back();
                    }
                }
            ]
        );
    };

    const handleToggleMute = () => {
        console.log('🌐 Toggle mute');
        // TODO: Implement mute functionality
    };

    const handleToggleVideo = () => {
        console.log('🌐 Toggle video');
        // TODO: Implement video toggle functionality
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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

                {/* Call Info */}
                <View style={styles.callInfo}>
                    <Text style={styles.callerName}>{callerName}</Text>
                    <Text style={styles.callStatus}>
                        {isConnected ? formatDuration(callDuration) : 'Đang kết nối...'}
                    </Text>
                </View>

                {/* Call Info Display */}
                <View style={styles.callInfoContainer}>
                    <View style={styles.avatarContainer}>
                        <Icon name="user" size={hp(8)} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.callerName}>{callerName || 'Người gọi'}</Text>
                    <Text style={styles.callStatus}>
                        {callType === 'video' ? 'Cuộc gọi video' : 'Cuộc gọi thoại'}
                    </Text>
                    <Text style={styles.callDuration}>{formatDuration(callDuration)}</Text>
                    
                    <TouchableOpacity 
                        style={styles.openCallButton}
                        onPress={() => Linking.openURL('https://meet.google.com/')}
                    >
                        <Text style={styles.openCallButtonText}>Mở Google Meet</Text>
                    </TouchableOpacity>
                </View>

                {/* Call Controls */}
                <View style={styles.controls}>
                    <TouchableOpacity
                        style={[styles.controlButton, styles.muteButton]}
                        onPress={handleToggleMute}
                    >
                        <Icon name="call" size={hp(2.5)} color={theme.colors.white} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.controlButton, styles.videoButton]}
                        onPress={handleToggleVideo}
                    >
                        <Icon name="video" size={hp(2.5)} color={theme.colors.white} />
                    </TouchableOpacity>

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
        backgroundColor: theme.colors.primary,
    },
    backButton: {
        padding: wp(2),
    },
    headerTitle: {
        fontSize: hp(2),
        fontWeight: 'bold',
        color: theme.colors.white,
    },
    placeholder: {
        width: wp(10),
    },
    callInfo: {
        alignItems: 'center',
        paddingVertical: hp(3),
        backgroundColor: theme.colors.surface,
    },
    callerName: {
        fontSize: hp(2.5),
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: hp(0.5),
    },
    callStatus: {
        fontSize: hp(1.8),
        color: theme.colors.textSecondary,
    },
    callInfoContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: wp(4),
    },
    avatarContainer: {
        width: hp(12),
        height: hp(12),
        borderRadius: hp(6),
        backgroundColor: theme.colors.lightGray,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: hp(2),
    },
    callerName: {
        fontSize: hp(2.5),
        fontWeight: 'bold',
        color: theme.colors.text,
        marginBottom: hp(1),
    },
    callDuration: {
        fontSize: hp(2),
        color: theme.colors.textLight,
        marginBottom: hp(3),
    },
    openCallButton: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(6),
        paddingVertical: hp(1.5),
        borderRadius: wp(2),
        marginTop: hp(2),
    },
    openCallButtonText: {
        color: theme.colors.white,
        fontSize: hp(2),
        fontWeight: 'bold',
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: hp(3),
        paddingHorizontal: wp(4),
        backgroundColor: theme.colors.surface,
        gap: wp(8),
    },
    controlButton: {
        width: wp(12),
        height: wp(12),
        borderRadius: wp(6),
        justifyContent: 'center',
        alignItems: 'center',
    },
    muteButton: {
        backgroundColor: theme.colors.textSecondary,
    },
    videoButton: {
        backgroundColor: theme.colors.textSecondary,
    },
    endCallButton: {
        backgroundColor: theme.colors.error,
    },
});
