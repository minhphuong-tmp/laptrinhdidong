import React, { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSpring,
    withTiming
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';
import { hp, wp } from '../helpers/common';

const { width: screenWidth } = Dimensions.get('window');

const positions = [
    { top: 80, left: 34 },
    { top: 161, left: 90 },
    { top: 120, left: 230 },
    { top: 203, left: 165 },
    { top: 100, left: 120 },
    { top: 164, left: 15 },
    { top: 238, left: 61 },
    { top: 180, left: 237 },
    { top: 53, left: 204 },
];

const BotDetection = ({
    cardTitle = 'Bot Detection',
    cardDescription = 'Experience fewer fraudulent sign-ups with our sophisticated, AI-driven bot detection that constantly adapts, ensuring high accuracy and efficient platform protection.',
}) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    // Animation values
    const spotlightOpacity = useSharedValue(0.7);
    const spotlightRotate = useSharedValue(-55);
    const highlightScale = useSharedValue(1);
    const pulseScale = useSharedValue(1);
    const pulseOpacity = useSharedValue(0.7);
    const highlightPosition = useSharedValue({ top: positions[0].top, left: positions[0].left });

    useEffect(() => {
        setCurrentIndex(1);
        const interval = setInterval(() => {
            setCurrentIndex((prev) => {
                const next = (prev + 1) % positions.length;
                // Animate position change
                highlightPosition.value = withSpring(
                    { top: positions[next].top, left: positions[next].left },
                    { stiffness: 300, damping: 70 }
                );
                return next;
            });
        }, 3000);

        return () => clearInterval(interval);
    }, []);

    // Spotlight animation
    useEffect(() => {
        spotlightOpacity.value = withRepeat(
            withTiming(1, {
                duration: 9000,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true // reverse
        );

        // Rotate animation - simplified to smooth continuous rotation
        spotlightRotate.value = withRepeat(
            withTiming(-45, {
                duration: 18000,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true // reverse
        );
    }, []);

    // Pulse animation for highlight dot
    useEffect(() => {
        highlightScale.value = withRepeat(
            withTiming(1.2, {
                duration: 500,
                easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true // reverse
        );

        pulseScale.value = withRepeat(
            withTiming(1.7, {
                duration: 1200,
                easing: Easing.out(Easing.ease),
            }),
            -1,
            false
        );

        pulseOpacity.value = withRepeat(
            withTiming(0, {
                duration: 1200,
                easing: Easing.out(Easing.ease),
            }),
            -1,
            false
        );
    }, []);

    // Update position when currentIndex changes (handled in interval above)

    // Animated styles
    const spotlightStyle = useAnimatedStyle(() => {
        'worklet';
        return {
            opacity: spotlightOpacity.value,
            transform: [{ rotate: `${spotlightRotate.value}deg` }],
        };
    });

    const highlightStyle = useAnimatedStyle(() => {
        'worklet';
        return {
            top: highlightPosition.value.top,
            left: highlightPosition.value.left,
        };
    });

    const highlightDotStyle = useAnimatedStyle(() => {
        'worklet';
        return {
            transform: [{ scale: highlightScale.value }],
        };
    });

    const pulseStyle = useAnimatedStyle(() => {
        'worklet';
        return {
            transform: [{ scale: pulseScale.value }],
            opacity: pulseOpacity.value,
        };
    });

    return (
        <View style={styles.container}>
            <View style={styles.contentWrapper}>
                <View style={styles.sceneContainer}>
                    {/* Spotlight effect */}
                    <Animated.View
                        style={[
                            styles.spotlight,
                            spotlightStyle,
                        ]}
                    />

                    {/* Container mask circles */}
                    <ContainerMask />

                    {/* Static dots */}
                    <Svg
                        width={screenWidth}
                        height={hp(80)}
                        style={styles.svgOverlay}
                    >
                        {positions.map((pos, i) => (
                            <Rect
                                key={i}
                                x={pos.left}
                                y={pos.top}
                                width={5}
                                height={5}
                                rx={1}
                                ry={1}
                                fill="#404040"
                            />
                        ))}
                    </Svg>

                    {/* Highlight dot with animation */}
                    <Animated.View style={[styles.highlightDot, highlightStyle]}>
                        <Animated.View style={[styles.highlightDotInner, highlightDotStyle]} />
                        <Animated.View style={[styles.pulseRing, pulseStyle]} />
                        <Animated.View style={[styles.pulseRing2, pulseStyle]} />
                    </Animated.View>

                    {/* Bottom circle */}
                    <View style={styles.bottomCircle} />
                </View>
            </View>

            {/* Card info */}
            <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{cardTitle}</Text>
                <Text style={styles.cardDescription}>{cardDescription}</Text>
            </View>
        </View>
    );
};

const ContainerMask = () => {
    return (
        <>
            <View style={[styles.maskCircle, styles.maskCircle1]} />
            <View style={[styles.maskCircle, styles.maskCircle2]} />
            <View style={[styles.maskCircle, styles.maskCircle3]} />
            <View style={[styles.maskCircle, styles.maskCircle4]} />
        </>
    );
};

export default BotDetection;

const styles = StyleSheet.create({
    container: {
        position: 'relative',
        overflow: 'hidden',
        height: hp(48),
        width: '100%',
        maxWidth: wp(87.5), // ~350px
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#262626', // neutral-800
        backgroundColor: '#000000',
    },
    contentWrapper: {
        position: 'absolute',
        left: '50%',
        height: '100%',
        minWidth: wp(75), // ~300px
        maxWidth: wp(75),
        transform: [{ translateX: -wp(37.5) }], // -50% of width
    },
    sceneContainer: {
        position: 'relative',
        height: '80%',
        width: '100%',
    },
    spotlight: {
        position: 'absolute',
        bottom: 20,
        left: wp(37), // ~148px
        width: wp(62.5), // ~250px
        height: hp(31.25), // ~250px
        backgroundColor: 'transparent',
        borderRadius: wp(62.5),
        // Radial gradient effect using shadow
        shadowColor: 'rgba(255, 255, 255, 0.3)',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 60,
    },
    svgOverlay: {
        position: 'absolute',
        left: 0,
        top: 0,
        pointerEvents: 'none',
    },
    highlightDot: {
        position: 'absolute',
        width: 6.5,
        height: 6.5,
        borderRadius: 1,
        borderTopWidth: 1,
        borderTopColor: '#f87171', // red-400
        backgroundColor: '#ef4444', // red-500
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 10,
        elevation: 10,
    },
    highlightDotInner: {
        position: 'absolute',
        width: '300%',
        height: '300%',
        borderRadius: wp(1.5),
        borderWidth: 1,
        borderColor: '#ef4444',
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 8,
    },
    pulseRing: {
        position: 'absolute',
        width: '270%',
        height: '300%',
        borderRadius: wp(50),
        borderWidth: 1,
        borderColor: '#ef4444',
    },
    pulseRing2: {
        position: 'absolute',
        width: '270%',
        height: '300%',
        borderRadius: wp(50),
        borderWidth: 1,
        borderColor: '#ef4444',
        shadowColor: '#ef4444',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
    },
    bottomCircle: {
        position: 'absolute',
        bottom: 8,
        left: '50%',
        width: wp(28), // ~112px (h-28 w-28)
        height: wp(28),
        borderRadius: wp(14),
        borderWidth: 1,
        borderColor: '#262626',
        backgroundColor: '#000000',
        transform: [{ translateX: -wp(14) }],
    },
    maskCircle: {
        position: 'absolute',
        left: '50%',
        height: '100%',
        borderTopWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(115, 115, 115, 0.8)', // neutral-700/80
    },
    maskCircle1: {
        top: 48,
        width: '130%',
        transform: [{ translateX: -wp(32.5) }],
    },
    maskCircle2: {
        top: 100,
        width: '110%',
        transform: [{ translateX: -wp(27.5) }],
    },
    maskCircle3: {
        top: 152,
        width: '100%',
        transform: [{ translateX: -wp(25) }],
    },
    maskCircle4: {
        top: 204,
        width: '80%',
        transform: [{ translateX: -wp(20) }],
    },
    cardInfo: {
        position: 'absolute',
        bottom: 20,
        left: 0,
        width: '100%',
        paddingHorizontal: wp(3.75), // ~15px (px-3)
    },
    cardTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#f5f5f5', // neutral-100
    },
    cardDescription: {
        marginTop: 8,
        fontSize: 12,
        color: '#a3a3a3', // neutral-400
    },
});

