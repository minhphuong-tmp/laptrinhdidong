import React, { useEffect, useRef } from 'react';
import {
    Animated,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';

const CallEndToast = ({
    visible,
    callType = 'voice',
    duration = 0,
    onCallBack,
    onDismiss,
    autoHideDuration = 5000
}) => {
    const slideAnim = useRef(new Animated.Value(-100)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            // Show animation
            Animated.parallel([
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();

            // Auto hide after duration
            const timer = setTimeout(() => {
                hideToast();
            }, autoHideDuration);

            return () => clearTimeout(timer);
        } else {
            hideToast();
        }
    }, [visible]);

    const hideToast = () => {
        Animated.parallel([
            Animated.timing(slideAnim, {
                toValue: -100,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.timing(opacityAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }),
        ]).start(() => {
            if (onDismiss) {
                onDismiss();
            }
        });
    };

    const formatDuration = (seconds) => {
        if (seconds < 60) {
            return `${seconds} giây`;
        } else {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            if (secs === 0) {
                return `${mins} phút`;
            }
            return `${mins} phút ${secs} giây`;
        }
    };

    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    transform: [{ translateY: slideAnim }],
                    opacity: opacityAnim,
                },
            ]}
        >
            <View style={styles.toast}>
                <View style={styles.iconContainer}>
                    <Icon name="call" size={hp(2.5)} color={theme.colors.text} />
                </View>

                <View style={styles.content}>
                    <Text style={styles.callType}>
                        {callType === 'voice' ? 'Cuộc gọi thoại' : 'Cuộc gọi video'}
                    </Text>
                    <Text style={styles.duration}>
                        {formatDuration(duration)}
                    </Text>
                </View>

                <TouchableOpacity
                    style={styles.callBackButton}
                    onPress={() => {
                        if (onCallBack) {
                            onCallBack();
                        }
                        hideToast();
                    }}
                >
                    <Text style={styles.callBackText}>Gọi lại</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: hp(2),
        left: wp(4),
        right: wp(4),
        zIndex: 9999,
    },
    toast: {
        backgroundColor: 'white',
        borderRadius: theme.radius.lg,
        padding: wp(4),
        flexDirection: 'row',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    iconContainer: {
        width: hp(4),
        height: hp(4),
        borderRadius: hp(2),
        backgroundColor: theme.colors.gray + '20',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: wp(3),
    },
    content: {
        flex: 1,
    },
    callType: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
        marginBottom: hp(0.3),
    },
    duration: {
        fontSize: hp(1.5),
        color: theme.colors.gray,
    },
    callBackButton: {
        backgroundColor: theme.colors.gray + '20',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        borderRadius: theme.radius.md,
    },
    callBackText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },
});

export default CallEndToast;


