import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    console.log('AuthContext state:', { user, userData, loading });

    useEffect(() => {
        // Lấy session hiện tại
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setUser(session.user);
                // Lấy thông tin user từ database
                const { data } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();
                setUserData(data);
            }
            setLoading(false);
        };

        getSession();

        // Lắng nghe thay đổi auth state
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                console.log('Auth state changed:', event, session);
                if (session) {
                    console.log('Setting user:', session.user);
                    setUser(session.user);

                    // Tạm thời skip database query và dùng user metadata
                    console.log('Using user metadata instead of database query...');
                    setUserData({
                        id: session.user.id,
                        name: session.user.user_metadata?.name || 'User',
                        email: session.user.email,
                        avatar: session.user.user_metadata?.avatar_url || null
                    });
                    console.log('User data set from metadata:', {
                        id: session.user.id,
                        name: session.user.user_metadata?.name || 'User',
                        email: session.user.email
                    });
                } else {
                    console.log('No session, clearing user data');
                    setUser(null);
                    setUserData(null);
                }
                setLoading(false);
            }
        );

        return () => subscription.unsubscribe();
    }, []);

    const signIn = async (email, password) => {
        console.log('AuthContext signIn called with:', email);

        try {
            console.log('Calling supabase.auth.signInWithPassword...');

            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            console.log('Supabase signIn response:', { data, error });

            if (data?.user) {
                // Lấy thông tin user từ database
                const { data: userData } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                console.log('User data from database:', userData);
                setUserData(userData);
            }

            return { data, error };
        } catch (err) {
            console.error('Supabase signIn error:', err);
            return { data: null, error: err };
        }
    };

    const signUp = async (email, password, userData) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (data.user && !error) {
            // Tạo user record trong database
            const { error: insertError } = await supabase
                .from('users')
                .insert({
                    id: data.user.id,
                    email: data.user.email,
                    ...userData
                });

            if (insertError) {
                console.error('Error creating user:', insertError);
            }
        }

        return { data, error };
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        return { error };
    };

    const value = {
        user,
        userData,
        loading,
        signIn,
        signUp,
        signOut,
        setUser,
        setUserData,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
