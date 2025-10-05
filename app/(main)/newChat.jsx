import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    FlatList,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import Icon from '../../assets/icons';
import Avatar from '../../components/Avatar';
import Loading from '../../components/Loading';
import ScreenWrapper from '../../components/ScreenWrapper';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import { createDirectConversation, createGroupConversation } from '../../services/chatService';

const NewChat = () => {
    const { user } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [isGroup, setIsGroup] = useState(false);
    const [groupName, setGroupName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    // Reload users khi chuyển đổi giữa tin nhắn và nhóm
    useEffect(() => {
        loadUsers();
    }, [isGroup]);

    const loadUsers = async () => {
        try {
            // Lấy tất cả users
            const { data: allUsers, error: usersError } = await supabase
                .from('users')
                .select('id, name, image')
                .neq('id', user.id)
                .order('name');

            if (usersError) {
                console.log('loadUsers error:', usersError);
                return;
            }

            // Nếu đang tạo nhóm, hiển thị tất cả users
            if (isGroup) {
                setUsers(allUsers || []);
                return;
            }

            // Nếu tạo tin nhắn 1-1, lọc ra người đã có cuộc trò chuyện 1-1
            const { data: existingConversations, error: convError } = await supabase
                .from('conversation_members')
                .select(`
                    conversation_id,
                    conversation:conversations(type)
                `)
                .eq('user_id', user.id);

            if (convError) {
                console.log('loadConversations error:', convError);
                setUsers(allUsers || []);
                return;
            }

            // Lấy danh sách user_id đã có cuộc trò chuyện trực tiếp
            const existingUserIds = new Set();

            for (const conv of existingConversations || []) {
                if (conv.conversation?.type === 'direct') {
                    // Lấy tất cả thành viên của conversation này
                    const { data: members } = await supabase
                        .from('conversation_members')
                        .select('user_id')
                        .eq('conversation_id', conv.conversation_id);

                    if (members) {
                        members.forEach(member => {
                            if (member.user_id !== user.id) {
                                existingUserIds.add(member.user_id);
                            }
                        });
                    }
                }
            }

            // Lọc ra những user chưa có cuộc trò chuyện trực tiếp
            const availableUsers = (allUsers || []).filter(user =>
                !existingUserIds.has(user.id)
            );

            setUsers(availableUsers);
        } catch (error) {
            console.log('loadUsers error:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(user =>
        user.name.toLowerCase().includes(searchText.toLowerCase())
    );

    const toggleUserSelection = (userId) => {
        if (selectedUsers.includes(userId)) {
            setSelectedUsers(selectedUsers.filter(id => id !== userId));
        } else {
            if (isGroup) {
                setSelectedUsers([...selectedUsers, userId]);
            } else {
                setSelectedUsers([userId]);
            }
        }
    };

    const createChat = async () => {
        if (selectedUsers.length === 0) return;

        setCreating(true);

        try {
            let res;

            if (isGroup) {
                if (!groupName.trim()) {
                    alert('Vui lòng nhập tên nhóm');
                    setCreating(false);
                    return;
                }

                res = await createGroupConversation(
                    groupName.trim(),
                    user.id,
                    selectedUsers
                );
            } else {
                res = await createDirectConversation(user.id, selectedUsers[0]);
            }

            if (res.success) {
                router.push({
                    pathname: 'chat',
                    params: { conversationId: res.data.id }
                });
            } else {
                alert(res.msg || 'Không thể tạo cuộc trò chuyện');
            }
        } catch (error) {
            console.log('createChat error:', error);
            alert('Có lỗi xảy ra');
        } finally {
            setCreating(false);
        }
    };

    const renderUser = ({ item: userItem }) => {
        const isSelected = selectedUsers.includes(userItem.id);

        return (
            <Pressable
                style={[
                    styles.userItem,
                    isSelected && styles.selectedUserItem
                ]}
                onPress={() => toggleUserSelection(userItem.id)}
            >
                <Avatar
                    uri={userItem.image}
                    size={hp(5)}
                    rounded={theme.radius.xl}
                />

                <View style={styles.userInfo}>
                    <Text style={styles.userName}>{userItem.name}</Text>
                </View>

                {isSelected && (
                    <View style={styles.checkmark}>
                        <Icon name="check" size={hp(2)} color="white" />
                    </View>
                )}
            </Pressable>
        );
    };

    if (loading) {
        return (
            <ScreenWrapper bg="white">
                <View style={styles.loadingContainer}>
                    <Loading />
                </View>
            </ScreenWrapper>
        );
    }

    return (
        <ScreenWrapper bg="white">
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Icon name="arrowLeft" size={hp(2.5)} color={theme.colors.text} />
                    </TouchableOpacity>

                    <Text style={styles.title}>Cuộc trò chuyện mới</Text>

                    <TouchableOpacity
                        onPress={createChat}
                        disabled={selectedUsers.length === 0 || creating}
                        style={[
                            styles.createButton,
                            (selectedUsers.length === 0 || creating) && styles.disabledButton
                        ]}
                    >
                        {creating ? (
                            <Loading size="small" />
                        ) : (
                            <Text style={[
                                styles.createButtonText,
                                (selectedUsers.length === 0 || creating) && styles.disabledButtonText
                            ]}>
                                Tạo
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Chat Type Toggle */}
                <View style={styles.typeToggle}>
                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            !isGroup && styles.activeTypeButton
                        ]}
                        onPress={() => setIsGroup(false)}
                    >
                        <Text style={[
                            styles.typeButtonText,
                            !isGroup && styles.activeTypeButtonText
                        ]}>
                            Trực tiếp
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.typeButton,
                            isGroup && styles.activeTypeButton
                        ]}
                        onPress={() => setIsGroup(true)}
                    >
                        <Text style={[
                            styles.typeButtonText,
                            isGroup && styles.activeTypeButtonText
                        ]}>
                            Nhóm
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Group Name Input */}
                {isGroup && (
                    <View style={styles.groupNameContainer}>
                        <TextInput
                            style={styles.groupNameInput}
                            value={groupName}
                            onChangeText={setGroupName}
                            placeholder="Tên nhóm"
                            placeholderTextColor={theme.colors.textLight}
                        />
                    </View>
                )}

                {/* Search */}
                <View style={styles.searchContainer}>
                    <Icon name="search" size={hp(2)} color={theme.colors.textLight} />
                    <TextInput
                        style={styles.searchInput}
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholder="Tìm kiếm người dùng..."
                        placeholderTextColor={theme.colors.textLight}
                    />
                </View>

                {/* Selected Users */}
                {selectedUsers.length > 0 && (
                    <View style={styles.selectedContainer}>
                        <Text style={styles.selectedTitle}>
                            Đã chọn ({selectedUsers.length}):
                        </Text>
                        <View style={styles.selectedUsers}>
                            {selectedUsers.map(userId => {
                                const userItem = users.find(u => u.id === userId);
                                return (
                                    <View key={userId} style={styles.selectedUser}>
                                        <Avatar
                                            uri={userItem?.image}
                                            size={hp(4)}
                                            rounded={theme.radius.md}
                                        />
                                        <Text style={styles.selectedUserName}>
                                            {userItem?.name}
                                        </Text>
                                        <TouchableOpacity
                                            onPress={() => toggleUserSelection(userId)}
                                            style={styles.removeButton}
                                        >
                                            <Icon name="close" size={hp(1.5)} color={theme.colors.textLight} />
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Users List */}
                <FlatList
                    data={filteredUsers}
                    keyExtractor={(item) => item.id}
                    renderItem={renderUser}
                    style={styles.usersList}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Icon
                                name="user"
                                size={hp(6)}
                                color={theme.colors.textLight}
                            />
                            <Text style={styles.emptyText}>
                                Không tìm thấy người dùng
                            </Text>
                        </View>
                    }
                />
            </View>
        </ScreenWrapper>
    );
};

export default NewChat;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: wp(4),
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(2),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.gray,
    },
    title: {
        flex: 1,
        fontSize: hp(2.2),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginLeft: wp(3),
    },
    createButton: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        borderRadius: theme.radius.lg,
    },
    disabledButton: {
        backgroundColor: theme.colors.gray,
    },
    createButtonText: {
        color: 'white',
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
    },
    disabledButtonText: {
        color: theme.colors.textLight,
    },
    typeToggle: {
        flexDirection: 'row',
        backgroundColor: theme.colors.gray,
        borderRadius: theme.radius.lg,
        padding: hp(0.5),
        marginVertical: hp(2),
    },
    typeButton: {
        flex: 1,
        paddingVertical: hp(1),
        alignItems: 'center',
        borderRadius: theme.radius.md,
    },
    activeTypeButton: {
        backgroundColor: theme.colors.primary,
    },
    typeButtonText: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.medium,
        color: theme.colors.textLight,
    },
    activeTypeButtonText: {
        color: 'white',
    },
    groupNameContainer: {
        marginBottom: hp(2),
    },
    groupNameInput: {
        backgroundColor: theme.colors.gray,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        borderRadius: theme.radius.lg,
        fontSize: hp(1.6),
        color: theme.colors.text,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.gray,
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
        borderRadius: theme.radius.lg,
        marginBottom: hp(2),
    },
    searchInput: {
        flex: 1,
        marginLeft: wp(2),
        fontSize: hp(1.6),
        color: theme.colors.text,
    },
    selectedContainer: {
        marginBottom: hp(2),
    },
    selectedTitle: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(1),
    },
    selectedUsers: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    selectedUser: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.primaryLight,
        paddingHorizontal: wp(2),
        paddingVertical: hp(0.5),
        borderRadius: theme.radius.lg,
        marginRight: wp(2),
        marginBottom: hp(0.5),
    },
    selectedUserName: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        marginLeft: wp(1),
        marginRight: wp(1),
    },
    removeButton: {
        padding: hp(0.2),
    },
    usersList: {
        flex: 1,
    },
    userItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(2),
        borderBottomWidth: 0.5,
        borderBottomColor: theme.colors.gray,
    },
    selectedUserItem: {
        backgroundColor: theme.colors.primaryLight,
    },
    userInfo: {
        flex: 1,
        marginLeft: wp(3),
    },
    userName: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.medium,
        color: theme.colors.text,
    },
    checkmark: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.full,
        width: hp(2.5),
        height: hp(2.5),
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: hp(10),
    },
    emptyText: {
        fontSize: hp(1.8),
        color: theme.colors.textLight,
        marginTop: hp(2),
    },
});
