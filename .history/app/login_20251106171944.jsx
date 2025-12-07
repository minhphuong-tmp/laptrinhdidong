import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useRef, useState } from 'react'
import { Alert, Keyboard, Pressable, StyleSheet, Text, TouchableWithoutFeedback, View } from 'react-native'
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
                        <Button /*disabled={!capVal}*/ title={'Đăng nhập'} loading={loading} onPress={onSubmit} />
                       
                        {/* recaptcha */}
                        {/* <ReCAPTCHA
                        sitekey = "6Lf0cwAsAAAAAOXTCtOE4A1zFreGZ1BXwMLAc_Z2"
                        onChange ={(val) => setCapVal(val)}
                        /> */}
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