import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/theme';
import { hp } from '../helpers/common';
import Avatar from './Avatar';

const GroupAvatar = ({ members = [], size = hp(4) }) => {
    // Lấy tất cả thành viên (không giới hạn số lượng)
    const displayMembers = members;

    // Tính toán kích thước avatar con dựa trên số lượng thành viên
    const memberCount = displayMembers.length;

    if (memberCount === 0) {
        return (
            <View style={[styles.container, { width: size, height: size }]}>
                <Avatar
                    uri={null}
                    size={size}
                    rounded={theme.radius.lg}
                />
            </View>
        );
    }

    if (memberCount === 1) {
        return (
            <Avatar
                uri={displayMembers[0]?.user?.image}
                size={size}
                rounded={theme.radius.lg}
            />
        );
    }

    // Tính toán layout cho nhiều thành viên
    const getAvatarSize = () => {
        if (memberCount <= 4) return size * 0.45;
        if (memberCount <= 9) return size * 0.3;
        return size * 0.25;
    };

    const avatarSize = getAvatarSize();
    const spacing = size * 0.05;

    // Tính toán số hàng và cột
    const getGridLayout = () => {
        if (memberCount <= 4) {
            return { rows: 2, cols: 2 };
        } else if (memberCount <= 9) {
            return { rows: 3, cols: 3 };
        } else {
            return { rows: 4, cols: 4 };
        }
    };

    const { rows, cols } = getGridLayout();
    const maxDisplay = rows * cols;
    const membersToShow = displayMembers.slice(0, maxDisplay);

    const getPosition = (index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;

        const x = spacing + col * (avatarSize + spacing);
        const y = spacing + row * (avatarSize + spacing);

        return {
            position: 'absolute',
            left: x,
            top: y,
        };
    };

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {membersToShow.map((member, index) => (
                <View
                    key={member.user_id || index}
                    style={[
                        styles.avatarContainer,
                        getPosition(index),
                        { width: avatarSize, height: avatarSize }
                    ]}
                >
                    <Avatar
                        uri={member.user?.image}
                        size={avatarSize}
                        rounded={theme.radius.sm}
                    />
                </View>
            ))}

            {/* Hiển thị số lượng thành viên còn lại nếu có */}
            {memberCount > maxDisplay && (
                <View
                    style={[
                        styles.overlay,
                        {
                            width: size,
                            height: size,
                            borderRadius: theme.radius.lg,
                        }
                    ]}
                >
                    <View style={styles.countContainer}>
                        <Text style={[styles.countText, { fontSize: size * 0.15 }]}>
                            +{memberCount - maxDisplay}
                        </Text>
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: theme.colors.gray,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        position: 'relative',
    },
    avatarContainer: {
        borderRadius: theme.radius.sm,
        overflow: 'hidden',
    },
    overlay: {
        position: 'absolute',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    countContainer: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.full,
        width: '60%',
        height: '60%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    countText: {
        color: 'white',
        fontWeight: theme.fonts.bold,
    },
});

export default GroupAvatar;