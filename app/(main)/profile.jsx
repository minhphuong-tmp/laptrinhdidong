import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from '../../assets/icons';
import Header from '../../components/Header';
import Loading from '../../components/Loading';
import PostCard from '../../components/PostCard';
import ScreenWrapper from '../../components/ScreenWrapper';
import UserAvatar from '../../components/UserAvatar';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import { fetchPost } from '../../services/postService';
var limit = 0;
const Profile = () => {
    const { user, setAuth } = useAuth();
    const router = useRouter();

    const [hasMore, setHasMore] = useState(true);
    const [posts, setPosts] = useState([]);
    const [userInfo, setUserInfo] = useState(null);

    // Lấy thông tin user từ database
    useEffect(() => {
        const getUserInfo = async () => {
            if (user?.id) {
                try {
                    const { data } = await supabase
                        .from('users')
                        .select('name, address, phone, image')
                        .eq('id', user.id)
                        .single();

                    if (data) {
                        setUserInfo(data);
                    }
                } catch (error) {
                    console.log('Error getting user info:', error);
                }
            }
        };

        getUserInfo();
    }, [user?.id]);

    const onLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                Alert.alert('Lỗi', 'Không thể đăng xuất. Vui lòng thử lại.');
            }
            // Không cần setAuth(null) vì AuthContext sẽ tự động handle
        } catch (error) {
            console.log('Logout error:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi đăng xuất');
        }
    }

    const getPosts = async () => {
        limit = limit + 4;
        if (!hasMore || !user?.id) return null;
        let res = await fetchPost(limit, user.id);
        if (res.success) {
            if (posts.length === res.data.length) setHasMore(false);
            setPosts(res.data);
        }
    }


    const handleLogout = async () => {
        // show confirm modal
        Alert.alert(
            'Xác nhận',
            'Bạn có chắc muốn đăng xuất ?',
            [
                {
                    text: 'Hủy',
                    onPress: () => console.log('modal cancelled'),
                    style: 'cancel',
                },
                {
                    text: 'Đăng xuất',
                    onPress: () => onLogout(),
                    style: 'destructive',
                }
            ]
        );
    }

    return (
        <ScreenWrapper bg="white" >
            <FlatList
                data={posts}
                ListHeaderComponent={user ? <UserHeader user={user} userInfo={userInfo} router={router} handleLogout={handleLogout} /> : null}
                ListHeaderComponentStyle={{ marginBottom: 30 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.listStyle}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => {
                    if (!user) return null;
                    return <PostCard
                        item={item}
                        currentUser={user}
                        router={router} />
                }}
                onEndReached={() => {
                    if (user?.id) {
                        getPosts();
                    }
                }}
                onEndReachedThreshold={0.3}
                ListFooterComponent={hasMore ? (

                    <View style={{ marginVertical: posts.length == 0 ? 100 : 30 }}>
                        <Loading />
                    </View>

                ) : (
                    <View style={{ marginVertical: 30 }}>
                        <Text style={styles.noPosts}>Không còn bài đăng</Text>
                    </View>
                )}
            />
        </ScreenWrapper>
    );
};

const UserHeader = ({ user, userInfo, router, handleLogout }) => {
    return (
        <View style={{ flex: 1, backgroundColor: 'white', paddingHorizontal: wp(3) }}>
            <View>
                <Header title="Hồ sơ" mb={30} />
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Icon name="logout" color={theme.colors.rose} />
                </TouchableOpacity>
            </View>


            <View style={styles.container}>
                <View style={{ gap: 15 }}>
                    <View style={styles.avatarContainer}>
                        <UserAvatar
                            user={user}
                            size={hp(12)}
                            rounded={theme.radius.xxl * 1.4}
                        />
                        <Pressable style={styles.editIcon} onPress={() => router.push('editProfile')}>
                            <Icon name="edit" strokeWidth={2.5} size={20} />
                        </Pressable>

                    </View>

                    {/* username and address */}
                    <View style={{ alignItems: 'center', gap: 4 }}>

                        <Text style={styles.userName}>
                            {userInfo?.name || user?.user_metadata?.name || user?.name || 'User'}
                        </Text>

                        <Text style={styles.infoText}>
                            {userInfo?.address || user?.address || ''}
                        </Text>
                    </View>

                    <View style={{ gap: 10 }}>
                        <View style={styles.info}>
                            <Icon name="mail" size={20} color={theme.colors.textLight}>

                            </Icon>
                            <Text style={styles.infoText}>
                                {user?.email || 'Chưa cập nhật email'}
                            </Text>



                        </View>

                    </View>
                    <View style={{ gap: 10 }}>
                        <View style={styles.info}>
                            <Icon name="call" size={20} color={theme.colors.textLight}>
                            </Icon>
                            <Text style={styles.infoText}>
                                {userInfo?.phone || user?.phoneNumber || 'Chưa cập nhật số điện thoại'}
                            </Text>
                        </View>
                    </View>
                    {
                        user && user.bio && (

                            <Text style={styles.infoText} > {user.bio}
                            </Text>
                        )
                    }

                </View>

            </View>

        </View>


    );
};

export default Profile;

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },

    headerContainer: {
        marginHorizontal: wp(4),
        marginBottom: 20,
    },

    headerShape: {
        width: wp(100),
        height: hp(20),
    },

    avatarContainer: {
        height: hp(12),
        width: hp(12),
        alignSelf: 'center',
    },

    editIcon: {
        position: 'absolute',
        bottom: 0,
        right: -12,
        padding: 7,
        borderRadius: 50,
        backgroundColor: 'white',
        shadowColor: theme.colors.textLight,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
        elevation: 7,
    },

    userName: {
        fontSize: hp(3),
        fontWeight: '500',
        color: theme.colors.textDark,
    },

    info: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },

    infoText: {
        fontSize: hp(1.6),
        fontWeight: '500',
        color: theme.colors.textLight,
    },

    logoutButton: {
        position: 'absolute',
        right: 0,
        padding: 5,
        borderRadius: theme.radius.sm,
        backgroundColor: '#fee2e2',
    },

    listStyle: {
        paddingHorizontal: wp(4),
        paddingBottom: 30,
    },

    noPosts: {
        fontSize: hp(2),
        textAlign: 'center',
        color: theme.colors.text,
    }

});
