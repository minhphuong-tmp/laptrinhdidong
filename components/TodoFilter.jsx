import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';

const TodoFilter = ({ selectedFilter, onFilterChange, todoStats }) => {
    const filterOptions = [
        { key: 'all', label: 'Tất cả', icon: '📋', count: todoStats?.total || 0 },
        { key: 'active', label: 'Đang làm', icon: '⏳', count: todoStats?.active || 0 },
        { key: 'completed', label: 'Hoàn thành', icon: '✅', count: todoStats?.completed || 0 },
        { key: 'today', label: 'Hôm nay', icon: '📅', count: todoStats?.today || 0 },
        { key: 'overdue', label: 'Quá hạn', icon: '⚠️', count: todoStats?.overdue || 0 },
        { key: 'upcoming', label: '7 ngày tới', icon: '🔔', count: todoStats?.upcoming || 0 },
    ];

    return (
        <View style={styles.container}>
            <Text style={styles.title}>🔍 Lọc ghi chú</Text>
            <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
            >
                {filterOptions.map((option) => (
                    <TouchableOpacity
                        key={option.key}
                        style={[
                            styles.filterButton,
                            selectedFilter === option.key && styles.activeFilter
                        ]}
                        onPress={() => onFilterChange(option.key)}
                    >
                        <View style={styles.filterContent}>
                            <Text style={styles.filterIcon}>{option.icon}</Text>
                            <Text style={[
                                styles.filterText,
                                selectedFilter === option.key && styles.activeFilterText
                            ]}>
                                {option.label}
                            </Text>
                            {option.count > 0 && (
                                <View style={[
                                    styles.countBadge,
                                    selectedFilter === option.key && styles.activeCountBadge
                                ]}>
                                    <Text style={[
                                        styles.countText,
                                        selectedFilter === option.key && styles.activeCountText
                                    ]}>
                                        {option.count}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
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
        fontSize: hp(2),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: hp(2),
    },

    filterRow: {
        paddingHorizontal: wp(2),
        gap: wp(3),
    },

    filterButton: {
        paddingVertical: hp(1.2),
        paddingHorizontal: wp(3),
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.gray + '20',
        borderWidth: 1,
        borderColor: theme.colors.gray + '40',
        minWidth: wp(20),
    },

    activeFilter: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },

    filterContent: {
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },

    filterIcon: {
        fontSize: hp(1.8),
        marginBottom: hp(0.5),
    },

    filterText: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
        textAlign: 'center',
    },

    activeFilterText: {
        color: 'white',
        fontWeight: theme.fonts.bold,
    },

    countBadge: {
        position: 'absolute',
        top: -hp(0.5),
        right: -wp(2),
        backgroundColor: theme.colors.rose,
        borderRadius: wp(2.5),
        minWidth: wp(5),
        height: wp(5),
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(1),
    },

    activeCountBadge: {
        backgroundColor: 'white',
    },

    countText: {
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
        color: 'white',
    },

    activeCountText: {
        color: theme.colors.primary,
    },
});

export default TodoFilter;
