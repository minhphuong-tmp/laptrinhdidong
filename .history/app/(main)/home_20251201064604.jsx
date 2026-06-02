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
import AsyncStorage from '@react-native-async-storage/async-storage'; 
import IncomingCallModal from '../../components/IncomingCallModal';
import AppHeader from '../../components/AppHeader';
import PostCard from '../../components/PostCard';
import UserAvatar from '../../components/UserAvatar';
import Icon from '../../assets/icons'; 
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase'; 
import { fetchPost } from '../../services/postService';
import { getUserData } from '../../services/userService';
import { CallManager } from '../../services/callManager'; 
import * as notificationService from '../../services/notificationService'; 

var limit = 0;
const Home = () => {
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
            // Reload notifications để có dữ liệu mới nhất
            loadNotifications();
        }

    }

    // Load notifications từ database
    const loadNotifications = async () => {
        if (!user?.id) return;

        try {
            const data = await notificationService.getPersonalNotifications(user.id);
            setNotifications(data);

            // Đếm số thông báo chưa đọc (mặc định tất cả đều chưa đọc vì không có trường is_read)
            // TODO: Khi có trường is_read, thay đổi logic này
            const unreadCount = data.length;
            setNotificationCount(unreadCount);
        } catch (error) {
            console.log('Error in loadNotifications:', error);
            // Fallback: set empty array nếu có lỗi
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
            console.log('Scrolling to post:', scrollToPostId, 'Type:', typeof scrollToPostId);

            // Tìm index của post cần scroll đến (convert cả 2 về string để so sánh)
            const postIndex = posts.findIndex(post => String(post.id) === String(scrollToPostId));

            if (postIndex !== -1) {
                console.log('Found post at index:', postIndex);

                // Scroll đến post với animation
                setTimeout(() => {
                    flatListRef.current?.scrollToIndex({
                        index: postIndex,
                        animated: true,
                        viewPosition: 0.5, // Scroll để post ở giữa màn hình
                    });
                }, 500); // Delay để đảm bảo FlatList đã render xong
            } else {
                console.log('Post not found in current posts list');
                console.log('Available post IDs:', posts.map(p => `${p.id} (${typeof p.id})`));
                console.log('Looking for:', scrollToPostId, `(${typeof scrollToPostId})`);
            }

            setScrollToPostId(null); // Reset sau khi xử lý
        }
    }, [scrollToPostId, posts]);

    // Kiểm tra AsyncStorage khi posts load xong để scroll đến post
    useEffect(() => {
        const checkScrollAfterPostsLoad = async () => {
            if (posts.length > 0) {
                try {
                    const postId = await AsyncStorage.getItem('scrollToPostId');
                    if (postId) {
                        console.log('Posts loaded, scrolling to post:', postId);
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
                        console.log('Found postId to scroll to:', postId);
                        if (commentId) {
                            console.log('Found commentId to scroll to:', commentId);
                        }

                        // Chỉ set scrollToPostId nếu posts đã có dữ liệu
                        if (posts.length > 0) {
                            setScrollToPostId(postId);
                        } else {
                            // Nếu posts chưa load, lưu lại để scroll sau
                            console.log('Posts not loaded yet, will scroll after posts load');
                        }

                        // Xóa khỏi AsyncStorage sau khi đã xử lý
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
                        // Fallback: scroll to offset
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

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('members');
                                        }}
                                    >
                                        <Icon name="users" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Thành viên</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('activities');
                                        }}
                                    >
                                        <Icon name="activity" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Hoạt động</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('documents');
                                        }}
                                    >
                                        <Icon name="file-text" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Tài liệu</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('notifications');
                                        }}
                                    >
                                        <Icon name="megaphone" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Thông báo CLB</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('events');
                                        }}
                                    >
                                        <Icon name="calendar" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Lịch sự kiện</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('leaderboard');
                                        }}
                                    >
                                        <Icon name="award" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Bảng xếp hạng</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('finance');
                                        }}
                                    >
                                        <Icon name="dollar-sign" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Quản lý tài chính</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('contact');
                                        }}
                                    >
                                        <Icon name="phone" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Liên hệ và hỗ trợ</Text>
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

// const PAGE_SIZE = 5; // Số lượng bài viết tải mỗi lần

// const Home = () => {
//     const { user, setAuth } = useAuth();
//     const router = useRouter();

//     // --- REFS & ANIMATIONS ---
//     const flatListRef = useRef(null);
//     const subscriptionsRef = useRef({});
//     const slideAnim = useRef(new Animated.Value(wp(80))).current;
    
//     // Thay vì biến global 'limit', dùng ref để quản lý việc load trang
//     const offsetRef = useRef(0);
//     const userCacheRef = useRef({}); // Cache thông tin user để tránh N+1 request

//     // --- STATES ---
//     const [posts, setPosts] = useState([]);
//     const [hasMore, setHasMore] = useState(true);
//     const [isLoading, setIsLoading] = useState(false); // Trạng thái đang load thêm
//     const [notificationCount, setNotificationCount] = useState(0);
//     const [scrollToPostId, setScrollToPostId] = useState(null);
    
