import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useRef, useState } from 'react'
import { Alert, Keyboard, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
import Recaptcha from 'react-native-recaptcha-that-works'
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


const Login = () => {
    const [capVal, setCapVal] = useState(null);
    const router = useRouter()
    const { setAuth } = useAuth()

    const emailRef = useRef("");
    const passwordRef = useRef("");
    const [loading, setLoading] = useState(false);

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
        
        // Trong luồng hiện tại, bạn đang dùng Supabase Auth,
        // Supabase KHÔNG có API cho phép bạn gửi kèm reCAPTCHA token trực tiếp.
        // Đây là điểm bạn **PHẢI** chuyển sang dùng Edge Function.
        
        // **[QUAN TRỌNG: CẦN THAY THẾ SAU KHI TRIỂN KHAI EDGE FUNCTION]**
        // Tạm thời, chúng ta vẫn gọi Supabase để test luồng, NHƯNG
        // TRONG MÔI TRƯỜNG PRODUCTION, BẠN PHẢI GỌI EDGE FUNCTION CỦA MÌNH TẠI ĐÂY.
        
        try {
            // (1) Trong môi trường Production: Gửi email, password, và recaptchaToken tới EDGE FUNCTION
            
            // (2) Tạm thời cho mục đích test (Bỏ qua reCAPTCHA ở Backend):
            const { data: { session }, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            console.log('Login response:', { session: !!session, error: error?.message });

            if (error) {
                Alert.alert('Lỗi đăng nhập', error.message);
            } else if (session) {
                setAuth(session.user);
            }
        } catch (err) {
            Alert.alert('Lỗi', 'Có lỗi xảy ra khi đăng nhập');
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
    }


})