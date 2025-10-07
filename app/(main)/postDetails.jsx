import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Icon from '../../assets/icons';
import CommentItem from '../../components/CommentItem';
import Input from '../../components/Input';
import Loading from '../../components/Loading';
import PostCard from '../../components/PostCard';
import { theme } from '../../constants/theme';
import { useAuth } from '../../context/AuthContext';
import { hp, wp } from '../../helpers/common';
import { supabase } from '../../lib/supabase';
import { createNotification } from '../../services/notificationService';
import { createComment, fetchPostDetails, removeComment, removePost } from '../../services/postService';
import { getUserData } from '../../services/userService';
const PostDetails = () => {
    const { postId, commentId } = useLocalSearchParams();
    const { user } = useAuth();
    const router = useRouter();
    const [StartLoading, setStartLoading] = useState(true);
    const [post, setPost] = useState(null);
    const inputRef = useRef(null);
    const commentRef = useRef('');
    const [loading, setLoading] = useState(false);



    const handleNewComment = async (payload) => {
        if (payload.new) {
            let newComment = { ...payload.new };
            let res = await getUserData(newComment.userId);

            newComment.user = res.success ? res.data : {};
            setPost(prevPost => {
                return {
                    ...prevPost,
                    comments: [newComment, ...prevPost.comments]
                }
            })
        }
    }
    useEffect(() => {
        if (!postId) return;

        let commentChannel = supabase
            .channel(`comments-${postId}`) // Unique channel name
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'comments',
                filter: `postId=eq.${postId}`
            }, handleNewComment)
            .subscribe((status) => {
                console.log('🔄 Comment subscription status:', status);
            });
        getPostDetails();

        return () => {
            console.log('Cleaning up comment subscription');
            commentChannel.unsubscribe();
        }
    }, [postId]);



    // useFocusEffect(
    //     useCallback(() => {
    //         console.log(`💬 Post details focused for post ${postId}`)

    //         const setupCommentChannel = async () => {
    //             try {
    //                 const channelName = `comments-${postId}`

    //                 await realtimeManager.subscribe(
    //                     channelName,
    //                     {
    //                         event: '*',
    //                         schema: 'public',
    //                         table: 'comments',
    //                         filter: `post_id=eq.${postId}`
    //                     },
    //                     (payload) => {
    //                         console.log('💬 Comment event:', payload)
    //                         handleCommentEvent(payload)
    //                     }
    //                 )

    //                 console.log(`✅ Comment channel setup completed: ${channelName}`)

    //             } catch (error) {
    //                 console.error('❌ Failed to setup comment channel:', error)
    //             }
    //         }

    //         setupCommentChannel()

    //         return async () => {
    //             console.log(`💬 Post details unfocused for post ${postId}`)
    //             const channelName = `comments-${postId}`

    //             try {
    //                 await realtimeManager.unsubscribe(channelName)
    //                 console.log(`✅ Comment channel cleaned up: ${channelName}`)
    //             } catch (error) {
    //                 console.error('❌ Failed to cleanup comment channel:', error)
    //             }
    //         }
    //     }, [postId])
    // )


    const getPostDetails = async () => {
        let res = await fetchPostDetails(postId);
        if (res.success) {
            setPost(res.data);

        }
        setStartLoading(false);
    }
    const onNewComment = async () => {
        if (!commentRef.current) return null;
        let data = {
            postId: post?.id,
            userId: user?.id,
            text: commentRef.current
        }

        setLoading(true);
        let res = await createComment(data);
        setLoading(false);
        if (res.success) {
            if (user.id != post.userId) {
                let notify = {
                    senderId: user.id,
                    receiverId: post.userId,
                    title: 'Đã bình luận vào bài viết của bạn',
                    data: JSON.stringify({
                        postId: post.id,
                        commentId: res.data.id
                    })
                }
                createNotification(notify);
            }
            commentRef.current = '';
            inputRef.current?.clear();
        } else {
            Alert.alert('Error', res.msg);
        }

    }
    const onDeleteComment = async (comment) => {
        let res = await removeComment(comment?.id);
        if (res.success) {
            setPost(prevPost => {
                let updatedPost = { ...prevPost };
                updatedPost.comments = updatedPost.comments.filter(c => c.id != comment.id);
                return updatedPost;
            });
        } else {
            Alert.alert('Bình luận', res.msg);
        }
    }
    const onDeletePost = async (item) => {
        let res = await removePost(item?.id);
        if (res.success) {
            router.back();
        } else {
            Alert.alert('Error', res.msg);
        }


    }
    const onEditPost = async (item) => {
        console.log('editing post: ', item);
    }
    if (StartLoading) {
        return (
            <View style={styles.center}>
                <Loading />

            </View>
        )
    }
    if (!post) {
        return (
            <View style={[styles.center, { justifyContent: 'flex-start', marginTop: 100 }]}>
                <Text style={styles.notFound}>
                    Không tìm thấy bài đăng
                </Text>
            </View>
        )
    }
    return (
        <View style={styles.container}>

            <ScrollView showVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
                <PostCard
                    item={{ ...post, comments: [{ count: post?.comments?.length }] }}
                    currentUser={user}
                    router={router}
                    hasShawdow={false}
                    showMoreIcon={false}
                    showDelete={true}
                    onDelete={onDeletePost}
                    onEdit={onEditPost}



                >

                </PostCard>
                <View style={styles.inputContainer}>
                    <View style={{ flex: 1 }}>
                        <Input
                            inputRef={inputRef}
                            placeholder="Nhập bình luận..."
                            onChangeText={value => commentRef.current = value}
                            placeholderTextColor={theme.colors.textLight}
                            containerStyle={{ flex: 1, height: hp(6.2), borderRadius: theme.radius.xl }}
                        />
                    </View>

                    {
                        loading ? (
                            <View style={styles.loading}>
                                <Loading size="small" />
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.sendIcon} onPress={onNewComment}>
                                <Icon name="send" color={theme.colors.primaryDark} />
                            </TouchableOpacity>
                        )
                    }
                </View>
                <View style={{ marginVertical: 15, gap: 17 }}>
                    {
                        post?.comments?.map(comment =>
                            <CommentItem
                                key={comment?.id.toString()}
                                item={comment}
                                onDelete={onDeleteComment}
                                highlight={comment?.id == commentId}
                                canDelete={user.id == comment?.userId || user.id == post?.userId}
                            >

                            </CommentItem>
                        )
                    }
                    {
                        post?.comments?.length == 0 && (

                            <Text style={{ color: theme.colors.text, marginLeft: 5 }}>
                                Hãy là người bình luận đầu tiên
                            </Text>

                        )
                    }

                </View>
            </ScrollView>
        </View>
    )
}

export default PostDetails

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'white',
        paddingVertical: wp(7),
    },

    inputContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10
    },

    list: {
        paddingHorizontal: wp(4),
    },
    sendIcon: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0.8,
        borderColor: theme.colors.primary,
        borderRadius: theme.radius.lg,
        borderCurve: 'continuous',
        height: hp(5.8),
        width: hp(5.8),
    },

    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    notFound: {
        fontSize: hp(2.5),
        color: theme.colors.text,
        fontWeight: theme.fonts.medium,
    },

    loading: {
        height: hp(5.8),
        width: hp(5.8),
        justifyContent: 'center',
        alignItems: 'center',
        transform: [{ scale: 1.3 }],
    }


})