import { MotiView } from 'moti';
import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../constants/theme';

const AnimatedCard = ({
    children,
    style,
    onPress,
    index = 0,
    enableTilt = true,
    enableScrollAnimation = true,
    delay = 0,
    ...props
}) => {
    const [pressed, setPressed] = useState(false);

    const pressIn = () => {
        setPressed(true);
    };

    const pressOut = () => {
        setPressed(false);
    };

    const content = (
        <MotiView
            from={{
                opacity: enableScrollAnimation ? 0 : 1,
                translateY: enableScrollAnimation ? 30 : 0,
                scale: 1,
            }}
            animate={{
                opacity: 1,
                translateY: 0,
                scale: pressed ? 0.98 : 1,
            }}
            transition={{
                type: 'spring',
                delay: index * 50 + delay,
                damping: 15,
                stiffness: 150,
            }}
            style={[styles.card, style]}
        >
            {children}
        </MotiView>
    );

    if (onPress) {
        return (
            <TouchableOpacity
                onPress={onPress}
                onPressIn={pressIn}
                onPressOut={pressOut}
                activeOpacity={0.95}
                {...props}
            >
                {content}
            </TouchableOpacity>
        );
    }

    return content;
};

export default AnimatedCard;

const styles = StyleSheet.create({
    card: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
    },
});

