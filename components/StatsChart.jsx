import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';
import Avatar from './Avatar';

const StatsChart = ({ data, overallStats }) => {
    if (!data || data.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Chưa có dữ liệu để hiển thị biểu đồ</Text>
            </View>
        );
    }

    // Lấy top 5 để hiển thị trong biểu đồ
    const chartData = data.slice(0, 5);
    const maxPosts = Math.max(...chartData.map(item => item.postCount));

    return (
        <View style={styles.container}>
            <Text style={styles.title}>📈 Biểu Đồ Thống Kê</Text>
            
            {/* Thống kê tổng quan */}
            {overallStats && (
                <View style={styles.overallStats}>
                    <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{overallStats.totalPosts}</Text>
                        <Text style={styles.statLabel}>Tổng bài viết</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{overallStats.activeUsers}</Text>
                        <Text style={styles.statLabel}>Người dùng</Text>
                    </View>
                    <View style={styles.statCard}>
                        <Text style={styles.statNumber}>{overallStats.avgPostsPerUser}</Text>
                        <Text style={styles.statLabel}>TB bài/người</Text>
                    </View>
                </View>
            )}

            {/* Biểu đồ cột */}
            <View style={styles.chartContainer}>
                <Text style={styles.chartTitle}>Top 5 Người Đăng Nhiều Nhất</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.chart}>
                        {chartData.map((item, index) => {
                            const barHeight = (item.postCount / maxPosts) * 120; // Max height 120
                            const barColor = index === 0 ? theme.colors.primary : 
                                           index === 1 ? theme.colors.rose : 
                                           index === 2 ? '#FF9500' : theme.colors.gray;

                            return (
                                <View key={item.user?.id || index} style={styles.barContainer}>
                                    {/* Số lượng bài viết */}
                                    <Text style={styles.barValue}>{item.postCount}</Text>
                                    
                                    {/* Cột biểu đồ */}
                                    <View style={[styles.bar, { 
                                        height: Math.max(barHeight, 20), 
                                        backgroundColor: barColor 
                                    }]} />
                                    
                                    {/* Avatar và tên */}
                                    <Avatar 
                                        uri={item.user?.image} 
                                        size={hp(4)} 
                                        rounded={theme.radius.sm}
                                        style={styles.barAvatar}
                                    />
                                    <Text style={styles.barName} numberOfLines={1}>
                                        {item.user?.name?.split(' ')[0] || 'User'}
                                    </Text>
                                    
                                    {/* Thống kê like/comment */}
                                    <View style={styles.barStats}>
                                        <Text style={styles.barStatText}>❤️ {item.totalLikes}</Text>
                                        <Text style={styles.barStatText}>💬 {item.totalComments}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            </View>
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

    overallStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: hp(2),
        gap: wp(2),
    },

    statCard: {
        flex: 1,
        backgroundColor: theme.colors.gray + '20',
        borderRadius: theme.radius.md,
        padding: wp(3),
        alignItems: 'center',
    },

    statNumber: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
    },

    statLabel: {
        fontSize: hp(1.4),
        color: theme.colors.textLight,
        marginTop: hp(0.5),
        textAlign: 'center',
    },

    chartContainer: {
        marginTop: hp(1),
    },

    chartTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: hp(2),
    },

    chart: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: wp(2),
        gap: wp(3),
        minWidth: wp(90),
    },

    barContainer: {
        alignItems: 'center',
        minWidth: wp(16),
    },

    barValue: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: hp(0.5),
    },

    bar: {
        width: wp(8),
        borderRadius: theme.radius.sm,
        marginBottom: hp(1),
    },

    barAvatar: {
        marginBottom: hp(0.5),
    },

    barName: {
        fontSize: hp(1.3),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: hp(0.5),
        width: wp(16),
    },

    barStats: {
        alignItems: 'center',
    },

    barStatText: {
        fontSize: hp(1.1),
        color: theme.colors.textLight,
        textAlign: 'center',
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

export default StatsChart;


