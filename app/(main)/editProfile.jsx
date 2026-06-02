import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Icon from '../../assets/icons'
import Button from '../../components/Button'
import Header from '../../components/Header'
import Input from '../../components/Input'
import ScreenWrapper from '../../components/ScreenWrapper'
import { theme } from '../../constants/theme'
import { useAuth } from '../../context/AuthContext'
import { hp, wp } from '../../helpers/common'
import { getUserImageSrc, uploadFile } from '../../services/imageService'
import { updateUser } from '../../services/userService'

import * as ImagePicker from 'expo-image-picker'
const EditProfile = () => {
    const { user: currentUser, setUserData } = useAuth()
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const onSubmit = async () => {
        let userData = { ...user }
        let { name, phoneNumber, address, bio, image } = userData;
        if (!name || !phoneNumber || !address || !bio || !image) {
            Alert.alert("Lỗi", "Vui lòng điền hết các ô");
        }
        setLoading(true);

        if (typeof image === 'object') {
            let imageRes = await uploadFile("profiles", image?.uri, true);
            if (imageRes.success) {
                userData.image = imageRes.data;
            } else {
                userData.image = null;
            }
        }


        const res = await updateUser(currentUser?.id, userData);
        setLoading(false);

        if (res?.success) {
            setUserData({ ...currentUser, ...userData });
            router.back();
        }

    }


    const onPickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
        });
        if (!result.canceled) {
            setUser({ ...user, image: result.assets[0] });
        }
    }

    const [user, setUser] = useState({
        name: '',
        phoneNumber: '',
        image: null,
        bio: '',
        address: ''
    });

    useEffect(() => {
        if (currentUser) {
            setUser({
                name: currentUser.name || '',
                phoneNumber: currentUser.phoneNumber || '',
                image: currentUser.image || null,
                address: currentUser.address || '',
                bio: currentUser.bio || ''
            });
        }
    }, [currentUser]);


    let imageSource = user.image && typeof user.image === 'object' ? user.image.uri : getUserImageSrc(user?.image);

    return (
        <ScreenWrapper bg="white">
            <View style={styles.container}>
                <ScrollView
                    style={{ flex: 1 }}>
                    <Header title="Sửa hồ sơ" />

                    {/* form */}
                    <View style={styles.form}>
                        <View style={styles.avatarContainer}>
                            <Image source={imageSource} style={styles.avatar} />
                            <Pressable style={styles.cameraIcon} onPress={onPickImage}>
                                <Icon name="camera" size={20} strokeWidth={2.5} />
                            </Pressable>
                        </View>
                        <Text style={{ fontSize: hp(1.5), color: theme.colors.text }}>
                            Làm ơn hoàn thiện hồ sơ
                        </Text>
                        <Input
                            icon={<Icon name="user" />}
                            placeholder='Nhập tên'
                            value={user.name}
                            onChangeText={value => setUser({ ...user, name: value })}
                        />
                        <Input
                            icon={<Icon name="call" />}
                            placeholder='Nhập số điện thoại'
                            value={user.phoneNumber}
                            onChangeText={value => setUser({ ...user, phoneNumber: value })}
                        />

                        <Input
                            icon={<Icon name="location" />}
                            placeholder='Nhập địa chỉ'
                            value={user.address}
                            onChangeText={value => setUser({ ...user, address: value })}
                        />

                        <Input
                            icon={<Icon name="bio" />}
                            placeholder='Nhập tiểu sử'
                            value={user.bio}
                            multiline={true}
                            containerStyles={styles.bio}
                            onChangeText={value => setUser({ ...user, bio: value })}
                        />
                        <Button title="Cập nhật" loading={loading} onPress={onSubmit} />



                    </View>



                </ScrollView>
            </View>
        </ScreenWrapper>

    )
}

export default EditProfile

const styles = StyleSheet.create({

    container: {
        flex: 1,
        paddingHorizontal: wp(4),
    },
    avatarContainer: {
        height: hp(14),
        width: hp(14),
        alignSelf: 'center',
    },
    avatar: {
        width: '100%',
        height: '100%',
        borderRadius: theme.radius.xxl * 1.8,
        borderCurve: 'continuous',
        borderWidth: 1,
        borderColor: theme.colors.darkLight,
    },

    cameraIcon: {
        position: 'absolute',
        bottom: 0,
        right: -10,
        padding: 8,
        borderRadius: 50,
        backgroundColor: 'white',
        shadowColor: theme.colors.textLight,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
        elevation: 7,
    },

    form: {
        gap: 18,
        marginTop: 20,
    },
    input: {
        flexDirection: 'row',
        borderWidth: 0.4,
        borderColor: theme.colors.text,
        borderRadius: theme.radius.xxl,
        borderCurve: 'continuous',
        padding: 17,
        paddingHorizontal: 20,
        gap: 15,
    },
    bio: {
        flexDirection: 'row',
        height: hp(15),
        alignItems: 'flex-start',
        paddingVertical: 15,
    }

})