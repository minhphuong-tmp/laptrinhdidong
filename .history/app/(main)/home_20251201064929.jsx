import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
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

// --- Components ---
import Icon from '../../assets/icons'; // Kiểm tra lại đường dẫn nếu file icon của bạn ở chỗ khác
import AppHeader from '../../components/AppHeader';
import IncomingCallModal from '../../components/IncomingCallModal';
import PostCard from '../../components/PostCard';
import UserAvatar from '../../components/UserAvatar';

// --- Config & Helpers ---
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';

// --- Services ---
import { fetchPost } from '../../services/postService';
import { getUserData } from '../../services/userService';
// Sửa lỗi import CallManager (Bỏ ngoặc nhọn nếu là export default, hoặc giữ nguyên nếu là export const)
// Thường các service viết class sẽ là export default
import CallManager from '../../services/callManager';
import * as notificationService from '../../services/notificationService';

var limit = 0;

const Home = () => {
    const { user, setAuth } = useAuth();
    const router = useRouter();

    // Lấy tên từ user_metadata
    const userName = user?.user_metadata?.name || user?.name || 'Unknown User';

    // States
    const [hasMore, setHasMore] = useState(true);
    const [notificationCount, setNotificationCount] = useState(0);
    const [scrollToPostId, setScrollToPostId] = useState(null);
    const [posts, setPosts] = useState([]);
    const flatListRef = useRef(null);
    const [comment, setComment] = useState(0);
    const [showMenu, setShowMenu] = useState(false);
    const [showCreatePost, setShowCreatePost] = useState(false);
    const [postContent, setPostContent] = useState('');
    const [incomingCall, setIncomingCall] = useState(null);
    const [showIncomingCall, setShowIncomingCall] = useState(false);
    const [notifications, setNotifications] = useState([]);
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
        } catch (error) {
            console.log('Logout error:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi đăng xuất');
        }
    }

    const handleCreatePost = async () => {
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
            loadNotifications();
        }

    }

    // Load notifications từ database
    const loadNotifications = async () => {
        if (!user?.id) return;

        try {
            const data = await notificationService.getPersonalNotifications(user.id);
            setNotifications(data);
            const unreadCount = data.length;
            setNotificationCount(unreadCount);
        } catch (error) {
            console.log('Error in loadNotifications:', error);
            setNotifications([]);
            setNotificationCount(0);
        }
    };

    // Reload notifications khi quay lại từ personalNotifications
    useFocusEffect(
        useCallback(() => {
            loadNotifications();
        }, [user?.id])
    );

    // Xử lý scroll đến post cụ thể khi có scrollToPostId
    useEffect(() => {
        if (scrollToPostId && flatListRef.current && posts.length > 0) {
            const postIndex = posts.findIndex(post => String(post.id) === String(scrollToPostId));

            if (postIndex !== -1) {
                setTimeout(() => {
                    flatListRef.current?.scrollToIndex({
                        index: postIndex,
                        animated: true,
                        viewPosition: 0.5,
                    });
                }, 500);
            }
            setScrollToPostId(null);
        }
    }, [scrollToPostId, posts]);

    // Kiểm tra AsyncStorage khi posts load xong để scroll đến post
    useEffect(() => {
        const checkScrollAfterPostsLoad = async () => {
            if (posts.length > 0) {
                try {
                    const postId = await AsyncStorage.getItem('scrollToPostId');
                    if (postId) {
                        setScrollToPostId(postId);
                    }
                } catch (error) {
                    console.log('Error checking scroll after posts load:', error);
                }
            }
        };

        checkScrollAfterPostsLoad();
    }, [posts.length]);

    // Kiểm tra AsyncStorage khi focus để scroll đến post
    useFocusEffect(
        useCallback(() => {
            const checkScrollToPost = async () => {
                try {
                    const postId = await AsyncStorage.getItem('scrollToPostId');
                    const commentId = await AsyncStorage.getItem('scrollToCommentId');

                    if (postId) {
                        if (posts.length > 0) {
                            setScrollToPostId(postId);
                        }
                        await AsyncStorage.removeItem('scrollToPostId');
                        await AsyncStorage.removeItem('scrollToCommentId');
                    }
                } catch (error) {
                    console.log('Error checking scrollToPost:', error);
                }
            };

            checkScrollToPost();
        }, [posts])
    );
    const handleNewComment = async (payload) => {
        console.log('got new comment123', payload.new);
        if (payload.eventType === 'INSERT' && payload.new?.id) {
            setPosts(prevPosts => {
                return prevPosts.map(post => {
                    if (post.id === payload.new.postId) {
                        const updatedComments = [...post.comments];
                        if (updatedComments.length === 0) {
                            updatedComments.push({ count: 1 });
                            updatedComments.push(payload.new);
                        } else {
                            updatedComments[0] = {
                                ...updatedComments[0],
                                count: (updatedComments[0].count || 0) + 1
                            };
                            updatedComments.push(payload.new);
                        }
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
        if (!user?.id) return; 

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
                filter: `receiver_id=eq.${user.id}`

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
            loadNotifications();
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
                {/* App Header */}
                <AppHeader
                    notificationCount={notificationCount}
                    onNotificationPress={() => router.push('personalNotifications')}
                    onMenuPress={() => setShowMenu(true)}
                />

                {/* Posts Feed */}
                <FlatList
                    ref={flatListRef}
                    data={posts}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listStyle}
                    keyExtractor={(item, index) => `post-${item.id}-${index}-${item.created_at || Date.now()}`}
                    onScrollToIndexFailed={(info) => {
                        console.log('Scroll to index failed:', info);
                        setTimeout(() => {
                            flatListRef.current?.scrollToOffset({
                                offset: info.averageItemLength * info.index,
                                animated: true,
                            });
                        }, 100);
                    }}
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
                            <ActivityIndicator size="large" color={theme.colors.primary} />
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

                                    {/* Các item menu khác của bạn... */}
                                    <TouchableOpacity style={styles.menuItem} onPress={() => { setShowMenu(false); router.push('notifications'); }}>
                                        <Icon name="megaphone" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Thông báo CLB</Text>
                                    </TouchableOpacity>
                                    
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
                        <View style={styles.createPostHeader}>
                            <TouchableOpacity style={styles.createPostCancel} onPress={() => setShowCreatePost(false)}>
                                <Text style={styles.createPostCancelText}>Hủy</Text>
                            </TouchableOpacity>
                            <Text style={styles.createPostTitle}>Tạo bài viết</Text>
                            <TouchableOpacity style={styles.createPostShare} onPress={handleCreatePost}>
                                <Text style={styles.createPostShareText}>Đăng</Text>
                            </TouchableOpacity>
                        </View>
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
} // <--- DẤU NGOẶC QUAN TRỌNG ĐÓNG COMPONENT

export default Home

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.backgroundSecondary,
        paddingTop: 35,
    },
    // ... Copy lại toàn bộ styles cũ của bạn vào đây ...
    // Để cho gọn tôi không copy lại hàng trăm dòng styles, 
    // bạn hãy paste phần styles cũ của bạn vào đây
    listStyle: {
        paddingBottom: hp(10),
    },
    noPosts: {
        textAlign: 'center',
        fontSize: hp(1.8),
        color: theme.colors.textSecondary,
        marginTop: hp(2),
    },
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
    createPostPlaceholder: {
        paddingVertical: hp(1.2),
        justifyContent: 'center',
    },
    createPostPlaceholderText: {
        fontSize: hp(1.6),
        color: theme.colors.textLight,
    },
    // ... Các styles cho Menu, Modal ...
    menuOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-start',
        alignItems: 'flex-end',
        paddingTop: 35,
    },
    menuBackdrop: { flex: 1 },
    menuContainer: {
        width: wp(80),
        height: '100%',
        backgroundColor: theme.colors.background,
        ...theme.shadows.large,
        justifyContent: 'space-between',
    },
    menuHeader: {
        flexDirection: 'row',
        paddingHorizontal: wp(4),
        paddingVertical: hp(2),
        paddingTop: hp(3),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.primary,
    },
    menuUserInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    menuUserDetails: { marginLeft: wp(3), flex: 1 },
    menuUserName: { fontSize: hp(1.8), fontWeight: theme.fonts.semiBold, color: 'white' },
    menuUserEmail: { fontSize: hp(1.4), color: 'rgba(255, 255, 255, 0.8)' },
    menuItems: { paddingVertical: hp(1), flex: 1 },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    menuItemText: { fontSize: hp(1.6), color: theme.colors.text, marginLeft: wp(3) },
    menuFooter: { borderTopWidth: 1, borderTopColor: theme.colors.border, paddingVertical: hp(1) },
    logoutItem: { borderBottomWidth: 0 },
    logoutText: { color: theme.colors.error },
    createPostOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
    createPostBackdrop: { flex: 1 },
    createPostModal: { backgroundColor: theme.colors.background, borderTopLeftRadius: theme.radius.xl, borderTopRightRadius: theme.radius.xl, maxHeight: hp(80) },
    createPostHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: wp(4), borderBottomWidth: 1, borderColor: theme.colors.border },
    createPostTitle: { fontSize: hp(1.8), fontWeight: 'bold' },
    createPostContent: { padding: wp(4) },
    createPostUser: { flexDirection: 'row', alignItems: 'center', marginBottom: hp(2) },
    createPostUserName: { marginLeft: wp(3), fontWeight: 'bold' },
    createPostTextInput: { fontSize: hp(1.8), minHeight: hp(20), textAlignVertical: 'top' },
    createPostCancelText: { color: theme.colors.textSecondary },
    createPostShareText: { color: theme.colors.primary, fontWeight: 'bold' }
})