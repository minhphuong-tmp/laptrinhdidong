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
        setLikes(item?.postLikes || []);
    }, []);

    const openPostDetails = () => {
        if (!showMoreIcon) return null;
        router.push({ pathname: 'postDetails', params: { postId: item?.id } });
    };

    const onLike = async () => {
        try {
            if (liked) {
                const updatedLikes = likes.filter(like => like.userId !== currentUser?.id);
                setLikes([...updatedLikes]);
                const res = await removePostLike(item?.id, currentUser?.id);
                if (!res.success) {
                    setLikes([...likes]); // Revert on error
                    Alert.alert('Lỗi', `Không thể bỏ like: ${res.msg}`);
                } else {
                    console.log(' Like removed successfully');
                }
            } else {
                const data = {
                    userId: currentUser?.id,
                    postId: item?.id,
                };
                setLikes([...likes, data]);
                const res = await createPostLike(data);
                if (!res.success) {
                    console.error(' Add like failed:', res.msg);
                    setLikes(likes.filter(like => like.userId !== currentUser?.id)); // Revert on error
                    Alert.alert('Lỗi', `Không thể like: ${res.msg}`);
                } else {
                    console.log(' Like added successfully');
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
        let content = { message: stripHtmlTags(item?.body) };
        if (item?.file) {
            // download the file then share the local uri
            setLoading(true);
            let url = await downloadFile(getSupabaseFileUrl(item?.file?.url));
            setLoading(false);
            content.url = url;
        }
        Share.share(content);
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
            <View style={styles.header}>
                <View style={styles.userInfo}>
                    <Avatar
                        size={hp(3.5)}
                        uri={item?.user?.image}
                        rounded={theme.radius.md}
                    />
                    <View>
                        <Text style={styles.username}>{item?.user?.name || 'Unknown User'}</Text>
                        <Text style={styles.postTime}>{createdAt}</Text>
                    </View>
                </View>

                {showMoreIcon && (
                    <TouchableOpacity onPress={openPostDetails} style={{ marginLeft: 10, position: 'absolute', right: 10 }}>
                        <Icon name="threeDotsHorizontal" size={hp(3.4)} strokeWidth={3} color={theme.colors.text} />
                    </TouchableOpacity>
                )}
                {showDelete && currentUser?.id === item?.user?.id && (
                    <View style={styles.actions}>
                        <TouchableOpacity onPress={handlePostEdit}>
                            <Icon name="edit" size={hp(2.5)} color={theme.colors.text} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handlePostDelete}>
                            <Icon name="delete" size={hp(2.5)} color={theme.colors.rose} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

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

            <View style={styles.footer}>
                <View style={styles.footerButton}>
                    <TouchableOpacity onPress={onLike}>
                        <Icon
                            name="heart"
                            size={24}
                            fill={liked ? theme.colors.rose : 'transparent'}
                            color={liked ? theme.colors.rose : theme.colors.textLight}
                        />
                    </TouchableOpacity>
                    <Text style={styles.count}>{likes.length}</Text>
                </View>
                <View style={styles.footerButton}>
                    <TouchableOpacity onPress={openPostDetails}>
                        <Icon name="comment" size={24} color={theme.colors.textLight} />
                    </TouchableOpacity>
                    <Text style={styles.count}>{item?.comments?.[0]?.count || 0}</Text>
                </View>
                <View style={styles.footerButton}>
                    {loading ? (
                        <Loading size="small" />
                    ) : (
                        <TouchableOpacity onPress={onShare}>
                            <Icon name="share" size={24} color={theme.colors.textLight} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );
};

export default PostCard;

const styles = StyleSheet.create({
    container: {
        marginBottom: 15,
        borderRadius: theme.radius.xl + 1,
        borderCurve: 'continuous',
        paddingVertical: 12,
        backgroundColor: 'white',
        borderWidth: 0.5,
        borderColor: theme.colors.gray,
        shadowColor: '#000',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    userInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    username: {
        fontSize: hp(1.7),
        color: theme.colors.textDark,
        fontWeight: theme.fonts.medium,
    },
    postTime: {
        fontSize: hp(1.4),
        color: theme.colors.textLight,
        fontWeight: theme.fonts.medium,
    },
    content: {
        gap: 10,
    },
    postMedia: {
        height: hp(40),
        width: '100%',
        borderRadius: theme.radius.xl,
        borderCurve: 'continuous',
    },
    postBody: {
        marginLeft: 5,
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 18,
    },
    count: {
        color: theme.colors.text,
        fontSize: hp(1.8),
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    footerButton: {
        marginLeft: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
});