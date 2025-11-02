import React, { useState } from 'react';
import {
    FlatList,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import { theme } from '../../constants/theme';
import { hp, wp } from '../../helpers/common';

const Finance = () => {
    // MOCK DATA - Quản lý tài chính
    const [transactions] = useState([
        {
            id: 1,
            type: 'income',
            title: 'Đóng phí thành viên',
            amount: 500000,
            date: '2024-01-15',
            category: 'Membership',
            description: 'Phí thành viên tháng 1/2024'
        },
        {
            id: 2,
            type: 'expense',
            title: 'Mua thiết bị workshop',
            amount: 2000000,
            date: '2024-01-10',
            category: 'Equipment',
            description: 'Mua laptop và thiết bị cho workshop'
        },
        {
            id: 3,
            type: 'income',
            title: 'Tài trợ từ công ty ABC',
            amount: 5000000,
            date: '2024-01-08',
            category: 'Sponsorship',
            description: 'Tài trợ cho dự án Hackathon'
        },
        {
            id: 4,
            type: 'expense',
            title: 'Chi phí tổ chức sự kiện',
            amount: 1500000,
            date: '2024-01-05',
            category: 'Event',
            description: 'Chi phí thuê phòng và thiết bị'
        },
        {
            id: 5,
            type: 'income',
            title: 'Bán vé workshop',
            amount: 800000,
            date: '2024-01-03',
            category: 'Ticket',
            description: 'Bán vé workshop React Native'
        }
    ]);

    const [budget] = useState({
        total: 10000000,
        spent: 3500000,
        remaining: 6500000
    });

    const getTransactionIcon = (type) => {
        return type === 'income' ? 'plus' : 'delete';
    };

    const getTransactionColor = (type) => {
        return type === 'income' ? '#4CAF50' : '#F44336';
    };

    const getCategoryColor = (category) => {
        switch (category) {
            case 'Membership': return '#2196F3';
            case 'Equipment': return '#FF9800';
            case 'Sponsorship': return '#4CAF50';
            case 'Event': return '#9C27B0';
            case 'Ticket': return '#00BCD4';
            default: return theme.colors.textSecondary;
        }
    };

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(amount);
    };

    const renderTransaction = ({ item }) => (
        <View style={styles.transactionCard}>
            <View style={styles.transactionHeader}>
                <View style={styles.transactionInfo}>
                    <View style={styles.transactionIcon}>
                        <Icon name={getTransactionIcon(item.type)} size={hp(2)} color={getTransactionColor(item.type)} />
                    </View>
                    <View style={styles.transactionDetails}>
                        <Text style={styles.transactionTitle}>{item.title}</Text>
                        <Text style={styles.transactionDescription}>{item.description}</Text>
                    </View>
                </View>
                <View style={styles.transactionAmount}>
                    <Text style={[styles.amountText, { color: getTransactionColor(item.type) }]}>
                        {item.type === 'income' ? '+' : '-'}{formatCurrency(item.amount)}
                    </Text>
                    <Text style={styles.transactionDate}>{item.date}</Text>
                </View>
            </View>
            <View style={styles.transactionFooter}>
                <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(item.category) }]}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                </View>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <Header title="Quản lý tài chính" showBackButton />

            <View style={styles.budgetContainer}>
                <Text style={styles.budgetTitle}>Ngân sách CLB</Text>
                <View style={styles.budgetStats}>
                    <View style={styles.budgetItem}>
                        <Text style={styles.budgetLabel}>Tổng ngân sách</Text>
                        <Text style={styles.budgetAmount}>{formatCurrency(budget.total)}</Text>
                    </View>
                    <View style={styles.budgetItem}>
                        <Text style={styles.budgetLabel}>Đã chi</Text>
                        <Text style={[styles.budgetAmount, { color: '#F44336' }]}>{formatCurrency(budget.spent)}</Text>
                    </View>
                    <View style={styles.budgetItem}>
                        <Text style={styles.budgetLabel}>Còn lại</Text>
                        <Text style={[styles.budgetAmount, { color: '#4CAF50' }]}>{formatCurrency(budget.remaining)}</Text>
                    </View>
                </View>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${(budget.spent / budget.total) * 100}%` }]} />
                </View>
            </View>

            <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{transactions.filter(t => t.type === 'income').length}</Text>
                    <Text style={styles.statLabel}>Thu nhập</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{transactions.filter(t => t.type === 'expense').length}</Text>
                    <Text style={styles.statLabel}>Chi phí</Text>
                </View>
                <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{transactions.length}</Text>
                    <Text style={styles.statLabel}>Tổng giao dịch</Text>
                </View>
            </View>

            <View style={styles.filterContainer}>
                <TouchableOpacity style={styles.filterButton}>
                    <Text style={styles.filterText}>Tất cả</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterButton}>
                    <Text style={styles.filterText}>Thu nhập</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterButton}>
                    <Text style={styles.filterText}>Chi phí</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={transactions}
                renderItem={renderTransaction}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.backgroundSecondary,
        paddingTop: 35, // Consistent padding top
    },
    budgetContainer: {
        backgroundColor: theme.colors.background,
        marginHorizontal: wp(4),
        marginVertical: hp(1),
        padding: wp(4),
        borderRadius: theme.radius.md,
        ...theme.shadows.small,
    },
    budgetTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: hp(2),
        textAlign: 'center',
    },
    budgetStats: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: hp(2),
    },
    budgetItem: {
        alignItems: 'center',
    },
    budgetLabel: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
        marginBottom: hp(0.5),
    },
    budgetAmount: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },
    progressBar: {
        height: hp(0.8),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: theme.colors.primary,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        backgroundColor: theme.colors.background,
        paddingVertical: hp(2),
        marginHorizontal: wp(4),
        marginBottom: hp(1),
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
    transactionCard: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        padding: wp(4),
        marginBottom: hp(1.5),
        ...theme.shadows.small,
    },
    transactionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: hp(1),
    },
    transactionInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    transactionIcon: {
        width: hp(4),
        height: hp(4),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: wp(3),
    },
    transactionDetails: {
        flex: 1,
    },
    transactionTitle: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(0.3),
    },
    transactionDescription: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
    },
    transactionAmount: {
        alignItems: 'flex-end',
    },
    amountText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.bold,
        marginBottom: hp(0.3),
    },
    transactionDate: {
        fontSize: hp(1.2),
        color: theme.colors.textSecondary,
    },
    transactionFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
    },
    categoryBadge: {
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.5),
        borderRadius: theme.radius.sm,
    },
    categoryText: {
        fontSize: hp(1.2),
        color: 'white',
        fontWeight: theme.fonts.medium,
    },
});

export default Finance;






