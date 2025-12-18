import 'react-native-get-random-values'; // Polyfill cho crypto.getRandomValues (phải import sớm)
import '../globalPolyfills.js';
import '../polyfill.js'; // Polyfill Buffer và process
import '../utils/webrtcPolyfill.js'; // WebRTC polyfills

import 'react-native-url-polyfill/auto'; // Dòng này phải ở đầu tiên

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import SplashScreenComponent from '../components/SplashScreen';
import startupOptimizer from '../utils/startupOptimizer';

// Tắt HMR và Fast Refresh trên thiết bị yếu ngay từ đầu
startupOptimizer.init();

const RootLayout = () => {
    useEffect(() => {
        // Tắt auto-reload khi component mount
        startupOptimizer.disableAutoReload();
    }, []);

    return (
        <SplashScreenComponent>
            <AuthProvider>
                <Stack
                    screenOptions={{
                        headerShown: false,
                    }}
                >
                    <Stack.Screen
                        name="index"
                        options={{
                            headerShown: false
                        }}
                    />
                    <Stack.Screen
                        name="welcome"
                        options={{
                            headerShown: false
                        }}
                    />
                    <Stack.Screen
                        name="webTest"
                        options={{
                            headerShown: false
                        }}
                    />
                </Stack>
            </AuthProvider>
        </SplashScreenComponent>
    );
};

export default RootLayout;