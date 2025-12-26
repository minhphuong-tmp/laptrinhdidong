import { MotiView } from 'moti';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { theme } from '../constants/theme';
import { hp } from '../helpers/common';
import { springConfig } from '../utils/animations';
import Loading from './Loading';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const AnimatedButton = ({
    buttonStyle,
    textStyle,
    onPress = () => { },
    title = '',
    loading = false,
    hasShadow = false,
    disabled = false,
    variant = 'primary', // 'primary' | 'secondary' | 'ghost'
}) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    const animatedButtonStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
            opacity: opacity.value,
        };
    });

    const handlePressIn = () => {
        if (!disabled && !loading) {
            scale.value = withSpring(0.95, springConfig.gentle);
            opacity.value = withTiming(0.8, { duration: 100 });
        }
    };

    const handlePressOut = () => {
        if (!disabled && !loading) {
            scale.value = withSpring(1, springConfig.gentle);
            opacity.value = withTiming(1, { duration: 100 });
        }
    };

    const shadowStyle = {
        shadowColor: theme.colors.dark,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4
    };

    const getVariantStyles = () => {
        switch (variant) {
            case 'secondary':
                return {
                    backgroundColor: theme.colors.backgroundSecondary,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                };
            case 'ghost':
                return {
                    backgroundColor: 'transparent',
                };
            default:
                return {
                    backgroundColor: theme.colors.primary,
                };
        }
    };

    const getTextColor = () => {
        switch (variant) {
            case 'secondary':
            case 'ghost':
                return theme.colors.text;
            default:
                return 'white';
        }
    };

    if (loading) {
        return (
            <MotiView
                from={{ opacity: 0.8 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'timing', duration: 500, loop: true }}
                style={[styles.button, buttonStyle, { backgroundColor: 'white' }]}
            >
                <Loading />
            </MotiView>
        );
    }

    return (
        <AnimatedPressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            disabled={disabled || loading}
            style={[
                styles.button,
                getVariantStyles(),
                buttonStyle,
                hasShadow && shadowStyle,
                animatedButtonStyle,
                disabled && styles.disabled,
            ]}
        >
            <Text style={[styles.text, { color: getTextColor() }, textStyle]}>
                {title}
            </Text>
        </AnimatedPressable>
    );
};

export default AnimatedButton;

const styles = StyleSheet.create({
    button: {
        height: hp(6.6),
        justifyContent: 'center',
        alignItems: 'center',
        borderCurve: 'continuous',
        borderRadius: theme.radius.xl,
    },
    text: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
    },
    disabled: {
        opacity: 0.5,
    },
});



