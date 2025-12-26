import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useRef, useState } from 'react'
import { Alert, Keyboard, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
import Recaptcha from 'react-native-recaptcha-that-works'
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
//6Lf0cwAsAAAAAOXTCtOE4A1zFreGZ1BXwMLAc_Z2
import { signInWithMicrosoft } from '../services/authService'



const Login = () => {
    const [capVal, setCapVal] = useState(null);
    const router = useRouter()
    const { setAuth } = useAuth()

    const emailRef = useRef("");
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

    // [Thêm mới] Ref và Key cho reCAPTCHA
    const recaptchaRef = useRef(null);
    const SITE_KEY = '6Lf0cwAsAAAAAOXTCtOE4A1zFreGZ1BXwMLAc_Z2'; // Khóa Public của bạn

    // [Thêm mới] Hàm Xử lý Xác minh reCAPTCHA
    const handleRecaptchaVerify = async (token) => {
        console.log('reCAPTCHA Token:', token);
        // Sau khi có token, tiến hành đăng nhập
        await finalizeLogin(token);
    };

    // [Thêm mới] Hàm xử lý Đăng nhập Chính (Bao gồm Token)
   const finalizeLogin = async (recaptchaToken) => {
        let email = emailRef.current.trim();
        let password = passwordRef.current.trim();

        try {
            // Thay thế URL dưới đây bằng URL dự án Supabase thực tế của bạn
            // Bạn có thể lấy nó trong Settings -> API -> Project URL
            // Ví dụ: https://oktlakdvlmkaalymgrwd.supabase.co
            const PROJECT_URL = 'https://oqtlakdvlmkaalymgrwd.supabase.co'; 
            
            const response = await fetch(`${PROJECT_URL}/functions/v1/auth-login`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    // Nếu bạn có bật "Enforce JWT Verification" cho function thì cần thêm header Authorization
                    // 'Authorization': `Bearer ${supabaseKey}` 
                },
                body: JSON.stringify({
                    email: email,
                    password: password,
                    recaptchaToken: recaptchaToken, 
                }),
            });

            const data = await response.json();

            // Kiểm tra status code trả về từ Edge Function
            if (!response.ok) {
                // Nếu lỗi (400, 401, 403, 429...)
                // data.message chính là thông báo lỗi bạn viết trong file index.ts
                Alert.alert('Đăng nhập thất bại', data.message || 'Có lỗi xảy ra.');
                return;
            }

            // Nếu thành công (200)
            console.log('Login successful via Edge Function');
            if (data.session && data.user) {
                // Cập nhật session vào Supabase Client ở App để các chức năng khác hoạt động
                const { error: sessionError } = await supabase.auth.setSession({
                    access_token: data.session.access_token,
                    refresh_token: data.session.refresh_token,
                });

                if (sessionError) {
                    Alert.alert('Lỗi Session', sessionError.message);
                } else {
                    setAuth(data.user);
                }
            }

        } catch (err) {
            console.log('Login exception:', err);
            Alert.alert('Lỗi mạng', 'Không thể kết nối tới server.');
        } finally {
            setLoading(false);
        }
    }


    const onSubmit = async () => {
        if (!emailRef.current || !passwordRef.current) {
            Alert.alert('Đăng nhập', "Làm ơn nhập đầy đủ thông tin!");
            return;
        }

        setLoading(true);
        
        // [Sửa đổi] Thay vì đăng nhập trực tiếp, gọi reCAPTCHA Modal
        recaptchaRef.current.open(); 
        
        // Hàm đăng nhập chính (finalizeLogin) sẽ được gọi sau khi reCAPTCHA xác minh thành công
    }


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
                       
                        <Recaptcha
                ref={recaptchaRef}
                siteKey={SITE_KEY}
                // Dùng địa chỉ IP cục bộ của máy tính bạn hoặc một URL bạn kiểm soát 
                // đã được đăng ký với Google reCAPTCHA
                baseUrl="http://localhost" 
                onVerify={handleRecaptchaVerify} // Hàm xử lý sau khi xác minh thành công
                onExpire={() => { // Xử lý khi token hết hạn
                    Alert.alert("reCAPTCHA", "Mã xác minh đã hết hạn. Vui lòng thử lại.");
                    setLoading(false);
                }}
                size="normal"
                lang="vi" // Hiển thị tiếng Việt
                theme="light"
            />  

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