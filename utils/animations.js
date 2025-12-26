import { Extrapolate, interpolate, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

/**
 * Animation presets và utilities
 */

// Spring configurations
export const springConfig = {
    gentle: {
        damping: 15,
        stiffness: 150,
        mass: 0.5,
    },
    bouncy: {
        damping: 10,
        stiffness: 200,
        mass: 0.8,
    },
    smooth: {
        damping: 20,
        stiffness: 100,
        mass: 0.5,
    },
};

// Timing configurations
export const timingConfig = {
    fast: { duration: 200 },
    normal: { duration: 300 },
    slow: { duration: 500 },
};

/**
 * Hook cho press animations (scale + opacity)
 */
export const usePressAnimation = (scale = 0.95) => {
    const pressed = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => {
        const scaleValue = interpolate(
            pressed.value,
            [0, 1],
            [1, scale],
            Extrapolate.CLAMP
        );

        return {
            transform: [{ scale: scaleValue }],
            opacity: interpolate(
                pressed.value,
                [0, 1],
                [1, 0.8],
                Extrapolate.CLAMP
            ),
        };
    });

    const handlePressIn = () => {
        pressed.value = withSpring(1, springConfig.gentle);
    };

    const handlePressOut = () => {
        pressed.value = withSpring(0, springConfig.gentle);
    };

    return {
        animatedStyle,
        handlePressIn,
        handlePressOut,
    };
};

/**
 * Hook cho hover/tilt effect (gentle rotation)
 */
export const useTiltAnimation = (maxRotation = 3) => {
    const tiltX = useSharedValue(0);
    const tiltY = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                {
                    rotateX: `${tiltY.value * maxRotation}deg`,
                },
                {
                    rotateY: `${tiltX.value * maxRotation}deg`,
                },
            ],
        };
    });

    const handleGesture = (x, y, width, height) => {
        // Normalize coordinates to -1 to 1
        const normalizedX = (x / width) * 2 - 1;
        const normalizedY = (y / height) * 2 - 1;

        tiltX.value = withSpring(normalizedX, springConfig.smooth);
        tiltY.value = withSpring(-normalizedY, springConfig.smooth);
    };

    const resetTilt = () => {
        tiltX.value = withSpring(0, springConfig.smooth);
        tiltY.value = withSpring(0, springConfig.smooth);
    };

    return {
        animatedStyle,
        handleGesture,
        resetTilt,
    };
};

/**
 * Hook cho fade-in + slide-up animation (scroll-based)
 */
export const useScrollAnimation = (index = 0, delay = 0) => {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(30);

    const startAnimation = () => {
        opacity.value = withTiming(1, { duration: 400 + delay });
        translateY.value = withSpring(0, {
            ...springConfig.smooth,
            delay: delay,
        });
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            opacity: opacity.value,
            transform: [{ translateY: translateY.value }],
        };
    });

    return {
        animatedStyle,
        startAnimation,
    };
};

/**
 * Hook cho glitch effect
 */
export const useGlitchAnimation = () => {
    const glitchX = useSharedValue(0);
    const glitchY = useSharedValue(0);
    const glitchOpacity = useSharedValue(1);

    const triggerGlitch = () => {
        // Random glitch displacement
        const randomX = (Math.random() - 0.5) * 4;
        const randomY = (Math.random() - 0.5) * 4;

        glitchX.value = withTiming(randomX, { duration: 50 });
        glitchY.value = withTiming(randomY, { duration: 50 });
        glitchOpacity.value = withTiming(0.8, { duration: 50 });

        // Reset
        setTimeout(() => {
            glitchX.value = withSpring(0, springConfig.gentle);
            glitchY.value = withSpring(0, springConfig.gentle);
            glitchOpacity.value = withTiming(1, { duration: 100 });
        }, 100);
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: glitchX.value },
                { translateY: glitchY.value },
            ],
            opacity: glitchOpacity.value,
        };
    });

    return {
        animatedStyle,
        triggerGlitch,
    };
};

/**
 * Hook cho pulse animation
 */
export const usePulseAnimation = (minScale = 0.95, maxScale = 1.05) => {
    const scale = useSharedValue(1);

    const startPulse = () => {
        scale.value = withTiming(maxScale, { duration: 500 }, () => {
            scale.value = withTiming(minScale, { duration: 500 }, () => {
                scale.value = withTiming(1, { duration: 500 });
            });
        });
    };

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [{ scale: scale.value }],
        };
    });

    return {
        animatedStyle,
        startPulse,
    };
};



