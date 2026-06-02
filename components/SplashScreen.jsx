import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import retryBundleLoader from '../utils/RetryBundleLoader';

// Giữ splash screen hiển thị cho đến khi app sẵn sàng
SplashScreen.preventAutoHideAsync();

const SplashScreenComponent = ({ children, onReady }) => {
    const [isReady, setIsReady] = useState(false);
    const [retryStatus, setRetryStatus] = useState(null);

    useEffect(() => {
        async function prepare() {
            try {
                // Tắt auto-reload ngay từ đầu
                retryBundleLoader.disableAutoReload();

                // Giả lập thời gian load bundle (thực tế sẽ được xử lý bởi RetryBundleLoader)
                // Đợi một chút để đảm bảo bundle đã load
                await new Promise((resolve) => setTimeout(resolve, 500));

                // Kiểm tra status
                const status = retryBundleLoader.getStatus();
                setRetryStatus(status);

                setIsReady(true);

                if (onReady) {
                    onReady();
                }
            } catch (error) {
                // Nếu có lỗi, vẫn hiển thị app (fallback)
                setIsReady(true);
                if (onReady) {
                    onReady();
                }
            } finally {
                // Ẩn splash screen sau khi app đã sẵn sàng
                await SplashScreen.hideAsync();
            }
        }

        prepare();
    }, [onReady]);

    if (!isReady) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#007AFF" />
                {retryStatus && retryStatus.currentRetry > 0 && (
                    <Text style={styles.retryText}>
                        Đang thử lại lần {retryStatus.currentRetry + 1}...
                    </Text>
                )}
                {retryStatus && retryStatus.isOfflineMode && (
                    <Text style={styles.offlineText}>
                        Chế độ offline
                    </Text>
                )}
            </View>
        );
    }

    return children;
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#ffffff',
    },
    retryText: {
        marginTop: 20,
        fontSize: 14,
        color: '#666',
    },
    offlineText: {
        marginTop: 10,
        fontSize: 12,
        color: '#999',
    },
});

export default SplashScreenComponent;




