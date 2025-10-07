import { useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getUserData } from "../services/userService";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    console.log('AuthProvider rendering...');
    const router = useRouter();

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log('AuthProvider useEffect running...');

        // Kiểm tra session ban đầu
        const checkSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.log('Session error:', error);
                    return;
                }

                if (session) {
                    console.log('Session found, getting user data...');
                    // Lấy thông tin user từ database
                    const userRes = await getUserData(session.user.id);
                    if (userRes.success) {
                        setUser(userRes.data);
                    } else {
                        // Fallback: sử dụng session.user
                        setUser(session.user);
                    }
                } else {
                    console.log('No session found');
                    setUser(null);
                }
            } catch (error) {
                console.log('Check session error:', error);
            } finally {
                setLoading(false);
            }
        };

        checkSession();

        // Lắng nghe thay đổi auth state
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event, session?.user?.id);

                if (event === 'SIGNED_OUT' || !session) {
                    console.log('User signed out');
                    setUser(null);
                    setLoading(false);
                    // Redirect về login
                    router.replace('/login');
                } else if (event === 'SIGNED_IN' && session) {
                    console.log('User signed in');
                    try {
                        const userRes = await getUserData(session.user.id);
                        if (userRes.success) {
                            setUser(userRes.data);
                        } else {
                            setUser(session.user);
                        }
                    } catch (error) {
                        console.log('Error getting user data:', error);
                        setUser(session.user);
                    }
                    setLoading(false);
                    // Redirect về home
                    router.replace('/(main)/home');
                }
            }
        );

        return () => {
            console.log('Cleaning up auth subscription');
            subscription.unsubscribe();
        };
    }, []);

    const setAuth = authUser => {
        setUser(authUser);
    };

    const setUserData = userData => {
        setUser({ ...userData });
    };

    return (
        <AuthContext.Provider value={{ user, setAuth, setUserData, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    return useContext(AuthContext);
};