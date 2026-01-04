import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    AppState,
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
import Loading from '../../components/Loading';
import { notificationService } from '../../services/notificationService';
import { fetchPost } from '../../services/postService';
import { predictionService } from '../../services/predictionService';
import { prefetchService } from '../../services/prefetchService';
import { unreadService } from '../../services/unreadService';
import { getUserData } from '../../services/userService';
// Sửa lỗi import CallManager (Bỏ ngoặc nhọn nếu là export default, hoặc giữ nguyên nếu là export const)
// Thường các service viết class sẽ là export default
import CallManager from '../../services/callManager';

var limit = 0;

const Home = () => {
    const { user, setAuth } = useAuth();
    const router = useRouter();

    // Lấy tên từ user_metadata hoặc database
    const [userInfo, setUserInfo] = useState(null);

    // Fetch user info from database
    useEffect(() => {
        const fetchUserInfo = async () => {
            if (user?.id) {
                try {
                    const { data, error } = await supabase
                        .from('users')
                        .select('name, email, image')
                        .eq('id', user.id)
                        .single();

                    if (!error && data) {
                        setUserInfo(data);
                    }
                } catch (error) {
                    console.log('Error fetching user info:', error);
                }
            }
        };

        fetchUserInfo();
    }, [user?.id]);

    // Lấy tên từ database, user_metadata, hoặc user object
    const userName = userInfo?.name || user?.user_metadata?.name || user?.name || 'User';

    // States
    const [hasMore, setHasMore] = useState(true);
    const [notificationCount, setNotificationCount] = useState(0);
    const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
    const [scrollToPostId, setScrollToPostId] = useState(null);
    const [posts, setPosts] = useState([]);
    const behaviorLoggedRef = useRef(false); // Track đã log behavior chưa
    const appStateRef = useRef(AppState.currentState); // Track app state
    const isAppRestartRef = useRef(false); // Track nếu app vừa được mở lại
    const hasPrefetchedRef = useRef(false); // Track đã prefetch chưa (chỉ prefetch 1 lần trong session)
    const hasPrefetchedCheckedRef = useRef(false); // Track đã check AsyncStorage chưa
    const shouldPrefetchRef = useRef(false); // Flag để trigger prefetch khi app quay lại
    const cacheClearedOnMountRef = useRef(false); // Track đã xóa cache khi mount chưa
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
        if (payload.eventType === 'INSERT' && payload.new?.id) {
            // Chỉ cập nhật unread count, KHÔNG động vào cache
            // Cache sẽ được cập nhật khi vào màn hình PersonalNotifications
            setNotificationCount(prevCount => prevCount + 1);
            loadNotifications();
        }
    }

    const handleNotificationUpdate = async (payload) => {
        // Khi notification được update (thường là is_read thay đổi), reload để update count
        if (payload.eventType === 'UPDATE' && payload.new?.id) {
            // Reload notifications để cập nhật count chính xác
            loadNotifications();
        }
    }

    // Load notifications từ database
    const loadNotifications = async () => {
        if (!user?.id) return 0;

        try {
            const data = await notificationService.getPersonalNotifications(user.id);
            setNotifications(data);

            // Đếm số thông báo chưa đọc (filter isRead = false)
            const unreadCount = data.filter(notification => !(notification.isRead || notification.is_read)).length;
            setNotificationCount(unreadCount);
            return unreadCount;
        } catch (error) {
            console.log('Error in loadNotifications:', error);
            setNotifications([]);
            setNotificationCount(0);
            return 0;
        }
    };

    // Load unread messages count
    const loadUnreadMessagesCount = async () => {
        if (!user?.id) {
            return 0;
        }

        try {
            const count = await unreadService.getUnreadMessagesCount(user.id);
            const finalCount = count || 0;
            setUnreadMessagesCount(finalCount);
            return finalCount;
        } catch (error) {
            setUnreadMessagesCount(0);
            return 0;
        }
    };

    // Reload notifications và unread messages count khi quay lại từ personalNotifications
    useFocusEffect(
        useCallback(() => {
            // Kiểm tra user trước khi truy cập user.id
            if (!user?.id) return;

            // Chỉ reload unread count từ database, KHÔNG reload toàn bộ notifications
            // (vì reload từ cache sẽ làm mất unread count từ realtime)
            Promise.all([
                unreadService.getUnreadNotificationsCount(user.id), // Chỉ lấy unread count, không reload notifications
                loadUnreadMessagesCount()
            ]).then(([unreadNotificationsCount, unreadMessagesCount]) => {
                // Cập nhật unread count từ database (không reload toàn bộ notifications)
                setNotificationCount(unreadNotificationsCount || 0);
            });

            // Check cache hiện tại khi quay lại home (không cache lại)
            const checkCacheOnFocus = async () => {
                // Kiểm tra user trước khi truy cập user.id
                if (!user?.id) return;

                try {
                    // Log hành vi người dùng từ bảng user_behavior
                    try {
                        const { data: userBehavior, error: behaviorError } = await supabase
                            .from('user_behavior')
                            .select('screen_name, visit_count')
                            .eq('user_id', user.id)
                            .order('visit_count', { ascending: false });

                        if (!behaviorError && userBehavior && userBehavior.length > 0) {
                            // Format: loại bỏ 'home' và tạo object JSON
                            const behaviorObject = {};
                            userBehavior
                                .filter(item => item.screen_name !== 'home')
                                .forEach(item => {
                                    behaviorObject[item.screen_name] = item.visit_count;
                                });

                            if (Object.keys(behaviorObject).length > 0) {
                                console.log(` [Hành vi người dùng]:`, JSON.stringify(behaviorObject, null, 2));
                            }
                        }
                    } catch (e) {
                        // Silent
                    }

                    // Log cache hiện tại
                    await prefetchService.checkCurrentCache(user.id);
                } catch (error) {
                    console.log('[Home] Error checking cache:', error);
                }
            };

            // Delay một chút để không block UI
            const timer = setTimeout(() => {
                checkCacheOnFocus();
            }, 500);

            return () => clearTimeout(timer);
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
                handleNewNotification(payload);
            })
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'notifications',
                filter: `receiverId=eq.${user.id}`
            }, (payload) => {
                // Khi có notification được update (mark as read), reload để update count
                handleNotificationUpdate(payload);
            })
            .subscribe()

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
            if (user?.id) {
                console.log('Cleaning up home subscriptions for user:', user.id);
            }
            Object.values(subscriptionsRef.current).forEach(channel => {
                if (channel && typeof channel.unsubscribe === 'function') {
                    channel.unsubscribe();
                }
            });
            subscriptionsRef.current = {};
        }
    }, [user?.id])

    // Xóa cache khi app reload (mount lần đầu)
    useEffect(() => {
        if (!user?.id || cacheClearedOnMountRef.current) return;

        const clearCacheOnReload = async () => {
            try {
                const { clearAllCache } = require('../../utils/cacheHelper');
                await clearAllCache(user.id);
                // Reset prefetch flag để prefetch lại sau khi reload
                hasPrefetchedRef.current = false;
                hasPrefetchedCheckedRef.current = false;
                await AsyncStorage.removeItem(`hasPrefetched_${user.id}`);
                cacheClearedOnMountRef.current = true; // Đánh dấu đã xóa cache
                console.log('[Home] Đã xóa cache và reset prefetch flag khi reload app');
            } catch (error) {
                console.log('[Home] Lỗi khi xóa cache khi reload:', error);
            }
        };

        clearCacheOnReload();
    }, [user?.id]); // Chỉ chạy 1 lần khi user.id thay đổi (reload app)

    // Load posts when component mounts
    useEffect(() => {
        if (user?.id) {
            getPosts();

            // Load và đợi cả hai hàm hoàn thành trước khi log
            Promise.all([
                loadNotifications(),
                loadUnreadMessagesCount()
            ]);
        }
    }, [user?.id]);

    // Detect app state change: clear cache khi thoát app, prefetch lại khi vào lại
    useEffect(() => {
        if (!user?.id) return;

        const subscription = AppState.addEventListener('change', async (nextAppState) => {
            const previousState = appStateRef.current;
            appStateRef.current = nextAppState;

            // Khi app chuyển sang background hoặc inactive → clear cache và reset prefetch flag
            if (previousState === 'active' && (nextAppState === 'background' || nextAppState === 'inactive')) {
                console.log('[Home] App chuyển sang background, đang xóa cache...');
                try {
                    const { clearAllCache } = require('../../utils/cacheHelper');
                    await clearAllCache(user.id);
                    // Reset prefetch flag để prefetch lại khi vào app
                    hasPrefetchedRef.current = false;
                    hasPrefetchedCheckedRef.current = false;
                    await AsyncStorage.removeItem(`hasPrefetched_${user.id}`);
                    console.log('[Home] Đã xóa cache và reset prefetch flag');
                } catch (error) {
                    console.log('[Home] Lỗi khi xóa cache:', error);
                }
            }

            // Khi app quay lại active → prefetch lại cache
            if (previousState !== 'active' && nextAppState === 'active') {
                console.log('[Home] App quay lại active, sẽ prefetch lại cache...');
                // Reset flag để prefetch lại
                hasPrefetchedRef.current = false;
                hasPrefetchedCheckedRef.current = false;
                shouldPrefetchRef.current = true; // Trigger prefetch


                if (posts.length > 0) {

                    setTimeout(() => {

                        const triggerPrefetch = async () => {
                            try {
                                const unreadMessagesCount = await unreadService.getUnreadMessagesCount(user.id);
                                const unreadNotificationsCount = await unreadService.getUnreadNotificationsCount(user.id);
                                const prefetchScreens = [];
                                if (unreadMessagesCount > 0) {
                                    prefetchScreens.push({ screen: 'chatList', priority: 1 });
                                }
                                if (unreadNotificationsCount > 0) {
                                    prefetchScreens.push({ screen: 'personalNotifications', priority: 1 });
                                }
                                const predictions = await predictionService.getPredictions(user.id);

                                //lấy ra các màn hình đã unread load ở prefetchscreen
                                const existingScreens = new Set(prefetchScreens.map(p => p.screen));


                                const topPredictions = predictions
                                    .filter(p => !existingScreens.has(p.screen))
                                    .slice(0, 3 - prefetchScreens.length);
                                //gộp lại và chỉ lấy tối đa 3 màn hình
                                const finalPrefetch = [...prefetchScreens, ...topPredictions].slice(0, 3);
                                hasPrefetchedRef.current = true;

                                await AsyncStorage.setItem(`hasPrefetched_${user.id}`, 'true');

                                prefetchService.smartPrefetch(user.id, finalPrefetch);
                            } catch (error) {
                                console.log('[Home] Error triggering prefetch on app resume:', error);
                            }
                        };
                        triggerPrefetch();
                    }, 500);
                }
            }
        });

        return () => {
            subscription?.remove();
        };
    }, [user?.id]);

    // Prefetch sau khi posts load xong
    useEffect(() => {
        if (!user?.id || posts.length === 0) return;

        // Nếu đã prefetch rồi và không có flag trigger, không làm gì nữa
        if (hasPrefetchedRef.current && !shouldPrefetchRef.current) return;

        // Reset trigger flag nếu đã trigger
        if (shouldPrefetchRef.current) {
            shouldPrefetchRef.current = false;
        }

        let unsubscribe = null;

        // Setup realtime subscription cho unread
        unsubscribe = unreadService.setupRealtimeSubscription(
            user.id,
            async () => {
                // Khi có update unread → Chỉ reload unread messages count
                // KHÔNG reload notifications (vì handleNewNotification đã cập nhật unread count rồi)
                // KHÔNG prefetch (prefetch chỉ chạy lần đầu khi vào app)
                await loadUnreadMessagesCount();
                // Bỏ loadNotifications() để tránh reload từ cache làm unread count bị giảm
            }
        );

        // Initial prefetch sau khi load xong posts (background)
        // Prefetch lại mỗi khi vào app (cache đã bị xóa khi thoát app)
        const initialPrefetch = async () => {
            try {
                // Kiểm tra AsyncStorage xem đã prefetch chưa trong session hiện tại
                // (không persist qua các lần thoát app vì cache đã bị xóa)
                if (!hasPrefetchedCheckedRef.current) {
                    const prefetchedFlag = await AsyncStorage.getItem(`hasPrefetched_${user.id}`);
                    if (prefetchedFlag === 'true') {
                        hasPrefetchedRef.current = true;
                    }
                    hasPrefetchedCheckedRef.current = true;
                }

                // Nếu đã prefetch rồi trong session này, không prefetch nữa
                if (hasPrefetchedRef.current) {
                    console.log('[Home] Đã prefetch trong session này, không cần prefetch lại');
                    return;
                }

                // Kiểm tra unread để ưu tiên prefetch
                const unreadMessagesCount = await unreadService.getUnreadMessagesCount(user.id);
                const unreadNotificationsCount = await unreadService.getUnreadNotificationsCount(user.id);

                // Tạo danh sách prefetch ưu tiên
                const prefetchScreens = [];

                // Ưu tiên 1: chatList nếu có unread messages
                if (unreadMessagesCount > 0) {
                    prefetchScreens.push({ screen: 'chatList', priority: 1 });
                }

                // Ưu tiên 2: personalNotifications nếu có unread notifications
                if (unreadNotificationsCount > 0) {
                    prefetchScreens.push({ screen: 'personalNotifications', priority: 1 });
                }

                // Lấy top predictions để fill đến 3 màn hình (loại bỏ những cái đã có unread)
                const predictions = await predictionService.getPredictions(user.id);
                const existingScreens = new Set(prefetchScreens.map(p => p.screen));
                const topPredictions = predictions
                    .filter(p => !existingScreens.has(p.screen))
                    .slice(0, 3 - prefetchScreens.length);

                // Gộp lại, tối đa 3 cái
                const finalPrefetch = [...prefetchScreens, ...topPredictions].slice(0, 3);

                // Đảm bảo chỉ có tối đa 3 màn hình
                if (finalPrefetch.length > 3) {
                    console.log('[Warning] Prefetch có hơn 3 màn hình, chỉ lấy 3 màn hình đầu tiên');
                    finalPrefetch.splice(3);
                }

                // Đánh dấu đã prefetch để không prefetch lại (persist qua các lần navigate)
                hasPrefetchedRef.current = true;
                await AsyncStorage.setItem(`hasPrefetched_${user.id}`, 'true');

                prefetchService.smartPrefetch(user.id, finalPrefetch);
            } catch (error) {
                console.log('[Home] Error in initial prefetch:', error);
            }
        };

        // Delay một chút để không block UI
        const timer = setTimeout(() => {
            initialPrefetch();
        }, 1000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearTimeout(timer);
        };
    }, [user?.id, posts.length]);

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
        <View style={styles.container}>
            {/* App Header */}
            <AppHeader
                notificationCount={notificationCount}
                unreadMessagesCount={unreadMessagesCount}
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
                renderItem={({ item, index }) => {
                    return <PostCard
                        item={item}
                        currentUser={user}
                        router={router}
                        index={index} />
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
                                            <Text style={styles.menuUserName}>{userName}</Text>
                                            <Text style={styles.menuUserEmail}>{userInfo?.email || user?.email || 'user@example.com'}</Text>
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
                                            router.push('documents');
                                        }}
                                    >
                                        <Icon name="file-text" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>Tài liệu CLB</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('test');
                                        }}
                                    >
                                        <Icon name="code" size={hp(2.5)} color={theme.colors.text} />
                                        <Text style={styles.menuItemText}>TEST</Text>
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                        style={styles.menuItem}
                                        onPress={() => {
                                            setShowMenu(false);
                                            router.push('newChat');
                                        }}
                                    >
                                        <Icon name="message-circle" size={hp(2.5)} color={theme.colors.text} />
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
                                        <Icon name="logout" size={hp(2.5)} color={theme.colors.error} />
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

        </View>
    )
} // <--- DẤU NGOẶC QUAN TRỌNG ĐÓNG COMPONENT

export default Home

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 35, // Giống trang thông báo CLB
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