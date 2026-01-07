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

const Toast = ({
    visible,
    message,
    type = 'info', // 'success', 'error', 'warning', 'info'
    duration = 3000,
    onDismiss
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
            }, duration);

            return () => clearTimeout(timer);
        } else {
            hideToast();
        }
    }, [visible, duration]);

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

    const getIconName = () => {
        switch (type) {
            case 'success': return 'check';
            case 'error': return 'bell';
            case 'warning': return 'alarm';
            default: return 'bell';
        }
    };

    const getIconColor = () => {
        switch (type) {
            case 'success': return '#4CAF50';
            case 'error': return '#F44336';
            case 'warning': return '#FF9800';
            default: return theme.colors.primary;
        }
    };

    const getBackgroundColor = () => {
        switch (type) {
            case 'success': return '#E8F5E9';
            case 'error': return '#FFEBEE';
            case 'warning': return '#FFF3E0';
            default: return theme.colors.backgroundSecondary;
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
            <View style={[styles.toast, { backgroundColor: getBackgroundColor() }]}>
                <View style={[styles.iconContainer, { backgroundColor: getIconColor() + '20' }]}>
                    <Icon name={getIconName()} size={hp(2.5)} color={getIconColor()} />
                </View>

                <View style={styles.content}>
                    <Text style={styles.message}>{message}</Text>
                </View>

                <TouchableOpacity
                    style={styles.closeButton}
                    onPress={hideToast}
                >
                    <Icon name="close" size={hp(1.8)} color={theme.colors.textSecondary} />
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
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: wp(3),
    },
    content: {
        flex: 1,
    },
    message: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        lineHeight: hp(2.2),
    },
    closeButton: {
        padding: wp(1),
        marginLeft: wp(2),
    },
});

export default Toast;

