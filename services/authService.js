import * as WebBrowser from 'expo-web-browser';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';

// Đảm bảo WebBrowser hoàn thành trước khi tiếp tục
WebBrowser.maybeCompleteAuthSession();

/**
 * Đăng nhập với Microsoft OAuth
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export const signInWithMicrosoft = async () => {
    try {
        // Sử dụng app scheme với path đúng với redirect URL đã thêm vào Supabase
        // Đảm bảo đã thêm 'laptrinhdidong://auth/callback' vào Supabase Dashboard > Authentication > URL Configuration > Redirect URLs
        const appRedirectUrl = 'laptrinhdidong://auth/callback';

        console.log('Using app redirect URL:', appRedirectUrl);

        // Bước 1: Lấy OAuth URL từ Supabase
        // Thêm scopes để đảm bảo Supabase request đúng permissions từ Microsoft
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: 'azure',
            options: {
                redirectTo: appRedirectUrl, // Redirect về app scheme
                skipBrowserRedirect: true, // Tự xử lý browser
                scopes: 'email openid profile User.Read', // Request các scopes cần thiết
                queryParams: {
                    // Đảm bảo request email và profile
                    prompt: 'consent', // Force consent để đảm bảo permissions được grant
                },
            },
        });


        console.log('Opening OAuth URL:', data.url);

        // Bước 2: Mở browser để đăng nhập
        // Sử dụng appRedirectUrl để nhận redirect từ Supabase callback
        const result = await WebBrowser.openAuthSessionAsync(
            data.url,
            appRedirectUrl
        );

        console.log('OAuth result type:', result.type);

        // Bước 3: Xử lý kết quả
        if (result.type === 'cancel') {
            console.log('User cancelled Microsoft login');
            return { success: false, error: 'User cancelled' };
        }

        if (result.type === 'success' && result.url) {
            console.log('OAuth redirect URL:', result.url);

            // Parse URL để lấy hash fragment hoặc query params
            // Supabase có thể trả về token trong hash (#) hoặc query (?)
            let url;
            try {
                url = new URL(result.url);
            } catch (e) {
                // Nếu không parse được URL (có thể là custom scheme), thử parse thủ công
                console.log('Cannot parse URL, trying manual parse...');
                // Kiểm tra xem có phải là app scheme không
                if (result.url.startsWith('laptrinhdidong://')) {
                    // Parse custom scheme URL
                    const parts = result.url.split('#');
                    if (parts.length > 1) {
                        const hash = parts[1];
                        const params = new URLSearchParams(hash);
                        const accessToken = params.get('access_token');
                        const refreshToken = params.get('refresh_token');
                        if (accessToken) {
                            // Xử lý token từ đây
                            const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                                access_token: accessToken,
                                refresh_token: refreshToken || '',
                            });
                            if (!sessionError && sessionData?.user) {
                                // Validate domain
                                if (sessionData.user.email && !sessionData.user.email.endsWith('@actvn.edu.vn')) {
                                    await supabase.auth.signOut();
                                    Alert.alert('Lỗi', 'Chỉ cho phép đăng nhập với tài khoản @actvn.edu.vn');
                                    return { success: false, error: 'Invalid domain' };
                                }
                                console.log('Microsoft login successful:', sessionData.user.email);
                                return { success: true };
                            }
                        }
                    }
                }
                // Nếu không parse được, đợi session từ Supabase
                console.log('Cannot parse URL, waiting for session...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                const { data: { session }, error: getSessionError } = await supabase.auth.getSession();
                if (session?.user) {
                    if (session.user.email && !session.user.email.endsWith('@actvn.edu.vn')) {
                        await supabase.auth.signOut();
                        Alert.alert('Lỗi', 'Chỉ cho phép đăng nhập với tài khoản @actvn.edu.vn');
                        return { success: false, error: 'Invalid domain' };
                    }
                    console.log('Microsoft login successful (from session):', session.user.email);
                    return { success: true };
                }
                return { success: false, error: 'No session found' };
            }

            // Parse hash fragment (Supabase thường trả về token trong hash)
            const hash = url.hash.substring(1); // Bỏ dấu #
            const params = new URLSearchParams(hash);

            // Nếu không có trong hash, thử query params
            let accessToken = params.get('access_token');
            let refreshToken = params.get('refresh_token');
            let error = params.get('error');
            let errorDescription = params.get('error_description');

            if (!accessToken) {
                // Thử lấy từ query params
                accessToken = url.searchParams.get('access_token');
                refreshToken = url.searchParams.get('refresh_token');
                error = url.searchParams.get('error');
                errorDescription = url.searchParams.get('error_description');
            }



            if (accessToken) {
                // Bước 4: Lấy session từ Supabase
                const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken || '',
                });

                if (sessionError) {
                    console.error('Session error:', sessionError);
                    Alert.alert('Lỗi', 'Không thể tạo session. Vui lòng thử lại.');
                    return { success: false, error: sessionError.message };
                }

                // Bước 5: Validate domain @actvn.edu.vn
                const user = sessionData?.user;
                if (user?.email) {
                    if (!user.email.endsWith('@actvn.edu.vn')) {
                        // Đăng xuất nếu email không đúng domain
                        await supabase.auth.signOut();
                        Alert.alert(
                            'Lỗi',
                            'Chỉ cho phép đăng nhập với tài khoản @actvn.edu.vn'
                        );
                        return { success: false, error: 'Invalid domain' };
                    }
                }

                console.log('Microsoft login successful:', user?.email);
                // Đợi một chút để đảm bảo AuthContext có thời gian xử lý onAuthStateChange
                await new Promise(resolve => setTimeout(resolve, 500));
                return { success: true };
            }
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        const { data: { session }, error: getSessionError } = await supabase.auth.getSession();

        if (getSessionError) {
            console.error('Get session error:', getSessionError);
            return { success: false, error: getSessionError.message };
        }

        if (session?.user) {
            // Validate domain
            const userEmail = session.user.email;
            if (userEmail && !userEmail.endsWith('@actvn.edu.vn')) {
                await supabase.auth.signOut();
                Alert.alert(
                    'Lỗi',
                    'Chỉ cho phép đăng nhập với tài khoản @actvn.edu.vn'
                );
                return { success: false, error: 'Invalid domain' };
            }

            console.log('Microsoft login successful (from session):', userEmail);
            return { success: true };
        }

        return { success: false, error: 'No session found' };
    } catch (error) {
        console.error('Microsoft login exception:', error);
        Alert.alert('Lỗi', 'Có lỗi xảy ra khi đăng nhập với Microsoft. Vui lòng thử lại.');
        return { success: false, error: error.message || 'Unknown error' };
    }
};

