import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { clubMemberService } from '../../services/clubMemberService';
import { loadMembersCache } from '../../utils/cacheHelper';

const Members = () => {
    const { user } = useAuth();
    // State cho dữ liệu từ database
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    const [searchText, setSearchText] = useState('');
    const [filteredMembers, setFilteredMembers] = useState([]);
    const [selectedRole, setSelectedRole] = useState('Tất cả');
    const [selectedYear, setSelectedYear] = useState('Tất cả');
    const [selectedMajor, setSelectedMajor] = useState('Tất cả');

    // Load dữ liệu từ database
    useEffect(() => {
        loadMembers();
    }, []);

    const loadMembers = async (useCache = true) => {
        setLoading(true);
        try {
            // Load từ cache trước (nếu có)
            let fromCache = false;
            if (useCache && user?.id) {
                const cacheStartTime = Date.now();
                const cached = await loadMembersCache(user.id);
                if (cached && cached.data && cached.data.length > 0) {
                    fromCache = true;
                    const dataSize = JSON.stringify(cached.data).length;
                    const dataSizeKB = (dataSize / 1024).toFixed(2);
                    const loadTime = Date.now() - cacheStartTime;
                    console.log('Load dữ liệu từ cache: members');
                    console.log(`- Dữ liệu đã load: ${cached.data.length} members (${dataSizeKB} KB)`);
                    console.log(`- Tổng thời gian load: ${loadTime} ms`);
                    setMembers(cached.data);
                    setFilteredMembers(cached.data);
                    setLoading(false);
                }
            }

            if (!fromCache) {
                console.log('Load dữ liệu từ CSDL: members');
            }
            const result = await clubMemberService.getAllMembers(user?.id);
            if (result.success) {
                setMembers(result.data);
                setFilteredMembers(result.data);
            }
        } catch (error) {
            // Silent error handling
        } finally {
            setLoading(false);
        }
    };

    // Lấy danh sách unique values cho filter
    const roles = ['Tất cả', ...new Set(members.map(m => m.role))];
    const years = ['Tất cả', ...new Set(members.map(m => m.year))];
    const majors = ['Tất cả', ...new Set(members.map(m => m.major)), 'An toàn thông tin', 'Điện tử viễn thông'];

    const applyFilters = () => {
        let filtered = members;

        // Filter by search text
        if (searchText.trim() !== '') {
            filtered = filtered.filter(member =>
                member.name.toLowerCase().includes(searchText.toLowerCase()) ||
                member.mssv.toLowerCase().includes(searchText.toLowerCase()) ||
                member.email.toLowerCase().includes(searchText.toLowerCase()) ||
                member.major.toLowerCase().includes(searchText.toLowerCase())
            );
        }

        // Filter by role
        if (selectedRole !== 'Tất cả') {
            filtered = filtered.filter(member => member.role === selectedRole);
        }

        // Filter by year
        if (selectedYear !== 'Tất cả') {
            filtered = filtered.filter(member => member.year === selectedYear);
        }

        // Filter by major
        if (selectedMajor !== 'Tất cả') {
            filtered = filtered.filter(member => member.major === selectedMajor);
        }

        setFilteredMembers(filtered);
    };

    const handleSearch = (text) => {
        setSearchText(text);
        applyFilters();
    };

    // Cập nhật filteredMembers khi có thay đổi
    useEffect(() => {
        applyFilters();
    }, [searchText, selectedRole, selectedYear, selectedMajor, members]);

    const handleRoleFilter = (role) => {
        setSelectedRole(role);
        applyFilters();
    };

    const handleYearFilter = (year) => {
        setSelectedYear(year);
        applyFilters();
    };

    const handleMajorFilter = (major) => {
        setSelectedMajor(major);
        applyFilters();
    };

    const getRoleColor = (role) => {
        switch (role) {
            case 'Chủ nhiệm CLB':
                return '#FFD700'; // Vàng
            case 'Phó Chủ Nhiệm':
                return '#FF6B35'; // Cam
            case 'Thành viên':
                return theme.colors.primary; // Xanh mặc định
            default:
                return theme.colors.textSecondary;
        }
    };

    const getRoleBackgroundColor = (role) => {
        switch (role) {
            case 'Chủ nhiệm CLB':
                return 'rgba(255, 215, 0, 0.1)'; // Vàng nhạt
            case 'Phó Chủ Nhiệm':
                return 'rgba(255, 107, 53, 0.1)'; // Cam nhạt
            case 'Thành viên':
                return 'rgba(33, 150, 243, 0.1)'; // Xanh nhạt
            default:
                return 'rgba(158, 158, 158, 0.1)';
        }
    };

    const renderMember = ({ item }) => (
        <View style={[
            styles.memberCard,
            (item.role === 'Chủ nhiệm CLB' || item.role === 'Phó Chủ Nhiệm') && styles.leaderCard
        ]}>
            <View style={styles.memberHeader}>
                <View style={styles.avatarContainer}>
                    <Image
                        source={{ uri: item.avatar }}
                        style={styles.avatar}
                        onError={(error) => {

                        }}
                        onLoad={() => {
                        }}
                    />
                    <View style={[styles.statusDot, { backgroundColor: item.status === 'online' ? '#4CAF50' : '#9E9E9E' }]} />
                </View>
                <View style={styles.memberBasicInfo}>
                    <Text style={styles.memberName}>{item.name}</Text>
                    <Text style={styles.memberMSSV}>MSSV: {item.mssv}</Text>
                    <View style={[
                        styles.roleBadge,
                        {
                            backgroundColor: getRoleBackgroundColor(item.role),
                            borderColor: getRoleColor(item.role)
                        }
                    ]}>
                        <Text style={[styles.memberRole, { color: getRoleColor(item.role) }]}>
                            {item.role}
                        </Text>
                    </View>
                </View>
                <View style={styles.memberActions}>
                    <TouchableOpacity style={styles.actionButton}>
                        <Icon name="call" size={hp(1.8)} color={theme.colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButton}>
                        <Icon name="mail" size={hp(1.8)} color={theme.colors.primary} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.memberDetails}>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Email:</Text>
                    <Text style={styles.detailValue}>{item.email}</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Chuyên ngành:</Text>
                    <Text style={styles.detailValue}>{item.major}</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Năm học:</Text>
                    <Text style={styles.detailValue}>{item.year}</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Ngày tham gia:</Text>
                    <Text style={styles.detailValue}>{item.joinDate}</Text>
                </View>
                <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Điểm số:</Text>
                    <Text style={[styles.detailValue, styles.pointsText]}>{item.points} điểm</Text>
                </View>
            </View>
        </View>
    );

    if (loading) {
        return (
            <View style={styles.container}>
                <Header title="Thành viên CLB" showBackButton />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={styles.loadingText}>Đang tải dữ liệu...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Header title="Thành viên CLB" showBackButton />

            <ScrollView
                style={styles.scrollContainer}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {/* Search Bar */}
                <View style={styles.searchContainer}>
                    <View style={styles.searchInputContainer}>
                        <Icon name="search" size={hp(2)} color={theme.colors.textSecondary} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Tìm kiếm thành viên..."
                            placeholderTextColor={theme.colors.textSecondary}
                            value={searchText}
                            onChangeText={handleSearch}
                        />
                        {searchText.length > 0 && (
                            <TouchableOpacity onPress={() => handleSearch('')}>
                                <Icon name="close" size={hp(2)} color={theme.colors.textSecondary} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Filter Section */}
                <View style={styles.filterContainer}>
                    <Text style={styles.filterTitle}>Lọc theo:</Text>

                    {/* Role Filter */}
                    <View style={styles.filterSection}>
                        <Text style={styles.filterLabel}>Vai trò:</Text>
                        <View style={styles.filterButtons}>
                            {roles.map((role) => (
                                <TouchableOpacity
                                    key={role}
                                    style={[
                                        styles.filterButton,
                                        selectedRole === role && styles.filterButtonActive
                                    ]}
                                    onPress={() => handleRoleFilter(role)}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        selectedRole === role && styles.filterButtonTextActive
                                    ]}>
                                        {role}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Year Filter */}
                    <View style={styles.filterSection}>
                        <Text style={styles.filterLabel}>Năm học:</Text>
                        <View style={styles.filterButtons}>
                            {years.map((year) => (
                                <TouchableOpacity
                                    key={year}
                                    style={[
                                        styles.filterButton,
                                        selectedYear === year && styles.filterButtonActive
                                    ]}
                                    onPress={() => handleYearFilter(year)}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        selectedYear === year && styles.filterButtonTextActive
                                    ]}>
                                        {year}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Major Filter */}
                    <View style={styles.filterSection}>
                        <Text style={styles.filterLabel}>Chuyên ngành:</Text>
                        <View style={styles.filterButtons}>
                            {majors.map((major) => (
                                <TouchableOpacity
                                    key={major}
                                    style={[
                                        styles.filterButton,
                                        selectedMajor === major && styles.filterButtonActive
                                    ]}
                                    onPress={() => handleMajorFilter(major)}
                                >
                                    <Text style={[
                                        styles.filterButtonText,
                                        selectedMajor === major && styles.filterButtonTextActive
                                    ]}>
                                        {major}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                <View style={styles.statsContainer}>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{filteredMembers.length}</Text>
                        <Text style={styles.statLabel}>Tổng thành viên</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{filteredMembers.filter(m => m.role === 'Chủ nhiệm CLB').length}</Text>
                        <Text style={styles.statLabel}>Chủ nhiệm</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{filteredMembers.filter(m => m.role === 'Phó Chủ Nhiệm').length}</Text>
                        <Text style={styles.statLabel}>Phó chủ nhiệm</Text>
                    </View>
                    <View style={styles.statItem}>
                        <Text style={styles.statNumber}>{filteredMembers.filter(m => m.role === 'Thành viên').length}</Text>
                        <Text style={styles.statLabel}>Thành viên</Text>
                    </View>
                </View>

                {/* Members List */}
                <View style={styles.membersListContainer}>
                    {filteredMembers.map((member) => (
                        <View key={member.id}>
                            {renderMember({ item: member })}
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 35, // Giống trang home và notifications
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(5),
    },

    loadingText: {
        fontSize: hp(2),
        color: theme.colors.textSecondary,
        marginTop: hp(2),
        fontFamily: theme.fonts.regular,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: hp(10),
    },
    searchContainer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },
    searchInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        paddingHorizontal: wp(3),
        paddingVertical: hp(1.5),
        ...theme.shadows.small,
    },
    searchInput: {
        flex: 1,
        fontSize: hp(1.5),
        color: theme.colors.text,
        marginLeft: wp(2),
    },
    filterContainer: {
        backgroundColor: theme.colors.background,
        marginHorizontal: wp(4),
        marginVertical: hp(1),
        padding: wp(4),
        borderRadius: theme.radius.md,
        ...theme.shadows.small,
    },
    filterTitle: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: hp(1.5),
    },
    filterSection: {
        marginBottom: hp(2),
    },
    filterLabel: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(1),
    },
    filterButtons: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: wp(2),
    },
    filterButton: {
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
        marginBottom: hp(0.5),
    },
    filterButtonActive: {
        backgroundColor: theme.colors.primary,
    },
    filterButtonText: {
        fontSize: hp(1.3),
        color: theme.colors.text,
        fontWeight: theme.fonts.medium,
    },
    filterButtonTextActive: {
        color: 'white',
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
    membersListContainer: {
        paddingHorizontal: wp(4),
    },
    memberCard: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        padding: wp(4),
        marginBottom: hp(2),
        ...theme.shadows.small,
    },

    leaderCard: {
        borderWidth: 2,
        borderColor: '#FFD700',
        ...theme.shadows.large,
    },

    roleBadge: {
        paddingHorizontal: wp(3),
        paddingVertical: hp(0.5),
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        alignSelf: 'flex-start',
        marginTop: hp(0.5),
    },
    memberHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(2),
    },
    avatarContainer: {
        position: 'relative',
        marginRight: wp(3),
    },
    avatar: {
        width: hp(6),
        height: hp(6),
        borderRadius: theme.radius.full,
    },
    statusDot: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: hp(1.5),
        height: hp(1.5),
        borderRadius: theme.radius.full,
        borderWidth: 2,
        borderColor: theme.colors.background,
    },
    memberBasicInfo: {
        flex: 1,
    },
    memberName: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: hp(0.3),
    },
    memberMSSV: {
        fontSize: hp(1.4),
        color: theme.colors.primary,
        fontWeight: theme.fonts.semiBold,
        marginBottom: hp(0.2),
    },
    memberRole: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
    },
    memberActions: {
        flexDirection: 'row',
        gap: wp(2),
    },
    actionButton: {
        padding: wp(2),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
    },
    memberDetails: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingTop: hp(1.5),
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: hp(0.8),
    },
    detailLabel: {
        fontSize: hp(1.3),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
        flex: 1,
    },
    detailValue: {
        fontSize: hp(1.3),
        color: theme.colors.text,
        flex: 2,
        textAlign: 'right',
    },
    pointsText: {
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
    },
});

export default Members;
