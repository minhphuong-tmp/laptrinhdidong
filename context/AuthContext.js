import { useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const router = useRouter();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Kiểm tra session ban đầu
        const checkSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.log('Session error:', error);
                    // Nếu là lỗi refresh token, clear session và redirect
                    if (error.message?.includes('Refresh Token') || error.message?.includes('Invalid')) {
                        console.log('Invalid refresh token, clearing session...');
                        await supabase.auth.signOut();
                    }
                    setUser(null);
                    setLoading(false);
                    return;
                }

                if (session?.user) {
                    setUser(session.user);
                } else {
                    console.log('No session found');
                    setUser(null);
                }
            } catch (error) {
                console.log('Check session error:', error);
                // Nếu là lỗi refresh token, clear session
                if (error.message?.includes('Refresh Token') || error.message?.includes('Invalid')) {
                    console.log('Invalid refresh token in catch, clearing session...');
                    await supabase.auth.signOut();
                }
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkSession();

        // Lắng nghe thay đổi auth state
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'SIGNED_OUT' || !session) {
                    console.log('User signed out');
                    setUser(null);
                    setLoading(false);
                    // Redirect về welcome thay vì login để tránh vòng lặp
                    router.replace('/welcome');
                } else if (event === 'SIGNED_IN' && session?.user) {
                    console.log('User signed in:', session.user.email);
                    setUser(session.user);
                    setLoading(false); // QUAN TRỌNG: Set loading false TRƯỚC khi chạy async operations
                    
                    // Redirect về home ngay lập tức (không chờ async operations)
                    console.log('Redirecting to home...');
                    router.replace('/(main)/home');
                    
                    // Chạy các async operations sau (không block UI)
                    // Sử dụng setTimeout để không block main thread
                    setTimeout(async () => {
                        // Kiểm tra PIN đã thiết lập chưa
                        try {
                            const pinService = require('../services/pinService').default;
                            const isPinSet = await pinService.isPinSet(session.user.id);
                            if (isPinSet) {
                                console.log('🔐 [AUTH_CONTEXT] PIN Status: ĐÃ THIẾT LẬP PIN');
                            } else {
                                console.log('🔐 [AUTH_CONTEXT] PIN Status: Chưa thiết lập PIN');
                            }
                        } catch (pinError) {
                            console.warn('⚠️ [AUTH_CONTEXT] Could not check PIN status:', pinError.message);
                        }
                        
                        // Đảm bảo user có key pair (tự động tạo nếu chưa có)
                        try {
                            console.log('🔑 [AUTH_CONTEXT] Ensuring key pair for user:', session.user.id);
                            const deviceService = require('../services/deviceService').default;
                            const privateKey = await deviceService.getOrCreatePrivateKey(session.user.id);
                            const deviceId = await deviceService.getOrCreateDeviceId();
                            
                            // Lấy public key từ database để log (sau khi getOrCreatePrivateKey đã tự động tạo nếu thiếu)
                            const { data: device } = await supabase
                                .from('user_devices')
                                .select('public_key')
                                .eq('user_id', session.user.id)
                                .eq('device_id', deviceId)
                                .single();
                            
                            if (device && device.public_key) {
                                console.log('✅ [AUTH_CONTEXT] Key pair verified:');
                                console.log('  - User ID:', session.user.id);
                                console.log('  - Device ID:', deviceId);
                                console.log('  - Private Key exists: YES');
                                console.log('  - Public Key exists: YES');
                                console.log('  - Public Key (first 50 chars):', device.public_key.substring(0, 50) + '...');
                            } else {
                                // Nếu vẫn không có public key sau khi getOrCreatePrivateKey → log warning
                                console.warn('⚠️ [AUTH_CONTEXT] Key pair creation may have failed. Private key exists but public key not found in database.');
                                // Thử tạo lại một lần nữa
                                try {
                                    await deviceService.getOrCreatePrivateKey(session.user.id);
                                    console.log('✅ [AUTH_CONTEXT] Retried key pair creation');
                                } catch (retryError) {
                                    console.error('❌ [AUTH_CONTEXT] Retry failed:', retryError.message);
                                }
                            }
                        } catch (keyError) {
                            // Không block login nếu tạo key pair thất bại (có thể do E2E chưa available)
                            console.warn('[AuthContext] ⚠️ Could not ensure key pair:', keyError.message);
                        }
                    }, 100); // Delay 100ms để không block UI
                } else if (event === 'TOKEN_REFRESHED' && session?.user) {
                    console.log('Token refreshed for user:', session.user.email);
                    setUser(session.user);
                } else if (event === 'TOKEN_REFRESHED' && !session) {
                    // Token refresh failed, clear session
                    console.log('Token refresh failed, signing out...');
                    await supabase.auth.signOut();
                    setUser(null);
                    setLoading(false);
                    router.replace('/welcome');
                }
            }
        );

        return () => {
            console.log('Cleaning up auth subscription');
            subscription.unsubscribe();
        };
    }, [router]);

    const setAuth = async authUser => {
        console.log('setAuth called with:', authUser?.email);
        setUser(authUser);
        
        // Chạy các async operations sau (không block UI)
        // Sử dụng setTimeout để không block main thread
        if (authUser?.id) {
            setTimeout(async () => {
                // Kiểm tra PIN đã thiết lập chưa
                try {
                    const pinService = require('../services/pinService').default;
                    const isPinSet = await pinService.isPinSet(authUser.id);
                    if (isPinSet) {
                        console.log('🔐 [AUTH_CONTEXT] PIN Status: ĐÃ THIẾT LẬP PIN');
                    } else {
                        console.log('🔐 [AUTH_CONTEXT] PIN Status: Chưa thiết lập PIN');
                    }
                } catch (pinError) {
                    console.warn('⚠️ [AUTH_CONTEXT] Could not check PIN status:', pinError.message);
                }
                
                try {
                    console.log('🔑 [AUTH_CONTEXT] Ensuring key pair via setAuth for user:', authUser.id);
                    const deviceService = require('../services/deviceService').default;
                    const privateKey = await deviceService.getOrCreatePrivateKey(authUser.id);
                    const deviceId = await deviceService.getOrCreateDeviceId();
                    
                    // Lấy public key từ database để log (sau khi getOrCreatePrivateKey đã tự động tạo nếu thiếu)
                    const { data: device } = await supabase
                        .from('user_devices')
                        .select('public_key')
                        .eq('user_id', authUser.id)
                        .eq('device_id', deviceId)
                        .single();
                    
                    if (device && device.public_key) {
                        console.log('✅ [AUTH_CONTEXT] Key pair verified via setAuth:');
                        console.log('  - User ID:', authUser.id);
                        console.log('  - Device ID:', deviceId);
                        console.log('  - Private Key exists: YES');
                        console.log('  - Public Key exists: YES');
                        console.log('  - Public Key (first 50 chars):', device.public_key.substring(0, 50) + '...');
                    } else {
                        // Nếu vẫn không có public key sau khi getOrCreatePrivateKey → log warning và retry
                        console.warn('⚠️ [AUTH_CONTEXT] Key pair creation may have failed. Private key exists but public key not found in database.');
                        // Thử tạo lại một lần nữa
                        try {
                            await deviceService.getOrCreatePrivateKey(authUser.id);
                            console.log('✅ [AUTH_CONTEXT] Retried key pair creation via setAuth');
                        } catch (retryError) {
                            console.error('❌ [AUTH_CONTEXT] Retry failed via setAuth:', retryError.message);
                        }
                    }
                } catch (keyError) {
                    // Không block login nếu tạo key pair thất bại
                    console.warn('[AuthContext] ⚠️ Could not ensure key pair via setAuth:', keyError.message);
                }
            }, 100); // Delay 100ms để không block UI
        }
    };

    const checkStoredSession = async () => {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            console.log('Stored session check:', {
                hasSession: !!session,
                hasUser: !!session?.user,
                userEmail: session?.user?.email,
                error: error?.message
            });
            return session;
        } catch (error) {
            console.log('Error checking stored session:', error);
            return null;
        }
    };

    const setUserData = userData => {
        setUser({ ...userData });
    };

    return (
        <AuthContext.Provider value={{ user, setAuth, setUserData, loading, checkStoredSession }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};