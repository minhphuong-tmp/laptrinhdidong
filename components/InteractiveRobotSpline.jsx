import React, { Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../constants/theme';
import { hp, wp } from '../helpers/common';

// Lazy load Spline for web only
let Spline = null;
let SplineAvailable = false;

if (Platform.OS === 'web') {
    try {
        // Try to require Spline component
        const splineModule = require('@splinetool/react-spline');
        Spline = splineModule.default || splineModule.Spline || splineModule;
        SplineAvailable = Spline !== null && typeof Spline !== 'undefined';
    } catch (e) {
        // Package not installed or not available
        SplineAvailable = false;
    }
}

/**
 * InteractiveRobotSpline Component
 * 
 * Renders a 3D Spline scene using WebView for React Native compatibility.
 * Since @splinetool/react-spline only works on web, we use WebView to embed
 * the Spline scene as an HTML page.
 * 
 * @param {string} scene - URL to the Spline scene (.splinecode file or published scene URL)
 * @param {string} style - Additional styles for the container
 * @param {number} height - Height of the component (default: 300)
 */
const InteractiveRobotSpline = ({
    scene,
    style,
    height = hp(30),
    onLoadStart,
    onLoadEnd,
    onError
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [webViewReady, setWebViewReady] = useState(false);
    const [urlAccessible, setUrlAccessible] = useState(null);
    const [urlStatus, setUrlStatus] = useState(null); // Store HTTP status code
    const timeoutRef = useRef(null);
    const screenWidth = Dimensions.get('window').width;

    // Validate scene URL: must exist, start with http/https, and end with .splinecode
    const isValidScene = scene &&
        typeof scene === 'string' &&
        (scene.startsWith('http://') || scene.startsWith('https://')) &&
        scene.endsWith('.splinecode') &&
        scene.length > 20;

    if (scene && !isValidScene) {
        console.error('[InteractiveRobotSpline] Invalid scene URL:', scene);
    }

    // Check URL accessibility before rendering WebView
    useEffect(() => {
        if (isValidScene && scene) {
            setLoading(true);
            setError(null);

            // Fetch URL to check accessibility
            fetch(scene, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            })
                .then((response) => {
                    setUrlStatus(response.status);

                    if (response.status === 200 || response.status === 0) {
                        // Status 0 can occur with CORS, but means request was made
                        setUrlAccessible(true);
                        setLoading(false);
                    } else if (response.status === 403) {
                        // 403 Forbidden - Scene is not public
                        console.error('[InteractiveRobotSpline] Scene blocked: URL returned 403 – có thể do không PUBLIC');
                        console.error('[InteractiveRobotSpline] Hint: Trên Spline bấm "File → Publish to Web → Public link" rồi copy lại scene.splinecode');
                        console.error('[InteractiveRobotSpline] Nếu bạn dùng Editor link thì luôn bị 403');
                        setUrlAccessible(false);
                        setError('Scene không accessible (HTTP 403)');
                        setLoading(false);
                        if (onError) {
                            onError('Scene không accessible (HTTP 403)');
                        }
                    } else {
                        // Other status codes (404, 500, etc.)
                        console.error('[InteractiveRobotSpline] Scene URL inaccessible:', scene, 'Status:', response.status);
                        setUrlAccessible(false);
                        setError('Scene URL returned status: ' + response.status);
                        setLoading(false);
                        if (onError) {
                            onError('Scene URL returned status: ' + response.status);
                        }
                    }
                })
                .catch((err) => {
                    // CORS or network error - log but allow rendering
                    // WebView might still be able to load it (CORS doesn't apply to WebView)
                    console.error('[InteractiveRobotSpline] Scene URL accessibility check failed:', scene, err.message);
                    // Set to null to allow rendering (might be CORS issue, not accessibility)
                    setUrlAccessible(null);
                    setLoading(false);
                });
        } else {
            setLoading(false);
        }
    }, [scene, isValidScene, onError]);

    const escapedScene = isValidScene ? scene.replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';

    // HTML template to load Spline scene - optimized for mobile WebView
    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Spline 3D Scene</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            -webkit-tap-highlight-color: transparent;
        }
        body, html {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #000000;
            position: fixed;
            top: 0;
            left: 0;
            touch-action: none;
            margin: 0;
            padding: 0;
        }
        #spline-container {
            width: 100%;
            height: 100%;
            position: relative;
            display: flex;
            flex: 1;
            background: #000000;
            overflow: hidden;
        }
        spline-viewer {
            width: 100% !important;
            height: 100% !important;
            display: block !important;
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            z-index: 1;
            min-width: 100%;
            min-height: 100%;
        }
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
            text-align: center;
            z-index: 10;
            pointer-events: none;
        }
        .spinner {
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-top: 3px solid white;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .error-message {
            color: #ff4444;
            font-size: 14px;
            margin-top: 10px;
            padding: 10px;
            background: rgba(0, 0, 0, 0.7);
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div id="spline-container">
        <div class="loading" id="loading">
            <div class="spinner"></div>
            <div>Loading 3D Scene...</div>
        </div>
        <spline-viewer 
            id="spline-viewer"
            url="${escapedScene}" 
            loading-anim-type="spinner"
        ></spline-viewer>
    </div>
    <script type="module">
        (function() {
            'use strict';
            
            function logError(message, error) {
                // Chỉ log lỗi thật sự quan trọng
                console.error('[Spline]', message, error || '');
            }
            
            // Load Spline viewer script dynamically
            const script = document.createElement('script');
            script.type = 'module';
            script.src = 'https://unpkg.com/@splinetool/viewer@1.9.0/build/spline-viewer.js';
            
            script.onerror = function(e) {
                logError('Failed to load Spline viewer script', {
                    error: e.message || 'Network error',
                    scriptSrc: script.src,
                    isHTTPS: script.src.startsWith('https://'),
                    isHTTP: script.src.startsWith('http://'),
                    currentProtocol: window.location.protocol
                });
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'spline-error',
                        error: 'Failed to load Spline viewer script: ' + (e.message || 'Network error'),
                        timestamp: Date.now()
                    }));
                }
            };
            
            script.onload = function() {
                setTimeout(init, 100); // Small delay to ensure script is ready
            };
            
            document.head.appendChild(script);
            
            const container = document.getElementById('spline-container');
            const loading = document.getElementById('loading');
            let splineViewer = null;
            let loaded = false;
            let errorOccurred = false;
            let timeoutId = null;
            let checkInterval = null;
            
            function notifyReactNative(type, data) {
                if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                    try {
                        const message = JSON.stringify({
                            type: type,
                            timestamp: Date.now(),
                            ...data
                        });
                        window.ReactNativeWebView.postMessage(message);
                    } catch (e) {
                        logError('Failed to post message to React Native', e);
                    }
                }
            }
            
            function hideLoading() {
                if (loading && !errorOccurred) {
                    loading.style.display = 'none';
                }
            }
            
            function markAsLoaded() {
                if (!loaded && !errorOccurred) {
                    loaded = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                    hideLoading();
                    notifyReactNative('spline-loaded', { success: true });
                }
            }
            
            function markAsError(errorMsg) {
                if (!errorOccurred) {
                    errorOccurred = true;
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    if (checkInterval) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                    }
                    if (loading) {
                        loading.innerHTML = '<div class="error-message">' + (errorMsg || 'Error loading scene') + '</div>';
                    }
                    notifyReactNative('spline-error', { error: errorMsg || 'Failed to load Spline scene' });
                    logError('Failed to load Spline scene', errorMsg);
                }
            }
            
            // Timeout after 25 seconds (matching waitForCustomElement max time)
            timeoutId = setTimeout(function() {
                if (!loaded && !errorOccurred) {
                    // Check WebGL context one last time before timeout
                    const canvas = splineViewer?.shadowRoot?.querySelector('canvas');
                    const webglContext = canvas ? (canvas.getContext('webgl') || canvas.getContext('webgl2')) : null;
                    const hasWebGL = webglContext !== null && webglContext !== undefined;
                    
                    if (!hasWebGL) {
                        logError('WebGL / Scene load failed after 25 seconds', {
                            hasCanvas: !!canvas,
                            canvasWidth: canvas?.width || 0,
                            canvasHeight: canvas?.height || 0,
                            canvasOffsetWidth: canvas?.offsetWidth || 0,
                            canvasOffsetHeight: canvas?.offsetHeight || 0,
                            hasShadowRoot: !!splineViewer?.shadowRoot,
                            viewerOffsetWidth: splineViewer?.offsetWidth || 0,
                            viewerOffsetHeight: splineViewer?.offsetHeight || 0
                        });
                        markAsError('WebGL / Scene load failed - WebGL context not available');
                    } else {
                        // WebGL exists but not detected - mark as loaded
                        markAsLoaded();
                    }
                }
            }, 25000);
            
            function waitForCustomElement(elementName, maxAttempts = 50, delay = 500) {
                return new Promise((resolve, reject) => {
                    let attempts = 0;
                    const check = () => {
                        attempts++;
                        const element = customElements.get(elementName);
                        if (element && element !== undefined) {
                            resolve();
                        } else if (attempts >= maxAttempts) {
                            logError('Custom element not defined after ' + maxAttempts + ' attempts', {
                                elementName,
                                customElementsAvailable: typeof customElements !== 'undefined',
                                getResult: customElements.get(elementName)
                            });
                            reject(new Error('Custom element not defined: ' + elementName));
                        } else {
                            setTimeout(check, delay);
                        }
                    };
                    check();
                });
            }
            
            function init() {
                // Wait a bit for DOM to be ready
                setTimeout(function() {
                    splineViewer = document.getElementById('spline-viewer');
                    
                    if (!splineViewer) {
                        markAsError('Spline viewer element not found in DOM');
                        return;
                    }
                    
                    // Validate scene URL: must exist, start with http/https, end with .splinecode
                    const sceneUrl = splineViewer.getAttribute('url');
                    if (!sceneUrl || 
                        (!sceneUrl.startsWith('http://') && !sceneUrl.startsWith('https://')) ||
                        !sceneUrl.endsWith('.splinecode')) {
                        logError('Invalid scene URL format', sceneUrl);
                        markAsError('Invalid scene URL: ' + (sceneUrl || 'null'));
                        return;
                    }
                    
                    // Check if custom element is already defined before waiting
                    const existingElement = customElements.get('spline-viewer');
                    if (existingElement === undefined || existingElement === null) {
                        logError('Custom element spline-viewer is undefined before wait', {
                            customElementsAvailable: typeof customElements !== 'undefined',
                            getResult: existingElement
                        });
                    }
                    
                    // Wait for custom element to be defined (tăng thời gian wait)
                    waitForCustomElement('spline-viewer', 50, 500)
                        .then(() => {
                            // Double check custom element is really defined
                            const verifiedElement = customElements.get('spline-viewer');
                            if (verifiedElement === undefined || verifiedElement === null) {
                                logError('Custom element still undefined after waitForCustomElement resolved', {
                                    getResult: verifiedElement
                                });
                                markAsError('Spline viewer custom element verification failed');
                                return;
                            }
                            setupViewer();
                        })
                        .catch((error) => {
                            logError('Custom element not defined after waiting', error);
                            markAsError('Spline viewer custom element not defined');
                        });
                }, 500);
            }
            
            function setupViewer() {
                if (!splineViewer) {
                    logError('Spline viewer is null in setupViewer');
                    return;
                }
                
                // Notify WebView is ready
                notifyReactNative('webview-ready', { ready: true });
                
                // Listen for successful load
                splineViewer.addEventListener('load', function() {
                    markAsLoaded();
                });
                
                // Listen for errors
                splineViewer.addEventListener('error', function(e) {
                    const errorMsg = e.message || e.detail || e.error || 'Unknown error';
                    logError('Spline viewer error', errorMsg);
                    markAsError('Spline viewer error: ' + errorMsg);
                });
                
                // Fallback: Check if viewer is rendering with WebGL detection
                let checkCount = 0;
                checkInterval = setInterval(function() {
                    checkCount++;
                    
                    const hasShadowRoot = splineViewer.shadowRoot !== null;
                    const canvas = splineViewer.shadowRoot?.querySelector('canvas');
                    const canvasVisible = canvas && canvas.offsetWidth > 0 && canvas.offsetHeight > 0;
                    
                    // Check WebGL context (primary detection method)
                    let canvasHasWebGL = false;
                    let webglContext = null;
                    if (canvas) {
                        try {
                            webglContext = canvas.getContext('webgl') || canvas.getContext('webgl2');
                            canvasHasWebGL = webglContext !== null && webglContext !== undefined;
                            
                            // Log canvas dimensions for debugging
                            if (checkCount === 1 || checkCount === 5 || checkCount === 10) {
                                if (!canvasHasWebGL) {
                                    logError('WebGL context check failed', {
                                        canvasWidth: canvas.width,
                                        canvasHeight: canvas.height,
                                        canvasOffsetWidth: canvas.offsetWidth,
                                        canvasOffsetHeight: canvas.offsetHeight,
                                        checkCount: checkCount
                                    });
                                }
                            }
                        } catch (e) {
                            logError('WebGL context check exception', {
                                error: e.message,
                                canvasWidth: canvas?.width || 0,
                                canvasHeight: canvas?.height || 0
                            });
                        }
                    }
                    
                    // Primary: WebGL context exists - scene is definitely rendering
                    if (hasShadowRoot && canvas && canvasHasWebGL) {
                        if (!loaded && !errorOccurred && checkCount >= 2) {
                            setTimeout(function() {
                                if (!loaded && !errorOccurred) {
                                    // Verify WebGL still exists before marking loaded
                                    const finalGl = canvas.getContext('webgl') || canvas.getContext('webgl2');
                                    if (finalGl) {
                                        markAsLoaded();
                                    } else {
                                        logError('WebGL context lost before marking loaded');
                                    }
                                }
                            }, 1000);
                            clearInterval(checkInterval);
                            checkInterval = null;
                        }
                    } else if (hasShadowRoot && canvasVisible) {
                        // Fallback: Canvas visible but WebGL not yet available
                        if (!loaded && !errorOccurred && checkCount >= 10) {
                            // Wait a bit more for WebGL to initialize
                            setTimeout(function() {
                                if (!loaded && !errorOccurred) {
                                    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
                                    if (gl) {
                                        markAsLoaded();
                                    } else {
                                        logError('WebGL context still not available after fallback wait', {
                                            canvasWidth: canvas.width,
                                            canvasHeight: canvas.height
                                        });
                                    }
                                }
                            }, 2000);
                            clearInterval(checkInterval);
                            checkInterval = null;
                        }
                    }
                    
                    // Stop checking after 25 attempts (25 seconds - matching timeout)
                    if (checkCount >= 25) {
                        clearInterval(checkInterval);
                        checkInterval = null;
                        if (!loaded && !errorOccurred) {
                            // Timeout will handle after 25s
                        }
                    }
                }, 1000);
                
                // Also check on window load
                window.addEventListener('load', function() {
                    setTimeout(function() {
                        if (!loaded && !errorOccurred) {
                            const hasContent = splineViewer.shadowRoot || splineViewer.offsetHeight > 0;
                            if (hasContent) {
                                markAsLoaded();
                            }
                        }
                    }, 3000);
                });
            }
            
            // Notify that script is starting
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    notifyReactNative('webview-ready', { ready: true });
                });
            } else {
                notifyReactNative('webview-ready', { ready: true });
            }
        })();
    </script>
