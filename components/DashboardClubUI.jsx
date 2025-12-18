import React from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    Image,
    StyleSheet,
    ScrollView,
    Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';
import Icon from '../assets/icons';
import Avatar from './Avatar';

const DashboardClubUI = () => {
    // Feature cards data
    const features = [
        {
            id: 1,
            title: 'Bảng tin',
            description: 'Cập nhật tin tức công nghệ và thông báo mới nhất.',
            icon: 'megaphone',
            iconName: 'article'
        },
        {
            id: 2,
            title: 'Thành viên',
            description: 'Quản lý hồ sơ và danh sách 150+ thành viên.',
            icon: 'users',
            iconName: 'groups'
        },
        {
            id: 3,
            title: 'Sự kiện',
            description: 'Lịch trình workshop, hackathon và đăng ký.',
            icon: 'calendar',
            iconName: 'event'
        },
        {
            id: 4,
            title: 'Dự án',
            description: 'Theo dõi tiến độ dự án nhóm và code repo.',
            icon: 'stats',
            iconName: 'view-kanban'
        },
        {
            id: 5,
            title: 'Tài liệu',
            description: 'Kho tài liệu học tập, slide bài giảng.',
            icon: 'file-text',
            iconName: 'folder-open'
        }
    ];

    // Bottom nav items
    const navItems = [
        { id: 1, label: 'Trang chủ', icon: 'home', active: true },
        { id: 2, label: 'Thành viên', icon: 'users', active: false },
        { id: 3, label: 'Sự kiện', icon: 'calendar', active: false },
        { id: 4, label: 'Cá nhân', icon: 'user', active: false }
    ];

    const FeatureCard = ({ feature, onPress }) => {
        return (
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={onPress}
                style={styles.featureCardContainer}
            >
                {/* Glow Effect Layers */}
                <View style={styles.glowLayer1} />
                <View style={styles.glowLayer2} />
                
                {/* Card Content */}
                <View style={styles.featureCard}>
                    <View style={styles.iconContainer}>
                        {feature.icon === 'users' ? (
                            <Icon name="users" size={28} color={theme.colors.text} />
                        ) : feature.icon === 'calendar' ? (
                            <Icon name="calendar" size={28} color={theme.colors.text} />
                        ) : feature.icon === 'file-text' ? (
                            <Icon name="file-text" size={28} color={theme.colors.text} />
                        ) : feature.icon === 'stats' ? (
                            <Icon name="stats" size={28} color={theme.colors.text} />
                        ) : (
                            <MaterialIcons name={feature.iconName} size={28} color={theme.colors.text} />
                        )}
                    </View>
                    <View style={styles.featureContent}>
                        <Text style={styles.featureTitle}>{feature.title}</Text>
                        <Text style={styles.featureDescription} numberOfLines={2}>
                            {feature.description}
                        </Text>
                    </View>
                    <MaterialIcons name="arrow-forward-ios" size={20} color={theme.colors.textTertiary} />
                </View>
            </TouchableOpacity>
        );
    };

    const BottomNavItem = ({ item, onPress }) => {
        return (
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={onPress}
                style={styles.navItem}
            >
                <View style={styles.navIconContainer}>
                    {item.active ? (
                        <Icon name={item.icon} size={24} color={theme.colors.primary} />
                    ) : (
                        <Icon name={item.icon} size={24} color={theme.colors.textTertiary} />
                    )}
                </View>
                <Text
                    style={[
                        styles.navLabel,
                        item.active && styles.navLabelActive
                    ]}
                >
                    {item.label}
                </Text>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            {/* Top App Bar */}
            <View style={styles.topBar}>
                <View style={styles.topBarLeft}>
                    <View style={styles.avatarContainer}>
                        <Avatar
                            uri="https://lh3.googleusercontent.com/aida-public/AB6AXuDIpgdsrZ1_m8Kuq6h24c50Aoey7NV6Mtlr-O8fmPudht7qpGEWBCQo_ug8WmhNb1WTrK9IO6lvK5YN3VuO-gCTIznIsz-qlSz5VpDkh_DbzKmJrcNVvXag1_y3ueAzulWCtH1DKnoyvpFxTIRu5KPK9wvBiiB3gcvzWe_0hUsncJZHzjaFspNollCXZOpiZNtiX0KpiVSl-KxJnViIISS0Hl9L5HMz8oSugyMawXf7t10C6GthOBcbRoQSL2WJGI0MDhnPIMVvnDJv"
                            size={hp(5)}
                            rounded={true}
                        />
                        <View style={styles.onlineIndicator} />
                    </View>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>Xin chào, Alex</Text>
                        <Text style={styles.userRole}>Chủ nhiệm CLB</Text>
                    </View>
                </View>
                <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.notificationButton}
                >
                    <Icon name="bell" size={24} color={theme.colors.text} />
                </TouchableOpacity>
            </View>

            {/* Main Content */}
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.headerSection}>
                    <Text style={styles.mainTitle}>Bảng điều khiển</Text>
                    <Text style={styles.subtitle}>Quản lý mọi hoạt động CLB của bạn.</Text>
                </View>

                {/* Feature Cards */}
                <View style={styles.featuresContainer}>
                    {features.map((feature) => (
                        <FeatureCard
                            key={feature.id}
                            feature={feature}
                            onPress={() => {
                                // Handle navigation
                                console.log(`Navigate to ${feature.title}`);
                            }}
                        />
                    ))}
                </View>
            </ScrollView>

            {/* Bottom Navigation */}
            <View style={styles.bottomNavContainer}>
                <View style={styles.bottomNav}>
                {navItems.map((item) => (
                    <BottomNavItem
                        key={item.id}
                        item={item}
                        onPress={() => {
                            // Handle navigation
                            console.log(`Navigate to ${item.label}`);
                        }}
                    />
                ))}
                {/* Floating Action Button */}
                <View style={styles.fabContainer}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        style={styles.fab}
                    >
                        <MaterialIcons name="add" size={28} color="#FFFFFF" />
                    </TouchableOpacity>
                </View>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        width: '100%',
        backgroundColor: theme.colors.background,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: wp(5),
        paddingTop: hp(2),
        paddingBottom: hp(1),
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    topBarLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(3),
    },
    avatarContainer: {
        position: 'relative',
    },
    onlineIndicator: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: hp(1.5),
        height: hp(1.5),
        borderRadius: hp(0.75),
        backgroundColor: theme.colors.success,
        borderWidth: 2,
        borderColor: theme.colors.background,
    },
    userInfo: {
        flexDirection: 'column',
    },
    userName: {
        fontSize: 20,
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        lineHeight: 24,
    },
    userRole: {
        fontSize: 12,
        fontWeight: theme.fonts.medium,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    notificationButton: {
        width: hp(5),
        height: hp(5),
        borderRadius: hp(2.5),
        backgroundColor: theme.colors.backgroundSecondary,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: wp(5),
        paddingTop: hp(2),
        paddingBottom: hp(6),
        gap: hp(1.5),
    },
    headerSection: {
        marginBottom: hp(1),
        gap: hp(0.5),
    },
    mainTitle: {
        fontSize: 24,
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        letterSpacing: -0.5,
    },
    subtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
    },
    featuresContainer: {
        gap: hp(1.5),
    },
    featureCardContainer: {
        position: 'relative',
        marginBottom: hp(1),
    },
    glowLayer1: {
        position: 'absolute',
        top: -2,
        left: -2,
        right: -2,
        bottom: -2,
        borderRadius: 26,
        opacity: 0.3,
        backgroundColor: 'transparent',
        ...Platform.select({
            ios: {
                shadowColor: '#dd7bbb',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6,
                shadowRadius: 8,
            },
            android: {
                elevation: 4,
            },
        }),
    },
    glowLayer2: {
        position: 'absolute',
        top: -1,
        left: -1,
        right: -1,
        bottom: -1,
        borderRadius: 26,
        opacity: 0.2,
        backgroundColor: 'transparent',
        ...Platform.select({
            ios: {
                shadowColor: '#4c7894',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.4,
                shadowRadius: 20,
            },
        }),
    },
    featureCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(5),
        borderRadius: 24,
        backgroundColor: theme.colors.background,
        padding: wp(5),
        borderWidth: 1,
        borderColor: theme.colors.border,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.04,
                shadowRadius: 15,
            },
            android: {
                elevation: 2,
            },
        }),
    },
    iconContainer: {
        width: hp(7),
        height: hp(7),
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.backgroundSecondary,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    featureContent: {
        flex: 1,
        gap: hp(0.5),
    },
    featureTitle: {
        fontSize: 18,
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        lineHeight: 22,
    },
    featureDescription: {
        fontSize: 14,
        fontWeight: theme.fonts.regular,
        color: theme.colors.textSecondary,
        lineHeight: 20,
    },
    bottomNavContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        backgroundColor: theme.colors.background,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
    },
    bottomNav: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: wp(6),
        paddingTop: hp(1),
        paddingBottom: hp(3),
        width: '100%',
        position: 'relative',
    },
    navItem: {
        flex: 1,
        alignItems: 'center',
        gap: hp(0.5),
    },
    navIconContainer: {
        height: hp(4),
        alignItems: 'center',
        justifyContent: 'center',
    },
    navLabel: {
        fontSize: 10,
        fontWeight: theme.fonts.medium,
        color: theme.colors.textTertiary,
        letterSpacing: 0.5,
    },
    navLabelActive: {
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
    },
    fabContainer: {
        position: 'absolute',
        top: -hp(3),
        left: '50%',
        marginLeft: -hp(3.5),
    },
    fab: {
        width: hp(7),
        height: hp(7),
        borderRadius: hp(3.5),
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
            ios: {
                shadowColor: theme.colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: {
                elevation: 6,
            },
        }),
    },
});

export default DashboardClubUI;

