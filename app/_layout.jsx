import '../globalPolyfills.js';

import 'react-native-url-polyfill/auto'; // Dòng này phải ở đầu tiên

import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

const RootLayout = () => {
    return (
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
    )
}

export default RootLayout