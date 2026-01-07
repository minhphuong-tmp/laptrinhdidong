import 'react-native-get-random-values'; // Polyfill cho crypto.getRandomValues (phải import sớm)
import '../globalPolyfills.js';
import '../polyfill.js'; // Polyfill Buffer và process
import '../utils/webrtcPolyfill.js'; // WebRTC polyfills

import 'react-native-url-polyfill/auto'; // Dòng này phải ở đầu tiên

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';
import { DocumentProvider } from '../context/DocumentContext';
import SplashScreenComponent from '../components/SplashScreen';
import startupOptimizer from '../utils/startupOptimizer';
import uploadResumeService from '../services/uploadResumeService';

// Tắt HMR và Fast Refresh trên thiết bị yếu ngay từ đầu
startupOptimizer.init();

const RootLayout = () => {
    useEffect(() => {
        // Tắt auto-reload khi component mount
        startupOptimizer.disableAutoReload();
        
        // Khởi tạo upload resume service ngay khi app start
        uploadResumeService.initialize();
        
        return () => {
            // Cleanup khi app unmount
            uploadResumeService.cleanup();
        };
    }, []);

    return (
        <SplashScreenComponent>
            <AuthProvider>
                <DocumentProvider>
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
                </DocumentProvider>
            </AuthProvider>
        </SplashScreenComponent>
    );
};

export default RootLayout;