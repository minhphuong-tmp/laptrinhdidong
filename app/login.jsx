import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useRef, useState } from 'react'
import { Alert, Keyboard, Pressable, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Icon from '../assets/icons'
import BackButton from '../components/BackButton'
import Button from '../components/Button'
import Input from '../components/Input'
import ScreenWrapper from '../components/ScreenWrapper'
import { theme } from '../constants/theme'
import { useAuth } from '../context/AuthContext'
import { hp, wp } from '../helpers/common'
import { supabase } from '../lib/supabase'



const Login = () => {
    const router = useRouter()
    const { setAuth } = useAuth()

    const emailRef = useRef("");
    const passwordRef = useRef("");
    const [loading, setLoading] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [hasSavedCredentials, setHasSavedCredentials] = useState(false);

    // Kiểm tra khả năng sử dụng sinh trắc học và credentials đã lưu
    useEffect(() => {
        checkBiometricAvailability();
        checkSavedCredentials();
    }, []);

    const checkBiometricAvailability = async () => {
        try {
            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            setBiometricAvailable(hasHardware && isEnrolled);
        } catch (error) {
            console.log('Biometric check error:', error);
        }
    };

    const checkSavedCredentials = async () => {
        try {
            const savedEmail = await AsyncStorage.getItem('saved_email');
            const savedPassword = await AsyncStorage.getItem('saved_password');
            setHasSavedCredentials(!!(savedEmail && savedPassword));
        } catch (error) {
            console.log('Check saved credentials error:', error);
        }
    };

    const onSubmit = async () => {
        if (!emailRef.current || !passwordRef.current) {
            Alert.alert('Đăng nhập', "Làm ơn nhập đầy đủ thông tin!");
            return;
        }

        let email = emailRef.current.trim();
        let password = passwordRef.current.trim();

        console.log('Attempting login with:', email);
        setLoading(true);

        try {
            const { data: { session }, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            console.log('Login response:', { session: !!session, error: error?.message });

            if (error) {
                console.log('Login error:', error);
                Alert.alert('Lỗi đăng nhập', error.message);
            } else if (session) {
                console.log('Login successful, session:', session.user.id);

                // Lưu thông tin đăng nhập để sử dụng cho vân tay lần sau
                await AsyncStorage.setItem('saved_email', email);
                await AsyncStorage.setItem('saved_password', password);

                // AuthContext sẽ tự động handle navigation
                setAuth(session.user);
                console.log('setAuth called, waiting for AuthContext...');
            }
        } catch (err) {
            console.log('Login exception:', err);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi đăng nhập');
        } finally {
            setLoading(false);
        }
    }

    const loginWithBiometric = async () => {
        try {
            // Kiểm tra xem có thông tin đăng nhập đã lưu không
            const savedEmail = await AsyncStorage.getItem('saved_email');
            const savedPassword = await AsyncStorage.getItem('saved_password');

            if (!savedEmail || !savedPassword) {
                Alert.alert('Thông báo', 'Vui lòng đăng nhập bằng mật khẩu ít nhất một lần trước khi sử dụng vân tay');
                return;
            }

            // Thực hiện xác thực sinh trắc học
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Đăng nhập bằng vân tay',
                fallbackLabel: 'Sử dụng mật khẩu thiết bị',
                cancelLabel: 'Hủy',
                disableDeviceFallback: false,
            });

            if (result.success) {
                setLoading(true);

                // Đăng nhập với thông tin đã lưu
                const { data: { session }, error } = await supabase.auth.signInWithPassword({
                    email: savedEmail,
                    password: savedPassword,
                });

                if (error) {
                    console.log('Biometric login error:', error);
                    // Nếu credentials không hợp lệ, xóa chúng
                    await AsyncStorage.removeItem('saved_email');
                    await AsyncStorage.removeItem('saved_password');
                    Alert.alert('Lỗi', 'Thông tin đăng nhập đã lưu không hợp lệ. Vui lòng đăng nhập lại bằng mật khẩu.');
                } else if (session) {
                    console.log('Biometric login successful');
                    setAuth(session.user);
                }
            } else {
                console.log('Biometric authentication failed:', result);
                if (result.error) {
                    Alert.alert('Xác thực thất bại', 'Vui lòng thử lại hoặc sử dụng mật khẩu');
                }
            }
        } catch (error) {
            console.log('Biometric auth error:', error);
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi xác thực sinh trắc học');
        } finally {
            setLoading(false);
        }
    };


    return (
        <ScreenWrapper>
            <StatusBar style="dark" />
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}  >

                <View style={styles.container}>
                    <BackButton router={router} />

                    {/* WELCOME */}
                    <View>
                        <Text style={styles.welcometext}>Xin chào,</Text>
                        <Text style={styles.welcometext}>Chào mừng bạn quay trở lại</Text>
                    </View>

                    {/* form */}
                    <View style={styles.form}>
                        <Text style={{ fontSize: hp(1.5), color: theme.colors.text }}>
                            Nhấn nút Đăng nhập để tiếp tục
                        </Text>
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
                        <Text style={styles.forgotPassword}>
                            Quên mật khẩu ?
                        </Text>
                        {/* button */}
                        <Button title={'Đăng nhập'} loading={loading} onPress={onSubmit} />

                        {/* Nút đăng nhập bằng vân tay */}
                        {biometricAvailable && hasSavedCredentials && (
                            <View style={styles.biometricContainer}>
                                <View style={styles.divider}>
                                    <View style={styles.dividerLine} />
                                    <Text style={styles.dividerText}>Hoặc</Text>
                                    <View style={styles.dividerLine} />
                                </View>
                                <TouchableOpacity
                                    style={styles.biometricButton}
                                    onPress={loginWithBiometric}
                                    disabled={loading}
                                >
                                    <Icon name="fingerprint" size={30} strokeWidth={1.6} color={theme.colors.primary} />
                                    <Text style={styles.biometricText}>Đăng nhập bằng vân tay</Text>
                                </TouchableOpacity>
                            </View>
                        )}

                    </View>
                    {/* footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Không có tài khoản ?</Text>
                        <Pressable onPress={() => router.push('signUp')}>
                            <Text style={[styles.footerText, { color: theme.colors.primaryDark, fontWeight: theme.fonts.semiBold }]}>
                                Đăng ký
                            </Text>
                        </Pressable>

                    </View>
                </View>
            </TouchableWithoutFeedback>
        </ScreenWrapper>
    )
}

export default Login

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
    biometricContainer: {
        marginTop: 10,
        gap: 15,
    },
    divider: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: theme.colors.gray,
    },
    dividerText: {
        color: theme.colors.textLight,
        fontSize: hp(1.5),
    },
    biometricButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: hp(1.5),
        paddingHorizontal: wp(4),
        backgroundColor: theme.colors.backgroundSecondary || '#f5f5f5',
        borderRadius: theme.radius.xl,
        borderWidth: 1,
        borderColor: theme.colors.primary,
        gap: 10,
    },
    biometricText: {
        color: theme.colors.primary,
        fontSize: hp(1.7),
        fontWeight: theme.fonts.semiBold,
    }


})