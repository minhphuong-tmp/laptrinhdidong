import { MotiView } from 'moti';
import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

const AnimatedText = Animated.createAnimatedComponent(Text);

const GlitchText = ({
    children,
    style,
    trigger = false,
    intensity = 2,
    duration = 100,
    ...props
}) => {
    const offsetX1 = useSharedValue(0);
    const offsetX2 = useSharedValue(0);
    const offsetY = useSharedValue(0);
    const opacity = useSharedValue(1);

    useEffect(() => {
        if (trigger) {
            // Glitch effect sequence
            const glitch = () => {
                // Random displacements
                const randomX1 = (Math.random() - 0.5) * intensity * 4;
                const randomX2 = (Math.random() - 0.5) * intensity * 4;
                const randomY = (Math.random() - 0.5) * intensity * 2;

                offsetX1.value = withSequence(
                    withTiming(randomX1, { duration: duration / 2 }),
                    withTiming(0, { duration: duration / 2 })
                );
                offsetX2.value = withSequence(
                    withTiming(randomX2, { duration: duration / 2 }),
                    withTiming(0, { duration: duration / 2 })
                );
                offsetY.value = withSequence(
                    withTiming(randomY, { duration: duration / 2 }),
                    withTiming(0, { duration: duration / 2 })
                );
                opacity.value = withSequence(
                    withTiming(0.7, { duration: duration / 4 }),
                    withTiming(1, { duration: duration / 4 })
                );
            };

            glitch();
        }
    }, [trigger]);

    const animatedStyle1 = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: offsetX1.value }, { translateY: offsetY.value }],
            opacity: opacity.value,
        };
    });

    const animatedStyle2 = useAnimatedStyle(() => {
        return {
            transform: [{ translateX: offsetX2.value }, { translateY: -offsetY.value }],
            opacity: opacity.value * 0.8,
        };
    });

    return (
        <MotiView style={styles.container}>
            {/* Base text */}
            <Text style={[style, styles.baseText]} {...props}>
                {children}
            </Text>

            {/* Glitch layer 1 (red tint) */}
            <AnimatedText
                style={[
                    style,
                    styles.glitchLayer,
                    { color: '#ff0000', opacity: 0.5 },
                    animatedStyle1,
                ]}
                {...props}
            >
                {children}
            </AnimatedText>

            {/* Glitch layer 2 (cyan tint) */}
            <AnimatedText
                style={[
                    style,
                    styles.glitchLayer,
                    { color: '#00ffff', opacity: 0.5 },
                    animatedStyle2,
                ]}
                {...props}
            >
                {children}
            </AnimatedText>
        </MotiView>
    );
};

export default GlitchText;

const styles = StyleSheet.create({
    container: {
        position: 'relative',
    },
    baseText: {
        zIndex: 3,
    },
    glitchLayer: {
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1,
    },
});



