import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Keyboard, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
import Icon from '../assets/icons'
import BackButton from '../components/BackButton'
import Button from '../components/Button'
import Input from '../components/Input'
import ScreenWrapper from '../components/ScreenWrapper'
import { theme } from '../constants/theme'
import { useAuth } from '../context/AuthContext'
import { hp, wp } from '../helpers/common'
import { supabase } from '../lib/supabase'
import { signInWithMicrosoft } from '../services/authService'


const SignUp = () => {
    const router = useRouter()
    const { setAuth } = useAuth()

    const emailRef = useRef("");
    const nameRef = useRef("");
    const passwordRef = useRef("");
    const [loading, setLoading] = useState(false);
    const [microsoftLoading, setMicrosoftLoading] = useState(false);

    const handleMicrosoftLogin = async () => {
        setMicrosoftLoading(true);
        try {
            const result = await signInWithMicrosoft();
            if (result.success) {
                // AuthContext sẽ tự động handle navigation
                console.log('Microsoft login successful');
            }
        } catch (error) {
            console.error('Microsoft login error:', error);
        } finally {
            setMicrosoftLoading(false);
        }
    };

    const onSubmit = async () => {
        if (!emailRef.current || !passwordRef.current) {
            Alert.alert('Đăng ký', "Làm ơn nhập đầy đủ thông tin!");
            return;
        }

        let name = nameRef.current.trim();
        let email = emailRef.current.trim();
        let password = passwordRef.current.trim();

        setLoading(true);

        const { data: { session }, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    name,
                }
            }
        });

        setLoading(false);

        if (error) {
            Alert.alert('Đăng ký', error.message);
        } else if (session) {
            // AuthContext sẽ tự động handle navigation
            setAuth(session.user);
            Alert.alert('Thành công', 'Đăng ký thành công! Đang đăng nhập...');
        }
    };


    return (
        <ScreenWrapper>
            <StatusBar style="dark" />
            <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>

                <View style={styles.container}>
                    <BackButton router={router} />

                    {/* WELCOME */}
                    <View>
                        <Text style={styles.welcometext}>Bắt đầu,</Text>
                        <Text style={styles.welcometext}>Chào mừng đến với trang đăng ký </Text>
                    </View>

                    {/* form */}
                    <View style={styles.form}>
                        <Text style={{ fontSize: hp(1.5), color: theme.colors.text }}>
                            Nhập đầy đủ thông tin để tiếp tục
                        </Text>
                        <Input
                            icon={<Icon name="user" size={26} strokeWidth={1.6} />}
                            placeholder='Nhập tên'
                            onChangeText={value => nameRef.current = value}
                        />
                        <Input
                            icon={<Icon name="mail" size={26} strokeWidth={1.6} />}
                            placeholder='Nhập email'
                            onChangeText={value => emailRef.current = value}
                        />
                        <Input
                            icon={<Icon name="lock" size={26} strokeWidth={1.6} />}
                            placeholder='Nhập mật khẩu'
                            secureTextEntry
                            onChangeText={value => passwordRef.current = value}
                        />

                        {/* button */}
                        <Button title={'Đăng ký'} loading={loading} onPress={onSubmit} />

                        {/* Divider */}
                        <View style={styles.dividerContainer}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>Hoặc</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        {/* Microsoft Login Button */}
                        <Pressable
                            style={[styles.microsoftButton, microsoftLoading && styles.microsoftButtonDisabled]}
                            onPress={handleMicrosoftLogin}
                            disabled={microsoftLoading || loading}
                        >
                            {microsoftLoading ? (
                                <ActivityIndicator color="#FFFFFF" size="small" />
                            ) : (
                                <>
                                    <Text style={styles.microsoftIcon}>🔷</Text>
                                    <Text style={styles.microsoftButtonText}>Đăng nhập với Microsoft</Text>
                                </>
                            )}
                        </Pressable>

                    </View>
                    {/* footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Đã có tài khoản ?</Text>
                        <Pressable onPress={() => router.push('login')}>
                            <Text style={[styles.footerText, { color: theme.colors.primaryDark, fontWeight: theme.fonts.semiBold }]}>
                                Đăng nhập
                            </Text>
                        </Pressable>

                    </View>
                </View>
            </TouchableWithoutFeedback>
        </ScreenWrapper>
    )
}

export default SignUp

const styles = StyleSheet.create({

    container: {
        flex: 1,
        gap: 45,
        paddingHorizontal: wp(5),
    },
    welcometext: {
        fontSize: hp[4],
        fontWeight: theme.fonts.bold,
        color: theme.colors.text,
    },
    form: {
        gap: 25,
    },
    form: {
        gap: 25,
    },
    forgotPassword: {
        textAlign: 'right',
        fontWeight: theme.fonts.semibold,
        color: theme.colors.text
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 5,
    },
    footerText: {
        textAlign: 'center',
        color: theme.colors.text,
        fontSize: hp(1.6)
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: wp(3),
        marginVertical: hp(1),
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: theme.colors.gray || '#E0E0E0',
    },
    dividerText: {
        color: theme.colors.text,
        fontSize: hp(1.5),
        opacity: 0.6,
    },
    microsoftButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#00A4EF',
        paddingVertical: hp(1.8),
        paddingHorizontal: wp(5),
        borderRadius: theme.radius.md,
        gap: wp(3),
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    microsoftButtonDisabled: {
        opacity: 0.6,
    },
    microsoftIcon: {
        fontSize: wp(5),
    },
    microsoftButtonText: {
        color: '#FFFFFF',
        fontSize: hp(1.8),
        fontWeight: theme.fonts.semibold,
    },


})