import { useRouter } from "expo-router";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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
                    setUser(null);
                    setLoading(false);
                    return;
                }

                if (session?.user) {
                    console.log('Session found, user:', session.user.email);
                    setUser(session.user);
                } else {
                    console.log('No session found');
                    setUser(null);
                }
            } catch (error) {
                console.log('Check session error:', error);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkSession();

        // Lắng nghe thay đổi auth state
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event, session?.user?.email);

                if (event === 'SIGNED_OUT' || !session) {
                    console.log('User signed out');
                    setUser(null);
                    setLoading(false);
                    // Redirect về welcome thay vì login để tránh vòng lặp
                    router.replace('/welcome');
                } else if (event === 'SIGNED_IN' && session?.user) {
                    console.log('User signed in:', session.user.email);
                    setUser(session.user);
                    setLoading(false);
                    // Redirect về home
                    console.log('Redirecting to home...');
                    router.replace('/(main)/home');
                } else if (event === 'TOKEN_REFRESHED' && session?.user) {
                    console.log('Token refreshed for user:', session.user.email);
                    setUser(session.user);
                }
            }
        );

        return () => {
            console.log('Cleaning up auth subscription');
            subscription.unsubscribe();
        };
    }, [router]);

    const setAuth = authUser => {
        console.log('setAuth called with:', authUser?.email);
        setUser(authUser);
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