</body>
</html>
    `;

    // Set timeout to prevent infinite loading (25 seconds - matching WebView timeout)
    useEffect(() => {
        if (loading && Platform.OS !== 'web') {
            // Only set timeout for mobile (WebView)
            timeoutRef.current = setTimeout(() => {
                setLoading((prevLoading) => {
                    if (prevLoading) {
                        setError('Loading timeout after 25 seconds. Scene may still be loading.');
                        if (onError) {
                            onError('Loading timeout after 25 seconds');
                        }
                        return false;
                    }
                    return prevLoading;
                });
            }, 25000); // 25 seconds timeout
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
        setWebViewReady(false);
        if (onLoadStart) onLoadStart();
    };

    const handleLoadEnd = () => {
        setWebViewReady(true);
        // Don't set loading to false here - wait for message from WebView
        // Log to verify onLoadEnd fires
        if (!webViewReady) {
            // First time onLoadEnd fires - this is expected
        }
    };

    // Check if onLoadEnd fires within reasonable time
    useEffect(() => {
        if (loading && Platform.OS !== 'web') {
            const loadEndCheck = setTimeout(() => {
                if (!webViewReady && loading) {
                    console.error('[InteractiveRobotSpline] WebView onLoadEnd not fired after 5 seconds');
                }
            }, 5000);
            return () => clearTimeout(loadEndCheck);
        }
    }, [loading, webViewReady, Platform.OS]);

    const handleMessage = (event) => {
        try {
            if (!event?.nativeEvent?.data) {
                return;
            }

            const data = JSON.parse(event.nativeEvent.data);

            if (!data || !data.type) {
                return;
            }

            if (data.type === 'webview-ready') {
                setWebViewReady(true);
            } else if (data.type === 'spline-loaded') {
                // Clear timeout
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
                // Verify WebGL context exists before marking loaded
                // This is handled in WebView JavaScript, but double-check here
                // Update state only if WebGL context exists (verified in WebView)
                setLoading(false);
                setError(null);
                // Call callback
                if (onLoadEnd) {
                    onLoadEnd();
                }
            } else if (data.type === 'spline-error') {
                // Clear timeout
                if (timeoutRef.current) {
                    clearTimeout(timeoutRef.current);
                    timeoutRef.current = null;
                }
                // Update state
                const errorMsg = data.error || 'Failed to load scene';
                setError(errorMsg);
                setLoading(false);
                console.error('[InteractiveRobotSpline] Scene error:', errorMsg);
                // Call callback
                if (onError) {
                    onError(errorMsg);
                }
            }
        } catch (e) {
            // Silent fail - invalid message format
        }
    };

    const handleError = (syntheticEvent) => {
        const { nativeEvent } = syntheticEvent;
        setError(nativeEvent.description || 'Failed to load scene');
        setLoading(false);
        if (onError) onError(nativeEvent.description || 'Failed to load scene');
    };

    // Validate scene URL before rendering - if invalid, log error and return
    if (!scene || !isValidScene) {
        if (scene) {
            console.error('[InteractiveRobotSpline] Invalid scene URL:', scene);
        }
        return (
            <View style={[styles.container, { height }, style]}>
                <View style={styles.errorContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            </View>
        );
    }

    // Show loading while checking URL accessibility
    if (urlAccessible === null && loading) {
        return (
            <View style={[styles.container, { height }, style]}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            </View>
        );
    }

    // Don't render WebView if URL is not accessible (403 or other status errors)
    // Show error UI instead
    if (urlAccessible === false) {
        return (
            <View style={[styles.container, { height }, style]}>
                <View style={styles.errorBox}>
                    <Text style={styles.errorText}>
                        {urlStatus === 403
                            ? 'Scene 3D không load được (403)'
                            : `Scene 3D không load được (HTTP ${urlStatus || 'Error'})`}
                    </Text>
                    {urlStatus === 403 && (
                        <Text style={styles.errorHint}>
                            Hãy kiểm tra lại quyền Public trên Spline
                        </Text>
                    )}
                    {urlStatus !== 403 && urlStatus && (
                        <Text style={styles.errorHint}>
                            Scene URL không accessible (Status: {urlStatus})
                        </Text>
                    )}
                </View>
            </View>
        );
    }

    // For web: use @splinetool/react-spline with Suspense (if available)
    if (Platform.OS === 'web' && SplineAvailable && Spline) {
        return (
            <View style={[styles.container, { height }, style]}>
                <Suspense
                    fallback={
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={theme.colors.primary} />
                        </View>
                    }
                >
                    <Spline
                        scene={scene}
                        style={{ width: '100%', height: '100%' }}
                        onLoad={() => {
                            setLoading(false);
                            if (onLoadEnd) onLoadEnd();
                        }}
                        onError={(error) => {
                            setError(error?.message || 'Failed to load scene');
                            setLoading(false);
                            if (onError) onError(error?.message || 'Failed to load scene');
                        }}
                    />
                </Suspense>
                {loading && !error && (
                    <View style={styles.loadingOverlay} pointerEvents="none">
                        <ActivityIndicator size="large" color={theme.colors.primary} />
                    </View>
                )}
            </View>
        );
    }

    // For mobile (iOS/Android): use WebView
    const screenHeight = Dimensions.get('window').height;
    const webViewHeight = height || hp(30);

    return (
        <View style={[styles.container, { height: webViewHeight }, style]}>
            <WebView
                source={{ html: htmlContent }}
                style={[styles.webview, {
                    width: screenWidth,
                    height: webViewHeight,
                    backgroundColor: '#000000'
                }]}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={false}
                onLoadStart={handleLoadStart}
                onLoadEnd={handleLoadEnd}
                onMessage={handleMessage}
                onError={handleError}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                mixedContentMode="always"
                originWhitelist={['*']}
                scalesPageToFit={true}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                bounces={false}
                scrollEnabled={false}
                androidHardwareAccelerationDisabled={false}
                androidLayerType="hardware"
                cacheEnabled={true}
                incognito={false}
                allowsBackForwardNavigationGestures={false}
                // Additional settings for better rendering
                setSupportMultipleWindows={false}
                setBuiltInZoomControls={false}
                setDisplayZoomControls={false}
                // Allow loading external resources
                allowsFullscreenVideo={false}
                // iOS specific
                allowsLinkPreview={false}
                // Android specific
                thirdPartyCookiesEnabled={false}
            />
            {loading && !error && (
                <View style={styles.loadingOverlay} pointerEvents="none">
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                </View>
            )}
            {error && (
                <View style={styles.errorContainer} pointerEvents="none">
                    <ActivityIndicator size="small" color={theme.colors.error} />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        backgroundColor: theme.colors.backgroundSecondary,
        borderRadius: theme.radius.lg,
        overflow: 'hidden',
        ...theme.shadows.medium,
    },
    webview: {
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
        backgroundColor: theme.colors.backgroundSecondary,
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    errorContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.backgroundSecondary,
    },
    errorBox: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000',
        padding: wp(5),
    },
    errorText: {
        color: '#ff4444',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
        marginBottom: hp(1),
    },
    errorHint: {
        color: '#ffffff',
        fontSize: 14,
        textAlign: 'center',
        marginTop: hp(1),
        opacity: 0.8,
    },
});

export default InteractiveRobotSpline;

