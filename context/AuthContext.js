import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { getUserData } from "../services/userService";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    console.log('AuthProvider rendering...');

    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(false); // Bắt đầu với false

    useEffect(() => {
        console.log('AuthProvider useEffect running...');
        // Chỉ kiểm tra session một lần khi component mount
        const checkSession = async () => {
            try {
                setLoading(true);
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
                }
            } catch (error) {
                console.log('Check session error:', error);
            } finally {
                setLoading(false);
            }
        };

        checkSession();
    }, []); // Chỉ chạy một lần khi mount

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