import React, { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import Header from '../../components/Header';
import Loading from '../../components/Loading';
import RankingList from '../../components/RankingList';
import ScreenWrapper from '../../components/ScreenWrapper';
import StatsChart from '../../components/StatsChart';
import StatsFilter from '../../components/StatsFilter';
import { theme } from '../../constants/theme';
import { hp, wp } from '../../helpers/common';
import { statsService } from '../../services/statsService';

const Stats = () => {
    const [selectedFilter, setSelectedFilter] = useState('all');
    const [topUsers, setTopUsers] = useState([]);
    const [overallStats, setOverallStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Load dữ liệu thống kê
    const loadStats = async (filter = selectedFilter) => {
        try {
            setLoading(true);
            
            // Load song song cả 2 API
            const [topUsersResult, overallResult] = await Promise.all([
                statsService.getTopUsers(filter, 10),
                statsService.getOverallStats(filter)
            ]);

            if (topUsersResult.success) {
                setTopUsers(topUsersResult.data);
            }

            if (overallResult.success) {
                setOverallStats(overallResult.data);
            }

        } catch (error) {
            console.log('Error loading stats:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Load dữ liệu lần đầu
    useEffect(() => {
        loadStats();
    }, []);

    // Xử lý thay đổi filter
    const handleFilterChange = (filter) => {
        setSelectedFilter(filter);
        loadStats(filter);
    };

    // Xử lý refresh
    const onRefresh = () => {
        setRefreshing(true);
        loadStats();
    };

    if (loading && !refreshing) {
        return (
            <ScreenWrapper bg="white">
                <View style={styles.container}>
                    <Header title="Thống kê" />
                    <View style={styles.loadingContainer}>
                        <Loading size="large" />
                        <Text style={styles.loadingText}>Đang tải thống kê...</Text>
                    </View>
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper bg="white">
            <View style={styles.container}>
                <Header title="Thống kê" />

                <ScrollView 
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl 
                            refreshing={refreshing} 
                            onRefresh={onRefresh}
                            colors={[theme.colors.primary]}
                        />
                    }
                >
                    {/* Filter Component */}
                    <StatsFilter 
                        selectedFilter={selectedFilter}
                        onFilterChange={handleFilterChange}
                    />

                    {/* Chart Component */}
                    <StatsChart 
                        data={topUsers}
                        overallStats={overallStats}
                    />

                    {/* Ranking List Component */}
                    <RankingList 
                        data={topUsers}
                        loading={loading}
                    />
                </ScrollView>
            </View>
        </ScreenWrapper>
    );
};

export default Stats;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: wp(4),
    },
    
    content: {
        flex: 1,
        paddingBottom: hp(2),
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: hp(2),
    },

    loadingText: {
        fontSize: hp(1.8),
        color: theme.colors.textLight,
        textAlign: 'center',
    },
});
