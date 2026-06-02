import React, { useEffect, useState } from 'react';
import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Header from '../../components/Header';
import { supabaseUrl } from '../../constants';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { loadLeaderboardCache } from '../../utils/cacheHelper';

const Leaderboard = () => {
    const { user } = useAuth();
    // MOCK DATA - Bảng xếp hạng
    const [leaderboard, setLeaderboard] = useState([
        {
            id: 1,
            name: 'Nguyễn Văn A',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 1250,
            rank: 1,
            badge: 'Gold',
            activities: 15,
            joinDate: '2023-01-15'
        },
        {
            id: 2,
            name: 'Trần Thị B',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 1100,
            rank: 2,
            badge: 'Silver',
            activities: 12,
            joinDate: '2023-02-20'
        },
        {
            id: 3,
            name: 'Lê Văn C',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 850,
            rank: 3,
            badge: 'Bronze',
            activities: 10,
            joinDate: '2023-03-10'
        },
        {
            id: 4,
            name: 'Phạm Thị D',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 720,
            rank: 4,
            badge: 'Member',
            activities: 8,
            joinDate: '2023-04-05'
        },
        {
            id: 5,
            name: 'Hoàng Văn E',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 650,
            rank: 5,
            badge: 'Member',
            activities: 7,
            joinDate: '2023-05-12'
        },
        {
            id: 6,
            name: 'Vũ Thị F',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 580,
            rank: 6,
            badge: 'Member',
            activities: 6,
            joinDate: '2023-06-01'
        },
        {
            id: 7,
            name: 'Đỗ Văn G',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 520,
            rank: 7,
            badge: 'Member',
            activities: 5,
            joinDate: '2023-07-15'
        },
        {
            id: 8,
            name: 'Bùi Thị H',
            avatar: `${supabaseUrl}/storage/v1/object/public/upload/defaultUser.png`,
            points: 480,
            rank: 8,
            badge: 'Member',
            activities: 4,
            joinDate: '2023-08-20'
        }
    ]);

    useEffect(() => {
        loadLeaderboard();
    }, []);

    const loadLeaderboard = async (useCache = true) => {
        // Load từ cache trước (nếu có)
        if (useCache && user?.id) {
            const cacheStartTime = Date.now();
            const cached = await loadLeaderboardCache(user.id);
            if (cached && cached.data && cached.data.length > 0) {
                const dataSize = JSON.stringify(cached.data).length;
                const dataSizeKB = (dataSize / 1024).toFixed(2);
                const loadTime = Date.now() - cacheStartTime;
                console.log('Load dữ liệu từ cache: leaderboard');
                console.log(`- Dữ liệu đã load: ${cached.data.length} items (${dataSizeKB} KB)`);
                console.log(`- Tổng thời gian load: ${loadTime} ms`);
                setLeaderboard(cached.data);
                return;
            }
        }
        console.log('Load dữ liệu từ CSDL: leaderboard (demo data)');
    };

    const getBadgeColor = (badge) => {
        switch (badge) {
            case 'Gold': return '#FFD700';
            case 'Silver': return '#C0C0C0';
            case 'Bronze': return '#CD7F32';
            case 'Member': return '#4CAF50';
            default: return theme.colors.textSecondary;
        }
    };

    const getRankIcon = (rank) => {
        if (rank === 1) return '🏆';
        if (rank === 2) return '🥈';
        if (rank === 3) return '🥉';
        return rank;
    };

    const renderLeaderboardItem = ({ item, index }) => (
        <View style={[styles.leaderboardCard, index < 3 && styles.topThreeCard]}>
            <View style={styles.rankContainer}>
                <Text style={styles.rankText}>{getRankIcon(item.rank)}</Text>
            </View>
            <View style={styles.memberInfo}>
                <Image source={{ uri: item.avatar }} style={styles.avatar} />
                <View style={styles.memberDetails}>
                    <Text style={styles.memberName}>{item.name}</Text>
                    <View style={styles.memberStats}>
                        <Text style={styles.pointsText}>{item.points} điểm</Text>
                        <Text style={styles.activitiesText}>{item.activities} hoạt động</Text>
                    </View>
                </View>
            </View>
            <View style={styles.badgeContainer}>
                <View style={[styles.badge, { backgroundColor: getBadgeColor(item.badge) }]}>
                    <Text style={styles.badgeText}>{item.badge}</Text>
                </View>
            </View>
        </View>
    );

    return (
        <View style={styles.container}>
            <Header title="Bảng xếp hạng" showBackButton />

            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{leaderboard.length}</Text>
                    <Text style={styles.statLabel}>Tổng thành viên</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{leaderboard[0]?.points || 0}</Text>
                    <Text style={styles.statLabel}>Điểm cao nhất</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{Math.round(leaderboard.reduce((sum, l) => sum + l.points, 0) / leaderboard.length)}</Text>
                    <Text style={styles.statLabel}>Điểm trung bình</Text>
                </View>
            </View>

            <View style={styles.filterContainer}>
                <TouchableOpacity style={styles.filterButton}>
                    <Text style={styles.filterText}>Tất cả</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterButton}>
                    <Text style={styles.filterText}>Top 3</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterButton}>
                    <Text style={styles.filterText}>Tháng này</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={leaderboard}
                renderItem={renderLeaderboardItem}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 35, // Giống trang home và notifications
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: theme.colors.background,
        paddingVertical: hp(2),
        marginHorizontal: wp(4),
        marginVertical: hp(1),
        borderRadius: theme.radius.md,
        ...theme.shadows.small,
    },
    statItem: {
        alignItems: 'center',
    },
    statNumber: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
    },
    statLabel: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        marginTop: hp(0.5),
    },
    filterContainer: {
        flexDirection: 'row',
        paddingHorizontal: wp(4),
        marginBottom: hp(1),
    },
    filterButton: {
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.full,
        marginRight: wp(2),
        ...theme.shadows.small,
    },
    filterText: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        fontWeight: theme.fonts.medium,
    },
    listContainer: {
        paddingHorizontal: wp(4),
        paddingBottom: hp(10),
    },
    leaderboardCard: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        padding: wp(4),
        marginBottom: hp(1.5),
        flexDirection: 'row',
        alignItems: 'center',
        ...theme.shadows.small,
    },
    topThreeCard: {
        borderWidth: 2,
        borderColor: theme.colors.primary,
    },
    rankContainer: {
        width: hp(4),
        alignItems: 'center',
        marginRight: wp(3),
    },
    rankText: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
    },
    memberInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: hp(5),
        height: hp(5),
        borderRadius: theme.radius.full,
        marginRight: wp(3),
    },
    memberDetails: {
        flex: 1,
    },
    memberName: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(0.3),
    },
    memberStats: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    pointsText: {
        fontSize: hp(1.3),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
        marginRight: wp(2),
    },
    activitiesText: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
    },
    badgeContainer: {
        alignItems: 'flex-end',
    },
    badge: {
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.5),
        borderRadius: theme.radius.sm,
    },
    badgeText: {
        fontSize: hp(1.2),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
});

export default Leaderboard;





