
import 'react-native-url-polyfill/auto'; // Dòng này phải ở đầu tiên

import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getUserData } from '../services/userService';


const _layout = () => {
    return (
        <AuthProvider>
            <MainLayout />
        </AuthProvider>
    )
}

const MainLayout = () => {
    const { setAuth, setUserData } = useAuth();
    const router = useRouter();

    useEffect(() => {
        supabase.auth.onAuthStateChange((_event, session) => {



            if (session) {
                setAuth(session?.user);
                updatedUserData(session?.user); // Update user data if needed
                router.replace('/home'); // Redirect to home if authenticated

            } else {
                setAuth(null);
                router.replace('/welcome'); // Redirect to login if not authenticated
            }

        });
    }, []);

    const updatedUserData = async (user) => {
        let res = await getUserData(user?.id);
        if (res.success) {
            setUserData(res.data);
        }
    }


    return (
        <Stack
            screenOptions={{
                headerShown: false,

            }}
        />

    )
}

export default _layout