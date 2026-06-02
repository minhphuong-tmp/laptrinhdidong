import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';

const StatsFilter = ({ selectedFilter, onFilterChange }) => {
    const filterOptions = [
        { key: '7d', label: '7 ngày', icon: '📅' },
        { key: '30d', label: '30 ngày', icon: '📆' },
        { key: 'all', label: 'Tất cả', icon: '🌍' }
    ];

    return (
        <View style={styles.container}>
            <Text style={styles.title}>📊 Thống kê theo thời gian</Text>
            <View style={styles.filterRow}>
                {filterOptions.map((option) => (
                    <TouchableOpacity
                        key={option.key}
                        style={[
                            styles.filterButton,
                            selectedFilter === option.key && styles.activeFilter
                        ]}
                        onPress={() => onFilterChange(option.key)}
                    >
                        <Text style={styles.filterIcon}>{option.icon}</Text>
                        <Text style={[
                            styles.filterText,
                            selectedFilter === option.key && styles.activeFilterText
                        ]}>
                            {option.label}
                        </Text>
                    </TouchableOpacity>
                ))}
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
        fontSize: hp(2),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
        textAlign: 'center',
        marginBottom: hp(2),
    },

    filterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: wp(2),
    },

    filterButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(3),
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.gray + '30',
        borderWidth: 1,
        borderColor: theme.colors.gray + '50',
    },

    activeFilter: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },

    filterIcon: {
        fontSize: hp(1.8),
        marginRight: wp(1.5),
    },

    filterText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },

    activeFilterText: {
        color: 'white',
        fontWeight: theme.fonts.bold,
    },
});

export default StatsFilter;


