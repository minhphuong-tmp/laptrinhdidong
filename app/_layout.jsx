
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
            {/* <Test /> */}
        </AuthProvider>
    )
}

const MainLayout = () => {
    const { setAuth, setUserData } = useAuth();
    const router = useRouter();
    useEffect(() => {
        //////
        supabase.auth.onAuthStateChange((_event, session) => {

            if (session) {
                setAuth(session?.user);
                updatedUserData(session?.user, session.user.email);
                router.replace('/home');
            } else {
                setAuth(null);
                router.replace('/welcome');
            }
        }

        );

    }, []);

    const updatedUserData = async (user, email) => {

        let res = await getUserData(user?.id);
        if (res.success) {
            setUserData({ ...res.data, email });
        }
    }

    return (
        <Stack
            screenOptions={{
                headerShown: false,
            }}
        >
            <Stack.Screen
                name="(main)/postDetails"
                options={{
                    headerShown: false
                }}
            />
        </Stack>

    )
}

export default _layout