import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../constants/theme';
import { hp } from '../helpers/common';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Interactive3DRobot - React Native component
 * 
 * Simulates a 3D robot animation using HTML/CSS transforms in WebView.
 * Does NOT use Spline, Three.js, WebGL, or external scene URLs.
 * 
 * @param {string} scene - Optional scene URL (will be ignored, fallback to internal animation)
 * @param {string} className - Optional className for styling
 * @param {number} height - Height of the component
 * @param {function} onLoadEnd - Callback when animation loads
 * @param {function} onError - Callback on error
 */
const Interactive3DRobot = ({
    scene,
    className,
    height = hp(50),
    onLoadEnd,
    onError,
    style,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const webViewRef = useRef(null);
    const timeoutRef = useRef(null);

    // Inline HTML with CSS 3D robot animation
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            width: 100%;
            height: 100vh;
            overflow: hidden;
            background: #000000;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .robot-container {
            position: relative;
            width: 100%;
            height: 100%;
            perspective: 1000px;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        
        .robot {
            position: relative;
            width: 200px;
            height: 300px;
            transform-style: preserve-3d;
            animation: float 3s ease-in-out infinite;
        }
        
        @keyframes float {
            0%, 100% {
                transform: translateY(0px) rotateY(0deg);
            }
            50% {
                transform: translateY(-20px) rotateY(5deg);
            }
        }
        
        @keyframes rotate {
            0% {
                transform: rotateY(0deg) rotateX(0deg);
            }
            25% {
                transform: rotateY(90deg) rotateX(5deg);
            }
            50% {
                transform: rotateY(180deg) rotateX(0deg);
            }
            75% {
                transform: rotateY(270deg) rotateX(-5deg);
            }
            100% {
                transform: rotateY(360deg) rotateX(0deg);
            }
        }
        
        @keyframes pulse {
            0%, 100% {
                opacity: 1;
                transform: scale(1);
            }
            50% {
                opacity: 0.8;
                transform: scale(1.05);
            }
        }
        
        /* Robot Head */
        .robot-head {
            position: absolute;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 120px;
            height: 120px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 20px;
            box-shadow: 
                0 10px 30px rgba(0, 0, 0, 0.5),
                inset 0 2px 10px rgba(255, 255, 255, 0.1),
                0 0 20px rgba(59, 130, 246, 0.3);
            animation: rotate 8s linear infinite, pulse 2s ease-in-out infinite;
            transform-style: preserve-3d;
        }
        
        .robot-head::before {
            content: '';
            position: absolute;
            top: 20px;
            left: 20px;
            width: 20px;
            height: 20px;
            background: #3b82f6;
            border-radius: 50%;
            box-shadow: 
                0 0 10px #3b82f6,
                0 0 20px #3b82f6,
                60px 0 0 #3b82f6,
                60px 0 10px #3b82f6,
                60px 0 20px #3b82f6;
            animation: blink 3s ease-in-out infinite;
        }
        
        @keyframes blink {
            0%, 90%, 100% {
                opacity: 1;
            }
            95% {
                opacity: 0.3;
            }
        }
        
        .robot-head::after {
            content: '';
            position: absolute;
            bottom: 15px;
            left: 50%;
            transform: translateX(-50%);
            width: 40px;
            height: 8px;
            background: #1a1a1a;
            border-radius: 4px;
            box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
        }
        
        /* Robot Body */
        .robot-body {
            position: absolute;
            top: 110px;
            left: 50%;
            transform: translateX(-50%);
            width: 140px;
            height: 140px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 15px;
            box-shadow: 
                0 10px 30px rgba(0, 0, 0, 0.5),
                inset 0 2px 10px rgba(255, 255, 255, 0.1),
                0 0 15px rgba(59, 130, 246, 0.2);
            animation: pulse 2.5s ease-in-out infinite;
        }
        
        .robot-body::before {
            content: '';
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            height: 60px;
            background: radial-gradient(circle, #3b82f6 0%, #1e40af 100%);
            border-radius: 50%;
            box-shadow: 
                0 0 20px #3b82f6,
                inset 0 2px 10px rgba(255, 255, 255, 0.3);
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        /* Robot Arms */
        .robot-arm {
            position: absolute;
            top: 120px;
            width: 30px;
            height: 80px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 15px;
            box-shadow: 
                0 5px 15px rgba(0, 0, 0, 0.5),
                inset 0 2px 5px rgba(255, 255, 255, 0.1);
            animation: armSwing 2s ease-in-out infinite;
        }
        
        .robot-arm.left {
            left: -40px;
            transform-origin: top center;
            animation-delay: 0s;
        }
        
        .robot-arm.right {
            right: -40px;
            transform-origin: top center;
            animation-delay: 1s;
        }
        
        @keyframes armSwing {
            0%, 100% {
                transform: rotateZ(0deg);
            }
            50% {
                transform: rotateZ(15deg);
            }
        }
        
        /* Robot Legs */
        .robot-leg {
            position: absolute;
            top: 240px;
            width: 35px;
            height: 60px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
            border-radius: 10px;
            box-shadow: 
                0 5px 15px rgba(0, 0, 0, 0.5),
                inset 0 2px 5px rgba(255, 255, 255, 0.1);
            animation: legMove 1.5s ease-in-out infinite;
        }
        
        .robot-leg.left {
            left: 35px;
            transform-origin: top center;
            animation-delay: 0s;
        }
        
        .robot-leg.right {
            right: 35px;
            transform-origin: top center;
            animation-delay: 0.75s;
        }
        
        @keyframes legMove {
            0%, 100% {
                transform: rotateX(0deg);
            }
            50% {
                transform: rotateX(10deg);
            }
        }
        
        /* Glow effect */
        .robot-glow {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 250px;
            height: 350px;
            background: radial-gradient(ellipse, rgba(59, 130, 246, 0.2) 0%, transparent 70%);
            border-radius: 50%;
            animation: glowPulse 3s ease-in-out infinite;
            pointer-events: none;
        }
        
        @keyframes glowPulse {
            0%, 100% {
                opacity: 0.5;
                transform: translate(-50%, -50%) scale(1);
            }
            50% {
                opacity: 0.8;
                transform: translate(-50%, -50%) scale(1.1);
            }
        }
        
        /* Loading indicator */
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #3b82f6;
            font-size: 14px;
            opacity: 0;
            animation: fadeIn 0.5s ease-in 0.5s forwards;
        }
        
        @keyframes fadeIn {
            to {
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="robot-container">
        <div class="robot-glow"></div>
        <div class="robot">
            <div class="robot-head"></div>
            <div class="robot-body"></div>
            <div class="robot-arm left"></div>
            <div class="robot-arm right"></div>
            <div class="robot-leg left"></div>
            <div class="robot-leg right"></div>
        </div>
        <div class="loading">Robot Ready</div>
    </div>
    
    <script>
        (function() {
            // Notify React Native that animation is loaded
            function notifyLoaded() {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'robot-loaded',
                        success: true
                    }));
                }
            }
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    setTimeout(notifyLoaded, 500);
                });
            } else {
                setTimeout(notifyLoaded, 500);
            }
            
            // Handle errors
            window.addEventListener('error', function(e) {
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'robot-error',
                        error: e.message || 'Unknown error'
                    }));
                }
            });
        })();
    </script>
