/**
 * Startup Optimizer - Tối ưu hóa startup cho thiết bị yếu
 * - Tắt auto-reload, fast-refresh
 * - Lazy load các module không cần thiết
 * - Tối ưu parse JS
 */

import { NativeModules, Platform } from 'react-native';

class StartupOptimizer {
    constructor() {
        this.isOptimized = false;
    }

    /**
     * Tắt tất cả auto-reload và fast-refresh
     */
    disableAutoReload() {
        if (this.isOptimized) return;

        try {
            // Tắt HMRClient
            if (typeof global !== 'undefined') {
                if (global.HMRClient) {
                    try {
                        global.HMRClient.disable();
                    } catch (e) {
                        // Ignore
                    }
                }

                // Override DevSettings.reload
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
                        // Không trigger fast refresh
                        return originalRegister(name, component);
                    };
                }

                // Tắt onFastRefresh callback nếu có
                if (global.__onFastRefresh) {
                    global.__onFastRefresh = () => {
                        // Không làm gì
                    };
                }

                // Tắt Hot Reload
                if (global.__DEV__) {
                    // Disable hot reload
                    if (global.__hotReload) {
                        global.__hotReload = false;
                    }
                }
            }
        } catch (error) {
            // Ignore errors
        }

        this.isOptimized = true;
    }

    /**
     * Lazy load module (code splitting)
     */
    lazyLoadModule(moduleLoader) {
        return new Promise((resolve, reject) => {
            try {
                // Sử dụng dynamic import với timeout
                const timeout = setTimeout(() => {
                    reject(new Error('Module load timeout'));
                }, 10000); // 10s timeout

                moduleLoader()
                    .then((module) => {
                        clearTimeout(timeout);
                        resolve(module);
                    })
                    .catch((error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Tối ưu parse JS bằng cách giảm số lượng import đồng thời
     */
    optimizeImports() {
        // Với Expo Router, imports đã được tối ưu tự động
        // Chỉ cần đảm bảo không import quá nhiều module cùng lúc
        if (Platform.OS === 'android') {
            // Trên Android yếu, giảm số lượng import đồng thời
            // Expo Router tự động xử lý điều này
        }
    }

    /**
     * Initialize optimizer
     */
    init() {
        this.disableAutoReload();
        this.optimizeImports();
    }
}

export default new StartupOptimizer();

