import { Video } from 'expo-av';
import { Image } from 'expo-image';
import moment from 'moment/moment';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import RenderHTML from 'react-native-render-html';
import Icon from '../assets/icons';
import { theme } from '../constants/theme';
import { hp, stripHtmlTags, wp } from '../helpers/common';
import { downloadFile, getSupabaseFileUrl } from '../services/imageService';
import { createPostLike, removePostLike } from '../services/postService';
import Avatar from './Avatar';
import Loading from './Loading';
// const tagsStyles = {
//     div: textStyles,
//     p: textStyles,
//     ol: textStyles,
// };
// const textStyles = {
//     color: theme.colors.dark,
//     fontSize: 14,
// };
const PostCard = ({
    item,
    currentUser,
    router,
    hasShadow = true,
    showMoreIcon = true,
    showDelete = false,
    onDelete = () => { },
    onEdit = () => { },
}) => {
    const textStyles = useMemo(() => ({
        color: theme.colors.dark,
        fontSize: hp(1.75),
    }), []);

    const tagsStyles = useMemo(() => ({
        div: textStyles,
        p: textStyles,
        ol: textStyles,
    }), [textStyles]);


    const shadowStyles = {
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 1,
    };

    const [loading, setLoading] = useState(false);
    const [likes, setLikes] = useState([]);

    useEffect(() => {
        // Khởi tạo likes từ item.postLikes
        setLikes(item?.postLikes || []);
    }, [item?.id]); // Chỉ khởi tạo khi post thay đổi

    const openPostDetails = () => {
        if (!showMoreIcon) return null;
        router.push({ pathname: 'postDetails', params: { postId: item?.id } });
    };

    const onLike = async () => {
        try {
            if (liked) {
                // Remove like
                const updatedLikes = likes.filter(like => like.userId !== currentUser?.id);
                setLikes([...updatedLikes]);
                const res = await removePostLike(item?.id, currentUser?.id);
                if (!res.success) {
                    setLikes([...likes]); // Revert on error
                    Alert.alert('Lỗi', `Không thể bỏ like: ${res.msg}`);
                } else {
                    console.log('Like removed successfully');
                }
            } else {
                // Add like
                const newLike = {
                    userId: currentUser?.id,
                    postId: item?.id,
                    user: {
                        id: currentUser?.id,
                        name: currentUser?.name,
                        image: currentUser?.image
                    }
                };
                setLikes([...likes, newLike]);
                const res = await createPostLike({
                    userId: currentUser?.id,
                    postId: item?.id,
                });
                if (!res.success) {
                    console.error('Add like failed:', res.msg);
                    setLikes(likes.filter(like => like.userId !== currentUser?.id)); // Revert on error
                    Alert.alert('Lỗi', `Không thể like: ${res.msg}`);
                } else {
                    console.log('Like added successfully');
                }
            }
        } catch (error) {
            Alert.alert('Lỗi', 'Đã có lỗi xảy ra khi thực hiện like');
        }
    };

    const handlePostEdit = async () => {
        router.back();
        router.push({ pathname: 'newPost', params: { ...item } });
        console.log('editing post: ', item);

    };

    const onShare = async () => {
        try {
            let content = { message: stripHtmlTags(item?.body) };
            if (item?.file) {
                // download the file then share the local uri
                setLoading(true);
                let url = await downloadFile(getSupabaseFileUrl(item?.file?.url));
                setLoading(false);
                content.url = url;
            }
            Share.share(content);
        } catch (error) {
            console.log('Share error:', error);
            setLoading(false);
        }
    };

    const handlePostDelete = () => {
        Alert.alert('Confirm', 'Are you sure you want to do this?', [
            {
                text: 'Huỷ',
                onPress: () => console.log('modal cancelled'),
                style: 'cancel'
            },
            {
                text: 'Xoá',
                onPress: () => onDelete(item),
                style: 'destructive'
            }
        ]);
    };

    const createdAt = moment(item?.created_at).format('DD/MM/YYYY');
    const liked = likes.some(like => like.userId === currentUser?.id);

    return (
        <View style={[styles.container, hasShadow && shadowStyles]}>
            {/* Facebook Post Header */}
            <View style={styles.header}>
                <View style={styles.userInfo}>
                    <Avatar
                        size={hp(4)}
                        uri={(() => {
                            console.log('PostCard - item.user.image:', item?.user?.image);
                            return item?.user?.image;
                        })()}
                        rounded={theme.radius.full}
                    />
                    <View style={styles.userDetails}>
                        <Text style={styles.username}>{item?.user?.name || 'Unknown User'}</Text>
                        <View style={styles.postMeta}>
                            <Text style={styles.postTime}>{createdAt}</Text>
                        </View>
                    </View>
                </View>

                {showMoreIcon && (
                    <TouchableOpacity onPress={openPostDetails} style={styles.moreButton}>
                        <Icon name="threeDotsHorizontal" size={hp(2.5)} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                )}
                {showDelete && currentUser?.id === item?.user?.id && (
                    <View style={styles.actions}>
                        <TouchableOpacity onPress={handlePostEdit}>
                            <Icon name="edit" size={hp(2.5)} color={theme.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handlePostDelete}>
                            <Icon name="delete" size={hp(2.5)} color={theme.colors.error} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Facebook Post Content */}
            <View style={styles.content}>
                <View style={styles.postBody}>
                    {item?.body && (
                        <RenderHTML
                            contentWidth={wp(100)}
                            source={{ html: item?.body }}
                            tagsStyles={tagsStyles}
                        />
                    )}
                </View>
                {item?.file && item?.file.includes('postImages') && (
                    <Image
                        source={getSupabaseFileUrl(item?.file)}
                        transition={100}
                        style={styles.postMedia}
                        contentFit="cover"
                        onError={(error) => {
                            console.log('=== IMAGE DEBUG ===');
                            console.log('Original item.file:', item?.file);
                            console.log('File type:', typeof item?.file);
                            console.log('Is full URL:', item?.file?.startsWith?.('http'));
                            console.log('Generated URL:', getSupabaseFileUrl(item?.file));
                            console.log('Error details:', error);

                            // Test với ảnh cụ thể
                            console.log('Testing specific image: 1761621589861_tf5kjdwexnj.png');
                            console.log('Test URL:', `${supabaseUrl}/storage/v1/object/public/postImages/1761621589861_tf5kjdwexnj.png`);
                        }}
                        onLoad={() => {
                            console.log('Image loaded successfully for file:', item?.file);
                            console.log('Generated URL:', getSupabaseFileUrl(item?.file));
                        }}
                    />
                )}
                {item?.file && item?.file.includes('postVideos') && (
                    <Video
                        source={getSupabaseFileUrl(item?.file)}
                        useNativeControls
                        style={[styles.postMedia, { height: hp(30) }]}
                        resizeMode="cover"
                        isLooping
                    />
                )}
            </View>

            {/* Facebook Post Footer */}
            <View style={styles.footer}>
                {/* Reactions Summary - Only show if there are likes */}
                {likes.length > 0 && (
                    <View style={styles.reactionsSummary}>
                        <View style={styles.reactionsLeft}>
                            <View style={styles.reactionIcons}>
                                <Icon
                                    name="heart"
                                    size={hp(1.8)}
                                    fill="#F02849"
                                    color="#F02849"
                                />
                            </View>
                            <Text style={styles.reactionsText}>
                                {(() => {
                                    // Ưu tiên state local (likes) hơn database (item.postLikes)
                                    const displayLikes = likes.length > 0 ? likes : (item?.postLikes || []);
                                    const likeCount = displayLikes.length;

                                    if (likeCount === 1) {
                                        // Nếu có user object từ database, dùng nó
                                        if (displayLikes[0]?.user?.name) {
                                            return displayLikes[0].user.name;
                                        }
                                        // Nếu không có, dùng currentUser nếu là like của user hiện tại
                                        if (displayLikes[0]?.userId === currentUser?.id) {
                                            return currentUser?.name || 'Bạn';
                                        }
                                        // Fallback cuối cùng
                                        return 'Người dùng';
                                    } else if (likeCount > 1) {
                                        // Tương tự cho multiple likes
                                        let firstName = 'Người dùng';
                                        if (displayLikes[0]?.user?.name) {
                                            firstName = displayLikes[0].user.name;
                                        } else if (displayLikes[0]?.userId === currentUser?.id) {
                                            firstName = currentUser?.name || 'Bạn';
                                        }
                                        return `${firstName} + ${likeCount - 1} người khác`;
                                    }
                                    return '';
                                })()}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={openPostDetails}>
                            <Text style={styles.commentsText}>{item?.comments?.[0]?.count || 0} bình luận</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Action Buttons */}
                <View style={styles.actionButtons}>
                    <TouchableOpacity onPress={onLike} style={styles.actionButton}>
                        <Icon
                            name="heart"
                            size={hp(2.2)}
                            fill={liked ? '#F02849' : 'transparent'}
                            color={liked ? '#F02849' : theme.colors.textSecondary}
                        />
                        <Text style={[styles.actionText, liked && styles.likedActionText]}>Thích</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={openPostDetails} style={styles.actionButton}>
                        <Icon name="comment" size={hp(2.2)} color={theme.colors.textSecondary} />
                        <Text style={styles.actionText}>Bình luận</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={onShare} style={styles.actionButton}>
                        {loading ? (
                            <Loading size="small" />
                        ) : (
                            <Icon name="share" size={hp(2.2)} color={theme.colors.textSecondary} />
                        )}
                        <Text style={styles.actionText}>Chia sẻ</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

export default PostCard;

const styles = StyleSheet.create({
    container: {
        marginBottom: hp(1),
        backgroundColor: theme.colors.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },

    // Facebook Post Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: wp(4),
        paddingVertical: hp(1.5),
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    userDetails: {
        marginLeft: wp(3),
        flex: 1,
    },
    username: {
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        marginBottom: hp(0.2),
    },
    postMeta: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    postTime: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
    },
    postPrivacy: {
        fontSize: hp(1.2),
        marginLeft: wp(1),
    },
    moreButton: {
        padding: wp(2),
    },
    actions: {
        flexDirection: 'row',
        gap: wp(3),
    },

    // Facebook Post Content
    content: {
        paddingHorizontal: wp(4),
    },
    postBody: {
        marginBottom: hp(1),
    },
    postMedia: {
        width: '100%',
        height: hp(40),
        borderRadius: theme.radius.sm,
        marginBottom: hp(1),
    },

    // Facebook Post Footer
    footer: {
        paddingHorizontal: wp(4),
        paddingVertical: hp(1),
    },

    // Reactions Summary
    reactionsSummary: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: hp(1),
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
    },
    reactionsLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    reactionIcons: {
        flexDirection: 'row',
        marginRight: wp(2),
    },
    reactionIcon: {
        width: hp(2.2),
        height: hp(2.2),
        borderRadius: theme.radius.full,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: wp(-0.5),
        borderWidth: 1,
        borderColor: 'white',
    },
    reactionsText: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },
    commentsText: {
        fontSize: hp(1.4),
        color: theme.colors.textSecondary,
        fontWeight: theme.fonts.medium,
    },

    // Action Buttons
    actionButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingTop: hp(0.5),
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: hp(0.8),
        paddingHorizontal: wp(3),
        borderRadius: theme.radius.sm,
        flex: 1,
        justifyContent: 'center',
    },
    actionText: {
        fontSize: hp(1.6),
        color: theme.colors.textSecondary,
        marginLeft: wp(2),
        fontWeight: theme.fonts.medium,
    },
    likedActionText: {
        color: '#F02849',
    },
});