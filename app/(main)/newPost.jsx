import { Video } from 'expo-av'
import * as ImagePicker from 'expo-image-picker'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState } from 'react'
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import Icon from '../../assets/icons'
import Button from '../../components/Button'
import Header from '../../components/Header'
import RichTextEditor from '../../components/RichTextEditor'
import ScreenWrapper from '../../components/ScreenWrapper'
import UserAvatar from '../../components/UserAvatar'
import { theme } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import { hp, wp } from '../../helpers/common'
import { getSupabaseFileUrl } from '../../services/imageService'
import { createOrUpdatePost } from '../../services/postService'

const NewPost = () => {
    const post = useLocalSearchParams();

    const { user } = useAuth()
    const bodyRef = useRef("");
    const editorRef = useRef(null);
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState(file);

    useEffect(() => {
        if (post && post.id) {
            bodyRef.current = post.body;
            setFile(post.file || null);
            setTimeout(() => {
                // Check if editorRef has setContentHTML method (mobile) or setValue method (web)
                if (editorRef.current?.setContentHTML) {
                    editorRef.current.setContentHTML(post.body);
                } else if (editorRef.current?.setValue) {
                    editorRef.current.setValue(post.body);
                }
            }, 800)
        }
    }, []);

    const onPick = async (isImage) => {
        let mediaConfig = {
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
        }
        if (!isImage) {
            mediaConfig = {
                mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                allowsEditing: true,
                quality: 0.7, // 
            }
        }

        let result = await ImagePicker.launchImageLibraryAsync(mediaConfig);
        if (!result.canceled) {

            setFile(result.assets[0]);
        }
    }

    const onSubmit = async () => {
        if (!bodyRef.current && !file) {
            Alert.alert('Bài viết', 'Làm ơn viết trạng thái hoặc chọn ảnh, video');
            return;
        }

        let data = {
            file,
            body: bodyRef.current,
            userId: user?.id,
        }
        if (post && post.id) {
            data.id = post.id;
        }

        // create post
        setLoading(true);
        let res = await createOrUpdatePost(data);
        setLoading(false);
        if (res.success) {
            setFile(null);
            bodyRef.current = '';
            // Check if editorRef has setContentHTML method (mobile) or setValue method (web)
            if (editorRef.current?.setContentHTML) {
                editorRef.current.setContentHTML('');
            } else if (editorRef.current?.setValue) {
                editorRef.current.setValue('');
            }
            router.back();
        } else {
            Alert.alert('Post', res.msg);
        }

    }

    const getFileUrl = file => {
        if (!file) return null;
        if (isLocalFile(file)) {
            return file.uri;
        }
        return getSupabaseFileUrl(file)?.uri;
    }

    const isLocalFile = file => {
        if (!file) return null;
        if (typeof file === 'object') return true;
        return false;
    };

    const getFileType = file => {
        console.log('file: ', file);
        if (!file) return null;
        if (isLocalFile(file)) {
            return file.type;
        }
        if (file.includes('postImage')) {
            return 'image';
        }
        return 'video';
    };
    const dismissKeyboard = () => {
        // Check if editorRef has blurContentEditor method (mobile) or blur method (web)
        if (editorRef.current?.blurContentEditor) {
            editorRef.current.blurContentEditor();
        } else if (editorRef.current?.blur) {
            editorRef.current.blur();
        }
    };
    return (
        <ScreenWrapper bg="white">
            <TouchableWithoutFeedback onPress={dismissKeyboard}>

                <View style={styles.container}>
                    <Header title="Tạo bài viết" />
                    <ScrollView contentContainerStyle={{ gap: 20 }}  >
                        {/* avatar */}
                        <View style={styles.header}>
                            <UserAvatar
                                user={user}
                                size={hp(6.5)}
                                rounded={theme.radius.xl}
                            />
                            <View style={{ gap: 2 }}>
                                <Text style={styles.username}>
                                    {user?.user_metadata?.name || user?.name || 'User'}
                                </Text>
                                <Text style={styles.publicText}>
                                    CÔNG KHAI
                                </Text>
                            </View>
                        </View>

                        <View style={styles.textEditor}>
                            <RichTextEditor ref={editorRef} onChange={body => bodyRef.current = body}>
                            </RichTextEditor>
                        </View>

                        {
                            file && (
                                <View style={styles.file}>
                                    {getFileType(file)?.startsWith('video') ? (
                                        <Video
                                            style={{ flex: 1 }}
                                            source={{
                                                uri: getFileUrl(file)
                                            }}
                                            useNativeControls
                                            resizeMode="cover"
                                            isLooping
                                            shouldPlay={false}
                                        />
                                    ) : (
                                        <Image
                                            source={{ uri: getFileUrl(file) }}
                                            resizeMode="cover"
                                            style={{ flex: 1 }}
                                        />
                                    )}

                                    <Pressable style={styles.closeIcon} onPress={() => setFile(null)}>
                                        <Icon name="delete" size={20} color="white" />
                                    </Pressable>
                                </View>
                            )}
                        <View style={styles.media}>
                            <Text style={styles.addImageText}>Thêm ảnh hoặc video</Text>
                            <View style={styles.mediaIcons}>
                                <TouchableOpacity onPress={() => onPick(true)}>
                                    <Icon name="image" size={30} color={theme.colors.dark} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => onPick(false)}>
                                    <Icon name="video" size={33} color={theme.colors.dark} />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <Button
                            buttonStyle={{ marginHorizontal: wp(4) }}
                            title={post && post.id ? 'Cập nhật bài viết' : 'Đăng bài viết'}
                            loading={loading}
                            hasShadow={false}
                            onPress={onSubmit}
                        />
                    </ScrollView>

                </View>

            </TouchableWithoutFeedback>

        </ScreenWrapper>
    )
}

export default NewPost

const styles = StyleSheet.create({
    container: {
        flex: 1,
        marginBottom: 30,
        paddingHorizontal: wp(4),
        gap: 15,
    },

    title: {
        fontSize: hp(2.5),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
        textAlign: 'center',
    },

    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },

    username: {
        fontSize: hp(2.2),
        fontWeight: theme.fonts.semiBold,
        color: theme.colors.text,
    },

    avatar: {
        height: hp(6.5),
        width: hp(6.5),
        borderRadius: theme.radius.xl,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: 'rgba(0, 0, 0, 0.1)',
    },

    publicText: {
        fontSize: hp(1.7),
        fontWeight: theme.fonts.medium,
        color: theme.colors.textLight,
    },

    textEditor: {
        // marginTop: 10,
    },

    media: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1.5,
        padding: 12,
        paddingHorizontal: 18,
        borderRadius: theme.radius.xl,
        borderCurve: 'continuous',
        borderColor: theme.colors.gray,
    },

    mediaIcons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },

    addImageText: {
        fontSize: hp(1.9),
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text,
    },

    imageIcon: {
        borderRadius: theme.radius.md,
    },

    file: {
        height: hp(50),
        width: '100%',
        borderRadius: theme.radius.xl,
        overflow: 'hidden',
        borderCurve: 'continuous',
    },

    video: {
        // Style for video if needed
    },

    closeIcon: {
        position: 'absolute',
        top: 10,
        right: 10,
        padding: 8, // 
        borderRadius: 50,
        backgroundColor: 'rgba(255, 0, 0, 0.6)',
    }
})