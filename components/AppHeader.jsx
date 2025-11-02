import { useRouter } from 'expo-router';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { hp, wp } from '../helpers/common';
import UserAvatar from './UserAvatar';

const AppHeader = ({ notificationCount, onNotificationPress, showBackButton = false, onMenuPress }) => {
    const router = useRouter();
    const { user } = useAuth();

    return (
        <View style={styles.header}>
            <View style={styles.headerLeft}>
                {showBackButton && (
                    <TouchableOpacity
                        style={styles.backButton}
                        onPress={() => router.back()}
                    >
                        <Icon name="arrowLeft" size={hp(2.5)} color={theme.colors.text} />
                    </TouchableOpacity>
                )}

                <Image
                    source={require('../assets/images/logokma.jpg')}
                    style={styles.logoImage}
                    resizeMode="contain"
                />
                <Text style={styles.logo}>KMA</Text>
            </View>

            <View style={styles.headerRight}>
                <TouchableOpacity
                    style={styles.headerIcon}
                    onPress={onNotificationPress || (() => router.push('notifications'))}
                >
                    <Icon name="bell" size={hp(2.8)} color={theme.colors.text} />
                    {notificationCount > 0 && (
                        <View style={styles.notificationBadge}>
                            <Text style={styles.notificationText}>{notificationCount}</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.headerIcon}
                    onPress={() => router.push('chatList')}
                >
                    <Icon name="chat" size={hp(2.8)} color={theme.colors.text} />
                    {notificationCount > 0 && (
                        <View style={styles.chatNotificationBadge}>
                            <Icon name="notification-badge" size={hp(1.5)} color="#FF4444" />
                        </View>
                    )}
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push('profile')}>
                    <UserAvatar
                        user={user}
                        size={hp(3.5)}
                        rounded={theme.radius.full}
                    />
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.menuButton}
                    onPress={onMenuPress}
                >
                    <Text style={styles.menuText}>☰</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        ...theme.shadows.small,
    },

    headerLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },

    backButton: {
        padding: wp(1),
        marginRight: wp(2),
    },

    menuButton: {
        padding: wp(2),
        marginLeft: wp(2),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
        justifyContent: 'center',
        alignItems: 'center',
    },

    menuText: {
        fontSize: hp(2.5),
        color: theme.colors.text,
    },

    logo: {
        fontSize: hp(2.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
        marginLeft: wp(2),
    },

    logoImage: {
        width: hp(2.5),
        height: hp(2.5),
    },

    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(3),
    },

    headerIcon: {
        padding: wp(2),
        position: 'relative',
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
        marginHorizontal: wp(1),
        justifyContent: 'center',
        alignItems: 'center',
    },

    notificationBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: theme.colors.error,
        borderRadius: theme.radius.full,
        minWidth: hp(2),
        height: hp(2),
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(1),
    },

    notificationText: {
        color: 'white',
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
    },

    chatNotificationBadge: {
        position: 'absolute',
        top: -hp(0.5),
        right: -hp(0.5),
    },
});

export default AppHeader;
