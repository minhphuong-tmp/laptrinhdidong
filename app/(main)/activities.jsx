import React, { useEffect, useState } from 'react';
import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { activityService } from '../../services/activityService';
import { loadActivitiesCache } from '../../utils/cacheHelper';

const Activities = () => {
    const { user } = useAuth();
    // State cho hoạt động từ database
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);

    // Load activities từ database
    useEffect(() => {
        loadActivities();
    }, []);

    const loadActivities = async (useCache = true) => {
        try {
            setLoading(true);
            // Load từ cache trước (nếu có)
            let fromCache = false;
            if (useCache && user?.id) {
                const cacheStartTime = Date.now();
                const cached = await loadActivitiesCache(user.id);
                if (cached && cached.data && cached.data.length > 0) {
                    fromCache = true;
                    const dataSize = JSON.stringify(cached.data).length;
                    const dataSizeKB = (dataSize / 1024).toFixed(2);
                    const loadTime = Date.now() - cacheStartTime;
                    console.log('Load dữ liệu từ cache: activities');
                    console.log(`- Dữ liệu đã load: ${cached.data.length} activities (${dataSizeKB} KB)`);
                    console.log(`- Tổng thời gian load: ${loadTime} ms`);
                    setActivities(cached.data);
                    setLoading(false);
                }
            }

            if (!fromCache) {
                console.log('Load dữ liệu từ CSDL: activities');
            }
            const result = await activityService.getAllActivities(user?.id);
            if (result.success) {
                setActivities(result.data);
            } else {
                console.log('Error loading activities:', result.msg);
            }
        } catch (error) {
            console.log('Error in loadActivities:', error);
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'upcoming': return '#FF9800';
            case 'completed': return '#4CAF50';
            case 'cancelled': return '#F44336';
            default: return theme.colors.textSecondary;
        }
    };

    const getStatusText = (status) => {
        switch (status) {
            case 'upcoming': return 'Sắp diễn ra';
            case 'completed': return 'Đã hoàn thành';
            case 'cancelled': return 'Đã hủy';
            default: return 'Không xác định';
        }
    };

    const renderActivity = ({ item }) => {
        // Format date từ database
        const startDate = new Date(item.start_date);
        const endDate = new Date(item.end_date);
        const formattedDate = startDate.toLocaleDateString('vi-VN');
        const formattedTime = `${startDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;

        // Đếm số người tham gia
        const participantCount = item.participants?.length || 0;

        // Xác định status dựa trên thời gian
        const now = new Date();
        const isUpcoming = startDate > now;
        const isCompleted = endDate < now;
        const status = isCompleted ? 'completed' : (isUpcoming ? 'upcoming' : 'ongoing');

        return (
            <View style={styles.activityCard}>
                {item.thumbnail && (
                    <Image source={{ uri: item.thumbnail }} style={styles.activityImage} />
                )}
                <View style={styles.activityContent}>
                    <View style={styles.activityHeader}>
                        <Text style={styles.activityTitle}>{item.title}</Text>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
                            <Text style={styles.statusText}>{getStatusText(status)}</Text>
                        </View>
                    </View>
                    <Text style={styles.activityDescription}>{item.description}</Text>
                    <View style={styles.activityInfo}>
                        <View style={styles.infoItem}>
                            <Icon name="location" size={hp(1.5)} color={theme.colors.textSecondary} />
                            <Text style={styles.infoText}>{item.location}</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Icon name="user" size={hp(1.5)} color={theme.colors.textSecondary} />
                            <Text style={styles.infoText}>{participantCount}/{item.max_participants} người tham gia</Text>
                        </View>
                        <View style={styles.infoItem}>
                            <Icon name="tag" size={hp(1.5)} color={theme.colors.textSecondary} />
                            <Text style={styles.infoText}>{item.activity_type}</Text>
                        </View>
                    </View>
                    <View style={styles.activityFooter}>
                        <Text style={styles.activityDate}>{formattedDate} - {formattedTime}</Text>
                        <TouchableOpacity style={styles.joinButton}>
                            <Text style={styles.joinButtonText}>Tham gia</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <Header title="Hoạt động CLB" showBackButton />

            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>
                        {activities.filter(a => {
                            const startDate = new Date(a.start_date);
                            return startDate > new Date();
                        }).length}
                    </Text>
                    <Text style={styles.statLabel}>Sắp diễn ra</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>
                        {activities.filter(a => {
                            const endDate = new Date(a.end_date);
                            return endDate < new Date();
                        }).length}
                    </Text>
                    <Text style={styles.statLabel}>Đã hoàn thành</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>
                        {activities.reduce((sum, a) => sum + (a.participants?.length || 0), 0)}
                    </Text>
                    <Text style={styles.statLabel}>Tổng tham gia</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Đang tải hoạt động...</Text>
                </View>
            ) : (
                <FlatList
                    data={activities}
                    renderItem={renderActivity}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.listContainer}
                    showsVerticalScrollIndicator={false}
                />
            )}
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
    listContainer: {
        paddingHorizontal: wp(4),
        paddingBottom: hp(10),
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: hp(10),
    },
    loadingText: {
        fontSize: hp(1.8),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },
    activityCard: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        marginBottom: hp(2),
        overflow: 'hidden',
        ...theme.shadows.small,
    },
    activityImage: {
        width: '100%',
        height: hp(15),
        resizeMode: 'cover',
    },
    activityContent: {
        padding: wp(4),
    },
    activityHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: hp(1),
    },
    activityTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        flex: 1,
        marginRight: wp(2),
    },
    statusBadge: {
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.5),
        borderRadius: theme.radius.sm,
    },
    statusText: {
        fontSize: hp(1.2),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
    activityDescription: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        marginBottom: hp(1.5),
        lineHeight: hp(2),
    },
    activityInfo: {
        flexDirection: 'row',
        marginBottom: hp(1.5),
    },
    infoItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: wp(4),
    },
    infoText: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
        marginLeft: wp(1),
    },
    activityFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    activityDate: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
    },
    joinButton: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        borderRadius: theme.radius.sm,
    },
    joinButtonText: {
        fontSize: hp(1.4),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
});

export default Activities;






