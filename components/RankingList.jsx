import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';
import Avatar from './Avatar';

const RankingItem = ({ item, index }) => {
    const getRankColor = (rank) => {
        if (rank === 1) return '#FFD700'; // Vàng
        if (rank === 2) return '#C0C0C0'; // Bạc  
        if (rank === 3) return '#CD7F32'; // Đồng
        return theme.colors.textLight;
    };

    const getRankIcon = (rank) => {
        if (rank === 1) return '🥇';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return `${rank}`;
    };

    return (
        <View style={styles.rankingItem}>
            <View style={styles.rankSection}>
                <Text style={[styles.rankNumber, { color: getRankColor(index + 1) }]}>
                    {getRankIcon(index + 1)}
                </Text>
            </View>
            
            <View style={styles.userSection}>
                <Avatar 
                    uri={item.user?.image} 
                    size={hp(5)} 
                    rounded={theme.radius.md}
                />
                <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                        {item.user?.name || 'Unknown User'}
                    </Text>
                    <Text style={styles.userStats}>
                        {item.postCount} bài viết
                    </Text>
                </View>
            </View>

            <View style={styles.statsSection}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{item.totalLikes}</Text>
                    <Text style={styles.statLabel}>❤️</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{item.totalComments}</Text>
                    <Text style={styles.statLabel}>💬</Text>
                </View>
            </View>
        </View>
    );
};

const RankingList = ({ data, loading }) => {
    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>Đang tải thống kê...</Text>
            </View>
        );
    }

    if (!data || data.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Chưa có dữ liệu thống kê</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🏆 Top 10 Người Đăng Nhiều Bài Nhất</Text>
            <FlatList
                data={data}
                keyExtractor={(item, index) => `${item.user?.id}-${index}`}
                renderItem={({ item, index }) => (
                    <RankingItem item={item} index={index} />
                )}
                showsVerticalScrollIndicator={false}
                scrollEnabled={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: 'white',
        borderRadius: theme.radius.lg,
        padding: wp(4),
        marginVertical: hp(1),
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },

    title: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: hp(2),
    },

    rankingItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(2),
        marginVertical: hp(0.5),
        backgroundColor: theme.colors.gray + '20',
        borderRadius: theme.radius.md,
    },

    rankSection: {
        width: wp(12),
        alignItems: 'center',
    },

    rankNumber: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
    },

    userSection: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        marginLeft: wp(3),
    },

    userInfo: {
        marginLeft: wp(3),
        flex: 1,
    },

    userName: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
    },

    userStats: {
        fontSize: hp(1.4),
        color: theme.colors.textLight,
        marginTop: hp(0.2),
    },

    statsSection: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(4),
    },

    statItem: {
        alignItems: 'center',
        minWidth: wp(8),
    },

    statNumber: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
    },

    statLabel: {
        fontSize: hp(1.4),
        marginTop: hp(0.2),
    },

    loadingContainer: {
        padding: wp(8),
        alignItems: 'center',
    },

    loadingText: {
        fontSize: hp(1.8),
        color: theme.colors.textLight,
    },

    emptyContainer: {
        padding: wp(8),
        alignItems: 'center',
    },

    emptyText: {
        fontSize: hp(1.8),
        color: theme.colors.textLight,
        textAlign: 'center',
    },
});

export default RankingList;