//     // UI States
//     const [showMenu, setShowMenu] = useState(false);
//     const [showCreatePost, setShowCreatePost] = useState(false);
//     const [postContent, setPostContent] = useState('');
//     const [showIncomingCall, setShowIncomingCall] = useState(false);
//     const [incomingCall, setIncomingCall] = useState(null);
//     const [notifications, setNotifications] = useState([]);

//     // --- ANIMATION MENU ---
//     useEffect(() => {
//         Animated.timing(slideAnim, {
//             toValue: showMenu ? 0 : wp(80),
//             duration: 300,
//             useNativeDriver: true,
//         }).start();
//     }, [showMenu]);

//     // --- DATA FETCHING LOGIC (TỐI ƯU) ---
    
//     // Hàm lấy bài viết tối ưu hóa Pagination
//     const getPosts = async (isRefresh = false) => {
//         if (isLoading) return;
//         if (!hasMore && !isRefresh) return;

//         setIsLoading(true);
//         try {
//             // Nếu refresh thì reset offset về 0, ngược lại dùng offset hiện tại
//             const currentOffset = isRefresh ? 0 : offsetRef.current;
            
//             // Giả sử API fetchPost nhận (offset, limit). 
//             // Nếu API cũ của bạn là fetchPost(totalLimit), hãy sửa API backend để nhận offset/limit sẽ tốt hơn.
//             // Ở đây tôi giả định bạn sửa API để nhận pageSize.
//             let res = await fetchPost(currentOffset, PAGE_SIZE);

//             if (res.success) {
//                 const newPosts = res.data;
                
//                 if (newPosts.length < PAGE_SIZE) {
//                     setHasMore(false);
//                 }

//                 if (isRefresh) {
//                     setPosts(newPosts);
//                     offsetRef.current = newPosts.length;
//                     setHasMore(true); // Reset hasMore khi refresh
//                 } else {
//                     // Nối mảng cũ và mới thay vì thay thế toàn bộ
//                     setPosts(prev => [...prev, ...newPosts]);
//                     offsetRef.current += newPosts.length;
//                 }
//             }
//         } catch (error) {
//             console.error('Get posts error:', error);
//         } finally {
//             setIsLoading(false);
//         }
//     };

//     // --- REALTIME HANDLERS (TỐI ƯU CACHE) ---
//     const handlePostEvent = async (payload) => {
//         console.log('got new post', payload.new);
        
//         if (payload.eventType === 'INSERT' && payload.new?.id) {
//             let newPost = { ...payload.new };
            
//             // TỐI ƯU N+1: Kiểm tra cache trước
//             if (userCacheRef.current[newPost.userId]) {
//                 newPost.user = userCacheRef.current[newPost.userId];
//             } else {
//                 // Nếu chưa có trong cache mới gọi API
//                 let res = await getUserData(newPost.userId);
//                 if (res.success) {
//                     newPost.user = res.data;
//                     // Lưu vào cache cho lần sau
//                     userCacheRef.current[newPost.userId] = res.data;
//                 } else {
//                     newPost.user = {};
//                 }
//             }

//             newPost.comments = [];
//             newPost.likes = [{ count: 0 }];
            
//             // Thêm vào đầu danh sách
//             setPosts(prevPosts => [newPost, ...prevPosts]);
//             // Tăng offset để không bị lệch khi load more
//             offsetRef.current += 1;
//         }

//         if (payload.eventType === 'DELETE' && payload.old?.id) {
//             setPosts(prevPosts => prevPosts.filter(post => post.id !== payload.old.id));
//             offsetRef.current = Math.max(0, offsetRef.current - 1);
//         }

//         if (payload.eventType === 'UPDATE' && payload.new?.id) {
//             setPosts(prevPosts => prevPosts.map(post => {
//                 if (post.id === payload.new.id) {
//                     return { ...post, body: payload.new.body, file: payload.new.file };
//                 }
//                 return post;
//             }));
//         }
//     };

//     // ... (Giữ nguyên handleNewNotification, handleNewComment)
//     const handleNewNotification = async (payload) => {
//         if (payload.eventType === 'INSERT' && payload.new?.id) {
//             setNotificationCount(prev => prev + 1);
//             loadNotifications();
//         }
//     }

//     const handleNewComment = async (payload) => {
//          if (payload.eventType === 'INSERT' && payload.new?.id) {
//             setPosts(prevPosts => prevPosts.map(post => {
//                 if (post.id === payload.new.postId) {
//                     const updatedComments = [...post.comments];
//                     if (updatedComments.length === 0) {
//                         updatedComments.push({ count: 1 });
//                         updatedComments.push(payload.new);
//                     } else {
//                         updatedComments[0] = {
//                             ...updatedComments[0],
//                             count: (updatedComments[0].count || 0) + 1
//                         };
//                         updatedComments.push(payload.new);
//                     }
//                     return { ...post, comments: updatedComments };
//                 }
//                 return post;
//             }));
//         }
//     }