</body>
</html>
    `;

    // Handle messages from WebView
    const handleMessage = (event) => {
        try {
            const data = JSON.parse(event.nativeEvent.data);

            if (data.type === 'robot-loaded') {
                setLoading(false);
                setError(null);
                if (onLoadEnd) {
                    onLoadEnd();
                }
            } else if (data.type === 'robot-error') {
                const errorMsg = data.error || 'Failed to load robot animation';
                setError(errorMsg);
                setLoading(false);
                if (onError) {
                    onError(errorMsg);
                }
            }
        } catch (e) {
            // Silent fail - invalid message format
        }
    };

    // Set timeout to prevent infinite loading
    useEffect(() => {
        if (loading && Platform.OS !== 'web') {
            timeoutRef.current = setTimeout(() => {
                if (loading) {
                    setLoading(false);
                    setError('Loading timeout after 10 seconds');
                    if (onError) {
                        onError('Loading timeout after 10 seconds');
                    }
                }
            }, 10000); // 10 seconds timeout
        }

        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };
    }, [loading, Platform.OS, onError]);

    const handleLoadStart = () => {
        setLoading(true);
        setError(null);
    };

    const handleLoadEnd = () => {
        // Don't set loading to false here - wait for message from WebView
    };

    const handleError = (syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        const errorMsg = nativeEvent?.description || 'WebView error';
        setError(errorMsg);
        setLoading(false);
        if (onError) {
            onError(errorMsg);
        }
    };

    // For web platform, render a simple placeholder
    if (Platform.OS === 'web') {
        return (
            <View style={[styles.container, { height }, style]}>
                <View style={styles.webPlaceholder}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { height }, style]}>
            {loading && (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            )}

            {error && (
                <View style={styles.errorContainer}>
                    <ActivityIndicator size="small" color={theme.colors.error} />
                </View>
            )}

            <WebView
                ref={webViewRef}
                source={{ html: htmlContent }}
                style={styles.webview}
                onMessage={handleMessage}
                onLoadStart={handleLoadStart}
                onLoadEnd={handleLoadEnd}
                onError={handleError}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scalesPageToFit={false}
                scrollEnabled={false}
                backgroundColor="transparent"
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                androidHardwareAccelerationDisabled={false}
                androidLayerType="hardware"
                cacheEnabled={true}
            />
        </View>
    );
};

export default Interactive3DRobot;

const styles = StyleSheet.create({
    container: {
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        backgroundColor: '#000000',
    },
    webview: {
        width: '100%',
        height: '100%',
        backgroundColor: 'transparent',
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000',
        zIndex: 1,
    },
    errorContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000',
        zIndex: 2,
    },
    webPlaceholder: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000',
    },
});


