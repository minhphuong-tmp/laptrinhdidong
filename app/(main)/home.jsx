import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    FlatList,
    Image,
    Modal,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import IncomingCallModal from '../../components/IncomingCallModal';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import CallManager from '../../services/callManager';
import { fetchPost } from '../../services/postService';

import Icon from '../../assets/icons';
import Loading from '../../components/Loading';
import PostCard from '../../components/PostCard';
import UserAvatar from '../../components/UserAvatar';
import { getUserData } from '../../services/userService';
var limit = 0;
const Home = () => {
    const { user, setAuth } = useAuth();
    const router = useRouter();

    // Lấy tên từ user_metadata
    const userName = user?.user_metadata?.name || user?.name || 'Unknown User';

    // States
    const [hasMore, setHasMore] = useState(true);
    const [notificationCount, setNotificationCount] = useState(0);
    const [posts, setPosts] = useState([]);
    const [comment, setComment] = useState(0);
    const [showMenu, setShowMenu] = useState(false);
    const [showCreatePost, setShowCreatePost] = useState(false);
    const [postContent, setPostContent] = useState('');
    const [incomingCall, setIncomingCall] = useState(null);
    const [showIncomingCall, setShowIncomingCall] = useState(false);
    const subscriptionsRef = useRef({}); // Track subscriptions
    const slideAnim = useRef(new Animated.Value(wp(80))).current; // Bắt đầu từ ngoài màn hình

    // Animate menu slide
    useEffect(() => {
        if (showMenu) {
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: wp(80),
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    }, [showMenu]);

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

    const handleCreatePost = async () => {
        // Chỉ chuyển hướng sang trang tạo bài viết
        router.push('newPost');
    };

    // Handle incoming call
    const handleAnswerCall = async () => {
        if (!incomingCall) return;

        try {
            setShowIncomingCall(false);
            router.push({
                pathname: '/callScreen',
                params: {
                    callType: incomingCall.call_type,
                    callId: incomingCall.id,
                    conversationId: incomingCall.conversation_id,
                    isIncoming: true,
                    callerName: incomingCall.caller?.name || 'Unknown',
                    callerAvatar: incomingCall.caller?.image
                }
            });
        } catch (error) {
            console.error('Answer call error:', error);
        }
    };

    const handleDeclineCall = async () => {
        if (!incomingCall) return;

        try {
            await CallManager.declineCall(incomingCall.id);
            setShowIncomingCall(false);
            setIncomingCall(null);
        } catch (error) {
            console.error('Decline call error:', error);
        }
    };

    const handlePostEvent = async (payload) => {
        console.log('got new post', payload.new);
        if (payload.eventType === 'INSERT' && payload.new?.id) {
            let newPost = { ...payload.new };
            let res = await getUserData(newPost.userId);
            newPost.comments = [];
            newPost.likes = [{ count: 0 }];
            newPost.user = res.success ? res.data : {};
            setPosts(prevPosts => [newPost, ...prevPosts]);
        }
        if (payload.eventType === 'DELETE' && payload.old?.id) {
            setPosts(prevPosts => {
                let updatedPosts = prevPosts.filter(post => post.id !== payload.old.id);
                return updatedPosts;
            });
        }
        if (payload.eventType === 'UPDATE' && payload.new?.id) {
            setPosts(prevPosts => {
                let updatedPosts = prevPosts.map(post => {
                    if (post.id === payload.new.id) {
                        post.body = payload.new.body;
                        post.file = payload.new.file;
                    }
                    return post;
                });
                return updatedPosts;
            });
        }
    };

    const handleNewNotification = async (payload) => {
        console.log('got new notification', payload.new);
        if (payload.eventType === 'INSERT' && payload.new?.id) {
            setNotificationCount(prevCount => prevCount + 1);
        }

    }
    const handleNewComment = async (payload) => {
        console.log('got new comment123', payload.new);
        if (payload.eventType === 'INSERT' && payload.new?.id) {
            setPosts(prevPosts => {
                return prevPosts.map(post => {
                    if (post.id === payload.new.postId) {
                        const updatedComments = [...post.comments];

                        // Nếu chưa có comment nào, tạo object đầu tiên với count = 1
                        if (updatedComments.length === 0) {
                            updatedComments.push({ count: 1 });
                            updatedComments.push(payload.new);
                        } else {
                            // Cập nhật count trong comments[0]
                            updatedComments[0] = {
                                ...updatedComments[0],
                                count: (updatedComments[0].count || 0) + 1
                            };
                            // Thêm comment mới
                            updatedComments.push(payload.new);
                        }
                        console.log('Post comments sau khi update:', updatedComments);

                        return {
                            ...post,
                            comments: updatedComments
                        };
                    }
                    return post;
                });
            });
        }
    };

    // Initialize CallManager
    useEffect(() => {
        if (!user?.id) return;

        const initializeCallManager = async () => {
            try {
                await CallManager.initialize(user.id, {
                    onIncomingCall: (callData) => {
                        console.log('Incoming call:', callData);
                        setIncomingCall(callData);
                        setShowIncomingCall(true);
                    },
                    onCallEnded: (callData) => {
                        console.log('Call ended:', callData);
                        setShowIncomingCall(false);
                        setIncomingCall(null);
                    }
                });
            } catch (error) {
                console.error('CallManager initialization error:', error);
            }
        };

        initializeCallManager();

        return () => {
            CallManager.destroy();
        };
    }, [user?.id]);

    useEffect(() => {
        if (!user?.id) return; // Chỉ setup khi có user

        // Cleanup existing subscriptions first
        Object.values(subscriptionsRef.current).forEach(channel => {
            if (channel && typeof channel.unsubscribe === 'function') {
                channel.unsubscribe();
            }
        });
        subscriptionsRef.current = {};

        console.log('Setting up home subscriptions for user:', user.id);

        const postChannel = supabase
            .channel(`posts-${user.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'posts'
            }, (payload) => {
                handlePostEvent(payload)
            })
            .subscribe((status) => {
                console.log('postChannel status:', status)
            })

        const notificationChannel = supabase
            .channel(`notifications-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `receiverId=eq.${user.id}`

            }, (payload) => {
                handleNewNotification(payload)
            })
            .subscribe((status) => {
                console.log('notificationChanel status:', status)
            })

        const commentChannel = supabase
            .channel(`comments-${user.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'comments',

            }, (payload) => {
                handleNewComment(payload)
            })
            .subscribe((status) => {
                console.log('commentChannel status:', status)
            })

        // Store channels in ref
        subscriptionsRef.current = {
            postChannel,
            notificationChannel,
            commentChannel
        };

        return () => {
            console.log('Cleaning up home subscriptions for user:', user.id);
            Object.values(subscriptionsRef.current).forEach(channel => {
                if (channel && typeof channel.unsubscribe === 'function') {
                    channel.unsubscribe();
                }
            });
            subscriptionsRef.current = {};
        }
    }, [user?.id])

    // Load posts when component mounts
    useEffect(() => {
        if (user?.id) {
            getPosts();
        }
    }, [user?.id]);

    const getPosts = async () => {
        limit = limit + 4;
        if (!hasMore) return null;
        let res = await fetchPost(limit);
        if (res.success) {
            if (posts.length === res.data.length) setHasMore(false);
            setPosts(res.data);
        }
    }


    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundSecondary }}>
            <View style={styles.container}>
                {/* Facebook Header */}
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        <Image
                            source={require('../../assets/images/logokma.jpg')}
                            style={styles.logoImage}
                            resizeMode="contain"
                        />
                        <Text style={styles.logo}>KMA</Text>
                    </View>
                    <View style={styles.headerRight}>
                        <TouchableOpacity
                            style={styles.headerIcon}
                            onPress={() => {
                                setNotificationCount(0);
                                router.push('notifications');
                            }}
                        >
                            <Icon name="zap" size={hp(2.8)} color={theme.colors.text} />
                            {notificationCount > 0 && (
                                <View style={styles.notificationBadge}>
                                    <Text style={styles.notificationText}>{notificationCount}</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.headerIcon}
                            onPress={() => router.push('chatList')}
                        >
                            <Icon name="chat" size={hp(2.8)} color={theme.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => router.push('profile')}>
                            <UserAvatar
                                user={user}
                                size={hp(3.5)}
                                rounded={theme.radius.full}
                            />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.menuButton}
                            onPress={() => setShowMenu(true)}
                        >
                            <Text style={styles.menuText}>☰</Text>
                        </TouchableOpacity>
                    </View>
                </View>


                {/* Posts Feed */}
                <FlatList
                    data={posts}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listStyle}
                    keyExtractor={(item) => item.id.toString()}
                    ListHeaderComponent={() => (
                        <View style={styles.createPostContainer}>
                            <View style={styles.createPostBox}>
                                <UserAvatar user={user} size={hp(4)} rounded={theme.radius.full} />
                                <View style={styles.createPostInputArea}>
                                    <TouchableOpacity
                                        style={styles.createPostPlaceholder}
                                        onPress={handleCreatePost}
                                    >
                                        <Text style={styles.createPostPlaceholderText}>Bạn đang nghĩ gì?</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    )}
                    renderItem={({ item }) => {
                        return <PostCard
                            item={item}
                            currentUser={user}
                            router={router} />
                    }}
                    onEndReached={() => {
                        getPosts();
                    }}
                    onEndReachedThreshold={0.3}
                    ListFooterComponent={hasMore ? (
                        <View style={{ marginVertical: posts.length == 0 ? 200 : 30 }}>
                            <Loading />
                        </View>
                    ) : (
                        <View style={{ marginVertical: 30 }}>
                            <Text style={styles.noPosts}>Không còn bài đăng</Text>
                        </View>
                    )}
                />
            </View>

            {/* Menu Drawer */}
            <Modal
                visible={showMenu}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowMenu(false)}
            >
                <TouchableWithoutFeedback onPress={() => setShowMenu(false)}>
                    <SafeAreaView style={styles.menuOverlay}>
                        <View style={styles.menuBackdrop} />
                        <TouchableWithoutFeedback onPress={() => { }}>
                            <Animated.View style={[styles.menuContainer, { transform: [{ translateX: slideAnim }] }]}>
                                {/* Menu Header */}
                                <View style={styles.menuHeader}>
                                    <View style={styles.menuUserInfo}>
                                        <UserAvatar
                                            user={user}
                                            size={hp(5)}
                                            rounded={theme.radius.full}
                                        />
                                        <View style={styles.menuUserDetails}>
                                            <Text style={styles.menuUserName}>{user?.name || 'User'}</Text>
                                            <Text style={styles.menuUserEmail}>{user?.email || 'user@example.com'}</Text>
                                        </View>
                                    </View>
                                </View>

                                {/* Menu Items */}
                                <View style={styles.menuItems}>
                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('profile');
                                        }}
                                    >
                                        <Icon name="user" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Trang cá nhân</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('todo');
                                        }}
                                    >
                                        <Icon name="todo" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Ghi chú</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('stats');
                                        }}
                                    >
                                        <Icon name="stats" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Thống kê</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('chatList');
                                        }}
                                    >
                                        <Icon name="chat" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Tin nhắn</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('newChat');
                                        }}
                                    >
                                        <Icon name="messageCircle" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Tạo cuộc trò chuyện</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Footer */}
                                <View style={styles.menuFooter}>
                                    <TouchableOpacity
                                        style={[styles.menuItem, styles.logoutItem]}
                                        onPress={() => {
                                            setShowMenu(false);
                                            onLogout();
                                        }}
                                    >
                                        <Icon name="logOut" size={hp(2.5)} color={theme.colors.error} />
                                        <Text style={[styles.menuItemText, styles.logoutText]}>Đăng xuất</Text>
                                    </TouchableOpacity>
                                </View>
                            </Animated.View>
                        </TouchableWithoutFeedback>
                    </SafeAreaView>
                </TouchableWithoutFeedback>
            </Modal>

            {/* Create Post Modal */}
            <Modal
                visible={showCreatePost}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowCreatePost(false)}
            >
                <View style={styles.createPostOverlay}>
                    <Pressable
                        style={styles.createPostBackdrop}
                        onPress={() => setShowCreatePost(false)}
                    />
                    <View style={styles.createPostModal}>
                        {/* Modal Header */}
                        <View style={styles.createPostHeader}>
                            <TouchableOpacity
                                style={styles.createPostCancel}
                                onPress={() => setShowCreatePost(false)}
                            >
                                <Text style={styles.createPostCancelText}>Hủy</Text>
                            </TouchableOpacity>
                            <Text style={styles.createPostTitle}>Tạo bài viết</Text>
                            <TouchableOpacity
                                style={styles.createPostShare}
                                onPress={handleCreatePost}
                            >
                                <Text style={styles.createPostShareText}>Đăng</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Modal Content */}
                        <View style={styles.createPostContent}>
                            <View style={styles.createPostUser}>
                                <UserAvatar user={user} size={hp(4)} rounded={theme.radius.full} />
                                <Text style={styles.createPostUserName}>{user?.name || 'User'}</Text>
                            </View>

                            <TextInput
                                style={styles.createPostTextInput}
                                value={postContent}
                                onChangeText={setPostContent}
                                placeholder="Bạn đang nghĩ gì?"
                                placeholderTextColor={theme.colors.textSecondary}
                                multiline
                                textAlignVertical="top"
                            />
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Incoming Call Modal */}
            <IncomingCallModal
                visible={showIncomingCall}
                callData={incomingCall}
                onAnswer={handleAnswerCall}
                onDecline={handleDeclineCall}
            />

        </SafeAreaView>
    )
}

export default Home

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.backgroundSecondary,
    },

    // Header Styles
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        ...theme.shadows.small,
    },

    headerLeft: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },

    logo: {
        fontSize: hp(2.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.primary,
        marginLeft: wp(2),
    },
    logoImage: {
        width: hp(2.5),
        height: hp(2.5),
    },

    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(3),
    },

    headerIcon: {
        padding: wp(2),
        position: 'relative',
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
        marginHorizontal: wp(1),
        justifyContent: 'center',
        alignItems: 'center',
    },

    notificationBadge: {
        position: 'absolute',
        top: 0,
        right: 0,
        backgroundColor: theme.colors.error,
        borderRadius: theme.radius.full,
        minWidth: hp(2),
        height: hp(2),
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: wp(1),
    },

    notificationText: {
        color: 'white',
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
    },

    bellText: {
        fontSize: hp(2.5),
        color: theme.colors.text,
    },

    bellEmoji: {
        fontSize: hp(2.8),
        color: theme.colors.text,
    },

    bellIcon: {
        width: hp(2.8),
        height: hp(2.8),
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    bellTop: {
        width: hp(1.2),
        height: hp(0.4),
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: theme.colors.text,
        borderRadius: hp(0.2),
        position: 'absolute',
        top: hp(0.2),
        left: hp(0.8),
    },
    bellBody: {
        width: hp(2.2),
        height: hp(1.6),
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: theme.colors.text,
        borderRadius: hp(1.1),
        position: 'absolute',
        top: hp(0.5),
        left: hp(0.3),
        // Tạo hình chuông với viền cong
        borderTopLeftRadius: hp(1.1),
        borderTopRightRadius: hp(1.1),
        borderBottomLeftRadius: hp(0.3),
        borderBottomRightRadius: hp(0.3),
    },
    bellClapper: {
        width: hp(0.3),
        height: hp(0.3),
        backgroundColor: theme.colors.text,
        borderRadius: hp(0.15),
        position: 'absolute',
        top: hp(1.4),
        left: hp(1.25),
    },
    bellCrack: {
        width: hp(0.1),
        height: hp(0.8),
        backgroundColor: theme.colors.text,
        position: 'absolute',
        top: hp(0.7),
        left: hp(1.35),
        transform: [{ rotate: '15deg' }],
    },

    // Stories Styles
    storiesContainer: {
        backgroundColor: theme.colors.background,
        paddingVertical: hp(1),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },

    storiesScroll: {
        paddingHorizontal: wp(4),
    },

    storyItem: {
        alignItems: 'center',
        marginRight: wp(4),
    },

    addStoryIcon: {
        width: hp(6),
        height: hp(6),
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.backgroundSecondary,
        borderWidth: 2,
        borderColor: theme.colors.primary,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },

    storyText: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        marginTop: hp(0.5),
        fontWeight: theme.fonts.medium,
    },

    // Create Post Styles
    createPostContainer: {
        backgroundColor: theme.colors.background,
        paddingBottom: hp(2),
    },

    createPostBox: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
        ...theme.shadows.small,
        marginHorizontal: wp(4),
        marginVertical: hp(1),
    },

    createPostInputArea: {
        flex: 1,
        marginLeft: wp(3),
    },

    createPostUserName: {
        fontSize: hp(1.4),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginBottom: hp(0.5),
    },

    createPostPlaceholder: {
        paddingVertical: hp(1.2),
        justifyContent: 'center',
    },

    createPostPlaceholderText: {
        fontSize: hp(1.6),
        color: theme.colors.textLight,
    },

    createPostForm: {
        padding: wp(3),
        paddingTop: hp(1),
    },

    createPostFormHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(2),
    },

    createPostFormUserName: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginLeft: wp(3),
    },

    createPostTextInput: {
        fontSize: hp(1.8),
        color: theme.colors.text,
        minHeight: hp(10),
        textAlignVertical: 'top',
        marginBottom: hp(2),
        paddingHorizontal: wp(3),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },

    createPostFormActions: {
        marginBottom: hp(2),
        paddingVertical: hp(1),
        borderTopWidth: 1,
        borderColor: theme.colors.border,
    },

    createPostFormAction: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.sm,
        marginBottom: hp(0.5),
    },

    createPostFormActionIcon: {
        width: hp(3.5),
        height: hp(3.5),
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.backgroundSecondary,
        justifyContent: 'center',
        alignItems: 'center',
    },

    createPostFormActionText: {
        fontSize: hp(1.5),
        color: theme.colors.text,
        marginLeft: wp(2),
        fontWeight: theme.fonts.medium,
    },

    createPostFormFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: wp(3),
        paddingTop: hp(1),
    },

    createPostFormCancel: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.2),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
    },

    createPostFormCancelText: {
        fontSize: hp(1.5),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },

    createPostFormSubmit: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.2),
        borderRadius: theme.radius.sm,
        ...theme.shadows.small,
    },

    createPostFormSubmitDisabled: {
        backgroundColor: theme.colors.textLight,
        ...theme.shadows.small,
    },

    createPostFormSubmitText: {
        fontSize: hp(1.5),
        color: 'white',
        fontWeight: theme.fonts.bold,
    },

    // Inline Form Styles
    createPostFormInline: {
        paddingTop: hp(0.5),
    },

    createPostTextInputInline: {
        fontSize: hp(1.8),
        color: theme.colors.text,
        minHeight: hp(8),
        textAlignVertical: 'top',
        marginBottom: hp(1.5),
        paddingHorizontal: wp(2),
        paddingVertical: hp(1),
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: theme.colors.border,
    },




    createPostFormFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: wp(3),
        paddingTop: hp(1),
    },

    createPostFormCancel: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.2),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
    },

    createPostFormCancelText: {
        fontSize: hp(1.5),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },

    createPostFormSubmit: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.2),
        borderRadius: theme.radius.sm,
        ...theme.shadows.small,
    },

    createPostFormSubmitDisabled: {
        backgroundColor: theme.colors.textLight,
        ...theme.shadows.small,
    },

    createPostFormSubmitText: {
        fontSize: hp(1.5),
        color: 'white',
        fontWeight: theme.fonts.bold,
    },


    createPostIcon: {
        padding: wp(2),
    },


    createPostActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(4),
    },

    createPostAction: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(3),
        paddingVertical: hp(0.8),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.full,
    },

    createPostActionText: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        marginLeft: wp(1.5),
        fontWeight: theme.fonts.medium,
    },


    // Post Creation Form Styles
    postCreationForm: {
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.md,
        marginTop: hp(1),
        marginHorizontal: wp(2),
        ...theme.shadows.small,
        zIndex: 1000,
    },

    postFormInline: {
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.md,
        marginTop: hp(1),
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
    },


    postFormTextInput: {
        fontSize: hp(1.8),
        color: theme.colors.text,
        minHeight: hp(12),
        textAlignVertical: 'top',
        marginBottom: hp(2),
        paddingHorizontal: wp(3),
        paddingVertical: hp(1.5),
        backgroundColor: theme.colors.background,
        borderRadius: theme.radius.sm,
    },

    postFormActions: {
        marginBottom: hp(2),
        paddingVertical: hp(1),
        borderTopWidth: 1,
        borderColor: theme.colors.border,
    },

    postFormAction: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(3),
        paddingVertical: hp(1),
    },

    postFormActionText: {
        fontSize: hp(1.4),
        color: theme.colors.text,
        marginLeft: wp(1.5),
        fontWeight: theme.fonts.medium,
    },

    postFormFooter: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: wp(3),
    },

    postFormCancel: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },

    postFormCancelText: {
        fontSize: hp(1.6),
        color: theme.colors.textSecondary,
    },

    postFormSubmit: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
        borderRadius: theme.radius.sm,
    },

    postFormSubmitDisabled: {
        backgroundColor: theme.colors.textLight,
    },

    postFormSubmitText: {
        fontSize: hp(1.6),
        color: 'white',
        fontWeight: theme.fonts.bold,
    },

    // Create Post Modal Styles
    createPostOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },

    createPostBackdrop: {
        flex: 1,
    },

    createPostModal: {
        backgroundColor: theme.colors.background,
        borderTopLeftRadius: theme.radius.xl,
        borderTopRightRadius: theme.radius.xl,
        maxHeight: hp(80),
    },

    createPostHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },

    createPostCancel: {
        paddingVertical: hp(0.5),
    },

    createPostCancelText: {
        fontSize: hp(1.6),
        color: theme.colors.textSecondary,
    },

    createPostTitle: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },

    createPostShare: {
        paddingVertical: hp(0.5),
        paddingHorizontal: wp(3),
        backgroundColor: theme.colors.primary,
        borderRadius: theme.radius.sm,
    },

    createPostShareText: {
        fontSize: hp(1.6),
        color: 'white',
        fontWeight: theme.fonts.bold,
    },

    createPostContent: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
    },

    createPostUser: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: hp(2),
    },

    createPostUserName: {
        fontSize: hp(1.6),
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
        marginLeft: wp(3),
    },

    createPostTextInput: {
        fontSize: hp(1.8),
        color: theme.colors.text,
        minHeight: hp(20),
        textAlignVertical: 'top',
        padding: 0,
        margin: 0,
    },

    // List Styles
    listStyle: {
        paddingBottom: hp(10),
    },

    noPosts: {
        textAlign: 'center',
        fontSize: hp(1.8),
        color: theme.colors.textSecondary,
        marginTop: hp(2),
    },

    // Menu Styles
    menuButton: {
        padding: wp(2),
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.sm,
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuIconContainer: {
        width: hp(2.5),
        height: hp(2),
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    menuLine: {
        width: hp(2),
        height: 3,
        backgroundColor: theme.colors.text,
        borderRadius: 1.5,
    },
    menuText: {
        fontSize: hp(2.5),
        color: theme.colors.text,
        fontWeight: 'bold',
    },

    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end', // Đẩy menu về phía phải
        paddingTop: 0, // Để SafeAreaView handle
    },

    menuBackdrop: {
        flex: 1,
    },

    menuContainer: {
        width: wp(80),
        height: '100%',
        backgroundColor: theme.colors.background,
        ...theme.shadows.large,
        justifyContent: 'space-between',
    },

    menuHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.primary,
    },

    menuUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },

    menuUserDetails: {
        marginLeft: wp(3),
        flex: 1,
    },

    menuUserName: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semiBold,
        color: 'white',
        marginBottom: hp(0.2),
    },

    menuUserEmail: {
        fontSize: hp(1.4),
        color: 'rgba(255, 255, 255, 0.8)',
    },

    menuCloseButton: {
        padding: wp(2),
    },

    menuItems: {
        paddingVertical: hp(1),
        flex: 1,
    },

    menuFooter: {
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
        paddingVertical: hp(1),
    },

    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },

    menuItemText: {
        fontSize: hp(1.6),
        color: theme.colors.text,
        marginLeft: wp(3),
        fontWeight: theme.fonts.medium,
    },

    menuDivider: {
        height: 1,
        backgroundColor: theme.colors.border,
        marginVertical: hp(1),
    },

    logoutItem: {
        borderBottomWidth: 0,
    },

    logoutText: {
        color: theme.colors.error,
    },
})