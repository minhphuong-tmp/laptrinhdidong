import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Button, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import { fetchPost } from '../../services/postService';

import Icon from '../../assets/icons';
import Avatar from '../../components/Avatar';
import Loading from '../../components/Loading';
import PostCard from '../../components/PostCard';
import ScreenWrapper from '../../components/ScreenWrapper';
import { getUserData } from '../../services/userService';
var limit = 0;
const Home = () => {
    const { user, setAuth } = useAuth();
    // const user = '123';
    // console.log('user', user);
    const router = useRouter();
    const [hasMore, setHasMore] = useState(true);
    const onLogout = async () => {
        setAuth(null);
        const { error } = await supabase.auth.signOut();
        if (error) {
            Alert.alert('Logout', 'Error logging out. Please try again.');
        }
    }
    const [notificationCount, setNotificationCount] = useState(0);
    const [posts, setPosts] = useState([]);
    const [comment, setComment] = useState(0);
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
                        post.file = payload.new.file
                    };
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

    useEffect(() => {

        let postChannel = supabase
            .channel('posts')
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

        let notificationChannel = supabase
            .channel('notifications')
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


        let commentChannel = supabase
            .channel('comments123')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'comments',

            }, (payload) => {
                handleNewComment(payload)
            })
            .subscribe((status) => {
                console.log('commentChannel123 status:', status)
            })

        return () => {
            postChannel.unsubscribe(); // Đảm bảo unsubscribe trước
            notificationChannel.unsubscribe();
            commentChannel.unsubscribe();
            // supabase.removeChannel(commentChannel)
            // supabase.removeChannel(postChannel)
            // supabase.removeChannel(notificationChannel)


        }
    }, [])



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
        <ScreenWrapper bg="white">
            <View style={styles.container}>
                {/* header */}
                <View style={styles.header}>
                    <Text style={styles.title}>LinkUp</Text>
                    <View style={styles.icons}>
                        <Pressable onPress={() => router.push('chat')}>
                            <Icon name="chat" size={hp(3.2)} strokeWidth={2} color={theme.colors.text} />
                        </Pressable>
                        <Pressable onPress={() => {
                            setNotificationCount(0);
                            router.push('notifications')
                        }
                        }>
                            <Icon name="heart" size={hp(3.2)} strokeWidth={2} color={theme.colors.text} />
                            {
                                notificationCount > 0 && (
                                    <View style={styles.pill}>
                                        <Text style={styles.pillText}>{notificationCount}</Text>
                                    </View>
                                )
                            }
                        </Pressable>
                        <Pressable onPress={() => router.push('newPost')}>
                            <Icon name="plus" size={hp(3.2)} strokeWidth={2} color={theme.colors.text} />
                        </Pressable>
                        <Pressable onPress={() => router.push('profile')}>
                            <Avatar
                                uri={user?.image}
                                size={hp(4.3)}
                                rounded={theme.radius.sm}
                                style={{ borderWidth: 2 }}
                            />
                        </Pressable>

                    </View>
                </View>


                <FlatList
                    data={posts}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listStyle}
                    keyExtractor={(item) => item.id.toString()}
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

            <Button title="Đăng xuất" onPress={onLogout} />
        </ScreenWrapper>

        // <Text>Home</Text>

    )
}

export default Home

const styles = StyleSheet.create({

    container: {
        flex: 1,
        // paddingHorizontal: wp(4),
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        marginHorizontal: wp(4),
    },

    title: {
        color: theme.colors.text,
        fontSize: hp(3.2),
        fontWeight: theme.fonts.bold,
    },

    avatarImage: {
        height: hp(4.3),
        width: hp(4.3),
        borderRadius: theme.radius.sm,
        borderCurve: 'continuous',
        borderColor: theme.colors.gray,
        borderWidth: 3,
    },

    icons: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 18,
    },


    listStyle: {
        paddingTop: 20,
        paddingHorizontal: wp(4),
    },

    noPosts: {
        fontSize: hp(2),
        textAlign: 'center',
        color: theme.colors.text,
    },

    pill: {
        position: 'absolute',
        right: -10,
        top: -4,
        height: hp(2.2),
        width: hp(2.2),
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 20,
        backgroundColor: theme.colors.roseLight,
    },

    pillText: {
        color: 'white',
        fontSize: hp(1.2),
        fontWeight: theme.fonts.bold,
    },


})