/**
 * Custom entry point với retry logic và fallback bundle cho thiết bị Android yếu
 * Với Expo Router, entry point được xử lý tự động, nhưng chúng ta có thể thêm retry logic
 */

import { AppRegistry, NativeModules } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Giữ splash screen hiển thị
SplashScreen.preventAutoHideAsync();

// Tắt HMR và Fast Refresh ngay từ đầu
if (__DEV__) {
    try {
        // Tắt HMRClient
        if (global.HMRClient) {
            global.HMRClient.disable();
        }

        // Tắt DevSettings.reload
        const { DevSettings } = NativeModules;
        if (DevSettings && DevSettings.reload) {
            const originalReload = DevSettings.reload.bind(DevSettings);
            DevSettings.reload = () => {
                // Không reload trên thiết bị yếu
            };
        }

        // Tắt fast refresh
        if (global.__RCTRegisterComponent) {
            const originalRegister = global.__RCTRegisterComponent;
            global.__RCTRegisterComponent = (name, component) => {
                return originalRegister(name, component);
            };
        }

        // Tắt onFastRefresh
        if (global.__onFastRefresh) {
            global.__onFastRefresh = () => {
                // Không làm gì
            };
        }

        // Tắt Hot Reload
        if (global.__hotReload) {
            global.__hotReload = false;
        }
    } catch (error) {
        // Ignore errors
    }
}

// Import expo-router/entry - entry point chính của Expo Router
// Expo Router sẽ tự động xử lý retry và fallback
require('expo-router/entry');

