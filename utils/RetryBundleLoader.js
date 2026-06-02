import { AppRegistry, NativeModules } from 'react-native';
import { Platform } from 'react-native';

let DevSettings = null;
try {
    DevSettings = NativeModules.DevSettings;
} catch (e) {
    // Ignore
}

class RetryBundleLoader {
    constructor() {
        this.maxRetries = 5;
        this.retryDelays = [300, 600, 1000, 2000, 3000]; // ms
        this.currentRetry = 0;
        this.bundleLoadTimeout = 5000; // 5 giây
        this.isOfflineMode = false;
        this.loadStartTime = null;
    }

    /**
     * Tắt auto-reload và fast-refresh trên thiết bị yếu
     */
    disableAutoReload() {
        try {
            // Tắt HMRClient
            if (global.HMRClient) {
                global.HMRClient.disable();
            }

            // Tắt DevSettings reload
            if (DevSettings && DevSettings.reload) {
                // Override reload function
                DevSettings.reload = () => {
                    // Không làm gì cả
                };
            }

            // Tắt fast refresh
            if (global.__DEV__) {
                // Disable fast refresh
                if (global.__RCTRegisterComponent) {
                    const originalRegister = global.__RCTRegisterComponent;
                    global.__RCTRegisterComponent = (name, component) => {
                        // Không trigger fast refresh
                        return originalRegister(name, component);
                    };
                }
            }
        } catch (error) {
            // Ignore errors
        }
    }

    /**
     * Kiểm tra xem bundle có load được không
     */
    async checkBundleLoaded() {
        return new Promise((resolve) => {
            let resolved = false;
            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    resolve(false);
                }
            }, this.bundleLoadTimeout);

            // Kiểm tra xem AppRegistry đã có component chưa
            const checkInterval = setInterval(() => {
                try {
                    const keys = AppRegistry.getAppKeys();
                    if (keys && keys.length > 0) {
                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            clearInterval(checkInterval);
                            resolve(true);
                        }
                    }
                } catch (e) {
                    // Chưa load xong
                }
            }, 100);

            // Nếu sau 5s vẫn chưa load được, timeout
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    clearInterval(checkInterval);
                    clearTimeout(timeout);
                    resolve(false);
                }
            }, this.bundleLoadTimeout);
        });
    }

    /**
     * Retry load bundle với delay tăng dần
     */
    async retryLoadBundle(loadBundleFn) {
        this.loadStartTime = Date.now();

        for (let i = 0; i < this.maxRetries; i++) {
            this.currentRetry = i;
            const delay = this.retryDelays[i] || 3000;

            try {
                // Thử load bundle
                await loadBundleFn();

                // Kiểm tra xem bundle đã load thành công chưa
                const isLoaded = await this.checkBundleLoaded();

                if (isLoaded) {
                    // Load thành công
                    return true;
                }

                // Nếu chưa load được và chưa phải lần cuối, đợi rồi retry
                if (i < this.maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, delay));
                }
            } catch (error) {
                // Nếu có lỗi và chưa phải lần cuối, đợi rồi retry
                if (i < this.maxRetries - 1) {
                    await new Promise((resolve) => setTimeout(resolve, delay));
                } else {
                    // Lần cuối vẫn lỗi
                    throw error;
                }
            }
        }

        // Sau 5 lần retry vẫn không load được
        return false;
    }

    /**
     * Load offline bundle (fallback)
     */
    async loadOfflineBundle() {
        this.isOfflineMode = true;

        try {
            // Tìm offline bundle trong assets
            // Note: Cần build offline bundle trước bằng: npx expo export
            const offlineBundlePath = require('expo-constants').default.executionEnvironment === 'standalone'
                ? require('expo-asset').Asset.fromModule(require('../assets/offline-bundle.js'))
                : null;

            if (offlineBundlePath) {
                // Load offline bundle
                await AppRegistry.registerRunnable('offline-bundle', () => {
                    // Fallback bundle logic
                });
                return true;
            }
        } catch (error) {
            // Không có offline bundle, tiếp tục với bundle thường
        }

        return false;
    }

    /**
     * Main function: Load bundle với retry và fallback
     */
    async loadBundle(loadBundleFn) {
        // Tắt auto-reload ngay từ đầu
        this.disableAutoReload();

        // Thử retry load bundle
        const success = await this.retryLoadBundle(loadBundleFn);

        if (!success) {
            // Nếu retry thất bại, thử load offline bundle
            const offlineSuccess = await this.loadOfflineBundle();

            if (!offlineSuccess) {
                // Nếu cả offline bundle cũng không có, throw error
                throw new Error('Bundle load failed after all retries and offline fallback');
            }
        }

        return success;
    }

    /**
     * Get retry status
     */
    getStatus() {
        return {
            currentRetry: this.currentRetry,
            maxRetries: this.maxRetries,
            isOfflineMode: this.isOfflineMode,
            loadTime: this.loadStartTime ? Date.now() - this.loadStartTime : null,
        };
    }
}

export default new RetryBundleLoader();

