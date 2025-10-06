import '../globalPolyfills.js';

import 'react-native-url-polyfill/auto'; // Dòng này phải ở đầu tiên

import { Stack } from 'expo-router';
import WebTest from './webTest';

const _layout = () => {
    return (
        <Stack
            screenOptions={{
                headerShown: false,
            }}
        >
            <Stack.Screen
                name="webTest"
                component={WebTest}
                options={{
                    headerShown: false
                }}
            />
        </Stack>
    )
}

export default _layout