//     // --- OTHER LOGIC (Giữ nguyên: Logout, Call, Notification, Scroll...) ---
//     const onLogout = async () => { /* ... code cũ ... */ }
//     const handleCreatePost = async () => { router.push('newPost'); };
//     const handleAnswerCall = async () => { /* ... code cũ ... */ };
//     const handleDeclineCall = async () => { /* ... code cũ ... */ };
//     const loadNotifications = async () => { /* ... code cũ ... */ };

//     // Initialize CallManager & Subscriptions & Initial Load
//     useEffect(() => {
//         if (user?.id) {
//             getPosts(true); // Load lần đầu
//             loadNotifications();
//             // ... (Logic init CallManager & Supabase Subscriptions giữ nguyên như cũ)
//             // Lưu ý: Copy lại phần useEffect subscriptions và CallManager của bạn vào đây
//         }
//     }, [user?.id]);

//     useFocusEffect(useCallback(() => { loadNotifications(); }, [user?.id]));

//     // --- FLATLIST OPTIMIZATION PROPS ---
//     // Giúp FlatList tính toán chiều cao tĩnh, không cần đo đạc động -> Tăng tốc scroll cực nhiều
//     const getItemLayout = useCallback((data, index) => ({
//         length: 400, // Chiều cao ước lượng của PostCard (pixel). Cố gắng chỉnh số này gần đúng thực tế nhất.
//         offset: 400 * index,
//         index,
//     }), []);

//     const renderFooter = () => {
//         if (!isLoading) return <View style={{ height: 50 }} />;
//         return (
//             <View style={{ paddingVertical: 20 }}>
//                 <ActivityIndicator size="small" color={theme.colors.primary} />
//             </View>
//         );
//     };

//     return (
//         <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.backgroundSecondary }}>
//             <View style={styles.container}>
//                 <AppHeader
//                     notificationCount={notificationCount}
//                     onNotificationPress={() => router.push('personalNotifications')}
//                     onMenuPress={() => setShowMenu(true)}
//                 />

//                 <FlatList
//                     ref={flatListRef}
//                     data={posts}
//                     showsVerticalScrollIndicator={false}
//                     contentContainerStyle={styles.listStyle}
//                     keyExtractor={(item) => `post-${item.id}`} // Key ngắn gọn hơn
                    
//                     // --- CÁC THAM SỐ TỐI ƯU HÓA QUAN TRỌNG ---
//                     initialNumToRender={4}      // Chỉ render 4 post đầu tiên khi mở app
//                     maxToRenderPerBatch={4}     // Mỗi lần scroll chỉ render thêm 4 post
//                     windowSize={5}              // Giữ trong bộ nhớ khoảng 5 màn hình chiều dài (giảm RAM)
//                     removeClippedSubviews={true} // Gỡ bỏ view bị khuất (Android cực quan trọng)
//                     getItemLayout={getItemLayout} // Bỏ qua bước đo kích thước layout
//                     // -----------------------------------------

//                     ListHeaderComponent={() => (
//                         <View style={styles.createPostContainer}>
//                             {/* ... Code header create post cũ ... */}
//                              <View style={styles.createPostBox}>
//                                 <UserAvatar user={user} size={hp(4)} rounded={theme.radius.full} />
//                                 <View style={styles.createPostInputArea}>
//                                     <TouchableOpacity style={styles.createPostPlaceholder} onPress={handleCreatePost}>
//                                         <Text style={styles.createPostPlaceholderText}>Bạn đang nghĩ gì?</Text>
//                                     </TouchableOpacity>
//                                 </View>
//                             </View>
//                         </View>
//                     )}
//                     renderItem={({ item }) => (
//                         // Component này nên được bọc React.memo ở file gốc
//                         <PostCard item={item} currentUser={user} router={router} />
//                     )}
//                     onEndReached={() => getPosts(false)} // Load thêm khi cuộn xuống
//                     onEndReachedThreshold={0.5}
//                     ListFooterComponent={renderFooter}
//                 />
//             </View>

//             {/* --- MODALS (Giữ nguyên code modal Menu, CreatePost, Call) --- */}
//             <Modal visible={showMenu} transparent={true} animationType="fade" onRequestClose={() => setShowMenu(false)}>
//                 {/* ... Copy lại nội dung Menu Modal cũ ... */}
//             </Modal>

//             <Modal visible={showCreatePost} transparent={true} animationType="slide" onRequestClose={() => setShowCreatePost(false)}>
//                {/* ... Copy lại nội dung Create Post Modal cũ ... */}
//             </Modal>
            
//              {/* Giả sử IncomingCallModal được import */}
//             {showIncomingCall && (
//                  <IncomingCallModal
//                     visible={showIncomingCall}
//                     callData={incomingCall}
//                     onAnswer={handleAnswerCall}
//                     onDecline={handleDeclineCall}
//                 />
//             )}
//         </SafeAreaView>
//     );
// };

export default Home

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.backgroundSecondary,
        paddingTop: 35, // Consistent padding top
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

    chatNotificationBadge: {
        position: 'absolute',
        top: -hp(0.5),
        right: -hp(0.5),
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
        paddingTop: 35, // Consistent padding top
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
        paddingTop: hp(3), // Thêm padding top
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