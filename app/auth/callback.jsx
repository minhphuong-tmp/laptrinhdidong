import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function AuthCallback() {
    const router = useRouter();

    useEffect(() => {
        const handleAuthCallback = async () => {
            try {
                console.log('Auth callback: Waiting for session...');

                // Đợi một chút để đảm bảo authService đã set session
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Kiểm tra session
                const { data: { session }, error: getSessionError } = await supabase.auth.getSession();

                if (getSessionError) {
                    console.error('Session error:', getSessionError);
                    router.replace('/welcome');
                    return;
                }

                if (session?.user) {
                    // Validate domain
                    const userEmail = session.user.email;
                    if (userEmail && !userEmail.endsWith('@actvn.edu.vn')) {
                        await supabase.auth.signOut();
                        router.replace('/welcome');
                        return;
                    }

                    console.log('Auth callback: Session found, navigating to home');
                    // Navigate về home
                    router.replace('/(main)/home');
                } else {
                    console.log('Auth callback: No session found, redirecting to welcome');
                    router.replace('/welcome');
                }
            } catch (error) {
                console.error('Auth callback error:', error);
                router.replace('/welcome');
            }
        };

        handleAuthCallback();
    }, [router]);

    return (
        <View style={styles.container}>
            <ActivityIndicator size="large" color="#007AFF" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
});

